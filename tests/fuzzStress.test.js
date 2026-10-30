/**
 * @file fuzzStress.test.js
 * @description Adversarial property-based fuzzing and stress harness for Chrono-Tic-Tac-Toe.
 * Tests:
 * 1. Deep referential immutability across frozen state snapshots before and after invalid moves.
 * 2. Chrono Ghost FIFO invariants (board marks <= 3, win detection never evaluated with 4 marks, queue sync).
 * 3. Tactical Overdrive invariants (charges, mode restrictions, blunder win detection, target validation).
 * 4. 1000+ simulated property-based fuzz games across Classic, Ghost, and Tactical modes with interleaved adversarial invalid actions.
 * 5. Combinatorial and mathematical ground-truth oracles:
 *    - All 81 cell pairs verified against Chebyshev distance formula.
 *    - All 19,683 possible 3x3 board states verified against independent combinatorial win oracle.
 *    - Serialization round-trip idempotency across arbitrary game snapshots.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  WINNING_LINES,
  areAdjacent,
  areCellsAdjacent,
  createInitialState,
  cloneState,
  serializeState,
  deserializeState
} from '../src/core/types.js';
import {
  gameReducer,
  validateAction,
  checkWin,
  checkDraw,
  getAvailableMoves,
  getMarkAge,
  getExpiringMark
} from '../src/core/gameReducer.js';

// Deep immutability verification helper
function assertDeeplyFrozen(obj, path = 'state') {
  assert.ok(
    Object.isFrozen(obj),
    `Expected ${path} to be frozen, but Object.isFrozen returned false`
  );
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        assertDeeplyFrozen(value, `${path}.${key}`);
      }
    }
  }
}

// Generate guaranteed-invalid adversarial actions against current state
function generateGuaranteedInvalidAction(state) {
  const opp = state.currentTurn === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;
  const choice = Math.floor(Math.random() * 8);

  switch (choice) {
    case 0:
      // Wrong player out of turn
      return { type: ACTION_TYPES.PLACE_MARK, player: opp, index: 0 };
    case 1:
      // Negative out of bounds index
      return { type: ACTION_TYPES.PLACE_MARK, player: state.currentTurn, index: -1 };
    case 2:
      // High out of bounds index
      return { type: ACTION_TYPES.PLACE_MARK, player: state.currentTurn, index: 9 };
    case 3: {
      // Placement on an already occupied cell
      const occupiedIdx = state.board.findIndex(c => c !== null);
      if (occupiedIdx !== -1) {
        return { type: ACTION_TYPES.PLACE_MARK, player: state.currentTurn, index: occupiedIdx };
      }
      return { type: ACTION_TYPES.PLACE_MARK, player: opp, index: 0 };
    }
    case 4: {
      // Shatter on friendly mark or empty cell
      const friendlyIdx = state.board.findIndex(c => c === state.currentTurn);
      if (friendlyIdx !== -1) {
        return { type: ACTION_TYPES.USE_SHATTER, player: state.currentTurn, targetIndex: friendlyIdx };
      }
      const emptyIdx = state.board.findIndex(c => c === null);
      return { type: ACTION_TYPES.USE_SHATTER, player: state.currentTurn, targetIndex: emptyIdx !== -1 ? emptyIdx : 0 };
    }
    case 5:
      // Swap on identical indices
      return { type: ACTION_TYPES.USE_SWAP, player: state.currentTurn, indexA: 0, indexB: 0 };
    case 6:
      // Swap on non-adjacent cells (opposite corners 0 and 8 are never adjacent)
      return { type: ACTION_TYPES.USE_SWAP, player: state.currentTurn, indexA: 0, indexB: 8 };
    case 7:
    default:
      return { type: 'MALFORMED_UNRECOGNIZED_ACTION', player: state.currentTurn };
  }
}

describe('Adversarial Oracle 1: Referential Immutability & Deep Freeze Enforcement', () => {
  it('should enforce deep freezing across all initial state configurations', () => {
    const modes = [MODES.CLASSIC, MODES.GHOST, MODES.TACTICAL];
    for (const mode of modes) {
      const state = createInitialState({ mode, isBlitz: true });
      assertDeeplyFrozen(state, `initialState(${mode})`);

      // Attempt manual mutation and verify TypeError
      assert.throws(() => { state.currentTurn = 'mutated'; }, TypeError);
      assert.throws(() => { state.board[0] = 'p1'; }, TypeError);
      assert.throws(() => { state.p1Queue.push(0); }, TypeError);
      assert.throws(() => { state.p2Queue.push(1); }, TypeError);
      assert.throws(() => { state.abilities.p1.shatter = 99; }, TypeError);
      assert.throws(() => { state.abilities.p2.swap = 99; }, TypeError);
      assert.throws(() => { state.moveHistory.push({ type: 'HACK' }); }, TypeError);
      assert.throws(() => { state.blitz.timeLeft = 0; }, TypeError);
      assert.throws(() => { state.meta.aiDifficulty = 'cheater'; }, TypeError);
    }
  });

  it('should preserve referential identity (newState === state) and remain frozen after varied invalid moves', () => {
    const testCases = [
      { mode: MODES.CLASSIC },
      { mode: MODES.GHOST },
      { mode: MODES.TACTICAL }
    ];

    for (const tc of testCases) {
      let state = createInitialState(tc);

      // Perform one valid move so board is non-empty
      state = gameReducer(state, {
        type: ACTION_TYPES.PLACE_MARK,
        player: PLAYERS.P1,
        index: 4
      });
      assertDeeplyFrozen(state);

      const invalidActions = [
        // Out of turn player
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 },
        { type: ACTION_TYPES.PLACE_MARK, player: 'p3', index: 0 },
        { type: ACTION_TYPES.PLACE_MARK, player: null, index: 0 },
        { type: ACTION_TYPES.PLACE_MARK, player: undefined, index: 0 },

        // Already occupied cell (4 is occupied by P1)
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 },

        // Out of bounds cell index
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: -1 },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 9 },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 100 },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1.5 },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: NaN },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: Infinity },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: '4' },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: null },
        { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: undefined },

        // Shatter targeting invalid cells / friendly / empty
        { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P2, targetIndex: 0 }, // empty
        { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P2, targetIndex: -1 },
        { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P2, targetIndex: 9 },
        { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P2, targetIndex: 'invalid' },

        // Swap targeting invalid cells
        { type: ACTION_TYPES.USE_SWAP, player: PLAYERS.P2, indexA: 0, indexB: 1 }, // both empty
        { type: ACTION_TYPES.USE_SWAP, player: PLAYERS.P2, indexA: 4, indexB: 4 }, // identical
        { type: ACTION_TYPES.USE_SWAP, player: PLAYERS.P2, indexA: 4, indexB: 8 }, // non-adjacent if 8
        { type: ACTION_TYPES.USE_SWAP, player: PLAYERS.P2, indexA: -1, indexB: 0 },

        // Malformed actions
        null,
        undefined,
        {},
        { type: 'UNKNOWN_TYPE', player: PLAYERS.P2 },
        { type: ACTION_TYPES.PLACE_MARK }, // missing player & index
        { type: ACTION_TYPES.USE_SHATTER }, // missing targetIndex
        { type: ACTION_TYPES.USE_SWAP } // missing indices
      ];

      for (const invalidAction of invalidActions) {
        const snapshotBefore = JSON.stringify(state);
        const nextState = gameReducer(state, invalidAction);

        // Strict referential equality
        assert.equal(
          nextState,
          state,
          `Expected gameReducer to return identical state reference for invalid action ${JSON.stringify(invalidAction)}`
        );

        // Deep freeze integrity
        assertDeeplyFrozen(nextState);

        // Exact snapshot invariance
        assert.equal(
          JSON.stringify(nextState),
          snapshotBefore,
          'State JSON representation mutated after rejected invalid action'
        );

        // validateAction must report invalid
        const validation = validateAction(state, invalidAction);
        assert.equal(validation.valid, false);
      }
    }
  });

  it('should deeply freeze winningLine, lastActionEffect, and moveHistory upon round completion', () => {
    let state = createInitialState({ mode: MODES.CLASSIC });
    // Quick P1 win in Row 0: 0, 3, 1, 4, 2
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, PLAYERS.P1);
    assertDeeplyFrozen(state, 'terminalState');

    // Attempting post-round move must reject and return exact reference
    const postRoundMove = { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 5 };
    const nextState = gameReducer(state, postRoundMove);
    assert.equal(nextState, state);
    assertDeeplyFrozen(nextState);
  });
});

describe('Adversarial Oracle 2: Chrono Ghost Mode Invariants & Decay Semantics', () => {
  it('should maintain strict FIFO invariant: max 3 marks on board per player at all times', () => {
    // Run 50 random games in Ghost mode up to 40 moves each
    for (let sim = 0; sim < 50; sim++) {
      let state = createInitialState({ mode: MODES.GHOST, maxGhostTurns: 40 });

      while (state.status === STATUS.PLAYING && state.turnCount < 40) {
        const available = getAvailableMoves(state);
        if (available.length === 0) break;

        const move = available[Math.floor(Math.random() * available.length)];
        const prevQueue = [...(move.player === PLAYERS.P1 ? state.p1Queue : state.p2Queue)];

        state = gameReducer(state, move);

        // Invariant 1: At no point can either player have >3 marks on the board
        const p1BoardMarks = state.board.filter(c => c === PLAYERS.P1).length;
        const p2BoardMarks = state.board.filter(c => c === PLAYERS.P2).length;
        assert.ok(p1BoardMarks <= 3, `P1 has ${p1BoardMarks} marks on board (exceeds 3) at turn ${state.turnCount}`);
        assert.ok(p2BoardMarks <= 3, `P2 has ${p2BoardMarks} marks on board (exceeds 3) at turn ${state.turnCount}`);

        // Invariant 2: Queue length must equal mark count on board
        assert.equal(state.p1Queue.length, p1BoardMarks, 'P1 queue length does not match board mark count');
        assert.equal(state.p2Queue.length, p2BoardMarks, 'P2 queue length does not match board mark count');

        // Invariant 3: Queue items must match exact board positions
        for (const idx of state.p1Queue) {
          assert.equal(state.board[idx], PLAYERS.P1, `Cell ${idx} in p1Queue is not P1 on board`);
        }
        for (const idx of state.p2Queue) {
          assert.equal(state.board[idx], PLAYERS.P2, `Cell ${idx} in p2Queue is not P2 on board`);
        }

        // Invariant 4: If eviction occurred, check that oldest mark evaporated
        if (prevQueue.length === 3) {
          assert.ok(state.lastEviction !== null, 'Expected lastEviction to be populated when placing 4th mark');
          assert.equal(state.lastEviction.player, move.player);
          assert.equal(state.lastEviction.index, prevQueue[0]);
          assert.equal(state.board[prevQueue[0]] !== move.player || prevQueue[0] === move.index, true);
        }

        // Invariant 5: State must remain deeply frozen
        assertDeeplyFrozen(state);
      }
    }
  });

  it('should verify win detection in Ghost mode is never evaluated with 4 marks', () => {
    // Specifically construct the exact hallucination scenario from the baseline:
    // P1 marks: 0, 1, 6.
    // If 4th mark placed at 2 without prior eviction, [0, 1, 2] would form a row.
    // But with strict eviction, 0 evicts first, leaving [1, 6, 2] -> not a win!
    let state = createInitialState({ mode: MODES.GHOST });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 }); // P1: [0]
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 }); // P2: [3]
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 }); // P1: [0, 1]
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 }); // P2: [3, 4]
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 }); // P1: [0, 1, 6]
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 }); // P2: [3, 4, 7]

    // P1 attempts to place at 2
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });

    // Cell 0 MUST be null, P1 has marks at [1, 6, 2], winner must be null
    assert.equal(state.board[0], null, 'Oldest mark at index 0 failed to evict before win check');
    assert.equal(state.board[2], PLAYERS.P1);
    assert.equal(state.winner, null, 'False positive win detected (hallucinated 4-mark line)');
    assert.equal(state.status, STATUS.PLAYING);
    assert.deepEqual([...state.p1Queue], [1, 6, 2]);
    assert.equal(state.p1Queue.length, 3);
  });

  it('should terminate with draw exactly when turnCount reaches maxGhostTurns', () => {
    const maxTurns = 10;
    let state = createInitialState({ mode: MODES.GHOST, maxGhostTurns: maxTurns });

    // Play 10 valid non-winning moves:
    const plannedMoves = [
      { p: PLAYERS.P1, idx: 0 },
      { p: PLAYERS.P2, idx: 3 },
      { p: PLAYERS.P1, idx: 1 },
      { p: PLAYERS.P2, idx: 4 },
      { p: PLAYERS.P1, idx: 6 },
      { p: PLAYERS.P2, idx: 8 },
      { p: PLAYERS.P1, idx: 5 },
      { p: PLAYERS.P2, idx: 2 },
      { p: PLAYERS.P1, idx: 7 },
      { p: PLAYERS.P2, idx: 0 }
    ];

    for (let i = 0; i < plannedMoves.length; i++) {
      const { p, idx } = plannedMoves[i];
      state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: p, index: idx });
      if (i < maxTurns - 1) {
        assert.equal(state.status, STATUS.PLAYING, `Premature game over at turn ${i + 1}`);
      }
    }

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, 'draw');
    assert.equal(state.turnCount, maxTurns);
  });
});

describe('Adversarial Oracle 3: Tactical Overdrive Mode Invariants & Edge Cases', () => {
  it('should strictly reject Shatter and Phase Swap in Classic and Ghost modes', () => {
    for (const mode of [MODES.CLASSIC, MODES.GHOST]) {
      let state = createInitialState({ mode });
      // P1: 0, P2: 1
      state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
      state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

      // P1 attempts Shatter on cell 1
      const shatterAction = { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P1, targetIndex: 1 };
      const valShatter = validateAction(state, shatterAction);
      assert.equal(valShatter.valid, false);
      assert.equal(valShatter.code, 'MODE_DISALLOWS_ABILITY');
      const stateAfterShatter = gameReducer(state, shatterAction);
      assert.equal(stateAfterShatter, state);

      // P1 attempts Phase Swap between 0 and 1
      const swapAction = { type: ACTION_TYPES.USE_SWAP, player: PLAYERS.P1, indexA: 0, indexB: 1 };
      const valSwap = validateAction(state, swapAction);
      assert.equal(valSwap.valid, false);
      assert.equal(valSwap.code, 'MODE_DISALLOWS_ABILITY');
      const stateAfterSwap = gameReducer(state, swapAction);
      assert.equal(stateAfterSwap, state);
    }
  });

  it('should strictly enforce single-use charges for Shatter and Phase Swap', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    // P1: 0, P2: 1
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

    // P1 shatters cell 1
    state = gameReducer(state, { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P1, targetIndex: 1 });
    assert.equal(state.abilities.p1.shatter, 0);
    assert.equal(state.currentTurn, PLAYERS.P2);

    // P2 plays at 1
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

    // P1 attempts second Shatter on cell 1
    const secondShatter = { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P1, targetIndex: 1 };
    const valSecond = validateAction(state, secondShatter);
    assert.equal(valSecond.valid, false);
    assert.equal(valSecond.code, 'NO_CHARGES_REMAINING');
    assert.equal(gameReducer(state, secondShatter), state);

    // P1 uses Phase Swap between 0 and 1
    state = gameReducer(state, { type: ACTION_TYPES.USE_SWAP, player: PLAYERS.P1, indexA: 0, indexB: 1 });
    assert.equal(state.abilities.p1.swap, 0);
    assert.equal(state.currentTurn, PLAYERS.P2);

    // P2 plays at 2
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 2 });

    // P1 attempts second Swap
    const secondSwap = { type: ACTION_TYPES.USE_SWAP, player: PLAYERS.P1, indexA: 1, indexB: 0 };
    const valSecondSwap = validateAction(state, secondSwap);
    assert.equal(valSecondSwap.valid, false);
    assert.equal(valSecondSwap.code, 'NO_CHARGES_REMAINING');
    assert.equal(gameReducer(state, secondSwap), state);
  });

  it('should correctly handle simultaneous win alignment in Phase Swap (active player priority)', () => {
    // Construct scenario where swapping cell 4 (P1) and cell 1 (P2)
    // simultaneously completes Row 0 for P1 [0, 1, 2] AND Row 1 for P2 [3, 4, 5]
    let state = createInitialState({ mode: MODES.TACTICAL });

    // Setup moves:
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 5 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

    // P1's turn! P1 swaps 4 and 1!
    state = gameReducer(state, {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 4,
      indexB: 1
    });

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, PLAYERS.P1, 'Active player initiating swap should be awarded win');
    assert.deepEqual(state.winningLine, [0, 1, 2]);
    assertDeeplyFrozen(state);
  });

  it('should detect blunder win awarded to opponent when Phase Swap only completes opponent line', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });

    // P1's turn! P1 blunders by swapping friendly 1 with enemy 4
    state = gameReducer(state, {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 1,
      indexB: 4
    });

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, PLAYERS.P2, 'Blunder swap must award victory to opponent');
    assert.deepEqual(state.winningLine, [0, 1, 2]);
    assertDeeplyFrozen(state);
  });
});

describe('Adversarial Oracle 4: Property-Based Fuzzing Across 1000 Simulated Games', () => {
  it('should maintain all game invariants and immutability across 1000 randomized games with adversarial noise', () => {
    const TOTAL_GAMES = 1000;
    const modeDistribution = [
      { mode: MODES.CLASSIC, count: 350 },
      { mode: MODES.GHOST, count: 350 },
      { mode: MODES.TACTICAL, count: 300 }
    ];

    let gamesPlayed = 0;
    let totalValidMoves = 0;
    let totalAdversarialInjections = 0;
    let winsP1 = 0;
    let winsP2 = 0;
    let draws = 0;

    for (const { mode, count } of modeDistribution) {
      for (let g = 0; g < count; g++) {
        gamesPlayed++;
        let state = createInitialState({
          mode,
          startingPlayer: g % 2 === 0 ? PLAYERS.P1 : PLAYERS.P2,
          maxGhostTurns: 30
        });

        assertDeeplyFrozen(state);

        let turnSafetyCounter = 0;
        const maxTurnsAllowed = mode === MODES.GHOST ? 35 : 20;

        while (state.status === STATUS.PLAYING && turnSafetyCounter < maxTurnsAllowed) {
          turnSafetyCounter++;

          // 30% chance to inject a guaranteed adversarial invalid action before the legal move
          if (Math.random() < 0.3) {
            totalAdversarialInjections++;
            const badAction = generateGuaranteedInvalidAction(state);

            const validation = validateAction(state, badAction);
            assert.equal(validation.valid, false, `Expected action ${JSON.stringify(badAction)} to be invalid`);

            const snapBefore = JSON.stringify(state);
            const stateAfterBad = gameReducer(state, badAction);
            assert.equal(stateAfterBad, state, 'Invalid action must return identical state reference');
            assert.equal(JSON.stringify(stateAfterBad), snapBefore);
            assertDeeplyFrozen(stateAfterBad);
          }

          // Pick a random legal move from getAvailableMoves
          const legalMoves = getAvailableMoves(state);
          if (legalMoves.length === 0) {
            break;
          }

          const chosenMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
          const prevTurn = state.currentTurn;
          const prevTurnCount = state.turnCount;
          const prevMoveHistoryLen = state.moveHistory.length;

          // Execute legal move
          const nextState = gameReducer(state, chosenMove);
          totalValidMoves++;

          // Assertions on valid state transition:
          assert.notEqual(nextState, state, 'Valid move must produce a new state reference');
          assert.equal(nextState.turnCount, prevTurnCount + 1, 'turnCount must increment by 1');
          assert.equal(nextState.moveHistory.length, prevMoveHistoryLen + 1, 'moveHistory must grow by 1');
          assertDeeplyFrozen(nextState);

          // Mode-specific assertions:
          if (mode === MODES.GHOST) {
            const p1Marks = nextState.board.filter(c => c === PLAYERS.P1).length;
            const p2Marks = nextState.board.filter(c => c === PLAYERS.P2).length;
            assert.ok(p1Marks <= 3, `Ghost mode P1 exceeded 3 marks (${p1Marks})`);
            assert.ok(p2Marks <= 3, `Ghost mode P2 exceeded 3 marks (${p2Marks})`);
            assert.equal(nextState.p1Queue.length, p1Marks);
            assert.equal(nextState.p2Queue.length, p2Marks);
          } else if (mode === MODES.TACTICAL) {
            // Charges must never go negative or exceed initial
            assert.ok(nextState.abilities.p1.shatter >= 0 && nextState.abilities.p1.shatter <= 1);
            assert.ok(nextState.abilities.p1.swap >= 0 && nextState.abilities.p1.swap <= 1);
            assert.ok(nextState.abilities.p2.shatter >= 0 && nextState.abilities.p2.shatter <= 1);
            assert.ok(nextState.abilities.p2.swap >= 0 && nextState.abilities.p2.swap <= 1);
          }

          // Winner / Draw consistency
          if (nextState.status === STATUS.ROUND_OVER) {
            assert.ok(
              nextState.winner === PLAYERS.P1 || nextState.winner === PLAYERS.P2 || nextState.winner === 'draw',
              `Invalid winner in terminal state: ${nextState.winner}`
            );
            if (nextState.winner !== 'draw') {
              assert.ok(Array.isArray(nextState.winningLine) && nextState.winningLine.length === 3);
            }
            // Available moves in terminal state must be empty
            assert.equal(getAvailableMoves(nextState).length, 0);
          } else {
            assert.equal(nextState.status, STATUS.PLAYING);
            assert.notEqual(nextState.currentTurn, prevTurn, 'Turn must alternate on valid move');
          }

          state = nextState;
        }

        // Tally outcomes
        if (state.winner === PLAYERS.P1) winsP1++;
        else if (state.winner === PLAYERS.P2) winsP2++;
        else if (state.winner === 'draw') draws++;
      }
    }

    assert.equal(gamesPlayed, TOTAL_GAMES, 'All 1000 simulated games must complete');
    assert.ok(totalValidMoves > 5000, `Expected >5000 total valid moves across 1000 games, got ${totalValidMoves}`);
    assert.ok(totalAdversarialInjections > 1000, `Expected >1000 adversarial injections, got ${totalAdversarialInjections}`);
    assert.ok(winsP1 > 0, 'P1 must record at least one win');
    assert.ok(winsP2 > 0, 'P2 must record at least one win');
    assert.ok(draws > 0, 'At least one draw must be recorded');
  });
});

describe('Adversarial Oracle 5: Mathematical & Combinatorial Ground-Truth Oracles', () => {
  it('should verify areAdjacent against 3x3 Chebyshev metric across all 81 coordinate pairs', () => {
    for (let a = 0; a < 9; a++) {
      for (let b = 0; b < 9; b++) {
        const ra = Math.floor(a / 3);
        const ca = a % 3;
        const rb = Math.floor(b / 3);
        const cb = b % 3;
        const chebyshev = Math.max(Math.abs(ra - rb), Math.abs(ca - cb));
        const expected = a !== b && chebyshev === 1;

        assert.equal(
          areAdjacent(a, b),
          expected,
          `areAdjacent(${a}, ${b}) gave ${areAdjacent(a, b)}, expected ${expected}`
        );
        assert.equal(
          areCellsAdjacent(a, b),
          expected,
          `areCellsAdjacent(${a}, ${b}) gave ${areCellsAdjacent(a, b)}, expected ${expected}`
        );
      }
    }
  });

  it('should exhaustively verify checkWin on all 19,683 possible 3x3 board states against independent oracle', () => {
    const symbols = [null, PLAYERS.P1, PLAYERS.P2];
    const totalStates = 3 ** 9; // 19,683

    const winCombinations = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
      [0, 4, 8], [2, 4, 6]             // Diagonals
    ];

    function independentOracle(board, targetPlayer = null) {
      if (targetPlayer) {
        for (const line of winCombinations) {
          if (board[line[0]] === targetPlayer &&
              board[line[1]] === targetPlayer &&
              board[line[2]] === targetPlayer) {
            return { winner: targetPlayer, line };
          }
        }
        return { winner: null, line: null };
      }

      for (const p of [PLAYERS.P1, PLAYERS.P2]) {
        for (const line of winCombinations) {
          if (board[line[0]] === p && board[line[1]] === p && board[line[2]] === p) {
            return { winner: p, line };
          }
        }
      }
      return { winner: null, line: null };
    }

    for (let code = 0; code < totalStates; code++) {
      let temp = code;
      const board = new Array(9);
      for (let i = 0; i < 9; i++) {
        board[i] = symbols[temp % 3];
        temp = Math.floor(temp / 3);
      }

      // 1. General checkWin
      const actual = checkWin(board);
      const expected = independentOracle(board);
      assert.equal(actual.winner, expected.winner, `Mismatch at board code ${code}`);
      if (expected.winner !== null) {
        assert.ok(actual.line !== null);
        assert.deepEqual([...actual.line], expected.line);
      } else {
        assert.equal(actual.line, null);
      }

      // 2. Targeted checkWin for P1
      const actualP1 = checkWin(board, PLAYERS.P1);
      const expectedP1 = independentOracle(board, PLAYERS.P1);
      assert.equal(actualP1.winner, expectedP1.winner);

      // 3. Targeted checkWin for P2
      const actualP2 = checkWin(board, PLAYERS.P2);
      const expectedP2 = independentOracle(board, PLAYERS.P2);
      assert.equal(actualP2.winner, expectedP2.winner);
    }
  });

  it('should guarantee serialization round-trip idempotency across arbitrary game snapshots', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.USE_SHATTER, player: PLAYERS.P1, targetIndex: 0 });

    const json1 = serializeState(state);
    const restored1 = deserializeState(json1);
    const json2 = serializeState(restored1);

    assert.equal(json1, json2, 'Serialization must be strictly idempotent');
    assert.deepEqual(restored1.board, state.board);
    assert.deepEqual(restored1.abilities, state.abilities);
    assert.equal(restored1.currentTurn, state.currentTurn);
    assert.equal(restored1.turnCount, state.turnCount);
  });
});
