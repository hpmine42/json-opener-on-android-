'use strict';

/* Smoke-Test: lädt app.js mit einem minimalen DOM-Stub, um Fehler beim
 * Start (fehlende Element-IDs, undefinierte Referenzen) zu finden. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* alle IDs aus dem HTML sammeln */
const ids = new Set();
for (const m of HTML_SRC.matchAll(/id="([^"]+)"/g)) ids.add(m[1]);
for (const m of HTML_SRC.matchAll(/\$\('([^']+)'\)/g)) ids.add(m[1]);

function makeEl(id) {
  return {
    id,
    hidden: false,
    textContent: '',
    value: '',
    innerHTML: '',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    addEventListener() {},
    appendChild() {},
    remove() {},
    click() {},
    focus() {},
    select() {},
    scrollTop: 0,
    clientWidth: 360,
    clientHeight: 600,
    scrollHeight: 0,
    tagName: 'DIV',
    closest() { return null; }
  };
}

const elements = new Map();
function getEl(id) {
  if (!elements.has(id)) elements.set(id, makeEl(id));
  return elements.get(id);
}

/* Elemente, die nur dynamisch erzeugt werden */
const dynamic = ['btn-view-as-text', 'loading'];

const listeners = {};
const documentStub = {
  getElementById: (id) => {
    if (!ids.has(id) && !dynamic.includes(id)) {
      console.error('✗ app.js greift auf unbekannte ID zu: "' + id + '"');
      process.exitCode = 1;
    }
    return getEl(id);
  },
  querySelectorAll: (sel) => {
    if (sel === '.page') return ['page-home', 'page-viewer', 'page-info'].map((p) => ({ classList: { add() {}, remove() {} } }));
    if (sel === '[data-close-sheet]') return ['schema-close'].map(() => ({ addEventListener() {} }));
    if (sel === '.sheet') return [];
    if (sel === '#bottom-bar .bb-btn') return ['bb-raw', 'bb-share', 'bb-save', 'bb-copy', 'bb-open'].map(() => ({ classList: { remove() {} }, textContent: '', dataset: {} }));
    return [];
  },
  createElement: (tag) => makeEl(tag),
  body: { appendChild() {}, removeChild() {} },
  addEventListener: (t, fn) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(fn); },
  hidden: false,
  activeElement: { tagName: 'BODY' }
};

const navigatorStub = {
  serviceWorker: {
    addEventListener() {},
    register: async () => ({ active: null }),
    getRegistration: async () => undefined,
    controller: null
  },
  clipboard: { writeText: async () => {} }
};

const sandbox = {
  document: documentStub,
  navigator: navigatorStub,
  location: { search: '', href: 'http://127.0.0.1:8787/', origin: 'http://127.0.0.1:8787' },
  URLSearchParams,
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  fetch: async () => ({ ok: true, text: async () => '{}' }),
  Blob: function () {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  File: function () {},
  FileReader: function () { this.readAsText = () => {}; },
  JsonCore: require('../core.js'),
  addEventListener: (t, fn) => { (listeners['win:' + t] = listeners['win:' + t] || []).push(fn); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });

  /* DOMContentLoaded feuern → init() läuft */
  for (const fn of listeners['win:DOMContentLoaded'] || []) fn();
  console.log('  ✓ app.js lädt und initialisiert ohne Fehler');
  console.log('  ✓ kein Zugriff auf unbekannte Element-IDs');
  console.log('\nSmoke-Test bestanden.');
} catch (err) {
  console.error('\n✗ app.js wirft Fehler:', err.message);
  process.exit(1);
}
