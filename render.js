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
  // On mobile: diagrams stay in instrument-row (Screen 1, below pad)
  // No DOM move needed — CSS handles sizing
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
  var inputNotes = AppState.mode === 'input'
    ? [...PlainState.activeNotes].sort(function(a, b) { return a - b; }) : [];
  var instrumentNotes = AppState.mode === 'input' && instrumentInputActive
    ? getAllInputMidiNotes() : [];
  var builderPCS = AppState.mode === 'chord' ? getBuilderPCS() : null;
  var chordNameVal = AppState.mode === 'chord' && builderPCS ? getBuilderChordName() : '';
  var extNotesArr = AppState.mode === 'chord' && padExtNotes.size > 0
    ? [...padExtNotes].sort(function(a, b) { return a - b; }) : [];

  return padComputeRenderState({
    cFixed: AppState.padCFixed === true,
    mode: AppState.mode,
    key: AppState.key,
    scaleIdx: AppState.scaleIdx,
    builderRoot: BuilderState.root,
    qualityPCS: BuilderState.quality ? BuilderState.quality.pcs : null,
    builderPCS: builderPCS,
    chordName: chordNameVal,
    builderBass: BuilderState.bass,
    inputNotes: inputNotes,
    instrumentNotes: instrumentNotes,
    detectChordFn: typeof detectChord === 'function' ? detectChord : null,
    voicing: {
      omit5: VoicingState.omit5,
      rootless: VoicingState.rootless,
      omit3: VoicingState.omit3,
      shell: VoicingState.shell
    },
    tasty: {
      enabled: TastyState.enabled,
      midiNotes: TastyState.midiNotes,
      degreeMap: TastyState.degreeMap,
      topNote: TastyState.topNote,
      boxSelected: VoicingState.selectedBoxIdx !== null,
      padPositions: TastyState.padPositions
    },
    stock: {
      enabled: StockState.enabled && StockState.currentIndex >= 0,
      midiNotes: StockState.enabled ? (StockState.lhMidi || []).concat(StockState.rhMidi || []) : [],
      degreeMap: StockState.degreeMap || {},
      topNote: StockState.rhMidi && StockState.rhMidi.length > 0 ? StockState.rhMidi[StockState.rhMidi.length - 1] : null,
      padPositions: StockState.padPositions
    },
    extNotes: extNotesArr,
    selectedPS: _selectedPS || null,
    noRootLabel: t('builder.select_root')
  });
}

function renderPads(svg, state, grid) {
  var rows = grid ? grid.ROWS : ROWS;
  var cols = grid ? grid.COLS : COLS;
  var padSize = grid ? grid.PAD_SIZE : PAD_SIZE;
  var padGap = grid ? grid.PAD_GAP : PAD_GAP;
  var margin = grid ? grid.MARGIN : MARGIN;
  const { activePCS, activeIvPCS, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS, overlayPCS, overlayCharPCS, tastyMidiSet, tastyDegreeMap, tastyTopMidi, tastyPadPositions } = state;
  // Build compact position set for TASTY/Stock pad positioning
  var tastyPadPosSet = null;
  if (tastyPadPositions && tastyPadPositions.length > 0) {
    tastyPadPosSet = new Set(tastyPadPositions.map(function(p) { return p.row + ',' + p.col; }));
  }
  // Build position set for selected voicing box (for dimming non-selected pads)
  const selBox = !grid && VoicingState.selectedBoxIdx !== null ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx] : null;
  const selMidi = selBox ? new Set(selBox.midiNotes) : null;
  const selPos = selBox ? new Set(selBox.alternatives[selBox.currentAlt].positions.map(p => p.row + ',' + p.col)) : null;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const midi = midiNote(row, col);
      const pc = pitchClass(midi);
      const x = margin + col * (padSize + padGap);
      const y = margin + (rows - 1 - row) * (padSize + padGap);
      const interval = ((pc - rootPC) + 12) % 12;
      // Voicing filter: pad-position filter (deduped, WYSIWYG) > MIDI filter > no filter
      const _padPosFilter = !grid && _instrumentPadSet;
      const _instrFilter = !grid && !_padPosFilter && _instrumentMidiSet;
      const _voicingPass = (tastyMidiSet && tastyMidiSet.size > 0)
        ? true  // TASTY mode: bypass instrument filters entirely (_isTastyMiss handles dimming)
        : (_padPosFilter ? _padPosFilter.has(row * cols + col) : (_instrFilter ? _instrFilter.has(midi) : true));
      const isRoot = pc === rootPC && !omittedPCS.has(pc) && _voicingPass;
      const isBass = bassPC !== null && pc === bassPC && _voicingPass;
      const isActive = _voicingPass ? activePCS.has(pc) : false;
      const isOmitted = omittedPCS.has(pc) && _voicingPass;
      const isChar = AppState.mode === 'scale' && charPCS.has(pc) && !isRoot;
      const isGuide3 = AppState.mode === 'chord' && guide3PCS.has(pc) && !isRoot && !tensionPCS.has(pc) && _voicingPass;
      const isGuide7 = AppState.mode === 'chord' && guide7PCS.has(pc) && !isRoot && !tensionPCS.has(pc) && _voicingPass;
      const isGuide = isGuide3 || isGuide7;
      const isTension = AppState.mode === 'chord' && tensionPCS.has(pc) && !isRoot && !isGuide && _voicingPass;
      const isAvoid = AppState.mode === 'chord' && avoidPCS.has(pc) && !isRoot && _voicingPass;
      const isOverlay = !(_padPosFilter || _instrFilter) && !isOmitted && overlayPCS && overlayPCS.has(pc) && !activePCS.has(pc);

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
      else if (overlayPCS && overlayPCS.has(pc) && !activePCS.has(pc)) {
        // Scale overlay: note is in the selected scale but not in the chord
        // Show even when voicing box is selected (bypass _voicingPass)
        if (overlayCharPCS.has(pc)) {
          fill = 'var(--pad-overlay-char)';
        } else {
          fill = 'var(--pad-overlay)';
        }
        textColor = 'var(--text-muted)';
      }

      // TASTY voicing: only highlight pads at compact positions (or lowest-row fallback)
      var _isTastyMiss = false;
      if (tastyMidiSet && tastyMidiSet.size > 0) {
        if (tastyPadPosSet) {
          // Compact position set: exact (row,col) match
          _isTastyMiss = !tastyPadPosSet.has(row + ',' + col);
        } else if (!tastyMidiSet.has(midi)) {
          _isTastyMiss = true;
        } else {
          // Fallback: MIDI match but check if there's a lower-row occurrence (skip this one)
          var _bm = baseMidi(), _ri = ROW_INTERVAL;
          for (var pr = 0; pr < row; pr++) {
            var pc2 = midi - _bm - pr * _ri;
            if (pc2 >= 0 && pc2 < cols) { _isTastyMiss = true; break; }
          }
        }
        if (_isTastyMiss) {
          // Keep original chord tone color — opacity reduction applied later
          textColor = 'var(--text-muted)';
        }
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
          if (linkMode) {
            _heldMidi = m; noteOn(m); midiActiveNotes.add(m); scheduleMidiUpdate(); return;
          }
          if (AppState.mode === 'input') { togglePlainNote(m); }
          else if (TastyState.enabled || StockState.enabled) {
            // TASTY/Stock mode: play note only, don't modify chord builder
            _heldMidi = m; noteOn(m);
          } else {
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
          if (linkMode) {
            for (const t of e.changedTouches) { _heldTouches.set(t.identifier, m); }
            noteOn(m); midiActiveNotes.add(m); scheduleMidiUpdate(); return;
          }
          if (AppState.mode === 'input') { togglePlainNote(m); }
          else if (TastyState.enabled || StockState.enabled) {
            for (const t of e.changedTouches) { _heldTouches.set(t.identifier, m); }
            noteOn(m);
          } else {
            for (const t of e.changedTouches) { _heldTouches.set(t.identifier, m); }
            noteOn(m);
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
      if (selMidi) {
        // Voicing box selected: no individual pad strokes (dashed box is the boundary)
        rect.setAttribute('stroke', 'none');
      } else if (isOmitted) {
        rect.setAttribute('stroke', 'rgba(255,255,255,0.2)');
        rect.setAttribute('stroke-width', 1); rect.setAttribute('stroke-dasharray', '4 2');
      } else {
        const hasStroke = isActive || isBass || isChar || isGuide || isOverlay;
        rect.setAttribute('stroke', hasStroke ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)');
        rect.setAttribute('stroke-width', hasStroke ? 1.5 : 0.5);
      }
      // Dim non-selected pads when a voicing box is selected (match by grid position, not MIDI)
      const isDimmed = selPos && !selPos.has(row + ',' + col);
      const isDimChordTone = isDimmed && (isActive || isRoot || isBass || isGuide);
      const isOverlayPad = isDimmed && overlayPCS && overlayPCS.has(pc) && !activePCS.has(pc);
      if (isDimmed) {
        if (isOverlayPad) {
          // Scale overlay pads: keep overlay color, slightly dimmed
          rect.setAttribute('opacity', '0.6');
        } else if (isDimChordTone) {
          // Chord tones outside voicing box = invisible (noise reduction)
          rect.setAttribute('fill', 'var(--bg)');
          rect.setAttribute('opacity', '0');
        } else {
          // Non-chord-tone pads = grid reference (like guitar inlays)
          rect.setAttribute('fill', 'var(--pad-off)');
          rect.setAttribute('opacity', '0.7');
        }
        rect.setAttribute('stroke', 'none');
      }
      // TASTY mode: fade off non-voicing pads completely
      const isTastyActive = tastyMidiSet && tastyMidiSet.size > 0;
      if (isTastyActive && _isTastyMiss) {
        // Keep chord tone colors visible at low opacity for orientation
        rect.setAttribute('stroke', 'none');
        rect.setAttribute('opacity', '0.2');
      } else if (isTastyActive) {
        rect.setAttribute('stroke', 'none');
      }
      // TASTY hit: highlight pad. Each MIDI note appears 1-2 times on the grid;
      // only highlight the LOWEST row occurrence (closest to bass = most natural fingering)
      const isTastyHit = isTastyActive && !_isTastyMiss;
      const isTastyTop = isTastyHit && tastyTopMidi !== null && midi === tastyTopMidi;
      if (isTastyHit) {
        rect.setAttribute('stroke', '#fff');
        rect.setAttribute('stroke-width', isTastyTop ? 3 : 1.5);
      }
      svg.appendChild(rect);

      const showDegree = rootPC !== null && !_isTastyMiss && (isActive || isRoot || isBass || isOmitted || isChar || isGuide || isAvoid || isOverlay);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'pad-label');
      text.setAttribute('x', x + padSize / 2);
      text.setAttribute('y', showDegree ? y + padSize * 0.24 : y + padSize / 2 - 4);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', textColor);
      text.setAttribute('font-size', padSize < 50 ? '8px' : (showDegree ? '10px' : '9px'));
      text.setAttribute('font-weight', showDegree ? '600' : '400');
      text.textContent = pcName(pc);
      if (isDimmed) text.setAttribute('opacity', isDimChordTone ? '0' : (isOverlayPad ? '0.9' : '0.4'));
      if (isTastyActive && _isTastyMiss) text.setAttribute('opacity', '0.05');
      svg.appendChild(text);

      if (showDegree) {
        let degName;
        // TASTY mode: use recipe degree (e.g. "b7", "#11") instead of computed interval name
        if (tastyDegreeMap && tastyMidiSet && tastyMidiSet.has(midi) && tastyDegreeMap[midi]) {
          degName = tastyDegreeMap[midi];
        } else if (isOverlay) {
          // Overlay notes use scale degree names (not chord degree names)
          degName = SCALE_DEGREE_NAMES[interval];
        } else if (AppState.mode === 'scale') {
          degName = SCALE_DEGREE_NAMES[interval];
        } else {
          degName = chordDegreeName(interval, qualityPCS, activeIvPCS);
        }
        if (!tastyDegreeMap && (isTension || isAvoid) && AppState.mode === 'chord') {
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
        if (isDimmed) degText.setAttribute('opacity', isDimChordTone ? '0' : (isOverlayPad ? '0.9' : '0.4'));
        svg.appendChild(degText);
        // TASTY top note: white border is the visual hint (text label removed — bar shows TOP info)
      }

      const octText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      octText.setAttribute('class', 'pad-label');
      octText.setAttribute('x', x + padSize / 2);
      octText.setAttribute('y', showDegree ? y + padSize * 0.82 : y + padSize / 2 + 12);
      octText.setAttribute('text-anchor', 'middle'); octText.setAttribute('dominant-baseline', 'middle');
      octText.setAttribute('fill', textColor);
      octText.setAttribute('font-size', padSize < 50 ? '6px' : '8px'); octText.setAttribute('opacity', isDimmed ? (isDimChordTone ? '0' : (isOverlayPad ? '0.7' : '0.3')) : '0.6');
      octText.textContent = noteName(midi);
      svg.appendChild(octText);
    }
  }
}

function renderVoicingBoxes(svg, state) {
  const { activePCS, rootPC, qualityPCS } = state;
  // TASTY/Stock mode: no voicing boxes (pad highlights via tastyMidiSet in render loop)
  if ((TastyState.enabled && TastyState.midiNotes.length > 0) ||
      (StockState.enabled && StockState.currentIndex >= 0)) {
    VoicingState.lastBoxes = [];
    return;
  }
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
  if (!infoEl) return;
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
      if (BuilderState.bass !== null) txt += ' / ' + pcName(BuilderState.bass, _chordContextKey());
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

  // Guitar/bass positioning BEFORE pads so voicing reflect can filter pad display
  if (typeof updateGuitarPositions === 'function') updateGuitarPositions();
  if (typeof updateBassPositions === 'function') updateBassPositions();

  // Voicing reflect: auto-positioned guitar voicing → deduped pad positions (WYSIWYG)
  if (_voicingReflectMode && _guitarSyncSource === 'position') {
    var reflectNotes = [];
    for (var s = 0; s < 6; s++) {
      if (guitarSelectedFrets[s] !== null) {
        reflectNotes.push(GUITAR_OPEN_MIDI[s] + guitarSelectedFrets[s]);
      }
    }
    if (reflectNotes.length >= 2) {
      _instrumentMidiSet = new Set(reflectNotes);
      var layout = _computeVoicingPadPositions(_instrumentMidiSet);
      _instrumentPadSet = layout.padSet;
      _voicingDualCount = layout.dualCount;
      _voicingLayoutCount = layout.layoutCount;
      var vrBtn = document.getElementById('voicing-reflect-btn');
      if (vrBtn) {
        vrBtn.innerHTML = '<span class="kbd-hint">V</span>' + (_voicingLayoutCount > 1
          ? t('pos.to_pad') + ' ' + (_voicingAltMode + 1) + '/' + _voicingLayoutCount
          : t('pos.to_pad'));
      }
    }
  }

  // Stock voicing reflect: Stock MIDI → deduped pad positions
  if (_stockReflectMode && StockState.enabled) {
    var stockNotes = StockState.lhMidi.concat(StockState.rhMidi);
    if (stockNotes.length >= 2) {
      _instrumentMidiSet = new Set(stockNotes);
      var layout = _computeVoicingPadPositions(_instrumentMidiSet);
      _instrumentPadSet = layout.padSet;
      _voicingDualCount = layout.dualCount;
      _voicingLayoutCount = layout.layoutCount;
      var srBtn = document.getElementById('stock-reflect-btn');
      if (srBtn) {
        srBtn.innerHTML = _voicingLayoutCount > 1
          ? t('pos.to_pad') + ' ' + (_voicingAltMode + 1) + '/' + _voicingLayoutCount
          : t('pos.to_pad');
      }
    }
  }

  const state = computeRenderState();
  // C-fixed mode (Pad OS): pad/LED だけ C Major に固定する別 state を作る。
  // 他 UI（staff/guitar/bass/piano/circle/legend/info）は通常の state を使う。
  // Codex P1 fix 2026-04-14.
  const padState = (typeof padApplyPadOverride === 'function') ? padApplyPadOverride(state) : state;
  renderPads(svg, padState);
  if (AppState.mode !== 'input' && !TastyState.enabled && !StockState.enabled && !(_voicingReflectMode && _guitarSyncSource === 'position') && !_stockReflectMode) {
    renderVoicingBoxes(svg, state);
  }
  renderLegend(state);

  // Staff notation
  if (AppState.mode === 'input') {
    // Plain mode: show selected notes on staff
    const plainNotes = [...PlainState.activeNotes].sort((a, b) => a - b);
    renderStaff('input', state.rootPC, state.activePCS, state.omittedPCS, null, plainNotes.length > 0 ? plainNotes : [], null);
  } else {
    let boxMidi = (VoicingState.selectedBoxIdx !== null && VoicingState.lastBoxes[VoicingState.selectedBoxIdx])
      ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx].midiNotes : null;
    // TASTY voicing: show voicing notes on staff
    if (state.tastyMidiSet && state.tastyMidiSet.size > 0) {
      boxMidi = TastyState.midiNotes;
    }
    renderStaff(AppState.mode, state.rootPC, state.activePCS, state.omittedPCS, state.qualityPCS, boxMidi, state.bassPC, state.activeIvPCS);
  }

  // Instrument diagrams (guitar + bass + piano)
  lastRenderRootPC = state.rootPC;
  lastRenderActivePCS = new Set(state.activePCS);
  lastRenderState = state;
  // Guitar/bass positions already computed above (before renderPads)
  renderGuitarDiagram(state.rootPC, state.activePCS, state.bassPC, state.overlayPCS, state.overlayCharPCS, state);
  renderBassDiagram(state.rootPC, state.activePCS, state.bassPC, state.overlayPCS, state.overlayCharPCS, state);
  renderPianoDisplay(state);
  renderCircle();

  // Re-apply instrument highlights after SVG rebuild
  if (instrumentInputActive) {
    highlightInstrumentPads(getAllInputMidiNotes());
  }

  // Re-render 32-pad if in landscape mode
  if (_isLandscape) { syncPlayControls(); renderPad32(); syncPlayChordName(); syncPlayMode(); }

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
  _syncOverlayHighlight();

  // Launchpad/PUSH LED update: always show current scale only
  // (urinami 2026-04-14: PUSH は楽器なので scale のみ、chord/tasty/builder は出さない).
  // C-fixed mode はさらに C Major に固定する。
  if (typeof updateLaunchpadLEDs === 'function') {
    var ledState = (typeof padApplyScaleOnlyOverride === 'function')
      ? padApplyScaleOnlyOverride(state, AppState.key, AppState.scaleIdx, AppState.padCFixed === true)
      : state;
    updateLaunchpadLEDs(ledState);
  }
}

