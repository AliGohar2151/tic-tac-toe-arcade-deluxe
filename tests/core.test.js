/**
 * @file core.test.js
 * @description Comprehensive unit tests for types.js, eventBus.js, and standard core gameReducer logic.
 * Native Node.js test runner (node:test, node:assert/strict).
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYERS,
  MODES,
  STATUS,
  GAME_STATUS,
  ACTION_TYPES,
  EVENT_TYPES,
  GAME_EVENTS,
  WINNING_LINES,
  WINNING_COMBINATIONS,
  ADJACENCY_LIST,
  GHOST_CONFIG,
  TACTICAL_CONFIG,
  BLITZ_CONFIG,
  getOpponent,
  isValidPlayer,
  isValidCellIndex,
  isValidMode,
  areAdjacent,
  areCellsAdjacent,
  getGhostLifespans,
  getGhostAgingMap,
  validateActionSchema,
  createInitialState,
  cloneState,
  serializeState,
  deserializeState
} from '../src/core/types.js';
import { EventBus } from '../src/core/eventBus.js';
import {
  gameReducer,
  validateAction,
  checkWin,
  checkDraw,
  getAvailableMoves
} from '../src/core/gameReducer.js';

describe('1. Types & Constants (src/core/types.js)', () => {
  it('should freeze and preserve immutability of constant tables', () => {
    assert.throws(() => { PLAYERS.P1 = 'p3'; }, TypeError);
    assert.throws(() => { MODES.CLASSIC = 'speed'; }, TypeError);
    assert.throws(() => { STATUS.PLAYING = 'MUTATED'; }, TypeError);
    assert.throws(() => { WINNING_LINES.push([0, 1, 2]); }, TypeError);
    assert.throws(() => { ADJACENCY_LIST[0] = []; }, TypeError);
    assert.throws(() => { GHOST_CONFIG.MAX_MARKS = 5; }, TypeError);
    assert.throws(() => { TACTICAL_CONFIG.INITIAL_CHARGES.shatter = 10; }, TypeError);
  });

  it('should export all 8 valid winning combinations', () => {
    assert.equal(WINNING_LINES.length, 8);
    assert.equal(WINNING_COMBINATIONS, WINNING_LINES);
    assert.deepEqual(WINNING_LINES[0], [0, 1, 2]); // Row 0
    assert.deepEqual(WINNING_LINES[1], [3, 4, 5]); // Row 1
    assert.deepEqual(WINNING_LINES[2], [6, 7, 8]); // Row 2
    assert.deepEqual(WINNING_LINES[3], [0, 3, 6]); // Col 0
    assert.deepEqual(WINNING_LINES[4], [1, 4, 7]); // Col 1
    assert.deepEqual(WINNING_LINES[5], [2, 5, 8]); // Col 2
    assert.deepEqual(WINNING_LINES[6], [0, 4, 8]); // Diag \
    assert.deepEqual(WINNING_LINES[7], [2, 4, 6]); // Diag /
  });

  it('should correctly evaluate adjacency relationships on 3x3 grid', () => {
    // Center cell (4) has 8 adjacent neighbors
    assert.equal(ADJACENCY_LIST[4].length, 8);
    for (let i = 0; i < 9; i++) {
      if (i !== 4) {
        assert.equal(areAdjacent(4, i), true);
        assert.equal(areCellsAdjacent(4, i), true);
      }
    }
    // Identity cell is never adjacent
    assert.equal(areAdjacent(4, 4), false);

    // Corner cell 0 neighbors: 1, 3, 4
    assert.deepEqual([...ADJACENCY_LIST[0]].sort(), [1, 3, 4]);
    assert.equal(areAdjacent(0, 8), false); // Opposite corner is not adjacent
    assert.equal(areAdjacent(0, 2), false); // Opposite row end
    assert.equal(areAdjacent(0, 6), false); // Opposite col end

    // Out of bounds checks
    assert.equal(areAdjacent(-1, 0), false);
    assert.equal(areAdjacent(0, 9), false);
    assert.equal(areAdjacent('a', 0), false);
  });

  it('should validate player, cell index, and mode helper functions', () => {
    assert.equal(isValidPlayer('p1'), true);
    assert.equal(isValidPlayer('p2'), true);
    assert.equal(isValidPlayer('p3'), false);
    assert.equal(isValidPlayer(null), false);

    assert.equal(getOpponent('p1'), 'p2');
    assert.equal(getOpponent('p2'), 'p1');

    assert.equal(isValidCellIndex(0), true);
    assert.equal(isValidCellIndex(8), true);
    assert.equal(isValidCellIndex(-1), false);
    assert.equal(isValidCellIndex(9), false);
    assert.equal(isValidCellIndex(1.5), false);
    assert.equal(isValidCellIndex('0'), false);

    assert.equal(isValidMode('classic'), true);
    assert.equal(isValidMode('ghost'), true);
    assert.equal(isValidMode('tactical'), true);
    assert.equal(isValidMode('turbo'), false);
  });

  it('should compute Ghost lifespans and aging maps accurately', () => {
    const queue = [0, 4, 8];
    const lifespans = getGhostLifespans(queue);
    assert.equal(lifespans.length, 3);
    assert.deepEqual(lifespans[0], { cellIndex: 0, queueIndex: 0, age: 3, isExpiringNext: true });
    assert.deepEqual(lifespans[1], { cellIndex: 4, queueIndex: 1, age: 2, isExpiringNext: false });
    assert.deepEqual(lifespans[2], { cellIndex: 8, queueIndex: 2, age: 1, isExpiringNext: false });

    const map = getGhostAgingMap(queue);
    assert.equal(map[0].age, 3);
    assert.equal(map[0].isExpiringNext, true);
    assert.equal(map[4].age, 2);
    assert.equal(map[8].age, 1);
  });

  it('should validate action schemas statically', () => {
    assert.equal(validateActionSchema(null).valid, false);
    assert.equal(validateActionSchema({ type: 'UNKNOWN' }).valid, false);

    assert.equal(validateActionSchema({
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P1,
      index: 4
    }).valid, true);

    assert.equal(validateActionSchema({
      type: ACTION_TYPES.PLACE_MARK,
      player: 'p3',
      index: 4
    }).valid, false);

    assert.equal(validateActionSchema({
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P1,
      index: 10
    }).valid, false);

    // Shatter
    assert.equal(validateActionSchema({
      type: ACTION_TYPES.USE_SHATTER,
      player: PLAYERS.P1,
      targetIndex: 2
    }).valid, true);

    // Swap
    assert.equal(validateActionSchema({
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 0,
      indexB: 1
    }).valid, true);

    assert.equal(validateActionSchema({
      type: ACTION_TYPES.USE_SWAP,
      player: PLAYERS.P1,
      indexA: 0,
      indexB: 8
    }).valid, false); // Not adjacent
  });

  it('should deep clone, serialize, and deserialize state snapshots', () => {
    const initial = createInitialState({ mode: MODES.TACTICAL });
    const clone = cloneState(initial);

    assert.deepEqual(initial.board, clone.board);
    assert.notEqual(initial.board, clone.board); // Independent array reference

    const json = serializeState(initial);
    assert.equal(typeof json, 'string');

    const restored = deserializeState(json);
    assert.deepEqual(restored.board, initial.board);
    assert.equal(restored.mode, MODES.TACTICAL);

    assert.throws(() => deserializeState('invalid json'), SyntaxError);
    assert.throws(() => deserializeState('{"board": [1,2]}'), Error);
  });
});

describe('2. EventBus Mediator (src/core/eventBus.js)', () => {
  it('should subscribe, emit, and deliver typed events to listeners', () => {
    const bus = new EventBus();
    const calls = [];

    const unsubscribe = bus.subscribe('TEST_EVENT', (payload) => {
      calls.push(payload);
    });

    bus.publish('TEST_EVENT', { val: 1 });
    bus.emit('TEST_EVENT', { val: 2 });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].val, 1);
    assert.equal(calls[1].val, 2);

    unsubscribe();
    bus.publish('TEST_EVENT', { val: 3 });
    assert.equal(calls.length, 2); // No new delivery
  });

  it('should deliver all events to wildcard listeners', () => {
    const bus = new EventBus();
    const wildcardEvents = [];

    bus.subscribe('*', (payload, eventName) => {
      wildcardEvents.push({ eventName, payload });
    });

    bus.emit('EVENT_A', { a: 10 });
    bus.emit('EVENT_B', { b: 20 });

    assert.equal(wildcardEvents.length, 2);
    assert.equal(wildcardEvents[0].eventName, 'EVENT_A');
    assert.equal(wildcardEvents[0].payload.a, 10);
    assert.equal(wildcardEvents[1].eventName, 'EVENT_B');
    assert.equal(wildcardEvents[1].payload.b, 20);
  });

  it('should respect priority ordering among subscribers', () => {
    const bus = new EventBus();
    const order = [];

    bus.subscribe('ORDER_TEST', () => order.push('low'), { priority: 0 });
    bus.subscribe('ORDER_TEST', () => order.push('high'), { priority: 10 });
    bus.subscribe('ORDER_TEST', () => order.push('mid'), { priority: 5 });

    bus.emit('ORDER_TEST');
    assert.deepEqual(order, ['high', 'mid', 'low']);
  });

  it('should auto-unsubscribe once listeners after single execution', () => {
    const bus = new EventBus();
    let count = 0;

    bus.subscribeOnce('ONCE_TEST', () => {
      count++;
    });

    bus.emit('ONCE_TEST');
    bus.emit('ONCE_TEST');
    bus.emit('ONCE_TEST');

    assert.equal(count, 1);
    assert.equal(bus.listenerCount('ONCE_TEST'), 0);
  });

  it('should isolate subscriber errors and invoke custom error handler', () => {
    const errorsHandled = [];
    const bus = new EventBus({
      errorHandler: (err, event) => {
        errorsHandled.push({ event, message: err.message });
      }
    });

    let normalCalled = false;
    bus.subscribe('ERR_TEST', () => {
      throw new Error('Boom in subscriber');
    });
    bus.subscribe('ERR_TEST', () => {
      normalCalled = true;
    });

    const result = bus.publish('ERR_TEST', { foo: 'bar' });
    assert.equal(normalCalled, true);
    assert.equal(result.errors.length, 1);
    assert.equal(errorsHandled.length, 1);
    assert.equal(errorsHandled[0].message, 'Boom in subscriber');
  });

  it('should handle unsubscription and mutation safely during emission snapshot', () => {
    const bus = new EventBus();
    const sequence = [];

    let unsub2;
    bus.subscribe('MUTATE_TEST', () => {
      sequence.push('first');
      unsub2(); // Unsubscribe second while first is executing
    });
    unsub2 = bus.subscribe('MUTATE_TEST', () => {
      sequence.push('second');
    });

    bus.emit('MUTATE_TEST');
    // First executed and unsubscribed second from internal map;
    // But since combined list was snapshotted or handled cleanly:
    assert.ok(sequence.includes('first'));

    // Second emit: second listener is truly removed
    sequence.length = 0;
    bus.emit('MUTATE_TEST');
    assert.deepEqual(sequence, ['first']);
  });

  it('should provide clear, listenerCount, and hasListeners queries', () => {
    const bus = new EventBus();
    const cb = () => {};
    bus.on('A', cb);
    bus.on('A', () => {});
    bus.on('B', cb);

    assert.equal(bus.listenerCount('A'), 2);
    assert.equal(bus.listenerCount('B'), 1);
    assert.equal(bus.listenerCount(), 3);
    assert.equal(bus.hasListeners('A'), true);
    assert.equal(bus.hasListeners('C'), false);

    bus.clear('A');
    assert.equal(bus.hasListeners('A'), false);
    assert.equal(bus.hasListeners('B'), true);

    bus.clear();
    assert.equal(bus.listenerCount(), 0);
  });
});

describe('3. Core Standard Game Logic (src/core/gameReducer.js)', () => {
  it('should initialize clean standard state with P1 turn', () => {
    const state = createInitialState();
    assert.equal(state.mode, MODES.CLASSIC);
    assert.equal(state.status, STATUS.PLAYING);
    assert.equal(state.currentTurn, PLAYERS.P1);
    assert.equal(state.board.length, 9);
    assert.ok(state.board.every(cell => cell === null));
    assert.equal(state.winner, null);
    assert.equal(state.turnCount, 0);
  });

  it('should detect standard win in Row 0 for P1', () => {
    let state = createInitialState();
    // P1: 0, P2: 3, P1: 1, P2: 4, P1: 2 (Row 0 win)
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, PLAYERS.P1);
    assert.deepEqual(state.winningLine, [0, 1, 2]);
    assert.equal(state.turnCount, 5);
  });

  it('should detect standard win in Diagonal for P2', () => {
    let state = createInitialState();
    // P1: 1, P2: 0, P1: 2, P2: 4, P1: 5, P2: 8 (P2 diagonal [0, 4, 8])
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 5 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 8 });

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, PLAYERS.P2);
    assert.deepEqual(state.winningLine, [0, 4, 8]);
  });

  it('should detect standard draw when all 9 cells are filled with no 3-in-a-row', () => {
    // Grid layout:
    // X O X
    // X X O
    // O X O
    // Indices:
    // 0: X, 1: O, 2: X
    // 3: X, 4: X, 5: O
    // 6: O, 7: X, 8: O
    let state = createInitialState();
    const moves = [
      { p: PLAYERS.P1, idx: 0 },
      { p: PLAYERS.P2, idx: 1 },
      { p: PLAYERS.P1, idx: 2 },
      { p: PLAYERS.P2, idx: 5 },
      { p: PLAYERS.P1, idx: 3 },
      { p: PLAYERS.P2, idx: 6 },
      { p: PLAYERS.P1, idx: 4 },
      { p: PLAYERS.P2, idx: 8 },
      { p: PLAYERS.P1, idx: 7 }
    ];

    for (const m of moves) {
      state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: m.p, index: m.idx });
    }

    assert.equal(state.status, STATUS.ROUND_OVER);
    assert.equal(state.winner, 'draw');
    assert.equal(state.winningLine, null);
    assert.equal(state.turnCount, 9);
  });

  it('should reject out-of-turn moves without mutating state', () => {
    const state = createInitialState();
    // It is P1's turn; P2 attempts move
    const validation = validateAction(state, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 0
    });
    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'OUT_OF_TURN');

    const nextState = gameReducer(state, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 0
    });
    assert.equal(nextState, state); // Unchanged reference
  });

  it('should reject already occupied cell placement', () => {
    let state = createInitialState();
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    assert.equal(state.board[4], PLAYERS.P1);

    const validation = validateAction(state, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 4
    });
    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'CELL_OCCUPIED');

    const nextState = gameReducer(state, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 4
    });
    assert.equal(nextState, state);
  });

  it('should reject out-of-bounds cell indices', () => {
    const state = createInitialState();
    for (const badIdx of [-1, 9, 3.14, '4', null, undefined]) {
      const validation = validateAction(state, {
        type: ACTION_TYPES.PLACE_MARK,
        player: PLAYERS.P1,
        index: badIdx
      });
      assert.equal(validation.valid, false);
      assert.equal(validation.code, 'OUT_OF_BOUNDS');
    }
  });

  it('should reject moves when status is ROUND_OVER', () => {
    let state = createInitialState();
    // P1 wins in 0, 1, 2
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });
    assert.equal(state.status, STATUS.ROUND_OVER);

    const validation = validateAction(state, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 5
    });
    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'GAME_NOT_ACTIVE');
  });

  it('should accurately return available legal moves', () => {
    let state = createInitialState();
    let available = getAvailableMoves(state);
    assert.equal(available.length, 9);

    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    available = getAvailableMoves(state);
    assert.equal(available.length, 8);
    assert.ok(!available.some(m => m.index === 0));
    assert.ok(available.every(m => m.player === PLAYERS.P2));
  });
});
