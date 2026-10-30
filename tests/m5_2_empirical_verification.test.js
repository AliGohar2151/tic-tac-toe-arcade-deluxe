/**
 * @file m5_2_empirical_verification.test.js
 * @description Empirical Challenger M5-2 Verification Suite for Chrono-Tic-Tac-Toe.
 * Rigorously stress-tests:
 *  1. Rapid-burst twin polite live announcer alternation & non-starvation.
 *  2. Whitespace guard preventing live region mutations or history pollution.
 *  3. Null and undefined parameter defense across A11yManager and DomController.
 *  4. Strict bidirectional synchronization between dual theme selectors (#themeSelect & #themeSelector).
 *  5. W3C APG Accessible Modal dialog focus trapping, 2D roving tabindex boundary clamping, and ESC handling.
 */

import { describe, it } from 'node:test';
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
// DOM Mock Infrastructure for Headless Execution
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
    this._owner._className = Array.from(this._tokens).join(' ');
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

  const notMatch = t.match(/:not\(([^)]+)\)/);
  if (notMatch) {
    const inner = notMatch[1];
    if (matchesSimple(el, inner)) return false;
    t = t.replace(notMatch[0], '');
  }

  if (t.includes(':disabled') || t.includes('[disabled]')) {
    if (!el.disabled) return false;
    t = t.replace(':disabled', '').replace('[disabled]', '');
  }

  const tagMatch = t.match(/^[a-zA-Z0-9]+/);
  if (tagMatch) {
    if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    t = t.slice(tagMatch[0].length);
  }

  const idMatch = t.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    t = t.replace(idMatch[0], '');
  }

  const classMatches = t.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const cm of classMatches) {
    if (!el.classList.contains(cm[1])) return false;
    t = t.replace(cm[0], '');
  }

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
    this.documentElement.setAttribute('data-theme', 'midnight');
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

function createFullFixture() {
  const doc = new MockDocument();
  const create = (tag, id, className = '') => {
    const el = doc.createElement(tag);
    if (id) doc.registerElement(id, el);
    if (className) el.className = className;
    return el;
  };

  const appWrapper = create('div', 'appWrapper', 'app-wrapper');
  doc.body.appendChild(appWrapper);

  const announcerA = create('div', 'a11yAnnouncerPoliteA', 'sr-only');
  const announcerB = create('div', 'a11yAnnouncerPoliteB', 'sr-only');
  const announcerAssertive = create('div', 'a11yAnnouncerAssertive', 'sr-only');
  doc.body.appendChild(announcerA);
  doc.body.appendChild(announcerB);
  doc.body.appendChild(announcerAssertive);

  const themeSelect = create('select', 'themeSelect', 'control-btn select-btn');
  themeSelect.value = 'midnight';
  const soundToggle = create('button', 'soundToggle', 'control-btn icon-btn');
  const soundIcon = create('span', 'soundIcon');
  soundIcon.textContent = '🔊';
  soundToggle.appendChild(soundIcon);
  const helpButton = create('button', 'helpButton', 'control-btn icon-btn');
  appWrapper.appendChild(themeSelect);
  appWrapper.appendChild(soundToggle);
  appWrapper.appendChild(helpButton);

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

  const restartRoundBtn = create('button', 'restartRoundBtn', 'action-btn');
  const backToSetupBtn = create('button', 'backToSetupBtn', 'action-btn');
  gameScreen.appendChild(restartRoundBtn);
  gameScreen.appendChild(backToSetupBtn);

  const moveHistoryList = create('ul', 'moveHistoryList', 'move-history-list');
  const masterVolumeSlider = create('input', 'masterVolumeSlider', 'volume-slider');
  masterVolumeSlider.value = '0.70';
  const themeSelector = create('select', 'themeSelector', 'control-btn select-btn');
  themeSelector.value = 'midnight';
  gameScreen.appendChild(moveHistoryList);
  gameScreen.appendChild(masterVolumeSlider);
  gameScreen.appendChild(themeSelector);

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

  return {
    doc,
    appWrapper,
    announcerA,
    announcerB,
    announcerAssertive,
    themeSelect,
    themeSelector,
    soundToggle,
    helpButton,
    board,
    cells,
    winnerModal,
    rulesModal,
    closeRulesBtn,
    gotItRulesBtn,
    modalPlayAgainBtn,
    modalChangeModeBtn
  };
}

// =============================================================================
// CHALLENGER M5-2 EMPIRICAL TEST SUITE
// =============================================================================

describe('Challenger M5-2: Empirical Verification & Adversarial Stress Tests', () => {

  // ---------------------------------------------------------------------------
  // 1. Rapid-Burst Twin Polite Live Announcer Alternation
  // ---------------------------------------------------------------------------
  describe('1. Rapid-Burst Twin Polite Live Announcer Alternation', () => {

    it('should strictly alternate consecutive announcements between twin nodes B and A', async () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        announcerPoliteA: fixture.announcerA,
        announcerPoliteB: fixture.announcerB,
        announcerAssertive: fixture.announcerAssertive
      });

      assert.equal(a11y.activePoliteIndex, 0);

      // Call 1: should target B, toggle activePoliteIndex to 1
      a11y.announce('Announcement Alpha', 'polite');
      assert.equal(a11y.activePoliteIndex, 1, 'activePoliteIndex must toggle to 1 immediately');

      // Call 2: < 10ms later, should target A, toggle activePoliteIndex to 0
      a11y.announce('Announcement Beta', 'polite');
      assert.equal(a11y.activePoliteIndex, 0, 'activePoliteIndex must toggle to 0 immediately');

      // Wait 70ms for both 50ms timers to complete
      await new Promise((r) => setTimeout(r, 70));

      assert.equal(fixture.announcerB.textContent, 'Announcement Alpha', 'Node B must hold Alpha');
      assert.equal(fixture.announcerA.textContent, 'Announcement Beta', 'Node A must hold Beta');

      // Call 3: should target B again
      a11y.announce('Announcement Gamma', 'polite');
      assert.equal(a11y.activePoliteIndex, 1);

      await new Promise((r) => setTimeout(r, 70));
      assert.equal(fixture.announcerB.textContent, 'Announcement Gamma');
    });

    it('should survive 20 rapid-burst announcements without dropping or starving history entries', async () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        announcerPoliteA: fixture.announcerA,
        announcerPoliteB: fixture.announcerB,
        announcerAssertive: fixture.announcerAssertive
      });

      const burstCount = 20;
      for (let i = 0; i < burstCount; i++) {
        a11y.announce(`Burst Message #${i}`, 'polite');
        const expectedNextIndex = (i + 1) % 2;
        assert.equal(a11y.activePoliteIndex, expectedNextIndex, `activePoliteIndex must strictly be ${expectedNextIndex} after call ${i}`);
      }

      assert.equal(a11y.announcementHistory.length, burstCount, 'All 20 burst announcements must be captured in history');

      // Verify each announcement in history matches strictly
      for (let i = 0; i < burstCount; i++) {
        assert.equal(a11y.announcementHistory[i].message, `Burst Message #${i}`);
        assert.equal(a11y.announcementHistory[i].priority, 'polite');
      }

      // Allow all timers to flush
      await new Promise((r) => setTimeout(r, 80));

      // After burst of 20 (even number):
      // The last announcement (i=19, odd) went to targetNode (when activePoliteIndex was 1 -> node A).
      // The second to last announcement (i=18, even) went to targetNode (when activePoliteIndex was 0 -> node B).
      assert.equal(fixture.announcerA.textContent, `Burst Message #19`);
      assert.equal(fixture.announcerB.textContent, `Burst Message #18`);
    });

    it('should route assertive announcements directly to the assertive node without toggling polite index', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        announcerPoliteA: fixture.announcerA,
        announcerPoliteB: fixture.announcerB,
        announcerAssertive: fixture.announcerAssertive
      });

      const initialIndex = a11y.activePoliteIndex;
      a11y.announce('URGENT BLITZ WARNING!', 'assertive');

      assert.equal(fixture.announcerAssertive.textContent, 'URGENT BLITZ WARNING!');
      assert.equal(a11y.activePoliteIndex, initialIndex, 'Assertive announcements must NOT mutate activePoliteIndex');
      assert.equal(a11y.announcementHistory.length, 1);
      assert.equal(a11y.announcementHistory[0].priority, 'assertive');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Whitespace Guard Verification
  // ---------------------------------------------------------------------------
  describe('2. Whitespace Guard Verification', () => {

    it('should ignore purely whitespace, empty, or whitespace-padded announcements without mutating DOM or history', async () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        announcerPoliteA: fixture.announcerA,
        announcerPoliteB: fixture.announcerB,
        announcerAssertive: fixture.announcerAssertive
      });

      const initialIndex = a11y.activePoliteIndex;

      // Test purely whitespace variants
      a11y.announce('');
      a11y.announce(' ');
      a11y.announce('    ');
      a11y.announce('\t\n\r  \t\n');
      a11y.announce(null);
      a11y.announce(undefined);

      assert.equal(a11y.announcementHistory.length, 0, 'No whitespace announcement must enter history');
      assert.equal(a11y.activePoliteIndex, initialIndex, 'activePoliteIndex must not change');
      assert.equal(fixture.announcerA.textContent, '');
      assert.equal(fixture.announcerB.textContent, '');
      assert.equal(fixture.announcerAssertive.textContent, '');

      // Assertive whitespace guard
      a11y.announce('   \t\n', 'assertive');
      assert.equal(fixture.announcerAssertive.textContent, '');
      assert.equal(a11y.announcementHistory.length, 0);

      // Now send a valid announcement with leading/trailing whitespace
      a11y.announce('   Clean Me Up   ', 'polite');
      assert.equal(a11y.announcementHistory.length, 1);
      assert.equal(a11y.announcementHistory[0].message, 'Clean Me Up', 'Leading and trailing whitespace must be trimmed');

      await new Promise((r) => setTimeout(r, 70));
      assert.equal(fixture.announcerB.textContent, 'Clean Me Up');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Null & Undefined Parameter Defense
  // ---------------------------------------------------------------------------
  describe('3. Null & Undefined Parameter Defense across A11yManager & DomController', () => {

    it('updateCellLabels() should tolerate null and undefined state without throwing', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        boardElement: fixture.board,
        cells: fixture.cells
      });

      // Call with null
      assert.doesNotThrow(() => {
        a11y.updateCellLabels(null);
      });
      assert.equal(fixture.cells[0].getAttribute('aria-label'), 'Row 1, Column 1, empty');
      assert.equal(fixture.cells[8].getAttribute('aria-label'), 'Row 3, Column 3, empty');

      // Call with undefined
      assert.doesNotThrow(() => {
        a11y.updateCellLabels(undefined);
      });
      assert.equal(fixture.cells[4].getAttribute('aria-label'), 'Row 2, Column 2, empty');

      // Call with null state and null targetingState
      assert.doesNotThrow(() => {
        a11y.updateCellLabels(null, null);
      });

      // Call with malformed state object (missing queues, missing board)
      assert.doesNotThrow(() => {
        a11y.updateCellLabels({ board: null, mode: null, winningLine: null });
      });
      assert.equal(fixture.cells[0].getAttribute('aria-label'), 'Row 1, Column 1, empty');
    });

    it('setFocusedCell() should tolerate null, undefined, and non-integer inputs without corrupting state', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        boardElement: fixture.board,
        cells: fixture.cells
      });

      assert.equal(a11y.focusedIndex, 0);

      // Testing out-of-bound numbers correctly clamped/ignored:
      a11y.setFocusedCell(-5);
      assert.equal(a11y.focusedIndex, 0, 'Negative index must be ignored');

      a11y.setFocusedCell(99);
      assert.equal(a11y.focusedIndex, 0, 'Index > 8 must be ignored');

      a11y.setFocusedCell(4);
      assert.equal(a11y.focusedIndex, 4, 'Valid index 4 must be set');

      a11y.setFocusedCell(9); // 9 is out-of-bounds for 0-8
      assert.equal(a11y.focusedIndex, 4, 'Index 9 must be ignored');

      // Hardened defense: null, undefined, strings, NaN must not bypass bounds checks
      a11y.setFocusedCell(null);
      assert.equal(a11y.focusedIndex, 4, 'setFocusedCell(null) must preserve valid focusedIndex');
      a11y.setFocusedCell(undefined);
      assert.equal(a11y.focusedIndex, 4, 'setFocusedCell(undefined) must preserve valid focusedIndex');
      a11y.setFocusedCell('4');
      assert.equal(a11y.focusedIndex, 4, 'setFocusedCell(string) must preserve valid focusedIndex');
      a11y.setFocusedCell(NaN);
      assert.equal(a11y.focusedIndex, 4, 'setFocusedCell(NaN) must preserve valid focusedIndex');

      const zeroTabindexCells = fixture.cells.filter(c => c.getAttribute('tabindex') === '0');
      assert.equal(zeroTabindexCells.length, 1, 'Exactly one cell retains tabindex="0"');
    });

    it('openModal() and closeModal() should gracefully tolerate null inputs', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({ document: fixture.doc });

      assert.doesNotThrow(() => {
        a11y.openModal(null);
      });
      assert.doesNotThrow(() => {
        a11y.openModal(undefined);
      });
      assert.doesNotThrow(() => {
        a11y.closeModal(null);
      });
      assert.doesNotThrow(() => {
        a11y.closeModal(undefined);
      });
    });

    it('domController.setTheme() should safely fallback to midnight when passed null or undefined', () => {
      const fixture = createFullFixture();
      const storage = new MockStorage();
      const app = bootstrapApp({ document: fixture.doc, storage });

      app.domController.setTheme(null);
      assert.equal(fixture.doc.documentElement.getAttribute('data-theme'), 'midnight');
      assert.equal(storage.getItem('chrono_ttt_theme'), 'midnight');

      app.domController.setTheme(undefined);
      assert.equal(fixture.doc.documentElement.getAttribute('data-theme'), 'midnight');

      app.domController.setTheme('invalid_theme_xyz');
      assert.equal(fixture.doc.documentElement.getAttribute('data-theme'), 'midnight');
    });

    it('domController internal badge and modal handlers should tolerate null state without crashing', () => {
      const fixture = createFullFixture();
      const app = bootstrapApp({ document: fixture.doc });

      assert.doesNotThrow(() => {
        app.domController._updateTacticalBadges(null);
      });
      assert.doesNotThrow(() => {
        app.domController._updateTacticalBadges(undefined);
      });
      assert.doesNotThrow(() => {
        app.domController._updateTacticalButtons('p1', null);
      });
      assert.doesNotThrow(() => {
        app.domController._updateTurnBanner(null);
      });
      assert.doesNotThrow(() => {
        app.domController._openModal(null);
      });
      assert.doesNotThrow(() => {
        app.domController._closeModal(null);
      });
    });

    it('a11y announcement methods should safely handle default and undefined state objects', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        announcerPoliteA: fixture.announcerA,
        announcerPoliteB: fixture.announcerB,
        announcerAssertive: fixture.announcerAssertive
      });

      // Default calls (no arguments passed -> undefined -> defaults to {})
      assert.doesNotThrow(() => a11y.announceRoundStart());
      assert.doesNotThrow(() => a11y.announceMove('p1', 4));
      assert.doesNotThrow(() => a11y.announceVanish('p1', 0));
      assert.doesNotThrow(() => a11y.announceAbility('p1', 'shatter', { targetIndex: 2 }));
      assert.doesNotThrow(() => a11y.announceTurn('p1'));
      assert.doesNotThrow(() => a11y.announceGameOver('p1', [0, 1, 2], false));
      assert.doesNotThrow(() => a11y.announceGameOver(null, null, true));
    });

    it('announce methods should gracefully tolerate null state without throwing TypeError', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        announcerPoliteA: fixture.announcerA,
        announcerPoliteB: fixture.announcerB,
        announcerAssertive: fixture.announcerAssertive
      });

      // updateCellLabels uses `const s = state || {};`, so it gracefully tolerates null
      assert.doesNotThrow(() => a11y.updateCellLabels(null));

      // announce methods now safely use `const s = state || {};` to tolerate null state
      assert.doesNotThrow(() => {
        a11y.announceRoundStart(null);
      });

      assert.doesNotThrow(() => {
        a11y.announceMove('p1', 0, null);
      });

      assert.doesNotThrow(() => {
        a11y.announceVanish('p1', 0, null);
      });

      assert.doesNotThrow(() => {
        a11y.announceAbility('p1', 'shatter', { targetIndex: 2 }, null);
      });

      assert.doesNotThrow(() => {
        a11y.announceTurn('p1', false, null);
      });

      assert.doesNotThrow(() => {
        a11y.announceGameOver('p1', [0, 1, 2], false, null);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Dual Theme Selector Strict Bidirectional Synchronization
  // ---------------------------------------------------------------------------
  describe('4. Dual Theme Selector Strict Bidirectional Synchronization', () => {

    it('should initialize both header themeSelect and console themeSelector to midnight by default', () => {
      const fixture = createFullFixture();
      const app = bootstrapApp({ document: fixture.doc });

      assert.equal(fixture.themeSelect.value, 'midnight');
      assert.equal(fixture.themeSelector.value, 'midnight');
      assert.equal(fixture.doc.documentElement.getAttribute('data-theme'), 'midnight');
    });

    it('should sync console themeSelector when header themeSelect is changed by user', () => {
      const fixture = createFullFixture();
      const storage = new MockStorage();
      const app = bootstrapApp({ document: fixture.doc, storage });

      // User changes header selector to parchment
      fixture.themeSelect.value = 'parchment';
      fixture.themeSelect.dispatchEvent({
        type: 'change',
        target: fixture.themeSelect
      });

      assert.equal(fixture.themeSelect.value, 'parchment');
      assert.equal(fixture.themeSelector.value, 'parchment', 'Console selector must sync to parchment');
      assert.equal(fixture.doc.documentElement.getAttribute('data-theme'), 'parchment');
      assert.equal(storage.getItem('chrono_ttt_theme'), 'parchment');
    });

    it('should sync header themeSelect when console themeSelector is changed by user', () => {
      const fixture = createFullFixture();
      const storage = new MockStorage();
      const app = bootstrapApp({ document: fixture.doc, storage });

      // User changes console selector to obsidian
      fixture.themeSelector.value = 'obsidian';
      fixture.themeSelector.dispatchEvent({
        type: 'change',
        target: fixture.themeSelector
      });

      assert.equal(fixture.themeSelector.value, 'obsidian');
      assert.equal(fixture.themeSelect.value, 'obsidian', 'Header selector must sync to obsidian');
      assert.equal(fixture.doc.documentElement.getAttribute('data-theme'), 'obsidian');
      assert.equal(storage.getItem('chrono_ttt_theme'), 'obsidian');
    });

    it('should restore and synchronize both selectors from persistent storage on boot', () => {
      const fixture = createFullFixture();
      const storage = new MockStorage();
      storage.setItem('chrono_ttt_theme', 'obsidian');

      const app = bootstrapApp({ document: fixture.doc, storage });

      assert.equal(fixture.themeSelect.value, 'obsidian');
      assert.equal(fixture.themeSelector.value, 'obsidian');
      assert.equal(fixture.doc.documentElement.getAttribute('data-theme'), 'obsidian');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Accessible Modal Focus Trapping, 2D Roving Tabindex & ESC Handling
  // ---------------------------------------------------------------------------
  describe('5. Modal Focus Trapping, 2D Roving Tabindex Clamping & ESC Handling', () => {

    it('should set inert and aria-hidden on appWrapper during modal open, and remove on close', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        appWrapper: fixture.appWrapper
      });

      a11y.openModal(fixture.rulesModal, fixture.helpButton);

      assert.equal(fixture.rulesModal.style.display, 'flex');
      assert.equal(fixture.rulesModal.getAttribute('role'), 'dialog');
      assert.equal(fixture.rulesModal.getAttribute('aria-modal'), 'true');
      assert.equal(fixture.appWrapper.getAttribute('inert'), '');
      assert.equal(fixture.appWrapper.getAttribute('aria-hidden'), 'true');
      assert.equal(fixture.doc.body.classList.contains('modal-open'), true);
      assert.equal(fixture.doc.body.style.overflow, 'hidden');

      // Close modal
      a11y.closeModal(fixture.rulesModal);

      assert.equal(fixture.rulesModal.style.display, 'none');
      assert.equal(fixture.appWrapper.hasAttribute('inert'), false);
      assert.equal(fixture.appWrapper.hasAttribute('aria-hidden'), false);
      assert.equal(fixture.doc.body.classList.contains('modal-open'), false);
      assert.equal(fixture.doc.body.style.overflow, '');
      assert.equal(fixture.doc.activeElement, fixture.helpButton, 'Focus must return to helpButton trigger');
    });

    it('should trap Tab cycles forward and backward inside modal dialog', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        appWrapper: fixture.appWrapper
      });

      a11y.openModal(fixture.rulesModal);

      // Focusables inside rulesModal: closeRulesBtn (first), gotItRulesBtn (last)
      assert.equal(fixture.doc.activeElement, fixture.closeRulesBtn, 'Initial focus should be on first focusable element');

      // Forward Tab from last element wraps to first
      fixture.gotItRulesBtn.focus();
      assert.equal(fixture.doc.activeElement, fixture.gotItRulesBtn);

      let prevented = false;
      fixture.rulesModal.dispatchEvent({
        type: 'keydown',
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => { prevented = true; }
      });
      assert.equal(prevented, true, 'Tab wrap must call preventDefault');
      assert.equal(fixture.doc.activeElement, fixture.closeRulesBtn, 'Tab from last must wrap to first');

      // Backward Shift+Tab from first element wraps to last
      prevented = false;
      fixture.rulesModal.dispatchEvent({
        type: 'keydown',
        key: 'Tab',
        shiftKey: true,
        preventDefault: () => { prevented = true; }
      });
      assert.equal(prevented, true, 'Shift+Tab wrap must call preventDefault');
      assert.equal(fixture.doc.activeElement, fixture.gotItRulesBtn, 'Shift+Tab from first must wrap to last');
    });

    it('should dismiss modal and restore focus on Escape key', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        appWrapper: fixture.appWrapper
      });

      a11y.openModal(fixture.rulesModal, fixture.helpButton);
      assert.equal(fixture.rulesModal.style.display, 'flex');

      let prevented = false;
      fixture.rulesModal.dispatchEvent({
        type: 'keydown',
        key: 'Escape',
        preventDefault: () => { prevented = true; }
      });

      assert.equal(prevented, true, 'Escape must call preventDefault');
      assert.equal(fixture.rulesModal.style.display, 'none', 'Escape must close modal');
      assert.equal(fixture.doc.activeElement, fixture.helpButton, 'Escape must restore focus to helpButton');
    });

    it('should strictly clamp 2D Arrow key navigation at grid boundaries without wrapping', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        boardElement: fixture.board,
        cells: fixture.cells
      });

      assert.equal(a11y.focusedIndex, 0);

      // Left boundary clamping at cell 0 (Row 0, Col 0)
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
      assert.equal(a11y.focusedIndex, 0, 'ArrowLeft at cell 0 must clamp at 0');

      // Top boundary clamping at cell 0
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowUp' });
      assert.equal(a11y.focusedIndex, 0, 'ArrowUp at cell 0 must clamp at 0');

      // Navigate across Row 0: 0 -> 1 -> 2
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
      assert.equal(a11y.focusedIndex, 1);
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
      assert.equal(a11y.focusedIndex, 2);

      // Right boundary clamping at cell 2 (Row 0, Col 2)
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
      assert.equal(a11y.focusedIndex, 2, 'ArrowRight at cell 2 must clamp at 2');

      // Navigate down Col 2: 2 -> 5 -> 8
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
      assert.equal(a11y.focusedIndex, 5);
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
      assert.equal(a11y.focusedIndex, 8);

      // Bottom boundary clamping at cell 8 (Row 2, Col 2)
      fixture.board.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
      assert.equal(a11y.focusedIndex, 8, 'ArrowDown at cell 8 must clamp at 8');

      // Verify Tabindex invariant: exactly ONE cell has tabindex="0", remaining have "-1"
      fixture.cells.forEach((cell, idx) => {
        assert.equal(cell.getAttribute('tabindex'), idx === 8 ? '0' : '-1');
      });
    });

    it('should support Home, End, PageUp, and PageDown within rows and columns', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        boardElement: fixture.board,
        cells: fixture.cells
      });

      // Jump to center cell 4 (Row 1, Col 1)
      a11y.setFocusedCell(4);
      assert.equal(a11y.focusedIndex, 4);

      // Home: first cell in current row -> cell 3
      fixture.board.dispatchEvent({ type: 'keydown', key: 'Home' });
      assert.equal(a11y.focusedIndex, 3);

      // End: last cell in current row -> cell 5
      fixture.board.dispatchEvent({ type: 'keydown', key: 'End' });
      assert.equal(a11y.focusedIndex, 5);

      // Ctrl+Home: top-left of entire grid -> cell 0
      fixture.board.dispatchEvent({ type: 'keydown', key: 'Home', ctrlKey: true });
      assert.equal(a11y.focusedIndex, 0);

      // Ctrl+End: bottom-right of entire grid -> cell 8
      fixture.board.dispatchEvent({ type: 'keydown', key: 'End', ctrlKey: true });
      assert.equal(a11y.focusedIndex, 8);

      // PageUp from cell 8 (Col 2): top cell in current column -> cell 2
      fixture.board.dispatchEvent({ type: 'keydown', key: 'PageUp' });
      assert.equal(a11y.focusedIndex, 2);

      // PageDown from cell 2 (Col 2): bottom cell in current column -> cell 8
      fixture.board.dispatchEvent({ type: 'keydown', key: 'PageDown' });
      assert.equal(a11y.focusedIndex, 8);
    });

    it('Space and Enter keys must activate cell, with Space preventing default scroll', () => {
      const fixture = createFullFixture();
      const a11y = new A11yManager({
        document: fixture.doc,
        boardElement: fixture.board,
        cells: fixture.cells
      });

      a11y.setFocusedCell(4);

      let enterClicked = false;
      fixture.cells[4].addEventListener('click', () => { enterClicked = true; });

      fixture.board.dispatchEvent({
        type: 'keydown',
        key: 'Enter',
        preventDefault: () => {}
      });
      assert.equal(enterClicked, true, 'Enter key must trigger cell click');

      let spaceClicked = false;
      let spacePrevented = false;
      fixture.cells[4].addEventListener('click', () => { spaceClicked = true; });

      fixture.board.dispatchEvent({
        type: 'keydown',
        key: ' ',
        preventDefault: () => { spacePrevented = true; }
      });
      assert.equal(spacePrevented, true, 'Space key MUST call preventDefault to stop scroll');
      assert.equal(spaceClicked, true, 'Space key must trigger cell click');
    });
  });

});
