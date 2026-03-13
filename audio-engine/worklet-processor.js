// PAD DAW AudioWorklet Processor
// Runs on audio thread. No imports, no GC, no new/filter/forEach in process().
// Single clock: currentSample++ only.

class PadDawProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // 16 voices, SoA (Structure of Arrays) — no objects, no GC
    this.voiceActive    = new Uint8Array(16);
    this.voicePosition  = new Uint32Array(16);
    this.voiceGain      = new Float32Array(16);
    this.voiceSampleIdx = new Uint16Array(16);

    // Sample storage (populated via MessagePort)
    // Initially empty arrays; replaced with typed arrays on loadSamples
    this.samples = [];              // → Float32Array[] after load
    this.sampleLengths = [];        // → Uint32Array after load

    // Single master clock
    this.currentSample = 0;

    // Round-robin voice index for stealing
    this.nextVoice = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'loadSamples') {
        this.samples = d.samples;
        // Pre-compute lengths to avoid .length access in process()
        const len = d.samples.length;
        this.sampleLengths = new Uint32Array(len);
        for (let i = 0; i < len; i++) {
          this.sampleLengths[i] = d.samples[i].length;
        }
      } else if (d.type === 'noteOn') {
        this._startVoice(d.sampleIndex, d.velocity);
        // Echo triggerTime back — main thread measures round-trip with performance.now()
        this.port.postMessage({
          type: 'voiceStarted',
          triggerTime: d.triggerTime
        });
      }
    };
  }

  _startVoice(sampleIndex, velocity) {
    if (sampleIndex >= this.samples.length) return;

    // Find free voice
    let idx = -1;
    for (let v = 0; v < 16; v++) {
      if (!this.voiceActive[v]) { idx = v; break; }
    }
    // If all active, steal round-robin
    if (idx === -1) {
      idx = this.nextVoice;
      this.nextVoice = (this.nextVoice + 1) & 15; // % 16 via bitmask
    }

    this.voiceActive[idx] = 1;
    this.voicePosition[idx] = 0;
    this.voiceGain[idx] = velocity;
    this.voiceSampleIdx[idx] = sampleIndex;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const outL = out[0];
    const outR = out[1];
    if (!outL) return true;

    const samplesReady = this.samples.length > 0;

    for (let i = 0; i < 128; i++) {
      let mix = 0;

      if (samplesReady) {
        for (let v = 0; v < 16; v++) {
          if (!this.voiceActive[v]) continue;
          const si = this.voiceSampleIdx[v];
          const pos = this.voicePosition[v];
          if (pos >= this.sampleLengths[si]) {
            this.voiceActive[v] = 0;
            continue;
          }
          mix += this.samples[si][pos] * this.voiceGain[v];
          this.voicePosition[v] = pos + 1;
        }
      }

      outL[i] = mix;
      if (outR) outR[i] = mix; // mono for now

      this.currentSample++;
    }

    return true;
  }
}

registerProcessor('pad-daw-processor', PadDawProcessor);
