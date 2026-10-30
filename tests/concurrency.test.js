/**
 * @file concurrency.test.js
 * @description Concurrency, Mutex Action Lock, Blitz Timer Engine, and Cancellation Token tests.
 * Native Node.js test runner (node:test, node:assert/strict).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/core/gameController.js';
import { EventBus } from '../src/core/eventBus.js';
import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  EVENT_TYPES
} from '../src/core/types.js';

describe('1. Mutex Action Queue & Serialization', () => {
  let eventBus;
  let controller;

  beforeEach(() => {
    eventBus = new EventBus();
    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      isBlitz: false
    });
  });

  afterEach(() => {
    controller.cancelPendingTimers();
  });

  it('should reject rapid sequential moves by the same player (double-click prevention)', () => {
    controller.startRound();

    const res1 = controller.dispatch({
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P1,
      index: 0
    });
    assert.equal(res1.success, true);
    assert.equal(controller.getState().board[0], PLAYERS.P1);
    assert.equal(controller.getState().currentTurn, PLAYERS.P2);

    // Rapid second click by P1
    const res2 = controller.dispatch({
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P1,
      index: 1
    });
    assert.equal(res2.success, false);
    assert.match(res2.error, /out of turn/i);
    assert.equal(controller.getState().board[1], null);
  });

  it('should reject moves dispatched after game over terminal state', () => {
    controller.startRound();

    // P1: 0, 1, 2 win line
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 }); // P1 wins!

    assert.equal(controller.getState().status, STATUS.ROUND_OVER);
    assert.equal(controller.getState().winner, PLAYERS.P1);

    // Attempt post-game move
    const res = controller.dispatch({
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 5
    });
    assert.equal(res.success, false);
    assert.match(res.error, /PLAYING state/i);
    assert.equal(controller.getState().board[5], null);
  });

  it('should serialize and drain re-entrant dispatches triggered inside event listeners', () => {
    controller.startRound();

    // When P1 plays cell 0, listener dispatches P2 move immediately (simulating fast automation)
    eventBus.subscribe(EVENT_TYPES.MOVE_APPLIED, (payload) => {
      if (payload.player === PLAYERS.P1 && payload.index === 0) {
        // Re-entrant dispatch during action processing
        controller.dispatch({
          type: ACTION_TYPES.PLACE_MARK,
          player: PLAYERS.P2,
          index: 4
        });
      }
    });

    const res = controller.dispatch({
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P1,
      index: 0
    });

    assert.equal(res.success, true);
    // After primary dispatch finishes, queue should have drained the re-entrant P2 move!
    assert.equal(controller.getState().board[0], PLAYERS.P1);
    assert.equal(controller.getState().board[4], PLAYERS.P2);
    assert.equal(controller.getState().currentTurn, PLAYERS.P1);
    assert.equal(controller.getState().turnCount, 2);
  });
});

describe('2. Blitz High-Precision Timer Engine', () => {
  let eventBus;
  let controller;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    if (controller) controller.cancelPendingTimers();
  });

  it('should emit initial BLITZ_TICK and countdown correctly', () => {
    let virtualNow = 1000;
    const timeProvider = () => virtualNow;

    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      isBlitz: true,
      blitzDuration: 3.0,
      blitzTickIntervalMs: 20,
      timeProvider
    });

    const ticks = [];
    eventBus.on(EVENT_TYPES.BLITZ_TICK, (payload) => ticks.push(payload));

    controller.startRound();

    assert.ok(ticks.length >= 1);
    assert.equal(ticks[0].timeLeft, 3.0);
    assert.equal(ticks[0].percentage, 100);
    assert.equal(ticks[0].player, PLAYERS.P1);
  });

  it('should emit BLITZ_WARNING when threshold is reached', async () => {
    let virtualNow = 1000;
    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      isBlitz: true,
      blitzDuration: 2.0,
      blitzWarningThreshold: 1.0,
      blitzTickIntervalMs: 10,
      timeProvider: () => virtualNow
    });

    const warnings = [];
    eventBus.on(EVENT_TYPES.BLITZ_WARNING, (payload) => warnings.push(payload));

    controller.startRound();
    assert.equal(warnings.length, 0);

    // Advance past warning threshold (1.2s elapsed -> 0.8s remaining <= 1.0s)
    virtualNow += 1200;
    await new Promise((r) => setTimeout(r, 25));

    assert.ok(warnings.length >= 1);
    assert.equal(warnings[0].player, PLAYERS.P1);
    assert.ok(warnings[0].timeLeft <= 1.0);
  });

  it('should trigger TIMEOUT_AUTO_MOVE when turn time expires', async () => {
    let virtualNow = 1000;
    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      isBlitz: true,
      blitzDuration: 1.0,
      blitzTickIntervalMs: 10,
      timeProvider: () => virtualNow
    });

    const timeoutEvents = [];
    const moveEvents = [];
    eventBus.on(EVENT_TYPES.BLITZ_TIMEOUT, (payload) => timeoutEvents.push(payload));
    eventBus.on(EVENT_TYPES.MOVE_APPLIED, (payload) => {
      if (payload.action.type === ACTION_TYPES.TIMEOUT_AUTO_MOVE) {
        moveEvents.push(payload);
      }
    });

    controller.startRound();

    // Advance time past 1.0s duration
    virtualNow += 1100;
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(timeoutEvents.length, 1);
    assert.equal(moveEvents.length, 1);
    assert.equal(moveEvents[0].player, PLAYERS.P1);
    assert.equal(controller.getState().currentTurn, PLAYERS.P2);
    assert.equal(controller.getState().turnCount, 1);
  });

  it('should immediately disarm blitz interval upon cancelPendingTimers', async () => {
    let virtualNow = 1000;
    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      isBlitz: true,
      blitzDuration: 0.2,
      blitzTickIntervalMs: 10,
      timeProvider: () => virtualNow
    });

    const moves = [];
    eventBus.on(EVENT_TYPES.MOVE_APPLIED, (payload) => moves.push(payload));

    controller.startRound();
    controller.cancelPendingTimers();

    virtualNow += 500;
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(moves.length, 0); // No timeout auto-move occurred
  });

  it('should pause and resume blitz timers with accurate remaining time', async () => {
    let virtualNow = 1000;
    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      isBlitz: true,
      blitzDuration: 4.0,
      blitzTickIntervalMs: 10,
      timeProvider: () => virtualNow
    });

    const pausedEvents = [];
    const resumedEvents = [];
    eventBus.on(EVENT_TYPES.BLITZ_PAUSED, (payload) => pausedEvents.push(payload));
    eventBus.on(EVENT_TYPES.BLITZ_RESUMED, (payload) => resumedEvents.push(payload));

    controller.startRound();

    // Allow 1.5s to elapse realistically with active interval ticks
    // Yield to the event loop so setInterval callbacks actively decrement blitzTimeRemainingMs
    for (let step = 0; step < 3; step++) {
      virtualNow += 500;
      await new Promise((r) => setTimeout(r, 20));
    }
    controller.pause();

    assert.equal(controller.isPaused, true, 'Controller must be marked paused');
    assert.equal(controller.blitzIntervalId, null, 'Blitz interval must be stopped when paused');
    assert.equal(pausedEvents.length, 1, 'BLITZ_PAUSED must be emitted exactly once');
    assert.ok(
      Math.abs(pausedEvents[0].timeLeft - 2.5) < 0.2,
      `Expected ~2.5s remaining, got ${pausedEvents[0].timeLeft}s`
    );
    assert.equal(pausedEvents[0].player, PLAYERS.P1);
    assert.ok(
      Math.abs(controller.pausedTimeRemainingMs - 2500) < 200,
      `Expected pausedTimeRemainingMs ~2500ms, got ${controller.pausedTimeRemainingMs}ms`
    );

    // Fast-forward while paused (no timer ticks or auto-move should occur)
    virtualNow += 10000;
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(controller.getState().turnCount, 0, 'Turn count must remain 0 while paused');
    assert.equal(controller.getState().status, STATUS.PLAYING, 'Game status must remain PLAYING');
    assert.equal(controller.blitzIntervalId, null, 'No interval should be active while paused');

    // Resume
    controller.resume();
    assert.equal(controller.isPaused, false, 'Controller must be unpaused');
    assert.notEqual(controller.blitzIntervalId, null, 'Blitz interval must be restarted upon resume');
    assert.equal(resumedEvents.length, 1, 'BLITZ_RESUMED must be emitted exactly once');
    assert.ok(
      Math.abs(resumedEvents[0].timeLeft - 2.5) < 0.2,
      `Expected ~2.5s resumed timeLeft, got ${resumedEvents[0].timeLeft}s`
    );
    assert.equal(resumedEvents[0].player, PLAYERS.P1);

    // Complete the turn lifecycle: advance remaining 2.5s + grace period to verify timeout auto-move triggers
    virtualNow += 2700;
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(controller.getState().currentTurn, PLAYERS.P2, 'Turn must advance to P2 upon post-resume timeout');
    assert.equal(controller.getState().turnCount, 1, 'Turn count must advance to 1');
  });
});

describe('3. Cancellation Tokens & Asynchronous Safety', () => {
  let eventBus;
  let controller;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    if (controller) controller.cancelPendingTimers();
  });

  it('should discard in-flight AI move when round is reset before AI delay completes', async () => {
    const mockAi = {
      computeMove: async () => ({
        type: ACTION_TYPES.PLACE_MARK,
        player: PLAYERS.P2,
        index: 4
      })
    };

    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      opponent: 'ai',
      aiStrategy: mockAi,
      aiDelayMs: 40 // 40ms AI delay
    });

    controller.startRound();

    // P1 plays cell 0, switching turn to P2 (AI)
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    assert.equal(controller.getState().currentTurn, PLAYERS.P2);

    // User resets round after 15ms (before 40ms timeout fires)
    await new Promise((r) => setTimeout(r, 15));
    controller.startRound(); // Creates fresh generation token

    // Wait 50ms for stale AI callback to attempt execution
    await new Promise((r) => setTimeout(r, 50));

    // Stale AI must NOT have played in cell 4 in the new round!
    assert.equal(controller.getState().board[4], null);
    assert.equal(controller.getState().currentTurn, PLAYERS.P1);
    assert.equal(controller.getState().turnCount, 0);
  });

  it('should be immune to background tab throttling clock drift', async () => {
    let virtualNow = 1000;
    controller = new GameController({
      eventBus,
      mode: MODES.CLASSIC,
      isBlitz: true,
      blitzDuration: 5.0,
      blitzTickIntervalMs: 50,
      timeProvider: () => virtualNow
    });

    const timeoutEvents = [];
    eventBus.on(EVENT_TYPES.BLITZ_TIMEOUT, (payload) => timeoutEvents.push(payload));

    controller.startRound();

    // Simulate browser background suspension for 10 seconds:
    // When the tab wakes up, the first tick calculates delta time:
    virtualNow += 10000;
    await new Promise((r) => setTimeout(r, 60));

    // Timeout must fire immediately on first wake-up!
    assert.equal(timeoutEvents.length, 1);
    assert.equal(controller.getState().turnCount, 1);
  });
});

describe('4. EventBus Domain Events Integration', () => {
  let eventBus;
  let controller;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    if (controller) controller.cancelPendingTimers();
  });

  it('should emit GHOST_VANISHED in Ghost mode when 4th mark is placed', () => {
    controller = new GameController({
      eventBus,
      mode: MODES.GHOST
    });

    const vanished = [];
    eventBus.on(EVENT_TYPES.GHOST_VANISHED, (payload) => vanished.push(payload));

    controller.startRound();

    // P1: 0, 1, 6. P2: 3, 4, 7.
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 });

    assert.equal(vanished.length, 0);

    // P1 places 4th mark at 8 -> cell 0 vanishes!
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });

    assert.equal(vanished.length, 1);
    assert.equal(vanished[0].evictedIndex, 0);
    assert.equal(vanished[0].player, PLAYERS.P1);
    assert.equal(controller.getState().board[0], null);
    assert.equal(controller.getState().board[8], PLAYERS.P1);
  });

  it('should emit ABILITY_USED when Shatter is executed in Tactical mode', () => {
    controller = new GameController({
      eventBus,
      mode: MODES.TACTICAL
    });

    const abilityEvents = [];
    eventBus.on(EVENT_TYPES.ABILITY_USED, (payload) => abilityEvents.push(payload));

    controller.startRound();

    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });

    controller.dispatch({
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 4
    });

    assert.equal(abilityEvents.length, 1);
    assert.equal(abilityEvents[0].ability, 'shatter');
    assert.equal(abilityEvents[0].player, PLAYERS.P1);
    assert.equal(abilityEvents[0].targetIndex, 4);
  });

  it('should emit GAME_RESET on resetGame()', () => {
    controller = new GameController({ eventBus });
    let resetEmitted = false;
    eventBus.on(EVENT_TYPES.GAME_RESET, () => { resetEmitted = true; });

    controller.resetGame();
    assert.equal(resetEmitted, true);
  });
});
