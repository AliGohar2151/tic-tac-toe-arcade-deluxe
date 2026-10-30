/**
 * @file easyAi.js
 * @description Casual, exploratory AI strategy with intuitive human-like mistakes.
 * Primarily plays casual exploratory moves while occasionally capitalizing on immediate
 * tactical openings. Zero external dependencies.
 */

import {
  STATUS,
  ACTION_TYPES,
  AI_DIFFICULTIES,
  getOpponent
} from '../core/types.js';
import { AiStrategy, registerAiStrategy } from './aiStrategy.js';

export class EasyAi extends AiStrategy {
  /**
   * @param {Object} [options={}]
   * @param {() => number} [options.randomFn=Math.random] - Injected RNG
   * @param {number} [options.mistakeRate=0.75] - Probability of making a casual blunder [0.0 - 1.0]
   * @param {boolean} [options.pureRandom=false] - When true, picks purely randomly among legal moves
   */
  constructor(options = {}) {
    const opts = options || {};
    super({
      name: 'Easy AI (Casual)',
      difficulty: AI_DIFFICULTIES.EASY,
      ...opts
    });

    const rawMistake = opts.mistakeRate ?? 0.75;
    this.mistakeRate = typeof rawMistake === 'number'
      ? Math.max(0, Math.min(1, rawMistake))
      : 0.75;

    this.pureRandom = Boolean(opts.pureRandom);
  }

  /**
   * Compute casual/exploratory move for active player in state.
   *
   * @param {Object} state - Current immutable GameState
   * @param {Object} [options={}]
   * @returns {Promise<Object|null> | Object | null} Action object or null
   */
  async computeMove(state, options = {}) {
    if (this.isCancelled(options)) {
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

    // Separate standard mark placements from tactical abilities
    const placementMoves = legalMoves.filter(m => m.type === ACTION_TYPES.PLACE_MARK);
    const abilityMoves = legalMoves.filter(m => m.type !== ACTION_TYPES.PLACE_MARK);

    // Decision Branch:
    // With probability `mistakeRate` (or when pureRandom is enabled), casual AI makes a human-like
    // exploratory/random move.
    const isBlundering = this.pureRandom || (this.randomFn() < this.mistakeRate);

    if (!isBlundering) {
      // 1. Tactical Awareness: Check if active player can immediately win this turn
      for (const move of legalMoves) {
        if (this.isCancelled(options)) return null;
        const nextState = this.simulateMove(state, move);
        if (nextState.winner === player) {
          return move;
        }
      }

      // 2. Tactical Awareness: Check if opponent has an immediate winning placement threat
      // Casual player notices an opponent threat with 50% chance when in awareness mode
      if (this.randomFn() < 0.50) {
        const opponentHypotheticalState = { ...state, currentTurn: opponent };
        for (const move of placementMoves) {
          if (this.isCancelled(options)) return null;
          const simOpponent = this.simulateMove(opponentHypotheticalState, {
            type: ACTION_TYPES.PLACE_MARK,
            player: opponent,
            index: move.index
          });
          if (simOpponent.winner === opponent) {
            return move; // Block opponent win
          }
        }
      }
    }

    if (this.isCancelled(options)) {
      return null;
    }

    // Casual / Exploratory Fallback:
    // Beginner players prefer straightforward mark placement over complex abilities.
    // If standard placement moves exist, select among them (95% chance), or rarely trigger an ability (5%).
    if (placementMoves.length > 0) {
      if (abilityMoves.length > 0 && this.randomFn() < 0.05) {
        return this.randomChoice(abilityMoves);
      }
      return this.randomChoice(placementMoves);
    }

    // If no placement moves exist (e.g. board full in Tactical mode), select an available ability
    return this.randomChoice(legalMoves);
  }
}

registerAiStrategy('easy', EasyAi);
