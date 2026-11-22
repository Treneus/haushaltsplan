'use strict';

/* =========================================================
   helfer.js – baut für jeden Test ein frisches "Gerät"
   store.js und sync.js laufen in einer eigenen, leeren
   JavaScript-Umgebung (vm) mit nachgebautem localStorage.
   So beeinflussen sich die Tests nicht gegenseitig.
   ========================================================= */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Einfacher Ersatz für localStorage (nur im Speicher)
function fakeLocalStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

// Einfacher Ersatz für File (Browser-Datei)
class FakeFile {
  constructor(parts, name) {
    this.name = name;
    this._text = parts.join('');
  }
  async text() { return this._text; }
}

/**
 * Neues Testgerät.
 * opts.storage  – vorhandener localStorage (z. B. für "App neu starten")
 * opts.geraet   – wie ?geraet=2 in der Adresse
 * opts.now      – Startzeit in ms (Uhr des Geräts)
 */
function neuesGeraet(opts = {}) {
  const localStorage = opts.storage || fakeLocalStorage();
  const ctx = {
    localStorage,
    location: { search: opts.geraet ? `?geraet=${opts.geraet}` : '' },
    File: FakeFile,
    URLSearchParams,
    navigator: {},
    console,
    setTimeout,
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  // steuerbare Uhr: Date.now() liefert __now
  ctx.__now = opts.now ?? 1_800_000_000_000;
  vm.runInContext('Date.now = () => globalThis.__now;', ctx);

  vm.runInContext(read('js/store.js'), ctx, { filename: 'store.js' });
  vm.runInContext(read('js/sync.js'), ctx, { filename: 'sync.js' });

  const g = {
    ctx,
    localStorage,
    store: vm.runInContext('store', ctx),
    sync: vm.runInContext('sync', ctx),
    setNow(ms) { ctx.__now = ms; },
    tick(ms = 1000) { ctx.__now += ms; },
    // im Testgerät ausführen (z. B. für Konstanten)
    run: (code) => vm.runInContext(code, ctx),
  };
  g.store.load();
  return g;
}

// Ausgabe anlegen wie in app.js
function ausgabe(g, { sectionId = 'essen', title = 'Pizza', cents = 1250, date = '2026-11-22T18:00:00.000Z', id } = {}) {
  return g.store.put({
    id: id || g.run('makeId()'), type: 'expense', sectionId, title, cents, date, timeKnown: true,
  });
}

// Sync-Datei als Text erzeugen (wie buildFile)
function syncDateiVon(g) {
  return g.sync.buildFile();
}

function datei(text, name = 'haushaltsplan-sync.json') {
  return new FakeFile([text], name);
}

// parseAmount aus app.js holen (app.js selbst braucht die ganze Oberfläche)
function ladeParseAmount() {
  const src = read('js/app.js');
  const m = src.match(/function parseAmount\(text\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error('parseAmount nicht in app.js gefunden');
  return vm.runInNewContext(`(${m[0]})`);
}

// Summe aller sichtbaren Ausgaben
const summe = (g) => g.store.allExpenses().reduce((s, e) => s + e.cents, 0);

module.exports = { neuesGeraet, ausgabe, syncDateiVon, datei, fakeLocalStorage, ladeParseAmount, summe };
