import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, areaClose, priceClose, detectDistricts, isDuplicate, groupOffers, detectDisappearances } from './dedup.mjs';

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

test('priceClose: tolerancja 5% — agencje różnicują cenę między portalami', () => {
  assert.ok(priceClose(415000, 415000));
  assert.ok(priceClose(1395000, 1399000));   // 0,3% — realny dubel z danych
  assert.ok(priceClose(399000, 420000));     // dokładnie 5%
  assert.ok(!priceClose(750000, 850000));    // 12% — inna nieruchomość
  assert.ok(!priceClose(null, 415000));
});

test('detectDistricts: rozpoznaje dzielnice z odmianą', () => {
  assert.deepEqual([...detectDistricts('działka budowlana żory rój')], ['rój']);
  assert.deepEqual([...detectDistricts('dom w roju, blisko lasu')], ['rój']);
  assert.deepEqual([...detectDistricts('żory-rogoźna ul. wodzisławska')], ['rogoźna']);
  assert.deepEqual([...detectDistricts('mieszkanie kleszczówka')], ['kleszczówka']);
  assert.deepEqual([...detectDistricts('działka kleszczów żory')], ['kleszczów']);
  assert.deepEqual([...detectDistricts('dom do zamieszkania w centrum')], []);
});

test('isDuplicate: cena w tolerancji, kategoria identyczna, różne portale', () => {
  const a = { cat: 'dzialki', portal: 'OLX', price: 415000, areaM2: 1804, title: '', place: '' };
  assert.ok(isDuplicate(a, { cat: 'dzialki', portal: 'N-O.pl', price: 415000, areaM2: 1804, title: '', place: '' }));
  assert.ok(isDuplicate(a, { cat: 'dzialki', portal: 'N-O.pl', price: 419000, areaM2: 1804, title: '', place: '' })); // dryf 1%
  assert.ok(!isDuplicate(a, { cat: 'domy', portal: 'N-O.pl', price: 415000, areaM2: 1804, title: '', place: '' }));
  assert.ok(!isDuplicate(a, { cat: 'dzialki', portal: 'N-O.pl', price: null, areaM2: 1804, title: '', place: '' }));
  assert.ok(!isDuplicate({ cat: 'dzialki', portal: 'OLX', price: 100000, areaM2: null, title: '', place: '' },
                         { cat: 'dzialki', portal: 'N-O.pl', price: 100000, areaM2: null, title: '', place: '' })); // brak metrażu ⇒ nie scalamy
});

test('isDuplicate: ten sam portal scala tylko przy niemal identycznych liczbach (≤1%)', () => {
  // dwie agencje wystawiają ten sam dom na jednym portalu z tymi samymi liczbami
  const a = { cat: 'dzialki', portal: 'N-O.pl', price: 279000, areaM2: 989, title: 'oferta A', place: '' };
  const b = { cat: 'dzialki', portal: 'N-O.pl', price: 279000, areaM2: 989, title: 'oferta B', place: '' };
  assert.ok(isDuplicate(a, b));
  // ale 2,4% różnicy ceny w obrębie portalu = raczej inna nieruchomość (osiedle)
  const c = { cat: 'domy', portal: 'N-O.pl', price: 780000, areaM2: 127, title: '', place: '' };
  const d = { cat: 'domy', portal: 'N-O.pl', price: 799000, areaM2: 128, title: '', place: '' };
  assert.ok(!isDuplicate(c, d));
});

test('isDuplicate: konflikt dzielnic blokuje scalenie', () => {
  const roj = { cat: 'dzialki', portal: 'Otodom', price: 279000, areaM2: 989, title: 'Atrakcyjna działka budowlana Żory Rój', place: 'Żory' };
  const kleszczow = { cat: 'dzialki', portal: 'OLX', price: 285000, areaM2: 1000, title: 'Działka Kleszczów Żory 1000 m²', place: 'Żory' };
  assert.ok(!isDuplicate(roj, kleszczow));       // cena 2,1% i metraż 1,1% pasują, ale dzielnice różne
  const bezDzielnicy = { cat: 'dzialki', portal: 'OLX', price: 285000, areaM2: 1000, title: 'Działka na sprzedaż', place: 'Żory' };
  assert.ok(isDuplicate(roj, bezDzielnicy));     // druga strona nie deklaruje dzielnicy — brak konfliktu
});

test('isDuplicate: dzielnica nadana przez portal (place) nie blokuje scalenia — portale się mylą', () => {
  // przypadek z danych (Rybnik, 2026-11-02): ta sama działka 4081 m² za tę samą cenę
  const oto = { cat: 'dzialki_rybnik', portal: 'Otodom', price: 110000, areaM2: 4081, title: 'Działka, 4 081 m², Rybnik', place: 'Rybnik – Rybnik-Północ' };
  const no = { cat: 'dzialki_rybnik', portal: 'N-O.pl', price: 110000, areaM2: 4081, title: 'Sprzedam działkę Rybnik - 4 081 m²', place: 'Rybnik – Boguszowice Stare, Bolesława Śmiałego' };
  assert.ok(isDuplicate(oto, no));
});

test('groupOffers: kilka lustrzanek z jednego portalu dołącza do kanonicznej', () => {
  // ta sama nieruchomość: OLX + dwie agencje na N-O.pl (obie pasują do kanonicznej)
  const olx = { id: 'olx-1', cat: 'domy', portal: 'OLX', price: 799000, areaM2: 128, title: '', place: '' };
  const no1 = { id: 'no-1', cat: 'domy', portal: 'N-O.pl', price: 780000, areaM2: 127, title: '', place: '' };
  const no2 = { id: 'no-2', cat: 'domy', portal: 'N-O.pl', price: 787000, areaM2: 127, title: '', place: '' };
  const groups = groupOffers([olx, no1, no2]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0][0].id, 'olx-1');
  assert.equal(groups[0].length, 3);
});

test('groupOffers: identyczne lustro nie jest blokowane przez inną ofertę z portalu', () => {
  // przypadek z danych: prawdziwe lustro OLX↔Otodom (identyczny tytuł/cena/metraż)
  // plus druga oferta z Otodomu pasująca do kanonicznej luźniej
  const olx = { id: 'olx-1', cat: 'domy', portal: 'OLX', price: 1199000, areaM2: 117.07, title: 'piękny dom parterowy żory - rogoźna', place: '' };
  const otoInny = { id: 'oto-2', cat: 'domy', portal: 'Otodom', price: 1150000, areaM2: 120.69, title: 'dom parterowy na sprzedaż', place: '' };
  const otoLustro = { id: 'oto-1', cat: 'domy', portal: 'Otodom', price: 1199000, areaM2: 117.07, title: 'piękny dom parterowy żory - rogoźna', place: '' };
  const groups = groupOffers([olx, otoInny, otoLustro]);
  assert.equal(groups.length, 1);                          // wszystko w jednej grupie z kanoniczną OLX
  assert.equal(groups[0][0].id, 'olx-1');
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
  const live = [{ cat: 'dzialki', portal: 'OLX', price: 415000, areaM2: 1804 }]; // ta sama nieruchomość wciąż na OLX
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

test('detectDistricts: wschodnie dzielnice Rybnika (zjazd z A1)', () => {
  assert.deepEqual([...detectDistricts('Rybnik – Boguszowice Stare')], ['boguszowice']);
  assert.deepEqual([...detectDistricts('dom w Boguszowicach, Rybnik')], ['boguszowice']);
  assert.deepEqual([...detectDistricts('Rybnik – Raszowiec')], ['boguszowice']);        // osiedle w Boguszowicach Starych
  assert.deepEqual([...detectDistricts('działka Gotartowice ul. Pochyła')], ['gotartowice']);
  assert.deepEqual([...detectDistricts('Rybnik – Ligocka Kuźnia')], ['ligota']);
  assert.deepEqual([...detectDistricts('Rybnik – Ligota-Ligocka Kuźnia, Jaśminowa')], ['ligota']);
  assert.deepEqual([...detectDistricts('Rybnik – Kłokocin')], ['kłokocin']);
  assert.deepEqual([...detectDistricts('Rybnik – Rybnik-Północ')], ['północ']);
  assert.deepEqual([...detectDistricts('dom w dzielnicy Północ, ul. Karłowicza')], ['północ']);
  assert.deepEqual([...detectDistricts('działka od północy graniczy z lasem')], []);  // kierunek świata ≠ dzielnica
  assert.deepEqual([...detectDistricts('Rybnik – Śródmieście')], ['śródmieście']);
});

test('detectDistricts: Świerklany z odmianą, Dolne osobno, Świerklaniec nie', () => {
  assert.deepEqual([...detectDistricts('Świerklany, Szeroka')], ['świerklany']);
  assert.deepEqual([...detectDistricts('działka w Świerklanach Górnych przy ul. Szerockiej')], ['świerklany']);
  assert.deepEqual([...detectDistricts('Dom pod Rybnikiem – Świerklany | 179 m²')], ['świerklany']);
  assert.deepEqual([...detectDistricts('10 min do Świerklan')], ['świerklany']);
  assert.deepEqual([...detectDistricts('Świerklany Dolne, ul. Rybnicka')], ['świerklany', 'świerklany-dolne']);
  assert.deepEqual([...detectDistricts('w Świerklanach Dolnych')], ['świerklany', 'świerklany-dolne']);
  assert.deepEqual([...detectDistricts('Świerklaniec, powiat tarnogórski')], []);
});

test('detectDistricts: Nieborowice z odmianą', () => {
  assert.deepEqual([...detectDistricts('Nieborowice, Jagodowa')], ['nieborowice']);
  assert.deepEqual([...detectDistricts('Działka przy ulicy Dębowej w Nieborowicach')], ['nieborowice']);
  assert.deepEqual([...detectDistricts('15 min do Nieborowic')], ['nieborowice']);
  assert.deepEqual([...detectDistricts('Pilchowice, ul. Główna')], []);
});
