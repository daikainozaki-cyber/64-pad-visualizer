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
  var inputNotes = AppState.mode === 'input'
    ? [...PlainState.activeNotes].sort(function(a, b) { return a - b; }) : [];
  var instrumentNotes = AppState.mode === 'input' && instrumentInputActive
    ? getAllInputMidiNotes() : [];
  var builderPCS = AppState.mode === 'chord' ? getBuilderPCS() : null;
  var chordNameVal = AppState.mode === 'chord' && builderPCS ? getBuilderChordName() : '';
  var extNotesArr = AppState.mode === 'chord' && padExtNotes.size > 0
    ? [...padExtNotes].sort(function(a, b) { return a - b; }) : [];

  return padComputeRenderState({
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
      boxSelected: VoicingState.selectedBoxIdx !== null
    },
    stock: {
      enabled: StockState.enabled && StockState.currentIndex >= 0,
      midiNotes: StockState.enabled ? (StockState.lhMidi || []).concat(StockState.rhMidi || []) : [],
      degreeMap: StockState.degreeMap || {},
      topNote: StockState.rhMidi && StockState.rhMidi.length > 0 ? StockState.rhMidi[StockState.rhMidi.length - 1] : null
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
  const { activePCS, activeIvPCS, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS, overlayPCS, overlayCharPCS, tastyMidiSet, tastyDegreeMap, tastyTopMidi } = state;
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

      // TASTY voicing: only highlight pads with exact MIDI match AND lowest row only
      var _isTastyMiss = false;
      if (tastyMidiSet && tastyMidiSet.size > 0) {
        if (!tastyMidiSet.has(midi)) {
          _isTastyMiss = true;
        } else {
          // MIDI match but check if there's a lower-row occurrence (skip this one)
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
      const isTastyHit = isTastyActive && tastyMidiSet.has(midi);
      const isTastyTop = isTastyHit && tastyTopMidi !== null && midi === tastyTopMidi;
      if (isTastyHit) {
        // Check if this MIDI note has a LOWER row occurrence (skip this one if so)
        var isLowestRow = true;
        var _bm2 = baseMidi(), _ri2 = ROW_INTERVAL;
        for (var pr = 0; pr < row; pr++) {
          var _c = midi - _bm2 - pr * _ri2;
          if (_c >= 0 && _c < cols) { isLowestRow = false; break; }
        }
        if (isLowestRow) {
          rect.setAttribute('stroke', '#fff');
          rect.setAttribute('stroke-width', isTastyTop ? 3 : 1.5);
        }
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
  renderPads(svg, state);
  if (AppState.mode !== 'input' && !(_voicingReflectMode && _guitarSyncSource === 'position') && !_stockReflectMode) {
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
}

// ========================================
// STAFF NOTATION — adapter to pad-core padRenderStaff
// ========================================
function renderStaff(mode, rootPC, activePCS, omittedPCS, qualityPCS, overrideMidiNotes, bassPC, activeIvPCS) {
  var staffSvg = document.getElementById('staff-notation');
  var midiNotes;

  if (overrideMidiNotes && overrideMidiNotes.length > 0) {
    var seen = new Set();
    midiNotes = [...overrideMidiNotes].sort(function(a, b) { return a - b; }).filter(function(m) {
      var pc = m % 12;
      if (seen.has(pc)) return false;
      seen.add(pc);
      return true;
    });
  } else if (Array.isArray(overrideMidiNotes)) {
    midiNotes = [];
  } else if (mode === 'scale') {
    if (activePCS.size === 0) {
      staffSvg.style.display = 'none'; staffSvg.setAttribute('height', 0); return;
    }
    var pcsArr = [...activePCS].map(function(pc) { return (pc - rootPC + 12) % 12; }).sort(function(a, b) { return a - b; });
    var staffBase = 60 + rootPC;
    midiNotes = pcsArr.map(function(iv) { return staffBase + iv; });
  } else {
    var chordPCS = getBuilderPCS();
    if (!chordPCS || chordPCS.length < 1) {
      if (activePCS.size > 0) {
        var pcsArr2 = [...activePCS].map(function(pc) { return (pc - rootPC + 12) % 12; }).sort(function(a, b) { return a - b; });
        var staffBase2 = 48 + rootPC;
        midiNotes = pcsArr2.map(function(iv) { return staffBase2 + iv; });
      } else if (rootPC !== null && rootPC !== undefined) {
        midiNotes = [48 + rootPC];
      } else {
        staffSvg.style.display = 'none'; staffSvg.setAttribute('height', 0); return;
      }
    } else {
      var allIntervals = [...chordPCS].sort(function(a, b) { return a - b; });
      if (overrideMidiNotes) {
        midiNotes = overrideMidiNotes;
      } else {
        var staffBase3 = 48 + rootPC;
        midiNotes = allIntervals.map(function(iv) { return staffBase3 + iv; });
        if (bassPC !== undefined && bassPC !== null) {
          var bassMidi = 36 + bassPC;
          var lowest = Math.min.apply(null, midiNotes);
          while (bassMidi >= lowest) bassMidi -= 12;
          midiNotes.unshift(bassMidi);
        }
      }
    }
  }

  var defaultFlats = FLAT_MAJOR_KEYS.has(getParentMajorKey(AppState.scaleIdx, AppState.key));

  // Build noteInfoFn based on mode
  var noteInfoFn = null;
  if (mode === 'chord' && qualityPCS) {
    noteInfoFn = function(midi, pc, interval) {
      var degName = chordDegreeName(interval, qualityPCS, activeIvPCS || null);
      return { degName: degName, staffRootPC: rootPC };
    };
  } else if (mode === 'input' && typeof lastDetectedCandidates !== 'undefined' && lastDetectedCandidates.length > 0) {
    var detRootPC = lastDetectedCandidates[0].rootPC;
    noteInfoFn = function(midi, pc, interval) {
      var detIv = ((pc - detRootPC) + 12) % 12;
      var degName = SCALE_DEGREE_NAMES[detIv];
      return { degName: degName, staffRootPC: detRootPC };
    };
  } else if (mode === 'chord') {
    noteInfoFn = function(midi, pc, interval) {
      var degName = SCALE_DEGREE_NAMES[interval];
      var useFlats = defaultFlats;
      if (degName.startsWith('b') || degName === 'm3') useFlats = true;
      else if (degName.startsWith('#') || degName.startsWith('\u25B3')) useFlats = false;
      return { degName: degName, useFlats: useFlats };
    };
  }

  padRenderStaff(staffSvg, {
    midiNotes: midiNotes,
    rootPC: rootPC,
    defaultFlats: defaultFlats,
    width: DIAGRAM_WIDTH,
    isMobile: _isMobile,
    isLandscape: _isLandscape,
    noteInfoFn: noteInfoFn,
  });
}

// ========================================
// GUITAR DIAGRAM
// ========================================
const DIAGRAM_WIDTH = 564;              // shared width for pad, guitar & piano (matches pad grid)
let showGuitar = false;
let showPiano = false;
let showStaff = true;
let showBass = false;
let showCircle = false;
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
  document.getElementById('perform-clear-wrap').style.display = mode === 'perform' ? '' : 'none';
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
  if (which === 'sound') showSound = !showSound;
  document.getElementById('inst-toggle-guitar').classList.toggle('active', showGuitar);
  document.getElementById('inst-toggle-bass').classList.toggle('active', showBass);
  document.getElementById('inst-toggle-piano').classList.toggle('active', showPiano);
  document.getElementById('inst-toggle-sound').classList.toggle('active', showSound);
  document.getElementById('guitar-wrap').style.display = showGuitar ? '' : 'none';
  document.getElementById('bass-wrap').style.display = showBass ? '' : 'none';
  document.getElementById('piano-wrap-display').style.display = showPiano ? '' : 'none';
  document.getElementById('sound-controls').style.display = showSound ? '' : 'none';
  document.getElementById('guitar-label-btn').style.display = (showGuitar || showBass) ? '' : 'none';
  render();
  saveAppSettings();
}

// Staff / Circle exclusive toggle (theory view — right panel)
function toggleTheoryView(which) {
  if (which === 'staff') {
    showStaff = !showStaff;
    if (showStaff) showCircle = false; // exclusive
  } else if (which === 'circle') {
    showCircle = !showCircle;
    if (showCircle) showStaff = false; // exclusive
  }
  document.getElementById('inst-toggle-staff').classList.toggle('active', showStaff);
  document.getElementById('inst-toggle-circle').classList.toggle('active', showCircle);
  document.getElementById('staff-area').style.display = showStaff ? '' : 'none';
  document.getElementById('circle-wrap').style.display = showCircle ? 'flex' : 'none';
  render();
  saveAppSettings();
}

function toggleGuitarLabelMode() {
  guitarLabelMode = guitarLabelMode === 'name' ? 'degree' : 'name';
  document.getElementById('guitar-label-btn').textContent = guitarLabelMode === 'name' ? t('label.note_name') : t('label.degree');
  render();
  saveAppSettings();
}

function renderGuitarDiagram(rootPC, pcsSet, bassPC, overlayPCS, overlayCharPCS, extraState) {
  const svg = document.getElementById('guitar-diagram');
  if (!pcsSet) pcsSet = new Set();
  const ivPcsSet = pcsSet.size > 0
    ? new Set([...pcsSet].map(pc => ((pc - rootPC) % 12 + 12) % 12))
    : null;
  const st = extraState || lastRenderState || {};
  const padLo = baseMidi();
  const padHi = padLo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);

  // Build ghost forms from guitar position groups
  let ghostForms = null;
  let curFretSet = null;
  if (GuitarPositionState.enabled && GuitarPositionState.groups.length > 0) {
    const gGroup = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
    if (gGroup && gGroup.forms.length > 1) {
      curFretSet = new Set();
      for (let gs = 0; gs < 6; gs++) {
        if (guitarSelectedFrets[gs] !== null) curFretSet.add(gs * 100 + guitarSelectedFrets[gs]);
      }
      ghostForms = gGroup.forms.filter((_, fi) => fi !== GuitarPositionState.currentAltInGroup);
    }
  }

  // Label function: maps global state to pure function call
  const labelFn = function(pc, iv) {
    if (guitarLabelMode === 'degree') {
      return (AppState.mode === 'chord' && BuilderState.quality)
        ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet)
        : SCALE_DEGREE_NAMES[iv];
    }
    return pcName(pc);
  };

  padRenderFretboard(svg, {
    tuning: PAD_GUITAR_TUNING,
    stringNames: PAD_GUITAR_NAMES,
    rootPC: rootPC,
    pcsSet: pcsSet,
    bassPC: bassPC,
    overlayPCS: overlayPCS,
    overlayCharPCS: overlayCharPCS,
    renderState: st,
    positionState: GuitarPositionState,
    selectedFrets: guitarSelectedFrets,
    labelFn: labelFn,
    chordMode: AppState.mode === 'chord',
    solo: showGuitar && !showPiano,
    width: DIAGRAM_WIDTH,
    isMobile: _isMobile,
    isLandscape: _isLandscape,
    padRange: { lo: padLo, hi: padHi },
    onFretClick: toggleGuitarFret,
    ghostForms: ghostForms,
    currentFretSet: curFretSet,
  });
}

// ========================================
// BASS DIAGRAM
// ========================================
let bassSelectedFrets = [null, null, null, null];

function renderBassDiagram(rootPC, pcsSet, bassPC, overlayPCS, overlayCharPCS, extraState) {
  const svg = document.getElementById('bass-diagram');
  if (!svg) return;
  if (!pcsSet) pcsSet = new Set();
  const ivPcsSet = pcsSet.size > 0
    ? new Set([...pcsSet].map(pc => ((pc - rootPC) % 12 + 12) % 12))
    : null;
  const bSt = extraState || lastRenderState || {};
  const bPadLo = baseMidi();
  const bPadHi = bPadLo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);

  const labelFn = function(pc, iv) {
    if (guitarLabelMode === 'degree') {
      return (AppState.mode === 'chord' && BuilderState.quality)
        ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet)
        : SCALE_DEGREE_NAMES[iv];
    }
    return pcName(pc);
  };

  padRenderFretboard(svg, {
    tuning: PAD_BASS_TUNING,
    stringNames: PAD_BASS_NAMES,
    rootPC: rootPC,
    pcsSet: pcsSet,
    bassPC: bassPC,
    overlayPCS: overlayPCS,
    overlayCharPCS: overlayCharPCS,
    renderState: bSt,
    positionState: BassPositionState,
    selectedFrets: bassSelectedFrets,
    labelFn: labelFn,
    chordMode: AppState.mode === 'chord',
    solo: showBass && !showGuitar && !showPiano,
    width: DIAGRAM_WIDTH,
    isMobile: _isMobile,
    isLandscape: _isLandscape,
    padRange: { lo: bPadLo, hi: bPadHi },
    onFretClick: toggleBassFret,
  });
}

function toggleBassFret(stringIdx, fret) {
  if (bassSelectedFrets[stringIdx] === fret) {
    bassSelectedFrets[stringIdx] = null;
  } else {
    bassSelectedFrets[stringIdx] = fret;
  }
  BassPositionState.enabled = false;
  BassPositionState._lastKey = null;
  updatePositionBar('bass');
  updateInstrumentInput();
}

// ========================================
// PIANO DISPLAY
// ========================================
function renderPianoDisplay(state) {
  const svg = document.getElementById('piano-display');
  var pcsSet = state ? state.activePCS : new Set();
  if (!pcsSet) pcsSet = new Set();
  var rootPC = state ? state.rootPC : -1;
  var bassPC = state ? state.bassPC : null;

  const stockPinned = StockState.enabled && StockState.lhMidi && StockState.rhMidi;
  const pianoBaseMidi = baseMidi();
  const pianoMidiBase = stockPinned ? 36 : (Math.floor(pianoBaseMidi / 12) - 2 + 2) * 12;

  // Stock mode: build keyColorFn override
  var stockMidiSet = null;
  var keyColorFn = null;
  if (stockPinned) {
    stockMidiSet = new Set(StockState.lhMidi.concat(StockState.rhMidi));
    keyColorFn = function(pc, isWhite, midi) {
      var baseOff = isWhite ? '#eee' : '#222';
      if (!stockMidiSet.has(midi)) return { fill: baseOff, textColor: null, opacity: 1, showLabel: false };
      var deg = StockState.degreeMap[midi];
      var fill, textColor;
      if (deg === '1')                                       { fill = PAD_INST_COLORS.root; textColor = '#fff'; }
      else if (deg === '3' || deg === 'b3')                  { fill = PAD_INST_COLORS.guide3; textColor = '#fff'; }
      else if (deg === '7' || deg === 'b7' || deg === 'bb7') { fill = PAD_INST_COLORS.guide7; textColor = '#fff'; }
      else if (deg === '5' || deg === 'b5' || deg === '#5')  { fill = isWhite ? PAD_INST_COLORS.pianoChordWhite : PAD_INST_COLORS.pianoChordBlack; textColor = isWhite ? '#333' : '#fff'; }
      else                                                    { fill = PAD_INST_COLORS.tension; textColor = '#fff'; }
      return { fill: fill, textColor: textColor, opacity: 1, showLabel: true };
    };
  }

  // Label function: maps global state
  var pianoIvPcsSet = rootPC >= 0 && AppState.mode === 'chord' && pcsSet.size > 0
    ? new Set([...pcsSet].map(function(p) { return ((p - rootPC) % 12 + 12) % 12; }))
    : null;
  const labelFn = function(pc, midi) {
    if (stockPinned && stockMidiSet && stockMidiSet.has(midi)) {
      return StockState.degreeMap[midi] || pcName(pc);
    }
    if (rootPC < 0) return pcName(pc);
    var iv = ((pc - rootPC) % 12 + 12) % 12;
    if (AppState.mode === 'chord' && BuilderState.quality) {
      return chordDegreeName(iv, BuilderState.quality.pcs, pianoIvPcsSet);
    }
    return SCALE_DEGREE_NAMES[iv];
  };

  padRenderPiano(svg, {
    rootPC: rootPC,
    pcsSet: pcsSet,
    bassPC: bassPC,
    renderState: state || {},
    overlayPCS: state ? state.overlayPCS : null,
    overlayCharPCS: state ? state.overlayCharPCS : null,
    chordMode: AppState.mode === 'chord',
    numOctaves: stockPinned ? 5 : 4,
    startMidi: pianoMidiBase,
    selectedNotes: pianoSelectedNotes,
    solo: showPiano && !showGuitar,
    width: DIAGRAM_WIDTH,
    isMobile: _isMobile,
    isLandscape: _isLandscape,
    labelFn: labelFn,
    keyColorFn: keyColorFn,
    onKeyClick: togglePianoNote,
  });
}

// ========================================
// CIRCLE OF FIFTHS
// ========================================
// Chromatic pitch class → Circle of Fifths index (each step = +7 semitones mod 12)
const CHROMATIC_TO_CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const CIRCLE_TO_CHROMATIC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

let _circleInstance = null;

function renderCircle() {
  if (!showCircle) return;
  const svgEl = document.getElementById('circle-of-fifths');
  if (!svgEl) return;

  // Determine circle selectedType from current scale
  var circleType = 'major';
  var circleScaleMode = 'natural';
  if (AppState.scaleIdx === 5) { circleType = 'minor'; circleScaleMode = 'natural'; }
  else if (AppState.scaleIdx === 7) { circleType = 'minor'; circleScaleMode = 'harmonic'; }
  else if (AppState.scaleIdx === 14) { circleType = 'minor'; circleScaleMode = 'melodic'; }

  var circleKeyIndex = CHROMATIC_TO_CIRCLE[AppState.key];
  if (circleType === 'minor') {
    circleKeyIndex = (circleKeyIndex - 3 + 12) % 12;
  }

  if (!_circleInstance) {
    _circleInstance = padRenderCircleOfFifths(svgEl, {
      selectedKeyIndex: circleKeyIndex,
      selectedType: circleType,
      scaleMode: circleScaleMode,
      size: Math.min(DIAGRAM_WIDTH, 500),
      showTitle: true,
      showDegrees: true,
      showScaleModeButtons: true,
      colors: {
        majorSegment: '#1e3a5f',
        minorSegment: '#2a4a6e',
        segmentStroke: '#333',
        centerFill: '#1a1a2e',
        majorText: '#e0e0e0',
        minorText: '#aab8c8',
        titleColor: '#4a9eff',
        subtitleColor: '#888',
        degreeText: '#fff',
        degreeStroke: '#555',
        buttonBg: '#16213e',
        buttonActiveText: '#fff',
        buttonNatural: '#4a9eff',
        buttonHarmonic: '#2c6fbb',
        buttonMelodic: '#3d88dd'
      },
      onKeySelect: function(circleIdx, type) {
        var chromatic;
        if (type === 'minor') {
          chromatic = CIRCLE_TO_CHROMATIC[(circleIdx + 3) % 12];
        } else {
          chromatic = CIRCLE_TO_CHROMATIC[circleIdx];
        }
        AppState.key = chromatic;
        document.querySelectorAll('.key-btn').forEach(function(btn) {
          btn.classList.toggle('active', parseInt(btn.dataset.key) === chromatic);
        });
        // Switch scale when major/minor type changes
        if (type === 'major' && AppState.scaleIdx !== 0) {
          AppState.scaleIdx = 0; // Major (Ionian)
          document.getElementById('scale-select').value = 0;
        } else if (type === 'minor') {
          if (AppState.scaleIdx !== 5 && AppState.scaleIdx !== 7 && AppState.scaleIdx !== 14) {
            AppState.scaleIdx = 5; // Natural Minor
            document.getElementById('scale-select').value = 5;
          }
        }
        render();
      },
      onScaleModeChange: function(mode) {
        if (mode === 'natural') { AppState.scaleIdx = 5; }
        else if (mode === 'harmonic') { AppState.scaleIdx = 7; }
        else if (mode === 'melodic') { AppState.scaleIdx = 14; }
        document.getElementById('scale-select').value = AppState.scaleIdx;
        render();
      }
    });
  } else {
    _circleInstance.update({
      selectedKeyIndex: circleKeyIndex,
      selectedType: circleType,
      scaleMode: circleScaleMode,
      size: Math.min(DIAGRAM_WIDTH, 500)
    });
  }
}

// ========================================
// INSTRUMENT INPUT
// ========================================
const GUITAR_OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // E4, B3, G3, D3, A2, E2
let guitarSelectedFrets = [null, null, null, null, null, null];
let pianoSelectedNotes = new Set(); // MIDI note numbers
let instrumentInputActive = false;
var _instrumentMidiSet = null; // When non-null, renderPads only colors these specific MIDI notes
var _voicingReflectMode = false; // Toggle: auto-positioned guitar voicing → pad MIDI filter
var _stockReflectMode = false;   // Toggle: Stock voicing → pad MIDI filter
var _instrumentPadSet = null;    // Set of (row * COLS + col) — deduped pad positions for voicing reflect
var _voicingAltMode = 0;         // 0 = most compact layout, 1+ = alternates sorted by column spread
var _voicingDualCount = 0;       // Number of MIDI notes with 2 pad positions
var _voicingLayoutCount = 1;     // Total distinct layouts available

// Compute deduped pad positions: 1 pad per MIDI note (WYSIWYG)
// Two layout strategies offered:
//   1. Guitar-like: 1 note per row (= 1 string), diagonal shape
//   2. Compact: minimize bounding box, easiest to play on pad
function _computeVoicingPadPositions(midiSet) {
  var bm = baseMidi();
  var byMidi = {};
  midiSet.forEach(function(midi) {
    byMidi[midi] = [];
    for (var row = 0; row < ROWS; row++) {
      var col = midi - bm - row * ROW_INTERVAL;
      if (col >= 0 && col < COLS) {
        byMidi[midi].push({row: row, col: col});
      }
    }
  });
  var fixed = [], duals = [];
  Object.keys(byMidi).forEach(function(k) {
    var poses = byMidi[k];
    if (poses.length === 1) fixed.push(poses[0]);
    else if (poses.length >= 2) duals.push(poses);
  });
  if (duals.length === 0) {
    var padSet = new Set();
    fixed.forEach(function(p) { padSet.add(p.row * COLS + p.col); });
    return { padSet: padSet, dualCount: 0, layoutCount: 1 };
  }
  // Enumerate all dual combinations (2^n, typically n≤3)
  var combos = 1 << duals.length;
  var allCombos = [];
  for (var mask = 0; mask < combos; mask++) {
    var chosen = [];
    for (var d = 0; d < duals.length; d++) {
      var idx = (mask >> d) & 1;
      chosen.push(duals[d][Math.min(idx, duals[d].length - 1)]);
    }
    var allPos = fixed.concat(chosen);
    // Row conflicts (guitar: 1 string = 1 note)
    var rowUsed = {};
    var rowConflicts = 0;
    var rows = [], cols = [];
    allPos.forEach(function(p) {
      rowUsed[p.row] = (rowUsed[p.row] || 0) + 1;
      if (rowUsed[p.row] === 2) rowConflicts++;
      rows.push(p.row); cols.push(p.col);
    });
    var colSpread = Math.max.apply(null, cols) - Math.min.apply(null, cols);
    var rowSpread = Math.max.apply(null, rows) - Math.min.apply(null, rows);
    allCombos.push({ chosen: chosen, rowConflicts: rowConflicts, colSpread: colSpread, rowSpread: rowSpread });
  }
  // Helper: make padSet key for dedup
  function comboKey(c) {
    return c.chosen.map(function(p) { return p.row * COLS + p.col; }).sort().join(',');
  }
  // 1. Guitar-like best: min row conflicts, then min col spread
  var guitarSorted = allCombos.slice().sort(function(a, b) {
    if (a.rowConflicts !== b.rowConflicts) return a.rowConflicts - b.rowConflicts;
    return a.colSpread - b.colSpread;
  });
  // 2. Compact best: min (rowSpread + colSpread) bounding box, then min row conflicts
  var compactSorted = allCombos.slice().sort(function(a, b) {
    var aBox = a.rowSpread + a.colSpread;
    var bBox = b.rowSpread + b.colSpread;
    if (aBox !== bBox) return aBox - bBox;
    return a.rowConflicts - b.rowConflicts;
  });
  // Build unique list: guitar-like first, then compact (if different)
  var unique = [];
  var seen = {};
  function addIfNew(combo) {
    var key = comboKey(combo);
    if (!seen[key]) { seen[key] = true; unique.push(combo); return true; }
    return false;
  }
  addIfNew(guitarSorted[0]);
  addIfNew(compactSorted[0]);
  // Add a few more guitar-like alternatives (within best row conflicts + small spread)
  var bestRC = guitarSorted[0].rowConflicts;
  var bestCS = guitarSorted[0].colSpread;
  for (var gi = 1; gi < guitarSorted.length && unique.length < 4; gi++) {
    var g = guitarSorted[gi];
    if (g.rowConflicts > bestRC) break;
    if (g.colSpread > bestCS + 1) break;
    addIfNew(g);
  }
  var pick = unique[Math.min(_voicingAltMode, unique.length - 1)];
  var padSet = new Set();
  fixed.forEach(function(p) { padSet.add(p.row * COLS + p.col); });
  pick.chosen.forEach(function(p) { padSet.add(p.row * COLS + p.col); });
  return { padSet: padSet, dualCount: duals.length, layoutCount: unique.length };
}

function toggleVoicingReflect() {
  var btn = document.getElementById('voicing-reflect-btn');
  if (_voicingReflectMode) {
    // Already ON: cycle alt layout if more layouts exist, otherwise turn off
    if (_voicingLayoutCount > 1 && _voicingAltMode < _voicingLayoutCount - 1) {
      _voicingAltMode++;
    } else {
      _voicingReflectMode = false;
      _voicingAltMode = 0;
      _instrumentMidiSet = null;
      _instrumentPadSet = null;
      _voicingDualCount = 0;
      _voicingLayoutCount = 1;
      if (btn) {
        btn.style.background = 'var(--surface)'; btn.style.color = 'var(--text)'; btn.innerHTML = '<span class="kbd-hint">V</span>' + t('pos.to_pad');
        btn.style.borderColor = 'var(--accent, #f80)';
        // Hide if position bar also hidden
        if (!GuitarPositionState.enabled) btn.style.display = 'none';
      }
      render();
      return;
    }
  } else {
    // Turn ON — disable Stock reflect if active
    if (_stockReflectMode) {
      _stockReflectMode = false;
      var srBtn = document.getElementById('stock-reflect-btn');
      if (srBtn) { srBtn.style.background = 'var(--surface)'; srBtn.style.color = 'var(--text)'; srBtn.style.borderColor = 'var(--accent, #f80)'; }
    }
    _voicingReflectMode = true;
    _voicingAltMode = 0;
    // Always center voicing on pad grid
    var notes = [];
    for (var s = 0; s < 6; s++) {
      if (guitarSelectedFrets[s] !== null) notes.push(GUITAR_OPEN_MIDI[s] + guitarSelectedFrets[s]);
    }
    if (notes.length >= 2) {
      notes.sort(function(a, b) { return a - b; });
      var mid = Math.round((notes[0] + notes[notes.length - 1]) / 2);
      var gridRange = (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
      var padMid = BASE_MIDI + gridRange / 2;
      var needed = Math.round((mid - padMid) / 12);
      setOctaveShift(Math.round((mid - padMid) / 12));
    }
    if (btn) { btn.style.display = 'inline-block'; btn.style.background = 'var(--accent, #f80)'; btn.style.color = '#000'; btn.style.borderColor = 'var(--accent, #f80)'; }
  }
  render();
}

function toggleStockReflect() {
  var btn = document.getElementById('stock-reflect-btn');
  if (_stockReflectMode) {
    // Cycle layout or turn off
    if (_voicingLayoutCount > 1 && _voicingAltMode < _voicingLayoutCount - 1) {
      _voicingAltMode++;
    } else {
      _stockReflectMode = false;
      _voicingAltMode = 0;
      _instrumentMidiSet = null;
      _instrumentPadSet = null;
      _voicingLayoutCount = 1;
      if (btn) { btn.style.background = 'var(--surface)'; btn.style.color = 'var(--text)'; btn.style.borderColor = 'var(--accent, #f80)'; }
      render();
      return;
    }
  } else {
    // Turn on — disable guitar reflect if active
    if (_voicingReflectMode) {
      _voicingReflectMode = false;
      var vrBtn = document.getElementById('voicing-reflect-btn');
      if (vrBtn) { vrBtn.style.background = 'var(--surface)'; vrBtn.style.color = 'var(--text)'; vrBtn.style.borderColor = 'var(--accent, #f80)'; }
    }
    _stockReflectMode = true;
    _voicingAltMode = 0;
    // Center pad on Stock voicing
    var notes = StockState.lhMidi.concat(StockState.rhMidi);
    if (notes.length >= 2) {
      notes.sort(function(a, b) { return a - b; });
      var mid = Math.round((notes[0] + notes[notes.length - 1]) / 2);
      var gridRange = (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
      var padMid = BASE_MIDI + gridRange / 2;
      setOctaveShift(Math.round((mid - padMid) / 12));
    }
    if (btn) { btn.style.background = 'var(--accent, #f80)'; btn.style.color = '#000'; btn.style.borderColor = 'var(--accent, #f80)'; }
  }
  render();
}

let padExtNotes = new Set(); // Chord mode: MIDI notes toggled on 64-pad for PS extension
let lastDetectedNotes = []; // Last detection input notes (for click-to-transfer, V2.10)
let lastDetectedCandidates = []; // Last detection candidates (for click-to-transfer, V2.10)
let _guitarSyncSource = null; // null | 'manual' | 'pad' — tracks who set guitarSelectedFrets

// Map MIDI notes to guitar fret positions (greedy: low notes → low strings, prefer low frets)
function syncGuitarFromNotes(midiNotes) {
  if (!showGuitar || !midiNotes || midiNotes.length === 0) return;
  if (_guitarSyncSource === 'manual' || _guitarSyncSource === 'position') return;
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
      const m = PAD_BASS_TUNING[s] + bassSelectedFrets[s];
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
  GuitarPositionState.enabled = false;
  GuitarPositionState._lastKey = null;
  // Clear auto-positioned bass to prevent phantom notes in getAllInputMidiNotes()
  if (BassPositionState._lastKey !== null) {
    bassSelectedFrets = [null, null, null, null];
    BassPositionState.enabled = false;
    BassPositionState._lastKey = null;
    updatePositionBar('bass');
  }
  updatePositionBar('guitar');
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
    _instrumentMidiSet = null; // Clear MIDI filter — show full PCS again
    document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
    if (AppState.mode === 'input') {
      updatePlainDisplay(); // Plain mode: unified display handles #midi-detect
    } else {
      const detectEl = document.getElementById('midi-detect');
      detectEl.innerHTML = '';
    }
    // detectEl always visible (no layout shift)
    render(); // Re-render pads without MIDI filter
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

  // === Guitar/Bass/Piano → Builder direct update (Chord mode) ===
  if (AppState.mode === 'chord' && instrNotes.length >= 2) {
    const directCandidates = detectChord(instrNotes);
    if (directCandidates.length > 0) {
      const detectEl = document.getElementById('midi-detect');
      const noteNames = instrNotes.map(n => NOTE_NAMES_SHARP[n % 12]);
      lastDetectedNotes = instrNotes;
      lastDetectedCandidates = directCandidates;
      const best = directCandidates[0];
      let html = '<span class="detect-candidate-best" onclick="transferDetectedCandidate(0,this)">' + best.name + '</span>';
      if (directCandidates.length > 1) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">';
        directCandidates.slice(1).forEach((c, i) => {
          html += '<span class="detect-candidate" onclick="transferDetectedCandidate(' + (i + 1) + ',this)">' + c.name + '</span>';
        });
        html += '</div>';
      }
      html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">' + t('input.notes_label') + noteNames.join(' ') + '</div>';
      detectEl.innerHTML = html;

      padExtNotes.clear();
      applyNotesToBuilder(instrNotes, best.rootPC);

      // Restrict pad display to only these specific MIDI notes
      _instrumentMidiSet = new Set(instrNotes);

      // Auto-adjust octave so instrument notes are visible on the pad grid
      const loNote = instrNotes[0]; // already sorted
      const hiNote = instrNotes[instrNotes.length - 1];
      const bm = baseMidi();
      const padHi = bm + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
      if (loNote < bm || hiNote > padHi) {
        // Center the instrument notes on the pad grid
        const mid = Math.round((loNote + hiNote) / 2);
        const padMid = BASE_MIDI + (ROWS - 1) * ROW_INTERVAL / 2 + (COLS - 1) / 2;
        setOctaveShift(Math.round((mid - padMid) / 12));
      }

      render();
      renderParentScales();
      return;
    }
  }
  // === End guitar/bass/piano → builder ===
  _instrumentMidiSet = null; // Fallthrough: no MIDI filter (1 note or detection failed)

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
  // Hide chord detection during TASTY/Stock (voicing info is in the TASTY/Stock bar)
  if (TastyState.enabled || StockState.enabled) {
    detectEl.innerHTML = '';
    return;
  }
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
  // Hide instrument highlights when a voicing box is selected or TASTY is active
  if (VoicingState.selectedBoxIdx !== null) return;
  if (TastyState.enabled && TastyState.midiNotes.length > 0) return;
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
  _instrumentMidiSet = null;
  _instrumentPadSet = null;
  _voicingReflectMode = false;
  _stockReflectMode = false;
  _voicingAltMode = 0;
  _voicingDualCount = 0;
  var vrBtn = document.getElementById('voicing-reflect-btn');
  if (vrBtn) { vrBtn.style.background = 'var(--surface)'; vrBtn.style.color = 'var(--text)'; vrBtn.innerHTML = '<span class="kbd-hint">V</span>' + t('pos.to_pad'); vrBtn.style.display = 'none'; vrBtn.style.borderColor = 'var(--accent, #f80)'; }
  var srBtn = document.getElementById('stock-reflect-btn');
  if (srBtn) { srBtn.style.background = 'var(--surface)'; srBtn.style.color = 'var(--text)'; srBtn.style.display = 'none'; srBtn.style.borderColor = 'var(--accent, #f80)'; }
  GuitarPositionState.enabled = false;
  GuitarPositionState._lastKey = null;
  BassPositionState.enabled = false;
  BassPositionState._lastKey = null;
  const ctrlEl = document.getElementById('instrument-controls');
  if (ctrlEl) ctrlEl.style.display = 'none';
  document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
  const detectEl = document.getElementById('midi-detect');
  detectEl.innerHTML = '';
  // Re-render to restore builder chord display on pads + diagrams
  // Temporarily keep 'manual' to prevent updateGuitarPositions() from
  // re-auto-positioning frets during this render() call
  _guitarSyncSource = 'manual';
  render();
  _guitarSyncSource = null;
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
let lastRenderState = null; // full state for instrument diagram color classification

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

function isSecondaryDominant(qualityIntervals, results) {
  var isDom7 = qualityIntervals.has(4) && qualityIntervals.has(10) && !qualityIntervals.has(11);
  if (!isDom7) return false;
  return !results.some(function(r) {
    return r.system === '○' && r.distance === 0 && r.degreeNum === 5 && !r.omit5Match;
  });
}

function findBestAutoSelect(results, isSecDom) {
  if (AppState.psSortMode === 'practical') {
    if (isSecDom) {
      var lydb7 = results.find(function(r) { return r.scaleIdx === 17 && r.exactMatch && !r.omit5Match; });
      if (lydb7) return lydb7;
    }
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

  // Secondary dominant detection: boost Lydian b7 for non-diatonic dom7 chords
  var _isSecDom = isSecondaryDominant(qualityIntervals, _psResults);
  _psResults.forEach(function(r) {
    r.secDomBoost = (_isSecDom && r.scaleIdx === 17 && !r.omit5Match) ? 1 : 0;
  });

  // Re-sort: exact matches first, then by mode-specific criteria
  const SYS = { '\u25CB': 0, 'NM': 1, '\u25A0': 2, '\u25C6': 3 };
  if (AppState.psSortMode === 'practical') {
    // Practical: exactMatch → omit5 → secDomBoost → distance → system → avoidCount → degreeNum
    _psResults.sort((a, b) =>
      (b.exactMatch - a.exactMatch) ||
      (a.omit5Match - b.omit5Match) ||
      (b.secDomBoost - a.secDomBoost) ||
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
    const best = findBestAutoSelect(_psResults, _isSecDom);
    _selectedPS = { parentKey: best.parentKey, scaleIdx: best.scaleIdx };
  }

  // Always apply tension filter
  applyParentScaleFilter(_selectedPS ? _selectedPS.scaleIdx : null);
  _syncOverlayHighlight();

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

  let html = '<div class="ps-header">' +
    t('parent.header', { n: _psResults.length });
  html += ' <button class="ps-sort-toggle' + (AppState.psSortMode === 'practical' ? ' active' : '') +
    '" onclick="if(AppState.psSortMode!==\'practical\')togglePsSortMode()">' + t('parent.sortPractical') + '</button>';
  html += '<button class="ps-sort-toggle' + (AppState.psSortMode === 'diatonic' ? ' active' : '') +
    '" onclick="if(AppState.psSortMode!==\'diatonic\')togglePsSortMode()">' + t('parent.sortDiatonic') + '</button>';
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
      '<span class="ps-cat ' + (r.system === '○' ? 'ps-cat-dia' : r.system === '■' ? 'ps-cat-hm' : r.system === '◆' ? 'ps-cat-mm' : '') + '">' + r.system + '</span>' +
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
  _syncOverlayHighlight();
  render();
}

// Sync .overlay-highlight class: bright overlay when voicing box selected + Available Scale active
function _syncOverlayHighlight() {
  var pa = document.querySelector('.pad-area');
  if (pa) pa.classList.toggle('overlay-highlight',
    VoicingState.selectedBoxIdx !== null && AppState.showParentScales);
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

function cycleInversion(dir) {
  var max = getBuilderPCS() ? getBuilderPCS().length - 1 : 3;
  var inv = VoicingState.inversion + dir;
  if (inv < 0) inv = max;
  if (inv > max) inv = 0;
  setInversion(inv);
}

function syncPlayMode() {
  var modes = ['scale', 'chord', 'input'];
  modes.forEach(function(m) {
    var btn = document.getElementById('play-mode-' + m);
    if (btn) btn.classList.toggle('active', AppState.mode === m);
  });
}

function syncPlayChordName() {
  var el = document.getElementById('play-chord-name');
  if (!el) return;
  if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
    var name = getBuilderChordName();
    var mods = [];
    if (VoicingState.inversion > 0) {
      var invNames = ['', '1st Inv', '2nd Inv', '3rd Inv'];
      mods.push(invNames[VoicingState.inversion]);
    }
    if (VoicingState.drop) mods.push(VoicingState.drop === 'drop2' ? 'Drop 2' : 'Drop 3');
    if (mods.length > 0) name += ' [' + mods.join(', ') + ']';
    el.textContent = name;
  } else {
    el.textContent = '';
  }
}

function toggleFullscreen() {
  var el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

