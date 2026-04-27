// host-adapter.js
// Phase 3.0.a + 3.0.b + 3.0.c1: audioCoreConfig host-decoupling skeleton
// Plan: ~/.claude/plans/phase3-standalone-platform.md v5 (Codex PASS)
//
// audio-core が host を問わず動くための bridge 受け皿。
// 3.0.b で midiBridge、3.0.c1 で muteUI を結線。
// 残りの sub-interface（presetDropdown / persistence / mixer / overlay）は
// 3.0.c2-e で順次結線。現時点で audio-core が参照しないものは no-op default。
//
// 注意: embedded host（Desktop / standalone）が事前に AUDIO_CORE_BASE や
// audioCoreConfig を**部分的に**セットしている可能性があるため、defensive merge
// （Codex P2 指摘 2026-04-15: epiano-worklet-engine.js が AUDIO_CORE_BASE
// を override hook として文書化、3.0.c1 監査で「全置換 vs 部分上書き」の
// 取りこぼし指摘）。各 sub-interface ごとに「host が pre-define していなければ
// default を充填」する per-key merge を採用。

if (typeof window.AUDIO_CORE_BASE === 'undefined') {
  window.AUDIO_CORE_BASE = './audio-core/';
}

// Initialize config object if absent (don't replace if host pre-defined it)
if (typeof window.audioCoreConfig === 'undefined') {
  window.audioCoreConfig = {};
}

(function() {
  var cfg = window.audioCoreConfig;

  // schemaVersion (Plan A 2026-04-15, Codex BLOCKER 3): primitive value,
  // per-key merge と同思想で host が pre-define してなければ 1 を設定。
  // audio-core/audio-master.js の validateAudioCoreConfig() が起動時に検証。
  if (typeof cfg.schemaVersion === 'undefined') {
    cfg.schemaVersion = 1;
  }

  // Per-key shallow merge: target が key を持たない時のみ default を充填。
  // host が部分的に sub-interface を pre-define している（例: muteUI に
  // updateMuteBtn だけ持つ）場合、欠落 key を補う。
  function mergeDefaults(target, defaults) {
    if (!target) return defaults;
    Object.keys(defaults).forEach(function(key) {
      if (target[key] === undefined) target[key] = defaults[key];
    });
    return target;
  }

  // SVG icons used by muteUI default. Host-owned UI assets (moved from
  // audio-voice.js so audio-core stays DOM-free).
  var SVG_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  var SVG_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>';

  // 1.1 velocity (audio-voice.js:149, 170-175)
  cfg.velocity = mergeDefaults(cfg.velocity, {
    threshold: 0,
    drive: 0,
    compand: 0,
    range: 127,
    drawCurve: function() {}
  });

  // 1.2 MIDI bridge (audio-voice.js:204-235) — 3.0.b 結線済
  // 64PE では instruments.js:14 の linkMode、midi.js:4 の midiActiveNotes、
  // midi.js:137 の scheduleMidiUpdate に lazy binding する。
  // host-adapter.js は data.js 直後（line 819）に load されるが、
  // instruments.js / midi.js はもっと後に load されるため、
  // function 内で typeof チェック + 動的参照する必要がある。
  cfg.midiBridge = mergeDefaults(cfg.midiBridge, {
    isLinkMode: function() {
      return (typeof linkMode !== 'undefined') ? linkMode : false;
    },
    onNoteReleased: function(midi) {
      if (typeof midiActiveNotes !== 'undefined') midiActiveNotes.delete(midi);
      if (typeof scheduleMidiUpdate === 'function') scheduleMidiUpdate();
    },
    onAllReleased: function() {
      if (typeof midiActiveNotes !== 'undefined') midiActiveNotes.clear();
      if (typeof scheduleMidiUpdate === 'function') scheduleMidiUpdate();
    }
  });

  // 1.3 preset dropdown + HPS gate (audio-persistence.js:155, audio-engines.js:88) — 3.0.c3 結線済
  // audio-core が ENGINES を enumerate して entries[] を構築し（useCabinet
  // メタを含む）、host の filter() で HPS gate を判定、host の render() で
  // organ-preset DOM を構築。
  // entry shape: { value, label, engineKey, presetKey, useCabinet }
  cfg.presetDropdown = mergeDefaults(cfg.presetDropdown, {
    filter: function(entry) {
      // 64PE host: HPS gate for amp/cabinet presets
      var hpsUnlocked = new URLSearchParams(window.location.search).has('hps');
      if (entry.useCabinet && !hpsUnlocked) return false;
      return true;
    },
    render: function(entries) {
      var sel = document.getElementById('organ-preset');
      if (!sel) return;
      sel.innerHTML = '';
      // 2026-04-27: display label の host-side rename map。内部 key (value) は
      // audio-core 側 EP_AMP_PRESETS の rename 待ち。表示だけ整える。
      // urinami 命名: Stage = DI Clean、Suitcase 系 = AMP Clean/Drive/Vintage。
      var displayRename = {
        'Pad Sensei MK1 Stage':                'Pad Sensei MK1 DI Clean',
        'Rhodes Stage':                        'Pad Sensei MK1 DI Clean',
        'Pad Sensei MK1 Suitcase Clean':       'Pad Sensei MK1 AMP Clean',
        'Pad Sensei MK1 Suitcase Drive':       'Pad Sensei MK1 AMP Drive',
        'Pad Sensei MK1 Suitcase Vintage':     'Pad Sensei MK1 AMP Vintage',
        'Pad Sensei MK1 Suitcase Vintage Envelope Filter': 'Pad Sensei MK1 AMP Vintage Envelope Filter',
        'Rhodes Suitcase Clean':               'Pad Sensei MK1 AMP Clean',
        'Rhodes Suitcase Drive':               'Pad Sensei MK1 AMP Drive',
        'Rhodes Suitcase Vintage':             'Pad Sensei MK1 AMP Vintage',
        'Rhodes Suitcase Vintage Envelope Filter': 'Pad Sensei MK1 AMP Vintage Envelope Filter'
      };
      entries.forEach(function(e) {
        var opt = document.createElement('option');
        opt.value = e.value;
        opt.textContent = displayRename[e.label] || e.label;
        sel.appendChild(opt);
      });
      // Hide dropdown when only one preset exists
      sel.style.display = entries.length <= 1 ? 'none' : '';
    },
    sync: function(value) {
      var sel = document.getElementById('organ-preset');
      if (sel) sel.value = value;
    }
  });

  // 1.4 persistence (audio-persistence.js 67-153 + URL override) — 3.0.d 結線済
  // localStorage I/O を host が owner に。audio-core は state object を
  // 受け渡しするだけで、key prefix や JSON serialize 詳細を知らない。
  // DOM↔EpState binding は audio-core に残す（3.0.c1/c2 で既に必要部分は
  // bridge 経由）。
  cfg.persistence = mergeDefaults(cfg.persistence, {
    storageKeyPrefix: '64pad-',
    loadSound: function() {
      try {
        var raw = localStorage.getItem('64pad-sound');
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    },
    saveSound: function(state) {
      try {
        localStorage.setItem('64pad-sound', JSON.stringify(state));
      } catch (_) {}
    },
    loadEpMixer: function() {
      try {
        var raw = localStorage.getItem('64pad-ep-mixer-v2');
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    },
    saveEpMixer: function(state) {
      try {
        localStorage.setItem('64pad-ep-mixer-v2', JSON.stringify(state));
      } catch (_) {}
    },
    // ?reset=ep → return true if host wants caller to skip load and reset state.
    // Side effect: clear both keys on detection.
    parseUrlOverrides: function() {
      if (location.search.indexOf('reset=ep') >= 0) {
        try {
          localStorage.removeItem('64pad-ep-mixer-v2');
          localStorage.removeItem('64pad-sound');
        } catch (_) {}
        return { resetEp: true };
      }
      return {};
    }
  });

  // 1.5 mute UI (audio-voice.js:51-60) — 3.0.c1 結線済 + 2026-04-15 applyMute 追加
  cfg.muteUI = mergeDefaults(cfg.muteUI, {
    updateMuteBtn: function(muted) {
      var btn = document.getElementById('sound-mute-btn');
      if (btn) {
        btn.innerHTML = muted ? SVG_OFF : SVG_ON;
        btn.style.opacity = muted ? '0.5' : '1';
      }
    },
    updatePresetOpacity: function(muted) {
      var sel = document.getElementById('organ-preset');
      if (sel) sel.style.opacity = muted ? '0.4' : '';
    },
    // Apply mute to actual audio output. mute → masterBus.gain=0,
    // unmute → restore from snd-volume slider value.
    // 2026-04-15 fix: existing voices keep playing on mute (noteOn _soundMuted
    // ガードは新規発音だけ防ぐ設計）→ master volume を 0 にして全停止。
    applyMute: function(muted) {
      if (typeof masterBus === 'undefined' || typeof audioCtx === 'undefined') return;
      if (muted) {
        masterBus.gain.setValueAtTime(0, audioCtx.currentTime);
      } else {
        var sl = document.getElementById('snd-volume');
        var val = sl ? parseFloat(sl.value) : 1;
        masterBus.gain.setValueAtTime(val, audioCtx.currentTime);
      }
    }
  });

  // 1.6 mixer DOM (audio-persistence.js:51-63, audio-engines.js:79, 93-105, 118-135)
  // 3.0.c2 結線済。audio-core が values map / labels map を構築し、host が DOM 書込み。
  // knob-scaling formulas (例: ep-rev value = springReverbMix / 1.4 * 9 + 1) は
  // 暫定的に audio-core 側で計算（既存挙動温存）。将来的に formula も host 側へ
  // 移送可能（generic bridge interface のため caller 差し替えで対応可）。
  cfg.mixer = mergeDefaults(cfg.mixer, {
    // values = { 'ep-pu-sym': 0.5, 'ep-rev': 4.21, ..., 'ep-stereo': true }
    // checkbox 系（ep-stereo）は .checked、その他は .value に書込
    syncSliders: function(values) {
      if (!values) return;
      Object.keys(values).forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!values[id];
        else el.value = values[id];
      });
    },
    // labels = { 'ep-pu-sym-val': '0.50', 'ep-rev-val': '4.2', 'ep-stereo-val': 'ON' }
    syncValueLabels: function(labels) {
      if (!labels) return;
      Object.keys(labels).forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = labels[id];
      });
    },
    // state = { isEpiano: bool, hasSpring: bool, isSuitcase: bool }
    updateVisibility: function(state) {
      if (!state) return;
      // 2026-04-27 urinami: 通常ユーザーは preset 選択だけで音色いじれない
      // 設計。E.PIANO MIXER section (個別 slider) は ?hps gate で dev のみ表示。
      // 通常起動 (?hps 無し) では preset 切替で snapshot 自動適用が音色を決め、
      // ユーザーは何も触らない。
      var hpsUnlocked = false;
      try { hpsUnlocked = new URLSearchParams(window.location.search).has('hps'); } catch (_) {}
      var sec = document.getElementById('ep-mixer-section');
      if (sec) sec.style.display = (state.isEpiano && hpsUnlocked) ? '' : 'none';
      var revSec = document.getElementById('ep-reverb-section');
      if (revSec) revSec.style.display = (state.hasSpring && hpsUnlocked) ? '' : 'none';
      // Bass/Treble UI も dev panel 一部として ?hps 限定表示。Stage は最終段
      // BiquadFilter (master-tail)、Suitcase は audio-core 内 amp Baxandall を
      // 制御する経路 (audio-ui-binding _eqSlider 参照)。
      var bass = document.getElementById('ep-eq-bass-label');
      var treble = document.getElementById('ep-eq-treble-label');
      if (bass) bass.style.display = (state.isEpiano && hpsUnlocked) ? '' : 'none';
      if (treble) treble.style.display = (state.isEpiano && hpsUnlocked) ? '' : 'none';
      // 2026-04-27: master-tail に preset 切替を伝える (Stage→slider 値、
      // Suitcase→flat)。MasterTail 未 init 時は no-op、init 後の preset 切替
      // (Suitcase ↔ Stage) で最終段の Bass/Treble が正しく反映/リセットされる。
      if (typeof window.MasterTail !== 'undefined' && window.MasterTail.applyForPreset) {
        window.MasterTail.applyForPreset(!!state.isSuitcase);
      }
    },
    redispatchTremolo: function() {
      var trm = document.getElementById('snd-tremolo');
      if (trm) trm.dispatchEvent(new Event('input'));
    }
  });

  // 1.7 overlay (audio-overlay.js 全体) — 3.0.e 結線済
  // DOM 操作 + i18n + first-run localStorage を host に移送。audio-core 側
  // dismissAudioOverlay は audio worklet init + onMutedAutoSelect 等の audio
  // 関連処理だけ残す。
  cfg.overlay = mergeDefaults(cfg.overlay, {
    enabled: true,
    t: function(key) {
      return (typeof t === 'function') ? t(key) : key;
    },
    firstRunKey: '64pad-overlay-seen',
    showFirstTimeHint: function() {
      var header = document.getElementById('sound-header');
      if (!header) return;
      var hint = document.createElement('div');
      hint.id = 'sound-first-hint';
      hint.textContent = (typeof t === 'function') ? t('ui.sound_hint') : 'Select a preset to enable sound';
      hint.style.cssText = 'font-size:0.65rem;color:#a0a0a0;text-align:center;padding:2px 0;animation:hint-pulse 2s ease-in-out infinite';
      header.parentNode.insertBefore(hint, header);
    },
    hideFirstTimeHint: function() {
      var hint = document.getElementById('sound-first-hint');
      if (hint) hint.remove();
    },
    showAudioOverlay: function() {
      var overlay = document.getElementById('audio-start-overlay');
      if (overlay) overlay.classList.add('active');
    },
    // Hide overlay DOM + manage first-run localStorage. Returns
    // { firstTime: bool } so caller can chain pad hint for first-time users.
    dismissOverlay: function() {
      var overlay = document.getElementById('audio-start-overlay');
      if (overlay) overlay.classList.remove('active');
      var firstTime = !localStorage.getItem('64pad-overlay-seen');
      if (firstTime) {
        try { localStorage.setItem('64pad-overlay-seen', '1'); } catch (_) {}
      }
      // 2026-04-27: host-side master tail (Bass/Treble + 固定 +3dB) を初期化。
      // dismissAudioOverlay() (audio-overlay.js:35) が ensureAudioResumed() →
      // epianoWorkletInit() を実行する直後の経路。audio-core が rebuildFilterChain
      // 経由で chain 終端を MasterTail.input に接続する (master-tail.js init 内で
      // 自動)。MasterTail.init は冪等 (initialized フラグで二重 init 防止)。
      // setTimeout(0) で audio-core の epianoWorkletInit 完了後に実行。
      setTimeout(function() {
        if (typeof window.MasterTail !== 'undefined' && window.MasterTail.init) {
          window.MasterTail.init();
        }
        // 2026-04-27: 新規 user (64pad-sound 未保存) に Pad Sensei MK1 DI Clean
        // baseline を自動適用。既存 user は localStorage 値が優先 (saveSoundSettings
        // 経由) で本処理は skip。
        var hasSavedSound = false;
        try { hasSavedSound = !!localStorage.getItem('64pad-sound'); } catch (_) {}
        if (!hasSavedSound && typeof window.applyMK1DICleanSnapshot === 'function') {
          window.applyMK1DICleanSnapshot();
        }
      }, 100);
      return { firstTime: firstTime };
    },
    showPadHint: function() {
      var grid = document.getElementById('pad-grid');
      if (!grid) return;
      grid.classList.add('pad-hint-pulse');
      var hint = document.createElement('div');
      hint.id = 'pad-play-hint';
      hint.textContent = (typeof t === 'function') ? t('ui.tap_pads') : 'Tap any pad to play!';
      grid.parentNode.insertBefore(hint, grid);
      // Auto-dismiss after 6 seconds (host-owned timer)
      setTimeout(function() {
        var b = window.audioCoreConfig && window.audioCoreConfig.overlay;
        if (b && b.hidePadHint) b.hidePadHint();
      }, 6000);
    },
    hidePadHint: function() {
      var hint = document.getElementById('pad-play-hint');
      if (hint) hint.remove();
      var grid = document.getElementById('pad-grid');
      if (grid) grid.classList.remove('pad-hint-pulse');
    },
    // legacy path: when muted, auto-select engine then expand sound section
    onMutedAutoSelect: function() {
      if (typeof soundExpanded !== 'undefined' && !soundExpanded && typeof toggleSoundExpand === 'function') {
        toggleSoundExpand();
      }
    }
  });

  // ========== 2026-04-27: Pad Sensei MK1 DI Clean snapshot (urinami baseline) ==========
  //
  // urinami が 64PE で確定した DI Clean baseline。Model dropdown で DI Clean
  // 選択時 + 起動時 (新規 user) に host から強制適用。AppState (TB / Voicing /
  // F-NEW / Bass Drive) + EpState (PU LEVEL / COLOR / MECHANICAL / EQ /
  // TREMOLO / REVERB) を一括復元。keys と同じ pattern。
  // 64PE は TB / Voicing / F-NEW / Bass Drive UI を持たないが、worklet には
  // パラメータが流入するので AppState 経由で baseline 制御可能。

  // urinami 提供画像 #7 (2026-04-27 64PE 実機) baseline。
  // 画像値全反映 (snd-* effect rack + E.PIANO MIXER + AUTO FILTER 含む)。
  window.PAD_SENSEI_MK1_DI_CLEAN_SNAPSHOT = {
    appState: {
      toneBalanceDb: [0, 0, 0, 0, 0, 0, 6],
      gapVoicing: 'dyno',
      fNewEnabled: true,
      puPosBassDriveEnabled: false,
      // 2026-04-27 urinami 画像 #12 baseline (VELOCITY SENSITIVITY)
      velThreshold: 0,        // THRESH 0
      velDrive: 30,           // DRIVE +4.7 (mapped /64*10)、raw 30
      velCompand: -14,        // COMP -2.2、raw -14
      velRange: 121           // RANGE 121
    },
    // 2026-04-27 urinami: snd-* effect rack (Volume / LoCut/HiCut / Drive /
    // Phaser / Flanger / AutoFilter) は user effect rack で preset core ではない。
    // urinami の手動 toggle を尊重するため snapshot からは除外。snapshot は
    // E.PIANO MIXER (PU LEVEL / VOICING / MECH / EQ / TREMOLO / REVERB) のみ
    // を復元対象とする。
    epMixer: {
      // 2026-04-27 urinami 画像 #12 baseline
      rhodesLevel: 1.0,        // PU LEVEL 1.00
      pickupSymmetry: 0.30,    // VOICING 0.30
      attackNoise: 0.0,        // MECHANICAL 0.00
      releaseNoise: 0.0,
      releaseRing: 0.0,
      tonestackBass: 0.37,     // BASS 3.7 (slider 表示 v*10)
      tonestackTreble: 0.58,   // TREBLE 5.8
      tremoloDepth: 0.75,      // TREM 7.5
      tremoloFreq: 4.4,        // T.SPD 4.4 Hz
      tremoloOn: true,
      reverbType: 'plate',     // TYPE Plate
      springReverbMix: 0.171,  // AMOUNT 2.1 knob → (2.1-1)/9*1.4
      springFeedbackScale: 0.898, // DECAY 8.8
      springStereoEnabled: true
    },
    // 2026-04-27 urinami: Dev panel UI 不要だが内部 state は保持。
    // Voicing Lab (Suitcase amp chain 専用、DI Clean では default 維持) を
    // 内部に持って worklet に流入させる。値は keys baseline 流用。
    voicingLab: {
      gePreampDrive: 2.5,
      gePreampGain: 1.5,
      suitcasePreFxTrim: 0.42,
      jaWetMix: 0
    }
  };

  window.applyMK1DICleanSnapshot = function() {
    var snap = window.PAD_SENSEI_MK1_DI_CLEAN_SNAPSHOT;
    if (!snap || !snap.epMixer) return false;
    var em = snap.epMixer;
    if (typeof EpState !== 'undefined') {
      Object.keys(em).forEach(function(k) { EpState[k] = em[k]; });
      if (snap.appState) {
        EpState.gapVoicing = snap.appState.gapVoicing;
        EpState.fNewEnabled = snap.appState.fNewEnabled;
        EpState.puPosBassDriveEnabled = snap.appState.puPosBassDriveEnabled;
      }
    }
    if (window.AppState && snap.appState) {
      Object.keys(snap.appState).forEach(function(k) { window.AppState[k] = snap.appState[k]; });
    } else if (snap.appState) {
      window.AppState = Object.assign(window.AppState || {}, snap.appState);
    }
    // DOM slider 反映
    var revKnob = 1 + (em.springReverbMix / 1.4) * 9;
    var decayKnob = 1 + ((em.springFeedbackScale - 0.3) / 0.69) * 9;
    var domMap = {
      'ep-rhodes':       em.rhodesLevel,
      'ep-pu-sym':       em.pickupSymmetry,
      'ep-mechanical':   em.attackNoise,
      'ep-eq-bass':      em.tonestackBass,
      'ep-eq-treble':    em.tonestackTreble,
      'snd-tremolo':     em.tremoloDepth,
      'snd-tremolo-spd': em.tremoloFreq,
      'ep-rev':          revKnob,
      'ep-decay':        decayKnob
    };
    Object.keys(domMap).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.value = domMap[id];
        // 2026-04-27: input event dispatch して各 slider の handler を発火
        // (label 更新 + worklet 反映 + saveEpMixer 連鎖)。dispatch しないと
        // 起動時 _loadEpMixer で計算された古い label (例: ep-rev-val "2.4")
        // が残る bug。
        try { el.dispatchEvent(new Event('input')); } catch (_) {}
      }
    });
    var rev = document.getElementById('ep-reverb-type');
    if (rev && rev.value !== em.reverbType) {
      rev.value = em.reverbType;
      rev.dispatchEvent(new Event('change'));
    }
    var stereo = document.getElementById('ep-stereo');
    if (stereo) {
      var newChecked = !!em.springStereoEnabled;
      if (stereo.checked !== newChecked) {
        stereo.checked = newChecked;
        stereo.dispatchEvent(new Event('change'));
      }
    }
    // worklet 反映 (Plate 時 spring mute は audio-ui-binding 側 epReverbType
    // change handler に任せる、ここでは tremolo/reverb 量を送るだけ)
    if (typeof _useEpianoWorklet !== 'undefined' && _useEpianoWorklet
        && typeof epianoWorkletUpdateParams === 'function') {
      var workletMix = (em.reverbType === 'plate') ? 0 : em.springReverbMix;
      epianoWorkletUpdateParams({
        pickupSymmetry: em.pickupSymmetry,
        rhodesLevel: em.rhodesLevel,
        attackNoise: em.attackNoise,
        releaseNoise: em.releaseNoise,
        releaseRing: em.releaseRing,
        tremoloDepth: em.tremoloDepth,
        tremoloFreq: em.tremoloFreq,
        tremoloOn: em.tremoloOn,
        springReverbMix: workletMix,
        springFeedbackScale: em.springFeedbackScale,
        springStereoEnabled: em.springStereoEnabled
      });
    }
    // 2026-04-27 urinami: snd-* effect rack / autoFilter toggle は snapshot
    // 対象外 (user の手動 toggle 値を尊重、preset 適用で勝手に ON にならない)。

    // 2026-04-27 urinami: Voicing Lab (Suitcase amp chain 用 voicing) を内部に
    // 保持。UI は無いが worklet に値を流す。Stage では effect なしだが state
    // 保持で keys 同等の内部状態を維持。
    if (snap.voicingLab) {
      window.EpVoicingLab = window.EpVoicingLab || {};
      Object.keys(snap.voicingLab).forEach(function(k) {
        window.EpVoicingLab[k] = snap.voicingLab[k];
      });
      if (typeof window._epwSendVoicingLabParams === 'function') {
        try { window._epwSendVoicingLabParams(window.EpVoicingLab); } catch (_) {}
      }
    }
    // 2026-04-27 urinami: AppState flags (gapVoicing / fNewEnabled /
    // puPosBassDriveEnabled / toneBalanceDb) を worklet に送信。Dev panel UI
    // 無しでも内部 baseline が worklet に反映される。
    if (typeof _epwSendParams === 'function') {
      try { _epwSendParams(); } catch (_) {}
    }
    // MasterTail 同期 (Stage で Bass/Treble UI 値を最終段に反映)
    if (typeof window.MasterTail !== 'undefined' && window.MasterTail.applyEq) {
      window.MasterTail.applyEq(em.tonestackBass, em.tonestackTreble);
    }
    return true;
  };

  // 2026-04-27 urinami 画像 #14 baseline (Pad Sensei Keys 実機で歪まない値)。
  // AMP Clean = Suitcase Clean 経路。Model dropdown 切替時 setPreset →
  // applyAmpCleanSnapshot で host 上書き。
  window.PAD_SENSEI_AMP_CLEAN_SNAPSHOT = {
    audioState_preset: 'Rhodes Suitcase Clean',
    appState: {
      toneBalanceDb: [0, 0, 0, 0, 0, 0, 6],
      gapVoicing: 'dyno',
      fNewEnabled: true,
      puPosBassDriveEnabled: false,
      velThreshold: 0,
      velDrive: 1,             // DRIVE +0.2
      velCompand: 0,
      velRange: 127
    },
    epMixer: {
      rhodesLevel: 1.0,        // PU LEVEL 10.0
      pickupSymmetry: 0.30,    // COLOR 3.0
      attackNoise: 0.0,        // MECHANICAL 0.0
      releaseNoise: 0.0,
      releaseRing: 0.0,
      tonestackBass: 0.5,      // BASS 5.0
      tonestackTreble: 0.5,    // TREBLE 5.0
      tremoloDepth: 0.42,      // TREM 4.2
      tremoloFreq: 3.4,        // T.SPD 3.4 Hz
      tremoloOn: true,
      reverbType: 'spring',    // TYPE Spring
      springReverbMix: 0.124,  // AMOUNT 1.8 knob → (1.8-1)/9*1.4
      springFeedbackScale: 0.898, // DECAY 8.8 knob → 0.3+(8.8-1)/9*0.69
      springStereoEnabled: true
    },
    voicingLab: {
      gePreampDrive: 1.50,     // DRIVE 1.50
      gePreampGain: 1.30,      // MAKEUP 1.30
      suitcasePreFxTrim: 0.50, // PRE-TRIM 0.50
      jaWetMix: 0.00           // J-A MIX 0.00
    }
  };

  // 2026-04-27 urinami 画像 #15 baseline (Pad Sensei Keys 確定値)。AMP Drive
  // = Suitcase Drive 経路。Bass Drive=On が特徴 (DI でも AMP でも使う前提)。
  window.PAD_SENSEI_AMP_DRIVE_SNAPSHOT = {
    audioState_preset: 'Rhodes Suitcase Drive',
    appState: {
      toneBalanceDb: [6, 6, 0, 0, 0, 0, 6],   // E0/E1/E6 +6dB
      gapVoicing: 'dyno',
      fNewEnabled: true,
      puPosBassDriveEnabled: true,            // ★Bass Drive=On
      velThreshold: 0,
      velDrive: 1,                            // DRIVE +0.2
      velCompand: 0,
      velRange: 127
    },
    epMixer: {
      rhodesLevel: 1.0,        // PU LEVEL 10.0
      pickupSymmetry: 0.5,     // COLOR 5.0
      attackNoise: 0.0,        // MECHANICAL 0.0
      releaseNoise: 0.0,
      releaseRing: 0.0,
      tonestackBass: 0.45,     // BASS 4.5
      tonestackTreble: 0.81,   // TREBLE 8.1
      tremoloDepth: 1.0,       // TREM 10.0
      tremoloFreq: 2.6,        // T.SPD 2.6 Hz
      tremoloOn: true,
      reverbType: 'plate',     // TYPE Plate
      springReverbMix: 0.1089, // AMOUNT 1.7 knob → (1.7-1)/9*1.4
      springFeedbackScale: 0.898, // DECAY 8.8 knob
      springStereoEnabled: true
    },
    voicingLab: {
      gePreampDrive: 2.50,     // DRIVE 2.50
      gePreampGain: 0.76,      // MAKEUP 0.76
      suitcasePreFxTrim: 0.42, // PRE-TRIM 0.42
      jaWetMix: 0.00           // J-A MIX 0.00
    }
  };

  // applyAmpCleanSnapshot / applyAmpDriveSnapshot の共通ロジック
  window.applyAmpSnapshot = function(snap) {
    if (!snap || !snap.epMixer) return false;
    if (snap.audioState_preset && typeof setPreset === 'function'
        && typeof AudioState !== 'undefined' && AudioState.engine
        && AudioState.engine.presets && AudioState.engine.presets[snap.audioState_preset]) {
      setPreset(snap.audioState_preset);
    }
    var em = snap.epMixer;
    if (typeof EpState !== 'undefined') {
      Object.keys(em).forEach(function(k) { EpState[k] = em[k]; });
      if (snap.appState) {
        EpState.gapVoicing = snap.appState.gapVoicing;
        EpState.fNewEnabled = snap.appState.fNewEnabled;
        EpState.puPosBassDriveEnabled = snap.appState.puPosBassDriveEnabled;
      }
    }
    if (window.AppState && snap.appState) {
      Object.keys(snap.appState).forEach(function(k) { window.AppState[k] = snap.appState[k]; });
    }
    var revKnob = 1 + (em.springReverbMix / 1.4) * 9;
    var decayKnob = 1 + ((em.springFeedbackScale - 0.3) / 0.69) * 9;
    var domMap = {
      'ep-rhodes':       em.rhodesLevel,
      'ep-pu-sym':       em.pickupSymmetry,
      'ep-mechanical':   em.attackNoise,
      'ep-eq-bass':      em.tonestackBass,
      'ep-eq-treble':    em.tonestackTreble,
      'snd-tremolo':     em.tremoloDepth,
      'snd-tremolo-spd': em.tremoloFreq,
      'ep-rev':          revKnob,
      'ep-decay':        decayKnob
    };
    Object.keys(domMap).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.value = domMap[id];
        try { el.dispatchEvent(new Event('input')); } catch (_) {}
      }
    });
    var rev = document.getElementById('ep-reverb-type');
    if (rev && rev.value !== em.reverbType) {
      rev.value = em.reverbType;
      try { rev.dispatchEvent(new Event('change')); } catch (_) {}
    }
    var stereo = document.getElementById('ep-stereo');
    if (stereo) {
      var newChecked = !!em.springStereoEnabled;
      if (stereo.checked !== newChecked) {
        stereo.checked = newChecked;
        try { stereo.dispatchEvent(new Event('change')); } catch (_) {}
      }
    }
    if (snap.voicingLab) {
      window.EpVoicingLab = window.EpVoicingLab || {};
      Object.keys(snap.voicingLab).forEach(function(k) {
        window.EpVoicingLab[k] = snap.voicingLab[k];
      });
      if (typeof window._epwSendVoicingLabParams === 'function') {
        try { window._epwSendVoicingLabParams(window.EpVoicingLab); } catch (_) {}
      }
    }
    if (typeof _epwSendParams === 'function') {
      try { _epwSendParams(); } catch (_) {}
    }
    if (typeof saveSoundSettings === 'function') {
      try { saveSoundSettings(); } catch (_) {}
    }
    return true;
  };
  window.applyAmpDriveSnapshot = function() {
    return window.applyAmpSnapshot(window.PAD_SENSEI_AMP_DRIVE_SNAPSHOT);
  };

  // 2026-04-27 urinami 画像 #16 baseline (Pad Sensei Keys 確定値)。AMP Vintage
  // = Suitcase Vintage 経路。TB Flat / STEREO OFF / TREM 控えめ / 低 voicing。
  window.PAD_SENSEI_AMP_VINTAGE_SNAPSHOT = {
    audioState_preset: 'Rhodes Suitcase Vintage',
    appState: {
      toneBalanceDb: [0, 0, 0, 0, 0, 0, 0],   // TB Flat
      gapVoicing: 'dyno',
      fNewEnabled: true,
      puPosBassDriveEnabled: false,
      velThreshold: 0,
      velDrive: 1,                            // DRIVE +0.2
      velCompand: 0,
      velRange: 127
    },
    epMixer: {
      rhodesLevel: 1.0,        // PU LEVEL 10.0
      pickupSymmetry: 0.19,    // COLOR 1.9
      attackNoise: 0.0,        // MECHANICAL 0.0
      releaseNoise: 0.0,
      releaseRing: 0.0,
      tonestackBass: 0.29,     // BASS 2.9
      tonestackTreble: 0.5,    // TREBLE 5.0
      tremoloDepth: 0.22,      // TREM 2.2
      tremoloFreq: 1.0,        // T.SPD 1.0 Hz
      tremoloOn: true,
      reverbType: 'plate',     // TYPE Plate
      springReverbMix: 0.2178, // AMOUNT 2.4 knob → (2.4-1)/9*1.4
      springFeedbackScale: 0.7293, // DECAY 6.6 knob → 0.3+(6.6-1)/9*0.69
      springStereoEnabled: false  // ★STEREO OFF
    },
    voicingLab: {
      gePreampDrive: 1.35,     // DRIVE 1.35
      gePreampGain: 0.61,      // MAKEUP 0.61
      suitcasePreFxTrim: 0.35, // PRE-TRIM 0.35
      jaWetMix: 0.00           // J-A MIX 0.00
    }
  };
  window.applyAmpVintageSnapshot = function() {
    return window.applyAmpSnapshot(window.PAD_SENSEI_AMP_VINTAGE_SNAPSHOT);
  };

  window.applyAmpCleanSnapshot = function() {
    var snap = window.PAD_SENSEI_AMP_CLEAN_SNAPSHOT;
    if (!snap || !snap.epMixer) return false;
    // Suitcase Clean に preset 切替 (audio-engines setPreset)
    if (snap.audioState_preset && typeof setPreset === 'function'
        && typeof AudioState !== 'undefined' && AudioState.engine
        && AudioState.engine.presets && AudioState.engine.presets[snap.audioState_preset]) {
      setPreset(snap.audioState_preset);
    }
    var em = snap.epMixer;
    if (typeof EpState !== 'undefined') {
      Object.keys(em).forEach(function(k) { EpState[k] = em[k]; });
      if (snap.appState) {
        EpState.gapVoicing = snap.appState.gapVoicing;
        EpState.fNewEnabled = snap.appState.fNewEnabled;
        EpState.puPosBassDriveEnabled = snap.appState.puPosBassDriveEnabled;
      }
    }
    if (window.AppState && snap.appState) {
      Object.keys(snap.appState).forEach(function(k) { window.AppState[k] = snap.appState[k]; });
    }
    var revKnob = 1 + (em.springReverbMix / 1.4) * 9;
    var decayKnob = 1 + ((em.springFeedbackScale - 0.3) / 0.69) * 9;
    var domMap = {
      'ep-rhodes':       em.rhodesLevel,
      'ep-pu-sym':       em.pickupSymmetry,
      'ep-mechanical':   em.attackNoise,
      'ep-eq-bass':      em.tonestackBass,
      'ep-eq-treble':    em.tonestackTreble,
      'snd-tremolo':     em.tremoloDepth,
      'snd-tremolo-spd': em.tremoloFreq,
      'ep-rev':          revKnob,
      'ep-decay':        decayKnob
    };
    Object.keys(domMap).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.value = domMap[id];
        try { el.dispatchEvent(new Event('input')); } catch (_) {}
      }
    });
    var rev = document.getElementById('ep-reverb-type');
    if (rev && rev.value !== em.reverbType) {
      rev.value = em.reverbType;
      try { rev.dispatchEvent(new Event('change')); } catch (_) {}
    }
    var stereo = document.getElementById('ep-stereo');
    if (stereo) {
      var newChecked = !!em.springStereoEnabled;
      if (stereo.checked !== newChecked) {
        stereo.checked = newChecked;
        try { stereo.dispatchEvent(new Event('change')); } catch (_) {}
      }
    }
    // 2026-04-27 urinami 画像 #14: voicingLab を内部 state に書き込み + worklet 反映
    if (snap.voicingLab) {
      window.EpVoicingLab = window.EpVoicingLab || {};
      Object.keys(snap.voicingLab).forEach(function(k) {
        window.EpVoicingLab[k] = snap.voicingLab[k];
      });
      if (typeof window._epwSendVoicingLabParams === 'function') {
        try { window._epwSendVoicingLabParams(window.EpVoicingLab); } catch (_) {}
      }
    }
    if (typeof saveSoundSettings === 'function') {
      try { saveSoundSettings(); } catch (_) {}
    }
    return true;
  };

  // 起動時 (新規 user = 64pad-sound 未保存) と Model dropdown 切替で発動
  window._pendingMK1DICleanSnapshot = true;

  // 2026-04-27 urinami: Model dropdown で preset 選択時に snapshot 強制適用。
  // 既存 user (localStorage に saved sound あり) でも、preset 再選択で snapshot
  // 復元できる経路。preset key (内部) と snapshot apply 関数を map。
  // organ-preset DOM の change listener を後付け (audio-engines.js setPreset
  // が走った後に host snapshot apply で上書き)。
  window.addEventListener('DOMContentLoaded', function() {
    var sel = document.getElementById('organ-preset');
    if (!sel) return;
    sel.addEventListener('change', function() {
      var presetKey = sel.value || '';  // 例: 'epiano:Rhodes DI'
      // setPreset が走った直後に snapshot を上書き (audio-engines が EpState を
      // preset default で書いた後、host snapshot で上書き)
      setTimeout(function() {
        if (/Rhodes DI$/.test(presetKey)) {
          if (typeof window.applyMK1DICleanSnapshot === 'function') {
            window.applyMK1DICleanSnapshot();
          }
        } else if (/Rhodes Suitcase Clean$/.test(presetKey)) {
          // 2026-04-27 urinami 画像 #14: keys 確定 voicing で歪まない baseline。
          if (typeof window.applyAmpCleanSnapshot === 'function') {
            window.applyAmpCleanSnapshot();
          }
        } else if (/Rhodes Suitcase Drive$/.test(presetKey)) {
          // 2026-04-27 urinami 画像 #15: keys 確定 voicing。Bass Drive=On 特徴。
          if (typeof window.applyAmpDriveSnapshot === 'function') {
            window.applyAmpDriveSnapshot();
          }
        } else if (/Rhodes Suitcase Vintage$/.test(presetKey)) {
          // 2026-04-27 urinami 画像 #16: keys 確定 voicing。TB Flat / STEREO OFF。
          if (typeof window.applyAmpVintageSnapshot === 'function') {
            window.applyAmpVintageSnapshot();
          }
        }
      }, 50);
    });
  });
})();
