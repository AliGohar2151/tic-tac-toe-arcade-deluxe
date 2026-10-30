/**
 * @file hardAi.js
 * @description Hard AI strategy for Chrono-Tic-Tac-Toe.
 * Features:
 *  - Classic Mode: Full-depth 9 Alpha-Beta Minimax (Mathematically Unbeatable, sub-5ms).
 *  - Chrono Ghost Mode: Depth-5 Alpha-Beta Minimax with Transposition Table,
 *    ancestor-path cycle detection, and durable vs fragile threat evaluation.
 *  - Tactical Overdrive Mode: Depth-4 Tactical Minimax evaluating placements,
 *    Shatter disruptions, and Phase Swap alignments with charge conservation.
 */

import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  AI_DIFFICULTIES,
  WINNING_LINES,
  areAdjacent,
  getOpponent,
  GHOST_CONFIG
} from '../core/types.js';
import { gameReducer, checkWin, getAvailableMoves } from '../core/gameReducer.js';
import { AiStrategy, registerHardAi, isCancelled } from './aiStrategy.js';

export { isCancelled };

// Configuration constants
export const CLASSIC_MOVE_ORDER = Object.freeze([4, 0, 2, 6, 8, 1, 3, 5, 7]);
export const MINIMAX_SCORES = Object.freeze({
  WIN_BASE: 10,
  LOSS_BASE: -10,
  DRAW: 0
});

const GHOST_SEARCH_DEPTH = 5;
const TACTICAL_SEARCH_DEPTH = 4;
const EXACT = 0;
const LOWERBOUND = 1;
const UPPERBOUND = 2;
const CORNERS = Object.freeze([0, 2, 6, 8]);
const GHOST_MOVE_PRIORITY = Object.freeze([1, 5, 2, 6, 0, 7, 3, 8, 4]);

// ============================================================================
// 1. CLASSIC MODE UNBEATABLE MINIMAX ENGINE
// ============================================================================

/**
 * Fast inlined win check for 3x3 array without nested loop or array allocation overhead.
 * @param {Array<string|null>} board
 * @param {string} player
 * @returns {boolean}
 */
export function fastCheckWin(board, player) {
  return (
    (board[0] === player && board[1] === player && board[2] === player) ||
    (board[3] === player && board[4] === player && board[5] === player) ||
    (board[6] === player && board[7] === player && board[8] === player) ||
    (board[0] === player && board[3] === player && board[6] === player) ||
    (board[1] === player && board[4] === player && board[7] === player) ||
    (board[2] === player && board[5] === player && board[8] === player) ||
    (board[0] === player && board[4] === player && board[8] === player) ||
    (board[2] === player && board[4] === player && board[6] === player)
  );
}

/**
 * Full-depth 9 Alpha-Beta Minimax for Classic Mode.
 *
 * @param {Array<string|null>} board - Mutable search board (restored on backtrack)
 * @param {number} depth - Current search ply (0-9)
 * @param {boolean} isMaximizing - True if current ply is AI (maximizing)
 * @param {string} aiPlayer - 'p1' or 'p2'
 * @param {string} opponentPlayer - 'p2' or 'p1'
 * @param {number} alpha - Alpha bound
 * @param {number} beta - Beta bound
 * @param {Object} [stats] - Optional search node counter
 * @returns {number} Minimax evaluation score in [-10, 10]
 */
export function classicMinimax(board, depth, isMaximizing, aiPlayer, opponentPlayer, alpha, beta, stats) {
  if (stats) stats.nodesEvaluated++;

  // Terminal evaluation: depth-penalized to win faster and lose slower.
  // Only the player who moved on the preceding ply could have formed a winning line.
  if (isMaximizing) {
    if (fastCheckWin(board, opponentPlayer)) {
      return depth - 10;
    }
  } else {
    if (fastCheckWin(board, aiPlayer)) {
      return 10 - depth;
    }
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    let anyMove = false;
    for (let i = 0; i < 9; i++) {
      const idx = CLASSIC_MOVE_ORDER[i];
      if (board[idx] === null) {
        anyMove = true;
        board[idx] = aiPlayer;
        const evaluation = classicMinimax(board, depth + 1, false, aiPlayer, opponentPlayer, alpha, beta, stats);
        board[idx] = null;

        if (evaluation > maxEval) maxEval = evaluation;
        if (evaluation > alpha) alpha = evaluation;
        if (beta <= alpha) break; // Beta cut-off
      }
    }
    return anyMove ? maxEval : 0; // Terminal Draw when full
  } else {
    let minEval = Infinity;
    let anyMove = false;
    for (let i = 0; i < 9; i++) {
      const idx = CLASSIC_MOVE_ORDER[i];
      if (board[idx] === null) {
        anyMove = true;
        board[idx] = opponentPlayer;
        const evaluation = classicMinimax(board, depth + 1, true, aiPlayer, opponentPlayer, alpha, beta, stats);
        board[idx] = null;

        if (evaluation < minEval) minEval = evaluation;
        if (evaluation < beta) beta = evaluation;
        if (beta <= alpha) break; // Alpha cut-off
      }
    }
    return anyMove ? minEval : 0; // Terminal Draw when full
  }
}

/**
 * Find the optimal move for the AI on a given board in Classic mode.
 *
 * @param {Array<string|null>} board - 9-element cell array
 * @param {string} aiPlayer - Active AI player ('p1' or 'p2')
 * @param {Object} [options={}] - Options (e.g. trackStats, randomTieBreak, randomFn, cancellationToken)
 * @returns {{ index: number|null, score: number, nodesEvaluated: number|null, candidateMoves: number[] } | null}
 */
export function findBestClassicMove(board, aiPlayer, options = {}) {
  const opts = options || {};
  if (isCancelled(opts)) {
    return null;
  }

  const stats = opts.trackStats ? { nodesEvaluated: 0 } : null;

  // Fast-path: Instant turn 0 opening response on empty board (< 0.05ms)
  let isEmpty = true;
  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) {
      isEmpty = false;
      break;
    }
  }

  if (isEmpty) {
    const candidates = [4, 0, 2, 6, 8, 1, 3, 5, 7];
    let selectedMove = 4;
    if (opts.randomTieBreak && candidates.length > 1) {
      const rand = typeof opts.randomFn === 'function' ? opts.randomFn : Math.random;
      const randomIndex = Math.floor(rand() * candidates.length);
      selectedMove = candidates[randomIndex];
    }
    return {
      index: selectedMove,
      score: 0,
      nodesEvaluated: stats ? 0 : null,
      candidateMoves: candidates
    };
  }

  const opponentPlayer = getOpponent(aiPlayer);
  const searchBoard = [...board];

  // Pre-scan immediate opponent winning threats to prioritize defensive blocking on tie scores
  const immediateThreatCells = new Set();
  for (let i = 0; i < 9; i++) {
    if (searchBoard[i] === null) {
      searchBoard[i] = opponentPlayer;
      if (fastCheckWin(searchBoard, opponentPlayer)) {
        immediateThreatCells.add(i);
      }
      searchBoard[i] = null;
    }
  }

  let bestMove = null;
  let bestScore = -Infinity;
  let bestIsBlock = false;
  let alpha = -Infinity;
  const beta = Infinity;
  const candidateMoves = [];

  for (let i = 0; i < 9; i++) {
    if (isCancelled(opts)) {
      return null;
    }

    const idx = CLASSIC_MOVE_ORDER[i];
    if (searchBoard[idx] === null) {
      searchBoard[idx] = aiPlayer;
      const score = classicMinimax(searchBoard, 0, false, aiPlayer, opponentPlayer, alpha, beta, stats);
      searchBoard[idx] = null;

      const isBlock = immediateThreatCells.has(idx);

      if (score > bestScore) {
        bestScore = score;
        bestMove = idx;
        bestIsBlock = isBlock;
        candidateMoves.length = 0;
        candidateMoves.push(idx);
        // Alpha-Beta Cutoff Fix: Tighten alpha to bestScore - 1 instead of bestScore.
        // Because Minimax evaluations in Classic mode are integers, setting alpha = bestScore - 1
        // guarantees that any move with true score < bestScore will be pruned to <= bestScore - 1
        // and cannot produce a false tie (score === bestScore). Only moves whose true evaluation
        // equals bestScore will return bestScore.
        alpha = bestScore - 1;
      } else if (score === bestScore) {
        if (!bestIsBlock && isBlock) {
          bestMove = idx;
          bestIsBlock = true;
        }
        candidateMoves.push(idx);
      }
    }
  }

  // Deterministic or optional stochastic tie-breaking
  if (opts.randomTieBreak && candidateMoves.length > 1) {
    const rand = typeof opts.randomFn === 'function' ? opts.randomFn : Math.random;
    const randomIndex = Math.floor(rand() * candidateMoves.length);
    bestMove = candidateMoves[randomIndex];
  }

  return {
    index: bestMove,
    score: bestScore,
    nodesEvaluated: stats ? stats.nodesEvaluated : null,
    candidateMoves
  };
}

/**
 * Compute move action adhering to AiStrategy contract for Classic mode.
 *
 * @param {Object} state - Canonical GameState
 * @param {Object} [options={}]
 * @returns {Object|null} Action { type: ACTION_TYPES.PLACE_MARK, player, index } or null if cancelled
 */
export function computeClassicMove(state, options = {}) {
  const opts = options || {};
  if (isCancelled(opts)) {
    return null;
  }

  const aiPlayer = state.currentTurn;
  const best = findBestClassicMove(state.board, aiPlayer, opts);
  if (!best || best.index === null) {
    return null;
  }

  return {
    type: ACTION_TYPES.PLACE_MARK,
    player: aiPlayer,
    index: best.index
  };
}

// ============================================================================
// 2. CHRONO GHOST MODE ADAPTED MINIMAX ENGINE
// ============================================================================

/**
 * Generate canonical string key for Ghost mode transposition table.
 * @param {Object} state
 * @returns {string}
 */
export function getGhostStateKey(state) {
  return `${state.currentTurn}|${state.p1Queue.join(',')}|${state.p2Queue.join(',')}`;
}

/**
 * Non-terminal heuristic evaluation for Ghost Mode distinguishing durable vs fragile threats.
 *
 * @param {Object} state
 * @param {string} aiPlayer
 * @returns {number}
 */
export function evaluateGhostState(state, aiPlayer) {
  const oppPlayer = getOpponent(aiPlayer);

  const aiQueue = aiPlayer === PLAYERS.P1 ? state.p1Queue : state.p2Queue;
  const oppQueue = oppPlayer === PLAYERS.P1 ? state.p1Queue : state.p2Queue;

  const aiExpiring = aiQueue.length >= 3 ? aiQueue[0] : null;
  const oppExpiring = oppQueue.length >= 3 ? oppQueue[0] : null;

  let score = 0;

  // 1. Evaluate winning lines
  for (let i = 0; i < 8; i++) {
    const line = WINNING_LINES[i];
    let aiCount = 0;
    let oppCount = 0;
    let aiHasExpiring = false;
    let oppHasExpiring = false;

    for (let c = 0; c < 3; c++) {
      const cell = line[c];
      const val = state.board[cell];
      if (val === aiPlayer) {
        aiCount++;
        if (cell === aiExpiring) aiHasExpiring = true;
      } else if (val === oppPlayer) {
        oppCount++;
        if (cell === oppExpiring) oppHasExpiring = true;
      }
    }

    // AI threats
    if (aiCount > 0 && oppCount === 0) {
      if (aiCount === 2) {
        // Durable vs Fragile threat
        score += aiHasExpiring ? 20 : 120;
      } else if (aiCount === 1) {
        score += aiHasExpiring ? 3 : 10;
      }
    }

    // Opponent threats
    if (oppCount > 0 && aiCount === 0) {
      if (oppCount === 2) {
        // Asymmetric defensive penalty: 144 vs 120
        score -= oppHasExpiring ? 25 : 144;
      } else if (oppCount === 1) {
        score -= oppHasExpiring ? 3 : 12;
      }
    }
  }

  // 2. Center control (cell 4)
  if (state.board[4] === aiPlayer) {
    score += state.board[4] === aiExpiring ? 10 : 30;
  } else if (state.board[4] === oppPlayer) {
    score -= state.board[4] === oppExpiring ? 10 : 30;
  }

  // 3. Corner control (0, 2, 6, 8)
  for (let c = 0; c < 4; c++) {
    const corner = CORNERS[c];
    if (state.board[corner] === aiPlayer) {
      score += corner === aiExpiring ? 2 : 8;
    } else if (state.board[corner] === oppPlayer) {
      score -= corner === oppExpiring ? 2 : 8;
    }
  }

  return score;
}

/**
 * Ultra-fast lightweight Ghost state transition for internal Minimax search plies.
 * Avoids gameReducer's validation, moveHistory allocation, and Object.freeze overhead.
 */
function fastGhostReduce(state, move) {
  const { index, player } = move;
  const opp = player === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;
  const board = state.board.slice();
  const p1Queue = state.p1Queue.slice();
  const p2Queue = state.p2Queue.slice();
  const q = player === PLAYERS.P1 ? p1Queue : p2Queue;
  const maxMarks = state.maxGhostMarks ?? GHOST_CONFIG.MAX_MARKS;

  if (q.length >= maxMarks) {
    const evicted = q.shift();
    board[evicted] = null;
  }
  board[index] = player;
  q.push(index);

  const isWin = fastCheckWin(board, player);
  const nextTurnCount = state.turnCount + 1;
  const maxTurns = state.maxGhostTurns ?? GHOST_CONFIG.MAX_TURNS;
  const isDraw = !isWin && nextTurnCount >= maxTurns;

  return {
    mode: MODES.GHOST,
    status: (isWin || isDraw) ? STATUS.ROUND_OVER : STATUS.PLAYING,
    board,
    currentTurn: (isWin || isDraw) ? state.currentTurn : opp,
    p1Queue,
    p2Queue,
    winner: isWin ? player : (isDraw ? 'draw' : null),
    winningLine: null,
    turnCount: nextTurnCount,
    maxGhostMarks: maxMarks,
    maxGhostTurns: maxTurns
  };
}

/**
 * Minimax algorithm adapted for Chrono Ghost Mode with active path cycle detection
 * and Transposition Table caching.
 */
export function minimaxGhost(
  state,
  depth,
  alpha,
  beta,
  isMaximizing,
  aiPlayer,
  tt = new Map(),
  ancestors = new Set(),
  options = {}
) {
  const opts = options || {};
  if (isCancelled(opts)) {
    return 0;
  }

  const oppPlayer = getOpponent(aiPlayer);

  // 1. Terminal win checks
  if (state.status === STATUS.ROUND_OVER) {
    if (state.winner === aiPlayer) return 1000 - depth;
    if (state.winner === oppPlayer) return -1000 + depth;
    return 0; // Draw
  }

  // 2. Depth cutoff
  if (depth >= GHOST_SEARCH_DEPTH) {
    return evaluateGhostState(state, aiPlayer);
  }

  // 3. Cycle detection via Ancestor Path
  const key = getGhostStateKey(state);
  if (ancestors.has(key)) {
    return 0; // Repeated state along active search branch evaluates as draw
  }

  // 4. Transposition Table lookup
  const originalAlpha = alpha;
  const cached = tt.get(key);
  if (cached && cached.depth >= GHOST_SEARCH_DEPTH - depth) {
    if (cached.flag === EXACT) return cached.score;
    if (cached.flag === LOWERBOUND && cached.score >= beta) return cached.score;
    if (cached.flag === UPPERBOUND && cached.score <= alpha) return cached.score;
  }

  ancestors.add(key);

  const moves = getAvailableMoves(state);
  if (moves.length === 0) {
    ancestors.delete(key);
    return 0;
  }

  // Move ordering: prioritize center and corners for faster alpha-beta cutoffs
  moves.sort((a, b) => GHOST_MOVE_PRIORITY[a.index] - GHOST_MOVE_PRIORITY[b.index]);

  // Move ordering: try cached bestMove first if available
  if (cached?.bestMove) {
    const idx = moves.findIndex(m => m.index === cached.bestMove.index);
    if (idx > 0) {
      const [bm] = moves.splice(idx, 1);
      moves.unshift(bm);
    }
  }

  let bestMove = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      if (isCancelled(opts)) break;
      const nextState = fastGhostReduce(state, move);
      const evalScore = minimaxGhost(
        nextState,
        depth + 1,
        alpha,
        beta,
        false,
        aiPlayer,
        tt,
        ancestors,
        opts
      );
      if (evalScore > maxEval) {
        maxEval = evalScore;
        bestMove = move;
      }
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Beta cutoff
    }

    ancestors.delete(key);

    // TT entry storage
    let flag = EXACT;
    if (maxEval <= originalAlpha) flag = UPPERBOUND;
    else if (maxEval >= beta) flag = LOWERBOUND;
    tt.set(key, { depth: GHOST_SEARCH_DEPTH - depth, score: maxEval, flag, bestMove });

    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      if (isCancelled(opts)) break;
      const nextState = fastGhostReduce(state, move);
      const evalScore = minimaxGhost(
        nextState,
        depth + 1,
        alpha,
        beta,
        true,
        aiPlayer,
        tt,
        ancestors,
        opts
      );
      if (evalScore < minEval) {
        minEval = evalScore;
        bestMove = move;
      }
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Alpha cutoff
    }

    ancestors.delete(key);

    let flag = EXACT;
    if (minEval <= originalAlpha) flag = UPPERBOUND;
    else if (minEval >= beta) flag = LOWERBOUND;
    tt.set(key, { depth: GHOST_SEARCH_DEPTH - depth, score: minEval, flag, bestMove });

    return minEval;
  }
}

/**
 * Compute the optimal move for Chrono Ghost Mode.
 *
 * @param {Object} state
 * @param {Object} [options={}]
 * @returns {Object|null}
 */
export function computeBestGhostMove(state, options = {}) {
  const opts = options || {};
  if (isCancelled(opts)) return null;

  const aiPlayer = state.currentTurn;
  const oppPlayer = getOpponent(aiPlayer);
  const moves = getAvailableMoves(state);
  if (moves.length === 0) return null;

  // 1. Immediate Win check: does any move win directly this turn?
  for (const move of moves) {
    const nextState = fastGhostReduce(state, move);
    if (nextState.winner === aiPlayer) {
      return move;
    }
  }

  // 2. Immediate Block check: if opponent could win on their next turn, prioritize blocking
  const oppHypotheticalState = { ...state, currentTurn: oppPlayer };
  const oppMoves = getAvailableMoves(oppHypotheticalState);
  const immediateThreats = [];
  for (const om of oppMoves) {
    const nextState = fastGhostReduce(oppHypotheticalState, om);
    if (nextState.winner === oppPlayer) {
      immediateThreats.push(om.index);
    }
  }

  if (immediateThreats.length > 0) {
    const blockMove = moves.find(m => immediateThreats.includes(m.index));
    if (blockMove) {
      return blockMove;
    }
  }

  // 3. Center opening heuristic if early and available
  if (state.turnCount <= 1 && state.board[4] === null) {
    const centerMove = moves.find(m => m.index === 4);
    if (centerMove) return centerMove;
  }

  // 4. Minimax Search with TT and Cycle Detection
  const tt = new Map();
  const ancestors = new Set();
  ancestors.add(getGhostStateKey(state));

  moves.sort((a, b) => GHOST_MOVE_PRIORITY[a.index] - GHOST_MOVE_PRIORITY[b.index]);

  let bestMove = moves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    if (isCancelled(opts)) break;
    const nextState = fastGhostReduce(state, move);
    const score = minimaxGhost(
      nextState,
      1,
      alpha,
      beta,
      false,
      aiPlayer,
      tt,
      ancestors,
      opts
    );
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, score);
  }

  return bestMove;
}

// ============================================================================
// 3. TACTICAL OVERDRIVE MODE MINIMAX ENGINE
// ============================================================================

/**
 * Generate canonical string key for Tactical mode transposition table.
 * @param {Object} state
 * @returns {string}
 */
export function getTacticalStateKey(state) {
  const b = state.board.map(c => (c === null ? '_' : c)).join('');
  const a = `${state.abilities.p1.shatter}${state.abilities.p1.swap}|${state.abilities.p2.shatter}${state.abilities.p2.swap}`;
  return `${state.currentTurn}|${b}|${a}`;
}

/**
 * Non-terminal heuristic evaluation for Tactical Overdrive Mode.
 *
 * @param {Object} state
 * @param {string} aiPlayer
 * @returns {number}
 */
export function evaluateTacticalState(state, aiPlayer) {
  const oppPlayer = getOpponent(aiPlayer);
  let score = 0;

  // 1. Line evaluations
  for (let i = 0; i < 8; i++) {
    const line = WINNING_LINES[i];
    let aiCount = 0;
    let oppCount = 0;
    for (let c = 0; c < 3; c++) {
      const val = state.board[line[c]];
      if (val === aiPlayer) aiCount++;
      else if (val === oppPlayer) oppCount++;
    }

    if (aiCount > 0 && oppCount === 0) {
      score += aiCount === 2 ? 100 : 10;
    } else if (oppCount > 0 && aiCount === 0) {
      score -= oppCount === 2 ? 120 : 12;
    }
  }

  // 2. Center and corners
  if (state.board[4] === aiPlayer) score += 25;
  else if (state.board[4] === oppPlayer) score -= 25;

  // 3. Ability charge conservation reserves
  const aiCharges = state.abilities[aiPlayer];
  const oppCharges = state.abilities[oppPlayer];
  score += (aiCharges?.shatter ?? 0) * 45;
  score += (aiCharges?.swap ?? 0) * 40;
  score -= (oppCharges?.shatter ?? 0) * 45;
  score -= (oppCharges?.swap ?? 0) * 40;

  return score;
}

/**
 * Minimax search for Tactical Overdrive Mode.
 */
export function minimaxTactical(
  state,
  depth,
  alpha,
  beta,
  isMaximizing,
  aiPlayer,
  tt = new Map(),
  options = {}
) {
  const opts = options || {};
  if (isCancelled(opts)) {
    return 0;
  }

  const oppPlayer = getOpponent(aiPlayer);

  if (state.status === STATUS.ROUND_OVER) {
    if (state.winner === aiPlayer) return 1000 - depth;
    if (state.winner === oppPlayer) return -1000 + depth;
    return 0;
  }

  if (depth >= TACTICAL_SEARCH_DEPTH) {
    return evaluateTacticalState(state, aiPlayer);
  }

  const key = getTacticalStateKey(state);
  const originalAlpha = alpha;
  const cached = tt.get(key);
  if (cached && cached.depth >= TACTICAL_SEARCH_DEPTH - depth) {
    if (cached.flag === EXACT) return cached.score;
    if (cached.flag === LOWERBOUND && cached.score >= beta) return cached.score;
    if (cached.flag === UPPERBOUND && cached.score <= alpha) return cached.score;
  }

  const moves = getAvailableMoves(state);
  if (moves.length === 0) return 0;

  let bestMove = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      if (isCancelled(opts)) break;
      const nextState = gameReducer(state, move);
      const evalScore = minimaxTactical(nextState, depth + 1, alpha, beta, false, aiPlayer, tt, opts);
      if (evalScore > maxEval) {
        maxEval = evalScore;
        bestMove = move;
      }
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }

    let flag = EXACT;
    if (maxEval <= originalAlpha) flag = UPPERBOUND;
    else if (maxEval >= beta) flag = LOWERBOUND;
    tt.set(key, { depth: TACTICAL_SEARCH_DEPTH - depth, score: maxEval, flag, bestMove });

    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      if (isCancelled(opts)) break;
      const nextState = gameReducer(state, move);
      const evalScore = minimaxTactical(nextState, depth + 1, alpha, beta, true, aiPlayer, tt, opts);
      if (evalScore < minEval) {
        minEval = evalScore;
        bestMove = move;
      }
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }

    let flag = EXACT;
    if (minEval <= originalAlpha) flag = UPPERBOUND;
    else if (minEval >= beta) flag = LOWERBOUND;
    tt.set(key, { depth: TACTICAL_SEARCH_DEPTH - depth, score: minEval, flag, bestMove });

    return minEval;
  }
}

/**
 * Compute the optimal move for Tactical Overdrive Mode.
 *
 * @param {Object} state
 * @param {Object} [options={}]
 * @returns {Object|null}
 */
export function computeBestTacticalMove(state, options = {}) {
  const opts = options || {};
  if (isCancelled(opts)) return null;

  const aiPlayer = state.currentTurn;
  const oppPlayer = getOpponent(aiPlayer);
  const moves = getAvailableMoves(state);
  if (moves.length === 0) return null;

  // 1. Direct Win Check (Placements or Phase Swaps)
  for (const move of moves) {
    const nextState = gameReducer(state, move);
    if (nextState.winner === aiPlayer) {
      return move;
    }
  }

  // 2. Direct Blunder Filter (never pick a Phase Swap that grants opponent a win)
  const safeMoves = moves.filter(move => {
    const nextState = gameReducer(state, move);
    return nextState.winner !== oppPlayer;
  });

  const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;

  // 3. Tactical Minimax with TT
  const tt = new Map();
  let bestMove = candidateMoves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of candidateMoves) {
    if (isCancelled(opts)) break;
    const nextState = gameReducer(state, move);
    const score = minimaxTactical(nextState, 1, alpha, beta, false, aiPlayer, tt, opts);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, score);
  }

  return bestMove;
}

// ============================================================================
// 4. HARD AI STRATEGY CLASS
// ============================================================================

export class HardAiStrategy extends AiStrategy {
  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    const opts = options || {};
    super({
      name: 'Hard AI (Impossible)',
      difficulty: AI_DIFFICULTIES.HARD,
      ...opts
    });
    this.classicEngine = opts.classicEngine || null;
  }

  /**
   * Compute optimal move for active player.
   *
   * @param {Object} state - Current immutable GameState
   * @param {Object} [options={}]
   * @returns {Promise<Object|null> | Object | null} Action object or null
   */
  async computeMove(state, options = {}) {
    const opts = options || {};
    if (this.isCancelled(opts)) {
      return null;
    }

    if (!state || state.status !== STATUS.PLAYING) {
      return null;
    }

    if (state.mode === MODES.GHOST) {
      return computeBestGhostMove(state, opts);
    }

    if (state.mode === MODES.TACTICAL) {
      return computeBestTacticalMove(state, opts);
    }

    // Classic Mode delegation
    if (this.classicEngine && typeof this.classicEngine.computeMove === 'function') {
      return this.classicEngine.computeMove(state, opts);
    }

    // Default classic Alpha-Beta Minimax
    return computeClassicMove(state, opts);
  }
}

registerHardAi(HardAiStrategy);
export { HardAiStrategy as HardAi };
