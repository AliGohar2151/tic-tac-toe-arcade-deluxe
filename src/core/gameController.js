/**
 * @file gameController.js
 * @description Concurrency-safe GameController managing turn transitions, mutex action locks,
 * high-precision Blitz timers with monotonic delta-time measurement, cancellation tokens for
 * asynchronous AI and timeouts, and EventBus emission.
 * Zero DOM or Web Audio dependencies. Fully decoupled.
 */

import {
  PLAYERS,
  MODES,
  STATUS,
  GAME_STATUS,
  ACTION_TYPES,
  EVENT_TYPES,
  GAME_EVENTS,
  createInitialState
} from './types.js';
import {
  gameReducer,
  validateAction,
  getAvailableMoves
} from './gameReducer.js';

export class GameController {
  /**
   * @param {Object} options
   * @param {import('./eventBus.js').EventBus} options.eventBus
   * @param {Function} [options.reducer]
   * @param {Function} [options.initialStateFactory]
   * @param {string} [options.mode='classic']
   * @param {'human' | 'ai'} [options.opponent='human']
   * @param {Object} [options.aiStrategy]
   * @param {number | [number, number]} [options.aiDelayMs=[350, 500]]
   * @param {boolean} [options.isBlitz=false]
   * @param {number} [options.blitzDuration=5.0]
   * @param {number} [options.blitzWarningThreshold=1.5]
   * @param {number} [options.blitzTickIntervalMs=50]
   * @param {() => number} [options.timeProvider]
   */
  constructor(options = {}) {
    if (!options.eventBus) {
      throw new Error('[GameController] Requires an EventBus instance.');
    }

    this.eventBus = options.eventBus;
    this.reducer = options.reducer || gameReducer;
    this.initialStateFactory = options.initialStateFactory || createInitialState;
    this.timeProvider = options.timeProvider || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

    // Game Configuration
    this.mode = options.mode || MODES.CLASSIC;
    this.opponent = options.opponent || 'human';
    this.aiStrategy = options.aiStrategy || null;
    this.aiDelayMs = options.aiDelayMs ?? [350, 500];

    // Blitz Configuration
    this.isBlitz = Boolean(options.isBlitz);
    this.blitzDuration = options.blitzDuration || 5.0; // Seconds
    this.blitzWarningThreshold = options.blitzWarningThreshold || 1.5; // Seconds
    this.blitzTickIntervalMs = options.blitzTickIntervalMs || 50; // Milliseconds

    // Mutex & Action Serialization Queue
    this.isProcessingAction = false;
    this.actionQueue = [];

    // Blitz Timer State
    this.blitzIntervalId = null;
    this.blitzStartTime = 0;
    this.blitzDurationMs = this.blitzDuration * 1000;
    this.blitzTimeRemainingMs = this.blitzDuration * 1000;
    this.blitzWarningEmitted = false;
    this.lastWarningPulseTime = 0;
    this.isPaused = false;
    this.pausedTimeRemainingMs = 0;

    // Cancellation Token & Invalidation
    this.generationId = 0;
    this.activeToken = null;
    this.pendingAiTimeoutId = null;

    // AI Turn Scheduling & Pause Lifecycle
    this.aiStartTime = 0;
    this.aiTargetDelayMs = 0;
    this.pausedAiDelayRemainingMs = null;
    this.isAiComputing = false;
    this.pendingAiMoveAction = null;

    // Active State
    this.state = this.initialStateFactory({
      mode: this.mode,
      isBlitz: this.isBlitz,
      blitzDuration: this.blitzDuration
    });
  }

  // --------------------------------------------------------------------------
  // State Queries & Subscription
  // --------------------------------------------------------------------------

  /**
   * Return immutable snapshot of current game state.
   * @returns {Object}
   */
  getState() {
    return this.state;
  }

  /**
   * Subscribe to events via the controller's eventBus.
   * @param {string} event
   * @param {Function} callback
   * @param {Object} [options]
   * @returns {() => void}
   */
  subscribe(event, callback, options) {
    return this.eventBus.subscribe(event, callback, options);
  }

  /**
   * Alias for subscribe
   */
  on(event, callback, options) {
    return this.subscribe(event, callback, options);
  }

  // --------------------------------------------------------------------------
  // Round Lifecycle & Management
  // --------------------------------------------------------------------------

  /**
   * Initializes or restarts a round with fresh state, cancels pending timers,
   * generates a new active token, and begins turn 1.
   * @param {Object} [overrideOptions={}]
   * @returns {Object}
   */
  startRound(overrideOptions = {}) {
    this.cancelPendingTimers();

    this.generationId++;
    this.activeToken = Symbol(`round-${this.generationId}`);
    const token = this.activeToken;

    if (overrideOptions.mode) this.mode = overrideOptions.mode;
    if (overrideOptions.opponent) this.opponent = overrideOptions.opponent;
    if (overrideOptions.isBlitz !== undefined) this.isBlitz = Boolean(overrideOptions.isBlitz);
    if (overrideOptions.blitzDuration) this.blitzDuration = overrideOptions.blitzDuration;
    if (overrideOptions.aiStrategy) this.aiStrategy = overrideOptions.aiStrategy;

    this.state = this.initialStateFactory({
      mode: this.mode,
      isBlitz: this.isBlitz,
      blitzDuration: this.blitzDuration
    });
    this.isPaused = false;
    this.pausedTimeRemainingMs = 0;
    this.pausedAiDelayRemainingMs = null;
    this.isAiComputing = false;
    this.pendingAiMoveAction = null;

    this.eventBus.emit(EVENT_TYPES.ROUND_STARTED, {
      roundNumber: this.generationId,
      state: this.state,
      mode: this.mode,
      opponent: this.opponent,
      isBlitz: this.isBlitz
    });

    // Start turn lifecycle for starting player
    this._onTurnStarted(token);

    return this.state;
  }

  /**
   * Resets the game state and cancels all timers.
   * @returns {Object}
   */
  resetGame() {
    this.cancelPendingTimers();
    this.state = this.initialStateFactory({
      mode: this.mode,
      isBlitz: this.isBlitz,
      blitzDuration: this.blitzDuration
    });
    this.isPaused = false;
    this.pausedTimeRemainingMs = 0;
    this.pausedAiDelayRemainingMs = null;
    this.isAiComputing = false;
    this.pendingAiMoveAction = null;
    this.eventBus.emit(EVENT_TYPES.GAME_RESET, { state: this.state });
    return this.state;
  }

  /**
   * Pauses active timers.
   */
  pause() {
    if (this.isPaused || this.state.status !== STATUS.PLAYING) return;
    this.isPaused = true;

    // 1. Blitz countdown pause: calculate remaining time against segment duration
    if (this.isBlitz && this.blitzIntervalId) {
      const elapsed = this.timeProvider() - this.blitzStartTime;
      this.pausedTimeRemainingMs = Math.max(0, this.blitzDurationMs - elapsed);
      this.blitzTimeRemainingMs = this.pausedTimeRemainingMs;
      this._stopBlitzInterval();
      this.eventBus.emit(EVENT_TYPES.BLITZ_PAUSED, {
        timeLeft: this.pausedTimeRemainingMs / 1000,
        player: this.state.currentTurn
      });
    }

    // 2. AI turn pause handling: disarm pending timer and track remaining think delay
    if (this.pendingAiTimeoutId !== null) {
      clearTimeout(this.pendingAiTimeoutId);
      this.pendingAiTimeoutId = null;
      const elapsed = this.timeProvider() - this.aiStartTime;
      this.pausedAiDelayRemainingMs = Math.max(0, this.aiTargetDelayMs - elapsed);
    }
  }

  /**
   * Resumes paused timers.
   */
  resume() {
    if (!this.isPaused || this.state.status !== STATUS.PLAYING) return;
    this.isPaused = false;

    // 1. Resume Blitz countdown if blitz mode enabled
    if (this.isBlitz) {
      if (this.pausedTimeRemainingMs > 0) {
        this._startBlitzIntervalWithDuration(this.pausedTimeRemainingMs, this.activeToken);
        this.eventBus.emit(EVENT_TYPES.BLITZ_RESUMED, {
          timeLeft: this.pausedTimeRemainingMs / 1000,
          player: this.state.currentTurn
        });
      } else {
        // Paused at or after expiration: trigger timeout immediately
        this.eventBus.emit(EVENT_TYPES.BLITZ_TIMEOUT, {
          player: this.state.currentTurn,
          state: this.state
        });
        this._handleBlitzTimeout(this.activeToken);
      }
    }

    // 2. Resume AI turn if opponent is AI and current turn is P2
    if (this.opponent === 'ai' && this.state.currentTurn === PLAYERS.P2 && this.state.status === STATUS.PLAYING) {
      if (this.pendingAiMoveAction) {
        const action = this.pendingAiMoveAction;
        this.pendingAiMoveAction = null;
        this.dispatch(action);
      } else if (!this.isAiComputing && !this.pendingAiTimeoutId) {
        const remainingDelay = this.pausedAiDelayRemainingMs !== null ? this.pausedAiDelayRemainingMs : undefined;
        this.pausedAiDelayRemainingMs = null;
        this._scheduleAiMove(this.activeToken, remainingDelay);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Concurrency-Safe Action Dispatch
  // --------------------------------------------------------------------------

  /**
   * Synchronously dispatches an action through the mutex action queue.
   * Serializes concurrent DOM clicks, timer callbacks, and delayed AI moves.
   *
   * @param {Object} action
   * @returns {{ success: boolean, state: Object, error?: string, action: Object }}
   */
  dispatch(action) {
    if (this.isPaused) {
      return { success: false, state: this.state, error: 'Cannot dispatch while game is paused', action };
    }

    // Re-entrancy protection / concurrent macro-task queueing
    if (this.isProcessingAction) {
      this.actionQueue.push(action);
      return { success: false, queued: true, state: this.state, action };
    }

    this.isProcessingAction = true;
    let primaryResult = null;

    try {
      primaryResult = this._applyAction(action);

      // Drain any actions queued during synchronous event listener callbacks
      while (this.actionQueue.length > 0) {
        const nextAction = this.actionQueue.shift();
        this._applyAction(nextAction);
      }
    } finally {
      this.isProcessingAction = false;
    }

    return primaryResult;
  }

  /**
   * Internal execution of a single action against state reducer with validation.
   * @private
   */
  _applyAction(action) {
    const prevState = this.state;

    // 1. Validate action against current state
    const validation = validateAction(prevState, action);
    if (!validation.valid) {
      this.eventBus.emit(EVENT_TYPES.ACTION_REJECTED, {
        action,
        reason: validation.reason,
        code: validation.code,
        state: prevState
      });
      return { success: false, state: prevState, error: validation.reason, action };
    }

    // 2. Compute state transition through pure reducer
    const nextState = this.reducer(prevState, action);
    this.state = nextState;

    // 3. Stop Blitz timer immediately for completed turn
    this._stopBlitzInterval();

    // 4. Emit gameplay domain events
    this._emitGameplayEvents(prevState, nextState, action);

    // 5. Universal state change notification
    this.eventBus.emit(EVENT_TYPES.STATE_CHANGED, {
      state: nextState,
      previousState: prevState,
      action
    });

    // 6. Check terminal state vs turn progression
    if (nextState.status === STATUS.ROUND_OVER) {
      this.cancelPendingTimers();
      this.eventBus.emit(EVENT_TYPES.GAME_OVER, {
        winner: nextState.winner,
        winningLine: nextState.winningLine,
        mode: nextState.mode,
        state: nextState
      });
    } else {
      this.eventBus.emit(EVENT_TYPES.TURN_CHANGED, {
        currentTurn: nextState.currentTurn,
        previousTurn: prevState.currentTurn,
        turnCount: nextState.turnCount,
        state: nextState
      });

      this._onTurnStarted(this.activeToken);
    }

    return { success: true, state: nextState, action };
  }

  /**
   * Detect delta and emit domain-specific events.
   * @private
   */
  _emitGameplayEvents(prevState, nextState, action) {
    // 1. Move applied
    if (action.type === ACTION_TYPES.PLACE_MARK || action.type === ACTION_TYPES.TIMEOUT_AUTO_MOVE) {
      this.eventBus.emit(EVENT_TYPES.MOVE_APPLIED, {
        action,
        state: nextState,
        player: action.player,
        index: action.index,
        previousState: prevState
      });
    }

    // 2. Ghost Vanished detection
    if (nextState.lastEviction) {
      this.eventBus.emit(EVENT_TYPES.GHOST_VANISHED, {
        evictedIndex: nextState.lastEviction.index,
        player: nextState.lastEviction.player,
        state: nextState
      });
    }

    // 3. Ability used (Tactical Overdrive)
    if (action.type === ACTION_TYPES.USE_SHATTER || action.type === ACTION_TYPES.USE_SWAP) {
      this.eventBus.emit(EVENT_TYPES.ABILITY_USED, {
        ability: action.type === ACTION_TYPES.USE_SHATTER ? 'shatter' : 'swap',
        player: action.player,
        action,
        state: nextState,
        targetIndex: action.targetIndex,
        indexA: action.indexA,
        indexB: action.indexB
      });
    }
  }

  // --------------------------------------------------------------------------
  // Turn Lifecycle & AI Coordination
  // --------------------------------------------------------------------------

  /**
   * Initiates timers and AI scheduling when a new turn starts.
   * @private
   */
  _onTurnStarted(token) {
    if (this.state.status !== STATUS.PLAYING) return;
    if (token !== this.activeToken) return;

    // Start Blitz countdown if enabled
    if (this.isBlitz) {
      this._startBlitzTimer(token);
    }

    // Schedule AI if opponent is AI and it's P2's turn
    if (this.opponent === 'ai' && this.state.currentTurn === PLAYERS.P2) {
      this._scheduleAiMove(token);
    }
  }

  /**
   * Schedules AI computation with cancellation token check.
   * Supports an optional remainingDelay for pause/resume preservation.
   * @param {Symbol} token
   * @param {number} [remainingDelay=null]
   * @private
   */
  _scheduleAiMove(token, remainingDelay = null) {
    if (!this.aiStrategy) return;

    let delay;
    if (typeof remainingDelay === 'number') {
      delay = Math.max(0, remainingDelay);
    } else if (Array.isArray(this.aiDelayMs)) {
      const [min, max] = this.aiDelayMs;
      delay = Math.floor(Math.random() * (max - min)) + min;
    } else if (typeof this.aiDelayMs === 'number') {
      delay = this.aiDelayMs;
    } else {
      delay = 400;
    }

    this.aiStartTime = this.timeProvider();
    this.aiTargetDelayMs = delay;

    this.pendingAiTimeoutId = setTimeout(async () => {
      this.pendingAiTimeoutId = null;
      this.pausedAiDelayRemainingMs = null;

      if (token !== this.activeToken) return;
      if (this.state.status !== STATUS.PLAYING) return;
      if (this.state.currentTurn !== PLAYERS.P2) return;
      if (this.isPaused) return;

      this.isAiComputing = true;
      try {
        const moveAction = await this.aiStrategy.computeMove(this.state, { token });

        if (token !== this.activeToken || this.state.status !== STATUS.PLAYING) return;
        if (!moveAction) return;

        // If paused while computing, hold action to dispatch immediately on resume
        if (this.isPaused) {
          this.pendingAiMoveAction = moveAction;
          return;
        }

        this.dispatch(moveAction);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[GameController] AI computeMove error:', err);
        }
      } finally {
        this.isAiComputing = false;
      }
    }, delay);
  }

  // --------------------------------------------------------------------------
  // High-Precision Blitz Timer Engine
  // --------------------------------------------------------------------------

  /**
   * Starts Blitz turn countdown.
   * @private
   */
  _startBlitzTimer(token) {
    this._stopBlitzInterval();
    this.blitzTimeRemainingMs = this.blitzDuration * 1000;
    this._startBlitzIntervalWithDuration(this.blitzTimeRemainingMs, token);
  }

  /**
   * Measures elapsed real time against monotonic clock to avoid background throttling drift.
   * @private
   */
  _startBlitzIntervalWithDuration(durationMs, token) {
    this._stopBlitzInterval();
    this.blitzDurationMs = durationMs;
    this.blitzStartTime = this.timeProvider();
    this.blitzTimeRemainingMs = durationMs;
    this.blitzWarningEmitted = false;
    this.lastWarningPulseTime = 0;

    // Immediate initial tick
    this._emitBlitzTick(this.blitzTimeRemainingMs);

    this.blitzIntervalId = setInterval(() => {
      if (token !== this.activeToken || this.state.status !== STATUS.PLAYING || this.isPaused) {
        this._stopBlitzInterval();
        return;
      }

      const now = this.timeProvider();
      const elapsedMs = now - this.blitzStartTime;
      const remainingMs = Math.max(0, durationMs - elapsedMs);
      this.blitzTimeRemainingMs = remainingMs;

      this._emitBlitzTick(remainingMs);

      const remainingSeconds = remainingMs / 1000;

      // Check Warning Threshold (<= 1.5s)
      if (remainingSeconds <= this.blitzWarningThreshold && remainingSeconds > 0) {
        if (!this.blitzWarningEmitted || (now - this.lastWarningPulseTime >= 500)) {
          this.blitzWarningEmitted = true;
          this.lastWarningPulseTime = now;
          this.eventBus.emit(EVENT_TYPES.BLITZ_WARNING, {
            timeLeft: Math.round(remainingSeconds * 10) / 10,
            timeRemainingMs: remainingMs,
            player: this.state.currentTurn,
            threshold: this.blitzWarningThreshold
          });
        }
      }

      // Check Timeout Expiration
      if (remainingMs <= 0) {
        this._stopBlitzInterval();
        this.eventBus.emit(EVENT_TYPES.BLITZ_TIMEOUT, {
          player: this.state.currentTurn,
          state: this.state
        });
        this._handleBlitzTimeout(token);
      }
    }, this.blitzTickIntervalMs);
  }

  /**
   * Emits BLITZ_TICK event.
   * @private
   */
  _emitBlitzTick(remainingMs) {
    const totalMs = this.blitzDuration * 1000;
    const percentage = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
    const timeLeft = Math.round((remainingMs / 1000) * 10) / 10;

    this.eventBus.emit(EVENT_TYPES.BLITZ_TICK, {
      timeLeft,
      timeRemainingMs: remainingMs,
      totalDuration: this.blitzDuration,
      percentage,
      player: this.state.currentTurn
    });
  }

  /**
   * Stops the Blitz interval timer.
   * @private
   */
  _stopBlitzInterval() {
    if (this.blitzIntervalId !== null) {
      clearInterval(this.blitzIntervalId);
      this.blitzIntervalId = null;
    }
  }

  /**
   * Handles Blitz timeout by selecting an auto-move.
   * @private
   */
  _handleBlitzTimeout(token) {
    if (token !== this.activeToken) return;
    if (this.state.status !== STATUS.PLAYING) return;

    const currentPlayer = this.state.currentTurn;
    const available = [];
    for (let i = 0; i < 9; i++) {
      if (this.state.board[i] === null) {
        available.push(i);
      }
    }

    if (available.length === 0) return;

    const randomIndex = available[Math.floor(Math.random() * available.length)];

    const autoMoveAction = {
      type: ACTION_TYPES.TIMEOUT_AUTO_MOVE,
      player: currentPlayer,
      index: randomIndex
    };

    this.dispatch(autoMoveAction);
  }

  // --------------------------------------------------------------------------
  // Timer Invalidation & Cleanup
  // --------------------------------------------------------------------------

  /**
   * Cancels all pending timers, intervals, AI timeouts, and purges the action queue.
   */
  cancelPendingTimers() {
    this._stopBlitzInterval();

    if (this.pendingAiTimeoutId !== null) {
      clearTimeout(this.pendingAiTimeoutId);
      this.pendingAiTimeoutId = null;
    }

    this.pausedAiDelayRemainingMs = null;
    this.isAiComputing = false;
    this.pendingAiMoveAction = null;
    this.pausedTimeRemainingMs = 0;
    this.activeToken = null;
    this.actionQueue.length = 0;
  }
}
