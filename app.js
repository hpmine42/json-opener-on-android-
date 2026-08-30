'use strict';

/* JSON Opener – App-Logik (UI) */
(function () {
  const $ = (id) => document.getElementById(id);
  const { JsonTree, schemaLines, escapeHtml, countNodes } = window.JsonCore;

  const ROW_H = 21;      /* Zeilenhöhe in px (siehe styles.css) */
  const CHAR_W = 8.1;    /* ungefähre Breite eines Monospace-Zeichens bei 13,5px */

  const state = {
    data: null,
    fileName: 'datei.json',
    fileSize: 0,
    pretty: '',
    view: 'tree',            /* 'tree' | 'raw' */
    tree: null,              /* JsonTree-Instanz + View-Daten */
    lastHandledKey: '',
    deferredPrompt: null
  };

  /* -------------------------------------------------------------
   * Utilities
   * ----------------------------------------------------------- */
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function showLoading(show) {
    $('loading').hidden = !show;
  }

  /* -------------------------------------------------------------
   * Seiten-Navigation
   * ----------------------------------------------------------- */
  function setPage(page) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    $('page-' + page).classList.add('active');
    $('btn-back').hidden = page === 'home';
    $('bottom-bar').hidden = page !== 'viewer';
    if (page === 'viewer') updateViewButtons();
  }

  function showHome() {
    setPage('home');
    $('btn-search').hidden = true;
    $('btn-menu').hidden = false;
  }

  function showViewer() {
    setPage('viewer');
    $('btn-search').hidden = false;
    $('btn-menu').hidden = false;
    if (state.tree) {
      state.tree.el = $('tree');
      buildOffsets(state.tree);
      renderTree();
    } else {
      renderRaw();
    }
    window.scrollTo(0, 0);
  }

  function showInfo() {
    setPage('info');
    $('btn-search').hidden = true;
    $('btn-menu').hidden = false;
  }

  /* -------------------------------------------------------------
   * Datei öffnen
   * ----------------------------------------------------------- */
  async function readFileText(file) {
    if (typeof file.text === 'function') return file.text();
    if (typeof file.getText === 'function') return file.getText();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  async function openFile(file) {
    if (!file) return;
    const name = file.name || 'datei.json';
    try {
      showLoading(true);
      const text = await readFileText(file);
      loadData(text, name, file.size);
    } catch (err) {
      showError('Datei konnte nicht gelesen werden', String(err && err.message || err));
    } finally {
      showLoading(false);
    }
  }

  function parsePosition(text, msg) {
    const m = /position (\d+)/.exec(msg);
    if (!m) return '';
    const pos = +m[1];
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    return ` (Zeile ${line}, Spalte ${col})`;
  }

  function loadData(text, name, size) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      showParseError(err, text, name);
      return;
    }
    state.data = data;
    state.fileName = name;
    state.fileSize = size || text.length;
    state.pretty = JSON.stringify(data, null, 2);
    state.view = 'tree';

    /* Einträge zählen (mit Budget für sehr große Dateien) */
    const budget = { n: 200001 };
    const nodes = countNodes(data, budget);
    const entries = budget.n <= 0 ? '>200.000' : String(nodes - 1);
    $('file-name').textContent = name;
    $('file-meta').textContent = `${fmtBytes(state.fileSize)} · ${entries} Einträge`;

    buildTree(data);
    renderRaw();
    showViewer();
    $('error-box').hidden = true;
    if (state.fileSize > 20 * 1024 * 1024) {
      toast('Sehr große Datei – kann etwas dauern');
    }
  }

  function showParseError(err, text, name) {
    state.data = null;
    $('error-msg').textContent =
      'Die Datei enthält kein gültiges JSON: ' + err.message + parsePosition(text, err.message);
    $('error-box').hidden = false;
    /* "Trotzdem als Text anzeigen" */
    let btn = $('btn-view-as-text');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'btn-view-as-text';
      btn.className = 'btn ghost';
      btn.textContent = 'Trotzdem als Text anzeigen';
      btn.addEventListener('click', () => {
        state.data = null;
        state.fileName = name;
        state.fileSize = text.length;
        state.pretty = text;
        state.view = 'raw';
        $('file-name').textContent = name;
        $('file-meta').textContent = fmtBytes(text.length) + ' · Text';
        $('tree').hidden = true;
        $('raw').hidden = false;
        renderRaw();
        showViewer();
      });
      $('error-box').appendChild(btn);
    }
    showHome();
  }

  function showError(title, msg) {
    state.data = null;
    const t = $('error-title');
    t.textContent = '⚠️ ' + title;
    $('error-msg').textContent = msg;
    $('error-box').hidden = false;
    showHome();
  }

  async function loadURL(url) {
    showLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      loadData(text, url.split('/').pop() || 'datei.json', text.length);
    } catch (err) {
      showError('Link konnte nicht geladen werden', String(err.message || err));
    } finally {
      showLoading(false);
    }
  }

  /* -------------------------------------------------------------
   * Baumansicht (virtualisiert)
   * ----------------------------------------------------------- */
  function buildTree(data) {
    const tree = new JsonTree(data);
    tree.el = $('tree');
    tree.offsets = null;
    tree.heights = null;
    tree.cpl = 0;
    tree.totalH = 0;
    tree.matchSet = new Set();
    tree.matchList = [];
    tree.matchIdx = -1;
    tree.curIdx = -1;
    state.tree = tree;
    $('raw').hidden = true;
    $('tree').hidden = false;
    buildOffsets(tree);
  }

  function buildOffsets(tree) {
    const el = tree.el;
    const cpl = Math.max(20, Math.floor((el.clientWidth - 36) / CHAR_W));
    tree.cpl = cpl;
    const n = tree.rows.length;
    const heights = new Array(n);
    const offsets = new Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const lines = rowLines(tree.rows[i], cpl);
      heights[i] = lines;
      offsets[i] = acc;
      acc += lines * ROW_H;
    }
    tree.heights = heights;
    tree.offsets = offsets;
    tree.totalH = acc;
  }

  function rowLines(r, cpl) {
    let chars;
    if (r.type === 'open') {
      chars = 20 + (r.key ? r.key.length + 2 : 0) + 4 + labelLen(r) + 2;
    } else if (r.type === 'close') {
      chars = 21;
    } else {
      chars = 20 + (r.key ? r.key.length + 2 : 0) + valueDispLen(r);
    }
    return Math.max(1, Math.ceil(chars / cpl));
  }

  function labelLen(r) {
    const n = r.count;
    return n === 1 ? (r.kind === 'object' ? 10 : 9) : String(n).length + (r.kind === 'object' ? 10 : 9);
  }

  function valueDispLen(r) {
    if (r.emptyKind) return 3;
    const v = r.value;
    if (v === null) return 4;
    const t = typeof v;
    if (t === 'string') return Math.min(v.length, 400) + 3;
    return String(v).length;
  }

  function renderTree() {
    const tree = state.tree;
    if (!tree) return;
    const el = tree.el;
    const total = tree.rows.length;
    if (!total) { el.innerHTML = ''; return; }
    if (!tree.offsets) buildOffsets(tree);

    const scrollTop = el.scrollTop;
    const viewH = el.clientHeight;
    /* untere Grenze (binäre Suche) */
    let lo = 0, hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tree.offsets[mid] < scrollTop) lo = mid + 1; else hi = mid;
    }
    let start = Math.max(0, lo - 24);
    let end = lo;
    while (end < total && tree.offsets[end] < scrollTop + viewH) end++;
    end = Math.min(total, end + 24);

    let html = '<div style="height:' + tree.offsets[start] + 'px"></div>';
    for (let i = start; i < end; i++) {
      html += rowHTML(tree.rows[i], i, tree);
    }
    const lastEnd = tree.offsets[end - 1] + tree.heights[end - 1] * ROW_H;
    html += '<div style="height:' + Math.max(0, tree.totalH - lastEnd) + 'px"></div>';
    el.innerHTML = html;
  }

  function rowHTML(r, i, tree) {
    const pad = r.depth >= 0 ? r.depth * 18 : 0;
    let cls = 'node-line';
    if (tree.matchSet && tree.matchSet.size && tree.matchSet.has(i)) cls += ' match';
    if (tree.curIdx === i) cls += ' focused';
    const style = 'padding-left:' + (pad + 6) + 'px';
    const keyHTML = r.key ? '<span class="t-key">' + escapeHtml(r.key) + '</span><span class="t-colon">: </span>' : '';

    if (r.type === 'open') {
      const open = tree.open.has(r.id);
      const label = r.count === 1
        ? (r.kind === 'object' ? '1 Schlüssel' : '1 Element')
        : r.count + (r.kind === 'object' ? ' Schlüssel' : ' Elemente');
      return '<div class="' + cls + '" style="' + style + '" data-i="' + i + '" data-toggle="' + r.id + '" role="button" aria-expanded="' + open + '">' +
        '<span class="twisty">' + (open ? '▾' : '▸') + '</span>' +
        keyHTML +
        '<span class="t-brace">' + (r.kind === 'object' ? '{' : '[') + '</span>' +
        '<span class="t-ellipsis"> ' + label + '</span>' +
        '<span class="t-brace">' + (r.kind === 'object' ? '}' : ']') + '</span></div>';
    }
    if (r.type === 'close') {
      return '<div class="' + cls + '" style="' + style + '" data-i="' + i + '">' +
        '<span class="twisty empty"></span>' +
        '<span class="t-brace">' + (r.kind === 'object' ? '}' : ']') + '</span></div>';
    }
    /* value */
    return '<div class="' + cls + '" style="' + style + '" data-i="' + i + '" data-copy="1" title="Tippen zum Kopieren">' +
      '<span class="twisty empty"></span>' +
      keyHTML +
      scalarHTML(r) + '</div>';
  }

  function scalarHTML(r) {
    const v = r.value;
    if (r.emptyKind) {
      return '<span class="t-brace">' + (r.emptyKind === 'object' ? '{ }' : '[ ]') + '</span>';
    }
    if (v === null) return '<span class="t-null">null</span>';
    const t = typeof v;
    if (t === 'boolean') return '<span class="t-bool">' + v + '</span>';
    if (t === 'number') return '<span class="t-num">' + v + '</span>';
    return '<span class="t-str">"' + escapeHtml(v.length > 400 ? v.slice(0, 400) + '\u2026' : v) + '"</span>';
  }

  function toggleNode(id) {
    const tree = state.tree;
    if (!tree) return;
    tree.toggle(id);
    buildOffsets(tree);
    renderTree();
  }

  function scrollToRow(tree, i) {
    tree.curIdx = i;
    tree.el.scrollTop = Math.max(0, tree.offsets[i] - tree.el.clientHeight / 3);
    renderTree();
  }

  /* -------------------------------------------------------------
   * Rohdaten-Ansicht
   * ----------------------------------------------------------- */
  const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  function highlightJSON(text) {
    let out = '';
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(text))) {
      out += escapeHtml(text.slice(last, m.index));
      if (m[1] !== undefined) {
        if (m[2] !== undefined) {
          out += '<span class="t-key">' + escapeHtml(m[1]) + '</span><span class="t-colon">:</span>';
        } else {
          out += '<span class="t-str">' + escapeHtml(m[1]) + '</span>';
        }
      } else if (m[3] !== undefined) {
        const cls = m[3] === 'null' ? 't-null' : 't-bool';
        out += '<span class="' + cls + '">' + m[3] + '</span>';
      } else {
        out += '<span class="t-num">' + m[0] + '</span>';
      }
      last = m.index + m[0].length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function renderRaw() {
    $('raw').innerHTML = state.pretty ? highlightJSON(state.pretty) : '';
  }

  function setView(view) {
    state.view = view;
    $('tree').hidden = view !== 'tree';
    $('raw').hidden = view !== 'raw';
    updateViewButtons();
  }

  function updateViewButtons() {
    const rawBtn = $('bb-raw');
    if (state.view === 'tree') {
      rawBtn.textContent = 'Rohdaten';
      rawBtn.dataset.icon = '{ }';
    } else {
      rawBtn.textContent = 'Baum';
      rawBtn.dataset.icon = '🌲';
    }
    document.querySelectorAll('#bottom-bar .bb-btn').forEach((b) => b.classList.remove('active'));
  }

  /* -------------------------------------------------------------
   * Suche
   * ----------------------------------------------------------- */
  function openSearch() {
    const box = $('search-box');
    box.hidden = false;
    const input = $('search-input');
    input.value = '';
    input.focus();
    runSearch('');
  }

  function closeSearch() {
    $('search-box').hidden = true;
    if (state.tree) {
      state.tree.matchSet = new Set();
      state.tree.matchList = [];
      state.tree.matchIdx = -1;
      renderTree();
    }
  }

  function runSearch(needle) {
    const tree = state.tree;
    if (!tree) return;
    const res = tree.matches(needle);
    tree.matchSet = res.set;
    tree.matchList = res.list;
    tree.matchIdx = res.list.length ? 0 : -1;
    $('search-count').textContent = res.list.length ? '1/' + res.list.length : 'Keine Treffer';
    if (tree.matchIdx >= 0) jumpToMatch(tree, 0);
    else renderTree();
  }

  function jumpToMatch(tree, rel) {
    const n = tree.matchList.length;
    if (!n) return;
    tree.matchIdx = (tree.matchIdx + rel + n) % n;
    let idx = tree.matchList[tree.matchIdx];
    let row = tree.rows[idx];

    /* Aufgeklappten Treffer: aufklappen, damit man den Inhalt sieht */
    if (row.type === 'open' && !tree.open.has(row.id)) {
      const id = row.id;
      toggleNode(id);
      /* Treffer neu berechnen (Zeilenindizes haben sich verschoben) */
      const res = tree.matches($('search-input').value);
      tree.matchSet = res.set;
      tree.matchList = res.list;
      tree.matchIdx = -1;
      /* erste Treffer-Zeile in diesem Unterbaum bevorzugen */
      const openIdx = tree.rows.findIndex((r) => r.type === 'open' && r.id === id);
      if (openIdx >= 0) {
        const ranges = tree.ranges();
        const rng = ranges.get(id);
        const closeIdx = rng ? rng.ci : openIdx;
        let target = openIdx;
        for (const m of tree.matchList) {
          if (m > openIdx && m <= closeIdx) { target = m; break; }
        }
        idx = target;
        tree.matchIdx = tree.matchList.indexOf(idx);
        if (tree.matchIdx < 0) tree.matchIdx = 0;
      }
    }
    scrollToRow(tree, idx);
    $('search-count').textContent = (tree.matchIdx + 1) + '/' + tree.matchList.length;
  }

  /* -------------------------------------------------------------
   * Schema
   * ----------------------------------------------------------- */
  function openSchema() {
    if (!state.data) return;
    const out = [];
    schemaLines(state.data, '$', out, 0);
    $('schema-output').textContent = out.join('\n');
    openSheet('sheet-schema');
  }

  /* -------------------------------------------------------------
   * Aktionen: Teilen / Speichern / Kopieren
   * ----------------------------------------------------------- */
  async function shareFile() {
    if (!state.pretty) { toast('Keine Datei geladen'); return; }
    const file = new File([state.pretty], state.fileName || 'datei.json', { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: state.fileName });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    /* Fallback: als Datei speichern */
    downloadFile(state.fileName || 'datei.json', state.pretty, 'application/json');
    toast('Datei gespeichert');
  }

  function saveFile() {
    if (!state.pretty) { toast('Keine Datei geladen'); return; }
    downloadFile(state.fileName || 'datei.json', state.pretty, 'application/json');
    toast('Datei gespeichert');
  }

  async function copyAll() {
    if (!state.pretty) { toast('Keine Datei geladen'); return; }
    const ok = await copyText(state.pretty);
    toast(ok ? 'Kopiert' : 'Kopieren fehlgeschlagen');
  }

  /* -------------------------------------------------------------
   * Sheets
   * ----------------------------------------------------------- */
  function openSheet(id) {
    const sheet = $(id);
    sheet.hidden = false;
  }

  function closeSheets() {
    document.querySelectorAll('.sheet').forEach((s) => { s.hidden = true; });
  }

  function closeMenu() {
    $('menu-sheet').hidden = true;
  }

  /* -------------------------------------------------------------
   * Installieren (PWA)
   * ----------------------------------------------------------- */
  function updateInstallUI() {
    const show = !!state.deferredPrompt;
    $('btn-install').hidden = !show;
    $('menu-install').hidden = !show;
  }

  async function promptInstall() {
    if (!state.deferredPrompt) return;
    const prompt = state.deferredPrompt;
    state.deferredPrompt = null;
    updateInstallUI();
    try {
      prompt.prompt();
      await prompt.userChoice;
    } catch (e) { /* verworfen */ }
  }

  /* -------------------------------------------------------------
   * Share Target (Datei von Android teilen)
   * ----------------------------------------------------------- */
  function shareKey(entry) {
    const f = entry.files && entry.files[0];
    if (f) return (f.name || '') + ':' + (f.size || 0);
    return 'text:' + String(entry.text || entry.url || '').slice(0, 64);
  }

  async function handleShared(entry) {
    if (!entry) return;
    const key = shareKey(entry);
    /* Duplikat-Schutz (QUERY_SHARE kann mehrfach kommen), aber nur kurz –
     * dieselbe Datei bewusst erneut zu teilen muss weiter funktionieren. */
    if (key === state.lastHandledKey && Date.now() - state.lastHandledAt < 5000) return;
    state.lastHandledKey = key;
    state.lastHandledAt = Date.now();

    const files = entry.files || [];
    if (files.length) {
      await openFile(files[0]);
      return;
    }
    const text = (entry.text || '').trim();
    if (text) {
      if (/^https?:\/\//i.test(text)) {
        await loadURL(text);
      } else {
        try {
          JSON.parse(text);
          loadData(text, entry.title || 'geteilter-text.json', text.length);
        } catch (e) {
          loadDataSafeText(text, entry.title || 'geteilter-text.json');
        }
      }
      return;
    }
    if (entry.url) await loadURL(entry.url);
  }

  function loadDataSafeText(text, name) {
    state.data = null;
    state.fileName = name;
    state.fileSize = text.length;
    state.pretty = text;
    state.view = 'raw';
    $('file-name').textContent = name;
    $('file-meta').textContent = fmtBytes(text.length) + ' · Text';
    $('tree').hidden = true;
    $('raw').hidden = false;
    renderRaw();
    showViewer();
  }

  function queryShare() {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg && reg.active) reg.active.postMessage({ type: 'QUERY_SHARE' });
    }).catch(() => {});
  }

  /* -------------------------------------------------------------
   * UI-Verdrahtung
   * ----------------------------------------------------------- */
  function wireUI() {
    /* Datei öffnen */
    $('btn-pick').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) openFile(f);
      e.target.value = '';
    });
    $('btn-sample').addEventListener('click', async () => {
      try {
        const res = await fetch('./sample.json');
        const text = await res.text();
        loadData(text, 'beispiel.json', text.length);
      } catch (e) {
        showError('Beispiel konnte nicht geladen werden', String(e.message || e));
      }
    });
    $('btn-error-dismiss').addEventListener('click', () => { $('error-box').hidden = true; });

    /* Drag & Drop */
    const dz = $('dropzone');
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
    }));
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });

    /* Navigation */
    $('btn-back').addEventListener('click', showHome);
    $('btn-menu').addEventListener('click', () => openSheet('menu-sheet'));
    $('btn-info-home').addEventListener('click', showHome);

    /* Bottom-Bar */
    $('bb-raw').addEventListener('click', () => setView(state.view === 'tree' ? 'raw' : 'tree'));
    $('bb-share').addEventListener('click', shareFile);
    $('bb-save').addEventListener('click', saveFile);
    $('bb-copy').addEventListener('click', copyAll);
    $('bb-open').addEventListener('click', () => $('file-input').click());

    /* Menü */
    $('menu-open').addEventListener('click', () => { closeMenu(); $('file-input').click(); });
    $('menu-raw').addEventListener('click', () => { closeMenu(); setView(state.view === 'tree' ? 'raw' : 'tree'); });
    $('menu-share').addEventListener('click', () => { closeMenu(); shareFile(); });
    $('menu-save').addEventListener('click', () => { closeMenu(); saveFile(); });
    $('menu-copy').addEventListener('click', () => { closeMenu(); copyAll(); });
    $('menu-info').addEventListener('click', () => { closeMenu(); showInfo(); });
    $('menu-install').addEventListener('click', () => { closeMenu(); promptInstall(); });

    /* Schema */
    $('btn-schema').addEventListener('click', openSchema);

    /* Suche */
    $('btn-search').addEventListener('click', openSearch);
    $('search-close').addEventListener('click', closeSearch);
    $('search-next').addEventListener('click', () => { if (state.tree) jumpToMatch(state.tree, 1); });
    $('search-prev').addEventListener('click', () => { if (state.tree) jumpToMatch(state.tree, -1); });
    let debounce = null;
    $('search-input').addEventListener('input', (e) => {
      clearTimeout(debounce);
      const v = e.target.value;
      debounce = setTimeout(() => runSearch(v), 120);
    });
    $('search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        jumpToMatch(state.tree, e.shiftKey ? -1 : 1);
      }
      if (e.key === 'Escape') { closeSearch(); }
      e.stopPropagation();
    });

    /* Tastatur */
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openSearch();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('search-box').hidden) { closeSearch(); return; }
        if (!$('menu-sheet').hidden || !$('sheet-schema').hidden) { closeSheets(); return; }
      }
      if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) {
        openSearch();
      }
    });

    /* Baum: Klicks + Tastatur */
    const treeEl = $('tree');
    treeEl.addEventListener('click', (e) => {
      const t = e.target.closest('[data-toggle]');
      if (t) { toggleNode(t.dataset.toggle); return; }
      const c = e.target.closest('[data-copy]');
      if (c) {
        const i = +c.dataset.i;
        const tree = state.tree;
        if (tree && tree.rows[i]) {
          const v = tree.rows[i].value;
          const label = v === null ? 'null' : typeof v === 'string' ? v : String(v);
          copyText(String(v)).then((ok) => toast(ok ? 'Kopiert: ' + label.slice(0, 40) : 'Kopieren fehlgeschlagen'));
        }
      }
    });
    treeEl.addEventListener('scroll', () => {
      if (state._scrollRaf) return;
      state._scrollRaf = requestAnimationFrame(() => {
        state._scrollRaf = null;
        renderTree();
      });
    });
    treeEl.addEventListener('keydown', (e) => {
      const tree = state.tree;
      if (!tree || !tree.rows.length) return;
      const key = e.key;
      const n = tree.rows.length;
      if (key === 'ArrowDown') { e.preventDefault(); scrollToRow(tree, Math.min(n - 1, tree.curIdx + 1)); }
      else if (key === 'ArrowUp') { e.preventDefault(); scrollToRow(tree, Math.max(0, tree.curIdx - 1)); }
      else if (key === 'ArrowRight') {
        e.preventDefault();
        const r = tree.rows[tree.curIdx];
        if (r && r.type === 'open' && !tree.open.has(r.id)) toggleNode(r.id);
        else scrollToRow(tree, Math.min(n - 1, tree.curIdx + 1));
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        const r = tree.rows[tree.curIdx];
        if (r && r.type === 'open' && tree.open.has(r.id)) toggleNode(r.id);
        else scrollToRow(tree, Math.max(0, tree.curIdx - 1));
      } else if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        const r = tree.rows[tree.curIdx];
        if (r && r.type === 'open') toggleNode(r.id);
      }
    });

    /* Sheets schließen */
    document.querySelectorAll('[data-close-sheet]').forEach((el) => {
      el.addEventListener('click', closeSheets);
    });

    /* Install */
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      updateInstallUI();
    });
    window.addEventListener('appinstalled', () => {
      state.deferredPrompt = null;
      updateInstallUI();
      toast('App installiert 🎉');
    });
    $('btn-install').addEventListener('click', promptInstall);

    /* Resize */
    window.addEventListener('resize', () => {
      if (state.tree) { buildOffsets(state.tree); renderTree(); }
    });

    /* Bei Sichtbarkeitswechsel nochmal Share-Status abfragen */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) queryShare();
    });
  }

  /* -------------------------------------------------------------
   * Service Worker + Start
   * ----------------------------------------------------------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SHARE_TARGET') handleShared(e.data.data);
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(() => {
        queryShare();
      }).catch((err) => console.warn('SW-Registrierung fehlgeschlagen', err));
    });
  }

  function init() {
    wireUI();
    registerSW();
    showHome();

    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'open') {
      $('btn-pick').click();
    }
    const fileParam = params.get('file');
    if (fileParam) {
      loadURL(fileParam);
    }
    updateInstallUI();
    queryShare();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
