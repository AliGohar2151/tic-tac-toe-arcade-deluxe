/**
 * @file types.js
 * @description Core data models, constants, action schemas, and validation utilities
 * for Chrono-Tic-Tac-Toe. Zero external dependencies. Zero DOM dependencies.
 */

/**
 * Player Identifiers
 * @readonly
 * @enum {string}
 */
export const PLAYERS = Object.freeze({
  P1: 'p1',
  P2: 'p2'
});

/**
 * Visual Mark Symbols
 * @readonly
 */
export const PLAYER_MARKS = Object.freeze({
  p1: 'X',
  p2: 'O'
});

/**
 * Rapid Opponent Lookup Map
 * @readonly
 */
export const OPPONENTS = Object.freeze({
  p1: 'p2',
  p2: 'p1'
});

/**
 * Game Modes
 * @readonly
 * @enum {string}
 */
export const MODES = Object.freeze({
  CLASSIC: 'classic',
  GHOST: 'ghost',
  TACTICAL: 'tactical'
});

/**
 * Game Lifecycle Statuses
 * @readonly
 * @enum {string}
 */
export const STATUS = Object.freeze({
  SETUP: 'SETUP',
  PLAYING: 'PLAYING',
  ROUND_OVER: 'ROUND_OVER',
  PAUSED: 'PAUSED'
});

/**
 * Alias for backward / cross compatibility
 */
export const GAME_STATUS = STATUS;

/**
 * AI Opponent Difficulty Tiers
 * @readonly
 * @enum {string}
 */
export const AI_DIFFICULTIES = Object.freeze({
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
});

/**
 * Match Setup Types
 * @readonly
 * @enum {string}
 */
export const GAME_TYPES = Object.freeze({
  PVP: 'pvp',
  PVC: 'pvc'
});

/**
 * Action Types recognized by the State Reducer & Mutex Controller
 * @readonly
 * @enum {string}
 */
export const ACTION_TYPES = Object.freeze({
  PLACE_MARK: 'PLACE_MARK',
  USE_SHATTER: 'USE_SHATTER',
  USE_SWAP: 'USE_SWAP',
  TIMEOUT_AUTO_MOVE: 'TIMEOUT_AUTO_MOVE',
  START_ROUND: 'START_ROUND',
  RESET_ROUND: 'RESET_ROUND'
});

/**
 * System-wide Event Names published through the EventBus mediator
 * @readonly
 * @enum {string}
 */
export const EVENT_TYPES = Object.freeze({
  STATE_CHANGED: 'STATE_CHANGED',
  MOVE_APPLIED: 'MOVE_APPLIED',
  GHOST_VANISHED: 'GHOST_VANISHED',
  ABILITY_USED: 'ABILITY_USED',
  TURN_CHANGED: 'TURN_CHANGED',
  ROUND_STARTED: 'ROUND_STARTED',
  GAME_OVER: 'GAME_OVER',
  GAME_RESET: 'GAME_RESET',
  BLITZ_TICK: 'BLITZ_TICK',
  BLITZ_WARNING: 'BLITZ_WARNING',
  BLITZ_TIMEOUT: 'BLITZ_TIMEOUT',
  BLITZ_PAUSED: 'BLITZ_PAUSED',
  BLITZ_RESUMED: 'BLITZ_RESUMED',
  ACTION_REJECTED: 'ACTION_REJECTED',
  ERROR: 'ERROR',
  WILDCARD: '*'
});

/**
 * Alias for backward / cross compatibility
 */
export const GAME_EVENTS = EVENT_TYPES;

/**
 * All 8 winning 3-in-a-row combinations on a standard 3x3 grid (cells 0-8)
 * 3 Rows, 3 Columns, 2 Diagonals.
 * @readonly
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
export const WINNING_LINES = Object.freeze([
  Object.freeze([0, 1, 2]), // Row 0
  Object.freeze([3, 4, 5]), // Row 1
  Object.freeze([6, 7, 8]), // Row 2
  Object.freeze([0, 3, 6]), // Col 0
  Object.freeze([1, 4, 7]), // Col 1
  Object.freeze([2, 5, 8]), // Col 2
  Object.freeze([0, 4, 8]), // Diagonal \
  Object.freeze([2, 4, 6])  // Diagonal /
]);

/**
 * Alias for WINNING_LINES
 */
export const WINNING_COMBINATIONS = WINNING_LINES;

/**
 * Orthogonal and Diagonal Adjacency Map for 3x3 grid (cells 0-8)
 * Chebyshev distance <= 1: |r1 - r2| <= 1 && |c1 - c2| <= 1 (excluding identity)
 * Used for strict validation of Tactical Overdrive 'Phase Swap'.
 * @readonly
 */
export const ADJACENCY_LIST = Object.freeze({
  0: Object.freeze([1, 3, 4]),
  1: Object.freeze([0, 2, 3, 4, 5]),
  2: Object.freeze([1, 4, 5]),
  3: Object.freeze([0, 1, 4, 6, 7]),
  4: Object.freeze([0, 1, 2, 3, 5, 6, 7, 8]),
  5: Object.freeze([1, 2, 4, 7, 8]),
  6: Object.freeze([3, 4, 7]),
  7: Object.freeze([3, 4, 5, 6, 8]),
  8: Object.freeze([4, 5, 7])
});

/**
 * Chrono Ghost Mode Tuning Constants
 * @readonly
 */
export const GHOST_CONFIG = Object.freeze({
  MAX_MARKS: 3,
  MAX_TURNS: 30
});

/**
 * Tactical Overdrive Mode Tuning Constants
 * @readonly
 */
export const TACTICAL_CONFIG = Object.freeze({
  INITIAL_CHARGES: Object.freeze({
    shatter: 1,
    swap: 1
  })
});

/**
 * Blitz Speed Modifier Tuning Constants
 * @readonly
 */
export const BLITZ_CONFIG = Object.freeze({
  DEFAULT_DURATION_SEC: 5,
  WARNING_THRESHOLD_SEC: 1.5,
  TICK_INTERVAL_MS: 50
});

/**
 * Determine opponent player ID
 * @param {string} player
 * @returns {'p1' | 'p2'}
 */
export function getOpponent(player) {
  return player === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;
}

/**
 * Validate player ID
 * @param {any} player
 * @returns {boolean}
 */
export function isValidPlayer(player) {
  return player === PLAYERS.P1 || player === PLAYERS.P2;
}

/**
 * Validate cell index (integer 0-8)
 * @param {any} index
 * @returns {boolean}
 */
export function isValidCellIndex(index) {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= 8;
}

/**
 * Validate game mode string
 * @param {any} mode
 * @returns {boolean}
 */
export function isValidMode(mode) {
  return Object.values(MODES).includes(mode);
}

/**
 * Test if two cell indices are orthogonal or diagonal neighbors on a 3x3 grid
 * @param {number} indexA
 * @param {number} indexB
 * @returns {boolean}
 */
export function areAdjacent(indexA, indexB) {
  if (!isValidCellIndex(indexA) || !isValidCellIndex(indexB) || indexA === indexB) {
    return false;
  }
  const neighbors = ADJACENCY_LIST[indexA];
  return neighbors ? neighbors.includes(indexB) : false;
}

/**
 * Alias for areAdjacent
 * @param {number} indexA
 * @param {number} indexB
 * @returns {boolean}
 */
export function areCellsAdjacent(indexA, indexB) {
  return areAdjacent(indexA, indexB);
}

/**
 * Calculate visual aging stages and eviction warnings for a Ghost FIFO queue
 * Age 1: Freshly placed (newest)
 * Age 2: Intermediate
 * Age 3: Critical (oldest, vanishes on next placement by this player)
 *
 * @param {ReadonlyArray<number>} queue - Array of cell indices ordered [oldest, ..., newest]
 * @returns {Array<{ cellIndex: number, queueIndex: number, age: number, isExpiringNext: boolean }>}
 */
export function getGhostLifespans(queue) {
  if (!Array.isArray(queue)) return [];
  const len = queue.length;
  return queue.map((cellIndex, idx) => ({
    cellIndex,
    queueIndex: idx,
    age: len - idx,
    isExpiringNext: idx === 0 && len >= GHOST_CONFIG.MAX_MARKS
  }));
}

/**
 * Map cell indices to their aging metadata for quick O(1) lookups
 * @param {ReadonlyArray<number>} queue
 * @returns {Record<number, { cellIndex: number, queueIndex: number, age: number, isExpiringNext: boolean }>}
 */
export function getGhostAgingMap(queue) {
  const map = {};
  for (const item of getGhostLifespans(queue)) {
    map[item.cellIndex] = item;
  }
  return map;
}

/**
 * Perform static schema validation on action objects prior to reducer processing
 * @param {any} action
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateActionSchema(action) {
  if (!action || typeof action !== 'object') {
    return { valid: false, error: 'Action must be a non-null object' };
  }

  switch (action.type) {
    case ACTION_TYPES.PLACE_MARK:
    case ACTION_TYPES.TIMEOUT_AUTO_MOVE:
      if (!isValidPlayer(action.player)) {
        return { valid: false, error: `Invalid or missing player: ${action.player}` };
      }
      if (!isValidCellIndex(action.index)) {
        return { valid: false, error: `Invalid cell index: ${action.index}` };
      }
      return { valid: true };

    case ACTION_TYPES.USE_SHATTER:
      if (!isValidPlayer(action.player)) {
        return { valid: false, error: `Invalid or missing player: ${action.player}` };
      }
      if (!isValidCellIndex(action.targetIndex)) {
        return { valid: false, error: `Invalid targetIndex: ${action.targetIndex}` };
      }
      return { valid: true };

    case ACTION_TYPES.USE_SWAP:
      if (!isValidPlayer(action.player)) {
        return { valid: false, error: `Invalid or missing player: ${action.player}` };
      }
      if (!isValidCellIndex(action.indexA) || !isValidCellIndex(action.indexB)) {
        return { valid: false, error: 'Swap requires valid cell indices for indexA and indexB' };
      }
      if (action.indexA === action.indexB) {
        return { valid: false, error: 'indexA and indexB must be distinct' };
      }
      if (!areAdjacent(action.indexA, action.indexB)) {
        return { valid: false, error: `Cells ${action.indexA} and ${action.indexB} are not adjacent` };
      }
      return { valid: true };

    case ACTION_TYPES.START_ROUND:
    case ACTION_TYPES.RESET_ROUND:
      return { valid: true };

    default:
      return { valid: false, error: `Unknown action type: ${action.type}` };
  }
}

/**
 * Pure factory creating a canonical initial GameState snapshot
 * @param {Object} [options={}]
 * @returns {GameState}
 */
export function createInitialState(options = {}) {
  const mode = isValidMode(options.mode) ? options.mode : MODES.CLASSIC;
  const startingPlayer = isValidPlayer(options.startingPlayer) ? options.startingPlayer : PLAYERS.P1;
  const blitzDuration = options.blitzDuration ?? (options.isBlitz || options.blitz ? BLITZ_CONFIG.DEFAULT_DURATION_SEC : null);
  const blitzEnabled = Boolean(options.isBlitz || options.blitz || blitzDuration !== null);
  const status = options.status || STATUS.PLAYING;
  const maxGhostMarks = options.maxGhostMarks ?? GHOST_CONFIG.MAX_MARKS;
  const maxGhostTurns = options.maxGhostTurns ?? GHOST_CONFIG.MAX_TURNS;

  return Object.freeze({
    mode,
    status,
    board: Object.freeze(new Array(9).fill(null)),
    currentTurn: startingPlayer,
    startingPlayer,
    p1Queue: Object.freeze([]),
    p2Queue: Object.freeze([]),
    abilities: Object.freeze({
      [PLAYERS.P1]: Object.freeze({
        shatter: mode === MODES.TACTICAL ? TACTICAL_CONFIG.INITIAL_CHARGES.shatter : 0,
        swap: mode === MODES.TACTICAL ? TACTICAL_CONFIG.INITIAL_CHARGES.swap : 0
      }),
      [PLAYERS.P2]: Object.freeze({
        shatter: mode === MODES.TACTICAL ? TACTICAL_CONFIG.INITIAL_CHARGES.shatter : 0,
        swap: mode === MODES.TACTICAL ? TACTICAL_CONFIG.INITIAL_CHARGES.swap : 0
      })
    }),
    winner: null,
    winningLine: null,
    turnCount: 0,
    lastEviction: null,
    lastActionEffect: null,
    moveHistory: Object.freeze([]),
    lastAction: null,
    maxGhostMarks,
    maxGhostTurns,
    blitz: Object.freeze({
      enabled: blitzEnabled,
      duration: blitzDuration || BLITZ_CONFIG.DEFAULT_DURATION_SEC,
      timeLeft: blitzDuration || BLITZ_CONFIG.DEFAULT_DURATION_SEC
    }),
    meta: Object.freeze({
      gameType: options.gameType || GAME_TYPES.PVP,
      aiDifficulty: options.aiDifficulty || AI_DIFFICULTIES.HARD,
      createdAt: options.createdAt || Date.now()
    })
  });
}

/**
 * Perform a deep, mutable clone of a state object for use in Reducers or AI simulations
 * @param {Object} state
 * @returns {Object}
 */
export function cloneState(state) {
  if (!state || typeof state !== 'object') return state;
  return {
    mode: state.mode,
    status: state.status,
    board: [...state.board],
    currentTurn: state.currentTurn,
    startingPlayer: state.startingPlayer,
    p1Queue: [...state.p1Queue],
    p2Queue: [...state.p2Queue],
    abilities: {
      [PLAYERS.P1]: { ...(state.abilities?.[PLAYERS.P1] || state.abilities?.p1) },
      [PLAYERS.P2]: { ...(state.abilities?.[PLAYERS.P2] || state.abilities?.p2) }
    },
    winner: state.winner,
    winningLine: state.winningLine ? [...state.winningLine] : null,
    turnCount: state.turnCount,
    lastEviction: state.lastEviction ? { ...state.lastEviction } : null,
    lastActionEffect: state.lastActionEffect ? { ...state.lastActionEffect } : null,
    moveHistory: state.moveHistory ? [...state.moveHistory] : [],
    lastAction: state.lastAction ? { ...state.lastAction } : null,
    maxGhostMarks: state.maxGhostMarks,
    maxGhostTurns: state.maxGhostTurns,
    blitz: state.blitz ? { ...state.blitz } : null,
    meta: state.meta ? { ...state.meta } : null
  };
}

/**
 * Serialize state to a canonical JSON string
 * @param {Object} state
 * @returns {string}
 */
export function serializeState(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('serializeState expects a valid state object');
  }
  return JSON.stringify(state);
}

/**
 * Deserialize and validate a state snapshot from JSON
 * @param {string} jsonString
 * @returns {Object}
 */
export function deserializeState(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new TypeError('deserializeState expects a JSON string');
  }
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Deserialized state must be an object');
  }
  if (!Array.isArray(parsed.board) || parsed.board.length !== 9) {
    throw new Error('Deserialized state contains invalid board');
  }
  if (!isValidPlayer(parsed.currentTurn)) {
    throw new Error(`Deserialized state contains invalid currentTurn: ${parsed.currentTurn}`);
  }
  if (!isValidMode(parsed.mode)) {
    throw new Error(`Deserialized state contains invalid mode: ${parsed.mode}`);
  }
  if (!Array.isArray(parsed.p1Queue) || !Array.isArray(parsed.p2Queue)) {
    throw new Error('Deserialized state contains invalid queues');
  }
  if (!parsed.abilities || typeof parsed.abilities !== 'object') {
    throw new Error('Deserialized state contains invalid abilities');
  }
  return cloneState(parsed);
}
