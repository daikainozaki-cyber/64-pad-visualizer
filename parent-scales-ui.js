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

function findBestAutoSelect(results, isSecDom, isHybrid) {
  if (AppState.psSortMode === 'practical') {
    if (isSecDom) {
      if (BuilderState._fromSecDom) {
        // SecDom bar click: sort already boosted by resolution target — use top result
        var top = results.find(function(r) { return r.secDomBoost > 0 && !r.omit5Match; });
        if (top) return top;
      }
      var lydb7 = results.find(function(r) { return r.scaleIdx === 17 && r.exactMatch && !r.omit5Match; });
      if (lydb7) return lydb7;
    }
    if (isHybrid) {
      var mixo = results.find(function(r) { return r.degreeNum === 5 && r.system === '\u25CB' && r.exactMatch && !r.omit5Match; });
      if (mixo) return mixo;
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
  let _isHybridChord = false;

  if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality !== null) {
    // Fingerprint always from BuilderState (chord-change detection, triggers padExtNotes.clear())
    newFPSource = BuilderState.root + ':' +
      (BuilderState.quality ? BuilderState.quality.name : '') + ':' +
      (BuilderState.tension ? BuilderState.tension.label : '') + ':' +
      (BuilderState.bass !== null ? BuilderState.bass : '');

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

      // Hybrid chord reinterpretation: when bass note is NOT a chord tone,
      // reinterpret with bass as root for Available Scale calculation.
      // Inversion (bass IS a chord tone) keeps the original root.
      if (BuilderState.bass !== null) {
        const chordAbsPCs = fullPCS ? fullPCS.map(iv => (iv + BuilderState.root) % 12) : [];
        if (!chordAbsPCs.includes(BuilderState.bass)) {
          // Hybrid chord: bass is not a chord tone → reinterpret
          psRoot = BuilderState.bass;
          const allAbsPCs = new Set(chordAbsPCs);
          allAbsPCs.add(BuilderState.bass);
          qualityIntervals = new Set([...allAbsPCs].map(pc => ((pc - psRoot) + 12) % 12));
          fullAbsSet = allAbsPCs;
          hasTension = true; // reinterpreted chords typically have extensions
          _isHybridChord = true;
        }
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
  toggleWrap.style.visibility = show ? '' : 'hidden';

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

  // Secondary dominant: boost scale based on resolution target quality
  var _isSecDom = BuilderState._fromSecDom || isSecondaryDominant(qualityIntervals, _psResults);
  _psResults.forEach(function(r) {
    r.secDomBoost = 0;
    if (!_isSecDom || r.omit5Match) return;
    if (BuilderState._fromSecDom && BuilderState._secDomTargetIsMajor !== undefined) {
      if (BuilderState._secDomTargetIsMajor) {
        // Resolves to major → Mixolydian (V7 ← Major)
        if (r.degreeNum === 5 && r.system === '\u25CB') r.secDomBoost = 2; // Mixolydian
      } else {
        // Resolves to minor → HMP5↓ (Phrygian Dominant) or Altered
        if (r.scaleIdx === 11) r.secDomBoost = 2;  // ■5 Phrygian Dominant (HMP5↓)
        if (r.scaleIdx === 20) r.secDomBoost = 2;  // ◆7 Super Locrian (Altered)
      }
    } else {
      // Generic secdom detection (no resolution info): boost Lydian b7 as before
      if (r.scaleIdx === 17) r.secDomBoost = 1;
    }
  });

  // Hybrid chord boost: hybrid chords (non-chord-tone bass) create a dominant space.
  // The absence of 3rd makes Dorian/Mixolydian equally valid by interval matching,
  // but Mixolydian (V7 scale) is the correct first choice because the bass note
  // establishes a dominant function. (Triad pair theory: C/D → G Major → D Mixolydian)
  _psResults.forEach(function(r) {
    r.hybridBoost = (_isHybridChord && r.degreeNum === 5 && r.system === '\u25CB' && !r.omit5Match) ? 1 : 0;
  });

  // Re-sort: exact matches first, then by mode-specific criteria
  const SYS = { '\u25CB': 0, 'NM': 1, '\u25A0': 2, '\u25C6': 3 };
  if (AppState.psSortMode === 'practical') {
    // Practical: exactMatch → omit5 → secDomBoost/hybridBoost → distance → system → avoidCount → degreeNum
    _psResults.sort((a, b) =>
      (b.exactMatch - a.exactMatch) ||
      (a.omit5Match - b.omit5Match) ||
      (b.secDomBoost - a.secDomBoost) ||
      (b.hybridBoost - a.hybridBoost) ||
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
    // Auto-select when chord came from diatonic bar or secondary dominant click
    _psAutoSelect = !!BuilderState._fromDiatonic || !!BuilderState._fromSecDom;
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
    if (BuilderState._fromDiatonic && BuilderState._diatonicScaleIdx !== undefined) {
      // Diatonic bar: degree index offset by parent scale mode
      // Diatonic (0-6): offset within system, wrap with %7
      // Harmonic Minor (7-13): base=7, Melodic Minor (14-20): base=14
      var systemBase = AppState.scaleIdx >= 14 ? 14 : AppState.scaleIdx >= 7 ? 7 : 0;
      var offsetInSystem = AppState.scaleIdx - systemBase;
      var exactIdx = systemBase + (offsetInSystem + BuilderState._diatonicScaleIdx) % 7;
      var exact = _psResults.find(function(r) { return r.scaleIdx === exactIdx && r.parentKey === AppState.key; });
      if (exact) {
        _selectedPS = { parentKey: exact.parentKey, scaleIdx: exact.scaleIdx };
      } else {
        _selectedPS = { parentKey: AppState.key, scaleIdx: exactIdx };
      }
    } else {
      const best = findBestAutoSelect(_psResults, _isSecDom, _isHybridChord);
      _selectedPS = { parentKey: best.parentKey, scaleIdx: best.scaleIdx };
    }
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
    '" onclick="if(AppState.psSortMode!==\'practical\')togglePsSortMode()" data-info="info.sort_practical">' + t('parent.sortPractical') + '</button>';
  if (!BuilderState._fromSecDom) {
    html += '<button class="ps-sort-toggle' + (AppState.psSortMode === 'diatonic' ? ' active' : '') +
      '" onclick="if(AppState.psSortMode!==\'diatonic\')togglePsSortMode()" data-info="info.sort_diatonic">' + t('parent.sortDiatonic') + '</button>';
  }
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
  // Diatonic minor: always add Dorian 13th (standard modern practice)
  if (BuilderState._fromDiatonic && BuilderState.quality &&
      BuilderState.quality.pcs.indexOf(3) >= 0) {
    availSet.add('13');
  }
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

