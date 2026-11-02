// Czyste pomocniki parsowania danych portali — bez I/O. Testy: parse.test.mjs.

// N-O.pl: lista ma per-ogłoszenie blok śledzący "a<ID>":{…,"rlocqtn":"<dzielnica>",…}.
// Na liście całego miasta rlocqtn to dzielnica ogłoszenia (JSON-LD jej nie podaje).
// Zwraca Map id → nazwa dzielnicy; wpisy bez dzielnicy pominięte.
export function parseNoDistricts(html) {
  const out = new Map();
  for (const m of String(html ?? '').matchAll(/"a(\d{6,})":\{([^{}]*)\}/g)) {
    const d = m[2].match(/"rlocqtn":"((?:[^"\\]|\\.)*)"/);
    if (!d) continue;
    try {
      const name = JSON.parse('"' + d[1] + '"').trim();
      if (name) out.set(m[1], name);
    } catch {}
  }
  return out;
}

// Otodom: pole locationLabel zniknęło z listy; miasto i dzielnicę bierzemy z reverseGeocoding.
export function otodomPlace(location, fallback = '') {
  const locs = location?.reverseGeocoding?.locations ?? [];
  const city = locs.find(l => l.locationLevel === 'city_or_village')?.name;
  const district = locs.find(l => l.locationLevel === 'district')?.name;
  return [city, district].filter(Boolean).join(' – ') || fallback;
}

// Otodom: pierwsza pozycja listy bywa „wyróżnionym" duplikatem zwykłego ogłoszenia z tej samej
// strony — z zaślepkowym id (9000062279, to samo na każdej liście) i datą „1999-02-29".
// Kluczowanie po takim id sklejało w stanie obce ogłoszenia (fałszywe obniżki 1,25 mln → 590 tys.).
export const otodomPlaceholder = it => !(Number(it?.id) > 0 && Number(it?.id) < 9e9) || /^1999-/.test(String(it?.dateCreated ?? ''));

// Duplikat-zaślepkę odrzucamy, gdy zwykła kopia (ten sam slug) jest na liście.
export function otodomDedupItems(items) {
  const slugs = new Set(items.filter(it => !otodomPlaceholder(it)).map(it => it.slug));
  return items.filter(it => !otodomPlaceholder(it) || !slugs.has(it.slug));
}

// Klucz rekordu: numeryczne id, a dla samotnej zaślepki publiczne ID ze sluga („…-ID4DxnS").
export function otodomKey(it) {
  if (!otodomPlaceholder(it)) return String(it.id);
  return String(it.slug ?? '').match(/-(ID[0-9A-Za-z]+)$/)?.[1] ?? it.slug ?? String(it.id);
}

// Data publikacji bez zaślepki „1999-02-29" (dzień, który nie istnieje).
export const otodomCreated = it => [it?.dateCreatedFirst, it?.dateCreated].find(d => d && !/^1999-/.test(String(d))) ?? null;
