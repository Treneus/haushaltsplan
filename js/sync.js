'use strict';

/* =========================================================
   sync.js – Abgleich über eine gemeinsame Datei in iCloud Drive

   Jedes Gerät hat ALLE Daten selbst gespeichert. Die Familie teilt
   sich einen iCloud-Ordner, darin liegt die Datei
   "haushaltsplan-sync.json" mit allen Einträgen.

   Synchronisieren = 2 Schritte (Safari darf Dateien nicht selbst
   lesen/schreiben, deshalb tippt man kurz mit):
     1. Datei öffnen → fremde Einträge übernehmen (neueste gewinnt)
     2. Zusammengeführte Datei zurück in den Ordner speichern

   Geht dabei mal etwas verloren (z. B. zwei Personen speichern
   gleichzeitig), ist das nicht schlimm: Jedes Gerät hat seine
   Einträge noch und bringt sie beim nächsten Abgleich wieder mit.
   ========================================================= */

const SYNC_FILE_NAME = 'haushaltsplan-sync.json';
const SYNC_FORMAT = 'haushaltsplan-sync';
const SYNC_VERSION = 1;

const sync = {
  onUpdate: () => {},        // Status hat sich geändert
  onRemoteChange: () => {},  // fremde Einträge wurden übernommen

  get lastSync() {
    return store.data.sync.lastSync || 0;
  },

  // Wie viele eigene Änderungen sind noch nicht in der Sync-Datei?
  unsyncedCount() {
    const since = store.data.sync.exportedAt || 0;
    return Object.values(store.data.records)
      .filter((r) => r.device === store.data.deviceId && r.updatedAt > since).length;
  },

  // Alle Geräte, die schon einmal synchronisiert haben (neueste zuerst)
  devices() {
    return Object.entries(store.data.sync.devices || {})
      .map(([deviceId, d]) => ({ deviceId, name: d.name, lastSync: d.lastSync }))
      .sort((a, b) => b.lastSync - a.lastSync);
  },

  // ----- Schritt 1: Datei(en) einlesen und zusammenführen -----
  async importFiles(files) {
    const result = { filesOk: 0, added: 0, updated: 0, errors: [] };

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        result.errors.push(`„${file.name}“ ist keine gültige Sync-Datei`);
        continue;
      }
      if (!data || data.format !== SYNC_FORMAT || !Array.isArray(data.records)) {
        result.errors.push(`„${file.name}“ ist keine Haushaltsplan-Datei`);
        continue;
      }
      if (data.version > SYNC_VERSION) {
        result.errors.push(`„${file.name}“ stammt von einer neueren App-Version – bitte App neu laden`);
        continue;
      }

      result.filesOk++;
      for (const rec of data.records) {
        if (!store.isValid(rec)) continue;
        const existed = !!store.get(rec.id);
        if (store.merge(rec)) {
          if (existed) result.updated++;
          else result.added++;
        }
      }
      this.mergeDevices(data.devices);
    }

    store.save();
    if (result.added || result.updated) this.onRemoteChange();
    this.onUpdate();
    return result;
  },

  mergeDevices(devices) {
    if (!devices || typeof devices !== 'object') return;
    const own = store.data.sync.devices;
    for (const [id, d] of Object.entries(devices)) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !d || typeof d.name !== 'string' || typeof d.lastSync !== 'number') continue;
      if (!hasOwn(own, id) || d.lastSync > own[id].lastSync) own[id] = { name: d.name.slice(0, 40), lastSync: d.lastSync };
    }
  },

  // ----- Schritt 2: zusammengeführte Datei speichern -----
  buildFile() {
    const now = Date.now();
    const s = store.data.sync;
    s.devices[store.data.deviceId] = { name: store.data.profile.username || 'Ohne Namen', lastSync: now };
    const data = {
      format: SYNC_FORMAT,
      version: SYNC_VERSION,
      savedAt: now,
      savedBy: store.data.deviceId,
      devices: s.devices,
      records: Object.values(store.data.records),
    };
    return new File([JSON.stringify(data)], SYNC_FILE_NAME, { type: 'application/json' });
  },

  // Welche Speicher-Art gibt es auf diesem Gerät?
  //  'share' – iPhone/iPad: Teilen-Menü → "In Dateien sichern"
  //  'picker' – Chrome am Computer: "Speichern unter"-Fenster
  //  'download' – sonst: normaler Download
  saveMethod() {
    try {
      const probe = new File(['{}'], SYNC_FILE_NAME, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [probe] })) return 'share';
    } catch { /* weiter */ }
    if (window.showSaveFilePicker) return 'picker';
    return 'download';
  },

  // Rückgabe: 'saved' | 'cancelled'
  async exportFile() {
    // Neuester Zeitstempel in der Datei. Kann in der Zukunft liegen, wenn die Uhr
    // eines anderen Handys vorgeht – sonst bliebe der Statuspunkt danach gelb.
    const newest = Object.values(store.data.records)
      .reduce((max, r) => Math.max(max, r.updatedAt || 0), 0);
    const file = this.buildFile();
    const method = this.saveMethod();
    try {
      if (method === 'share') {
        await navigator.share({ files: [file], title: 'Haushaltsplan-Sync' });
      } else if (method === 'picker') {
        const handle = await window.showSaveFilePicker({
          suggestedName: SYNC_FILE_NAME,
          types: [{ description: 'Haushaltsplan-Sync', accept: { 'application/json': ['.json'] } }],
        });
        const writer = await handle.createWritable();
        await writer.write(file);
        await writer.close();
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = SYNC_FILE_NAME;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      throw err;
    }
    store.data.sync.lastSync = Date.now();
    store.data.sync.exportedAt = Math.max(store.data.sync.lastSync, newest);
    store.save();
    this.onUpdate();
    return 'saved';
  },
};
