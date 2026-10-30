/**
 * @file gameReducer.js
 * @description Pure deterministic state reducer for Chrono-Tic-Tac-Toe.
 * Handles Classic, Chrono Ghost (FIFO decay), and Tactical Overdrive (Shatter/Phase Swap).
 * Zero external dependencies. Zero DOM or Web Audio dependencies. Fully immutable.
 */

import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  WINNING_LINES,
  areAdjacent,
  areCellsAdjacent,
  createInitialState,
  GHOST_CONFIG
} from './types.js';

export {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  WINNING_LINES,
  areAdjacent,
  areCellsAdjacent,
  createInitialState
};

/**
 * Check if the current board contains a winning 3-in-a-row combination.
 * @param {ReadonlyArray<string|null>} board - 9-element cell array
 * @param {string|null} [targetPlayer=null] - Optional player to evaluate specifically
 * @returns {{ winner: 'p1' | 'p2' | null, line: ReadonlyArray<number> | null }}
 */
export function checkWin(board, targetPlayer = null) {
  if (!Array.isArray(board) || board.length !== 9) {
    return { winner: null, line: null };
  }

  if (targetPlayer) {
    for (const line of WINNING_LINES) {
      if (board[line[0]] === targetPlayer &&
          board[line[1]] === targetPlayer &&
          board[line[2]] === targetPlayer) {
        return { winner: targetPlayer, line: Object.freeze([...line]) };
      }
    }
    return { winner: null, line: null };
  }

  for (const player of [PLAYERS.P1, PLAYERS.P2]) {
    for (const line of WINNING_LINES) {
      if (board[line[0]] === player &&
          board[line[1]] === player &&
          board[line[2]] === player) {
        return { winner: player, line: Object.freeze([...line]) };
      }
    }
  }

  return { winner: null, line: null };
}

/**
 * Check if the game has ended in a draw / stalemate.
 * @param {ReadonlyArray<string|null>} board
 * @param {string} [mode=MODES.CLASSIC]
 * @param {number} [turnCount=0]
 * @param {Object} [options={}]
 * @returns {boolean}
 */
export function checkDraw(board, mode = MODES.CLASSIC, turnCount = 0, options = {}) {
  if (!Array.isArray(board) || board.length !== 9) return false;

  if (mode === MODES.CLASSIC || mode === MODES.TACTICAL) {
    return board.every(cell => cell !== null);
  }

  if (mode === MODES.GHOST) {
    const maxTurns = options.maxGhostTurns ?? GHOST_CONFIG.MAX_TURNS;
    return turnCount >= maxTurns;
  }

  return false;
}

/**
 * Validate an action against the current state before reducing.
 * Returns an object with valid flag, error code, and human-readable reason.
 * @param {Object} state
 * @param {Object} action
 * @returns {{ valid: boolean, code: string | null, reason: string | null }}
 */
export function validateAction(state, action) {
  if (!state || typeof state !== 'object') {
    return { valid: false, code: 'INVALID_STATE', reason: 'State is missing or not an object.' };
  }

  if (!action || typeof action !== 'object' || !action.type) {
    return { valid: false, code: 'INVALID_ACTION', reason: 'Action is missing or lacks a type.' };
  }

  // Lifecycle actions bypass game status check
  if (action.type === ACTION_TYPES.START_ROUND || action.type === ACTION_TYPES.RESET_ROUND) {
    return { valid: true, code: null, reason: null };
  }

  // Guard: Game must be in active PLAYING status
  if (state.status !== STATUS.PLAYING) {
    return {
      valid: false,
      code: 'GAME_NOT_ACTIVE',
      reason: `Action rejected: game is in ${state.status} state, moves only allowed in PLAYING state.`
    };
  }

  // Guard: Active player turn
  if (!action.player || action.player !== state.currentTurn) {
    return {
      valid: false,
      code: 'OUT_OF_TURN',
      reason: `Out of turn: expected ${state.currentTurn}, got ${action.player}.`
    };
  }

  const opponent = action.player === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;

  switch (action.type) {
    case ACTION_TYPES.PLACE_MARK:
    case ACTION_TYPES.TIMEOUT_AUTO_MOVE: {
      if (typeof action.index !== 'number' || !Number.isInteger(action.index) || action.index < 0 || action.index > 8) {
        return { valid: false, code: 'OUT_OF_BOUNDS', reason: `Cell index ${action.index} is out of bounds [0-8].` };
      }
      if (state.board[action.index] !== null) {
        return { valid: false, code: 'CELL_OCCUPIED', reason: `Cell ${action.index} is already occupied by ${state.board[action.index]}.` };
      }
      return { valid: true, code: null, reason: null };
    }

    case ACTION_TYPES.USE_SHATTER: {
      if (state.mode !== MODES.TACTICAL) {
        return { valid: false, code: 'MODE_DISALLOWS_ABILITY', reason: 'Shatter ability is only available in Tactical mode.' };
      }
      const charges = state.abilities?.[action.player]?.shatter ?? 0;
      if (charges <= 0) {
        return { valid: false, code: 'NO_CHARGES_REMAINING', reason: `Player ${action.player} has no Shatter charges remaining.` };
      }
      if (typeof action.targetIndex !== 'number' || !Number.isInteger(action.targetIndex) || action.targetIndex < 0 || action.targetIndex > 8) {
        return { valid: false, code: 'OUT_OF_BOUNDS', reason: `Target index ${action.targetIndex} is out of bounds [0-8].` };
      }
      if (state.board[action.targetIndex] !== opponent) {
        return {
          valid: false,
          code: 'INVALID_TARGET',
          reason: `Shatter must target an opponent mark. Cell ${action.targetIndex} holds ${state.board[action.targetIndex] || 'empty'}.`
        };
      }
      return { valid: true, code: null, reason: null };
    }

    case ACTION_TYPES.USE_SWAP: {
      if (state.mode !== MODES.TACTICAL) {
        return { valid: false, code: 'MODE_DISALLOWS_ABILITY', reason: 'Phase Swap ability is only available in Tactical mode.' };
      }
      const charges = state.abilities?.[action.player]?.swap ?? 0;
      if (charges <= 0) {
        return { valid: false, code: 'NO_CHARGES_REMAINING', reason: `Player ${action.player} has no Phase Swap charges remaining.` };
      }
      const { indexA, indexB } = action;
      if (typeof indexA !== 'number' || typeof indexB !== 'number' || !Number.isInteger(indexA) || !Number.isInteger(indexB)) {
        return { valid: false, code: 'INVALID_SWAP_INDICES', reason: 'Swap indices must be valid integers.' };
      }
      if (indexA < 0 || indexA > 8 || indexB < 0 || indexB > 8 || indexA === indexB) {
        return { valid: false, code: 'INVALID_SWAP_INDICES', reason: `Swap indices ${indexA} and ${indexB} must be distinct within [0-8].` };
      }
      if (!areAdjacent(indexA, indexB)) {
        return { valid: false, code: 'CELLS_NOT_ADJACENT', reason: `Cells ${indexA} and ${indexB} are not adjacent.` };
      }
      const valA = state.board[indexA];
      const valB = state.board[indexB];
      const hasFriendly = valA === action.player || valB === action.player;
      const hasEnemy = valA === opponent || valB === opponent;

      if (!hasFriendly || !hasEnemy) {
        return {
          valid: false,
          code: 'INVALID_SWAP_TARGETS',
          reason: 'Phase Swap requires exactly one friendly mark and one adjacent enemy mark.'
        };
      }
      return { valid: true, code: null, reason: null };
    }

    default:
      return { valid: false, code: 'UNKNOWN_ACTION_TYPE', reason: `Unrecognized action type: '${action.type}'.` };
  }
}

/**
 * Pure deterministic state reducer.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object} New immutable state snapshot or original state reference if invalid action.
 */
export function gameReducer(state, action) {
  const validation = validateAction(state, action);
  if (!validation.valid) {
    return state;
  }

  const { type, player } = action;
  const opponent = player === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;

  switch (type) {
    case ACTION_TYPES.START_ROUND: {
      return createInitialState({
        mode: action.mode || state.mode,
        startingPlayer: action.startingPlayer || PLAYERS.P1,
        maxGhostMarks: state.maxGhostMarks,
        maxGhostTurns: state.maxGhostTurns
      });
    }

    case ACTION_TYPES.RESET_ROUND: {
      return createInitialState({
        mode: state.mode,
        startingPlayer: PLAYERS.P1,
        maxGhostMarks: state.maxGhostMarks,
        maxGhostTurns: state.maxGhostTurns
      });
    }

    case ACTION_TYPES.PLACE_MARK:
    case ACTION_TYPES.TIMEOUT_AUTO_MOVE: {
      const { index } = action;
      const newBoard = [...state.board];
      const p1Queue = [...state.p1Queue];
      const p2Queue = [...state.p2Queue];
      const currentQueue = player === PLAYERS.P1 ? p1Queue : p2Queue;
      let lastEviction = null;

      // 1. Chrono Ghost FIFO eviction (executed BEFORE placing new mark)
      if (state.mode === MODES.GHOST && currentQueue.length >= state.maxGhostMarks) {
        const evictedIndex = currentQueue.shift();
        newBoard[evictedIndex] = null;
        lastEviction = Object.freeze({ player, index: evictedIndex });
      }

      // 2. Place new mark
      newBoard[index] = player;
      currentQueue.push(index);

      // 3. Evaluate win condition strictly after eviction
      const winResult = checkWin(newBoard, player);
      const isWin = winResult.winner !== null;

      // 4. Evaluate draw condition
      const nextTurnCount = state.turnCount + 1;
      const isDraw = !isWin && checkDraw(newBoard, state.mode, nextTurnCount, {
        maxGhostTurns: state.maxGhostTurns
      });

      const nextStatus = (isWin || isDraw) ? STATUS.ROUND_OVER : STATUS.PLAYING;
      const winner = isWin ? player : (isDraw ? 'draw' : null);
      const winningLine = isWin ? winResult.line : null;

      return Object.freeze({
        ...state,
        board: Object.freeze(newBoard),
        currentTurn: nextStatus === STATUS.ROUND_OVER ? state.currentTurn : opponent,
        status: nextStatus,
        p1Queue: Object.freeze(p1Queue),
        p2Queue: Object.freeze(p2Queue),
        winner,
        winningLine,
        turnCount: nextTurnCount,
        lastEviction,
        lastActionEffect: Object.freeze({
          type,
          player,
          index,
          evictedIndex: lastEviction ? lastEviction.index : null
        }),
        lastAction: Object.freeze({ ...action }),
        moveHistory: Object.freeze([...state.moveHistory, Object.freeze({ ...action })])
      });
    }

    case ACTION_TYPES.USE_SHATTER: {
      const { targetIndex } = action;
      const newBoard = [...state.board];
      newBoard[targetIndex] = null;

      // Filter destroyed mark out of queues
      const p1Queue = state.p1Queue.filter(i => i !== targetIndex);
      const p2Queue = state.p2Queue.filter(i => i !== targetIndex);

      const nextAbilities = {
        ...state.abilities,
        [player]: Object.freeze({
          ...state.abilities[player],
          shatter: 0
        })
      };

      const nextTurnCount = state.turnCount + 1;

      return Object.freeze({
        ...state,
        board: Object.freeze(newBoard),
        p1Queue: Object.freeze(p1Queue),
        p2Queue: Object.freeze(p2Queue),
        abilities: Object.freeze(nextAbilities),
        currentTurn: opponent,
        turnCount: nextTurnCount,
        lastEviction: null,
        lastActionEffect: Object.freeze({
          type: ACTION_TYPES.USE_SHATTER,
          player,
          targetIndex
        }),
        lastAction: Object.freeze({ ...action }),
        moveHistory: Object.freeze([...state.moveHistory, Object.freeze({ ...action })])
      });
    }

    case ACTION_TYPES.USE_SWAP: {
      const { indexA, indexB } = action;
      const newBoard = [...state.board];

      // Perform atomic coordinate swap
      const temp = newBoard[indexA];
      newBoard[indexA] = newBoard[indexB];
      newBoard[indexB] = temp;

      // Update queues: map old indices to new positions
      const updateQueue = (q) => q.map(idx => {
        if (idx === indexA) return indexB;
        if (idx === indexB) return indexA;
        return idx;
      });

      const p1Queue = updateQueue(state.p1Queue);
      const p2Queue = updateQueue(state.p2Queue);

      const nextAbilities = {
        ...state.abilities,
        [player]: Object.freeze({
          ...state.abilities[player],
          swap: 0
        })
      };

      // Check if swap produced a win for active player
      let winResult = checkWin(newBoard, player);
      let isWin = winResult.winner !== null;

      // If active player didn't win, check if swap gifted opponent a win
      if (!isWin) {
        const opponentWin = checkWin(newBoard, opponent);
        if (opponentWin.winner !== null) {
          winResult = opponentWin;
          isWin = true;
        }
      }

      const nextTurnCount = state.turnCount + 1;
      const isDraw = !isWin && checkDraw(newBoard, state.mode, nextTurnCount);
      const nextStatus = (isWin || isDraw) ? STATUS.ROUND_OVER : STATUS.PLAYING;
      const winner = isWin ? winResult.winner : (isDraw ? 'draw' : null);
      const winningLine = isWin ? winResult.line : null;

      return Object.freeze({
        ...state,
        board: Object.freeze(newBoard),
        p1Queue: Object.freeze(p1Queue),
        p2Queue: Object.freeze(p2Queue),
        abilities: Object.freeze(nextAbilities),
        currentTurn: nextStatus === STATUS.ROUND_OVER ? state.currentTurn : opponent,
        status: nextStatus,
        winner,
        winningLine,
        turnCount: nextTurnCount,
        lastEviction: null,
        lastActionEffect: Object.freeze({
          type: ACTION_TYPES.USE_SWAP,
          player,
          indexA,
          indexB
        }),
        lastAction: Object.freeze({ ...action }),
        moveHistory: Object.freeze([...state.moveHistory, Object.freeze({ ...action })])
      });
    }

    default:
      return state;
  }
}

/**
 * Generate all strictly legal moves for minimax searches, AI policies, and UI routing.
 * @param {Object} state
 * @returns {Array<Object>}
 */
export function getAvailableMoves(state) {
  if (!state || state.status !== STATUS.PLAYING) return [];

  const moves = [];
  const player = state.currentTurn;
  const opponent = player === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;

  // 1. Standard cell placements
  for (let i = 0; i < 9; i++) {
    if (state.board[i] === null) {
      moves.push({ type: ACTION_TYPES.PLACE_MARK, player, index: i });
    }
  }

  // 2. Tactical abilities (if in tactical mode)
  if (state.mode === MODES.TACTICAL) {
    // Shatter moves
    if ((state.abilities?.[player]?.shatter ?? 0) > 0) {
      for (let i = 0; i < 9; i++) {
        if (state.board[i] === opponent) {
          moves.push({ type: ACTION_TYPES.USE_SHATTER, player, targetIndex: i });
        }
      }
    }

    // Phase Swap moves
    if ((state.abilities?.[player]?.swap ?? 0) > 0) {
      for (let friendlyIdx = 0; friendlyIdx < 9; friendlyIdx++) {
        if (state.board[friendlyIdx] === player) {
          for (let enemyIdx = 0; enemyIdx < 9; enemyIdx++) {
            if (state.board[enemyIdx] === opponent && areAdjacent(friendlyIdx, enemyIdx)) {
              moves.push({
                type: ACTION_TYPES.USE_SWAP,
                player,
                indexA: friendlyIdx,
                indexB: enemyIdx
              });
            }
          }
        }
      }
    }
  }

  return moves;
}

/**
 * Returns the chronological age rank for UI rendering (e.g. 1 = Fresh, 2 = Mid, 3 = Vanishing Next)
 * @param {Object} state
 * @param {number} cellIndex
 * @returns {number|null}
 */
export function getMarkAge(state, cellIndex) {
  if (!state || state.board[cellIndex] === null) return null;
  if (state.mode !== MODES.GHOST) return 1;

  const player = state.board[cellIndex];
  const queue = player === PLAYERS.P1 ? state.p1Queue : state.p2Queue;
  const pos = queue.indexOf(cellIndex);
  if (pos === -1) return null;

  if (queue.length === 3) {
    if (pos === 0) return 3;
    if (pos === 1) return 2;
    return 1;
  }
  if (queue.length === 2) {
    if (pos === 0) return 2;
    return 1;
  }
  return 1;
}

/**
 * Returns the cell index of the mark expiring next for the given player in Ghost mode.
 * @param {Object} state
 * @param {string} player
 * @returns {number|null}
 */
export function getExpiringMark(state, player) {
  if (!state || state.mode !== MODES.GHOST) return null;
  const queue = player === PLAYERS.P1 ? state.p1Queue : state.p2Queue;
  return queue.length >= (state.maxGhostMarks ?? GHOST_CONFIG.MAX_MARKS) ? queue[0] : null;
}
