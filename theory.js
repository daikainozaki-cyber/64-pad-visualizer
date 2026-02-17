// ========================================
// PAD GRID FUNCTIONS
// ========================================
function baseMidi() { return BASE_MIDI + AppState.octaveShift * 12; }

function shiftOctave(delta) {
  const next = AppState.octaveShift + delta;
  if (next < -1 || next > 3) return;
  AppState.octaveShift = next;
  resetVoicingSelection();
  updateOctaveLabel();
  render();
}

function updateOctaveLabel() {
  const lo = baseMidi();
  const hi = lo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  document.getElementById('oct-label').textContent = noteName(lo) + ' — ' + noteName(hi);
  document.getElementById('oct-down').disabled = (AppState.octaveShift <= -1);
  document.getElementById('oct-up').disabled = (AppState.octaveShift >= 3);
}

function toggleOmit5() { VoicingState.omit5 = !VoicingState.omit5; VoicingState.shell = null; updateVoicingButtons(); render(); playCurrentChord(); }
function toggleRootless() { VoicingState.rootless = !VoicingState.rootless; VoicingState.shell = null; updateVoicingButtons(); render(); playCurrentChord(); }
function toggleOmit3() { VoicingState.omit3 = !VoicingState.omit3; VoicingState.shell = null; updateVoicingButtons(); render(); playCurrentChord(); }
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
  updateVoicingButtons(); render();
  playCurrentChord();
}
function setInversion(inv) {
  VoicingState.inversion = inv;
  VoicingState.shell = null;
  resetVoicingSelection();
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function setDrop(drop) {
  VoicingState.drop = VoicingState.drop === drop ? null : drop;
  VoicingState.shell = null;
  resetVoicingSelection();
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
      let bassMidi = 36 + BuilderState.bass;
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
    render();
    playVoicingBoxAudio(idx);
  } else if (hasCycle) {
    // Case 2: Already selected + has alternatives -> cycle to next
    const nextAlt = (box.currentAlt + 1) % box.alternatives.length;
    VoicingState.cycleIndices[idx] = nextAlt;
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

  // Convert to MIDI (root at C3 = MIDI 48)
  const rootMidi = 48 + rootPC;
  const midiNotes = intervals.map(o => rootMidi + o);
  // Add bass note for slash chords
  if (BuilderState.bass !== null) {
    midiNotes.unshift(36 + BuilderState.bass);
  }
  playMidiNotes(midiNotes, 2);
}


// ========================================
// VOICING CALCULATION
// ========================================

// Extract shell voicing intervals (R, 3rd, 7th + extensions)
// Returns sorted interval array, or null if 3rd/7th not found
function getShellIntervals(qualityPCS, shellMode, extension, fullPCS) {
  let thirdIv = null, seventhIv = null;
  if (qualityPCS) {
    if (qualityPCS.includes(4)) thirdIv = 4;
    else if (qualityPCS.includes(3)) thirdIv = 3;
    if (qualityPCS.includes(11)) seventhIv = 11;
    else if (qualityPCS.includes(10)) seventhIv = 10;
    else if (qualityPCS.includes(9) && !qualityPCS.includes(10) && !qualityPCS.includes(11)) {
      seventhIv = 9;
    }
  }
  if (thirdIv === null || seventhIv === null) return null;
  let intervals = [0, thirdIv, seventhIv];
  // Auto-include tension intervals (compound intervals >= 12)
  if (fullPCS) {
    fullPCS.filter(iv => iv >= 12).forEach(iv => {
      if (!intervals.includes(iv)) intervals.push(iv);
    });
  }
  if (extension > 0 && fullPCS) {
    const shellSet = new Set(intervals.map(iv => iv % 12));
    const extras = fullPCS.filter(iv => !shellSet.has(iv)).sort((a, b) => {
      const at = a >= 12 ? 0 : 1;
      const bt = b >= 12 ? 0 : 1;
      if (at !== bt) return at - bt;
      return a - b;
    });
    const extCount = Math.min(extension, extras.length);
    for (let i = 0; i < extCount; i++) intervals.push(extras[i]);
  }
  if (shellMode === '173') {
    intervals = intervals.map(iv => iv === thirdIv ? iv + 12 : iv);
  }
  intervals.sort((a, b) => a - b);
  return intervals;
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
      boxes.push({ midi, alternatives: filtered });
    }
  }
  boxes.sort((a, b) => a.midi - b.midi);
  // Build lastBoxes with alternatives and current cycling index
  const cycleableSet = new Set();
  VoicingState.lastBoxes = boxes.map((b, idx) => {
    const altIdx = VoicingState.cycleIndices[idx] || 0;
    const safeIdx = altIdx < b.alternatives.length ? altIdx : 0;
    const currentVP = b.alternatives[safeIdx];
    if (b.alternatives.length > 1) cycleableSet.add(idx);
    return {
      midiNotes: currentVP.positions.map(p => baseMidi() + p.row * ROW_INTERVAL + p.col).sort((a, b) => a - b),
      alternatives: b.alternatives,
      currentAlt: safeIdx
    };
  });
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
  let voiced = [...chordPCS].sort((a, b) => a - b);
  // Apply inversion: rotate bottom notes up an octave
  for (let i = 0; i < inversion && i < voiced.length; i++) {
    voiced.push(voiced.shift() + 12);
  }
  // Apply drop: move Nth from top down an octave
  if (drop === 'drop2' && voiced.length >= 4) {
    const idx = voiced.length - 2;
    voiced[idx] -= 12;
    voiced.sort((a, b) => a - b);
  } else if (drop === 'drop3' && voiced.length >= 4) {
    const idx = voiced.length - 3;
    voiced[idx] -= 12;
    voiced.sort((a, b) => a - b);
  }
  // bassInterval: the interval of the lowest note relative to chord root
  const bassInterval = voiced[0];
  const minVal = voiced[0];
  const offsets = voiced.map(v => v - minVal);
  return { offsets, bassInterval, voiced };
}

// On-chord bass: determine if bass is a chord tone (Case 1) or not (Case 2)
function getBassCase(bassPC, rootPC, chordPCS) {
  const bassIv = ((bassPC - rootPC) % 12 + 12) % 12;
  const sorted = [...new Set(chordPCS.map(iv => iv % 12))].sort((a, b) => a - b);
  const idx = sorted.indexOf(bassIv);
  return { isChordTone: idx >= 0, inversionIndex: idx >= 0 ? idx : null };
}

// On-chord bass: insert bass note below the voiced intervals
function applyOnChordBass(voiced, rootPC, bassPC) {
  const bassIv = ((bassPC - rootPC) % 12 + 12) % 12;
  const lowestPC = ((voiced[0] % 12) + 12) % 12;
  if (lowestPC === bassIv) return voiced;
  let bassVal = bassIv;
  while (bassVal >= voiced[0]) bassVal -= 12;
  return [bassVal, ...voiced].sort((a, b) => a - b);
}

// Generalized voicing position calculator - returns ALL valid positions (sorted by compactness)
function calcAllVoicingPositions(bassRow, bassCol, offsets, maxResults) {
  if (maxResults === undefined) maxResults = 10;
  const bm = baseMidi();
  const bassMidi2 = bm + bassRow * ROW_INTERVAL + bassCol;
  const candidates = offsets.slice(1).map(offset => {
    const targetMidi = bassMidi2 + offset;
    const positions = [];
    for (let r = 0; r < ROWS; r++) {
      const c = targetMidi - bm - r * ROW_INTERVAL;
      if (c >= 0 && c < COLS) positions.push({ row: r, col: c });
    }
    return positions;
  });
  if (candidates.some(c => c.length === 0)) return [];
  const bassPos = { row: bassRow, col: bassCol };
  const results = [];
  function search(idx, chosen) {
    if (idx === candidates.length) {
      const all = [bassPos, ...chosen];
      const minR = Math.min(...all.map(p => p.row));
      const maxR = Math.max(...all.map(p => p.row));
      const minC = Math.min(...all.map(p => p.col));
      const maxC = Math.max(...all.map(p => p.col));
      const rowSpan = maxR - minR + 1, colSpan = maxC - minC + 1;
      if (rowSpan > 5 || colSpan > 6) return;
      const maxDim = Math.max(rowSpan, colSpan);
      const area = rowSpan * colSpan;
      results.push({ positions: all, minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC, maxDim, area });
      return;
    }
    for (const pos of candidates[idx]) search(idx + 1, [...chosen, pos]);
  }
  search(0, []);
  results.sort((a, b) => a.maxDim - b.maxDim || a.area - b.area);
  return results.slice(0, maxResults);
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
function pitchClass(midi) { return ((midi % 12) + 12) % 12; }
function noteName(midi) { return NOTE_NAMES_SHARP[pitchClass(midi)] + (Math.floor(midi / 12) - 2); }

// ======== TENSION APPLICATION ========
function applyTension(basePCS, mods) {
  let pcs = [...basePCS];
  if (mods.replace3 !== undefined) {
    pcs = pcs.filter(p => p !== 3 && p !== 4);
    if (!pcs.includes(mods.replace3)) pcs.push(mods.replace3);
  }
  if (mods.sharp5) {
    const i = pcs.indexOf(7);
    if (i >= 0) pcs[i] = 8;
    else if (!pcs.includes(8)) pcs.push(8);
  }
  if (mods.flat5) {
    const i = pcs.indexOf(7);
    if (i >= 0) pcs[i] = 6;
    else if (!pcs.includes(6)) pcs.push(6);
  }
  if (mods.add) {
    for (const pc of mods.add) {
      // Tensions go above the basic chord (compound intervals: +12)
      if (!pcs.some(p => p % 12 === pc)) pcs.push(pc + 12);
    }
  }
  if (mods.omit3) { pcs = pcs.filter(p => p !== 3 && p !== 4); }
  if (mods.omit5) { pcs = pcs.filter(p => p !== 6 && p !== 7 && p !== 8); }
  return pcs.sort((a, b) => a - b);
}

// ======== GET ACTIVE PCS FOR CHORD BUILDER ========
function getBuilderPCS() {
  if (BuilderState.root === null || !BuilderState.quality) return null;
  let pcs = [...BuilderState.quality.pcs];
  if (BuilderState.tension) pcs = applyTension(pcs, BuilderState.tension.mods);
  return pcs;
}

function getBuilderChordName() {
  if (BuilderState.root === null) return '';
  let name = pcName(BuilderState.root);
  if (BuilderState.quality) name += BuilderState.quality.name;
  if (BuilderState.tension) {
    let tl = BuilderState.tension.label.replaceAll(')\n(', ',').replace(/\n/g, '');
    // In 7th chord context, b5 → #11 (tension notation, not quality alteration)
    const has7th = BuilderState.quality && (
      BuilderState.quality.pcs.includes(10) || BuilderState.quality.pcs.includes(11) ||
      (BuilderState.quality.pcs.includes(9) && BuilderState.quality.pcs.includes(6))
    );
    if (has7th) {
      if (tl === 'b5') {
        tl = '#11';
      } else if (tl.startsWith('b5(') || tl.startsWith('b5,')) {
        const inner = tl.slice(2).replace(/[()]/g, '');
        const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
        parts.push('#11');
        const ORDER = {'b9':1,'#9':2,'9':3,'11':4,'#11':5,'b13':6,'13':7};
        parts.sort((a, b) => (ORDER[a] || 99) - (ORDER[b] || 99));
        tl = parts.join(',');
      }
    }
    // aug → (#5): "aug" is triad name only. On non-Maj qualities, use (#5) notation
    if (BuilderState.quality && BuilderState.quality.name !== '') {
      if (tl === 'aug') {
        tl = '(#5)';
      } else if (tl.startsWith('aug(')) {
        const inner = tl.slice(4, -1);
        const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
        parts.push('#5');
        const ORDER = {'#5':0,'b9':1,'#9':2,'9':3,'11':4,'#11':5,'b13':6,'13':7};
        parts.sort((a, b) => (ORDER[a] || 99) - (ORDER[b] || 99));
        tl = '(' + parts.join(',') + ')';
      }
    }
    const noWrap = tl.startsWith('(') || tl.startsWith('sus') || tl.startsWith('aug') ||
                   tl.startsWith('add') || tl.startsWith('b5') || tl.startsWith('6');
    if (noWrap) {
      name += tl;
    } else {
      name += '(' + tl + ')';
    }
  }
  if (BuilderState.bass !== null) {
    name += '/' + pcName(BuilderState.bass);
  }
  return name;
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
    // Individual pad frames for selected box
    if (sel) {
      vp.positions.forEach(pos => {
        const px = MARGIN + pos.col * (PAD_SIZE + PAD_GAP) - 2;
        const py = MARGIN + (ROWS - 1 - pos.row) * (PAD_SIZE + PAD_GAP) - 2;
        const padRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        padRect.setAttribute('x', px); padRect.setAttribute('y', py);
        padRect.setAttribute('width', PAD_SIZE + 4); padRect.setAttribute('height', PAD_SIZE + 4);
        padRect.setAttribute('rx', 6); padRect.setAttribute('fill', 'none');
        padRect.setAttribute('stroke', '#fff'); padRect.setAttribute('stroke-width', 2.5);
        svg.appendChild(padRect);
      });
    }
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
  const parentKey = getParentMajorKey(AppState.scaleIdx, key);
  return FLAT_MAJOR_KEYS.has(parentKey) ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
}

function getDiatonicTetrads(scalePCS, key) {
  if (scalePCS.length !== 7) return [];
  const ROMAN = ['I','II','III','IV','V','VI','VII'];
  const tetrads = [];
  for (let i = 0; i < 7; i++) {
    const rootIv = scalePCS[i];
    const i3 = ((scalePCS[(i + 2) % 7] - rootIv) + 12) % 12;
    const i5 = ((scalePCS[(i + 4) % 7] - rootIv) + 12) % 12;
    const i7 = ((scalePCS[(i + 6) % 7] - rootIv) + 12) % 12;
    const pcs = [0, i3, i5, i7];

    // Match to BUILDER_QUALITIES (4-note entries only)
    let quality = null;
    for (const row of BUILDER_QUALITIES) {
      for (const q of row) {
        if (q && q.pcs.length === 4 &&
            q.pcs[1] === i3 && q.pcs[2] === i5 && q.pcs[3] === i7) {
          quality = q; break;
        }
      }
      if (quality) break;
    }
    // augMaj7 is not in BUILDER_QUALITIES
    if (!quality && i3 === 4 && i5 === 8 && i7 === 11) {
      quality = {name:'aug\u25B37', label:'aug\u25B37', pcs:[0,4,8,11]};
    }
    if (!quality) quality = {name:'?', label:'?', pcs: pcs};

    const rootPC = (rootIv + key) % 12;
    const chordName = noteNameForKey(rootPC, key) + quality.name;

    // Degree label (uppercase = major/dom, lowercase = minor/dim)
    let roman = ROMAN[i];
    let suffix;
    switch (quality.name) {
      case '\u25B37': suffix = '\u25B37'; break;           // △7
      case '7':       suffix = '7'; break;
      case 'm7':      roman = roman.toLowerCase(); suffix = '7'; break;
      case 'm\u25B37': roman = roman.toLowerCase(); suffix = '\u25B37'; break; // m△7
      case 'm7(b5)':  roman = roman.toLowerCase(); suffix = '\u00F87'; break;  // ø7
      case 'dim7':    roman = roman.toLowerCase(); suffix = '\u00B07'; break;  // °7
      case 'aug\u25B37': suffix = '+\u25B37'; break;       // aug△7
      default:        suffix = ''; break;
    }
    const degree = roman + suffix;

    tetrads.push({ rootPC, pcs, quality, chordName, degree });
  }
  return tetrads;
}

function renderDiatonicBar() {
  const bar = document.getElementById('diatonic-bar');
  if (!bar) return;
  if (AppState.mode === 'plain') {
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
  const tetrads = getDiatonicTetrads(scale.pcs, AppState.key);
  bar.innerHTML = '';
  tetrads.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    // Highlight if current chord matches this diatonic chord
    if (AppState.mode === 'chord' && BuilderState.root === t.rootPC && BuilderState.quality &&
        BuilderState.quality.name === t.quality.name && !BuilderState.tension) {
      btn.classList.add('active');
    }
    btn.innerHTML = '<div>' + t.chordName + '</div><div class="degree">' + t.degree + '</div>';
    btn.onclick = () => onDiatonicClick(t);
    bar.appendChild(btn);
  });
}

// ========================================
// PARENT SCALE REVERSE LOOKUP
// ========================================

function fifthsDistance(key1, key2) {
  const d = ((key2 - key1) * 7 + 144) % 12;
  return Math.min(d, 12 - d);
}

function psKeyName(entry) {
  const relMajor = entry.system === '○' ? entry.parentKey : (entry.parentKey + 3) % 12;
  return FLAT_MAJOR_KEYS.has(relMajor) ? NOTE_NAMES_FLAT[entry.parentKey] : NOTE_NAMES_SHARP[entry.parentKey];
}

function getParentScaleAbsPCS(entry) {
  let scalePCS;
  if (entry.system === '○') scalePCS = SCALES[0].pcs;
  else if (entry.system === 'NM') scalePCS = SCALES[5].pcs;
  else if (entry.system === '■') scalePCS = SCALES[7].pcs;
  else scalePCS = SCALES[14].pcs;
  return new Set(scalePCS.map(pc => (pc + entry.parentKey) % 12));
}

function psDegreeLabel(degreeNum, quality) {
  const ROMAN = ['I','II','III','IV','V','VI','VII'];
  let roman = ROMAN[degreeNum - 1];
  const name = quality.name;
  if (name.startsWith('m') || name === 'dim' || name === 'dim7') {
    roman = roman.toLowerCase();
  }
  let suffix = '';
  switch (name) {
    case '\u25B37': suffix = '\u25B37'; break;
    case '7': suffix = '7'; break;
    case 'm7': suffix = '7'; break;
    case 'm\u25B37': suffix = '\u25B37'; break;
    case 'm7(b5)': suffix = '\u00F87'; break;
    case 'dim7': suffix = '\u00B07'; break;
    case 'aug\u25B37': suffix = '+\u25B37'; break;
    default: break;
  }
  return roman + suffix;
}

const DIATONIC_CHORD_DB = (function() {
  const db = {};
  const SYSTEMS = [
    { cat: '○', label: 'Major', baseIdx: 0, scalePCS: SCALES[0].pcs },
    { cat: '■', label: 'Harm.Min', baseIdx: 7, scalePCS: SCALES[7].pcs },
    { cat: '◆', label: 'Mel.Min', baseIdx: 14, scalePCS: SCALES[14].pcs },
  ];
  for (const sys of SYSTEMS) {
    for (let key = 0; key < 12; key++) {
      const tetrads = getDiatonicTetrads(sys.scalePCS, key);
      for (let i = 0; i < tetrads.length; i++) {
        const t = tetrads[i];
        const degreeNum = i + 1;
        if (!db[t.rootPC]) db[t.rootPC] = [];
        db[t.rootPC].push({
          parentKey: key, system: sys.cat, systemLabel: sys.label,
          degreeNum, scaleName: SCALES[sys.baseIdx + i].name,
          scaleIdx: sys.baseIdx + i, rootPC: t.rootPC,
          quality: t.quality, tetradPCS: t.quality.pcs,
        });
        // Generate Natural Minor entry from Major system
        if (sys.cat === '○') {
          db[t.rootPC].push({
            parentKey: (key + 9) % 12, system: 'NM', systemLabel: 'Nat.Min',
            degreeNum: ((degreeNum + 1) % 7) + 1,
            scaleName: SCALES[i].name, scaleIdx: i, rootPC: t.rootPC,
            quality: t.quality, tetradPCS: t.quality.pcs,
          });
        }
      }
    }
  }
  return db;
})();

function findParentScales(rootPC, chordIntervals, currentKey) {
  const entries = DIATONIC_CHORD_DB[rootPC];
  if (!entries) return [];
  const results = [];
  const strictKeys = new Set(); // track strict matches to avoid duplicates in omit5

  for (const entry of entries) {
    // Check all chord tones (mod 12) are contained in the parent scale
    const scaleAbsPCS = getParentScaleAbsPCS(entry);
    let allIn = true;
    for (const iv of chordIntervals) {
      const absPC = (iv + rootPC) % 12;
      if (!scaleAbsPCS.has(absPC)) { allIn = false; break; }
    }
    if (!allIn) continue;
    const key = entry.parentKey + ':' + entry.scaleIdx;
    strictKeys.add(key);
    const sat = SCALE_AVAIL_TENSIONS[entry.scaleIdx];
    const avoidCount = (sat && sat.avoid) ? sat.avoid.length : 0;
    results.push({
      parentKey: entry.parentKey, parentKeyName: psKeyName(entry),
      system: entry.system, systemLabel: entry.systemLabel,
      degree: psDegreeLabel(entry.degreeNum, entry.quality),
      degreeNum: entry.degreeNum, scaleName: entry.scaleName,
      scaleIdx: entry.scaleIdx, distance: fifthsDistance(currentKey, entry.parentKey),
      omit5Match: false, avoidCount,
    });
  }

  // Omit-5 matching: if chord has perfect 5th (interval 7), also search without it
  if (chordIntervals.has(7)) {
    const omit5Intervals = new Set(chordIntervals);
    omit5Intervals.delete(7);
    for (const entry of entries) {
      const key = entry.parentKey + ':' + entry.scaleIdx;
      if (strictKeys.has(key)) continue; // already a strict match
      const scaleAbsPCS = getParentScaleAbsPCS(entry);
      let allIn = true;
      for (const iv of omit5Intervals) {
        const absPC = (iv + rootPC) % 12;
        if (!scaleAbsPCS.has(absPC)) { allIn = false; break; }
      }
      if (!allIn) continue;
      const sat2 = SCALE_AVAIL_TENSIONS[entry.scaleIdx];
      const avoidCount2 = (sat2 && sat2.avoid) ? sat2.avoid.length : 0;
      results.push({
        parentKey: entry.parentKey, parentKeyName: psKeyName(entry),
        system: entry.system, systemLabel: entry.systemLabel,
        degree: psDegreeLabel(entry.degreeNum, entry.quality),
        degreeNum: entry.degreeNum, scaleName: entry.scaleName,
        scaleIdx: entry.scaleIdx, distance: fifthsDistance(currentKey, entry.parentKey),
        omit5Match: true, avoidCount: avoidCount2,
      });
    }
  }

  const SYS_ORDER = { '○': 0, 'NM': 1, '■': 2, '◆': 3 };
  results.sort((a, b) =>
    (a.omit5Match - b.omit5Match) ||
    (a.distance - b.distance) || (SYS_ORDER[a.system] - SYS_ORDER[b.system]) || (a.degreeNum - b.degreeNum)
  );
  return results;
}

function onDiatonicClick(tetrad) {
  // Switch to Chord mode (direct manipulation to preserve builder state)
  AppState.mode = 'chord';
  document.getElementById('mode-scale').classList.toggle('active', false);
  document.getElementById('mode-chord').classList.toggle('active', true);
  document.getElementById('mode-plain').classList.toggle('active', false);
  document.getElementById('scale-panel').style.display = 'none';
  document.getElementById('chord-panel').style.display = '';
  document.getElementById('plain-panel').style.display = 'none';

  // Set builder state
  BuilderState._fromDiatonic = true;
  BuilderState.root = tetrad.rootPC;
  BuilderState.quality = tetrad.quality;
  BuilderState.tension = null;
  BuilderState.bass = null;
  resetVoicingSelection();

  // Update builder UI
  highlightPianoKey('piano-keyboard', tetrad.rootPC);
  highlightQuality(tetrad.quality);
  clearTensionSelection();
  updateControlsForQuality(tetrad.quality);
  setBuilderStep(2);
  render();
}

