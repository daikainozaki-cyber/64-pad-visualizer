// ========================================
// TUTORIAL ENGINE — Interactive onboarding for first-time users
// Loaded after main.js. Starts after Audio Overlay is dismissed.
// localStorage '64pad-tutorial-complete' tracks completion.
// ========================================

var TutorialEngine = {
  step: -1,
  active: false,
  card: null,
  highlightEl: null,
  _presetChanged: false,

  STEPS: [
    {
      id: 'sound',
      targets: ['#sound-controls', '#organ-preset'],
      highlight: '#organ-preset',
      titleKey: 'tutorial.sound_title',
      msgKey: 'tutorial.sound_msg',
      waitFor: 'preset-change',  // wait for user to change sound preset
    },
    {
      id: 'midi',
      targets: ['#midi-status'],
      highlight: '#midi-status',
      titleKey: 'tutorial.midi_title',
      msgKey: 'tutorial.midi_msg',
      msgKeyAlt: 'tutorial.midi_no_device',
      waitFor: 'next',
    },
    {
      id: 'input',
      targets: ['#mode-scale', '#mode-chord', '#mode-input'],
      highlight: null,  // highlight the mode bar area
      titleKey: 'tutorial.input_title',
      msgKey: 'tutorial.input_msg',
      waitFor: 'next',
    },
    {
      id: 'instruments',
      targets: ['#inst-toggle-guitar', '#inst-toggle-bass', '#inst-toggle-piano'],
      highlight: '#inst-toggle-bar',
      titleKey: 'tutorial.instruments_title',
      msgKey: 'tutorial.instruments_msg',
      waitFor: 'next',
    },
    {
      id: 'done',
      targets: [],
      highlight: null,
      titleKey: 'tutorial.done_title',
      msgKey: 'tutorial.done_msg',
      waitFor: 'close',
    },
  ],

  shouldStart: function() {
    // Only start for first-time users who haven't completed tutorial
    // Existing users (who have 64pad-sound) see tutorial only if they explicitly reset
    if (localStorage.getItem('64pad-tutorial-complete')) return false;
    if (localStorage.getItem('64pad-tutorial-reset')) return true;  // explicit reset from Help modal
    if (localStorage.getItem('64pad-sound')) return false;  // existing user
    return true;
  },

  start: function() {
    if (!this.shouldStart()) return;
    localStorage.removeItem('64pad-tutorial-reset');  // clear reset flag after use
    this.active = true;
    this.step = -1;
    this._presetChanged = false;
    // Listen for preset changes (for step 0)
    // Store bound reference so removeEventListener works (bind creates new fn each call)
    this._boundOnPresetChange = this._onPresetChange.bind(this);
    var presetSel = document.getElementById('organ-preset');
    if (presetSel) {
      presetSel.addEventListener('change', this._boundOnPresetChange);
    }
    this.next();
  },

  next: function() {
    this.step++;
    if (this.step >= this.STEPS.length) {
      this.complete();
      return;
    }
    this._renderStep();
  },

  skip: function() {
    this.complete();
  },

  complete: function() {
    this.active = false;
    this._removeCard();
    this._removeHighlight();
    localStorage.setItem('64pad-tutorial-complete', '1');
    // Remove preset listener (use stored bound reference)
    var presetSel = document.getElementById('organ-preset');
    if (presetSel && this._boundOnPresetChange) {
      presetSel.removeEventListener('change', this._boundOnPresetChange);
    }
  },

  _onPresetChange: function() {
    this._presetChanged = true;
    if (this.active && this.step === 0) {
      // Show "Next" button after preset change
      var nextBtn = document.querySelector('.tutorial-next-btn');
      if (nextBtn) nextBtn.style.display = '';
      // Update message
      var msgEl = document.querySelector('.tutorial-msg');
      if (msgEl) {
        var doneMsg = t('tutorial.sound_done');
        if (doneMsg !== 'tutorial.sound_done') msgEl.textContent = doneMsg;
      }
    }
  },

  _renderStep: function() {
    this._removeCard();
    this._removeHighlight();

    var stepDef = this.STEPS[this.step];
    var self = this;

    // Ensure Sound panel is expanded for sound step
    if (stepDef.id === 'sound') {
      if (typeof showSound !== 'undefined' && !showSound && typeof toggleInstrument === 'function') {
        toggleInstrument('sound');
      }
    }

    // Highlight target elements
    if (stepDef.highlight) {
      var hl = document.querySelector(stepDef.highlight);
      if (hl) {
        hl.classList.add('tutorial-highlight');
        this.highlightEl = hl;
      }
    }
    stepDef.targets.forEach(function(sel) {
      var el = document.querySelector(sel);
      if (el) el.classList.add('tutorial-target');
    });

    // Create card
    var card = document.createElement('div');
    card.id = 'tutorial-card';
    card.className = 'tutorial-card';

    // Step indicator
    var stepNum = this.step + 1;
    var totalSteps = this.STEPS.length;
    var dots = '';
    for (var i = 0; i < totalSteps; i++) {
      dots += '<span class="tutorial-dot' + (i === this.step ? ' active' : '') + '"></span>';
    }

    // Title
    var title = t(stepDef.titleKey);
    if (title === stepDef.titleKey) title = stepDef.id; // fallback

    // Message — check for alt message (e.g., MIDI no device)
    var msg = '';
    if (stepDef.id === 'midi') {
      var hasMidi = midiAccess && midiAccess.inputs && midiAccess.inputs.size > 0;
      if (hasMidi) {
        msg = t(stepDef.msgKey);
      } else {
        msg = t(stepDef.msgKeyAlt || stepDef.msgKey);
      }
    } else {
      msg = t(stepDef.msgKey);
    }
    if (msg === stepDef.msgKey || msg === stepDef.msgKeyAlt) msg = '';

    // Build card HTML
    var html = '<div class="tutorial-dots">' + dots + '</div>';
    html += '<div class="tutorial-title">' + title + '</div>';
    html += '<div class="tutorial-msg">' + msg + '</div>';
    html += '<div class="tutorial-actions">';

    if (stepDef.waitFor === 'preset-change') {
      // Sound step: show Next only after preset change
      html += '<button class="tutorial-next-btn" style="' + (this._presetChanged ? '' : 'display:none') + '" onclick="TutorialEngine.next()">' + t('tutorial.next') + '</button>';
      html += '<button class="tutorial-skip-btn" onclick="TutorialEngine.next()">' + t('tutorial.skip_step') + '</button>';
    } else if (stepDef.waitFor === 'close') {
      // Done step
      html += '<a class="tutorial-guide-link" href="guide.html" target="_blank">' + t('tutorial.open_guide') + '</a>';
      html += '<button class="tutorial-next-btn" onclick="TutorialEngine.complete()">' + t('tutorial.close') + '</button>';
    } else {
      // Normal next step
      html += '<button class="tutorial-next-btn" onclick="TutorialEngine.next()">' + t('tutorial.next') + '</button>';
    }

    // Skip tutorial (always available except on last step)
    if (stepDef.waitFor !== 'close') {
      html += '<button class="tutorial-skip-all-btn" onclick="TutorialEngine.skip()">' + t('tutorial.skip_all') + '</button>';
    }

    html += '</div>';
    card.innerHTML = html;

    // Insert card near target or at top of main area
    var insertTarget = document.getElementById('pad-grid');
    if (insertTarget) {
      insertTarget.parentNode.insertBefore(card, insertTarget);
    } else {
      document.body.appendChild(card);
    }
    this.card = card;

    // Scroll highlight into view
    if (this.highlightEl) {
      this.highlightEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  _removeCard: function() {
    var card = document.getElementById('tutorial-card');
    if (card) card.remove();
    this.card = null;
  },

  _removeHighlight: function() {
    // Remove all tutorial highlights
    document.querySelectorAll('.tutorial-highlight').forEach(function(el) {
      el.classList.remove('tutorial-highlight');
    });
    document.querySelectorAll('.tutorial-target').forEach(function(el) {
      el.classList.remove('tutorial-target');
    });
    this.highlightEl = null;
  },

  // Reset tutorial (from Help modal) — forces restart even for existing users
  reset: function() {
    localStorage.removeItem('64pad-tutorial-complete');
    localStorage.setItem('64pad-tutorial-reset', '1');
  }
};

// Hook: Start tutorial after audio overlay is dismissed (for first-time users)
(function hookTutorialStart() {
  var origDismiss = window.dismissAudioOverlay;
  window.dismissAudioOverlay = function() {
    if (typeof origDismiss === 'function') origDismiss();
    // Delay slightly to let audio init complete
    if (TutorialEngine.shouldStart()) {
      setTimeout(function() { TutorialEngine.start(); }, 800);
    }
  };
})();
