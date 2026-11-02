import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNoDistricts, otodomPlace, otodomPlaceholder, otodomDedupItems, otodomKey, otodomCreated } from './parse.mjs';

test('Otodom: zaślepkowy duplikat (id 9000062279, data 1999-02-29) odrzucany, klucz i data z prawdziwej kopii', () => {
  const dup = { id: 9000062279, slug: 'maly-dom-do-remontu-w-dobrej-lokalizacji-ID4DxnS', dateCreated: '1999-02-29 00:00:01' };
  const real = { id: 68528468, slug: 'maly-dom-do-remontu-w-dobrej-lokalizacji-ID4DxnS', dateCreated: '2026-10-14T16:43:31Z' };
  const other = { id: 68459957, slug: 'dzialka-przy-ulicy-debowej-ID4DfyR', dateCreated: '2026-09-25T10:03:26Z', dateCreatedFirst: '2026-09-20T10:00:00Z' };
  assert.ok(otodomPlaceholder(dup));
  assert.ok(!otodomPlaceholder(real));
  assert.deepEqual(otodomDedupItems([dup, real, other]), [real, other]);
  assert.equal(otodomKey(real), '68528468');
  assert.equal(otodomCreated(real), '2026-10-14T16:43:31Z');
  assert.equal(otodomCreated(other), '2026-09-20T10:00:00Z');
  // samotna zaślepka (zwykła kopia na innej stronie) — klucz z publicznego ID, data nieznana
  assert.deepEqual(otodomDedupItems([dup, other]), [dup, other]);
  assert.equal(otodomKey(dup), 'ID4DxnS');
  assert.equal(otodomCreated(dup), null);
  assert.equal(otodomKey({ id: 9000062279, slug: 'bez-publicznego-id' }), 'bez-publicznego-id');
});

test('parseNoDistricts: id → dzielnica z bloku śledzącego, wpisy bez rlocqtn pominięte', () => {
  const html = '<script>x={"a27038542":{"rccata":"houses","rctrn":"sale","rloccta":"rybnik","rlocqtn":"Boguszowice Stare","rlocqtdl":0,"rlocstsn":"Jesienna","rhtrm":5},'
    + '"a27033072":{"rccata":"houses","rctrn":"sale","rloccta":"rybnik","rlocstsn":"G\u0142ucha"},'
    + '"a27048634":{"rccata":"houses","rlocqtn":"Ligota-Ligocka Ku\u017ania","rlocstsn":"Ja\u015bminowa 65"}}</script>';
  const m = parseNoDistricts(html);
  assert.equal(m.get('27038542'), 'Boguszowice Stare');
  assert.equal(m.get('27048634'), 'Ligota-Ligocka Kuźnia');
  assert.ok(!m.has('27033072'));
  assert.equal(parseNoDistricts('<html></html>').size, 0);
  assert.equal(parseNoDistricts(null).size, 0);
});

test('otodomPlace: miasto – dzielnica z reverseGeocoding, fallback gdy brak', () => {
  const loc = { reverseGeocoding: { locations: [
    { locationLevel: 'voivodeship', name: 'śląskie' },
    { locationLevel: 'city_or_village', name: 'Rybnik' },
    { locationLevel: 'district', name: 'Gotartowice' },
  ] } };
  assert.equal(otodomPlace(loc), 'Rybnik – Gotartowice');
  assert.equal(otodomPlace({ reverseGeocoding: { locations: [{ locationLevel: 'city_or_village', name: 'Żory' }] } }), 'Żory');
  assert.equal(otodomPlace(null), '');
  assert.equal(otodomPlace(undefined, 'Żory'), 'Żory');
});
