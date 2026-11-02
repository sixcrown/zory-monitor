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
