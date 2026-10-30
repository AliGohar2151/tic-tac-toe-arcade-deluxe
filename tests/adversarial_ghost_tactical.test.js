/**
 * @file adversarial_ghost_tactical.test.js
 * @description Empirical adversarial test harness for Chrono Ghost & Tactical Overdrive AI robustness.
 * Authored by challenger_m2_2 for Milestone M2 verification.
 * 
 * Verifies:
 *  1. Ghost Mode Infinite Loop / Cycle Prevention (100 deep simulated games, FIFO <= 3).
 *  2. Ghost Durable vs Fragile Threat Evaluation (Hard AI never blunders on fragile threats).
 *  3. Tactical Overdrive Blunder Prevention (Phase Swap blunder immunity and Shatter fork disruption).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  createInitialState
} from '../src/core/types.js';
import { gameReducer, getAvailableMoves, checkWin } from '../src/core/gameReducer.js';
import { HardAi, minimaxGhost, getGhostStateKey } from '../src/ai/hardAi.js';
import { MediumAi } from '../src/ai/mediumAi.js';
import { EasyAi } from '../src/ai/easyAi.js';

describe('Adversarial M2.2 AI Empirical Robustness Suite', () => {

  // ==========================================================================
  // SUITE 1: Ghost Mode Infinite Loop / Cycle Prevention & FIFO Invariants
  // ==========================================================================
  describe('1. Ghost Mode Infinite Loop / Cycle Prevention & FIFO Invariants', () => {

    it('1.1 should run 100 deep simulated Ghost games without hangs and maintain FIFO mark decay <= 3', async () => {
      const hardP1 = new HardAi({ randomTieBreak: true });
      const hardP2 = new HardAi({ randomTieBreak: true });
      const medium = new MediumAi();
      const easy = new EasyAi({ mistakeRate: 0.8 });

      let totalGames = 0;
      let p1Wins = 0;
      let p2Wins = 0;
      let draws = 0;
      let maxTurnsObserved = 0;
      let fifoViolations = 0;
      let hangViolations = 0;

      const runGame = async (player1Strategy, player2Strategy, maxTurns = 60) => {
        let state = createInitialState({ mode: MODES.GHOST, maxGhostTurns: maxTurns });
        let turns = 0;

        while (state.status === STATUS.PLAYING && turns < maxTurns) {
          const activeStrategy = state.currentTurn === PLAYERS.P1 ? player1Strategy : player2Strategy;
          const start = performance.now();
          const move = await activeStrategy.computeMove(state);
          const elapsed = performance.now() - start;

          if (elapsed > 500) {
            hangViolations++;
          }

          assert.ok(move, `Active player ${state.currentTurn} failed to generate a move at turn ${turns}`);
          state = gameReducer(state, move);
          turns++;

          // Invariant 1: Board marks must never exceed 3 per player
          const p1BoardCount = state.board.filter(c => c === PLAYERS.P1).length;
          const p2BoardCount = state.board.filter(c => c === PLAYERS.P2).length;
          if (p1BoardCount > 3 || p2BoardCount > 3) {
            fifoViolations++;
          }

          // Invariant 2: FIFO queues must never exceed 3
          if (state.p1Queue.length > 3 || state.p2Queue.length > 3) {
            fifoViolations++;
          }

          // Invariant 3: Queue items must correspond exactly to board coordinates
          for (const idx of state.p1Queue) {
            assert.equal(state.board[idx], PLAYERS.P1, `P1 queue item at ${idx} does not hold P1 mark on board`);
          }
          for (const idx of state.p2Queue) {
            assert.equal(state.board[idx], PLAYERS.P2, `P2 queue item at ${idx} does not hold P2 mark on board`);
          }
        }

        if (turns > maxTurnsObserved) maxTurnsObserved = turns;
        if (state.winner === PLAYERS.P1) p1Wins++;
        else if (state.winner === PLAYERS.P2) p2Wins++;
        else draws++;

        totalGames++;
      };

      const suiteStart = performance.now();

      // 40 Hard vs Hard games
      for (let i = 0; i < 40; i++) {
        await runGame(hardP1, hardP2, 60);
      }

      // 15 Hard (P1) vs Medium (P2)
      for (let i = 0; i < 15; i++) {
        await runGame(hardP1, medium, 60);
      }

      // 15 Medium (P1) vs Hard (P2)
      for (let i = 0; i < 15; i++) {
        await runGame(medium, hardP2, 60);
      }

      // 15 Hard (P1) vs Easy (P2)
      for (let i = 0; i < 15; i++) {
        await runGame(hardP1, easy, 60);
      }

      // 15 Easy (P1) vs Hard (P2)
      for (let i = 0; i < 15; i++) {
        await runGame(easy, hardP2, 60);
      }

      const totalElapsed = performance.now() - suiteStart;

      assert.equal(totalGames, 100, `Expected 100 completed games, got ${totalGames}`);
      assert.equal(fifoViolations, 0, `FIFO mark decay violated ${fifoViolations} times`);
      assert.equal(hangViolations, 0, `Moves exceeding 500ms latency detected: ${hangViolations}`);
      assert.ok(totalElapsed < 5000, `100 games took ${totalElapsed.toFixed(2)}ms, expected < 5000ms`);
    });

    it('1.2 should complete deterministic Hard AI vs Hard AI from all 9 P1 opening moves', async () => {
      const hardP1 = new HardAi({ randomTieBreak: false });
      const hardP2 = new HardAi({ randomTieBreak: false });

      for (let opening = 0; opening < 9; opening++) {
        let state = createInitialState({ mode: MODES.GHOST, maxGhostTurns: 100 });
        state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: opening });
        let turns = 1;

        while (state.status === STATUS.PLAYING && turns < 100) {
          const active = state.currentTurn === PLAYERS.P1 ? hardP1 : hardP2;
          const start = performance.now();
          const move = await active.computeMove(state);
          const elapsed = performance.now() - start;

          assert.ok(elapsed < 100, `Move computation took too long: ${elapsed}ms on opening ${opening}`);
          assert.ok(move, `Null move returned on opening ${opening} at turn ${turns}`);
          state = gameReducer(state, move);
          turns++;

          assert.ok(state.board.filter(c => c === PLAYERS.P1).length <= 3, 'P1 marks exceeded 3');
          assert.ok(state.board.filter(c => c === PLAYERS.P2).length <= 3, 'P2 marks exceeded 3');
        }

        assert.equal(state.status, STATUS.ROUND_OVER, `Game on opening ${opening} did not complete normally`);
        assert.ok(state.winner !== null, `Expected decisive outcome on opening ${opening}`);
      }
    });

    it('1.3 should immediately detect cycles via ancestor path in minimaxGhost', () => {
      const state = {
        ...createInitialState({ mode: MODES.GHOST }),
        board: Object.freeze([
          'p1', null, 'p2',
          null, 'p1', null,
          'p2', null, null
        ]),
        p1Queue: Object.freeze([0, 4]),
        p2Queue: Object.freeze([2, 6]),
        currentTurn: PLAYERS.P1,
        turnCount: 4
      };

      const key = getGhostStateKey(state);
      const ancestors = new Set([key]);
      const tt = new Map();

      // Calling minimaxGhost with the state key already in ancestors must return 0 (draw) immediately
      const score = minimaxGhost(state, 1, -Infinity, Infinity, true, PLAYERS.P1, tt, ancestors);
      assert.equal(score, 0, `minimaxGhost should return 0 on cycle detection, got ${score}`);
    });
  });

  // ==========================================================================
  // SUITE 2: Ghost Durable vs Fragile Threat Evaluation
  // ==========================================================================
  describe('2. Ghost Durable vs Fragile Threat Evaluation', () => {

    it('2.1 should prioritize blocking durable threat over fragile threat', async () => {
      // P1 queue: [0, 4, 7]. Mark 0 is oldest (will vanish on P1 next move).
      // Durable threat: Col 1 has [1, 4, 7] with cell 1 empty. Marks 4 and 7 remain, so placing at 1 wins!
      // Fragile threat: Diag \ has [0, 4, 8] with cell 8 empty. Mark 0 vanishes, so placing at 8 does not win.
      // AI is P2. P2 must block at cell 1, NOT cell 8.
      const state = {
        ...createInitialState({ mode: MODES.GHOST }),
        board: Object.freeze([
          'p1', null, null, // 0 (p1, oldest)
          null, 'p1', null, // 4 (p1)
          null, 'p1', null  // 7 (p1)
        ]),
        p1Queue: Object.freeze([0, 4, 7]),
        p2Queue: Object.freeze([2, 6]),
        currentTurn: PLAYERS.P2,
        turnCount: 5
      };

      const hardAi = new HardAi();
      const move = await hardAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
      assert.equal(move.index, 1, `Hard AI should block durable threat at cell 1, but picked ${move.index}`);
    });

    it('2.2 should seize immediate win instead of wasting move on fragile threat', async () => {
      // P1 queue: [0, 1, 7]. Mark 0 is oldest.
      // Fragile threat: Line [0, 1, 2] with cell 2 empty.
      // P2 queue: [3, 4]. P2 line [3, 4, 5] is an immediate win at cell 5.
      // Hard AI must take cell 5 to win, rather than blocking cell 2.
      const state = {
        ...createInitialState({ mode: MODES.GHOST }),
        board: Object.freeze([
          'p1', 'p1', null, // 0(p1, oldest), 1(p1), 2(null)
          'p2', 'p2', null, // 3(p2), 4(p2), 5(null) -> P2 win
          null, 'p1', null  // 7(p1)
        ]),
        p1Queue: Object.freeze([0, 1, 7]),
        p2Queue: Object.freeze([3, 4]),
        currentTurn: PLAYERS.P2,
        turnCount: 5
      };

      const hardAi = new HardAi();
      const move = await hardAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      assert.equal(move.index, 5, `Hard AI must seize winning cell 5, but chose ${move.index}`);
      const nextState = gameReducer(state, move);
      assert.equal(nextState.winner, PLAYERS.P2, 'Move must conclude game with P2 victory');
    });

    it('2.3 should ignore fragile threat and play offensively when only fragile threat exists', async () => {
      // P1 queue: [0, 4, 2]. Mark 0 is oldest.
      // Row 0 [0, 1, 2] has cell 1 empty, but mark 0 will vanish, so it is a fragile threat.
      // All other lines are blocked. P2 has mark at 6.
      // Hard AI should NOT play cell 1, but rather an offensive move (e.g. 3, 7, 8).
      const state = {
        ...createInitialState({ mode: MODES.GHOST }),
        board: Object.freeze([
          'p1', null, 'p1', // 0(p1, oldest), 1(null), 2(p1)
          null, 'p1', null, // 4(p1)
          'p2', null, null  // 6(p2)
        ]),
        p1Queue: Object.freeze([0, 4, 2]),
        p2Queue: Object.freeze([6]),
        currentTurn: PLAYERS.P2,
        turnCount: 4
      };

      const hardAi = new HardAi();
      const move = await hardAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      assert.notEqual(move.index, 1, 'Hard AI should NOT blunder by blocking fragile cell 1');
    });
  });

  // ==========================================================================
  // SUITE 3: Tactical Overdrive Blunder Prevention & Shatter Defense
  // ==========================================================================
  describe('3. Tactical Overdrive Blunder Prevention & Shatter Defense', () => {

    it('3.1 Hard AI should NEVER execute a Phase Swap that immediately completes opponent 3-in-a-row', async () => {
      // Board layout:
      // Row 0: 0(p1), 1(p2), 2(p1) -> if cell 1 becomes p1, P1 wins!
      // Row 1: null, 4(p1), null
      // Row 2: 6(p2), 7(p1), 8(p2)
      // Cell 1 (p2) is adjacent to cell 4 (p1).
      // Swapping 1 and 4 places p1 in cell 1, immediately completing row 0 for P1!
      // Hard AI MUST NEVER select this swap.
      const board = [
        'p1', 'p2', 'p1',
        null, 'p1', null,
        'p2', 'p1', 'p2'
      ];

      const state = {
        ...createInitialState({ mode: MODES.TACTICAL }),
        board: Object.freeze(board),
        currentTurn: PLAYERS.P2,
        turnCount: 7,
        abilities: Object.freeze({
          p1: Object.freeze({ shatter: 0, swap: 0 }),
          p2: Object.freeze({ shatter: 0, swap: 1 })
        })
      };

      const hardAi = new HardAi();
      const move = await hardAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      const nextState = gameReducer(state, move);
      assert.notEqual(nextState.winner, PLAYERS.P1, 'Hard AI executed a Phase Swap that awarded win to opponent!');
    });

    it('3.2 Hard AI should use Shatter to disrupt imminent dual-fork opponent win', async () => {
      // Opponent (P1) has marks at corners 0, 2, 8 creating a dual fork:
      // Row 0: [0, 1, 2] threatening cell 1.
      // Col 2: [2, 5, 8] threatening cell 5.
      // P2 has center 4.
      // Standard placement at 1 leaves 5 open for P1 win, and vice-versa.
      // P2 has Shatter available. Shattering cell 2 neutralizes both threats!
      const board = [
        'p1', null, 'p1',
        null, 'p2', null,
        null, null, 'p1'
      ];

      const state = {
        ...createInitialState({ mode: MODES.TACTICAL }),
        board: Object.freeze(board),
        currentTurn: PLAYERS.P2,
        turnCount: 4,
        abilities: Object.freeze({
          p1: Object.freeze({ shatter: 0, swap: 0 }),
          p2: Object.freeze({ shatter: 1, swap: 1 })
        })
      };

      const hardAi = new HardAi();
      const move = await hardAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      assert.equal(move.type, ACTION_TYPES.USE_SHATTER, `Hard AI should use Shatter on fork, got ${move.type}`);
      assert.equal(move.targetIndex, 2, `Hard AI should shatter the pivot fork cell 2, got ${move.targetIndex}`);
    });

    it('3.3 Hard AI should seize an immediate win via Phase Swap when placement cannot win', async () => {
      // Board layout:
      // Row 0: 0(p1), 1(p2), 2(p1) -> Row 0 is blocked by cell 1
      // Row 1: 3(p2), 4(p1), 5(null) -> Diagonals and columns blocked by P2
      // Row 2: 6(p2), 7(null), 8(p2)
      // Placement cannot achieve a win this turn.
      // But P1 can swap cell 4 (p1) with adjacent cell 1 (p2), completing row 0 [0, 1, 2]!
      const board = [
        'p1', 'p2', 'p1',
        'p2', 'p1', null,
        'p2', null, 'p2'
      ];

      const state = {
        ...createInitialState({ mode: MODES.TACTICAL }),
        board: Object.freeze(board),
        currentTurn: PLAYERS.P1,
        turnCount: 6,
        abilities: Object.freeze({
          p1: Object.freeze({ shatter: 0, swap: 1 }),
          p2: Object.freeze({ shatter: 0, swap: 0 })
        })
      };

      const hardAi = new HardAi();
      const move = await hardAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      assert.equal(move.type, ACTION_TYPES.USE_SWAP, `Expected USE_SWAP, got ${move.type}`);
      const nextState = gameReducer(state, move);
      assert.equal(nextState.winner, PLAYERS.P1, 'Phase Swap move must immediately win for P1');
    });

    it('3.4 Medium AI should NEVER blunder by using Phase Swap that awards win to opponent', async () => {
      // Board where Phase Swap gifts opponent a win:
      // Row 0: 0(p1), 1(p2), 2(p1)
      // Row 1: null, 4(p1), null
      // Row 2: 6(p2), 7(p1), 8(p2)
      // Swapping 1 (p2) and 4 (p1) gives P1 row 0, awarding P1 an immediate victory.
      const board = [
        'p1', 'p2', 'p1',
        null, 'p1', null,
        'p2', 'p1', 'p2'
      ];

      const state = {
        ...createInitialState({ mode: MODES.TACTICAL }),
        board: Object.freeze(board),
        currentTurn: PLAYERS.P2,
        turnCount: 7,
        abilities: Object.freeze({
          p1: Object.freeze({ shatter: 0, swap: 0 }),
          p2: Object.freeze({ shatter: 0, swap: 1 })
        })
      };

      const mediumAi = new MediumAi();
      const move = await mediumAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      const nextState = gameReducer(state, move);

      // Verify blunder prevention: AI must not award opponent an instant win on AI's own turn
      assert.notEqual(
        nextState.winner,
        PLAYERS.P1,
        `Medium AI blundered! Selected ${JSON.stringify(move)} which immediately awarded win to opponent.`
      );
    });

    it('3.5 Medium AI dual-fork defense: shatters pivot mark to neutralize dual fork', async () => {
      // Opponent (P1) has marks at corners 0, 2, 8 creating a dual fork:
      // P1 threatens cell 1 (row 0) and cell 5 (col 2).
      // P2 has center 4 and Shatter = 1.
      // In Tactical mode, Medium AI must neutralize the dual fork by shattering
      // the pivot mark (cell 2) instead of only blocking one cell via placement.
      const board = [
        'p1', null, 'p1',
        null, 'p2', null,
        null, null, 'p1'
      ];

      const state = {
        ...createInitialState({ mode: MODES.TACTICAL }),
        board: Object.freeze(board),
        currentTurn: PLAYERS.P2,
        turnCount: 4,
        abilities: Object.freeze({
          p1: Object.freeze({ shatter: 0, swap: 0 }),
          p2: Object.freeze({ shatter: 1, swap: 1 })
        })
      };

      const mediumAi = new MediumAi();
      const move = await mediumAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      assert.equal(move.type, ACTION_TYPES.USE_SHATTER, 'Medium AI should select Shatter to neutralize dual fork');
      assert.equal(move.targetIndex, 2, 'Medium AI should shatter pivot cell 2');
    });
  });
});
