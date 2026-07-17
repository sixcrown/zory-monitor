// Czysta logika deduplikacji ofert między portalami i statystyk — bez I/O.
// Testy: dedup.test.mjs (node --test).

const PORTAL_PRIORITY = { 'OLX': 0, 'Otodom': 1, 'N-O.pl': 2 };

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Portale różnie zaokrąglają metraż — tolerujemy 3% różnicy względem większego.
export function areaClose(a, b) {
  return a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= 0.03;
}

// Dubel = ta sama kategoria + identyczna cena + metraż w tolerancji.
// Brak ceny albo metrażu po którejkolwiek stronie ⇒ wolimy zostawić dubel niż
// skleić dwie różne nieruchomości.
export function isDuplicate(a, b) {
  return a.cat === b.cat && a.price != null && a.price === b.price && areaClose(a.areaM2, b.areaM2);
}

// Grupuje oferty w duble; w grupie oferty wg priorytetu portalu, [0] = kanoniczna.
// Dopasowanie zawsze względem kanonicznej grupy (nie łańcuchowo).
export function groupOffers(offers) {
  const sorted = [...offers].sort((a, b) => (PORTAL_PRIORITY[a.portal] ?? 9) - (PORTAL_PRIORITY[b.portal] ?? 9));
  const groups = [];
  for (const o of sorted) {
    const g = groups.find(g => isDuplicate(g[0], o));
    if (g) g.push(o); else groups.push([o]);
  }
  return groups;
}
