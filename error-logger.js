// error-logger.js — 全アプリ共通の軽量エラーログ
// Usage: <script src="error-logger.js"></script> を index.html の先頭に追加
// ログは localStorage に保存（最新50件）、コンソールにも出力

(function() {
  'use strict';
  var KEY = '_error_log';
  var MAX = 50;

  function getLog() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch(e) { return []; }
  }

  function addEntry(entry) {
    var log = getLog();
    entry.time = new Date().toISOString();
    entry.url = location.href;
    entry.ua = navigator.userAgent.slice(0, 120);
    log.push(entry);
    if (log.length > MAX) log = log.slice(-MAX);
    try { localStorage.setItem(KEY, JSON.stringify(log)); } catch(e) {}
  }

  window.onerror = function(msg, src, line, col, err) {
    var entry = {
      type: 'error',
      msg: String(msg),
      src: src ? src.split('/').pop() : '',
      line: line,
      col: col,
      stack: err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : ''
    };
    addEntry(entry);
    console.error('[ErrorLog]', entry.msg, entry.src + ':' + entry.line);
  };

  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var entry = {
      type: 'promise',
      msg: reason ? String(reason.message || reason) : 'Unknown',
      stack: reason && reason.stack ? reason.stack.split('\n').slice(0, 3).join(' | ') : ''
    };
    addEntry(entry);
    console.error('[ErrorLog] Unhandled rejection:', entry.msg);
  });

  // Public API: window._errorLog.get() / .clear()
  window._errorLog = {
    get: getLog,
    clear: function() { localStorage.removeItem(KEY); }
  };
})();
