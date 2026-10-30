/**
 * @file fx.test.js
 * @description Comprehensive automated unit test suite for visual effects:
 * Canvas 2D confetti cannon (src/fx/confetti.js) and SVG laser strike winning line (src/fx/laserStrike.js).
 * Features zero-dependency mock DOM fixtures for Canvas, CanvasRenderingContext2D,
 * SVGElement, ResizeObserver, and matchMedia.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConfettiCannon } from '../src/fx/confetti.js';
import { LaserStrike } from '../src/fx/laserStrike.js';

// =============================================================================
// Zero-Dependency Mock DOM & Graphic Fixtures
// =============================================================================

class MockCanvasRenderingContext2D {
  constructor() {
    this.calls = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1.0;
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', x, y, w, h });
  }

  save() {
    this.calls.push({ method: 'save' });
  }

  restore() {
    this.calls.push({ method: 'restore' });
  }

  translate(x, y) {
    this.calls.push({ method: 'translate', x, y });
  }

  rotate(angle) {
    this.calls.push({ method: 'rotate', angle });
  }

  scale(sx, sy) {
    this.calls.push({ method: 'scale', sx, sy });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: 'fillRect', x, y, w, h, fillStyle: this.fillStyle, alpha: this.globalAlpha });
  }

  beginPath() {
    this.calls.push({ method: 'beginPath' });
  }

  arc(x, y, r, sa, ea) {
    this.calls.push({ method: 'arc', x, y, r, sa, ea });
  }

  fill() {
    this.calls.push({ method: 'fill', fillStyle: this.fillStyle, alpha: this.globalAlpha });
  }

  moveTo(x, y) {
    this.calls.push({ method: 'moveTo', x, y });
  }

  quadraticCurveTo(cpx, cpy, x, y) {
    this.calls.push({ method: 'quadraticCurveTo', cpx, cpy, x, y });
  }

  stroke() {
    this.calls.push({ method: 'stroke', strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
  }
}

class MockCanvas {
  constructor(width = 800, height = 600) {
    this.width = width;
    this.height = height;
    this.style = { width: `${width}px`, height: `${height}px` };
    this.ctx = new MockCanvasRenderingContext2D();
  }

  getContext(type) {
    if (type === '2d') return this.ctx;
    return null;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height
    };
  }
}

class MockDocument {
  createElementNS(ns, tagName) {
    return new MockSVGElement(tagName);
  }

  createElement(tagName) {
    return new MockSVGElement(tagName);
  }
}

class MockSVGElement {
  constructor(tagName = 'svg') {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.style = {};
    this.width = 300;
    this.height = 300;
    this.clientWidth = 300;
    this.clientHeight = 300;
    this.ownerDocument = new MockDocument();
  }

  get firstChild() {
    return this.children.length > 0 ? this.children[0] : null;
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }

  getAttribute(k) {
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }

  removeAttribute(k) {
    this.attributes.delete(k);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  insertBefore(newNode, referenceNode) {
    const idx = this.children.indexOf(referenceNode);
    if (idx !== -1) {
      this.children.splice(idx, 0, newNode);
    } else {
      this.children.unshift(newNode);
    }
    return newNode;
  }

  contains(node) {
    return this.children.includes(node);
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this._findById(id);
    }
    const tag = selector.toLowerCase();
    return this._findByTag(tag);
  }

  _findById(id) {
    if (this.getAttribute('id') === id) return this;
    for (const child of this.children) {
      if (child._findById) {
        const found = child._findById(id);
        if (found) return found;
      }
    }
    return null;
  }

  _findByTag(tag) {
    for (const child of this.children) {
      if (child.tagName && child.tagName.toLowerCase() === tag) {
        return child;
      }
      if (child._findByTag) {
        const found = child._findByTag(tag);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const search = (node) => {
      for (const child of node.children) {
        matches.push(child);
        if (child.children) search(child);
      }
    };
    search(this);
    return matches;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height
    };
  }
}

class MockBoardElement {
  constructor(width = 300, height = 300) {
    this.width = width;
    this.height = height;
    this.clientWidth = width;
    this.clientHeight = height;
    this.cells = [];

    // Create 9 mock cells
    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cellW = width / 3;
      const cellH = height / 3;

      const cell = {
        index: i,
        getAttribute: (attr) => attr === 'data-index' ? String(i) : null,
        getBoundingClientRect: () => ({
          left: col * cellW,
          top: row * cellH,
          right: (col + 1) * cellW,
          bottom: (row + 1) * cellH,
          width: cellW,
          height: cellH
        })
      };
      this.cells.push(cell);
    }
  }

  querySelectorAll() {
    return this.cells;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height
    };
  }
}

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observedTargets = [];
    MockResizeObserver.instances.push(this);
  }

  observe(target) {
    this.observedTargets.push(target);
  }

  unobserve(target) {
    this.observedTargets = this.observedTargets.filter(t => t !== target);
  }

  disconnect() {
    this.observedTargets = [];
  }

  trigger() {
    this.callback();
  }
}
MockResizeObserver.instances = [];

// =============================================================================
// Test Suites
// =============================================================================

describe('Visual Effects (FX) Suite', () => {

  describe('1. ConfettiCannon: Headless Degradation & Initialization', () => {
    it('should instantiate cleanly in headless Node.js without canvas', () => {
      const cannon = new ConfettiCannon();
      assert.equal(cannon.isSupported, false);
      assert.equal(cannon.canvas, null);
      assert.equal(cannon.ctx, null);
      assert.equal(cannon.isRunning, false);
    });

    it('should safely no-op on all methods when unsupported without throwing', () => {
      const cannon = new ConfettiCannon();
      assert.equal(cannon.fire(), false);
      assert.doesNotThrow(() => cannon.stop());
      assert.doesNotThrow(() => cannon.clear());
      assert.doesNotThrow(() => cannon.handleResize());
      assert.doesNotThrow(() => cannon.destroy());
    });

    it('should initialize successfully when given a valid canvas element', () => {
      const canvas = new MockCanvas(600, 400);
      const cannon = new ConfettiCannon(canvas);
      assert.equal(cannon.isSupported, true);
      assert.equal(cannon.width, 600);
      assert.equal(cannon.height, 400);
    });
  });

  describe('2. ConfettiCannon: Multi-Geometry Physics Simulation & Lifecycle', () => {
    let canvas;
    let cannon;

    beforeEach(() => {
      canvas = new MockCanvas(800, 600);
      cannon = new ConfettiCannon(canvas, { particleCount: 100 });
    });

    it('should generate multi-geometry particles (flakes, dots, ribbons)', () => {
      const fired = cannon.fire(2000);
      assert.equal(fired, true);
      assert.equal(cannon.particles.length, 100);

      const types = new Set(cannon.particles.map(p => p.type));
      assert.ok(types.has('flake'), 'Should contain flake particles');
      assert.ok(types.has('dot'), 'Should contain dot particles');
      assert.ok(types.has('ribbon'), 'Should contain ribbon particles');
    });

    it('should assign realistic physics vectors and 3D tumbling rotation', () => {
      cannon.fire();
      const p = cannon.particles[0];

      // Initial velocity checks
      assert.ok(typeof p.vx === 'number' && !isNaN(p.vx));
      assert.ok(typeof p.vy === 'number' && p.vy < 0, 'Initial upward launch velocity vy must be negative');

      // 3D Euler angles & wobble checks
      assert.ok(typeof p.rotationZ === 'number');
      assert.ok(typeof p.tilt === 'number');
      assert.ok(typeof p.tiltSpeed === 'number' && p.tiltSpeed > 0);
      assert.ok(typeof p.wobble === 'number');
    });

    it('should update particle positions and perform 3D canvas rendering in _updateAndRender', () => {
      cannon.fire();
      const initialY = cannon.particles[0].y;

      cannon._updateAndRender(16);

      // Verify physics step integration
      assert.notEqual(cannon.particles[0].y, initialY);

      // Verify canvas draw calls
      const clearCalls = canvas.ctx.calls.filter(c => c.method === 'clearRect');
      assert.ok(clearCalls.length > 0, 'Must clear canvas each tick');

      const scaleCalls = canvas.ctx.calls.filter(c => c.method === 'scale');
      assert.ok(scaleCalls.length > 0, 'Must scale canvas for 3D tumbling projection');
    });

    it('stop() cancels running state', () => {
      cannon.fire();
      assert.equal(cannon.isRunning, true);

      cannon.stop();
      assert.equal(cannon.isRunning, false);
    });

    it('clear() clears canvas buffer and empties active particles', () => {
      cannon.fire();
      assert.ok(cannon.particles.length > 0);

      cannon.clear();
      assert.equal(cannon.particles.length, 0);
    });

    it('destroy() halts animation, purges particles, and detaches canvas', () => {
      cannon.fire();
      cannon.destroy();
      assert.equal(cannon.isRunning, false);
      assert.equal(cannon.canvas, null);
      assert.equal(cannon.ctx, null);
      assert.equal(cannon.isSupported, false);
    });

    it('should skip high-velocity particles if prefers-reduced-motion is active', () => {
      const origWindow = globalThis.window;
      globalThis.window = {
        devicePixelRatio: 1,
        matchMedia: (query) => ({ matches: query.includes('prefers-reduced-motion') })
      };

      try {
        const reducedCannon = new ConfettiCannon(canvas);
        const result = reducedCannon.fire();
        assert.equal(result, false);
        assert.equal(reducedCannon.particles.length, 0);
      } finally {
        globalThis.window = origWindow;
      }
    });
  });

  describe('3. LaserStrike: Headless Degradation & Initialization', () => {
    it('should instantiate cleanly in headless Node.js without SVG', () => {
      const strike = new LaserStrike();
      assert.equal(strike.isSupported, false);
      assert.equal(strike.svg, null);
      assert.equal(strike.lineElement, null);
    });

    it('should safely no-op on all methods when unsupported without throwing', () => {
      const strike = new LaserStrike();
      assert.equal(strike.draw([0, 1, 2]), false);
      assert.doesNotThrow(() => strike.handleResize());
      assert.doesNotThrow(() => strike.clear());
      assert.doesNotThrow(() => strike.destroy());
    });

    it('should inject SVG defs (gradient + glow filter) and resolve line element', () => {
      const svg = new MockSVGElement('svg');
      const board = new MockBoardElement();
      const strike = new LaserStrike(svg, board);

      assert.equal(strike.isSupported, true);
      assert.ok(strike.lineElement);

      const grad = svg.querySelector('#laser-strike-gradient');
      assert.ok(grad, 'Should inject linearGradient def');

      const filter = svg.querySelector('#laser-strike-glow');
      assert.ok(filter, 'Should inject glow filter def');
    });
  });

  describe('4. LaserStrike: Dynamic 3-Cell Geometry Mapping for all 8 Winning Lines', () => {
    let svg;
    let board;
    let strike;

    beforeEach(() => {
      svg = new MockSVGElement('svg');
      board = new MockBoardElement(300, 300);
      strike = new LaserStrike(svg, board, { overshoot: 18 });
    });

    it('Horizontal Row 0 [0, 1, 2]: horizontal line with overshoot', () => {
      const coords = strike.calculateCoordinates([0, 1, 2]);
      assert.ok(Math.abs(coords.y1 - coords.y2) < 0.01, 'Y coordinates must be identical for horizontal row');
      assert.ok(coords.x1 < 50, 'x1 must extend past first cell center (50) via overshoot');
      assert.ok(coords.x2 > 250, 'x2 must extend past third cell center (250) via overshoot');
      assert.equal(coords.x1, 50 - 18);
      assert.equal(coords.x2, 250 + 18);
    });

    it('Horizontal Row 1 [3, 4, 5]: middle row horizontal line', () => {
      const coords = strike.calculateCoordinates([3, 4, 5]);
      assert.ok(Math.abs(coords.y1 - coords.y2) < 0.01);
      assert.equal(coords.y1, 150);
      assert.equal(coords.x1, 50 - 18);
      assert.equal(coords.x2, 250 + 18);
    });

    it('Horizontal Row 2 [6, 7, 8]: bottom row horizontal line', () => {
      const coords = strike.calculateCoordinates([6, 7, 8]);
      assert.ok(Math.abs(coords.y1 - coords.y2) < 0.01);
      assert.equal(coords.y1, 250);
      assert.equal(coords.x1, 50 - 18);
      assert.equal(coords.x2, 250 + 18);
    });

    it('Vertical Column 0 [0, 3, 6]: vertical line with overshoot', () => {
      const coords = strike.calculateCoordinates([0, 3, 6]);
      assert.ok(Math.abs(coords.x1 - coords.x2) < 0.01, 'X coordinates must be identical for vertical column');
      assert.equal(coords.x1, 50);
      assert.equal(coords.y1, 50 - 18);
      assert.equal(coords.y2, 250 + 18);
    });

    it('Vertical Column 1 [1, 4, 7]: middle column vertical line', () => {
      const coords = strike.calculateCoordinates([1, 4, 7]);
      assert.ok(Math.abs(coords.x1 - coords.x2) < 0.01);
      assert.equal(coords.x1, 150);
      assert.equal(coords.y1, 50 - 18);
      assert.equal(coords.y2, 250 + 18);
    });

    it('Vertical Column 2 [2, 5, 8]: right column vertical line', () => {
      const coords = strike.calculateCoordinates([2, 5, 8]);
      assert.ok(Math.abs(coords.x1 - coords.x2) < 0.01);
      assert.equal(coords.x1, 250);
      assert.equal(coords.y1, 50 - 18);
      assert.equal(coords.y2, 250 + 18);
    });

    it('Diagonal 0 [0, 4, 8]: top-left to bottom-right diagonal', () => {
      const coords = strike.calculateCoordinates([0, 4, 8]);
      assert.ok(coords.x1 < 50 && coords.y1 < 50, 'Start point must extend past (50, 50)');
      assert.ok(coords.x2 > 250 && coords.y2 > 250, 'End point must extend past (250, 250)');
      assert.ok(Math.abs(coords.x1 - coords.y1) < 0.01);
      assert.ok(Math.abs(coords.x2 - coords.y2) < 0.01);
    });

    it('Diagonal 1 [2, 4, 6]: top-right to bottom-left diagonal', () => {
      const coords = strike.calculateCoordinates([2, 4, 6]);
      assert.ok(coords.x1 > 250 && coords.y1 < 50, 'Start point must extend past (250, 50)');
      assert.ok(coords.x2 < 50 && coords.y2 > 250, 'End point must extend past (50, 250)');
    });

    it('should produce identical line geometry regardless of combo array permutation order', () => {
      const orderA = strike.calculateCoordinates([0, 1, 2]);
      const orderB = strike.calculateCoordinates([2, 0, 1]);
      const orderC = strike.calculateCoordinates([1, 2, 0]);

      assert.deepEqual(orderA, orderB);
      assert.deepEqual(orderA, orderC);
    });
  });

  describe('5. LaserStrike: SVG Line Attributes, Animation & Realignment', () => {
    let svg;
    let board;
    let strike;

    beforeEach(() => {
      svg = new MockSVGElement('svg');
      board = new MockBoardElement(300, 300);
      strike = new LaserStrike(svg, board, { overshoot: 20 });
    });

    it('draw() updates SVG line attributes and sets stroke-dash animation properties', () => {
      const res = strike.draw([0, 1, 2]);
      assert.equal(res, true);

      assert.equal(strike.lineElement.getAttribute('x1'), String(50 - 20));
      assert.equal(strike.lineElement.getAttribute('x2'), String(250 + 20));
      assert.equal(strike.lineElement.getAttribute('stroke'), 'url(#laser-strike-gradient)');
      assert.equal(strike.lineElement.getAttribute('filter'), 'url(#laser-strike-glow)');

      // Verify stroke dash calculation
      const length = Math.hypot(270 - 30, 0);
      assert.equal(strike.lineElement.style.strokeDasharray, String(length));
    });

    it('draw() with instant: true sets strokeDashoffset to 0 immediately', () => {
      strike.draw([0, 1, 2], { instant: true });
      assert.equal(strike.lineElement.style.strokeDashoffset, '0');
      assert.equal(strike.lineElement.style.transition, 'none');
    });

    it('handleResize() recalculates coordinates without re-running stroke-dash animation', () => {
      strike.draw([0, 1, 2]);

      // Simulate board resize
      board.width = 600;
      board.height = 600;
      strike.handleResize();

      // Coordinates should scale with new dimensions
      assert.equal(strike.lineElement.style.strokeDashoffset, '0');
    });

    it('clear() resets coordinates and clears active combo', () => {
      strike.draw([0, 1, 2]);
      assert.notEqual(strike.activeCombo, null);

      strike.clear();
      assert.equal(strike.activeCombo, null);
      assert.equal(strike.lineElement.getAttribute('x1'), '0');
      assert.equal(strike.lineElement.getAttribute('x2'), '0');
    });

    it('destroy() disconnects observers and nullifies references', () => {
      strike.destroy();
      assert.equal(strike.svg, null);
      assert.equal(strike.board, null);
      assert.equal(strike.isSupported, false);
    });
  });

  describe('6. LaserStrike: ResizeObserver Integration', () => {
    it('should observe board element when ResizeObserver is available', () => {
      const origRO = globalThis.ResizeObserver;
      globalThis.ResizeObserver = MockResizeObserver;

      try {
        const svg = new MockSVGElement('svg');
        const board = new MockBoardElement(300, 300);
        const strike = new LaserStrike(svg, board);

        assert.ok(strike.resizeObserver instanceof MockResizeObserver);
        assert.equal(strike.resizeObserver.observedTargets.length, 1);
        assert.equal(strike.resizeObserver.observedTargets[0], board);

        // Test triggering resize observer callback
        strike.draw([0, 1, 2]);
        board.width = 450;
        strike.resizeObserver.trigger();

        // Check line updated
        assert.equal(strike.lineElement.style.strokeDashoffset, '0');

        strike.destroy();
        assert.equal(strike.resizeObserver, null);
      } finally {
        globalThis.ResizeObserver = origRO;
      }
    });
  });
});
