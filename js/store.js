'use strict';

/* =========================================================
   store.js – lokaler Datenspeicher
   Jedes Gerät hat ALLE Daten selbst gespeichert.

   Jede Kategorie und jede Ausgabe ist ein "Record":
     { id, type, ...Inhalt, updatedAt, deleted, device }
   - updatedAt: Zeitpunkt der letzten Änderung → die neueste Änderung gewinnt
   - deleted:   gelöscht wird nur MARKIERT, damit andere Geräte es mitbekommen
   - device:    welches Gerät die Änderung gemacht hat
   ========================================================= */

// Zum Testen mehrerer "Handys" auf einem PC: index.html?geraet=2
const DEVICE_NS = new URLSearchParams(location.search).get('geraet') || '';
const STORE_KEY = 'haushaltsplan.daten.v3' + (DEVICE_NS ? '.' + DEVICE_NS : '');

// Feste IDs, damit zwei neue Geräte nicht jeweils eigene "Öffis" anlegen
const DEFAULT_SECTIONS = [
  { id: 'essen',    name: 'Essen/Trinken', icon: '🍔', createdAt: 1 },
  { id: 'freizeit', name: 'Freizeit',      icon: '🎮', createdAt: 2 },
  { id: 'oeffis',   name: 'Öffis',         icon: '🚌', createdAt: 3 },
];

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const store = {
  data: null,     // { deviceId, profile, records: { id: record }, sync: {...} }
  onChange: null, // wird von app.js gesetzt: z. B. Anzeige "noch nicht synchronisiert" aktualisieren

  // ----- Laden & Speichern -----
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* neu anfangen */ }
    if (!d || typeof d.records !== 'object' || !d.deviceId) d = this.fresh();
    d.profile = d.profile || { username: '', email: '' };
    d.sync = d.sync || {};
    d.sync.exportedAt = d.sync.exportedAt || 0; // wann zuletzt in die Sync-Datei gespeichert
    d.sync.devices = d.sync.devices || {};      // Geräte aus der Sync-Datei: id → { name, lastSync }
    delete d.sync.remoteVer;                    // Reste älterer Sync-Versionen
    delete d.sync.pullMs;
    delete d.sync.seenFiles;
    this.data = d;
    this.save();
  },

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch { /* Speichern nicht möglich – App läuft trotzdem weiter */ }
  },

  fresh() {
    const d = { deviceId: makeId(), profile: { username: '', email: '' }, records: {}, sync: {} };
    DEFAULT_SECTIONS.forEach((s) => {
      d.records[s.id] = { ...s, type: 'section', updatedAt: 0, deleted: false, device: '' };
    });
    if (!DEVICE_NS) this.importOld(d);
    return d;
  },

  // Daten aus den älteren Testversionen übernehmen
  importOld(d) {
    const now = Date.now();
    const addSection = (s, i) => {
      d.records[s.id] = {
        id: s.id, type: 'section', name: s.name, icon: s.icon, createdAt: i + 1,
        updatedAt: now, deleted: false, device: d.deviceId,
      };
    };
    const addExpense = (e) => {
      d.records[e.id] = {
        id: e.id, type: 'expense', sectionId: e.sectionId, title: e.title, cents: e.cents,
        date: e.date, updatedAt: now, deleted: false, device: d.deviceId,
      };
    };

    try {
      const v2 = JSON.parse(localStorage.getItem('haushaltsplan.daten.v2'));
      if (v2 && Array.isArray(v2.sections)) {
        DEFAULT_SECTIONS.forEach((s) => {
          if (!v2.sections.some((x) => x.id === s.id)) {
            Object.assign(d.records[s.id], { deleted: true, updatedAt: now, device: d.deviceId });
          }
        });
        v2.sections.forEach(addSection);
        (v2.expenses || []).forEach(addExpense);
        if (v2.profile) {
          d.profile.username = v2.profile.username || '';
          d.profile.email = v2.profile.email || '';
        }
        return;
      }
    } catch { /* weiter mit Version 1 */ }

    try {
      const v1 = JSON.parse(localStorage.getItem('haushaltsplan.ausgaben.v1'));
      if (!Array.isArray(v1)) return;
      const map = { essen: 'essen', freizeit: 'freizeit', unterwegs: 'oeffis' };
      v1.forEach((e) => {
        const sectionId = map[e.category] || 'sonstiges';
        if (sectionId === 'sonstiges' && !d.records.sonstiges) {
          addSection({ id: 'sonstiges', name: 'Sonstiges', icon: '📦' }, 3);
        }
        addExpense({ ...e, sectionId });
      });
    } catch { /* nichts zu übernehmen */ }
  },

  // ----- Lesen -----
  get(id) {
    return this.data.records[id];
  },

  isLive(id) {
    const r = this.get(id);
    return !!r && !r.deleted;
  },

  sections() {
    return Object.values(this.data.records)
      .filter((r) => r.type === 'section' && !r.deleted)
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  },

  // neueste Ausgabe zuerst
  expensesOf(sectionId) {
    return Object.values(this.data.records)
      .filter((r) => r.type === 'expense' && !r.deleted && r.sectionId === sectionId)
      .sort((a, b) => b.date.localeCompare(a.date) || (a.id < b.id ? -1 : 1));
  },

  allExpenses() {
    return Object.values(this.data.records)
      .filter((r) => r.type === 'expense' && !r.deleted && this.isLive(r.sectionId));
  },

  // ----- Ändern -----
  stamp(rec) {
    const prev = this.get(rec.id);
    return {
      deleted: false,
      ...rec,
      updatedAt: Math.max(Date.now(), (prev ? prev.updatedAt : 0) + 1),
      device: this.data.deviceId,
    };
  },

  put(rec) {
    const r = this.stamp(rec);
    this.data.records[r.id] = r;
    this.changed();
    return r;
  },

  remove(id) {
    const r = this.get(id);
    if (r) this.put({ ...r, deleted: true });
  },

  restore(id) {
    const r = this.get(id);
    if (r) this.put({ ...r, deleted: false });
  },

  // Kategorie UND alle Ausgaben darin als gelöscht markieren
  removeSection(id) {
    this.expensesOf(id).forEach((e) => {
      this.data.records[e.id] = this.stamp({ ...e, deleted: true });
    });
    const s = this.get(id);
    if (s) this.data.records[id] = this.stamp({ ...s, deleted: true });
    this.changed();
  },

  changed() {
    this.save();
    if (this.onChange) this.onChange();
  },

  // ----- Zusammenführen mit Daten anderer Geräte -----
  isValid(r) {
    if (!r || typeof r !== 'object') return false;
    if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(r.id)) return false;
    if (typeof r.updatedAt !== 'number') return false;
    if (r.type === 'section') {
      return typeof r.name === 'string' && typeof r.icon === 'string' && typeof r.createdAt === 'number';
    }
    if (r.type === 'expense') {
      return typeof r.title === 'string' && typeof r.sectionId === 'string'
        && Number.isInteger(r.cents) && typeof r.date === 'string';
    }
    return false;
  },

  // gibt true zurück, wenn der fremde Stand übernommen wurde
  merge(remote) {
    const local = this.get(remote.id);
    const newer = !local
      || remote.updatedAt > local.updatedAt
      || (remote.updatedAt === local.updatedAt && (remote.device || '') > (local.device || ''));
    if (!newer) return false;
    this.data.records[remote.id] = { ...remote, deleted: !!remote.deleted };
    return true;
  },
};
