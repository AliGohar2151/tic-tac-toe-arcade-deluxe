/**
 * @file app.js
 * @description Application bootstrap & dependency injection orchestrator for Chrono-Tic-Tac-Toe.
 * Instantiates and binds EventBus, GameController, SoundEngine, LaserStrike,
 * ConfettiCannon, A11yManager, and DomController with safe headless degradation.
 */

import { EventBus } from './core/eventBus.js';
import { GameController } from './core/gameController.js';
import { SoundEngine } from './audio/soundEngine.js';
import { LaserStrike } from './fx/laserStrike.js';
import { ConfettiCannon } from './fx/confetti.js';
import { A11yManager } from './ui/a11yManager.js';
import { DomController } from './ui/domController.js';

/**
 * Bootstrap the application subsystems.
 * @param {Object} [options={}]
 * @returns {Object} System container with all instantiated subsystems
 */
export function bootstrapApp(options = {}) {
  const eventBus = options.eventBus || new EventBus();

  const soundEngine = options.soundEngine || new SoundEngine({
    storage: options.storage || (typeof localStorage !== 'undefined' ? localStorage : null),
    audioContext: options.audioContext || null,
    ...options.soundOptions
  });

  const confettiCannon = options.confettiCannon || new ConfettiCannon(
    options.canvasElement || (typeof document !== 'undefined' ? document.getElementById('confettiCanvas') : null),
    options.confettiOptions || {}
  );

  const laserStrike = options.laserStrike || new LaserStrike(
    options.svgElement || (typeof document !== 'undefined' ? document.getElementById('winningStrikeSvg') : null),
    options.boardElement || (typeof document !== 'undefined' ? document.getElementById('board') : null),
    options.laserOptions || {}
  );

  const gameController = options.gameController || new GameController({
    eventBus,
    ...options.gameControllerOptions
  });

  const doc = options.document || (typeof document !== 'undefined' ? document : null);

  const a11yManager = options.a11yManager || (doc ? new A11yManager({
    document: doc,
    boardElement: options.boardElement || (doc.getElementById ? doc.getElementById('board') : null),
    cells: options.cells || (doc.querySelectorAll ? doc.querySelectorAll('#board .cell') : []),
    appWrapper: options.appWrapper || (doc.querySelector ? doc.querySelector('.app-wrapper') : null),
    announcerPoliteA: options.announcerPoliteA || (doc.getElementById ? doc.getElementById('a11yAnnouncerPoliteA') : null),
    announcerPoliteB: options.announcerPoliteB || (doc.getElementById ? doc.getElementById('a11yAnnouncerPoliteB') : null),
    announcerAssertive: options.announcerAssertive || (doc.getElementById ? (doc.getElementById('a11yAnnouncerAssertive') || doc.getElementById('a11yAnnouncerAlert')) : null),
    ...options.a11yOptions
  }) : null);

  const domController = options.domController || (doc ? new DomController({
    gameController,
    soundEngine,
    confettiCannon,
    laserStrike,
    a11yManager,
    document: doc,
    storage: options.storage || (typeof localStorage !== 'undefined' ? localStorage : null),
    ...options.domOptions
  }) : null);

  return {
    eventBus,
    soundEngine,
    confettiCannon,
    laserStrike,
    gameController,
    a11yManager,
    domController
  };
}

// Auto-bootstrap in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const initApp = () => {
    window.__app = bootstrapApp();

    // Query parameter scenario hook for automated previews & documentation screenshots
    const params = new URLSearchParams(window.location.search);
    const scenario = params.get('scenario');
    if (scenario && window.__app && window.__app.domController) {
      setTimeout(() => {
        const dc = window.__app.domController;
        if (scenario === 'tactical') {
          dc.selectedMode = 'tactical';
          dc.selectedOpponent = 'human';
          dc.p1Name = 'Alice';
          dc.p2Name = 'Bob';
          dc._startBattleFromSetup();
          dc._handleCellClick(0); // P1
          dc._handleCellClick(4); // P2
          dc._handleCellClick(2); // P1
          dc._handleCellClick(8); // P2
          dc._handleCellClick(6); // P1
        } else if (scenario === 'victory') {
          dc.selectedMode = 'classic';
          dc.selectedOpponent = 'ai';
          dc._startBattleFromSetup();
          dc._handleCellClick(0); // P1
          dc._handleCellClick(3); // P2
          dc._handleCellClick(1); // P1
          dc._handleCellClick(5); // P2
          dc._handleCellClick(2); // P1 (Wins!)
          dc._openWinnerModal('Player 1 Wins!', 'Player 1 achieved 3-in-a-row!', '🏆');
        } else if (scenario === 'ghost') {
          dc.selectedMode = 'ghost';
          dc.selectedOpponent = 'human';
          dc._startBattleFromSetup();
          dc._handleCellClick(0); // P1
          dc._handleCellClick(1); // P2
          dc._handleCellClick(2); // P1
          dc._handleCellClick(3); // P2
          dc._handleCellClick(4); // P1
          dc._handleCellClick(5); // P2
          // Next move causes index 0 to vanish
        }
      }, 100);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
