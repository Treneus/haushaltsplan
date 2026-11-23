'use strict';

/* Tests für parseAmount() aus js/app.js – Betragseingabe
   Starten:  node --test            */

const test = require('node:test');
const assert = require('node:assert/strict');
const { ladeParseAmount } = require('./helfer');

const parseAmount = ladeParseAmount();

test('übliche Eingaben werden in Cent umgerechnet', () => {
  assert.equal(parseAmount('12'), 1200);
  assert.equal(parseAmount('12,5'), 1250);
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('12.50'), 1250);
  assert.equal(parseAmount(' 3,99 € '), 399);
  assert.equal(parseAmount('0,01'), 1);
});

test('keine Rundungsfehler bei krummen Beträgen', () => {
  assert.equal(parseAmount('0,29'), 29);
  assert.equal(parseAmount('1,15'), 115);
  assert.equal(parseAmount('4,35'), 435);
});

test('ungültige Eingaben ergeben null', () => {
  for (const text of ['', 'abc', '0', '0,00', '-5', '1,234', '12,5,0', '1e3']) {
    assert.equal(parseAmount(text), null, `"${text}" sollte ungültig sein`);
  }
});

test('zu große Beträge werden abgelehnt', () => {
  assert.equal(parseAmount('9999999,99'), 999999999);
  assert.equal(parseAmount('10000000'), null);
});
