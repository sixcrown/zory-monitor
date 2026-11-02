// Czysta logika deduplikacji ofert między portalami i statystyk — bez I/O.
// Testy: dedup.test.mjs (node --test).

const PORTAL_PRIORITY = { 'OLX': 0, 'Otodom': 1, 'N-O.pl': 2 };

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const within = (a, b, tol) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= tol;

// Portale różnie zaokrąglają metraż — tolerujemy 3% różnicy względem większego.
export function areaClose(a, b) {
  return within(a, b, 0.03);
}

// Agencje wystawiają tę samą nieruchomość z lekko różną ceną na różnych portalach
// (obserwowany dryf 0,1–5%) — tolerujemy 5% różnicy względem wyższej ceny.
export function priceClose(a, b) {
  return within(a, b, 0.05);
}

// Dzielnice/sołectwa Żor i Rybnika — wzorce łapią też odmianę (w Roju, w Boguszowicach itd.).
const DISTRICT_PATTERNS = [
  ['rój', /\brój\b|\broju\b/],
  ['rogoźna', /rogo[źz]n/],
  ['baranowice', /baranowic/],
  ['kleszczówka', /kleszcz[óo]wk/],
  ['kleszczów', /kleszcz[óo]w(?!k)/],
  ['osiny', /\bosin/],
  ['rowień', /rowie[ńn]/],
  ['folwarki', /folwark/],
  ['śródmieście', /[śs]r[óo]dmie[śs]/],
  // Rybnik — wschodnie dzielnice od strony A1; Raszowiec to osiedle w Boguszowicach Starych,
  // Otodom rozbija Ligotę-Ligocką Kuźnię na „Ligota" i „Ligocka Kuźnia".
  ['boguszowice', /boguszowic|raszow/],
  ['gotartowice', /gotartowic/],
  ['ligota', /\bligot|ligock/],
  ['kłokocin', /k[łl]okocin/],
  // samo „północ" to kierunek świata — łapiemy tylko „Rybnik-Północ" i „dzielnica Północ"
  ['północ', /rybnik[\s–-]*północ|dzielnic\w*\s+północ/],
];

export function detectDistricts(text) {
  const t = String(text ?? '').toLowerCase();
  return new Set(DISTRICT_PATTERNS.filter(([, re]) => re.test(t)).map(([name]) => name));
}

// Oba TYTUŁY deklarują znane dzielnice i żadna się nie pokrywa ⇒ to różne
// nieruchomości, choćby cena i metraż pasowały (np. Rój vs Kleszczów).
// Dzielnicy nadanej przez portal (pole `place`) nie bierzemy pod uwagę — bywa
// błędna: ta sama działka na Otodomie „Rybnik-Północ", na N-O.pl „Boguszowice Stare".
function districtConflict(a, b) {
  const da = detectDistricts(a.title ?? '');
  const db = detectDistricts(b.title ?? '');
  return da.size > 0 && db.size > 0 && ![...da].some(d => db.has(d));
}

// Dubel = ta sama kategoria + brak konfliktu dzielnic + liczby w tolerancji:
// między portalami cena ≤5% i metraż ≤3% (agencje różnicują cenę), w obrębie
// jednego portalu ostrzej — cena i metraż ≤1% (różne agencje wystawiają tę samą
// nieruchomość z tymi samymi liczbami; luźniejszy próg skleiłby osiedle
// deweloperskie). Brak ceny albo metrażu ⇒ wolimy zostawić dubel niż skleić
// dwie różne nieruchomości. Fałszywe scalenie nie gubi ogłoszeń — karta linkuje
// do wszystkich wpisów grupy.
export function isDuplicate(a, b) {
  if (a.cat !== b.cat || districtConflict(a, b)) return false;
  const [pTol, aTol] = a.portal === b.portal ? [0.01, 0.01] : [0.05, 0.03];
  return within(a.price, b.price, pTol) && within(a.areaM2, b.areaM2, aTol);
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

// Oferta "znika" po graceDays nieobecności, o ile jej portal nie zawiódł w tym
// przebiegu. Jeśli żywa oferta wygląda na tę samą nieruchomość (dubel), rekord
// zdejmujemy ze stanu bez archiwizacji — nieruchomość wciąż wisi gdzie indziej.
export function detectDisappearances(seen, liveOffers, failedSources, nowMs, graceDays = 3) {
  const archived = [];
  const gone = [];
  for (const [id, rec] of Object.entries(seen)) {
    if (nowMs - new Date(rec.lastSeen).getTime() < graceDays * 864e5) continue;
    if (failedSources.has(rec.portal + '|' + rec.cat)) continue;
    gone.push(id);
    const lastPrice = rec.priceHistory?.at(-1)?.price ?? null;
    if (liveOffers.some(o => isDuplicate(o, { cat: rec.cat, price: lastPrice, areaM2: rec.areaM2 }))) continue;
    archived.push({
      id, title: rec.title, url: rec.url, portal: rec.portal, cat: rec.cat,
      lastPrice, areaM2: rec.areaM2 ?? null,
      pricePerM2: lastPrice && rec.areaM2 ? Math.round(lastPrice / rec.areaM2) : null,
      firstSeen: rec.firstSeen, disappearedAt: rec.lastSeen,
      daysOnMarket: Math.max(0, Math.round((new Date(rec.lastSeen) - new Date(rec.created ?? rec.firstSeen)) / 864e5)),
    });
  }
  return { archived, gone };
}
