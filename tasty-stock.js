// ========================================
// TASTY VOICING ENGINE — degree → MIDI conversion
// ========================================

// Tensions (9th, 11th, 13th) use COMPOUND intervals (octave + simple)
// so voicings spread properly as open voicings, not close position.
// Chord tones (1, b3, 3, b5, 5, #5, 6, bb7, b7, 7) stay simple.
var TASTY_DEGREE_MAP = {
  '1':0, 'b9':13, '9':14, '#9':15, 'b3':3, '3':4,
  '11':17, '#11':18, 'b5':6, '5':7, '#5':8, 'b13':20,
  '6':9, '13':21, 'bb7':9, 'b7':10, '7':11
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
  // Compound intervals in TASTY_DEGREE_MAP ensure open voicing spacing
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
  // TASTY requires 4-note chords (7th/6th) — triads excluded
  if (pcs.length < 4) return null;
  // Dominant: major 3rd + minor 7th (must check before generic major)
  if (pcs.includes(4) && pcs.includes(10)) return 'dominant';
  // Major 7th
  if (pcs.includes(4) && pcs.includes(11)) return 'major';
  // 6 chord (major 3rd + 6th, no 7th)
  if (pcs.includes(4) && pcs.includes(9) && !pcs.includes(10) && !pcs.includes(11)) return 'major';
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
  TastyState.padPositions = padFindCompactPositions(midiNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL);

  updateTastyUI();
  render();
  playMidiNotes(midiNotes);
}

// Transpose current TASTY voicing by delta semitones (called on ArrowLeft/Right)
// Uses direct MIDI offset instead of findBestPosition to preserve pad position shape
function refreshTastyVoicing(delta) {
  if (!TastyState.enabled || TastyState.currentIndex < 0) return;
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) return;
  var midiNotes = TastyState.midiNotes.map(function(n) { return n + delta; });
  var split = splitByPadRange(midiNotes);
  TastyState.midiNotes = midiNotes;
  TastyState.outOfRange = split.outOfRange;
  TastyState.degreeMap = buildTastyDegreeMap(midiNotes, recipe.v);
  TastyState.topNote = midiNotes.length > 0 ? Math.max.apply(null, midiNotes) : null;
  TastyState.padPositions = padFindCompactPositions(midiNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL);
  updateTastyUI();
}

function toggleTasty() {
  if (!TastyState.hpsUnlocked || !TastyState.voicings) return;
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) return;

  if (TastyState.enabled) {
    disableTasty();
  } else {
    // Disable STOCK if active (mutually exclusive)
    if (StockState.enabled) disableStock();
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
  TastyState.padPositions = [];

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
    TastyState.padPositions = [];
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
  var canUseTasty = getTastyCategory(BuilderState.quality) !== null;
  if (btn) {
    btn.classList.toggle('active', TastyState.enabled);
    btn.classList.toggle('tasty-ready', canUseTasty && !TastyState.enabled);
    btn.disabled = !canUseTasty;
    btn.style.opacity = canUseTasty ? '' : '0.3';
  }

  var counter = document.getElementById('tasty-counter');
  var info = document.getElementById('tasty-info');

  var prevBtn = document.getElementById('btn-tasty-prev');
  var nextBtn = document.getElementById('btn-tasty-next');

  var active = TastyState.enabled && TastyState.currentIndex >= 0;
  if (active) {
    if (counter) counter.textContent = (TastyState.currentIndex + 1) + '/' + TastyState.currentMatches.length;
    if (info) info.textContent = getTastyDiffText();
  } else {
    if (counter) counter.textContent = '';
    if (info) info.textContent = '';
  }
  if (prevBtn) prevBtn.style.visibility = active ? '' : 'hidden';
  if (nextBtn) nextBtn.style.visibility = active ? '' : 'hidden';
  if (counter) counter.style.visibility = active ? '' : 'hidden';
  if (info) info.style.visibility = active ? '' : 'hidden';

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
      degRow.style.display = 'flex';
      degRow.style.padding = '2px 8px';
      degRow.style.gap = '4px';
      degRow.style.flexWrap = 'wrap';
      degRow.style.visibility = '';
      degRow.style.minHeight = '';
    } else {
      // Reserve space to prevent layout shift
      if (TastyState.hpsUnlocked) {
        degRow.style.display = 'flex';
        degRow.style.visibility = 'hidden';
        degRow.style.minHeight = '28px';
      } else {
        degRow.style.display = 'none';
      }
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
  // LH starts from root C2 (36), RH from root C3 (48) — avoid low interval limit violations
  var rootPC = BuilderState.root;
  var lhRoot = 36 + rootPC;
  var rhRoot = 48 + rootPC;
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
  var allNotes = StockState.lhMidi.concat(StockState.rhMidi);
  StockState.padPositions = padFindCompactPositions(allNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL);

  updateStockUI();
  render();
  // Play all notes
  playMidiNotes(allNotes);
}

// Transpose current STOCK voicing by delta semitones (called on ArrowLeft/Right)
// Uses direct MIDI offset to preserve pad position shape
function refreshStockVoicing(delta) {
  if (!StockState.enabled || StockState.currentIndex < 0) return;
  var entry = StockState.currentMatches[StockState.currentIndex];
  if (!entry) return;
  StockState.lhMidi = StockState.lhMidi.map(function(n) { return n + delta; });
  StockState.rhMidi = StockState.rhMidi.map(function(n) { return n + delta; });
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
  var allNotes = StockState.lhMidi.concat(StockState.rhMidi);
  StockState.padPositions = padFindCompactPositions(allNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL);
  updateStockUI();
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
  StockState.padPositions = [];
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
  if (reflectBtn) reflectBtn.style.display = 'none';
  var active = StockState.enabled && StockState.currentIndex >= 0;
  if (active) {
    if (counter) counter.textContent = (StockState.currentIndex + 1) + '/' + StockState.currentMatches.length;
    if (info) info.textContent = getStockInfoText();
  } else {
    if (counter) counter.textContent = '';
    if (info) info.textContent = '';
  }
  if (prevBtn) prevBtn.style.visibility = active ? '' : 'hidden';
  if (nextBtn) nextBtn.style.visibility = active ? '' : 'hidden';
  if (counter) counter.style.visibility = active ? '' : 'hidden';
  if (info) info.style.visibility = active ? '' : 'hidden';
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  // TASTY
  TASTY_DEGREE_MAP, QUALITY_BASE_DEGREES,
  buildTastyVoicing, getTastyLabels, buildTastyDegreeMap, splitByPadRange, findBestPosition,
  getTastyCategory, findQualityByName, updateTastyMatches, findTensionLabel,
  cycleTasty, refreshTastyVoicing, toggleTasty, disableTasty, setTastyTopFilter,
  getTastyDiffText, getTastyDegreeCategory, renderTastyDegreeBadges, updateTastyUI,
  // STOCK
  getStockMapping, updateStockMatches, stockDegreesToMidi,
  cycleStock, refreshStockVoicing, toggleStock, disableStock,
  getStockInfoText, updateStockUI,
};

