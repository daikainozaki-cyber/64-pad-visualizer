// ========================================
// MODE & UI CONTROLS
// ========================================
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

// ======== PIANO KEYBOARD ========
function buildPianoKeyboard(containerId, onSelect) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';

  // White keys
  const whites = [{pc:0,name:'C'},{pc:2,name:'D'},{pc:4,name:'E'},{pc:5,name:'F'},{pc:7,name:'G'},{pc:9,name:'A'},{pc:11,name:'B'}];
  const whiteDiv = document.createElement('div');
  whiteDiv.className = 'piano-white';
  whites.forEach(w => {
    const key = document.createElement('div');
    key.className = 'piano-white-key';
    key.dataset.pc = w.pc;
    key.textContent = w.name;
    key.onclick = () => onSelect(w.pc);
    whiteDiv.appendChild(key);
  });
  wrap.appendChild(whiteDiv);

  // Black keys - positioned relative to white keys
  const blackDiv = document.createElement('div');
  blackDiv.className = 'piano-black-keys';
  // Pattern: C#(between C-D), D#(between D-E), gap, F#(between F-G), G#(between G-A), A#(between A-B)
  const blacks = [
    {pc:1, name:'C#', pos:0},
    {pc:3, name:'D#', pos:1},
    {pc:6, name:'F#', pos:3},
    {pc:8, name:'G#', pos:4},
    {pc:10, name:'A#', pos:5},
  ];

  // Create spacers and black keys
  // Each white key takes 1/7 of the width. Black keys sit between them.
  // We use absolute positioning via percentage
  blacks.forEach(b => {
    const key = document.createElement('div');
    key.className = 'piano-black-key';
    key.dataset.pc = b.pc;
    key.textContent = b.name;
    key.style.position = 'absolute';
    key.style.left = `calc(${(b.pos + 1) / 7 * 100}% - 18px)`;
    key.onclick = (e) => { e.stopPropagation(); onSelect(b.pc); };
    blackDiv.appendChild(key);
  });
  wrap.appendChild(blackDiv);
}

function highlightPianoKey(containerId, pc) {
  const wrap = document.getElementById(containerId);
  wrap.querySelectorAll('.piano-white-key, .piano-black-key').forEach(k => {
    k.classList.toggle('selected', parseInt(k.dataset.pc) === pc);
  });
}

function clearPianoSelection(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll('.selected').forEach(k => k.classList.remove('selected'));
}

// ======== QUALITY GRID ========
function initQualityGrid() {
  const grid = document.getElementById('quality-grid');
  grid.innerHTML = '';
  BUILDER_QUALITIES.forEach((row, ri) => {
    row.forEach((q, ci) => {
      const btn = document.createElement('button');
      btn.className = 'quality-btn' + (!q ? ' empty' : '');
      if (q) {
        btn.textContent = q.label;
        btn.onclick = () => selectQuality(q);
      }
      grid.appendChild(btn);
    });
  });
}

function highlightQuality(q) {
  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === q.label);
  });
}
function clearQualitySelection() {
  document.querySelectorAll('.quality-btn.selected').forEach(b => b.classList.remove('selected'));
}

// ======== QUALITY-DEPENDENT CONTROL VISIBILITY ========
function updateControlsForQuality(quality) {
  if (!quality) return;
  const isTriad = quality.pcs.length <= 3;

  // === Category A: Voicing controls ===
  document.getElementById('shell-bar').classList.toggle('hidden', isTriad);
  document.getElementById('btn-inv3').classList.toggle('hidden', isTriad);
  document.getElementById('drop-bar').classList.toggle('hidden', isTriad);

  // Triad switch: reset Shell/Drop/3rd Inv if they were active
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

  // === Category D: Theory-based tension restrictions ===
  const btns = document.querySelectorAll('#tension-grid .tension-btn');
  const has7th = quality.pcs.includes(10) || quality.pcs.includes(11) ||
                 (quality.pcs.includes(9) && quality.pcs.includes(6));
  // 6th chord = has 6th (pc=9) as chord tone, but not as dim7th
  const has6th = quality.pcs.includes(9) && !has7th;

  // Reset all quality-hidden and tension-uncommon first
  btns.forEach(btn => { btn.classList.remove('quality-hidden'); btn.classList.remove('tension-uncommon'); });

  // D: Without 7th, no altered tensions
  // sus4: allowed for triads (Cat D2 handles Maj/m vs dim/aug), hidden for non-7th tetrads (6, m6)
  // b13/b6 (pc=8) allowed: valid on triads (Cm(b6), Cmaj(add b6), Cdim(b13))
  // Natural 13 (pc=9) uses '6' label for non-7th → hide '13' labels but allow 'b13' labels
  if (!has7th) {
    btns.forEach(btn => {
      if (!btn._tension) return;
      const m = btn._tension.mods;
      if (m.replace3 !== undefined && !isTriad) { btn.classList.add('quality-hidden'); return; }
      if (m.sharp5 || m.flat5) { btn.classList.add('quality-hidden'); return; }
      if (m.add) {
        for (const pc of m.add) {
          if (pc === 1 || pc === 3) { btn.classList.add('quality-hidden'); return; } // b9, #9
        }
      }
      const label = btn._tension.label;
      if (label.includes('13') && !label.includes('b13')) { btn.classList.add('quality-hidden'); return; }
    });
  }

  // E: With 7th, hide "6" labels (use "13" instead)
  if (has7th) {
    const sixLabels = new Set(['6', '6/9', '6/9\n(#11)']);
    btns.forEach(btn => {
      if (btn._tension && sixLabels.has(btn._tension.label)) {
        btn.classList.add('quality-hidden');
      }
    });
  }

  // F: sus4 only for dominant 7 (C7sus4 is standard; Cmaj7sus4, Cm7sus4 etc. are not)
  if (has7th) {
    const isDominant7 = quality.pcs.includes(4) && quality.pcs.includes(10) && !quality.pcs.includes(11);
    if (!isDominant7) {
      btns.forEach(btn => {
        if (btn._tension && btn._tension.mods.replace3 !== undefined) {
          btn.classList.add('quality-hidden');
        }
      });
    }
  }

  // === Category B+C: PCS-based no-op and duplicate detection ===
  const basePCS = [...quality.pcs].sort((a, b) => a - b);
  const baseKey = basePCS.join(',');

  // Pass 1: compute result for each non-hidden tension
  const entries = [];
  btns.forEach(btn => {
    if (!btn._tension || btn.classList.contains('quality-hidden')) { entries.push(null); return; }
    const result = applyTension([...quality.pcs], btn._tension.mods);
    const resultKey = result.join(',');
    const m = btn._tension.mods;
    let complexity = 0;
    if (m.add) complexity += m.add.length;
    if (m.sharp5) complexity++;
    if (m.flat5) complexity++;
    if (m.replace3 !== undefined) complexity++;
    if (m.omit5) complexity++;
    if (m.omit3) complexity++;
    if (m.rootless) complexity++;
    entries.push({ btn, resultKey, complexity, isNoOp: resultKey === baseKey });
  });

  // Pass 2: group by result → find min complexity per group
  const groups = new Map();
  entries.forEach(e => {
    if (!e || e.isNoOp) return;
    if (!groups.has(e.resultKey)) groups.set(e.resultKey, []);
    groups.get(e.resultKey).push(e.complexity);
  });

  // Pass 3: show/hide
  entries.forEach(e => {
    if (!e) return;
    if (e.isNoOp) {
      e.btn.classList.add('quality-hidden');
      return;
    }
    const group = groups.get(e.resultKey);
    const minComplexity = Math.min(...group);
    if (group.length > 1 && e.complexity > minComplexity) {
      e.btn.classList.add('quality-hidden');
    }
  });

  // === Category G: Dim uncommon tensions for non-dominant 7th chords ===
  // Dominant 7 = altered tensions are standard (no dimming)
  // Other 7th chords = b9, #9, b13, aug, b5 are rarely used → dim (visible but faded)
  // Minor quality (m7, m△7) additionally dims #11 (only Dorian #4/HM uses it — extremely rare)
  // Maj7 keeps #11 fully visible (Lydian = jazz standard)
  if (has7th) {
    const isDom7 = quality.pcs.includes(4) && quality.pcs.includes(10) && !quality.pcs.includes(11);
    if (isDom7) {
      // Dominant 7: natural 11th (pc=5) is the ONLY avoid — clashes with 3rd (half step)
      // sus4 (replace3) is OK — it replaces 3rd, not adds alongside it
      // All other tensions (9, b9, #9, 13, b13, #11, aug, b5) are standard on dom7
      btns.forEach(btn => {
        if (!btn._tension || btn.classList.contains('quality-hidden')) return;
        const m = btn._tension.mods;
        if (m.replace3 !== undefined) return; // sus4 replaces 3rd, OK
        if (m.add && m.add.includes(5)) btn.classList.add('quality-hidden');
      });
    } else {
      const isMinor = quality.pcs.includes(3);
      // dim7: b13 is standard (Whole-Half Dim scale). m7(b5): b13 is avoid (keep dimmed)
      const isDim7 = isMinor && quality.pcs.includes(6) && quality.pcs.includes(9) && !quality.pcs.includes(10);
      // mM7: #11 doesn't exist (melodic/harmonic minor both have natural 4th only)
      const isMM7 = isMinor && quality.pcs.includes(11);
      btns.forEach(btn => {
        if (!btn._tension || btn.classList.contains('quality-hidden')) return;
        const m = btn._tension.mods;
        if (m.replace3 !== undefined) return; // sus4 already handled by Cat F
        if (m.sharp5 || m.flat5) { btn.classList.add('tension-uncommon'); return; }
        if (m.add) {
          // Priority 1: mM7 + #11 → hide (must check before dim to avoid order-dependent bugs)
          if (isMM7 && m.add.includes(6)) { btn.classList.add('quality-hidden'); return; }
          for (const pc of m.add) {
            if (pc === 1 || pc === 3) { btn.classList.add('tension-uncommon'); return; }
            if (pc === 8 && !isDim7) { btn.classList.add('tension-uncommon'); return; }
            if (pc === 6 && isMinor) { btn.classList.add('tension-uncommon'); return; }
          }
        }
      });
    }
  }

  // === Category G2: 11th avoid on all chords with major 3rd ===
  // 11th (pc=5) clashes with major 3rd (pc=4) — half step apart
  // Applies to: triads (Cmaj), 6th (C6), maj7 (C△7), dom7 (redundant w/ Cat G)
  // Minor chords are OK — m3 (pc=3) and 11 (pc=5) are a whole step apart
  if (quality.pcs.includes(4)) {
    btns.forEach(btn => {
      if (!btn._tension || btn.classList.contains('quality-hidden')) return;
      const m = btn._tension.mods;
      if (m.replace3 !== undefined) return; // sus4 replaces 3rd, no clash
      if (m.add && m.add.includes(5)) btn.classList.add('quality-hidden');
    });
  }

  // === Category G3: Minor non-7th + #11 restrictions ===
  // #11 on minor is very rare (only Dorian #4 / 4th mode of HM)
  // When combined with 6th (pc=9 in add), implies melodic minor → #11 doesn't exist → hide
  // Standalone #11 on minor triad → dim (tension-uncommon)
  if (quality.pcs.includes(3) && !has7th) {
    btns.forEach(btn => {
      if (!btn._tension || btn.classList.contains('quality-hidden')) return;
      const m = btn._tension.mods;
      if (m.add && m.add.includes(6)) { // has #11
        if (m.add.includes(9) || has6th) {
          // Combined with 6th (in tension mods or in base quality) → hide
          // m6 implies melodic minor → #11 doesn't exist
          btn.classList.add('quality-hidden');
        } else {
          // Standalone #11 on minor triad (no 6th) → very rare (Dorian #4), dim it
          btn.classList.add('tension-uncommon');
        }
      }
    });
  }

  // === Category G4: b13 on 6th chords → hide ===
  // 6 (pc=9, A) and b13 (pc=8, Ab) are a semitone apart — contradictory
  if (has6th) {
    btns.forEach(btn => {
      if (!btn._tension || btn.classList.contains('quality-hidden')) return;
      const m = btn._tension.mods;
      if (m.add && m.add.includes(8)) btn.classList.add('quality-hidden');
    });
  }

  // === Category H: add9 vs 9 — context-dependent label ===
  // With 7th or 6th: "add9" is wrong. Use "9" (e.g. Cmaj9, C6/9). Hide add9.
  // Without 7th/6th: "9" implies 7th present. Use "add9" (e.g. Cadd9). Hide 9.
  if (has7th || has6th) {
    btns.forEach(btn => {
      if (btn._tension && btn._tension.label === 'add9') btn.classList.add('quality-hidden');
    });
  } else {
    btns.forEach(btn => {
      if (btn._tension && btn._tension.label === '9') btn.classList.add('quality-hidden');
    });
  }

  // === Category D2: Triad-specific tension whitelist ===
  // Triads without 7th/6th: only allow add9, 6, 6/9, sus4
  // dim: no 6 (=dim7 enharmonic), no sus4, no 6/9
  // aug: no 6, no sus4, no 6/9
  // "Maj or m" = has perfect 5th (pc=7) — distinguishes from dim/aug
  if (isTriad && !has7th && !has6th) {
    const isMajOrMin = quality.pcs.includes(7);
    // Whitelist: add9 always; 6 and 6/9 for Maj/m only
    const allowedLabels = new Set(['add9']);
    if (isMajOrMin) { allowedLabels.add('6'); allowedLabels.add('6/9'); }

    btns.forEach(btn => {
      if (!btn._tension || btn.classList.contains('quality-hidden')) return;
      const m = btn._tension.mods;
      // sus4 (replace3) allowed for Maj and m only
      if (m.replace3 !== undefined) {
        if (!isMajOrMin) btn.classList.add('quality-hidden');
        return;
      }
      if (!allowedLabels.has(btn._tension.label)) {
        btn.classList.add('quality-hidden');
      }
    });
  }

  // === Triad promotion bar ===
  if (isTriad && !has7th && !has6th) {
    showTriadPromoteBar(quality);
  } else {
    hideTriadPromoteBar();
  }
}

// ======== TENSION GRID ========
function initTensionGrid() {
  const grid = document.getElementById('tension-grid');
  grid.innerHTML = '';
  // Determine max columns
  const maxCols = Math.max(...TENSION_ROWS.map(r => r.length));
  grid.style.gridTemplateColumns = `repeat(${maxCols}, 1fr)`;

  TENSION_ROWS.forEach((row) => {
    // Pad row to maxCols
    for (let i = 0; i < maxCols; i++) {
      const t = row[i] || null;
      const btn = document.createElement('button');
      btn.className = 'tension-btn' + (!t ? ' empty' : '');
      btn._tension = t || null;
      if (t) {
        btn.textContent = t.label;
        btn.onclick = function() { selectTension(t, this); };
      }
      grid.appendChild(btn);
    }
  });
}

function clearTensionSelection() {
  document.querySelectorAll('.tension-btn.selected').forEach(b => b.classList.remove('selected'));
}

// ======== ON-CHORD KEYBOARD ========
function initOnChordKeyboard() {
  buildPianoKeyboard('onchord-keyboard', selectBass);
  if (BuilderState.bass !== null) highlightPianoKey('onchord-keyboard', BuilderState.bass);
}

// ========================================
// WEB MIDI & CHORD DETECTION
// ========================================
const midiActiveNotes = new Set(); // currently held MIDI notes
let midiAccess = null;

// Build chord detection database from BUILDER_QUALITIES + tension extensions
function buildChordDB() {
  const db = [];
  BUILDER_QUALITIES.flat().forEach(q => {
    if (!q) return;
    db.push({ name: q.name || 'Maj', pcs: q.pcs, pcsSet: new Set(q.pcs) });
  });
  // Tension chords (interval as mod 12 for detection)
  const tensionChords = [
    // 9th chords (tension notation: 7th以上はテンション表記)
    { name: '7(9)', pcs: [0,4,7,10,2] },        // dominant 9 (full voicing)
    { name: 'm7(9)', pcs: [0,3,7,10,2] },        // minor 9 (full voicing)
    { name: '△7(9)', pcs: [0,4,7,11,2] },        // major 9 (full voicing)
    { name: '6/9', pcs: [0,4,7,9,2] },        // 6/9 (no 7th → そのまま)
    { name: 'm6/9', pcs: [0,3,7,9,2] },       // minor 6/9
    { name: '7(b9)', pcs: [0,4,7,10,1] },     // 7 flat 9
    { name: '7(#9)', pcs: [0,4,7,10,3] },     // 7 sharp 9
    { name: 'm7(b9)', pcs: [0,3,7,10,1] },    // m7 flat 9
    // 11th chords
    { name: '7(9,11)', pcs: [0,4,7,10,2,5] },   // dominant 11
    { name: 'm7(9,11)', pcs: [0,3,7,10,2,5] },   // minor 11
    { name: '△7(9,#11)', pcs: [0,4,7,11,2,6] }, // major 9 sharp 11
    { name: '7(#11)', pcs: [0,4,7,10,6] },    // 7 sharp 11
    // 13th chords
    { name: '7(9,13)', pcs: [0,4,7,10,2,9] },      // dominant 13
    { name: 'm7(9,13)', pcs: [0,3,7,10,2,9] },     // minor 13
    { name: '△7(9,13)', pcs: [0,4,7,11,2,9] },     // major 13
    { name: '7(b13)', pcs: [0,4,7,10,8] },    // 7 flat 13
    // Combined tensions (multiple tensions)
    { name: '7(9,#11)', pcs: [0,4,7,10,2,6] },    // dominant 9 sharp 11 (Lydian dominant)
    { name: '7(9,b13)', pcs: [0,4,7,10,2,8] },    // dominant 9 flat 13
    { name: '7(b9,#11)', pcs: [0,4,7,10,1,6] },   // 7 flat 9 sharp 11
    { name: '7(b9,b13)', pcs: [0,4,7,10,1,8] },   // 7 flat 9 flat 13
    { name: '7(#9,b13)', pcs: [0,4,7,10,3,8] },   // 7 sharp 9 flat 13
    { name: '7(b9,13)', pcs: [0,4,7,10,1,9] },    // 7 flat 9 natural 13
    { name: '7(#9,13)', pcs: [0,4,7,10,3,9] },    // 7 sharp 9 natural 13
    { name: '7(#11,13)', pcs: [0,4,7,10,6,9] },        // R,3,5,b7,#11,13
    { name: '7(9,#11,13)', pcs: [0,4,7,10,2,6,9] },   // 13 sharp 11
    { name: '7(b9,#11,13)', pcs: [0,4,7,10,1,6,9] },  // 7 b9 #11 13
    // Compact combined tensions (no 5th)
    { name: '7(9,#11)', pcs: [0,4,10,2,6] },      // R,3,b7,9,#11 (no 5th)
    { name: '7(9,b13)', pcs: [0,4,10,2,8] },      // R,3,b7,9,b13 (no 5th)
    { name: '7(9,13)', pcs: [0,4,10,2,9] },       // R,3,b7,9,13 (no 5th)
    { name: '7(b9,#11)', pcs: [0,4,10,1,6] },     // R,3,b7,b9,#11 (no 5th)
    { name: '7(b9,b13)', pcs: [0,4,10,1,8] },     // R,3,b7,b9,b13 (no 5th)
    { name: '7(b9,13)', pcs: [0,4,10,1,9] },      // R,3,b7,b9,13 (no 5th)
    { name: '7(#9,b13)', pcs: [0,4,10,3,8] },     // R,3,b7,#9,b13 (no 5th)
    { name: '7(#9,13)', pcs: [0,4,10,3,9] },      // R,3,b7,#9,13 (no 5th)
    { name: '7(#11,13)', pcs: [0,4,10,6,9] },    // R,3,b7,#11,13 (no 5th)
    // Compact tension voicings (no 5th) — 7th + tension
    { name: '7(13)', pcs: [0,4,10,9] },       // R,3,b7,13
    { name: 'm7(13)', pcs: [0,3,10,9] },      // R,m3,b7,13
    { name: '△7(13)', pcs: [0,4,11,9] },      // R,3,M7,13
    { name: '7(11)', pcs: [0,4,10,5] },       // R,3,b7,11
    { name: 'm7(11)', pcs: [0,3,10,5] },      // R,m3,b7,11
    { name: '7(9)', pcs: [0,4,10,2] },        // R,3,b7,9 (no 5)
    { name: 'm7(9)', pcs: [0,3,10,2] },       // R,m3,b7,9 (no 5)
    { name: '△7(9)', pcs: [0,4,11,2] },       // R,3,M7,9 (no 5)
    // sus chords
    { name: 'sus4', pcs: [0,5,7] },
    { name: 'sus2', pcs: [0,2,7] },
    { name: '7sus4', pcs: [0,5,7,10] },
    { name: '7sus4(9)', pcs: [0,5,7,10,2] },       // R,4,5,b7,9
    { name: '7sus4(9)', pcs: [0,5,10,2] },          // R,4,b7,9 (no 5)
    { name: '7sus4(9,13)', pcs: [0,5,7,10,2,9] },   // R,4,5,b7,9,13
    { name: '7sus4(9,13)', pcs: [0,5,10,2,9] },     // R,4,b7,9,13 (no 5)
    { name: '7sus4(b9)', pcs: [0,5,7,10,1] },       // R,4,5,b7,b9
    { name: '7sus4(b9)', pcs: [0,5,10,1] },         // R,4,b7,b9 (no 5)
    // add chords
    { name: 'add9', pcs: [0,4,7,2] },
    { name: 'madd9', pcs: [0,3,7,2] },
  ];
  tensionChords.forEach(c => {
    db.push({ name: c.name, pcs: c.pcs, pcsSet: new Set(c.pcs) });
  });
  return db;
}
const CHORD_DB = buildChordDB();

// Triad-only DB for bass+triad detection
const TRIAD_DB = [
  { name: 'Maj', pcs: [0,4,7] },
  { name: 'm', pcs: [0,3,7] },
  { name: 'dim', pcs: [0,3,6] },
  { name: 'aug', pcs: [0,4,8] },
  { name: 'sus4', pcs: [0,5,7] },
  { name: 'sus2', pcs: [0,2,7] },
];
const TETRAD_DB = [
  { name: '△7', pcs: [0,4,7,11] },
  { name: '7', pcs: [0,4,7,10] },
  { name: 'm7', pcs: [0,3,7,10] },
  { name: 'm△7', pcs: [0,3,7,11] },
  { name: 'm7(b5)', pcs: [0,3,6,10] },
  { name: 'dim7', pcs: [0,3,6,9] },
  { name: '6', pcs: [0,4,7,9] },
  { name: 'm6', pcs: [0,3,7,9] },
  { name: '7sus4', pcs: [0,5,7,10] },
];

function detectChord(midiNotes) {
  if (midiNotes.length < 2) return [];
  const pcs = [...new Set(midiNotes.map(n => n % 12))].sort((a, b) => a - b);
  if (pcs.length < 2) return [];
  const lowestPC = midiNotes.reduce((a, b) => a < b ? a : b) % 12;
  const candidates = [];
  const seen = new Set();
  for (const rootPC of pcs) {
    const intervals = new Set(pcs.map(pc => ((pc - rootPC) + 12) % 12));
    for (const chord of CHORD_DB) {
      // Exact match (allow 1 extra note)
      if (chord.pcs.length <= pcs.length + 1) {
        const matched = chord.pcs.filter(iv => intervals.has(iv)).length;
        if (matched === chord.pcs.length) {
          const extra = pcs.length - chord.pcs.length;
          const isRootPosition = rootPC === lowestPC;
          const score = (isRootPosition ? 100 : 0) + chord.pcs.length * 10 - extra;
          const rootName = NOTE_NAMES_SHARP[rootPC];
          const bass = lowestPC !== rootPC ? ' / ' + NOTE_NAMES_SHARP[lowestPC] : '';
          const name = rootName + chord.name + bass;
          if (!seen.has(name)) {
            seen.add(name);
            candidates.push({ name, rootPC, score });
          }
        }
      }
      // Omit5 match: 4音以上のコードで5度(7)を含む場合、5度省略もチェック
      if (chord.pcs.length >= 4 && chord.pcs.includes(7)) {
        const omit5pcs = chord.pcs.filter(iv => iv !== 7);
        if (omit5pcs.length <= pcs.length + 1) {
          const matched = omit5pcs.filter(iv => intervals.has(iv)).length;
          if (matched === omit5pcs.length) {
            const extra = pcs.length - omit5pcs.length;
            const isRootPosition = rootPC === lowestPC;
            // omit5はexactより少しスコアを下げるが、トライアドよりは上
            const score = (isRootPosition ? 100 : 0) + chord.pcs.length * 10 - extra - 5;
            const rootName = NOTE_NAMES_SHARP[rootPC];
            const bass = lowestPC !== rootPC ? ' / ' + NOTE_NAMES_SHARP[lowestPC] : '';
            // テンションコード(5音以上)は5度省略が普通なのでomit5表記しない
            const omitLabel = chord.pcs.length >= 5 ? '' : '(omit5)';
            const name = rootName + chord.name + omitLabel + bass;
            if (!seen.has(name)) {
              seen.add(name);
              candidates.push({ name, rootPC, score });
            }
          }
        }
      }
    }
  }
  // Bass + Triad detection: 最低音をベースとし、上の音でトライアドを探す
  if (pcs.length >= 3) {
    const upperPCs = pcs.filter(pc => pc !== lowestPC);
    if (upperPCs.length >= 3) {
      for (const triadRoot of upperPCs) {
        const triadIntervals = new Set(upperPCs.map(pc => ((pc - triadRoot) + 12) % 12));
        for (const triad of TRIAD_DB) {
          const matched = triad.pcs.filter(iv => triadIntervals.has(iv)).length;
          if (matched === triad.pcs.length) {
            const triadName = NOTE_NAMES_SHARP[triadRoot] + (triad.name === 'Maj' ? '' : triad.name);
            const bassName = NOTE_NAMES_SHARP[lowestPC];
            const name = triadName + ' / ' + bassName;
            if (!seen.has(name)) {
              seen.add(name);
              // Bass+triadはスコア低め（既存コードネームを優先）
              const isTriadRoot = triadRoot === lowestPC;
              const score = (isTriadRoot ? 100 : 0) + 25;
              candidates.push({ name, rootPC: triadRoot, score });
            }
          }
        }
      }
    }
  }
  // Bass + Tetrad detection: 最低音をベースとし、上の音でテトラッドを探す
  // 5音でルートから5度上に音がない場合、R+4和音の可能性を考える
  if (pcs.length >= 4) {
    const upperPCs = pcs.filter(pc => pc !== lowestPC);
    if (upperPCs.length >= 4) {
      for (const tetRoot of upperPCs) {
        const tetIntervals = new Set(upperPCs.map(pc => ((pc - tetRoot) + 12) % 12));
        for (const tet of TETRAD_DB) {
          const matched = tet.pcs.filter(iv => tetIntervals.has(iv)).length;
          if (matched === tet.pcs.length) {
            const tetName = NOTE_NAMES_SHARP[tetRoot] + tet.name;
            const bassName = NOTE_NAMES_SHARP[lowestPC];
            if (tetRoot === lowestPC) continue; // ルート=ベースならスラッシュ不要（既に検出済み）
            const name = tetName + ' / ' + bassName;
            if (!seen.has(name)) {
              seen.add(name);
              // Bass+tetradはBass+triadより上、ルートポジションコードより下
              const score = 30 + tet.pcs.length * 5;
              candidates.push({ name, rootPC: tetRoot, score });
            }
          }
        }
      }
    }
  }
  // 6th + 7th → 13thテンション表記 リネーム
  // 6thと7thが同時に存在する場合、6→7(13)に変換（テンション表記）
  candidates.forEach(c => {
    const rootIntervals = new Set(pcs.map(pc => ((pc - c.rootPC) + 12) % 12));
    const has7th = rootIntervals.has(10) || rootIntervals.has(11);
    if (has7th) {
      const is7 = rootIntervals.has(10); // b7 → dominant, △7 → major
      const sfx = is7 ? '7' : '△7';
      c.name = c.name.replace(/^([A-G]#?)6\/9(\(omit5\))?/, '$1' + sfx + '(9,13)');
      c.name = c.name.replace(/^([A-G]#?)m6\/9(\(omit5\))?/, '$1m' + sfx + '(9,13)');
      c.name = c.name.replace(/^([A-G]#?)6(\(omit5\))?/, '$1' + sfx + '(13)');
      c.name = c.name.replace(/^([A-G]#?)m6(\(omit5\))?/, '$1m' + sfx + '(13)');
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 8);
}

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
  for (var i = 0; i < PAD_QUALITY_KEYS.length; i++) {
    var qKey = PAD_QUALITY_KEYS[i];
    if (qKey.indexOf(qualityInput) === 0 || qKey.toLowerCase().indexOf(qualityInput.toLowerCase()) === 0) {
      var fullName = rootStr + qKey;
      var parsed = padParseChordName(fullName);
      if (parsed) {
        candidates.push({
          name: parsed.displayName,
          quality: qKey,
          exactMatch: qKey === qualityInput || qKey.toLowerCase() === qualityInput.toLowerCase(),
        });
      }
    }
  }

  var wantMinor = (rootWasLower && !qualityInput) || (qualityInput.length > 0 && qualityInput[0] === 'm');
  var wantMajor = qualityInput.length > 0 && qualityInput[0] === 'M';

  candidates.sort(function(a, b) {
    if (a.exactMatch !== b.exactMatch) return b.exactMatch - a.exactMatch;
    if (wantMinor) {
      var aM = a.quality.indexOf('m') === 0 ? 1 : 0;
      var bM = b.quality.indexOf('m') === 0 ? 1 : 0;
      if (aM !== bM) return bM - aM;
    } else if (wantMajor) {
      var aJ = (a.quality.indexOf('M') === 0 || a.quality.indexOf('maj') === 0) ? 1 : 0;
      var bJ = (b.quality.indexOf('M') === 0 || b.quality.indexOf('maj') === 0) ? 1 : 0;
      if (aJ !== bJ) return bJ - aJ;
    }
    return a.quality.length - b.quality.length;
  });

  return candidates.slice(0, 12);
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
  buildChordDB, CHORD_DB, TRIAD_DB, TETRAD_DB, detectChord,
};
