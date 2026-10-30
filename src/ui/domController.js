/**
 * @file domController.js
 * @description Event-driven DOM Controller for Chrono-Tic-Tac-Toe.
 * Mediates between GameController, SoundEngine, LaserStrike, ConfettiCannon,
 * A11yManager, and the HTML5 user interface.
 */

import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  EVENT_TYPES,
  getOpponent,
  areAdjacent,
  getGhostAgingMap
} from '../core/types.js';
import { createAiStrategy } from '../ai/aiStrategy.js';

export class DomController {
  /**
   * @param {Object} options
   * @param {import('../core/gameController.js').GameController} options.gameController
   * @param {import('../audio/soundEngine.js').SoundEngine} [options.soundEngine]
   * @param {import('../fx/confetti.js').ConfettiCannon} [options.confettiCannon]
   * @param {import('../fx/laserStrike.js').LaserStrike} [options.laserStrike]
   * @param {import('./a11yManager.js').A11yManager} [options.a11yManager]
   * @param {Document} [options.document] Injected Document (defaults to global document)
   * @param {Storage} [options.storage] Injected Storage (defaults to localStorage)
   */
  constructor(options = {}) {
    this.gameController = options.gameController;
    this.soundEngine = options.soundEngine || null;
    this.confettiCannon = options.confettiCannon || null;
    this.laserStrike = options.laserStrike || null;
    this.a11yManager = options.a11yManager || null;
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);
    this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);

    // Configuration & Match Setup State
    this.selectedMode = MODES.CLASSIC;
    this.selectedOpponent = 'ai'; // 'ai' or 'human'
    this.selectedAiDifficulty = 'medium'; // 'easy', 'medium', 'hard'/'impossible'
    this.isBlitz = false;
    this.blitzDuration = 5.0;
    this.p1Mark = '✖️';
    this.p2Mark = '⭕';
    this.p1Name = 'Player 1';
    this.p2Name = 'AI Bot';

    // Session Statistics
    this.scores = { p1: 0, p2: 0, draws: 0 };

    // Tactical Overdrive Targeting State Machine
    // null | { ability: 'shatter', player: 'p1'|'p2' } | { ability: 'swap', step: 1|2, player: 'p1'|'p2', sourceIndex: number|null }
    this.targetingState = null;

    this._unsubscribers = [];
    this._domCleanups = [];

    if (this.doc) {
      this._bindDomElements();
      this._bindUserEvents();
      this._subscribeGameEvents();
      this._loadPreferences();
    }
  }

  // ---------------------------------------------------------------------------
  // 1. DOM Querying & Element Cache
  // ---------------------------------------------------------------------------

  _bindDomElements() {
    const d = this.doc;
    this.elements = {
      // Screens
      setupScreen: d.getElementById('setupScreen'),
      gameScreen: d.getElementById('gameScreen'),

      // Setup Controls
      modeCards: d.querySelectorAll ? d.querySelectorAll('#modeSelector .mode-card') : [],
      tabAi: d.getElementById('tabAi'),
      tabPvp: d.getElementById('tabPvp'),
      aiDifficultyGroup: d.getElementById('aiDifficultyGroup'),
      aiDifficultyInputs: d.querySelectorAll ? d.querySelectorAll('input[name="aiDifficulty"]') : [],
      blitzCheckbox: d.getElementById('blitzCheckbox') || d.getElementById('blitzToggle'),
      blitzDurationSelect: d.getElementById('blitzDurationSelect'),
      player1Input: d.getElementById('player1Input'),
      player2Input: d.getElementById('player2Input'),
      player2Label: d.getElementById('player2Label'),
      startGameBtn: d.getElementById('startGameBtn'),
      markPackButtons: d.querySelectorAll ? d.querySelectorAll('#markPackSelector .mark-pack-btn') : [],

      // Header & Turn Info
      turnBanner: d.getElementById('turnBanner'),
      currentTurnMark: d.getElementById('currentTurnMark'),
      turnStatusText: d.getElementById('turnStatusText'),

      // Blitz Timer Bar
      blitzTimerContainer: d.getElementById('blitzTimerContainer'),
      blitzTimerBar: d.getElementById('blitzTimerBar'),
      blitzTimerText: d.getElementById('blitzTimerText'),

      // Scoreboard
      p1ScoreCard: d.getElementById('p1ScoreCard'),
      p1DisplayName: d.getElementById('p1DisplayName'),
      p1ScoreMark: d.getElementById('p1ScoreMark'),
      p1ScoreNumber: d.getElementById('p1ScoreNumber'),
      p2ScoreCard: d.getElementById('p2ScoreCard'),
      p2DisplayName: d.getElementById('p2DisplayName'),
      p2ScoreMark: d.getElementById('p2ScoreMark'),
      p2ScoreNumber: d.getElementById('p2ScoreNumber'),
      drawsScoreNumber: d.getElementById('drawsScoreNumber'),

      // Mode Indicators & Tactical Overdrive
      ghostModeIndicator: d.getElementById('ghostModeIndicator'),
      tacticalAbilitiesContainer: d.getElementById('tacticalAbilitiesContainer'),
      shatterBtn: d.getElementById('shatterBtn'),
      shatterCharges: d.getElementById('shatterCharges'),
      swapBtn: d.getElementById('swapBtn'),
      swapCharges: d.getElementById('swapCharges'),
      cancelAbilityBtn: d.getElementById('cancelAbilityBtn'),

      // Board & SVG Line
      winningStrikeSvg: d.getElementById('winningStrikeSvg'),
      strikeLine: d.getElementById('strikeLine'),
      board: d.getElementById('board'),
      cells: d.querySelectorAll ? d.querySelectorAll('#board .cell') : [],

      // In-Game Buttons
      restartRoundBtn: d.getElementById('restartRoundBtn'),
      backToSetupBtn: d.getElementById('backToSetupBtn'),

      // Console & Side Panels
      moveHistoryList: d.getElementById('moveHistoryList'),
      masterVolumeSlider: d.getElementById('masterVolumeSlider'),
      muteBtn: d.getElementById('muteBtn') || d.getElementById('soundToggle'),
      soundToggle: d.getElementById('soundToggle'),
      soundIcon: d.getElementById('soundIcon'),
      themeSelect: d.getElementById('themeSelect') || d.getElementById('themeSelector'),
      themeSelector: d.getElementById('themeSelector') || d.getElementById('themeSelect'),
      helpButton: d.getElementById('helpButton'),

      // Modals
      winnerModal: d.getElementById('winnerModal'),
      modalWinnerTitle: d.getElementById('modalWinnerTitle'),
      modalWinnerMessage: d.getElementById('modalWinnerMessage'),
      modalTrophy: d.getElementById('modalTrophy'),
      modalP1Wins: d.getElementById('modalP1Wins'),
      modalP2Wins: d.getElementById('modalP2Wins'),
      modalDraws: d.getElementById('modalDraws'),
      modalPlayAgainBtn: d.getElementById('modalPlayAgainBtn'),
      modalChangeModeBtn: d.getElementById('modalChangeModeBtn'),

      rulesModal: d.getElementById('rulesModal'),
      closeRulesBtn: d.getElementById('closeRulesBtn'),
      gotItRulesBtn: d.getElementById('gotItRulesBtn')
    };
  }

  // ---------------------------------------------------------------------------
  // 2. EventBus Subscriptions
  // ---------------------------------------------------------------------------

  _subscribeGameEvents() {
    if (!this.gameController) return;

    const on = (event, handler) => {
      const unsub = this.gameController.subscribe(event, handler.bind(this));
      this._unsubscribers.push(unsub);
    };

    on(EVENT_TYPES.ROUND_STARTED, this._handleRoundStarted);
    on(EVENT_TYPES.MOVE_APPLIED, this._handleMoveApplied);
    on(EVENT_TYPES.GHOST_VANISHED, this._handleGhostVanished);
    on(EVENT_TYPES.ABILITY_USED, this._handleAbilityUsed);
    on(EVENT_TYPES.TURN_CHANGED, this._handleTurnChanged);
    on(EVENT_TYPES.BLITZ_TICK, this._handleBlitzTick);
    on(EVENT_TYPES.BLITZ_WARNING, this._handleBlitzWarning);
    on(EVENT_TYPES.GAME_OVER, this._handleGameOver);
    on(EVENT_TYPES.ACTION_REJECTED, this._handleActionRejected);
  }

  // ---------------------------------------------------------------------------
  // 3. User Input & DOM Listeners
  // ---------------------------------------------------------------------------

  _bindUserEvents() {
    const el = this.elements;
    const addListener = (target, type, fn) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn);
      this._domCleanups.push(() => target.removeEventListener(type, fn));
    };

    // Mode Selector Cards
    if (el.modeCards && el.modeCards.length > 0) {
      el.modeCards.forEach((card) => {
        addListener(card, 'click', () => {
          const mode = card.dataset ? card.dataset.mode : card.getAttribute('data-mode');
          if (mode) {
            this.selectedMode = mode;
            el.modeCards.forEach((c) => {
              if (c.classList) {
                c.classList.remove('active');
              }
            });
            if (card.classList) {
              card.classList.add('active');
            }
          }
        });
      });
    }

    // Opponent Tabs (AI vs 2P)
    addListener(el.tabAi, 'click', () => {
      this.selectedOpponent = 'ai';
      if (el.tabAi && el.tabAi.classList) el.tabAi.classList.add('active');
      if (el.tabPvp && el.tabPvp.classList) el.tabPvp.classList.remove('active');
      if (el.aiDifficultyGroup && el.aiDifficultyGroup.style) {
        el.aiDifficultyGroup.style.display = 'block';
      }
      if (el.player2Label) el.player2Label.textContent = 'Player 2 (AI)';
      if (el.player2Input) el.player2Input.value = 'AI Bot';
      this.p2Name = 'AI Bot';
    });

    addListener(el.tabPvp, 'click', () => {
      this.selectedOpponent = 'human';
      if (el.tabPvp && el.tabPvp.classList) el.tabPvp.classList.add('active');
      if (el.tabAi && el.tabAi.classList) el.tabAi.classList.remove('active');
      if (el.aiDifficultyGroup && el.aiDifficultyGroup.style) {
        el.aiDifficultyGroup.style.display = 'none';
      }
      if (el.player2Label) el.player2Label.textContent = 'Player 2';
      if (el.player2Input) el.player2Input.value = 'Player 2';
      this.p2Name = 'Player 2';
    });

    // AI Difficulty Radios
    if (el.aiDifficultyInputs && el.aiDifficultyInputs.length > 0) {
      el.aiDifficultyInputs.forEach((input) => {
        addListener(input, 'change', (e) => {
          if (e.target && e.target.checked) {
            this.selectedAiDifficulty = e.target.value;
          }
        });
      });
    }

    // Mark Packs
    if (el.markPackButtons && el.markPackButtons.length > 0) {
      el.markPackButtons.forEach((btn) => {
        addListener(btn, 'click', () => {
          el.markPackButtons.forEach((b) => b.classList && b.classList.remove('active'));
          if (btn.classList) btn.classList.add('active');
          const p1 = btn.dataset ? btn.dataset.p1 : btn.getAttribute('data-p1');
          const p2 = btn.dataset ? btn.dataset.p2 : btn.getAttribute('data-p2');
          if (p1 && p2) {
            this.p1Mark = p1;
            this.p2Mark = p2;
            if (el.p1ScoreMark) el.p1ScoreMark.textContent = p1;
            if (el.p2ScoreMark) el.p2ScoreMark.textContent = p2;
          }
        });
      });
    }

    // Start Game Button
    addListener(el.startGameBtn, 'click', () => {
      this._handleStartGame();
    });

    // Board Cell Clicks
    if (el.cells && el.cells.length > 0) {
      el.cells.forEach((cell, idx) => {
        addListener(cell, 'click', () => {
          this._handleCellClick(idx);
        });
      });
    }

    // Tactical Ability Buttons
    addListener(el.shatterBtn, 'click', () => {
      this._handleShatterToggle();
    });

    addListener(el.swapBtn, 'click', () => {
      this._handleSwapToggle();
    });

    addListener(el.cancelAbilityBtn, 'click', () => {
      this._clearTargetingState();
    });

    // In-Game Buttons
    addListener(el.restartRoundBtn, 'click', () => {
      if (this.gameController) {
        this.gameController.startRound();
      }
    });

    addListener(el.backToSetupBtn, 'click', () => {
      this._showSetupScreen();
    });

    // Theme Switcher (synchronize header and console selectors)
    const themeElements = new Set([el.themeSelect, el.themeSelector].filter(Boolean));
    themeElements.forEach((select) => {
      addListener(select, 'change', (e) => {
        this.setTheme(e.target ? e.target.value : 'midnight');
      });
    });

    // Sound Controls
    const soundBtn = el.muteBtn || el.soundToggle;
    if (soundBtn) {
      addListener(soundBtn, 'click', () => {
        this._toggleSoundMute();
      });
    }

    if (el.masterVolumeSlider) {
      addListener(el.masterVolumeSlider, 'input', (e) => {
        const val = parseFloat(e.target ? e.target.value : 0.7);
        if (this.soundEngine && typeof this.soundEngine.setVolume === 'function') {
          this.soundEngine.setVolume(val);
        }
      });
    }

    // Rules / Help Modal
    addListener(el.helpButton, 'click', () => {
      this._openModal(el.rulesModal, el.helpButton);
    });

    addListener(el.closeRulesBtn, 'click', () => {
      this._closeModal(el.rulesModal);
    });

    addListener(el.gotItRulesBtn, 'click', () => {
      this._closeModal(el.rulesModal);
    });

    // Winner Modal Actions
    addListener(el.modalPlayAgainBtn, 'click', () => {
      this._closeModal(el.winnerModal);
      if (this.gameController) {
        this.gameController.startRound();
      }
    });

    addListener(el.modalChangeModeBtn, 'click', () => {
      this._closeModal(el.winnerModal);
      this._showSetupScreen();
    });

    // Escape Key for Tactical Targeting or Modals
    if (this.doc) {
      addListener(this.doc, 'keydown', (e) => {
        if (e.key === 'Escape' && this.targetingState) {
          e.preventDefault();
          this._clearTargetingState();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Match Setup & Screen Navigation
  // ---------------------------------------------------------------------------

  _handleStartGame() {
    const el = this.elements;
    if (el.player1Input && el.player1Input.value) {
      this.p1Name = el.player1Input.value.trim() || 'Player 1';
    }
    if (el.player2Input && el.player2Input.value) {
      this.p2Name = el.player2Input.value.trim() || (this.selectedOpponent === 'ai' ? 'AI Bot' : 'Player 2');
    }

    if (el.p1DisplayName) el.p1DisplayName.textContent = this.p1Name;
    if (el.p2DisplayName) el.p2DisplayName.textContent = this.p2Name;
    if (el.p1ScoreMark) el.p1ScoreMark.textContent = this.p1Mark;
    if (el.p2ScoreMark) el.p2ScoreMark.textContent = this.p2Mark;

    // Check Blitz option
    if (this.selectedMode === 'blitz') {
      this.isBlitz = true;
      this.blitzDuration = 5.0;
    } else if (el.blitzCheckbox) {
      this.isBlitz = Boolean(el.blitzCheckbox.checked);
      if (el.blitzDurationSelect) {
        this.blitzDuration = parseFloat(el.blitzDurationSelect.value) || 5.0;
      }
    } else {
      this.isBlitz = false;
    }

    // Build AI Strategy if needed
    let aiStrategy = null;
    if (this.selectedOpponent === 'ai') {
      const tier = this.selectedAiDifficulty === 'impossible' ? 'hard' : this.selectedAiDifficulty;
      aiStrategy = createAiStrategy(tier);
    }

    // Switch screens
    if (el.setupScreen && el.setupScreen.style) el.setupScreen.style.display = 'none';
    if (el.gameScreen && el.gameScreen.style) el.gameScreen.style.display = 'block';

    // Start round in controller
    if (this.gameController) {
      const mode = this.selectedMode === 'blitz' ? MODES.CLASSIC : this.selectedMode;
      this.gameController.startRound({
        mode,
        opponent: this.selectedOpponent,
        aiStrategy,
        isBlitz: this.isBlitz,
        blitzDuration: this.blitzDuration
      });
    }
  }

  _showSetupScreen() {
    const el = this.elements;
    if (this.gameController && typeof this.gameController.pause === 'function') {
      this.gameController.pause();
    }
    this._clearLaserLine();
    this._clearTargetingState();

    if (el.gameScreen && el.gameScreen.style) el.gameScreen.style.display = 'none';
    if (el.setupScreen && el.setupScreen.style) el.setupScreen.style.display = 'block';
  }

  // ---------------------------------------------------------------------------
  // 5. Game Event Handlers
  // ---------------------------------------------------------------------------

  _handleRoundStarted(payload) {
    this._clearTargetingState();
    this._resetBoardDom();
    this._clearLaserLine();
    this._closeModal(this.elements.winnerModal);

    const state = payload.state || (this.gameController ? this.gameController.getState() : {});
    const mode = payload.mode || this.selectedMode;
    const isBlitz = payload.isBlitz !== undefined ? payload.isBlitz : this.isBlitz;

    // Ghost Indicator
    if (this.elements.ghostModeIndicator && this.elements.ghostModeIndicator.style) {
      this.elements.ghostModeIndicator.style.display = mode === MODES.GHOST ? 'block' : 'none';
    }

    // Tactical Abilities Panel
    if (this.elements.tacticalAbilitiesContainer && this.elements.tacticalAbilitiesContainer.style) {
      this.elements.tacticalAbilitiesContainer.style.display = mode === MODES.TACTICAL ? 'flex' : 'none';
      this._updateTacticalBadges(state);
    }

    // Blitz Bar
    if (this.elements.blitzTimerContainer && this.elements.blitzTimerContainer.style) {
      this.elements.blitzTimerContainer.style.display = isBlitz ? 'block' : 'none';
      if (this.elements.blitzTimerBar && this.elements.blitzTimerBar.style) {
        this.elements.blitzTimerBar.style.width = '100%';
        this.elements.blitzTimerBar.classList && this.elements.blitzTimerBar.classList.remove('blitz-warning');
      }
      if (this.elements.blitzTimerText) {
        this.elements.blitzTimerText.textContent = `${this.blitzDuration.toFixed(1)}s`;
      }
    }

    // Turn banner
    this._updateTurnBanner(state.currentTurn || PLAYERS.P1);

    // Reset History Feed
    if (this.elements.moveHistoryList) {
      this.elements.moveHistoryList.innerHTML = '';
      this._addHistoryEntry(`Round ${payload.roundNumber || 1} Started (${mode.toUpperCase()})`);
    }

    if (this.soundEngine && typeof this.soundEngine.playClick === 'function') {
      this.soundEngine.playClick();
    }

    if (this.a11yManager) {
      this.a11yManager.announceRoundStart({
        mode,
        p1Name: this.p1Name,
        p1Mark: this.p1Mark
      });
      this.a11yManager.updateCellLabels(state);
    }
  }

  _handleMoveApplied(payload) {
    const { player, index, state } = payload;
    const cellsList = Array.from(this.elements.cells || []);
    const cell = cellsList[index];

    if (cell) {
      const mark = player === PLAYERS.P1 ? this.p1Mark : this.p2Mark;
      cell.textContent = mark;
      if (cell.classList) {
        cell.classList.add(player === PLAYERS.P1 ? 'cell-p1' : 'cell-p2', 'marked', 'mark-drop');
        setTimeout(() => cell.classList.remove('mark-drop'), 400);
      }
    }

    // Ghost Aging Updates
    if (state && state.mode === MODES.GHOST) {
      this._updateGhostAgingClasses(state);
    }

    // Sound
    if (this.soundEngine && typeof this.soundEngine.playPlace === 'function') {
      this.soundEngine.playPlace(player);
    }

    // Accessibility
    if (this.a11yManager) {
      this.a11yManager.announceMove(player, index, {
        p1Name: this.p1Name,
        p1Mark: this.p1Mark,
        p2Name: this.p2Name,
        p2Mark: this.p2Mark
      });
      this.a11yManager.updateCellLabels(state, this.targetingState);
    }

    // Move history
    const r = Math.floor(index / 3) + 1;
    const c = (index % 3) + 1;
    const name = player === PLAYERS.P1 ? this.p1Name : this.p2Name;
    const mark = player === PLAYERS.P1 ? this.p1Mark : this.p2Mark;
    this._addHistoryEntry(`${name} placed ${mark} at R${r}:C${c}`);
  }

  _handleGhostVanished(payload) {
    const { evictedIndex, player, state } = payload;
    const cellsList = Array.from(this.elements.cells || []);
    const cell = cellsList[evictedIndex];

    if (cell) {
      cell.textContent = '';
      if (cell.classList) {
        cell.classList.remove('cell-p1', 'cell-p2', 'marked', 'mark-age-1', 'mark-age-2', 'mark-age-3', 'is-expiring-next', 'ghost-critical-pulse');
        cell.classList.add('ghost-fade-out');
        setTimeout(() => cell.classList.remove('ghost-fade-out'), 500);
      }
    }

    if (this.soundEngine && typeof this.soundEngine.playVanish === 'function') {
      this.soundEngine.playVanish();
    }

    if (this.a11yManager) {
      this.a11yManager.announceVanish(player, evictedIndex, {
        p1Name: this.p1Name,
        p2Name: this.p2Name
      });
      this.a11yManager.updateCellLabels(state, this.targetingState);
    }

    const r = Math.floor(evictedIndex / 3) + 1;
    const c = (evictedIndex % 3) + 1;
    const name = player === PLAYERS.P1 ? this.p1Name : this.p2Name;
    this._addHistoryEntry(`👻 Ghost decay: ${name}'s mark at R${r}:C${c} vanished`);
  }

  _handleAbilityUsed(payload) {
    const { ability, player, targetIndex, indexA, indexB, state } = payload;
    const cellsList = Array.from(this.elements.cells || []);

    if (ability === 'shatter' && targetIndex !== undefined) {
      const cell = cellsList[targetIndex];
      if (cell) {
        cell.textContent = '';
        if (cell.classList) {
          cell.classList.remove('cell-p1', 'cell-p2', 'marked', 'mark-age-1', 'mark-age-2', 'mark-age-3', 'is-expiring-next');
          cell.classList.add('cell-shattered');
          setTimeout(() => cell.classList.remove('cell-shattered'), 500);
        }
      }
      const r = Math.floor(targetIndex / 3) + 1;
      const c = (targetIndex % 3) + 1;
      const name = player === PLAYERS.P1 ? this.p1Name : this.p2Name;
      this._addHistoryEntry(`💥 ${name} used Shatter on R${r}:C${c}`);
    } else if (ability === 'swap' && indexA !== undefined && indexB !== undefined) {
      const cellA = cellsList[indexA];
      const cellB = cellsList[indexB];
      if (cellA && cellB) {
        const textA = cellA.textContent;
        const textB = cellB.textContent;
        cellA.textContent = textB;
        cellB.textContent = textA;

        const isA1 = cellA.classList && cellA.classList.contains('cell-p1');
        if (cellA.classList && cellB.classList) {
          cellA.classList.toggle('cell-p1', !isA1);
          cellA.classList.toggle('cell-p2', isA1);
          cellB.classList.toggle('cell-p1', isA1);
          cellB.classList.toggle('cell-p2', !isA1);
          cellA.classList.add('cell-swapped');
          cellB.classList.add('cell-swapped');
          setTimeout(() => {
            cellA.classList.remove('cell-swapped');
            cellB.classList.remove('cell-swapped');
          }, 400);
        }
      }
      const r1 = Math.floor(indexA / 3) + 1;
      const c1 = (indexA % 3) + 1;
      const r2 = Math.floor(indexB / 3) + 1;
      const c2 = (indexB % 3) + 1;
      const name = player === PLAYERS.P1 ? this.p1Name : this.p2Name;
      this._addHistoryEntry(`🔄 ${name} used Phase Swap: R${r1}:C${c1} ↔ R${r2}:C${c2}`);
    }

    this._clearTargetingState();
    this._updateTacticalBadges(state);

    if (this.soundEngine && typeof this.soundEngine.playAbility === 'function') {
      this.soundEngine.playAbility(ability);
    }

    if (this.a11yManager) {
      this.a11yManager.announceAbility(player, ability, { targetIndex, indexA, indexB }, {
        p1Name: this.p1Name,
        p2Name: this.p2Name
      });
      this.a11yManager.updateCellLabels(state, this.targetingState);
    }
  }

  _handleTurnChanged(payload) {
    const { currentTurn, state } = payload;
    this._updateTurnBanner(currentTurn);

    // Update Tactical button states
    this._updateTacticalButtons(currentTurn, state);

    if (this.soundEngine && typeof this.soundEngine.playTurnCue === 'function') {
      this.soundEngine.playTurnCue(currentTurn);
    }

    if (this.a11yManager) {
      const isAi = this.selectedOpponent === 'ai' && currentTurn === PLAYERS.P2;
      this.a11yManager.announceTurn(currentTurn, isAi, {
        p1Name: this.p1Name,
        p1Mark: this.p1Mark,
        p2Name: this.p2Name,
        p2Mark: this.p2Mark
      });
    }
  }

  _handleBlitzTick(payload) {
    const { timeLeft, percentage } = payload;
    if (this.elements.blitzTimerBar && this.elements.blitzTimerBar.style) {
      this.elements.blitzTimerBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
      if (timeLeft > 1.5 && this.elements.blitzTimerBar.classList) {
        this.elements.blitzTimerBar.classList.remove('blitz-warning');
      }
    }
    if (this.elements.blitzTimerText) {
      this.elements.blitzTimerText.textContent = `${Math.max(0, timeLeft).toFixed(1)}s`;
    }
  }

  _handleBlitzWarning(payload) {
    const { timeLeft } = payload;
    if (this.elements.blitzTimerBar && this.elements.blitzTimerBar.classList) {
      this.elements.blitzTimerBar.classList.add('blitz-warning');
    }
    if (this.soundEngine && typeof this.soundEngine.playWarning === 'function') {
      this.soundEngine.playWarning();
    }
    if (this.a11yManager) {
      this.a11yManager.announceWarning(`Blitz Warning! ${timeLeft.toFixed(1)} seconds remaining!`);
    }
  }

  _handleGameOver(payload) {
    const { winner, winningLine, state } = payload;
    const cellsList = Array.from(this.elements.cells || []);

    if (winner && winningLine) {
      // Highlight winning cells
      winningLine.forEach((idx) => {
        if (cellsList[idx] && cellsList[idx].classList) {
          cellsList[idx].classList.add('cell-win');
        }
      });

      // SVG Laser Line Drawing
      if (this.elements.winningStrikeSvg && this.elements.winningStrikeSvg.style) {
        this.elements.winningStrikeSvg.style.display = 'block';
      }
      if (this.laserStrike && typeof this.laserStrike.draw === 'function') {
        this.laserStrike.draw(winningLine);
      }

      // Confetti & Audio
      if (this.confettiCannon && typeof this.confettiCannon.fire === 'function') {
        this.confettiCannon.fire();
      }
      if (this.soundEngine && typeof this.soundEngine.playWin === 'function') {
        this.soundEngine.playWin();
      }

      // Score
      if (winner === PLAYERS.P1) {
        this.scores.p1++;
        if (this.elements.p1ScoreNumber) this.elements.p1ScoreNumber.textContent = String(this.scores.p1);
      } else {
        this.scores.p2++;
        if (this.elements.p2ScoreNumber) this.elements.p2ScoreNumber.textContent = String(this.scores.p2);
      }

      const winnerName = winner === PLAYERS.P1 ? this.p1Name : this.p2Name;
      this._openWinnerModal(`${winnerName} Wins!`, `${winnerName} achieved 3-in-a-row!`, '🏆');
      this._addHistoryEntry(`🏆 Game Over: ${winnerName} won!`);

    } else {
      // Stalemate / Draw
      this.scores.draws++;
      if (this.elements.drawsScoreNumber) {
        this.elements.drawsScoreNumber.textContent = String(this.scores.draws);
      }

      if (this.soundEngine && typeof this.soundEngine.playDraw === 'function') {
        this.soundEngine.playDraw();
      }

      this._openWinnerModal('Stalemate!', 'The board is locked with no winner.', '🤝');
      this._addHistoryEntry('🤝 Game Over: Draw / Stalemate');
    }

    if (this.a11yManager) {
      this.a11yManager.announceGameOver(winner, winningLine, winner === null, {
        p1Name: this.p1Name,
        p1Mark: this.p1Mark,
        p2Name: this.p2Name,
        p2Mark: this.p2Mark
      });
      this.a11yManager.updateCellLabels(state);
    }
  }

  _handleActionRejected(payload) {
    const { action, reason } = payload;
    const targetIdx = action.index !== undefined ? action.index : action.targetIndex;
    const cellsList = Array.from(this.elements.cells || []);

    if (targetIdx !== undefined && cellsList[targetIdx]) {
      const cell = cellsList[targetIdx];
      if (cell.classList) {
        cell.classList.add('shake-anim', 'cell-invalid');
        setTimeout(() => cell.classList.remove('shake-anim', 'cell-invalid'), 350);
      }
    }

    if (this.soundEngine && typeof this.soundEngine.playError === 'function') {
      this.soundEngine.playError();
    }

    if (this.a11yManager) {
      this.a11yManager.announce(`Action rejected: ${reason}`, 'assertive');
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Tactical Ability Targeting State Machine
  // ---------------------------------------------------------------------------

  _handleShatterToggle() {
    const state = this.gameController ? this.gameController.getState() : null;
    if (!state || state.mode !== MODES.TACTICAL || state.status !== STATUS.PLAYING) return;
    if (this.selectedOpponent === 'ai' && state.currentTurn === PLAYERS.P2) return;

    const charges = state.abilities && state.abilities[state.currentTurn] ? state.abilities[state.currentTurn].shatter : 0;
    if (charges <= 0) return;

    if (this.targetingState && this.targetingState.ability === 'shatter') {
      this._clearTargetingState();
      return;
    }

    this.targetingState = {
      ability: 'shatter',
      player: state.currentTurn
    };
    this._updateTargetingVisuals();
  }

  _handleSwapToggle() {
    const state = this.gameController ? this.gameController.getState() : null;
    if (!state || state.mode !== MODES.TACTICAL || state.status !== STATUS.PLAYING) return;
    if (this.selectedOpponent === 'ai' && state.currentTurn === PLAYERS.P2) return;

    const charges = state.abilities && state.abilities[state.currentTurn] ? state.abilities[state.currentTurn].swap : 0;
    if (charges <= 0) return;

    if (this.targetingState && this.targetingState.ability === 'swap') {
      this._clearTargetingState();
      return;
    }

    this.targetingState = {
      ability: 'swap',
      step: 1,
      player: state.currentTurn,
      sourceIndex: null
    };
    this._updateTargetingVisuals();
  }

  _handleCellClick(index) {
    const state = this.gameController ? this.gameController.getState() : null;
    if (!state || state.status !== STATUS.PLAYING) return;

    // Tactical targeting active?
    if (this.targetingState) {
      this._handleTargetingCellClick(index, state);
      return;
    }

    // Normal placement
    if (this.selectedOpponent === 'ai' && state.currentTurn === PLAYERS.P2) {
      return; // Awaiting AI turn
    }

    if (state.board && state.board[index] !== null) {
      // Cell already occupied
      const cellsList = Array.from(this.elements.cells || []);
      const cell = cellsList[index];
      if (cell && cell.classList) {
        cell.classList.add('shake-anim');
        setTimeout(() => cell.classList.remove('shake-anim'), 300);
      }
      if (this.soundEngine && typeof this.soundEngine.playError === 'function') {
        this.soundEngine.playError();
      }
      return;
    }

    this.gameController.dispatch({
      type: ACTION_TYPES.PLACE_MARK,
      player: state.currentTurn,
      index
    });
  }

  _handleTargetingCellClick(index, state) {
    const { ability, player } = this.targetingState;
    const opponent = getOpponent(player);
    const occupant = state.board[index];
    const cellsList = Array.from(this.elements.cells || []);
    const cell = cellsList[index];

    if (ability === 'shatter') {
      if (occupant === opponent) {
        // Valid shatter target
        this.gameController.dispatch({
          type: ACTION_TYPES.USE_SHATTER,
          player,
          targetIndex: index
        });
      } else {
        // Invalid target
        if (cell && cell.classList) {
          cell.classList.add('shake-anim');
          setTimeout(() => cell.classList.remove('shake-anim'), 300);
        }
        if (this.soundEngine && typeof this.soundEngine.playError === 'function') {
          this.soundEngine.playError();
        }
      }
    } else if (ability === 'swap') {
      if (this.targetingState.step === 1) {
        // Selecting friendly mark
        if (occupant === player) {
          this.targetingState.step = 2;
          this.targetingState.sourceIndex = index;
          this._updateTargetingVisuals();
        } else {
          if (cell && cell.classList) {
            cell.classList.add('shake-anim');
            setTimeout(() => cell.classList.remove('shake-anim'), 300);
          }
          if (this.soundEngine && typeof this.soundEngine.playError === 'function') {
            this.soundEngine.playError();
          }
        }
      } else if (this.targetingState.step === 2) {
        const sourceIndex = this.targetingState.sourceIndex;
        if (index === sourceIndex) {
          // Deselect source back to step 1
          this.targetingState.step = 1;
          this.targetingState.sourceIndex = null;
          this._updateTargetingVisuals();
          return;
        }

        // Must be adjacent and occupied by opponent
        if (occupant === opponent && areAdjacent(sourceIndex, index)) {
          this.gameController.dispatch({
            type: ACTION_TYPES.USE_SWAP,
            player,
            indexA: sourceIndex,
            indexB: index
          });
        } else {
          if (cell && cell.classList) {
            cell.classList.add('shake-anim');
            setTimeout(() => cell.classList.remove('shake-anim'), 300);
          }
          if (this.soundEngine && typeof this.soundEngine.playError === 'function') {
            this.soundEngine.playError();
          }
        }
      }
    }
  }

  _clearTargetingState() {
    this.targetingState = null;
    this._updateTargetingVisuals();
  }

  _updateTargetingVisuals() {
    const el = this.elements;
    const board = el.board;
    const cellsList = Array.from(el.cells || []);

    if (board && board.classList) {
      board.classList.remove('targeting-shatter', 'targeting-swap-1', 'targeting-swap-2');
    }
    if (el.shatterBtn && el.shatterBtn.classList) {
      el.shatterBtn.classList.remove('active-targeting');
    }
    if (el.swapBtn && el.swapBtn.classList) {
      el.swapBtn.classList.remove('active-targeting');
    }

    cellsList.forEach((c) => {
      if (c && c.classList) {
        c.classList.remove('cell-swap-source', 'targeting-eligible');
      }
    });

    if (!this.targetingState) {
      const state = this.gameController ? this.gameController.getState() : null;
      if (this.a11yManager && state) {
        this.a11yManager.updateCellLabels(state, null);
      }
      return;
    }

    const { ability, step, sourceIndex } = this.targetingState;
    if (ability === 'shatter') {
      if (board && board.classList) board.classList.add('targeting-shatter');
      if (el.shatterBtn && el.shatterBtn.classList) el.shatterBtn.classList.add('active-targeting');
    } else if (ability === 'swap') {
      if (el.swapBtn && el.swapBtn.classList) el.swapBtn.classList.add('active-targeting');
      if (step === 1) {
        if (board && board.classList) board.classList.add('targeting-swap-1');
      } else if (step === 2) {
        if (board && board.classList) board.classList.add('targeting-swap-2');
        if (sourceIndex !== null && cellsList[sourceIndex] && cellsList[sourceIndex].classList) {
          cellsList[sourceIndex].classList.add('cell-swap-source');
        }
      }
    }

    const state = this.gameController ? this.gameController.getState() : null;
    if (this.a11yManager && state) {
      this.a11yManager.updateCellLabels(state, this.targetingState);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Visual Helpers (Ghost Aging, Turn Banner, Badges, History)
  // ---------------------------------------------------------------------------

  _updateGhostAgingClasses(state) {
    const cellsList = Array.from(this.elements.cells || []);
    cellsList.forEach((cell) => {
      if (cell && cell.classList) {
        cell.classList.remove('mark-age-1', 'mark-age-2', 'mark-age-3', 'is-expiring-next', 'ghost-critical-pulse');
      }
    });

    const p1Queue = state.p1Queue || (state.ghostQueue ? state.ghostQueue.p1 : []);
    const p2Queue = state.p2Queue || (state.ghostQueue ? state.ghostQueue.p2 : []);
    const p1Map = getGhostAgingMap(p1Queue);
    const p2Map = getGhostAgingMap(p2Queue);

    Object.values(p1Map).forEach((aging) => {
      const cell = cellsList[aging.cellIndex];
      if (cell && cell.classList) {
        cell.classList.add(`mark-age-${aging.age}`);
        if (aging.isExpiringNext || aging.age === 3) {
          cell.classList.add('is-expiring-next', 'ghost-critical-pulse');
        }
      }
    });

    Object.values(p2Map).forEach((aging) => {
      const cell = cellsList[aging.cellIndex];
      if (cell && cell.classList) {
        cell.classList.add(`mark-age-${aging.age}`);
        if (aging.isExpiringNext || aging.age === 3) {
          cell.classList.add('is-expiring-next', 'ghost-critical-pulse');
        }
      }
    });
  }

  _updateTurnBanner(turn) {
    const isP1 = turn === PLAYERS.P1;
    const name = isP1 ? this.p1Name : this.p2Name;
    const mark = isP1 ? this.p1Mark : this.p2Mark;

    if (this.elements.currentTurnMark) {
      this.elements.currentTurnMark.textContent = mark;
    }
    if (this.elements.turnStatusText) {
      this.elements.turnStatusText.textContent = `${name}'s Turn`;
    }

    if (this.elements.p1ScoreCard && this.elements.p1ScoreCard.classList) {
      this.elements.p1ScoreCard.classList.toggle('active-turn', isP1);
    }
    if (this.elements.p2ScoreCard && this.elements.p2ScoreCard.classList) {
      this.elements.p2ScoreCard.classList.toggle('active-turn', !isP1);
    }
  }

  _updateTacticalButtons(currentTurn, state) {
    const isAi = this.selectedOpponent === 'ai' && currentTurn === PLAYERS.P2;
    const abilities = state && state.abilities ? state.abilities[currentTurn] : null;
    const shatterCharges = abilities ? abilities.shatter : 0;
    const swapCharges = abilities ? abilities.swap : 0;

    if (this.elements.shatterBtn) {
      this.elements.shatterBtn.disabled = isAi || shatterCharges <= 0;
    }
    if (this.elements.swapBtn) {
      this.elements.swapBtn.disabled = isAi || swapCharges <= 0;
    }
  }

  _updateTacticalBadges(state) {
    if (!state || !state.abilities) return;
    const p1Abilities = state.abilities.p1 || { shatter: 1, swap: 1 };
    if (this.elements.shatterCharges) {
      this.elements.shatterCharges.textContent = `[${p1Abilities.shatter}]`;
    }
    if (this.elements.swapCharges) {
      this.elements.swapCharges.textContent = `[${p1Abilities.swap}]`;
    }
  }

  _resetBoardDom() {
    const cellsList = Array.from(this.elements.cells || []);
    cellsList.forEach((cell) => {
      cell.textContent = '';
      if (cell.className !== undefined) {
        cell.className = 'cell';
      }
      if (cell.removeAttribute) {
        cell.removeAttribute('disabled');
      }
    });
  }

  _clearLaserLine() {
    if (this.elements.winningStrikeSvg && this.elements.winningStrikeSvg.style) {
      this.elements.winningStrikeSvg.style.display = 'none';
    }
    if (this.laserStrike && typeof this.laserStrike.clear === 'function') {
      this.laserStrike.clear();
    }
  }

  _addHistoryEntry(text) {
    if (!this.elements.moveHistoryList) return;
    const li = this.doc.createElement('li');
    li.className = 'history-item';
    li.textContent = text;
    this.elements.moveHistoryList.appendChild(li);
    if (this.elements.moveHistoryList.scrollTop !== undefined) {
      this.elements.moveHistoryList.scrollTop = this.elements.moveHistoryList.scrollHeight;
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Modals
  // ---------------------------------------------------------------------------

  _openModal(modalElem, triggerElem = null) {
    if (!modalElem) return;
    if (this.a11yManager && typeof this.a11yManager.openModal === 'function') {
      this.a11yManager.openModal(modalElem, triggerElem);
    } else {
      modalElem.style.display = 'flex';
    }
  }

  _closeModal(modalElem) {
    if (!modalElem) return;
    if (this.a11yManager && typeof this.a11yManager.closeModal === 'function') {
      this.a11yManager.closeModal(modalElem);
    } else {
      modalElem.style.display = 'none';
    }
  }

  _openWinnerModal(title, message, trophy = '🏆') {
    const el = this.elements;
    if (el.modalWinnerTitle) el.modalWinnerTitle.textContent = title;
    if (el.modalWinnerMessage) el.modalWinnerMessage.textContent = message;
    if (el.modalTrophy) el.modalTrophy.textContent = trophy;
    if (el.modalP1Wins) el.modalP1Wins.textContent = String(this.scores.p1);
    if (el.modalP2Wins) el.modalP2Wins.textContent = String(this.scores.p2);
    if (el.modalDraws) el.modalDraws.textContent = String(this.scores.draws);

    this._openModal(el.winnerModal);
  }

  // ---------------------------------------------------------------------------
  // 9. Preferences & Settings (Themes & Audio)
  // ---------------------------------------------------------------------------

  _loadPreferences() {
    // Always initialize default or saved theme
    const savedTheme = this.storage ? this.storage.getItem('chrono_ttt_theme') : null;
    this.setTheme(savedTheme || 'midnight');

    // Load Audio Mute
    if (this.soundEngine && typeof this.soundEngine.isMuted === 'function') {
      this._updateSoundIcon(this.soundEngine.isMuted());
    }
  }

  setTheme(theme) {
    const validThemes = ['midnight', 'parchment', 'obsidian', 'neon', 'pastel', 'dark'];
    const activeTheme = validThemes.includes(theme) ? theme : 'midnight';

    if (this.doc && this.doc.documentElement) {
      this.doc.documentElement.setAttribute('data-theme', activeTheme);
    }

    if (this.elements.themeSelect) {
      this.elements.themeSelect.value = activeTheme;
    }
    if (this.elements.themeSelector) {
      this.elements.themeSelector.value = activeTheme;
    }

    if (this.storage) {
      try {
        this.storage.setItem('chrono_ttt_theme', activeTheme);
      } catch (_) {
        // Defensive: ignore QuotaExceededError or SecurityError in sandboxed environments
      }
    }
  }

  _toggleSoundMute() {
    if (!this.soundEngine) return;
    const isMuted = typeof this.soundEngine.isMuted === 'function' ? this.soundEngine.isMuted() : false;
    const nextMuted = !isMuted;
    if (typeof this.soundEngine.setMuted === 'function') {
      this.soundEngine.setMuted(nextMuted);
    }
    this._updateSoundIcon(nextMuted);
  }

  _updateSoundIcon(isMuted) {
    const icon = this.elements.soundIcon;
    const btn = this.elements.muteBtn || this.elements.soundToggle;
    if (icon) {
      icon.textContent = isMuted ? '🔇' : '🔊';
    }
    if (btn) {
      btn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
      btn.title = isMuted ? 'Unmute Sound' : 'Mute Sound';
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Lifecycle Cleanup
  // ---------------------------------------------------------------------------

  destroy() {
    this._unsubscribers.forEach((unsub) => unsub());
    this._unsubscribers = [];

    this._domCleanups.forEach((cleanup) => cleanup());
    this._domCleanups = [];

    this._clearLaserLine();
    if (this.confettiCannon && typeof this.confettiCannon.stop === 'function') {
      this.confettiCannon.stop();
    }
  }
}
