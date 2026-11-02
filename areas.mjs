// Obszary monitoringu: Żory (całe miasto) + wschodnie dzielnice Rybnika od strony A1
// (węzeł Rybnik na DW935). Czyste dane i predykat — bez I/O. Testy: areas.test.mjs.
//
// Żeby dodać/usunąć dzielnicę Rybnika: dopisz klucz do RYBNIK_AREA (wzorzec tekstowy
// w DISTRICT_PATTERNS w dedup.mjs), slug do RYBNIK_OTODOM_SLUGS i opcję do DISTRICT_OPTIONS.

import { detectDistricts } from './dedup.mjs';

export const REGIONS = {
  zory: { label: 'Żory', short: 'Żory' },
  rybnik: { label: 'Rybnik — wschód (zjazd z A1)', short: 'Rybnik' },
};

// Klucze dzielnic (nomenklatura detectDistricts), które liczą się jako „nasz" Rybnik:
// Rybnik-Północ, Boguszowice (Stare + Osiedle + Raszowiec), Gotartowice,
// Ligota-Ligocka Kuźnia, Kłokocin (między Boguszowicami a Żorami).
export const RYBNIK_AREA = new Set(['północ', 'boguszowice', 'gotartowice', 'ligota', 'kłokocin']);

// Slugi dzielnic w URL-ach Otodomu (slaskie/rybnik/rybnik/rybnik/<slug>); nazwa z myślnikiem
// ma w slugu podwójny myślnik. Zły slug = HTTP 404 całego zapytania wielodzielnicowego.
export const RYBNIK_OTODOM_SLUGS = [
  'rybnik--polnoc', 'boguszowice-stare', 'boguszowice--osiedle', 'raszowiec',
  'gotartowice', 'ligota', 'ligocka-kuznia', 'klokocin',
];

// Oferta należy do obszaru, gdy lokalizacja/tytuł/opis wskazują którąś z dzielnic docelowych.
// Otodom: dzielnica w `place` (reverseGeocoding); N-O.pl: w `place` z bloku śledzącego;
// OLX: tylko tekst ogłoszenia (lista Rybnika nie ma dzielnic w danych).
export function inRybnikArea(o) {
  const found = detectDistricts([o.place, o.title, o.desc].filter(Boolean).join(' '));
  return [...found].some(d => RYBNIK_AREA.has(d));
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
];
