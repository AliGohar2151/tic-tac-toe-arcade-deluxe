/**
 * @file a11yManager.js
 * @description WCAG 2.1 AA Accessibility Manager for Chrono-Tic-Tac-Toe.
 * Provides 2D Roving Tabindex across 3x3 grid, Twin-Node Live Status Announcer,
 * Dynamic ARIA Label Synthesis, and W3C APG Accessible Modal Dialog Focus Trapping.
 */

import { areAdjacent, getGhostAgingMap } from '../core/types.js';

export class A11yManager {
  /**
   * @param {Object} options
   * @param {Document} [options.document] Injected document object
   * @param {HTMLElement} [options.boardElement] The grid board container
   * @param {Array<HTMLElement>|NodeList} [options.cells] Array of 9 grid cell buttons
   * @param {HTMLElement} [options.appWrapper] Container for background inert masking
   * @param {HTMLElement} [options.announcerPoliteA] First polite live region node
   * @param {HTMLElement} [options.announcerPoliteB] Second polite live region node
   * @param {HTMLElement} [options.announcerAssertive] Assertive live region node
   */
  constructor(options = {}) {
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);
    this.boardElement = options.boardElement || (this.doc ? this.doc.getElementById('board') : null);
    this.cells = options.cells || (this.doc ? this.doc.querySelectorAll('#board .cell') : []);
    this.appWrapper = options.appWrapper || (this.doc ? this.doc.querySelector('.app-wrapper') : null);

    this.announcerPoliteA = options.announcerPoliteA || (this.doc ? this.doc.getElementById('a11yAnnouncerPoliteA') : null);
    this.announcerPoliteB = options.announcerPoliteB || (this.doc ? this.doc.getElementById('a11yAnnouncerPoliteB') : null);
    this.announcerAssertive = options.announcerAssertive || (this.doc ? (this.doc.getElementById('a11yAnnouncerAssertive') || this.doc.getElementById('a11yAnnouncerAlert')) : null);

    this.focusedIndex = 0;
    this.activePoliteIndex = 0; // 0 for A, 1 for B
    this.lastFocusedElement = null;
    this.activeModal = null;
    this._modalTrapListener = null;
    this._cleanupListeners = [];
    this.announcementHistory = [];

    if (this.doc) {
      this._initGridNavigation();
      this._initAnnouncers();
    }
  }

  // ---------------------------------------------------------------------------
  // 1. 2D Roving Tabindex & Grid Navigation
  // ---------------------------------------------------------------------------

  _initGridNavigation() {
    const cellsList = Array.from(this.cells);
    if (!cellsList || cellsList.length === 0) return;

    cellsList.forEach((cell, idx) => {
      // Cell 0 defaults to tabindex="0", remaining to "-1"
      cell.setAttribute('tabindex', idx === this.focusedIndex ? '0' : '-1');
      cell.setAttribute('role', 'gridcell');

      const r = Math.floor(idx / 3) + 1;
      const c = (idx % 3) + 1;
      cell.setAttribute('aria-rowindex', String(r));
      cell.setAttribute('aria-colindex', String(c));

      const onFocus = () => {
        this._updateRovingTabindex(idx);
      };
      const onClick = () => {
        this._updateRovingTabindex(idx);
      };

      cell.addEventListener('focus', onFocus);
      cell.addEventListener('click', onClick);

      this._cleanupListeners.push(() => {
        cell.removeEventListener('focus', onFocus);
        cell.removeEventListener('click', onClick);
      });
    });

    if (this.boardElement) {
      const onKeyDown = (e) => this._handleGridKeyDown(e);
      this.boardElement.addEventListener('keydown', onKeyDown);
      this._cleanupListeners.push(() => {
        this.boardElement.removeEventListener('keydown', onKeyDown);
      });
    }
  }

  _updateRovingTabindex(newIndex) {
    if (typeof newIndex !== 'number' || !Number.isInteger(newIndex) || newIndex < 0 || newIndex > 8) return;
    const cellsList = Array.from(this.cells);
    if (cellsList.length === 0) return;

    cellsList.forEach((c, idx) => {
      c.setAttribute('tabindex', idx === newIndex ? '0' : '-1');
    });
    this.focusedIndex = newIndex;
  }

  setFocusedCell(index) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 8) return;
    const cellsList = Array.from(this.cells);
    if (cellsList.length === 0) return;

    this._updateRovingTabindex(index);
    const targetCell = cellsList[index];
    if (targetCell && typeof targetCell.focus === 'function') {
      try {
        targetCell.focus();
      } catch {
        // Headless fallback
      }
    }
  }

  _handleGridKeyDown(e) {
    const cellsList = Array.from(this.cells);
    if (cellsList.length === 0) return;

    const i = this.focusedIndex;
    const r = Math.floor(i / 3);
    const c = i % 3;

    let targetIndex = null;
    let handled = false;

    switch (e.key) {
      case 'ArrowRight': {
        const nextCol = Math.min(2, c + 1);
        targetIndex = r * 3 + nextCol;
        handled = true;
        break;
      }
      case 'ArrowLeft': {
        const prevCol = Math.max(0, c - 1);
        targetIndex = r * 3 + prevCol;
        handled = true;
        break;
      }
      case 'ArrowDown': {
        const nextRow = Math.min(2, r + 1);
        targetIndex = nextRow * 3 + c;
        handled = true;
        break;
      }
      case 'ArrowUp': {
        const prevRow = Math.max(0, r - 1);
        targetIndex = prevRow * 3 + c;
        handled = true;
        break;
      }
      case 'Home': {
        if (e.ctrlKey || e.metaKey) {
          targetIndex = 0; // Top-left of entire grid
        } else {
          targetIndex = r * 3; // First cell of current row
        }
        handled = true;
        break;
      }
      case 'End': {
        if (e.ctrlKey || e.metaKey) {
          targetIndex = 8; // Bottom-right of entire grid
        } else {
          targetIndex = r * 3 + 2; // Last cell of current row
        }
        handled = true;
        break;
      }
      case 'PageUp': {
        targetIndex = c; // Top cell in current column
        handled = true;
        break;
      }
      case 'PageDown': {
        targetIndex = 6 + c; // Bottom cell in current column
        handled = true;
        break;
      }
      case 'Enter': {
        handled = true;
        const currentCell = cellsList[i];
        if (currentCell && typeof currentCell.click === 'function') {
          currentCell.click();
        }
        break;
      }
      case ' ':
      case 'Spacebar': {
        handled = true;
        if (typeof e.preventDefault === 'function') {
          e.preventDefault(); // MANDATORY: Prevent page scroll on Space
        }
        const currentCell = cellsList[i];
        if (currentCell && typeof currentCell.click === 'function') {
          currentCell.click();
        }
        break;
      }
      default:
        break;
    }

    if (handled && e.key !== ' ' && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    if (targetIndex !== null && targetIndex !== i) {
      this.setFocusedCell(targetIndex);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Screen Reader Live Announcers
  // ---------------------------------------------------------------------------

  _initAnnouncers() {
    if (!this.doc) return;
    if (!this.announcerPoliteA) {
      this.announcerPoliteA = this.doc.getElementById('a11yAnnouncerPoliteA');
    }
    if (!this.announcerPoliteB) {
      this.announcerPoliteB = this.doc.getElementById('a11yAnnouncerPoliteB');
    }
    if (!this.announcerAssertive) {
      this.announcerAssertive = this.doc.getElementById('a11yAnnouncerAssertive') || this.doc.getElementById('a11yAnnouncerAlert');
    }
  }

  announce(message, priority = 'polite') {
    if (!message) return;
    const cleanMsg = String(message).trim();
    if (!cleanMsg) return; // Guard against whitespace-only announcements
    this.announcementHistory.push({ message: cleanMsg, priority, timestamp: Date.now() });

    if (priority === 'assertive') {
      if (this.announcerAssertive) {
        this.announcerAssertive.textContent = cleanMsg;
      }
      return;
    }

    // Polite live region: alternating twin nodes with synchronous index toggle
    const targetNode = this.activePoliteIndex === 0 ? this.announcerPoliteB : this.announcerPoliteA;
    this.activePoliteIndex = 1 - this.activePoliteIndex;

    if (targetNode) {
      targetNode.textContent = '';
      setTimeout(() => {
        if (targetNode) {
          targetNode.textContent = cleanMsg;
        }
      }, 50);
    }
  }

  announceRoundStart(state = {}) {
    const s = state || {};
    const mode = s.mode || 'Classic';
    const p1 = s.p1Name || 'Player 1';
    const mark = s.p1Mark || 'X';
    this.announce(`Round started. Mode: ${mode}. It's ${p1}'s turn with ${mark}.`, 'polite');
  }

  announceMove(player, index, state = {}) {
    const s = state || {};
    const r = Math.floor(index / 3) + 1;
    const c = (index % 3) + 1;
    const name = player === 'p1' ? (s.p1Name || 'Player 1') : (s.p2Name || 'Player 2');
    const mark = player === 'p1' ? (s.p1Mark || 'X') : (s.p2Mark || 'O');
    this.announce(`${name} placed ${mark} in Row ${r}, Column ${c}.`, 'polite');
  }

  announceVanish(player, evictedIndex, state = {}) {
    const s = state || {};
    const r = Math.floor(evictedIndex / 3) + 1;
    const c = (evictedIndex % 3) + 1;
    const name = player === 'p1' ? (s.p1Name || 'Player 1') : (s.p2Name || 'Player 2');
    this.announce(`Ghost eviction! ${name}'s oldest mark at Row ${r}, Column ${c} has vanished.`, 'polite');
  }

  announceAbility(player, ability, details = {}, state = {}) {
    const s = state || {};
    const d = details || {};
    const name = player === 'p1' ? (s.p1Name || 'Player 1') : (s.p2Name || 'Player 2');
    if (ability === 'shatter') {
      const r = Math.floor(d.targetIndex / 3) + 1;
      const c = (d.targetIndex % 3) + 1;
      this.announce(`${name} used Tactical Shatter on Row ${r}, Column ${c}! Opponent mark destroyed.`, 'polite');
    } else if (ability === 'swap') {
      const r1 = Math.floor(d.indexA / 3) + 1;
      const c1 = (d.indexA % 3) + 1;
      const r2 = Math.floor(d.indexB / 3) + 1;
      const c2 = (d.indexB % 3) + 1;
      this.announce(`${name} used Phase Swap, exchanging Row ${r1}, Column ${c1} with Row ${r2}, Column ${c2}.`, 'polite');
    }
  }

  announceTurn(player, isAi = false, state = {}) {
    const s = state || {};
    if (isAi) {
      const aiName = s.p2Name || 'AI Bot';
      this.announce(`${aiName} is calculating optimal move...`, 'polite');
    } else {
      const name = player === 'p1' ? (s.p1Name || 'Player 1') : (s.p2Name || 'Player 2');
      const mark = player === 'p1' ? (s.p1Mark || 'X') : (s.p2Mark || 'O');
      this.announce(`${name}'s turn (${mark}).`, 'polite');
    }
  }

  announceWarning(message) {
    this.announce(message, 'assertive');
  }

  announceGameOver(winner, winningLine, isDraw = false, state = {}) {
    const s = state || {};
    if (isDraw) {
      this.announce('Game Over! The board is full with no winner. Round ended in a draw.', 'polite');
    } else {
      const winnerName = winner === 'p1' ? (s.p1Name || 'Player 1') : (s.p2Name || 'Player 2');
      const mark = winner === 'p1' ? (s.p1Mark || 'X') : (s.p2Mark || 'O');
      this.announce(`Game Over! ${winnerName} wins with three ${mark}s in a row!`, 'polite');
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Dynamic Cell aria-label Synthesis
  // ---------------------------------------------------------------------------

  updateCellLabels(state = {}, targetingState = null) {
    const cellsList = Array.from(this.cells);
    if (cellsList.length === 0) return;

    const s = state || {};
    const board = s.board || Array(9).fill(null);
    const mode = s.mode || 'classic';
    const winningLine = s.winningLine || [];
    const p1Queue = s.p1Queue || (s.ghostQueue && s.ghostQueue.p1 ? s.ghostQueue.p1 : []);
    const p2Queue = s.p2Queue || (s.ghostQueue && s.ghostQueue.p2 ? s.ghostQueue.p2 : []);

    const p1AgingMap = mode === 'ghost' ? getGhostAgingMap(p1Queue) : {};
    const p2AgingMap = mode === 'ghost' ? getGhostAgingMap(p2Queue) : {};

    cellsList.forEach((cell, idx) => {
      const r = Math.floor(idx / 3) + 1;
      const c = (idx % 3) + 1;
      const coords = `Row ${r}, Column ${c}`;
      const occupant = board[idx];

      let label = coords;

      if (!occupant) {
        label += ', empty';
        if (targetingState && targetingState.ability === 'shatter') {
          label += ', invalid Shatter target';
        } else if (targetingState && targetingState.ability === 'swap') {
          label += ', invalid swap position';
        }
      } else {
        const playerName = occupant === 'p1' ? (s.p1Name || 'Player 1') : (s.p2Name || 'Player 2');
        const mark = occupant === 'p1' ? (s.p1Mark || 'X') : (s.p2Mark || 'O');
        label += `, ${playerName} ${mark}`;

        // Ghost Mode aging cues
        if (mode === 'ghost') {
          const aging = occupant === 'p1' ? p1AgingMap[idx] : p2AgingMap[idx];
          if (aging) {
            if (aging.isExpiringNext || aging.age === 3) {
              label += ', oldest mark - critical, will vanish on next move';
            } else if (aging.age === 2) {
              label += ', 2 turns old';
            } else {
              label += ', fresh mark';
            }
          }
        }

        // Tactical Overdrive targeting cues
        if (targetingState) {
          if (targetingState.ability === 'shatter') {
            if (occupant !== targetingState.player) {
              label += ', eligible Shatter target';
            } else {
              label += ', invalid Shatter target';
            }
          } else if (targetingState.ability === 'swap') {
            if (targetingState.step === 1) {
              if (occupant === targetingState.player) {
                label += ', select as first swap mark';
              } else {
                label += ', invalid swap source';
              }
            } else if (targetingState.step === 2) {
              const isAdjacent = areAdjacent(targetingState.sourceIndex, idx);
              if (occupant !== targetingState.player && isAdjacent) {
                label += ', eligible swap destination';
              } else {
                label += ', invalid swap destination';
              }
            }
          }
        }
      }

      if (winningLine.includes(idx)) {
        label += ', winning line';
      }

      cell.setAttribute('aria-label', label);
    });
  }

  // ---------------------------------------------------------------------------
  // 4. W3C APG Accessible Modal Dialog Management
  // ---------------------------------------------------------------------------

  openModal(modalElement, triggerElement = null) {
    if (!modalElement) return;

    this.lastFocusedElement = triggerElement || (this.doc ? this.doc.activeElement : null);
    this.activeModal = modalElement;

    // Show modal
    modalElement.style.display = 'flex';
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');

    // Scroll lock on body
    if (this.doc && this.doc.body) {
      if (this.doc.body.classList && typeof this.doc.body.classList.add === 'function') {
        this.doc.body.classList.add('modal-open');
      }
      if (this.doc.body.style) {
        this.doc.body.style.overflow = 'hidden';
      }
    }

    // Make background application container inert
    if (this.appWrapper) {
      this.appWrapper.setAttribute('inert', '');
      this.appWrapper.setAttribute('aria-hidden', 'true');
    }

    // Focus trapping
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = modalElement.querySelectorAll ? Array.from(modalElement.querySelectorAll(focusableSelector)) : [];

    if (focusables.length > 0) {
      const initialFocus = focusables[0];
      if (typeof initialFocus.focus === 'function') {
        try {
          initialFocus.focus();
        } catch {
          // Headless fallback
        }
      }
    }

    this._modalTrapListener = (e) => {
      if (e.key === 'Escape') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        this.closeModal(modalElement);
        return;
      }

      if (e.key === 'Tab') {
        const currentFocusables = modalElement.querySelectorAll ? Array.from(modalElement.querySelectorAll(focusableSelector)) : [];
        if (currentFocusables.length === 0) return;

        const first = currentFocusables[0];
        const last = currentFocusables[currentFocusables.length - 1];
        const active = this.doc ? this.doc.activeElement : null;

        if (e.shiftKey) {
          if (active === first || !currentFocusables.includes(active)) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof last.focus === 'function') last.focus();
          }
        } else {
          if (active === last || !currentFocusables.includes(active)) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof first.focus === 'function') first.focus();
          }
        }
      }
    };

    modalElement.addEventListener('keydown', this._modalTrapListener);
  }

  closeModal(modalElement = null) {
    const targetModal = modalElement || this.activeModal;
    if (!targetModal) return;

    if (this._modalTrapListener) {
      targetModal.removeEventListener('keydown', this._modalTrapListener);
      this._modalTrapListener = null;
    }

    targetModal.style.display = 'none';

    // Unlock body scroll
    if (this.doc && this.doc.body) {
      if (this.doc.body.classList && typeof this.doc.body.classList.remove === 'function') {
        this.doc.body.classList.remove('modal-open');
      }
      if (this.doc.body.style) {
        this.doc.body.style.overflow = '';
      }
    }

    // Restore background container
    if (this.appWrapper) {
      this.appWrapper.removeAttribute('inert');
      this.appWrapper.removeAttribute('aria-hidden');
    }

    // Restore focus to invoking element
    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === 'function') {
      try {
        this.lastFocusedElement.focus();
      } catch {
        // Headless fallback
      }
    }
    this.lastFocusedElement = null;
    this.activeModal = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle & Cleanup
  // ---------------------------------------------------------------------------

  destroy() {
    this._cleanupListeners.forEach((cleanup) => cleanup());
    this._cleanupListeners = [];

    if (this.activeModal) {
      this.closeModal(this.activeModal);
    }
  }
}
