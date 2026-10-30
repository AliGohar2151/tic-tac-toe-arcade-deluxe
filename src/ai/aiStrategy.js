/**
 * @file aiStrategy.js
 * @description Base interface and strategy factory for Chrono-Tic-Tac-Toe AI opponents.
 * Implements decoupled, testable decision-making with pluggable difficulty tiers.
 * Zero DOM or Web Audio dependencies. Fully immutable state processing.
 */

import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  AI_DIFFICULTIES,
  getOpponent
} from '../core/types.js';
import {
  getAvailableMoves,
  gameReducer,
  checkWin
} from '../core/gameReducer.js';

// Static imports for concrete strategies ensuring factory resolution in isolation
import { EasyAi } from './easyAi.js';
import { MediumAi } from './mediumAi.js';
import { HardAiStrategy, HardAi } from './hardAi.js';

// Re-export concrete strategies for convenient single-point consumption
export { EasyAi, MediumAi, HardAiStrategy, HardAi };

// Strategy registry storage using var and hoisted accessor to eliminate ESM TDZ issues
var strategyRegistry;

function getStrategyRegistry() {
  if (!strategyRegistry) {
    strategyRegistry = new Map();
  }
  return strategyRegistry;
}

var HardAiClass = null;

/**
 * Register or override the HardAi class implementation.
 * @param {typeof AiStrategy} cls
 */
export function registerHardAi(cls) {
  HardAiClass = cls;
  const reg = getStrategyRegistry();
  reg.set(AI_DIFFICULTIES.HARD, cls);
  reg.set('hard', cls);
  reg.set('impossible', cls);
  reg.set('minimax', cls);
}

/**
 * Register an arbitrary AI strategy class for custom difficulty keys.
 * @param {string} key
 * @param {typeof AiStrategy} cls
 */
export function registerAiStrategy(key, cls) {
  if (typeof key === 'string' && cls) {
    getStrategyRegistry().set(key.trim().toLowerCase(), cls);
  }
}

/**
 * Ensure default built-in strategies are registered lazily.
 * Deferred to function invocation time to avoid cyclic ESM evaluation TDZ.
 */
function ensureDefaultStrategies() {
  const reg = getStrategyRegistry();
  if (!reg.has('easy')) {
    reg.set('easy', EasyAi);
    reg.set(AI_DIFFICULTIES.EASY, EasyAi);
  }
  if (!reg.has('medium')) {
    reg.set('medium', MediumAi);
    reg.set(AI_DIFFICULTIES.MEDIUM, MediumAi);
  }
  if (!reg.has('hard')) {
    const cls = HardAiClass || HardAiStrategy;
    reg.set(AI_DIFFICULTIES.HARD, cls);
    reg.set('hard', cls);
    reg.set('impossible', cls);
    reg.set('minimax', cls);
  }
}

/**
 * Unified cancellation predicate helper.
 * Safely inspects all supported cancellation formats on nullable options:
 *  1. options?.cancellationToken?.isCancelled === true
 *  2. options?.signal?.aborted === true (DOM AbortSignal or mock)
 *  3. typeof options?.isCancelled === 'function' && options.isCancelled() === true
 *
 * @param {Object|null|undefined} options - Invocation options
 * @returns {boolean} True if cancellation requested, false otherwise
 */
export function isCancelled(options) {
  if (!options) return false;
  if (options.cancellationToken?.isCancelled) return true;
  if (options.signal?.aborted) return true;
  if (typeof options.isCancelled === 'function' && options.isCancelled()) return true;
  return false;
}

/**
 * Abstract Base Class for all Chrono-Tic-Tac-Toe AI strategies.
 * Implemented as a hoisted prototype constructor to support seamless ES class inheritance
 * across decoupled strategy modules without circular dependency issues.
 *
 * @param {Object} [options={}]
 * @param {() => number} [options.randomFn=Math.random] - Seedable or mockable RNG
 * @param {string} [options.name='AiStrategy'] - Display/debug name
 * @param {string} [options.difficulty='base'] - Tier identifier
 * @param {string} [options.player=null] - Assigned player identifier ('p1'|'p2')
 * @param {string} [options.mode=null] - Assigned game mode
 */
export function AiStrategy(options = {}) {
  const opts = options || {};
  this.randomFn = typeof opts.randomFn === 'function' ? opts.randomFn : Math.random;
  this.name = opts.name || 'AiStrategy';
  this.difficulty = opts.difficulty || 'base';
  this.player = opts.player || null;
  this.mode = opts.mode || null;
  this.options = { ...opts };
}

/**
 * Compute the next action for the active player in `state`.
 * Must be overridden by subclasses.
 *
 * @param {Object} state - Immutable GameState snapshot
 * @param {Object} [options={}] - Invocation options
 * @returns {Promise<Object|null> | Object | null} - Reducer action object or null
 */
AiStrategy.prototype.computeMove = async function(state, options = {}) {
  throw new Error(`[AiStrategy] computeMove() must be implemented by subclass (${this.constructor.name})`);
};

/**
 * Query all strictly legal actions available in the given state.
 * @param {Object} state
 * @returns {Array<Object>}
 */
AiStrategy.prototype.getLegalMoves = function(state) {
  return getAvailableMoves(state);
};

/**
 * Simulate applying an action to an immutable state snapshot.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object} New immutable state snapshot
 */
AiStrategy.prototype.simulateMove = function(state, action) {
  return gameReducer(state, action);
};

/**
 * Determine opponent player identifier.
 * @param {string} player - 'p1' or 'p2'
 * @returns {'p1' | 'p2'}
 */
AiStrategy.prototype.getOpponent = function(player) {
  return getOpponent(player);
};

/**
 * Check whether a cancellation signal has been triggered.
 * Delegates directly to unified isCancelled helper.
 *
 * @param {Object} [options={}]
 * @returns {boolean}
 */
AiStrategy.prototype.isCancelled = function(options = {}) {
  return isCancelled(options);
};

/**
 * Pick a random item from an array using this instance's RNG.
 * @template T
 * @param {ReadonlyArray<T>} items
 * @returns {T|null}
 */
AiStrategy.prototype.randomChoice = function(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const idx = Math.floor(this.randomFn() * items.length);
  return items[idx];
};

/**
 * Fisher-Yates shuffle using this instance's RNG.
 * @template T
 * @param {ReadonlyArray<T>} items
 * @returns {Array<T>}
 */
AiStrategy.prototype.shuffle = function(items) {
  if (!Array.isArray(items)) return [];
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(this.randomFn() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Factory creating an instantiated AI Strategy based on difficulty tier.
 * Supports both standard (difficulty, options) and positional (difficulty, player, mode, options) signatures.
 *
 * @param {string|AiStrategy} difficulty - 'easy', 'medium', 'hard', or existing instance
 * @param {...any} rest - Options bag or positional arguments (player, mode, options)
 * @returns {AiStrategy}
 */
export function createAiStrategy(difficulty, ...rest) {
  // If already an instance of AiStrategy, return directly
  if (difficulty instanceof AiStrategy) {
    return difficulty;
  }

  ensureDefaultStrategies();

  // Parse adaptive positional arguments
  let resolvedOptions = {};

  if (rest.length === 1) {
    const firstArg = rest[0];
    if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg)) {
      resolvedOptions = { ...firstArg };
    } else if (typeof firstArg === 'string') {
      resolvedOptions = { player: firstArg };
    }
  } else if (rest.length > 1) {
    let player = undefined;
    let mode = undefined;
    let extraOpts = {};

    if (typeof rest[0] === 'string') {
      player = rest[0];
    } else if (rest[0] && typeof rest[0] === 'object' && !Array.isArray(rest[0])) {
      extraOpts = { ...extraOpts, ...rest[0] };
    }

    if (typeof rest[1] === 'string') {
      mode = rest[1];
    } else if (rest[1] && typeof rest[1] === 'object' && !Array.isArray(rest[1])) {
      extraOpts = { ...extraOpts, ...rest[1] };
    }

    if (rest[2] && typeof rest[2] === 'object' && !Array.isArray(rest[2])) {
      extraOpts = { ...extraOpts, ...rest[2] };
    }

    resolvedOptions = {
      ...extraOpts,
      ...(player !== undefined ? { player } : {}),
      ...(mode !== undefined ? { mode } : {})
    };
  }

  const rawKey = typeof difficulty === 'string' ? difficulty.trim().toLowerCase() : '';
  const StrategyClass = getStrategyRegistry().get(rawKey);

  if (StrategyClass) {
    return new StrategyClass(resolvedOptions);
  }

  // Hard alias fallbacks
  if (rawKey === 'hard' || rawKey === 'impossible' || rawKey === 'minimax') {
    const cls = HardAiClass || HardAiStrategy;
    return new cls(resolvedOptions);
  }

  // Direct class fallbacks
  if (rawKey === 'easy' || rawKey === AI_DIFFICULTIES.EASY) {
    return new EasyAi(resolvedOptions);
  }
  if (rawKey === 'medium' || rawKey === AI_DIFFICULTIES.MEDIUM) {
    return new MediumAi(resolvedOptions);
  }

  throw new TypeError(`[createAiStrategy] Unrecognized AI difficulty: '${difficulty}'. Valid options: 'easy', 'medium', 'hard'.`);
}
