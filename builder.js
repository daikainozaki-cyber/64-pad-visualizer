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
var _rootUseFlats = null;  // null = auto-detect from key context. Not persisted.

function getRootLabels() {
  if (_rootUseFlats === null) {
    // Auto: use key context
    var parentKey = padGetParentMajorKey(AppState.scaleIdx, AppState.key);
    return KEY_SPELLINGS[parentKey];
  }
  return _rootUseFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
}
function setRootNotation(useFlats) {
  _rootUseFlats = useFlats;
  updateRootLabels();
  updateRootNotationUI();
  updateChordDisplay();
  render();
}
function updateRootNotationUI() {
  var sharp = document.getElementById('root-notation-sharp');
  var flat = document.getElementById('root-notation-flat');
  var isFlat = _rootUseFlats === true;
  var isSharp = _rootUseFlats === false;
  // null = auto (neither button highlighted)
  if (sharp) {
    sharp.style.background = isSharp ? 'var(--text)' : 'transparent';
    sharp.style.color = isSharp ? 'var(--bg)' : 'var(--text-muted)';
    sharp.style.border = isSharp ? 'none' : '1px solid var(--border)';
  }
  if (flat) {
    flat.style.background = isFlat ? 'var(--text)' : 'transparent';
    flat.style.color = isFlat ? 'var(--bg)' : 'var(--text-muted)';
    flat.style.border = isFlat ? 'none' : '1px solid var(--border)';
  }
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
  updateRootNotationUI();
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
// WEB MIDI & CHORD DETECTION → moved to midi.js
// ========================================

// (MIDI state, functions, LED control → midi.js)

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

// Conditional exports moved to midi.js
