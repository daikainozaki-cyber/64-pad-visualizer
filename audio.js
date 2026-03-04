// ========================================
// AUDIO ENGINE — REMOVED (2026-03-04)
// 64 Pad Explorer is a visualization tool, not an instrument.
// Sound engine removed to eliminate loading lag.
// This file provides no-op stubs for functions still referenced elsewhere.
// ========================================

// Desktop detection (used by builder.js for WebMIDI, theory.js for octave sync)
const _isDesktop = typeof window.__JUCE__ !== 'undefined';
let _useNativeAudio = false;
let _soundMuted = true;

// No-op audio context stub (needed by some callers)
function ensureAudioResumed() {}
function getAudioCtx() { return null; }

// No-op sound engine stubs
const AudioState = { engineKey: '', engine: null, presetKey: '', instrument: null };
function setEngine() {}
function setPreset() {}
function saveSoundSettings() {}
function loadSoundSettings() {}
function renderSoundControls() {}

// Voice management — Desktop routes through C++ native bridge
function noteOn(midi, vel) {
    if (_isDesktop && window.__JUCE__) {
        window.__JUCE__._callNative("noteOn")(midi, vel || 0.5);
    }
}
function noteOff(midi) {
    if (_isDesktop && window.__JUCE__) {
        window.__JUCE__._callNative("noteOff")(midi);
    }
}
function noteOffAll() {
    if (_isDesktop && window.__JUCE__) {
        window.__JUCE__._callNative("allNotesOff")();
    }
}
function playMidiNotes(notes, velocity) {
    if (!notes || !notes.length) return;
    noteOffAll();
    for (var i = 0; i < notes.length; i++) {
        noteOn(notes[i], velocity || 0.5);
    }
}
function toggleSoundMute() {}

// Velocity curve (still needed for MIDI input in builder.js)
function applyVelocityCurve(velocity127) {
  const { velThreshold, velDrive, velCompand, velRange } = AppState;
  if (velocity127 <= velThreshold) return 0;
  let x = (velocity127 - velThreshold) / (127 - velThreshold);
  const exp = Math.pow(2, -velDrive / 32);
  x = Math.pow(x, exp);
  if (velCompand !== 0) {
    const c = velCompand / 64;
    if (c > 0) {
      x = x + c * (0.7 - x) * x * 2;
    } else {
      const a = -c;
      x = x < 0.5
        ? 0.5 * Math.pow(2 * x, 1 + a * 2)
        : 1 - 0.5 * Math.pow(2 * (1 - x), 1 + a * 2);
    }
  }
  return Math.min(1, Math.max(0, x)) * (velRange / 127);
}

function drawVelocityCurve() {}
function syncVelocityToDesktop() {
  if (_isDesktop) {
    window.__JUCE__._callNative("setVelocityParams")(
      AppState.velThreshold, AppState.velDrive, AppState.velCompand, AppState.velRange
    );
  }
}

// Desktop plugin callback (C++ calls this)
function _setDesktopPlugin(hasPlugin) {
  _useNativeAudio = hasPlugin;
}

function _initDesktopSoundMode() {
  if (!_isDesktop) return;
  _useNativeAudio = true;
  // Hide header links (paid product — no promotional links, keep Help/About only)
  var headerLinks = document.getElementById('header-links');
  if (headerLinks) headerLinks.style.display = 'none';
}

// Global held-note tracking (used by render.js pad interaction)
let _heldMidi = null;
let _heldTouchMidi = null;
document.addEventListener('mouseup', () => { _heldMidi = null; });
document.addEventListener('touchend', () => { _heldTouchMidi = null; });
document.addEventListener('touchcancel', () => { _heldTouchMidi = null; });
window.addEventListener('blur', () => { _heldMidi = null; _heldTouchMidi = null; });

// Initialize on ready
onReady(() => {
  // Hide CHS export on production (reverse-engineered Chordcat format — dev only)
  if (!IS_DEV) {
    ['btn-chs-export-plain', 'btn-chs-export-mem', 'btn-chs-import'].forEach(function(id) { var b = document.getElementById(id); if (b) b.style.display = 'none'; });
  }
  _initDesktopSoundMode();
});
