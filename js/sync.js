'use strict';

/* =========================================================
   sync.js – Abgleich mit dem Haushalt (über Supabase)

   Jedes Gerät hat ALLE Daten selbst. Bei jedem Abgleich:
     1. Änderungen der anderen holen, entschlüsseln, zusammenführen
     2. eigene neuere Einträge verschlüsseln und hochladen
     3. "Ich bin da" melden und Geräteliste holen
   Wann: alle 3 Minuten, 2 s nach einer Änderung, beim Öffnen der App
   und wenn das Internet zurückkommt.
   ========================================================= */

const SYNC_EVERY_MS = 3 * 60 * 1000;
const SYNC_AFTER_CHANGE_MS = 2000;
const PULL_OVERLAP_MS = 10000; // etwas Überlappung, damit nichts verloren geht

const sync = {
  status: 'off',   // off | syncing | ok | offline | error
  error: '',
  members: [],
  running: false,
  again: false,
  timer: 0,
  onUpdate: () => {},
  onRemoteChange: () => {},

  get active() {
    return cloud.configured && !!cloud.household;
  },

  setStatus(status, error = '') {
    this.status = status;
    this.error = error;
    this.onUpdate();
  },

  init() {
    store.onChange = () => this.soon();
    setInterval(() => this.run(), SYNC_EVERY_MS);
    window.addEventListener('focus', () => this.run());
    window.addEventListener('online', () => this.run());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.run(); });
    this.setStatus(this.active ? 'ok' : 'off');
    this.run();
  },

  soon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), SYNC_AFTER_CHANGE_MS);
  },

  async run() {
    if (!this.active) return;
    if (this.running) { this.again = true; return; }
    this.running = true;
    this.setStatus('syncing');
    try {
      if (!vault.key) await vault.load(cloud.household.keyB64);
      await cloud.ensureSession();
      if (cloud.needsRejoin) await cloud.rejoin();
      const changed = await this.syncOnce();
      this.setStatus('ok');
      if (changed) this.onRemoteChange();
    } catch (err) {
      console.warn('Sync:', err);
      if (err.code === 'offline') {
        this.setStatus('offline', 'Offline – wird automatisch nachgeholt');
      } else {
        if (err.status === 401 || err.status === 403 || err.code === '42501') cloud.needsRejoin = true;
        this.setStatus('error', err.message || 'Unbekannter Fehler');
      }
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.run(); }
    }
  },

  async syncOnce() {
    const s = store.data.sync;
    let changed = false;

    // 1. Änderungen holen
    const rows = await cloud.pull(Math.max(0, s.pullMs - PULL_OVERLAP_MS));
    for (const row of rows) {
      s.pullMs = Math.max(s.pullMs, Number(row.server_ms) || 0);
      s.remoteVer[row.id] = Math.max(s.remoteVer[row.id] ?? -1, Number(row.updated_at));
      let rec;
      try {
        rec = await vault.decrypt(row.payload, cloud.recordAad(row.id));
      } catch {
        continue; // nicht entschlüsselbar → überspringen
      }
      if (!store.isValid(rec) || rec.id !== row.id) continue;
      if (store.merge(rec)) changed = true;
    }

    // 2. Eigene neuere Einträge hochladen
    const out = [];
    for (const rec of Object.values(store.data.records)) {
      if (rec.updatedAt <= (s.remoteVer[rec.id] ?? -1)) continue;
      out.push({
        household_id: cloud.household.id,
        id: rec.id,
        updated_at: rec.updatedAt,
        payload: await vault.encrypt(rec, cloud.recordAad(rec.id)),
      });
    }
    if (out.length) {
      await cloud.push(out);
      out.forEach((r) => { s.remoteVer[r.id] = Math.max(s.remoteVer[r.id] ?? -1, r.updated_at); });
    }

    // 3. Geräte
    await cloud.heartbeat();
    const list = [];
    for (const m of await cloud.members()) {
      try {
        const p = await vault.decrypt(m.payload, cloud.memberAad(cloud.household.code, m.device_id));
        list.push({
          deviceId: m.device_id,
          name: String(p.name || 'Ohne Namen'),
          lastSeen: Date.parse(String(m.last_seen).replace(/(\.\d{3})\d+/, '$1')) || 0,
        });
      } catch { /* überspringen */ }
    }
    this.members = list.sort((a, b) => b.lastSeen - a.lastSeen);

    s.lastSync = Date.now();
    store.save();
    return changed;
  },
};
