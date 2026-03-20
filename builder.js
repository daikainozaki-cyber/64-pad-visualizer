// ========================================
// MODE & UI CONTROLS
// ========================================

// pad-core builder-ui module references (set during init)
var _rootPianoUI = null;    // padBuildPianoKeyboard return
var _onchordPianoUI = null; // padBuildPianoKeyboard return (on-chord bass)
var _qualityUI = null;      // padBuildQualityGrid return
var _tensionUI = null;      // padBuildTensionGrid return
function setMode(mode) {
  // Plain → Chord: transfer detected chord to builder
  if (mode === 'chord' && AppState.mode === 'input' && PlainState.activeNotes.size >= 2) {
    if (transferToChordMode()) return; // transferToChordMode handles everything
  }
  AppState.mode = mode;
  document.getElementById('mode-scale').classList.toggle('active', mode === 'scale');
  document.getElementById('mode-chord').classList.toggle('active', mode === 'chord');
  document.getElementById('mode-input').classList.toggle('active', mode === 'input');
  document.getElementById('scale-panel').style.display = mode === 'scale' ? '' : 'none';
  document.getElementById('chord-panel').style.display = mode === 'chord' ? '' : 'none';
  document.getElementById('input-panel').style.display = mode === 'input' ? '' : 'none';
  // Scale: full key rows. Chord: compact key btn. Input: hidden
  document.getElementById('key-rows').style.display = mode === 'scale' ? '' : 'none';
  document.getElementById('key-label').style.display = mode === 'scale' ? '' : 'none';
  var showKey = mode === 'chord';
  if (showKey) {
    try { var ss = JSON.parse(localStorage.getItem('64pad-sections') || '{}'); if (ss.key === false) showKey = false; } catch(_) {}
  }
  document.getElementById('chord-key-row').style.display = showKey ? '' : 'none';
  var sectKeyBtn = document.getElementById('sect-key');
  if (sectKeyBtn) sectKeyBtn.classList.toggle('active', showKey);
  if (mode === 'chord') { updateChordKeyDisplay(); }
  // chord-key-row visibility handled above
  if (mode === 'chord' && BuilderState.step === 0) {
    setBuilderStep(1);
  }
  updateKeyButtons();
  // モード切替時にスロット選択を解除
  PlainState.currentSlot = null;
  updateMemorySlotUI();
  if (mode === 'input') {
    PlainState.subMode = 'idle';
    updatePlainUI();
    updatePlainDisplay();
  }
  render();
  saveAppSettings();
}

// ======== SCALE MODE INIT ========
// Cycle of 4ths order (educational)
var FOURTHS_ORDER = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]; // C,F,Bb,Eb,Ab,Db,Gb,B,E,A,D,G
var FOURTHS_MAJOR_NAMES = ['C','F','Bb','Eb','Ab','Db','Gb','B','E','A','D','G'];
var FOURTHS_MINOR_NAMES = ['Am','Dm','Gm','Cm','Fm','Bbm','Ebm','Abm','C#m','F#m','Bm','Em'];

function initKeyButtons() {
  var majorRow = document.getElementById('key-row-major');
  var minorRow = document.getElementById('key-row-minor');
  if (!majorRow || !minorRow) return;
  // Major keys (cycle of 4ths)
  FOURTHS_ORDER.forEach(function(pc, i) {
    var btn = document.createElement('button');
    btn.className = 'key-btn';
    btn.textContent = FOURTHS_MAJOR_NAMES[i];
    btn.dataset.pc = pc;
    btn.onclick = function() {
      AppState.key = pc;
      AppState.scaleIdx = 0;
      onKeyChanged();
    };
    majorRow.appendChild(btn);
  });
  // Minor keys (cycle of 4ths, relative minor)
  FOURTHS_ORDER.forEach(function(pc, i) {
    var minorPC = (pc + 9) % 12; // relative minor
    var btn = document.createElement('button');
    btn.className = 'key-btn';
    btn.textContent = FOURTHS_MINOR_NAMES[i];
    btn.dataset.pc = minorPC;
    btn.onclick = function() {
      AppState.key = minorPC;
      AppState.scaleIdx = 5;
      onKeyChanged();
    };
    minorRow.appendChild(btn);
  });
  updateKeyButtons();
}
function onKeyChanged() {
  updateKeyButtons();
  var sel = document.getElementById('scale-select');
  if (sel) sel.value = AppState.scaleIdx;
  renderDiatonicBar();
  updateChordKeyDisplay();
  render();
  saveAppSettings();
}
function setScaleKeyMode(mode) {
  if (mode === 'major' && AppState.scaleIdx === 5) {
    AppState.key = (AppState.key + 3) % 12;
    AppState.scaleIdx = 0;
  } else if (mode === 'minor' && AppState.scaleIdx === 0) {
    AppState.key = (AppState.key + 9) % 12;
    AppState.scaleIdx = 5;
  }
  updateKeyButtons();
  updateScaleKeyDisplay();
  var sel = document.getElementById('scale-select');
  if (sel) sel.value = AppState.scaleIdx;
  renderDiatonicBar();
  render();
  saveAppSettings();
}
function updateScaleKeyDisplay() {
  var names = ['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'];
  var isMajor = AppState.scaleIdx !== 5;
  var majorKey = isMajor ? AppState.key : (AppState.key + 3) % 12;
  var minorKey = isMajor ? (AppState.key + 9) % 12 : AppState.key;
  var majBtn = document.getElementById('key-mode-major');
  var minBtn = document.getElementById('key-mode-minor');
  if (majBtn) { majBtn.textContent = names[majorKey]; majBtn.classList.toggle('active', isMajor); }
  if (minBtn) { minBtn.textContent = names[minorKey] + 'm'; minBtn.classList.toggle('active', !isMajor); }
}

function updateKeyButtons() {
  var isInput = AppState.mode === 'input';
  var isMajor = AppState.scaleIdx !== 5;
  document.querySelectorAll('#key-row-major .key-btn').forEach(function(btn) {
    var pc = parseInt(btn.dataset.pc);
    btn.classList.toggle('active', isMajor && pc === AppState.key);
  });
  document.querySelectorAll('#key-row-minor .key-btn').forEach(function(btn) {
    var pc = parseInt(btn.dataset.pc);
    btn.classList.toggle('active', !isMajor && pc === AppState.key);
  });
}

function initScaleSelect() {
  const sel = document.getElementById('scale-select');
  const groups = {
    '○ Diatonic': SCALES.filter(s => s.cat === '○'),
    '■ Harmonic Minor': SCALES.filter(s => s.cat === '■'),
    '◆ Melodic Minor': SCALES.filter(s => s.cat === '◆'),
    '♪ Bebop': SCALES.filter(s => s.cat === '♪'),
    'Other': SCALES.filter(s => s.cat === '' && !s.name.startsWith('Bebop')),
  };
  for (const [gn, scales] of Object.entries(groups)) {
    const og = document.createElement('optgroup');
    og.label = gn;
    scales.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = (s.cat && s.num ? s.cat + s.num + ' ' : '') + s.name;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }
  sel.onchange = () => { AppState.scaleIdx = parseInt(sel.value); render(); saveAppSettings(); };
}

// ======== TRIAD → TETRAD PROMOTION ========
const TRIAD_PROMOTE_MAP = {
  '0,4,7': [{label:'7', targetName:'7'}, {label:'\u25B37', targetName:'\u25B37'}],
  '0,3,7': [{label:'7', targetName:'m7'}, {label:'\u25B37', targetName:'m\u25B37'}],
  '0,3,6': [{label:'7', targetName:'m7(b5)'}, {label:'dim7', targetName:'dim7'}],
};

function showTriadPromoteBar(quality) {
  hideTriadPromoteBar();
  const key = [...quality.pcs].sort((a, b) => a - b).join(',');
  const options = TRIAD_PROMOTE_MAP[key];
  if (!options) return;

  const bar = document.createElement('div');
  bar.id = 'triad-promote-bar';
  bar.className = 'triad-promote-bar';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'tension-btn promote-btn';
    btn.textContent = opt.label;
    btn.onclick = () => promoteTriadTo7th(opt.targetName);
    bar.appendChild(btn);
  });
  const step2 = document.getElementById('step2');
  step2.insertBefore(bar, step2.firstChild);
}

function hideTriadPromoteBar() {
  const existing = document.getElementById('triad-promote-bar');
  if (existing) existing.remove();
}

function promoteTriadTo7th(targetName) {
  for (const row of BUILDER_QUALITIES) {
    for (const q of row) {
      if (q && q.name === targetName) {
        selectQuality(q);
        return;
      }
    }
  }
}

// ======== CHORD BUILDER ========
function setBuilderStep(step) {
  BuilderState.step = step;
  // Quality and Tension share the same fixed-height container
  var tensionVisible = step === 2;
  document.getElementById('step1').style.display = tensionVisible ? 'none' : '';
  document.getElementById('step2').style.display = tensionVisible ? '' : 'none';
  // Update toggle button text to reflect current step
  var sectBtn = document.getElementById('sect-quality');
  if (sectBtn) sectBtn.textContent = tensionVisible ? 'Tension' : 'Quality';
  // Scroll container to top on step change
  var container = document.getElementById('step-container');
  if (container) container.scrollTop = 0;
  document.getElementById('btn-next').style.display = 'none';
  updateChordDisplay();
}

// ======== SWIPE NAVIGATION (Step 1 ↔ Step 2) ========
(function initSwipe() {
  let _sx = 0, _sy = 0;
  const MIN_DX = 50; // minimum horizontal distance
  const MAX_DY_RATIO = 0.7; // max vertical/horizontal ratio (prevent diagonal)

  function onTouchStart(e) { _sx = e.touches[0].clientX; _sy = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - _sx;
    const dy = Math.abs(e.changedTouches[0].clientY - _sy);
    if (Math.abs(dx) < MIN_DX || dy / Math.abs(dx) > MAX_DY_RATIO) return;
    if (dx < 0 && BuilderState.step === 1 && BuilderState.quality) {
      // Swipe left → Tension
      setBuilderStep(2);
    } else if (dx > 0 && BuilderState.step === 2) {
      // Swipe right → Root + Quality
      setBuilderStep(1);
    }
  }

  onReady(() => {
    const sc = document.querySelector('.step-container');
    if (!sc) return;
    sc.addEventListener('touchstart', onTouchStart, { passive: true });
    sc.addEventListener('touchend', onTouchEnd, { passive: true });
  });
})();

function updateChordDisplay() {
  const nameEl = document.getElementById('chord-name');
  nameEl.textContent = getBuilderChordName() || '—';
  // Auto bass from voicing (inversion/drop) when no explicit on-chord bass
  let displayBass = BuilderState.bass;
  if (displayBass === null && BuilderState.root !== null && BuilderState.quality) {
    const chordPCS = getBuilderPCS();
    if (chordPCS && chordPCS.length >= 3 && !VoicingState.shell) {
      if (VoicingState.inversion > 0 || VoicingState.drop) {
        const inv = Math.min(VoicingState.inversion, chordPCS.length - 1);
        const result = calcVoicingOffsets(chordPCS, inv, VoicingState.drop);
        const bassAbsPC = ((BuilderState.root + result.bassInterval) % 12 + 12) % 12;
        if (bassAbsPC !== BuilderState.root) displayBass = bassAbsPC;
      }
    }
  }
  document.getElementById('chord-bass').textContent = displayBass !== null ? pcName(displayBass) : '';
  // Voicing info label (inversion only — shell/drop/omit shown on voicing buttons)
  var invLabel = '';
  if (BuilderState.root !== null && BuilderState.quality && !VoicingState.shell && VoicingState.inversion > 0) {
    invLabel = t('help.inv_' + VoicingState.inversion);
  }
  document.getElementById('chord-voicing-info').textContent = invLabel;
}

function builderClear() {
  if (TastyState.enabled) { TastyState.enabled = false; TastyState.currentIndex = -1; updateTastyUI(); }
  BuilderState.root = null; BuilderState.quality = null; BuilderState.tension = null; BuilderState.bass = null;
  BuilderState.bassInputMode = false;
  BuilderState._fromDiatonic = false;
  BuilderState._diatonicScaleIdx = undefined;
  document.getElementById('step-label').style.background = '';
  setBuilderStep(1);
  updateKeyButtons();
  updateRootButtons();
  clearQualitySelection();
  clearTensionSelection();
  clearInstrumentInput();
  render();
}

function builderBack() {
  if (BuilderState.bassInputMode) {
    BuilderState.bassInputMode = false;
    if (BuilderState.quality) setBuilderStep(2);
    else setBuilderStep(1);
    render();
    return;
  }
  if (BuilderState.step === 2) {
    BuilderState.tension = null;
    clearTensionSelection();
    setBuilderStep(1);
  } else if (BuilderState.step === 1) {
    if (BuilderState.quality) {
      BuilderState.quality = null;
      clearQualitySelection();
      setBuilderStep(1);
    } else if (BuilderState.root !== null) {
      BuilderState.root = null;
      updateKeyButtons();
      setBuilderStep(1);
    }
  }
  render();
}

function builderNext() {
  // No longer used in 2-step design (on-chord handled by / button)
}

function selectRoot(pc) {
  if (TastyState.enabled) disableTasty();
  if (StockState.enabled) disableStock();
  if (BuilderState.bassInputMode) {
    // In bass input mode, set bass note instead of root
    BuilderState.bass = pc;
    BuilderState.bassInputMode = false;
    if (BuilderState.quality) { setBuilderStep(2); }
    else { setBuilderStep(1); }
    updateKeyButtons();
    updateChordDisplay();
    render();
    return;
  }
  BuilderState.root = pc;
  BuilderState.quality = null; BuilderState.tension = null; BuilderState.bass = null;
  BuilderState._fromDiatonic = false;
  BuilderState._diatonicScaleIdx = undefined;
  resetVoicingSelection();
  updateKeyButtons();
  updateRootButtons();
  clearQualitySelection();
  clearTensionSelection();
  setBuilderStep(1);
  render();
}

function selectQuality(q) {
  if (TastyState.enabled) disableTasty();
  if (StockState.enabled) disableStock();
  BuilderState.quality = q;
  BuilderState.tension = null;
  resetVoicingSelection();
  highlightQuality(q);
  updateControlsForQuality(q);
  setBuilderStep(2); // Go to Tension
  render();
  updateTastyUI();
  playCurrentChord();
}

function selectTension(t, el) {
  if (TastyState.enabled) disableTasty();
  if (StockState.enabled) disableStock();
  if (BuilderState.tension && BuilderState.tension.label === t.label) {
    BuilderState.tension = null;
    clearTensionSelection();
  } else {
    BuilderState.tension = t;
    clearTensionSelection();
    el.classList.add('selected');
  }
  resetVoicingSelection();
  updateChordDisplay();
  render();
  playCurrentChord();
}

function startOnChord() {
  if (!BuilderState.quality && BuilderState.root === null) return;
  // Toggle bass input mode using the root piano keyboard
  BuilderState.bassInputMode = !BuilderState.bassInputMode;
  if (BuilderState.bassInputMode) {
    if (BuilderState.step !== 1) setBuilderStep(1);
    document.getElementById('step-label').textContent = t('builder.step_bass');
    document.getElementById('step-label').style.background = '#666';
  } else {
    if (BuilderState.quality) setBuilderStep(2);
    else setBuilderStep(1);
  }
}

function selectBass(pc) {
  BuilderState.bass = pc;
  highlightPianoKey('onchord-keyboard', pc);
  updateChordDisplay();
  render();
}

// ======== PIANO KEYBOARD (delegated to pad-core/builder-ui.js) ========
// Backward-compatible wrapper: plain.js etc. still call highlightPianoKey()
function highlightPianoKey(containerId, pc) {
  if (containerId === 'onchord-keyboard' && _onchordPianoUI) {
    _onchordPianoUI.highlight(pc);
  }
}

// ======== CHORD KEY PICKER (5th-circle order) ========
var FIFTHS_ORDER = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // C,G,D,A,E,B,F#,C#,Ab,Eb,Bb,F
var KEY_NAMES = ['C','G','D','A','E','B','F#/Gb','C#/Db','G#/Ab','D#/Eb','A#/Bb','F'];
function initChordKeyPicker() {
  var picker = document.getElementById('chord-key-picker');
  if (!picker) return;
  picker.innerHTML = '';
  // Major row
  var majLabel = document.createElement('div');
  majLabel.className = 'key-row-label';
  majLabel.textContent = 'Major';
  picker.appendChild(majLabel);
  var majRow = document.createElement('div');
  majRow.className = 'key-row-btns';
  FOURTHS_ORDER.forEach(function(pc, i) {
    var btn = document.createElement('button');
    btn.textContent = FOURTHS_MAJOR_NAMES[i];
    btn.dataset.pc = pc;
    btn.dataset.keyType = 'major';
    btn.onclick = function() {
      AppState.key = pc; AppState.scaleIdx = 0;
      updateKeyButtons(); renderDiatonicBar(); updateChordKeyDisplay();
      picker.style.display = 'none'; render(); saveAppSettings();
    };
    majRow.appendChild(btn);
  });
  picker.appendChild(majRow);
  // Minor row
  var minLabel = document.createElement('div');
  minLabel.className = 'key-row-label';
  minLabel.textContent = 'Minor';
  picker.appendChild(minLabel);
  var minRow = document.createElement('div');
  minRow.className = 'key-row-btns';
  FOURTHS_ORDER.forEach(function(pc, i) {
    var minorPC = (pc + 9) % 12;
    var btn = document.createElement('button');
    btn.textContent = FOURTHS_MINOR_NAMES[i];
    btn.dataset.pc = minorPC;
    btn.dataset.keyType = 'minor';
    btn.onclick = function() {
      AppState.key = minorPC; AppState.scaleIdx = 5;
      updateKeyButtons(); renderDiatonicBar(); updateChordKeyDisplay();
      picker.style.display = 'none'; render(); saveAppSettings();
    };
    minRow.appendChild(btn);
  });
  picker.appendChild(minRow);
}
function setChordKey(mode) {
  if (mode === 'major') {
    // Switch to major: if currently minor, convert back
    var majorKey = AppState.scaleIdx === 5 ? (AppState.key + 3) % 12 : AppState.key;
    AppState.key = majorKey;
    AppState.scaleIdx = 0; // Ionian
  } else {
    // Switch to minor: relative minor
    var minorKey = AppState.scaleIdx === 0 ? (AppState.key + 9) % 12 : AppState.key;
    AppState.key = minorKey;
    AppState.scaleIdx = 5; // Aeolian
  }
  updateKeyButtons();
  renderDiatonicBar();
  updateChordKeyDisplay();
  render();
  saveAppSettings();
}
function toggleChordKeyPicker() {
  var picker = document.getElementById('chord-key-picker');
  if (!picker) return;
  picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
  updateChordKeyDisplay();
}
function updateChordKeyDisplay() {
  var names = ['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'];
  var isMajor = AppState.scaleIdx === 0;
  var majorKey = isMajor ? AppState.key : (AppState.key + 3) % 12;
  var minorKey = isMajor ? (AppState.key + 9) % 12 : AppState.key;
  var majBtn = document.getElementById('chord-key-major');
  var minBtn = document.getElementById('chord-key-minor');
  if (majBtn) { majBtn.textContent = names[majorKey]; majBtn.classList.toggle('active', isMajor); }
  if (minBtn) { minBtn.textContent = names[minorKey] + 'm'; minBtn.classList.toggle('active', !isMajor); }
  var picker = document.getElementById('chord-key-picker');
  if (picker) {
    picker.querySelectorAll('button').forEach(function(b) {
      var pc = parseInt(b.dataset.pc);
      if (b.dataset.keyType === 'minor') {
        b.classList.toggle('selected', pc === minorKey);
      } else {
        b.classList.toggle('selected', pc === majorKey);
      }
    });
  }
}

// ======== ROOT GRID (12-note selector inside Chord Builder) ========
var _rootUseFlats = false;
try { _rootUseFlats = localStorage.getItem('64pad-root-flats') === '1'; } catch(_) {}

function getRootLabels() {
  return _rootUseFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
}
function toggleRootNotation() {
  _rootUseFlats = !_rootUseFlats;
  try { localStorage.setItem('64pad-root-flats', _rootUseFlats ? '1' : '0'); } catch(_) {}
  updateRootLabels();
  var tog = document.getElementById('root-notation-toggle');
  if (tog) tog.textContent = _rootUseFlats ? '\u266D' : '\u266F';
}
function updateRootLabels() {
  var labels = getRootLabels();
  var btns = document.querySelectorAll('#root-grid .root-btn');
  btns.forEach(function(btn) {
    btn.textContent = labels[parseInt(btn.dataset.pc)];
  });
}
function initRootGrid() {
  var grid = document.getElementById('root-grid');
  if (!grid) return;
  grid.innerHTML = '';
  var labels = getRootLabels();
  for (var i = 0; i < 12; i++) {
    var btn = document.createElement('button');
    btn.className = 'root-btn';
    btn.textContent = labels[i];
    btn.dataset.pc = i;
    btn.onclick = (function(pc) { return function() { selectRoot(pc); }; })(i);
    grid.appendChild(btn);
  }
  // Set toggle button text
  var tog = document.getElementById('root-notation-toggle');
  if (tog) tog.textContent = _rootUseFlats ? '\u266D' : '\u266F';
}
function updateRootButtons() {
  var btns = document.querySelectorAll('#root-grid .root-btn');
  btns.forEach(function(btn) {
    var pc = parseInt(btn.dataset.pc);
    btn.classList.toggle('selected', BuilderState.root === pc);
  });
}

// ======== QUALITY GRID (delegated to pad-core/builder-ui.js) ========
function initQualityGrid() {
  _qualityUI = padBuildQualityGrid(document.getElementById('quality-grid'), selectQuality);
}

function highlightQuality(q) {
  if (_qualityUI) _qualityUI.highlight(q);
}
function clearQualitySelection() {
  if (_qualityUI) _qualityUI.clear();
}

// ======== QUALITY-DEPENDENT CONTROL VISIBILITY ========
// Tension visibility logic delegated to pad-core/builder-ui.js (padUpdateTensionVisibility).
// App-specific: VoicingState reset (Category A) + Triad promote bar.
function updateControlsForQuality(quality) {
  if (!quality) return;
  var isTriad = quality.pcs.length <= 3;

  // === Category A: Voicing controls (app-specific state) ===
  document.getElementById('shell-bar').classList.toggle('hidden', isTriad);
  document.getElementById('btn-inv3').classList.toggle('hidden', isTriad);
  document.getElementById('drop-bar').classList.toggle('hidden', isTriad);

  if (isTriad) {
    if (VoicingState.shell) {
      VoicingState.shell = null;
      VoicingState.shellExtension = 0;
      VoicingState.omit5 = false;
    }
    if (VoicingState.inversion > 2) VoicingState.inversion = 0;
    if (VoicingState.drop) VoicingState.drop = null;
    updateVoicingButtons();
  }

  // === Categories B-H: Tension visibility (delegated to pad-core) ===
  var btns = document.querySelectorAll('#tension-grid .tension-btn');
  padUpdateTensionVisibility(btns, quality, padApplyTension, {
    onTriad: function(isTriadNoExt) {
      if (isTriadNoExt) {
        showTriadPromoteBar(quality);
      } else {
        hideTriadPromoteBar();
      }
    },
  });
}

// ======== TENSION GRID (delegated to pad-core/builder-ui.js) ========
function initTensionGrid() {
  _tensionUI = padBuildTensionGrid(document.getElementById('tension-grid'), function(tension, btn) {
    selectTension(tension, btn);
  });
}

function clearTensionSelection() {
  if (_tensionUI) _tensionUI.clear();
}

// ======== ON-CHORD KEYBOARD ========
function initOnChordKeyboard() {
  _onchordPianoUI = padBuildPianoKeyboard(document.getElementById('onchord-keyboard'), selectBass);
  if (BuilderState.bass !== null) _onchordPianoUI.highlight(BuilderState.bass);
}

// ========================================
// WEB MIDI & CHORD DETECTION
// ========================================
const midiActiveNotes = new Set(); // currently held MIDI notes
let midiAccess = null;

// Chord detection: delegated to pad-core (padDetectChord, CHORD_DETECT_DB, TRIAD_DETECT_DB, TETRAD_DETECT_DB)
var detectChord = padDetectChord;
var CHORD_DB = CHORD_DETECT_DB;
var TRIAD_DB = TRIAD_DETECT_DB;
var TETRAD_DB = TETRAD_DETECT_DB;

let midiDebounceTimer = null;
const MIDI_DEBOUNCE_MS = 40; // PUSHのシリアルMIDI対策: 40ms以内のノートをまとめる
let midiNoteRemap = null; // null = no remap, 'push-serial' = Push serial→4th chromatic

// Launchpad LED output (HPS exclusive — gated by ?hps URL parameter)
let midiOutput = null;       // Output port for LED Note-On
let midiOutputDAW = null;    // DAW port for SysEx (may be same as midiOutput)
let _lpOutputActive = false;
let _lpHpsUnlocked = false;  // set in main.js from ?hps
let _lpProgrammerMode = false; // true when Launchpad is in Programmer mode
let _lpDeviceByte = 0x0C;   // 0x0C = Launchpad X, 0x0D = Mini MK3
const _prevLEDState = new Array(64).fill(-1); // -1 = never sent
let _lpLEDMode = 'full'; // 'full' | 'root' | 'off'

// PUSHシリアル配列(row間8半音) → 4度クロマチック配列(row間5半音) 変換
// baseMidi() を使用: octaveShift + semitoneShift 両方反映
const PUSH_SERIAL_BASE = 36;
function pushSerialToFourths(note) {
  const idx = note - PUSH_SERIAL_BASE;
  if (idx < 0 || idx >= 64) return note; // パッド範囲外はそのまま
  const row = Math.floor(idx / 8);
  const col = idx % 8;
  return baseMidi() + row * ROW_INTERVAL + col;
}

function remapMidiNote(note) {
  if (midiNoteRemap === 'push-serial') return pushSerialToFourths(note);
  return note;
}

function onMidiNoteOn(note, velocity) {
  const mapped = remapMidiNote(note);
  // Perform mode: intercept MIDI for pad triggering
  if (handlePerformMidi(mapped)) {
    ensureAudioResumed();
    return;
  }
  // Auto-adjust octave if MIDI note is outside pad grid range
  var bm = baseMidi();
  var padHi = bm + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  if (mapped < bm || mapped > padHi) {
    var targetOct = Math.round((mapped - BASE_MIDI) / 12);
    if (setOctaveShift(targetOct)) {
      render();
      saveAppSettings();
    }
  }
  midiActiveNotes.add(mapped);
  ensureAudioResumed();
  noteOn(mapped, applyVelocityCurve(velocity || 100), true);
  // Plain mode: add to activeNotes (auto-start capture if idle)
  if (AppState.mode === 'input') {
    if (PlainState.subMode === 'idle') {
      PlainState.subMode = 'capture';
      PlainState.captureIndex = findNextEmptySlot(0);
      updatePlainUI();
    }
    if (PlainState.activeNotes.has(mapped)) {
      PlainState.activeNotes.delete(mapped);
    } else {
      PlainState.activeNotes.add(mapped);
    }
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

function onMidiNoteOff(note) {
  const mapped = remapMidiNote(note);
  midiActiveNotes.delete(mapped);
  noteOff(mapped);
  // Plain capture/edit: latch (don't remove on noteOff)
  if (AppState.mode === 'input' && PlainState.subMode !== 'idle') {
    // keep note in activeNotes — user clears with x or edits manually
  } else if (AppState.mode === 'input') {
    PlainState.activeNotes.delete(mapped);
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

// Called from C++ (evaluateJavascript) when native MIDI input is received.
// When VST loaded: sound plays via C++ processBlock, JS only updates UI.
// When no VST: play via WebAudioFont (C++ sine is muted).
function onNativeMidiIn(note, velocity) {
  noteOn(note, (velocity || 100) / 127, true);
  if (handlePerformMidi(note)) return;
  midiActiveNotes.add(note);
  if (AppState.mode === 'input') {
    if (PlainState.subMode === 'idle') {
      PlainState.subMode = 'capture';
      PlainState.captureIndex = findNextEmptySlot(0);
      updatePlainUI();
    }
    if (PlainState.activeNotes.has(note)) {
      PlainState.activeNotes.delete(note);
    } else {
      PlainState.activeNotes.add(note);
    }
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

function onNativeMidiOff(note) {
  noteOff(note);
  midiActiveNotes.delete(note);
  if (AppState.mode === 'input' && PlainState.subMode !== 'idle') {
    // latch: keep note in activeNotes
  } else if (AppState.mode === 'input') {
    PlainState.activeNotes.delete(note);
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

function scheduleMidiUpdate() {
  if (midiDebounceTimer) clearTimeout(midiDebounceTimer);
  midiDebounceTimer = setTimeout(() => {
    midiDebounceTimer = null;
    updateMidiDisplay();
  }, MIDI_DEBOUNCE_MS);
}

function updateMidiDisplay() {
  const detectEl = document.getElementById('midi-detect');
  const notes = [...midiActiveNotes].sort((a, b) => a - b);
  if (notes.length === 0) {
    document.querySelectorAll('.midi-highlight').forEach(el => el.remove());
    // Plain mode: #midi-detect is SSOT of updatePlainDisplay(), don't clear
    if (AppState.mode === 'input') return;
    detectEl.innerHTML = '';
    // Restore diagrams: instrument input state takes priority over builder state
    if (instrumentInputActive) {
      updateInstrumentInput();
    } else {
      renderGuitarDiagram(lastRenderRootPC, lastRenderActivePCS);
      renderBassDiagram(lastRenderRootPC, lastRenderActivePCS);
      renderPianoDisplay(lastRenderRootPC, lastRenderActivePCS);
    }
    return;
  }
  // Guitar/Bass/Piano input active: preserve instrument chord name, only add MIDI highlights
  if (instrumentInputActive) {
    highlightMidiPads(notes);
    return;
  }
  // Plain mode: #midi-detect handled by updatePlainDisplay() (SSOT), only add highlights
  if (AppState.mode === 'input') {
    highlightMidiPads(notes);
    return;
  }
  // detectEl always visible (no layout shift)
  const noteNames = notes.map(n => NOTE_NAMES_SHARP[n % 12]);
  const candidates = detectChord(notes);
  if (candidates.length > 0) {
    const best = candidates[0];
    let html = '<div style="color:var(--accent);font-weight:700;font-size:1.1rem;">' + best.name + '</div>';
    if (candidates.length > 1) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">';
      candidates.slice(1).forEach(c => {
        html += '<span style="font-size:0.6rem;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,0.08);color:var(--text-muted);">' + c.name + '</span>';
      });
      html += '</div>';
    }
    html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">' + t('input.notes_label') + noteNames.join(' ') + '</div>';
    detectEl.innerHTML = html;
  } else {
    detectEl.textContent = noteNames.join(' ');
  }
  // Update instrument diagrams with MIDI-detected chord
  if (candidates.length > 0) {
    const midiPCS = new Set(notes.map(n => n % 12));
    renderGuitarDiagram(candidates[0].rootPC, midiPCS);
    renderBassDiagram(candidates[0].rootPC, midiPCS);
    renderPianoDisplay(candidates[0].rootPC, midiPCS);
  }
  highlightMidiPads(notes);
}

function highlightMidiPads(midiNotes) {
  // Remove old highlights
  document.querySelectorAll('.midi-highlight').forEach(el => el.remove());
  const svg = document.getElementById('pad-grid');
  const bm = baseMidi();
  const noteSet = new Set(midiNotes);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = bm + row * ROW_INTERVAL + col;
      if (!noteSet.has(midi)) continue;
      const x = MARGIN + col * (PAD_SIZE + PAD_GAP);
      const y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ring.setAttribute('x', x + 2); ring.setAttribute('y', y + 2);
      ring.setAttribute('width', PAD_SIZE - 4); ring.setAttribute('height', PAD_SIZE - 4);
      ring.setAttribute('rx', 6); ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#fff'); ring.setAttribute('stroke-width', 3);
      ring.setAttribute('class', 'midi-highlight');
      ring.setAttribute('pointer-events', 'none');
      svg.appendChild(ring);
    }
  }
}

function highlightPlaybackPads(midiNotes) {
  document.querySelectorAll('.playback-highlight').forEach(el => el.remove());
  if (!midiNotes || midiNotes.length === 0) return;
  const svg = document.getElementById('pad-grid');
  const bm = baseMidi();
  const noteSet = new Set(midiNotes);
  const candidates = detectChord(midiNotes);
  const rootPC = candidates.length > 0 ? candidates[0].rootPC : null;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = bm + row * ROW_INTERVAL + col;
      if (!noteSet.has(midi)) continue;
      const x = MARGIN + col * (PAD_SIZE + PAD_GAP);
      const y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
      const pc = midi % 12;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', PAD_SIZE); rect.setAttribute('height', PAD_SIZE);
      rect.setAttribute('rx', 8); rect.setAttribute('fill', 'rgba(42,110,42,0.7)');
      rect.setAttribute('class', 'playback-highlight');
      rect.setAttribute('pointer-events', 'none');
      svg.appendChild(rect);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x + PAD_SIZE / 2);
      text.setAttribute('y', rootPC !== null ? y + 15 : y + PAD_SIZE / 2);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', '#fff'); text.setAttribute('font-size', '10px');
      text.setAttribute('font-weight', '600');
      text.setAttribute('class', 'playback-highlight');
      text.textContent = pcName(pc);
      svg.appendChild(text);
      if (rootPC !== null) {
        const interval = ((pc - rootPC) % 12 + 12) % 12;
        const degText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        degText.setAttribute('x', x + PAD_SIZE / 2);
        degText.setAttribute('y', y + 34);
        degText.setAttribute('text-anchor', 'middle'); degText.setAttribute('dominant-baseline', 'middle');
        degText.setAttribute('fill', '#fff'); degText.setAttribute('font-size', '13px');
        degText.setAttribute('font-weight', '700');
        degText.setAttribute('class', 'playback-highlight');
        degText.textContent = SCALE_DEGREE_NAMES[interval];
        svg.appendChild(degText);
      }
    }
  }
}

let selectedMidiInputId = null; // null = all inputs
var _lastOctCC = 0; // debounce: Push 3 multi-port duplicate CC

function initWebMIDI() {
  if (!navigator.requestMIDIAccess) return;
  navigator.requestMIDIAccess().then(access => {
    midiAccess = access;
    const statusEl = document.getElementById('midi-status');
    statusEl.style.display = '';
    const select = document.getElementById('midi-device-select');
    const indicator = document.getElementById('midi-indicator');

    function refreshDeviceList() {
      const prev = select.value;
      select.innerHTML = '<option value="all">' + t('midi.all_devices') + '</option>';
      for (const input of access.inputs.values()) {
        const opt = document.createElement('option');
        opt.value = input.id;
        opt.textContent = input.name;
        select.appendChild(opt);
      }
      // Restore previous selection if still available (by ID)
      if (prev && select.querySelector('option[value="' + prev + '"]')) {
        select.value = prev;
      } else {
        // Try to restore by saved device name (IDs may change between sessions)
        try {
          const savedName = localStorage.getItem('64pad-midi-device');
          if (savedName && savedName !== 'all') {
            for (const opt of select.options) {
              if (opt.textContent === savedName) { select.value = opt.value; break; }
            }
          }
        } catch(_) {}
      }
    }

    function connectInputs() {
      // Clear all handlers first
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }
      midiActiveNotes.clear();
      updateMidiDisplay();

      const selectedId = select.value;
      let connected = false;
      let connectedName = '';

      for (const input of access.inputs.values()) {
        if (selectedId !== 'all' && input.id !== selectedId) continue;
        connected = true;
        connectedName = input.name;
        // Per-input Push detection: シリアル→4度変換をデバイス単位で適用
        const isPush = /Push/i.test(input.name);
        input.onmidimessage = (e) => {
          if (e.data.length < 3) return;
          const [status, rawNote, velocity] = e.data;
          const cmd = status & 0xf0;
          // Push octave buttons: CC#55=▲, CC#54=▼ (data2=127 press, 0 release)
          // Debounce: Push 3 sends same CC on multiple ports → shiftOctave called twice → skips octave
          if (isPush && cmd === 0xb0 && velocity === 127 && (rawNote === 55 || rawNote === 54)) {
            var now = performance.now();
            if (now - _lastOctCC < 100) return;
            _lastOctCC = now;
            shiftOctave(rawNote === 55 ? 1 : -1);
            return;
          }
          // Launchpad octave buttons: CC#91=▲, CC#92=▼ (X/Mini MK3/Pro MK3)
          //                           CC#104=▲, CC#105=▼ (MK1/Mini MK2)
          if (!isPush && cmd === 0xb0 && velocity === 127 &&
              (rawNote === 91 || rawNote === 92 || rawNote === 104 || rawNote === 105)) {
            var now = performance.now();
            if (now - _lastOctCC < 100) return;
            _lastOctCC = now;
            shiftOctave((rawNote === 91 || rawNote === 104) ? 1 : -1);
            return;
          }
          // Push perform mode: serial 4x4 → slots directly (bypass fourths conversion)
          if (isPush && memoryViewMode === 'perform' && cmd === 0x90 && velocity > 0) {
            var si = rawNote - PUSH_SERIAL_BASE;
            if (si >= 0 && si < 64) {
              var sRow = Math.floor(si / 8);
              var sCol = si % 8;
              if (sRow <= 3 && sCol <= 3) {
                performPadTap((3 - sRow) * 4 + sCol);
                ensureAudioResumed();
                return;
              }
            }
          }
          // Non-Push fourths-layout controller perform mode (Linnstrument, Launchpad, etc.)
          if (!isPush && memoryViewMode === 'perform' && cmd === 0x90 && velocity > 0) {
            var perfNote = (_lpProgrammerMode && rawNote >= 11 && rawNote <= 88) ? _lpProgrammerToFourths(rawNote) : rawNote;
            if (perfNote >= 0 && handlePerformMidi(perfNote)) {
              ensureAudioResumed();
              return;
            }
          }
          // Push: block notes outside pad range (touch strip sends low notes)
          if (isPush && (cmd === 0x90 || cmd === 0x80) && (rawNote < 36 || rawNote > 99)) return;
          // Launchpad Programmer mode: convert notes 11-88 to 4th chromatic
          var note;
          if (isPush) {
            note = pushSerialToFourths(rawNote);
          } else if (_lpProgrammerMode && rawNote >= 11 && rawNote <= 88) {
            note = _lpProgrammerToFourths(rawNote);
            if (note < 0) return; // Invalid pad position (e.g., note 19 = side button)
          } else {
            note = rawNote;
          }
          if (cmd === 0x90 && velocity > 0) onMidiNoteOn(note, velocity);
          else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) onMidiNoteOff(note);
        };
      }

      // Per-input remap handles Push now; global remap no longer needed
      midiNoteRemap = null;

      // Auto-match MIDI output for LED control (HPS exclusive)
      _exitLaunchpadProgrammerMode();
      midiOutput = null;
      midiOutputDAW = null;
      _lpOutputActive = false;
      _lpProgrammerMode = false;
      var ledSel = document.getElementById('led-mode');
      if (ledSel) ledSel.style.display = 'none';
      // LED control disabled — requires Launchpad Programmer mode testing with physical device
      // Re-enable when Launchpad is available for testing
      if (false && _lpHpsUnlocked && connected && connectedName) {
        var isLaunchpad = /launchpad/i.test(connectedName);
        if (isLaunchpad) {
          // Detect device type
          _lpDeviceByte = /mini/i.test(connectedName) ? 0x0D : 0x0C;
          // Collect all matching outputs (Launchpad has MIDI + DAW ports)
          var matchedOutputs = [];
          for (const output of access.outputs.values()) {
            if (/launchpad/i.test(output.name)) matchedOutputs.push(output);
          }
          if (matchedOutputs.length > 0) {
            // First port = MIDI, second = DAW (if available)
            midiOutput = matchedOutputs[0];
            midiOutputDAW = matchedOutputs.length > 1 ? matchedOutputs[1] : matchedOutputs[0];
            _lpOutputActive = true;
            _enterLaunchpadProgrammerMode();
          }
        } else {
          // Non-Launchpad: try direct name match for basic LED
          for (const output of access.outputs.values()) {
            if (output.name === connectedName || output.name.includes(connectedName) || connectedName.includes(output.name)) {
              midiOutput = output;
              _lpOutputActive = true;
              break;
            }
          }
        }
        // Show LED mode selector and trigger initial LED update
        if (_lpOutputActive) {
          ledSel = document.getElementById('led-mode');
          if (ledSel) {
            ledSel.style.display = '';
            try {
              var saved = localStorage.getItem('64pad-led-mode');
              if (saved && (saved === 'full' || saved === 'root' || saved === 'off')) {
                _lpLEDMode = saved;
                ledSel.value = saved;
              }
            } catch(_) {}
          }
          render();
        }
      }

      indicator.style.background = connected ? '#4caf50' : '#ff9800';
    }

    select.addEventListener('change', () => {
      connectInputs();
      try {
        const opt = select.options[select.selectedIndex];
        localStorage.setItem('64pad-midi-device', opt ? opt.textContent : 'all');
      } catch(_) {}
    });

    refreshDeviceList();
    connectInputs();
    access.onstatechange = () => {
      refreshDeviceList();
      connectInputs();
    };
  }).catch(() => {});
}

// ======== LAUNCHPAD LED CONTROL ========
// Map 64PE pad state to Launchpad palette color index (0-127)
// Launchpad palette: 0=off, 5=red, 9=orange, 21=green, 37=cyan, 45=blue, 53=purple, 79=yellow
function _padColorToLP(state, row, col) {
  if (_lpLEDMode === 'off') return 0;

  var bm = baseMidi();
  var midi = bm + row * ROW_INTERVAL + col;
  var pc = midi % 12;
  var rootPC = state.rootPC;

  // Root-only mode: only light up root pitch class
  if (_lpLEDMode === 'root') {
    if (pc === rootPC && rootPC !== null) return 9; // Orange
    return 0;
  }

  // Full mode: mirror all pad colors
  var activePCS = state.activePCS;
  var bassPC = state.bassPC;
  var omittedPCS = state.omittedPCS;
  var guide3PCS = state.guide3PCS;
  var guide7PCS = state.guide7PCS;
  var tensionPCS = state.tensionPCS;
  var avoidPCS = state.avoidPCS;
  var overlayPCS = state.overlayPCS;
  var tastyMidiSet = state.tastyMidiSet;

  // TASTY/Stock mode
  if (tastyMidiSet && tastyMidiSet.size > 0) {
    if (tastyMidiSet.has(midi)) {
      return pc === rootPC ? 9 : 45;
    }
    return 0;
  }

  // Input mode
  if (AppState.mode === 'input') {
    if (PlainState.activeNotes.has(midi)) {
      return pc === rootPC ? 9 : 45;
    }
    return 0;
  }

  // Scale/Chord modes
  var isRoot = pc === rootPC && !omittedPCS.has(pc);
  var isBass = bassPC !== null && pc === bassPC;
  var isActive = activePCS.has(pc);
  var isGuide3 = AppState.mode === 'chord' && guide3PCS.has(pc) && !isRoot && !tensionPCS.has(pc);
  var isGuide7 = AppState.mode === 'chord' && guide7PCS.has(pc) && !isRoot && !tensionPCS.has(pc);
  var isTension = AppState.mode === 'chord' && tensionPCS.has(pc) && !isRoot && !isGuide3 && !isGuide7;
  var isAvoid = AppState.mode === 'chord' && avoidPCS.has(pc) && !isRoot;

  if (isRoot && isActive) return 9;       // Orange — root
  if (isBass) return 9;                    // Orange — bass
  if (isGuide3) return 21;                 // Green — guide tone 3rd
  if (isGuide7) return 53;                 // Purple — guide tone 7th
  if (isAvoid) return 5;                   // Red — avoid note
  if (isTension) return 37;                // Cyan — tension
  if (isActive) return 45;                 // Blue — scale/chord tone
  if (overlayPCS && overlayPCS.has(pc)) return 1; // Dim — scale overlay
  return 0;                                // Off
}

function setLEDMode(mode) {
  _lpLEDMode = mode;
  // Force full re-send by resetting prev state
  for (var i = 0; i < 64; i++) _prevLEDState[i] = -1;
  try { localStorage.setItem('64pad-led-mode', mode); } catch(_) {}
  render();
}

// Convert 64PE grid (row, col) to Launchpad Programmer mode note (11-88)
function _lpNote(row, col) {
  return (row + 1) * 10 + (col + 1);
}

// Convert Launchpad Programmer mode note (11-88) to 64PE MIDI note
function _lpProgrammerToFourths(note) {
  var lpRow = Math.floor(note / 10) - 1;
  var lpCol = (note % 10) - 1;
  if (lpRow < 0 || lpRow >= 8 || lpCol < 0 || lpCol >= 8) return -1;
  return baseMidi() + lpRow * ROW_INTERVAL + lpCol;
}

function _enterLaunchpadProgrammerMode() {
  var port = midiOutputDAW || midiOutput;
  if (!port) return;
  var sysex = [0xF0, 0x00, 0x20, 0x29, 0x02, _lpDeviceByte, 0x0E, 0x01, 0xF7];
  try {
    port.send(sysex);
    _lpProgrammerMode = true;
    // Also try sending on MIDI port in case DAW port didn't work
    if (midiOutput && midiOutput !== port) {
      try { midiOutput.send(sysex); } catch(_) {}
    }
  } catch(e) {
    // SysEx not permitted (user denied or browser blocked)
    _lpProgrammerMode = false;
    _lpOutputActive = false;
    console.warn('[64PE] SysEx not available — LED control disabled. Grant MIDI SysEx permission to enable.');
  }
}

function _exitLaunchpadProgrammerMode() {
  if (!_lpProgrammerMode) return;
  var sysex = [0xF0, 0x00, 0x20, 0x29, 0x02, _lpDeviceByte, 0x0E, 0x00, 0xF7];
  var port = midiOutputDAW || midiOutput;
  try { if (port) port.send(sysex); } catch(_) {}
  try { if (midiOutput && midiOutput !== port) midiOutput.send(sysex); } catch(_) {}
  _lpProgrammerMode = false;
}

function updateLaunchpadLEDs(state) {
  if (!midiOutput || !_lpOutputActive || !_lpProgrammerMode) return;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var idx = row * COLS + col;
      var color = _padColorToLP(state, row, col);
      if (color !== _prevLEDState[idx]) {
        // In Programmer mode: use (row+1)*10+(col+1), else use MIDI note
        var note = _lpProgrammerMode ? _lpNote(row, col) : (baseMidi() + row * ROW_INTERVAL + col);
        if (note >= 0 && note <= 127) {
          midiOutput.send([0x90, note, color]);
        }
        _prevLEDState[idx] = color;
      }
    }
  }
}

function clearLaunchpadLEDs() {
  if (!midiOutput) return;
  for (var i = 0; i < 64; i++) {
    if (_prevLEDState[i] > 0) {
      var row = Math.floor(i / COLS);
      var col = i % COLS;
      var note = _lpProgrammerMode ? _lpNote(row, col) : (baseMidi() + row * ROW_INTERVAL + col);
      if (note >= 0 && note <= 127) {
        midiOutput.send([0x90, note, 0]);
      }
    }
    _prevLEDState[i] = -1;
  }
}

// ======== TEXT CHORD INPUT ========

var TextChordState = {
  candidates: [],
  selectedIndex: 0,
  isOpen: false,
  dropdownHandle: null,
};

function initTextChordInput() {
  var input = document.getElementById('text-chord-input');
  var dropdown = document.getElementById('text-chord-dropdown');
  if (!input || !dropdown) return;

  function updateCandidates() {
    var candidates = padGenerateCandidates(input.value.trim(), null);
    TextChordState.candidates = candidates;
    TextChordState.selectedIndex = 0;
    TextChordState.isOpen = candidates.length > 0;
    TextChordState.dropdownHandle = padRenderDropdown(
      dropdown, candidates, 0,
      function(c) { commitTextChord(c); }
    );
  }

  input.addEventListener('input', updateCandidates);
  input.addEventListener('keydown', handleTextChordKeydown);
  input.addEventListener('focus', function() {
    if (input.value.trim()) updateCandidates();
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.text-chord-container')) {
      closeTextChordDropdown();
    }
  });
}

function closeTextChordDropdown() {
  if (TextChordState.dropdownHandle) TextChordState.dropdownHandle.close();
  TextChordState.isOpen = false;
  TextChordState.candidates = [];
  TextChordState.selectedIndex = 0;
  TextChordState.dropdownHandle = null;
}

function commitTextChord(candidate) {
  var input = document.getElementById('text-chord-input');
  if (!input || !candidate) return;

  var parsed = padParseChordName(candidate.name);
  if (!parsed) return;

  applyParsedChordToBuilder(parsed);

  input.value = '';
  closeTextChordDropdown();
}

function applyParsedChordToBuilder(parsed) {
  var rootPC = parsed.root;

  // Collect intervals as pitch class set (mod 12)
  var intervalSet = new Set(parsed.intervals.map(function(iv) { return iv % 12; }));

  // Find best matching BUILDER_QUALITIES (longest PCS subset)
  var bestQuality = null;
  var bestQLen = 0;
  for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
    for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
      var q = BUILDER_QUALITIES[r][c];
      if (!q) continue;
      var allMatch = true;
      for (var p = 0; p < q.pcs.length; p++) {
        if (!intervalSet.has(q.pcs[p])) { allMatch = false; break; }
      }
      if (allMatch && q.pcs.length > bestQLen) {
        bestQLen = q.pcs.length;
        bestQuality = q;
      }
    }
  }
  if (!bestQuality) return;

  // Find extra intervals → tension
  var qualitySet = new Set(bestQuality.pcs);
  var extras = [];
  intervalSet.forEach(function(iv) {
    if (!qualitySet.has(iv) && iv !== 0) extras.push(iv);
  });

  var matchedTension = null;
  var matchedEl = null;
  if (extras.length > 0) {
    var extraSet = new Set(extras);
    var btns = document.querySelectorAll('#tension-grid .tension-btn');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var t = btn._tension;
      if (!t) continue;
      var adds = t.mods.add || [];
      if (adds.length === extras.length && !t.mods.replace3 && !t.mods.sharp5 && !t.mods.flat5) {
        var allIn = true;
        for (var j = 0; j < adds.length; j++) {
          if (!extraSet.has(adds[j])) { allIn = false; break; }
        }
        if (allIn) {
          matchedTension = t;
          matchedEl = btn;
          break;
        }
      }
    }
  }

  // Set builder state
  BuilderState.root = rootPC;
  BuilderState.quality = bestQuality;
  BuilderState.tension = matchedTension;
  BuilderState.bass = parsed.bass;
  BuilderState._fromDiatonic = false;
  resetVoicingSelection();

  // Update UI
  updateKeyButtons();
  highlightQuality(bestQuality);
  clearTensionSelection();
  if (matchedTension && matchedEl) matchedEl.classList.add('selected');
  updateControlsForQuality(bestQuality);
  if (parsed.bass !== null) highlightPianoKey('onchord-keyboard', parsed.bass);
  setBuilderStep(2);
  render();
  updateTastyUI();
  playCurrentChord();
}

function handleTextChordKeydown(e) {
  var input = document.getElementById('text-chord-input');
  var dropdown = document.getElementById('text-chord-dropdown');

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (TextChordState.isOpen && TextChordState.candidates.length > 0) {
        var candidate = TextChordState.candidates[TextChordState.selectedIndex] ||
                        TextChordState.candidates[0];
        commitTextChord(candidate);
      } else if (input.value.trim()) {
        var parsed = padParseChordName(input.value.trim());
        if (parsed) {
          applyParsedChordToBuilder(parsed);
          input.value = '';
          closeTextChordDropdown();
        } else {
          input.classList.add('error');
          setTimeout(function() { input.classList.remove('error'); }, 400);
        }
      }
      break;

    case 'ArrowDown':
      if (TextChordState.isOpen) {
        e.preventDefault();
        TextChordState.selectedIndex = Math.min(
          TextChordState.selectedIndex + 1,
          TextChordState.candidates.length - 1
        );
        if (TextChordState.dropdownHandle) TextChordState.dropdownHandle.updateSelection(TextChordState.selectedIndex);
      }
      break;

    case 'ArrowUp':
      if (TextChordState.isOpen) {
        e.preventDefault();
        TextChordState.selectedIndex = Math.max(TextChordState.selectedIndex - 1, 0);
        if (TextChordState.dropdownHandle) TextChordState.dropdownHandle.updateSelection(TextChordState.selectedIndex);
      }
      break;

    case 'Escape':
      e.preventDefault();
      if (TextChordState.isOpen) {
        closeTextChordDropdown();
        input.value = '';
      } else {
        input.blur();
      }
      break;

    case 'Tab':
      if (TextChordState.isOpen && TextChordState.candidates.length > 0) {
        e.preventDefault();
        var selCand = TextChordState.candidates[TextChordState.selectedIndex] ||
                      TextChordState.candidates[0];
        input.value = selCand.name;
        var newCandidates = padGenerateCandidates(input.value.trim(), null);
        TextChordState.candidates = newCandidates;
        TextChordState.selectedIndex = 0;
        TextChordState.dropdownHandle = padRenderDropdown(
          dropdown, newCandidates, 0,
          function(c) { commitTextChord(c); }
        );
      }
      break;
  }
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  detectChord, CHORD_DB, TRIAD_DB, TETRAD_DB,
};
