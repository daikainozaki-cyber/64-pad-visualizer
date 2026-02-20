// ========================================
// I18N ENGINE
// ========================================
const I18N = {
  langs: {},
  current: 'en',
  fallback: 'en',
};

// Register a language (called by each lang-xx.js)
I18N.addLang = function(code, data) {
  I18N.langs[code] = data;
};

// Get nested value by dot-separated key
function _resolve(obj, key) {
  return key.split('.').reduce(function(o, k) { return o && o[k]; }, obj);
}

// Translate: t('plain.status_capturing', {slot: 3})
function t(key, vars) {
  var str = _resolve(I18N.langs[I18N.current], key)
         || _resolve(I18N.langs[I18N.fallback], key)
         || key;
  if (vars) {
    Object.keys(vars).forEach(function(k) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    });
  }
  return str;
}

// Detect language from browser or localStorage
I18N.detectLang = function() {
  var saved = localStorage.getItem('pad64-lang');
  if (saved && I18N.langs[saved]) return saved;
  var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  // Exact match first (e.g. "ja", "zh")
  var code = nav.split('-')[0];
  if (I18N.langs[code]) return code;
  // Fallback
  return I18N.fallback;
};

// Update all DOM elements with data-i18n attribute
I18N.updateDOM = function() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var val = t(key);
    if (val !== key) {
      // Support data-i18n-attr for attributes (e.g. title, placeholder)
      var attr = el.getAttribute('data-i18n-attr');
      if (attr) {
        el.setAttribute(attr, val);
      } else {
        // Use innerHTML when value contains HTML tags, textContent otherwise
        if (/<[a-z][\s\S]*>/i.test(val)) {
          el.innerHTML = val;
        } else {
          el.textContent = val;
        }
      }
    }
  });
  // Update html lang attribute
  document.documentElement.lang = I18N.current === 'ja' ? 'ja' :
    I18N.current === 'zh' ? 'zh' :
    I18N.current === 'ko' ? 'ko' : I18N.current;
};

// Set language and update everything
I18N.setLang = function(code) {
  if (!I18N.langs[code]) return;
  I18N.current = code;
  localStorage.setItem('pad64-lang', code);
  I18N.updateDOM();
  // Update dynamic UI elements
  if (typeof updatePlainUI === 'function') updatePlainUI();
  if (typeof updateMemorySlotUI === 'function') updateMemorySlotUI();
  if (typeof renderInfoText === 'function' && typeof computeRenderState === 'function') {
    renderInfoText(computeRenderState());
  }
  if (typeof renderLegend === 'function' && typeof computeRenderState === 'function') {
    renderLegend(computeRenderState());
  }
  if (typeof toggleGuitarLabelMode === 'function') {
    var btn = document.getElementById('guitar-label-btn');
    if (btn) btn.textContent = guitarLabelMode === 'name' ? t('label.note_name') : t('label.degree');
  }
  // Update lang selector
  var sel = document.getElementById('lang-select');
  if (sel) sel.value = code;
};

// Initialize i18n (called from main.js)
I18N.init = function() {
  I18N.current = I18N.detectLang();
  I18N.updateDOM();
  var sel = document.getElementById('lang-select');
  if (sel) sel.value = I18N.current;
};
