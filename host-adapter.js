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

  // 1.3 preset dropdown + HPS gate (audio-persistence.js:143, audio-engines.js:89)
  // 3.0.c3 で実装予定、現在は no-op default
  cfg.presetDropdown = mergeDefaults(cfg.presetDropdown, {
    render: function(engines) {},
    sync: function(engineKey, presetKey) {},
    filter: function(engineKey, presetKey) { return true; }
  });

  // 1.4 persistence (audio-persistence.js 全体 + URL override)
  // 3.0.d で実装予定、現在は no-op default
  cfg.persistence = mergeDefaults(cfg.persistence, {
    loadSound: function() { return null; },
    saveSound: function(state) {},
    loadEpMixer: function() { return null; },
    saveEpMixer: function(state) {},
    storageKeyPrefix: '64pad-',
    parseUrlOverrides: function() {}
  });

  // 1.5 mute UI (audio-voice.js:51-60) — 3.0.c1 結線済
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
      var sec = document.getElementById('ep-mixer-section');
      if (sec) sec.style.display = state.isEpiano ? '' : 'none';
      var revSec = document.getElementById('ep-reverb-section');
      if (revSec) revSec.style.display = state.hasSpring ? '' : 'none';
      var bass = document.getElementById('ep-eq-bass-label');
      var treble = document.getElementById('ep-eq-treble-label');
      if (bass) bass.style.display = state.isSuitcase ? '' : 'none';
      if (treble) treble.style.display = state.isSuitcase ? '' : 'none';
    },
    redispatchTremolo: function() {
      var trm = document.getElementById('snd-tremolo');
      if (trm) trm.dispatchEvent(new Event('input'));
    }
  });

  // 1.7 overlay (audio-overlay.js 全体)
  // 3.0.e で実装予定、現在は no-op default
  cfg.overlay = mergeDefaults(cfg.overlay, {
    enabled: true,
    t: function(key) {
      return (typeof t === 'function') ? t(key) : key;
    },
    showFirstTimeHint: function() {},
    showAudioOverlay: function() {},
    dismissOverlay: function() {},
    showPadHint: function() {},
    hidePadHint: function() {},
    firstRunKey: '64pad-overlay-seen',
    onMutedAutoSelect: function() {}
  });
})();
