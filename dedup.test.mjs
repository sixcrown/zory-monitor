import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, areaClose, isDuplicate, groupOffers, detectDisappearances } from './dedup.mjs';

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

test('detectDisappearances: karencja 3 dni, awaria portalu, żywy dubel', () => {
  const now = Date.parse('2026-07-18T12:00:00Z');
  const seen = {
    'olx-old': { portal: 'OLX', cat: 'dzialki', title: 'stara', url: 'u1', firstSeen: '2026-06-01T00:00:00Z',
      created: '2026-05-30T00:00:00Z', lastSeen: '2026-07-10T00:00:00Z', areaM2: 700,
      priceHistory: [{ at: 'x', price: 210000 }] },
    'olx-swieza': { portal: 'OLX', cat: 'dzialki', title: 'świeża', url: 'u2', firstSeen: '2026-07-01T00:00:00Z',
      lastSeen: '2026-07-17T00:00:00Z', areaM2: 500, priceHistory: [{ at: 'x', price: 100000 }] },
    'oto-awaria': { portal: 'Otodom', cat: 'dzialki', title: 'awaria', url: 'u3', firstSeen: '2026-06-01T00:00:00Z',
      lastSeen: '2026-07-10T00:00:00Z', areaM2: 600, priceHistory: [{ at: 'x', price: 150000 }] },
    'no-lustro': { portal: 'N-O.pl', cat: 'dzialki', title: 'lustro', url: 'u4', firstSeen: '2026-06-01T00:00:00Z',
      lastSeen: '2026-07-10T00:00:00Z', areaM2: 1804, priceHistory: [{ at: 'x', price: 415000 }] },
  };
  const live = [{ cat: 'dzialki', price: 415000, areaM2: 1804 }]; // ta sama nieruchomość wciąż na OLX
  const { archived, gone } = detectDisappearances(seen, live, new Set(['Otodom|dzialki']), now);
  assert.deepEqual(archived.map(a => a.id), ['olx-old']);
  assert.equal(archived[0].lastPrice, 210000);
  assert.equal(archived[0].pricePerM2, 300);
  assert.equal(archived[0].daysOnMarket, 41);           // 2026-05-30 → 2026-07-10
  assert.equal(archived[0].disappearedAt, '2026-07-10T00:00:00Z');
  assert.ok(gone.includes('olx-old') && gone.includes('no-lustro'));
  assert.ok(!gone.includes('olx-swieza') && !gone.includes('oto-awaria'));
});

test('detectDisappearances: bez created liczy dni od firstSeen', () => {
  const now = Date.parse('2026-07-18T12:00:00Z');
  const seen = { 'no-9': { portal: 'N-O.pl', cat: 'domy', title: 't', url: 'u', firstSeen: '2026-07-01T00:00:00Z',
    lastSeen: '2026-07-11T00:00:00Z', areaM2: 120, priceHistory: [{ at: 'x', price: 600000 }] } };
  const { archived } = detectDisappearances(seen, [], new Set(), now);
  assert.equal(archived[0].daysOnMarket, 10);            // 2026-07-01 → 2026-07-11
});
