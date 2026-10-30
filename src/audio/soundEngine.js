/**
 * @file soundEngine.js
 * @description Zero-dependency Web Audio API procedural sound synthesis engine
 * for Chrono-Tic-Tac-Toe. Features a 5-stage master mixing bus with DynamicsCompressor
 * limiter, ADSR envelopes, 9 distinct procedural sound recipes, autoplay unlock,
 * and persistent volume/mute preferences with safe headless Node.js degradation.
 */

const STORAGE_KEY = 'chrono_ttt_audio_settings';
const DEFAULT_VOLUME = 0.70;
const EPSILON = 0.0001; // AudioParam exponential ramp non-zero lower threshold

export class SoundEngine {
  /**
   * @param {Object} [options={}]
   * @param {AudioContext} [options.audioContext] Injected AudioContext instance (for testing or custom context)
   * @param {Storage} [options.storage] Injected Web Storage instance (for testing or custom storage)
   */
  constructor(options = {}) {
    this._injectedContext = options.audioContext || null;
    this._storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);

    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;

    this._muted = false;
    this._volume = DEFAULT_VOLUME;
    this.isInitialized = false;

    // Detect environment capability
    const hasWindow = typeof window !== 'undefined';
    const ContextClass = this._injectedContext
      ? null
      : (hasWindow ? (window.AudioContext || window.webkitAudioContext || null) : null);

    this.isSupported = Boolean(this._injectedContext || ContextClass);

    this._unlockHandler = null;
    this._loadSettings();
    this._setupAutoplayUnlock();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle & Initialization
  // ---------------------------------------------------------------------------

  /**
   * Lazy initializes the AudioContext and master mixing bus on first interaction.
   * Safe to call multiple times (idempotent).
   * @returns {boolean} True if initialized and ready
   */
  init() {
    if (this.isInitialized && this.ctx && this.ctx.state !== 'closed') {
      return true;
    }
    if (!this.isSupported) {
      return false;
    }

    try {
      if (this._injectedContext) {
        this.ctx = this._injectedContext;
      } else if (typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }

      if (!this.ctx) {
        return false;
      }

      // 1. Create Master Gain Node (volume & mute control)
      this.masterGain = this.ctx.createGain();
      const initialGain = this._muted ? 0 : this._volume;
      this.masterGain.gain.setValueAtTime(initialGain, this.ctx.currentTime);

      // 2. Create Master Dynamics Compressor (Brick-wall Limiter)
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(24, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.20, this.ctx.currentTime);

      // 3. Connect Master Bus Topology: Master Gain -> Compressor -> Destination
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.isInitialized = true;
      return true;
    } catch (_) {
      this.isSupported = false;
      return false;
    }
  }

  /**
   * Ensures the AudioContext is running, resuming from 'suspended' if needed.
   * @private
   * @returns {boolean} True if context is active
   */
  _ensureRunning() {
    if (!this.init()) return false;
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => {});
    }
    return Boolean(this.ctx && this.ctx.state !== 'closed');
  }

  /**
   * Registers one-time window listeners to unlock suspended AudioContext on user gesture.
   * @private
   */
  _setupAutoplayUnlock() {
    if (typeof window === 'undefined') return;

    this._unlockHandler = () => {
      this._ensureRunning();
      this._removeAutoplayListeners();
    };

    window.addEventListener('pointerdown', this._unlockHandler, { passive: true, once: true });
    window.addEventListener('keydown', this._unlockHandler, { passive: true, once: true });
    window.addEventListener('touchstart', this._unlockHandler, { passive: true, once: true });
  }

  /**
   * Removes gesture listeners if registered.
   * @private
   */
  _removeAutoplayListeners() {
    if (typeof window !== 'undefined' && this._unlockHandler) {
      window.removeEventListener('pointerdown', this._unlockHandler);
      window.removeEventListener('keydown', this._unlockHandler);
      window.removeEventListener('touchstart', this._unlockHandler);
      this._unlockHandler = null;
    }
  }

  /**
   * Cleanly closes AudioContext, disconnects master nodes, and resets state.
   */
  destroy() {
    this._removeAutoplayListeners();

    if (this.ctx) {
      try {
        if (this.ctx.state !== 'closed' && typeof this.ctx.close === 'function') {
          this.ctx.close().catch(() => {});
        }
      } catch (_) {}
    }

    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch (_) {}
    }
    if (this.compressor) {
      try { this.compressor.disconnect(); } catch (_) {}
    }

    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.isInitialized = false;
  }

  // ---------------------------------------------------------------------------
  // Preferences: Volume & Mute
  // ---------------------------------------------------------------------------

  /**
   * Returns current mute status.
   * @returns {boolean}
   */
  isMuted() {
    return this._muted;
  }

  /**
   * Toggles mute on or off with smooth ramping to eliminate clicks.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(this._muted ? 0 : this._volume, now + 0.015);
      } catch (_) {
        this.masterGain.gain.value = this._muted ? 0 : this._volume;
      }
    }
    this._saveSettings();
  }

  /**
   * Returns current volume level [0.0 - 1.0].
   * @returns {number}
   */
  getVolume() {
    return this._volume;
  }

  /**
   * Sets master volume with clamp [0.0 - 1.0].
   * @param {number} volume
   */
  setVolume(volume) {
    const numeric = typeof volume === 'number' ? volume : parseFloat(volume);
    const clamped = Math.max(0, Math.min(1, isNaN(numeric) ? DEFAULT_VOLUME : numeric));
    this._volume = clamped;

    if (this.masterGain && this.ctx && !this._muted) {
      const now = this.ctx.currentTime;
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(this._volume, now + 0.015);
      } catch (_) {
        this.masterGain.gain.value = this._volume;
      }
    }
    this._saveSettings();
  }

  /**
   * Loads saved volume and mute preferences from storage.
   * @private
   */
  _loadSettings() {
    try {
      if (this._storage && typeof this._storage.getItem === 'function') {
        const raw = this._storage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.muted === 'boolean') {
            this._muted = parsed.muted;
          }
          if (typeof parsed.volume === 'number' && !isNaN(parsed.volume)) {
            this._volume = Math.max(0, Math.min(1, parsed.volume));
          }
        }
      }
    } catch (_) {
      // Storage unavailable or restricted (incognito/sandboxed)
    }
  }

  /**
   * Persists volume and mute preferences to storage.
   * @private
   */
  _saveSettings() {
    try {
      if (this._storage && typeof this._storage.setItem === 'function') {
        this._storage.setItem(STORAGE_KEY, JSON.stringify({
          version: 1,
          muted: this._muted,
          volume: this._volume
        }));
      }
    } catch (_) {
      // Storage unavailable or restricted
    }
  }

  // ---------------------------------------------------------------------------
  // Procedural Sound Recipes
  // ---------------------------------------------------------------------------

  /**
   * UI Click: Crisp tactile micro-switch sweep (700Hz -> 320Hz over 22ms).
   * @returns {boolean} True if sound was synthesized
   */
  playClick() {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.022);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);

    gain.gain.setValueAtTime(EPSILON, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.028);
    gain.gain.setValueAtTime(0, now + 0.030);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.030);
    this._cleanupVoice(osc, gain, filter, 35);
    return true;
  }

  /**
   * Place Mark: Resonant wooden tile placement. Distinct musical identity:
   * - Player 1: D5 (587.33 Hz) crisp bright chime
   * - Player 2: A4 (440.00 Hz) warm grounding chime
   * @param {'p1' | 'p2' | string} player
   * @returns {boolean} True if sound was synthesized
   */
  playPlace(player) {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;
    const isP1 = player !== 'p2';

    const fundamentalFreq = isP1 ? 587.33 : 440.00;
    const cutoffFreq = isP1 ? 2600 : 2000;

    // Fundamental Tone (Sine with attack click)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(fundamentalFreq * 1.18, now);
    osc1.frequency.exponentialRampToValueAtTime(fundamentalFreq, now + 0.012);

    // Harmonic Overtone (Triangle 1 octave up)
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(fundamentalFreq * 2, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffFreq, now);
    filter.Q.setValueAtTime(1.6, now);

    const gain1 = this.ctx.createGain();
    gain1.gain.setValueAtTime(EPSILON, now);
    gain1.gain.linearRampToValueAtTime(0.38, now + 0.002);
    gain1.gain.exponentialRampToValueAtTime(0.04, now + 0.075);
    gain1.gain.exponentialRampToValueAtTime(EPSILON, now + 0.120);
    gain1.gain.setValueAtTime(0, now + 0.122);

    const gain2 = this.ctx.createGain();
    gain2.gain.setValueAtTime(EPSILON, now);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.002);
    gain2.gain.exponentialRampToValueAtTime(EPSILON, now + 0.060);
    gain2.gain.setValueAtTime(0, now + 0.065);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(filter);
    gain2.connect(filter);
    filter.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.125);
    osc2.stop(now + 0.070);

    this._cleanupVoice(osc1, gain1, filter, 130);
    this._cleanupVoice(osc2, gain2, null, 75);
    return true;
  }

  /**
   * Turn Cue: Subtle harmonic celesta bell alert.
   * - Player 1: C6 (1046.50 Hz)
   * - Player 2: G5 (783.99 Hz)
   * @param {'p1' | 'p2' | string} player
   * @returns {boolean} True if sound was synthesized
   */
  playTurnCue(player) {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;
    const freq = player === 'p2' ? 783.99 : 1046.50;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, now);
    filter.Q.setValueAtTime(3.5, now);

    gain.gain.setValueAtTime(EPSILON, now);
    gain.gain.linearRampToValueAtTime(0.20, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.180);
    gain.gain.setValueAtTime(0, now + 0.185);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.185);
    this._cleanupVoice(osc, gain, filter, 190);
    return true;
  }

  /**
   * Ghost Vanish: Ethereal descending tone + sweeping white noise evaporation whoosh.
   * @returns {boolean} True if sound was synthesized
   */
  playVanish() {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;

    // 1. Tonal vacuum sweep (520Hz -> 85Hz)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.220);

    oscGain.gain.setValueAtTime(EPSILON, now);
    oscGain.gain.linearRampToValueAtTime(0.24, now + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.230);
    oscGain.gain.setValueAtTime(0, now + 0.240);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.240);

    // 2. Filtered noise burst (2200Hz -> 400Hz)
    const noiseDuration = 0.220;
    const buffer = this._createNoiseBuffer(noiseDuration);
    if (buffer) {
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2200, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(400, now + noiseDuration);
      noiseFilter.Q.setValueAtTime(2.0, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(EPSILON, now);
      noiseGain.gain.linearRampToValueAtTime(0.15, now + 0.015);
      noiseGain.gain.exponentialRampToValueAtTime(EPSILON, now + noiseDuration);
      noiseGain.gain.setValueAtTime(0, now + noiseDuration + 0.010);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noiseSource.start(now);
      noiseSource.stop(now + noiseDuration + 0.010);
      this._cleanupVoice(noiseSource, noiseGain, noiseFilter, 240);
    }

    this._cleanupVoice(osc, oscGain, null, 250);
    return true;
  }

  /**
   * Tactical Overdrive Ability:
   * - 'shatter': Sub-bass impact thud (200Hz->45Hz) + high noise crack + glass shimmer
   * - 'swap': Dual counter-swept sine oscillators (280Hz <-> 720Hz) through bandpass filter
   * @param {'shatter' | 'swap'} abilityType
   * @returns {boolean} True if sound was synthesized
   */
  playAbility(abilityType) {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;

    if (abilityType === 'shatter') {
      // 1. Sub-bass impact thud
      const thud = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(200, now);
      thud.frequency.exponentialRampToValueAtTime(45, now + 0.100);

      thudGain.gain.setValueAtTime(EPSILON, now);
      thudGain.gain.linearRampToValueAtTime(0.35, now + 0.002);
      thudGain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.120);
      thudGain.gain.setValueAtTime(0, now + 0.125);

      thud.connect(thudGain);
      thudGain.connect(this.masterGain);
      thud.start(now);
      thud.stop(now + 0.125);

      // 2. High noise crack
      const noiseBuffer = this._createNoiseBuffer(0.050);
      if (noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(3200, now);
        hp.Q.setValueAtTime(2.5, now);

        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(0.30, now);
        crackGain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.048);
        crackGain.gain.setValueAtTime(0, now + 0.050);

        noise.connect(hp);
        hp.connect(crackGain);
        crackGain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.050);
        this._cleanupVoice(noise, crackGain, hp, 60);
      }

      // 3. High glass shimmer resonance
      const shimmer = this.ctx.createOscillator();
      const shimmerGain = this.ctx.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(1567.98, now);

      shimmerGain.gain.setValueAtTime(EPSILON, now);
      shimmerGain.gain.linearRampToValueAtTime(0.12, now + 0.005);
      shimmerGain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.180);
      shimmerGain.gain.setValueAtTime(0, now + 0.185);

      shimmer.connect(shimmerGain);
      shimmerGain.connect(this.masterGain);
      shimmer.start(now);
      shimmer.stop(now + 0.185);

      this._cleanupVoice(thud, thudGain, null, 130);
      this._cleanupVoice(shimmer, shimmerGain, null, 190);
      return true;
    }

    // Phase Swap (or fallback)
    const oscUp = this.ctx.createOscillator();
    const oscDown = this.ctx.createOscillator();
    const swapFilter = this.ctx.createBiquadFilter();
    const swapGain = this.ctx.createGain();

    oscUp.type = 'sine';
    oscUp.frequency.setValueAtTime(280, now);
    oscUp.frequency.exponentialRampToValueAtTime(720, now + 0.180);

    oscDown.type = 'sine';
    oscDown.frequency.setValueAtTime(720, now);
    oscDown.frequency.exponentialRampToValueAtTime(280, now + 0.180);

    swapFilter.type = 'bandpass';
    swapFilter.frequency.setValueAtTime(600, now);
    swapFilter.frequency.linearRampToValueAtTime(1400, now + 0.180);
    swapFilter.Q.setValueAtTime(4.0, now);

    swapGain.gain.setValueAtTime(EPSILON, now);
    swapGain.gain.linearRampToValueAtTime(0.28, now + 0.015);
    swapGain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.200);
    swapGain.gain.setValueAtTime(0, now + 0.205);

    oscUp.connect(swapFilter);
    oscDown.connect(swapFilter);
    swapFilter.connect(swapGain);
    swapGain.connect(this.masterGain);

    oscUp.start(now);
    oscDown.start(now);
    oscUp.stop(now + 0.205);
    oscDown.stop(now + 0.205);

    this._cleanupVoice(oscUp, swapGain, swapFilter, 210);
    this._cleanupVoice(oscDown, null, null, 210);
    return true;
  }

  /**
   * Blitz Warning: Urgent double-pitch clock countdown pulse (880Hz -> 620Hz).
   * @returns {boolean} True if sound was synthesized
   */
  playWarning() {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.025);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(2.2, now);

    gain.gain.setValueAtTime(EPSILON, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.038);
    gain.gain.setValueAtTime(0, now + 0.041);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.041);
    this._cleanupVoice(osc, gain, filter, 50);
    return true;
  }

  /**
   * Win Fanfare: Celebratory ascending C-Major arpeggio fanfare (C5, E5, G5, C6).
   * @returns {boolean} True if sound was synthesized
   */
  playWin() {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;
    const notes = [
      { freq: 523.25, time: 0.00, dur: 0.160, gain: 0.22 }, // C5
      { freq: 659.25, time: 0.08, dur: 0.160, gain: 0.22 }, // E5
      { freq: 783.99, time: 0.16, dur: 0.160, gain: 0.22 }, // G5
      { freq: 1046.50, time: 0.24, dur: 0.450, gain: 0.26 }  // C6 (Tonic finale)
    ];

    for (const note of notes) {
      const t = now + note.time;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, t);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, t);

      gain.gain.setValueAtTime(EPSILON, t);
      gain.gain.linearRampToValueAtTime(note.gain, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(EPSILON, t + note.dur - 0.010);
      gain.gain.setValueAtTime(0, t + note.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + note.dur);
      this._cleanupVoice(osc, gain, filter, (note.time + note.dur) * 1000 + 50);
    }
    return true;
  }

  /**
   * Stalemate / Draw: Warm, mellow resolving cadence in minor triad (G4, Eb4, C4).
   * @returns {boolean} True if sound was synthesized
   */
  playDraw() {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;
    const notes = [
      { freq: 392.00, time: 0.00, dur: 0.200, gain: 0.20 }, // G4
      { freq: 311.13, time: 0.12, dur: 0.200, gain: 0.20 }, // Eb4
      { freq: 261.63, time: 0.24, dur: 0.420, gain: 0.24 }  // C4
    ];

    for (const note of notes) {
      const t = now + note.time;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, t);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, t);
      filter.Q.setValueAtTime(1.0, t);

      gain.gain.setValueAtTime(EPSILON, t);
      gain.gain.linearRampToValueAtTime(note.gain, t + 0.010);
      gain.gain.exponentialRampToValueAtTime(EPSILON, t + note.dur - 0.020);
      gain.gain.setValueAtTime(0, t + note.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + note.dur);
      this._cleanupVoice(osc, gain, filter, (note.time + note.dur) * 1000 + 50);
    }
    return true;
  }

  /**
   * Invalid Action / Error: Low-frequency damped physical rejection thud.
   * @returns {boolean} True if sound was synthesized
   */
  playError() {
    if (!this._ensureRunning() || this._muted) return false;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(160, now);
    osc1.frequency.exponentialRampToValueAtTime(60, now + 0.065);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(110, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, now);
    filter.Q.setValueAtTime(0.8, now);

    gain.gain.setValueAtTime(EPSILON, now);
    gain.gain.linearRampToValueAtTime(0.30, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(EPSILON, now + 0.080);
    gain.gain.setValueAtTime(0, now + 0.087);

    osc1.connect(gain);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.087);
    osc2.stop(now + 0.087);

    this._cleanupVoice(osc1, gain, filter, 95);
    this._cleanupVoice(osc2, null, null, 95);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generates a single-channel white noise AudioBuffer.
   * @private
   * @param {number} durationSeconds
   * @returns {AudioBuffer|null}
   */
  _createNoiseBuffer(durationSeconds) {
    if (!this.ctx || typeof this.ctx.createBuffer !== 'function') return null;
    try {
      const sampleRate = this.ctx.sampleRate || 44100;
      const bufferLength = Math.max(1, Math.floor(sampleRate * durationSeconds));
      const buffer = this.ctx.createBuffer(1, bufferLength, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    } catch (_) {
      return null;
    }
  }

  /**
   * Safely disconnects source and processing nodes after playback to prevent node leaks.
   * @private
   */
  _cleanupVoice(source, gain, filter, delayMs) {
    setTimeout(() => {
      try {
        if (source && typeof source.disconnect === 'function') source.disconnect();
        if (gain && typeof gain.disconnect === 'function') gain.disconnect();
        if (filter && typeof filter.disconnect === 'function') filter.disconnect();
      } catch (_) {}
    }, Math.max(10, delayMs));
  }
}
