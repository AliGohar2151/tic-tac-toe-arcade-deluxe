/**
 * @file mediumAi.js
 * @description Tactical heuristic AI opponent for Chrono-Tic-Tac-Toe.
 * Implements a 4-tier decision priority hierarchy:
 * 1. Winning move (immediate victory detection in Classic, Ghost, & Tactical)
 * 2. Blocking move & Fork Mitigation (prevent immediate opponent victory lines, shatter fork pivot)
 * 3. Tactical abilities (Shatter threats/center, safe Phase Swap disruption)
 * 4. Strategic cell preference (Center -> Corners -> Edges)
 * Zero external dependencies. Fully deterministic when injected with a custom RNG.
 */

import {
  STATUS,
  MODES,
  ACTION_TYPES,
  AI_DIFFICULTIES,
  WINNING_LINES,
  getOpponent
} from '../core/types.js';
import { AiStrategy, registerAiStrategy } from './aiStrategy.js';

export class MediumAi extends AiStrategy {
  /**
   * @param {Object} [options={}]
   * @param {() => number} [options.randomFn=Math.random] - Injected RNG for tie-breaking
   */
  constructor(options = {}) {
    const opts = options || {};
    super({
      name: 'Medium AI (Tactical)',
      difficulty: AI_DIFFICULTIES.MEDIUM,
      ...opts
    });

    this.centerCell = 4;
    this.cornerCells = Object.freeze([0, 2, 6, 8]);
    this.edgeCells = Object.freeze([1, 3, 5, 7]);
  }

  /**
   * Compute tactical heuristic move for active player.
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

    const legalMoves = this.getLegalMoves(state);
    if (!legalMoves || legalMoves.length === 0) {
      return null;
    }

    const player = state.currentTurn;
    const opponent = this.getOpponent(player);

    const placementMoves = legalMoves.filter(m => m.type === ACTION_TYPES.PLACE_MARK);
    const shatterMoves = legalMoves.filter(m => m.type === ACTION_TYPES.USE_SHATTER);
    const swapMoves = legalMoves.filter(m => m.type === ACTION_TYPES.USE_SWAP);

    // Filter out suicidal Phase Swap moves that directly award victory to opponent per gameReducer.js:360-366
    const safeSwapMoves = swapMoves.filter(m => this.simulateMove(state, m).winner !== opponent);

    // ========================================================================
    // PRIORITY 1: Winning Move
    // Check if any legal move (placement, shatter, or swap) immediately wins
    // ========================================================================
    for (const move of legalMoves) {
      if (this.isCancelled(opts)) return null;
      const simState = this.simulateMove(state, move);
      if (simState.winner === player) {
        return move;
      }
    }

    // ========================================================================
    // PRIORITY 2: Blocking Move & Tactical Fork Mitigation
    // Detect if opponent could win on their next placement, and block it
    // ========================================================================
    const opponentThreatCells = [];
    const opponentHypotheticalState = { ...state, currentTurn: opponent };
    for (let idx = 0; idx < 9; idx++) {
      if (this.isCancelled(opts)) return null;
      if (state.board[idx] === null) {
        const simOpponent = this.simulateMove(opponentHypotheticalState, {
          type: ACTION_TYPES.PLACE_MARK,
          player: opponent,
          index: idx
        });
        if (simOpponent.winner === opponent) {
          opponentThreatCells.push(idx);
        }
      }
    }

    if (opponentThreatCells.length > 0) {
      // 2A: Tactical counter-measure for dual forks (opponentThreatCells.length > 1)
      // When opponent threatens multiple winning cells simultaneously, single placement blocking
      // cannot prevent defeat. Prioritize Shatter or safe Swap on the pivot mark.
      if (opponentThreatCells.length > 1 && state.mode === MODES.TACTICAL) {
        // Count how many threat lines each opponent mark participates in
        const threatMarkCounts = new Map();
        for (const threatCell of opponentThreatCells) {
          for (const line of WINNING_LINES) {
            if (line.includes(threatCell)) {
              const otherCells = line.filter(c => c !== threatCell);
              const isActualThreatLine = otherCells.every(c => state.board[c] === opponent);
              if (isActualThreatLine) {
                for (const markIdx of otherCells) {
                  threatMarkCounts.set(markIdx, (threatMarkCounts.get(markIdx) || 0) + 1);
                }
              }
            }
          }
        }

        // Sort threat marks descending: pivot mark participating in >= 2 lines comes first
        const sortedThreatMarks = Array.from(threatMarkCounts.keys())
          .sort((a, b) => threatMarkCounts.get(b) - threatMarkCounts.get(a));

        // Prioritize Shatter on the pivot mark
        if (shatterMoves.length > 0) {
          for (const markIdx of sortedThreatMarks) {
            const shatterBlock = shatterMoves.find(m => m.targetIndex === markIdx);
            if (shatterBlock) {
              return shatterBlock;
            }
          }
        }

        // Prioritize Safe Phase Swap on the threatening mark
        if (safeSwapMoves.length > 0) {
          for (const markIdx of sortedThreatMarks) {
            const swapBlock = safeSwapMoves.find(m => m.indexA === markIdx || m.indexB === markIdx);
            if (swapBlock) {
              return swapBlock;
            }
          }
        }
      }

      // 2B: Direct placement block (single threat, or fork when tactical abilities unavailable)
      const directBlock = placementMoves.find(m => opponentThreatCells.includes(m.index));
      if (directBlock) {
        return directBlock;
      }

      // 2C: Fallback tactical counter-measure if placement is not possible (e.g. board full)
      if (state.mode === MODES.TACTICAL) {
        const threatMarks = new Set();
        for (const threatCell of opponentThreatCells) {
          for (const line of WINNING_LINES) {
            if (line.includes(threatCell)) {
              for (const markIdx of line) {
                if (state.board[markIdx] === opponent) {
                  threatMarks.add(markIdx);
                }
              }
            }
          }
        }

        const shatterBlock = shatterMoves.find(m => threatMarks.has(m.targetIndex));
        if (shatterBlock) {
          return shatterBlock;
        }

        const swapBlock = safeSwapMoves.find(m => threatMarks.has(m.indexA) || threatMarks.has(m.indexB));
        if (swapBlock) {
          return swapBlock;
        }
      }
    }

    if (this.isCancelled(opts)) {
      return null;
    }

    // ========================================================================
    // PRIORITY 3: Tactical Abilities (Tactical Overdrive Mode)
    // Disrupt opponent setups or secure positional dominance
    // ========================================================================
    if (state.mode === MODES.TACTICAL) {
      // 3A: Shatter Abilities
      if (shatterMoves.length > 0) {
        // Disrupt opponent 2-in-a-row setups
        for (const line of WINNING_LINES) {
          const marksOnLine = line.map(idx => state.board[idx]);
          const oppCount = marksOnLine.filter(m => m === opponent).length;
          const emptyCount = marksOnLine.filter(m => m === null).length;

          if (oppCount === 2 && emptyCount === 1) {
            const oppIdx = line.find(idx => state.board[idx] === opponent);
            const shatterSetup = shatterMoves.find(m => m.targetIndex === oppIdx);
            if (shatterSetup) {
              return shatterSetup;
            }
          }
        }

        // Shatter opponent in center cell 4 if opponent has built presence
        const opponentMarkCount = state.board.filter(cell => cell === opponent).length;
        if (opponentMarkCount >= 2 && state.board[this.centerCell] === opponent) {
          const shatterCenter = shatterMoves.find(m => m.targetIndex === this.centerCell);
          if (shatterCenter) {
            return shatterCenter;
          }
        }
      }

      // 3B: Phase Swap Abilities (Safe Swaps Only)
      if (safeSwapMoves.length > 0) {
        // Swap friendly mark into center cell 4 from adjacent cell if enemy occupies center
        if (state.board[this.centerCell] === opponent) {
          const swapToCenter = safeSwapMoves.find(m => m.indexA === this.centerCell || m.indexB === this.centerCell);
          if (swapToCenter) {
            return swapToCenter;
          }
        }

        // Disrupt opponent 2-in-a-row by swapping adjacent friendly mark with one of them
        for (const line of WINNING_LINES) {
          const marksOnLine = line.map(idx => state.board[idx]);
          const oppCount = marksOnLine.filter(m => m === opponent).length;
          if (oppCount === 2) {
            for (const oppIdx of line) {
              if (state.board[oppIdx] === opponent) {
                const swapDisrupt = safeSwapMoves.find(m => m.indexA === oppIdx || m.indexB === oppIdx);
                if (swapDisrupt) {
                  return swapDisrupt;
                }
              }
            }
          }
        }
      }
    }

    if (this.isCancelled(opts)) {
      return null;
    }

    // ========================================================================
    // PRIORITY 4: Strategic Cell Preference
    // Center (4) -> Corners (0, 2, 6, 8) -> Edges (1, 3, 5, 7)
    // ========================================================================
    if (placementMoves.length > 0) {
      // 4A: Center cell 4
      const centerMove = placementMoves.find(m => m.index === this.centerCell);
      if (centerMove) {
        return centerMove;
      }

      // 4B: Corner cells [0, 2, 6, 8]
      const availableCorners = placementMoves.filter(m => this.cornerCells.includes(m.index));
      if (availableCorners.length > 0) {
        return this.randomChoice(availableCorners);
      }

      // 4C: Edge cells [1, 3, 5, 7]
      const availableEdges = placementMoves.filter(m => this.edgeCells.includes(m.index));
      if (availableEdges.length > 0) {
        return this.randomChoice(availableEdges);
      }
    }

    // ========================================================================
    // FALLBACK
    // If no placement moves matched or only tactical abilities remain
    // Prefer safe moves to prevent blunder losses in edge cases
    // ========================================================================
    const safeMoves = legalMoves.filter(m => this.simulateMove(state, m).winner !== opponent);
    return (safeMoves.length > 0 ? safeMoves[0] : legalMoves[0]) || null;
  }
}

registerAiStrategy('medium', MediumAi);
