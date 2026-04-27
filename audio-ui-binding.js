// ========================================
// AUDIO UI BINDING (onReady)
// ========================================
// Split from audio.js (Phase 0.1.h / 2026-04-13). Wires every sound-panel
// DOM control (sliders, toggles, buttons) to the audio layer on DOMContent
// ready. Contains only side-effectful setup code — no new state, no new
// pure helpers — so the split is purely about keeping each file focused.
//
// Loaded AFTER every audio-*.js module so that every function and global
// it calls (noteOn, saveSoundSettings, _updateMuteBtn, EpState mutations,
// _updateEpianoDriveCurve, _updatePlateRouting, etc.) is already defined.
// ========================================

onReady(() => {
  // Set initial mute button state
  _updateMuteBtn();
  // Hide CHS export on production (reverse-engineered Chordcat format — dev only)
  if (!IS_DEV) {
    ['btn-chs-export-plain', 'btn-chs-export-mem', 'btn-chs-import'].forEach(function(id) { var b = document.getElementById(id); if (b) b.style.display = 'none'; });
  }
  // 単位統一 (urinami 2026-04-22): 内部 0-1 値は表示層で 1-10 (× 10) に統一。
  // T.SPD のみ物理単位 Hz を維持。認知リソースを音楽以外に使わせない。
  [['snd-volume','snd-vol-val'],['snd-tremolo','snd-trm-val'],['snd-tremolo-spd','snd-trm-spd-val'],['snd-phaser','snd-phs-val'],['snd-flanger','snd-flg-val']].forEach(([sid, vid]) => {
    const s = document.getElementById(sid);
    const v = document.getElementById(vid);
    if (s && v) s.addEventListener('input', () => {
      v.textContent = sid === 'snd-tremolo-spd'
        ? parseFloat(s.value).toFixed(1)
        : (parseFloat(s.value) * 10).toFixed(1);
      saveSoundSettings();
    });
  });
  // 初期表示を 1-10 に揃える
  [['snd-volume','snd-vol-val'],['snd-tremolo','snd-trm-val'],['snd-phaser','snd-phs-val'],['snd-flanger','snd-flg-val']].forEach(([sid, vid]) => {
    const s = document.getElementById(sid);
    const v = document.getElementById(vid);
    if (s && v) v.textContent = (parseFloat(s.value) * 10).toFixed(1);
  });
  // Real-time VOL → masterBus.gain (single master merge point).
  // 2026-04-15 ROUTING FIX: 旧版は masterGain / epianoDirectOut / epianoAmpOut
  // を個別制御していたが、ePlateReturn が制御外で漏れていた + 多経路制御で
  // 直列 attenuator になり挙動が予測困難だった。
  // urinami の設計判断「全てが一つのマスターに入らないとおかしい」適用。
  // masterBus は audio-master.js で「全 source の merge point」と定義されており
  // ([DI] / [Suitcase amp out] / [Plate reverb] → masterBus → destination)、
  // ここの gain で master volume を制御するのが正規。個別 attenuator は
  // それぞれの functional 役割（masterGain=WAF -4.4dB trim 等）で固定。
  const volSlider = document.getElementById('snd-volume');
  if (volSlider) volSlider.addEventListener('input', () => {
    if (_soundMuted) return;  // mute 中は反映しない（unmute 時に slider 値で復帰）
    const val = parseFloat(volSlider.value);
    masterBus.gain.setValueAtTime(val, audioCtx.currentTime);
  });
  // Initialize masterBus from slider value
  if (volSlider) {
    masterBus.gain.setValueAtTime(parseFloat(volSlider.value), 0);
  }

  // 2026-04-12 Top-bar REV listener removed (HTML element deleted).
  // E.PIANO MIXER → AMOUNT (id=ep-rev) is the single source of truth.

  // Real-time TREM → tremoloGain depth (+ worklet Vactrol for Suitcase)
  const trmSlider = document.getElementById('snd-tremolo');
  if (trmSlider) trmSlider.addEventListener('input', () => {
    var val = parseFloat(trmSlider.value);  // 0-1 (real Rhodes Intensity knob range)
    // Unified tremolo: worklet Vactrol physics for BOTH modes. Kill legacy sine LFO.
    tremoloGain.gain.setValueAtTime(0, audioCtx.currentTime);
    if (AudioState.instrument && AudioState.instrument.epiano && _useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      // Worklet depth uses slider value directly (0-1 matches real Peterson Intensity)
      EpState.tremoloDepth = val;
      EpState.tremoloOn = val > 0;
      epianoWorkletUpdateParams({ tremoloDepth: val, tremoloOn: val > 0 });
    }
  });

  // Real-time SPEED → tremoloLFO frequency (+ worklet for Suitcase)
  const trmSpd = document.getElementById('snd-tremolo-spd');
  if (trmSpd) trmSpd.addEventListener('input', () => {
    var val = parseFloat(trmSpd.value);
    tremoloLFO.frequency.setValueAtTime(val, audioCtx.currentTime);
    if (AudioState.instrument && AudioState.instrument.epiano && _useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      EpState.tremoloFreq = val;
      epianoWorkletUpdateParams({ tremoloFreq: val });
    }
  });

  // Real-time PHASE → phaser depth + wet mix
  const phsSlider = document.getElementById('snd-phaser');
  if (phsSlider) phsSlider.addEventListener('input', () => {
    const v = parseFloat(phsSlider.value);
    phaserDepth.gain.setValueAtTime(v * 1200, audioCtx.currentTime);
    phaserWet.gain.setValueAtTime(v, audioCtx.currentTime);
  });

  // Real-time FLANG → flanger depth + wet mix
  const flgSlider = document.getElementById('snd-flanger');
  if (flgSlider) flgSlider.addEventListener('input', () => {
    const v = parseFloat(flgSlider.value);
    flangerLFODepth.gain.setValueAtTime(v * 0.002, audioCtx.currentTime);
    flangerWet.gain.setValueAtTime(v, audioCtx.currentTime);
  });

  // Lo Cut (Highpass) toggle + frequency
  const loCutToggle = document.getElementById('snd-locut-toggle');
  const loCutSlider = document.getElementById('snd-locut');
  const loCutVal = document.getElementById('snd-locut-val');
  if (loCutToggle) loCutToggle.addEventListener('change', () => {
    loCutEnabled = loCutToggle.checked;
    loCutToggle.closest('.ep-knob').classList.toggle('filter-active', loCutEnabled);
    rebuildFilterChain();
    saveSoundSettings();
  });
  if (loCutSlider && loCutVal) {
    loCutSlider.addEventListener('input', () => {
      loCutVal.textContent = parseInt(loCutSlider.value);
      loCutFilter.frequency.setValueAtTime(parseFloat(loCutSlider.value), audioCtx.currentTime);
      saveSoundSettings();
    });
  }

  // Hi Cut (Lowpass) toggle + frequency
  const hiCutToggle = document.getElementById('snd-hicut-toggle');
  const hiCutSlider = document.getElementById('snd-hicut');
  const hiCutVal = document.getElementById('snd-hicut-val');
  if (hiCutToggle) hiCutToggle.addEventListener('change', () => {
    hiCutEnabled = hiCutToggle.checked;
    hiCutToggle.closest('.ep-knob').classList.toggle('filter-active', hiCutEnabled);
    rebuildFilterChain();
    saveSoundSettings();
  });
  if (hiCutSlider && hiCutVal) {
    hiCutSlider.addEventListener('input', () => {
      hiCutVal.textContent = parseInt(hiCutSlider.value);
      hiCutFilter.frequency.setValueAtTime(parseFloat(hiCutSlider.value), audioCtx.currentTime);
      saveSoundSettings();
    });
  }

  // Auto Filter (Envelope Filter) toggle + depth + speed
  const afToggle = document.getElementById('snd-af-toggle');
  const afDepthSlider = document.getElementById('snd-af-depth');
  const afDepthVal = document.getElementById('snd-af-depth-val');
  const afSpeedSlider = document.getElementById('snd-af-speed');
  const afSpeedVal = document.getElementById('snd-af-speed-val');
  if (afToggle) afToggle.addEventListener('change', () => {
    autoFilterEnabled = afToggle.checked;
    afToggle.closest('.ep-knob').classList.toggle('filter-active', autoFilterEnabled);
    var now = audioCtx.currentTime;
    if (!autoFilterEnabled) {
      // Off: force lowpass@20kHz = transparent (BP@20kHz would mute audio)
      autoFilter.type = 'lowpass';
      autoFilter2.type = 'lowpass';
      autoFilter.frequency.cancelScheduledValues(now);
      autoFilter2.frequency.cancelScheduledValues(now);
      autoFilter.frequency.setValueAtTime(20000, now);
      autoFilter2.frequency.setValueAtTime(20000, now);
    } else {
      // On: apply current type and set to envelope start position
      autoFilter.type = autoFilterType;
      autoFilter2.type = autoFilterType;
      var isBP = autoFilterType === 'bandpass';
      var hiFreq = isBP ? 800 + autoFilterDepth * 2700 : 800 + autoFilterDepth * 7200;
      autoFilter.frequency.setValueAtTime(hiFreq, now);
      autoFilter2.frequency.setValueAtTime(hiFreq, now);
    }
    saveSoundSettings();
  });
  if (afDepthSlider && afDepthVal) {
    afDepthSlider.addEventListener('input', () => {
      autoFilterDepth = parseFloat(afDepthSlider.value);
      afDepthVal.textContent = parseFloat(afDepthSlider.value).toFixed(2);
      saveSoundSettings();
    });
  }
  if (afSpeedSlider && afSpeedVal) {
    afSpeedSlider.addEventListener('input', () => {
      autoFilterSpeed = parseFloat(afSpeedSlider.value);
      afSpeedVal.textContent = parseFloat(afSpeedSlider.value).toFixed(2);
      saveSoundSettings();
    });
  }

  // Filter Q (resonance) slider
  const afQSlider = document.getElementById('snd-af-q');
  const afQVal = document.getElementById('snd-af-q-val');
  if (afQSlider && afQVal) {
    afQSlider.addEventListener('input', () => {
      autoFilterQ = parseFloat(afQSlider.value);
      afQVal.textContent = parseFloat(afQSlider.value).toFixed(1);
      saveSoundSettings();
    });
  }

  // 2026-04-27 urinami: AUTO FILTER WET slider (true wet/dry mix)。
  // setAutoFilterWet() が autoFilterWetGain / autoFilterDryGain 両方を更新する。
  const afWetSlider = document.getElementById('snd-af-wet');
  const afWetVal = document.getElementById('snd-af-wet-val');
  if (afWetSlider && afWetVal) {
    afWetSlider.addEventListener('input', () => {
      const v = parseFloat(afWetSlider.value);
      if (typeof setAutoFilterWet === 'function') {
        setAutoFilterWet(v);
      } else {
        autoFilterWet = v;
      }
      afWetVal.textContent = v.toFixed(2);
      saveSoundSettings();
    });
  }

  // Filter type (LP/BP) and poles (2P/4P) switches
  const afTypeBtn = document.getElementById('snd-af-type');
  if (afTypeBtn) afTypeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    autoFilterType = autoFilterType === 'lowpass' ? 'bandpass' : 'lowpass';
    // Only change node type when filter is ON; OFF keeps lowpass@20kHz (transparent)
    if (autoFilterEnabled) {
      autoFilter.type = autoFilterType;
      autoFilter2.type = autoFilterType;
    }
    afTypeBtn.textContent = autoFilterType === 'lowpass' ? 'LP' : 'BP';
    saveSoundSettings();
  });
  const afPoleBtn = document.getElementById('snd-af-poles');
  if (afPoleBtn) afPoleBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    autoFilterPoles = autoFilterPoles === 2 ? 4 : 2;
    afPoleBtn.textContent = autoFilterPoles + 'P';
    // In 2-pole mode, keep 2nd filter fully open
    if (autoFilterPoles === 2) {
      autoFilter2.frequency.setValueAtTime(20000, audioCtx.currentTime);
    }
    saveSoundSettings();
  });

  // Saturation drive slider
  const driveSlider = document.getElementById('snd-drive');
  const driveVal = document.getElementById('snd-drive-val');
  if (driveSlider && driveVal) {
    driveSlider.addEventListener('input', () => {
      saturationDrive = parseFloat(driveSlider.value);
      driveVal.textContent = parseFloat(driveSlider.value).toFixed(2);
      // Update e-piano master drive WaveShaper
      _updateEpianoDriveCurve(saturationDrive);
      saveSoundSettings();
    });
  }

  // Velocity sensitivity sliders
  const velSliders = [
    ['vel-threshold', 'vel-thr-val', 'velThreshold'],
    ['vel-drive', 'vel-drv-val', 'velDrive'],
    ['vel-compand', 'vel-cmp-val', 'velCompand'],
    ['vel-range', 'vel-rng-val', 'velRange'],
  ];
  // 単位統一 (urinami 2026-04-22 案 A):
  //   THRESH / RANGE: MIDI velocity 値 (0-127) をそのまま表示。物理的意味がある
  //   DRIVE / COMP:   内部 -64..+64 を -10..+10 表示。中央 0 基準
  function _velLabel(key, value) {
    if (key === 'velDrive' || key === 'velCompand') {
      const m = value / 64 * 10;
      return (m >= 0 ? '+' : '') + m.toFixed(1);
    }
    return String(value);
  }
  velSliders.forEach(([sid, vid, key]) => {
    const s = document.getElementById(sid);
    const v = document.getElementById(vid);
    if (s && v) {
      s.value = AppState[key];
      v.textContent = _velLabel(key, AppState[key]);
      s.addEventListener('input', () => {
        const raw = parseInt(s.value);
        AppState[key] = raw;
        v.textContent = _velLabel(key, raw);
        drawVelocityCurve();
        saveAppSettings();
      });
    }
  });
  drawVelocityCurve();

  // --- E.Piano Mixer sliders ---
  // Voicing knob (PU Symmetry) — the ONLY tine-side control, same as real Rhodes tech adjustment
  var puSymSlider = document.getElementById('ep-pu-sym');
  var puSymVal = document.getElementById('ep-pu-sym-val');
  if (puSymSlider && puSymVal) puSymSlider.addEventListener('input', () => {
    EpState.pickupSymmetry = parseFloat(puSymSlider.value);
    puSymVal.textContent = (parseFloat(puSymSlider.value) * 10).toFixed(1);
    if (typeof epianoUpdateLUTs === 'function') epianoUpdateLUTs();
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ pickupSymmetry: EpState.pickupSymmetry });
    }
    _saveEpMixer();
  });

  // PU Distance is fixed by the physical model (not a user knob).
  // Varies by year/model in presets, not by slider.

  // Spring reverb REV knob — controls wet return level (_epReverbPot)
  var epRevSlider = document.getElementById('ep-rev');
  var epRevVal = document.getElementById('ep-rev-val');
  if (epRevSlider && epRevVal) epRevSlider.addEventListener('input', () => {
    var knob = parseFloat(epRevSlider.value); // 1-10
    var val = (knob - 1) / 9 * 1.4; // → internal 0-1.4
    EpState.springReverbMix = val;
    epRevVal.textContent = knob.toFixed(1);
    if (typeof _epReverbPot !== 'undefined' && _epReverbPot) {
      _epReverbPot.gain.setValueAtTime(val, audioCtx.currentTime);
    }
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springReverbMix: val });
    }
    _updatePlateRouting();
    _saveEpMixer();
  });

  // Reverb TYPE selector (Spring / Plate)
  var epReverbType = document.getElementById('ep-reverb-type');
  if (epReverbType) epReverbType.addEventListener('change', () => {
    EpState.reverbType = epReverbType.value;
    var isSpring = EpState.reverbType === 'spring';
    // Spring: worklet internal. Plate: audio.js convolver
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ useSpringReverb: isSpring });
    }
    _updatePlateRouting();
    _saveEpMixer();
  });

  // Spring reverb DWELL knob — controls V3 send drive (saturation character)
  var epDwellSlider = document.getElementById('ep-dwell');
  var epDwellVal = document.getElementById('ep-dwell-val');
  if (epDwellSlider && epDwellVal) epDwellSlider.addEventListener('input', () => {
    var val = parseFloat(epDwellSlider.value);
    EpState.springDwell = val;
    epDwellVal.textContent = val.toFixed(1);
    if (typeof _epV3Drive !== 'undefined' && _epV3Drive) {
      // Real pot never reaches true zero (residual resistance + coupling capacitor leakage)
      var driveVal = Math.max(val, 0.5);
      _epV3Drive.gain.setValueAtTime(driveVal, audioCtx.currentTime);
    }
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springDwell: val });
    }
    _saveEpMixer();
  });

  // Spring reverb DECAY knob — feedback loop gain (T60 length)
  var epDecaySlider = document.getElementById('ep-decay');
  var epDecayVal = document.getElementById('ep-decay-val');
  if (epDecaySlider && epDecayVal) epDecaySlider.addEventListener('input', () => {
    var knob = parseFloat(epDecaySlider.value); // 1-10
    var val = 0.3 + (knob - 1) / 9 * 0.69; // → internal 0.3-0.99
    EpState.springFeedbackScale = val;
    epDecayVal.textContent = knob.toFixed(1);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springFeedbackScale: val });
    }
    _saveEpMixer();
  });

  // Spring reverb STEREO toggle — mono/stereo (tank0→L, tank1→R) decorrelation
  var epStereoToggle = document.getElementById('ep-stereo');
  var epStereoVal = document.getElementById('ep-stereo-val');
  if (epStereoToggle && epStereoVal) epStereoToggle.addEventListener('change', () => {
    var on = !!epStereoToggle.checked;
    EpState.springStereoEnabled = on;
    epStereoVal.textContent = on ? 'ON' : 'OFF';
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ springStereoEnabled: on });
    }
    _saveEpMixer();
  });

  // Mechanical noise — single knob controls all mechanical layers
  var epMechSlider = document.getElementById('ep-mechanical');
  var epMechVal = document.getElementById('ep-mechanical-val');
  if (epMechSlider && epMechVal) epMechSlider.addEventListener('input', () => {
    var val = parseFloat(epMechSlider.value);
    EpState.attackNoise = val;
    EpState.releaseNoise = val;
    epMechVal.textContent = (val * 10).toFixed(1);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ attackNoise: val, releaseNoise: val, releaseRing: val });
    }
    _saveEpMixer();
  });

  // Rhodes level — PU signal volume (0=mute, hear only mechanical)
  var epRhodesSlider = document.getElementById('ep-rhodes');
  var epRhodesVal = document.getElementById('ep-rhodes-val');
  if (epRhodesSlider && epRhodesVal) epRhodesSlider.addEventListener('input', () => {
    var val = parseFloat(epRhodesSlider.value);
    EpState.rhodesLevel = val;
    epRhodesVal.textContent = (val * 10).toFixed(1);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ rhodesLevel: val });
    }
  });

  // Tine radiation — acoustic tine radiation level
  var epTineSlider = document.getElementById('ep-tine');
  var epTineVal = document.getElementById('ep-tine-val');
  if (epTineSlider && epTineVal) epTineSlider.addEventListener('input', () => {
    var val = parseFloat(epTineSlider.value);
    EpState.tineRadiation = val;
    epTineVal.textContent = (val * 10).toFixed(1);
    if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
      epianoWorkletUpdateParams({ tineRadiation: val });
    }
    _saveEpMixer();
  });

  renderSoundControls();
  loadSoundSettings();
  _loadEpMixer();
  _updateEpMixerVisibility();
  // Always show tap-to-start overlay (browser requires user gesture for AudioContext)
  _showAudioOverlay();

  // Bass/Treble — preset 共通 UI (urinami 2026-04-27)。
  // Suitcase 時: audio-core 内 amp Baxandall (EpState.tonestack*) を制御
  // Stage (DI Clean) 時: host-side master-tail.js の最終段 BiquadFilter を制御
  // 両方常に EpState に書き込む = preset 跨ぎで slider 値保持。MasterTail.applyEq
  // は activePreset==='stage' の時のみ最終段 gain 更新するガード内蔵。
  function _eqSlider(id, valId, param) {
    var sl = document.getElementById(id);
    var vl = document.getElementById(valId);
    if (!sl || !vl) return;
    sl.addEventListener('input', function() {
      var v = parseFloat(sl.value);
      vl.textContent = (v * 10).toFixed(1);
      EpState['tonestack' + param.charAt(0).toUpperCase() + param.slice(1)] = v;
      if (_useEpianoWorklet && typeof epianoWorkletUpdateParams === 'function') {
        epianoWorkletUpdateParams({});
      }
      // host-tail にも反映 (Stage preset 時のみ MasterTail 内で gain 更新)
      if (typeof window.MasterTail !== 'undefined' && window.MasterTail.applyEq) {
        var b = document.getElementById('ep-eq-bass');
        var t = document.getElementById('ep-eq-treble');
        window.MasterTail.applyEq(b ? b.value : 0.5, t ? t.value : 0.5);
      }
    });
  }
  _eqSlider('ep-eq-bass', 'ep-eq-bass-val', 'bass');
  _eqSlider('ep-eq-treble', 'ep-eq-treble-val', 'treble');
});
