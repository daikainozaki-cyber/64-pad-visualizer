// ========================================
// INITIALIZATION
// ========================================
// Load saved settings BEFORE UI init (so AppState has restored values)
loadAppSettings();
if (!AppState.showBadges) document.body.classList.add('hide-badges');

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

// Launchpad LED: same HPS gate
_lpHpsUnlocked = new URLSearchParams(window.location.search).has('hps');

// Genre Preset: HPS-only UI (Desktop paid version always has ?hps)
(function() {
  var hps = new URLSearchParams(window.location.search).has('hps');
  var sel = document.getElementById('genre-preset-select');
  if (sel && hps) {
    sel.style.display = '';
    if (_presetParam && GENRE_WEIGHTS[_presetParam]) sel.value = _presetParam;
  }
})();

initKeyButtons();
initScaleSelect();
initChordKeyPicker();
initRootGrid();
initQualityGrid();
initTensionGrid();
updateOctaveLabel();
initMemorySlots();
initWebMIDI();
initPlayControls();
initTextChordInput();
I18N.init();

// Pane order (ABC preset switch)
function setPaneOrder(preset) {
  var orders = { A: 0, B: 1, C: 2 };
  for (var i = 0; i < preset.length; i++) {
    orders[preset[i]] = i;
  }
  document.querySelector('[data-pane="A"]').style.order = orders.A;
  document.querySelector('[data-pane="B"]').style.order = orders.B;
  document.querySelector('[data-pane="C"]').style.order = orders.C;
  localStorage.setItem('64pad-pane-order', preset);
  var sel = document.getElementById('pane-order-select');
  if (sel) sel.value = preset;
}
// Restore saved pane order (default: ABC)
(function() {
  var saved = localStorage.getItem('64pad-pane-order');
  if (saved && /^[ABC]{3}$/.test(saved) && saved.indexOf('A') >= 0 && saved.indexOf('B') >= 0 && saved.indexOf('C') >= 0) {
    setPaneOrder(saved);
  }
})();

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
  // Key rows: full rows for Scale only, compact row for Chord only
  document.getElementById('key-rows').style.display = AppState.mode === 'scale' ? '' : 'none';
  document.getElementById('key-label').style.display = AppState.mode === 'scale' ? '' : 'none';
  document.getElementById('chord-key-row').style.display = AppState.mode === 'chord' ? '' : 'none';
  if (AppState.mode === 'chord') { updateChordKeyDisplay(); }
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
  document.getElementById('inst-toggle-link').classList.toggle('active', linkMode);
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


  // Cmd+Option (Mac) / Ctrl+Alt (Win): Display toggle shortcuts (Ableton-style)
  // Uses e.code because Option+key produces special chars on Mac
  if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code) {
    var cmdOptCode = e.code;
    // Instruments
    if (cmdOptCode === 'KeyG') { e.preventDefault(); toggleInstrument('guitar'); return; }
    if (cmdOptCode === 'KeyB') { e.preventDefault(); toggleInstrument('bass'); return; }
    if (cmdOptCode === 'KeyP') { e.preventDefault(); toggleInstrument('piano'); return; }
    // Right panel
    if (cmdOptCode === 'KeyF') { e.preventDefault(); toggleTheoryView('circle'); return; }
    if (cmdOptCode === 'KeyS') { e.preventDefault(); toggleTheoryView('staff'); return; }
    if (cmdOptCode === 'KeyA') { e.preventDefault(); toggleInstrument('sound'); return; }
    if (cmdOptCode === 'KeyM') { e.preventDefault(); toggleSection('memory'); return; }
    // Control panel sections
    if (cmdOptCode === 'KeyT') { e.preventDefault(); toggleSection('input'); return; }
    if (cmdOptCode === 'KeyQ') { e.preventDefault(); toggleSection('quality'); return; }
    if (cmdOptCode === 'KeyV') { e.preventDefault(); toggleSection('voicing'); return; }
    if (cmdOptCode === 'KeyL') { e.preventDefault(); toggleLinkMode(); return; }
    if (cmdOptCode === 'KeyK') { e.preventDefault(); toggleKeyDisplay(); return; }
    if (cmdOptCode === 'KeyH') { e.preventDefault(); toggleHeader(); return; }
    // Shortcut key indicators
    if (cmdOptCode === 'KeyI') { e.preventDefault(); toggleBadges(); return; }
    // Diatonic extensions
    if (cmdOptCode === 'KeyN') { e.preventDefault(); toggleMinorVariants(); return; }
    if (cmdOptCode === 'KeyD') { e.preventDefault(); toggleSecDom(); return; }
    if (cmdOptCode === 'KeyR') { e.preventDefault(); toggleParallelKey(); return; }
    if (cmdOptCode === 'KeyF') { e.preventDefault(); toggleHarmonicFn(); return; }
  }

  // Shift+D: Cycle Drop (voicing operation, not display toggle)
  if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
    if (lk === 'd') {
      if (AppState.mode === 'chord' && BuilderState.quality) {
        if (!VoicingState.drop) setDrop('drop2');
        else if (VoicingState.drop === 'drop2') setDrop('drop3');
        else setDrop(null);
      }
      return;
    }
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
      var midiDelta = key === 'ArrowRight' ? 1 : -1;
      if (TastyState.enabled) {
        refreshTastyVoicing(midiDelta);
      } else if (StockState.enabled) {
        refreshStockVoicing(midiDelta);
      } else if (VoicingState.selectedBoxIdx !== null) {
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
      const noteCount = AppState.diatonicMode === 'triad' ? 3 : 4;
      const tetrads = getDiatonicTetrads(scale.pcs, AppState.key, noteCount);
      if (num - 1 < tetrads.length) {
        onDiatonicClick(tetrads[num - 1]);
      }
    }
    return;
  }

  // t: TASTY mode toggle (ON/OFF only)
  if (lk === 't') {
    if (AppState.mode === 'chord' && TastyState.hpsUnlocked) {
      toggleTasty();
    }
    return;
  }

  // k: STOCK voicing toggle (ON/OFF only)
  if (lk === 'k') {
    if (AppState.mode === 'chord' && StockState.hpsUnlocked) {
      toggleStock();
    }
    return;
  }

  // z/x: TASTY or STOCK prev/next (paired keys)
  if (lk === 'z' || lk === 'x') {
    if (AppState.mode === 'chord') {
      var reverse = lk === 'z';
      if (TastyState.enabled) { cycleTasty(reverse); return; }
      if (StockState.enabled) { cycleStock(reverse); return; }
    }
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

// Toggle Key display (Cmd+Opt+K)
function toggleKeyDisplay() {
  var keyRows = document.getElementById('key-rows');
  var keyLabel = document.getElementById('key-label');
  var chordKeyRow = document.getElementById('chord-key-row');
  var visible = keyRows && keyRows.style.display !== 'none';
  if (keyRows) keyRows.style.display = visible ? 'none' : '';
  if (keyLabel) keyLabel.style.display = visible ? 'none' : '';
  if (chordKeyRow) chordKeyRow.style.display = visible ? 'none' : '';
}

render();

// Section toggle (Chord panel collapsible sections)
function toggleSection(name) {
  var section = document.getElementById('section-' + name) || (name === 'key' ? document.getElementById('chord-key-row') : null);
  var btn = document.getElementById('sect-' + name);
  if (!section) return;
  var visible = section.style.display !== 'none';
  section.style.display = visible ? 'none' : '';
  if (btn) btn.classList.toggle('active', !visible);
  // Quality toggles Root together
  if (name === 'quality') {
    var rootSect = document.getElementById('section-root');
    if (rootSect) rootSect.style.display = visible ? 'none' : '';
  }
  try {
    var s = JSON.parse(localStorage.getItem('64pad-sections') || '{}');
    s[name] = !visible;
    localStorage.setItem('64pad-sections', JSON.stringify(s));
  } catch(_) {}
}
// Restore section states
(function() {
  try {
    var s = JSON.parse(localStorage.getItem('64pad-sections') || '{}');
    ['key', 'input', 'quality', 'voicing', 'memory'].forEach(function(name) {
      if (s[name] === false) {
        toggleSection(name);
      }
    });
  } catch(_) {}
})();

// Update notification: glow tutorial button after SW update
(function() {
  try {
    if (localStorage.getItem('64pad-just-updated') === '1') {
      localStorage.removeItem('64pad-just-updated');
      var btn = document.getElementById('tut-btn');
      if (btn) {
        btn.style.animation = 'hint-pulse 1.5s ease-in-out 3';
        btn.style.color = 'var(--accent)';
        setTimeout(function() { btn.style.animation = ''; btn.style.color = ''; }, 5000);
      }
    }
  } catch(_) {}
})();

// ========================================
// HEADER TOGGLE (⌘⌥H)
// ========================================
function toggleHeader() {
  var row = document.querySelector('.header-row');
  if (!row) return;
  var visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : '';
  try { localStorage.setItem('64pad-header-hidden', visible ? '1' : ''); } catch(_) {}
}
// Restore header state
(function() {
  try {
    if (localStorage.getItem('64pad-header-hidden') === '1') toggleHeader();
  } catch(_) {}
})();

// ========================================
// INFO BAR (hover info — aligned to right panel)
// ========================================
(function() {
  var bar = document.getElementById('info-bar');
  if (!bar) return;
  var defaultKey = 'info.default';

  function setInfo(key) {
    var text = t(key);
    bar.textContent = (text !== key) ? text : '';
  }

  // Align info bar to match right panel (staff-ep-panel) exactly
  function alignInfoBar() {
    var panel = document.getElementById('staff-ep-panel');
    var row = document.querySelector('.header-row');
    if (!panel || !row) return;
    var panelRect = panel.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    bar.style.left = (panelRect.left - rowRect.left) + 'px';
    bar.style.right = (rowRect.right - panelRect.right) + 'px';
  }
  window.addEventListener('resize', alignInfoBar);
  // Run after fonts/layout settle, and periodically for pane changes
  requestAnimationFrame(function() { requestAnimationFrame(alignInfoBar); });
  setInterval(alignInfoBar, 2000);

  setInfo(defaultKey);

  document.addEventListener('mouseenter', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-info]');
    if (el) setInfo(el.getAttribute('data-info'));
  }, true);

  document.addEventListener('mouseleave', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-info]');
    if (el) setInfo(defaultKey);
  }, true);
})();
