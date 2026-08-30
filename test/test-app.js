'use strict';

/* Funktionale Tests für app.js mit einem DOM-Stub:
 * Beispiel laden → Viewer → Baum auf-/zuklappen → Suche → Rohdaten → Schema. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SAMPLE = fs.readFileSync(path.join(__dirname, '..', 'sample.json'), 'utf8');

const ids = new Set();
for (const m of HTML_SRC.matchAll(/id="([^"]+)"/g)) ids.add(m[1]);

let passed = 0;
function ok(cond, name, extra) {
  if (!cond) throw new Error('FEHLGESCHLAGEN: ' + name + (extra ? ' – ' + extra : ''));
  passed++;
  console.log('  ✓ ' + name);
}

/* ---------- Harness ---------- */
const pages = ['page-home', 'page-viewer', 'page-info'].map((id) => {
  const p = { id, active: false, classList: null };
  p.classList = {
    add: () => { p.active = true; },
    remove: () => { p.active = false; },
    toggle: () => { p.active = !p.active; }
  };
  return p;
});
function pageOf(id) { return pages.find((p) => p.id === id); }

const elements = new Map();
function makeEl(id) {
  const el = {
    id,
    hidden: false,
    textContent: '',
    value: '',
    innerHTML: '',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    appendChild() {},
    remove() {},
    click() {},
    focus() {},
    select() {},
    scrollTop: 0,
    clientWidth: 360,
    clientHeight: 600,
    tagName: 'DIV',
    _listeners: {},
    addEventListener(t, fn) { (el._listeners[t] = el._listeners[t] || []).push(fn); },
    closest() { return null; }
  };
  return el;
}
function getEl(id) {
  if (id.indexOf('page-') === 0) return pageOf(id);
  if (!elements.has(id)) elements.set(id, makeEl(id));
  return elements.get(id);
}
function fire(el, type, event) {
  for (const fn of el._listeners[type] || []) fn(event || {});
}
function fireDoc(type, event) {
  for (const fn of docListeners[type] || []) fn(event || {});
}

const docListeners = {};
const documentStub = {
  getElementById: (id) => {
    if (!ids.has(id)) {
      console.error('✗ unbekannte ID: ' + id);
      process.exitCode = 1;
    }
    return getEl(id);
  },
  querySelectorAll: (sel) => {
    if (sel === '.page') return pages;
    if (sel === '[data-close-sheet]') return ['sheet-schema-close'].map((id) => getEl(id));
    if (sel === '.sheet') return ['menu-sheet', 'sheet-schema'].map((id) => getEl(id));
    if (sel === '#bottom-bar .bb-btn') return ['bb-raw', 'bb-share', 'bb-save', 'bb-copy', 'bb-open'].map((id) => getEl(id));
    return [];
  },
  createElement: (tag) => makeEl('dyn-' + tag),
  body: { appendChild() {}, removeChild() {} },
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  hidden: false,
  activeElement: { tagName: 'BODY' }
};

const sandbox = {
  document: documentStub,
  navigator: {
    serviceWorker: {
      addEventListener() {},
      register: async () => ({ active: null }),
      getRegistration: async () => undefined,
      controller: null
    },
    clipboard: { writeText: async () => {} }
  },
  location: { search: '', href: 'http://127.0.0.1:8787/', origin: 'http://127.0.0.1:8787' },
  URLSearchParams,
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  fetch: async () => ({ ok: true, text: async () => SAMPLE }),
  Blob: function () {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  File: function () {},
  FileReader: function () { this.readAsText = () => {}; },
  JsonCore: require('../core.js'),
  scrollTo() {},
  addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); }
};
const winListeners = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

(async () => {
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });
  for (const fn of winListeners.DOMContentLoaded || []) fn();
  console.log('App initialisiert');

  console.log('Beispiel laden');
  fire(getEl('btn-sample'), 'click', {});
  await new Promise((r) => setTimeout(r, 100));
  ok(pageOf('page-viewer').active, 'Viewer aktiv');
  ok(getEl('file-name').textContent === 'beispiel.json', 'Dateiname = beispiel.json', getEl('file-name').textContent);
  ok(getEl('file-meta').textContent.indexOf('Einträge') !== -1, 'Meta mit Eintragszahl', getEl('file-meta').textContent);
  const treeHtml = getEl('tree').innerHTML;
  ok(treeHtml.indexOf('&quot;app&quot;') !== -1 || treeHtml.indexOf('"app"') !== -1, 'Schlüssel "app" gerendert');
  ok(treeHtml.indexOf('JSON Opener') !== -1, 'Wert "JSON Opener" gerendert');
  ok(getEl('tree').hidden === false && getEl('raw').hidden === true, 'Baum sichtbar, Rohdaten verborgen');

  console.log('Baum auf-/zuklappen');
  const featuresId = /data-toggle="(c\d+)"[^>]*>[^<]*<span class="twisty">▸[\s\S]*?"features"/.exec(treeHtml);
  /* einfacher: ID der ersten zugeklappten Containerzeile per Suche im HTML */
  const toggleIds = [...treeHtml.matchAll(/data-toggle="(c\d+)"/g)].map((m) => m[1]);
  ok(toggleIds.length >= 3, 'mehrere Containerzeilen vorhanden (' + toggleIds.length + ')');
  const before = getEl('tree').innerHTML.length;
  const fakeToggleTarget = { closest: (sel) => (sel === '[data-toggle]' ? { dataset: { toggle: toggleIds[1] } } : null) };
  fire(getEl('tree'), 'click', { target: fakeToggleTarget });
  ok(getEl('tree').innerHTML.length > before, 'Aufklappen vergrößert den Baum (' + before + ' → ' + getEl('tree').innerHTML.length + ')');
  const expanded = getEl('tree').innerHTML;
  ok(expanded.indexOf('▾') !== -1, 'aufgeklappte Zeile zeigt ▾');

  console.log('Suche');
  fire(getEl('btn-search'), 'click', {});
  const inputEl = getEl('search-input');
  inputEl.value = 'Anna'; /* wie die echte Eingabe im Browser */
  fire(inputEl, 'input', { target: { value: 'Anna' } });
  await new Promise((r) => setTimeout(r, 300));
  const countText = getEl('search-count').textContent;
  ok(/^\d+\/\d+$/.test(countText), 'Trefferzahl angezeigt (' + countText + ')');
  ok(getEl('tree').innerHTML.indexOf('match') !== -1, 'Treffer-Zeile markiert');
  fire(getEl('search-close'), 'click', {});
  ok(getEl('search-box').hidden, 'Suche geschlossen');

  console.log('Rohdaten');
  fire(getEl('bb-raw'), 'click', {});
  ok(getEl('tree').hidden === true && getEl('raw').hidden === false, 'Rohdaten sichtbar');
  ok(getEl('raw').innerHTML.indexOf('t-key') !== -1, 'Rohdaten hervorgehoben');
  ok(getEl('bb-raw').textContent === 'Baum', 'Button zeigt "Baum"');
  fire(getEl('bb-raw'), 'click', {});
  ok(getEl('tree').hidden === false, 'zurück zur Baumansicht');

  console.log('Schema');
  fire(getEl('btn-schema'), 'click', {});
  ok(getEl('sheet-schema').hidden === false, 'Schema-Sheet offen');
  ok(getEl('schema-output').textContent.indexOf('$') === 0, 'Schema startet bei $');
  ok(getEl('schema-output').textContent.indexOf('→') !== -1, 'Schema mit Typen');
  fireDoc('keydown', { key: 'Escape' });
  ok(getEl('sheet-schema').hidden === true, 'Escape schließt Schema');

  console.log('Menü');
  fire(getEl('btn-menu'), 'click', {});
  ok(getEl('menu-sheet').hidden === false, 'Menü offen');
  fire(getEl('menu-info'), 'click', {});
  ok(pageOf('page-info').active, 'Info-Seite aktiv');
  ok(getEl('menu-sheet').hidden === true, 'Menü nach Auswahl geschlossen');
  fire(getEl('btn-back'), 'click', {});
  ok(pageOf('page-home').active, 'Zurück zur Startseite');

  console.log('\nAlle ' + passed + ' Funktionstests bestanden.');
})().catch((err) => { console.error(err); process.exit(1); });
