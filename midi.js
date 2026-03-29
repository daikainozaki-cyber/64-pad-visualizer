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
let _isPush = false;         // true when Push 3 User Mode detected
const _prevLEDState = new Array(64).fill(-1); // -1 = never sent
let _lpLEDMode = 'full'; // 'full' | 'root' | 'off'
let _lastLEDState = null; // cached render state for LED refresh on noteOn/noteOff

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
  refreshLaunchpadLEDs();
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
  refreshLaunchpadLEDs();
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
  if (!linkMode && AppState.mode === 'input') {
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
  if (!linkMode && AppState.mode === 'input' && PlainState.subMode !== 'idle') {
    // latch: keep note in activeNotes
  } else if (!linkMode && AppState.mode === 'input') {
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
    document.querySelectorAll('.link-highlight').forEach(el => el.remove());
    // Plain mode: #midi-detect is SSOT of updatePlainDisplay(), don't clear
    if (!linkMode && AppState.mode === 'input') return;
    if (linkMode) { detectEl.innerHTML = ''; return; } // Link mode: just clear highlights, keep display
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
  if (!linkMode && instrumentInputActive) {
    highlightMidiPads(notes);
    return;
  }
  // Plain mode: #midi-detect handled by updatePlainDisplay() (SSOT), only add highlights
  if (!linkMode && AppState.mode === 'input') {
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
  // Update instrument diagrams with MIDI-detected chord, or highlight-only in link mode
  if (linkMode) {
    // Link mode: keep existing scale/chord display, just add highlight overlays
    highlightMidiInstruments(notes);
  } else if (candidates.length > 0) {
    const midiPCS = new Set(notes.map(n => n % 12));
    renderGuitarDiagram(candidates[0].rootPC, midiPCS);
    renderBassDiagram(candidates[0].rootPC, midiPCS);
    renderPianoDisplay(candidates[0].rootPC, midiPCS);
  }
  highlightMidiPads(notes);
}

function highlightMidiInstruments(midiNotes) {
  document.querySelectorAll('.link-highlight').forEach(el => el.remove());
  // Re-apply dim in case render() rebuilt SVGs
  applyLinkDim();
  if (!midiNotes || midiNotes.length === 0) return;
  var NS = 'http://www.w3.org/2000/svg';
  var noteSet = new Set(midiNotes);

  // --- Pad: bright filled rects over dim ---
  var padSvg = document.getElementById('pad-grid');
  if (padSvg) {
    var bm = baseMidi();
    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        var midi = bm + row * ROW_INTERVAL + col;
        if (!noteSet.has(midi)) continue;
        var x = MARGIN + col * (PAD_SIZE + PAD_GAP);
        var y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
        var hl = document.createElementNS(NS, 'rect');
        hl.setAttribute('x', x); hl.setAttribute('y', y);
        hl.setAttribute('width', PAD_SIZE); hl.setAttribute('height', PAD_SIZE);
        hl.setAttribute('rx', 6);
        hl.setAttribute('fill', '#fff'); hl.setAttribute('opacity', '0.55');
        hl.setAttribute('stroke', '#fff'); hl.setAttribute('stroke-width', 2);
        hl.setAttribute('class', 'link-highlight');
        hl.setAttribute('pointer-events', 'none');
        padSvg.appendChild(hl);
      }
    }
  }

  // --- Piano: circles on keys over dim ---
  var pianoSvg = document.getElementById('piano-display');
  if (pianoSvg && pianoSvg.children.length > 0) {
    var hitRects = [...pianoSvg.querySelectorAll('rect[cursor="pointer"]')];
    hitRects.forEach(function(hr) {
      var midi = parseInt(hr.dataset.midi);
      if (!noteSet.has(midi)) return;
      var kx = parseFloat(hr.getAttribute('x'));
      var ky = parseFloat(hr.getAttribute('y'));
      var kw = parseFloat(hr.getAttribute('width'));
      var kh = parseFloat(hr.getAttribute('height'));
      // Circle centered on the key
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', kx + kw / 2);
      c.setAttribute('cy', ky + kh / 2);
      c.setAttribute('r', Math.min(kw, kh) * 0.35);
      c.setAttribute('fill', '#fff');
      c.setAttribute('opacity', '0.9');
      c.setAttribute('class', 'link-highlight');
      c.setAttribute('pointer-events', 'none');
      pianoSvg.appendChild(c);
    });
  }

  // --- Guitar: bright circles over dim ---
  var guitarSvg = document.getElementById('guitar-diagram');
  if (guitarSvg && typeof GUITAR_OPEN_MIDI !== 'undefined') {
    var gRects = guitarSvg.querySelectorAll('rect[data-string][data-fret]');
    gRects.forEach(function(r) {
      var s = parseInt(r.dataset.string);
      var f = parseInt(r.dataset.fret);
      var midi = GUITAR_OPEN_MIDI[s] + f;
      if (!noteSet.has(midi)) return;
      var hl = document.createElementNS(NS, 'circle');
      var cx = parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
      var cy = parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2;
      hl.setAttribute('cx', cx); hl.setAttribute('cy', cy);
      hl.setAttribute('r', 8);
      hl.setAttribute('fill', '#fff'); hl.setAttribute('opacity', '0.9');
      hl.setAttribute('class', 'link-highlight');
      hl.setAttribute('pointer-events', 'none');
      guitarSvg.appendChild(hl);
    });
  }

  // --- Bass: bright circles over dim ---
  var bassSvg = document.getElementById('bass-diagram');
  if (bassSvg && typeof PAD_BASS_TUNING !== 'undefined') {
    var bRects = bassSvg.querySelectorAll('rect[data-string][data-fret]');
    bRects.forEach(function(r) {
      var s = parseInt(r.dataset.string);
      var f = parseInt(r.dataset.fret);
      var midi = PAD_BASS_TUNING[s] + f;
      if (!noteSet.has(midi)) return;
      var hl = document.createElementNS(NS, 'circle');
      var cx = parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
      var cy = parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2;
      hl.setAttribute('cx', cx); hl.setAttribute('cy', cy);
      hl.setAttribute('r', 8);
      hl.setAttribute('fill', '#fff'); hl.setAttribute('opacity', '0.9');
      hl.setAttribute('class', 'link-highlight');
      hl.setAttribute('pointer-events', 'none');
      bassSvg.appendChild(hl);
    });
  }
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
      // LED control: Push 3 User Mode (no SysEx needed) + Launchpad (disabled until physical testing)
      _isPush = false;
      console.log('[64PE LED] hpsUnlocked:', _lpHpsUnlocked, 'connected:', connected, 'connectedName:', connectedName);
      // List all output ports for debugging
      for (const output of access.outputs.values()) {
        console.log('[64PE LED] Output port:', output.name, output.id);
      }
      if (_lpHpsUnlocked && connected && connectedName) {
        var isPush = /push/i.test(connectedName) || /ableton/i.test(connectedName);
        var isLaunchpad = /launchpad/i.test(connectedName);
        console.log('[64PE LED] isPush:', isPush, 'isLaunchpad:', isLaunchpad);
        if (isPush) {
          // Push 3 User Mode: Note On with velocity=color, no SysEx needed
          // Push serial note = 36 + row*8 + col
          _isPush = true;
          // Push 3: try both Live Port (LED control) and User Port
          var pushLivePort = null;
          var pushUserPort = null;
          for (const output of access.outputs.values()) {
            console.log('[64PE LED] Checking output:', output.name);
            if (/push/i.test(output.name) || /ableton/i.test(output.name)) {
              if (/live/i.test(output.name)) pushLivePort = output;
              else if (/user/i.test(output.name)) pushUserPort = output;
            }
          }
          // LED control via Live Port (proven in standalone), fallback to User Port
          midiOutput = pushLivePort || pushUserPort;
          if (midiOutput) {
            _lpOutputActive = true;
            _lpProgrammerMode = true;
            console.log('[64PE LED] Push LED output:', midiOutput.name);
          }
        } else if (false && isLaunchpad) {
          // Launchpad: disabled until physical device testing
          _lpDeviceByte = /mini/i.test(connectedName) ? 0x0D : 0x0C;
          var matchedOutputs = [];
          for (const output of access.outputs.values()) {
            if (/launchpad/i.test(output.name)) matchedOutputs.push(output);
          }
          if (matchedOutputs.length > 0) {
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
// HPS exclusive feature (?hps gate): Push LED control without Ableton
// - Scale colors on pads + white highlight on press (Scale mode only)
// - Ableton不要でPushをスケール練習デバイスとして使える
// Map 64PE pad state to Launchpad palette color index (0-127)
// Launchpad palette: 0=off, 5=red, 9=orange, 21=green, 37=cyan, 45=blue, 53=purple, 79=yellow
function _padColorToLP(state, row, col) {
  if (_lpLEDMode === 'off') return 0;

  var bm = baseMidi();
  var midi = bm + row * ROW_INTERVAL + col;
  var pc = midi % 12;
  var rootPC = state.rootPC;

  // Highlight currently pressed pads (orange for Push 3, white for Launchpad)
  // Push palette: 3=orange(255,100,0), see [[Push 2/3 LEDカラーパレット]]
  if (midiActiveNotes.has(midi)) return _isPush ? 3 : 3;

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
  _lastLEDState = state;
  if (!midiOutput || !_lpOutputActive || !_lpProgrammerMode) return;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var idx = row * COLS + col;
      var color = _padColorToLP(state, row, col);
      if (color !== _prevLEDState[idx]) {
        var note;
        if (_isPush) {
          // Push 3 User Mode: serial layout (36 + row*8 + col)
          note = 36 + row * 8 + col;
        } else if (_lpProgrammerMode) {
          note = _lpNote(row, col);
        } else {
          note = baseMidi() + row * ROW_INTERVAL + col;
        }
        if (note >= 0 && note <= 127) {
          midiOutput.send([0x90, note, color]);
        }
        _prevLEDState[idx] = color;
      }
    }
  }
}

// Re-run LED update with cached state (for noteOn/noteOff feedback)
function refreshLaunchpadLEDs() {
  if (_lastLEDState) updateLaunchpadLEDs(_lastLEDState);
}

function clearLaunchpadLEDs() {
  if (!midiOutput) return;
  for (var i = 0; i < 64; i++) {
    if (_prevLEDState[i] > 0) {
      var row = Math.floor(i / COLS);
      var col = i % COLS;
      var note;
      if (_isPush) {
        note = 36 + row * 8 + col;
      } else if (_lpProgrammerMode) {
        note = _lpNote(row, col);
      } else {
        note = baseMidi() + row * ROW_INTERVAL + col;
      }
      if (note >= 0 && note <= 127) {
        midiOutput.send([0x90, note, 0]);
      }
    }
    _prevLEDState[i] = -1;
  }
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  detectChord, CHORD_DB, TRIAD_DB, TETRAD_DB,
};
