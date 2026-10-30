/**
 * @file laserStrike.js
 * @description Dynamic responsive SVG laser strike winning line overlay for Chrono-Tic-Tac-Toe.
 * Features 3-cell combo geometry mapping with 15-20px overshoot, SVG defs (gradient + glow),
 * fast stroke-dashoffset drawing animation, ResizeObserver real-time realignment,
 * prefers-reduced-motion accessibility, and graceful headless Node.js degradation.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_OVERSHOOT = 18; // 18px overshoot past cell center
const DEFAULT_STROKE_WIDTH = 6;
const DEFAULT_ANIMATION_DURATION = 200; // ms

export class LaserStrike {
  /**
   * @param {SVGElement|string} [svgElement] SVG DOM element or query selector
   * @param {HTMLElement|string} [boardElement] Board container DOM element or query selector
   * @param {Object} [options={}]
   * @param {number} [options.overshoot=18] Pixels to extend past outer cell centers
   * @param {number} [options.strokeWidth=6] Line stroke width in pixels
   * @param {number} [options.animationDuration=200] Animation duration in ms
   */
  constructor(svgElement = null, boardElement = null, options = {}) {
    this.overshoot = options.overshoot !== undefined ? options.overshoot : DEFAULT_OVERSHOOT;
    this.strokeWidth = options.strokeWidth !== undefined ? options.strokeWidth : DEFAULT_STROKE_WIDTH;
    this.animationDuration = options.animationDuration !== undefined ? options.animationDuration : DEFAULT_ANIMATION_DURATION;

    this.svg = null;
    this.board = null;
    this.lineElement = null;
    this.activeCombo = null;
    this.resizeObserver = null;

    const hasDoc = typeof document !== 'undefined';

    // Resolve SVG element
    if (svgElement) {
      if (typeof svgElement === 'string' && hasDoc) {
        this.svg = document.querySelector(svgElement);
      } else {
        this.svg = svgElement;
      }
    } else if (hasDoc) {
      this.svg = document.getElementById('winningStrikeSvg') || document.querySelector('.winning-strike-svg');
    }

    // Resolve Board element
    if (boardElement) {
      if (typeof boardElement === 'string' && hasDoc) {
        this.board = document.querySelector(boardElement);
      } else {
        this.board = boardElement;
      }
    } else if (hasDoc) {
      this.board = document.getElementById('board') || document.querySelector('.board');
    }

    this.isSupported = Boolean(this.svg);

    if (this.svg) {
      this._ensureDefs();
      this._ensureLineElement();
    }

    // Setup responsive observer
    if (typeof ResizeObserver !== 'undefined' && this.board && typeof this.board === 'object') {
      try {
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.board);
      } catch (_) {
        this.resizeObserver = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Element Creation & SVG Defs Setup
  // ---------------------------------------------------------------------------

  /**
   * Safe element creation helper supporting browser DOM and headless environments.
   * @private
   */
  _createElement(tagName, attributes = {}) {
    const doc = (this.svg && this.svg.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    let el = null;
    if (doc && typeof doc.createElementNS === 'function') {
      try {
        el = doc.createElementNS(SVG_NS, tagName);
      } catch (_) {}
    }
    if (!el && doc && typeof doc.createElement === 'function') {
      try {
        el = doc.createElement(tagName);
      } catch (_) {}
    }
    if (!el) {
      el = {
        tagName,
        attributes: new Map(),
        children: [],
        style: {},
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; },
        appendChild(child) { this.children.push(child); return child; }
      };
    }
    for (const [k, v] of Object.entries(attributes)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  /**
   * Injects linearGradient and glow filter defs into the SVG container if missing.
   * @private
   */
  _ensureDefs() {
    if (!this.svg) return;

    let defs = this.svg.querySelector ? this.svg.querySelector('defs') : null;
    if (!defs) {
      defs = this._createElement('defs');
      if (this.svg.firstChild && typeof this.svg.insertBefore === 'function') {
        this.svg.insertBefore(defs, this.svg.firstChild);
      } else if (typeof this.svg.appendChild === 'function') {
        this.svg.appendChild(defs);
      }
    }

    // 1. Neon Linear Gradient (Cyan to Magenta)
    if (this.svg.querySelector && !this.svg.querySelector('#laser-strike-gradient')) {
      const grad = this._createElement('linearGradient', {
        id: 'laser-strike-gradient',
        x1: '0%',
        y1: '0%',
        x2: '100%',
        y2: '100%'
      });

      const stop1 = this._createElement('stop', {
        offset: '0%',
        'stop-color': '#00f2fe'
      });

      const stop2 = this._createElement('stop', {
        offset: '100%',
        'stop-color': '#ff007f'
      });

      grad.appendChild(stop1);
      grad.appendChild(stop2);
      defs.appendChild(grad);
    }

    // 2. High-intensity Glow Filter
    if (this.svg.querySelector && !this.svg.querySelector('#laser-strike-glow')) {
      const filter = this._createElement('filter', {
        id: 'laser-strike-glow',
        x: '-50%',
        y: '-50%',
        width: '200%',
        height: '200%'
      });

      const blur = this._createElement('feGaussianBlur', {
        in: 'SourceGraphic',
        stdDeviation: '4',
        result: 'blur'
      });

      const merge = this._createElement('feMerge');
      const node1 = this._createElement('feMergeNode', { in: 'blur' });
      const node2 = this._createElement('feMergeNode', { in: 'SourceGraphic' });

      merge.appendChild(node1);
      merge.appendChild(node2);
      filter.appendChild(blur);
      filter.appendChild(merge);
      defs.appendChild(filter);
    }
  }

  /**
   * Resolves or creates the `<line>` element inside the SVG container.
   * @private
   */
  _ensureLineElement() {
    if (!this.svg) return;

    if (this.svg.querySelector) {
      this.lineElement = this.svg.querySelector('#strikeLine') || this.svg.querySelector('line');
    }

    if (!this.lineElement) {
      this.lineElement = this._createElement('line', { id: 'strikeLine' });
      if (typeof this.svg.appendChild === 'function') {
        this.svg.appendChild(this.lineElement);
      }
    }

    if (this.lineElement) {
      this.lineElement.setAttribute('stroke', 'url(#laser-strike-gradient)');
      this.lineElement.setAttribute('stroke-width', String(this.strokeWidth));
      this.lineElement.setAttribute('stroke-linecap', 'round');
      this.lineElement.setAttribute('filter', 'url(#laser-strike-glow)');
    }
  }

  // ---------------------------------------------------------------------------
  // Geometry Calculation
  // ---------------------------------------------------------------------------

  /**
   * Computes center coordinates (x1, y1) to (x2, y2) with overshoot for a 3-cell combo.
   * Supports all 8 winning lines:
   * - Rows: [0,1,2], [3,4,5], [6,7,8]
   * - Columns: [0,3,6], [1,4,7], [2,5,8]
   * - Diagonals: [0,4,8], [2,4,6]
   * @param {number[]} combo 3 cell indices (0 to 8)
   * @returns {{x1: number, y1: number, x2: number, y2: number, length: number}}
   */
  calculateCoordinates(combo) {
    if (!Array.isArray(combo) || combo.length < 2) {
      return { x1: 0, y1: 0, x2: 0, y2: 0, length: 0 };
    }

    // Sort to determine start and end endpoints
    const sorted = [...combo].sort((a, b) => a - b);
    const startIdx = sorted[0];
    const endIdx = sorted[sorted.length - 1];

    let cx1 = 0, cy1 = 0, cx2 = 0, cy2 = 0;
    let foundFromDom = false;

    // Strategy 1: Check DOM element bounding boxes
    if (this.board && this.svg && typeof this.board.querySelectorAll === 'function' && typeof this.svg.getBoundingClientRect === 'function') {
      const cells = this.board.querySelectorAll('[data-index], .cell, button');
      let startCellEl = null;
      let endCellEl = null;

      if (cells.length > 0) {
        for (let i = 0; i < cells.length; i++) {
          const el = cells[i];
          const idxAttr = el.getAttribute ? el.getAttribute('data-index') : null;
          const idx = idxAttr !== null ? parseInt(idxAttr, 10) : i;
          if (idx === startIdx) startCellEl = el;
          if (idx === endIdx) endCellEl = el;
        }
      }

      if (startCellEl && endCellEl && typeof startCellEl.getBoundingClientRect === 'function') {
        const svgRect = this.svg.getBoundingClientRect();
        const startRect = startCellEl.getBoundingClientRect();
        const endRect = endCellEl.getBoundingClientRect();

        if (startRect.width > 0 && endRect.width > 0) {
          cx1 = (startRect.left - svgRect.left) + startRect.width / 2;
          cy1 = (startRect.top - svgRect.top) + startRect.height / 2;
          cx2 = (endRect.left - svgRect.left) + endRect.width / 2;
          cy2 = (endRect.top - svgRect.top) + endRect.height / 2;
          foundFromDom = true;
        }
      }
    }

    // Strategy 2: Fallback to grid geometry based on width/height
    if (!foundFromDom) {
      let width = 300;
      let height = 300;

      if (this.svg) {
        if (this.svg.clientWidth && this.svg.clientHeight) {
          width = this.svg.clientWidth;
          height = this.svg.clientHeight;
        } else if (this.svg.viewBox && this.svg.viewBox.baseVal && this.svg.viewBox.baseVal.width) {
          width = this.svg.viewBox.baseVal.width;
          height = this.svg.viewBox.baseVal.height;
        }
      } else if (this.board && this.board.clientWidth) {
        width = this.board.clientWidth;
        height = this.board.clientHeight || width;
      }

      const col1 = startIdx % 3;
      const row1 = Math.floor(startIdx / 3);
      const col2 = endIdx % 3;
      const row2 = Math.floor(endIdx / 3);

      cx1 = (col1 + 0.5) * (width / 3);
      cy1 = (row1 + 0.5) * (height / 3);
      cx2 = (col2 + 0.5) * (width / 3);
      cy2 = (row2 + 0.5) * (height / 3);
    }

    // Calculate direction vector and apply overshoot
    const dx = cx2 - cx1;
    const dy = cy2 - cy1;
    const centerDist = Math.hypot(dx, dy);

    let x1 = cx1;
    let y1 = cy1;
    let x2 = cx2;
    let y2 = cy2;

    if (centerDist > 0) {
      const ux = dx / centerDist;
      const uy = dy / centerDist;
      x1 = cx1 - ux * this.overshoot;
      y1 = cy1 - uy * this.overshoot;
      x2 = cx2 + ux * this.overshoot;
      y2 = cy2 + uy * this.overshoot;
    }

    const length = Math.hypot(x2 - x1, y2 - y1);
    return { x1, y1, x2, y2, length };
  }

  // ---------------------------------------------------------------------------
  // Drawing & Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Draws and animates laser strike across the winning cell combo.
   * @param {number[]} combo 3 cell indices (e.g. [0, 1, 2])
   * @param {Object} [options={}]
   * @param {boolean} [options.instant=false] Skip stroke-dash animation
   * @returns {boolean} True if line was drawn
   */
  draw(combo, options = {}) {
    if (!this.svg) return false;
    this._ensureLineElement();
    if (!this.lineElement) return false;

    this.activeCombo = combo;
    const { x1, y1, x2, y2, length } = this.calculateCoordinates(combo);

    this.lineElement.setAttribute('x1', String(x1));
    this.lineElement.setAttribute('y1', String(y1));
    this.lineElement.setAttribute('x2', String(x2));
    this.lineElement.setAttribute('y2', String(y2));

    const isInstant = options.instant || this._prefersReducedMotion();

    if (isInstant) {
      if (this.lineElement.style) {
        this.lineElement.style.transition = 'none';
        this.lineElement.style.strokeDasharray = 'none';
        this.lineElement.style.strokeDashoffset = '0';
      }
    } else {
      if (this.lineElement.style) {
        this.lineElement.style.transition = 'none';
        this.lineElement.style.strokeDasharray = String(Math.ceil(length));
        this.lineElement.style.strokeDashoffset = String(Math.ceil(length));

        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => {
            if (this.lineElement && this.activeCombo && this.lineElement.style) {
              this.lineElement.style.transition = `stroke-dashoffset ${this.animationDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
              this.lineElement.style.strokeDashoffset = '0';
            }
          });
        } else {
          this.lineElement.style.strokeDashoffset = '0';
        }
      }
    }

    return true;
  }

  /**
   * Re-aligns active line on container resize without re-animating.
   */
  handleResize() {
    if (!this.activeCombo || !this.lineElement) return;

    const { x1, y1, x2, y2, length } = this.calculateCoordinates(this.activeCombo);
    this.lineElement.setAttribute('x1', String(x1));
    this.lineElement.setAttribute('y1', String(y1));
    this.lineElement.setAttribute('x2', String(x2));
    this.lineElement.setAttribute('y2', String(y2));

    if (this.lineElement.style) {
      this.lineElement.style.transition = 'none';
      this.lineElement.style.strokeDasharray = String(Math.ceil(length));
      this.lineElement.style.strokeDashoffset = '0';
    }
  }

  /**
   * Clears the winning strike line.
   */
  clear() {
    this.activeCombo = null;
    if (this.lineElement) {
      this.lineElement.setAttribute('x1', '0');
      this.lineElement.setAttribute('y1', '0');
      this.lineElement.setAttribute('x2', '0');
      this.lineElement.setAttribute('y2', '0');
      if (this.lineElement.style) {
        this.lineElement.style.transition = 'none';
        this.lineElement.style.strokeDasharray = 'none';
        this.lineElement.style.strokeDashoffset = '0';
      }
    }
  }

  /**
   * Disconnects observers and cleans up DOM.
   */
  destroy() {
    this.clear();
    if (this.resizeObserver) {
      try {
        this.resizeObserver.disconnect();
      } catch (_) {}
      this.resizeObserver = null;
    }
    this.lineElement = null;
    this.svg = null;
    this.board = null;
    this.isSupported = false;
  }

  /**
   * Checks for user reduced-motion preference.
   * @private
   * @returns {boolean}
   */
  _prefersReducedMotion() {
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    } catch (_) {}
    return false;
  }
}
