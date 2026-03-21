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

