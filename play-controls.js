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

