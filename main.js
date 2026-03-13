// ========================================
// INITIALIZATION
// ========================================
// Load saved settings BEFORE UI init (so AppState has restored values)
loadAppSettings();

// TASTY Mode: HPS auth + data loading
TastyState.hpsUnlocked = new URLSearchParams(window.location.search).has('hps');
if (TastyState.hpsUnlocked) {
  fetch('data/tasty-recipes.json').then(function(r) { return r.json(); }).then(function(data) {
    TastyState.recipes = data;
    updateTastyUI();
  }).catch(function() {});
  // Load voicings (129 degree-based recipes for TASTY Voicing Engine)
  fetch('data/tasty-voicings.json').then(function(r) { return r.json(); }).then(function(data) {
    TastyState.voicings = data;
    updateTastyUI();
  }).catch(function() {});
}

// Stock Voicing: same HPS gate
StockState.hpsUnlocked = new URLSearchParams(window.location.search).has('hps');
if (StockState.hpsUnlocked) {
  fetch('data/stock-voicings.json').then(function(r) { return r.json(); }).then(function(data) {
    StockState.data = data;
    updateStockUI();
  }).catch(function() {});
}

initKeyButtons();
initScaleSelect();
initQualityGrid();
initTensionGrid();
updateOctaveLabel();
initMemorySlots();
initWebMIDI();
initPlayControls();
initTextChordInput();
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
  var seqBtnR = document.getElementById('mode-sequence');
  if (seqBtnR) seqBtnR.classList.toggle('active', AppState.mode === 'sequence');
  document.getElementById('scale-panel').style.display = AppState.mode === 'scale' ? '' : 'none';
  document.getElementById('chord-panel').style.display = AppState.mode === 'chord' ? '' : 'none';
  document.getElementById('input-panel').style.display = AppState.mode === 'input' ? '' : 'none';
  var seqPanelR = document.getElementById('sequence-panel');
  if (seqPanelR) seqPanelR.style.display = AppState.mode === 'sequence' ? '' : 'none';
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
  // Enforce exclusive theory view (staff / circle)
  if (showStaff && showCircle) showCircle = false;
  document.getElementById('inst-toggle-guitar').classList.toggle('active', showGuitar);
  document.getElementById('inst-toggle-bass').classList.toggle('active', showBass);
  document.getElementById('inst-toggle-piano').classList.toggle('active', showPiano);
  document.getElementById('inst-toggle-staff').classList.toggle('active', showStaff);
  document.getElementById('inst-toggle-circle').classList.toggle('active', showCircle);
  document.getElementById('inst-toggle-sound').classList.toggle('active', showSound);
  document.getElementById('guitar-wrap').style.display = showGuitar ? '' : 'none';
  document.getElementById('bass-wrap').style.display = showBass ? '' : 'none';
  document.getElementById('piano-wrap-display').style.display = showPiano ? '' : 'none';
  document.getElementById('staff-area').style.display = showStaff ? '' : 'none';
  document.getElementById('circle-wrap').style.display = showCircle ? 'flex' : 'none';
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
// VERSION UPDATE NOTIFICATION
// ========================================
var _versionNoticeShown = (function showVersionNotice() {
  var ver = document.querySelector('.version-tag');
  if (!ver) return false;
  var current = ver.textContent.replace(/^V/, '');
  var lastSeen = localStorage.getItem('64pad-lastVersion');
  localStorage.setItem('64pad-lastVersion', current);
  if (!lastSeen || lastSeen === current) return false;
  // Version changed — show What's New (takes priority over startup tip)
  var whatsNew = t('whats_new') || "What's New";
  var msg = t('whats_new_33000') || 'Tutorial system! Click the book icon to learn Scale mode, Chord mode, and more.';
  var el = document.createElement('div');
  el.id = 'startup-tip';
  el.innerHTML = '<span class="tip-text">\u2728 <b>' + whatsNew + ' (' + current + ')</b> \u2014 ' + msg + '</span>' +
    '<span class="tip-keys"><kbd>Space</kbd></span>';
  var grid = document.getElementById('pad-grid');
  if (grid) grid.parentNode.insertBefore(el, grid);
  setTimeout(function() {
    if (el.parentNode) { el.classList.add('tip-fade'); setTimeout(function() { if (el.parentNode) el.remove(); }, 300); }
  }, 12000);
  return true;
})();

// ========================================
// STARTUP TIPS (returning users)
// ========================================
function showStartupTip() {
  if (_versionNoticeShown) return; // Version notice takes priority
  if (AppState.showTips === false) return;
  // Don't show for first-time users (onboarding overlay handles them)
  if (!localStorage.getItem('64pad-sound')) return;
  var lang = I18N.current || 'en';
  var tips = (I18N.langs[lang] && I18N.langs[lang].tips) || (I18N.langs['en'] && I18N.langs['en'].tips);
  if (!tips || !tips.length) return;
  var idx = Math.floor(Math.random() * tips.length);
  var offLabel = t('tips_off') || "Don't show";
  var el = document.createElement('div');
  el.id = 'startup-tip';
  el.innerHTML = '<span class="tip-text">\uD83D\uDCA1 ' + tips[idx] + '</span>' +
    '<span class="tip-keys"><kbd>Space</kbd></span>' +
    '<button class="tip-off-btn" onclick="disableStartupTips()">' + offLabel + '</button>';
  var grid = document.getElementById('pad-grid');
  if (grid) grid.parentNode.insertBefore(el, grid);
  setTimeout(dismissStartupTip, 8000);
}
function dismissStartupTip() {
  var el = document.getElementById('startup-tip');
  if (!el) return;
  el.classList.add('tip-fade');
  setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
}
function disableStartupTips() {
  AppState.showTips = false;
  saveAppSettings();
  dismissStartupTip();
}
function toggleStartupTips(on) {
  AppState.showTips = on;
  saveAppSettings();
}
showStartupTip();

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', (e) => {
  // Ignore when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  const key = e.key;
  const lk = key.toLowerCase(); // for letter key matching (case-insensitive)

  // Sequence mode transport shortcuts
  if (AppState.mode === 'sequence') {
    if (key === ' ') { e.preventDefault(); ensureAudioResumed(); togglePlayback(); return; }
    if (lk === 'r') { ensureAudioResumed(); toggleRecord(); return; }
  }

  // /: Focus text chord input (Chord mode)
  if (key === '/' && AppState.mode === 'chord') {
    e.preventDefault();
    var tchInput = document.getElementById('text-chord-input');
    if (tchInput) { tchInput.focus(); tchInput.select(); }
    return;
  }

  // [ / ]: Bank switch (全モード共通)
  if (key === '[') { switchBank(-1); return; }
  if (key === ']') { switchBank(1); return; }

  // , / .: Guitar position cycle (Chord mode)
  if (key === ',' && GuitarPositionState.enabled) { cycleGuitarPosition(-1); return; }
  if (key === '.' && GuitarPositionState.enabled) { cycleGuitarPosition(1); return; }

  // < / >: Bass position cycle (Chord mode)
  if (key === '<' && BassPositionState.enabled) { cycleBassPosition(-1); return; }
  if (key === '>' && BassPositionState.enabled) { cycleBassPosition(1); return; }

  // Option+Perform keys: Save to slot using Perform layout (全16スロット, 全モード共通)
  // Must use e.code because Option+key produces special chars on Mac (e.g. Option+Q = œ)
  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code) {
    let physKey = null;
    if (e.code.startsWith('Digit')) physKey = e.code.charAt(5); // Digit1→1
    else if (e.code.startsWith('Key')) physKey = e.code.charAt(3).toLowerCase(); // KeyQ→q
    if (physKey && typeof PERFORM_KEY_MAP !== 'undefined') {
      const slotIdx = PERFORM_KEY_MAP[physKey];
      if (slotIdx !== undefined) {
        e.preventDefault();
        saveToPlainSlot(slotIdx);
        return;
      }
    }
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
    if (lk === 'c') { toggleTheoryView('circle'); return; }
    if (lk === 's') { toggleTheoryView('staff'); return; }
  }

  // Tab / Shift+Tab: Mode cycle (Scale → Chord → Input → Sequence → Scale)
  if (key === 'Tab') {
    e.preventDefault();
    const modes = ['scale', 'chord', 'input', 'sequence'];
    const cur = modes.indexOf(AppState.mode);
    const next = e.shiftKey ? (cur - 1 + modes.length) % modes.length : (cur + 1) % modes.length;
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

  // c: Plain capture (input mode only)
  if (lk === 'c' && AppState.mode === 'input') {
    plainCapture(); return;
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
    } else if (TastyState.enabled && VoicingState.selectedBoxIdx !== null) {
      // TASTY ON + box selected: deselect box only, keep TASTY
      VoicingState.selectedBoxIdx = null;
      render();
    } else if (StockState.enabled) {
      disableStock();
    } else if (TastyState.enabled) {
      disableTasty();
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

  // Shift+Space: Play All (memory slots sequential)
  if (key === ' ' && e.shiftKey) {
    e.preventDefault();
    ensureAudioResumed();
    playMemorySlots();
    return;
  }

  // Space: Dismiss startup tip if visible, otherwise play current chord
  if (key === ' ') {
    var tipEl = document.getElementById('startup-tip');
    if (tipEl) { e.preventDefault(); dismissStartupTip(); return; }
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
    var tc = document.getElementById('tips-toggle');
    if (tc) tc.checked = AppState.showTips !== false;
    return;
  }

  // m: Toggle Memory view (Memory ↔ previous)
  if (lk === 'm') {
    toggleMemoryView(memoryViewMode === 'memory' ? 'perform' : 'memory');
    return;
  }

  // p: Toggle Perform view (Perform ↔ previous)
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
      updateKeyButtons();
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

  // t: TASTY mode (toggle/cycle), Shift+T: cycle reverse
  if (lk === 't') {
    if (AppState.mode === 'chord' && TastyState.hpsUnlocked) {
      if (TastyState.enabled) {
        cycleTasty(e.shiftKey);
      } else {
        toggleTasty();
      }
    }
    return;
  }

  // k: STOCK voicing (toggle/cycle), Shift+K: cycle reverse
  if (lk === 'k') {
    if (AppState.mode === 'chord' && StockState.hpsUnlocked) {
      if (StockState.enabled) {
        cycleStock(e.shiftKey);
      } else {
        toggleStock();
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

  // v: Toggle Voicing Reflect (guitar → pad layout)
  if (lk === 'v') {
    if (AppState.mode === 'chord' && typeof toggleVoicingReflect === 'function') {
      toggleVoicingReflect();
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

// Option key hold: show save key labels on slots
document.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') {
    document.getElementById('memory-slots')?.classList.add('opt-held');
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    document.getElementById('memory-slots')?.classList.remove('opt-held');
  }
});
window.addEventListener('blur', () => {
  document.getElementById('memory-slots')?.classList.remove('opt-held');
});

render();
