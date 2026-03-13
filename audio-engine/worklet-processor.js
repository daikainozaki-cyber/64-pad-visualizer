// PAD DAW AudioWorklet Processor
// Runs on audio thread. No imports, no GC, no new/filter/forEach in process().
// Single clock: currentSample++ only.
// Dual path: SharedArrayBuffer (SAB) or MessagePort fallback.

// --- RingBuffer constants (duplicated from ring-buffer.js, no import in worklet) ---
var RING_FLOATS_PER_CMD = 3;
var RING_CAPACITY = 64;
var RING_DATA_FLOATS = RING_CAPACITY * RING_FLOATS_PER_CMD;
var RING_HEADER_BYTES = 8;

class PadDawProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // 16 voices, SoA (Structure of Arrays) — no objects, no GC
    this.voiceActive     = new Uint8Array(16);
    this.voicePosition   = new Float64Array(16);  // float for pitchRatio interpolation
    this.voiceGain       = new Float32Array(16);
    this.voiceSampleIdx  = new Uint16Array(16);
    this.voicePitchRatio = new Float32Array(16);  // playback speed multiplier

    // Sample storage (populated via MessagePort)
    this.samples = [];
    this.sampleLengths = [];

    // Single master clock
    this.currentSample = 0;

    // Round-robin voice index for stealing
    this.nextVoice = 0;

    // SAB ring buffer (set up if processorOptions.ringBufferSab is provided)
    this.ring = null;
    if (options.processorOptions && options.processorOptions.ringBufferSab) {
      var sab = options.processorOptions.ringBufferSab;
      this.ring = {
        sab: sab,
        header: new Int32Array(sab, 0, 2),
        data: new Float32Array(sab, RING_HEADER_BYTES, RING_DATA_FLOATS)
      };
    }

    // MessagePort fallback (always available)
    this.port.onmessage = (e) => {
      var d = e.data;
      if (d.type === 'loadSamples') {
        this.samples = d.samples;
        var len = d.samples.length;
        this.sampleLengths = new Uint32Array(len);
        for (var i = 0; i < len; i++) {
          this.sampleLengths[i] = d.samples[i].length;
        }
      } else if (d.type === 'noteOn') {
        this._startVoice(d.sampleIndex, d.velocity, d.pitchRatio || 1.0);
        this.port.postMessage({
          type: 'voiceStarted',
          triggerTime: d.triggerTime
        });
      }
    };
  }

  _startVoice(sampleIndex, velocity, pitchRatio) {
    if (sampleIndex >= this.samples.length) return;

    // Find free voice
    var idx = -1;
    for (var v = 0; v < 16; v++) {
      if (!this.voiceActive[v]) { idx = v; break; }
    }
    // If all active, steal round-robin
    if (idx === -1) {
      idx = this.nextVoice;
      this.nextVoice = (this.nextVoice + 1) & 15;
    }

    this.voiceActive[idx] = 1;
    this.voicePosition[idx] = 0;
    this.voiceGain[idx] = velocity;
    this.voiceSampleIdx[idx] = sampleIndex;
    this.voicePitchRatio[idx] = pitchRatio;
  }

  process(inputs, outputs) {
    var out = outputs[0];
    var outL = out[0];
    var outR = out[1];
    if (!outL) return true;

    // Drain SAB ring buffer commands (if available)
    if (this.ring) {
      var ring = this.ring;
      var r = Atomics.load(ring.header, 1);
      var w = Atomics.load(ring.header, 0);
      var drained = 0;
      while (r !== w) {
        var offset = r * RING_FLOATS_PER_CMD;
        this._startVoice(
          ring.data[offset] | 0,
          ring.data[offset + 1],
          ring.data[offset + 2]
        );
        r = (r + 1) % RING_CAPACITY;
        drained++;
      }
      Atomics.store(ring.header, 1, r);
      // Report drain timing for jitter measurement (SAB mode)
      if (drained > 0) {
        this.port.postMessage({ type: 'sabDrained', processTime: currentTime * 1000 });
      }
    }

    var samplesReady = this.samples.length > 0;

    for (var i = 0; i < 128; i++) {
      var mix = 0;

      if (samplesReady) {
        for (var v = 0; v < 16; v++) {
          if (!this.voiceActive[v]) continue;
          var si = this.voiceSampleIdx[v];
          var pos = this.voicePosition[v];
          var len = this.sampleLengths[si];
          if (pos >= len) {
            this.voiceActive[v] = 0;
            continue;
          }
          // Linear interpolation for non-integer positions (pitchRatio != 1.0)
          var posInt = pos | 0;
          var frac = pos - posInt;
          var samp = this.samples[si];
          var s0 = samp[posInt];
          var s1 = posInt + 1 < len ? samp[posInt + 1] : 0;
          mix += (s0 + (s1 - s0) * frac) * this.voiceGain[v];
          this.voicePosition[v] = pos + this.voicePitchRatio[v];
        }
      }

      outL[i] = mix;
      if (outR) outR[i] = mix;

      this.currentSample++;
    }

    return true;
  }
}

registerProcessor('pad-daw-processor', PadDawProcessor);
