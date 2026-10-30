/**
 * @file empirical_ghost_tactical_stress.test.js
 * @description Independent empirical stress-testing harness for Ghost & Tactical AI.
 * Authored by challenger_m2_r2_2 to verify:
 * 1. Medium AI Phase Swap blunder immunity across 1,000 randomized tactical states.
 * 2. Medium AI tactical Shatter fork neutralization across all canonical dual-fork geometries.
 * 3. Ghost Mode FIFO decay and infinite loop prevention across 150 deep simulated games.
 * 4. Medium AI and Hard AI tactical move legality and contract invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  WINNING_LINES,
  createInitialState
} from '../src/core/types.js';
import { gameReducer, getAvailableMoves, checkWin } from '../src/core/gameReducer.js';
import { MediumAi } from '../src/ai/mediumAi.js';
import { HardAi } from '../src/ai/hardAi.js';
import { EasyAi } from '../src/ai/easyAi.js';

describe('Empirical Ghost & Tactical AI Challenge Suite (Challenger M2-R2-2)', () => {

  // ==========================================================================
  // 1. COMBINATORIAL DUAL-FORK SHATTER NEUTRALIZATION
  // ==========================================================================
  describe('1. Combinatorial Dual-Fork Shatter Neutralization Matrix', () => {

    const canonicalForks = [
      // Corner-to-corner forks
      { name: 'Corners 0, 2, 8 (Pivot 2)', p1: [0, 2, 8], pivot: 2, threats: [1, 5] },
      { name: 'Corners 0, 6, 8 (Pivot 6)', p1: [0, 6, 8], pivot: 6, threats: [3, 7] },
      { name: 'Corners 0, 2, 6 (Pivot 0)', p1: [0, 2, 6], pivot: 0, threats: [1, 3] },
      { name: 'Corners 2, 6, 8 (Pivot 8)', p1: [2, 6, 8], pivot: 8, threats: [5, 7] },

      // Center-pivot forks
      { name: 'Center fork [0, 4, 7] (Pivot 4)', p1: [0, 4, 7], pivot: 4, threats: [8, 1] },
      { name: 'Center fork [2, 4, 7] (Pivot 4)', p1: [2, 4, 7], pivot: 4, threats: [6, 1] },
      { name: 'Center fork [6, 4, 1] (Pivot 4)', p1: [6, 4, 1], pivot: 4, threats: [2, 7] },
      { name: 'Center fork [8, 4, 1] (Pivot 4)', p1: [8, 4, 1], pivot: 4, threats: [0, 7] },
      { name: 'Center fork [0, 4, 5] (Pivot 4)', p1: [0, 4, 5], pivot: 4, threats: [8, 3] },
      { name: 'Center fork [6, 4, 5] (Pivot 4)', p1: [6, 4, 5], pivot: 4, threats: [2, 3] },
      { name: 'Center fork [2, 4, 3] (Pivot 4)', p1: [2, 4, 3], pivot: 4, threats: [6, 5] },
      { name: 'Center fork [8, 4, 3] (Pivot 4)', p1: [8, 4, 3], pivot: 4, threats: [0, 5] },
    ];

    for (const fork of canonicalForks) {
      it(`Medium AI must neutralize ${fork.name} via Shatter on pivot cell ${fork.pivot}`, async () => {
        const board = Array(9).fill(null);
        for (const idx of fork.p1) {
          board[idx] = PLAYERS.P1;
        }
        // Place P2 mark on a benign cell that does NOT block the threats or pivot.
        // For corner forks, center cell 4 must be occupied by P2 so opposite corners don't create an unintended 3rd threat.
        const nonThreatCells = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
          c => !fork.p1.includes(c) && !fork.threats.includes(c) && c !== fork.pivot
        );
        assert.ok(nonThreatCells.length > 0, `Fork ${fork.name} must leave at least one benign cell for P2`);
        const p2Cell = nonThreatCells.includes(4) ? 4 : nonThreatCells[0];
        board[p2Cell] = PLAYERS.P2;

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

        assert.ok(move, `Medium AI returned null on ${fork.name}`);
        assert.equal(move.type, ACTION_TYPES.USE_SHATTER, `Expected USE_SHATTER on ${fork.name}, got ${move.type}`);
        assert.equal(move.targetIndex, fork.pivot, `Expected shatter on pivot cell ${fork.pivot}, got ${move.targetIndex}`);

        // Verify the board state after shatter: the dual fork is destroyed
        const nextState = gameReducer(state, move);
        assert.equal(nextState.board[fork.pivot], null, 'Pivot mark should be removed');
        assert.equal(nextState.abilities.p2.shatter, 0, 'Shatter charge must be decremented');
      });
    }

    it('Medium AI must fallback to single-cell direct placement block when Shatter is depleted', async () => {
      // Fork on [0, 2, 8], pivot is 2, threats at 1 and 5.
      // Shatter = 0, Swap = 0.
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
          p2: Object.freeze({ shatter: 0, swap: 0 })
        })
      };

      const mediumAi = new MediumAi();
      const move = await mediumAi.computeMove(state);

      assert.ok(move, 'Move should not be null');
      assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
      assert.ok(
        move.index === 1 || move.index === 5,
        `Medium AI must block one of the threat cells (1 or 5), got cell ${move.index}`
      );
    });
  });

  // ==========================================================================
  // 2. PHASE SWAP BLUNDER IMMUNITY STRESS HARNESS (1,000 RANDOM STATES)
  // ==========================================================================
  describe('2. Phase Swap Blunder Immunity Stress Harness (1,000 States)', () => {

    it('Medium AI must NEVER pick a Phase Swap that immediately awards victory to opponent across 1,000 states', async () => {
      const mediumAi = new MediumAi();
      let testedBlunderScenarios = 0;
      let safeSwapChosen = 0;
      let placementChosen = 0;
      let shatterChosen = 0;

      // Deterministic PRNG for reproducibility
      let seed = 42;
      const rng = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      // Generate board states where:
      // - P2 has swap: 1
      // - Legal moves include at least one suicidal swap move
      // - Legal moves also include safe alternatives
      for (let trial = 0; trial < 1000; trial++) {
        // Construct a state where opponent (P1) has 2-in-a-row with an empty cell,
        // and P2 has an adjacent mark to a P1 mark that could complete the line,
        // OR construct states systematically from winning lines
        const line = WINNING_LINES[Math.floor(rng() * WINNING_LINES.length)];
        const emptySlotOnLine = line[Math.floor(rng() * line.length)];
        const p1SlotsOnLine = line.filter(c => c !== emptySlotOnLine);

        const board = Array(9).fill(null);
        // Put P1 on 2 slots of the line
        board[p1SlotsOnLine[0]] = PLAYERS.P1;
        board[p1SlotsOnLine[1]] = PLAYERS.P1;

        // Find an adjacent cell to emptySlotOnLine that can hold P1, and put P2 on emptySlotOnLine
        // So swapping them puts P1 on emptySlotOnLine, completing the line for P1!
        const adjMap = {
          0: [1, 3],
          1: [0, 2, 4],
          2: [1, 5],
          3: [0, 4, 6],
          4: [1, 3, 5, 7],
          5: [2, 4, 8],
          6: [3, 7],
          7: [4, 6, 8],
          8: [5, 7]
        };

        const adjacentToEmpty = adjMap[emptySlotOnLine].filter(c => !line.includes(c));
        if (adjacentToEmpty.length === 0) continue;

        const donorCell = adjacentToEmpty[Math.floor(rng() * adjacentToEmpty.length)];
        board[emptySlotOnLine] = PLAYERS.P2;
        board[donorCell] = PLAYERS.P1;

        // Add 1 extra P2 mark elsewhere to ensure multiple legal options
        const remainingEmpty = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(c => board[c] === null);
        if (remainingEmpty.length > 0) {
          const extraP2 = remainingEmpty[Math.floor(rng() * remainingEmpty.length)];
          board[extraP2] = PLAYERS.P2;
        }

        const state = {
          ...createInitialState({ mode: MODES.TACTICAL }),
          board: Object.freeze(board),
          currentTurn: PLAYERS.P2,
          turnCount: 5,
          abilities: Object.freeze({
            p1: Object.freeze({ shatter: 0, swap: 0 }),
            p2: Object.freeze({ shatter: rng() > 0.5 ? 1 : 0, swap: 1 })
          })
        };

        // Check if there is indeed a suicidal swap available
        const legalMoves = mediumAi.getLegalMoves(state);
        const suicidalSwaps = legalMoves.filter(
          m => m.type === ACTION_TYPES.USE_SWAP && mediumAi.simulateMove(state, m).winner === PLAYERS.P1
        );

        if (suicidalSwaps.length === 0) {
          continue; // not a dangerous blunder test case, skip
        }

        testedBlunderScenarios++;

        // Compute AI move
        const move = await mediumAi.computeMove(state);
        assert.ok(move, `Move must not be null at trial ${trial}`);

        // Core Invariant: AI move must NEVER immediately result in P1 winning
        const simState = mediumAi.simulateMove(state, move);
        assert.notEqual(
          simState.winner,
          PLAYERS.P1,
          `CRITICAL FAILURE: Medium AI selected suicidal move ${JSON.stringify(move)} at trial ${trial}`
        );

        if (move.type === ACTION_TYPES.USE_SWAP) safeSwapChosen++;
        else if (move.type === ACTION_TYPES.PLACE_MARK) placementChosen++;
        else if (move.type === ACTION_TYPES.USE_SHATTER) shatterChosen++;
      }

      assert.ok(
        testedBlunderScenarios >= 100,
        `Expected at least 100 suicidal swap scenarios tested, verified ${testedBlunderScenarios}`
      );
      console.log(
        `\n[Empirical Blunder Immunity] Tested ${testedBlunderScenarios} suicidal swap positions: 0 blunders!` +
        ` (Placements: ${placementChosen}, Shatters: ${shatterChosen}, Safe Swaps: ${safeSwapChosen})`
      );
    });
  });

  // ==========================================================================
  // 3. GHOST MODE 150 DEEP SIMULATED GAMES STRESS HARNESS
  // ==========================================================================
  describe('3. Ghost Mode 150 Deep Simulated Games Stress Harness', () => {

    it('should complete 150 deep Ghost games across all match pairings with 0 FIFO violations and 0 hangs', async () => {
      const hardP1 = new HardAi({ randomTieBreak: true });
      const hardP2 = new HardAi({ randomTieBreak: true });
      const mediumP1 = new MediumAi();
      const mediumP2 = new MediumAi();
      const easy = new EasyAi({ mistakeRate: 0.5 });

      let totalGames = 0;
      let fifoViolations = 0;
      let queueMismatchViolations = 0;
      let slowMoveViolations = 0;
      let nullMoveViolations = 0;
      let maxTurnsReached = 0;

      const pairings = [
        { p1: hardP1, p2: hardP2, count: 50, name: 'Hard vs Hard' },
        { p1: hardP1, p2: mediumP2, count: 35, name: 'Hard vs Medium' },
        { p1: mediumP1, p2: hardP2, count: 35, name: 'Medium vs Hard' },
        { p1: mediumP1, p2: mediumP2, count: 20, name: 'Medium vs Medium' },
        { p1: hardP1, p2: easy, count: 10, name: 'Hard vs Easy' }
      ];

      const startTotal = performance.now();

      for (const pairing of pairings) {
        for (let g = 0; g < pairing.count; g++) {
          let state = createInitialState({ mode: MODES.GHOST, maxGhostTurns: 80 });
          let turns = 0;

          while (state.status === STATUS.PLAYING && turns < 80) {
            const activeAi = state.currentTurn === PLAYERS.P1 ? pairing.p1 : pairing.p2;

            const t0 = performance.now();
            const move = await activeAi.computeMove(state);
            const dt = performance.now() - t0;

            if (dt > 350) {
              slowMoveViolations++;
            }

            if (!move) {
              nullMoveViolations++;
              break;
            }

            // Record oldest marks before move to verify FIFO eviction
            const activePlayer = state.currentTurn;
            const activeQueueBefore = activePlayer === PLAYERS.P1 ? [...state.p1Queue] : [...state.p2Queue];
            const willEvictOldest = activeQueueBefore.length === 3;
            const expectedEvictedCell = willEvictOldest ? activeQueueBefore[0] : null;

            state = gameReducer(state, move);
            turns++;

            // FIFO Invariant 1: Board marks <= 3 per player
            const p1BoardMarks = state.board.filter(c => c === PLAYERS.P1).length;
            const p2BoardMarks = state.board.filter(c => c === PLAYERS.P2).length;
            if (p1BoardMarks > 3 || p2BoardMarks > 3) {
              fifoViolations++;
            }

            // FIFO Invariant 2: Queue lengths <= 3
            if (state.p1Queue.length > 3 || state.p2Queue.length > 3) {
              fifoViolations++;
            }

            // FIFO Invariant 3: FIFO Queue Eviction Integrity
            if (willEvictOldest && expectedEvictedCell !== move.index) {
              // The oldest cell must be cleared (unless active player placed right on that cell)
              if (state.board[expectedEvictedCell] === activePlayer) {
                fifoViolations++;
              }
            }

            // FIFO Invariant 4: Exact correlation between queues and board cells
            for (const idx of state.p1Queue) {
              if (state.board[idx] !== PLAYERS.P1) {
                queueMismatchViolations++;
              }
            }
            for (const idx of state.p2Queue) {
              if (state.board[idx] !== PLAYERS.P2) {
                queueMismatchViolations++;
              }
            }
          }

          if (turns > maxTurnsReached) {
            maxTurnsReached = turns;
          }
          totalGames++;
        }
      }

      const totalElapsed = performance.now() - startTotal;

      console.log(
        `\n[Ghost Stress Harness] Completed ${totalGames} deep simulated games in ${totalElapsed.toFixed(2)}ms.` +
        ` (Max turns: ${maxTurnsReached}, Slow moves >350ms: ${slowMoveViolations}, FIFO violations: ${fifoViolations})`
      );

      assert.equal(totalGames, 150, `Expected 150 completed games, got ${totalGames}`);
      assert.equal(fifoViolations, 0, `FIFO decay violated ${fifoViolations} times`);
      assert.equal(queueMismatchViolations, 0, `Queue mismatch observed ${queueMismatchViolations} times`);
      assert.equal(nullMoveViolations, 0, `Null moves observed ${nullMoveViolations} times`);
      assert.equal(slowMoveViolations, 0, `Moves exceeding 350ms observed ${slowMoveViolations} times`);
    });
  });

  // ==========================================================================
  // 4. TACTICAL OVERDRIVE LEGALITY & CONTRACT INVARIANTS
  // ==========================================================================
  describe('4. Tactical Overdrive Legality & Contract Invariants', () => {

    it('Medium AI never chooses an invalid action type or out-of-bounds target in Tactical mode', async () => {
      const mediumAi = new MediumAi();
      let seed = 12345;
      const rng = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };

      for (let i = 0; i < 100; i++) {
        // Random board
        const board = Array(9).fill(null);
        const p1Count = Math.floor(rng() * 4);
        const p2Count = Math.floor(rng() * 4);

        const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => rng() - 0.5);
        for (let j = 0; j < p1Count; j++) board[cells[j]] = PLAYERS.P1;
        for (let j = p1Count; j < p1Count + p2Count; j++) board[cells[j]] = PLAYERS.P2;

        const state = {
          ...createInitialState({ mode: MODES.TACTICAL }),
          board: Object.freeze(board),
          currentTurn: PLAYERS.P2,
          turnCount: p1Count + p2Count,
          abilities: Object.freeze({
            p1: Object.freeze({ shatter: Math.floor(rng() * 2), swap: Math.floor(rng() * 2) }),
            p2: Object.freeze({ shatter: Math.floor(rng() * 2), swap: Math.floor(rng() * 2) })
          })
        };

        const move = await mediumAi.computeMove(state);
        if (!move) continue;

        if (move.type === ACTION_TYPES.PLACE_MARK) {
          assert.equal(state.board[move.index], null, 'PLACE_MARK must target an empty cell');
          assert.ok(move.index >= 0 && move.index <= 8, 'PLACE_MARK index must be 0-8');
        } else if (move.type === ACTION_TYPES.USE_SHATTER) {
          assert.equal(state.board[move.targetIndex], PLAYERS.P1, 'USE_SHATTER must target an opponent mark');
          assert.ok(state.abilities.p2.shatter > 0, 'USE_SHATTER requires positive shatter charge');
        } else if (move.type === ACTION_TYPES.USE_SWAP) {
          assert.ok(state.abilities.p2.swap > 0, 'USE_SWAP requires positive swap charge');
          const markA = state.board[move.indexA];
          const markB = state.board[move.indexB];
          assert.ok(
            (markA === PLAYERS.P2 && markB === PLAYERS.P1) || (markA === PLAYERS.P1 && markB === PLAYERS.P2),
            'USE_SWAP must swap a friendly mark and an opponent mark'
          );
        } else {
          assert.fail(`Unknown action type: ${move.type}`);
        }
      }
    });

    it('Medium AI returns null when options.isCancelled returns true in Tactical mode', async () => {
      const mediumAi = new MediumAi();
      const state = createInitialState({ mode: MODES.TACTICAL });
      const move = await mediumAi.computeMove(state, { isCancelled: () => true });
      assert.equal(move, null, 'Must return null on cancellation');
    });
  });
});
