'use strict';

/* Tests für js/store.js – lokaler Datenspeicher
   Starten:  node --test            */

const test = require('node:test');
const assert = require('node:assert/strict');
const { neuesGeraet, ausgabe, fakeLocalStorage } = require('./helfer');

// Objekte aus dem Testgerät in normale Objekte umwandeln (für Vergleiche)
const plain = (x) => JSON.parse(JSON.stringify(x));

test('neues Gerät hat die drei Standard-Kategorien in fester Reihenfolge', () => {
  const g = neuesGeraet();
  assert.deepEqual(plain(g.store.sections().map((s) => s.id)), ['essen', 'freizeit', 'oeffis']);
});

test('Daten bleiben nach einem Neustart der App erhalten', () => {
  const storage = fakeLocalStorage();
  const g1 = neuesGeraet({ storage });
  ausgabe(g1, { title: 'Eis', cents: 300 });

  const g2 = neuesGeraet({ storage }); // gleiche Daten, App neu geladen
  assert.equal(g2.store.data.deviceId, g1.store.data.deviceId);
  assert.deepEqual(plain(g2.store.expensesOf('essen').map((e) => e.title)), ['Eis']);
});

test('kaputte gespeicherte Daten führen zu einem sauberen Neustart statt Absturz', () => {
  const storage = fakeLocalStorage({ 'haushaltsplan.daten.v3': '{kaputt' });
  const g = neuesGeraet({ storage });
  assert.equal(g.store.sections().length, 3);
});

test('?geraet=2 speichert getrennt von den normalen Daten', () => {
  const storage = fakeLocalStorage();
  const normal = neuesGeraet({ storage });
  ausgabe(normal);
  const zwei = neuesGeraet({ storage, geraet: '2' });
  assert.equal(zwei.store.allExpenses().length, 0);
  assert.notEqual(zwei.store.data.deviceId, normal.store.data.deviceId);
});

test('put() setzt Gerät und streng steigende Zeitstempel – auch bei gleicher Uhrzeit', () => {
  const g = neuesGeraet();
  const a = ausgabe(g, { id: 'x1' });
  const b = g.store.put({ ...a, title: 'Pizza groß' }); // gleiche Uhrzeit
  assert.equal(b.device, g.store.data.deviceId);
  assert.ok(b.updatedAt > a.updatedAt);
  assert.equal(b.deleted, false);
});

test('Löschen markiert nur (Tombstone), Rückgängig holt die Ausgabe zurück', () => {
  const g = neuesGeraet();
  const e = ausgabe(g);
  g.store.remove(e.id);
  assert.equal(g.store.get(e.id).deleted, true);
  assert.equal(g.store.expensesOf('essen').length, 0);

  g.store.restore(e.id);
  assert.equal(g.store.expensesOf('essen').length, 1);
});

test('Kategorie löschen löscht auch alle Ausgaben darin', () => {
  const g = neuesGeraet();
  ausgabe(g, { sectionId: 'essen' });
  ausgabe(g, { sectionId: 'essen' });
  ausgabe(g, { sectionId: 'freizeit', cents: 500 });

  g.store.removeSection('essen');
  assert.equal(g.store.isLive('essen'), false);
  const reste = g.store.allExpenses();
  assert.equal(reste.length, 1);
  assert.equal(reste[0].sectionId, 'freizeit');
  // die Ausgaben sind als gelöscht markiert (damit andere Geräte es mitbekommen)
  const geloescht = Object.values(g.store.data.records).filter((r) => r.type === 'expense' && r.deleted);
  assert.equal(geloescht.length, 2);
});

test('Ausgaben einer Kategorie: neueste zuerst', () => {
  const g = neuesGeraet();
  ausgabe(g, { title: 'alt', date: '2026-11-01T12:00:00.000Z' });
  ausgabe(g, { title: 'neu', date: '2026-11-20T12:00:00.000Z' });
  ausgabe(g, { title: 'mitte', date: '2026-11-10T12:00:00.000Z' });
  assert.deepEqual(plain(g.store.expensesOf('essen').map((e) => e.title)), ['neu', 'mitte', 'alt']);
});

test('isValid: gültige Einträge werden akzeptiert', () => {
  const g = neuesGeraet();
  assert.equal(g.store.isValid({ id: 'abc', type: 'section', name: 'Kino', icon: '🎬', createdAt: 5, updatedAt: 1 }), true);
  assert.equal(g.store.isValid({
    id: 'e1', type: 'expense', sectionId: 'essen', title: 'Pizza', cents: 1250,
    date: '2026-11-22T18:00:00.000Z', updatedAt: 1,
  }), true);
});

test('isValid: falsche Einträge werden abgelehnt', () => {
  const g = neuesGeraet();
  const gut = { id: 'e1', type: 'expense', sectionId: 'essen', title: 'Pizza', cents: 1250, date: '2026-11-22T18:00:00.000Z', updatedAt: 1 };
  assert.equal(g.store.isValid(null), false);
  assert.equal(g.store.isValid({ ...gut, id: 'mit leerzeichen' }), false);
  assert.equal(g.store.isValid({ ...gut, id: 'x'.repeat(41) }), false);
  assert.equal(g.store.isValid({ ...gut, type: 'unbekannt' }), false);
  assert.equal(g.store.isValid({ ...gut, cents: 12.5 }), false);
  assert.equal(g.store.isValid({ ...gut, updatedAt: '1' }), false);
  assert.equal(g.store.isValid({ ...gut, title: undefined }), false);
});

test('isValid: unmögliche Werte aus einer Datei werden abgelehnt', () => {
  const g = neuesGeraet();
  const gut = { id: 'e1', type: 'expense', sectionId: 'essen', title: 'Pizza', cents: 1250, date: '2026-11-22T18:00:00.000Z', updatedAt: 1 };
  // 1e999 wird von JSON.parse zu Infinity → dieser Eintrag wäre nie mehr änderbar
  assert.equal(g.store.isValid({ ...gut, updatedAt: JSON.parse('1e999') }), false, 'updatedAt = Infinity');
  assert.equal(g.store.isValid({ ...gut, cents: -500 }), false, 'negativer Betrag');
  assert.equal(g.store.isValid({ ...gut, cents: 0 }), false, 'Betrag 0');
  assert.equal(g.store.isValid({ ...gut, date: 'kein Datum' }), false, 'ungültiges Datum');
  assert.equal(g.store.isValid({ ...gut, deleted: 'false' }), false, 'deleted als Text statt true/false');
});

test('merge: neuere Änderung gewinnt, ältere wird ignoriert', () => {
  const g = neuesGeraet();
  const e = ausgabe(g, { id: 'm1', title: 'lokal' });
  assert.equal(g.store.merge({ ...e, title: 'älter', updatedAt: e.updatedAt - 1, device: 'zzz' }), false);
  assert.equal(g.store.get('m1').title, 'lokal');
  assert.equal(g.store.merge({ ...e, title: 'neuer', updatedAt: e.updatedAt + 1, device: 'aaa' }), true);
  assert.equal(g.store.get('m1').title, 'neuer');
});

test('merge: bei gleicher Zeit entscheidet die Geräte-ID (auf allen Geräten gleich)', () => {
  const g = neuesGeraet();
  g.store.data.records.t1 = { id: 't1', type: 'expense', sectionId: 'essen', title: 'B', cents: 1, date: '2026-11-22', updatedAt: 100, deleted: false, device: 'bbb' };
  assert.equal(g.store.merge({ ...g.store.get('t1'), title: 'A', device: 'aaa' }), false);
  assert.equal(g.store.merge({ ...g.store.get('t1'), title: 'C', device: 'ccc' }), true);
  assert.equal(g.store.get('t1').title, 'C');
});

test('merge: Einträge mit IDs wie "constructor" oder "toString" werden normal übernommen', () => {
  const g = neuesGeraet();
  for (const id of ['constructor', 'toString', 'valueOf']) {
    const rec = { id, type: 'section', name: 'Test ' + id, icon: '📦', createdAt: 9, updatedAt: 5, device: 'x' };
    assert.equal(g.store.isValid(rec), true);
    assert.equal(g.store.merge(rec), true, `ID "${id}" wurde nicht übernommen`);
    assert.equal(g.store.get(id).name, 'Test ' + id);
  }
});

test('alte Version 1 wird beim ersten Start übernommen', () => {
  const storage = fakeLocalStorage({
    'haushaltsplan.ausgaben.v1': JSON.stringify([
      { id: 'a1', category: 'essen', title: 'Döner', cents: 650, date: '2026-11-01T12:00:00.000Z' },
      { id: 'a2', category: 'unterwegs', title: 'Bus', cents: 300, date: '2026-11-02T12:00:00.000Z' },
      { id: 'a3', category: 'irgendwas', title: 'Kram', cents: 100, date: '2026-11-03T12:00:00.000Z' },
    ]),
  });
  const g = neuesGeraet({ storage });
  assert.equal(g.store.get('a1').sectionId, 'essen');
  assert.equal(g.store.get('a2').sectionId, 'oeffis');
  assert.equal(g.store.get('a3').sectionId, 'sonstiges');
  assert.equal(g.store.isLive('sonstiges'), true);
});

test('alte Version 2 wird übernommen, fehlende Standard-Kategorien gelten als gelöscht', () => {
  const storage = fakeLocalStorage({
    'haushaltsplan.daten.v2': JSON.stringify({
      sections: [{ id: 'essen', name: 'Essen', icon: '🍔' }, { id: 'kino', name: 'Kino', icon: '🎬' }],
      expenses: [{ id: 'b1', sectionId: 'kino', title: 'Film', cents: 900, date: '2026-11-05T12:00:00.000Z' }],
      profile: { username: 'Alfred', email: '' },
    }),
  });
  const g = neuesGeraet({ storage });
  assert.deepEqual(plain(g.store.sections().map((s) => s.id)), ['essen', 'kino']);
  assert.equal(g.store.get('freizeit').deleted, true);
  assert.equal(g.store.data.profile.username, 'Alfred');
  assert.equal(g.store.allExpenses().length, 1);
});
