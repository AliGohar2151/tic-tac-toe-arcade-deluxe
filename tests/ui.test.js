/**
 * @file ui.test.js
 * @description Comprehensive automated headless UI & Accessibility test suite for Chrono-Tic-Tac-Toe.
 * Zero external dependencies. Uses built-in node:test and high-fidelity in-memory DOM mocks.
 * 
 * 12 Suites:
 *  1. DOM Mock Subsystem & Fixture Integrity
 *  2. Application Bootstrap & Safe Headless Degradation
 *  3. Initial DOM State & Accessibility Mount
 *  4. Setup Screen Controls & Configuration
 *  5. Move Dispatching & Spring-Pop Visuals
 *  6. Chrono Ghost FIFO Aging Classes & Eviction Visuals
 *  7. Tactical Overdrive: Shatter Targeting Flow
 *  8. Tactical Overdrive: Phase Swap Targeting Flow & Cancellation
 *  9. Blitz Speed Timer Countdown & Warning Pulse
 * 10. Game Over Celebrations & Stalemate Modals
 * 11. W3C APG Modal Accessibility & Focus Trapping
 * 12. 2D Roving Tabindex Keyboard Navigation & Theme/Audio Persistence
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus } from '../src/core/eventBus.js';
import { GameController } from '../src/core/gameController.js';
import { A11yManager } from '../src/ui/a11yManager.js';
import { DomController } from '../src/ui/domController.js';
import { bootstrapApp } from '../src/app.js';
import {
  PLAYERS,
  MODES,
  STATUS,
  ACTION_TYPES,
  EVENT_TYPES
} from '../src/core/types.js';

// =============================================================================
// Zero-Dependency In-Memory DOM Mock System
// =============================================================================

class MockClassList {
  constructor(owner) {
    this._owner = owner;
    this._tokens = new Set();
  }

  add(...tokens) {
    tokens.forEach((t) => {
      if (t) this._tokens.add(String(t).trim());
    });
    this._sync();
  }

  remove(...tokens) {
    tokens.forEach((t) => {
      if (t) this._tokens.delete(String(t).trim());
    });
    this._sync();
  }

  contains(token) {
    return this._tokens.has(String(token).trim());
  }

  toggle(token, force) {
    const t = String(token).trim();
    if (force === true) {
      this._tokens.add(t);
    } else if (force === false) {
      this._tokens.delete(t);
    } else if (this._tokens.has(t)) {
      this._tokens.delete(t);
    } else {
      this._tokens.add(t);
    }
    this._sync();
    return this._tokens.has(t);
  }

  _sync() {
    this._owner.className = Array.from(this._tokens).join(' ');
  }

  _fromClassName(str) {
    this._tokens.clear();
    if (str && typeof str === 'string') {
      str.split(/\s+/).forEach((t) => {
        if (t) this._tokens.add(t);
      });
    }
  }
}

class MockElement {
  constructor(tagName = 'div', doc = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.id = '';
    this._className = '';
    this.classList = new MockClassList(this);
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.dataset = {};
  }

  get className() {
    return this._className;
  }

  set className(val) {
    this._className = String(val || '');
    this.classList._fromClassName(this._className);
  }

  setAttribute(name, val) {
    const strVal = String(val);
    this.attributes.set(name, strVal);
    if (name === 'id') this.id = strVal;
    if (name === 'class') this.className = strVal;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[key] = strVal;
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.className = '';
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      delete this.dataset[key];
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  appendChild(child) {
    if (child instanceof MockElement) {
      child.parentNode = this;
      this.children.push(child);
    }
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    if (!this.listeners.has(type)) return;
    const fns = this.listeners.get(type);
    const idx = fns.indexOf(fn);
    if (idx !== -1) fns.splice(idx, 1);
  }

  dispatchEvent(event) {
    const type = event.type || event;
    const fns = this.listeners.get(type) || [];
    const evt = typeof event === 'object' ? event : { type, target: this, preventDefault: () => {} };
    if (!evt.target) evt.target = this;
    if (!evt.preventDefault) evt.preventDefault = () => {};
    for (const fn of [...fns]) {
      fn.call(this, evt);
    }
    return true;
  }

  click() {
    let defaultPrevented = false;
    const event = {
      type: 'click',
      target: this,
      preventDefault: () => { defaultPrevented = true; },
      defaultPrevented: () => defaultPrevented
    };
    this.dispatchEvent(event);
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
    this.dispatchEvent({ type: 'focus', target: this });
  }

  blur() {
    if (this.ownerDocument && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
    this.dispatchEvent({ type: 'blur', target: this });
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 };
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, sel)) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

function matchesSimple(el, token) {
  let t = token.trim();
  if (!t) return false;

  // Handle :not(...)
  const notMatch = t.match(/:not\(([^)]+)\)/);
  if (notMatch) {
    const inner = notMatch[1];
    if (matchesSimple(el, inner)) return false;
    t = t.replace(notMatch[0], '');
  }

  // Handle [disabled] or :disabled
  if (t.includes(':disabled') || t.includes('[disabled]')) {
    if (!el.disabled) return false;
    t = t.replace(':disabled', '').replace('[disabled]', '');
  }

  // Tag name at start
  const tagMatch = t.match(/^[a-zA-Z0-9]+/);
  if (tagMatch) {
    if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    t = t.slice(tagMatch[0].length);
  }

  // ID match (#id)
  const idMatch = t.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    t = t.replace(idMatch[0], '');
  }

  // Classes (.class)
  const classMatches = t.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const cm of classMatches) {
    if (!el.classList.contains(cm[1])) return false;
    t = t.replace(cm[0], '');
  }

  // Attributes [attr="val"] or [attr]
  const attrMatches = t.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g);
  for (const am of attrMatches) {
    const attrName = am[1];
    const attrVal = am[2];
    if (attrVal !== undefined) {
      if (attrName.startsWith('data-')) {
        const key = attrName.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        if (el.dataset[key] !== attrVal && el.getAttribute(attrName) !== attrVal) return false;
      } else {
        if (el.getAttribute(attrName) !== attrVal && String(el[attrName]) !== attrVal) return false;
      }
    } else {
      if (!el.hasAttribute(attrName) && !el[attrName]) return false;
    }
  }

  return true;
}

function matchesCompound(el, compoundSel) {
  const parts = compoundSel.trim().split(/\s+/);
  if (parts.length === 1) {
    return matchesSimple(el, parts[0]);
  }
  // Descendant selector (e.g. "#board .cell", "#modeSelector .mode-card")
  if (!matchesSimple(el, parts[parts.length - 1])) {
    return false;
  }
  let curr = el.parentNode;
  let partIdx = parts.length - 2;
  while (curr && partIdx >= 0) {
    if (matchesSimple(curr, parts[partIdx])) {
      partIdx--;
    }
    curr = curr.parentNode;
  }
  return partIdx < 0;
}

function matchesSelector(el, selector) {
  if (!selector) return false;
  const group = selector.split(',').map((s) => s.trim());
  return group.some((compound) => matchesCompound(el, compound));
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement('html', this);
    this.body = new MockElement('body', this);
    this.documentElement.appendChild(this.body);
    this.activeElement = null;
    this.elementsById = new Map();
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  registerElement(id, elem) {
    elem.id = id;
    elem.ownerDocument = this;
    this.elementsById.set(id, elem);
  }

  getElementById(id) {
    if (this.elementsById.has(id)) {
      return this.elementsById.get(id);
    }
    // Deep fallback search
    const search = (node) => {
      if (node.id === id) return node;
      for (const ch of node.children) {
        const found = search(ch);
        if (found) return found;
      }
      return null;
    };
    return search(this.body);
  }

  querySelector(sel) {
    return this.body.querySelector(sel);
  }

  querySelectorAll(sel) {
    return this.body.querySelectorAll(sel);
  }

  addEventListener(type, fn) {
    this.body.addEventListener(type, fn);
  }

  removeEventListener(type, fn) {
    this.body.removeEventListener(type, fn);
  }

  dispatchEvent(evt) {
    return this.body.dispatchEvent(evt);
  }
}

class MockStorage {
  constructor() {
    this._store = new Map();
  }

  getItem(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }

  setItem(key, value) {
    this._store.set(key, String(value));
  }

  removeItem(key) {
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }
}

class MockSoundEngine {
  constructor() {
    this.calls = [];
    this._muted = false;
    this._volume = 0.7;
  }

  playClick() { this.calls.push('playClick'); }
  playPlace(p) { this.calls.push(`playPlace:${p}`); }
  playTurnCue(p) { this.calls.push(`playTurnCue:${p}`); }
  playVanish() { this.calls.push('playVanish'); }
  playAbility(a) { this.calls.push(`playAbility:${a}`); }
  playWarning() { this.calls.push('playWarning'); }
  playWin() { this.calls.push('playWin'); }
  playDraw() { this.calls.push('playDraw'); }
  playError() { this.calls.push('playError'); }

  setMuted(m) {
    this._muted = Boolean(m);
    this.calls.push(`setMuted:${this._muted}`);
  }

  isMuted() {
    return this._muted;
  }

  setVolume(v) {
    this._volume = v;
    this.calls.push(`setVolume:${v}`);
  }

  getVolume() {
    return this._volume;
  }
}

class MockLaserStrike {
  constructor() {
    this.calls = [];
  }
  draw(combo) { this.calls.push({ method: 'draw', combo }); }
  clear() { this.calls.push({ method: 'clear' }); }
  handleResize() { this.calls.push({ method: 'handleResize' }); }
}

class MockConfettiCannon {
  constructor() {
    this.calls = [];
  }
  fire() { this.calls.push({ method: 'fire' }); }
  stop() { this.calls.push({ method: 'stop' }); }
  clear() { this.calls.push({ method: 'clear' }); }
}

// =============================================================================
// DOM Fixture Factory
// =============================================================================

function createMockDomFixture() {
  const doc = new MockDocument();
  const create = (tag, id, className = '') => {
    const el = doc.createElement(tag);
    if (id) doc.registerElement(id, el);
    if (className) el.className = className;
    return el;
  };

  // App Wrapper
  const appWrapper = create('div', 'appWrapper', 'app-wrapper');
  doc.body.appendChild(appWrapper);

  // Announcers
  const announcerA = create('div', 'a11yAnnouncerPoliteA', 'sr-only');
  const announcerB = create('div', 'a11yAnnouncerPoliteB', 'sr-only');
  const announcerAssertive = create('div', 'a11yAnnouncerAssertive', 'sr-only');
  doc.body.appendChild(announcerA);
  doc.body.appendChild(announcerB);
  doc.body.appendChild(announcerAssertive);

  // Header quick controls
  const themeSelect = create('select', 'themeSelect', 'control-btn select-btn');
  const soundToggle = create('button', 'soundToggle', 'control-btn icon-btn');
  const soundIcon = create('span', 'soundIcon');
  soundIcon.textContent = '🔊';
  soundToggle.appendChild(soundIcon);
  const helpButton = create('button', 'helpButton', 'control-btn icon-btn');
  appWrapper.appendChild(themeSelect);
  appWrapper.appendChild(soundToggle);
  appWrapper.appendChild(helpButton);

  // Screen 1: Setup
  const setupScreen = create('section', 'setupScreen', 'screen setup-screen');
  appWrapper.appendChild(setupScreen);

  const modeSelector = create('div', 'modeSelector', 'mode-cards');
  const modeClassic = create('button', '', 'mode-card active');
  modeClassic.setAttribute('data-mode', 'classic');
  const modeGhost = create('button', '', 'mode-card');
  modeGhost.setAttribute('data-mode', 'ghost');
  const modeTactical = create('button', '', 'mode-card');
  modeTactical.setAttribute('data-mode', 'tactical');
  modeSelector.appendChild(modeClassic);
  modeSelector.appendChild(modeGhost);
  modeSelector.appendChild(modeTactical);
  setupScreen.appendChild(modeSelector);

  const tabAi = create('button', 'tabAi', 'pill-btn active');
  const tabPvp = create('button', 'tabPvp', 'pill-btn');
  setupScreen.appendChild(tabAi);
  setupScreen.appendChild(tabPvp);

  const aiDifficultyGroup = create('div', 'aiDifficultyGroup');
  const diffEasy = create('input', 'diffEasy');
  diffEasy.setAttribute('name', 'aiDifficulty');
  diffEasy.value = 'easy';
  const diffMed = create('input', 'diffMed');
  diffMed.setAttribute('name', 'aiDifficulty');
  diffMed.value = 'medium';
  diffMed.checked = true;
  const diffHard = create('input', 'diffHard');
  diffHard.setAttribute('name', 'aiDifficulty');
  diffHard.value = 'impossible';
  aiDifficultyGroup.appendChild(diffEasy);
  aiDifficultyGroup.appendChild(diffMed);
  aiDifficultyGroup.appendChild(diffHard);
  setupScreen.appendChild(aiDifficultyGroup);

  const player1Input = create('input', 'player1Input');
  player1Input.value = 'Player 1';
  const player2Input = create('input', 'player2Input');
  player2Input.value = 'AI Bot';
  const player2Label = create('label', 'player2Label');
  player2Label.textContent = 'Player 2 (AI)';
  setupScreen.appendChild(player1Input);
  setupScreen.appendChild(player2Input);
  setupScreen.appendChild(player2Label);

  const blitzCheckbox = create('input', 'blitzCheckbox');
  blitzCheckbox.checked = false;
  setupScreen.appendChild(blitzCheckbox);

  const startGameBtn = create('button', 'startGameBtn', 'btn-tactile btn-primary-3d');
  setupScreen.appendChild(startGameBtn);

  // Screen 2: Game
  const gameScreen = create('section', 'gameScreen', 'screen game-screen');
  gameScreen.style.display = 'none';
  appWrapper.appendChild(gameScreen);

  const turnBanner = create('div', 'turnBanner', 'turn-banner');
  const currentTurnMark = create('span', 'currentTurnMark', 'turn-mark');
  currentTurnMark.textContent = '✖️';
  const turnStatusText = create('span', 'turnStatusText', 'turn-text');
  turnStatusText.textContent = "Player 1's Turn";
  turnBanner.appendChild(currentTurnMark);
  turnBanner.appendChild(turnStatusText);
  gameScreen.appendChild(turnBanner);

  const blitzTimerContainer = create('div', 'blitzTimerContainer', 'blitz-timer-container');
  blitzTimerContainer.style.display = 'none';
  const blitzTimerBar = create('div', 'blitzTimerBar', 'blitz-timer-bar');
  const blitzTimerText = create('span', 'blitzTimerText', 'blitz-timer-text');
  blitzTimerText.textContent = '5.0s';
  blitzTimerContainer.appendChild(blitzTimerBar);
  blitzTimerContainer.appendChild(blitzTimerText);
  gameScreen.appendChild(blitzTimerContainer);

  const ghostModeIndicator = create('div', 'ghostModeIndicator', 'ghost-indicator');
  ghostModeIndicator.style.display = 'none';
  gameScreen.appendChild(ghostModeIndicator);

  // Scoreboard
  const p1ScoreCard = create('div', 'p1ScoreCard', 'score-card player-1');
  const p1ScoreNumber = create('span', 'p1ScoreNumber', 'score-number');
  p1ScoreNumber.textContent = '0';
  p1ScoreCard.appendChild(p1ScoreNumber);
  const p2ScoreCard = create('div', 'p2ScoreCard', 'score-card player-2');
  const p2ScoreNumber = create('span', 'p2ScoreNumber', 'score-number');
  p2ScoreNumber.textContent = '0';
  p2ScoreCard.appendChild(p2ScoreNumber);
  const drawsScoreNumber = create('span', 'drawsScoreNumber', 'score-number');
  drawsScoreNumber.textContent = '0';
  gameScreen.appendChild(p1ScoreCard);
  gameScreen.appendChild(p2ScoreCard);
  gameScreen.appendChild(drawsScoreNumber);

  // Tactical abilities
  const tacticalAbilitiesContainer = create('div', 'tacticalAbilitiesContainer', 'tactical-abilities-container');
  tacticalAbilitiesContainer.style.display = 'none';
  const shatterBtn = create('button', 'shatterBtn', 'btn-tactile ability-btn shatter-btn');
  const shatterCharges = create('span', 'shatterCharges');
  shatterCharges.textContent = '[1]';
  shatterBtn.appendChild(shatterCharges);
  const swapBtn = create('button', 'swapBtn', 'btn-tactile ability-btn swap-btn');
  const swapCharges = create('span', 'swapCharges');
  swapCharges.textContent = '[1]';
  swapBtn.appendChild(swapCharges);
  const cancelAbilityBtn = create('button', 'cancelAbilityBtn', 'btn-tactile cancel-ability-btn');
  tacticalAbilitiesContainer.appendChild(shatterBtn);
  tacticalAbilitiesContainer.appendChild(swapBtn);
  tacticalAbilitiesContainer.appendChild(cancelAbilityBtn);
  gameScreen.appendChild(tacticalAbilitiesContainer);

  // Board & Cells
  const winningStrikeSvg = create('svg', 'winningStrikeSvg', 'winning-strike-svg');
  winningStrikeSvg.style.display = 'none';
  gameScreen.appendChild(winningStrikeSvg);

  const board = create('div', 'board', 'board');
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const cell = create('button', '', 'cell');
    cell.setAttribute('data-index', String(i));
    board.appendChild(cell);
    cells.push(cell);
  }
  gameScreen.appendChild(board);

  // Game action buttons
  const restartRoundBtn = create('button', 'restartRoundBtn', 'action-btn');
  const backToSetupBtn = create('button', 'backToSetupBtn', 'action-btn');
  gameScreen.appendChild(restartRoundBtn);
  gameScreen.appendChild(backToSetupBtn);

  // Side panel items
  const moveHistoryList = create('ul', 'moveHistoryList', 'move-history-list');
  const masterVolumeSlider = create('input', 'masterVolumeSlider', 'volume-slider');
  masterVolumeSlider.value = '0.70';
  const themeSelector = create('select', 'themeSelector', 'control-btn select-btn');
  gameScreen.appendChild(moveHistoryList);
  gameScreen.appendChild(masterVolumeSlider);
  gameScreen.appendChild(themeSelector);

  // Modals
  const winnerModal = create('div', 'winnerModal', 'modal-backdrop');
  winnerModal.style.display = 'none';
  const modalWinnerTitle = create('h3', 'modalWinnerTitle');
  const modalWinnerMessage = create('p', 'modalWinnerMessage');
  const modalTrophy = create('span', 'modalTrophy');
  const modalP1Wins = create('span', 'modalP1Wins');
  const modalP2Wins = create('span', 'modalP2Wins');
  const modalDraws = create('span', 'modalDraws');
  const modalPlayAgainBtn = create('button', 'modalPlayAgainBtn', 'btn-tactile');
  const modalChangeModeBtn = create('button', 'modalChangeModeBtn', 'btn-tactile');
  winnerModal.appendChild(modalWinnerTitle);
  winnerModal.appendChild(modalWinnerMessage);
  winnerModal.appendChild(modalTrophy);
  winnerModal.appendChild(modalP1Wins);
  winnerModal.appendChild(modalP2Wins);
  winnerModal.appendChild(modalDraws);
  winnerModal.appendChild(modalPlayAgainBtn);
  winnerModal.appendChild(modalChangeModeBtn);
  doc.body.appendChild(winnerModal);

  const rulesModal = create('div', 'rulesModal', 'modal-backdrop');
  rulesModal.style.display = 'none';
  const rulesModalTitle = create('h3', 'rulesModalTitle');
  const closeRulesBtn = create('button', 'closeRulesBtn', 'close-btn');
  const gotItRulesBtn = create('button', 'gotItRulesBtn', 'btn-tactile');
  rulesModal.appendChild(rulesModalTitle);
  rulesModal.appendChild(closeRulesBtn);
  rulesModal.appendChild(gotItRulesBtn);
  doc.body.appendChild(rulesModal);

  return { doc, cells, board, winnerModal, rulesModal };
}

// =============================================================================
// Test Suites (12 Total)
// =============================================================================

describe('Chrono-Tic-Tac-Toe: Headless UI & Accessibility Master Test Suite', () => {

  // ---------------------------------------------------------------------------
  // Suite 1: DOM Mock Subsystem & Fixture Integrity
  // ---------------------------------------------------------------------------
  describe('Suite 1: DOM Mock Subsystem & Fixture Integrity', () => {
    it('should correctly manipulate classList and synchronize className', () => {
      const doc = new MockDocument();
      const el = doc.createElement('div');
      el.classList.add('alpha', 'beta');
      assert.equal(el.classList.contains('alpha'), true);
      assert.equal(el.classList.contains('beta'), true);
      assert.equal(el.classList.contains('gamma'), false);

      el.classList.remove('alpha');
      assert.equal(el.classList.contains('alpha'), false);
      assert.equal(el.classList.contains('beta'), true);

      el.classList.toggle('delta', true);
      assert.equal(el.classList.contains('delta'), true);
      el.classList.toggle('delta', false);
      assert.equal(el.classList.contains('delta'), false);
    });

    it('should correctly reflect dataset and attributes', () => {
      const doc = new MockDocument();
      const btn = doc.createElement('button');
      btn.setAttribute('data-mode', 'ghost');
      btn.setAttribute('data-player-index', '4');

      assert.equal(btn.dataset.mode, 'ghost');
      assert.equal(btn.dataset.playerIndex, '4');
      assert.equal(btn.getAttribute('data-mode'), 'ghost');
    });

    it('should handle hierarchy queries and activeElement focus tracking', () => {
      const { doc, board, cells } = createMockDomFixture();
      assert.equal(cells.length, 9);
      assert.equal(board.children.length, 9);

      cells[4].focus();
      assert.equal(doc.activeElement, cells[4]);

      cells[4].blur();
      assert.equal(doc.activeElement, null);
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Application Bootstrap & Safe Headless Degradation
  // ---------------------------------------------------------------------------
  describe('Suite 2: Application Bootstrap & Safe Headless Degradation', () => {
    it('should cleanly instantiate all subsystems without throwing in headless Node.js', () => {
      const app = bootstrapApp();
      assert.ok(app.eventBus instanceof EventBus);
      assert.ok(app.gameController instanceof GameController);
      assert.ok(app.soundEngine);
      assert.ok(app.laserStrike);
      assert.ok(app.confettiCannon);
    });

    it('should mount full DOM Controller and A11yManager when document is provided', () => {
      const { doc } = createMockDomFixture();
      const storage = new MockStorage();
      const app = bootstrapApp({ document: doc, storage });

      assert.ok(app.a11yManager instanceof A11yManager);
      assert.ok(app.domController instanceof DomController);
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Initial DOM State & Accessibility Mount
  // ---------------------------------------------------------------------------
  describe('Suite 3: Initial DOM State & Accessibility Mount', () => {
    it('should configure initial roving tabindex with cell 0 at 0 and others at -1', () => {
      const { doc, cells } = createMockDomFixture();
      const app = bootstrapApp({ document: doc });

      assert.equal(cells[0].getAttribute('tabindex'), '0');
      for (let i = 1; i < 9; i++) {
        assert.equal(cells[i].getAttribute('tabindex'), '-1');
      }
    });

    it('should assign valid W3C APG gridcell roles and coordinates to all cells', () => {
      const { doc, cells } = createMockDomFixture();
      bootstrapApp({ document: doc });

      for (let i = 0; i < 9; i++) {
        const r = Math.floor(i / 3) + 1;
        const c = (i % 3) + 1;
        assert.equal(cells[i].getAttribute('role'), 'gridcell');
        assert.equal(cells[i].getAttribute('aria-rowindex'), String(r));
        assert.equal(cells[i].getAttribute('aria-colindex'), String(c));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Setup Screen Controls & Configuration
  // ---------------------------------------------------------------------------
  describe('Suite 4: Setup Screen Controls & Configuration', () => {
    it('should switch game mode when mode card is clicked', () => {
      const { doc } = createMockDomFixture();
      const app = bootstrapApp({ document: doc });

      const modeCards = doc.querySelectorAll('.mode-card');
      const ghostCard = modeCards[1]; // data-mode="ghost"
      ghostCard.click();

      assert.equal(app.domController.selectedMode, 'ghost');
      assert.equal(ghostCard.classList.contains('active'), true);
      assert.equal(modeCards[0].classList.contains('active'), false);
    });

    it('should toggle opponent tabs and AI difficulty group visibility', () => {
      const { doc } = createMockDomFixture();
      const app = bootstrapApp({ document: doc });

      const tabPvp = doc.getElementById('tabPvp');
      const aiGroup = doc.getElementById('aiDifficultyGroup');

      tabPvp.click();
      assert.equal(app.domController.selectedOpponent, 'human');
      assert.equal(aiGroup.style.display, 'none');

      const tabAi = doc.getElementById('tabAi');
      tabAi.click();
      assert.equal(app.domController.selectedOpponent, 'ai');
      assert.equal(aiGroup.style.display, 'block');
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 5: Move Dispatching & Spring-Pop Visuals
  // ---------------------------------------------------------------------------
  describe('Suite 5: Move Dispatching & Spring-Pop Visuals', () => {
    it('should start game on click, hide setup, show arena, and dispatch moves', () => {
      const { doc, cells } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const app = bootstrapApp({ document: doc, soundEngine });

      const startBtn = doc.getElementById('startGameBtn');
      const setupScreen = doc.getElementById('setupScreen');
      const gameScreen = doc.getElementById('gameScreen');

      startBtn.click();
      assert.equal(setupScreen.style.display, 'none');
      assert.equal(gameScreen.style.display, 'block');

      // Click cell 4 (center)
      cells[4].click();

      const state = app.gameController.getState();
      assert.equal(state.board[4], 'p1');
      assert.equal(cells[4].textContent, '✖️');
      assert.equal(cells[4].classList.contains('cell-p1'), true);
      assert.equal(cells[4].classList.contains('marked'), true);

      // Sound should have played
      assert.ok(soundEngine.calls.some((c) => c === 'playPlace:p1'));
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 6: Chrono Ghost FIFO Aging Classes & Eviction Visuals
  // ---------------------------------------------------------------------------
  describe('Suite 6: Chrono Ghost FIFO Aging Classes & Eviction Visuals', () => {
    it('should assign mark-age-1, mark-age-2, mark-age-3 and evict oldest mark', () => {
      const { doc, cells } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const app = bootstrapApp({ document: doc, soundEngine });

      // Start Ghost mode in 2P PvP for deterministic control
      doc.getElementById('tabPvp').click();
      const modeCards = doc.querySelectorAll('.mode-card');
      modeCards[1].click(); // ghost mode
      doc.getElementById('startGameBtn').click();

      // P1 move 1: cell 0
      cells[0].click();
      assert.equal(cells[0].classList.contains('mark-age-1'), true);

      // P2 move 1: cell 1
      cells[1].click();

      // P1 move 2: cell 2
      cells[2].click();
      assert.equal(cells[0].classList.contains('mark-age-2'), true);
      assert.equal(cells[2].classList.contains('mark-age-1'), true);

      // P2 move 2: cell 3
      cells[3].click();

      // P1 move 3: cell 4 (P1 now has 3 marks: cell 0 is oldest, age 3, is-expiring-next)
      cells[4].click();
      assert.equal(cells[0].classList.contains('mark-age-3'), true);
      assert.equal(cells[0].classList.contains('is-expiring-next'), true);

      // P2 move 3: cell 5
      cells[5].click();

      // P1 move 4: cell 6 (Trigger FIFO eviction on cell 0!)
      cells[6].click();

      const state = app.gameController.getState();
      assert.equal(state.board[0], null, 'Oldest mark at index 0 must be nullified');
      assert.equal(cells[0].textContent, '');
      assert.ok(soundEngine.calls.includes('playVanish'));
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 7: Tactical Overdrive - Shatter Targeting Flow
  // ---------------------------------------------------------------------------
  describe('Suite 7: Tactical Overdrive - Shatter Targeting Flow', () => {
    it('should reject targeting own mark or empty cell, and destroy opponent mark', () => {
      const { doc, cells, board } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const app = bootstrapApp({ document: doc, soundEngine });

      doc.getElementById('tabPvp').click();
      const modeCards = doc.querySelectorAll('.mode-card');
      modeCards[2].click(); // tactical mode
      doc.getElementById('startGameBtn').click();

      // P1 places at 0
      cells[0].click();
      // P2 places at 4
      cells[4].click();

      // P1 turn: activates Shatter
      const shatterBtn = doc.getElementById('shatterBtn');
      shatterBtn.click();

      assert.ok(app.domController.targetingState);
      assert.equal(app.domController.targetingState.ability, 'shatter');
      assert.equal(board.classList.contains('targeting-shatter'), true);

      // Clicking empty cell 8 should be rejected
      cells[8].click();
      assert.ok(soundEngine.calls.includes('playError'));
      assert.notEqual(app.domController.targetingState, null);

      // Clicking enemy cell 4 should succeed and shatter it
      cells[4].click();
      const state = app.gameController.getState();
      assert.equal(state.board[4], null);
      assert.equal(cells[4].textContent, '');
      assert.equal(cells[4].classList.contains('cell-shattered'), true);
      assert.equal(cells[4].getAttribute('data-destroyed-mark'), '⭕');
      assert.equal(app.domController.targetingState, null);
      assert.ok(soundEngine.calls.includes('playAbility:shatter'));
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 8: Tactical Overdrive - Phase Swap Targeting Flow & Cancellation
  // ---------------------------------------------------------------------------
  describe('Suite 8: Tactical Overdrive - Phase Swap Targeting Flow & Cancellation', () => {
    it('should execute 2-step selection and swap adjacent marks, or cancel on ESC', () => {
      const { doc, cells, board } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const app = bootstrapApp({ document: doc, soundEngine });

      doc.getElementById('tabPvp').click();
      const modeCards = doc.querySelectorAll('.mode-card');
      modeCards[2].click(); // tactical mode
      doc.getElementById('startGameBtn').click();

      // P1 at 0
      cells[0].click();
      // P2 at 1 (adjacent to 0)
      cells[1].click();

      // P1 activates Swap
      const swapBtn = doc.getElementById('swapBtn');
      swapBtn.click();
      assert.equal(app.domController.targetingState.step, 1);

      // Clicking friendly cell 0 selects source mark
      cells[0].click();
      assert.equal(app.domController.targetingState.step, 2);
      assert.equal(app.domController.targetingState.sourceIndex, 0);
      assert.equal(cells[0].classList.contains('cell-swap-source'), true);

      // Clicking adjacent enemy cell 1 performs swap
      cells[1].click();
      const state = app.gameController.getState();
      assert.equal(state.board[0], 'p2');
      assert.equal(state.board[1], 'p1');
      assert.equal(cells[0].classList.contains('cell-swapped'), true);
      assert.equal(cells[0].classList.contains('swap-anim-a'), true);
      assert.equal(cells[1].classList.contains('cell-swapped'), true);
      assert.equal(cells[1].classList.contains('swap-anim-b'), true);
      assert.equal(app.domController.targetingState, null);
      assert.ok(soundEngine.calls.includes('playAbility:swap'));

      // Test ESC cancellation
      // Advance to P2 turn (which now has turn after swap)
      swapBtn.click();
      assert.ok(app.domController.targetingState);
      doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
      assert.equal(app.domController.targetingState, null);
      assert.equal(board.classList.contains('targeting-swap-1'), false);
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 9: Blitz Speed Timer Countdown & Warning Pulse
  // ---------------------------------------------------------------------------
  describe('Suite 9: Blitz Speed Timer Countdown & Warning Pulse', () => {
    it('should update timer bar and emit warning pulse at or below threshold', () => {
      const { doc } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const app = bootstrapApp({ document: doc, soundEngine });

      const blitzBar = doc.getElementById('blitzTimerBar');
      const blitzText = doc.getElementById('blitzTimerText');

      // Simulate BLITZ_TICK event
      app.eventBus.emit(EVENT_TYPES.BLITZ_TICK, {
        timeLeft: 3.2,
        totalDuration: 5.0,
        percentage: 64.0,
        player: 'p1'
      });

      assert.equal(blitzBar.style.width, '64%');
      assert.equal(blitzText.textContent, '3.2s');

      // Simulate BLITZ_WARNING event
      app.eventBus.emit(EVENT_TYPES.BLITZ_WARNING, {
        timeLeft: 1.4,
        player: 'p1',
        threshold: 1.5
      });

      assert.equal(blitzBar.classList.contains('blitz-warning'), true);
      assert.ok(soundEngine.calls.includes('playWarning'));
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 10: Game Over Celebrations & Stalemate Modals
  // ---------------------------------------------------------------------------
  describe('Suite 10: Game Over Celebrations & Stalemate Modals', () => {
    it('should trigger laser strike, confetti, sound, and victory modal on win', () => {
      const { doc } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const laserStrike = new MockLaserStrike();
      const confettiCannon = new MockConfettiCannon();
      const app = bootstrapApp({ document: doc, soundEngine, laserStrike, confettiCannon });

      // Simulate win
      app.eventBus.emit(EVENT_TYPES.GAME_OVER, {
        winner: 'p1',
        winningLine: [0, 1, 2],
        mode: 'classic',
        state: { winningLine: [0, 1, 2] }
      });

      assert.ok(laserStrike.calls.some((c) => c.method === 'draw'));
      assert.ok(confettiCannon.calls.some((c) => c.method === 'fire'));
      assert.ok(soundEngine.calls.includes('playWin'));

      const modal = doc.getElementById('winnerModal');
      assert.equal(modal.style.display, 'flex');
      assert.equal(doc.getElementById('modalWinnerTitle').textContent, 'Player 1 Wins!');
      assert.equal(doc.getElementById('p1ScoreNumber').textContent, '1');
    });

    it('should trigger draw sound and stalemate modal on draw', () => {
      const { doc } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const app = bootstrapApp({ document: doc, soundEngine });

      app.eventBus.emit(EVENT_TYPES.GAME_OVER, {
        winner: null,
        winningLine: null,
        mode: 'classic',
        state: {}
      });

      assert.ok(soundEngine.calls.includes('playDraw'));
      assert.equal(doc.getElementById('modalWinnerTitle').textContent, 'Stalemate!');
      assert.equal(doc.getElementById('drawsScoreNumber').textContent, '1');
    });

    it('should delay opening the victory modal when gameOverModalDelay is set, allowing player to see final move and line', async () => {
      const { doc } = createMockDomFixture();
      const app = bootstrapApp({
        document: doc,
        domOptions: { gameOverModalDelay: 60 }
      });

      const modal = doc.getElementById('winnerModal');
      assert.equal(modal.style.display, 'none');

      // Emit game over
      app.eventBus.emit(EVENT_TYPES.GAME_OVER, {
        winner: 'p2',
        winningLine: [3, 4, 5],
        mode: 'classic',
        state: { winningLine: [3, 4, 5] }
      });

      // Initially during the pause, the modal must NOT be open yet
      assert.equal(modal.style.display, 'none', 'Modal must wait during pause to allow viewing the winning pawn');

      // Wait for delay to expire
      await new Promise((resolve) => setTimeout(resolve, 80));

      assert.equal(modal.style.display, 'flex', 'Modal must open after the pause completes');
      assert.equal(doc.getElementById('modalWinnerTitle').textContent, 'AI Bot Wins!');
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 11: W3C APG Modal Accessibility & Focus Trapping
  // ---------------------------------------------------------------------------
  describe('Suite 11: W3C APG Modal Accessibility & Focus Trapping', () => {
    it('should apply inert to app-wrapper, scroll lock to body, and restore on close', () => {
      const { doc, rulesModal } = createMockDomFixture();
      const app = bootstrapApp({ document: doc });
      const a11y = app.a11yManager;
      const appWrapper = doc.getElementById('appWrapper');

      const triggerBtn = doc.createElement('button');
      doc.body.appendChild(triggerBtn);
      triggerBtn.focus();
      assert.equal(doc.activeElement, triggerBtn);

      a11y.openModal(rulesModal, triggerBtn);
      assert.equal(rulesModal.style.display, 'flex');
      assert.equal(appWrapper.hasAttribute('inert'), true);
      assert.equal(doc.body.classList.contains('modal-open'), true);

      a11y.closeModal(rulesModal);
      assert.equal(rulesModal.style.display, 'none');
      assert.equal(appWrapper.hasAttribute('inert'), false);
      assert.equal(doc.body.classList.contains('modal-open'), false);
      assert.equal(doc.activeElement, triggerBtn);
    });

    it('should trap Tab focus cycles inside modal and dismiss on Escape', () => {
      const { doc, rulesModal } = createMockDomFixture();
      const a11y = new A11yManager({ document: doc });

      a11y.openModal(rulesModal);
      const closeBtn = doc.getElementById('closeRulesBtn');
      const gotItBtn = doc.getElementById('gotItRulesBtn');

      // Forward Tab from last element wraps to first
      gotItBtn.focus();
      let prevented = false;
      rulesModal.dispatchEvent({
        type: 'keydown',
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => { prevented = true; }
      });
      assert.equal(prevented, true);
      assert.equal(doc.activeElement, closeBtn);

      // Shift+Tab from first element wraps to last
      prevented = false;
      rulesModal.dispatchEvent({
        type: 'keydown',
        key: 'Tab',
        shiftKey: true,
        preventDefault: () => { prevented = true; }
      });
      assert.equal(prevented, true);
      assert.equal(doc.activeElement, gotItBtn);

      // Escape key closes modal
      rulesModal.dispatchEvent({
        type: 'keydown',
        key: 'Escape',
        preventDefault: () => {}
      });
      assert.equal(rulesModal.style.display, 'none');
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 12: 2D Roving Tabindex Keyboard Navigation & Persistence
  // ---------------------------------------------------------------------------
  describe('Suite 12: 2D Roving Tabindex Keyboard Navigation & Persistence', () => {
    it('should navigate 3x3 grid using Arrow keys, Home, End, PageUp, and PageDown', () => {
      const { doc, board, cells } = createMockDomFixture();
      const a11y = new A11yManager({ document: doc, boardElement: board, cells });

      assert.equal(a11y.focusedIndex, 0);

      // ArrowRight -> cell 1
      board.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
      assert.equal(a11y.focusedIndex, 1);
      assert.equal(cells[1].getAttribute('tabindex'), '0');
      assert.equal(cells[0].getAttribute('tabindex'), '-1');

      // ArrowDown -> cell 4 (Row 1, Col 1)
      board.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
      assert.equal(a11y.focusedIndex, 4);

      // End (Row end) -> cell 5
      board.dispatchEvent({ type: 'keydown', key: 'End' });
      assert.equal(a11y.focusedIndex, 5);

      // Home (Row start) -> cell 3
      board.dispatchEvent({ type: 'keydown', key: 'Home' });
      assert.equal(a11y.focusedIndex, 3);

      // PageDown -> cell 6 (Bottom cell in Col 0)
      board.dispatchEvent({ type: 'keydown', key: 'PageDown' });
      assert.equal(a11y.focusedIndex, 6);

      // PageUp -> cell 0 (Top cell in Col 0)
      board.dispatchEvent({ type: 'keydown', key: 'PageUp' });
      assert.equal(a11y.focusedIndex, 0);
    });

    it('should activate cell with Enter and Space with preventDefault', () => {
      const { doc, board, cells } = createMockDomFixture();
      const a11y = new A11yManager({ document: doc, boardElement: board, cells });

      let spacePrevented = false;
      let cell0Clicked = false;
      cells[0].addEventListener('click', () => { cell0Clicked = true; });

      board.dispatchEvent({
        type: 'keydown',
        key: ' ',
        preventDefault: () => { spacePrevented = true; }
      });

      assert.equal(spacePrevented, true, 'Space on cell MUST call preventDefault');
      assert.equal(cell0Clicked, true);
    });

    it('should switch theme and persist to localStorage', () => {
      const { doc } = createMockDomFixture();
      const storage = new MockStorage();
      const app = bootstrapApp({ document: doc, storage });

      app.domController.setTheme('parchment');
      assert.equal(doc.documentElement.getAttribute('data-theme'), 'parchment');
      assert.equal(storage.getItem('chrono_ttt_theme'), 'parchment');

      app.domController.setTheme('obsidian');
      assert.equal(doc.documentElement.getAttribute('data-theme'), 'obsidian');
      assert.equal(storage.getItem('chrono_ttt_theme'), 'obsidian');
    });

    it('should bind audio volume slider and mute toggle', () => {
      const { doc } = createMockDomFixture();
      const soundEngine = new MockSoundEngine();
      const app = bootstrapApp({ document: doc, soundEngine });

      const soundBtn = doc.getElementById('soundToggle');
      soundBtn.click();

      assert.equal(soundEngine.isMuted(), true);
      assert.equal(doc.getElementById('soundIcon').textContent, '🔇');

      soundBtn.click();
      assert.equal(soundEngine.isMuted(), false);
      assert.equal(doc.getElementById('soundIcon').textContent, '🔊');
    });
  });

});
