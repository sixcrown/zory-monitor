import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, areaClose, isDuplicate, groupOffers } from './dedup.mjs';

test('median: środek, parzysta liczba, pusta lista', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3); // zaokrąglone (2+3)/2 → 3 (Math.round)
  assert.equal(median([]), null);
});

test('areaClose: tolerancja 3% względem większego metrażu', () => {
  assert.ok(areaClose(1804, 1804));
  assert.ok(areaClose(1000, 1030));        // dokładnie 3% — jeszcze dubel
  assert.ok(!areaClose(885, 921));         // 3,9% — przypadek kontrolny ze specu
  assert.ok(!areaClose(null, 1000));
  assert.ok(!areaClose(0, 0));
});

test('isDuplicate: cena i kategoria muszą być identyczne', () => {
  const a = { cat: 'dzialki', price: 415000, areaM2: 1804 };
  assert.ok(isDuplicate(a, { cat: 'dzialki', price: 415000, areaM2: 1804 }));
  assert.ok(!isDuplicate(a, { cat: 'domy', price: 415000, areaM2: 1804 }));
  assert.ok(!isDuplicate(a, { cat: 'dzialki', price: 415001, areaM2: 1804 }));
  assert.ok(!isDuplicate(a, { cat: 'dzialki', price: null, areaM2: 1804 }));
  assert.ok(!isDuplicate({ cat: 'dzialki', price: 100, areaM2: null },
                         { cat: 'dzialki', price: 100, areaM2: null })); // brak metrażu ⇒ nie scalamy
});

test('groupOffers: scala OLX+N-O.pl, kanoniczna wg priorytetu OLX>Otodom>N-O.pl', () => {
  const olx = { id: 'olx-1', cat: 'dzialki', portal: 'OLX', price: 415000, areaM2: 1804 };
  const no = { id: 'no-1', cat: 'dzialki', portal: 'N-O.pl', price: 415000, areaM2: 1800 };
  const inny = { id: 'oto-2', cat: 'dzialki', portal: 'Otodom', price: 149000, areaM2: 885 };
  const groups = groupOffers([no, inny, olx]); // celowo w złej kolejności
  assert.equal(groups.length, 2);
  const g = groups.find(g => g.length === 2);
  assert.equal(g[0].id, 'olx-1');
  assert.equal(g[1].id, 'no-1');
});

test('groupOffers: ta sama cena, metraż poza tolerancją — osobne grupy', () => {
  const groups = groupOffers([
    { id: 'oto-1', cat: 'dzialki', portal: 'Otodom', price: 149000, areaM2: 885 },
    { id: 'no-2', cat: 'dzialki', portal: 'N-O.pl', price: 149000, areaM2: 921 },
  ]);
  assert.equal(groups.length, 2);
});

test('groupOffers: trójka OLX+Otodom+N-O.pl w jednej grupie', () => {
  const groups = groupOffers([
    { id: 'no-3', cat: 'dzialki', portal: 'N-O.pl', price: 270000, areaM2: 1232 },
    { id: 'olx-3', cat: 'dzialki', portal: 'OLX', price: 270000, areaM2: 1232 },
    { id: 'oto-3', cat: 'dzialki', portal: 'Otodom', price: 270000, areaM2: 1232 },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(o => o.id), ['olx-3', 'oto-3', 'no-3']);
});
