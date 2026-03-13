// PAD DAW Engine — Main thread controller
// Manages AudioContext + AudioWorkletNode.
// Dual path: SharedArrayBuffer (low latency) or MessagePort (fallback).

// --- RingBuffer constants (duplicated, ring-buffer.js has full impl) ---
var RING_FLOATS_PER_CMD = 3;
var RING_CAPACITY = 64;
var RING_DATA_FLOATS = RING_CAPACITY * RING_FLOATS_PER_CMD;
var RING_HEADER_BYTES = 8;
var RING_DATA_BYTES = RING_DATA_FLOATS * 4;
var RING_TOTAL_BYTES = RING_HEADER_BYTES + RING_DATA_BYTES;

var PadDawEngine = {
  ctx: null,
  node: null,
  ready: false,
  useSAB: false,
  ring: null,

  // Jitter measurement
  _latencyLog: [],
  _maxLog: 200,

  async init(workletPath) {
    if (this.ready) return;

    this.ctx = new AudioContext({ sampleRate: 48000 });
    await this.ctx.audioWorklet.addModule(workletPath || 'audio-engine/worklet-processor.js');

    // Detect SharedArrayBuffer availability
    this.useSAB = typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolated === true;

    var processorOptions = {};
    if (this.useSAB) {
      var sab = new SharedArrayBuffer(RING_TOTAL_BYTES);
      this.ring = {
        sab: sab,
        header: new Int32Array(sab, 0, 2),
        data: new Float32Array(sab, RING_HEADER_BYTES, RING_DATA_FLOATS)
      };
      processorOptions.ringBufferSab = sab;
    }

    this.node = new AudioWorkletNode(this.ctx, 'pad-daw-processor', {
      outputChannelCount: [2],
      processorOptions: processorOptions
    });
    this.node.connect(this.ctx.destination);

    // Listen for worklet reports (jitter measurement)
    this.node.port.onmessage = function(e) {
      var d = e.data;
      if (d.type === 'voiceStarted') {
        // MessagePort path: round-trip complete
        PadDawEngine._recordLatency(d.triggerTime, performance.now());
      } else if (d.type === 'sabDrained') {
        // SAB path: worklet drained the ring buffer — mark most recent pending entry
        var now = performance.now();
        for (var i = PadDawEngine._latencyLog.length - 1; i >= 0; i--) {
          if (PadDawEngine._latencyLog[i].receiveTime === null) {
            PadDawEngine._latencyLog[i].receiveTime = now;
            break;
          }
        }
      }
    };

    this.ready = true;
  },

  loadSamples: function(sampleArrays) {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'loadSamples', samples: sampleArrays });
  },

  noteOn: function(sampleIndex, velocity, pitchRatio) {
    if (!this.ready) return;
    pitchRatio = pitchRatio || 1.0;

    if (this.useSAB && this.ring) {
      // SAB path — write directly to ring buffer, no MessagePort round-trip
      var triggerTime = performance.now();
      var w = Atomics.load(this.ring.header, 0);
      var next = (w + 1) % RING_CAPACITY;
      var r = Atomics.load(this.ring.header, 1);
      if (next !== r) {
        var offset = w * RING_FLOATS_PER_CMD;
        this.ring.data[offset]     = sampleIndex;
        this.ring.data[offset + 1] = velocity;
        this.ring.data[offset + 2] = pitchRatio;
        Atomics.store(this.ring.header, 0, next);
      }
      // For jitter measurement: record send time, receive = next process() cycle
      this._latencyLog.push({ triggerTime: triggerTime, receiveTime: null });
      if (this._latencyLog.length > this._maxLog) {
        this._latencyLog.shift();
      }
    } else {
      // MessagePort fallback
      var triggerTime = performance.now();
      this.node.port.postMessage({
        type: 'noteOn',
        sampleIndex: sampleIndex,
        velocity: velocity,
        pitchRatio: pitchRatio,
        triggerTime: triggerTime
      });
      this._latencyLog.push({ triggerTime: triggerTime, receiveTime: null });
      if (this._latencyLog.length > this._maxLog) {
        this._latencyLog.shift();
      }
    }
  },

  // --- Jitter measurement ---

  _recordLatency: function(triggerTime, processTime) {
    for (var i = PadDawEngine._latencyLog.length - 1; i >= 0; i--) {
      if (PadDawEngine._latencyLog[i].triggerTime === triggerTime) {
        PadDawEngine._latencyLog[i].receiveTime = processTime;
        break;
      }
    }
  },

  getJitterStats: function() {
    var deltas = [];
    for (var i = 0; i < this._latencyLog.length; i++) {
      var e = this._latencyLog[i];
      if (e.receiveTime !== null) {
        deltas.push(e.receiveTime - e.triggerTime);
      }
    }
    if (deltas.length === 0) return null;

    var sum = 0;
    var max = deltas[0];
    var min = deltas[0];
    for (var i = 0; i < deltas.length; i++) {
      sum += deltas[i];
      if (deltas[i] > max) max = deltas[i];
      if (deltas[i] < min) min = deltas[i];
    }
    return {
      avg: sum / deltas.length,
      max: max,
      min: min,
      jitter: max - min,
      count: deltas.length,
      mode: this.useSAB ? 'SharedArrayBuffer' : 'MessagePort'
    };
  },

  // --- Test utilities ---

  generateTestTone: function(freq, duration) {
    var sr = 48000;
    var len = (sr * duration) | 0;
    var buf = new Float32Array(len);
    var w = 2 * Math.PI * freq / sr;
    for (var i = 0; i < len; i++) {
      buf[i] = Math.sin(w * i) * 0.3;
    }
    return buf;
  }
};
