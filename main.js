// ========================================
// INITIALIZATION
// ========================================
// Load saved settings BEFORE UI init (so AppState has restored values)
loadAppSettings();

initKeyButtons();
initScaleSelect();
buildPianoKeyboard('piano-keyboard', selectRoot);
initQualityGrid();
initTensionGrid();
updateOctaveLabel();
initMemorySlots();
initWebMIDI();
initPlayControls();
I18N.init();

// Mobile responsive init
_isMobile = _mobileMediaQuery.matches;
_isLandscape = _landscapeMediaQuery.matches;
if (_isMobile) {
  moveMemorySection(true);
  moveInstrumentRow(true);
} else if (_isLandscape) {
  moveInstrumentRow(true);
  syncPlayControls();
  renderPad32();
}
initScreenDots();
_mobileMediaQuery.addEventListener('change', handleMobileChange);
_landscapeMediaQuery.addEventListener('change', handleLandscapeChange);

// Apply restored display toggles to UI
(function applyRestoredSettings() {
  // Mode buttons & panels
  document.getElementById('mode-scale').classList.toggle('active', AppState.mode === 'scale');
  document.getElementById('mode-chord').classList.toggle('active', AppState.mode === 'chord');
  document.getElementById('mode-input').classList.toggle('active', AppState.mode === 'input');
  document.getElementById('scale-panel').style.display = AppState.mode === 'scale' ? '' : 'none';
  document.getElementById('chord-panel').style.display = AppState.mode === 'chord' ? '' : 'none';
  document.getElementById('input-panel').style.display = AppState.mode === 'input' ? '' : 'none';
  if (AppState.mode === 'chord' && BuilderState.step === 0) {
    BuilderState.root = AppState.key;
    setBuilderStep(1);
  }
  if (AppState.mode === 'input') {
    PlainState.subMode = 'idle';
    updatePlainUI();
    updatePlainDisplay();
  }
  // Scale selector
  const sel = document.getElementById('scale-select');
  if (sel) sel.value = AppState.scaleIdx;
  // Display toggles
  document.getElementById('inst-toggle-guitar').classList.toggle('active', showGuitar);
  document.getElementById('inst-toggle-bass').classList.toggle('active', showBass);
  document.getElementById('inst-toggle-piano').classList.toggle('active', showPiano);
  document.getElementById('inst-toggle-staff').classList.toggle('active', showStaff);
  document.getElementById('inst-toggle-sound').classList.toggle('active', showSound);
  document.getElementById('guitar-wrap').style.display = showGuitar ? '' : 'none';
  document.getElementById('bass-wrap').style.display = showBass ? '' : 'none';
  document.getElementById('piano-wrap-display').style.display = showPiano ? '' : 'none';
  document.getElementById('staff-area').style.display = showStaff ? '' : 'none';
  document.getElementById('sound-controls').style.display = showSound ? '' : 'none';
  document.getElementById('guitar-label-btn').style.display = (showGuitar || showBass) ? '' : 'none';
  document.getElementById('guitar-label-btn').textContent = guitarLabelMode === 'name' ? t('label.note_name') : t('label.degree');
  // Memory slots UI
  updateMemorySlotUI();
  // Bank UI (ensure banks initialized even without saved data)
  if (BankState.banks.length === 0) {
    BankState.banks = [{ id: 'default', name: 'Bank 1', memory: Array(16).fill(null) }];
    BankState.activeBankId = 'default';
  }
  updateBankUI();
})();

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', (e) => {
  // Ignore when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  const key = e.key;
  const lk = key.toLowerCase(); // for letter key matching (case-insensitive)

  // [ / ]: Bank switch (全モード共通)
  if (key === '[') { switchBank(-1); return; }
  if (key === ']') { switchBank(1); return; }

  // Shift+数字: Save current chord to Plain memory slot (全モード共通)
  // Numpad (e.location === 3) は除外
  if (e.shiftKey && e.code && e.code.startsWith('Digit') && e.location !== 3) {
    const num = parseInt(e.code.charAt(5)); // Digit0→0, Digit1→1, ...
    const idx = num === 0 ? 9 : num - 1;    // 1→slot0, ..., 9→slot8, 0→slot9
    if (idx < 16) {
      if (saveToPlainSlot(idx)) {
        e.preventDefault();
      }
    }
    return;
  }

  // Shift+letter: shortcuts that conflict with A-I voicing box range
  if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
    if (lk === 'd') {
      // Shift+D: Cycle Drop
      if (AppState.mode === 'chord' && BuilderState.quality) {
        if (!VoicingState.drop) setDrop('drop2');
        else if (VoicingState.drop === 'drop2') setDrop('drop3');
        else setDrop(null);
      }
      return;
    }
    if (lk === 'g') { toggleInstrument('guitar'); return; }
    if (lk === 'b') { toggleInstrument('bass'); return; }
    if (lk === 'p') { toggleInstrument('piano'); return; }
  }

  // Tab / Shift+Tab: Mode cycle (Scale → Chord → Input → Scale)
  if (key === 'Tab') {
    e.preventDefault();
    const modes = ['scale', 'chord', 'input'];
    const cur = modes.indexOf(AppState.mode);
    const next = e.shiftKey ? (cur - 1 + 3) % 3 : (cur + 1) % 3;
    document.getElementById('mode-' + modes[next]).click();
    return;
  }

  // Backspace: Back (chord builder)
  if (key === 'Backspace') {
    if (AppState.mode === 'chord') {
      builderBack();
    }
    return;
  }

  // Perform view: keyboard pad triggering (highest priority for letter/number keys)
  if (memoryViewMode === 'perform') {
    if (handlePerformKey(lk)) {
      e.preventDefault();
      ensureAudioResumed();
      return;
    }
  }

  // c: Save to selected slot (全モード共通) or Plain capture
  if (lk === 'c') {
    if (PlainState.currentSlot !== null) {
      saveToPlainSlot(PlainState.currentSlot);
      return;
    }
    if (AppState.mode === 'input') { plainCapture(); return; }
    // Chord/Scale mode: fall through to voicing box A-I handler below
  }

  // Escape: Close help modal → exit Plain edit → deselect slot → deselect voicing box
  if (key === 'Escape') {
    const helpOverlay = document.getElementById('help-overlay');
    if (helpOverlay.classList.contains('active')) {
      helpOverlay.classList.remove('active');
    } else if (memoryViewMode === 'perform' && PerformState.activePad !== null) {
      clearPerform();
    } else if (AppState.mode === 'input' && (PlainState.subMode === 'edit' || PlainState.subMode === 'capture')) {
      PlainState.subMode = 'idle';
      PlainState.activeNotes.forEach(m => noteOff(m));
      PlainState.activeNotes.clear();
      PlainState.currentSlot = null;
      updatePlainUI(); updatePlainDisplay(); updateMemorySlotUI(); render();
    } else if (PlainState.currentSlot !== null) {
      PlainState.currentSlot = null;
      updateMemorySlotUI();
    } else if (VoicingState.selectedBoxIdx !== null) {
      VoicingState.selectedBoxIdx = null;
      render();
    }
    return;
  }

  // Cmd+Z / Ctrl+Z: Undo memory slots
  if (lk === 'z' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    undoMemory();
    return;
  }

  // Space: Play current chord
  if (key === ' ') {
    e.preventDefault();
    ensureAudioResumed();
    const notes = getCurrentChordMidiNotes();
    if (notes && notes.length > 0) playMidiNotes(notes, 1.0);
    return;
  }

  // ?: Toggle help modal
  if (key === '?') {
    const helpOverlay = document.getElementById('help-overlay');
    helpOverlay.classList.toggle('active');
    return;
  }

  // p: Toggle Perform view
  if (lk === 'p') {
    toggleMemoryView(memoryViewMode === 'perform' ? 'memory' : 'perform');
    return;
  }

  // Arrow Up/Down: Inversion (Plain: move lowest/highest note ±1oct, Chord: cycle inversion)
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (AppState.mode === 'input' && PlainState.activeNotes.size >= 2) {
      e.preventDefault();
      const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
      PlainState.activeNotes.clear();
      if (key === 'ArrowUp') {
        const lowest = notes.shift();
        notes.push(lowest + 12);
      } else {
        const highest = notes.pop();
        notes.unshift(highest - 12);
      }
      notes.forEach(n => PlainState.activeNotes.add(n));
      updatePlainDisplay(); render();
    } else if (AppState.mode === 'chord' && BuilderState.quality && !VoicingState.shell) {
      e.preventDefault();
      const maxInv = Math.min(3, (getBuilderPCS()?.length || 4) - 1);
      let inv = VoicingState.inversion;
      if (key === 'ArrowUp') { inv = inv < maxInv ? inv + 1 : 0; }
      else { inv = inv > 0 ? inv - 1 : maxInv; }
      setInversion(inv);
    }
    return;
  }

  // Arrow Left/Right: Chromatic transpose (Plain: all notes ±1, Chord: root ±1)
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (AppState.mode === 'input' && PlainState.activeNotes.size > 0) {
      e.preventDefault();
      const delta = key === 'ArrowRight' ? 1 : -1;
      const newNotes = new Set();
      PlainState.activeNotes.forEach(n => newNotes.add(n + delta));
      PlainState.activeNotes = newNotes;
      updatePlainDisplay(); render();
    } else if (AppState.mode === 'chord' && BuilderState.root !== null) {
      e.preventDefault();
      const delta = key === 'ArrowRight' ? 1 : 11;
      BuilderState.root = (BuilderState.root + delta) % 12;
      highlightPianoKey('piano-keyboard', BuilderState.root);
      if (VoicingState.selectedBoxIdx !== null) {
        VoicingState._preservePosition = { type: 'transpose', midiDelta: key === 'ArrowRight' ? 1 : -1 };
      }
      updateChordDisplay(); render();
    }
    return;
  }

  // Plain mode shortcuts
  if (AppState.mode === 'input') {
    if (lk === 'e') { plainEnd(); return; }
    if (lk === 'x') { clearPlainNotes(); return; }
    // Number keys 1-9, 0: recall/edit slot (1-9→slot 0-8, 0→slot 9)
    if (key >= '0' && key <= '9' && e.location !== 3) {
      const idx = key === '0' ? 9 : parseInt(key) - 1;
      if (idx < 16) recallPlainSlot(idx);
      return;
    }
    return;
  }



  // Number keys 1-7: Select diatonic chord (Scale/Chord mode)
  if (key >= '1' && key <= '7' && e.location !== 3) {
    const num = parseInt(key);
    const scale = SCALES[AppState.scaleIdx];
    if (scale.pcs.length === 7) {
      const tetrads = getDiatonicTetrads(scale.pcs, AppState.key);
      if (num - 1 < tetrads.length) {
        onDiatonicClick(tetrads[num - 1]);
      }
    }
    return;
  }

  // Letter keys A-I: Select voicing box (case-insensitive, single char only)
  if (lk.length === 1 && lk >= 'a' && lk <= 'i') {
    const idx = lk.charCodeAt(0) - 97; // a=0, b=1, ...
    if (idx < VoicingState.lastBoxes.length) {
      selectVoicingBox(idx);
    }
    return;
  }

  // o: Toggle Omit 5
  if (lk === 'o') {
    if (AppState.mode === 'chord' && BuilderState.quality) {
      toggleOmit5();
    }
    return;
  }

  // x: Clear (chord or plain)
  if (lk === 'x') {
    if (AppState.mode === 'input') {
      clearPlainNotes();
    } else if (AppState.mode === 'chord') {
      builderClear();
    }
    return;
  }

  // r: Toggle Rootless
  if (lk === 'r') {
    if (AppState.mode === 'chord' && BuilderState.quality) {
      toggleRootless();
    }
    return;
  }

  // s: Cycle Shell (off → 1-3-7 → 1-7-3 → off)
  if (lk === 's') {
    if (AppState.mode === 'chord' && BuilderState.quality) {
      if (!VoicingState.shell) setShell('137');
      else if (VoicingState.shell === '137') setShell('173');
      else setShell(null);
    }
    return;
  }

  // d: Drop cycle moved to Shift+D (above A-I handler)

});

render();
