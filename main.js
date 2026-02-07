// ========================================
// INITIALIZATION
// ========================================
initKeyButtons();
initScaleSelect();
buildPianoKeyboard('piano-keyboard', selectRoot);
initQualityGrid();
initTensionGrid();
updateOctaveLabel();
initMemorySlots();
initWebMIDI();

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', (e) => {
  // Ignore when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  const key = e.key;
  const lk = key.toLowerCase(); // for letter key matching (case-insensitive)

  // Shift+数字: Save current chord to Plain memory slot (全モード共通)
  if (e.shiftKey && e.code && e.code.startsWith('Digit')) {
    const num = parseInt(e.code.charAt(5)); // Digit0→0, Digit1→1, ...
    const idx = num === 0 ? 9 : num - 1;    // 1→slot0, ..., 9→slot8, 0→slot9
    if (idx < 13) {
      if (saveToPlainSlot(idx)) {
        e.preventDefault();
      }
    }
    return;
  }

  // c: Save to selected slot (全モード共通) or Plain capture
  if (lk === 'c') {
    if (PlainState.currentSlot !== null) {
      saveToPlainSlot(PlainState.currentSlot);
      return;
    }
    if (AppState.mode === 'plain') { plainCapture(); return; }
    return;
  }

  // Escape: Close help modal → exit Plain edit → deselect slot → deselect voicing box
  if (key === 'Escape') {
    const helpOverlay = document.getElementById('help-overlay');
    if (helpOverlay.classList.contains('active')) {
      helpOverlay.classList.remove('active');
    } else if (AppState.mode === 'plain' && (PlainState.subMode === 'edit' || PlainState.subMode === 'capture')) {
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

  // ?: Toggle help modal
  if (key === '?') {
    const helpOverlay = document.getElementById('help-overlay');
    helpOverlay.classList.toggle('active');
    return;
  }

  // Arrow Up/Down: Inversion (Plain: move lowest/highest note ±1oct, Chord: cycle inversion)
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (AppState.mode === 'plain' && PlainState.activeNotes.size >= 2) {
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
    if (AppState.mode === 'plain' && PlainState.activeNotes.size > 0) {
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
      resetVoicingSelection();
      updateChordDisplay(); render();
    }
    return;
  }

  // Plain mode shortcuts
  if (AppState.mode === 'plain') {
    if (lk === 'e') { plainEnd(); return; }
    if (lk === 'x') { clearPlainNotes(); return; }
    // Number keys 1-9, 0: recall/edit slot (1-9→slot 0-8, 0→slot 9)
    if (key >= '0' && key <= '9') {
      const idx = key === '0' ? 9 : parseInt(key) - 1;
      if (idx < 13) recallPlainSlot(idx);
      return;
    }
    return;
  }



  // Number keys 1-7: Select diatonic chord (Scale/Chord mode)
  if (key >= '1' && key <= '7') {
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
    if (AppState.mode === 'plain') {
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

  // d: Cycle Drop (off → Drop 2 → Drop 3 → off)
  if (lk === 'd') {
    if (AppState.mode === 'chord' && BuilderState.quality) {
      if (!VoicingState.drop) setDrop('drop2');
      else if (VoicingState.drop === 'drop2') setDrop('drop3');
      else setDrop(null);
    }
    return;
  }

});

render();
