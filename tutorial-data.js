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
      targets: ['#inst-toggle-guitar', '#inst-toggle-bass', '#inst-toggle-piano'],
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
      targets: ['#key-buttons'],
      highlight: '#key-buttons',
      titleKey: 'tut.scale_mode.step2_title',
      msgKey: 'tut.scale_mode.step2_msg',
      waitFor: 'next',
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
      id: 'root_select',
      targets: ['#key-buttons'],
      highlight: '#key-buttons',
      titleKey: 'tut.chord_mode.step2_title',
      msgKey: 'tut.chord_mode.step2_msg',
      waitFor: 'next',
    },
    {
      type: 'highlight',
      id: 'quality',
      targets: ['#quality-grid'],
      highlight: '#step1',
      titleKey: 'tut.chord_mode.step3_title',
      msgKey: 'tut.chord_mode.step3_msg',
      waitFor: 'next',
    },
    {
      type: 'info',
      id: 'tension',
      targets: [],
      highlight: '#step1',
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
      waitFor: 'close',
    },
  ]
});
