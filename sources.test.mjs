import { test } from 'node:test';
import assert from 'node:assert/strict';
import { olxUrls, noSources, sourceHash } from './sources.mjs';

test('olxUrls/noSources: pojedyncze źródło i lista', () => {
  assert.deepEqual(olxUrls({ olx: 'a' }), ['a']);
  assert.deepEqual(olxUrls({ olx: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(noSources({ no: 'u', noPages: 6, noLocality: /rybnik/i }), [{ url: 'u', pages: 6, locality: /rybnik/i }]);
  const list = [{ url: 'u', pages: 2, locality: /x/ }];
  assert.equal(noSources({ no: list }), list);
});

test('sourceHash: stabilny, czuły na URL/strony/regex, osobny per portal', () => {
  const cfg = { olx: ['a'], otodom: 'o', otodomPages: 2, no: 'n', noPages: 6, noLocality: /rybnik/i };
  assert.equal(sourceHash('OLX', cfg), sourceHash('OLX', { ...cfg }));
  assert.match(sourceHash('OLX', cfg), /^[0-9a-f]{12}$/);
  assert.notEqual(sourceHash('OLX', cfg), sourceHash('OLX', { ...cfg, olx: ['a', 'b'] }));
  assert.notEqual(sourceHash('Otodom', cfg), sourceHash('Otodom', { ...cfg, otodomPages: 3 }));
  assert.notEqual(sourceHash('N-O.pl', cfg), sourceHash('N-O.pl', { ...cfg, noLocality: /świerklany/i }));
  // ta sama konfiguracja zapisana jako string+pola albo jako lista daje ten sam odcisk
  assert.equal(sourceHash('N-O.pl', cfg), sourceHash('N-O.pl', { no: [{ url: 'n', pages: 6, locality: /rybnik/i }] }));
  assert.notEqual(sourceHash('OLX', cfg), sourceHash('Otodom', cfg));
});
