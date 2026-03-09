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
  if (mode === 'chord' && BuilderState.step === 0) {
    BuilderState.root = AppState.key; // carry over key
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
function initKeyButtons() {
  const container = document.getElementById('key-buttons');
  const blackKeys = [1,3,6,8,10];
  NOTE_NAMES_SHARP.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'key-btn' + (i === AppState.key ? ' active' : '') + (blackKeys.includes(i) ? ' black-key' : '');
    btn.textContent = NOTE_NAMES_FLAT[i] !== name ? name + '/' + NOTE_NAMES_FLAT[i] : name;
    btn.onclick = () => {
      if (AppState.mode === 'chord') {
        selectRoot(i);
      } else {
        AppState.key = i;
        updateKeyButtons();
        render();
        saveAppSettings();
      }
    };
    container.appendChild(btn);
  });
}
function updateKeyButtons() {
  var isInput = AppState.mode === 'input';
  var activePC = AppState.mode === 'chord' ? BuilderState.root : AppState.key;
  var container = document.getElementById('key-buttons');
  container.classList.toggle('disabled', isInput);
  document.querySelectorAll('#key-buttons .key-btn').forEach((btn, i) => {
    btn.classList.toggle('active', !isInput && i === activePC);
    btn.disabled = isInput;
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
  document.getElementById('step1').style.display = step === 1 ? '' : 'none';
  document.getElementById('step2').style.display = step === 2 ? '' : 'none';
  if (!BuilderState.bassInputMode) {
    const label = step === 2 ? t('builder.step_tension') : (BuilderState.root !== null ? t('builder.step_quality') : t('builder.step_root'));
    document.getElementById('step-label').textContent = label;
    document.getElementById('step-label').style.background = '';
  }
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
    var invNames = ['', '1st Inv', '2nd Inv', '3rd Inv'];
    invLabel = invNames[VoicingState.inversion];
  }
  document.getElementById('chord-voicing-info').textContent = invLabel;
}

function builderClear() {
  BuilderState.root = null; BuilderState.quality = null; BuilderState.tension = null; BuilderState.bass = null;
  BuilderState.bassInputMode = false;
  BuilderState._fromDiatonic = false;
  document.getElementById('step-label').style.background = '';
  setBuilderStep(1);
  updateKeyButtons();
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
  BuilderState._fromDiatonic = false; // Manual root selection → hide diatonic bar
  resetVoicingSelection();
  updateKeyButtons();
  clearQualitySelection();
  clearTensionSelection();
  setBuilderStep(1); // Stay on step 1 (Quality visible)
  render();
}

function selectQuality(q) {
  BuilderState.quality = q;
  BuilderState.tension = null;
  resetVoicingSelection();
  highlightQuality(q);
  updateControlsForQuality(q);
  setBuilderStep(2); // Go to Tension
  render();
  playCurrentChord();
}

function selectTension(t, el) {
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
    document.getElementById('step-label').style.background = '#009E73';
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
          if (isPush && cmd === 0xb0 && velocity === 127) {
            if (rawNote === 55) { shiftOctave(1); return; }
            if (rawNote === 54) { shiftOctave(-1); return; }
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
            if (handlePerformMidi(rawNote)) {
              ensureAudioResumed();
              return;
            }
          }
          const note = isPush ? pushSerialToFourths(rawNote) : rawNote;
          if (cmd === 0x90 && velocity > 0) onMidiNoteOn(note, velocity);
          else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) onMidiNoteOff(note);
        };
      }

      // Per-input remap handles Push now; global remap no longer needed
      midiNoteRemap = null;

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

// ======== TEXT CHORD INPUT ========

var TextChordState = {
  candidates: [],
  selectedIndex: 0,
  isOpen: false,
};

function initTextChordInput() {
  var input = document.getElementById('text-chord-input');
  if (!input) return;

  input.addEventListener('input', function() {
    var candidates = generateTextChordCandidates(input.value.trim());
    TextChordState.candidates = candidates;
    TextChordState.selectedIndex = 0;
    renderTextChordDropdown(candidates);
  });

  input.addEventListener('keydown', handleTextChordKeydown);

  input.addEventListener('focus', function() {
    if (input.value.trim()) {
      var candidates = generateTextChordCandidates(input.value.trim());
      TextChordState.candidates = candidates;
      TextChordState.selectedIndex = 0;
      renderTextChordDropdown(candidates);
    }
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.text-chord-container')) {
      closeTextChordDropdown();
    }
  });
}

function generateTextChordCandidates(input) {
  if (!input) return [];

  var rootMatch = input.match(/^([A-Ga-g])([#b]?)/);
  if (!rootMatch) return [];

  var rootWasLower = rootMatch[1] === rootMatch[1].toLowerCase();
  var rootStr = rootMatch[1].toUpperCase() + rootMatch[2];
  var qualityInput = input.slice(rootMatch[0].length);

  // Slash chord branch
  var slashIdx = qualityInput.indexOf('/');
  if (slashIdx >= 0) {
    var quality = qualityInput.slice(0, slashIdx);
    var bassInput = qualityInput.slice(slashIdx + 1);
    return generateTextChordSlashCandidates(rootStr, quality, bassInput);
  }

  var candidates = [];
  var seenIntervals = {};
  for (var i = 0; i < PAD_QUALITY_KEYS.length; i++) {
    var qKey = PAD_QUALITY_KEYS[i];
    if (qKey.indexOf(qualityInput) === 0 || qKey.toLowerCase().indexOf(qualityInput.toLowerCase()) === 0) {
      var fullName = rootStr + qKey;
      var parsed = padParseChordName(fullName);
      if (parsed) {
        // Dedup by intervals (same voicing = same chord)
        var dedupKey = parsed.intervals.slice().sort(function(a,b){return a-b;}).join(',') + ':' + (parsed.bass === null ? '' : parsed.bass);
        if (!seenIntervals[dedupKey]) {
          seenIntervals[dedupKey] = true;
          candidates.push({
            name: parsed.displayName,
            quality: qKey,
            exactMatch: qKey === qualityInput || qKey.toLowerCase() === qualityInput.toLowerCase(),
          });
        }
      }
    }
  }

  var wantMinor = (rootWasLower && !qualityInput) || (qualityInput.length > 0 && qualityInput[0] === 'm');
  var wantMajor = qualityInput.length > 0 && qualityInput[0] === 'M';

  // Count tensions: parenthesized items like (b9,#11) = 2 tensions
  function tensionCount(q) {
    var m = q.match(/\(([^)]+)\)/);
    if (!m) {
      // Check for inline tensions like 7b9, 7#9 (single tension appended without parens)
      var base = q.replace(/^(m7b5|m7|maj7|dim7|aug7|7|m6|6|dim|aug|m|M7|△7|sus[24]?)/, '');
      return base.length > 0 ? 1 : 0;
    }
    return m[1].split(',').length;
  }

  candidates.sort(function(a, b) {
    // 1. Exact match first
    if (a.exactMatch !== b.exactMatch) return b.exactMatch - a.exactMatch;
    // 2. Minor/Major preference
    if (wantMinor) {
      var aM = a.quality.indexOf('m') === 0 ? 1 : 0;
      var bM = b.quality.indexOf('m') === 0 ? 1 : 0;
      if (aM !== bM) return bM - aM;
    } else if (wantMajor) {
      var aJ = (a.quality.indexOf('M') === 0 || a.quality.indexOf('maj') === 0) ? 1 : 0;
      var bJ = (b.quality.indexOf('M') === 0 || b.quality.indexOf('maj') === 0) ? 1 : 0;
      if (aJ !== bJ) return bJ - aJ;
    }
    // 3. Fewer tensions first (base → single → double → triple)
    var tA = tensionCount(a.quality);
    var tB = tensionCount(b.quality);
    if (tA !== tB) return tA - tB;
    // 4. Shorter quality name within same tension count
    return a.quality.length - b.quality.length;
  });

  return candidates.slice(0, 15);
}

function generateTextChordSlashCandidates(rootStr, quality, bassInput) {
  var baseCheck = rootStr + quality;
  if (quality && !padParseChordName(baseCheck)) return [];

  var candidates = [];
  for (var i = 0; i < NOTE_NAMES_SHARP.length; i++) {
    var bass = NOTE_NAMES_SHARP[i];
    if (!bassInput || bass.toLowerCase().indexOf(bassInput.toLowerCase()) === 0) {
      var fullName = rootStr + quality + '/' + bass;
      var parsed = padParseChordName(fullName);
      if (parsed) {
        candidates.push({ name: parsed.displayName });
      }
    }
  }
  return candidates.slice(0, 12);
}

function renderTextChordDropdown(candidates) {
  var dropdown = document.getElementById('text-chord-dropdown');
  if (!dropdown) return;

  if (candidates.length === 0) {
    closeTextChordDropdown();
    return;
  }

  dropdown.innerHTML = '';
  TextChordState.isOpen = true;
  dropdown.classList.add('active');

  for (var i = 0; i < candidates.length; i++) {
    var div = document.createElement('div');
    div.className = 'text-chord-candidate' + (i === TextChordState.selectedIndex ? ' selected' : '');
    div.textContent = candidates[i].name;
    div.setAttribute('data-index', i);
    div.addEventListener('mousedown', function(e) {
      e.preventDefault();
      var idx = parseInt(this.getAttribute('data-index'));
      commitTextChord(TextChordState.candidates[idx]);
    });
    div.addEventListener('mouseenter', function() {
      TextChordState.selectedIndex = parseInt(this.getAttribute('data-index'));
      updateTextChordDropdownSelection();
    });
    dropdown.appendChild(div);
  }
}

function updateTextChordDropdownSelection() {
  var dropdown = document.getElementById('text-chord-dropdown');
  if (!dropdown) return;
  var items = dropdown.querySelectorAll('.text-chord-candidate');
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('selected', i === TextChordState.selectedIndex);
  }
}

function closeTextChordDropdown() {
  var dropdown = document.getElementById('text-chord-dropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    dropdown.classList.remove('active');
  }
  TextChordState.isOpen = false;
  TextChordState.candidates = [];
  TextChordState.selectedIndex = 0;
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
  playCurrentChord();
}

function handleTextChordKeydown(e) {
  var input = document.getElementById('text-chord-input');

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
        updateTextChordDropdownSelection();
      }
      break;

    case 'ArrowUp':
      if (TextChordState.isOpen) {
        e.preventDefault();
        TextChordState.selectedIndex = Math.max(TextChordState.selectedIndex - 1, 0);
        updateTextChordDropdownSelection();
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
        var newCandidates = generateTextChordCandidates(input.value.trim());
        TextChordState.candidates = newCandidates;
        TextChordState.selectedIndex = 0;
        renderTextChordDropdown(newCandidates);
      }
      break;
  }
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  detectChord, CHORD_DB, TRIAD_DB, TETRAD_DB,
};
