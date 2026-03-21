// ========================================
// GENRE PRESET WEIGHTS (URL ?preset=jazz|bossa|funk)
// ========================================
var GENRE_WEIGHTS = {
  jazz:  { rootBass:60, fifthBass:0, rootStr6:20, rootStr5:30, rootStr4:40,
           top4:100, guideTone:50, openStr:0, stringCount:20, avgFret:6,
           span:10, gaps:15, fullFret:20 },
  bossa: { rootBass:70, fifthBass:60, openStr:25, top4:60, guideTone:40,
           avgFret:12, stringCount:35 },
  funk:  { rootBass:20, fifthBass:0, openStr:0, top4:120, guideTone:40,
           stringCount:20, span:20, gaps:25 }
};
var _presetParam = (typeof URLSearchParams !== 'undefined') ? new URLSearchParams(location.search).get('preset') : null;
var _presetWeights = _presetParam && GENRE_WEIGHTS[_presetParam] ? GENRE_WEIGHTS[_presetParam] : null;
var _presetNoOpen = _presetParam === 'funk';

function setGenrePreset(genre) {
  _presetWeights = genre && GENRE_WEIGHTS[genre] ? GENRE_WEIGHTS[genre] : null;
  _presetNoOpen = genre === 'funk';
  // Invalidate cache to force re-enumeration
  GuitarPositionState._lastKey = null;
  BassPositionState._lastKey = null;
  updateGuitarPositions();
  updateBassPositions();
  render();
}

// ========================================
// PAD GRID FUNCTIONS
// ========================================
function baseMidi() { return BASE_MIDI + AppState.octaveShift * 12 + AppState.semitoneShift; }

function setOctaveShift(value) {
  if (TastyState.enabled || StockState.enabled) return false;
  var clamped = Math.max(-1, Math.min(3, value));
  if (clamped === AppState.octaveShift) return false;
  AppState.octaveShift = clamped;
  updateOctaveLabel();
  return true;
}

function shiftOctave(delta) {
  if (!setOctaveShift(AppState.octaveShift + delta)) return;
  resetVoicingSelection();
  render();
  playCurrentChord();
  saveAppSettings();
}

function shiftSemitone(delta) {
  if (TastyState.enabled || StockState.enabled) return;
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
  // Voice count groups (3-voice, 4-voice, 5-voice)
  for (var vc = 3; vc <= 5; vc++) {
    var vcForms = [];
    for (var i = 0; i < alternatives.length; i++) {
      if (alternatives[i].stringCount === vc) vcForms.push(alternatives[i]);
    }
    if (vcForms.length > 0) {
      groups.push({ labelKey: 'pos.voice_' + vc, forms: vcForms });
    }
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
    GuitarPositionState.alternatives = padEnumGuitarChordForms(pcs, BuilderState.root, GUITAR_OPEN_MIDI, 21, 4, { maxResults: 30, weights: _presetWeights, noOpen: _presetNoOpen });
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
    BassPositionState.alternatives = padEnumGuitarChordForms(pcs, BuilderState.root, PAD_BASS_TUNING, 21, 4, { maxResults: 30, weights: _presetWeights, noOpen: _presetNoOpen });
    BassPositionState.groups = groupGuitarForms(BassPositionState.alternatives, PAD_BASS_TUNING, BuilderState.root);
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
  var extTogglesEl = document.getElementById('diatonic-ext-toggles');
  var extContainerEl = document.getElementById('diatonic-ext');
  if (AppState.mode === 'input') {
    bar.style.display = 'none';
    bar.innerHTML = '';
    if (extTogglesEl) extTogglesEl.style.display = 'none';
    if (extContainerEl) extContainerEl.innerHTML = '';
    return;
  }
  // Diatonic bar stays visible in chord mode for quick chord switching
  const scale = SCALES[AppState.scaleIdx];
  if (scale.pcs.length !== 7) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    if (extTogglesEl) extTogglesEl.style.display = 'none';
    if (extContainerEl) extContainerEl.innerHTML = '';
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
    btn.onclick = () => onDiatonicClick(t, i);
    bar.appendChild(btn);
  });

  // Extension toggles + bars
  var extToggles = document.getElementById('diatonic-ext-toggles');
  var extContainer = document.getElementById('diatonic-ext');
  if (!extToggles || !extContainer) return;
  extContainer.innerHTML = '';

  // Determine if current scale is one of the 3 minor types
  var isMinorVariant = [5, 7, 14].indexOf(AppState.scaleIdx) !== -1;

  // Show/hide toggles (always show for 7-note scales)
  extToggles.style.display = 'flex';

  // Show/hide minor-specific toggle
  var minorBtn = document.getElementById('ext-minor-btn');
  if (minorBtn) minorBtn.style.display = isMinorVariant ? '' : 'none';

  // Update toggle button states
  if (minorBtn) minorBtn.classList.toggle('active', AppState.showMinorVariants);
  var secdomBtn = document.getElementById('ext-secdom-btn');
  if (secdomBtn) secdomBtn.classList.toggle('active', AppState.showSecDom);
  var parallelBtn = document.getElementById('ext-parallel-btn');
  if (parallelBtn) parallelBtn.classList.toggle('active', AppState.showParallelKey);

  // Render extension bars
  if (AppState.showMinorVariants && isMinorVariant) {
    _renderMinorVariants(extContainer, noteCount);
  }
  if (AppState.showParallelKey) {
    _renderParallelKey(extContainer, noteCount);
  }
  if (AppState.showSecDom) {
    _renderSecondaryDominants(extContainer, tetrads);
  }
}

function toggleMinorVariants() {
  AppState.showMinorVariants = !AppState.showMinorVariants;
  renderDiatonicBar();
  saveAppSettings();
}
function toggleSecDom() {
  AppState.showSecDom = !AppState.showSecDom;
  renderDiatonicBar();
  saveAppSettings();
}
function toggleParallelKey() {
  AppState.showParallelKey = !AppState.showParallelKey;
  renderDiatonicBar();
  saveAppSettings();
}

// --- Extension bar helpers ---

function _createExtBar(container, label, tetrads, isCurrent) {
  var row = document.createElement('div');
  row.className = 'diatonic-ext-bar' + (isCurrent ? ' current' : '');
  var lbl = document.createElement('div');
  lbl.className = 'ext-label';
  lbl.textContent = label;
  row.appendChild(lbl);
  tetrads.forEach(function(t, i) {
    var btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    btn.innerHTML = '<span class="dia-num">' + (i + 1) + '</span><div>' + t.chordName + '</div><div class="degree">' + t.degree + '</div>';
    btn.onclick = function() { onDiatonicClick(t, i); };
    row.appendChild(btn);
  });
  container.appendChild(row);
}

function _renderMinorVariants(container, noteCount) {
  // NM is already shown in the main diatonic bar — only show HM and MM
  var minorScales = [
    { idx: 7, label: 'HM' },
    { idx: 14, label: 'MM' },
  ];
  minorScales.forEach(function(s) {
    var tetrads = getDiatonicTetrads(SCALES[s.idx].pcs, AppState.key, noteCount);
    _createExtBar(container, s.label, tetrads, AppState.scaleIdx === s.idx);
  });
}

function _renderSecondaryDominants(container, mainTetrads) {
  var row = document.createElement('div');
  row.className = 'diatonic-ext-bar';
  var lbl = document.createElement('div');
  lbl.className = 'ext-label';
  lbl.textContent = 'V7/';
  row.appendChild(lbl);

  // Find dominant 7th quality from BUILDER_QUALITIES
  var dom7quality = null;
  for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
    for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
      var q = BUILDER_QUALITIES[r][c];
      if (q && q.name === '7') { dom7quality = q; break; }
    }
    if (dom7quality) break;
  }
  if (!dom7quality) return;

  var parentKey = padGetParentMajorKey(0, AppState.key);

  // Build scale PCS set for checking if secdom root is diatonic
  var scalePCS = SCALES[AppState.scaleIdx].pcs;
  var scaleAbsSet = {};
  for (var si = 0; si < scalePCS.length; si++) {
    scaleAbsSet[(scalePCS[si] + AppState.key) % 12] = true;
  }
  var isMinorScale = [5, 7, 14].indexOf(AppState.scaleIdx) !== -1;

  mainTetrads.forEach(function(t, i) {
    var btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    var secDomRoot = (t.rootPC + 7) % 12;

    // Skip conditions:
    // 1. Tonic (i=0): V7→I is the primary dominant, not secondary
    // 2. SecDom root must be on the diatonic scale (definition requirement)
    var skip = (i === 0) ||
               !scaleAbsSet[secDomRoot];      // root not in diatonic scale

    if (skip) {
      btn.classList.add('secdom-empty');
      btn.innerHTML = '<div>—</div>';
    } else {
      var chordName = KEY_SPELLINGS[parentKey][secDomRoot] + '7';
      // Compute degree: interval from key root
      var interval = ((secDomRoot - AppState.key) + 12) % 12;
      var MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
      var ROMAN = ['I','II','III','IV','V','VI','VII'];
      var degreeIdx2 = MAJOR_INTERVALS.indexOf(interval);
      var degree;
      if (degreeIdx2 !== -1) {
        degree = ROMAN[degreeIdx2] + '7';
      } else {
        // Flatted degree
        var sharpIdx = MAJOR_INTERVALS.indexOf(interval + 1);
        if (sharpIdx !== -1) {
          degree = 'b' + ROMAN[sharpIdx] + '7';
        } else {
          degree = '?7';
        }
      }
      var targetQuality = t.quality; // resolution target quality
      btn.innerHTML = '<div>' + chordName + '</div><div class="degree">' + degree + '</div>';
      btn.onclick = function() {
        onDiatonicClick({ rootPC: secDomRoot, pcs: dom7quality.pcs, quality: dom7quality, chordName: chordName, degree: degree }, i);
        // Override: secdom is non-diatonic, force Practical sort only
        BuilderState._fromDiatonic = false;
        BuilderState._fromSecDom = true;
        // Resolution target: major or minor? Determines scale priority
        BuilderState._secDomTargetIsMajor = targetQuality.name.indexOf('m') !== 0; // 'm7','m△7' = minor, others = major
        AppState.psSortMode = 'practical';
        render();
      };
    }
    row.appendChild(btn);
  });
  container.appendChild(row);
}

function _renderParallelKey(container, noteCount) {
  var isMinor = [5, 7, 14].indexOf(AppState.scaleIdx) !== -1;
  // Also treat all ○ modes as major-side, ■/◆ as minor-side
  if (!isMinor && AppState.scaleIdx >= 0 && AppState.scaleIdx <= 6) {
    // Major side → show natural minor
    var tetrads = getDiatonicTetrads(SCALES[5].pcs, AppState.key, noteCount);
    var keyName = KEY_SPELLINGS[padGetParentMajorKey(0, AppState.key)][AppState.key];
    _createExtBar(container, keyName + 'm', tetrads, false);
  } else if (isMinor) {
    // Minor side → show major
    var tetrads = getDiatonicTetrads(SCALES[0].pcs, AppState.key, noteCount);
    var keyName = KEY_SPELLINGS[padGetParentMajorKey(0, AppState.key)][AppState.key];
    _createExtBar(container, keyName, tetrads, false);
  }
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

function onDiatonicClick(tetrad, degreeIdx) {
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
  BuilderState._diatonicScaleIdx = degreeIdx; // 0=Ionian, 1=Dorian, 2=Phrygian...
  BuilderState.root = tetrad.rootPC;
  BuilderState.quality = tetrad.quality;
  BuilderState.tension = null;
  BuilderState.bass = null;
  resetVoicingSelection();

  // Update builder UI
  updateKeyButtons();
  updateRootButtons();
  highlightQuality(tetrad.quality);
  clearTensionSelection();
  updateControlsForQuality(tetrad.quality);
  setBuilderStep(2);
  render();
  updateTastyUI();
}


// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  baseMidi, pitchClass, noteName, midiNote,
  calcVoicingOffsets, getBassCase, applyOnChordBass,
  calcAllVoicingPositions, calcVoicingPositions,
  getShellIntervals, applyTension, getBuilderPCS,
  chordDegreeName, getDiatonicTetrads, getBuilderChordName,
  findParentScales, fifthsDistance, noteNameForKey,
};
