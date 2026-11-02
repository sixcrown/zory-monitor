import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderCatalog, renderArchive, renderTrendChart, splitRuns, zl, esc } from './render.mjs';

const CATS = {
  dzialki: { region: 'zory', label: 'Działki', icon: '🌱', questions: ['pytanie 1'] },
  domy: { region: 'zory', label: 'Domy', icon: '🏠', questions: ['pytanie 2'] },
  dzialki_rybnik: { region: 'rybnik', label: 'Działki', icon: '🌱', questions: ['pytanie 1'] },
};
const STATS = { dzialki: { count: 1, medPrice: 415000, medPpm: 230, minPpm: 230, maxPpm: 230, medArea: 1804 }, domy: null };
const OFERTA = {
  id: 'olx-1', cat: 'dzialki', portal: 'OLX', title: 'Działka Rogoźna <test>', price: 415000,
  priceText: '415 000 zł', areaM2: 1804, pricePerM2: 230, place: 'Żory – Rogoźna',
  url: 'https://olx.pl/x', created: '2026-07-01T10:00:00Z', dom: 12, dropPct: 0,
};

test('zl i esc', () => {
  assert.match(zl(415000), /415.000 zł/); // separator tysięcy to twarda spacja — dopasowanie przez kropkę regexa
  assert.equal(zl(null), '?');
  assert.equal(esc('<a>&'), '&lt;a&gt;&amp;');
});

test('renderReport: statystyki, pytania, oferta z historii', () => {
  const history = [{ at: '2026-07-18T10:00:00Z', offers: [OFERTA], drops: [] }];
  const html = renderReport(CATS, history, STATS, { dzialki: [], domy: [] });
  assert.match(html, /ofert na rynku: <b>1<\/b>/);
  assert.match(html, /pytanie 1/);
  assert.match(html, /Działka Rogoźna &lt;test&gt;/);
});

test('renderCatalog: karta oferty z metadanymi', () => {
  const html = renderCatalog(CATS, { dzialki: [OFERTA], domy: [] }, STATS);
  assert.match(html, /data-ppm="230"/);
  assert.match(html, /~12 dni na rynku/);
});

test('renderTrendChart: pusty <5 punktów, polyline i etykieta ostatniej wartości ≥5', () => {
  const pt = (i, v) => ({ date: `2026-07-0${i}`, cat: 'dzialki', medPpm: v, count: 10 + i });
  assert.equal(renderTrendChart('dzialki', [1, 2, 3, 4].map(i => pt(i, 200))), '');
  const svg = renderTrendChart('dzialki', [pt(1, 180), pt(2, 190), pt(3, 200), pt(4, 195), pt(5, 210)]);
  assert.match(svg, /<polyline points="/);
  assert.match(svg, /210 zł\/m²/);          // etykieta tylko ostatniego punktu
  assert.match(svg, /2026-07-01/);
  assert.match(svg, /data-tip="2026-07-03: 200 zł\/m² \(ofert: 13\)"/);
  assert.match(svg, /<table class="trendtab">/);
});

test('renderTrendChart: płaska seria nie dzieli przez zero', () => {
  const pts = [1, 2, 3, 4, 5].map(i => ({ date: `2026-07-0${i}`, cat: 'domy', medPpm: 5000, count: 8 }));
  assert.doesNotMatch(renderTrendChart('domy', pts), /NaN/);
});

test('renderArchive: mediany i wpis z 30 dni', () => {
  const wczoraj = new Date(Date.now() - 864e5).toISOString();
  const arch = [
    { cat: 'dzialki', title: 'znikła', url: 'u', portal: 'OLX', lastPrice: 200000, areaM2: 1000, pricePerM2: 200, daysOnMarket: 40, disappearedAt: wczoraj },
    { cat: 'dzialki', title: 'stara', url: 'u', portal: 'OLX', lastPrice: 100000, areaM2: 500, pricePerM2: 200, daysOnMarket: 60, disappearedAt: '2020-01-01T00:00:00Z' },
  ];
  const html = renderArchive(CATS, arch);
  assert.match(html, /zniknięte w ost\. 30 dniach \(1\)/);
  assert.match(html, /mediana dni do zniknięcia: <b>50<\/b>/);
  assert.match(html, /znikła/);
  assert.match(html, /🌱 Działki — Żory — zniknięte/);
  assert.doesNotMatch(html, /🏠 Domy — Żory — zniknięte/);
});

test('renderReport: sekcje per region w kolejności Żory → Rybnik, przyklejony pasek z kotwicami', () => {
  const html = renderReport(CATS, [], STATS, {});
  assert.match(html, /<h2 class="region" id="region-zory">Żory<\/h2>/);
  assert.match(html, /<h2 class="region" id="region-rybnik">Rybnik — wschód \(zjazd z A1\) i Świerklany<\/h2>/);
  assert.ok(html.indexOf('id="region-zory"') < html.indexOf('id="region-rybnik"'));
  assert.match(html, /<nav class="top">.*<a href="#region-zory"><b>Żory<\/b><\/a> <a href="#cat-dzialki">🌱 działki<\/a> <a href="#cat-domy">🏠 domy<\/a>/);
  assert.match(html, /<a href="#region-rybnik"><b>Rybnik<\/b><\/a> <a href="#cat-dzialki_rybnik">/);
  assert.match(html, /<div class="col" id="cat-dzialki_rybnik">/);
  assert.match(html, /wszystkie oferty \(1\)/);
  assert.match(html, /Żory i Rybnik/); // tytuł strony obejmuje oba obszary
});

test('splitRuns: okno 7 dni, ale zawsze min. 3 najnowsze przebiegi', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const run = d => ({ at: new Date(now - d * 864e5).toISOString(), offers: [], drops: [] });
  const r1 = splitRuns([run(1), run(2), run(10), run(20)], now);
  assert.deepEqual([r1.recent.length, r1.older.length], [3, 1]); // w oknie 2 → dopełnione do 3
  const r2 = splitRuns([1, 2, 3, 4, 5].map(run), now);
  assert.deepEqual([r2.recent.length, r2.older.length], [5, 0]); // wszystko w oknie
  const r3 = splitRuns([run(30), run(40)], now);
  assert.deepEqual([r3.recent.length, r3.older.length], [2, 0]); // mniej niż min → wszystko świeże
  assert.deepEqual(splitRuns([], now), { recent: [], older: [] });
  assert.deepEqual(splitRuns([run(1), run(2), run(3), run(9)], now, { days: 7, min: 1 }).older.length, 1);
});

test('renderReport: stare przebiegi zwinięte w details.older, świeże rozwinięte', () => {
  const fresh = { ...OFERTA, id: 'olx-2', title: 'Świeża działka Rój' };
  const history = [
    { at: new Date().toISOString(), offers: [fresh], drops: [] },
    { at: new Date(Date.now() - 2 * 864e5).toISOString(), offers: [], drops: [{ cat: 'dzialki', title: 'tańsza', url: 'u', portal: 'OLX', oldPrice: 100, newPrice: 90, dropPct: 10 }] },
    { at: new Date(Date.now() - 3 * 864e5).toISOString(), offers: [{ ...OFERTA, id: 'olx-3', title: 'Trzecia' }], drops: [] },
    { at: '2026-07-18T10:00:00Z', offers: [OFERTA], drops: [] },
    { at: '2026-07-10T10:00:00Z', offers: [{ ...OFERTA, id: 'olx-4', title: 'Lipcowa' }], drops: [{ cat: 'dzialki', title: 'lipcowa obniżka', url: 'u', portal: 'OLX', oldPrice: 100, newPrice: 90, dropPct: 10 }] },
  ];
  const html = renderReport(CATS, history, STATS, {});
  const older = html.indexOf('<details class="older">');
  assert.ok(older > 0);
  assert.ok(html.indexOf('Świeża działka Rój') < older);
  assert.ok(html.indexOf('Trzecia') < older);
  assert.ok(html.indexOf('Działka Rogoźna &lt;test&gt;') > older);
  assert.ok(html.indexOf('Lipcowa') > older);
  assert.match(html, /📜 Starsze niż 7 dni: 2 nowych, 1 obniżek \(do 18\.07\.2026\)/);
  // kategoria bez starszych przebiegów nie dostaje pustego details
  assert.equal((html.match(/<details class="older">/g) ?? []).length, 1);
});

test('renderCatalog: optgroup dzielnic per region, nagłówek sekcji z regionem', () => {
  const html = renderCatalog(CATS, { dzialki: [OFERTA], domy: [] }, STATS);
  assert.match(html, /<optgroup label="Żory">/);
  assert.match(html, /<optgroup label="Rybnik — wschód \(zjazd z A1\) i Świerklany">/);
  assert.match(html, /<option value="świerklany">Świerklany<\/option>/);
  assert.match(html, /<option value="boguszowice">Boguszowice<\/option>/);
  assert.match(html, /<option value="północ">Rybnik-Północ<\/option>/);
  assert.match(html, /🌱 Działki — Rybnik — wschód \(zjazd z A1\) i Świerklany \(<span class="viscount">0<\/span>\)/);
});

test('renderCatalog: pasek filtrów i atrybuty data-title/data-dz', () => {
  const html = renderCatalog(CATS, { dzialki: [OFERTA], domy: [] }, STATS);
  assert.match(html, /id="f-q"/);
  assert.match(html, /value="rogoźna"/);
  assert.match(html, /data-title="działka rogoźna &lt;test&gt;"/);
  assert.match(html, /data-dz="rogoźna"/);            // klucze z detectDistricts (łapią odmianę), nie surowy tekst
  assert.match(html, /class="viscount"/);
  const rybnik = { ...OFERTA, id: 'oto-9', cat: 'dzialki_rybnik', title: 'Działka w Boguszowicach', place: 'Rybnik – Raszowiec' };
  assert.match(renderCatalog(CATS, { dzialki_rybnik: [rybnik] }, STATS), /data-dz="boguszowice"/);
  // monitor podaje dzielnice rozpoznane także z opisu — render ich nie przelicza
  const zOpisu = { ...OFERTA, id: 'no-9', title: 'Sprzedam działkę Żory - 900 m²', place: 'Żory', districts: ['rój'] };
  assert.match(renderCatalog(CATS, { dzialki: [zOpisu] }, STATS), /data-dz="rój"/);
});

test('renderCatalog: rządek Na portalach dla lustrzanek', () => {
  const o = { ...OFERTA, mirrors: [{ portal: 'N-O.pl', url: 'https://n-o.pl/y' }] };
  const html = renderCatalog(CATS, { dzialki: [o], domy: [] }, STATS);
  assert.match(html, /Na portalach:/);
  assert.match(html, /https:\/\/n-o\.pl\/y/);
});
