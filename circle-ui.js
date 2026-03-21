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
        majorSegment: '#2c2c2c',
        minorSegment: '#262626',
        segmentStroke: '#383838',
        centerFill: '#1e1e1e',
        majorText: '#c8c8c8',
        minorText: '#909090',
        titleColor: '#c8c8c8',
        subtitleColor: '#707070',
        degreeText: '#e0e0e0',
        degreeStroke: '#383838',
        buttonBg: '#1e1e1e',
        buttonActiveText: '#c8c8c8',
        buttonInactiveText: '#606060',
        buttonNatural: '#a0a0a0',
        buttonHarmonic: '#808080',
        buttonMelodic: '#909090'
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
        updateKeyButtons();
        updateScaleKeyDisplay();
        updateChordKeyDisplay();
        render();
      },
      onScaleModeChange: function(mode) {
        if (mode === 'natural') { AppState.scaleIdx = 5; }
        else if (mode === 'harmonic') { AppState.scaleIdx = 7; }
        else if (mode === 'melodic') { AppState.scaleIdx = 14; }
        document.getElementById('scale-select').value = AppState.scaleIdx;
        updateScaleKeyDisplay();
        updateChordKeyDisplay();
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

