import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNoDistricts, otodomPlace } from './parse.mjs';

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
