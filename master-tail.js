// 64Pad Explorer — host-side master tail (2026-04-27)
//
// 全 preset で効く最終段 Bass/Treble + 固定 +3dB master trim。
// audio-core (audio-effects.js) の rebuildFilterChain が chain 終端を
// window.MasterTail.input (= bassFilter) に向けてくれる前提。
// pad-sensei-keys と同等機能、64PE の loCut/hiCut UI が現役なので
// keys のような masterBus.disconnect 直接挿入は使えない。代わりに
// audio-core 側 rebuildFilterChain hook 経由で attach する。
//
// 信号経路:
//   masterBus → (loCut?) → (hiCut?) → bassFilter (lowshelf 100Hz)
//             → trebleFilter (highshelf 3500Hz) → masterTrim (+3dB 固定)
//             → audioCtx.destination
//
// Vol=0 silence: masterBus.gain=0 で上流断、BiquadFilter IIR 残響は 1.6ms
// 程度で減衰。Routing invariant (Vol=0 silence test) 通る。
//
// preset 連動:
// - Stage (Rhodes DI / Pad Sensei MK1 DI Clean) → 最終段 Bass/Treble を slider 値で制御
// - Suitcase (AMP Clean/Drive/Vintage) → 最終段 flat 維持 (audio-core 内
//   amp の Baxandall に Bass/Treble を任せる)
// preset 切替時は audioCoreConfig.mixer.updateVisibility 経由で
// MasterTail.applyForPreset(isSuitcase) が呼ばれる。

(function() {
  function sliderToDb(v) {
    var f = parseFloat(v);
    if (!isFinite(f)) return 0;
    return (f - 0.5) * 30;
  }

  window.MasterTail = {
    input: null,             // bassFilter (audio-core が chain.connect(MasterTail.input))
    bassFilter: null,
    trebleFilter: null,
    masterTrim: null,
    initialized: false,
    activePreset: 'suitcase',

    // overlay click 後 (audioCtx 起動済 + masterBus 存在) に host から呼ばれる。
    // node 構築 → window.rebuildFilterChain() で chain 終端を MasterTail.input に切替。
    init: function() {
      if (MasterTail.initialized) return;
      if (typeof masterBus === 'undefined' || typeof audioCtx === 'undefined') return;

      var bass = audioCtx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.setValueAtTime(100, audioCtx.currentTime);
      bass.gain.setValueAtTime(0, audioCtx.currentTime);

      var treble = audioCtx.createBiquadFilter();
      treble.type = 'highshelf';
      treble.frequency.setValueAtTime(3500, audioCtx.currentTime);
      treble.gain.setValueAtTime(0, audioCtx.currentTime);

      var trim = audioCtx.createGain();
      // 64PE は既存出力 gain が keys より大きい (urinami 2026-04-27 観測:
      // Drive / Vintage で +3dB 加算するとクリップ)。よって 64PE では
      // masterTrim は 0dB 固定 = pass-through。keys 側の master-tail.js は
      // +3dB を保持 (keys は host 側で別経路の output gain が低いため)。
      trim.gain.setValueAtTime(1.0, audioCtx.currentTime);

      // tail 内部 chain を組む (host 責務)
      bass.connect(treble);
      treble.connect(trim);
      trim.connect(audioCtx.destination);

      MasterTail.bassFilter = bass;
      MasterTail.trebleFilter = treble;
      MasterTail.masterTrim = trim;
      MasterTail.input = bass;        // audio-core から見た tail の入口
      MasterTail.initialized = true;

      // audio-core に chain 再構築を要求 (chain 終端が destination → MasterTail.input)。
      if (typeof window.rebuildFilterChain === 'function') {
        window.rebuildFilterChain();
      }

      // 初期 preset 状態を反映 (Stage 起動なら slider 値、Suitcase なら flat)
      var initialIsSuitcase = true;
      try {
        if (typeof AudioState !== 'undefined' && AudioState.presetKey) {
          initialIsSuitcase = /Suitcase/i.test(AudioState.presetKey);
        }
      } catch (_) {}
      MasterTail.applyForPreset(initialIsSuitcase);

      if (typeof window !== 'undefined') {
        window._DEBUG = window._DEBUG || {};
        window._DEBUG.masterTail = MasterTail;
      }
    },

    applyEq: function(bassSliderValue, trebleSliderValue) {
      if (!MasterTail.initialized) return;
      if (MasterTail.activePreset !== 'stage') return;
      var t = audioCtx.currentTime;
      MasterTail.bassFilter.gain.setValueAtTime(sliderToDb(bassSliderValue), t);
      MasterTail.trebleFilter.gain.setValueAtTime(sliderToDb(trebleSliderValue), t);
    },

    reset: function() {
      if (!MasterTail.initialized) return;
      var t = audioCtx.currentTime;
      MasterTail.bassFilter.gain.setValueAtTime(0, t);
      MasterTail.trebleFilter.gain.setValueAtTime(0, t);
    },

    applyForPreset: function(isSuitcase) {
      MasterTail.activePreset = isSuitcase ? 'suitcase' : 'stage';
      if (!MasterTail.initialized) return;
      var now = audioCtx.currentTime;
      // 2026-04-27 urinami: 全 preset 共通 0dB (Pad Sensei EP keys 移植後に
      // voicing 確定 → 再調整方針)。preset 別 trim は keys 確定後に再 evaluate。
      MasterTail.masterTrim.gain.setValueAtTime(1.0, now);
      // Bass/Treble: Suitcase 時は最終段 flat (amp 内 Baxandall を尊重)、
      // Stage 時は slider 値で最終段 BiquadFilter 制御。
      if (isSuitcase) {
        MasterTail.bassFilter.gain.setValueAtTime(0, now);
        MasterTail.trebleFilter.gain.setValueAtTime(0, now);
      } else {
        var b = document.getElementById('ep-eq-bass');
        var t = document.getElementById('ep-eq-treble');
        var bv = b ? b.value : 0.5;
        var tv = t ? t.value : 0.5;
        MasterTail.bassFilter.gain.setValueAtTime(sliderToDb(bv), now);
        MasterTail.trebleFilter.gain.setValueAtTime(sliderToDb(tv), now);
      }
    }
  };
})();
