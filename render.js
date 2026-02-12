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

  if (AppState.mode === 'plain') {
    const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
    activePCS = new Set(notes.map(n => n % 12));
    if (notes.length >= 2) {
      const candidates = detectChord(notes);
      if (candidates.length > 0) {
        rootPC = candidates[0].rootPC;
        activeLabel = candidates[0].name;
      } else {
        rootPC = notes[0] % 12;
        activeLabel = notes.map(n => NOTE_NAMES_SHARP[n % 12]).join(' ');
      }
    } else if (notes.length === 1) {
      rootPC = notes[0] % 12;
      activeLabel = NOTE_NAMES_SHARP[rootPC];
    } else {
      rootPC = 0;
      activePCS = new Set();
      activeLabel = '';
    }
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
      activeLabel = BuilderState.root !== null ? pcName(BuilderState.root) + '...' : 'Select root';
    }
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

  return { activePCS, activeIvPCS, activeLabel, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS };
}

function renderPads(svg, state) {
  const { activePCS, activeIvPCS, rootPC, bassPC, charPCS, omittedPCS, guide3PCS, guide7PCS, tensionPCS, qualityPCS, avoidPCS } = state;
  // Build MIDI set for selected voicing box (for dimming non-selected pads)
  const selBox = VoicingState.selectedBoxIdx !== null ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx] : null;
  const selMidi = selBox ? new Set(selBox.midiNotes) : null;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = midiNote(row, col);
      const pc = pitchClass(midi);
      const x = MARGIN + col * (PAD_SIZE + PAD_GAP);
      const y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
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

      // Plain mode: highlight selected notes only
      const isPlainActive = AppState.mode === 'plain' && PlainState.activeNotes.has(midi);

      let fill = 'var(--pad-off)', textColor = 'var(--text-muted)';
      if (AppState.mode === 'plain') {
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

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('class', 'pad');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', PAD_SIZE); rect.setAttribute('height', PAD_SIZE);
      rect.setAttribute('rx', 6); rect.setAttribute('fill', fill);
      // Hold pad: noteOn on press, noteOff on global release (no mouseleave)
      // Plain mode: click toggles note on/off
      (function(m, r) {
        r.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (AppState.mode === 'plain') { togglePlainNote(m); }
          else { _heldMidi = m; noteOn(m); }
        });
        r.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (AppState.mode === 'plain') { togglePlainNote(m); }
          else { _heldTouchMidi = m; noteOn(m); }
        });
      })(midi, rect);
      if (isOmitted) {
        rect.setAttribute('stroke', 'rgba(255,255,255,0.2)');
        rect.setAttribute('stroke-width', 1); rect.setAttribute('stroke-dasharray', '4 2');
      } else {
        rect.setAttribute('stroke', isActive || isBass || isChar || isGuide ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)');
        rect.setAttribute('stroke-width', isActive || isBass || isChar || isGuide ? 1.5 : 0.5);
      }
      // Dim non-selected pads when a voicing box is selected
      const isDimmed = selMidi && !selMidi.has(midi) && fill !== 'var(--pad-off)';
      if (isDimmed) rect.setAttribute('opacity', '0.3');
      svg.appendChild(rect);

      const showDegree = isActive || isRoot || isBass || isOmitted || isChar || isGuide || isAvoid;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'pad-label');
      text.setAttribute('x', x + PAD_SIZE / 2);
      text.setAttribute('y', showDegree ? y + 15 : y + PAD_SIZE / 2 - 4);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', textColor);
      text.setAttribute('font-size', showDegree ? '10px' : '9px');
      text.setAttribute('font-weight', showDegree ? '600' : '400');
      text.textContent = pcName(pc);
      if (isDimmed) text.setAttribute('opacity', '0.3');
      svg.appendChild(text);

      if (showDegree) {
        let degName = AppState.mode === 'scale'
          ? SCALE_DEGREE_NAMES[interval]
          : chordDegreeName(interval, qualityPCS, activeIvPCS);
        if ((isTension || isAvoid) && AppState.mode === 'chord') {
          degName = '(' + degName + ')';
        }
        const degText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        degText.setAttribute('class', 'pad-label');
        degText.setAttribute('x', x + PAD_SIZE / 2);
        degText.setAttribute('y', y + 34);
        degText.setAttribute('text-anchor', 'middle'); degText.setAttribute('dominant-baseline', 'middle');
        degText.setAttribute('fill', textColor);
        degText.setAttribute('font-size', '13px'); degText.setAttribute('font-weight', '700');
        if (isOmitted) degText.setAttribute('text-decoration', 'line-through');
        degText.textContent = degName;
        if (isDimmed) degText.setAttribute('opacity', '0.3');
        svg.appendChild(degText);
      }

      const octText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      octText.setAttribute('class', 'pad-label');
      octText.setAttribute('x', x + PAD_SIZE / 2);
      octText.setAttribute('y', showDegree ? y + 51 : y + PAD_SIZE / 2 + 12);
      octText.setAttribute('text-anchor', 'middle'); octText.setAttribute('dominant-baseline', 'middle');
      octText.setAttribute('fill', textColor);
      octText.setAttribute('font-size', '8px'); octText.setAttribute('opacity', isDimmed ? '0.15' : '0.6');
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
    infoEl.textContent = activeLabel + ' (' + scale.pcs.length + '音) : ' + notes.join(' - ');
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
      let txt = activeLabel + ' (' + pcs.length + '音) : ' + notes.join(' - ');
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
  const { charPCS, guide3PCS, guide7PCS, omittedPCS, tensionPCS, avoidPCS } = state;
  const swatch = document.getElementById('legend-swatch');
  const ltxt = document.getElementById('legend-text');
  const legendChar = document.getElementById('legend-char');
  const legendGuide3 = document.getElementById('legend-guide3');
  const legendGuide7 = document.getElementById('legend-guide7');
  const legendTension = document.getElementById('legend-tension');
  const legendAvoid = document.getElementById('legend-avoid');
  const legendOmit = document.getElementById('legend-omit');
  if (AppState.mode === 'scale') {
    swatch.style.background = 'var(--pad-scale)'; ltxt.textContent = 'Scale Note';
    legendChar.style.display = charPCS.size > 0 ? '' : 'none';
    legendGuide3.style.display = 'none'; legendGuide7.style.display = 'none';
    legendTension.style.display = 'none';
    legendAvoid.style.display = 'none';
    legendOmit.style.display = 'none';
  } else {
    swatch.style.background = 'var(--pad-chord)'; ltxt.textContent = 'Chord Tone';
    legendChar.style.display = 'none';
    legendGuide3.style.display = guide3PCS.size > 0 ? '' : 'none';
    legendGuide7.style.display = guide7PCS.size > 0 ? '' : 'none';
    legendTension.style.display = tensionPCS.size > 0 ? '' : 'none';
    legendAvoid.style.display = avoidPCS.size > 0 ? '' : 'none';
    legendOmit.style.display = omittedPCS.size > 0 ? '' : 'none';
  }
}

function render() {
  const svg = document.getElementById('pad-grid');
  const totalW = COLS * (PAD_SIZE + PAD_GAP) - PAD_GAP + MARGIN * 2;
  const totalH = ROWS * (PAD_SIZE + PAD_GAP) - PAD_GAP + MARGIN * 2;
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', totalH);
  svg.innerHTML = '';

  const state = computeRenderState();
  renderPads(svg, state);
  if (AppState.mode !== 'plain') {
    renderVoicingBoxes(svg, state);
  }
  renderInfoText(state);
  renderLegend(state);

  // Staff notation
  if (AppState.mode === 'plain') {
    // Plain mode: show selected notes on staff
    const plainNotes = [...PlainState.activeNotes].sort((a, b) => a - b);
    renderStaff('plain', state.rootPC, state.activePCS, state.omittedPCS, null, plainNotes.length > 0 ? plainNotes : null, null);
  } else {
    const boxMidi = (VoicingState.selectedBoxIdx !== null && VoicingState.lastBoxes[VoicingState.selectedBoxIdx])
      ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx].midiNotes : null;
    renderStaff(AppState.mode, state.rootPC, state.activePCS, state.omittedPCS, state.qualityPCS, boxMidi, state.bassPC, state.activeIvPCS);
  }

  // Instrument diagrams (guitar + bass + piano)
  lastRenderRootPC = state.rootPC;
  lastRenderActivePCS = new Set(state.activePCS);
  renderGuitarDiagram(state.rootPC, state.activePCS, state.bassPC);
  renderBassDiagram(state.rootPC, state.activePCS, state.bassPC);
  renderPianoDisplay(state.rootPC, state.activePCS, state.bassPC);

  // Diatonic chord bar
  renderDiatonicBar();

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
  staffSvg.setAttribute('width', W);
  staffSvg.setAttribute('height', totalH);
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
const DIAGRAM_WIDTH = 564;              // shared width for pad, guitar & piano (matches pad grid)
let showGuitar = false;
let showPiano = false;
let showStaff = true;
let showSound = true;
let showBass = false;
let guitarLabelMode = 'name'; // 'name' or 'degree'
let soundExpanded = false;
let memoryViewMode = 'memory'; // 'memory' or 'perform'

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

function toggleSoundExpand() {
  soundExpanded = !soundExpanded;
  document.getElementById('sound-details').style.display = soundExpanded ? '' : 'none';
  document.getElementById('sound-expand-btn').innerHTML = soundExpanded ? '&#x25B2;' : '&#x25BC;';
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
}

function toggleGuitarLabelMode() {
  guitarLabelMode = guitarLabelMode === 'name' ? 'degree' : 'name';
  document.getElementById('guitar-label-btn').textContent = guitarLabelMode === 'name' ? '音名' : '度数';
  render();
}

function renderGuitarDiagram(rootPC, pcsSet, bassPC) {
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
  svg.setAttribute('width', W); svg.setAttribute('height', H);

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

  // Note dots (scale/chord tones) with labels
  for (let s = 0; s < 6; s++) {
    const openPC = strings[s] % 12;
    const sy = topM + s * strH;
    for (let f = 0; f <= numFrets; f++) {
      const pc = (openPC + f) % 12;
      const isBass = bassPC !== undefined && bassPC !== null && pc === bassPC;
      if (!pcsSet.has(pc) && !isBass) continue;
      const isRoot = pc === rootPC;
      const fx = f === 0 ? nutX - 2 : nutX + (f - 0.5) * fretW;
      const r = f === 0 ? (solo ? 7 : 5) : (solo ? 10 : 7);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', fx); dot.setAttribute('cy', sy);
      dot.setAttribute('r', r);
      dot.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBass ? INST_BASS_COLOR : INST_ACTIVE_COLOR));
      dot.setAttribute('opacity', '0.9');
      svg.appendChild(dot);
      // Label inside dot
      if (f > 0) {
        const iv = ((pc - rootPC) + 12) % 12;
        const labelText = guitarLabelMode === 'degree' ? (AppState.mode === 'chord' && BuilderState.quality ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet) : SCALE_DEGREE_NAMES[iv]) : pcName(pc);
        const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lt.setAttribute('x', fx); lt.setAttribute('y', sy + (solo ? 4 : 3));
        lt.setAttribute('text-anchor', 'middle');
        const fs = solo ? (labelText.length > 2 ? '7px' : '9px') : (labelText.length > 2 ? '5px' : '6px');
        lt.setAttribute('font-size', fs);
        lt.setAttribute('fill', isRoot ? INST_ROOT_TEXT : (isBass ? INST_BASS_TEXT : INST_ACTIVE_TEXT));
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

function renderBassDiagram(rootPC, pcsSet, bassPC) {
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
  svg.setAttribute('width', W); svg.setAttribute('height', H);
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

  // Note dots
  for (let s = 0; s < 4; s++) {
    const openPC = strings[s] % 12;
    const sy = topM + s * strH;
    for (let f = 0; f <= numFrets; f++) {
      const pc = (openPC + f) % 12;
      const isBassNote = bassPC !== undefined && bassPC !== null && pc === bassPC;
      if (!pcsSet.has(pc) && !isBassNote) continue;
      const isRoot = pc === rootPC;
      const fx = f === 0 ? nutX - 2 : nutX + (f - 0.5) * fretW;
      const r = f === 0 ? (solo ? 7 : 5) : (solo ? 10 : 7);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', fx); dot.setAttribute('cy', sy);
      dot.setAttribute('r', r);
      dot.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBassNote ? INST_BASS_COLOR : INST_ACTIVE_COLOR));
      dot.setAttribute('opacity', '0.9');
      svg.appendChild(dot);
      if (f > 0) {
        const iv = ((pc - rootPC) + 12) % 12;
        const labelText = guitarLabelMode === 'degree' ? (AppState.mode === 'chord' && BuilderState.quality ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet) : SCALE_DEGREE_NAMES[iv]) : pcName(pc);
        const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lt.setAttribute('x', fx); lt.setAttribute('y', sy + (solo ? 4 : 3));
        lt.setAttribute('text-anchor', 'middle');
        const fs = solo ? (labelText.length > 2 ? '7px' : '9px') : (labelText.length > 2 ? '5px' : '6px');
        lt.setAttribute('font-size', fs);
        lt.setAttribute('fill', isRoot ? INST_ROOT_TEXT : (isBassNote ? INST_BASS_TEXT : INST_ACTIVE_TEXT));
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
function renderPianoDisplay(rootPC, pcsSet, bassPC) {
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
  svg.setAttribute('width', W); svg.setAttribute('height', H);

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
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', wx); rect.setAttribute('y', startY);
      rect.setAttribute('width', whiteW - 1); rect.setAttribute('height', whiteH);
      rect.setAttribute('rx', 1);
      rect.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBass ? INST_BASS_COLOR : (isActive ? '#999' : '#eee')));
      rect.setAttribute('stroke', '#bbb'); rect.setAttribute('stroke-width', 0.5);
      svg.appendChild(rect);
      if (isActive || isRoot || isBass) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', wx + (whiteW - 1) / 2); label.setAttribute('y', startY + whiteH - 6);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10px');
        label.setAttribute('fill', isRoot ? '#fff' : (isBass ? '#000' : '#333'));
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
      const whiteIdx = blackPositions[i] + oct * 7;
      const bx = startX + (whiteIdx + 1) * whiteW - blackW / 2;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', bx); rect.setAttribute('y', startY);
      rect.setAttribute('width', blackW); rect.setAttribute('height', blackH);
      rect.setAttribute('rx', 1);
      rect.setAttribute('fill', isRoot ? INST_ROOT_COLOR : (isBass ? INST_BASS_COLOR : (isActive ? '#555' : '#222')));
      rect.setAttribute('stroke', '#000'); rect.setAttribute('stroke-width', 0.5);
      svg.appendChild(rect);
      if (isActive || isRoot || isBass) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', bx + blackW / 2); label.setAttribute('y', startY + blackH - 3);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '8px'); label.setAttribute('fill', isBass ? '#000' : '#ddd');
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
  const notes = getAllInputMidiNotes();
  instrumentInputActive = notes.length > 0;
  if (notes.length === 0) {
    document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
    const detectEl = document.getElementById('midi-detect');
    detectEl.innerHTML = '';
    // detectEl always visible (no layout shift)
    renderGuitarDiagram(lastRenderRootPC, lastRenderActivePCS);
    renderBassDiagram(lastRenderRootPC, lastRenderActivePCS);
    renderPianoDisplay(lastRenderRootPC, lastRenderActivePCS);
    return;
  }
  const detectEl = document.getElementById('midi-detect');
  // detectEl always visible (no layout shift)
  const noteNames = notes.map(n => NOTE_NAMES_SHARP[n % 12]);
  const candidates = detectChord(notes);
  const inputPCS = new Set(notes.map(n => n % 12));
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
    html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">Notes: ' + noteNames.join(' ') + '</div>';
    detectEl.innerHTML = html;
    renderGuitarDiagram(best.rootPC, inputPCS);
    renderBassDiagram(best.rootPC, inputPCS);
    renderPianoDisplay(best.rootPC, inputPCS);
  } else {
    detectEl.textContent = noteNames.join(' ');
    renderGuitarDiagram(null, inputPCS);
    renderBassDiagram(null, inputPCS);
    renderPianoDisplay(null, inputPCS);
  }
  highlightInstrumentPads(notes);
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
  instrumentInputActive = false;
  document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
  const detectEl = document.getElementById('midi-detect');
  detectEl.innerHTML = '';
  // detectEl always visible (no layout shift)
  renderGuitarDiagram(lastRenderRootPC, lastRenderActivePCS);
  renderBassDiagram(lastRenderRootPC, lastRenderActivePCS);
  renderPianoDisplay(lastRenderRootPC, lastRenderActivePCS);
}

function playInstrumentInput() {
  const notes = getAllInputMidiNotes();
  if (notes.length > 0) {
    playMidiNotes(notes, 1.0);
  }
}

// State for restoring diagrams when MIDI notes are released
let lastRenderRootPC = 0;
let lastRenderActivePCS = new Set();

