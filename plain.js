// ========================================
// PLAIN MODE FUNCTIONS
// ========================================

// --- Undo stack for memory slots ---
const undoStack = [];
const MAX_UNDO = 30;

// ========================================
// BANK MANAGEMENT (v2.50)
// ========================================

function switchBank(direction) {
  if (BankState.banks.length <= 1) return;
  syncMemoryToActiveBank();
  const idx = BankState.banks.findIndex(b => b.id === BankState.activeBankId);
  const next = (idx + direction + BankState.banks.length) % BankState.banks.length;
  loadBank(BankState.banks[next].id);
}

function loadBank(bankId) {
  stopSlotPlayback();
  PlainState.activeNotes.forEach(m => noteOff(m));
  PlainState.activeNotes.clear();
  PlainState.subMode = 'idle';
  PlainState.currentSlot = null;
  PlainState.captureIndex = 0;
  undoStack.length = 0;
  BankState.activeBankId = bankId;
  loadBankMemory();
  updateMemorySlotUI();
  if (typeof updatePlainUI === 'function') updatePlainUI();
  if (typeof updatePlainDisplay === 'function') updatePlainDisplay();
  if (typeof render === 'function') render();
  saveAppSettings();
}

function addBank() {
  if (BankState.banks.length >= 16) {
    var toast = document.getElementById('slot-save-toast');
    if (toast) { toast.textContent = t('bank.limit_reached'); toast.style.opacity = '1'; clearTimeout(toast._timer); toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 1500); }
    return;
  }
  syncMemoryToActiveBank();
  var newBank = { id: String(Date.now()), name: 'Bank ' + (BankState.banks.length + 1), memory: Array(16).fill(null) };
  BankState.banks.push(newBank);
  loadBank(newBank.id);
}

function duplicateBank() {
  if (BankState.banks.length >= 16) {
    var toast = document.getElementById('slot-save-toast');
    if (toast) { toast.textContent = t('bank.limit_reached'); toast.style.opacity = '1'; clearTimeout(toast._timer); toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 1500); }
    return;
  }
  syncMemoryToActiveBank();
  var src = getActiveBank();
  var newBank = {
    id: String(Date.now()),
    name: src.name + ' Copy',
    memory: src.memory.map(function(s) { return s ? { midiNotes: [].concat(s.midiNotes), chordName: s.chordName } : null; }),
  };
  BankState.banks.push(newBank);
  loadBank(newBank.id);
}

function deleteBank() {
  if (BankState.banks.length <= 1) {
    var toast = document.getElementById('slot-save-toast');
    if (toast) { toast.textContent = t('bank.cannot_delete_last'); toast.style.opacity = '1'; clearTimeout(toast._timer); toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 1500); }
    return;
  }
  var bank = getActiveBank();
  var msg = t('bank.confirm_delete').replace('{name}', bank.name);
  if (!confirm(msg)) return;
  var idx = BankState.banks.findIndex(function(b) { return b.id === bank.id; });
  BankState.banks.splice(idx, 1);
  var nextIdx = Math.min(idx, BankState.banks.length - 1);
  loadBank(BankState.banks[nextIdx].id);
}

function renameBank() {
  var bank = getActiveBank();
  var msg = t('bank.rename_prompt');
  var newName = prompt(msg, bank.name);
  if (newName === null) return;
  newName = newName.trim().slice(0, 30);
  if (newName.length === 0) return;
  bank.name = newName;
  updateBankUI();
  saveAppSettings();
}

function toggleBankMenu() {
  var popup = document.getElementById('bank-popup');
  if (!popup) return;
  popup.style.display = popup.style.display === 'none' ? '' : 'none';
}

function updateBankUI() {
  var nameEl = document.getElementById('bank-name');
  if (!nameEl) return;
  var bank = getActiveBank();
  if (!bank) return;
  var count = PlainState.memory.filter(function(s) { return s !== null; }).length;
  nameEl.textContent = bank.name + ' (' + count + '/16)';
  nameEl.title = t('bank.click_rename');
}

function pushUndoState() {
  undoStack.push(PlainState.memory.map(s => s ? { midiNotes: [...s.midiNotes], chordName: s.chordName } : null));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undoMemory() {
  if (undoStack.length === 0) return;
  PlainState.memory = undoStack.pop();
  PlainState.currentSlot = null;
  updateMemorySlotUI();
  const toast = document.getElementById('slot-save-toast');
  if (toast) {
    toast.textContent = t('notify.undo');
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
  }
  saveAppSettings();
}

// Get current chord MIDI notes from any mode (for cross-mode slot save)
function getCurrentChordMidiNotes() {
  if (AppState.mode === 'input') {
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
          let bassMidi = 36 + BuilderState.bass + AppState.octaveShift * 12;
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
    const octOff = AppState.octaveShift * 12;
    const rootMidi = 48 + rootPC + octOff;
    const midiNotes = intervals.map(o => rootMidi + o);
    if (BuilderState.bass !== null) midiNotes.unshift(36 + BuilderState.bass + octOff);
    return midiNotes.sort((a, b) => a - b);
  }
  return null;
}

// Get chord name for current state (cross-mode)
function getCurrentChordName() {
  if (AppState.mode === 'input') {
    const notes = getCurrentChordMidiNotes();
    if (!notes || notes.length === 0) return '?';
    const candidates = detectChord(notes);
    return candidates.length > 0 ? candidates[0].name : '?';
  }
  // Chord/Scale mode: use builder name
  const name = getBuilderChordName();
  return name || '?';
}

// Apply arbitrary MIDI notes to BuilderState (stays in Chord mode)
// Used by pad toggle: pressing a pad updates the chord builder panel directly
function applyNotesToBuilder(midiNotes, forcedRootPC = null) {
  if (!midiNotes || midiNotes.length < 1) return false;
  const notes = [...midiNotes].sort((a, b) => a - b);
  const candidates = detectChord(notes);
  if (candidates.length === 0) return false;

  const best = forcedRootPC !== null
    ? (candidates.find(c => c.rootPC === forcedRootPC) || candidates[0])
    : candidates[0];
  const rootPC = best.rootPC;

  const intervals = [...new Set(notes.map(n => ((n % 12) - rootPC + 12) % 12))].sort((a, b) => a - b);
  const intervalSet = new Set(intervals);

  // Find best matching quality
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

  // Find matching tension from remaining intervals
  const qualitySet = new Set(bestQuality.pcs);
  const extras = intervals.filter(iv => !qualitySet.has(iv) && iv !== 0);
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

  BuilderState.root = rootPC;
  BuilderState.quality = bestQuality;
  BuilderState.tension = matchedTension;
  BuilderState.bass = null; // no auto-bass from pad input
  resetVoicingSelection();

  // Update builder UI
  highlightPianoKey('piano-keyboard', rootPC);
  highlightQuality(bestQuality);
  clearTensionSelection();
  if (matchedTension && matchedEl) matchedEl.classList.add('selected');
  updateControlsForQuality(bestQuality);
  setBuilderStep(matchedTension ? 3 : 2);
  return true;
}

// Transfer a detected chord candidate to Chord Builder (V2.10)
// Click on a chord name in #midi-detect to invoke this
function transferDetectedCandidate(idx, el) {
  if (!lastDetectedCandidates || !lastDetectedCandidates[idx] || !lastDetectedNotes || !lastDetectedNotes.length) return;
  const candidate = lastDetectedCandidates[idx];
  const notesToApply = [...lastDetectedNotes]; // capture before clearInstrumentInput overwrites lastDetectedNotes
  if (el) el.classList.add('detect-flashing');
  setTimeout(() => {
    if (AppState.mode !== 'chord') {
      AppState.mode = 'chord';
      document.getElementById('mode-scale').classList.toggle('active', false);
      document.getElementById('mode-chord').classList.toggle('active', true);
      document.getElementById('mode-input').classList.toggle('active', false);
      document.getElementById('scale-panel').style.display = 'none';
      document.getElementById('chord-panel').style.display = '';
      document.getElementById('input-panel').style.display = 'none';
    }
    padExtNotes.clear();
    document.getElementById('midi-detect').innerHTML = '';
    applyNotesToBuilder(notesToApply, candidate.rootPC);
    requestAnimationFrame(() => {
      const selectedQ = document.querySelector('.quality-btn.selected');
      if (selectedQ) {
        selectedQ.classList.add('transfer-flash');
        selectedQ.addEventListener('animationend', () => selectedQ.classList.remove('transfer-flash'), { once: true });
      }
    });
  }, 160);
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
  document.getElementById('mode-input').classList.toggle('active', false);
  document.getElementById('scale-panel').style.display = 'none';
  document.getElementById('chord-panel').style.display = '';
  document.getElementById('input-panel').style.display = 'none';

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
  if (idx < 0 || idx >= 16) return false;
  const midiNotes = getCurrentChordMidiNotes();
  if (!midiNotes || midiNotes.length === 0) return false;
  const chordName = getCurrentChordName();
  pushUndoState();
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
    toast.textContent = t('notify.slot_saved', {slot: idx + 1, chord: chordName});
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
  }
  saveAppSettings();
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
    if (PlainState.captureIndex >= 16) {
      PlainState.subMode = 'idle';
    }
  } else if (PlainState.subMode === 'edit') {
    // edit → capture: 編集終了してキャプチャへ
    PlainState.subMode = 'capture';
    PlainState.captureIndex = findNextEmptySlot(0);
    PlainState.activeNotes.forEach(m => noteOff(m));
    PlainState.activeNotes.clear();
    PlainState.currentSlot = null;
    if (PlainState.captureIndex >= 16) {
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
  for (let i = from; i < 16; i++) {
    if (!PlainState.memory[i]) return i;
  }
  return 16; // 全部埋まっている
}

function updatePlainUI() {
  const statusEl = document.getElementById('plain-status-text');
  const captureBtn = document.getElementById('btn-plain-capture');
  const endBtn = document.getElementById('btn-plain-end');
  if (!statusEl) return;
  if (PlainState.subMode === 'idle') {
    statusEl.textContent = t('input.status_idle');
    statusEl.style.color = 'var(--text-muted)';
    captureBtn.textContent = 'Capture';
    captureBtn.style.background = '#2a6e2a';
    endBtn.style.display = 'none';
  } else if (PlainState.subMode === 'capture') {
    const slotNum = Math.min(PlainState.captureIndex + 1, 16);
    statusEl.textContent = t('input.status_capturing', {slot: slotNum});
    statusEl.style.color = '#4a4';
    captureBtn.textContent = 'Capture (' + slotNum + ')';
    captureBtn.style.background = '#2a6e2a';
    endBtn.style.display = '';
  } else if (PlainState.subMode === 'edit') {
    const slotNum = PlainState.currentSlot !== null ? PlainState.currentSlot + 1 : '?';
    statusEl.textContent = t('input.status_editing', {slot: slotNum});
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
    pushUndoState();
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
  btn.textContent = t('memory.stop');
  btn.style.background = '#6e2a2a';
  btn.style.color = '#fff';
  var pos = 0;
  function playNext() {
    if (pos >= slots.length) { stopSlotPlayback(); return; }
    var slot = slots[pos];
    // Highlight current slot
    PlainState.currentSlot = slot.index;
    updateMemorySlotUI();
    // Show chord on pad grid + staff
    PlainState.activeNotes = new Set(slot.notes);
    updatePlainDisplay();
    render();
    highlightPlaybackPads(slot.notes);
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
  PlainState.activeNotes.clear();
  updatePlainDisplay();
  highlightPlaybackPads(null);
  render();
  var btn = document.getElementById('btn-play-slots');
  if (btn) { btn.textContent = t('memory.play_all'); btn.style.background = ''; btn.style.color = ''; }
  PlainState.currentSlot = null;
  updateMemorySlotUI();
}

function updatePlainDisplay() {
  const detectEl = document.getElementById('midi-detect');
  if (!detectEl) return;
  const plainNotes = [...PlainState.activeNotes].sort((a, b) => a - b);
  // Merge instrument input (guitar/bass/piano) + plain active notes for detection
  let notes = plainNotes;
  if (instrumentInputActive) {
    const instrNotes = getAllInputMidiNotes();
    const merged = new Set([...instrNotes, ...plainNotes]);
    notes = [...merged].sort((a, b) => a - b);
  }
  if (notes.length === 0) {
    detectEl.innerHTML = '';
    lastDetectedNotes = [];
    lastDetectedCandidates = [];
    updateMemorySlotUI();
    return;
  }
  const noteNames = notes.map(n => NOTE_NAMES_SHARP[n % 12]);
  const candidates = detectChord(notes);
  if (candidates.length > 0) {
    let html = '<span class="detect-candidate-best" onclick="transferDetectedCandidate(0,this)">' + candidates[0].name + '</span>';
    if (candidates.length > 1) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">';
      candidates.slice(1).forEach((c, i) => {
        html += '<span class="detect-candidate" onclick="transferDetectedCandidate(' + (i + 1) + ',this)">' + c.name + '</span>';
      });
      html += '</div>';
    }
    html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">' + t('input.notes_label') + noteNames.join(' ') + '</div>';
    detectEl.innerHTML = html;
  } else {
    detectEl.textContent = noteNames.join(' ');
  }
  lastDetectedNotes = notes;
  lastDetectedCandidates = candidates;
  updateMemorySlotUI();
}

function savePlainSlot(idx) {
  if (idx >= 16) return;
  // Merge instrument input + plain active notes
  let notes = [...PlainState.activeNotes].sort((a, b) => a - b);
  if (instrumentInputActive) {
    const instrNotes = getAllInputMidiNotes();
    const merged = new Set([...instrNotes, ...notes]);
    notes = [...merged].sort((a, b) => a - b);
  }
  if (notes.length === 0) return;
  const candidates = detectChord(notes);
  const chordName = candidates.length > 0 ? candidates[0].name : notes.map(n => NOTE_NAMES_SHARP[n % 12]).join(' ');
  pushUndoState();
  PlainState.memory[idx] = { midiNotes: notes, chordName };
  PlainState.currentSlot = idx;
  updateMemorySlotUI();
}

function recallPlainSlot(idx) {
  const slot = PlainState.memory[idx];
  // Perform view: clicking a filled slot triggers playback
  if (memoryViewMode === 'perform') {
    if (slot) {
      performPadTap(idx);
    }
    return;
  }
  // Chord/Scale mode: just select slot as target (auto-save on next chord change)
  if (AppState.mode === 'chord' || AppState.mode === 'scale') {
    PlainState.currentSlot = idx;
    updateMemorySlotUI();
    const toast = document.getElementById('slot-save-toast');
    if (toast) {
      toast.textContent = t('notify.slot_selected', {slot: idx + 1});
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
    }
    return;
  }
  if (!slot) {
    // Empty slot in Plain: select as target
    PlainState.currentSlot = idx;
    updateMemorySlotUI();
    const toast = document.getElementById('slot-save-toast');
    if (toast) {
      toast.textContent = t('notify.slot_selected', {slot: idx + 1});
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
    }
    return;
  }
  // Filled slot in Plain: edit
  if (AppState.mode !== 'input') {
    setMode('input');
  }
  plainEditSlot(idx);
}

function initMemorySlots() {
  const container = document.getElementById('memory-slots');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.dataset.slot = i;
    btn.textContent = String(i + 1);
    btn.draggable = true;
    btn.addEventListener('dragstart', (ev) => {
      if (!PlainState.memory[i]) { ev.preventDefault(); return; }
      // Desktop To DAW mode: block HTML drag (OS drag via mousedown)
      if (_isDesktop && PlainState.toDAW) { ev.preventDefault(); return; }
      ev.dataTransfer.setData('text/plain', String(i));
      ev.dataTransfer.effectAllowed = 'copyMove';
    });
    // Desktop To DAW mode: drag slot → MIDI to DAW (no cmd needed)
    btn.addEventListener('mousedown', (function(idx) {
      return function(e) {
        if (!_isDesktop || !PlainState.toDAW) return;
        if (!PlainState.memory[idx]) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        // Determine what to drag
        var slots = [];
        if (PlainState.dawSelection.size > 0 && PlainState.dawSelection.has(idx)) {
          PlainState.dawSelection.forEach(function(si) {
            if (PlainState.memory[si]) slots.push(PlainState.memory[si]);
          });
        } else {
          slots.push(PlainState.memory[idx]);
        }
        if (slots.length === 0) return;
        if (slots.length === 1) {
          _juceInvoke("startMidiDrag", [slots[0].midiNotes, slots[0].chordName]);
        } else {
          var data = slots.map(function(s) { return { notes: s.midiNotes, name: s.chordName }; });
          _juceInvoke("startMidiDragAll", [data]);
        }
        var sx = e.clientX, sy = e.clientY, fired = false;
        function onMove(ev) {
          if (fired) return;
          var dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (dx * dx + dy * dy > 64) {
            fired = true;
            _juceInvoke("executeMidiDrag", []);
          }
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
    })(i));
    // D&D: accept drops from other slots (swap/move)
    btn.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      btn.classList.add('drag-over');
    });
    btn.addEventListener('dragleave', () => {
      btn.classList.remove('drag-over');
    });
    btn.addEventListener('drop', (ev) => {
      ev.preventDefault();
      btn.classList.remove('drag-over');
      const srcIdx = parseInt(ev.dataTransfer.getData('text/plain'));
      if (isNaN(srcIdx) || srcIdx === i) return;
      // Swap or move
      pushUndoState();
      const temp = PlainState.memory[i];
      PlainState.memory[i] = PlainState.memory[srcIdx];
      PlainState.memory[srcIdx] = temp;
      updateMemorySlotUI();
      saveAppSettings();
    });
    btn.onclick = (ev) => {
      if (ev.shiftKey && PlainState.memory[i]) {
        // Shift+click: delete slot
        pushUndoState();
        PlainState.memory[i] = null;
        if (PlainState.currentSlot === i) PlainState.currentSlot = null;
        PlainState.dawSelection.delete(i);
        updateMemorySlotUI();
        const toast = document.getElementById('slot-save-toast');
        if (toast) {
          toast.textContent = t('notify.slot_cleared', {slot: i + 1});
          toast.style.opacity = '1';
          clearTimeout(toast._timer);
          toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
        }
        saveAppSettings();
        return;
      }
      // Desktop To DAW mode
      if (_isDesktop && PlainState.toDAW && PlainState.memory[i]) {
        if (ev.metaKey || ev.ctrlKey) {
          // Cmd+click: toggle multi-select
          if (PlainState.dawSelection.has(i)) PlainState.dawSelection.delete(i);
          else PlainState.dawSelection.add(i);
        } else {
          // Normal click: select this one only
          PlainState.dawSelection.clear();
          PlainState.dawSelection.add(i);
        }
        updateMemorySlotUI();
        return;
      }
      // Normal click: clear DAW selection, recall slot
      if (PlainState.dawSelection.size > 0) PlainState.dawSelection.clear();
      recallPlainSlot(i);
    };
    container.appendChild(btn);
  }
}

function updateMemorySlotUI() {
  const container = document.getElementById('memory-slots');
  if (!container) return;
  const btns = container.querySelectorAll('.slot-btn:not(.daw-all-pad)');
  const isPerformView = memoryViewMode === 'perform';
  btns.forEach((btn, i) => {
    if (i >= 16) return;
    const slot = PlainState.memory[i];
    const label = String(i + 1);
    const isCaptureTarget = PlainState.subMode === 'capture' && i === PlainState.captureIndex;
    const isCurrent = PlainState.currentSlot === i;
    const isPlaying = isPerformView && PerformState.activePad === i;
    // Reset classes
    btn.classList.remove('filled', 'selected', 'capture-target', 'playing', 'daw-selected');
    if (slot) {
      btn.textContent = slot.chordName;
      btn.title = label + ': ' + slot.chordName;
      btn.classList.add('filled');
      if (PlainState.dawSelection.has(i)) btn.classList.add('daw-selected');
      else if (isPlaying) btn.classList.add('playing');
      else if (isCurrent && !isPerformView) btn.classList.add('selected');
    } else {
      btn.textContent = label;
      btn.title = t('memory.slot_empty', {slot: label});
      if (!isPerformView && (isCurrent || isCaptureTarget)) btn.classList.add('capture-target');
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
  const midiLabel = sel ? t('memory.midi_selected', {chord: sel.chordName}) : t('memory.midi_all') + (slotCount ? ' (' + slotCount + ')' : '');
  const chsLabel = sel ? t('memory.chs_selected', {chord: sel.chordName}) : t('memory.chs_all') + (slotCount ? ' (' + slotCount + ')' : '');
  ['btn-midi-export-plain', 'btn-midi-export-mem'].forEach(function(id) { var b = document.getElementById(id); if (b) b.textContent = midiLabel; });
  ['btn-chs-export-plain', 'btn-chs-export-mem'].forEach(function(id) { var b = document.getElementById(id); if (b) b.textContent = chsLabel; });
  // Play button label (only update if not currently playing)
  if (!_slotPlayTimer) {
    var playBtn = document.getElementById('btn-play-slots');
    if (playBtn) playBtn.textContent = sel ? t('memory.play_selected', {chord: sel.chordName}) : t('memory.play_all') + (slotCount ? ' (' + slotCount + ')' : '');
  }
  updateBankUI();
  if (PlainState.toDAW) { updateAllPad(); updateDAWHint(); }
}

// Desktop: "To DAW" toggle — when ON, dragging memory slots sends MIDI to DAW
function toggleToDAW() {
  PlainState.toDAW = !PlainState.toDAW;
  if (!PlainState.toDAW) PlainState.dawSelection.clear();
  var btn = document.getElementById('btn-to-daw');
  if (btn) {
    if (PlainState.toDAW) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  // Visual feedback on slots
  var container = document.getElementById('memory-slots');
  if (container) {
    container.classList.toggle('to-daw-mode', PlainState.toDAW);
  }
  // Add/remove ALL pad
  updateAllPad();
  // Hint
  updateDAWHint();
}

function updateDAWHint() {
  var hint = document.querySelector('[data-i18n="ui.slot_hint"]');
  if (!hint) return;
  if (!PlainState.toDAW) { hint.textContent = t('ui.slot_hint'); return; }
  if (PlainState.dawSelection.size > 0) {
    var names = [];
    PlainState.dawSelection.forEach(function(i) {
      if (PlainState.memory[i]) names.push(PlainState.memory[i].chordName);
    });
    hint.textContent = 'Selected: ' + names.join(' | ') + ' \u2014 drag to DAW';
  } else {
    hint.textContent = 'Drag slot \u2192 DAW / Cmd+click to select multiple';
  }
}

function updateAllPad() {
  var container = document.getElementById('memory-slots');
  if (!container) return;
  var existing = document.getElementById('daw-all-pad');
  if (existing) existing.remove();
  if (!PlainState.toDAW) return;
  var count = PlainState.memory.filter(function(s) { return s !== null; }).length;
  if (count === 0) return;
  var pad = document.createElement('button');
  pad.id = 'daw-all-pad';
  pad.className = 'slot-btn daw-all-pad';
  pad.textContent = 'ALL (' + count + ')';
  pad.title = 'Drag all chords to DAW';
  // Click ALL: select all filled slots (visual feedback), then drag to DAW
  pad.addEventListener('mousedown', function(e) {
    // Select all filled slots
    PlainState.dawSelection.clear();
    PlainState.memory.forEach(function(s, i) { if (s) PlainState.dawSelection.add(i); });
    updateMemorySlotUI();
    // Prepare MIDI drag
    var slots = PlainState.memory.filter(function(s) { return s !== null; });
    if (slots.length === 0) return;
    var data = slots.map(function(s) { return { notes: s.midiNotes, name: s.chordName }; });
    _juceInvoke("startMidiDragAll", [data]);
    var sx = e.clientX, sy = e.clientY, fired = false;
    function onMove(ev) {
      if (fired) return;
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (dx * dx + dy * dy > 64) {
        fired = true;
        _juceInvoke("executeMidiDrag", []);
      }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  container.appendChild(pad);
}

function initToDAWButton() {
  // To DAW only available in plugin mode (VST3/AU), not Standalone
  if (typeof _isPlugin === 'undefined' || !_isPlugin) return;
  var btn = document.getElementById('btn-to-daw');
  if (btn) btn.style.display = '';
}

// SMF Type 0 MIDI export (selected slot → single, no selection → all)
function exportPlainMidi() {
  let slots;
  if (PlainState.currentSlot !== null && PlainState.memory[PlainState.currentSlot]) {
    slots = [PlainState.memory[PlainState.currentSlot]];
  } else {
    slots = PlainState.memory.filter(s => s !== null);
  }
  if (slots.length === 0) { const toast = document.getElementById('slot-save-toast'); toast.textContent = t('notify.no_chords'); toast.style.opacity = '1'; setTimeout(() => toast.style.opacity = '0', 2000); return; }
  // Desktop: save MIDI file to ~/Music/64 Pad Explorer/
  if (typeof _isDesktop !== 'undefined' && _isDesktop) {
    var data = slots.map(function(s) { return { notes: s.midiNotes, name: s.chordName }; });
    _juceInvoke("prepareMidiExport", [data]);
    var toast = document.getElementById('slot-save-toast');
    if (toast) {
      toast.textContent = 'Saved to ~/Music/64 Pad Explorer/ (' + slots.length + ' chords)';
      toast.style.opacity = '1';
      setTimeout(function() { toast.style.opacity = '0'; }, 4000);
    }
    return;
  }
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

// ========================================
// IMPORT FUNCTIONS
// ========================================

// --- MIDI Import ---
function importMidi() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mid,.midi';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var buf = new Uint8Array(ev.target.result);
      var slots = parseMidiToSlots(buf);
      if (slots.length === 0) {
        var toast = document.getElementById('slot-save-toast');
        toast.textContent = t('notify.no_chords');
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 2000);
        return;
      }
      pushUndoState();
      for (var i = 0; i < 16; i++) {
        PlainState.memory[i] = i < slots.length ? slots[i] : null;
      }
      PlainState.currentSlot = null;
      updateMemorySlotUI();
      saveAppSettings();
      var count = slots.filter(function(s) { return s !== null; }).length;
      var toast = document.getElementById('slot-save-toast');
      toast.textContent = 'Imported ' + count + ' chords from MIDI';
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 2000);
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function parseMidiToSlots(buf) {
  if (buf.length < 14) return [];
  // Validate MThd
  if (buf[0] !== 0x4D || buf[1] !== 0x54 || buf[2] !== 0x68 || buf[3] !== 0x64) return [];
  var ticksPerBeat = (buf[12] << 8) | buf[13];

  // Find first MTrk
  var pos = 14;
  while (pos + 8 <= buf.length) {
    if (buf[pos] === 0x4D && buf[pos+1] === 0x54 && buf[pos+2] === 0x72 && buf[pos+3] === 0x6B) break;
    pos++;
  }
  if (pos + 8 > buf.length) return [];
  var trackLen = (buf[pos+4] << 24) | (buf[pos+5] << 16) | (buf[pos+6] << 8) | buf[pos+7];
  pos += 8;
  var trackEnd = Math.min(pos + trackLen, buf.length);

  // Parse events into timeline
  var absTick = 0;
  var runningStatus = 0;
  var events = [];

  while (pos < trackEnd) {
    // VLQ delta
    var delta = 0;
    while (pos < trackEnd) {
      var b = buf[pos++];
      delta = (delta << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    absTick += delta;
    if (pos >= trackEnd) break;

    var status = buf[pos];
    if (status < 0x80) {
      status = runningStatus;
    } else {
      pos++;
      if (status >= 0x80 && status < 0xF0) runningStatus = status;
    }

    var cmd = status & 0xF0;
    if (cmd === 0x90) {
      var note = buf[pos++] & 0x7F;
      var vel = buf[pos++] & 0x7F;
      events.push({ tick: absTick, type: vel > 0 ? 'on' : 'off', note: note });
    } else if (cmd === 0x80) {
      pos += 2; // note + vel (off events tracked but not used for grouping)
    } else if (status === 0xFF) {
      var metaType = buf[pos++];
      var len = 0;
      while (pos < trackEnd) {
        var b2 = buf[pos++];
        len = (len << 7) | (b2 & 0x7F);
        if (!(b2 & 0x80)) break;
      }
      if (metaType === 0x06 && len > 0) {
        var text = new TextDecoder().decode(buf.slice(pos, pos + len));
        events.push({ tick: absTick, type: 'marker', marker: text });
      }
      if (metaType === 0x2F) break; // End of track
      pos += len;
    } else if (status === 0xF0 || status === 0xF7) {
      var sLen = 0;
      while (pos < trackEnd) {
        var b3 = buf[pos++];
        sLen = (sLen << 7) | (b3 & 0x7F);
        if (!(b3 & 0x80)) break;
      }
      pos += sLen;
    } else if (cmd === 0xC0 || cmd === 0xD0) {
      pos++;
    } else {
      pos += 2;
    }
  }

  // Group Note On clusters at same tick into chords
  var slots = [];
  var currentNotes = [];
  var currentTick = -1;
  var pendingMarker = null;
  var activeMarker = null;

  for (var ei = 0; ei < events.length; ei++) {
    var ev = events[ei];
    if (ev.type === 'marker') {
      pendingMarker = ev.marker;
      continue;
    }
    if (ev.type === 'on') {
      if (currentNotes.length > 0 && ev.tick > currentTick) {
        // Save previous chord
        var notes = currentNotes.slice().sort(function(a, b) { return a - b; });
        var candidates = detectChord(notes);
        var name = (candidates.length > 0) ? candidates[0].name : (activeMarker || '?');
        slots.push({ midiNotes: notes, chordName: name });
        currentNotes = [];
        activeMarker = null;
        if (slots.length >= 16) break;
      }
      if (currentNotes.length === 0) {
        activeMarker = pendingMarker;
        pendingMarker = null;
      }
      currentNotes.push(ev.note);
      currentTick = ev.tick;
    }
  }
  // Save remaining
  if (currentNotes.length > 0 && slots.length < 16) {
    var lastNotes = currentNotes.slice().sort(function(a, b) { return a - b; });
    var lastCandidates = detectChord(lastNotes);
    var lastName = (lastCandidates.length > 0) ? lastCandidates[0].name : (activeMarker || '?');
    slots.push({ midiNotes: lastNotes, chordName: lastName });
  }
  return slots;
}

// ========================================
// MIDI TIMELINE PLAYBACK (v2.51)
// ========================================

// A. Parse MIDI file preserving timing information
function parseMidiToTimeline(buf) {
  if (buf.length < 14) return null;
  // Validate MThd
  if (buf[0] !== 0x4D || buf[1] !== 0x54 || buf[2] !== 0x68 || buf[3] !== 0x64) return null;
  var ticksPerBeat = (buf[12] << 8) | buf[13];
  if (ticksPerBeat === 0) return null;

  // Find first MTrk
  var pos = 14;
  while (pos + 8 <= buf.length) {
    if (buf[pos] === 0x4D && buf[pos+1] === 0x54 && buf[pos+2] === 0x72 && buf[pos+3] === 0x6B) break;
    pos++;
  }
  if (pos + 8 > buf.length) return null;
  var trackLen = (buf[pos+4] << 24) | (buf[pos+5] << 16) | (buf[pos+6] << 8) | buf[pos+7];
  pos += 8;
  var trackEnd = Math.min(pos + trackLen, buf.length);

  // Default tempo: 120 BPM (500000 µs/beat)
  var microsecondsPerBeat = 500000;
  var tempoChanges = [{ tick: 0, usPerBeat: 500000 }];
  var absTick = 0;
  var runningStatus = 0;
  var noteOns = []; // {tick, note, velocity}
  var noteOffs = []; // {tick, note}
  var markers = []; // {tick, text}

  while (pos < trackEnd) {
    var delta = 0;
    while (pos < trackEnd) {
      var b = buf[pos++];
      delta = (delta << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    absTick += delta;
    if (pos >= trackEnd) break;

    var status = buf[pos];
    if (status < 0x80) {
      status = runningStatus;
    } else {
      pos++;
      if (status >= 0x80 && status < 0xF0) runningStatus = status;
    }

    var cmd = status & 0xF0;
    if (cmd === 0x90) {
      var note = buf[pos++] & 0x7F;
      var vel = buf[pos++] & 0x7F;
      if (vel > 0) {
        noteOns.push({ tick: absTick, note: note, velocity: vel });
      } else {
        noteOffs.push({ tick: absTick, note: note });
      }
    } else if (cmd === 0x80) {
      var offNote = buf[pos++] & 0x7F;
      pos++; // velocity byte
      noteOffs.push({ tick: absTick, note: offNote });
    } else if (status === 0xFF) {
      var metaType = buf[pos++];
      var len = 0;
      while (pos < trackEnd) {
        var b2 = buf[pos++];
        len = (len << 7) | (b2 & 0x7F);
        if (!(b2 & 0x80)) break;
      }
      if (metaType === 0x51 && len === 3) {
        // Tempo meta event
        microsecondsPerBeat = (buf[pos] << 16) | (buf[pos+1] << 8) | buf[pos+2];
        tempoChanges.push({ tick: absTick, usPerBeat: microsecondsPerBeat });
      } else if (metaType === 0x06 && len > 0) {
        markers.push({ tick: absTick, text: new TextDecoder().decode(buf.slice(pos, pos + len)) });
      }
      if (metaType === 0x2F) break; // End of track
      pos += len;
    } else if (status === 0xF0 || status === 0xF7) {
      var sLen = 0;
      while (pos < trackEnd) {
        var b3 = buf[pos++];
        sLen = (sLen << 7) | (b3 & 0x7F);
        if (!(b3 & 0x80)) break;
      }
      pos += sLen;
    } else if (cmd === 0xC0 || cmd === 0xD0) {
      pos++;
    } else {
      pos += 2;
    }
  }

  // Convert ticks to milliseconds using tempo map
  function tickToMs(tick) {
    var ms = 0;
    var prevTick = 0;
    var usPerBeat = 500000;
    for (var i = 0; i < tempoChanges.length; i++) {
      var tc = tempoChanges[i];
      if (tc.tick >= tick) break;
      // Add time from prevTick to tc.tick at current rate
      if (tc.tick > prevTick) {
        ms += ((tc.tick - prevTick) / ticksPerBeat) * (usPerBeat / 1000);
        prevTick = tc.tick;
      }
      usPerBeat = tc.usPerBeat;
    }
    // Add remaining time from prevTick to target tick
    ms += ((tick - prevTick) / ticksPerBeat) * (usPerBeat / 1000);
    return ms;
  }

  // Match note-ons with note-offs
  var notes = [];
  for (var i = 0; i < noteOns.length; i++) {
    var on = noteOns[i];
    var offTick = absTick; // default: end of track
    for (var j = 0; j < noteOffs.length; j++) {
      if (noteOffs[j].note === on.note && noteOffs[j].tick > on.tick) {
        offTick = noteOffs[j].tick;
        noteOffs.splice(j, 1);
        break;
      }
    }
    notes.push({
      midi: on.note,
      velocity: on.velocity,
      startTick: on.tick,
      endTick: offTick,
      startMs: tickToMs(on.tick),
      endMs: tickToMs(offTick)
    });
  }

  // Group simultaneous notes into events (chord clusters)
  notes.sort(function(a, b) { return a.startTick - b.startTick || a.midi - b.midi; });
  var events = [];
  var currentEvent = null;
  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    if (!currentEvent || n.startTick !== currentEvent.tick) {
      if (currentEvent) events.push(currentEvent);
      // Find marker at this tick
      var marker = null;
      for (var m = 0; m < markers.length; m++) {
        if (markers[m].tick === n.startTick) { marker = markers[m].text; break; }
      }
      var midiNotes = [n.midi];
      var candidates = detectChord(midiNotes);
      currentEvent = {
        tick: n.startTick,
        startMs: n.startMs,
        endMs: n.endMs,
        notes: [{ midi: n.midi, velocity: n.velocity, endMs: n.endMs }],
        chordName: marker || (candidates.length > 0 ? candidates[0].name : '?')
      };
    } else {
      currentEvent.notes.push({ midi: n.midi, velocity: n.velocity, endMs: n.endMs });
      currentEvent.endMs = Math.max(currentEvent.endMs, n.endMs);
      // Re-detect chord with all notes in cluster
      var allMidi = currentEvent.notes.map(function(x) { return x.midi; });
      var cands = detectChord(allMidi);
      if (cands.length > 0 && !currentEvent._hasMarker) currentEvent.chordName = cands[0].name;
    }
    if (currentEvent && markers.some(function(m) { return m.tick === currentEvent.tick; })) {
      currentEvent._hasMarker = true;
    }
  }
  if (currentEvent) events.push(currentEvent);

  // Clean up _hasMarker
  events.forEach(function(e) { delete e._hasMarker; });

  var totalMs = events.length > 0 ? events[events.length - 1].endMs : 0;
  var bpm = Math.round(60000000 / microsecondsPerBeat);

  return {
    events: events,
    ticksPerBeat: ticksPerBeat,
    bpm: bpm,
    totalMs: totalMs
  };
}

// B. MIDI Sequencer — requestAnimationFrame-based playback engine
var MidiSequencer = {
  timeline: null,      // parseMidiToTimeline result
  state: 'stopped',    // 'stopped' | 'playing' | 'paused'
  startTime: 0,        // performance.now() at play start
  pauseOffset: 0,      // ms offset when paused
  currentEventIdx: -1, // last fired event index
  activeNotes: new Set(), // currently sounding MIDI notes
  _rafId: null,

  load: function(timeline) {
    this.stop();
    this.timeline = timeline;
    this.currentEventIdx = -1;
    this.pauseOffset = 0;
    updateMidiPlayerUI();
  },

  play: function() {
    if (!this.timeline || this.timeline.events.length === 0) return;
    if (this.state === 'playing') return;
    this.state = 'playing';
    this.startTime = performance.now() - this.pauseOffset;
    // Find starting event index based on pauseOffset
    if (this.pauseOffset === 0) {
      this.currentEventIdx = -1;
    }
    this._tick();
    updateMidiPlayerUI();
  },

  pause: function() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseOffset = performance.now() - this.startTime;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    // Release all held notes
    this.activeNotes.forEach(function(m) { noteOff(m); });
    this.activeNotes.clear();
    updateMidiPlayerUI();
  },

  stop: function() {
    this.state = 'stopped';
    this.pauseOffset = 0;
    this.currentEventIdx = -1;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this.activeNotes.forEach(function(m) { noteOff(m); });
    this.activeNotes.clear();
    PlainState.activeNotes.clear();
    updatePlainDisplay();
    highlightPlaybackPads(null);
    render();
    updateMidiPlayerUI();
  },

  seek: function(ms) {
    var wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
      this.activeNotes.forEach(function(m) { noteOff(m); });
      this.activeNotes.clear();
    }
    this.pauseOffset = ms;
    // Find event index for this position
    this.currentEventIdx = -1;
    if (this.timeline) {
      for (var i = 0; i < this.timeline.events.length; i++) {
        if (this.timeline.events[i].startMs <= ms) this.currentEventIdx = i;
        else break;
      }
    }
    if (wasPlaying) {
      this.startTime = performance.now() - ms;
      this._tick();
    }
    highlightPlaybackPads(null);
    updateMidiPlayerUI();
  },

  _tick: function() {
    var self = this;
    if (self.state !== 'playing') return;
    var now = performance.now() - self.startTime;
    var events = self.timeline.events;

    // Fire new events
    while (self.currentEventIdx + 1 < events.length && events[self.currentEventIdx + 1].startMs <= now) {
      self.currentEventIdx++;
      var evt = events[self.currentEventIdx];
      // NoteOn for this event
      var midiNotes = evt.notes.map(function(n) { return n.midi; });
      midiNotes.forEach(function(m) {
        noteOn(m, undefined, true);
        self.activeNotes.add(m);
      });
      // Show chord on pad grid + staff
      PlainState.activeNotes = new Set(midiNotes);
      updatePlainDisplay();
      render();
      highlightPlaybackPads(midiNotes);
      // Update chord name display
      var detectEl = document.getElementById('midi-player-chord');
      if (detectEl) detectEl.textContent = evt.chordName;
    }

    // Check for note-offs (per-note end times)
    if (self.currentEventIdx >= 0) {
      var evt = events[self.currentEventIdx];
      var hadNotes = self.activeNotes.size > 0;
      evt.notes.forEach(function(n) {
        if (n.endMs <= now && self.activeNotes.has(n.midi)) {
          noteOff(n.midi);
          self.activeNotes.delete(n.midi);
        }
      });
      // Clear highlight once when transitioning from "has notes" to "no notes"
      if (hadNotes && self.activeNotes.size === 0) {
        PlainState.activeNotes.clear();
        updatePlainDisplay();
        highlightPlaybackPads(null);
      }
    }

    // Update progress
    updateMidiPlayerProgress(now);

    // Check if playback finished
    if (now >= self.timeline.totalMs) {
      self.stop();
      return;
    }

    self._rafId = requestAnimationFrame(function() { self._tick(); });
  }
};

// C. UI update functions for MIDI player
function updateMidiPlayerUI() {
  var section = document.getElementById('midi-player-section');
  if (!section) return;
  var hasTimeline = MidiSequencer.timeline !== null;
  section.style.display = hasTimeline ? '' : 'none';
  var playBtn = document.getElementById('midi-player-play');
  var pauseBtn = document.getElementById('midi-player-pause');
  var stopBtn = document.getElementById('midi-player-stop');
  if (playBtn) playBtn.style.display = MidiSequencer.state === 'playing' ? 'none' : '';
  if (pauseBtn) pauseBtn.style.display = MidiSequencer.state === 'playing' ? '' : 'none';
  if (stopBtn) stopBtn.disabled = MidiSequencer.state === 'stopped';
  // BPM display
  var bpmEl = document.getElementById('midi-player-bpm');
  if (bpmEl && hasTimeline) bpmEl.textContent = MidiSequencer.timeline.bpm + ' BPM';
  // Duration
  var durEl = document.getElementById('midi-player-duration');
  if (durEl && hasTimeline) durEl.textContent = formatMidiTime(MidiSequencer.timeline.totalMs);
  // Progress bar max
  var progress = document.getElementById('midi-player-progress');
  if (progress && hasTimeline) progress.max = Math.ceil(MidiSequencer.timeline.totalMs);
  // Time display
  updateMidiPlayerProgress(MidiSequencer.pauseOffset);
}

function updateMidiPlayerProgress(nowMs) {
  var progress = document.getElementById('midi-player-progress');
  var timeEl = document.getElementById('midi-player-time');
  if (progress) progress.value = Math.min(nowMs, parseFloat(progress.max) || 0);
  if (timeEl) timeEl.textContent = formatMidiTime(nowMs);
}

function formatMidiTime(ms) {
  var sec = Math.floor(ms / 1000);
  var min = Math.floor(sec / 60);
  sec = sec % 60;
  return min + ':' + (sec < 10 ? '0' : '') + sec;
}

// Import MIDI for timeline playback
function importMidiTimeline() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mid,.midi';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var buf = new Uint8Array(ev.target.result);
      var timeline = parseMidiToTimeline(buf);
      if (!timeline || timeline.events.length === 0) {
        var toast = document.getElementById('slot-save-toast');
        toast.textContent = t('notify.no_chords');
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 2000);
        return;
      }
      MidiSequencer.load(timeline);
      var toast = document.getElementById('slot-save-toast');
      toast.textContent = 'MIDI loaded: ' + timeline.events.length + ' events, ' + timeline.bpm + ' BPM';
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 3000);
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

// --- CHS Import (dev only) ---
function importChs() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.chs';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var buf = new Uint8Array(ev.target.result);
      var slots = parseChsToSlots(buf);
      var count = slots.filter(function(s) { return s !== null; }).length;
      if (count === 0) {
        var toast = document.getElementById('slot-save-toast');
        toast.textContent = t('notify.no_chords');
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 2000);
        return;
      }
      pushUndoState();
      for (var i = 0; i < 16; i++) {
        PlainState.memory[i] = i < slots.length ? slots[i] : null;
      }
      PlainState.currentSlot = null;
      updateMemorySlotUI();
      saveAppSettings();
      // Read chordset name from 0x78
      var csName = '';
      for (var ci = 0; ci < 16; ci++) {
        var ch = buf[0x78 + ci];
        if (ch === 0) break;
        csName += String.fromCharCode(ch);
      }
      var toast = document.getElementById('slot-save-toast');
      toast.textContent = 'Imported ' + count + ' chords' + (csName ? ' (' + csName + ')' : '') + ' from CHS';
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 2000);
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function parseChsToSlots(buf) {
  if (buf.length < 0x78) return [];
  // Validate magic bytes
  if (buf[0] !== 0x83 || buf[1] !== 0x49) return [];

  var slots = [];
  var hasAny = false;
  for (var i = 0; i < 13; i++) {
    var offset = 0x10 + i * 8;
    // Bytes 1-6: MIDI notes (descending, right-aligned, 0 = empty)
    var notes = [];
    for (var j = 1; j <= 6; j++) {
      var note = buf[offset + j];
      if (note > 0 && note <= 127) notes.push(note);
    }
    if (notes.length === 0) {
      slots.push(null);
      continue;
    }
    hasAny = true;
    notes.sort(function(a, b) { return a - b; });
    var candidates = detectChord(notes);
    var chordName = candidates.length > 0 ? candidates[0].name : notes.map(function(n) { return NOTE_NAMES_SHARP[n % 12]; }).join(' ');
    slots.push({ midiNotes: notes, chordName: chordName });
  }
  return hasAny ? slots : [];
}

// Chordcat .chs export (4096 bytes binary)
function exportPlainChs() {
  const filledSlots = PlainState.memory.filter(s => s !== null);
  if (filledSlots.length === 0) { const toast = document.getElementById('slot-save-toast'); toast.textContent = t('notify.no_chords'); toast.style.opacity = '1'; setTimeout(() => toast.style.opacity = '0', 2000); return; }
  const buf = new Uint8Array(4096);
  // マジックバイト
  buf[0] = 0x83; buf[1] = 0x49;
  // ヘッダ（0x0Fはコードセットにより0x00/0x10が混在。0x00で安全側）
  // 13スロット × 8バイト（オフセット0x10〜0x77）
  for (let i = 0; i < 13; i++) {
    const slot = PlainState.memory[i];
    if (!slot) continue;
    const offset = 0x10 + i * 8;
    // 6音まで、高→低の降順（バイト1〜6、右詰め）
    const notes = [...slot.midiNotes].sort((a, b) => b - a).slice(0, 6);
    const start = 1 + (6 - notes.length);
    for (let j = 0; j < notes.length; j++) {
      buf[offset + start + j] = notes[j] & 0x7F;
    }
  }
  // Chordset名（オフセット0x78〜0x87、NULL終端）
  const name = 'PadExplorer';
  for (let i = 0; i < name.length && i < 15; i++) {
    buf[0x78 + i] = name.charCodeAt(i);
  }
  // メタデータ（0x88=スロットID、0x00=未割当。Managerが自動採番）
  // Chordset名 複製（オフセット0xFB4〜）
  for (let i = 0; i < name.length && i < 15; i++) {
    buf[0xFB4 + i] = name.charCodeAt(i);
  }
  // ダウンロード
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  downloadBinary(buf, 'PadExplorer_' + ts + '.chs', 'application/octet-stream');
}

