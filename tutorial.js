// ========================================
// TUTORIAL ENGINE — Multi-tutorial system with selector UI
// Depends on: tutorial-data.js (TutorialRegistry), i18n.js (t())
// localStorage '64pad-tutorial-complete' = onboarding backward compat
// localStorage '64pad-tut-{id}' = per-tutorial completion
// ========================================

var TutorialEngine = {
  step: -1,
  active: false,
  card: null,
  highlightEl: null,
  _presetChanged: false,
  _currentTutorialId: null,
  _currentSteps: null,

  // ---- Onboarding auto-start logic (backward compat) ----

  shouldStart: function() {
    if (localStorage.getItem('64pad-tutorial-complete')) return false;
    if (localStorage.getItem('64pad-tutorial-reset')) return true;
    if (localStorage.getItem('64pad-sound')) return false;
    return true;
  },

  // ---- Start a specific tutorial by ID ----

  startTutorial: function(id) {
    var tut = TutorialRegistry.get(id);
    if (!tut) return;
    // Close selector if open
    this._closeSelector();
    this._currentTutorialId = id;
    this._currentSteps = tut.steps;
    this.active = true;
    this.step = -1;
    this._presetChanged = false;
    // Preset listener for onboarding sound step
    if (id === 'onboarding') {
      this._boundOnPresetChange = this._onPresetChange.bind(this);
      var presetSel = document.getElementById('organ-preset');
      if (presetSel) {
        presetSel.addEventListener('change', this._boundOnPresetChange);
      }
    }
    this.next();
  },

  // Legacy: start onboarding
  start: function(force) {
    if (!force && !this.shouldStart()) return;
    localStorage.removeItem('64pad-tutorial-reset');
    this.startTutorial('onboarding');
  },

  next: function() {
    this.step++;
    var steps = this._currentSteps || [];
    if (this.step >= steps.length) {
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
    // Mark tutorial complete
    if (this._currentTutorialId) {
      TutorialRegistry.markComplete(this._currentTutorialId);
    }
    // Remove preset listener
    var presetSel = document.getElementById('organ-preset');
    if (presetSel && this._boundOnPresetChange) {
      presetSel.removeEventListener('change', this._boundOnPresetChange);
    }
    this._currentTutorialId = null;
    this._currentSteps = null;
  },

  _onPresetChange: function() {
    this._presetChanged = true;
    if (this.active && this._currentSteps && this.step >= 0) {
      var stepDef = this._currentSteps[this.step];
      if (stepDef && stepDef.waitFor === 'preset-change') {
        var nextBtn = document.querySelector('.tutorial-next-btn');
        if (nextBtn) nextBtn.style.display = '';
        var msgEl = document.querySelector('.tutorial-msg');
        if (msgEl) {
          var doneMsg = t('tut.onboarding.sound_done');
          if (doneMsg !== 'tut.onboarding.sound_done') msgEl.textContent = doneMsg;
        }
      }
    }
  },

  _renderStep: function() {
    this._removeCard();
    this._removeHighlight();

    var steps = this._currentSteps;
    if (!steps || this.step < 0 || this.step >= steps.length) return;
    var stepDef = steps[this.step];

    // beforeShow hook
    if (typeof stepDef.beforeShow === 'function') {
      stepDef.beforeShow();
    }

    // Ensure Sound panel is expanded for onboarding sound step
    if (stepDef.id === 'sound' && this._currentTutorialId === 'onboarding') {
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
    if (stepDef.targets) {
      stepDef.targets.forEach(function(sel) {
        var el = document.querySelector(sel);
        if (el) el.classList.add('tutorial-target');
      });
    }

    // Create card
    var card = document.createElement('div');
    card.id = 'tutorial-card';
    card.className = 'tutorial-card';

    // Step indicator
    var totalSteps = steps.length;
    var dots = '';
    for (var i = 0; i < totalSteps; i++) {
      dots += '<span class="tutorial-dot' + (i === this.step ? ' active' : '') + '"></span>';
    }

    // Title
    var title = t(stepDef.titleKey);
    if (title === stepDef.titleKey) title = stepDef.id || '';

    // Message — check for alt message (e.g., MIDI no device)
    var msg = '';
    if (stepDef.id === 'midi' && this._currentTutorialId === 'onboarding') {
      var hasMidi = typeof midiAccess !== 'undefined' && midiAccess && midiAccess.inputs && midiAccess.inputs.size > 0;
      if (hasMidi) {
        msg = t(stepDef.msgKey);
      } else {
        msg = t(stepDef.msgKeyAlt || stepDef.msgKey);
      }
    } else {
      msg = t(stepDef.msgKey);
    }
    if (msg === stepDef.msgKey || msg === stepDef.msgKeyAlt) msg = '';

    // Media
    var mediaHtml = '';
    if (stepDef.media) {
      if (stepDef.media.type === 'img') {
        mediaHtml = '<div class="tutorial-media"><img src="' + stepDef.media.src + '" loading="lazy" alt=""></div>';
      } else if (stepDef.media.type === 'video') {
        mediaHtml = '<div class="tutorial-media"><div class="video-wrap"><iframe src="' + stepDef.media.src + '" allowfullscreen loading="lazy"></iframe></div></div>';
      }
    }

    // Build card HTML
    var html = '<div class="tutorial-dots">' + dots + '</div>';
    html += '<div class="tutorial-title">' + title + '</div>';
    html += '<div class="tutorial-msg">' + msg + '</div>';
    if (mediaHtml) html += mediaHtml;
    html += '<div class="tutorial-actions">';

    if (stepDef.waitFor === 'preset-change') {
      html += '<button class="tutorial-next-btn" style="' + (this._presetChanged ? '' : 'display:none') + '" onclick="TutorialEngine.next()">' + t('tut.next') + '</button>';
      html += '<button class="tutorial-skip-btn" onclick="TutorialEngine.next()">' + t('tut.skip_step') + '</button>';
    } else if (stepDef.waitFor === 'close') {
      if (this._currentTutorialId === 'onboarding') {
        html += '<a class="tutorial-guide-link" href="guide.html" target="_blank">' + t('tut.open_guide') + '</a>';
      }
      html += '<button class="tutorial-next-btn" onclick="TutorialEngine.complete()">' + t('tut.close') + '</button>';
    } else {
      html += '<button class="tutorial-next-btn" onclick="TutorialEngine.next()">' + t('tut.next') + '</button>';
    }

    // Skip tutorial (always available except on last step)
    if (stepDef.waitFor !== 'close') {
      html += '<button class="tutorial-skip-all-btn" onclick="TutorialEngine.skip()">' + t('tut.skip_all') + '</button>';
    }

    html += '</div>';
    card.innerHTML = html;

    // Insert card
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
    document.querySelectorAll('.tutorial-highlight').forEach(function(el) {
      el.classList.remove('tutorial-highlight');
    });
    document.querySelectorAll('.tutorial-target').forEach(function(el) {
      el.classList.remove('tutorial-target');
    });
    this.highlightEl = null;
  },

  // Legacy reset (from Help modal) — forces onboarding restart
  reset: function() {
    localStorage.removeItem('64pad-tutorial-complete');
    localStorage.setItem('64pad-tutorial-reset', '1');
  },

  // ---- Selector Modal ----

  showSelector: function() {
    // Stop pulse on first click
    var tutBtn = document.getElementById('tut-btn');
    if (tutBtn) tutBtn.classList.remove('tut-pulse');
    localStorage.setItem('64pad-tut-noticed', '1');

    // Close help modal if open
    var helpOv = document.getElementById('help-overlay');
    if (helpOv) helpOv.classList.remove('active');

    // Don't open if tutorial is running
    if (this.active) {
      this.skip();
    }

    // Always rebuild to reflect current completion state
    var existing = document.getElementById('tut-selector-overlay');
    if (existing) existing.remove();

    // Build selector
    var overlay = document.createElement('div');
    overlay.id = 'tut-selector-overlay';
    overlay.className = 'help-overlay active';
    overlay.onclick = function(e) {
      if (e.target === overlay) overlay.classList.remove('active');
    };

    var modal = document.createElement('div');
    modal.className = 'help-modal tut-selector-modal';

    var html = '<h2>' + t('tut.selector_title') + '</h2>';

    var cats = TutorialRegistry.categories;
    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      var tuts = TutorialRegistry.getByCategory(cat.id);
      if (tuts.length === 0) continue;

      html += '<h3 class="tut-cat-title">' + t(cat.titleKey) + '</h3>';
      html += '<div class="tut-card-grid">';

      for (var ti = 0; ti < tuts.length; ti++) {
        var tut = tuts[ti];
        var done = TutorialRegistry.isComplete(tut.id);
        var title = t(tut.titleKey);
        if (title === tut.titleKey) title = tut.id;
        var desc = t(tut.descKey || '');
        if (desc === tut.descKey) desc = '';
        var stepCount = tut.steps ? tut.steps.length : 0;

        html += '<button class="tut-card' + (done ? ' tut-card-done' : '') + '" onclick="TutorialEngine._launchFromSelector(\'' + tut.id + '\')">';
        html += '<span class="tut-card-title">' + title + (done ? ' <span class="tut-badge">&#10003;</span>' : '') + '</span>';
        if (desc) html += '<span class="tut-card-desc">' + desc + '</span>';
        html += '<span class="tut-card-steps">' + stepCount + ' ' + t('tut.steps_label') + '</span>';
        html += '</button>';
      }

      html += '</div>';
    }

    // Reset all button
    html += '<div style="text-align:center;margin-top:12px;">';
    html += '<button class="tut-reset-all-btn" onclick="TutorialRegistry.resetAll();TutorialEngine._refreshSelector();">' + t('tut.reset_all') + '</button>';
    html += '</div>';

    html += '<button class="close-btn" onclick="document.getElementById(\'tut-selector-overlay\').classList.remove(\'active\')">' + t('tut.close_selector') + '</button>';

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  },

  _closeSelector: function() {
    var ov = document.getElementById('tut-selector-overlay');
    if (ov) ov.classList.remove('active');
  },

  _launchFromSelector: function(id) {
    this._closeSelector();
    this.startTutorial(id);
  },

  _refreshSelector: function() {
    var ov = document.getElementById('tut-selector-overlay');
    if (ov) ov.remove();
    this.showSelector();
  }
};

// Hook: Start onboarding after audio overlay is dismissed (for first-time users)
(function hookTutorialStart() {
  var origDismiss = window.dismissAudioOverlay;
  window.dismissAudioOverlay = function() {
    var startTutorial = TutorialEngine.shouldStart();
    if (typeof origDismiss === 'function') origDismiss();
    if (startTutorial) {
      setTimeout(function() { TutorialEngine.start(true); }, 800);
    }
  };
})();

// Pulse the tutorial button if user hasn't noticed it yet
(function pulseTutorialBtn() {
  if (localStorage.getItem('64pad-tut-noticed')) return;
  var btn = document.getElementById('tut-btn');
  if (btn) btn.classList.add('tut-pulse');
})();

// ========================================
// CONTEXT HINTS — suggest tutorials on first feature interaction
// Shows a small toast when user first touches a feature with a tutorial
// localStorage '64pad-hint-{id}' = shown flag (one-time per tutorial)
// ========================================

var TutorialHints = {
  _map: [
    { sel: '#mode-scale', id: 'scale_mode' },
    { sel: '#mode-chord', id: 'chord_mode' },
    { sel: '#mode-input', id: 'input_mode' },
    { sel: '#diatonic-bar', id: 'diatonic' },
    { sel: '#memory-section', id: 'memory' },
    { sel: '#shell-bar', id: 'voicing' },
    { sel: '#sound-expand-btn', id: 'sound' },
    { sel: '#tasty-bar', id: 'tasty' },
    { sel: '#stock-bar', id: 'stock' },
    { sel: '#inst-toggle-circle', id: 'circle' },
    { sel: '#inst-toggle-bar', id: 'settings' }
  ],
  _toastTimer: null,

  init: function() {
    var self = this;
    this._map.forEach(function(entry) {
      var el = document.querySelector(entry.sel);
      if (!el) return;
      el.addEventListener('click', function() {
        self._onFeatureClick(entry.id);
      });
    });
  },

  _onFeatureClick: function(tutorialId) {
    // Don't show during active tutorial
    if (TutorialEngine.active) return;
    // Don't show if tutorial already completed
    if (TutorialRegistry.isComplete(tutorialId)) return;
    // Don't show if hint already shown for this tutorial
    if (localStorage.getItem('64pad-hint-' + tutorialId)) return;
    // Don't show until onboarding is done (avoid overwhelming new users)
    if (!localStorage.getItem('64pad-tutorial-complete')) return;

    // Mark hint as shown (one-time)
    localStorage.setItem('64pad-hint-' + tutorialId, '1');
    this._showToast(tutorialId);
  },

  _showToast: function(tutorialId) {
    this._dismissToast();

    var tut = TutorialRegistry.get(tutorialId);
    if (!tut) return;

    var title = t(tut.titleKey);
    if (title === tut.titleKey) title = tutorialId;

    var toast = document.createElement('div');
    toast.id = 'tut-hint-toast';
    toast.className = 'tut-hint-toast';
    toast.innerHTML =
      '<span class="tut-hint-text">' + title + ' — ' + t('tut.hint_available') + '</span>' +
      '<button class="tut-hint-try" onclick="TutorialHints._tryTutorial(\'' + tutorialId + '\')">' + t('tut.hint_try') + '</button>' +
      '<button class="tut-hint-dismiss" onclick="TutorialHints._dismissToast()">&times;</button>';

    var grid = document.getElementById('pad-grid');
    if (grid) {
      grid.parentNode.insertBefore(toast, grid);
    } else {
      document.body.appendChild(toast);
    }

    this._toastTimer = setTimeout(function() {
      TutorialHints._dismissToast();
    }, 6000);
  },

  _tryTutorial: function(tutorialId) {
    this._dismissToast();
    TutorialEngine.startTutorial(tutorialId);
  },

  _dismissToast: function() {
    clearTimeout(this._toastTimer);
    var toast = document.getElementById('tut-hint-toast');
    if (toast) toast.remove();
  }
};

// Init context hints after DOM is ready
TutorialHints.init();
