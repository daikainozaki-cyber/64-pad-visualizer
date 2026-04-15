// host-adapter.js
// Phase 3.0.a: audioCoreConfig skeleton for host-decoupling
// Plan: ~/.claude/plans/phase3-standalone-platform.md v5 (Codex PASS)
//
// audio-core が host を問わず動くための bridge 受け皿。
// 3.0.a 時点では全 sub-interface が no-op default。3.0.b-e で順次
// 64PE 既存 global / DOM への bridge を結線する。
// 現時点で audio-core 側はこの config を参照しないため、64PE 既存動作は不変。
//
// 注意: embedded host（Desktop / standalone）が事前に AUDIO_CORE_BASE や
// audioCoreConfig をセットしている可能性があるため、defensive check を入れる
// （Codex P2 指摘 2026-04-15: epiano-worklet-engine.js が AUDIO_CORE_BASE
// を override hook として文書化している）。

if (typeof window.AUDIO_CORE_BASE === 'undefined') {
  window.AUDIO_CORE_BASE = './audio-core/';
}

if (typeof window.audioCoreConfig === 'undefined') {
  window.audioCoreConfig = {
    // 1.1 velocity (audio-voice.js:149, 170-175)
    velocity: {
      threshold: 0,
      drive: 0,
      compand: 0,
      range: 127,
      drawCurve: function() {}
    },

    // 1.2 MIDI bridge (audio-voice.js:204-235)
    // 64PE では instruments.js:14 の linkMode、midi.js:4 の midiActiveNotes、
    // midi.js:137 の scheduleMidiUpdate に lazy binding する。
    // host-adapter.js は data.js 直後（line 819）に load されるが、
    // instruments.js / midi.js はもっと後に load されるため、
    // function 内で typeof チェック + 動的参照する必要がある。
    midiBridge: {
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
    },

    // 1.3 preset dropdown + HPS gate (audio-persistence.js:143, audio-engines.js:89)
    presetDropdown: {
      render: function(engines) {},
      sync: function(engineKey, presetKey) {},
      filter: function(engineKey, presetKey) { return true; }
    },

    // 1.4 persistence (audio-persistence.js 全体 + URL override)
    persistence: {
      loadSound: function() { return null; },
      saveSound: function(state) {},
      loadEpMixer: function() { return null; },
      saveEpMixer: function(state) {},
      storageKeyPrefix: '64pad-',
      parseUrlOverrides: function() {}
    },

    // 1.5 mute UI (audio-voice.js:51-60)
    muteUI: {
      updateMuteBtn: function(muted) {},
      updatePresetOpacity: function(muted) {}
    },

    // 1.6 mixer DOM (audio-persistence.js:51-63, audio-engines.js:79, 93-105, 118-135)
    mixer: {
      syncSliders: function(epState) {},
      syncValueLabels: function(epState) {},
      updateVisibility: function(state) {},
      redispatchTremolo: function() {}
    },

    // 1.7 overlay (audio-overlay.js 全体)
    overlay: {
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
    }
  };
}
