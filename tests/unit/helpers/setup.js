// Minimal browser globals mock for Node.js environment
// data.js references: document.readyState, document.addEventListener, location.pathname
// theory.js references: document.getElementById (in DOM-touching functions we don't test)

const mockElement = () => ({
  className: '',
  textContent: '',
  innerHTML: '',
  classList: { toggle: () => {}, add: () => {}, remove: () => {} },
  style: {},
  appendChild: () => {},
  addEventListener: () => {},
  setAttribute: () => {},
  onclick: null,
  disabled: false,
});

globalThis.document = {
  readyState: 'complete',
  addEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElementNS: () => mockElement(),
  createElement: () => mockElement(),
};

globalThis.location = { pathname: '/apps/64-pad/' };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

// Load pad-core modules first (SSOT: theory calculations, data constants, render)
const padCoreData = require('../../../pad-core/data.js');
Object.assign(globalThis, padCoreData);

const padCoreTheory = require('../../../pad-core/theory.js');
Object.assign(globalThis, padCoreTheory);

const padCoreRender = require('../../../pad-core/render.js');
Object.assign(globalThis, padCoreRender);

// Load app data.js → inject all exports as globals (theory.js/builder.js depend on them)
const data = require('../../../data.js');
Object.assign(globalThis, data);

// Load app theory.js → inject all exports as globals (builder.js depends on some)
const theory = require('../../../theory.js');
Object.assign(globalThis, theory);

// Load builder.js
const builder = require('../../../builder.js');
Object.assign(globalThis, builder);
