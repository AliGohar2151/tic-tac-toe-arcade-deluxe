/**
 * @file mechanics.test.js
 * @description Comprehensive tests for Chrono Ghost FIFO decay, mark aging, and Tactical Overdrive abilities.
 * Native Node.js test runner (node:test, node:assert/strict).
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
import {
  gameReducer,
  validateAction,
  getMarkAge,
  getExpiringMark,
  getAvailableMoves
} from '../src/core/gameReducer.js';

describe('Chrono Ghost Mode Mechanics', () => {
  it('should enforce strict FIFO eviction when 4th mark is placed', () => {
    let state = createInitialState({ mode: MODES.GHOST });

    // P1 places 3 marks: 0, 1, 6
    // P2 places 3 marks: 3, 4, 7
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 });

    assert.deepEqual([...state.p1Queue], [0, 1, 6]);
    assert.deepEqual([...state.p2Queue], [3, 4, 7]);
    assert.equal(state.board[0], PLAYERS.P1);
    assert.equal(state.lastEviction, null);

    // P1 places 4th mark at index 8. Cell 0 should evaporate!
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });

    assert.equal(state.board[0], null); // Evicted!
    assert.equal(state.board[8], PLAYERS.P1);
    assert.deepEqual([...state.p1Queue], [1, 6, 8]);
    assert.equal(state.p1Queue.length, 3);
    assert.deepEqual(state.lastEviction, { player: PLAYERS.P1, index: 0 });
  });

  it('should evict oldest piece strictly BEFORE checking win condition', () => {
    let state = createInitialState({ mode: MODES.GHOST });

    // P1 has [0, 1, 6].
    // If P1 places at 2 WITHOUT eviction, [0, 1, 2] would hallucinate a Row 0 win.
    // But with eviction, 0 disappears, leaving [1, 6, 2] which is NOT a win!
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 });

    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });

    assert.equal(state.board[0], null); // Cell 0 evicted
    assert.equal(state.board[2], PLAYERS.P1);
    assert.equal(state.winner, null); // NO false win!
    assert.equal(state.status, STATUS.PLAYING);
  });

  it('should detect legitimate 3-in-a-row win in Ghost mode after eviction', () => {
    let state = createInitialState({ mode: MODES.GHOST });

    // P1 marks placed: 6, then 1, then 4. (Col 1 is 1, 4, 7).
    // P1 places at 7: 6 evaporates, leaving [1, 4, 7] -> legitimate win!
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 8 });

    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 7 });

    assert.equal(state.board[6], null); // Cell 6 evaporated
    assert.equal(state.winner, PLAYERS.P1);
    assert.deepEqual(state.winningLine, [1, 4, 7]);
    assert.equal(state.status, STATUS.ROUND_OVER);
  });

  it('should accurately report mark aging hierarchy (1, 2, 3)', () => {
    let state = createInitialState({ mode: MODES.GHOST });

    // P1 places at 0
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    assert.equal(getMarkAge(state, 0), 1);
    assert.equal(getExpiringMark(state, PLAYERS.P1), null);

    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });

    // P1 places at 1 (queue: [0, 1])
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    assert.equal(getMarkAge(state, 0), 2);
    assert.equal(getMarkAge(state, 1), 1);
    assert.equal(getExpiringMark(state, PLAYERS.P1), null);

    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });

    // P1 places at 2 (queue: [0, 1, 2])
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });
    assert.equal(getMarkAge(state, 0), 3); // Critical! Oldest
    assert.equal(getMarkAge(state, 1), 2);
    assert.equal(getMarkAge(state, 2), 1);
    assert.equal(getExpiringMark(state, PLAYERS.P1), 0);
  });

  it('should allow re-occupying an evicted cell on subsequent turns', () => {
    let state = createInitialState({ mode: MODES.GHOST });

    // P1: 0, 1, 6. P2: 3, 4, 7. P1 plays 8 (cell 0 evicts).
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });

    assert.equal(state.board[0], null);

    // P2 can legally play in cell 0 now
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    assert.equal(state.board[0], PLAYERS.P2);
  });

  it('should terminate with draw when turn limit is reached in Ghost mode', () => {
    let state = createInitialState({ mode: MODES.GHOST, maxGhostTurns: 6 });

    // Alternate harmless moves until turn 6
    const moves = [
      { p: PLAYERS.P1, idx: 0 },
      { p: PLAYERS.P2, idx: 3 },
      { p: PLAYERS.P1, idx: 1 },
      { p: PLAYERS.P2, idx: 4 },
      { p: PLAYERS.P1, idx: 6 },
      { p: PLAYERS.P2, idx: 8 } // Turn 6
    ];

    for (const m of moves) {
      state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: m.p, index: m.idx });
    }

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, 'draw');
    assert.equal(state.turnCount, 6);
  });
});

describe('Tactical Overdrive Mode Mechanics', () => {
  it('should initialize 1 shatter and 1 swap charge per player', () => {
    const state = createInitialState({ mode: MODES.TACTICAL });
    assert.equal(state.abilities.p1.shatter, 1);
    assert.equal(state.abilities.p1.swap, 1);
    assert.equal(state.abilities.p2.shatter, 1);
    assert.equal(state.abilities.p2.swap, 1);
  });

  it('should allow Shatter to destroy opponent mark, deduct charge, and pass turn', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    // P1 places at 0, P2 places at 4
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    assert.equal(state.board[4], PLAYERS.P2);
    assert.deepEqual([...state.p2Queue], [4]);

    // P1 uses Shatter on cell 4
    state = gameReducer(state, {
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 4
    });

    assert.equal(state.board[4], null); // Cell destroyed
    assert.deepEqual([...state.p2Queue], []); // Removed from queue
    assert.equal(state.abilities.p1.shatter, 0); // Charge consumed
    assert.equal(state.currentTurn, PLAYERS.P2); // Turn passed to P2
    assert.equal(state.turnCount, 3);
  });

  it('should reject Shatter if targeting empty cell or friendly mark', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });

    // P1 tries to shatter empty cell 5
    const valEmpty = validateAction(state, {
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 5
    });
    assert.equal(valEmpty.valid, false);
    assert.equal(valEmpty.code, 'INVALID_TARGET');

    // P1 tries to shatter friendly cell 0
    const valFriendly = validateAction(state, {
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 0
    });
    assert.equal(valFriendly.valid, false);
    assert.equal(valFriendly.code, 'INVALID_TARGET');
  });

  it('should reject Shatter when charges are exhausted', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });

    // P1 uses shatter
    state = gameReducer(state, {
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 4
    });
    assert.equal(state.abilities.p1.shatter, 0);

    // P2 plays at 4
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });

    // P1 tries to use shatter again
    const valSecond = validateAction(state, {
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 4
    });
    assert.equal(valSecond.valid, false);
    assert.equal(valSecond.code, 'NO_CHARGES_REMAINING');
  });

  it('should allow Phase Swap on adjacent friendly and opponent marks', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    // P1 places at 4 (center), P2 places at 1 (top-center, adjacent to 4)
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

    // P1 uses Phase Swap between 4 and 1
    state = gameReducer(state, {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 4,
      indexB: 1
    });

    assert.equal(state.board[4], PLAYERS.P2);
    assert.equal(state.board[1], PLAYERS.P1);
    assert.deepEqual([...state.p1Queue], [1]);
    assert.deepEqual([...state.p2Queue], [4]);
    assert.equal(state.abilities.p1.swap, 0);
    assert.equal(state.currentTurn, PLAYERS.P2);
  });

  it('should reject Phase Swap on non-adjacent cells', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    // P1 places at 0, P2 places at 8 (opposite corners, non-adjacent)
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 8 });

    const val = validateAction(state, {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 0,
      indexB: 8
    });

    assert.equal(val.valid, false);
    assert.equal(val.code, 'CELLS_NOT_ADJACENT');
  });

  it('should reject Phase Swap if cells do not contain 1 friendly and 1 enemy mark', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    // P1 places at 0, P2 places at 1
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

    // Try swapping with empty cell 3
    const valEmpty = validateAction(state, {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 0,
      indexB: 3
    });
    assert.equal(valEmpty.valid, false);
    assert.equal(valEmpty.code, 'INVALID_SWAP_TARGETS');
  });

  it('should detect win produced by Phase Swap alignment', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    // Set up board where P1 has 0 and 2, P2 has 1, P1 has 4.
    // Swapping 4 and 1 will put P1 at 1 -> Row 0 win [0, 1, 2]!
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 8 });

    // P1 uses Swap on 4 and 1
    state = gameReducer(state, {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 4,
      indexB: 1
    });

    assert.equal(state.board[1], PLAYERS.P1);
    assert.equal(state.board[4], PLAYERS.P2);
    assert.equal(state.winner, PLAYERS.P1);
    assert.deepEqual(state.winningLine, [0, 1, 2]);
    assert.equal(state.status, STATUS.ROUND_OVER);
  });

  it('should award win to opponent if Phase Swap creates opponent 3-in-a-row (blunder)', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });

    // Set up where P2 has 0 and 2, P1 has 1, P2 has 4.
    // If P1 swaps 1 with 4, P2 gets [0, 1, 2]!
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 7 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });

    // P1 blunders by swapping friendly 1 with enemy 4
    state = gameReducer(state, {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 1,
      indexB: 4
    });

    assert.equal(state.board[1], PLAYERS.P2);
    assert.equal(state.winner, PLAYERS.P2);
    assert.deepEqual(state.winningLine, [0, 1, 2]);
    assert.equal(state.status, STATUS.ROUND_OVER);
  });

  it('should reject tactical abilities in Classic and Ghost modes', () => {
    const classicState = createInitialState({ mode: MODES.CLASSIC });
    const ghostState = createInitialState({ mode: MODES.GHOST });

    const shatterAction = {
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 4
    };

    assert.equal(validateAction(classicState, shatterAction).code, 'MODE_DISALLOWS_ABILITY');
    assert.equal(validateAction(ghostState, shatterAction).code, 'MODE_DISALLOWS_ABILITY');

    const swapAction = {
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 0,
      indexB: 1
    };

    assert.equal(validateAction(classicState, swapAction).code, 'MODE_DISALLOWS_ABILITY');
    assert.equal(validateAction(ghostState, swapAction).code, 'MODE_DISALLOWS_ABILITY');
  });

  it('should include tactical abilities in getAvailableMoves when charges exist', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });

    const moves = getAvailableMoves(state);
    const shatterMoves = moves.filter(m => m.type === ACTION_TYPES.USE_SHATTER);
    const swapMoves = moves.filter(m => m.type === ACTION_TYPES.USE_SWAP);

    assert.equal(shatterMoves.length, 1);
    assert.equal(shatterMoves[0].targetIndex, 1);

    assert.equal(swapMoves.length, 1);
    assert.equal(swapMoves[0].indexA, 4);
    assert.equal(swapMoves[0].indexB, 1);
  });
});
