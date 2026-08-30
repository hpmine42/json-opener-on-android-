'use strict';

/* Tests für core.js (ohne Browser) */
const assert = require('assert');
const { JsonTree, schemaLines, escapeHtml, quoteKey, truncate, countNodes, typeName } = require('../core.js');

let passed = 0;
function ok(cond, name) {
  if (!cond) throw new Error('FEHLGESCHLAGEN: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('escapeHtml / quoteKey / truncate');
ok(escapeHtml('<a "b" & c>') === '&lt;a &quot;b&quot; &amp; c&gt;', 'HTML wird escaped');
ok(quoteKey('normal') === '"normal"', 'normaler Schlüssel');
ok(quoteKey('sehr' + 'langer'.repeat(40)).length <= 124, 'langer Schlüssel wird gekürzt');
ok(quoteKey('mit "quotes"') === '"mit \\"quotes\\""', 'Schlüssel mit Quotes');
ok(truncate('x'.repeat(1000)).length <= 404, 'String wird gekürzt');

console.log('JsonTree – Aufbau');
const data = {
  name: 'Wurzel',
  anzahl: 3,
  aktiv: true,
  nichts: null,
  kinder: [
    { id: 1, name: 'Eins' },
    { id: 2, name: 'Zwei' }
  ],
  leer: {},
  leerArr: []
};
const tree = new JsonTree(data);
ok(tree.rows.length === 10, 'Zeilenanzahl korrekt (' + tree.rows.length + ')');
ok(tree.rows[0].type === 'open' && tree.rows[0].key === null, 'Wurzel ist offene Zeile');
ok(tree.rows.filter((r) => r.type === 'open').length === 2, '2 offene Container (root, kinder zugeklappt)');
ok(tree.rows.filter((r) => r.type === 'value').length === 6, '6 Wertzeilen (inkl. leerer Container)');
const emptyRows = tree.rows.filter((r) => r.emptyKind);
ok(emptyRows.length === 2 && emptyRows[0].emptyKind === 'object' && emptyRows[1].emptyKind === 'array', 'leere Container inline');

console.log('JsonTree – Auf-/Zuklappen');
/* kinder ist das erste offene Element mit searchKey "kinder" */
let kinderRow = tree.rows.find((r) => r.type === 'open' && r.searchKey === 'kinder');
ok(!!kinderRow, '"kinder" gefunden');
const id = kinderRow.id;
ok(!tree.open.has(id), '"kinder" initial zugeklappt');
tree.toggle(id);
ok(tree.open.has(id), '"kinder" aufgeklappt');
ok(tree.rows.length === 14, 'Zeilen nach Aufklappen (' + tree.rows.length + ')');
ok(tree.rows.filter((r) => r.type === 'open').length === 4, '4 offene Container (Kinder zugeklappt)');
tree.toggle(id);
ok(!tree.open.has(id), '"kinder" wieder zugeklappt');
ok(tree.rows.length === 10, 'Zeilen nach Zuklappen wiederhergestellt');
ok(tree.toggle('gibt-es-nicht') === false, 'unbekannte ID wird ignoriert');

console.log('JsonTree – Suche');
/* Suche findet Schlüssel im zugeklappten Teilbaum über die Containerzeile */
const t3 = new JsonTree(data);
const kinderId3 = t3.rows.find((r) => r.type === 'open' && r.searchKey === 'kinder').id;
let m = t3.matches('Eins');
ok(m.list.length >= 1, 'Wert in zugeklapptem Baum gefunden');
const rowIdx = m.list[0];
const row = t3.rows[rowIdx];
ok(row.type === 'open' && row.searchKey === 'kinder', 'Treffer liegt auf der Containerzeile');
t3.toggle(kinderId3); /* aufklappen */
m = t3.matches('Eins');
ok(m.list.length >= 1 && t3.rows[m.list[0]].type === 'open' && t3.rows[m.list[0]].searchKey === '0', 'nach Aufklappen liegt Treffer auf der Kind-Containerzeile');
const objId = t3.rows[m.list[0]].id;
t3.toggle(objId); /* das Objekt aufklappen */
m = t3.matches('Eins');
ok(m.list.some((i) => t3.rows[i].type === 'value' && t3.rows[i].value === 'Eins'), 'nach weiterem Aufklappen wird die Wertzeile gefunden');
m = t3.matches('nichtvorhanden');
ok(m.list.length === 0, 'keine Treffer bei Unsinn');
m = t3.matches('null');
ok(m.list.length >= 1 && m.list.some((i) => t3.rows[i].value === null && t3.rows[i].emptyKind === null), 'null-Wert wird gefunden');
m = t3.matches('');
ok(m.list.length === 0, 'leere Suche = keine Treffer');

console.log('JsonTree – Skalare Wurzel');
const t4 = new JsonTree('nur ein string');
ok(t4.rows.length === 1 && t4.rows[0].type === 'value', 'skalare Wurzel erzeugt eine Wertzeile');

console.log('JsonTree – große flache Arrays');
const big = Array.from({ length: 100000 }, (_, i) => ({ i, s: 'wert' + i }));
const t5 = new JsonTree(big);
ok(t5.rows.length === 2, 'großes Array initial zugeklappt (nur open/close)');
t5.toggle(t5.rows[0].id);
ok(t5.rows.length === 200002, 'großes Array expandiert in linearer Zeit (' + t5.rows.length + ')');
m = t5.matches('wert99999');
ok(m.list.length === 1, 'Suche im großen Array');
const deep = new JsonTree({ a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } });
ok(deep.rows.length === 4, 'tiefe Struktur initial nur Wurzelzeile + close');

console.log('Schema');
const out = [];
schemaLines(data, '$', out, 0);
ok(out.length === 11, 'Schema-Zeilen (' + out.length + ')');
ok(out[0] === '$  →  object (7)', 'Schema-Wurzel: ' + out[0]);
ok(out.some((l) => l.indexOf('$') === 0 && l.indexOf('name') === 2), 'Pfad enthält .name');
const out2 = [];
schemaLines({ x: 1 }, '$', out2, 0);
ok(out2.some((l) => l === '$.x  →  number'), 'Skalar-Typ im Schema');

console.log('countNodes / typeName');
ok(countNodes(data, { n: 1e9 }) === 14, 'countNodes korrekt (14)');
ok(countNodes({ a: { b: 1 } }, { n: 1e9 }) === 3, 'verschachtelt');
ok(typeName(null) === 'null' && typeName([]) === 'array' && typeName({}) === 'object' && typeName(1.5) === 'number', 'typeName');

console.log('\nAlle ' + passed + ' Tests bestanden.');
