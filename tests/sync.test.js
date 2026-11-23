'use strict';

/* Tests für js/sync.js – Abgleich über die Sync-Datei
   Starten:  node --test            */

const test = require('node:test');
const assert = require('node:assert/strict');
const { neuesGeraet, ausgabe, datei, summe } = require('./helfer');

// Gerät "speichert" über ein nachgebautes "Speichern unter"-Fenster
function mitSpeicherFenster(g) {
  const gespeichert = [];
  g.ctx.showSaveFilePicker = async () => ({
    createWritable: async () => ({
      write: async (f) => gespeichert.push(f),
      close: async () => {},
    }),
  });
  return gespeichert;
}

const recordsJson = (records) => JSON.stringify({ format: 'haushaltsplan-sync', version: 1, devices: {}, records });

test('Sync zwischen zwei Geräten: Einträge und Löschungen kommen an, Summen sind gleich', async () => {
  const a = neuesGeraet();
  const b = neuesGeraet();
  a.store.data.profile.username = 'Oskar';
  b.store.data.profile.username = 'Alfred';

  ausgabe(a, { id: 'pizza', cents: 1250 });
  ausgabe(a, { id: 'kino', sectionId: 'freizeit', cents: 900 });

  // A speichert, B liest
  const r1 = await b.sync.importFiles([a.sync.buildFile()]);
  assert.equal(r1.filesOk, 1);
  assert.equal(r1.added, 2);

  // B löscht die Pizza und legt etwas Eigenes an
  b.tick();
  b.store.remove('pizza');
  ausgabe(b, { id: 'bus', sectionId: 'oeffis', cents: 300 });

  // B speichert, A liest
  await a.sync.importFiles([b.sync.buildFile()]);
  assert.equal(a.store.isLive('pizza'), false);
  assert.equal(a.store.isLive('bus'), true);
  assert.equal(summe(a), 1200);
  assert.equal(summe(a), summe(b));

  // Geräteliste kennt beide Namen
  const namen = a.sync.devices().map((d) => d.name).sort();
  assert.deepEqual([...namen], ['Alfred', 'Oskar']);
});

test('gleiche Datei zweimal einlesen ändert nichts mehr', async () => {
  const a = neuesGeraet();
  const b = neuesGeraet();
  ausgabe(a);
  const f = a.sync.buildFile();
  await b.sync.importFiles([f]);
  const r2 = await b.sync.importFiles([f]);
  assert.equal(r2.added + r2.updated, 0);
});

test('keine JSON-Datei, fremdes Format und neuere Version werden abgelehnt', async () => {
  const g = neuesGeraet();
  const r = await g.sync.importFiles([
    datei('das ist kein json', 'notiz.txt'),
    datei(JSON.stringify({ format: 'was-anderes', records: [] }), 'fremd.json'),
    datei(JSON.stringify({ format: 'haushaltsplan-sync', version: 99, records: [] }), 'neu.json'),
  ]);
  assert.equal(r.filesOk, 0);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /keine gültige Sync-Datei/);
  assert.match(r.errors[1], /keine Haushaltsplan-Datei/);
  assert.match(r.errors[2], /neueren App-Version/);
});

test('ungültige einzelne Einträge werden übersprungen, gültige übernommen', async () => {
  const g = neuesGeraet();
  const r = await g.sync.importFiles([datei(recordsJson([
    { id: 'ok1', type: 'expense', sectionId: 'essen', title: 'Pizza', cents: 1250, date: '2026-11-22T18:00:00.000Z', updatedAt: 5, device: 'x' },
    { id: 'kaputt', type: 'expense', title: 'ohne Betrag', updatedAt: 5 },
    { id: '<script>', type: 'section', name: 'Hack', icon: '💀', createdAt: 1, updatedAt: 5 },
  ]))]);
  assert.equal(r.added, 1);
  assert.equal(g.store.isLive('ok1'), true);
  assert.equal(g.store.get('kaputt'), undefined);
});

test('Geräteliste: ungültige Geräte werden ignoriert, lange Namen gekürzt', async () => {
  const g = neuesGeraet();
  await g.sync.importFiles([datei(JSON.stringify({
    format: 'haushaltsplan-sync', version: 1, records: [],
    devices: {
      gut: { name: 'x'.repeat(100), lastSync: 10 },
      'böse id!': { name: 'Hacker', lastSync: 10 },
      ohnezeit: { name: 'Anton' },
    },
  }))]);
  const list = g.sync.devices();
  assert.equal(list.length, 1);
  assert.equal(list[0].deviceId, 'gut');
  assert.equal(list[0].name.length, 40);
});

test('Statuspunkt: nach dem Speichern 0 offene Änderungen, danach wieder 1', async () => {
  const g = neuesGeraet();
  const gespeichert = mitSpeicherFenster(g);
  ausgabe(g);
  assert.equal(g.sync.unsyncedCount(), 1);

  assert.equal(await g.sync.exportFile(), 'saved');
  assert.equal(gespeichert.length, 1);
  assert.equal(g.sync.unsyncedCount(), 0);
  assert.ok(g.sync.lastSync > 0);

  g.tick();
  ausgabe(g);
  assert.equal(g.sync.unsyncedCount(), 1);
});

test('Speichern abbrechen ändert den Sync-Stand nicht', async () => {
  const g = neuesGeraet();
  g.ctx.showSaveFilePicker = async () => {
    const err = new Error('abgebrochen');
    err.name = 'AbortError';
    throw err;
  };
  ausgabe(g);
  assert.equal(await g.sync.exportFile(), 'cancelled');
  assert.equal(g.sync.lastSync, 0);
  assert.equal(g.sync.unsyncedCount(), 1);
});

test('Statuspunkt: auch wenn die Uhr eines anderen Handys vorgeht, ist nach dem Speichern alles grün', async () => {
  // Oskars Handy geht 10 Minuten vor
  const oskar = neuesGeraet({ now: 1_800_000_600_000 });
  const alfred = neuesGeraet({ now: 1_800_000_000_000 });
  mitSpeicherFenster(alfred);

  ausgabe(oskar, { id: 'eis' });
  await alfred.sync.importFiles([oskar.sync.buildFile()]);

  // Alfred löscht den Eintrag – sein Zeitstempel liegt jetzt "in der Zukunft"
  alfred.tick();
  alfred.store.remove('eis');
  await alfred.sync.exportFile();

  assert.equal(alfred.sync.unsyncedCount(), 0, 'Änderung steckt schon in der Datei, Punkt bleibt aber gelb');
});

test('Statuspunkt: neue Ausgabe direkt nach dem Speichern zählt als offen – auch wenn eine fremde Uhr vorgeht', async () => {
  const oskar = neuesGeraet({ now: 1_800_000_600_000 }); // 10 Minuten vor
  const alfred = neuesGeraet({ now: 1_800_000_000_000 });
  mitSpeicherFenster(alfred);

  ausgabe(oskar, { id: 'eis' });
  await alfred.sync.importFiles([oskar.sync.buildFile()]);
  await alfred.sync.exportFile();

  alfred.tick();
  ausgabe(alfred, { id: 'bus' });
  assert.equal(alfred.sync.unsyncedCount(), 1, 'neue Ausgabe muss als offen gelten');
});
