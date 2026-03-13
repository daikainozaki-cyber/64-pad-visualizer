// PAD DAW AudioWorklet Processor
// Runs on audio thread. No imports, no GC, no new/filter/forEach in process().
// Single clock: currentSample++ only.
// Dual path: SharedArrayBuffer (SAB) or MessagePort fallback.
// Phase 3: 8 tracks × 16 voices = 128 voices, stereo pan, volume, mute.

// --- RingBuffer constants (duplicated from ring-buffer.js, no import in worklet) ---
var RING_FLOATS_PER_CMD = 4;
var RING_CAPACITY = 64;
var RING_DATA_FLOATS = RING_CAPACITY * RING_FLOATS_PER_CMD;
var RING_HEADER_BYTES = 8;

// --- Sequence constants ---
var MAX_EVENTS = 4096;
var STATE_STOPPED = 0;
var STATE_PLAYING = 1;

// --- Track constants ---
var NUM_TRACKS = 8;
var VOICES_PER_TRACK = 16;
var TOTAL_VOICES = NUM_TRACKS * VOICES_PER_TRACK; // 128

class PadDawProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // 128 voices (8 tracks × 16), SoA (Structure of Arrays) — no objects, no GC
    this.voiceActive     = new Uint8Array(TOTAL_VOICES);
    this.voicePosition   = new Float64Array(TOTAL_VOICES);  // float for pitchRatio interpolation
    this.voiceGain       = new Float32Array(TOTAL_VOICES);
    this.voiceSampleIdx  = new Uint16Array(TOTAL_VOICES);
    this.voicePitchRatio = new Float32Array(TOTAL_VOICES);  // playback speed multiplier

    // Track parameters
    this.trackVolume = new Float32Array(NUM_TRACKS);
    this.trackPan    = new Float32Array(NUM_TRACKS);   // -1.0 (L) to 1.0 (R), 0.0 = center
    this.trackMuted  = new Uint8Array(NUM_TRACKS);     // 0 = not muted, 1 = muted

    // Initialize trackVolume to 1.0 (Float32Array defaults to 0.0 = silence)
    for (var t = 0; t < NUM_TRACKS; t++) this.trackVolume[t] = 1.0;

    // Per-track round-robin voice stealing index
    this.nextVoice = new Uint8Array(NUM_TRACKS);

    // Sample storage (populated via MessagePort)
    this.samples = [];
    this.sampleLengths = [];

    // Single master clock
    this.currentSample = 0;

    // Sequence event SoA (populated via loadSequence, read in process())
    this.evStartSample = new Uint32Array(MAX_EVENTS);
    this.evSampleIndex = new Uint16Array(MAX_EVENTS);
    this.evVelocity = new Float32Array(MAX_EVENTS);
    this.evPitchRatio = new Float32Array(MAX_EVENTS);
    this.evTrack = new Uint8Array(MAX_EVENTS);
    this.eventCount = 0;
    this.eventIndex = 0;

    // Playback state (separate from currentSample — PAD input keeps running)
    this.playState = STATE_STOPPED;
    this.schedulerSample = 0;

    // Loop
    this.loopEnabled = false;
    this.loopEndSample = 0;

    // Auto-stop: last event + 1 second
    this.sequenceEndSample = 0;

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
        this._startVoice(d.track || 0, d.sampleIndex, d.velocity, d.pitchRatio || 1.0);
        this.port.postMessage({
          type: 'voiceStarted',
          triggerTime: d.triggerTime
        });
      } else if (d.type === 'loadSequence') {
        var count = d.count;
        if (count > MAX_EVENTS) count = MAX_EVENTS;
        for (var j = 0; j < count; j++) {
          this.evStartSample[j] = d.startSamples[j];
          this.evSampleIndex[j] = d.sampleIndices[j];
          this.evVelocity[j] = d.velocities[j];
          this.evPitchRatio[j] = d.pitchRatios[j];
          this.evTrack[j] = d.tracks ? d.tracks[j] : 0;
        }
        this.eventCount = count;
        this.eventIndex = 0;
        this.schedulerSample = 0;
        this.playState = STATE_STOPPED;
        this.loopEndSample = d.loopEndSample || 0;
        this.loopEnabled = d.loopEndSample > 0;
        this.sequenceEndSample = count > 0 ? d.startSamples[count - 1] + 48000 : 0;
      } else if (d.type === 'play') {
        this.playState = STATE_PLAYING;
        this.schedulerSample = 0;
        this.eventIndex = 0;
      } else if (d.type === 'stop') {
        this.playState = STATE_STOPPED;
        this.schedulerSample = 0;
        this.eventIndex = 0;
      } else if (d.type === 'setTrackVolume') {
        this.trackVolume[d.track] = d.volume;
      } else if (d.type === 'setTrackPan') {
        this.trackPan[d.track] = d.pan;
      } else if (d.type === 'updateMute') {
        // Bulk copy mute state (solo calculation done on UI side)
        var muteArr = d.muted;
        for (var m = 0; m < NUM_TRACKS; m++) {
          this.trackMuted[m] = muteArr[m] || 0;
        }
      }
    };
  }

  _startVoice(track, sampleIndex, velocity, pitchRatio) {
    if (sampleIndex >= this.samples.length) return;
    if (track >= NUM_TRACKS) track = 0;

    // Search within track's voice range: [base, base+16)
    var base = track * VOICES_PER_TRACK;
    var idx = -1;
    for (var v = 0; v < VOICES_PER_TRACK; v++) {
      if (!this.voiceActive[base + v]) { idx = base + v; break; }
    }
    // If all active in this track, steal round-robin within track
    if (idx === -1) {
      idx = base + this.nextVoice[track];
      this.nextVoice[track] = (this.nextVoice[track] + 1) & 15;
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
          ring.data[offset + 1] | 0,
          ring.data[offset + 2],
          ring.data[offset + 3]
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
      // Scheduled events: sample-accurate trigger (only when playing)
      if (this.playState === STATE_PLAYING && samplesReady) {
        while (this.eventIndex < this.eventCount &&
               this.evStartSample[this.eventIndex] <= this.schedulerSample) {
          this._startVoice(
            this.evTrack[this.eventIndex],
            this.evSampleIndex[this.eventIndex],
            this.evVelocity[this.eventIndex],
            this.evPitchRatio[this.eventIndex]
          );
          this.eventIndex++;
        }
      }

      var mixL = 0;
      var mixR = 0;

      if (samplesReady) {
        for (var t = 0; t < NUM_TRACKS; t++) {
          if (this.trackMuted[t]) continue;
          var trackSample = 0;
          var base = t * VOICES_PER_TRACK;
          for (var v = 0; v < VOICES_PER_TRACK; v++) {
            var idx = base + v;
            if (!this.voiceActive[idx]) continue;
            var si = this.voiceSampleIdx[idx];
            var pos = this.voicePosition[idx];
            var len = this.sampleLengths[si];
            if (pos >= len) {
              this.voiceActive[idx] = 0;
              continue;
            }
            // Linear interpolation for non-integer positions (pitchRatio != 1.0)
            var posInt = pos | 0;
            var frac = pos - posInt;
            var samp = this.samples[si];
            var s0 = samp[posInt];
            var s1 = posInt + 1 < len ? samp[posInt + 1] : 0;
            trackSample += (s0 + (s1 - s0) * frac) * this.voiceGain[idx];
            this.voicePosition[idx] = pos + this.voicePitchRatio[idx];
          }
          // Equal-power pan law: cos/sin mapping
          // pan: -1.0 = full left, 0.0 = center, 1.0 = full right
          var vol = this.trackVolume[t];
          var p = this.trackPan[t];
          var angle = (p + 1) * 0.25 * Math.PI; // 0 to PI/2
          mixL += trackSample * vol * Math.cos(angle);
          mixR += trackSample * vol * Math.sin(angle);
        }
      }

      outL[i] = mixL;
      if (outR) outR[i] = mixR;

      this.currentSample++;

      // Advance scheduler (only when playing)
      if (this.playState === STATE_PLAYING) {
        this.schedulerSample++;
        // Loop reset
        if (this.loopEnabled && this.schedulerSample >= this.loopEndSample) {
          this.schedulerSample = 0;
          this.eventIndex = 0;
        }
        // Auto-stop (no loop): stop after last event + 1 second
        else if (!this.loopEnabled && this.schedulerSample >= this.sequenceEndSample) {
          this.playState = STATE_STOPPED;
          this.port.postMessage({ type: 'playbackEnd' });
        }
      }
    }

    return true;
  }
}

registerProcessor('pad-daw-processor', PadDawProcessor);
