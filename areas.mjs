// Obszary monitoringu: Żory (całe miasto) + wschodnie dzielnice Rybnika od strony A1
// (węzeł Rybnik na DW935) + Świerklany (gmina Świerklany, węzeł A1 „Świerklany" na DW932).
// Czyste dane i predykat — bez I/O. Testy: areas.test.mjs.
//
// Żeby dodać/usunąć dzielnicę Rybnika: dopisz klucz do RYBNIK_AREA (wzorzec tekstowy
// w DISTRICT_PATTERNS w dedup.mjs), slug do RYBNIK_OTODOM_SLUGS i opcję do DISTRICT_OPTIONS.
// Osobna miejscowość (jak Świerklany) potrzebuje dodatkowo własnych list OLX i N-O.pl
// w CATS (monitor.mjs) i ścieżki Otodomu w RYBNIK_OTODOM_LOCATIONS.

import { detectDistricts } from './dedup.mjs';

export const REGIONS = {
  zory: { label: 'Żory', short: 'Żory' },
  rybnik: { label: 'Rybnik — wschód (zjazd z A1) i Świerklany', short: 'Rybnik' },
};

// Klucze dzielnic (nomenklatura detectDistricts), które liczą się jako „nasz" Rybnik:
// Rybnik-Północ, Boguszowice (Stare + Osiedle + Raszowiec), Gotartowice,
// Ligota-Ligocka Kuźnia, Kłokocin (między Boguszowicami a Żorami), Świerklany.
// Świerklany Górne i Dolne są od 2024 jedną wsią i portale ich nie rozróżniają —
// bierzemy całe Świerklany, odrzucając tylko oferty wprost opisane jako Dolne.
export const RYBNIK_AREA = new Set(['północ', 'boguszowice', 'gotartowice', 'ligota', 'kłokocin', 'świerklany']);

// Slugi dzielnic w URL-ach Otodomu (slaskie/rybnik/rybnik/rybnik/<slug>); nazwa z myślnikiem
// ma w slugu podwójny myślnik. Zły slug = HTTP 404 całego zapytania wielodzielnicowego.
export const RYBNIK_OTODOM_SLUGS = [
  'rybnik--polnoc', 'boguszowice-stare', 'boguszowice--osiedle', 'raszowiec',
  'gotartowice', 'ligota', 'ligocka-kuznia', 'klokocin',
];

// Pełne ścieżki lokalizacji do zapytania „wiele lokalizacji" Otodomu: dzielnice Rybnika
// + wieś Świerklany (poziom wsi, nie gminy — gmina dokleja Jankowice).
export const RYBNIK_OTODOM_LOCATIONS = [
  ...RYBNIK_OTODOM_SLUGS.map(s => 'slaskie/rybnik/rybnik/rybnik/' + s),
  'slaskie/rybnicki/swierklany/swierklany',
];

// Oferta należy do obszaru, gdy lokalizacja/tytuł/opis wskazują którąś z dzielnic docelowych.
// Otodom: dzielnica w `place` (reverseGeocoding); N-O.pl: w `place` z bloku śledzącego;
// OLX: tylko tekst ogłoszenia (lista Rybnika nie ma dzielnic w danych).
// Świerklany liczą się tylko z lokalizacji/tytułu (listy Świerklan zawsze mają je w `place`),
// bo opis oferty z Rybnika bywa „10 min do Świerklan".
export function inRybnikArea(o) {
  const found = detectDistricts([o.place, o.title, o.desc].filter(Boolean).join(' '));
  if ([...found].some(d => d !== 'świerklany' && RYBNIK_AREA.has(d))) return true;
  const strong = detectDistricts([o.place, o.title].filter(Boolean).join(' '));
  return strong.has('świerklany') && !found.has('świerklany-dolne');
}

// Opcje filtra „dzielnica" na podstronie katalogu (optgroup per region); key = klucz detectDistricts.
export const DISTRICT_OPTIONS = [
  ...['Baranowice', 'Kleszczów', 'Kleszczówka', 'Osiny', 'Rogoźna', 'Rowień', 'Folwarki', 'Rój', 'Śródmieście']
    .map(label => ({ region: 'zory', key: label.toLowerCase(), label })),
  { region: 'rybnik', key: 'boguszowice', label: 'Boguszowice' },
  { region: 'rybnik', key: 'gotartowice', label: 'Gotartowice' },
  { region: 'rybnik', key: 'ligota', label: 'Ligota-Ligocka Kuźnia' },
  { region: 'rybnik', key: 'kłokocin', label: 'Kłokocin' },
  { region: 'rybnik', key: 'północ', label: 'Rybnik-Północ' },
  { region: 'rybnik', key: 'świerklany', label: 'Świerklany' },
];
