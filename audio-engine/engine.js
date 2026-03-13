// PAD DAW Engine — Main thread controller
// Manages AudioContext + AudioWorkletNode.
// Phase 1: MessagePort communication (SharedArrayBuffer in Step 2).

const PadDawEngine = {
  ctx: null,
  node: null,
  ready: false,

  // Jitter measurement
  _latencyLog: [],
  _maxLog: 200,

  async init(workletPath) {
    if (this.ready) return;

    this.ctx = new AudioContext({ sampleRate: 48000 });
    await this.ctx.audioWorklet.addModule(workletPath || 'audio-engine/worklet-processor.js');
    this.node = new AudioWorkletNode(this.ctx, 'pad-daw-processor', {
      outputChannelCount: [2]
    });
    this.node.connect(this.ctx.destination);

    // Listen for voice-started reports (jitter measurement)
    // Round-trip: main→worklet→main, both timestamps from performance.now()
    this.node.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'voiceStarted') {
        this._recordLatency(d.triggerTime, performance.now());
      }
    };

    this.ready = true;
  },

  loadSamples(sampleArrays) {
    // sampleArrays: Float32Array[] (pre-decoded PCM)
    if (!this.node) return;
    this.node.port.postMessage({ type: 'loadSamples', samples: sampleArrays });
  },

  noteOn(sampleIndex, velocity) {
    if (!this.ready) return;
    const triggerTime = performance.now();
    this.node.port.postMessage({
      type: 'noteOn',
      sampleIndex: sampleIndex,
      velocity: velocity,
      triggerTime: triggerTime
    });
    this._latencyLog.push({ triggerTime: triggerTime, receiveTime: null });
    if (this._latencyLog.length > this._maxLog) {
      this._latencyLog.shift();
    }
  },

  // --- Jitter measurement ---

  _recordLatency(triggerTime, processTime) {
    for (let i = this._latencyLog.length - 1; i >= 0; i--) {
      if (this._latencyLog[i].triggerTime === triggerTime) {
        this._latencyLog[i].receiveTime = processTime;
        break;
      }
    }
  },

  getJitterStats() {
    const deltas = [];
    for (let i = 0; i < this._latencyLog.length; i++) {
      const e = this._latencyLog[i];
      if (e.receiveTime !== null) {
        deltas.push(e.receiveTime - e.triggerTime);
      }
    }
    if (deltas.length === 0) return null;

    let sum = 0;
    let max = deltas[0];
    let min = deltas[0];
    for (let i = 0; i < deltas.length; i++) {
      sum += deltas[i];
      if (deltas[i] > max) max = deltas[i];
      if (deltas[i] < min) min = deltas[i];
    }
    return {
      avg: sum / deltas.length,
      max: max,
      min: min,
      jitter: max - min,
      count: deltas.length
    };
  },

  // --- Test utilities ---

  generateTestTone(freq, duration) {
    const sr = 48000;
    const len = (sr * duration) | 0;
    const buf = new Float32Array(len);
    const w = 2 * Math.PI * freq / sr;
    for (let i = 0; i < len; i++) {
      buf[i] = Math.sin(w * i) * 0.3;
    }
    return buf;
  }
};
