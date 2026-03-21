// ========================================
// TUTORIAL DATA — Registry of all tutorial definitions
// Each tutorial: id, i18n keys, category, steps[]
// Loaded before tutorial.js. Pattern matches lang-*.js
// ========================================

var TutorialRegistry = {
  _tutorials: {},

  add: function(id, def) {
    def.id = id;
    if (!def.lsKey) def.lsKey = '64pad-tut-' + id;
    this._tutorials[id] = def;
  },

  get: function(id) {
    return this._tutorials[id] || null;
  },

  getAll: function() {
    return this._tutorials;
  },

  getByCategory: function(cat) {
    var result = [];
    var all = this._tutorials;
    for (var k in all) {
      if (all[k].category === cat) result.push(all[k]);
    }
    return result;
  },

  isComplete: function(id) {
    var tut = this._tutorials[id];
    if (!tut) return false;
    return localStorage.getItem(tut.lsKey) === '1';
  },

  markComplete: function(id) {
    var tut = this._tutorials[id];
    if (tut) localStorage.setItem(tut.lsKey, '1');
  },

  resetAll: function() {
    var all = this._tutorials;
    for (var k in all) {
      localStorage.removeItem(all[k].lsKey);
    }
    localStorage.removeItem('64pad-tutorial-complete');
  },

  categories: [
    { id: 'getting-started', titleKey: 'tut.cat_getting_started' },
    { id: 'features',        titleKey: 'tut.cat_features' },
    { id: 'advanced',        titleKey: 'tut.cat_advanced' }
  ]
};

// =============================================
// ONBOARDING — migrated from old STEPS array
// =============================================
TutorialRegistry.add('onboarding', {
  titleKey: 'tut.onboarding_title',
  descKey: 'tut.onboarding_desc',
  category: 'getting-started',
  lsKey: '64pad-tutorial-complete',  // backward compatible
  steps: [
    {
      type: 'action',
      id: 'sound',
      targets: ['#sound-controls', '#organ-preset'],
      highlight: '#organ-preset',
      titleKey: 'tut.onboarding.sound_title',
      msgKey: 'tut.onboarding.sound_msg',
      waitFor: 'preset-change',
    },
    {
      type: 'info',
      id: 'midi',
      targets: ['#midi-status'],
      highlight: '#midi-status',
      titleKey: 'tut.onboarding.midi_title',
      msgKey: 'tut.onboarding.midi_msg',
      msgKeyAlt: 'tut.onboarding.midi_no_device',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'input',
      targets: ['#mode-scale', '#mode-chord', '#mode-input'],
      highlight: null,
      titleKey: 'tut.onboarding.input_title',
      msgKey: 'tut.onboarding.input_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'instruments',
      targets: ['#inst-toggle-link', '#inst-toggle-guitar', '#inst-toggle-bass', '#inst-toggle-piano'],
      highlight: '#inst-toggle-bar',
      titleKey: 'tut.onboarding.instruments_title',
      msgKey: 'tut.onboarding.instruments_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'done',
      targets: [],
      highlight: null,
      titleKey: 'tut.onboarding.done_title',
      msgKey: 'tut.onboarding.done_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// SCALE MODE
// =============================================
TutorialRegistry.add('scale_mode', {
  titleKey: 'tut.scale_mode_title',
  descKey: 'tut.scale_mode_desc',
  category: 'getting-started',
  steps: [
    {
      type: 'action',
      id: 'switch_to_scale',
      targets: ['#mode-scale'],
      highlight: '#mode-scale',
      titleKey: 'tut.scale_mode.step1_title',
      msgKey: 'tut.scale_mode.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('scale');
      }
    },
    {
      type: 'highlight',
      id: 'key_select',
      targets: ['#key-buttons', '#circle-wrap'],
      highlight: '#circle-wrap',
      titleKey: 'tut.scale_mode.step2_title',
      msgKey: 'tut.scale_mode.step2_msg',
      waitFor: 'next',
      beforeShow: function() {
        // Ensure Circle of Fifths is visible
        if (typeof showCircle !== 'undefined' && !showCircle && typeof toggleTheoryView === 'function') {
          toggleTheoryView('circle');
        }
      },
    },
    {
      type: 'highlight',
      id: 'scale_select',
      targets: ['#scale-select'],
      highlight: '#scale-select',
      titleKey: 'tut.scale_mode.step3_title',
      msgKey: 'tut.scale_mode.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'diatonic',
      targets: ['#diatonic-bar'],
      highlight: '#diatonic-bar',
      titleKey: 'tut.scale_mode.step4_title',
      msgKey: 'tut.scale_mode.step4_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// CHORD MODE
// =============================================
TutorialRegistry.add('chord_mode', {
  titleKey: 'tut.chord_mode_title',
  descKey: 'tut.chord_mode_desc',
  category: 'getting-started',
  steps: [
    {
      type: 'action',
      id: 'switch_to_chord',
      targets: ['#mode-chord'],
      highlight: '#mode-chord',
      titleKey: 'tut.chord_mode.step1_title',
      msgKey: 'tut.chord_mode.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('chord');
      }
    },
    {
      type: 'highlight',
      id: 'key_select',
      targets: ['#chord-key-row'],
      highlight: '#chord-key-row',
      titleKey: 'tut.chord_mode.step_key_title',
      msgKey: 'tut.chord_mode.step_key_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'diatonic',
      targets: ['#diatonic-bar'],
      highlight: '#diatonic-bar',
      titleKey: 'tut.chord_mode.step_diatonic_title',
      msgKey: 'tut.chord_mode.step_diatonic_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'root_select',
      targets: ['#root-grid'],
      highlight: '#root-grid',
      titleKey: 'tut.chord_mode.step2_title',
      msgKey: 'tut.chord_mode.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'quality',
      targets: ['#quality-grid'],
      highlight: '#quality-grid',
      titleKey: 'tut.chord_mode.step3_title',
      msgKey: 'tut.chord_mode.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'tension',
      targets: [],
      highlight: '#step2',
      titleKey: 'tut.chord_mode.step4_title',
      msgKey: 'tut.chord_mode.step4_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'text_input',
      targets: ['#text-chord-input'],
      highlight: '.text-chord-container',
      titleKey: 'tut.chord_mode.step5_title',
      msgKey: 'tut.chord_mode.step5_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'secondary_dominant',
      targets: ['#diatonic-ext-toggles'],
      highlight: '#ext-secdom-btn',
      titleKey: 'tut.chord_mode.step6_title',
      msgKey: 'tut.chord_mode.step6_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'hybrid_chord',
      targets: ['#text-chord-input'],
      highlight: '.text-chord-container',
      titleKey: 'tut.chord_mode.step7_title',
      msgKey: 'tut.chord_mode.step7_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// INPUT MODE
// =============================================
TutorialRegistry.add('input_mode', {
  titleKey: 'tut.input_mode_title',
  descKey: 'tut.input_mode_desc',
  category: 'getting-started',
  steps: [
    {
      type: 'action',
      id: 'switch_to_input',
      targets: ['#mode-input'],
      highlight: '#mode-input',
      titleKey: 'tut.input_mode.step1_title',
      msgKey: 'tut.input_mode.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('input');
      }
    },
    {
      type: 'highlight',
      id: 'tap_pads',
      targets: ['#pad-grid'],
      highlight: '#pad-grid',
      titleKey: 'tut.input_mode.step2_title',
      msgKey: 'tut.input_mode.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'chord_detect',
      targets: ['#chord-name'],
      highlight: '#chord-name',
      titleKey: 'tut.input_mode.step3_title',
      msgKey: 'tut.input_mode.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'capture',
      targets: ['#memory-slots'],
      highlight: '#memory-slots',
      titleKey: 'tut.input_mode.step4_title',
      msgKey: 'tut.input_mode.step4_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// DIATONIC BAR
// =============================================
TutorialRegistry.add('diatonic', {
  titleKey: 'tut.diatonic_title',
  descKey: 'tut.diatonic_desc',
  category: 'features',
  steps: [
    {
      type: 'highlight',
      id: 'bar_overview',
      targets: ['#diatonic-bar'],
      highlight: '#diatonic-bar',
      titleKey: 'tut.diatonic.step1_title',
      msgKey: 'tut.diatonic.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('scale');
      }
    },
    {
      type: 'info',
      id: 'triad_tetrad',
      targets: ['#diatonic-bar'],
      highlight: '#diatonic-bar',
      titleKey: 'tut.diatonic.step2_title',
      msgKey: 'tut.diatonic.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'click_chord',
      targets: ['#diatonic-bar'],
      highlight: '#diatonic-bar',
      titleKey: 'tut.diatonic.step3_title',
      msgKey: 'tut.diatonic.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'minor_variants',
      targets: ['#diatonic-ext-toggles'],
      highlight: '#ext-minor-btn',
      titleKey: 'tut.diatonic.step4_title',
      msgKey: 'tut.diatonic.step4_msg',
      waitFor: 'next',
      beforeShow: function() {
        // Switch to Am Natural Minor to show minor-specific features
        if (typeof AppState !== 'undefined') {
          AppState.key = 9; AppState.scaleIdx = 5;
          if (typeof render === 'function') render();
        }
      }
    },
    {
      type: 'info',
      id: 'secdom',
      targets: ['#diatonic-ext-toggles'],
      highlight: '#ext-secdom-btn',
      titleKey: 'tut.diatonic.step5_title',
      msgKey: 'tut.diatonic.step5_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'shortcuts',
      targets: [],
      highlight: null,
      titleKey: 'tut.diatonic.step6_title',
      msgKey: 'tut.diatonic.step6_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// MEMORY & PERFORM
// =============================================
TutorialRegistry.add('memory', {
  titleKey: 'tut.memory_title',
  descKey: 'tut.memory_desc',
  category: 'features',
  steps: [
    {
      type: 'info',
      id: 'save_chord',
      targets: ['#memory-slots'],
      highlight: '#memory-slots',
      titleKey: 'tut.memory.step1_title',
      msgKey: 'tut.memory.step1_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'slots',
      targets: ['#memory-slots'],
      highlight: '#memory-slots',
      titleKey: 'tut.memory.step2_title',
      msgKey: 'tut.memory.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'banks',
      targets: ['#bank-bar'],
      highlight: '#bank-bar',
      titleKey: 'tut.memory.step3_title',
      msgKey: 'tut.memory.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'perform',
      targets: ['#mem-view-perform'],
      highlight: '#mem-view-perform',
      titleKey: 'tut.memory.step4_title',
      msgKey: 'tut.memory.step4_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'export',
      targets: [],
      highlight: null,
      titleKey: 'tut.memory.step5_title',
      msgKey: 'tut.memory.step5_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// VOICING
// =============================================
TutorialRegistry.add('voicing', {
  titleKey: 'tut.voicing_title',
  descKey: 'tut.voicing_desc',
  category: 'features',
  steps: [
    {
      type: 'info',
      id: 'overview',
      targets: ['#btn-omit5', '#btn-rootless'],
      highlight: null,
      titleKey: 'tut.voicing.step1_title',
      msgKey: 'tut.voicing.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('chord');
      }
    },
    {
      type: 'highlight',
      id: 'shell',
      targets: ['#shell-bar'],
      highlight: '#shell-bar',
      titleKey: 'tut.voicing.step2_title',
      msgKey: 'tut.voicing.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'omit_rootless',
      targets: ['#btn-omit5', '#btn-rootless', '#btn-omit3'],
      highlight: '#btn-omit5',
      titleKey: 'tut.voicing.step3_title',
      msgKey: 'tut.voicing.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'inversion',
      targets: ['#btn-inv0', '#btn-inv1', '#btn-inv2', '#btn-inv3'],
      highlight: '#btn-inv0',
      titleKey: 'tut.voicing.step4_title',
      msgKey: 'tut.voicing.step4_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'drop',
      targets: ['#drop-bar'],
      highlight: '#drop-bar',
      titleKey: 'tut.voicing.step5_title',
      msgKey: 'tut.voicing.step5_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'voicing_box',
      targets: [],
      highlight: null,
      titleKey: 'tut.voicing.step6_title',
      msgKey: 'tut.voicing.step6_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// SOUND
// =============================================
TutorialRegistry.add('sound', {
  titleKey: 'tut.sound_title',
  descKey: 'tut.sound_desc',
  category: 'features',
  steps: [
    {
      type: 'highlight',
      id: 'preset',
      targets: ['#organ-preset'],
      highlight: '#organ-preset',
      titleKey: 'tut.sound.step1_title',
      msgKey: 'tut.sound.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof showSound !== 'undefined' && !showSound && typeof toggleInstrument === 'function') {
          toggleInstrument('sound');
        }
      }
    },
    {
      type: 'info',
      id: 'expand',
      targets: ['#sound-expand-btn'],
      highlight: '#sound-expand-btn',
      titleKey: 'tut.sound.step2_title',
      msgKey: 'tut.sound.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'effects',
      targets: [],
      highlight: null,
      titleKey: 'tut.sound.step3_title',
      msgKey: 'tut.sound.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'mute_vol',
      targets: ['#sound-mute-btn'],
      highlight: '#sound-mute-btn',
      titleKey: 'tut.sound.step4_title',
      msgKey: 'tut.sound.step4_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// TASTY VOICING (HPS)
// =============================================
TutorialRegistry.add('tasty', {
  titleKey: 'tut.tasty_title',
  descKey: 'tut.tasty_desc',
  category: 'advanced',
  requireEl: '#tasty-bar',

  steps: [
    {
      type: 'info',
      id: 'activate',
      targets: ['#tasty-bar'],
      highlight: '#btn-tasty',
      titleKey: 'tut.tasty.step1_title',
      msgKey: 'tut.tasty.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('chord');
      }
    },
    {
      type: 'info',
      id: 'cycle',
      targets: ['#tasty-bar'],
      highlight: '#tasty-counter',
      titleKey: 'tut.tasty.step2_title',
      msgKey: 'tut.tasty.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'degrees',
      targets: ['#tasty-info'],
      highlight: '#tasty-info',
      titleKey: 'tut.tasty.step3_title',
      msgKey: 'tut.tasty.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'to_pad',
      targets: [],
      highlight: null,
      titleKey: 'tut.tasty.step4_title',
      msgKey: 'tut.tasty.step4_msg',
      waitFor: 'close',
    },
  ],
  // Fallback steps when ?hps is not active (TASTY bar not visible)
  fallbackSteps: [
    {
      type: 'info',
      id: 'what_is_tasty',
      targets: [],
      highlight: null,
      titleKey: 'tut.tasty.fb_step1_title',
      msgKey: 'tut.tasty.fb_step1_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'how_to_access',
      targets: [],
      highlight: null,
      titleKey: 'tut.tasty.fb_step2_title',
      msgKey: 'tut.tasty.fb_step2_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// STOCK VOICING (HPS)
// =============================================
TutorialRegistry.add('stock', {
  titleKey: 'tut.stock_title',
  descKey: 'tut.stock_desc',
  category: 'advanced',
  requireEl: '#stock-bar',

  steps: [
    {
      type: 'info',
      id: 'activate',
      targets: ['#stock-bar'],
      highlight: '#btn-stock',
      titleKey: 'tut.stock.step1_title',
      msgKey: 'tut.stock.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('chord');
      }
    },
    {
      type: 'info',
      id: 'cycle',
      targets: ['#stock-bar'],
      highlight: '#stock-counter',
      titleKey: 'tut.stock.step2_title',
      msgKey: 'tut.stock.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'keyboard',
      targets: [],
      highlight: null,
      titleKey: 'tut.stock.step3_title',
      msgKey: 'tut.stock.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'to_pad',
      targets: ['#stock-reflect-btn'],
      highlight: '#stock-reflect-btn',
      titleKey: 'tut.stock.step4_title',
      msgKey: 'tut.stock.step4_msg',
      waitFor: 'close',
    },
  ],
  // Fallback steps when ?hps is not active (STOCK bar not visible)
  fallbackSteps: [
    {
      type: 'info',
      id: 'what_is_stock',
      targets: [],
      highlight: null,
      titleKey: 'tut.stock.fb_step1_title',
      msgKey: 'tut.stock.fb_step1_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'how_to_access',
      targets: [],
      highlight: null,
      titleKey: 'tut.stock.fb_step2_title',
      msgKey: 'tut.stock.fb_step2_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// CIRCLE OF FIFTHS
// =============================================
TutorialRegistry.add('circle', {
  titleKey: 'tut.circle_title',
  descKey: 'tut.circle_desc',
  category: 'advanced',
  steps: [
    {
      type: 'highlight',
      id: 'open',
      targets: ['#inst-toggle-circle'],
      highlight: '#inst-toggle-circle',
      titleKey: 'tut.circle.step1_title',
      msgKey: 'tut.circle.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        // Show circle if hidden
        var wrap = document.getElementById('circle-wrap');
        if (wrap && wrap.style.display === 'none') {
          if (typeof toggleTheoryView === 'function') toggleTheoryView('circle');
        }
      }
    },
    {
      type: 'highlight',
      id: 'key_link',
      targets: ['#circle-wrap'],
      highlight: '#circle-of-fifths',
      titleKey: 'tut.circle.step2_title',
      msgKey: 'tut.circle.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'functions',
      targets: ['#circle-wrap'],
      highlight: '#circle-of-fifths',
      titleKey: 'tut.circle.step3_title',
      msgKey: 'tut.circle.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'action',
      id: 'minor_select',
      targets: ['#circle-of-fifths'],
      highlight: '#circle-of-fifths',
      titleKey: 'tut.circle.step4_title',
      msgKey: 'tut.circle.step4_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'minor_modes',
      targets: ['#circle-of-fifths'],
      highlight: '#circle-of-fifths',
      titleKey: 'tut.circle.step5_title',
      msgKey: 'tut.circle.step5_msg',
      waitFor: 'next',
    },
    {
      type: 'action',
      id: 'try_minor_modes',
      targets: ['#circle-of-fifths'],
      highlight: '#circle-of-fifths',
      titleKey: 'tut.circle.step6_title',
      msgKey: 'tut.circle.step6_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// GUITAR — independent tutorial (#1332)
// =============================================
TutorialRegistry.add('guitar', {
  titleKey: 'tut.guitar_title',
  descKey: 'tut.guitar_desc',
  category: 'features',

  steps: [
    {
      type: 'highlight',
      id: 'toggle',
      targets: ['#inst-toggle-guitar'],
      highlight: '#inst-toggle-guitar',
      titleKey: 'tut.guitar.step1_title',
      msgKey: 'tut.guitar.step1_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('chord');
        var wrap = document.getElementById('guitar-wrap');
        if (wrap && wrap.style.display === 'none') {
          if (typeof toggleInstrument === 'function') toggleInstrument('guitar');
        }
      }
    },
    {
      type: 'highlight',
      id: 'fretboard',
      targets: ['#guitar-wrap'],
      highlight: '#guitar-wrap',
      titleKey: 'tut.guitar.step2_title',
      msgKey: 'tut.guitar.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'action',
      id: 'input',
      targets: ['#guitar-wrap'],
      highlight: '#guitar-wrap',
      titleKey: 'tut.guitar.step3_title',
      msgKey: 'tut.guitar.step3_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('input');
      }
    },
    {
      type: 'info',
      id: 'reflect',
      targets: [],
      highlight: null,
      titleKey: 'tut.guitar.step4_title',
      msgKey: 'tut.guitar.step4_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// KEYBOARD SHORTCUTS — walkthrough (#1329)
// =============================================
TutorialRegistry.add('shortcuts', {
  titleKey: 'tut.shortcuts_title',
  descKey: 'tut.shortcuts_desc',
  category: 'advanced',
  steps: [
    {
      type: 'info',
      id: 'modes',
      targets: ['#mode-scale', '#mode-chord', '#mode-input'],
      highlight: null,
      titleKey: 'tut.shortcuts.step1_title',
      msgKey: 'tut.shortcuts.step1_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'chord_nav',
      targets: ['#diatonic-bar'],
      highlight: '#diatonic-bar',
      titleKey: 'tut.shortcuts.step2_title',
      msgKey: 'tut.shortcuts.step2_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (typeof setMode === 'function') setMode('scale');
      }
    },
    {
      type: 'info',
      id: 'voicing_keys',
      targets: [],
      highlight: null,
      titleKey: 'tut.shortcuts.step3_title',
      msgKey: 'tut.shortcuts.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'memory_keys',
      targets: ['#memory-slots'],
      highlight: '#memory-slots',
      titleKey: 'tut.shortcuts.step4_title',
      msgKey: 'tut.shortcuts.step4_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'help_key',
      targets: [],
      highlight: null,
      titleKey: 'tut.shortcuts.step5_title',
      msgKey: 'tut.shortcuts.step5_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// SETTINGS & DISPLAY
// =============================================
TutorialRegistry.add('settings', {
  titleKey: 'tut.settings_title',
  descKey: 'tut.settings_desc',
  category: 'advanced',
  steps: [
    {
      type: 'highlight',
      id: 'instruments',
      targets: ['#inst-toggle-bar'],
      highlight: '#inst-toggle-bar',
      titleKey: 'tut.settings.step1_title',
      msgKey: 'tut.settings.step1_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'labels',
      targets: [],
      highlight: null,
      titleKey: 'tut.settings.step2_title',
      msgKey: 'tut.settings.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'octave',
      targets: ['#oct-down', '#oct-up'],
      highlight: '#oct-label',
      titleKey: 'tut.settings.step3_title',
      msgKey: 'tut.settings.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'section_toggles',
      targets: [],
      highlight: null,
      titleKey: 'tut.settings.step4_title',
      msgKey: 'tut.settings.step4_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'pane_order',
      targets: [],
      highlight: null,
      titleKey: 'tut.settings.step5_title',
      msgKey: 'tut.settings.step5_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'save',
      targets: [],
      highlight: null,
      titleKey: 'tut.settings.step6_title',
      msgKey: 'tut.settings.step6_msg',
      waitFor: 'close',
    },
  ]
});

// =============================================
// LINK MODE
// =============================================
TutorialRegistry.add('link_mode', {
  titleKey: 'tut.link_title',
  descKey: 'tut.link_desc',
  category: 'features',
  steps: [
    {
      type: 'highlight',
      id: 'link_button',
      targets: ['#inst-toggle-link'],
      highlight: '#inst-toggle-link',
      titleKey: 'tut.link.step1_title',
      msgKey: 'tut.link.step1_msg',
      waitFor: 'next',
    },
    {
      type: 'action',
      id: 'enable_link',
      targets: ['#inst-toggle-link'],
      highlight: '#inst-toggle-link',
      titleKey: 'tut.link.step2_title',
      msgKey: 'tut.link.step2_msg',
      waitFor: 'next',
      beforeShow: function() {
        if (!linkMode) toggleLinkMode();
        if (!showGuitar) toggleInstrument('guitar');
        if (!showPiano) toggleInstrument('piano');
      }
    },
    {
      type: 'info',
      id: 'play_notes',
      targets: ['#pad-grid'],
      highlight: '#pad-grid',
      titleKey: 'tut.link.step3_title',
      msgKey: 'tut.link.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'shortcut',
      targets: [],
      highlight: null,
      titleKey: 'tut.link.step4_title',
      msgKey: 'tut.link.step4_msg',
      waitFor: 'close',
    },
  ]
});
