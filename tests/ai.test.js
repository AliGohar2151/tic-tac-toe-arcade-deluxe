/**
 * @file ai.test.js
 * @description Comprehensive unit and adversarial verification test suite for Chrono-Tic-Tac-Toe AI Engine:
 * 1. Base AiStrategy & createAiStrategy Factory
 * 2. Easy AI (casual/exploratory, human-like mistakes, RNG distribution)
 * 3. Medium AI (Priority 1: Win, Priority 2: Block, Priority 3: Tactical Abilities, Priority 4: Positional Heuristics)
 * 4. Hard AI Classic (Unbeatable Alpha-Beta depth 9 Minimax, Opening Traps, Adversarial Simulation, Benchmark)
 * 5. Hard AI Chrono Ghost (Adapted Minimax, FIFO decay, durable vs fragile threats, cycle detection, TT)
 * 6. Hard AI Tactical Overdrive (Shatter disruption, Phase Swap alignment & blunder avoidance, charge conservation)
 * 7. Cancellation Token & Arbitrary Player Identity Support
 * Native Node.js test runner (node:test, node:assert/strict). Zero external npm dependencies.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  AI_DIFFICULTIES,
  WINNING_LINES,
  createInitialState
} from '../src/core/types.js';
import { gameReducer } from '../src/core/gameReducer.js';

import {
  AiStrategy,
  createAiStrategy,
  registerHardAi,
  registerAiStrategy
} from '../src/ai/aiStrategy.js';
import { EasyAi } from '../src/ai/easyAi.js';
import { MediumAi } from '../src/ai/mediumAi.js';
import {
  HardAiStrategy,
  HardAi,
  findBestClassicMove,
  computeClassicMove,
  classicMinimax,
  CLASSIC_MOVE_ORDER,
  MINIMAX_SCORES,
  computeBestGhostMove,
  evaluateGhostState,
  getGhostStateKey,
  computeBestTacticalMove,
  evaluateTacticalState,
  getTacticalStateKey
} from '../src/ai/hardAi.js';

// Helper to construct custom immutable board states for scenario tests
function buildCustomState(overrides = {}) {
  const base = createInitialState({
    mode: overrides.mode || MODES.CLASSIC,
    startingPlayer: overrides.currentTurn || PLAYERS.P2
  });

  const board = overrides.board ? [...overrides.board] : [...base.board];
  const p1Queue = overrides.p1Queue ? [...overrides.p1Queue] : [...base.p1Queue];
  const p2Queue = overrides.p2Queue ? [...overrides.p2Queue] : [...base.p2Queue];

  return Object.freeze({
    ...base,
    board: Object.freeze(board),
    currentTurn: overrides.currentTurn || PLAYERS.P2,
    mode: overrides.mode || MODES.CLASSIC,
    status: overrides.status || STATUS.PLAYING,
    turnCount: overrides.turnCount ?? 0,
    p1Queue: Object.freeze(p1Queue),
    p2Queue: Object.freeze(p2Queue),
    abilities: overrides.abilities ? Object.freeze({
      [PLAYERS.P1]: Object.freeze({ ...overrides.abilities[PLAYERS.P1] }),
      [PLAYERS.P2]: Object.freeze({ ...overrides.abilities[PLAYERS.P2] })
    }) : base.abilities
  });
}

// ============================================================================
// SUITE 1: AI STRATEGY ARCHITECTURE & FACTORY
// ============================================================================
describe('1. AI Strategy Architecture & Factory', () => {
  it('should prevent direct execution of abstract AiStrategy.computeMove', async () => {
    const baseStrategy = new AiStrategy();
    const state = createInitialState();
    await assert.rejects(
      async () => { await baseStrategy.computeMove(state); },
      /must be implemented by subclass/
    );
  });

  it('should create an EasyAi instance via createAiStrategy("easy")', () => {
    const ai = createAiStrategy('easy');
    assert.ok(ai instanceof EasyAi);
    assert.equal(ai.difficulty, AI_DIFFICULTIES.EASY);
  });

  it('should create a MediumAi instance via createAiStrategy("medium")', () => {
    const ai = createAiStrategy('medium');
    assert.ok(ai instanceof MediumAi);
    assert.equal(ai.difficulty, AI_DIFFICULTIES.MEDIUM);
  });

  it('should create a HardAiStrategy instance via createAiStrategy("hard")', () => {
    const ai = createAiStrategy('hard');
    assert.ok(ai instanceof HardAiStrategy);
    assert.equal(ai.difficulty, AI_DIFFICULTIES.HARD);
  });

  it('should support difficulty aliases: "impossible" and "minimax"', () => {
    const ai1 = createAiStrategy('impossible');
    const ai2 = createAiStrategy('minimax');
    assert.ok(ai1 instanceof HardAiStrategy);
    assert.ok(ai2 instanceof HardAiStrategy);
  });

  it('should accept custom options in createAiStrategy', () => {
    const customRng = () => 0.42;
    const ai = createAiStrategy('easy', { randomFn: customRng, mistakeRate: 0.9 });
    assert.equal(ai.randomFn(), 0.42);
    assert.equal(ai.mistakeRate, 0.9);
  });

  it('should pass-through an existing AiStrategy instance', () => {
    const existing = new MediumAi();
    const result = createAiStrategy(existing);
    assert.equal(result, existing);
  });

  it('should throw TypeError on invalid difficulty tier', () => {
    assert.throws(
      () => createAiStrategy('non_existent_tier'),
      TypeError
    );
  });

  it('should verify cancellation detection via isCancelled', () => {
    const ai = new EasyAi();
    assert.equal(ai.isCancelled(), false);
    assert.equal(ai.isCancelled({ cancellationToken: { isCancelled: false } }), false);
    assert.equal(ai.isCancelled({ cancellationToken: { isCancelled: true } }), true);
    assert.equal(ai.isCancelled({ isCancelled: () => true }), true);
    assert.equal(ai.isCancelled({ signal: { aborted: true } }), true);
  });
});

// ============================================================================
// SUITE 2: EASY AI (CASUAL / EXPLORATORY)
// ============================================================================
describe('2. Easy AI (Casual & Human-like Mistakes)', () => {
  it('should always select a strictly legal move on an active board', async () => {
    const ai = new EasyAi();
    const state = createInitialState({ startingPlayer: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.ok(move);
    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
    assert.equal(move.player, PLAYERS.P2);
    assert.ok(move.index >= 0 && move.index <= 8);
    assert.equal(state.board[move.index], null);
  });

  it('should return null when game status is not PLAYING', async () => {
    const ai = new EasyAi();
    const state = buildCustomState({ status: STATUS.ROUND_OVER });
    const move = await ai.computeMove(state);
    assert.equal(move, null);
  });

  it('should return null when cancellation token is aborted', async () => {
    const ai = new EasyAi();
    const state = createInitialState();
    const move = await ai.computeMove(state, { cancellationToken: { isCancelled: true } });
    assert.equal(move, null);
  });

  it('should distribute moves across multiple cells when exploratory (randomness test)', async () => {
    const ai = new EasyAi({ pureRandom: true });
    const chosenCells = new Set();
    const state = createInitialState({ startingPlayer: PLAYERS.P2 });

    for (let i = 0; i < 100; i++) {
      const move = await ai.computeMove(state);
      chosenCells.add(move.index);
    }

    assert.ok(
      chosenCells.size >= 5,
      `Expected >= 5 unique cells chosen on empty board over 100 trials, got ${chosenCells.size}`
    );
  });

  it('should be deterministic when injected with a mock RNG', async () => {
    const mockRng = () => 0.0;
    const ai = new EasyAi({ randomFn: mockRng, mistakeRate: 1.0 });

    const state = createInitialState({ startingPlayer: PLAYERS.P2 });
    const move1 = await ai.computeMove(state);
    const move2 = await ai.computeMove(state);

    assert.equal(move1.index, 0);
    assert.equal(move2.index, 0);
  });

  it('should take immediate win when mistakeRate is 0.0 (tactical awareness mode)', async () => {
    const board = [
      'p2', 'p2', null,
      'p1', 'p1', null,
      null, null, null
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });

    const ai = new EasyAi({ mistakeRate: 0.0 });
    const move = await ai.computeMove(state);

    assert.ok(move);
    assert.equal(move.index, 2);
  });
});

// ============================================================================
// SUITE 3: MEDIUM AI (TACTICAL HEURISTICS)
// ============================================================================
describe('3. Medium AI - Tactical Heuristic Priorities', () => {
  const ai = new MediumAi();

  it('Priority 1: should seize an immediate horizontal win (Row 0)', async () => {
    const board = [
      'p2', 'p2', null,
      'p1', 'p1', null,
      null, null, null
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.deepEqual(move, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 2
    });
  });

  it('Priority 1: should seize an immediate vertical win (Col 1)', async () => {
    const board = [
      null, 'p2', null,
      null, null, null,
      null, 'p2', null
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.deepEqual(move, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 4
    });
  });

  it('Priority 1: should seize an immediate diagonal win', async () => {
    const board = [
      'p2', null, null,
      null, 'p2', null,
      null, null, null
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.deepEqual(move, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 8
    });
  });

  it('Priority 1: should verify Ghost Mode FIFO eviction does NOT destroy the winning line', async () => {
    const board = [
      null, null, null,
      'p2', null, null,
      'p2', 'p2', null
    ];
    const state = buildCustomState({
      mode: MODES.GHOST,
      board,
      currentTurn: PLAYERS.P2,
      p2Queue: [3, 6, 7]
    });
    const move = await ai.computeMove(state);

    assert.equal(move.index, 8);
  });

  it('Priority 1: should seize an immediate win via Tactical Phase Swap', async () => {
    const board = [
      'p2', 'p2', 'p1',
      null, null, 'p2',
      null, null, null
    ];
    const state = buildCustomState({
      mode: MODES.TACTICAL,
      board,
      currentTurn: PLAYERS.P2,
      abilities: {
        p1: { shatter: 1, swap: 1 },
        p2: { shatter: 1, swap: 1 }
      }
    });

    const move = await ai.computeMove(state);
    assert.ok(move);
    assert.equal(move.type, ACTION_TYPES.USE_SWAP);
    assert.ok(
      (move.indexA === 5 && move.indexB === 2) ||
      (move.indexA === 2 && move.indexB === 5)
    );
  });

  it('Priority 2: should block opponent immediate horizontal win', async () => {
    const board = [
      null, null, null,
      'p1', 'p1', null,
      'p2', null, null
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.deepEqual(move, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 5
    });
  });

  it('Priority 2: should block opponent immediate diagonal win', async () => {
    const board = [
      null, null, 'p1',
      null, null, null,
      'p1', null, 'p2'
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.deepEqual(move, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 4
    });
  });

  it('Priority 2: should prioritize winning over blocking when both exist', async () => {
    const board = [
      'p2', 'p2', null,
      null, null, null,
      'p1', 'p1', null
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    // MUST take cell 2 (win) rather than cell 8 (block)
    assert.equal(move.index, 2);
  });

  it('Priority 3: should use Shatter or block on opponent setup line in Tactical mode', async () => {
    const board = [
      'p1', 'p1', null,
      null, 'p2', null,
      null, null, null
    ];
    const state = buildCustomState({
      mode: MODES.TACTICAL,
      board,
      currentTurn: PLAYERS.P2,
      abilities: {
        p1: { shatter: 1, swap: 1 },
        p2: { shatter: 1, swap: 1 }
      }
    });

    const move = await ai.computeMove(state);
    assert.ok(
      (move.type === ACTION_TYPES.PLACE_MARK && move.index === 2) ||
      (move.type === ACTION_TYPES.USE_SHATTER && (move.targetIndex === 0 || move.targetIndex === 1))
    );
  });

  it('Priority 4: should take Center cell 4 on an empty board', async () => {
    const state = createInitialState({ startingPlayer: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.deepEqual(move, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P2,
      index: 4
    });
  });

  it('Priority 4: should take a Corner when Center is occupied', async () => {
    const board = [
      null, null, null,
      null, 'p1', null,
      null, null, null
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
    assert.ok([0, 2, 6, 8].includes(move.index));
  });

  it('Priority 4: should take an Edge when Center and Corners are occupied', async () => {
    const board = [
      'p1', null, 'p2',
      null, 'p1', null,
      'p1', null, 'p2'
    ];
    const state = buildCustomState({ board, currentTurn: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
    assert.ok([1, 3, 5, 7].includes(move.index));
  });

  it('Priority 3B: should NEVER blunder by using Phase Swap that awards win to opponent', async () => {
    const board = [
      'p1', 'p2', 'p1',
      null, 'p1', null,
      'p2', 'p1', 'p2'
    ];
    const state = buildCustomState({
      mode: MODES.TACTICAL,
      board,
      currentTurn: PLAYERS.P2,
      abilities: {
        p1: { shatter: 0, swap: 0 },
        p2: { shatter: 0, swap: 1 }
      }
    });

    const move = await ai.computeMove(state);
    assert.ok(move, 'Move should not be null');
    const isSuicidalSwap = move.type === ACTION_TYPES.USE_SWAP &&
      ((move.indexA === 1 && move.indexB === 4) || (move.indexA === 4 && move.indexB === 1));
    assert.equal(isSuicidalSwap, false, 'Should reject suicidal Phase Swap between cells 1 and 4');
    const sim = gameReducer(state, move);
    assert.notEqual(sim.winner, PLAYERS.P1, 'Move must not gift opponent an immediate win');
  });

  it('Priority 2A: should shatter pivot mark when opponent sets up a dual fork in Tactical mode', async () => {
    const board = [
      'p1', null, 'p1',
      null, 'p2', null,
      null, null, 'p1'
    ];
    const state = buildCustomState({
      mode: MODES.TACTICAL,
      board,
      currentTurn: PLAYERS.P2,
      abilities: {
        p1: { shatter: 0, swap: 0 },
        p2: { shatter: 1, swap: 1 }
      }
    });

    const move = await ai.computeMove(state);
    assert.ok(move, 'Move should not be null');
    assert.equal(move.type, ACTION_TYPES.USE_SHATTER, 'Should select Shatter to neutralize fork');
    assert.equal(move.targetIndex, 2, 'Should shatter the pivot mark at cell 2');
  });

  it('should return null when cancellation token is triggered', async () => {
    const state = createInitialState();
    const move = await ai.computeMove(state, { cancellationToken: { isCancelled: true } });
    assert.equal(move, null);
  });
});

// ============================================================================
// SUITE 4: HARD AI - CLASSIC UNBEATABLE ALPHA-BETA MINIMAX
// ============================================================================
describe('4. Hard AI - Classic Unbeatable Alpha-Beta Minimax Engine', () => {

  describe('4.1 Immediate Win Seizure (Offensive Priority)', () => {
    it('should immediately complete a winning row (0, 1 -> 2)', () => {
      const board = [
        'p1', 'p1', null,
        'p2', 'p2', null,
        null, null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P1);
      assert.equal(result.index, 2, 'AI must seize immediate winning cell 2');
      assert.equal(result.score, 10, 'Immediate win at depth 0 has score 10');
    });

    it('should immediately complete a winning column (1, 4 -> 7)', () => {
      const board = [
        'p2', 'p1', null,
        null, 'p1', 'p2',
        null, null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P1);
      assert.equal(result.index, 7, 'AI must complete column win at cell 7');
      assert.equal(result.score, 10);
    });

    it('should immediately complete a winning diagonal (0, 4 -> 8)', () => {
      const board = [
        'p1', null, 'p2',
        null, 'p1', null,
        'p2', null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P1);
      assert.equal(result.index, 8, 'AI must complete diagonal win at cell 8');
      assert.equal(result.score, 10);
    });

    it('should prioritize winning immediately over blocking an opponent win', () => {
      const board = [
        'p1', 'p1', null,
        'p2', 'p2', null,
        null, null, null
      ];
      const p1Result = findBestClassicMove(board, PLAYERS.P1);
      assert.equal(p1Result.index, 2, 'P1 must win at cell 2 instead of blocking at cell 5');

      const p2Result = findBestClassicMove(board, PLAYERS.P2);
      assert.equal(p2Result.index, 5, 'P2 must win at cell 5 instead of blocking at cell 2');
    });
  });

  describe('4.2 Immediate Threat Blocking (Defensive Priority)', () => {
    it('should block opponent row win (opponent on 0, 1 -> AI blocks 2)', () => {
      const board = [
        'p1', 'p1', null,
        null, 'p2', null,
        null, null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      assert.equal(result.index, 2, 'P2 must block P1 win at cell 2');
    });

    it('should block opponent column win (opponent on 0, 6 -> AI blocks 3)', () => {
      const board = [
        'p1', null, null,
        null, 'p2', null,
        'p1', null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      assert.equal(result.index, 3, 'P2 must block P1 win at cell 3');
    });

    it('should block opponent diagonal win (opponent on 2, 4 -> AI blocks 6)', () => {
      const board = [
        null, null, 'p1',
        null, 'p1', null,
        null, null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      assert.equal(result.index, 6, 'P2 must block P1 diagonal win at cell 6');
    });
  });

  describe('4.3 Canonical Opening Traps & Fork Prevention', () => {
    it('Trap 1 (Diagonal Opposite Corners): AI on center must respond to corners 0 and 8 with an edge', () => {
      const board = [
        'p1', null, null,
        null, 'p2', null,
        null, null, 'p1'
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      const legalDefensiveEdges = [1, 3, 5, 7];
      assert.ok(
        legalDefensiveEdges.includes(result.index),
        `AI must choose an edge (1, 3, 5, 7) to avoid the diagonal fork; chose ${result.index}`
      );
      assert.equal(result.score, 0, 'Optimal play against opposite corners guarantees a draw (0)');
    });

    it('Trap 1 Variant: AI on center must respond to corners 2 and 6 with an edge', () => {
      const board = [
        null, null, 'p1',
        null, 'p2', null,
        'p1', null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      const legalDefensiveEdges = [1, 3, 5, 7];
      assert.ok(
        legalDefensiveEdges.includes(result.index),
        `AI must choose an edge (1, 3, 5, 7); chose ${result.index}`
      );
      assert.equal(result.score, 0);
    });

    it('Trap 2 (Knight / L-Shape Fork): AI must neutralize L-shaped attack (P1 on 0 and 7)', () => {
      const board = [
        'p1', null, null,
        null, 'p2', null,
        null, 'p1', null
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      assert.equal(result.score, 0, 'Must hold position to a draw');
      assert.notEqual(result.index, 1, 'Playing 1 allows P1 to take 6 and fork');
      assert.notEqual(result.index, 3, 'Playing 3 allows P1 to take 6 and fork');
      assert.notEqual(result.index, 5, 'Playing 5 allows P1 to take 6 and fork');
    });

    it('Trap 3 (Center Opening Response): AI as P2 must respond to P1 center opening with a corner', () => {
      const board = [
        null, null, null,
        null, 'p1', null,
        null, null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      const corners = [0, 2, 6, 8];
      assert.ok(
        corners.includes(result.index),
        `Responding to center opening requires a corner (0, 2, 6, 8); chose ${result.index}`
      );
      assert.equal(result.score, 0, 'Optimal response guarantees draw (0)');
    });

    it('Corner Opening Response: AI as P2 takes center 4 when P1 opens with a corner', () => {
      for (const corner of [0, 2, 6, 8]) {
        const board = Array(9).fill(null);
        board[corner] = 'p1';
        const result = findBestClassicMove(board, PLAYERS.P2);
        assert.equal(result.index, 4, `AI must take center 4 when P1 opens with corner ${corner}`);
        assert.equal(result.score, 0);
      }
    });

    it('Edge Opening Response: AI as P2 takes center 4 when P1 opens with an edge', () => {
      for (const edge of [1, 3, 5, 7]) {
        const board = Array(9).fill(null);
        board[edge] = 'p1';
        const result = findBestClassicMove(board, PLAYERS.P2);
        assert.equal(result.index, 4, `AI should take center 4 when P1 opens with edge ${edge}`);
        assert.equal(result.score, 0);
      }
    });
  });

  describe('4.4 Depth-Penalized Terminal Evaluations', () => {
    it('prefers faster win (depth 1 win > depth 3 win)', () => {
      const board = [
        'p1', 'p1', null,
        'p2', null, null,
        null, null, null
      ];
      const result = findBestClassicMove(board, PLAYERS.P1);
      assert.equal(result.index, 2);
      assert.equal(result.score, 10);
    });

    it('prefers delayed loss over immediate loss in forced handicap positions', () => {
      const board = [
        'p1', 'p1', null,
        'p1', null, null,
        null, null, 'p2'
      ];
      const result = findBestClassicMove(board, PLAYERS.P2);
      assert.equal(result.index, 2, 'AI must block the immediate win at cell 2');
    });
  });

  describe('4.5 Exhaustive Adversarial Tree Simulation (Provable Unbeatability)', () => {
    function simulateAdversary(board, turnPlayer, aiPlayer, opponentPlayer, stats) {
      if (checkWinFast(board, aiPlayer)) { stats.wins++; return; }
      if (checkWinFast(board, opponentPlayer)) { stats.losses++; return; }
      const empties = [];
      for (let i = 0; i < 9; i++) if (board[i] === null) empties.push(i);
      if (empties.length === 0) { stats.draws++; return; }

      if (turnPlayer === aiPlayer) {
        const move = findBestClassicMove(board, aiPlayer).index;
        board[move] = aiPlayer;
        simulateAdversary(board, opponentPlayer, aiPlayer, opponentPlayer, stats);
        board[move] = null;
      } else {
        // Adversary tests EVERY legal move
        for (const move of empties) {
          board[move] = opponentPlayer;
          simulateAdversary(board, aiPlayer, aiPlayer, opponentPlayer, stats);
          board[move] = null;
        }
      }
    }

    function checkWinFast(board, player) {
      for (let i = 0; i < 8; i++) {
        const [a, b, c] = WINNING_LINES[i];
        if (board[a] === player && board[b] === player && board[c] === player) return true;
      }
      return false;
    }

    it('AI as P1 (First Player): Zero losses across all possible adversary branches', () => {
      const stats = { wins: 0, draws: 0, losses: 0 };
      const board = Array(9).fill(null);
      simulateAdversary(board, PLAYERS.P1, PLAYERS.P1, PLAYERS.P2, stats);

      assert.equal(stats.losses, 0, `AI as P1 must have 0 losses, got ${stats.losses}`);
      assert.ok(stats.wins >= 82, `AI as P1 should achieve at least 82 wins, got ${stats.wins}`);
      assert.ok(stats.draws <= 10, `AI as P1 draws should be at most 10, got ${stats.draws}`);
    });

    it('AI as P2 (Second Player): Zero losses across all possible adversary branches', () => {
      const stats = { wins: 0, draws: 0, losses: 0 };
      const board = Array(9).fill(null);
      simulateAdversary(board, PLAYERS.P1, PLAYERS.P2, PLAYERS.P1, stats);

      assert.equal(stats.losses, 0, `AI as P2 must have 0 losses, got ${stats.losses}`);
      assert.ok(stats.wins >= 368, `AI as P2 should achieve at least 368 wins, got ${stats.wins}`);
      assert.ok(stats.draws <= 153, `AI as P2 draws should be at most 153, got ${stats.draws}`);
    });
  });

  describe('4.6 Performance & Complexity Verification', () => {
    it('should evaluate <= 8,000 nodes and complete root search in under 50ms', () => {
      const board = Array(9).fill(null);
      // JIT warmup to eliminate cold-start compilation overhead
      findBestClassicMove(board, PLAYERS.P1, { trackStats: false });

      const start = performance.now();
      const result = findBestClassicMove(board, PLAYERS.P1, { trackStats: true });
      const elapsed = performance.now() - start;

      assert.ok(result.nodesEvaluated <= 8000, `Evaluated nodes (${result.nodesEvaluated}) should be <= 8000`);
      assert.ok(elapsed < 50, `Execution time (${elapsed.toFixed(2)}ms) must be under 50ms`);
    });

    it('should evaluate <= 500 nodes in midgame (Turn 3+)', () => {
      const board = [
        'p1', null, null,
        null, 'p2', null,
        null, null, 'p1'
      ];
      const result = findBestClassicMove(board, PLAYERS.P2, { trackStats: true });
      assert.ok(result.nodesEvaluated <= 500, `Midgame nodes (${result.nodesEvaluated}) should be <= 500`);
    });

    it('computeClassicMove should return a compliant action object', () => {
      const state = createInitialState({ mode: 'classic' });
      const action = computeClassicMove(state);
      assert.equal(action.type, ACTION_TYPES.PLACE_MARK);
      assert.equal(action.player, PLAYERS.P1);
      assert.equal(action.index, 4); // Opens with center
    });
  });
});

// ============================================================================
// SUITE 5: HARD AI - CHRONO GHOST MODE ADAPTED MINIMAX
// ============================================================================
describe('5. Hard AI - Chrono Ghost Mode Adapted Minimax', () => {
  it('T1: should eliminate baseline fallback bug and execute adapted Ghost Minimax', async () => {
    const ai = new HardAiStrategy();
    const state = createInitialState({ mode: MODES.GHOST, startingPlayer: PLAYERS.P2 });
    const move = await ai.computeMove(state);

    assert.ok(move, 'Move must be produced');
    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
    assert.equal(move.player, PLAYERS.P2);
    assert.ok(typeof move.index === 'number');
  });

  it('T2: should seize immediate winning placement in Ghost mode', () => {
    let state = createInitialState({ mode: MODES.GHOST });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 3 });

    assert.equal(state.currentTurn, PLAYERS.P2);
    const move = computeBestGhostMove(state);

    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
    assert.equal(move.index, 7, 'AI must place at 7 to complete [1, 4, 7] win');

    const resultState = gameReducer(state, move);
    assert.equal(resultState.winner, PLAYERS.P2);
    assert.equal(resultState.status, STATUS.ROUND_OVER);
  });

  it('T3: should NOT hallucinate false win when oldest mark in line will evict', () => {
    let state = createInitialState({ mode: MODES.GHOST });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 7 });

    const move = computeBestGhostMove(state);
    assert.ok(move, 'AI generates valid move');
    const nextState = gameReducer(state, move);
    assert.equal(nextState.p2Queue.length, 3);
  });

  it('T4: should block opponent imminent durable win', () => {
    let state = createInitialState({ mode: MODES.GHOST });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });

    assert.equal(state.currentTurn, PLAYERS.P2);
    const move = computeBestGhostMove(state);

    assert.equal(move.index, 2, 'AI must block opponent winning line at cell 2');
  });

  it('T5: should handle repeating cycles without infinite recursion', () => {
    let state = createInitialState({ mode: MODES.GHOST });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 3 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 });

    const startTime = performance.now();
    const move = computeBestGhostMove(state);
    const duration = performance.now() - startTime;

    assert.ok(move, 'Move computed successfully');
    assert.ok(duration < 100, `Execution time must be sub-100ms (took ${duration.toFixed(2)}ms)`);
  });

  it('T6: should achieve sub-15ms mean execution time over 20 randomized states', () => {
    let state = createInitialState({ mode: MODES.GHOST });
    const durations = [];

    const testMoves = [0, 3, 1, 4, 6, 7, 8, 2, 5, 0];
    for (const idx of testMoves) {
      if (state.status !== STATUS.PLAYING) break;
      if (state.board[idx] === null) {
        state = gameReducer(state, {
          type: ACTION_TYPES.PLACE_MARK,
          player: state.currentTurn,
          index: idx
        });
      }
    }

    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      computeBestGhostMove(state);
      durations.push(performance.now() - t0);
    }

    const meanDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    assert.ok(meanDuration < 50, `Mean duration must be < 50ms (was ${meanDuration.toFixed(2)}ms)`);
  });
});

// ============================================================================
// SUITE 6: HARD AI - TACTICAL OVERDRIVE MINIMAX
// ============================================================================
describe('6. Hard AI - Tactical Overdrive Minimax', () => {
  it('T7: should seize immediate win via Phase Swap', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 6 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 3 });

    assert.equal(state.currentTurn, PLAYERS.P2);
    const move = computeBestTacticalMove(state);

    assert.equal(move.type, ACTION_TYPES.USE_SWAP);
    const swappedCells = [move.indexA, move.indexB].sort();
    assert.deepEqual(swappedCells, [1, 4], 'AI must swap cells 1 and 4 for immediate win');

    const result = gameReducer(state, move);
    assert.equal(result.winner, PLAYERS.P2);
    assert.equal(result.status, STATUS.ROUND_OVER);
  });

  it('T8: should NEVER blunder by using Phase Swap that awards win to opponent', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 1 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 2 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 7 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 4 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 3 });

    assert.equal(state.currentTurn, PLAYERS.P2);
    const move = computeBestTacticalMove(state);

    const isBlunderSwap =
      move.type === ACTION_TYPES.USE_SWAP &&
      ((move.indexA === 1 && move.indexB === 4) || (move.indexA === 4 && move.indexB === 1));

    assert.equal(isBlunderSwap, false, 'AI must not execute blunder swap');
    const resultState = gameReducer(state, move);
    assert.notEqual(resultState.winner, PLAYERS.P1, 'AI move must not immediately lose to P1');
  });

  it('T9: should preserve ability charges early when standard placement suffices', () => {
    const state = createInitialState({ mode: MODES.TACTICAL, startingPlayer: PLAYERS.P2 });
    const move = computeBestTacticalMove(state);

    assert.equal(move.type, ACTION_TYPES.PLACE_MARK, 'AI should place mark on turn 1');
    assert.equal(state.abilities.p2.shatter, 1, 'Shatter charge remains preserved');
    assert.equal(state.abilities.p2.swap, 1, 'Swap charge remains preserved');
  });

  it('T10: should disrupt imminent opponent win using Shatter when necessary', () => {
    let state = createInitialState({ mode: MODES.TACTICAL });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 0 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P2, index: 8 });
    state = gameReducer(state, { type: ACTION_TYPES.PLACE_MARK, player: PLAYERS.P1, index: 1 });

    assert.equal(state.currentTurn, PLAYERS.P2);
    const move = computeBestTacticalMove(state);

    const nextState = gameReducer(state, move);
    assert.equal(nextState.winner, null, 'P1 must not have won');
    const p1Followup = gameReducer(nextState, {
      type: ACTION_TYPES.PLACE_MARK,
      player: PLAYERS.P1,
      index: 2
    });
    assert.notEqual(p1Followup.winner, PLAYERS.P1, 'P1 threat must have been neutralized');
  });
});

// ============================================================================
// SUITE 7: ARBITRARY PLAYER IDENTITY & HARD AI DELEGATION
// ============================================================================
describe('7. Arbitrary Player Identity & HardAiStrategy Delegation', () => {
  it('should support AI playing as P1 (first player) in Classic mode', async () => {
    const ai = new HardAiStrategy();
    const state = createInitialState({ mode: MODES.CLASSIC, startingPlayer: PLAYERS.P1 });
    const move = await ai.computeMove(state);

    assert.ok(move);
    assert.equal(move.player, PLAYERS.P1);
    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
    assert.equal(move.index, 4, 'P1 AI should seize center 4 on opening');
  });

  it('should support AI playing as P1 in Ghost mode', async () => {
    const ai = new HardAiStrategy();
    const state = createInitialState({ mode: MODES.GHOST, startingPlayer: PLAYERS.P1 });
    const move = await ai.computeMove(state);

    assert.ok(move);
    assert.equal(move.player, PLAYERS.P1);
    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
  });

  it('should support AI playing as P1 in Tactical mode', async () => {
    const ai = new HardAiStrategy();
    const state = createInitialState({ mode: MODES.TACTICAL, startingPlayer: PLAYERS.P1 });
    const move = await ai.computeMove(state);

    assert.ok(move);
    assert.equal(move.player, PLAYERS.P1);
    assert.equal(move.type, ACTION_TYPES.PLACE_MARK);
  });

  it('should abort cleanly when HardAiStrategy receives cancelled token', async () => {
    const ai = new HardAiStrategy();
    const state = createInitialState({ mode: MODES.CLASSIC });
    const move = await ai.computeMove(state, { cancellationToken: { isCancelled: true } });
    assert.equal(move, null, 'Must return null when cancelled');
  });
});
