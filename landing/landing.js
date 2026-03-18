// ========================================
// LANDING PAGE — Persona tabs, analytics, meta updates
// ========================================

(function() {
  'use strict';

  // --- Persona Tabs ---
  function initPersonaTabs() {
    // Desktop tabs
    var tabs = document.querySelectorAll('.persona-tab');
    var panels = document.querySelectorAll('.persona-panel');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = tab.getAttribute('data-persona');
        tabs.forEach(function(t) { t.classList.remove('active'); });
        panels.forEach(function(p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var panel = document.getElementById('persona-' + target);
        if (panel) panel.classList.add('active');
        trackEvent('persona_tab_click', { persona: target });
      });
    });

    // Mobile accordion
    var triggers = document.querySelectorAll('.accordion-trigger');
    triggers.forEach(function(trigger) {
      trigger.addEventListener('click', function() {
        var target = trigger.getAttribute('data-persona');
        var content = document.getElementById('accordion-' + target);
        var isOpen = trigger.classList.contains('active');

        // Close all
        triggers.forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.accordion-content').forEach(function(c) {
          c.classList.remove('active');
        });

        // Toggle current
        if (!isOpen) {
          trigger.classList.add('active');
          if (content) content.classList.add('active');
          trackEvent('persona_tab_click', { persona: target });
        }
      });
    });
  }

  // --- GA4 Analytics ---
  function trackEvent(name, params) {
    if (typeof gtag === 'function') {
      gtag('event', name, params || {});
    }
  }

  // Track CTA clicks
  function initCTATracking() {
    document.querySelectorAll('[data-cta]').forEach(function(el) {
      el.addEventListener('click', function() {
        trackEvent('cta_click', { position: el.getAttribute('data-cta') });
      });
    });
  }

  // --- Meta tag updates on language switch ---
  var metaMap = {
    title: 'landing.meta_title',
    description: 'landing.meta_description'
  };

  function updateMeta() {
    var title = t('landing.meta_title');
    if (title !== 'landing.meta_title') {
      document.title = title;
    }
    var desc = t('landing.meta_description');
    if (desc !== 'landing.meta_description') {
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', desc);
    }
    // Update html lang
    document.documentElement.lang = I18N.current;
  }

  // --- Override I18N.setLang to also update meta ---
  var _origSetLang = I18N.setLang;
  I18N.setLang = function(code) {
    _origSetLang(code);
    updateMeta();
  };

  // --- Hero SVG generation ---
  function generateHeroGrid() {
    var container = document.getElementById('hero-pad-grid');
    if (!container) return;

    var size = 320;
    var cols = 8, rows = 8;
    var gap = 4;
    var padSize = (size - gap * (cols + 1)) / cols;
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">';

    // Scale notes pattern (C major on chromatic fourths layout)
    var scaleNotes = [0, 2, 4, 5, 7, 9, 11]; // C major
    var rootNote = 0;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = gap + c * (padSize + gap);
        var y = gap + (rows - 1 - r) * (padSize + gap);
        // Chromatic fourths layout: each row +5 semitones, each col +1
        var note = ((r * 5) + c) % 12;
        var color;
        var opacity = 0.9;
        if (note === rootNote) {
          color = '#E69F00'; // root (pad-root)
        } else if (scaleNotes.indexOf(note) !== -1) {
          color = '#56B4E9'; // scale (pad-scale)
          opacity = 0.7;
        } else {
          color = '#2a2a4a'; // off (pad-off)
          opacity = 0.5;
        }
        svg += '<rect x="' + x + '" y="' + y + '" width="' + padSize +
               '" height="' + padSize + '" rx="4" fill="' + color +
               '" opacity="' + opacity + '"/>';
      }
    }
    svg += '</svg>';
    container.innerHTML = svg;
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function() {
    I18N.init();
    updateMeta();
    initPersonaTabs();
    initCTATracking();
    generateHeroGrid();

    // Track landing view
    trackEvent('landing_view', { language: I18N.current });
  });
})();
