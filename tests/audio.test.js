/**
 * @file audio.test.js
 * @description Comprehensive automated unit test suite for procedural Web Audio API
 * sound engine (src/audio/soundEngine.js). Features zero-dependency in-memory Web Audio
 * mocks, testing graph topology, compressor limiting, 9 procedural sound recipes,
 * volume/mute persistence, autoplay unlock, and headless Node.js safety.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine } from '../src/audio/soundEngine.js';

// =============================================================================
// Zero-Dependency Mock Web Audio API Fixtures
// =============================================================================

class MockAudioParam {
  constructor(defaultValue = 1) {
    this.value = defaultValue;
    this.calls = [];
  }

  setValueAtTime(val, time) {
    this.value = val;
    this.calls.push({ method: 'setValueAtTime', val, time });
    return this;
  }

  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.calls.push({ method: 'linearRampToValueAtTime', val, time });
    return this;
  }

  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.calls.push({ method: 'exponentialRampToValueAtTime', val, time });
    return this;
  }

  cancelScheduledValues(time) {
    this.calls.push({ method: 'cancelScheduledValues', time });
    return this;
  }
}

class MockAudioNode {
  constructor() {
    this.connectedTo = [];
    this.isDisconnected = false;
  }

  connect(dest) {
    this.connectedTo.push(dest);
    return dest;
  }

  disconnect() {
    this.isDisconnected = true;
    this.connectedTo = [];
  }
}

class MockGainNode extends MockAudioNode {
  constructor(defaultGain = 1) {
    super();
    this.gain = new MockAudioParam(defaultGain);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.startedAt = null;
    this.stoppedAt = null;
    this.listeners = {};
  }

  start(time = 0) {
    this.startedAt = time;
  }

  stop(time = 0) {
    this.stoppedAt = time;
  }

  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  constructor() {
    super();
    this.threshold = new MockAudioParam(-24);
    this.knee = new MockAudioParam(30);
    this.ratio = new MockAudioParam(12);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.25);
  }
}

class MockAudioBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channelData = new Float32Array(length);
  }

  getChannelData() {
    return this.channelData;
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor() {
    super();
    this.buffer = null;
    this.startedAt = null;
    this.stoppedAt = null;
    this.listeners = {};
  }

  start(time = 0) {
    this.startedAt = time;
  }

  stop(time = 0) {
    this.stoppedAt = time;
  }

  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode();
    this.createdNodes = {
      gains: [],
      oscillators: [],
      filters: [],
      compressors: [],
      buffers: [],
      bufferSources: []
    };
  }

  createGain() {
    const node = new MockGainNode();
    this.createdNodes.gains.push(node);
    return node;
  }

  createOscillator() {
    const node = new MockOscillatorNode();
    this.createdNodes.oscillators.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.createdNodes.filters.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new MockDynamicsCompressorNode();
    this.createdNodes.compressors.push(node);
    return node;
  }

  createBuffer(channels, length, sampleRate) {
    const buf = new MockAudioBuffer(channels, length, sampleRate);
    this.createdNodes.buffers.push(buf);
    return buf;
  }

  createBufferSource() {
    const node = new MockAudioBufferSourceNode();
    this.createdNodes.bufferSources.push(node);
    return node;
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

class MockStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

// =============================================================================
// Test Suites
// =============================================================================

describe('Web Audio SoundEngine Suite', () => {

  describe('1. Headless Environment Graceful Degradation', () => {
    it('should instantiate cleanly in Node.js without window or AudioContext', () => {
      const engine = new SoundEngine();
      assert.equal(engine.isSupported, false);
      assert.equal(engine.ctx, null);
      assert.equal(engine.isMuted(), false);
      assert.equal(engine.getVolume(), 0.70);
    });

    it('should safely no-op on all play methods when unsupported without throwing', () => {
      const engine = new SoundEngine();
      assert.equal(engine.init(), false);
      assert.equal(engine.playClick(), false);
      assert.equal(engine.playPlace('p1'), false);
      assert.equal(engine.playPlace('p2'), false);
      assert.equal(engine.playTurnCue('p1'), false);
      assert.equal(engine.playVanish(), false);
      assert.equal(engine.playAbility('shatter'), false);
      assert.equal(engine.playAbility('swap'), false);
      assert.equal(engine.playWarning(), false);
      assert.equal(engine.playWin(), false);
      assert.equal(engine.playDraw(), false);
      assert.equal(engine.playError(), false);
      assert.doesNotThrow(() => engine.destroy());
    });

    it('should safely allow volume and mute toggles even when unsupported', () => {
      const engine = new SoundEngine();
      engine.setMuted(true);
      assert.equal(engine.isMuted(), true);
      engine.setVolume(0.45);
      assert.equal(engine.getVolume(), 0.45);
    });
  });

  describe('2. Master Audio Graph Topology & DynamicsCompressor Limiter', () => {
    let mockCtx;
    let engine;

    beforeEach(() => {
      mockCtx = new MockAudioContext();
      engine = new SoundEngine({ audioContext: mockCtx });
    });

    it('should create masterGain and compressor upon initialization', () => {
      assert.equal(engine.isSupported, true);
      assert.equal(engine.isInitialized, false);

      const success = engine.init();
      assert.equal(success, true);
      assert.equal(engine.isInitialized, true);
      assert.ok(engine.masterGain instanceof MockGainNode);
      assert.ok(engine.compressor instanceof MockDynamicsCompressorNode);
    });

    it('should wire the 5-stage bus: MasterGain -> Compressor -> Destination', () => {
      engine.init();
      assert.equal(engine.masterGain.connectedTo.length, 1);
      assert.equal(engine.masterGain.connectedTo[0], engine.compressor);

      assert.equal(engine.compressor.connectedTo.length, 1);
      assert.equal(engine.compressor.connectedTo[0], mockCtx.destination);
    });

    it('should configure compressor with exact brick-wall limiting parameters', () => {
      engine.init();
      assert.equal(engine.compressor.threshold.value, -12);
      assert.equal(engine.compressor.knee.value, 24);
      assert.equal(engine.compressor.ratio.value, 8);
      assert.equal(engine.compressor.attack.value, 0.003);
      assert.equal(engine.compressor.release.value, 0.20);
    });

    it('should automatically resume context from suspended state on playback', () => {
      assert.equal(mockCtx.state, 'suspended');
      const played = engine.playClick();
      assert.equal(played, true);
      assert.equal(mockCtx.state, 'running');
    });
  });

  describe('3. Volume, Mute Controls & Storage Persistence', () => {
    let mockCtx;
    let mockStorage;
    let engine;

    beforeEach(() => {
      mockCtx = new MockAudioContext();
      mockStorage = new MockStorage();
      engine = new SoundEngine({ audioContext: mockCtx, storage: mockStorage });
    });

    it('should clamp volume to range [0.0, 1.0]', () => {
      engine.setVolume(1.5);
      assert.equal(engine.getVolume(), 1.0);

      engine.setVolume(-0.25);
      assert.equal(engine.getVolume(), 0.0);

      engine.setVolume(0.35);
      assert.equal(engine.getVolume(), 0.35);
    });

    it('should set masterGain to 0 when muted and restore when unmuted', () => {
      engine.init();
      engine.setVolume(0.80);
      assert.equal(engine.masterGain.gain.value, 0.80);

      engine.setMuted(true);
      assert.equal(engine.isMuted(), true);
      assert.equal(engine.masterGain.gain.value, 0);

      engine.setMuted(false);
      assert.equal(engine.isMuted(), false);
      assert.equal(engine.masterGain.gain.value, 0.80);
    });

    it('should persist volume and mute settings to storage', () => {
      engine.setVolume(0.42);
      engine.setMuted(true);

      const raw = mockStorage.getItem('chrono_ttt_audio_settings');
      assert.ok(raw);
      const parsed = JSON.parse(raw);
      assert.equal(parsed.volume, 0.42);
      assert.equal(parsed.muted, true);
    });

    it('should restore persisted settings on new instance creation', () => {
      mockStorage.setItem('chrono_ttt_audio_settings', JSON.stringify({
        version: 1,
        volume: 0.25,
        muted: true
      }));

      const newEngine = new SoundEngine({ audioContext: mockCtx, storage: mockStorage });
      assert.equal(newEngine.getVolume(), 0.25);
      assert.equal(newEngine.isMuted(), true);
    });

    it('should not play audio or spawn voice nodes when muted', () => {
      engine.setMuted(true);
      const nodeCountBefore = mockCtx.createdNodes.oscillators.length;

      const result = engine.playClick();
      assert.equal(result, false);
      assert.equal(mockCtx.createdNodes.oscillators.length, nodeCountBefore);
    });
  });

  describe('4. Procedural Audio Recipes Verification', () => {
    let mockCtx;
    let engine;

    beforeEach(() => {
      mockCtx = new MockAudioContext();
      engine = new SoundEngine({ audioContext: mockCtx });
      engine.init();
    });

    it('playClick(): sweeps frequency and shapes ADSR envelope down to EPSILON', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const res = engine.playClick();
      assert.equal(res, true);

      const osc = mockCtx.createdNodes.oscillators[oscCountBefore];
      assert.equal(osc.type, 'sine');

      // Check frequency sweep: 700Hz -> 320Hz
      const freqCalls = osc.frequency.calls;
      assert.ok(freqCalls.some(c => c.method === 'setValueAtTime' && c.val === 700));
      assert.ok(freqCalls.some(c => c.method === 'exponentialRampToValueAtTime' && c.val === 320));

      // Check gain envelope ramps to EPSILON (0.0001)
      const gainNode = mockCtx.createdNodes.gains[mockCtx.createdNodes.gains.length - 1];
      const gainCalls = gainNode.gain.calls;
      assert.ok(gainCalls.some(c => c.method === 'exponentialRampToValueAtTime' && Math.abs(c.val - 0.0001) < 1e-6));
    });

    it('playPlace(): creates differentiated fundamental and harmonic tones for P1 vs P2', () => {
      // Test Player 1 (D5 ~587.33Hz)
      const oscCountP1 = mockCtx.createdNodes.oscillators.length;
      engine.playPlace('p1');
      const oscP1Fundamental = mockCtx.createdNodes.oscillators[oscCountP1];
      const oscP1Overtone = mockCtx.createdNodes.oscillators[oscCountP1 + 1];

      assert.equal(oscP1Fundamental.type, 'sine');
      assert.equal(oscP1Overtone.type, 'triangle');
      assert.ok(oscP1Fundamental.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && Math.abs(c.val - 587.33) < 0.1));
      assert.ok(oscP1Overtone.frequency.calls.some(c => c.val > 1000)); // Octave overtone

      // Test Player 2 (A4 ~440.00Hz)
      const oscCountP2 = mockCtx.createdNodes.oscillators.length;
      engine.playPlace('p2');
      const oscP2Fundamental = mockCtx.createdNodes.oscillators[oscCountP2];
      const oscP2Overtone = mockCtx.createdNodes.oscillators[oscCountP2 + 1];

      assert.equal(oscP2Fundamental.type, 'sine');
      assert.equal(oscP2Overtone.type, 'triangle');
      assert.ok(oscP2Fundamental.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && Math.abs(c.val - 440.00) < 0.1));
    });

    it('playTurnCue(): plays harmonic bell alert at C6 (1046Hz) for P1 and G5 (784Hz) for P2', () => {
      const oscCountP1 = mockCtx.createdNodes.oscillators.length;
      engine.playTurnCue('p1');
      const oscP1 = mockCtx.createdNodes.oscillators[oscCountP1];
      assert.ok(oscP1.frequency.calls.some(c => Math.abs(c.val - 1046.50) < 0.1));

      const oscCountP2 = mockCtx.createdNodes.oscillators.length;
      engine.playTurnCue('p2');
      const oscP2 = mockCtx.createdNodes.oscillators[oscCountP2];
      assert.ok(oscP2.frequency.calls.some(c => Math.abs(c.val - 783.99) < 0.1));
    });

    it('playVanish(): creates dual-layer synthesis (tonal vacuum sweep + sweeping noise burst)', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const bufferCountBefore = mockCtx.createdNodes.bufferSources.length;

      const res = engine.playVanish();
      assert.equal(res, true);

      // Layer 1: Descending pitch vacuum (520Hz -> 85Hz)
      const osc = mockCtx.createdNodes.oscillators[oscCountBefore];
      assert.ok(osc.frequency.calls.some(c => c.val === 520));
      assert.ok(osc.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && c.val === 85));

      // Layer 2: White noise buffer source with bandpass sweep
      assert.equal(mockCtx.createdNodes.bufferSources.length, bufferCountBefore + 1);
      const noiseSource = mockCtx.createdNodes.bufferSources[bufferCountBefore];
      assert.ok(noiseSource.buffer instanceof MockAudioBuffer);
    });

    it('playAbility("shatter"): produces sub-bass impact, high noise crack, and glass shimmer', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const res = engine.playAbility('shatter');
      assert.equal(res, true);

      // 1. Sub-bass thud (triangle 200 -> 45Hz)
      const thud = mockCtx.createdNodes.oscillators[oscCountBefore];
      assert.equal(thud.type, 'triangle');
      assert.ok(thud.frequency.calls.some(c => c.val === 200));
      assert.ok(thud.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && c.val === 45));

      // 2. High glass shimmer (sine ~1568Hz)
      const shimmer = mockCtx.createdNodes.oscillators[oscCountBefore + 1];
      assert.equal(shimmer.type, 'sine');
      assert.ok(shimmer.frequency.calls.some(c => Math.abs(c.val - 1567.98) < 0.1));
    });

    it('playAbility("swap"): produces dual counter-swept sine oscillators through bandpass filter', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const filterCountBefore = mockCtx.createdNodes.filters.length;

      const res = engine.playAbility('swap');
      assert.equal(res, true);

      const oscUp = mockCtx.createdNodes.oscillators[oscCountBefore];
      const oscDown = mockCtx.createdNodes.oscillators[oscCountBefore + 1];
      const filter = mockCtx.createdNodes.filters[filterCountBefore];

      // Counter sweeps: 280 -> 720 and 720 -> 280
      assert.ok(oscUp.frequency.calls.some(c => c.val === 280));
      assert.ok(oscUp.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && c.val === 720));
      assert.ok(oscDown.frequency.calls.some(c => c.val === 720));
      assert.ok(oscDown.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && c.val === 280));

      assert.equal(filter.type, 'bandpass');
    });

    it('playWarning(): plays high-urgency triangle chirp (880Hz -> 620Hz)', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const res = engine.playWarning();
      assert.equal(res, true);

      const osc = mockCtx.createdNodes.oscillators[oscCountBefore];
      assert.equal(osc.type, 'triangle');
      assert.ok(osc.frequency.calls.some(c => c.val === 880));
      assert.ok(osc.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && c.val === 620));
    });

    it('playWin(): schedules triumphant ascending 4-note C-Major fanfare arpeggio', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const res = engine.playWin();
      assert.equal(res, true);

      // Must have spawned 4 sequential notes: C5, E5, G5, C6
      assert.equal(mockCtx.createdNodes.oscillators.length, oscCountBefore + 4);
      const notes = [
        mockCtx.createdNodes.oscillators[oscCountBefore],
        mockCtx.createdNodes.oscillators[oscCountBefore + 1],
        mockCtx.createdNodes.oscillators[oscCountBefore + 2],
        mockCtx.createdNodes.oscillators[oscCountBefore + 3]
      ];

      assert.ok(notes[0].frequency.calls.some(c => Math.abs(c.val - 523.25) < 0.1)); // C5
      assert.ok(notes[1].frequency.calls.some(c => Math.abs(c.val - 659.25) < 0.1)); // E5
      assert.ok(notes[2].frequency.calls.some(c => Math.abs(c.val - 783.99) < 0.1)); // G5
      assert.ok(notes[3].frequency.calls.some(c => Math.abs(c.val - 1046.50) < 0.1)); // C6
    });

    it('playDraw(): schedules warm resolving minor triad cadence (G4, Eb4, C4)', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const res = engine.playDraw();
      assert.equal(res, true);

      assert.equal(mockCtx.createdNodes.oscillators.length, oscCountBefore + 3);
      const notes = [
        mockCtx.createdNodes.oscillators[oscCountBefore],
        mockCtx.createdNodes.oscillators[oscCountBefore + 1],
        mockCtx.createdNodes.oscillators[oscCountBefore + 2]
      ];

      assert.ok(notes[0].frequency.calls.some(c => Math.abs(c.val - 392.00) < 0.1)); // G4
      assert.ok(notes[1].frequency.calls.some(c => Math.abs(c.val - 311.13) < 0.1)); // Eb4
      assert.ok(notes[2].frequency.calls.some(c => Math.abs(c.val - 261.63) < 0.1)); // C4
    });

    it('playError(): plays low-frequency damped thud (<200Hz)', () => {
      const oscCountBefore = mockCtx.createdNodes.oscillators.length;
      const res = engine.playError();
      assert.equal(res, true);

      const osc1 = mockCtx.createdNodes.oscillators[oscCountBefore];
      const osc2 = mockCtx.createdNodes.oscillators[oscCountBefore + 1];

      assert.equal(osc1.type, 'sine');
      assert.ok(osc1.frequency.calls.some(c => c.val === 160));
      assert.ok(osc1.frequency.calls.some(c => c.method === 'exponentialRampToValueAtTime' && c.val === 60));

      assert.equal(osc2.type, 'square');
      assert.ok(osc2.frequency.calls.some(c => c.val === 110));
    });
  });

  describe('5. Resource Teardown & Lifecycle Cleanup', () => {
    it('destroy(): closes AudioContext, disconnects master nodes, and resets state', () => {
      const mockCtx = new MockAudioContext();
      const engine = new SoundEngine({ audioContext: mockCtx });
      engine.init();

      const masterGain = engine.masterGain;
      const compressor = engine.compressor;

      engine.destroy();

      assert.equal(mockCtx.state, 'closed');
      assert.equal(masterGain.isDisconnected, true);
      assert.equal(compressor.isDisconnected, true);
      assert.equal(engine.ctx, null);
      assert.equal(engine.masterGain, null);
      assert.equal(engine.compressor, null);
      assert.equal(engine.isInitialized, false);
    });
  });
});
