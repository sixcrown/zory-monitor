import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderCatalog, zl, esc } from './render.mjs';

const CATS = {
  dzialki: { label: 'Działki', icon: '🌱', questions: ['pytanie 1'] },
  domy: { label: 'Domy', icon: '🏠', questions: ['pytanie 2'] },
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
