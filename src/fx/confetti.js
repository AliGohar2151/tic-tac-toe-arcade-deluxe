/**
 * @file confetti.js
 * @description Pure HTML5 Canvas 2D multi-geometry particle physics celebration engine.
 * Features 3D tumbling flakes, dots, ribbons, dual-cannon trajectories, HiDPI Retina
 * scaling, reduced-motion accessibility, and graceful headless Node.js degradation.
 */

const DEFAULT_PALETTE = [
  '#f59e0b', // Gold / Amber
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#f43f5e', // Coral / Rose
  '#10b981', // Emerald
  '#fbbf24'  // Warm Yellow
];

export class ConfettiCannon {
  /**
   * @param {HTMLCanvasElement|string} [canvasElement] Canvas DOM element or query selector
   * @param {Object} [options={}]
   * @param {string[]} [options.palette] Array of hex color strings
   * @param {number} [options.particleCount=120] Default count of particles per burst
   * @param {number} [options.gravity=0.22] Downward acceleration per frame
   * @param {number} [options.drag=0.98] Air friction velocity decay
   */
  constructor(canvasElement = null, options = {}) {
    this.palette = options.palette || DEFAULT_PALETTE;
    this.defaultParticleCount = options.particleCount || 120;
    this.gravity = options.gravity !== undefined ? options.gravity : 0.22;
    this.drag = options.drag !== undefined ? options.drag : 0.98;

    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationId = null;
    this.isRunning = false;
    this.dpr = 1;
    this.width = 0;
    this.height = 0;

    this._resizeHandler = null;

    // Resolve canvas element
    const hasDoc = typeof document !== 'undefined';
    if (canvasElement) {
      if (typeof canvasElement === 'string' && hasDoc) {
        this.canvas = document.querySelector(canvasElement);
      } else {
        this.canvas = canvasElement;
      }
    } else if (hasDoc) {
      this.canvas = document.getElementById('confettiCanvas') || document.querySelector('canvas');
    }

    if (this.canvas && typeof this.canvas.getContext === 'function') {
      try {
        this.ctx = this.canvas.getContext('2d');
      } catch (_) {
        this.ctx = null;
      }
    }

    this.isSupported = Boolean(this.canvas && this.ctx);

    if (this.isSupported) {
      this.handleResize();
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        this._resizeHandler = () => this.handleResize();
        window.addEventListener('resize', this._resizeHandler, { passive: true });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Canvas Scaling & Sizing
  // ---------------------------------------------------------------------------

  /**
   * Synchronizes canvas internal bitmap buffer with display dimensions and device pixel ratio.
   */
  handleResize() {
    if (!this.canvas) return;

    let displayWidth = 800;
    let displayHeight = 600;

    if (typeof this.canvas.getBoundingClientRect === 'function') {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        displayWidth = rect.width;
        displayHeight = rect.height;
      } else if (typeof window !== 'undefined') {
        displayWidth = window.innerWidth || displayWidth;
        displayHeight = window.innerHeight || displayHeight;
      }
    } else if (typeof window !== 'undefined') {
      displayWidth = window.innerWidth || displayWidth;
      displayHeight = window.innerHeight || displayHeight;
    }

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this.dpr = dpr;
    this.width = displayWidth;
    this.height = displayHeight;

    this.canvas.width = Math.round(displayWidth * dpr);
    this.canvas.height = Math.round(displayHeight * dpr);

    if (this.canvas.style) {
      this.canvas.style.width = `${displayWidth}px`;
      this.canvas.style.height = `${displayHeight}px`;
    }
  }

  // ---------------------------------------------------------------------------
  // Particle Simulation & Launching
  // ---------------------------------------------------------------------------

  /**
   * Launches celebratory confetti burst.
   * Skips physics loop if user prefers reduced motion.
   * @param {number|Object} [durationOrOptions=3000] Duration in ms or configuration object
   * @returns {boolean} True if confetti was fired
   */
  fire(durationOrOptions = 3000) {
    if (!this.isSupported || !this.ctx) return false;

    // Check prefers-reduced-motion accessibility preference
    if (this._prefersReducedMotion()) {
      return false;
    }

    let durationMs = 3000;
    let particleCount = this.defaultParticleCount;

    if (typeof durationOrOptions === 'number') {
      durationMs = durationOrOptions;
    } else if (durationOrOptions && typeof durationOrOptions === 'object') {
      if (durationOrOptions.duration !== undefined) durationMs = durationOrOptions.duration;
      if (durationOrOptions.count !== undefined) particleCount = durationOrOptions.count;
    }

    this.stop();
    this.handleResize();

    this.particles = this._createParticles(particleCount);
    this.isRunning = true;
    this.startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.maxDurationMs = durationMs;

    const tick = (now) => {
      if (!this.isRunning) return;
      this._updateAndRender(now);
      if (this.particles.length > 0 && this.isRunning) {
        if (typeof requestAnimationFrame !== 'undefined') {
          this.animationId = requestAnimationFrame(tick);
        }
      } else {
        this.stop();
        this.clear();
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationId = requestAnimationFrame(tick);
    } else {
      // Direct single-pass update for environments without RAF
      this._updateAndRender(Date.now());
    }

    return true;
  }

  /**
   * Spawns multi-geometry particles with dual-cannon trajectory arcs.
   * @private
   * @param {number} count
   * @returns {Array<Object>}
   */
  _createParticles(count) {
    const particles = [];
    const geometries = ['flake', 'flake', 'dot', 'ribbon']; // 50% flakes, 25% dots, 25% ribbons
    const w = this.width || 800;
    const h = this.height || 600;

    for (let i = 0; i < count; i++) {
      const isLeftCannon = i % 2 === 0;
      const type = geometries[Math.floor(Math.random() * geometries.length)];
      const color = this.palette[Math.floor(Math.random() * this.palette.length)];

      // Dual cannon spawn origins
      const originX = isLeftCannon ? w * 0.12 : w * 0.88;
      const originY = h * 0.95;

      // Inward angled trajectory with upward launch force
      const angle = isLeftCannon
        ? -Math.PI / 2 + (Math.random() * 0.55 - 0.10) // angled ~60-80 degrees right
        : -Math.PI / 2 - (Math.random() * 0.55 - 0.10); // angled ~60-80 degrees left

      const speed = 14 + Math.random() * 12;

      particles.push({
        type,
        color,
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: type === 'ribbon' ? (4 + Math.random() * 3) : (8 + Math.random() * 6),
        h: type === 'ribbon' ? (16 + Math.random() * 10) : (5 + Math.random() * 5),
        radius: 3 + Math.random() * 3,
        rotationZ: Math.random() * Math.PI * 2,
        rotationSpeedZ: (Math.random() - 0.5) * 0.18,
        tilt: Math.random() * Math.PI * 2,
        tiltSpeed: 0.06 + Math.random() * 0.10,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.06,
        opacity: 1.0,
        decay: 0.003 + Math.random() * 0.004
      });
    }

    return particles;
  }

  /**
   * Advances physics step and renders all active particles.
   * @private
   */
  _updateAndRender(timestamp = 0) {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    if (this.dpr && this.dpr !== 1) {
      ctx.scale(this.dpr, this.dpr);
    }

    const alive = [];
    const w = this.width || 800;
    const h = this.height || 600;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Physics integration
      p.vx *= this.drag;
      p.vy = (p.vy + this.gravity) * this.drag;
      p.x += p.vx + Math.sin(p.wobble) * 1.2;
      p.y += p.vy;

      p.wobble += p.wobbleSpeed;
      p.rotationZ += p.rotationSpeedZ;
      p.tilt += p.tiltSpeed;
      p.opacity -= p.decay;

      // Filter boundary conditions
      if (p.opacity > 0 && p.y < h + 60 && p.x > -60 && p.x < w + 60) {
        alive.push(p);

        // Render particle
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotationZ);

        // 3D Euler tumble projection
        const scaleX = Math.cos(p.tilt);
        ctx.scale(scaleX, 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
        ctx.fillStyle = p.color;

        if (p.type === 'flake') {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else if (p.type === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'ribbon') {
          ctx.beginPath();
          ctx.moveTo(-p.w / 2, -p.h / 2);
          ctx.quadraticCurveTo(p.w * Math.sin(p.wobble), 0, -p.w / 2, p.h / 2);
          ctx.lineWidth = p.w;
          ctx.strokeStyle = p.color;
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    ctx.restore();
    this.particles = alive;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle Controls
  // ---------------------------------------------------------------------------

  /**
   * Halts active animation frame loop.
   */
  stop() {
    this.isRunning = false;
    if (this.animationId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animationId);
      }
      this.animationId = null;
    }
  }

  /**
   * Clears canvas buffer and purges particles.
   */
  clear() {
    this.particles = [];
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Cleanly destroys instance, cancels loops, removes window listeners, and frees canvas.
   */
  destroy() {
    this.stop();
    this.clear();

    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    this.canvas = null;
    this.ctx = null;
    this.isSupported = false;
  }

  /**
   * Checks if user has requested reduced motion.
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
