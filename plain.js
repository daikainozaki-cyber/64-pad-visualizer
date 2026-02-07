// ========================================
// PLAIN MODE FUNCTIONS
// ========================================

// Get current chord MIDI notes from any mode (for cross-mode slot save)
function getCurrentChordMidiNotes() {
  if (AppState.mode === 'plain') {
    if (PlainState.activeNotes.size === 0) return null;
    return [...PlainState.activeNotes].sort((a, b) => a - b);
  }
  // Chord/Scale mode
  if (AppState.mode === 'chord' || AppState.mode === 'scale') {
    // Priority 1: Selected voicing box
    if (VoicingState.selectedBoxIdx !== null && VoicingState.lastBoxes[VoicingState.selectedBoxIdx]) {
      let midiNotes = [...VoicingState.lastBoxes[VoicingState.selectedBoxIdx].midiNotes];
      if (BuilderState.bass !== null) {
        const hasBass = midiNotes.some(m => m % 12 === BuilderState.bass);
        if (!hasBass) {
          const lowest = Math.min(...midiNotes);
          let bassMidi = 36 + BuilderState.bass;
          while (bassMidi >= lowest) bassMidi -= 12;
          midiNotes.unshift(bassMidi);
        }
      }
      return midiNotes.sort((a, b) => a - b);
    }
    // Priority 2: Builder chord (no specific voicing box)
    if (BuilderState.root === null || !BuilderState.quality) return null;
    let pcs = getBuilderPCS();
    if (!pcs || pcs.length === 0) return null;
    const rootPC = BuilderState.root;
    let intervals;
    if (VoicingState.shell) {
      intervals = getShellIntervals(BuilderState.quality.pcs, VoicingState.shell, VoicingState.shellExtension, pcs);
      if (!intervals) return null;
    } else {
      if (VoicingState.omit5) pcs = pcs.filter(iv => iv % 12 !== 7);
      if (VoicingState.rootless) pcs = pcs.filter(iv => iv % 12 !== 0);
      if (VoicingState.omit3) pcs = pcs.filter(iv => iv % 12 !== 3 && iv % 12 !== 4);
      if (pcs.length === 0) return null;
      intervals = calcVoicingOffsets(pcs, VoicingState.inversion, VoicingState.drop).voiced;
    }
    const rootMidi = 48 + rootPC;
    const midiNotes = intervals.map(o => rootMidi + o);
    if (BuilderState.bass !== null) midiNotes.unshift(36 + BuilderState.bass);
    return midiNotes.sort((a, b) => a - b);
  }
  return null;
}

// Get chord name for current state (cross-mode)
function getCurrentChordName() {
  if (AppState.mode === 'plain') {
    const notes = getCurrentChordMidiNotes();
    if (!notes || notes.length === 0) return '?';
    const candidates = detectChord(notes);
    return candidates.length > 0 ? candidates[0].name : '?';
  }
  // Chord/Scale mode: use builder name
  const name = getBuilderChordName();
  return name || '?';
}

// Save current chord to Plain memory slot (works from any mode)
// Transfer detected chord from Plain mode to Chord mode builder
function transferToChordMode() {
  if (PlainState.activeNotes.size < 2) return false;
  const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
  const candidates = detectChord(notes);
  if (candidates.length === 0) return false;

  const best = candidates[0];
  const rootPC = best.rootPC;

  // Compute intervals relative to root
  const intervals = [...new Set(notes.map(n => ((n % 12) - rootPC + 12) % 12))].sort((a, b) => a - b);
  const intervalSet = new Set(intervals);

  // Find best matching quality (longest PCS subset match)
  let bestQuality = null;
  let bestQLen = 0;
  for (const row of BUILDER_QUALITIES) {
    for (const q of row) {
      if (!q) continue;
      if (q.pcs.every(iv => intervalSet.has(iv)) && q.pcs.length > bestQLen) {
        bestQLen = q.pcs.length;
        bestQuality = q;
      }
    }
  }
  if (!bestQuality) return false;

  // Find extra intervals → tension candidates
  const qualitySet = new Set(bestQuality.pcs);
  const extras = intervals.filter(iv => !qualitySet.has(iv) && iv !== 0);

  // Try to match tension from DOM buttons
  let matchedTension = null;
  let matchedEl = null;
  if (extras.length > 0) {
    const extraSet = new Set(extras);
    document.querySelectorAll('#tension-grid .tension-btn').forEach(btn => {
      if (matchedTension) return;
      const t = btn._tension;
      if (!t) return;
      const adds = t.mods.add || [];
      if (adds.length === extras.length && adds.every(iv => extraSet.has(iv)) &&
          !t.mods.replace3 && !t.mods.sharp5 && !t.mods.flat5) {
        matchedTension = t;
        matchedEl = btn;
      }
    });
  }

  // Handle bass note (slash chord)
  let bassPC = null;
  const lowestPC = notes[0] % 12;
  if (lowestPC !== rootPC) bassPC = lowestPC;

  // Set BuilderState
  BuilderState.root = rootPC;
  BuilderState.quality = bestQuality;
  BuilderState.tension = matchedTension;
  BuilderState.bass = bassPC;
  resetVoicingSelection();

  // Switch to Chord mode UI
  AppState.mode = 'chord';
  document.getElementById('mode-scale').classList.toggle('active', false);
  document.getElementById('mode-chord').classList.toggle('active', true);
  document.getElementById('mode-plain').classList.toggle('active', false);
  document.getElementById('scale-panel').style.display = 'none';
  document.getElementById('chord-panel').style.display = '';
  document.getElementById('plain-panel').style.display = 'none';

  // Update builder UI
  highlightPianoKey('piano-keyboard', rootPC);
  highlightQuality(bestQuality);
  clearTensionSelection();
  if (matchedTension && matchedEl) matchedEl.classList.add('selected');
  updateControlsForQuality(bestQuality);
  if (bassPC !== null) highlightPianoKey('onchord-keyboard', bassPC);
  setBuilderStep(2);
  render();
  return true;
}

function saveToSelectedSlot() {
  if (PlainState.currentSlot !== null) {
    saveToPlainSlot(PlainState.currentSlot);
  }
}

function saveToPlainSlot(idx) {
  if (idx < 0 || idx >= 13) return false;
  const midiNotes = getCurrentChordMidiNotes();
  if (!midiNotes || midiNotes.length === 0) return false;
  const chordName = getCurrentChordName();
  PlainState.memory[idx] = { midiNotes: [...midiNotes], chordName };
  updateMemorySlotUI();
  // Visual feedback: flash slot button (if visible)
  const slotBtns = document.querySelectorAll('.slot-btn');
  if (slotBtns[idx]) {
    slotBtns[idx].style.background = '#4CAF50';
    slotBtns[idx].style.transition = 'background 0.3s';
    setTimeout(() => { slotBtns[idx].style.background = ''; }, 400);
  }
  // Toast notification (especially useful in non-Plain modes)
  const toast = document.getElementById('slot-save-toast');
  if (toast) {
    toast.textContent = `Slot ${idx + 1} ← ${chordName}`;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
  }
  return true;
}

function togglePlainNote(midi) {
  // idle時はcaptureを自動開始
  if (PlainState.subMode === 'idle') {
    PlainState.subMode = 'capture';
    PlainState.captureIndex = findNextEmptySlot(0);
    updatePlainUI();
  }
  if (PlainState.activeNotes.has(midi)) {
    PlainState.activeNotes.delete(midi);
    noteOff(midi);
  } else {
    PlainState.activeNotes.add(midi);
    noteOn(midi, undefined, true);
  }
  // editモード時は自動保存
  if (PlainState.subMode === 'edit' && PlainState.currentSlot !== null) {
    savePlainSlot(PlainState.currentSlot);
  }
  updatePlainDisplay();
  render();
}

function plainCapture() {
  if (PlainState.subMode === 'idle') {
    // idle → capture: キャプチャ開始
    PlainState.subMode = 'capture';
    PlainState.captureIndex = findNextEmptySlot(0);
    PlainState.activeNotes.forEach(m => noteOff(m));
    PlainState.activeNotes.clear();
    PlainState.currentSlot = null;
  } else if (PlainState.subMode === 'capture') {
    // capture中にCapture押下: 現在のノートを保存して次へ
    if (PlainState.activeNotes.size > 0) {
      savePlainSlot(PlainState.captureIndex);
      PlainState.captureIndex = findNextEmptySlot(PlainState.captureIndex + 1);
    }
    PlainState.activeNotes.forEach(m => noteOff(m));
    PlainState.activeNotes.clear();
    PlainState.currentSlot = null;
    // 全スロット埋まったら自動でidle
    if (PlainState.captureIndex >= 13) {
      PlainState.subMode = 'idle';
    }
  } else if (PlainState.subMode === 'edit') {
    // edit → capture: 編集終了してキャプチャへ
    PlainState.subMode = 'capture';
    PlainState.captureIndex = findNextEmptySlot(0);
    PlainState.activeNotes.forEach(m => noteOff(m));
    PlainState.activeNotes.clear();
    PlainState.currentSlot = null;
    if (PlainState.captureIndex >= 13) {
      PlainState.subMode = 'idle';
    }
  }
  updatePlainUI();
  updatePlainDisplay();
  render();
}

function plainEnd() {
  if (PlainState.subMode === 'capture' && PlainState.activeNotes.size > 0) {
    // 未保存のノートがあれば保存
    savePlainSlot(PlainState.captureIndex);
  }
  PlainState.subMode = 'idle';
  PlainState.activeNotes.forEach(m => noteOff(m));
  PlainState.activeNotes.clear();
  PlainState.currentSlot = null;
  updatePlainUI();
  updatePlainDisplay();
  render();
}

function plainEditSlot(idx) {
  const slot = PlainState.memory[idx];
  if (!slot) return;
  // 既存のノートをクリア
  PlainState.activeNotes.forEach(m => noteOff(m));
  PlainState.activeNotes.clear();
  // スロットのノートを読み込み
  slot.midiNotes.forEach(m => PlainState.activeNotes.add(m));
  PlainState.currentSlot = idx;
  PlainState.subMode = 'edit';
  playMidiNotes(slot.midiNotes, 1.0);
  updatePlainUI();
  updatePlainDisplay();
  render();
}

function findNextEmptySlot(from) {
  for (let i = from; i < 13; i++) {
    if (!PlainState.memory[i]) return i;
  }
  return 13; // 全部埋まっている
}

function updatePlainUI() {
  const statusEl = document.getElementById('plain-status-text');
  const captureBtn = document.getElementById('btn-plain-capture');
  const endBtn = document.getElementById('btn-plain-end');
  if (!statusEl) return;
  if (PlainState.subMode === 'idle') {
    statusEl.textContent = 'Press Capture to start building chords';
    statusEl.style.color = 'var(--text-muted)';
    captureBtn.textContent = 'Capture';
    captureBtn.style.background = '#2a6e2a';
    endBtn.style.display = 'none';
  } else if (PlainState.subMode === 'capture') {
    const slotNum = Math.min(PlainState.captureIndex + 1, 13);
    statusEl.textContent = 'Capturing: Slot ' + slotNum + '/13 — Click pads, then Capture to save';
    statusEl.style.color = '#4a4';
    captureBtn.textContent = 'Capture (' + slotNum + ')';
    captureBtn.style.background = '#2a6e2a';
    endBtn.style.display = '';
  } else if (PlainState.subMode === 'edit') {
    const slotNum = PlainState.currentSlot !== null ? PlainState.currentSlot + 1 : '?';
    statusEl.textContent = 'Editing: Slot ' + slotNum + ' — Click pads to modify';
    statusEl.style.color = 'var(--accent)';
    captureBtn.textContent = 'Capture';
    captureBtn.style.background = '#2a6e2a';
    endBtn.style.display = '';
  }
  updateMemorySlotUI();
}

function clearPlainNotes() {
  PlainState.activeNotes.forEach(m => noteOff(m));
  PlainState.activeNotes.clear();
  if (PlainState.subMode === 'edit' && PlainState.currentSlot !== null) {
    // editモードでクリア → スロットも空に
    PlainState.memory[PlainState.currentSlot] = null;
    PlainState.subMode = 'idle';
    PlainState.currentSlot = null;
    updatePlainUI();
  }
  updatePlainDisplay();
  render();
}

function playPlainNotes() {
  const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
  if (notes.length > 0) playMidiNotes(notes, 1.0);
}

// Play memory slots sequentially
var _slotPlayTimer = null;
function playMemorySlots() {
  var btn = document.getElementById('btn-play-slots');
  // If already playing, stop
  if (_slotPlayTimer) { stopSlotPlayback(); return; }
  var slots = [];
  // Selected slot → play only that one, otherwise → play all
  if (PlainState.currentSlot !== null && PlainState.memory[PlainState.currentSlot]) {
    slots.push({ index: PlainState.currentSlot, notes: PlainState.memory[PlainState.currentSlot].midiNotes });
  } else {
    PlainState.memory.forEach(function(s, i) { if (s) slots.push({ index: i, notes: s.midiNotes }); });
  }
  if (slots.length === 0) return;
  btn.textContent = 'Stop ■';
  btn.style.background = '#6e2a2a';
  btn.style.color = '#fff';
  var pos = 0;
  function playNext() {
    if (pos >= slots.length) { stopSlotPlayback(); return; }
    var slot = slots[pos];
    // Highlight current slot
    PlainState.currentSlot = slot.index;
    updateMemorySlotUI();
    // Play notes
    slot.notes.forEach(function(m) { noteOn(m, undefined, true); });
    // Schedule noteOff + next
    _slotPlayTimer = setTimeout(function() {
      slot.notes.forEach(function(m) { noteOff(m); });
      pos++;
      if (pos < slots.length) {
        _slotPlayTimer = setTimeout(playNext, 150); // short gap between chords
      } else {
        stopSlotPlayback();
      }
    }, 1500); // 1.5 seconds per chord
  }
  playNext();
}
function stopSlotPlayback() {
  if (_slotPlayTimer) { clearTimeout(_slotPlayTimer); _slotPlayTimer = null; }
  noteOffAll();
  var btn = document.getElementById('btn-play-slots');
  if (btn) { btn.textContent = 'Play ▶'; btn.style.background = ''; btn.style.color = ''; }
  PlainState.currentSlot = null;
  updateMemorySlotUI();
}

function updatePlainDisplay() {
  const nameEl = document.getElementById('plain-chord-name');
  const altsEl = document.getElementById('plain-chord-alts');
  const notesEl = document.getElementById('plain-notes-display');
  if (!nameEl) return;
  const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
  if (notes.length === 0) {
    nameEl.textContent = '';
    altsEl.innerHTML = '';
    notesEl.textContent = '';
    return;
  }
  const noteNames = notes.map(n => NOTE_NAMES_SHARP[n % 12]);
  const candidates = detectChord(notes);
  if (candidates.length > 0) {
    nameEl.textContent = candidates[0].name;
    let altHtml = '';
    if (candidates.length > 1) {
      candidates.slice(1).forEach(c => {
        altHtml += '<span style="font-size:0.6rem;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,0.08);color:var(--text-muted);">' + c.name + '</span>';
      });
    }
    altsEl.innerHTML = altHtml;
  } else {
    nameEl.textContent = noteNames.join(' ');
    altsEl.innerHTML = '';
  }
  notesEl.textContent = 'Notes: ' + noteNames.join(' ');
  updateMemorySlotUI();
}

function savePlainSlot(idx) {
  if (idx >= 13) return;
  if (PlainState.activeNotes.size === 0) return;
  const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
  const candidates = detectChord(notes);
  const chordName = candidates.length > 0 ? candidates[0].name : notes.map(n => NOTE_NAMES_SHARP[n % 12]).join(' ');
  PlainState.memory[idx] = { midiNotes: notes, chordName };
  PlainState.currentSlot = idx;
  updateMemorySlotUI();
}

function recallPlainSlot(idx) {
  const slot = PlainState.memory[idx];
  if (!slot) {
    // Empty slot: select as target (don't save yet, wait for Capture)
    PlainState.currentSlot = idx;
    updateMemorySlotUI();
    const toast = document.getElementById('slot-save-toast');
    if (toast) {
      toast.textContent = `Slot ${idx + 1} selected`;
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
    }
    return;
  }
  // Filled slot: switch to Plain and edit
  if (AppState.mode !== 'plain') {
    setMode('plain');
  }
  plainEditSlot(idx);
}

function initMemorySlots() {
  const container = document.getElementById('memory-slots');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 13; i++) {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.dataset.slot = i;
    btn.style.cssText = 'font-size:0.7rem;padding:4px 6px;background:var(--surface);color:var(--text-muted);border:1px solid var(--border);border-radius:4px;cursor:pointer;transition:all 0.15s;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    btn.textContent = (i + 1) + ': Empty';
    btn.onclick = (ev) => {
      if (ev.shiftKey && PlainState.memory[i]) {
        // Shift+click: delete slot
        PlainState.memory[i] = null;
        if (PlainState.currentSlot === i) PlainState.currentSlot = null;
        updateMemorySlotUI();
        const toast = document.getElementById('slot-save-toast');
        if (toast) {
          toast.textContent = `Slot ${i + 1} cleared`;
          toast.style.opacity = '1';
          clearTimeout(toast._timer);
          toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
        }
        return;
      }
      recallPlainSlot(i);
    };
    container.appendChild(btn);
  }
}

function updateMemorySlotUI() {
  const container = document.getElementById('memory-slots');
  if (!container) return;
  const btns = container.querySelectorAll('.slot-btn');
  btns.forEach((btn, i) => {
    const slot = PlainState.memory[i];
    const label = String(i + 1);
    const isCaptureTarget = PlainState.subMode === 'capture' && i === PlainState.captureIndex;
    const isCurrent = PlainState.currentSlot === i;
    if (slot) {
      btn.textContent = label + ': ' + slot.chordName;
      btn.style.color = 'var(--text)';
      btn.style.borderColor = isCurrent ? 'var(--accent)' : 'var(--border)';
      btn.style.background = isCurrent ? 'rgba(74,158,255,0.15)' : 'var(--surface)';
    } else {
      btn.textContent = label + ': Empty';
      const isSelected = isCurrent || isCaptureTarget;
      btn.style.color = isSelected ? '#4a4' : 'var(--text-muted)';
      btn.style.borderColor = isSelected ? '#4a4' : 'var(--border)';
      btn.style.background = isSelected ? 'rgba(74,170,74,0.1)' : 'var(--surface)';
    }
  });
  // Save button visibility
  const saveBtn = document.getElementById('btn-slot-save');
  if (saveBtn) {
    saveBtn.style.display = PlainState.currentSlot !== null ? '' : 'none';
  }
  // Export button labels: show what will be exported
  const slotCount = PlainState.memory.filter(s => s !== null).length;
  const sel = PlainState.currentSlot !== null && PlainState.memory[PlainState.currentSlot];
  const midiLabel = sel ? 'MIDI: ' + sel.chordName : 'MIDI Export All' + (slotCount ? ' (' + slotCount + ')' : '');
  const chsLabel = sel ? 'CHS: ' + sel.chordName : 'CHS Export All' + (slotCount ? ' (' + slotCount + ')' : '');
  ['btn-midi-export-plain', 'btn-midi-export-mem'].forEach(function(id) { var b = document.getElementById(id); if (b) b.textContent = midiLabel; });
  ['btn-chs-export-plain', 'btn-chs-export-mem'].forEach(function(id) { var b = document.getElementById(id); if (b) b.textContent = chsLabel; });
  // Play button label (only update if not currently playing)
  if (!_slotPlayTimer) {
    var playBtn = document.getElementById('btn-play-slots');
    if (playBtn) playBtn.textContent = sel ? 'Play: ' + sel.chordName : 'Play All ▶' + (slotCount ? ' (' + slotCount + ')' : '');
  }
}

// SMF Type 0 MIDI export (selected slot → single, no selection → all)
function exportPlainMidi() {
  let slots;
  if (PlainState.currentSlot !== null && PlainState.memory[PlainState.currentSlot]) {
    slots = [PlainState.memory[PlainState.currentSlot]];
  } else {
    slots = PlainState.memory.filter(s => s !== null);
  }
  if (slots.length === 0) { const t = document.getElementById('slot-save-toast'); t.textContent = 'No chords in memory slots'; t.style.opacity = '1'; setTimeout(() => t.style.opacity = '0', 2000); return; }
  const ticksPerBeat = 480;
  const track = [];

  // ASCII-safe chord name for MIDI meta events (△→M for DAW compatibility)
  function midiSafe(name) { return name.replace(/△/g, 'M'); }
  // Track name meta event (FF 03): chord names joined by " | "
  const titleStr = slots.map(s => midiSafe(s.chordName)).join(' | ');
  const titleBytes = new TextEncoder().encode(titleStr);
  track.push(0, 0xFF, 0x03);
  toVLQ(titleBytes.length).forEach(b => track.push(b));
  titleBytes.forEach(b => track.push(b));

  // Tempo: 120 BPM (500000 microseconds per beat)
  track.push(0, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20);

  slots.forEach((slot) => {
    // Marker meta event (FF 06): chord name for this bar
    const markerBytes = new TextEncoder().encode(midiSafe(slot.chordName));
    track.push(0, 0xFF, 0x06);
    toVLQ(markerBytes.length).forEach(b => track.push(b));
    markerBytes.forEach(b => track.push(b));

    // Note on (delta=0 for all notes in chord)
    slot.midiNotes.forEach((note, ni) => {
      track.push(0); // delta
      track.push(0x90, note & 0x7F, 100); // noteOn ch0 vel100
    });
    // Note off after 1 bar (4 beats = whole note)
    slot.midiNotes.forEach((note, ni) => {
      if (ni === 0) {
        const vl = toVLQ(ticksPerBeat * 4);
        vl.forEach(b => track.push(b));
      } else {
        track.push(0); // delta 0
      }
      track.push(0x80, note & 0x7F, 0); // noteOff
    });
  });
  // End of track
  track.push(0, 0xFF, 0x2F, 0x00);

  const trackBytes = new Uint8Array(track);
  // Header: MThd
  const header = new Uint8Array([
    0x4D, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // length=6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF, // ticks
    0x4D, 0x54, 0x72, 0x6B, // MTrk
    (trackBytes.length >> 24) & 0xFF,
    (trackBytes.length >> 16) & 0xFF,
    (trackBytes.length >> 8) & 0xFF,
    trackBytes.length & 0xFF,
  ]);
  // Combine header + track into single array
  const full = new Uint8Array(header.length + trackBytes.length);
  full.set(header, 0);
  full.set(trackBytes, header.length);
  const fileName = slots.map(s => s.chordName).join('_').replace(/△/g, 'M').replace(/[\/\\:*?"<>|#]/g, '').replace(/_+/g, '_') || 'pad-chords';
  downloadBinary(full, fileName + '.mid', 'audio/midi');
}

// Download binary: Safari→share sheet, HTTPS+Chrome→showSaveFilePicker, fallback→link in toast
function downloadBinary(uint8Array, filename, mimeType) {
  const blob = new Blob([uint8Array], { type: mimeType || 'application/octet-stream' });
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isHTTPS = location.protocol === 'https:';
  // Safari: share sheet
  if (isSafari && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {});
      return;
    }
  }
  // HTTPS + Chrome: showSaveFilePicker (with 3s timeout for headless/broken environments)
  if (isHTTPS && window.showSaveFilePicker) {
    const ext = filename.split('.').pop();
    const types = ext === 'mid' ? [{ description: 'MIDI', accept: { 'audio/midi': ['.mid'] } }]
      : ext === 'chs' ? [{ description: 'Chordcat', accept: { 'application/octet-stream': ['.chs'] } }]
      : [];
    var pickerDone = false;
    var pickerTimer = setTimeout(function() { if (!pickerDone) { pickerDone = true; downloadBinaryFallback(blob, filename); } }, 3000);
    showSaveFilePicker({ suggestedName: filename, types: types }).then(function(handle) {
      pickerDone = true; clearTimeout(pickerTimer);
      return handle.createWritable().then(function(w) { return w.write(blob).then(function() { return w.close(); }); });
    }).catch(function(e) {
      if (!pickerDone && e.name !== 'AbortError') { pickerDone = true; clearTimeout(pickerTimer); downloadBinaryFallback(blob, filename); }
    });
    return;
  }
  // Fallback: download link in toast
  downloadBinaryFallback(blob, filename);
}
function downloadBinaryFallback(blob, filename) {
  const url = URL.createObjectURL(blob);
  const toast = document.getElementById('slot-save-toast');
  toast.style.pointerEvents = 'auto';
  toast.innerHTML = '<a href="' + url + '" download="' + filename
    + '" style="color:#4fc3f7;text-decoration:underline;font-size:1.1rem;">'
    + filename + ' ⬇</a>';
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; toast.style.pointerEvents = 'none'; URL.revokeObjectURL(url); }, 15000);
}

function toVLQ(value) {
  if (value < 0x80) return [value];
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  return bytes.reverse();
}

// Chordcat .chs export (4096 bytes binary)
function exportPlainChs() {
  const filledSlots = PlainState.memory.filter(s => s !== null);
  if (filledSlots.length === 0) { const t = document.getElementById('slot-save-toast'); t.textContent = 'No chords in memory slots'; t.style.opacity = '1'; setTimeout(() => t.style.opacity = '0', 2000); return; }
  const buf = new Uint8Array(4096); // 全体ゼロ初期化
  // マジックバイト
  buf[0] = 0x83; buf[1] = 0x49;
  // ヘッダ
  buf[0x08] = 0x10;
  // 13スロット × 8バイト（オフセット0x10〜0x77）
  for (let i = 0; i < 13; i++) {
    const slot = PlainState.memory[i];
    if (!slot) continue;
    const offset = 0x10 + i * 8;
    // 5音固定、高→低の降順で格納（バイト2〜6）
    const notes = [...slot.midiNotes].sort((a, b) => b - a); // 降順
    // 5音まで。足りなければ0パディング（バイト2～6に配置）
    for (let j = 0; j < 5; j++) {
      buf[offset + 2 + j] = j < notes.length ? (notes[j] & 0x7F) : 0;
    }
  }
  // Chordset名（オフセット0x78〜0x87、NULL終端）
  const name = 'PadExplorer';
  for (let i = 0; i < name.length && i < 15; i++) {
    buf[0x78 + i] = name.charCodeAt(i);
  }
  // フラグ（オフセット0x88）
  buf[0x88] = 0x01; buf[0x8C] = 0x01;
  // ダウンロード
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  downloadBinary(buf, 'PadExplorer_' + ts + '.chs', 'application/octet-stream');
}

