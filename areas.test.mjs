import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, RYBNIK_AREA, RYBNIK_OTODOM_SLUGS, inRybnikArea, DISTRICT_OPTIONS } from './areas.mjs';
import { detectDistricts } from './dedup.mjs';

test('REGIONS: Żory i Rybnik z krótką nazwą do powiadomień', () => {
  assert.deepEqual(Object.keys(REGIONS), ['zory', 'rybnik']);
  assert.equal(REGIONS.zory.short, 'Żory');
  assert.equal(REGIONS.rybnik.short, 'Rybnik');
  assert.match(REGIONS.rybnik.label, /A1/);
});

test('inRybnikArea: Otodom — dzielnica siedzi w place', () => {
  assert.ok(inRybnikArea({ place: 'Rybnik – Boguszowice Stare', title: 'Dom wolnostojący' }));
  assert.ok(inRybnikArea({ place: 'Rybnik – Boguszowice-Osiedle', title: 'Dom' }));
  assert.ok(inRybnikArea({ place: 'Rybnik – Rybnik-Północ', title: 'Dom' }));
  assert.ok(inRybnikArea({ place: 'Rybnik – Raszowiec', title: 'Dom przy lesie' }));
  assert.ok(!inRybnikArea({ place: 'Rybnik – Śródmieście', title: 'Dom w centrum Rybnika' }));
  assert.ok(!inRybnikArea({ place: 'Rybnik – Meksyk', title: 'Działka budowlana' }));
  assert.ok(!inRybnikArea({ place: 'Rybnik', title: 'Działka budowlana' }));
});

test('inRybnikArea: N-O.pl i OLX — dzielnica z bloku śledzącego albo z tekstu ogłoszenia', () => {
  assert.ok(inRybnikArea({ place: 'Rybnik – Ligota-Ligocka Kuźnia, Jaśminowa', title: 'Sprzedam Dom Rybnik - 130 m²' }));
  assert.ok(inRybnikArea({ place: 'Rybnik', title: 'Działka budowlana', desc: 'Działka położona w Rybniku Gotartowicach przy ul. Pochyłej' }));
  assert.ok(inRybnikArea({ place: 'Rybnik', title: 'Dom Kłokocin, blisko A1', desc: '' }));
  assert.ok(!inRybnikArea({ place: 'Rybnik', title: 'Działka', desc: 'od północy las, od południa droga' }));
  assert.ok(!inRybnikArea({ place: 'Rybnik, Gruntowa', title: 'Sprzedam działkę Rybnik - 900 m²' }));
});

test('RYBNIK_AREA i DISTRICT_OPTIONS: klucze zgodne z detectDistricts', () => {
  for (const key of RYBNIK_AREA) assert.ok(DISTRICT_OPTIONS.some(o => o.region === 'rybnik' && o.key === key), `brak opcji filtra dla ${key}`);
  for (const o of DISTRICT_OPTIONS) {
    assert.ok(Object.keys(REGIONS).includes(o.region));
    assert.ok(detectDistricts(o.label).has(o.key), `etykieta „${o.label}" nie wykrywa klucza ${o.key}`);
  }
  assert.equal(DISTRICT_OPTIONS.filter(o => o.region === 'zory').length, 9);
});

test('RYBNIK_OTODOM_SLUGS: slugi dzielnic Otodomu (podwójny myślnik tam, gdzie nazwa ma myślnik)', () => {
  assert.ok(RYBNIK_OTODOM_SLUGS.includes('rybnik--polnoc'));
  assert.ok(RYBNIK_OTODOM_SLUGS.includes('boguszowice--osiedle'));
  assert.ok(RYBNIK_OTODOM_SLUGS.includes('ligocka-kuznia'));
  for (const s of RYBNIK_OTODOM_SLUGS) assert.match(s, /^[a-z-]+$/);
});
