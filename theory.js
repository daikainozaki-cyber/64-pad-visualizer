// ========================================
// PAD GRID FUNCTIONS
// ========================================
function baseMidi() { return BASE_MIDI + AppState.octaveShift * 12 + AppState.semitoneShift; }

function shiftOctave(delta) {
  const next = AppState.octaveShift + delta;
  if (next < -1 || next > 3) return;
  AppState.octaveShift = next;
  resetVoicingSelection();
  updateOctaveLabel();
  render();
  playCurrentChord();
  saveAppSettings();
}

function shiftSemitone(delta) {
  var next = AppState.semitoneShift + delta;
  if (next < -11 || next > 11) return;
  AppState.semitoneShift = next;
  updateOctaveLabel();
  render();
  saveAppSettings();
}

function updateOctaveLabel() {
  const lo = baseMidi();
  const hi = lo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  document.getElementById('oct-label').textContent = noteName(lo) + ' — ' + noteName(hi);
  document.getElementById('oct-down').disabled = (AppState.octaveShift <= -1);
  document.getElementById('oct-up').disabled = (AppState.octaveShift >= 3);
  // 32-pad labels
  var octLabel32 = document.getElementById('oct-label-32');
  if (octLabel32) {
    var lo32 = baseMidi();
    var hi32 = lo32 + (GRID_32.ROWS - 1) * GRID_32.ROW_INTERVAL + (GRID_32.COLS - 1);
    octLabel32.textContent = noteName(lo32) + '—' + noteName(hi32);
  }
  var semiLabel = document.getElementById('semi-label');
  if (semiLabel) {
    var s = AppState.semitoneShift;
    semiLabel.textContent = s === 0 ? '±0' : (s > 0 ? '+' + s : '' + s);
  }
  var semiDown = document.getElementById('semi-down');
  var semiUp = document.getElementById('semi-up');
  if (semiDown) semiDown.disabled = (AppState.semitoneShift <= -11);
  if (semiUp) semiUp.disabled = (AppState.semitoneShift >= 11);
}

function toggleOmit5() { VoicingState.omit5 = !VoicingState.omit5; VoicingState.shell = null; updateVoicingButtons(); updateChordDisplay(); render(); playCurrentChord(); }
function toggleRootless() { VoicingState.rootless = !VoicingState.rootless; VoicingState.shell = null; updateVoicingButtons(); updateChordDisplay(); render(); playCurrentChord(); }
function toggleOmit3() { VoicingState.omit3 = !VoicingState.omit3; VoicingState.shell = null; updateVoicingButtons(); updateChordDisplay(); render(); playCurrentChord(); }
function setShell(mode) {
  VoicingState.shell = mode;
  if (mode) {
    VoicingState.omit5 = true; VoicingState.rootless = false; VoicingState.omit3 = false;
    VoicingState.inversion = 0; VoicingState.drop = null;
  } else {
    VoicingState.shellExtension = 0;
  }
  resetVoicingSelection();
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function setShellExtension(n) {
  VoicingState.shellExtension = (VoicingState.shellExtension === n) ? 0 : n;
  if (VoicingState.shellExtension > 0 && !VoicingState.shell) VoicingState.shell = '137'; // auto-enable shell
  resetVoicingSelection();
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function setInversion(inv) {
  VoicingState.inversion = inv;
  VoicingState.shell = null;
  if (VoicingState.selectedBoxIdx !== null) VoicingState._preservePosition = { type: 'voicing' };
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function setDrop(drop) {
  VoicingState.drop = VoicingState.drop === drop ? null : drop;
  VoicingState.shell = null;
  if (VoicingState.selectedBoxIdx !== null) VoicingState._preservePosition = { type: 'voicing' };
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function updateVoicingButtons() {
  document.getElementById('btn-omit5').classList.toggle('active', VoicingState.omit5);
  document.getElementById('btn-rootless').classList.toggle('active', VoicingState.rootless);
  document.getElementById('btn-omit3').classList.toggle('active', VoicingState.omit3);
  document.getElementById('btn-shell137').classList.toggle('active', VoicingState.shell === '137');
  document.getElementById('btn-shell173').classList.toggle('active', VoicingState.shell === '173');
  const ext1 = document.getElementById('btn-shell-ext1');
  const ext2 = document.getElementById('btn-shell-ext2');
  if (ext1) ext1.classList.toggle('active', VoicingState.shellExtension === 1);
  if (ext2) ext2.classList.toggle('active', VoicingState.shellExtension === 2);
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById('btn-inv' + i);
    if (el) el.classList.toggle('active', VoicingState.inversion === i);
  }
  const d2 = document.getElementById('btn-drop2');
  const d3 = document.getElementById('btn-drop3');
  if (d2) d2.classList.toggle('active', VoicingState.drop === 'drop2');
  if (d3) d3.classList.toggle('active', VoicingState.drop === 'drop3');
}

function playVoicingBoxAudio(idx) {
  if (!VoicingState.lastBoxes[idx]) return;
  let midiNotes = [...VoicingState.lastBoxes[idx].midiNotes];

  // Shell voicing: add chord tones not in the voicing box (tensions etc.)
  if (VoicingState.shell && AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
    const fullPCS = getBuilderPCS();
    if (fullPCS) {
      const rootPC = BuilderState.root;
      const boxRoot = midiNotes.find(m => m % 12 === rootPC);
      if (boxRoot !== undefined) {
        const existingPCs = new Set(midiNotes.map(m => m % 12));
        existingPCs.add((rootPC + 7) % 12);
        for (const iv of fullPCS) {
          const notePC = (rootPC + iv) % 12;
          if (!existingPCs.has(notePC)) {
            midiNotes.push(boxRoot + iv);
            existingPCs.add(notePC);
          }
        }
      }
    }
  }

  // Bass note for slash chords (guard against double bass from voicing boxes)
  if (BuilderState.bass !== null) {
    const hasBass = midiNotes.some(m => m % 12 === BuilderState.bass);
    if (!hasBass) {
      const lowest = Math.min(...midiNotes);
      let bassMidi = 36 + BuilderState.bass + AppState.octaveShift * 12;
      while (bassMidi >= lowest) bassMidi -= 12;
      midiNotes.unshift(bassMidi);
    }
  }

  midiNotes.sort((a, b) => a - b);
  playMidiNotes(midiNotes);
}

function selectVoicingBox(idx) {
  const wasSelected = VoicingState.selectedBoxIdx === idx;
  const box = VoicingState.lastBoxes[idx];
  const hasCycle = box && box.alternatives && box.alternatives.length > 1;

  if (!wasSelected) {
    // Case 1: Not selected -> select it
    VoicingState.selectedBoxIdx = idx;
    // TASTY mode: update voicing to this box's position
    if (TastyState.enabled && box) {
      TastyState.midiNotes = box.midiNotes;
      TastyState.topNote = Math.max.apply(null, box.midiNotes);
      TastyState.degreeMap = buildTastyDegreeMap(box.midiNotes,
        TastyState.currentMatches[TastyState.currentIndex].v);
      updateTastyUI();
    }
    render();
    playVoicingBoxAudio(idx);
  } else if (hasCycle) {
    // Case 2: Already selected + has alternatives -> cycle to next
    const nextAlt = (box.currentAlt + 1) % box.alternatives.length;
    VoicingState.cycleIndices[idx] = nextAlt;
    // Recompute box midiNotes for the new alternative
    var bm = baseMidi();
    box.currentAlt = nextAlt;
    box.midiNotes = box.alternatives[nextAlt].positions
      .map(function(p) { return bm + p.row * ROW_INTERVAL + p.col; })
      .sort(function(a, b) { return a - b; });
    // TASTY mode: update to cycled alternative
    if (TastyState.enabled) {
      TastyState.midiNotes = box.midiNotes;
      TastyState.topNote = Math.max.apply(null, box.midiNotes);
      TastyState.degreeMap = buildTastyDegreeMap(box.midiNotes,
        TastyState.currentMatches[TastyState.currentIndex].v);
      updateTastyUI();
    }
    render();
    playVoicingBoxAudio(idx);
  } else {
    // Case 3: Already selected + no alternatives -> deselect
    VoicingState.selectedBoxIdx = null;
    render();
  }
}

// Play current chord automatically (for tension/shell/voicing changes)
function playCurrentChord() {
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) return;
  let pcs = getBuilderPCS();
  if (!pcs || pcs.length === 0) return;

  const rootPC = BuilderState.root;
  let intervals;

  if (VoicingState.shell) {
    intervals = getShellIntervals(BuilderState.quality.pcs, VoicingState.shell, VoicingState.shellExtension, pcs);
    if (!intervals) return;
  } else {
    // Normal voicing: apply omit/rootless filters
    if (VoicingState.omit5) pcs = pcs.filter(iv => iv % 12 !== 7);
    if (VoicingState.rootless) pcs = pcs.filter(iv => iv % 12 !== 0);
    if (VoicingState.omit3) pcs = pcs.filter(iv => iv % 12 !== 3 && iv % 12 !== 4);
    if (pcs.length === 0) return;
    intervals = calcVoicingOffsets(pcs, VoicingState.inversion, VoicingState.drop).voiced;
  }

  // Convert to MIDI (root at C3 = MIDI 48, shifted by octave)
  const octOff = AppState.octaveShift * 12;
  const rootMidi = 48 + rootPC + octOff;
  const midiNotes = intervals.map(o => rootMidi + o);
  // Add bass note for slash chords
  if (BuilderState.bass !== null) {
    midiNotes.unshift(36 + BuilderState.bass + octOff);
  }
  playMidiNotes(midiNotes, 2);
}


// ========================================
// VOICING CALCULATION — Adapters to pad-core pure functions
// ========================================
function getShellIntervals(qualityPCS, shellMode, extension, fullPCS) {
  return padGetShellIntervals(qualityPCS, shellMode, extension, fullPCS);
}

// Search grid for all valid voicing positions, draw bounding boxes, update VoicingState.lastBoxes
function computeAndDrawVoicingBoxes(svg, offsets, targetPC, strokeColor, badgeColor, maxRS, maxCS) {
  const boxes = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = midiNote(row, col);
      if (pitchClass(midi) !== targetPC) continue;
      const allVP = calcAllVoicingPositions(row, col, offsets);
      if (allVP.length === 0) continue;
      // Apply maxRS/maxCS filter to all alternatives
      const filtered = maxRS ? allVP.filter(vp => {
        const rs = vp.maxRow - vp.minRow + 1, cs = vp.maxCol - vp.minCol + 1;
        return rs <= maxRS && cs <= maxCS;
      }) : allVP;
      if (filtered.length === 0) continue;
      boxes.push({ midi, row, col, alternatives: filtered });
    }
  }
  boxes.sort((a, b) => a.midi - b.midi);
  // Save previous selection for proximity matching (only when flagged)
  const preserve = VoicingState._preservePosition;
  const prevBoxData = (preserve && VoicingState.selectedBoxIdx !== null
    && VoicingState.lastBoxes[VoicingState.selectedBoxIdx])
    ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx] : null;
  VoicingState._preservePosition = false; // consume flag
  // Build lastBoxes with alternatives and current cycling index
  const cycleableSet = new Set();
  VoicingState.lastBoxes = boxes.map((b, idx) => {
    const altIdx = VoicingState.cycleIndices[idx] || 0;
    const safeIdx = altIdx < b.alternatives.length ? altIdx : 0;
    const currentVP = b.alternatives[safeIdx];
    if (b.alternatives.length > 1) cycleableSet.add(idx);
    return {
      rootRow: b.row, rootCol: b.col,
      midiNotes: currentVP.positions.map(p => baseMidi() + p.row * ROW_INTERVAL + p.col).sort((a, b) => a - b),
      alternatives: b.alternatives,
      currentAlt: safeIdx
    };
  });
  // Position preservation (only on transpose/inversion/drop)
  if (prevBoxData !== null && VoicingState.lastBoxes.length > 0) {
    if (preserve.type === 'transpose') {
      // Shape-based matching: compare physical finger shape (relative grid offsets from root)
      const prevAlt = prevBoxData.alternatives[prevBoxData.currentAlt];
      const prevShape = prevAlt.positions
        .map(p => ({ dr: p.row - prevBoxData.rootRow, dc: p.col - prevBoxData.rootCol }))
        .sort((a, b) => a.dr - b.dr || a.dc - b.dc);
      const bm = baseMidi();
      const prevRootMidi = bm + prevBoxData.rootRow * ROW_INTERVAL + prevBoxData.rootCol;
      const expectedMidi = prevRootMidi + preserve.midiDelta;
      // Search all boxes × all alternatives for matching shape
      let bestIdx = -1, bestAltIdx = -1, bestPitchDist = Infinity, bestGridDist = Infinity;
      let fallbackIdx = 0, fallbackPitchDist = Infinity, fallbackGridDist = Infinity;
      VoicingState.lastBoxes.forEach((box, i) => {
        const boxMidi = bm + box.rootRow * ROW_INTERVAL + box.rootCol;
        const pitchDist = Math.abs(boxMidi - expectedMidi);
        const gridDist = Math.abs(box.rootRow - prevBoxData.rootRow) + Math.abs(box.rootCol - prevBoxData.rootCol);
        // Track fallback (closest pitch, then closest grid position as tiebreaker)
        if (pitchDist < fallbackPitchDist || (pitchDist === fallbackPitchDist && gridDist < fallbackGridDist)) {
          fallbackPitchDist = pitchDist; fallbackGridDist = gridDist; fallbackIdx = i;
        }
        // Check every alternative of this box for shape match
        box.alternatives.forEach((alt, j) => {
          const shape = alt.positions
            .map(p => ({ dr: p.row - box.rootRow, dc: p.col - box.rootCol }))
            .sort((a, b) => a.dr - b.dr || a.dc - b.dc);
          if (shape.length === prevShape.length &&
              shape.every((s, k) => s.dr === prevShape[k].dr && s.dc === prevShape[k].dc)) {
            if (pitchDist < bestPitchDist || (pitchDist === bestPitchDist && gridDist < bestGridDist)) {
              bestPitchDist = pitchDist; bestGridDist = gridDist; bestIdx = i; bestAltIdx = j;
            }
          }
        });
      });
      // Prefer shape match, but reject if it jumps too far (> 7 semitones from expected)
      if (bestIdx >= 0 && bestPitchDist <= 7) {
        VoicingState.selectedBoxIdx = bestIdx;
        // Switch to the matching alternative
        VoicingState.cycleIndices[bestIdx] = bestAltIdx;
        const selBox = VoicingState.lastBoxes[bestIdx];
        selBox.currentAlt = bestAltIdx;
        selBox.midiNotes = selBox.alternatives[bestAltIdx].positions
          .map(p => bm + p.row * ROW_INTERVAL + p.col).sort((a, b) => a - b);
      } else {
        // No nearby shape match: stay in same pitch range (fallback)
        VoicingState.selectedBoxIdx = fallbackIdx;
      }
    } else {
      // Voicing change (inversion/drop): root stays same, find exact same root position
      const pr = prevBoxData.rootRow, pc = prevBoxData.rootCol;
      let bestIdx = null, bestDist = Infinity;
      VoicingState.lastBoxes.forEach((box, i) => {
        if (box.rootRow === pr && box.rootCol === pc) { bestIdx = i; return; }
        const dist = Math.abs(box.rootRow - pr) + Math.abs(box.rootCol - pc);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      if (bestIdx !== null) VoicingState.selectedBoxIdx = bestIdx;
    }
  } else if (VoicingState.selectedBoxIdx !== null && VoicingState.lastBoxes.length === 0) {
    VoicingState.selectedBoxIdx = null;
  }
  const midiCount = new Map();
  boxes.forEach(b => midiCount.set(b.midi, (midiCount.get(b.midi) || 0) + 1));
  const dupSet = new Set();
  boxes.forEach((b, i) => { if (midiCount.get(b.midi) > 1) dupSet.add(i); });
  // Use current alternative's vp for drawing
  const vpArray = boxes.map((b, idx) => {
    const safeIdx = VoicingState.lastBoxes[idx].currentAlt;
    return b.alternatives[safeIdx];
  });
  drawVoicingBoxes(svg, vpArray, strokeColor, badgeColor, dupSet, cycleableSet);
}

function calcVoicingOffsets(chordPCS, inversion, drop) {
  return padCalcVoicingOffsets(chordPCS, inversion, drop);
}

function getBassCase(bassPC, rootPC, chordPCS) {
  return padGetBassCase(bassPC, rootPC, chordPCS);
}

function applyOnChordBass(voiced, rootPC, bassPC) {
  return padApplyOnChordBass(voiced, rootPC, bassPC);
}

function calcAllVoicingPositions(bassRow, bassCol, offsets, maxResults) {
  return padCalcAllVoicingPositions(bassRow, bassCol, offsets, ROWS, COLS, baseMidi(), ROW_INTERVAL, maxResults);
}

// Backward-compatible wrapper: returns single best position or null
function calcVoicingPositions(bassRow, bassCol, offsets) {
  const all = calcAllVoicingPositions(bassRow, bassCol, offsets, 1);
  return all.length > 0 ? all[0] : null;
}

// Shell voicing position calculator
// Returns {positions: [{row,col},...], minRow, maxRow, minCol, maxCol} or null
function calcShellPositions(rootRow, rootCol, thirdInterval, seventhInterval, shellType) {
  const bm = baseMidi();
  const rootMidi = bm + rootRow * ROW_INTERVAL + rootCol;
  // 1-3-7: R at bottom, 3rd above, 7th on top (ascending natural)
  // 1-7-3: R at bottom, 7th above, 3rd on top (3rd displaced up an octave)
  const targetOffsets = shellType === '137'
    ? [thirdInterval, seventhInterval]
    : [seventhInterval, thirdInterval + 12];
  // Find all valid pad positions for each target
  const candidates = targetOffsets.map(offset => {
    const targetMidi = rootMidi + offset;
    const positions = [];
    for (let r = 0; r < ROWS; r++) {
      const c = targetMidi - bm - r * ROW_INTERVAL;
      if (c >= 0 && c < COLS) positions.push({ row: r, col: c });
    }
    return positions;
  });
  if (candidates.some(c => c.length === 0)) return null;
  // Find combination with smallest max-dimension, then area
  let best = null, bestMaxDim = Infinity, bestArea = Infinity;
  const p0 = { row: rootRow, col: rootCol };
  for (const p1 of candidates[0]) {
    for (const p2 of candidates[1]) {
      const minR = Math.min(p0.row, p1.row, p2.row);
      const maxR = Math.max(p0.row, p1.row, p2.row);
      const minC = Math.min(p0.col, p1.col, p2.col);
      const maxC = Math.max(p0.col, p1.col, p2.col);
      const rowSpan = maxR - minR + 1;
      const colSpan = maxC - minC + 1;
      const maxDim = Math.max(rowSpan, colSpan);
      const area = rowSpan * colSpan;
      if (maxDim < bestMaxDim || (maxDim === bestMaxDim && area < bestArea)) {
        bestMaxDim = maxDim; bestArea = area;
        best = { positions: [p0, p1, p2], minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC };
      }
    }
  }
  // Filter: skip if bounding box too large (impractical hand reach)
  if (best) {
    const rs = best.maxRow - best.minRow + 1;
    const cs = best.maxCol - best.minCol + 1;
    if (rs > 4 || cs > 5) return null;
  }
  return best;
}

// ========================================
// GUITAR/BASS POSITION ALTERNATIVES (v3.19, groups v3.21)
// ========================================
function groupGuitarForms(alternatives, openMidi, rootPC) {
  var numStrings = openMidi.length;
  var groups = [];
  // All positions first (user preference: most general filter first)
  if (alternatives.length > 0) {
    groups.push({ labelKey: 'pos.all', forms: alternatives });
  }
  // Root string groups (check bottom 3 strings)
  var maxRoot = Math.min(3, numStrings);
  for (var si = numStrings - 1; si >= numStrings - maxRoot; si--) {
    var forms = [];
    for (var i = 0; i < alternatives.length; i++) {
      var f = alternatives[i];
      if (!f.rootInBass) continue;
      // Find lowest sounding string
      var lo = -1;
      for (var j = f.frets.length - 1; j >= 0; j--) {
        if (f.frets[j] !== null) { lo = j; break; }
      }
      if (lo === si) forms.push(f);
    }
    if (forms.length > 0) {
      groups.push({ labelKey: 'pos.root_' + (si + 1), forms: forms });
    }
  }
  // Open string forms
  var openForms = [];
  for (var i = 0; i < alternatives.length; i++) {
    for (var j = 0; j < alternatives[i].frets.length; j++) {
      if (alternatives[i].frets[j] === 0) { openForms.push(alternatives[i]); break; }
    }
  }
  if (openForms.length > 0) {
    groups.push({ labelKey: 'pos.open', forms: openForms });
  }
  return groups;
}

function _resetPositionState(state) {
  state.currentAlt = 0;
  state.currentGroupIdx = 0;
  state.currentAltInGroup = 0;
}

function _currentFormIndex(state) {
  if (state.groups.length === 0) return 0;
  var g = state.groups[state.currentGroupIdx];
  if (!g) return 0;
  return state.alternatives.indexOf(g.forms[state.currentAltInGroup]);
}

function updateGuitarPositions() {
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) {
    GuitarPositionState.enabled = false;
    GuitarPositionState._lastKey = null;
    updatePositionBar('guitar');
    return;
  }
  if (_guitarSyncSource === 'manual') {
    GuitarPositionState.enabled = false;
    GuitarPositionState._lastKey = null;
    updatePositionBar('guitar');
    return;
  }

  var pcs = getBuilderPCS();
  if (!pcs) { GuitarPositionState.enabled = false; GuitarPositionState._lastKey = null; updatePositionBar('guitar'); return; }

  var key = BuilderState.root + ':' + pcs.join(',');
  if (key !== GuitarPositionState._lastKey) {
    GuitarPositionState._lastKey = key;
    GuitarPositionState.alternatives = padEnumGuitarChordForms(pcs, BuilderState.root, GUITAR_OPEN_MIDI, 21, 4, { maxResults: 30 });
    GuitarPositionState.groups = groupGuitarForms(GuitarPositionState.alternatives, GUITAR_OPEN_MIDI, BuilderState.root);
    _resetPositionState(GuitarPositionState);
    GuitarPositionState.enabled = GuitarPositionState.alternatives.length > 0;
    if (GuitarPositionState.enabled) {
      applyGuitarForm(GuitarPositionState.alternatives[0]);
    }
  }
  updatePositionBar('guitar');
}

function updateBassPositions() {
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) {
    BassPositionState.enabled = false;
    BassPositionState._lastKey = null;
    updatePositionBar('bass');
    return;
  }
  if (_guitarSyncSource === 'manual') {
    BassPositionState.enabled = false;
    BassPositionState._lastKey = null;
    updatePositionBar('bass');
    return;
  }

  var pcs = getBuilderPCS();
  if (!pcs) { BassPositionState.enabled = false; BassPositionState._lastKey = null; updatePositionBar('bass'); return; }

  var key = BuilderState.root + ':' + pcs.join(',');
  if (key !== BassPositionState._lastKey) {
    BassPositionState._lastKey = key;
    BassPositionState.alternatives = padEnumGuitarChordForms(pcs, BuilderState.root, BASS_OPEN_MIDI, 21, 4, { maxResults: 30 });
    BassPositionState.groups = groupGuitarForms(BassPositionState.alternatives, BASS_OPEN_MIDI, BuilderState.root);
    _resetPositionState(BassPositionState);
    BassPositionState.enabled = BassPositionState.alternatives.length > 0;
    if (BassPositionState.enabled) {
      applyBassForm(BassPositionState.alternatives[0]);
    }
  }
  updatePositionBar('bass');
}

function applyGuitarForm(form) {
  guitarSelectedFrets = form.frets.slice();
  _guitarSyncSource = 'position';
  instrumentInputActive = true;
}

function applyBassForm(form) {
  bassSelectedFrets = form.frets.slice();
}

function cycleGuitarPosition(delta) {
  if (!GuitarPositionState.enabled || GuitarPositionState.groups.length === 0) return;
  var g = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  if (!g) return;
  var len = g.forms.length;
  GuitarPositionState.currentAltInGroup = (GuitarPositionState.currentAltInGroup + delta + len) % len;
  GuitarPositionState.currentAlt = GuitarPositionState.alternatives.indexOf(g.forms[GuitarPositionState.currentAltInGroup]);
  applyGuitarForm(g.forms[GuitarPositionState.currentAltInGroup]);
  updatePositionBar('guitar');
  render();
}

function cycleBassPosition(delta) {
  if (!BassPositionState.enabled || BassPositionState.groups.length === 0) return;
  var g = BassPositionState.groups[BassPositionState.currentGroupIdx];
  if (!g) return;
  var len = g.forms.length;
  BassPositionState.currentAltInGroup = (BassPositionState.currentAltInGroup + delta + len) % len;
  BassPositionState.currentAlt = BassPositionState.alternatives.indexOf(g.forms[BassPositionState.currentAltInGroup]);
  applyBassForm(g.forms[BassPositionState.currentAltInGroup]);
  updatePositionBar('bass');
  render();
}

function cycleGuitarGroup(delta) {
  if (!GuitarPositionState.enabled || GuitarPositionState.groups.length <= 1) return;
  var len = GuitarPositionState.groups.length;
  GuitarPositionState.currentGroupIdx = (GuitarPositionState.currentGroupIdx + delta + len) % len;
  GuitarPositionState.currentAltInGroup = 0;
  var g = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  GuitarPositionState.currentAlt = GuitarPositionState.alternatives.indexOf(g.forms[0]);
  applyGuitarForm(g.forms[0]);
  updatePositionBar('guitar');
  render();
}

function cycleBassGroup(delta) {
  if (!BassPositionState.enabled || BassPositionState.groups.length <= 1) return;
  var len = BassPositionState.groups.length;
  BassPositionState.currentGroupIdx = (BassPositionState.currentGroupIdx + delta + len) % len;
  BassPositionState.currentAltInGroup = 0;
  var g = BassPositionState.groups[BassPositionState.currentGroupIdx];
  BassPositionState.currentAlt = BassPositionState.alternatives.indexOf(g.forms[0]);
  applyBassForm(g.forms[0]);
  updatePositionBar('bass');
  render();
}

function updatePositionBar(which) {
  var state = which === 'guitar' ? GuitarPositionState : BassPositionState;
  var bar = document.getElementById(which + '-position-bar');
  var label = document.getElementById(which + '-pos-label');
  var groupsEl = document.getElementById(which + '-pos-groups');
  if (!bar || !label) return;
  if (state.enabled && state.alternatives.length > 0) {
    bar.style.display = 'flex';
    // Group tabs
    if (groupsEl) {
      groupsEl.innerHTML = '';
      if (state.groups.length > 1) {
        groupsEl.style.display = 'flex';
        for (var i = 0; i < state.groups.length; i++) {
          var tab = document.createElement('button');
          tab.className = 'pos-group-tab' + (i === state.currentGroupIdx ? ' active' : '');
          tab.textContent = t(state.groups[i].labelKey);
          tab.dataset.idx = i;
          tab.onclick = (function(w, idx) {
            return function() {
              if (w === 'guitar') { GuitarPositionState.currentGroupIdx = idx; GuitarPositionState.currentAltInGroup = 0; cycleGuitarGroup(0); }
              else { BassPositionState.currentGroupIdx = idx; BassPositionState.currentAltInGroup = 0; cycleBassGroup(0); }
            };
          })(which, i);
          groupsEl.appendChild(tab);
        }
      } else {
        groupsEl.style.display = 'none';
      }
    }
    // Label: show current group info
    var g = state.groups[state.currentGroupIdx];
    if (g) {
      var groupLabel = state.groups.length > 1 ? t(g.labelKey) + ': ' : '';
      label.textContent = groupLabel + (state.currentAltInGroup + 1) + '/' + g.forms.length;
    } else {
      label.textContent = (state.currentAlt + 1) + '/' + state.alternatives.length;
    }
  } else {
    bar.style.display = 'none';
    if (groupsEl) groupsEl.style.display = 'none';
  }
  // Show voicing-reflect button independently (guitar only)
  if (which === 'guitar') {
    var vrBtn = document.getElementById('voicing-reflect-btn');
    if (vrBtn) {
      // Show when position bar is visible OR voicing reflect is active
      var showReflect = (state.enabled && state.alternatives.length > 0) || _voicingReflectMode;
      vrBtn.style.display = showReflect ? 'inline-block' : 'none';
    }
  }
}

// ========================================
// CHORD NAMING & HELPERS
// ========================================
function chordDegreeName(interval, qualityPCS, finalPCS) {
  switch(interval) {
    case 0: return 'R';
    case 1: return 'b9';
    case 2:
      if (BuilderState.tension && BuilderState.tension.mods && BuilderState.tension.mods.replace3 === 2) return '2';
      return '9';
    case 3:
      if (finalPCS && finalPCS.has(4)) return '#9';
      return 'm3';
    case 4: return '3';
    case 5:
      if (BuilderState.tension && BuilderState.tension.mods && BuilderState.tension.mods.replace3 === 5) return '4';
      if (qualityPCS && !qualityPCS.includes(3) && !qualityPCS.includes(4)) return '4';
      return '11';
    case 6:
      if (qualityPCS && qualityPCS.includes(6)) return 'b5';
      return '#11';
    case 7: return '5';
    case 8:
      if (qualityPCS && qualityPCS.includes(8)) return '#5';
      if (BuilderState.tension && BuilderState.tension.mods && BuilderState.tension.mods.sharp5) return '#5';
      return 'b13';
    case 9:
      if (qualityPCS && qualityPCS.includes(9) && !qualityPCS.includes(10) && !qualityPCS.includes(11)) return '6';
      return '13';
    case 10: return 'b7';
    case 11: return '△7';
  }
  return '';
}

function midiNote(row, col) { return baseMidi() + row * ROW_INTERVAL + col * COL_INTERVAL; }
function pitchClass(midi) { return padPitchClass(midi); }
function noteName(midi) { return pcName(pitchClass(midi)) + (Math.floor(midi / 12) - 2); }

// ======== TENSION APPLICATION — Adapter to pad-core ========
function applyTension(basePCS, mods) {
  return padApplyTension(basePCS, mods);
}

// ======== GET ACTIVE PCS FOR CHORD BUILDER ========
function getBuilderPCS() {
  if (BuilderState.root === null || !BuilderState.quality) return null;
  let pcs = [...BuilderState.quality.pcs];
  if (BuilderState.tension) pcs = applyTension(pcs, BuilderState.tension.mods);
  return pcs;
}

function _chordContextKey() {
  return padChordContextKey(BuilderState.root, AppState.scaleIdx, AppState.key);
}

function getBuilderChordName() {
  return padGetBuilderChordName(BuilderState.root, BuilderState.quality, BuilderState.tension, BuilderState.bass, AppState.scaleIdx, AppState.key);
}

// ======== DRAW BOUNDING BOXES HELPER ========
function drawVoicingBoxes(svg, vpArray, strokeColor, badgeColor, dupSet, cycleableSet) {
  const hasSelection = VoicingState.selectedBoxIdx !== null;
  vpArray.forEach((vp, idx) => {
    const sel = VoicingState.selectedBoxIdx === idx;
    // Hide non-selected boxes when one is selected
    if (hasSelection && !sel) return;
    const isDup = dupSet && dupSet.has(idx);
    const isCycleable = cycleableSet && cycleableSet.has(idx);
    // Bounding box
    const bx = MARGIN + vp.minCol * (PAD_SIZE + PAD_GAP) - 3;
    const by = MARGIN + (ROWS - 1 - vp.maxRow) * (PAD_SIZE + PAD_GAP) - 3;
    const bw = (vp.maxCol - vp.minCol + 1) * (PAD_SIZE + PAD_GAP) - PAD_GAP + 6;
    const bh = (vp.maxRow - vp.minRow + 1) * (PAD_SIZE + PAD_GAP) - PAD_GAP + 6;
    const boxRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    boxRect.setAttribute('x', bx); boxRect.setAttribute('y', by);
    boxRect.setAttribute('width', bw); boxRect.setAttribute('height', bh);
    boxRect.setAttribute('rx', 8); boxRect.setAttribute('fill', 'none');
    boxRect.setAttribute('stroke', sel ? '#fff' : strokeColor);
    boxRect.setAttribute('stroke-width', sel ? 3 : 2);
    boxRect.setAttribute('stroke-dasharray', isDup ? '4 6' : '6 3');
    boxRect.setAttribute('opacity', sel ? '1' : '0.7');
    if (isDup && !sel) {
      const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      anim.setAttribute('attributeName', 'opacity');
      anim.setAttribute('values', '0.7;0.3;0.7');
      anim.setAttribute('dur', '1.5s'); anim.setAttribute('repeatCount', 'indefinite');
      boxRect.appendChild(anim);
    }
    svg.appendChild(boxRect);
    // Badge
    const bassPos = vp.positions[0];
    const bsz = isCycleable ? 28 : 20;
    const bX = MARGIN + bassPos.col * (PAD_SIZE + PAD_GAP);
    const bY = MARGIN + (ROWS - 1 - bassPos.row) * (PAD_SIZE + PAD_GAP);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.cursor = 'pointer';
    g.addEventListener('click', () => selectVoicingBox(idx));
    const br = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    br.setAttribute('x', bX); br.setAttribute('y', bY);
    br.setAttribute('width', bsz); br.setAttribute('height', bsz);
    br.setAttribute('rx', 4);
    br.setAttribute('fill', sel ? '#000' : '#fff');
    br.setAttribute('opacity', '0.9');
    g.appendChild(br);
    const bt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    bt.setAttribute('x', bX + bsz / 2); bt.setAttribute('y', bY + bsz / 2 + 1);
    bt.setAttribute('text-anchor', 'middle'); bt.setAttribute('dominant-baseline', 'middle');
    bt.setAttribute('fill', sel ? '#fff' : '#000');
    bt.setAttribute('font-weight', '800');
    const boxLetter = String.fromCharCode(65 + idx); // A, B, C, ...
    if (isCycleable && sel) {
      const box = VoicingState.lastBoxes[idx];
      bt.setAttribute('font-size', '11px');
      bt.textContent = boxLetter + (box.currentAlt + 1) + '/' + box.alternatives.length;
    } else {
      bt.setAttribute('font-size', '14px');
      bt.textContent = boxLetter;
    }
    if (isCycleable && !sel) {
      const textAnim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      textAnim.setAttribute('attributeName', 'opacity');
      textAnim.setAttribute('values', '1;0.3;1');
      textAnim.setAttribute('dur', '2s'); textAnim.setAttribute('repeatCount', 'indefinite');
      bt.appendChild(textAnim);
    }
    g.appendChild(bt);
    svg.appendChild(g);
  });
}

// ========================================
// DIATONIC CHORD BAR
// ========================================
function noteNameForKey(pc, key) {
  return padNoteNameForKey(pc, key);
}

function getDiatonicTetrads(scalePCS, key, noteCount) {
  return padGetDiatonicTetrads(scalePCS, key, noteCount);
}

function toggleDiatonicMode() {
  AppState.diatonicMode = AppState.diatonicMode === 'tetrad' ? 'triad' : 'tetrad';
  renderDiatonicBar();
  saveAppSettings();
}

function renderDiatonicBar() {
  const bar = document.getElementById('diatonic-bar');
  if (!bar) return;
  if (AppState.mode === 'input') {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  // Hide diatonic bar when chord was built manually (not from diatonic bar click)
  // Only hide after quality is selected (root-only = still browsing, bar useful)
  if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality !== null && !BuilderState._fromDiatonic) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  const scale = SCALES[AppState.scaleIdx];
  if (scale.pcs.length !== 7) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  bar.style.display = 'flex';
  const noteCount = AppState.diatonicMode === 'triad' ? 3 : 4;
  const tetrads = getDiatonicTetrads(scale.pcs, AppState.key, noteCount);
  bar.innerHTML = '';
  // Segment toggle (3 | 4)
  const wrap = document.createElement('div');
  wrap.className = 'diatonic-toggle-wrap';
  [3, 4].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'diatonic-toggle-btn' + (noteCount === n ? ' active' : '');
    btn.textContent = n;
    btn.onclick = () => { AppState.diatonicMode = n === 3 ? 'triad' : 'tetrad'; renderDiatonicBar(); saveAppSettings(); };
    wrap.appendChild(btn);
  });
  bar.appendChild(wrap);
  tetrads.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    // Highlight if current chord matches this diatonic chord
    if (AppState.mode === 'chord' && BuilderState.root === t.rootPC && BuilderState.quality &&
        BuilderState.quality.name === t.quality.name && !BuilderState.tension) {
      btn.classList.add('active');
    }
    btn.innerHTML = '<span class="dia-num">' + (i + 1) + '</span><div>' + t.chordName + '</div><div class="degree">' + t.degree + '</div>';
    btn.onclick = () => onDiatonicClick(t);
    bar.appendChild(btn);
  });
}

// ========================================
// PARENT SCALE REVERSE LOOKUP
// ========================================

function fifthsDistance(key1, key2) {
  return padFifthsDistance(key1, key2);
}

// DIATONIC_CHORD_DB, psKeyName, getParentScaleAbsPCS, psDegreeLabel — from pad-core

function findParentScales(rootPC, chordIntervals, currentKey) {
  return padFindParentScales(rootPC, chordIntervals, currentKey);
}

function onDiatonicClick(tetrad) {
  // Switch to Chord mode (direct manipulation to preserve builder state)
  AppState.mode = 'chord';
  document.getElementById('mode-scale').classList.toggle('active', false);
  document.getElementById('mode-chord').classList.toggle('active', true);
  document.getElementById('mode-input').classList.toggle('active', false);
  document.getElementById('scale-panel').style.display = 'none';
  document.getElementById('chord-panel').style.display = '';
  document.getElementById('input-panel').style.display = 'none';

  // Set builder state
  BuilderState._fromDiatonic = true;
  BuilderState.root = tetrad.rootPC;
  BuilderState.quality = tetrad.quality;
  BuilderState.tension = null;
  BuilderState.bass = null;
  resetVoicingSelection();

  // Update builder UI
  updateKeyButtons();
  highlightQuality(tetrad.quality);
  clearTensionSelection();
  updateControlsForQuality(tetrad.quality);
  setBuilderStep(2);
  render();
}

// ========================================
// TASTY VOICING ENGINE — degree → MIDI conversion
// ========================================

var TASTY_DEGREE_MAP = {
  '1':0, 'b9':1, '9':2, '#9':3, 'b3':3, '3':4,
  '11':5, '#11':6, 'b5':6, '5':7, '#5':8, 'b13':8,
  '6':9, '13':9, 'bb7':9, 'b7':10, '7':11
};

// Build MIDI note array from degree array (bottom to top, each note above previous)
function buildTastyVoicing(rootMidi, degrees) {
  var result = [];
  var first = TASTY_DEGREE_MAP[degrees[0]];
  if (first === undefined) return result;
  result.push(rootMidi + first);
  for (var i = 1; i < degrees.length; i++) {
    var semitone = TASTY_DEGREE_MAP[degrees[i]];
    if (semitone === undefined) continue;
    var prev = result[result.length - 1];
    var note = rootMidi + semitone;
    while (note <= prev) note += 12;
    result.push(note);
  }
  return result;
}

// Detect Rootless / Omit3 / Omit5 from degree array
function getTastyLabels(degrees) {
  var labels = [];
  var has1 = false, has3 = false, has5 = false;
  for (var i = 0; i < degrees.length; i++) {
    if (degrees[i] === '1') has1 = true;
    if (degrees[i] === '3' || degrees[i] === 'b3') has3 = true;
    if (degrees[i] === '5') has5 = true;
  }
  if (!has1) labels.push('Rootless');
  if (!has3) labels.push('Omit3');
  if (!has5) labels.push('Omit5');
  return labels;
}

// Build degree map: MIDI note → recipe degree string (e.g. {36:"1", 39:"b3"})
function buildTastyDegreeMap(midiNotes, degrees) {
  var map = {};
  var idx = 0;
  for (var i = 0; i < degrees.length; i++) {
    if (TASTY_DEGREE_MAP[degrees[i]] === undefined) continue;
    if (idx < midiNotes.length) {
      map[midiNotes[idx]] = degrees[i];
      idx++;
    }
  }
  return map;
}

// Split MIDI notes into pad-range and out-of-range
function splitByPadRange(midiNotes) {
  var lo = baseMidi();
  var hi = lo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var inRange = [], outOfRange = [];
  for (var i = 0; i < midiNotes.length; i++) {
    if (midiNotes[i] >= lo && midiNotes[i] <= hi) {
      inRange.push(midiNotes[i]);
    } else {
      outOfRange.push(midiNotes[i]);
    }
  }
  return { inRange: inRange, outOfRange: outOfRange };
}

// Find best octave position: maximize notes within pad range, prefer lowest
function findBestPosition(rootMidi, degrees) {
  var lo = baseMidi();
  var hi = lo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var bestRoot = rootMidi, bestCount = -1, bestNotes = [];
  // Search LOW to HIGH — prefer lowest position where most notes fit
  for (var shift = -4; shift <= 2; shift++) {
    var r = rootMidi + shift * 12;
    if (r < 0) continue;
    var notes = buildTastyVoicing(r, degrees);
    if (notes.length === 0) continue;
    var count = 0;
    for (var i = 0; i < notes.length; i++) {
      if (notes[i] >= lo && notes[i] <= hi) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestRoot = r;
      bestNotes = notes;
    }
    // All notes fit at lowest possible position — done
    if (count === notes.length) break;
  }
  return bestNotes;
}

// ========================================
// TASTY MODE — Chord Cookbook Cycling
// ========================================

function getTastyCategory(quality) {
  if (!quality) return null;
  var pcs = quality.pcs;
  // Dominant: major 3rd + minor 7th (must check before generic major)
  if (pcs.includes(4) && pcs.includes(10)) return 'dominant';
  // Major 7th
  if (pcs.includes(4) && pcs.includes(11)) return 'major';
  // 6 chord (major 3rd + 6th, no 7th)
  if (pcs.includes(4) && pcs.includes(9) && !pcs.includes(10) && !pcs.includes(11)) return 'major';
  // Major triad (no 7th)
  if (pcs.includes(4) && !pcs.includes(3)) return 'major';
  // Minor: has minor 3rd
  if (pcs.includes(3)) return 'minor';
  return null;
}

function findQualityByName(name) {
  for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
    for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
      var q = BUILDER_QUALITIES[r][c];
      if (q && q.name === name) return q;
    }
  }
  return null;
}

function updateTastyMatches() {
  var cat = getTastyCategory(TastyState.originalQuality);
  TastyState.currentCategory = cat;
  // Use voicings JSON (129 degree-based recipes) when available
  if (TastyState.voicings && cat) {
    var matches = TastyState.voicings.filter(function(v) {
      return v.cat === cat;
    });
    // Apply top-note filter if set
    if (TastyState.topFilter) {
      matches = matches.filter(function(v) { return v.top === TastyState.topFilter; });
    }
    TastyState.currentMatches = matches;
  } else {
    TastyState.currentMatches = [];
  }
  TastyState.currentIndex = -1;
}

function findTensionLabel(mods, quality) {
  // When quality has a 7th, skip "6"-prefixed labels (e.g. "6", "6/9", "6/9\n(#11)")
  // because PC 9 = 13th (not 6th) in 7th-chord context
  var has7th = quality && (
    quality.pcs.includes(10) || quality.pcs.includes(11) ||
    (quality.pcs.includes(9) && quality.pcs.includes(6))
  );
  // Search TENSION_ROWS for matching mods
  for (var r = 0; r < TENSION_ROWS.length; r++) {
    for (var c = 0; c < (TENSION_ROWS[r] ? TENSION_ROWS[r].length : 0); c++) {
      var t = TENSION_ROWS[r][c];
      if (!t) continue;
      // Skip 6-prefixed labels for 7th chords (6→13, 6/9→9+13, etc.)
      if (has7th && /^6/.test(t.label)) continue;
      // Skip add9 label for 7th chords (add9 is for triads, 9 is for 7th)
      if (has7th && t.label === 'add9') continue;
      var tm = t.mods;
      // Compare mods
      var match = true;
      var addA = (mods.add || []).slice().sort().join(',');
      var addB = (tm.add || []).slice().sort().join(',');
      if (addA !== addB) match = false;
      if ((mods.replace3 || null) !== (tm.replace3 || null)) match = false;
      if ((mods.sharp5 || false) !== (tm.sharp5 || false)) match = false;
      if ((mods.flat5 || false) !== (tm.flat5 || false)) match = false;
      if ((mods.omit3 || false) !== (tm.omit3 || false)) match = false;
      if ((mods.omit5 || false) !== (tm.omit5 || false)) match = false;
      if (match) return t.label;
    }
  }
  // Build label from mods
  var parts = [];
  if (mods.replace3 === 5) parts.push('sus4');
  else if (mods.replace3 === 2) parts.push('sus2');
  if (mods.sharp5) parts.push('aug');
  if (mods.flat5) parts.push('b5');
  if (mods.omit3) parts.push('omit3');
  if (mods.omit5) parts.push('omit5');
  if (mods.add) {
    mods.add.forEach(function(pc) {
      var name = PC_TO_TENSION_NAME[pc];
      if (name) parts.push(name);
    });
  }
  return parts.length > 0 ? '(' + parts.join(',') + ')' : '';
}

function cycleTasty(reverse) {
  if (!TastyState.enabled || TastyState.currentMatches.length === 0) return;
  var len = TastyState.currentMatches.length;
  TastyState.currentIndex = reverse
    ? (TastyState.currentIndex - 1 + len) % len
    : (TastyState.currentIndex + 1) % len;
  var recipe = TastyState.currentMatches[TastyState.currentIndex];

  // Build voicing from degree array → MIDI notes (auto-find best octave position)
  // rootMidi fixed at C3 register (48) — octaveShift only affects pad range, not voicing register
  var rootPC = BuilderState.root;
  var rootMidi = 48 + rootPC;
  var midiNotes = findBestPosition(rootMidi, recipe.v);

  // Split by pad range
  var split = splitByPadRange(midiNotes);
  TastyState.midiNotes = midiNotes;
  TastyState.outOfRange = split.outOfRange;
  TastyState.degreeMap = buildTastyDegreeMap(midiNotes, recipe.v);
  TastyState.topNote = midiNotes.length > 0 ? Math.max.apply(null, midiNotes) : null;

  updateTastyUI();
  render();
  playMidiNotes(midiNotes);
}

function toggleTasty() {
  if (!TastyState.hpsUnlocked || !TastyState.voicings) return;
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) return;

  if (TastyState.enabled) {
    disableTasty();
  } else {
    // Enable: save original, find matches, apply first voicing
    TastyState.originalQuality = BuilderState.quality;
    TastyState.originalTension = BuilderState.tension;
    TastyState.enabled = true;
    updateTastyMatches();
    if (TastyState.currentMatches.length > 0) {
      cycleTasty();
    } else {
      TastyState.enabled = false;
      updateTastyUI();
    }
  }
}

function disableTasty() {
  if (!TastyState.enabled) return;
  TastyState.enabled = false;
  TastyState.currentIndex = -1;
  TastyState.midiNotes = [];
  TastyState.outOfRange = [];
  TastyState.degreeMap = {};
  TastyState.topNote = null;
  TastyState.topFilter = null;

  updateTastyUI();
  render();
  playCurrentChord();
}

function setTastyTopFilter(top) {
  TastyState.topFilter = top;
  updateTastyMatches();
  if (TastyState.currentMatches.length > 0) {
    TastyState.currentIndex = -1;
    cycleTasty();
  } else {
    TastyState.currentIndex = -1;
    TastyState.midiNotes = [];
    TastyState.outOfRange = [];
    TastyState.degreeMap = {};
    TastyState.topNote = null;
    updateTastyUI();
    render();
  }
}

// Base chord tones for each quality (used to determine added tensions)
var QUALITY_BASE_DEGREES = {
  '': ['1','3','5'],
  'm': ['1','b3','5'],
  '7': ['1','3','5','b7'],
  'm7': ['1','b3','5','b7'],
  '\u25B37': ['1','3','5','7'],
  'm\u25B37': ['1','b3','5','7'],
  'dim': ['1','b3','b5'],
  'dim7': ['1','b3','b5','6'],
  'aug': ['1','3','#5'],
  '6': ['1','3','5','6'],
  'm6': ['1','b3','5','6'],
  'm7(b5)': ['1','b3','b5','b7']
};

function getTastyDiffText() {
  if (!TastyState.enabled || TastyState.currentIndex < 0) return '';
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) return '';

  // Build chord name: Root + OriginalQuality + (added tensions)
  // e.g. Cm7(9,11) — builder-style notation, showing what's added to the original
  var rootName = pcName(BuilderState.root);
  var qualName = TastyState.originalQuality ? TastyState.originalQuality.name : '';
  var base = QUALITY_BASE_DEGREES[qualName] || ['1','3','5'];

  // Find unique degrees in recipe, determine which are tensions (not in base)
  var seen = {};
  var tensions = [];
  // Tension display order by semitone value
  var TENSION_ORDER = ['b9','9','#9','11','#11','b13','13'];
  var tensionSet = {};
  for (var i = 0; i < recipe.v.length; i++) {
    var d = recipe.v[i];
    if (!seen[d]) {
      seen[d] = true;
      if (base.indexOf(d) === -1 && d !== '1' && d !== '3' && d !== 'b3' && d !== '5' && d !== 'b5' && d !== '#5') {
        tensionSet[d] = true;
      }
    }
  }
  // Sort tensions in standard order
  for (var t = 0; t < TENSION_ORDER.length; t++) {
    if (tensionSet[TENSION_ORDER[t]]) tensions.push(TENSION_ORDER[t]);
  }
  // Check for sus4 (has 11 but no 3/b3)
  if (seen['11'] && !seen['3'] && !seen['b3'] && base.indexOf('3') !== -1) {
    qualName = qualName.replace(/^(m?)/, '$1') + 'sus4';
    // Remove 11 from tensions since it's the sus
    tensions = tensions.filter(function(t) { return t !== '11'; });
  }

  var chordName = rootName + qualName;
  if (tensions.length > 0) chordName += '(' + tensions.join(',') + ')';

  // Voicing degrees: bottom to top (the actual voicing structure)
  var voicingStr = recipe.v.join('-');

  // Top note info
  var topStr = '';
  if (TastyState.topNote !== null && TastyState.degreeMap[TastyState.topNote]) {
    var topPC = TastyState.topNote % 12;
    topStr = 'Top: ' + TastyState.degreeMap[TastyState.topNote] + '(' + pcName(topPC) + ')';
  }

  // Labels (Rootless, Omit3, Omit5)
  var labels = getTastyLabels(recipe.v);
  var labelStr = labels.length > 0 ? ' [' + labels.join(', ') + ']' : '';

  var text = chordName + '  ' + voicingStr + '  ' + topStr + labelStr;

  // Out-of-range notes
  if (TastyState.outOfRange.length > 0) {
    var names = TastyState.outOfRange.map(function(m) { return noteName(m); });
    text += ' (+' + names.join(',') + ': パッド外)';
  }

  return text;
}

// Degree → color category (matches pad colors)
function getTastyDegreeCategory(deg) {
  if (deg === '1') return 'root';
  if (deg === '3' || deg === 'b3') return 'guide3';
  if (deg === '7' || deg === 'b7') return 'guide7';
  if (deg === '5' || deg === 'b5' || deg === '#5') return 'chord';
  if (deg === '6') return 'guide7'; // 6th = guide role in 6 chords
  return 'tension'; // 9, b9, #9, 11, #11, 13, b13
}

// Render TASTY degree badges (near TASTY bar — proximity principle)
function renderTastyDegreeBadges() {
  var el = document.getElementById('tasty-degrees-row');
  if (!el) return;
  if (!TastyState.enabled || TastyState.currentIndex < 0) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';

  var rootPC = BuilderState.root;
  var outSet = {};
  for (var o = 0; o < TastyState.outOfRange.length; o++) {
    outSet[TastyState.outOfRange[o]] = true;
  }

  var html = '<div class="tasty-degrees">';
  html += '<span class="tasty-degrees-label">' + recipe.name + '</span>';

  var noteIdx = 0;
  for (var i = 0; i < recipe.v.length; i++) {
    var deg = recipe.v[i];
    if (TASTY_DEGREE_MAP[deg] === undefined) continue;
    var semitone = TASTY_DEGREE_MAP[deg];
    var pc = (rootPC + semitone) % 12;
    var cat = getTastyDegreeCategory(deg);
    var isTop = (noteIdx < TastyState.midiNotes.length && TastyState.midiNotes[noteIdx] === TastyState.topNote);
    var isOut = (noteIdx < TastyState.midiNotes.length && outSet[TastyState.midiNotes[noteIdx]]);
    var cls = 'tasty-degree tasty-degree--' + cat;
    if (isTop) cls += ' tasty-degree--top';
    if (isOut) cls += ' tasty-degree--out';

    html += '<span class="' + cls + '">';
    html += deg;
    html += '<span class="tasty-degree-note">' + pcName(pc) + '</span>';
    if (isTop) html += '<span class="tasty-degree-top">TOP</span>';
    html += '</span>';
    noteIdx++;
  }
  html += '</div>';
  el.innerHTML = html;
}

function updateTastyUI() {
  var bar = document.getElementById('tasty-bar');
  if (!bar) return;
  bar.style.display = TastyState.hpsUnlocked ? '' : 'none';

  var btn = document.getElementById('btn-tasty');
  if (btn) btn.classList.toggle('active', TastyState.enabled);

  var counter = document.getElementById('tasty-counter');
  var info = document.getElementById('tasty-info');

  var prevBtn = document.getElementById('btn-tasty-prev');
  var nextBtn = document.getElementById('btn-tasty-next');

  if (TastyState.enabled && TastyState.currentIndex >= 0) {
    if (counter) counter.textContent = (TastyState.currentIndex + 1) + '/' + TastyState.currentMatches.length;
    if (info) info.textContent = getTastyDiffText();
    if (prevBtn) prevBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';
  } else {
    if (counter) counter.textContent = '';
    if (info) info.textContent = '';
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
  }

  // Top-note filter buttons
  var degRow = document.getElementById('tasty-degrees-row');
  if (degRow) {
    if (TastyState.enabled && TastyState.currentCategory) {
      // Build unique top notes for this category
      var allCat = TastyState.voicings ? TastyState.voicings.filter(function(v) {
        return v.cat === TastyState.currentCategory;
      }) : [];
      var topSet = {};
      allCat.forEach(function(v) { topSet[v.top] = (topSet[v.top] || 0) + 1; });
      var tops = Object.keys(topSet);
      // Sort by semitone value
      var DEG_SEMI = {'1':0,'b9':1,'9':2,'#9':3,'b3':3,'3':4,'11':5,'#11':6,'b5':6,'5':7,'#5':8,'b13':8,'13':9,'6':9,'b7':10,'7':11};
      tops.sort(function(a, b) { return (DEG_SEMI[a] || 0) - (DEG_SEMI[b] || 0); });
      var html = '<button onclick="setTastyTopFilter(null)" style="font-size:0.6rem;padding:2px 6px;border-radius:4px;cursor:pointer;border:1px solid var(--accent,#f80);' +
        (TastyState.topFilter === null ? 'background:var(--accent,#f80);color:#000;font-weight:700;' : 'background:var(--surface);color:var(--text);') +
        '">ALL(' + allCat.length + ')</button> ';
      tops.forEach(function(t) {
        var active = TastyState.topFilter === t;
        html += '<button onclick="setTastyTopFilter(\'' + t + '\')" style="font-size:0.6rem;padding:2px 6px;border-radius:4px;cursor:pointer;border:1px solid var(--accent,#f80);' +
          (active ? 'background:var(--accent,#f80);color:#000;font-weight:700;' : 'background:var(--surface);color:var(--text);') +
          '">Top:' + t + '(' + topSet[t] + ')</button> ';
      });
      degRow.innerHTML = html;
      degRow.style.display = '';
      degRow.style.padding = '2px 8px';
      degRow.style.display = 'flex';
      degRow.style.gap = '4px';
      degRow.style.flexWrap = 'wrap';
    } else {
      degRow.innerHTML = '';
      degRow.style.display = 'none';
    }
  }
}

// ========================================
// STOCK VOICING ENGINE
// ========================================

// Map builder quality name → stock JSON category + subtype
function getStockMapping(quality) {
  if (!quality) return null;
  var n = quality.name;
  // Major family
  if (n === '' || n === 'Maj') return { cat: 'major', sub: 'Maj7' };
  if (n === '\u25B37') return { cat: 'major', sub: 'Maj7' };
  if (n === '6') return { cat: 'major', sub: 'Maj6' };
  // Minor family
  if (n === 'm') return { cat: 'minor', sub: 'Min7' };
  if (n === 'm7') return { cat: 'minor', sub: 'Min7' };
  if (n === 'm\u25B37') return { cat: 'minor', sub: 'MinMaj7' };
  if (n === 'm6') return { cat: 'minor', sub: 'Min6' };
  // Dominant family
  if (n === '7') return { cat: 'dominant', sub: 'Dom7' };
  // Half-diminished
  if (n === 'm7(b5)') return { cat: 'halfDiminished', sub: 'Min7b5' };
  // Diminished
  if (n === 'dim' || n === 'dim7') return { cat: 'diminished', sub: 'Dim7' };
  // Aug
  if (n === 'aug') return { cat: 'dominant', sub: 'Aug7' };
  return null;
}

function updateStockMatches() {
  if (!StockState.data || !BuilderState.quality) {
    StockState.currentMatches = [];
    StockState.currentIndex = -1;
    return;
  }
  var mapping = getStockMapping(BuilderState.quality);
  if (!mapping) {
    StockState.currentMatches = [];
    StockState.currentIndex = -1;
    return;
  }
  StockState.currentCategory = mapping.cat;
  StockState.currentSubtype = mapping.sub;
  var catData = StockState.data[mapping.cat];
  if (!catData) { StockState.currentMatches = []; StockState.currentIndex = -1; return; }

  // Collect all voicings from matching subtype
  var matches = [];
  // Primary subtype
  if (catData[mapping.sub]) {
    matches = matches.concat(catData[mapping.sub]);
  }
  // Also check tension-extended subtypes (e.g. Min9, Min11 for Min7)
  var keys = Object.keys(catData);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] !== mapping.sub && catData[keys[i]]) {
      matches = matches.concat(catData[keys[i]]);
    }
  }
  // Also add rootless and spread voicings if they have applicable entries
  if (mapping.cat === 'major' || mapping.cat === 'minor' || mapping.cat === 'dominant') {
    var rootless = StockState.data.rootless;
    var spread = StockState.data.spread;
    if (rootless) {
      var typeA = rootless.TypeA || [];
      var typeB = rootless.TypeB || [];
      var all = typeA.concat(typeB);
      for (var j = 0; j < all.length; j++) {
        // Match by category keyword in name
        var nm = all[j].name.toLowerCase();
        if (mapping.cat === 'minor' && nm.indexOf('min') >= 0) matches.push(all[j]);
        else if (mapping.cat === 'dominant' && nm.indexOf('dom') >= 0) matches.push(all[j]);
        else if (mapping.cat === 'major' && nm.indexOf('maj') >= 0) matches.push(all[j]);
      }
    }
  }
  // Filter out note-only entries (empty LH+RH)
  StockState.currentMatches = matches.filter(function(v) {
    return (v.LH && v.LH.length > 0) || (v.RH && v.RH.length > 0);
  });
  StockState.currentIndex = -1;
}

function stockDegreesToMidi(rootMidi, degrees) {
  // Convert degree array to MIDI notes, each note above previous (same as buildTastyVoicing)
  return buildTastyVoicing(rootMidi, degrees);
}

function cycleStock(reverse) {
  if (!StockState.enabled || StockState.currentMatches.length === 0) return;
  var len = StockState.currentMatches.length;
  StockState.currentIndex = reverse
    ? (StockState.currentIndex - 1 + len) % len
    : (StockState.currentIndex + 1) % len;
  var entry = StockState.currentMatches[StockState.currentIndex];

  // Convert LH/RH degrees to MIDI notes
  // LH starts from root C1 (24), RH from root C2 (36) — fixed positions for piano display
  var rootPC = BuilderState.root;
  var lhRoot = 24 + rootPC;
  var rhRoot = 36 + rootPC;
  StockState.lhMidi = entry.LH && entry.LH.length > 0 ? stockDegreesToMidi(lhRoot, entry.LH) : [];
  StockState.rhMidi = entry.RH && entry.RH.length > 0 ? stockDegreesToMidi(rhRoot, entry.RH) : [];

  // Build degree map for all notes
  var degMap = {};
  if (entry.LH) {
    for (var i = 0; i < entry.LH.length && i < StockState.lhMidi.length; i++) {
      degMap[StockState.lhMidi[i]] = entry.LH[i];
    }
  }
  if (entry.RH) {
    for (var j = 0; j < entry.RH.length && j < StockState.rhMidi.length; j++) {
      degMap[StockState.rhMidi[j]] = entry.RH[j];
    }
  }
  StockState.degreeMap = degMap;

  updateStockUI();
  render();
  // Play all notes
  var allNotes = StockState.lhMidi.concat(StockState.rhMidi);
  playMidiNotes(allNotes);
}

function toggleStock() {
  if (!StockState.hpsUnlocked || !StockState.data) return;
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) return;

  if (StockState.enabled) {
    disableStock();
  } else {
    // Disable TASTY if active (mutually exclusive)
    if (TastyState.enabled) disableTasty();
    StockState.enabled = true;
    updateStockMatches();
    if (StockState.currentMatches.length > 0) {
      cycleStock();
    } else {
      StockState.enabled = false;
      updateStockUI();
    }
  }
}

function disableStock() {
  if (!StockState.enabled) return;
  StockState.enabled = false;
  StockState.currentIndex = -1;
  StockState.lhMidi = [];
  StockState.rhMidi = [];
  StockState.degreeMap = {};
  // Clean up Stock reflect
  if (typeof _stockReflectMode !== 'undefined' && _stockReflectMode) {
    _stockReflectMode = false;
    _voicingAltMode = 0;
    _instrumentMidiSet = null;
    _instrumentPadSet = null;
    _voicingLayoutCount = 1;
  }
  updateStockUI();
  render();
}

function getStockInfoText() {
  if (!StockState.enabled || StockState.currentIndex < 0) return '';
  var entry = StockState.currentMatches[StockState.currentIndex];
  if (!entry) return '';
  // Chord name from builder + all degrees (bottom to top, LH then RH merged)
  var chord = getBuilderChordName() || '';
  var allDegrees = (entry.LH || []).concat(entry.RH || []);
  return allDegrees.length > 0 ? chord + ' ' + allDegrees.join('-') : chord;
}

function updateStockUI() {
  var bar = document.getElementById('stock-bar');
  if (!bar) return;
  bar.style.display = StockState.hpsUnlocked ? '' : 'none';

  var btn = document.getElementById('btn-stock');
  if (btn) btn.classList.toggle('active', StockState.enabled);

  var counter = document.getElementById('stock-counter');
  var info = document.getElementById('stock-info');
  var prevBtn = document.getElementById('btn-stock-prev');
  var nextBtn = document.getElementById('btn-stock-next');

  var reflectBtn = document.getElementById('stock-reflect-btn');
  if (StockState.enabled && StockState.currentIndex >= 0) {
    if (counter) counter.textContent = (StockState.currentIndex + 1) + '/' + StockState.currentMatches.length;
    if (info) info.textContent = getStockInfoText();
    if (prevBtn) prevBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';
    if (reflectBtn) reflectBtn.style.display = 'inline-block';
  } else {
    if (counter) counter.textContent = '';
    if (info) info.textContent = '';
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (reflectBtn) reflectBtn.style.display = 'none';
  }
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  baseMidi, pitchClass, noteName, midiNote,
  calcVoicingOffsets, getBassCase, applyOnChordBass,
  calcAllVoicingPositions, calcVoicingPositions,
  getShellIntervals, applyTension, getBuilderPCS,
  chordDegreeName, getDiatonicTetrads, getBuilderChordName,
  findParentScales, fifthsDistance, noteNameForKey,
  getTastyCategory, findQualityByName, toggleTasty, cycleTasty,
  disableTasty, updateTastyMatches, getTastyDiffText, updateTastyUI, setTastyTopFilter,
  buildTastyVoicing, buildTastyDegreeMap, getTastyLabels, splitByPadRange, findBestPosition, TASTY_DEGREE_MAP,
  getTastyDegreeCategory, renderTastyDegreeBadges,
};

