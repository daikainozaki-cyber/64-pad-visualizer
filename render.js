// ========================================
// MOBILE RESPONSIVE HELPERS
// ========================================
var _isMobile = false;
var _isLandscape = false;
var _mobileMediaQuery = window.matchMedia('(max-width: 767px)');
var _landscapeMediaQuery = window.matchMedia('(max-height: 500px) and (orientation: landscape)');

function handleMobileChange(e) {
  _isMobile = e.matches;
  moveMemorySection(_isMobile);
  moveInstrumentRow(_isMobile);
  if (typeof render === 'function') render();
}

function handleLandscapeChange(e) {
  _isLandscape = e.matches;
  if (_isLandscape) {
    // Move instrument row to info panel for landscape too
    moveInstrumentRow(true);
    // Render 32-pad overlay
    syncPlayControls();
    renderPad32();
  } else if (!_isMobile) {
    // Restore desktop layout
    moveInstrumentRow(false);
    var cp = document.querySelector('.control-panel');
    var sp = document.getElementById('staff-ep-panel');
    if (cp) cp.classList.remove('landscape-hidden');
    if (sp) sp.classList.remove('landscape-hidden');
  }
  if (typeof render === 'function') render();
}

function moveMemorySection(toMobile) {
  // Memory stays in #staff-ep-panel (Screen 3) in all modes
  // No DOM move needed
}

function moveInstrumentRow(toMobile) {
  var instRow = document.getElementById('instrument-row');
  if (!instRow) return;
  var builderContent = document.querySelector('.pad-area');
  var staffPanel = document.getElementById('staff-ep-panel');
  if (toMobile) {
    // Move instrument row to top of staff panel (Screen 3)
    if (instRow.parentElement !== staffPanel) {
      staffPanel.insertBefore(instRow, staffPanel.firstChild);
    }
    instRow.style.display = '';
  } else {
    // Move back to builder content area
    if (instRow.parentElement !== builderContent) {
      builderContent.appendChild(instRow);
    }
    instRow.style.display = '';
  }
}

function initScreenDots() {
  var appLayout = document.querySelector('.app-layout');
  var dots = document.querySelectorAll('#screen-dots .dot');
  if (!appLayout || !dots.length) return;
  appLayout.addEventListener('scroll', function() {
    if (!_isMobile) return;
    var scrollLeft = appLayout.scrollLeft;
    var screenWidth = appLayout.clientWidth;
    var idx = Math.round(scrollLeft / screenWidth);
    dots.forEach(function(d, i) {
      d.classList.toggle('active', i === idx);
    });
  });
}

function goToScreen(index) {
  var appLayout = document.querySelector('.app-layout');
  if (!appLayout) return;
  appLayout.scrollTo({
    left: index * appLayout.clientWidth,
    behavior: 'smooth'
  });
}

function setLandscapeTab(tab) {
  var cp = document.querySelector('.control-panel');
  var sp = document.getElementById('staff-ep-panel');
  var tabs = document.querySelectorAll('.landscape-tab');
  if (tab === 'control') {
    if (cp) cp.classList.remove('landscape-hidden');
    if (sp) sp.classList.add('landscape-hidden');
  } else {
    if (cp) cp.classList.add('landscape-hidden');
    if (sp) sp.classList.remove('landscape-hidden');
  }
  tabs.forEach(function(t) {
    t.classList.toggle('active', (tab === 'control' && t.textContent === 'Control') || (tab === 'info' && t.textContent === 'Info'));
  });
}

// ========================================
// RENDER (MAIN)
// ========================================

function computeRenderState() {
  let activePCS, activeLabel, rootPC, bassPC = null;
  let charPCS = new Set();
  let omittedPCS = new Set();
  let guide3PCS = new Set();
  let guide7PCS = new Set();
  let tensionPCS = new Set();
  let qualityPCS = null;
  let avoidPCS = new Set();

  if (AppState.mode === 'input') {
    let notes = [...PlainState.activeNotes].sort((a, b) => a - b);
    activePCS = new Set(notes.map(n => n % 12));
    // Merge instrument input notes for unified chord detection
    if (instrumentInputActive) {
      const instrNotes = getAllInputMidiNotes();
      const merged = new Set([...instrNotes, ...notes]);
      notes = [...merged].sort((a, b) => a - b);
      instrNotes.forEach(n => activePCS.add(n % 12));
    }
    // Detect chord → rootPC for instrument diagrams, staff, and pad root highlight
    // Pad degree labels remain hidden (guarded by AppState.mode !== 'input')
    rootPC = null;
    if (notes.length >= 2) {
      const candidates = detectChord(notes);
      if (candidates.length > 0) {
        rootPC = candidates[0].rootPC;
      }
    }
    activeLabel = '';
    return { activePCS, activeLabel, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS };
  } else if (AppState.mode === 'scale') {
    const scale = SCALES[AppState.scaleIdx];
    activePCS = new Set(scale.pcs.map(pc => (pc + AppState.key) % 12));
    rootPC = AppState.key;
    activeLabel = pcName(AppState.key) + ' ' + scale.name;
    if (scale.cn && scale.cn.length > 0) {
      charPCS = new Set(scale.cn.map(pc => (pc + AppState.key) % 12));
    }
  } else {
    const pcs = getBuilderPCS();
    rootPC = BuilderState.root !== null ? BuilderState.root : 0;
    qualityPCS = BuilderState.quality ? BuilderState.quality.pcs : null;
    if (pcs) {
      activePCS = new Set(pcs.map(pc => (pc + rootPC) % 12));
      // Track tension notes (compound intervals >= 12)
      pcs.filter(pc => pc >= 12).forEach(pc => tensionPCS.add((pc + rootPC) % 12));
      activeLabel = getBuilderChordName();
      if (BuilderState.bass !== null) bassPC = BuilderState.bass;
      // Apply voicing toggles
      const p5 = (rootPC + 7) % 12;
      const p3maj = (rootPC + 4) % 12;
      const p3min = (rootPC + 3) % 12;
      if (VoicingState.omit5 && activePCS.has(p5)) {
        activePCS.delete(p5); omittedPCS.add(p5);
      }
      if (VoicingState.rootless && activePCS.has(rootPC)) {
        activePCS.delete(rootPC); omittedPCS.add(rootPC);
      }
      if (VoicingState.omit3) {
        if (activePCS.has(p3maj)) { activePCS.delete(p3maj); omittedPCS.add(p3maj); }
        if (activePCS.has(p3min)) { activePCS.delete(p3min); omittedPCS.add(p3min); }
      }
      // Shell voicing: keep only R, 3rd, 7th
      if (VoicingState.shell) {
        const shellIntervals = new Set([0]); // always root
        [3,4].forEach(iv => shellIntervals.add(iv));   // 3rd (b3 or 3)
        [10,11].forEach(iv => shellIntervals.add(iv));  // 7th (b7 or △7)
        // Also keep 6th for 6th chords (no 7th)
        if (qualityPCS && qualityPCS.includes(9) && !qualityPCS.includes(10) && !qualityPCS.includes(11)) {
          shellIntervals.add(9);
        }
        for (const pc of [...activePCS]) {
          const iv = ((pc - rootPC) + 12) % 12;
          if (!shellIntervals.has(iv) && !tensionPCS.has(pc)) {
            activePCS.delete(pc); omittedPCS.add(pc);
          }
        }
      }
      // Guide tones: 3rd and 7th separately
      [3,4].forEach(iv => { const pc = (rootPC + iv) % 12; if (activePCS.has(pc)) guide3PCS.add(pc); });
      [10,11].forEach(iv => { const pc = (rootPC + iv) % 12; if (activePCS.has(pc)) guide7PCS.add(pc); });
      // 6th chords: treat 6th as guide tone (replaces 7th role)
      if (qualityPCS && qualityPCS.includes(9) && !qualityPCS.includes(10) && !qualityPCS.includes(11)) {
        const pc = (rootPC + 9) % 12; if (activePCS.has(pc)) guide7PCS.add(pc);
      }
    } else {
      activePCS = new Set();
      activeLabel = BuilderState.root !== null ? pcName(BuilderState.root) + '...' : t('builder.select_root');
    }
  }

  // padExtNotes override: when user toggled pad notes in chord mode, override the chord display
  if (AppState.mode === 'chord' && padExtNotes.size > 0) {
    const extMidi = [...padExtNotes].sort((a, b) => a - b);
    activePCS = new Set(extMidi.map(n => n % 12));
    const detected = detectChord(extMidi);
    if (detected.length > 0) {
      rootPC = detected[0].rootPC;
      activeLabel = detected[0].name;
    } else if (extMidi.length > 0) {
      rootPC = extMidi[0] % 12;
      activeLabel = [...activePCS].map(pc => NOTE_NAMES_SHARP[pc]).join(' ');
    }
    // Recompute guide tones from detected chord
    guide3PCS = new Set(); guide7PCS = new Set(); tensionPCS = new Set();
    omittedPCS = new Set(); charPCS = new Set();
    [3,4].forEach(iv => { const pc = (rootPC + iv) % 12; if (activePCS.has(pc)) guide3PCS.add(pc); });
    [10,11].forEach(iv => { const pc = (rootPC + iv) % 12; if (activePCS.has(pc)) guide7PCS.add(pc); });
  }

  // Avoid notes: tension notes that are a half step above a non-tension chord tone
  avoidPCS = new Set();
  if (AppState.mode === 'chord' && tensionPCS.size > 0) {
    const baseTones = new Set([...activePCS].filter(pc => !tensionPCS.has(pc)));
    omittedPCS.forEach(pc => baseTones.add(pc));
    for (const tpc of tensionPCS) {
      const below = (tpc - 1 + 12) % 12;
      if (baseTones.has(below)) {
        avoidPCS.add(tpc);
      }
    }
  }

  // Interval-based PCS for chordDegreeName (expects intervals, not absolute pitch classes)
  const activeIvPCS = (AppState.mode === 'chord' && activePCS.size > 0)
    ? new Set([...activePCS].map(pc => ((pc - rootPC) % 12 + 12) % 12))
    : null;

  // Scale overlay: when a Parent Scale is selected in chord mode, show its non-chord tones
  let overlayPCS = null, overlayCharPCS = new Set();
  if (AppState.mode === 'chord' && _selectedPS) {
    const scale = SCALES[_selectedPS.scaleIdx];
    overlayPCS = new Set(scale.pcs.map(iv => (iv + rootPC) % 12));
    if (scale.cn && scale.cn.length > 0) {
      overlayCharPCS = new Set(scale.cn.map(iv => (iv + rootPC) % 12));
    }
  }

  return { activePCS, activeIvPCS, activeLabel, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS, overlayPCS, overlayCharPCS };
}

function renderPads(svg, state, grid) {
  var rows = grid ? grid.ROWS : ROWS;
  var cols = grid ? grid.COLS : COLS;
  var padSize = grid ? grid.PAD_SIZE : PAD_SIZE;
  var padGap = grid ? grid.PAD_GAP : PAD_GAP;
  var margin = grid ? grid.MARGIN : MARGIN;
  const { activePCS, activeIvPCS, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS, overlayPCS, overlayCharPCS } = state;
  // Build MIDI set for selected voicing box (for dimming non-selected pads)
  const selBox = !grid && VoicingState.selectedBoxIdx !== null ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx] : null;
  const selMidi = selBox ? new Set(selBox.midiNotes) : null;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const midi = midiNote(row, col);
      const pc = pitchClass(midi);
      const x = margin + col * (padSize + padGap);
      const y = margin + (rows - 1 - row) * (padSize + padGap);
      const interval = ((pc - rootPC) + 12) % 12;
      const isRoot = pc === rootPC && !omittedPCS.has(pc);
      const isBass = bassPC !== null && pc === bassPC;
      const isActive = activePCS.has(pc);
      const isOmitted = omittedPCS.has(pc);
      const isChar = AppState.mode === 'scale' && charPCS.has(pc) && !isRoot;
      const isGuide3 = AppState.mode === 'chord' && guide3PCS.has(pc) && !isRoot && !tensionPCS.has(pc);
      const isGuide7 = AppState.mode === 'chord' && guide7PCS.has(pc) && !isRoot && !tensionPCS.has(pc);
      const isGuide = isGuide3 || isGuide7;
      const isTension = AppState.mode === 'chord' && tensionPCS.has(pc) && !isRoot && !isGuide;
      const isAvoid = AppState.mode === 'chord' && avoidPCS.has(pc) && !isRoot;
      const isOverlay = !isOmitted && overlayPCS && overlayPCS.has(pc) && !activePCS.has(pc);

      // Plain mode: highlight selected notes only
      const isPlainActive = AppState.mode === 'input' && PlainState.activeNotes.has(midi);

      let fill = 'var(--pad-off)', textColor = 'var(--text-muted)';
      if (AppState.mode === 'input') {
        if (isPlainActive) {
          if (isRoot) { fill = 'var(--pad-root)'; textColor = '#000'; }
          else { fill = 'var(--pad-chord)'; textColor = '#000'; }
        }
      } else if (isOmitted) { fill = 'var(--pad-omitted)'; textColor = '#999'; }
      else if (isRoot) { fill = 'var(--pad-root)'; textColor = '#000'; }
      else if (isBass) { fill = '#ff9800'; textColor = '#000'; }
      else if (isGuide3) { fill = 'var(--pad-guide3)'; textColor = '#fff'; }
      else if (isGuide7) { fill = 'var(--pad-guide7)'; textColor = '#fff'; }
      else if (isChar) { fill = 'var(--pad-char)'; textColor = '#000'; }
      else if (isAvoid) { fill = 'var(--pad-avoid)'; textColor = '#fff'; }
      else if (isTension) { fill = 'var(--pad-tension)'; textColor = '#fff'; }
      else if (isActive) {
        fill = AppState.mode === 'scale' ? 'var(--pad-scale)' : 'var(--pad-chord)';
        textColor = '#000';
      }
      else if (overlayPCS && overlayPCS.has(pc)) {
        // Scale overlay: note is in the selected scale but not in the chord
        if (overlayCharPCS.has(pc)) {
          fill = 'var(--pad-overlay-char)';
        } else {
          fill = 'var(--pad-overlay)';
        }
        textColor = 'var(--text-muted)';
      }

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('class', 'pad');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', padSize); rect.setAttribute('height', padSize);
      rect.setAttribute('rx', 6); rect.setAttribute('fill', fill);
      // Hold pad: noteOn on press, noteOff on global release (no mouseleave)
      // Plain mode: click toggles note on/off
      (function(m, r) {
        r.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (AppState.mode === 'input') { togglePlainNote(m); }
          else {
            _heldMidi = m; noteOn(m);
            if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
              if (padExtNotes.size === 0) {
                // First press: seed from builder chord so existing tones are toggleable
                const builderNotes = getCurrentChordMidiNotes() || [];
                builderNotes.forEach(n => padExtNotes.add(n));
              }
              const pc = m % 12;
              const existing = [...padExtNotes].find(n => n % 12 === pc);
              if (existing !== undefined) { padExtNotes.delete(existing); } else { padExtNotes.add(m); }
              // Try to apply back to builder panel directly
              const extMidi = [...padExtNotes].sort((a, b) => a - b);
              if (extMidi.length > 0 && applyNotesToBuilder(extMidi)) {
                padExtNotes.clear(); // builder now holds the state, no overlay needed
              }
              syncGuitarFromNotes(getCurrentChordMidiNotes() || extMidi);
              render();
            }
          }
        });
        r.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (AppState.mode === 'input') { togglePlainNote(m); }
          else {
            _heldTouchMidi = m; noteOn(m);
            if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
              if (padExtNotes.size === 0) {
                const builderNotes = getCurrentChordMidiNotes() || [];
                builderNotes.forEach(n => padExtNotes.add(n));
              }
              const pc = m % 12;
              const existing = [...padExtNotes].find(n => n % 12 === pc);
              if (existing !== undefined) { padExtNotes.delete(existing); } else { padExtNotes.add(m); }
              const extMidi = [...padExtNotes].sort((a, b) => a - b);
              if (extMidi.length > 0 && applyNotesToBuilder(extMidi)) {
                padExtNotes.clear();
              }
              syncGuitarFromNotes(getCurrentChordMidiNotes() || extMidi);
              render();
            }
          }
        });
      })(midi, rect);
      if (isOmitted) {
        rect.setAttribute('stroke', 'rgba(255,255,255,0.2)');
        rect.setAttribute('stroke-width', 1); rect.setAttribute('stroke-dasharray', '4 2');
      } else {
        const hasStroke = isActive || isBass || isChar || isGuide || isOverlay;
        rect.setAttribute('stroke', hasStroke ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)');
        rect.setAttribute('stroke-width', hasStroke ? 1.5 : 0.5);
      }
      // Dim non-selected pads when a voicing box is selected
      const isDimmed = selMidi && !selMidi.has(midi) && fill !== 'var(--pad-off)';
      if (isDimmed) rect.setAttribute('opacity', '0.3');
      svg.appendChild(rect);

      const showDegree = rootPC !== null && (isActive || isRoot || isBass || isOmitted || isChar || isGuide || isAvoid || isOverlay);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'pad-label');
      text.setAttribute('x', x + padSize / 2);
      text.setAttribute('y', showDegree ? y + padSize * 0.24 : y + padSize / 2 - 4);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', textColor);
      text.setAttribute('font-size', padSize < 50 ? '8px' : (showDegree ? '10px' : '9px'));
      text.setAttribute('font-weight', showDegree ? '600' : '400');
      text.textContent = pcName(pc);
      if (isDimmed) text.setAttribute('opacity', '0.3');
      svg.appendChild(text);

      if (showDegree) {
        let degName;
        if (isOverlay) {
          // Overlay notes use scale degree names (not chord degree names)
          degName = SCALE_DEGREE_NAMES[interval];
        } else if (AppState.mode === 'scale') {
          degName = SCALE_DEGREE_NAMES[interval];
        } else {
          degName = chordDegreeName(interval, qualityPCS, activeIvPCS);
        }
        if ((isTension || isAvoid) && AppState.mode === 'chord') {
          degName = '(' + degName + ')';
        }
        const degText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        degText.setAttribute('class', 'pad-label');
        degText.setAttribute('x', x + padSize / 2);
        degText.setAttribute('y', y + padSize * 0.55);
        degText.setAttribute('text-anchor', 'middle'); degText.setAttribute('dominant-baseline', 'middle');
        degText.setAttribute('fill', textColor);
        degText.setAttribute('font-size', padSize < 50 ? '10px' : '13px'); degText.setAttribute('font-weight', '700');
        if (isOmitted) degText.setAttribute('text-decoration', 'line-through');
        degText.textContent = degName;
        if (isDimmed) degText.setAttribute('opacity', '0.3');
        svg.appendChild(degText);
      }

      const octText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      octText.setAttribute('class', 'pad-label');
      octText.setAttribute('x', x + padSize / 2);
      octText.setAttribute('y', showDegree ? y + padSize * 0.82 : y + padSize / 2 + 12);
      octText.setAttribute('text-anchor', 'middle'); octText.setAttribute('dominant-baseline', 'middle');
      octText.setAttribute('fill', textColor);
      octText.setAttribute('font-size', padSize < 50 ? '6px' : '8px'); octText.setAttribute('opacity', isDimmed ? '0.15' : '0.6');
      octText.textContent = noteName(midi);
      svg.appendChild(octText);
    }
  }
}

function renderVoicingBoxes(svg, state) {
  const { activePCS, rootPC, qualityPCS } = state;
  // Reset computed boxes (will be populated if any chord bounding boxes are drawn)
  const hasChordNotes = AppState.mode === 'chord' && activePCS instanceof Set && activePCS.size > 0;
  if (!hasChordNotes) {
    VoicingState.lastBoxes = [];
    if (VoicingState.selectedBoxIdx !== null) resetVoicingSelection();
  }

  // Shell voicing bounding boxes (with +1/+2 extension)
  if (AppState.mode === 'chord' && VoicingState.shell && hasChordNotes) {
    const shellIntervals = getShellIntervals(qualityPCS, VoicingState.shell, VoicingState.shellExtension, getBuilderPCS());
    if (shellIntervals) {
      let voiced = [...shellIntervals];
      let targetPC = rootPC;
      if (state.bassPC !== null) {
        voiced = applyOnChordBass(voiced, rootPC, state.bassPC);
        targetPC = state.bassPC;
      }
      const shellOffsets = voiced.map(v => v - voiced[0]);
      const maxRS = voiced.length <= 3 ? 4 : 5;
      const maxCS = voiced.length <= 3 ? 5 : 6;
      computeAndDrawVoicingBoxes(svg, shellOffsets, targetPC, '#fff', '#fff', maxRS, maxCS);
    }
  }

  // Inversion / Drop voicing bounding boxes
  if (AppState.mode === 'chord' && !VoicingState.shell && (VoicingState.inversion > 0 || VoicingState.drop) && activePCS.size > 0) {
    const chordPCS = getBuilderPCS();
    if (chordPCS && chordPCS.length >= 3) {
      let inv = Math.min(VoicingState.inversion, chordPCS.length - 1);
      if (state.bassPC !== null) {
        const bc = getBassCase(state.bassPC, rootPC, chordPCS);
        if (bc.isChordTone) inv = bc.inversionIndex;
      }
      const result = calcVoicingOffsets(chordPCS, inv, VoicingState.drop);
      let voiced = [...result.voiced];
      if (state.bassPC !== null) {
        voiced = applyOnChordBass(voiced, rootPC, state.bassPC);
      }
      const newOffsets = voiced.map(v => v - voiced[0]);
      const bassAbsPC = ((rootPC + voiced[0]) % 12 + 12) % 12;
      computeAndDrawVoicingBoxes(svg, newOffsets, bassAbsPC, '#fff', '#fff');
    }
  }

  // Basic chord bounding boxes (no shell/inversion/drop)
  if (AppState.mode === 'chord' && !VoicingState.shell && VoicingState.inversion === 0 && !VoicingState.drop && hasChordNotes) {
    const chordPCS = getBuilderPCS();
    if (chordPCS && chordPCS.length >= 3) {
      let voiced = [...chordPCS].sort((a, b) => a - b);
      let targetPC = rootPC;
      if (state.bassPC !== null) {
        const bc = getBassCase(state.bassPC, rootPC, chordPCS);
        if (bc.isChordTone) {
          for (let i = 0; i < bc.inversionIndex; i++) voiced.push(voiced.shift() + 12);
          voiced.sort((a, b) => a - b);
        } else {
          voiced = applyOnChordBass(voiced, rootPC, state.bassPC);
        }
        targetPC = state.bassPC;
      }
      const basicOffsets = voiced.map(v => v - voiced[0]);
      computeAndDrawVoicingBoxes(svg, basicOffsets, targetPC, '#fff', '#fff');
    }
  }
}

function renderInfoText(state) {
  const { activeLabel, rootPC } = state;
  const infoEl = document.getElementById('info-text');
  if (AppState.mode === 'scale') {
    const scale = SCALES[AppState.scaleIdx];
    const notes = scale.pcs.map(pc => pcName((pc + AppState.key) % 12));
    infoEl.textContent = activeLabel + ' (' + t('info.note_count', {n: scale.pcs.length}) + ') : ' + notes.join(' - ');
  } else {
    const pcs = getBuilderPCS();
    if (pcs) {
      const notes = pcs.map(pc => {
        const absPC = (pc + rootPC) % 12;
        const iv = pc % 12;
        if (BuilderState.quality) {
          const deg = chordDegreeName(iv, BuilderState.quality.pcs, null);
          if (deg.startsWith('b') || deg === 'm3') return NOTE_NAMES_FLAT[absPC];
          if (deg.startsWith('#') || deg.startsWith('△')) return NOTE_NAMES_SHARP[absPC];
        }
        return pcName(absPC);
      });
      let txt = activeLabel + ' (' + t('info.note_count', {n: pcs.length}) + ') : ' + notes.join(' - ');
      if (BuilderState.bass !== null) txt += ' / ' + pcName(BuilderState.bass);
      const mods = [];
      if (VoicingState.shell) {
        let shellLabel = 'Shell ' + VoicingState.shell.split('').join('-');
        if (VoicingState.shellExtension > 0) shellLabel += ' +' + VoicingState.shellExtension;
        mods.push(shellLabel);
      }
      if (VoicingState.rootless) mods.push('Rootless');
      if (!VoicingState.shell && VoicingState.omit5) mods.push('Omit5');
      if (VoicingState.omit3) mods.push('Omit3');
      if (!VoicingState.shell && VoicingState.inversion > 0) {
        const invNames = ['', '1st Inv', '2nd Inv', '3rd Inv'];
        mods.push(invNames[VoicingState.inversion]);
      }
      if (!VoicingState.shell && VoicingState.drop) {
        mods.push(VoicingState.drop === 'drop2' ? 'Drop 2' : 'Drop 3');
      }
      if (mods.length > 0) txt += ' [' + mods.join(', ') + ']';
      infoEl.textContent = txt;
    } else {
      infoEl.textContent = '';
    }
  }
}

function renderLegend(state) {
  const { charPCS, guide3PCS, guide7PCS, omittedPCS, tensionPCS, avoidPCS, overlayPCS } = state;
  const swatch = document.getElementById('legend-swatch');
  const ltxt = document.getElementById('legend-text');
  const legendChar = document.getElementById('legend-char');
  const legendGuide3 = document.getElementById('legend-guide3');
  const legendGuide7 = document.getElementById('legend-guide7');
  const legendTension = document.getElementById('legend-tension');
  const legendAvoid = document.getElementById('legend-avoid');
  const legendOverlay = document.getElementById('legend-overlay');
  const legendOmit = document.getElementById('legend-omit');
  if (AppState.mode === 'scale') {
    swatch.style.background = 'var(--pad-scale)'; ltxt.textContent = t('legend.scale_note');
    legendChar.style.display = charPCS.size > 0 ? '' : 'none';
    legendGuide3.style.display = 'none'; legendGuide7.style.display = 'none';
    legendTension.style.display = 'none';
    legendAvoid.style.display = 'none';
    if (legendOverlay) legendOverlay.style.display = 'none';
    legendOmit.style.display = 'none';
  } else {
    swatch.style.background = 'var(--pad-chord)'; ltxt.textContent = t('legend.chord_tone');
    legendChar.style.display = 'none';
    legendGuide3.style.display = guide3PCS.size > 0 ? '' : 'none';
    legendGuide7.style.display = guide7PCS.size > 0 ? '' : 'none';
    legendTension.style.display = tensionPCS.size > 0 ? '' : 'none';
    legendAvoid.style.display = avoidPCS.size > 0 ? '' : 'none';
    if (legendOverlay) legendOverlay.style.display = overlayPCS ? '' : 'none';
    legendOmit.style.display = omittedPCS.size > 0 ? '' : 'none';
  }
}

function render() {
  const svg = document.getElementById('pad-grid');
  const totalW = COLS * (PAD_SIZE + PAD_GAP) - PAD_GAP + MARGIN * 2;
  const totalH = ROWS * (PAD_SIZE + PAD_GAP) - PAD_GAP + MARGIN * 2;
  svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
  if (_isMobile || _isLandscape) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  } else {
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);
  }
  svg.innerHTML = '';

  // Compute parent scale selection BEFORE renderState (sets _selectedPS for overlay)
  renderDiatonicBar();
  renderParentScales();

  const state = computeRenderState();
  renderPads(svg, state);
  if (AppState.mode !== 'input') {
    renderVoicingBoxes(svg, state);
  }
  renderInfoText(state);
  renderLegend(state);

  // Staff notation
  if (AppState.mode === 'input') {
    // Plain mode: show selected notes on staff
    const plainNotes = [...PlainState.activeNotes].sort((a, b) => a - b);
    renderStaff('input', state.rootPC, state.activePCS, state.omittedPCS, null, plainNotes.length > 0 ? plainNotes : [], null);
  } else {
    const boxMidi = (VoicingState.selectedBoxIdx !== null && VoicingState.lastBoxes[VoicingState.selectedBoxIdx])
      ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx].midiNotes : null;
    renderStaff(AppState.mode, state.rootPC, state.activePCS, state.omittedPCS, state.qualityPCS, boxMidi, state.bassPC, state.activeIvPCS);
  }

  // Instrument diagrams (guitar + bass + piano)
  lastRenderRootPC = state.rootPC;
  lastRenderActivePCS = new Set(state.activePCS);
  renderGuitarDiagram(state.rootPC, state.activePCS, state.bassPC, state.overlayPCS, state.overlayCharPCS);
  renderBassDiagram(state.rootPC, state.activePCS, state.bassPC, state.overlayPCS, state.overlayCharPCS);
  renderPianoDisplay(state.rootPC, state.activePCS, state.bassPC, state.overlayPCS, state.overlayCharPCS);

  // Re-apply instrument highlights after SVG rebuild
  if (instrumentInputActive) {
    highlightInstrumentPads(getAllInputMidiNotes());
  }

  // Re-render 32-pad if in landscape mode
  if (_isLandscape) { syncPlayControls(); renderPad32(); }

  // Auto-save to selected slot (Chord/Scale mode)
  if (PlainState.currentSlot !== null && (AppState.mode === 'chord' || AppState.mode === 'scale')) {
    const midiNotes = getCurrentChordMidiNotes();
    if (midiNotes && midiNotes.length > 0) {
      const key = midiNotes.join(',');
      const slot = PlainState.memory[PlainState.currentSlot];
      if (!slot || slot.midiNotes.join(',') !== key) {
        const chordName = getCurrentChordName();
        PlainState.memory[PlainState.currentSlot] = { midiNotes: [...midiNotes], chordName };
        updateMemorySlotUI();
      }
    }
  }
}

// ========================================
// STAFF NOTATION
// ========================================
function renderStaff(mode, rootPC, activePCS, omittedPCS, qualityPCS, overrideMidiNotes, bassPC, activeIvPCS) {
  const staffSvg = document.getElementById('staff-notation');
  let midiNotes;
  if (overrideMidiNotes && overrideMidiNotes.length > 0) {
    // Deduplicate by pitch class (keep lowest octave) — staff shows chord structure, not octave doublings
    const seen = new Set();
    midiNotes = [...overrideMidiNotes].sort((a, b) => a - b).filter(m => {
      const pc = m % 12;
      if (seen.has(pc)) return false;
      seen.add(pc);
      return true;
    });
  } else if (Array.isArray(overrideMidiNotes)) {
    // Empty array (Plain mode with no notes selected): show empty staff lines
    midiNotes = [];
  } else if (mode === 'scale') {
    if (activePCS.size === 0) {
      staffSvg.style.display = 'none'; staffSvg.setAttribute('height', 0); return;
    }
    // Scale mode: render scale notes ascending from root over 1 octave
    const pcsArr = [...activePCS].map(pc => (pc - rootPC + 12) % 12).sort((a, b) => a - b);
    const staffBase = 60 + rootPC; // C4 octave (fixed — shows pitch classes, not position)
    midiNotes = pcsArr.map(iv => staffBase + iv);
  } else {
    // Chord mode
    const chordPCS = getBuilderPCS();
    if (!chordPCS || chordPCS.length < 1) {
      // No quality selected yet — show root or activePCS
      if (activePCS.size > 0) {
        const pcsArr = [...activePCS].map(pc => (pc - rootPC + 12) % 12).sort((a, b) => a - b);
        const staffBase = 48 + rootPC; // C3 octave (fixed)
        midiNotes = pcsArr.map(iv => staffBase + iv);
      } else if (rootPC !== null && rootPC !== undefined) {
        // Root only selected, activePCS is empty but we know the root
        midiNotes = [48 + rootPC];
      } else {
        staffSvg.style.display = 'none'; staffSvg.setAttribute('height', 0); return;
      }
    } else {
    // Staff always shows all chord tones (voicing is a performance choice, not theory)
    const allIntervals = [...chordPCS].sort((a, b) => a - b);
    if (overrideMidiNotes) {
      midiNotes = overrideMidiNotes;
    } else {
      const staffBase = 48 + rootPC; // C3 octave (fixed)
      midiNotes = allIntervals.map(iv => staffBase + iv);
      // Add on-chord bass note below the chord
      if (bassPC !== undefined && bassPC !== null) {
        let bassMidi = 36 + bassPC;
        const lowest = Math.min(...midiNotes);
        while (bassMidi >= lowest) bassMidi -= 12;
        midiNotes.unshift(bassMidi);
      }
    }
    }
  }

  // Staff config
  const W = DIAGRAM_WIDTH, staffLineGap = 8;
  const trebleTop = 20; // top line of treble staff (F5)
  const bassTop = trebleTop + 4 * staffLineGap + 30; // top line of bass staff (A3)
  const totalH = bassTop + 4 * staffLineGap + 30;
  staffSvg.style.display = '';
  staffSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + totalH);
  if (_isMobile || _isLandscape) {
    staffSvg.removeAttribute('width'); staffSvg.removeAttribute('height');
    staffSvg.style.width = '100%'; staffSvg.style.height = 'auto';
  } else {
    staffSvg.setAttribute('width', W);
    staffSvg.setAttribute('height', totalH);
    staffSvg.style.width = ''; staffSvg.style.height = '';
  }
  staffSvg.innerHTML = '';

  // Draw staff lines
  const staffLeft = 40, staffRight = W - 20;
  for (let i = 0; i < 5; i++) {
    // Treble
    const ty = trebleTop + i * staffLineGap;
    const tl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tl.setAttribute('x1', staffLeft); tl.setAttribute('y1', ty);
    tl.setAttribute('x2', staffRight); tl.setAttribute('y2', ty);
    tl.setAttribute('stroke', '#666'); tl.setAttribute('stroke-width', 1);
    staffSvg.appendChild(tl);
    // Bass
    const by = bassTop + i * staffLineGap;
    const bl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    bl.setAttribute('x1', staffLeft); bl.setAttribute('y1', by);
    bl.setAttribute('x2', staffRight); bl.setAttribute('y2', by);
    bl.setAttribute('stroke', '#666'); bl.setAttribute('stroke-width', 1);
    staffSvg.appendChild(bl);
  }

  // Clef labels
  const trebleClef = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  trebleClef.setAttribute('x', 14); trebleClef.setAttribute('y', trebleTop + 28);
  trebleClef.setAttribute('font-size', '36px'); trebleClef.setAttribute('fill', '#999');
  trebleClef.textContent = '𝄞';
  staffSvg.appendChild(trebleClef);
  const bassClef = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  bassClef.setAttribute('x', 14); bassClef.setAttribute('y', bassTop + 16);
  bassClef.setAttribute('font-size', '24px'); bassClef.setAttribute('fill', '#999');
  bassClef.textContent = '𝄢';
  staffSvg.appendChild(bassClef);

  // MIDI to staff Y position
  // Treble: bottom line = E4(64), top line = F5(77). Each semitone = half step but staff uses diatonic.
  // Map: use note position in C major scale-like mapping
  // Staff position: 0 = middle C (C4=60). Each +1 = one diatonic step up (line or space)
  function midiToStaffPos(midi, flats) {
    const octave = Math.floor(midi / 12) - 1; // C4 = octave 4
    const pc = midi % 12;
    if (flats) {
      //             C  Db  D  Eb  E   F  Gb  G  Ab  A  Bb  B
      const p =     [0,  1, 1,  2, 2,  3,  4, 4,  5, 5,  6, 6];
      const isFlat = [0, 1, 0,  1, 0,  0,  1, 0,  1, 0,  1, 0][pc];
      return { pos: (octave - 4) * 7 + p[pc], accidental: isFlat ? 'flat' : null };
    }
    // Pitch class to diatonic position within octave: C=0,D=1,E=2,F=3,G=4,A=5,B=6
    const pcToPos = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    const isSharp = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0][pc];
    return { pos: (octave - 4) * 7 + pcToPos[pc], accidental: isSharp ? 'sharp' : null };
  }

  // Staff pos 0 = C4 (middle C). Treble staff bottom line (E4) = pos 2. Y coords:
  // Middle C (pos 0): trebleTop + 5 * staffLineGap (one ledger line below treble)
  const middleCY = trebleTop + 5 * staffLineGap;
  function posToY(pos) {
    return middleCY - pos * (staffLineGap / 2);
  }

  // Draw notes
  const noteX = staffLeft + 80;
  const noteSpacing = 50;
  const defaultFlats = FLAT_MAJOR_KEYS.has(getParentMajorKey(AppState.scaleIdx, AppState.key));
  midiNotes.forEach((midi, idx) => {
    const pc = midi % 12;
    const interval = ((pc - rootPC) % 12 + 12) % 12;

    // In chord mode, determine flat/sharp per note based on degree context
    // b7 → Bb (not A#), #11 → F# (not Gb), etc.
    let useFlats = defaultFlats;
    let degName = SCALE_DEGREE_NAMES[interval];
    if (mode === 'chord' && qualityPCS) {
      degName = chordDegreeName(interval, qualityPCS, activeIvPCS || null);
      if (degName.startsWith('b') || degName === 'm3') useFlats = true;
      else if (degName.startsWith('#') || degName.startsWith('△')) useFlats = false;
    }

    const { pos, accidental } = midiToStaffPos(midi, useFlats);
    const ny = posToY(pos);
    const nx = noteX + idx * noteSpacing;

    // Ledger lines
    // Middle C ledger (between staves): pos 0
    if (pos <= 0) {
      // Below treble: ledger lines at pos 0, -2, -4, ...
      for (let lp = 0; lp >= pos; lp -= 2) {
        const ly = posToY(lp);
        // Only draw if below treble staff (pos < 2) or above bass staff
        if (ly > trebleTop + 4 * staffLineGap && ly < bassTop) {
          const ll = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ll.setAttribute('x1', nx - 10); ll.setAttribute('y1', ly);
          ll.setAttribute('x2', nx + 10); ll.setAttribute('y2', ly);
          ll.setAttribute('stroke', '#666'); ll.setAttribute('stroke-width', 1);
          staffSvg.appendChild(ll);
        }
      }
    }
    if (pos >= 12) {
      // Above treble: ledger lines at pos 12, 14, ...
      for (let lp = 12; lp <= pos; lp += 2) {
        const ly = posToY(lp);
        if (ly < trebleTop) {
          const ll = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ll.setAttribute('x1', nx - 10); ll.setAttribute('y1', ly);
          ll.setAttribute('x2', nx + 10); ll.setAttribute('y2', ly);
          ll.setAttribute('stroke', '#666'); ll.setAttribute('stroke-width', 1);
          staffSvg.appendChild(ll);
        }
      }
    }
    // Below bass staff: bass bottom line = B2 (pos = -5)
    if (pos <= -7) {
      for (let lp = -7; lp >= pos; lp -= 2) {
        const ly = posToY(lp);
        if (ly > bassTop + 4 * staffLineGap) {
          const ll = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ll.setAttribute('x1', nx - 10); ll.setAttribute('y1', ly);
          ll.setAttribute('x2', nx + 10); ll.setAttribute('y2', ly);
          ll.setAttribute('stroke', '#666'); ll.setAttribute('stroke-width', 1);
          staffSvg.appendChild(ll);
        }
      }
    }

    // Note head
    const note = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    note.setAttribute('cx', nx); note.setAttribute('cy', ny);
    note.setAttribute('rx', 5); note.setAttribute('ry', 3.5);
    note.setAttribute('fill', '#fff');
    note.setAttribute('transform', 'rotate(-15 ' + nx + ' ' + ny + ')');
    staffSvg.appendChild(note);

    // Accidental (sharp or flat)
    if (accidental) {
      const sh = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      sh.setAttribute('x', nx - 12); sh.setAttribute('y', ny + 4);
      sh.setAttribute('font-size', '12px'); sh.setAttribute('fill', '#ff9800');
      sh.textContent = accidental === 'sharp' ? '♯' : '♭';
      staffSvg.appendChild(sh);
    }

    // Degree label above note
    const deg = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    deg.setAttribute('x', nx); deg.setAttribute('y', ny - 10);
    deg.setAttribute('text-anchor', 'middle');
    deg.setAttribute('font-size', '9px'); deg.setAttribute('font-weight', '600');
    deg.setAttribute('fill', interval === 0 ? '#E69F00' : '#aaa');
    deg.textContent = degName;
    staffSvg.appendChild(deg);

    // Note name label below
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', nx); label.setAttribute('y', totalH - 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '9px'); label.setAttribute('fill', '#999');
    label.textContent = useFlats ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
    staffSvg.appendChild(label);
  });
}

// ========================================
// GUITAR DIAGRAM
// ========================================
// Colors: white/black clean style
const INST_ROOT_COLOR = '#333';         // dark (root)
const INST_ACTIVE_COLOR = '#666';       // medium gray (active notes)
const INST_ROOT_TEXT = '#fff';
const INST_ACTIVE_TEXT = '#fff';
const INST_BASS_COLOR = '#ff9800';     // orange (matches pad bass color)
const INST_BASS_TEXT = '#000';
const INST_OVERLAY_COLOR = '#56B4E9';   // Okabe-Ito sky blue (scale overlay)
const INST_OVERLAY_CHAR_COLOR = '#F0E442'; // Okabe-Ito yellow (char note overlay)
const INST_OVERLAY_TEXT = '#aaa';
const DIAGRAM_WIDTH = 564;              // shared width for pad, guitar & piano (matches pad grid)
let showGuitar = false;
let showPiano = false;
let showStaff = true;
let showBass = false;
let showSound = true;
let soundExpanded = false;
let guitarLabelMode = 'name'; // 'name' or 'degree'
let memoryViewMode = 'memory'; // 'memory' or 'perform'

function toggleSoundExpand() {
  soundExpanded = !soundExpanded;
  document.getElementById('sound-details').style.display = soundExpanded ? '' : 'none';
  document.getElementById('sound-expand-btn').innerHTML = soundExpanded ? '&#x25B2;' : '&#x25BC;';
}

function toggleMemoryView(mode) {
  memoryViewMode = mode;
  document.getElementById('mem-view-memory').classList.toggle('active', mode === 'memory');
  document.getElementById('mem-view-perform').classList.toggle('active', mode === 'perform');
  // Clear perform active pad when switching away
  if (mode === 'memory') {
    PerformState.activePad = null;
  }
  updateMemorySlotUI();
}

function toggleInstrument(which) {
  if (which === 'guitar') showGuitar = !showGuitar;
  if (which === 'bass') showBass = !showBass;
  if (which === 'piano') showPiano = !showPiano;
  if (which === 'staff') showStaff = !showStaff;
  if (which === 'sound') showSound = !showSound;
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
  render();
  saveAppSettings();
}

function toggleGuitarLabelMode() {
  guitarLabelMode = guitarLabelMode === 'name' ? 'degree' : 'name';
  document.getElementById('guitar-label-btn').textContent = guitarLabelMode === 'name' ? t('label.note_name') : t('label.degree');
  render();
  saveAppSettings();
}

function renderGuitarDiagram(rootPC, pcsSet, bassPC, overlayPCS, overlayCharPCS) {
  const svg = document.getElementById('guitar-diagram');
  if (!pcsSet) pcsSet = new Set();
  // Interval-based PCS for chordDegreeName
  const ivPcsSet = pcsSet.size > 0
    ? new Set([...pcsSet].map(pc => ((pc - rootPC) % 12 + 12) % 12))
    : null;

  svg.innerHTML = '';

  const solo = showGuitar && !showPiano;
  const numFrets = 21;
  const leftM = 16;
  const topM = solo ? 10 : 6;
  const fretW = Math.floor((DIAGRAM_WIDTH - leftM - 12) / numFrets);
  const strH = solo ? 22 : 14;
  const nutX = leftM;
  const W = DIAGRAM_WIDTH;
  const H = topM + 5 * strH + (solo ? 30 : 22);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  if (_isMobile || _isLandscape) {
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = '100%'; svg.style.height = 'auto';
  } else {
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.width = ''; svg.style.height = '';
  }

  const strings = [64, 59, 55, 50, 45, 40];
  const strNames = ['E', 'B', 'G', 'D', 'A', 'E'];

  // Nut (thick black line)
  const nutLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  nutLine.setAttribute('x1', nutX); nutLine.setAttribute('y1', topM);
  nutLine.setAttribute('x2', nutX); nutLine.setAttribute('y2', topM + 5 * strH);
  nutLine.setAttribute('stroke', '#ccc'); nutLine.setAttribute('stroke-width', 4);
  svg.appendChild(nutLine);

  // Fret lines
  for (let f = 1; f <= numFrets; f++) {
    const fx = nutX + f * fretW;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fx); line.setAttribute('y1', topM);
    line.setAttribute('x2', fx); line.setAttribute('y2', topM + 5 * strH);
    line.setAttribute('stroke', '#555'); line.setAttribute('stroke-width', 1);
    svg.appendChild(line);
  }

  // String lines
  for (let s = 0; s < 6; s++) {
    const sy = topM + s * strH;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', nutX); line.setAttribute('y1', sy);
    line.setAttribute('x2', nutX + numFrets * fretW); line.setAttribute('y2', sy);
    line.setAttribute('stroke', '#888'); line.setAttribute('stroke-width', s >= 4 ? 2 : 1);
    svg.appendChild(line);
  }

  // Fret markers
  const markerFrets = [3, 5, 7, 9, 15, 17, 19, 21];
  const doubleMarker = [12];
  const markerY = topM + 2.5 * strH;
  markerFrets.forEach(f => {
    const mx = nutX + (f - 0.5) * fretW;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', mx); dot.setAttribute('cy', markerY);
    dot.setAttribute('r', 2.5); dot.setAttribute('fill', '#444');
    svg.appendChild(dot);
  });
  doubleMarker.forEach(f => {
    const mx = nutX + (f - 0.5) * fretW;
    [topM + 1.5 * strH, topM + 3.5 * strH].forEach(dy => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', mx); dot.setAttribute('cy', dy);
      dot.setAttribute('r', 2.5); dot.setAttribute('fill', '#444');
      svg.appendChild(dot);
    });
  });

  // String names
  for (let s = 0; s < 6; s++) {
    const sy = topM + s * strH;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', nutX - 9); t.setAttribute('y', sy + 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '10px'); t.setAttribute('fill', '#aaa');
    t.setAttribute('font-weight', '700');
    t.textContent = strNames[s];
    svg.appendChild(t);
  }

  // Fret numbers
  for (let f = 1; f <= numFrets; f++) {
    const fx = nutX + (f - 0.5) * fretW;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', fx); t.setAttribute('y', topM + 5 * strH + 14);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '8px'); t.setAttribute('fill', '#888');
    t.textContent = f;
    svg.appendChild(t);
  }

  // Pad range highlight (show which frets fall within 64-pad MIDI range)
  const padLo = baseMidi();
  const padHi = padLo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  for (let s = 0; s < 6; s++) {
    const sy = topM + s * strH;
    let minF = null, maxF = null;
    for (let f = 0; f <= numFrets; f++) {
      const midi = strings[s] + f;
      if (midi >= padLo && midi <= padHi) {
        if (minF === null) minF = f;
        maxF = f;
      }
    }
    if (minF !== null) {
      const x1 = minF === 0 ? 0 : nutX + (minF - 1) * fretW;
      const x2 = nutX + maxF * fretW;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x1);
      rect.setAttribute('y', sy - strH / 2);
      rect.setAttribute('width', x2 - x1);
      rect.setAttribute('height', strH);
      rect.setAttribute('fill', '#56B4E9');
      rect.setAttribute('opacity', '0.1');
      svg.appendChild(rect);
    }
  }

  // Note dots (scale/chord tones + overlay) with labels
  for (let s = 0; s < 6; s++) {
    const openPC = strings[s] % 12;
    const sy = topM + s * strH;
    for (let f = 0; f <= numFrets; f++) {
      const pc = (openPC + f) % 12;
      const isBass = bassPC !== undefined && bassPC !== null && pc === bassPC;
      const isOvl = !pcsSet.has(pc) && !isBass && overlayPCS && overlayPCS.has(pc);
      if (!pcsSet.has(pc) && !isBass && !isOvl) continue;
      const isRoot = pc === rootPC;
      const fx = f === 0 ? nutX - 2 : nutX + (f - 0.5) * fretW;
      const r = f === 0 ? (solo ? 7 : 5) : (solo ? 10 : 7);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', fx); dot.setAttribute('cy', sy);
      dot.setAttribute('r', r);
      if (isOvl) {
        const isChar = overlayCharPCS && overlayCharPCS.has(pc);
        dot.setAttribute('fill', isChar ? INST_OVERLAY_CHAR_COLOR : INST_OVERLAY_COLOR);
        dot.setAttribute('opacity', isChar ? '0.5' : '0.4');
      } else {
        dot.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBass ? INST_BASS_COLOR : INST_ACTIVE_COLOR));
        dot.setAttribute('opacity', '0.9');
      }
      svg.appendChild(dot);
      // Label inside dot
      if (f > 0) {
        const iv = ((pc - rootPC) + 12) % 12;
        let labelText;
        if (isOvl) {
          labelText = guitarLabelMode === 'degree' ? SCALE_DEGREE_NAMES[iv] : pcName(pc);
        } else {
          labelText = guitarLabelMode === 'degree' ? (AppState.mode === 'chord' && BuilderState.quality ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet) : SCALE_DEGREE_NAMES[iv]) : pcName(pc);
        }
        const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lt.setAttribute('x', fx); lt.setAttribute('y', sy + (solo ? 4 : 3));
        lt.setAttribute('text-anchor', 'middle');
        const fs = solo ? (labelText.length > 2 ? '7px' : '9px') : (labelText.length > 2 ? '5px' : '6px');
        lt.setAttribute('font-size', fs);
        lt.setAttribute('fill', isOvl ? INST_OVERLAY_TEXT : (isRoot ? INST_ROOT_TEXT : (isBass ? INST_BASS_TEXT : INST_ACTIVE_TEXT)));
        lt.setAttribute('font-weight', '700');
        lt.textContent = labelText;
        svg.appendChild(lt);
      }
    }
  }

  // Guitar input: selected fret markers (orange ring)
  for (let s = 0; s < 6; s++) {
    if (guitarSelectedFrets[s] !== null) {
      const f = guitarSelectedFrets[s];
      const sy = topM + s * strH;
      const fx = f === 0 ? nutX - 2 : nutX + (f - 0.5) * fretW;
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', fx); ring.setAttribute('cy', sy);
      ring.setAttribute('r', solo ? 12 : 9);
      ring.setAttribute('fill', '#fff'); ring.setAttribute('opacity', '0.95');
      ring.setAttribute('stroke', '#333'); ring.setAttribute('stroke-width', 2);
      svg.appendChild(ring);
      // Label inside (respects guitar label mode)
      const pc = (strings[s] % 12 + f) % 12;
      const iv = ((pc - rootPC) + 12) % 12;
      const labelText = guitarLabelMode === 'degree' ? (AppState.mode === 'chord' && BuilderState.quality ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet) : SCALE_DEGREE_NAMES[iv]) : pcName(pc);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', fx); label.setAttribute('y', sy + (solo ? 5 : 4));
      label.setAttribute('text-anchor', 'middle');
      const selFs = solo ? (labelText.length > 2 ? '8px' : '10px') : (labelText.length > 2 ? '6px' : '8px');
      label.setAttribute('font-size', selFs); label.setAttribute('fill', '#333');
      label.setAttribute('font-weight', '700');
      label.textContent = labelText;
      svg.appendChild(label);
    }
  }

  // Clickable hit areas for each string×fret (transparent rects)
  for (let s = 0; s < 6; s++) {
    const sy = topM + s * strH - strH / 2;
    for (let f = 0; f <= numFrets; f++) {
      const fx = f === 0 ? 0 : nutX + (f - 1) * fretW;
      const fw = f === 0 ? nutX : fretW;
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.setAttribute('x', fx); hit.setAttribute('y', sy);
      hit.setAttribute('width', fw); hit.setAttribute('height', strH);
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('cursor', 'pointer');
      hit.dataset.string = s;
      hit.dataset.fret = f;
      hit.addEventListener('click', function() {
        toggleGuitarFret(parseInt(this.dataset.string), parseInt(this.dataset.fret));
      });
      svg.appendChild(hit);
    }
  }
}

// ========================================
// BASS DIAGRAM
// ========================================
const BASS_OPEN_MIDI = [43, 38, 33, 28]; // G2, D2, A1, E1
let bassSelectedFrets = [null, null, null, null];

function renderBassDiagram(rootPC, pcsSet, bassPC, overlayPCS, overlayCharPCS) {
  const svg = document.getElementById('bass-diagram');
  if (!svg) return;
  if (!pcsSet) pcsSet = new Set();
  const ivPcsSet = pcsSet.size > 0
    ? new Set([...pcsSet].map(pc => ((pc - rootPC) % 12 + 12) % 12))
    : null;
  svg.innerHTML = '';
  const solo = showBass && !showGuitar && !showPiano;
  const numFrets = 21;
  const leftM = 16;
  const topM = solo ? 10 : 6;
  const fretW = Math.floor((DIAGRAM_WIDTH - leftM - 12) / numFrets);
  const strH = solo ? 28 : 14;
  const nutX = leftM;
  const W = DIAGRAM_WIDTH;
  const H = topM + 3 * strH + (solo ? 30 : 22);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  if (_isMobile || _isLandscape) {
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = '100%'; svg.style.height = 'auto';
  } else {
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.width = ''; svg.style.height = '';
  }
  const strings = BASS_OPEN_MIDI;
  const strNames = ['G', 'D', 'A', 'E'];

  // Nut
  const nutLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  nutLine.setAttribute('x1', nutX); nutLine.setAttribute('y1', topM);
  nutLine.setAttribute('x2', nutX); nutLine.setAttribute('y2', topM + 3 * strH);
  nutLine.setAttribute('stroke', '#ccc'); nutLine.setAttribute('stroke-width', 4);
  svg.appendChild(nutLine);

  // Fret lines
  for (let f = 1; f <= numFrets; f++) {
    const fx = nutX + f * fretW;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fx); line.setAttribute('y1', topM);
    line.setAttribute('x2', fx); line.setAttribute('y2', topM + 3 * strH);
    line.setAttribute('stroke', '#555'); line.setAttribute('stroke-width', 1);
    svg.appendChild(line);
  }

  // String lines
  for (let s = 0; s < 4; s++) {
    const sy = topM + s * strH;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', nutX); line.setAttribute('y1', sy);
    line.setAttribute('x2', nutX + numFrets * fretW); line.setAttribute('y2', sy);
    line.setAttribute('stroke', '#888'); line.setAttribute('stroke-width', s >= 2 ? 2 : 1.5);
    svg.appendChild(line);
  }

  // Fret markers
  const markerFrets = [3, 5, 7, 9, 15, 17, 19, 21];
  const doubleMarker = [12];
  const markerY = topM + 1.5 * strH;
  markerFrets.forEach(f => {
    const mx = nutX + (f - 0.5) * fretW;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', mx); dot.setAttribute('cy', markerY);
    dot.setAttribute('r', 2.5); dot.setAttribute('fill', '#444');
    svg.appendChild(dot);
  });
  doubleMarker.forEach(f => {
    const mx = nutX + (f - 0.5) * fretW;
    [topM + 0.5 * strH, topM + 2.5 * strH].forEach(dy => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', mx); dot.setAttribute('cy', dy);
      dot.setAttribute('r', 2.5); dot.setAttribute('fill', '#444');
      svg.appendChild(dot);
    });
  });

  // String names
  for (let s = 0; s < 4; s++) {
    const sy = topM + s * strH;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', nutX - 9); t.setAttribute('y', sy + 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '10px'); t.setAttribute('fill', '#aaa');
    t.setAttribute('font-weight', '700');
    t.textContent = strNames[s];
    svg.appendChild(t);
  }

  // Fret numbers
  for (let f = 1; f <= numFrets; f++) {
    const fx = nutX + (f - 0.5) * fretW;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', fx); t.setAttribute('y', topM + 3 * strH + 14);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '8px'); t.setAttribute('fill', '#888');
    t.textContent = f;
    svg.appendChild(t);
  }

  // Pad range highlight (show which frets fall within 64-pad MIDI range)
  const bPadLo = baseMidi();
  const bPadHi = bPadLo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  for (let s = 0; s < 4; s++) {
    const sy = topM + s * strH;
    let minF = null, maxF = null;
    for (let f = 0; f <= numFrets; f++) {
      const midi = strings[s] + f;
      if (midi >= bPadLo && midi <= bPadHi) {
        if (minF === null) minF = f;
        maxF = f;
      }
    }
    if (minF !== null) {
      const x1 = minF === 0 ? 0 : nutX + (minF - 1) * fretW;
      const x2 = nutX + maxF * fretW;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x1);
      rect.setAttribute('y', sy - strH / 2);
      rect.setAttribute('width', x2 - x1);
      rect.setAttribute('height', strH);
      rect.setAttribute('fill', '#56B4E9');
      rect.setAttribute('opacity', '0.1');
      svg.appendChild(rect);
    }
  }

  // Note dots (chord tones + overlay)
  for (let s = 0; s < 4; s++) {
    const openPC = strings[s] % 12;
    const sy = topM + s * strH;
    for (let f = 0; f <= numFrets; f++) {
      const pc = (openPC + f) % 12;
      const isBassNote = bassPC !== undefined && bassPC !== null && pc === bassPC;
      const isOvl = !pcsSet.has(pc) && !isBassNote && overlayPCS && overlayPCS.has(pc);
      if (!pcsSet.has(pc) && !isBassNote && !isOvl) continue;
      const isRoot = pc === rootPC;
      const fx = f === 0 ? nutX - 2 : nutX + (f - 0.5) * fretW;
      const r = f === 0 ? (solo ? 7 : 5) : (solo ? 10 : 7);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', fx); dot.setAttribute('cy', sy);
      dot.setAttribute('r', r);
      if (isOvl) {
        const isChar = overlayCharPCS && overlayCharPCS.has(pc);
        dot.setAttribute('fill', isChar ? INST_OVERLAY_CHAR_COLOR : INST_OVERLAY_COLOR);
        dot.setAttribute('opacity', isChar ? '0.5' : '0.4');
      } else {
        dot.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBassNote ? INST_BASS_COLOR : INST_ACTIVE_COLOR));
        dot.setAttribute('opacity', '0.9');
      }
      svg.appendChild(dot);
      if (f > 0) {
        const iv = ((pc - rootPC) + 12) % 12;
        let labelText;
        if (isOvl) {
          labelText = guitarLabelMode === 'degree' ? SCALE_DEGREE_NAMES[iv] : pcName(pc);
        } else {
          labelText = guitarLabelMode === 'degree' ? (AppState.mode === 'chord' && BuilderState.quality ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet) : SCALE_DEGREE_NAMES[iv]) : pcName(pc);
        }
        const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lt.setAttribute('x', fx); lt.setAttribute('y', sy + (solo ? 4 : 3));
        lt.setAttribute('text-anchor', 'middle');
        const fs = solo ? (labelText.length > 2 ? '7px' : '9px') : (labelText.length > 2 ? '5px' : '6px');
        lt.setAttribute('font-size', fs);
        lt.setAttribute('fill', isOvl ? INST_OVERLAY_TEXT : (isRoot ? INST_ROOT_TEXT : (isBassNote ? INST_BASS_TEXT : INST_ACTIVE_TEXT)));
        lt.setAttribute('font-weight', '700');
        lt.textContent = labelText;
        svg.appendChild(lt);
      }
    }
  }

  // Selected fret markers
  for (let s = 0; s < 4; s++) {
    if (bassSelectedFrets[s] !== null) {
      const f = bassSelectedFrets[s];
      const sy = topM + s * strH;
      const fx = f === 0 ? nutX - 2 : nutX + (f - 0.5) * fretW;
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', fx); ring.setAttribute('cy', sy);
      ring.setAttribute('r', solo ? 12 : 9);
      ring.setAttribute('fill', '#fff'); ring.setAttribute('opacity', '0.95');
      ring.setAttribute('stroke', '#333'); ring.setAttribute('stroke-width', 2);
      svg.appendChild(ring);
      const pc = (strings[s] % 12 + f) % 12;
      const iv = ((pc - rootPC) + 12) % 12;
      const labelText = guitarLabelMode === 'degree' ? (AppState.mode === 'chord' && BuilderState.quality ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet) : SCALE_DEGREE_NAMES[iv]) : pcName(pc);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', fx); label.setAttribute('y', sy + (solo ? 5 : 4));
      label.setAttribute('text-anchor', 'middle');
      const selFs = solo ? (labelText.length > 2 ? '8px' : '10px') : (labelText.length > 2 ? '6px' : '8px');
      label.setAttribute('font-size', selFs); label.setAttribute('fill', '#333');
      label.setAttribute('font-weight', '700');
      label.textContent = labelText;
      svg.appendChild(label);
    }
  }

  // Clickable hit areas
  for (let s = 0; s < 4; s++) {
    const sy = topM + s * strH - strH / 2;
    for (let f = 0; f <= numFrets; f++) {
      const fx = f === 0 ? 0 : nutX + (f - 1) * fretW;
      const fw = f === 0 ? nutX : fretW;
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.setAttribute('x', fx); hit.setAttribute('y', sy);
      hit.setAttribute('width', fw); hit.setAttribute('height', strH);
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('cursor', 'pointer');
      hit.dataset.string = s;
      hit.dataset.fret = f;
      hit.addEventListener('click', function() {
        toggleBassFret(parseInt(this.dataset.string), parseInt(this.dataset.fret));
      });
      svg.appendChild(hit);
    }
  }
}

function toggleBassFret(stringIdx, fret) {
  if (bassSelectedFrets[stringIdx] === fret) {
    bassSelectedFrets[stringIdx] = null;
  } else {
    bassSelectedFrets[stringIdx] = fret;
  }
  updateInstrumentInput();
}

// ========================================
// PIANO DISPLAY
// ========================================
function renderPianoDisplay(rootPC, pcsSet, bassPC, overlayPCS, overlayCharPCS) {
  const svg = document.getElementById('piano-display');
  if (!pcsSet) pcsSet = new Set();

  svg.innerHTML = '';

  const solo = showPiano && !showGuitar;
  const numOctaves = 4; // C1 to B4 (matches pad range)
  const startOctave = 1;
  const whiteH = solo ? 80 : 50, blackH = solo ? 52 : 32;
  const numWhites = numOctaves * 7;
  const W = DIAGRAM_WIDTH;
  const startX = 8, startY = 2;
  const whiteW = (W - startX - 15) / numWhites;
  const blackW = whiteW * 0.7;
  const H = whiteH + (solo ? 22 : 16);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  if (_isMobile || _isLandscape) {
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = '100%'; svg.style.height = 'auto';
  } else {
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.width = ''; svg.style.height = '';
  }

  const whiteNotes = [0,2,4,5,7,9,11];
  const blackNotes = [1,3,6,8,10];
  const blackPositions = [0, 1, 3, 4, 5];

  // White keys
  let wx = startX;
  for (let oct = 0; oct < numOctaves; oct++) {
    for (let i = 0; i < 7; i++) {
      const pc = whiteNotes[i];
      const isActive = pcsSet.has(pc);
      const isRoot = pc === rootPC;
      const isBass = bassPC !== undefined && bassPC !== null && pc === bassPC && !isRoot;
      const isOvl = !isActive && !isRoot && !isBass && overlayPCS && overlayPCS.has(pc);
      const isChar = isOvl && overlayCharPCS && overlayCharPCS.has(pc);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', wx); rect.setAttribute('y', startY);
      rect.setAttribute('width', whiteW - 1); rect.setAttribute('height', whiteH);
      rect.setAttribute('rx', 1);
      rect.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBass ? INST_BASS_COLOR : (isActive ? '#999' : (isOvl ? (isChar ? '#e8dfa0' : '#b8d8ec') : '#eee'))));
      rect.setAttribute('stroke', '#bbb'); rect.setAttribute('stroke-width', 0.5);
      svg.appendChild(rect);
      if (isActive || isRoot || isBass || isOvl) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', wx + (whiteW - 1) / 2); label.setAttribute('y', startY + whiteH - 6);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10px');
        label.setAttribute('fill', isRoot ? '#fff' : (isBass ? '#000' : (isOvl ? '#666' : '#333')));
        label.setAttribute('font-weight', '700');
        label.textContent = pcName(pc);
        svg.appendChild(label);
      }
      wx += whiteW;
    }
  }

  // Black keys
  for (let oct = 0; oct < numOctaves; oct++) {
    for (let i = 0; i < 5; i++) {
      const pc = blackNotes[i];
      const isActive = pcsSet.has(pc);
      const isRoot = pc === rootPC;
      const isBass = bassPC !== undefined && bassPC !== null && pc === bassPC && !isRoot;
      const isOvl = !isActive && !isRoot && !isBass && overlayPCS && overlayPCS.has(pc);
      const isChar = isOvl && overlayCharPCS && overlayCharPCS.has(pc);
      const whiteIdx = blackPositions[i] + oct * 7;
      const bx = startX + (whiteIdx + 1) * whiteW - blackW / 2;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', bx); rect.setAttribute('y', startY);
      rect.setAttribute('width', blackW); rect.setAttribute('height', blackH);
      rect.setAttribute('rx', 1);
      rect.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBass ? INST_BASS_COLOR : (isActive ? '#555' : (isOvl ? (isChar ? INST_OVERLAY_CHAR_COLOR : INST_OVERLAY_COLOR) : '#222'))));
      rect.setAttribute('stroke', '#000'); rect.setAttribute('stroke-width', 0.5);
      if (isOvl) rect.setAttribute('opacity', isChar ? '0.6' : '0.5');
      svg.appendChild(rect);
      if (isActive || isRoot || isBass || isOvl) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', bx + blackW / 2); label.setAttribute('y', startY + blackH - 3);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '8px'); label.setAttribute('fill', isBass ? '#000' : (isOvl ? '#fff' : '#ddd'));
        label.setAttribute('font-weight', '700');
        label.textContent = pcName(pc);
        svg.appendChild(label);
      }
    }
  }

  // Piano selected note markers (white circles)
  for (let oct = 0; oct < numOctaves; oct++) {
    for (let i = 0; i < 12; i++) {
      const midi = 36 + oct * 12 + i;
      if (!pianoSelectedNotes.has(midi)) continue;
      const isWhite = [0,2,4,5,7,9,11].includes(i);
      let cx, cy;
      if (isWhite) {
        const whiteIdx = [0,0,1,1,2,3,3,4,4,5,5,6][i];
        cx = startX + (oct * 7 + whiteIdx) * whiteW + (whiteW - 1) / 2;
        cy = startY + whiteH - 12;
      } else {
        const blackIdx = [0,0,1,0,0,0,2,0,3,0,4,0][i];
        const blackPos = [0, 1, 3, 4, 5];
        const whiteOff = blackPos[blackIdx] + oct * 7;
        cx = startX + (whiteOff + 1) * whiteW;
        cy = startY + blackH - 10;
      }
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', cx); marker.setAttribute('cy', cy);
      marker.setAttribute('r', 5);
      marker.setAttribute('fill', '#fff');
      marker.setAttribute('stroke', '#333'); marker.setAttribute('stroke-width', 1.5);
      svg.appendChild(marker);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', cx); label.setAttribute('y', cy + 3);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '6px'); label.setAttribute('fill', '#333');
      label.setAttribute('font-weight', '700');
      label.textContent = pcName(i);
      svg.appendChild(label);
    }
  }

  // Piano click handlers (white keys)
  for (let oct = 0; oct < numOctaves; oct++) {
    for (let i = 0; i < 7; i++) {
      const pc = whiteNotes[i];
      const midi = 36 + oct * 12 + pc;
      const kx = startX + (oct * 7 + i) * whiteW;
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.setAttribute('x', kx); hit.setAttribute('y', startY + blackH);
      hit.setAttribute('width', whiteW); hit.setAttribute('height', whiteH - blackH);
      hit.setAttribute('fill', 'transparent'); hit.setAttribute('cursor', 'pointer');
      hit.dataset.midi = midi;
      hit.addEventListener('click', function() { togglePianoNote(parseInt(this.dataset.midi)); });
      svg.appendChild(hit);
    }
  }
  // Piano click handlers (black keys - on top)
  for (let oct = 0; oct < numOctaves; oct++) {
    for (let i = 0; i < 5; i++) {
      const pc = blackNotes[i];
      const midi = 36 + oct * 12 + pc;
      const whiteIdx = blackPositions[i] + oct * 7;
      const bx = startX + (whiteIdx + 1) * whiteW - blackW / 2;
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.setAttribute('x', bx); hit.setAttribute('y', startY);
      hit.setAttribute('width', blackW); hit.setAttribute('height', blackH);
      hit.setAttribute('fill', 'transparent'); hit.setAttribute('cursor', 'pointer');
      hit.dataset.midi = midi;
      hit.addEventListener('click', function() { togglePianoNote(parseInt(this.dataset.midi)); });
      svg.appendChild(hit);
    }
  }

  // Octave labels
  for (let oct = 0; oct < numOctaves; oct++) {
    const ox = startX + oct * 7 * whiteW;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', ox + 2); t.setAttribute('y', startY + whiteH + 11);
    t.setAttribute('font-size', '8px'); t.setAttribute('fill', '#888');
    t.textContent = 'C' + (startOctave + oct);
    svg.appendChild(t);
  }
}

// ========================================
// INSTRUMENT INPUT
// ========================================
const GUITAR_OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // E4, B3, G3, D3, A2, E2
let guitarSelectedFrets = [null, null, null, null, null, null];
let pianoSelectedNotes = new Set(); // MIDI note numbers
let instrumentInputActive = false;
let padExtNotes = new Set(); // Chord mode: MIDI notes toggled on 64-pad for PS extension
let lastDetectedNotes = []; // Last detection input notes (for click-to-transfer, V2.10)
let lastDetectedCandidates = []; // Last detection candidates (for click-to-transfer, V2.10)
let _guitarSyncSource = null; // null | 'manual' | 'pad' — tracks who set guitarSelectedFrets

// Map MIDI notes to guitar fret positions (greedy: low notes → low strings, prefer low frets)
function syncGuitarFromNotes(midiNotes) {
  if (!showGuitar || !midiNotes || midiNotes.length === 0) return;
  if (_guitarSyncSource === 'manual') return; // don't overwrite manual guitar selection
  const sorted = [...midiNotes].sort((a, b) => a - b);
  const newFrets = [null, null, null, null, null, null];
  const usedStrings = new Set();
  for (const midi of sorted) {
    let bestS = -1, bestF = Infinity;
    for (let s = 5; s >= 0; s--) { // low E(5) → high E(0)
      if (usedStrings.has(s)) continue;
      const f = midi - GUITAR_OPEN_MIDI[s];
      if (f >= 0 && f <= 21 && f < bestF) { bestS = s; bestF = f; }
    }
    if (bestS !== -1) { newFrets[bestS] = bestF; usedStrings.add(bestS); }
  }
  guitarSelectedFrets = newFrets;
  instrumentInputActive = newFrets.some(f => f !== null);
  _guitarSyncSource = 'pad';
}

function getAllInputMidiNotes() {
  const notes = [];
  for (let s = 0; s < 6; s++) {
    if (guitarSelectedFrets[s] !== null) {
      notes.push(GUITAR_OPEN_MIDI[s] + guitarSelectedFrets[s]);
    }
  }
  for (let s = 0; s < 4; s++) {
    if (bassSelectedFrets[s] !== null) {
      const m = BASS_OPEN_MIDI[s] + bassSelectedFrets[s];
      if (!notes.includes(m)) notes.push(m);
    }
  }
  pianoSelectedNotes.forEach(n => {
    if (!notes.includes(n)) notes.push(n);
  });
  return notes.sort((a, b) => a - b);
}

function toggleGuitarFret(stringIdx, fret) {
  if (guitarSelectedFrets[stringIdx] === fret) {
    guitarSelectedFrets[stringIdx] = null;
  } else {
    guitarSelectedFrets[stringIdx] = fret;
  }
  _guitarSyncSource = 'manual';
  updateInstrumentInput();
}

function togglePianoNote(midi) {
  if (pianoSelectedNotes.has(midi)) {
    pianoSelectedNotes.delete(midi);
  } else {
    pianoSelectedNotes.add(midi);
  }
  updateInstrumentInput();
}

function updateInstrumentInput() {
  const instrNotes = getAllInputMidiNotes();
  instrumentInputActive = instrNotes.length > 0;
  const ctrlEl = document.getElementById('instrument-controls');
  if (ctrlEl) ctrlEl.style.display = instrumentInputActive ? 'flex' : 'none';
  // Pre-warm audio on first note selection so Play button works instantly
  if (instrumentInputActive) ensureAudioResumed();
  if (instrNotes.length === 0) {
    document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
    if (AppState.mode === 'input') {
      updatePlainDisplay(); // Plain mode: unified display handles #midi-detect
    } else {
      const detectEl = document.getElementById('midi-detect');
      detectEl.innerHTML = '';
    }
    // detectEl always visible (no layout shift)
    renderGuitarDiagram(lastRenderRootPC, lastRenderActivePCS);
    renderBassDiagram(lastRenderRootPC, lastRenderActivePCS);
    renderPianoDisplay(lastRenderRootPC, lastRenderActivePCS);
    renderParentScales();
    return;
  }

  // Plain mode: delegate #midi-detect to updatePlainDisplay() for unified display
  if (AppState.mode === 'input') {
    const inputPCS = new Set(instrNotes.map(n => n % 12));
    const candidates = detectChord(instrNotes);
    if (candidates.length > 0) {
      renderGuitarDiagram(candidates[0].rootPC, inputPCS);
      renderBassDiagram(candidates[0].rootPC, inputPCS);
      renderPianoDisplay(candidates[0].rootPC, inputPCS);
    } else {
      renderGuitarDiagram(null, inputPCS);
      renderBassDiagram(null, inputPCS);
      renderPianoDisplay(null, inputPCS);
    }
    highlightInstrumentPads(instrNotes);
    updatePlainDisplay(); // single source of truth for #midi-detect + plain panel
    renderParentScales();
    return;
  }

  // Chord/Scale mode: existing logic
  let notesForDetect = instrNotes;
  if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
    if (padExtNotes.size > 0) {
      const merged = new Set([...padExtNotes, ...instrNotes]);
      notesForDetect = [...merged].sort((a, b) => a - b);
    } else {
      const builderNotes = getCurrentChordMidiNotes();
      if (builderNotes && builderNotes.length > 0) {
        const merged = new Set([...builderNotes, ...instrNotes]);
        notesForDetect = [...merged].sort((a, b) => a - b);
      }
    }
  }

  const detectEl = document.getElementById('midi-detect');
  const noteNames = notesForDetect.map(n => NOTE_NAMES_SHARP[n % 12]);
  const candidates = detectChord(notesForDetect);
  lastDetectedNotes = notesForDetect;
  lastDetectedCandidates = candidates;
  const inputPCS = new Set(instrNotes.map(n => n % 12));
  if (candidates.length > 0) {
    const best = candidates[0];
    let html = '<span class="detect-candidate-best" onclick="transferDetectedCandidate(0,this)">' + best.name + '</span>';
    if (candidates.length > 1) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">';
      candidates.slice(1).forEach((c, i) => {
        html += '<span class="detect-candidate" onclick="transferDetectedCandidate(' + (i + 1) + ',this)">' + c.name + '</span>';
      });
      html += '</div>';
    }
    html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">' + t('input.notes_label') + noteNames.join(' ') + '</div>';
    detectEl.innerHTML = html;
    if (AppState.mode === 'chord') {
      const mergedPCS = new Set(lastRenderActivePCS);
      instrNotes.forEach(n => mergedPCS.add(n % 12));
      renderGuitarDiagram(lastRenderRootPC, mergedPCS);
      renderBassDiagram(lastRenderRootPC, mergedPCS);
      renderPianoDisplay(lastRenderRootPC, mergedPCS);
    } else {
      renderGuitarDiagram(best.rootPC, inputPCS);
      renderBassDiagram(best.rootPC, inputPCS);
      renderPianoDisplay(best.rootPC, inputPCS);
    }
  } else {
    detectEl.textContent = noteNames.join(' ');
    if (AppState.mode === 'chord') {
      const mergedPCS = new Set(lastRenderActivePCS);
      instrNotes.forEach(n => mergedPCS.add(n % 12));
      renderGuitarDiagram(lastRenderRootPC, mergedPCS);
      renderBassDiagram(lastRenderRootPC, mergedPCS);
      renderPianoDisplay(lastRenderRootPC, mergedPCS);
    } else {
      renderGuitarDiagram(null, inputPCS);
      renderBassDiagram(null, inputPCS);
      renderPianoDisplay(null, inputPCS);
    }
  }
  highlightInstrumentPads(instrNotes);
  renderParentScales();
}

function highlightInstrumentPads(midiNotes) {
  document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
  const svg = document.getElementById('pad-grid');
  const bm = baseMidi();
  const noteSet = new Set(midiNotes);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = bm + row * ROW_INTERVAL + col;
      if (noteSet.has(midi)) {
        const x = MARGIN + col * (PAD_SIZE + PAD_GAP);
        const y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x); rect.setAttribute('y', y);
        rect.setAttribute('width', PAD_SIZE); rect.setAttribute('height', PAD_SIZE);
        rect.setAttribute('rx', 6);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#fff'); rect.setAttribute('stroke-width', 3);
        rect.setAttribute('class', 'instrument-highlight');
        rect.setAttribute('pointer-events', 'none');
        svg.appendChild(rect);
      }
    }
  }
}

function clearInstrumentInput() {
  guitarSelectedFrets = [null, null, null, null, null, null];
  bassSelectedFrets = [null, null, null, null];
  pianoSelectedNotes.clear();
  padExtNotes.clear();
  instrumentInputActive = false;
  _guitarSyncSource = null;
  const ctrlEl = document.getElementById('instrument-controls');
  if (ctrlEl) ctrlEl.style.display = 'none';
  document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
  const detectEl = document.getElementById('midi-detect');
  detectEl.innerHTML = '';
  // Re-render to restore builder chord display on pads + diagrams
  render();
}

function playInstrumentInput() {
  const instrNotes = getAllInputMidiNotes();
  if (padExtNotes.size > 0) {
    // Pad override: play pad notes + any guitar/bass/piano additions
    const merged = [...new Set([...padExtNotes, ...instrNotes])].sort((a, b) => a - b);
    if (merged.length > 0) playMidiNotes(merged, 1.0);
  } else if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
    const builderNotes = getCurrentChordMidiNotes() || [];
    const merged = [...new Set([...builderNotes, ...instrNotes])].sort((a, b) => a - b);
    if (merged.length > 0) playMidiNotes(merged, 1.0);
  } else {
    if (instrNotes.length > 0) playMidiNotes(instrNotes, 1.0);
  }
}

// State for restoring diagrams when MIDI notes are released
let lastRenderRootPC = 0;
let lastRenderActivePCS = new Set();

// ========================================
// PARENT SCALE PANEL
// ========================================
let _psResults = [];
let _psExpanded = false;
let _selectedPS = null; // {parentKey, scaleIdx} — selected Parent Scale for tension filtering
let _psAutoSelect = true; // auto-select first result when true
let _psChordFP = ''; // chord fingerprint — detect chord context change

// Restore psSortMode from localStorage
(function() {
  const saved = localStorage.getItem('psSortMode');
  if (saved === 'practical' || saved === 'diatonic') AppState.psSortMode = saved;
})();

function toggleParentScales() {
  AppState.showParentScales = !AppState.showParentScales;
  const btn = document.getElementById('ps-toggle');
  if (btn) btn.classList.toggle('active', AppState.showParentScales);
  renderParentScales();
}

function togglePSExpand() {
  _psExpanded = !_psExpanded;
  renderParentScales();
}

function togglePsSortMode() {
  AppState.psSortMode = AppState.psSortMode === 'practical' ? 'diatonic' : 'practical';
  localStorage.setItem('psSortMode', AppState.psSortMode);
  _selectedPS = null;
  _psAutoSelect = true;
  renderParentScales();
  render();
}

// Practical mode auto-selection: prefer scales with fewer avoid notes
const DIATONIC_AUTO_PREF = {
  1: [3, 0],    // I△7 → Lydian, Ionian
  2: [1],       // ii7 → Dorian
  3: [1],       // iii7 → Dorian
  4: [3, 0],    // IV△7 → Lydian, Ionian
  5: [4, 17],   // V7 → Mixolydian, Lydian b7
  6: [1, 5],    // vi7 → Dorian, Aeolian
  7: [19, 6],   // viiø7 → Locrian ♮2, Locrian
};

function findBestAutoSelect(results) {
  if (AppState.psSortMode === 'practical') {
    const diaMatch = results.find(r =>
      r.system === '○' && r.distance === 0 && !r.omit5Match);
    if (diaMatch) {
      const prefs = DIATONIC_AUTO_PREF[diaMatch.degreeNum];
      if (prefs) {
        for (const idx of prefs) {
          const match = results.find(r => r.scaleIdx === idx && !r.omit5Match);
          if (match) return match;
        }
      }
    }
  }
  return results[0]; // Diatonic mode or fallback
}

function renderParentScales() {
  const toggleWrap = document.getElementById('parent-scale-toggle');
  const panel = document.getElementById('parent-scale-panel');
  if (!toggleWrap || !panel) return;

  // Determine chord context from current mode
  let psRoot = null;
  let qualityIntervals = null;
  let fullAbsSet = new Set();
  let hasTension = false;
  let newFPSource = '';

  if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality !== null) {
    // Fingerprint always from BuilderState (chord-change detection, triggers padExtNotes.clear())
    newFPSource = BuilderState.root + ':' +
      (BuilderState.quality ? BuilderState.quality.name : '') + ':' +
      (BuilderState.tension ? BuilderState.tension.label : '');

    if (padExtNotes.size > 0) {
      // Pad override: chord determined by toggled pad notes
      const extMidi = [...padExtNotes].sort((a, b) => a - b);
      const detected = detectChord(extMidi);
      psRoot = detected.length > 0 ? detected[0].rootPC : extMidi[0] % 12;
      qualityIntervals = new Set(extMidi.map(n => ((n % 12 - psRoot + 12) % 12)));
      fullAbsSet = new Set(extMidi.map(n => n % 12));
      hasTension = true;
      // Guitar/bass/piano additions on top of pad notes
      getAllInputMidiNotes().forEach(n => fullAbsSet.add(n % 12));
    } else {
      // Normal: builder chord + guitar/bass/piano additions
      psRoot = BuilderState.root;
      qualityIntervals = new Set(BuilderState.quality.pcs.map(pc => pc % 12));
      const fullPCS = getBuilderPCS();
      if (fullPCS) fullPCS.forEach(iv => fullAbsSet.add((iv + psRoot) % 12));
      hasTension = BuilderState.tension !== null;
      const extPCs = getAllInputMidiNotes().map(n => n % 12);
      if (extPCs.length > 0) {
        extPCs.forEach(pc => fullAbsSet.add(pc));
        hasTension = true;
      }
    }
  } else if (AppState.mode === 'input' && PlainState.activeNotes.size >= 3) {
    // Plain mode: detect chord from active notes
    const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
    const candidates = detectChord(notes);
    if (candidates.length > 0) {
      psRoot = candidates[0].rootPC;
      const pcs = [...new Set(notes.map(n => n % 12))];
      qualityIntervals = new Set(pcs.map(pc => ((pc - psRoot) + 12) % 12));
      fullAbsSet = new Set(pcs);
      hasTension = false; // Plain: all notes as one unit, all exact
      newFPSource = 'input:' + pcs.sort((a, b) => a - b).join(',');
    }
  }

  const show = psRoot !== null && qualityIntervals !== null;
  toggleWrap.style.display = show ? '' : 'none';

  if (!show) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    _psResults = [];
    _selectedPS = null;
    _psAutoSelect = true;
    _psChordFP = '';
    applyParentScaleFilter(null);
    return;
  }

  // Always compute parent scales (even when panel is closed)
  _psResults = findParentScales(psRoot, qualityIntervals, AppState.key);

  // Annotate each result: does the FULL chord (with tensions) fit in this scale?
  // When tension is present, omit perfect 5th from check (standard voicing practice)
  const p5abs = hasTension ? (psRoot + 7) % 12 : -1;
  _psResults.forEach(r => {
    if (!hasTension) {
      r.exactMatch = true;
    } else {
      const scaleAbsPCS = new Set(SCALES[r.scaleIdx].pcs.map(iv => (iv + psRoot) % 12));
      r.exactMatch = [...fullAbsSet].every(pc => pc === p5abs || scaleAbsPCS.has(pc));
    }
  });

  // Non-diatonic dominant scales (H-W Dim, Whole Tone) only relevant with tensions
  // W-H Dim stays for diminished chords (no tension needed)
  if (!hasTension) {
    const DOM_ND = new Set([25, 26]); // Whole Tone, H-W Dim
    _psResults = _psResults.filter(r => r.system !== '' || !DOM_ND.has(r.scaleIdx));
  }

  // Re-sort: exact matches first, then by mode-specific criteria
  const SYS = { '\u25CB': 0, 'NM': 1, '\u25A0': 2, '\u25C6': 3 };
  if (AppState.psSortMode === 'practical') {
    // Practical: exactMatch → omit5 → distance → system → avoidCount → degreeNum
    // distance first: in-key scales before distant alternatives (Mixolydian > Lydian b7)
    _psResults.sort((a, b) =>
      (b.exactMatch - a.exactMatch) ||
      (a.omit5Match - b.omit5Match) ||
      (a.distance - b.distance) ||
      ((SYS[a.system] || 0) - (SYS[b.system] || 0)) ||
      (a.avoidCount - b.avoidCount) ||
      (a.degreeNum - b.degreeNum)
    );
  } else {
    // Diatonic: exactMatch → omit5 → distance → system → degreeNum (original behavior)
    _psResults.sort((a, b) =>
      (b.exactMatch - a.exactMatch) ||
      (a.omit5Match - b.omit5Match) ||
      (a.distance - b.distance) ||
      ((SYS[a.system] || 0) - (SYS[b.system] || 0)) ||
      (a.degreeNum - b.degreeNum)
    );
  }

  if (_psResults.length === 0) {
    _selectedPS = null;
    applyParentScaleFilter(null);
    if (AppState.showParentScales) {
      panel.style.display = '';
      panel.innerHTML = '<div class="ps-header">' + t('parent.header', { n: 0 }) + '</div>';
    } else {
      panel.style.display = 'none';
      panel.innerHTML = '';
    }
    return;
  }

  // Detect chord context change → reset auto-select and clear pad extension notes
  if (newFPSource !== _psChordFP) {
    _psChordFP = newFPSource;
    _selectedPS = null;
    // Only auto-select when chord came from diatonic bar click
    _psAutoSelect = !!BuilderState._fromDiatonic;
    padExtNotes.clear(); // extension notes are meaningless for a different chord
  }

  // Validate current selection still in results
  if (_selectedPS) {
    const still = _psResults.some(r =>
      r.parentKey === _selectedPS.parentKey && r.scaleIdx === _selectedPS.scaleIdx);
    if (!still) { _selectedPS = null; _psAutoSelect = true; }
  }

  // Auto-select best result based on sort mode
  if (!_selectedPS && _psAutoSelect && _psResults.length > 0) {
    const best = findBestAutoSelect(_psResults);
    _selectedPS = { parentKey: best.parentKey, scaleIdx: best.scaleIdx };
  }

  // Always apply tension filter
  applyParentScaleFilter(_selectedPS ? _selectedPS.scaleIdx : null);

  // Only render panel UI if open
  if (!AppState.showParentScales) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  panel.style.display = '';
  // When tension is present, exact matches always shown (even from distant keys)
  // Diatonic (○) system results always shown (pivot chord visibility)
  // Also include the auto-selected result so it's always visible
  const isSelected = (r) => _selectedPS && r.parentKey === _selectedPS.parentKey && r.scaleIdx === _selectedPS.scaleIdx;
  const isClose = (r) => r.distance <= 1 || r.system === '○' || r.avoidCount === 0 || (hasTension && r.exactMatch) || isSelected(r);
  const closeResults = _psResults.filter(isClose);
  const farResults = _psResults.filter(r => !isClose(r));
  const showAll = _psExpanded || farResults.length === 0;
  const displayResults = showAll ? _psResults : closeResults;

  // Current chord's tension PCs (for avoid-conflict marking, Chord mode only)
  const chordTensionPCs = new Set();
  if (AppState.mode === 'chord' && BuilderState.tension) {
    const m = BuilderState.tension.mods;
    if (m.add) m.add.forEach(pc => chordTensionPCs.add(pc));
    if (m.sharp5) chordTensionPCs.add(8);
    if (m.flat5) chordTensionPCs.add(6);
  }

  const sortLabel = AppState.psSortMode === 'practical' ? t('parent.sortPractical') : t('parent.sortDiatonic');
  let html = '<div class="ps-header">' +
    t('parent.header', { n: _psResults.length });
  html += ' <button class="ps-sort-toggle" onclick="togglePsSortMode()" title="' +
    (AppState.psSortMode === 'practical' ? 'Switch to Diatonic sort' : 'Switch to Practical sort') + '">' +
    sortLabel + '</button>';
  if (farResults.length > 0) {
    html += ' <button class="ps-expand" onclick="togglePSExpand()">' +
      (_psExpanded ? '\u25B2' : '\u25BC ' + t('parent.expand')) + '</button>';
  }
  html += '</div>';

  let dividerAdded = false;
  let partialDividerAdded = false;
  let omit5DividerAdded = false;
  displayResults.forEach((r, i) => {
    // Divider between exact and partial matches
    if (!partialDividerAdded && !r.exactMatch && !r.omit5Match && i > 0 && displayResults[i - 1].exactMatch) {
      html += '<div class="ps-divider"></div>';
      partialDividerAdded = true;
    }
    // Divider before omit5 matches (only when no tension — with tension, omit5 is standard practice)
    if (!hasTension && !omit5DividerAdded && r.omit5Match && i > 0 && !displayResults[i - 1].omit5Match) {
      html += '<div class="ps-divider"><span style="font-size:0.55rem;color:var(--text-muted);">omit 5</span></div>';
      omit5DividerAdded = true;
    }
    if (showAll && !dividerAdded && closeResults.length > 0 && r.distance > 1 && !r.omit5Match && r.exactMatch) {
      html += '<div class="ps-divider"></div>';
      dividerAdded = true;
    }
    const globalIdx = _psResults.indexOf(r);
    const isSelected = _selectedPS &&
      _selectedPS.parentKey === r.parentKey && _selectedPS.scaleIdx === r.scaleIdx;
    const sat = SCALE_AVAIL_TENSIONS[r.scaleIdx];

    // Check if chord's tensions conflict with avoid notes of this scale
    let hasAvoidConflict = false;
    if (sat && sat.avoid && chordTensionPCs.size > 0) {
      const avoidPCs = new Set(sat.avoid.map(n => TENSION_NAME_TO_PC[n]));
      for (const pc of chordTensionPCs) {
        if (avoidPCs.has(pc)) { hasAvoidConflict = true; break; }
      }
    }

    html += '<div class="ps-row' + (isSelected ? ' ps-selected' : '') +
      (!r.exactMatch ? ' ps-partial' : '') +
      (!hasTension && r.omit5Match ? ' ps-omit5' : '') +
      (hasAvoidConflict ? ' ps-avoid' : '') +
      '" onclick="onPSSelect(' + globalIdx + ')">' +
      '<span class="ps-cat">' + r.system + '</span>' +
      '<span class="ps-scale">' + NOTE_NAMES_SHARP[psRoot] + ' ' + r.scaleName + '</span>' +
      '<span class="ps-degree">' + r.degree + '</span>' +
      (r.parentKeyName ? '<span class="ps-parent-info">← ' + r.parentKeyName + ' ' + r.systemLabel + '</span>' : '');

    // Available tensions
    if (sat) {
      html += '<span class="ps-avail">' + sat.avail.join(' ') + '</span>';
    }

    // Go-to-scale button (stops propagation to prevent toggle)
    html += '<span class="ps-goto" onclick="event.stopPropagation();onParentScaleGo(' +
      globalIdx + ')" title="Scale mode">↗</span>';

    html += '</div>';
  });

  panel.innerHTML = html;
}

// Click row → toggle scale selection for tension filtering
function onPSSelect(idx) {
  const r = _psResults[idx];
  if (!r) return;
  if (_selectedPS &&
      _selectedPS.parentKey === r.parentKey && _selectedPS.scaleIdx === r.scaleIdx) {
    // Toggle off — disable auto-select until chord changes
    _selectedPS = null;
    _psAutoSelect = false;
    applyParentScaleFilter(null);
  } else {
    // Manual selection
    _selectedPS = { parentKey: r.parentKey, scaleIdx: r.scaleIdx };
    _psAutoSelect = false;
    applyParentScaleFilter(r.scaleIdx);
  }
  render();
}

// ↗ button → switch to that scale in Scale mode
function onParentScaleGo(idx) {
  const r = _psResults[idx];
  if (!r) return;
  _selectedPS = null;
  applyParentScaleFilter(null);
  AppState.key = r.parentKey;
  AppState.scaleIdx = r.scaleIdx;
  updateKeyButtons();
  const sel = document.getElementById('scale-select');
  if (sel) sel.value = r.scaleIdx;
  resetVoicingSelection();
  setMode('scale');
}

// Apply available-tension filter from selected Parent Scale to tension grid
function applyParentScaleFilter(scaleIdx) {
  const btns = document.querySelectorAll('#tension-grid .tension-btn');
  btns.forEach(btn => btn.classList.remove('scale-unavailable'));

  if (scaleIdx === null) return;
  const sat = SCALE_AVAIL_TENSIONS[scaleIdx];
  if (!sat) return;

  const availSet = new Set(sat.avail);
  btns.forEach(btn => {
    if (!btn._tension) return;
    if (btn.classList.contains('quality-hidden')) return;
    const mods = btn._tension.mods;
    const pcs = [];
    if (mods.add) pcs.push(...mods.add);
    if (mods.sharp5) pcs.push(8);
    if (mods.flat5) pcs.push(6);
    // replace3 (sus4) is quality modification, not filtered by scale

    for (const pc of pcs) {
      const name = PC_TO_TENSION_NAME[pc];
      if (name && !availSet.has(name)) {
        btn.classList.add('scale-unavailable');
        return;
      }
    }
  });
}

// ========================================
// 32-PAD MODE (4x8)
// ========================================
function renderPad32() {
  var svg = document.getElementById('pad-grid-32');
  if (!svg) return;
  var container = svg.parentElement;
  var availWidth = container.clientWidth || window.innerWidth;
  var availHeight = svg.clientHeight || container.clientHeight || (window.innerHeight - 60);
  var padFromW = Math.floor((availWidth - GRID_32.MARGIN * 2 - 7 * GRID_32.PAD_GAP) / 8);
  var padFromH = Math.floor((availHeight - GRID_32.MARGIN * 2 - 3 * GRID_32.PAD_GAP) / 4);
  var padSize = Math.min(padFromW, padFromH);
  if (padSize < 20) padSize = 20;
  var g = {
    ROWS: 4, COLS: 8,
    BASE_MIDI: GRID_32.BASE_MIDI, ROW_INTERVAL: GRID_32.ROW_INTERVAL, COL_INTERVAL: GRID_32.COL_INTERVAL,
    PAD_SIZE: padSize, PAD_GAP: GRID_32.PAD_GAP, MARGIN: GRID_32.MARGIN
  };
  var totalW = g.COLS * (g.PAD_SIZE + g.PAD_GAP) - g.PAD_GAP + g.MARGIN * 2;
  var totalH = g.ROWS * (g.PAD_SIZE + g.PAD_GAP) - g.PAD_GAP + g.MARGIN * 2;
  svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.style.width = '100%'; svg.style.height = '100%';
  svg.innerHTML = '';
  var state = computeRenderState();
  renderPads(svg, state, g);
}

// Populate and sync landscape overlay Key/Scale selects
function initPlayControls() {
  var pk = document.getElementById('play-key-select');
  var ps = document.getElementById('play-scale-select');
  if (!pk || !ps) return;
  // Key options
  pk.innerHTML = '';
  for (var i = 0; i < 12; i++) {
    var o = document.createElement('option');
    o.value = i;
    o.textContent = NOTE_NAMES_SHARP[i];
    pk.appendChild(o);
  }
  // Scale options
  ps.innerHTML = '';
  for (var j = 0; j < SCALES.length; j++) {
    var o = document.createElement('option');
    o.value = j;
    o.textContent = SCALES[j].name;
    ps.appendChild(o);
  }
  syncPlayControls();
}

function syncPlayControls() {
  var pk = document.getElementById('play-key-select');
  var ps = document.getElementById('play-scale-select');
  if (pk) pk.value = AppState.key;
  if (ps) ps.value = AppState.scaleIdx;
}

function toggleFullscreen() {
  var el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

