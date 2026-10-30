/**
 * @file stress_concurrency.test.js
 * @description Empirical Challenger Stress Test Suite: Concurrency, Mutex Contention,
 * Blitz Timer Lifecycle, Pause/Resume, Clock Jumps, and Teardown Verification.
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

describe('Empirical Challenger: Concurrency & Timer Stress Harness', () => {
  let eventBus;
  let controller;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    if (controller) {
      controller.cancelPendingTimers();
    }
  });

  // ==========================================================================
  // Suite 1: Rapid Concurrent Dispatches
  // ==========================================================================
  describe('1. Rapid Concurrent Dispatches (50 Parallel Requests)', () => {
    it('should strictly allow only 1 move to succeed when 50 parallel async dispatches race for turn 1', async () => {
      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: false
      });
      controller.startRound();

      const actions = Array.from({ length: 50 }, (_, i) => ({
        type: ACTION_TYPES.PLACE_MARK,
        player: PLAYERS.P1,
        index: i % 9
      }));

      // Fire 50 asynchronous dispatches in parallel via Promise.all
      const results = await Promise.all(
        actions.map((act) =>
          new Promise((resolve) => {
            // Interleave with microtask delay
            queueMicrotask(() => {
              const res = controller.dispatch(act);
              resolve(res);
            });
          })
        )
      );

      // Invariants to verify:
      // Exactly 1 move should have succeeded as primary execution
      const successfulMoves = results.filter((r) => r.success === true);
      const failedMoves = results.filter((r) => r.success === false);

      assert.equal(successfulMoves.length, 1, `Expected exactly 1 success, got ${successfulMoves.length}`);
      assert.equal(failedMoves.length, 49, `Expected 49 failures, got ${failedMoves.length}`);

      // Verify board state consistency: exactly 1 cell occupied by P1
      const state = controller.getState();
      const occupied = state.board.filter((c) => c !== null);
      assert.equal(occupied.length, 1, 'Board must have exactly 1 mark');
      assert.equal(state.currentTurn, PLAYERS.P2, 'Turn must advance to P2');
      assert.equal(state.turnCount, 1, 'Turn count must be 1');
      assert.ok(Object.isFrozen(state.board), 'Board must remain deeply frozen');
    });

    it('should maintain state consistency across 100 interleaved alternating dispatches', async () => {
      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: false
      });
      controller.startRound();

      // Dispatch 100 rapid requests alternating between P1 and P2 targeting random cells
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const player = i % 2 === 0 ? PLAYERS.P1 : PLAYERS.P2;
        const targetIndex = i % 9;
        promises.push(
          new Promise((resolve) => {
            setTimeout(() => {
              const res = controller.dispatch({
                type: ACTION_TYPES.PLACE_MARK,
                player,
                index: targetIndex
              });
              resolve(res);
            }, Math.floor(Math.random() * 5));
          })
        );
      }

      const results = await Promise.all(promises);

      // Invariants:
      const state = controller.getState();
      const p1Marks = state.board.filter((c) => c === PLAYERS.P1).length;
      const p2Marks = state.board.filter((c) => c === PLAYERS.P2).length;

      // P1 and P2 marks count can never differ by more than 1 in classic mode
      assert.ok(
        Math.abs(p1Marks - p2Marks) <= 1,
        `Mark disparity too large: P1=${p1Marks}, P2=${p2Marks}`
      );

      // Either game is ROUND_OVER or still PLAYING, never corrupted
      assert.ok(
        state.status === STATUS.PLAYING || state.status === STATUS.ROUND_OVER,
        `Invalid status: ${state.status}`
      );
    });

    it('should serialize re-entrant cascades without call stack overflow or state corruption', () => {
      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC
      });
      controller.startRound();

      let cascadeDispatched = false;
      eventBus.on(EVENT_TYPES.MOVE_APPLIED, (payload) => {
        if (!cascadeDispatched && payload.player === PLAYERS.P1) {
          cascadeDispatched = true;
          // Synchronously push 10 re-entrant actions
          for (let i = 0; i < 10; i++) {
            controller.dispatch({
              type: ACTION_TYPES.PLACE_MARK,
              player: i % 2 === 0 ? PLAYERS.P2 : PLAYERS.P1,
              index: (i + 1) % 9
            });
          }
        }
      });

      // Primary dispatch
      const res = controller.dispatch({
        type: ACTION_TYPES.PLACE_MARK,
        player: PLAYERS.P1,
        index: 0
      });

      assert.equal(res.success, true);
      const state = controller.getState();
      // At most valid moves executed
      assert.ok(state.turnCount >= 1 && state.turnCount <= 9);
      assert.equal(controller.actionQueue.length, 0, 'Queue must be drained');
    });
  });

  // ==========================================================================
  // Suite 2: Blitz Timer Lifecycle & Pause/Resume Stress
  // ==========================================================================
  describe('2. Blitz Timer Lifecycle & Pause/Resume Stress', () => {
    it('INVESTIGATION: verify whether pause() double-deducts elapsed time when ticks have fired', async () => {
      let virtualNow = 1000;
      const durationSeconds = 5.0; // 5000ms duration
      const tickIntervalMs = 20;

      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: true,
        blitzDuration: durationSeconds,
        blitzTickIntervalMs: tickIntervalMs,
        timeProvider: () => virtualNow
      });

      const pausedEvents = [];
      eventBus.on(EVENT_TYPES.BLITZ_PAUSED, (payload) => pausedEvents.push(payload));

      controller.startRound();

      // Let 2000ms elapse with real interval ticks firing
      // We step virtualNow in increments of 20ms over 100ms real time
      for (let step = 0; step < 10; step++) {
        virtualNow += 200; // 200ms per step -> 2000ms total
        await new Promise((r) => setTimeout(r, 25)); // Allow setInterval to tick!
      }

      // Now at virtualNow = 3000 (2000ms elapsed out of 5000ms)
      // Exactly 2.0s elapsed -> mathematically remaining time SHOULD BE 3.0s (3000ms)!
      controller.pause();

      assert.equal(pausedEvents.length, 1, 'BLITZ_PAUSED must be emitted');

      const reportedTimeLeft = pausedEvents[0].timeLeft;
      const internalRemainingMs = controller.pausedTimeRemainingMs;

      // Log empirical observation
      console.log(`[EMPIRICAL LOG] Blitz Pause Test:
        - Blitz Total Duration: 5000ms
        - Actual Virtual Elapsed: 2000ms
        - Mathematically Correct Remaining: 3000ms (3.0s)
        - Internal controller.pausedTimeRemainingMs: ${internalRemainingMs}ms
        - Event reported timeLeft: ${reportedTimeLeft}s
      `);

      // Check if double deduction occurred:
      // If double deduction occurred, remaining is ~ 3000 - 2000 = 1000ms (1.0s) instead of 3.0s!
      assert.ok(
        Math.abs(reportedTimeLeft - 3.0) < 0.3,
        `DOUBLE-DEDUCTION DEFECT DETECTED: Expected ~3.0s remaining, but got ${reportedTimeLeft}s! internal=${internalRemainingMs}ms`
      );
    });

    it('INVESTIGATION: verify whether pause() causes premature timeout expiration if paused past half duration', async () => {
      let virtualNow = 1000;
      const durationSeconds = 5.0; // 5000ms duration

      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: true,
        blitzDuration: durationSeconds,
        blitzTickIntervalMs: 20,
        timeProvider: () => virtualNow
      });

      controller.startRound();

      // Let 2600ms elapse (more than half of 5.0s)
      for (let step = 0; step < 13; step++) {
        virtualNow += 200; // 2600ms total
        await new Promise((r) => setTimeout(r, 25)); // Interval ticks fire!
      }

      // Now pause after 2.6s (2.4s should remain)
      controller.pause();

      console.log(`[EMPIRICAL LOG] Pause at 2.6s / 5.0s:
        - pausedTimeRemainingMs: ${controller.pausedTimeRemainingMs}ms
      `);

      assert.ok(
        controller.pausedTimeRemainingMs > 1500,
        `PREMATURE EXPIRATION DEFECT: Pausing after 2.6s of 5.0s resulted in ${controller.pausedTimeRemainingMs}ms remaining (expected ~2400ms)!`
      );
    });

    it('INVESTIGATION: verify that resuming after pause past half duration fails to restart blitz timer', async () => {
      let virtualNow = 1000;
      const durationSeconds = 5.0;

      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: true,
        blitzDuration: durationSeconds,
        blitzTickIntervalMs: 20,
        timeProvider: () => virtualNow
      });

      controller.startRound();

      for (let step = 0; step < 13; step++) {
        virtualNow += 200;
        await new Promise((r) => setTimeout(r, 25));
      }

      controller.pause();

      const resumeEvents = [];
      eventBus.on(EVENT_TYPES.BLITZ_RESUMED, (p) => resumeEvents.push(p));

      controller.resume();

      console.log(`[EMPIRICAL LOG] Resume after pause at 2.6s:
        - blitzIntervalId: ${controller.blitzIntervalId}
        - resumeEvents count: ${resumeEvents.length}
      `);

      // Invariant: Blitz interval MUST be restarted on resume
      assert.notEqual(controller.blitzIntervalId, null, 'Blitz interval was not restarted after resume (infinite turn softlock)!');
      assert.equal(resumeEvents.length, 1, 'BLITZ_RESUMED was not emitted!');
    });

    it('INVESTIGATION: verify whether pausing during AI turn softlocks the AI opponent', async () => {
      let aiCalled = 0;
      const mockAi = {
        computeMove: async () => {
          aiCalled++;
          return {
            type: ACTION_TYPES.PLACE_MARK,
            player: PLAYERS.P2,
            index: 4
          };
        }
      };

      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        opponent: 'ai',
        aiStrategy: mockAi,
        aiDelayMs: 60 // 60ms delay
      });

      controller.startRound();

      // P1 plays cell 0 -> switches turn to P2 (AI)
      controller.dispatch({
        type: ACTION_TYPES.PLACE_MARK,
        player: PLAYERS.P1,
        index: 0
      });
      assert.equal(controller.getState().currentTurn, PLAYERS.P2);

      // Player pauses at 20ms while AI timeout is pending
      await new Promise((r) => setTimeout(r, 20));
      controller.pause();
      assert.equal(controller.isPaused, true);

      // Wait 80ms while paused (the 60ms AI timeout triggers during pause)
      await new Promise((r) => setTimeout(r, 80));

      // Now resume the game
      controller.resume();
      assert.equal(controller.isPaused, false);

      // Give ample time (150ms) for AI to make its move if resumed correctly
      await new Promise((r) => setTimeout(r, 150));

      const finalState = controller.getState();
      console.log(`[EMPIRICAL LOG] AI Pause/Resume Test:
        - aiCalled: ${aiCalled}
        - Current turn: ${finalState.currentTurn}
        - Cell 4 content: ${finalState.board[4]}
        - Turn count: ${finalState.turnCount}
        - Pending AI Timeout ID: ${controller.pendingAiTimeoutId}
      `);

      // Invariant: After resuming, the AI MUST make its move and turn must advance back to P1!
      assert.equal(
        finalState.board[4],
        PLAYERS.P2,
        `AI SOFTLOCK DEFECT: AI move was dropped when paused, and never rescheduled on resume!`
      );
      assert.equal(finalState.currentTurn, PLAYERS.P1, 'Turn should have advanced to P1');
    });

    it('should withstand 50 rapid pause/resume toggle cycles without leaking intervals or throwing', () => {
      let virtualNow = 1000;
      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: true,
        blitzDuration: 5.0,
        blitzTickIntervalMs: 20,
        timeProvider: () => virtualNow
      });
      controller.startRound();

      for (let i = 0; i < 50; i++) {
        controller.pause();
        assert.equal(controller.isPaused, true);
        assert.equal(controller.blitzIntervalId, null, 'Interval must be null when paused');
        controller.resume();
        assert.equal(controller.isPaused, false);
        assert.notEqual(controller.blitzIntervalId, null, 'Interval must be active when resumed');
      }

      controller.cancelPendingTimers();
      assert.equal(controller.blitzIntervalId, null);
    });

    it('should cleanly disable all timers on cancelPendingTimers without dangling callbacks', async () => {
      let virtualNow = 1000;
      let tickCount = 0;
      let timeoutCount = 0;

      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: true,
        blitzDuration: 1.0,
        blitzTickIntervalMs: 10,
        timeProvider: () => virtualNow
      });

      eventBus.on(EVENT_TYPES.BLITZ_TICK, () => tickCount++);
      eventBus.on(EVENT_TYPES.BLITZ_TIMEOUT, () => timeoutCount++);

      controller.startRound();
      assert.ok(tickCount >= 1);

      // Cancel immediately
      controller.cancelPendingTimers();
      assert.equal(controller.blitzIntervalId, null);
      assert.equal(controller.pendingAiTimeoutId, null);
      assert.equal(controller.activeToken, null);

      const capturedTicks = tickCount;

      // Advance virtual time and wait real time
      virtualNow += 5000;
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(tickCount, capturedTicks, 'No additional ticks after cancelPendingTimers');
      assert.equal(timeoutCount, 0, 'No timeout after cancelPendingTimers');
    });
  });

  // ==========================================================================
  // Suite 3: Background Tab Suspension / Clock Skew / Time Jumps
  // ==========================================================================
  describe('3. Background Tab Suspension & Clock Skew', () => {
    it('should handle extreme time jump (e.g. 100 seconds) cleanly on wake-up tick', async () => {
      let virtualNow = 1000;
      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: true,
        blitzDuration: 5.0,
        blitzTickIntervalMs: 20,
        timeProvider: () => virtualNow
      });

      const timeoutEvents = [];
      eventBus.on(EVENT_TYPES.BLITZ_TIMEOUT, (payload) => timeoutEvents.push(payload));

      controller.startRound();

      // Jump 100 seconds into the future simulating deep device sleep / tab freeze
      virtualNow += 100000;
      await new Promise((r) => setTimeout(r, 40));

      // Must have triggered timeout move immediately
      assert.equal(timeoutEvents.length, 1);
      assert.equal(controller.getState().turnCount, 1);
      assert.equal(controller.getState().currentTurn, PLAYERS.P2);
    });

    it('should clamp tick percentage between 0 and 100 during negative clock skew', () => {
      let virtualNow = 5000;
      controller = new GameController({
        eventBus,
        mode: MODES.CLASSIC,
        isBlitz: true,
        blitzDuration: 5.0,
        blitzTickIntervalMs: 20,
        timeProvider: () => virtualNow
      });

      const ticks = [];
      eventBus.on(EVENT_TYPES.BLITZ_TICK, (payload) => ticks.push(payload));

      controller.startRound();

      // Negative skew (clock steps backwards by 2 seconds)
      virtualNow = 3000;
      controller._emitBlitzTick(7000); // 7000ms remaining > 5000ms

      const lastTick = ticks[ticks.length - 1];
      assert.equal(lastTick.percentage, 100, 'Percentage must be clamped to 100');
    });
  });

  // ==========================================================================
  // Suite 4: Mechanics Under Concurrency Stress (Ghost & Tactical)
  // ==========================================================================
  describe('4. Mechanics Under Concurrency Stress', () => {
    it('should maintain strict 3-mark FIFO queue in Ghost mode during parallel dispatch flood', async () => {
      controller = new GameController({
        eventBus,
        mode: MODES.GHOST,
        isBlitz: false
      });
      controller.startRound();

      // Dispatch 30 parallel moves
      const moves = [];
      for (let i = 0; i < 30; i++) {
        moves.push(
          new Promise((resolve) => {
            setTimeout(() => {
              const res = controller.dispatch({
                type: ACTION_TYPES.PLACE_MARK,
                player: i % 2 === 0 ? PLAYERS.P1 : PLAYERS.P2,
                index: i % 9
              });
              resolve(res);
            }, Math.floor(Math.random() * 5));
          })
        );
      }

      await Promise.all(moves);

      const state = controller.getState();
      assert.ok(state.p1Queue.length <= 3, 'P1 ghost queue cannot exceed 3');
      assert.ok(state.p2Queue.length <= 3, 'P2 ghost queue cannot exceed 3');
    });

    it('should prevent double-spending tactical abilities during parallel requests', async () => {
      controller = new GameController({
        eventBus,
        mode: MODES.TACTICAL,
        isBlitz: false
      });
      controller.startRound();

      // Setup board: P1 at 0, P2 at 1
      controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
      controller.dispatch({ type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

      // Now it is P1's turn. P1 attempts to fire 10 simultaneous Shatter requests at cell 1
      const shatterPromises = Array.from({ length: 10 }, () =>
        new Promise((resolve) => {
          queueMicrotask(() => {
            const res = controller.dispatch({
              type: ACTION_TYPES.USE_SHATTER,
              player: PLAYERS.P1,
              targetIndex: 1
            });
            resolve(res);
          });
        })
      );

      const results = await Promise.all(shatterPromises);

      const successCount = results.filter((r) => r.success === true).length;
      assert.equal(successCount, 1, 'Only exactly 1 Shatter can succeed');

      const state = controller.getState();
      assert.equal(state.abilities[PLAYERS.P1].shatter, 0, 'Charge must be 0');
      assert.equal(state.board[1], null, 'Cell 1 was shattered');
      assert.equal(state.currentTurn, PLAYERS.P2, 'Turn passed to P2');
    });
  });
});
