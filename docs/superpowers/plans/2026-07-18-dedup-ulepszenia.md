# Deduplikacja + ulepszenia raportu — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scalić duble ofert między OLX/Otodom/N-O.pl, dodać śledzenie zniknięć, wykres trendu mediany zł/m² i filtry client-side — wg specu `docs/superpowers/specs/2026-07-18-dedup-design.md`.

**Architecture:** Czysta logika (grupowanie dubli, zniknięcia, mediana) idzie do nowego `dedup.mjs` z testami `node --test`; całe renderowanie HTML wyprowadzamy do `render.mjs`; `monitor.mjs` zostaje orkiestratorem (fetch → dedup → stan → render → deploy → powiadomienia). Dane runtime w nowych plikach `archive.json` i `trend.json` (gitignorowane).

**Tech Stack:** Node 20+ bez zależności npm, `node:test` + `node:assert/strict`, inline SVG (bez bibliotek), czysty JS w generowanym HTML.

## Global Constraints

- Zero zależności npm — tylko moduły `node:*` (nagłówek `monitor.mjs`: „Bez zależności npm (Node 20+)").
- Zero CDN-ów / zewnętrznych zasobów w generowanym HTML (strona jest statyczna na Vercelu).
- Testy nie mogą dotykać sieci ani plików stanu — tylko czyste funkcje na fixture'ach.
- Teksty UI po polsku, styl istniejących komunikatów.
- Reguła dubla (spec): ta sama `cat` + identyczna `price` (obie niepuste) + oba `areaM2` znane i `|a−b|/max(a,b) ≤ 0.03`. Brak metrażu ⇒ NIE scalać.
- Priorytet portali: `OLX > Otodom > N-O.pl` (kanoniczna = pierwsza wg priorytetu).
- Karencja zniknięcia: 3 dni; oferty portalu, który zawiódł w danym przebiegu, nie są uznawane za nieobecne.
- Punkt trendu tylko gdy wszystkie źródła odpowiedziały (`errors.length === 0`), max 1 punkt dziennie na kategorię.
- Pliki danych: `archive.json` (max 500 wpisów), `trend.json` — oba w `.gitignore`.
- Wykres (skill dataviz): jedna seria bez legendy, linia 2px `#0b57d0`, siatka `#eee`, teksty w kolorach tekstu (`#777`/`#222`), etykieta wartości tylko przy ostatnim punkcie, hover-tooltip z celem ≥8px, tabelka danych w `<details>` jako fallback.

---

### Task 1: `dedup.mjs` — grupowanie dubli (TDD)

**Files:**
- Create: `dedup.mjs`
- Test: `dedup.test.mjs`

**Interfaces:**
- Produces: `median(arr:number[]) → number|null`; `areaClose(a,b) → boolean`; `isDuplicate(a,b) → boolean` (obiekty z `cat, price, areaM2`); `groupOffers(offers) → offer[][]` — lista grup, w każdej oferty posortowane wg priorytetu portalu, `group[0]` = kanoniczna. Wejściowe obiekty nie są mutowane.

- [ ] **Step 1: Napisz failujące testy**

Utwórz `dedup.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, areaClose, isDuplicate, groupOffers } from './dedup.mjs';

test('median: środek, parzysta liczba, pusta lista', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3); // zaokrąglone (2+3)/2 → 3 (Math.round)
  assert.equal(median([]), null);
});

test('areaClose: tolerancja 3% względem większego metrażu', () => {
  assert.ok(areaClose(1804, 1804));
  assert.ok(areaClose(1000, 1030));        // dokładnie 3% — jeszcze dubel
  assert.ok(!areaClose(885, 921));         // 3,9% — przypadek kontrolny ze specu
  assert.ok(!areaClose(null, 1000));
  assert.ok(!areaClose(0, 0));
});

test('isDuplicate: cena i kategoria muszą być identyczne', () => {
  const a = { cat: 'dzialki', price: 415000, areaM2: 1804 };
  assert.ok(isDuplicate(a, { cat: 'dzialki', price: 415000, areaM2: 1804 }));
  assert.ok(!isDuplicate(a, { cat: 'domy', price: 415000, areaM2: 1804 }));
  assert.ok(!isDuplicate(a, { cat: 'dzialki', price: 415001, areaM2: 1804 }));
  assert.ok(!isDuplicate(a, { cat: 'dzialki', price: null, areaM2: 1804 }));
  assert.ok(!isDuplicate({ cat: 'dzialki', price: 100, areaM2: null },
                         { cat: 'dzialki', price: 100, areaM2: null })); // brak metrażu ⇒ nie scalamy
});

test('groupOffers: scala OLX+N-O.pl, kanoniczna wg priorytetu OLX>Otodom>N-O.pl', () => {
  const olx = { id: 'olx-1', cat: 'dzialki', portal: 'OLX', price: 415000, areaM2: 1804 };
  const no = { id: 'no-1', cat: 'dzialki', portal: 'N-O.pl', price: 415000, areaM2: 1800 };
  const inny = { id: 'oto-2', cat: 'dzialki', portal: 'Otodom', price: 149000, areaM2: 885 };
  const groups = groupOffers([no, inny, olx]); // celowo w złej kolejności
  assert.equal(groups.length, 2);
  const g = groups.find(g => g.length === 2);
  assert.equal(g[0].id, 'olx-1');
  assert.equal(g[1].id, 'no-1');
});

test('groupOffers: ta sama cena, metraż poza tolerancją — osobne grupy', () => {
  const groups = groupOffers([
    { id: 'oto-1', cat: 'dzialki', portal: 'Otodom', price: 149000, areaM2: 885 },
    { id: 'no-2', cat: 'dzialki', portal: 'N-O.pl', price: 149000, areaM2: 921 },
  ]);
  assert.equal(groups.length, 2);
});

test('groupOffers: trójka OLX+Otodom+N-O.pl w jednej grupie', () => {
  const groups = groupOffers([
    { id: 'no-3', cat: 'dzialki', portal: 'N-O.pl', price: 270000, areaM2: 1232 },
    { id: 'olx-3', cat: 'dzialki', portal: 'OLX', price: 270000, areaM2: 1232 },
    { id: 'oto-3', cat: 'dzialki', portal: 'Otodom', price: 270000, areaM2: 1232 },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(o => o.id), ['olx-3', 'oto-3', 'no-3']);
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `node --test dedup.test.mjs`
Expected: FAIL — `Cannot find module ... dedup.mjs`

- [ ] **Step 3: Napisz implementację**

Utwórz `dedup.mjs`:

```js
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
```

- [ ] **Step 4: Uruchom testy — mają przechodzić**

Run: `node --test dedup.test.mjs`
Expected: PASS (6 testów)

- [ ] **Step 5: Commit**

```bash
git add dedup.mjs dedup.test.mjs
git commit -m "feat: dedup.mjs - grupowanie dubli miedzy portalami (cena + metraz 3%)"
```

---

### Task 2: `dedup.mjs` — wykrywanie zniknięć (TDD)

**Files:**
- Modify: `dedup.mjs`
- Test: `dedup.test.mjs`

**Interfaces:**
- Consumes: `isDuplicate` z Task 1.
- Produces: `detectDisappearances(seen, liveOffers, failedSources, nowMs, graceDays=3) → { archived, gone }`.
  - `seen`: obiekt jak `state.seen` (rekordy z `portal, cat, title, url, firstSeen, lastSeen, created?, areaM2?, priceHistory`).
  - `liveOffers`: bieżące oferty (`cat, price, areaM2`).
  - `failedSources`: `Set<string>` postaci `"OLX|dzialki"`.
  - `archived`: wpisy do archiwum `{ id, title, url, portal, cat, lastPrice, areaM2, pricePerM2, firstSeen, disappearedAt, daysOnMarket }`.
  - `gone`: id do usunięcia ze `state.seen` (wszystkie zarchiwizowane + martwe lustrzanki, których nieruchomość wciąż wisi gdzie indziej).

- [ ] **Step 1: Dopisz failujące testy do `dedup.test.mjs`**

```js
import { detectDisappearances } from './dedup.mjs'; // dołącz do istniejącego importu z './dedup.mjs'

test('detectDisappearances: karencja 3 dni, awaria portalu, żywy dubel', () => {
  const now = Date.parse('2026-07-18T12:00:00Z');
  const seen = {
    'olx-old': { portal: 'OLX', cat: 'dzialki', title: 'stara', url: 'u1', firstSeen: '2026-06-01T00:00:00Z',
      created: '2026-05-30T00:00:00Z', lastSeen: '2026-07-10T00:00:00Z', areaM2: 700,
      priceHistory: [{ at: 'x', price: 210000 }] },
    'olx-swieza': { portal: 'OLX', cat: 'dzialki', title: 'świeża', url: 'u2', firstSeen: '2026-07-01T00:00:00Z',
      lastSeen: '2026-07-17T00:00:00Z', areaM2: 500, priceHistory: [{ at: 'x', price: 100000 }] },
    'oto-awaria': { portal: 'Otodom', cat: 'dzialki', title: 'awaria', url: 'u3', firstSeen: '2026-06-01T00:00:00Z',
      lastSeen: '2026-07-10T00:00:00Z', areaM2: 600, priceHistory: [{ at: 'x', price: 150000 }] },
    'no-lustro': { portal: 'N-O.pl', cat: 'dzialki', title: 'lustro', url: 'u4', firstSeen: '2026-06-01T00:00:00Z',
      lastSeen: '2026-07-10T00:00:00Z', areaM2: 1804, priceHistory: [{ at: 'x', price: 415000 }] },
  };
  const live = [{ cat: 'dzialki', price: 415000, areaM2: 1804 }]; // ta sama nieruchomość wciąż na OLX
  const { archived, gone } = detectDisappearances(seen, live, new Set(['Otodom|dzialki']), now);
  assert.deepEqual(archived.map(a => a.id), ['olx-old']);
  assert.equal(archived[0].lastPrice, 210000);
  assert.equal(archived[0].pricePerM2, 300);
  assert.equal(archived[0].daysOnMarket, 41);           // 2026-05-30 → 2026-07-10
  assert.equal(archived[0].disappearedAt, '2026-07-10T00:00:00Z');
  assert.ok(gone.includes('olx-old') && gone.includes('no-lustro'));
  assert.ok(!gone.includes('olx-swieza') && !gone.includes('oto-awaria'));
});

test('detectDisappearances: bez created liczy dni od firstSeen', () => {
  const now = Date.parse('2026-07-18T12:00:00Z');
  const seen = { 'no-9': { portal: 'N-O.pl', cat: 'domy', title: 't', url: 'u', firstSeen: '2026-07-01T00:00:00Z',
    lastSeen: '2026-07-11T00:00:00Z', areaM2: 120, priceHistory: [{ at: 'x', price: 600000 }] } };
  const { archived } = detectDisappearances(seen, [], new Set(), now);
  assert.equal(archived[0].daysOnMarket, 10);            // 2026-07-01 → 2026-07-11
});
```

- [ ] **Step 2: Uruchom testy — nowe mają failować**

Run: `node --test dedup.test.mjs`
Expected: FAIL — `detectDisappearances is not a function` (stare 6 dalej PASS)

- [ ] **Step 3: Dopisz implementację na końcu `dedup.mjs`**

```js
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
```

- [ ] **Step 4: Uruchom testy — wszystkie PASS**

Run: `node --test dedup.test.mjs`
Expected: PASS (8 testów)

- [ ] **Step 5: Commit**

```bash
git add dedup.mjs dedup.test.mjs
git commit -m "feat: detectDisappearances - zniknieca z karencja 3 dni i ochrona przed awaria portalu"
```

---

### Task 3: Wydzielenie renderowania do `render.mjs`

**Files:**
- Create: `render.mjs`
- Modify: `monitor.mjs` (usunięcie przeniesionych funkcji, importy, wywołania)
- Test: `render.test.mjs`

**Interfaces:**
- Consumes: `median` z `dedup.mjs` (na razie nieużywane w render — dojdzie w Task 5; import dodamy wtedy).
- Produces (eksporty `render.mjs`):
  - `zl(v) → string` (formatowanie ceny — używane też przez `monitor.mjs`),
  - `esc(s) → string`,
  - `renderReport(CATS, history, statsByCat, negoByCat) → string`,
  - `renderCatalog(CATS, catalogByCat, statsByCat) → string`.
  - `CATS` przekazywane jako pierwszy parametr o tej samej nazwie — ciała funkcji zostają dosłownie bez zmian.

- [ ] **Step 1: Utwórz `render.mjs` przez przeprowadzkę funkcji**

Nagłówek nowego pliku:

```js
// Renderowanie HTML raportu i katalogu — czyste funkcje string → string.
// Wydzielone z monitor.mjs bez zmian logiki. Testy: render.test.mjs.

export const zl = v => (v == null ? '?' : Number(v).toLocaleString('pl-PL') + ' zł');
```

Następnie przenieś z `monitor.mjs` DOSŁOWNIE (wytnij tam, wklej tu, bez zmian treści ciał):
- `esc` (obecne linie 359-361) — dopisz `export` przed `function esc`,
- `renderOffer` (363-373) — bez `export` (używane tylko wewnątrz),
- `renderDrop` (375-381) — bez `export`,
- `renderReport` (383-454) — dopisz `export` i zmień sygnaturę na `function renderReport(CATS, history, statsByCat, negoByCat)`,
- `renderCatalog` (456-528) — dopisz `export` i zmień sygnaturę na `function renderCatalog(CATS, catalogByCat, statsByCat)`.

Usuń też z `monitor.mjs` starą definicję `zl` (linia 97: `const zl = v => ...`) i nagłówek sekcji `// ---- raport ----`.

- [ ] **Step 2: Podepnij importy w `monitor.mjs`**

Po istniejących importach `node:*` (linia 8) dodaj:

```js
import { renderReport, renderCatalog, zl } from './render.mjs';
```

Zmień dwa wywołania (obecne linie 730-731):

```js
fs.writeFileSync(REPORT_FILE, renderReport(CATS, history, statsByCat, negoByCat));
fs.writeFileSync(CATALOG_FILE, renderCatalog(CATS, catalogByCat, statsByCat));
```

- [ ] **Step 3: Napisz test renderu na fixture'ach**

Utwórz `render.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderCatalog, zl, esc } from './render.mjs';

const CATS = {
  dzialki: { label: 'Działki', icon: '🌱', questions: ['pytanie 1'] },
  domy: { label: 'Domy', icon: '🏠', questions: ['pytanie 2'] },
};
const STATS = { dzialki: { count: 1, medPrice: 415000, medPpm: 230, minPpm: 230, maxPpm: 230, medArea: 1804 }, domy: null };
const OFERTA = {
  id: 'olx-1', cat: 'dzialki', portal: 'OLX', title: 'Działka Rogoźna <test>', price: 415000,
  priceText: '415 000 zł', areaM2: 1804, pricePerM2: 230, place: 'Żory – Rogoźna',
  url: 'https://olx.pl/x', created: '2026-07-01T10:00:00Z', dom: 12, dropPct: 0,
};

test('zl i esc', () => {
  assert.equal(zl(415000), '415 000 zł'.replace(' ', ' ')); // toLocaleString używa twardej spacji
  assert.equal(esc('<a>&'), '&lt;a&gt;&amp;');
});

test('renderReport: statystyki, pytania, oferta z historii', () => {
  const history = [{ at: '2026-07-18T10:00:00Z', offers: [OFERTA], drops: [] }];
  const html = renderReport(CATS, history, STATS, { dzialki: [], domy: [] });
  assert.match(html, /ofert na rynku: <b>1<\/b>/);
  assert.match(html, /pytanie 1/);
  assert.match(html, /Działka Rogoźna &lt;test&gt;/);
});

test('renderCatalog: karta oferty z metadanymi', () => {
  const html = renderCatalog(CATS, { dzialki: [OFERTA], domy: [] }, STATS);
  assert.match(html, /data-ppm="230"/);
  assert.match(html, /~12 dni na rynku/);
});
```

Uwaga: `toLocaleString('pl-PL')` wstawia twardą spację (U+00A0) — pierwszy assert to uwzględnia; jeśli na maszynie separator to zwykła spacja, uprość assert do `assert.match(zl(415000), /415.000 zł/)`.

- [ ] **Step 4: Uruchom testy i sprawdź składnię monitora**

Run: `node --test render.test.mjs dedup.test.mjs` — Expected: PASS
Run: `node --check monitor.mjs` — Expected: brak wyjścia (składnia OK)

- [ ] **Step 5: Commit**

```bash
git add render.mjs render.test.mjs monitor.mjs
git commit -m "refactor: renderowanie HTML wydzielone do render.mjs (bez zmian logiki)"
```

---

### Task 4: Integracja dedupu w `monitor.mjs` + lustrzanki w UI

**Files:**
- Modify: `monitor.mjs` (przepływ główny), `render.mjs` (rządek „Na portalach"), `render.test.mjs`

**Interfaces:**
- Consumes: `groupOffers` z `dedup.mjs`.
- Produces:
  - oferta kanoniczna dostaje `mirrors: [{ portal, url }]` (Task 5-7 i render polegają na tym polu),
  - `failedSources: Set<"portal|cat">` w przepływie głównym (Task 5 używa),
  - rekordy `state.seen` dostają pola `areaM2` i `place`,
  - `deduped: offer[]` — kanoniczne oferty; statystyki/katalog/liczniki liczone z niej.

- [ ] **Step 1: Zbieraj `failedSources` przy pobieraniu**

W `monitor.mjs` zastąp blok jobs/results (obecne linie 591-602, od `const jobs = ...` do końca pętli `for (const r of results)`):

```js
const jobs = Object.entries(CATS).flatMap(([cat, cfg]) => [
  { portal: 'OLX', cat, p: getOlx(cat, cfg.olx) },
  { portal: 'Otodom', cat, p: getOtodom(cat, cfg.otodom) },
  { portal: 'N-O.pl', cat, p: queuedGetNO(cat, cfg.no) },
]);
const results = await Promise.allSettled(jobs.map(j => j.p));
const offers = [];
const errors = [];
const failedSources = new Set(); // "OLX|dzialki" — do ochrony zniknięć i trendu
results.forEach((r, i) => {
  if (r.status === 'fulfilled') offers.push(...r.value);
  else {
    failedSources.add(jobs[i].portal + '|' + jobs[i].cat);
    errors.push(`${CATS[jobs[i].cat].label}/${jobs[i].portal}: ${r.reason.message}`);
  }
});
```

(Wewnętrzne `.catch(e => { throw new Error(...) })` z dawnych jobs znikają — etykietę portalu/kategorii dokleja teraz `results.forEach`.)

- [ ] **Step 2: Grupowanie, lustrzanki i wyciszenie dubli**

Dodaj do importów `monitor.mjs`:

```js
import { groupOffers, median } from './dedup.mjs';
```

Usuń z `monitor.mjs` starą definicję `median` (obecne linie 311-316) — `calcStats` używa teraz importu.

Zaraz po `const unique = ...` (obecna linia 616) wstaw:

```js
// Grupy dubli: ta sama nieruchomość na kilku portalach. Kanoniczna oferta
// reprezentuje grupę wszędzie dalej (statystyki, raport, powiadomienia).
const preKnown = new Set(Object.keys(state.seen)); // znane PRZED tym przebiegiem
const groups = groupOffers(unique);
const groupOf = new Map(groups.flatMap(g => g.map(o => [o.id, g])));
const deduped = groups.map(g => Object.assign(g[0], { mirrors: g.slice(1).map(m => ({ portal: m.portal, url: m.url })) }));
```

(Uwaga: linia `const fresh = unique.filter(...)` zostaje pod spodem bez zmian — `preKnown` musi być policzone przed pętlą dopisującą świeże do `state.seen`.)

W pętli dopisującej świeże oferty do stanu (obecne linie 618-624) dodaj do rekordu pola `areaM2` i `place`:

```js
state.seen[o.id] = {
  firstSeen: now, lastSeen: now, title: o.title, url: o.url, cat: o.cat,
  portal: o.portal, created: o.created, areaM2: o.areaM2 ?? null, place: o.place ?? '',
  priceHistory: o.price ? [{ at: now, price: o.price }] : [],
};
```

W pętli aktualizującej znane oferty (obecne linie 628-643), po linii `rec.url ??= o.url; ...` dodaj:

```js
  rec.areaM2 ??= o.areaM2 ?? null; rec.place ??= o.place ?? '';
```

Zastąp linię `const news = fresh.filter(o => !flooded.has(o.portal + '|' + o.cat));` (obecna 660):

```js
// Pushuje tylko kanoniczna świeżej grupy i tylko gdy żaden inny wpis grupy nie
// był znany wcześniej — dubel znanej oferty dokleja się cicho jako link.
const news = fresh.filter(o => {
  if (flooded.has(o.portal + '|' + o.cat)) return false;
  const g = groupOf.get(o.id);
  if (g[0] !== o) return false;
  return !g.some(m => m !== o && preKnown.has(m.id));
});
```

- [ ] **Step 3: Jedna obniżka na grupę, statystyki po scaleniu**

Zaraz po pętli wykrywającej obniżki (po obecnej linii 643) wstaw i dalej używaj `uniqueDrops` zamiast `drops` (miejsca użycia: `history.unshift` — linia 724, warunek na linii 723, tytuł/treść powiadomienia — linie 741-749, log — linia 752):

```js
// Agencja obniża cenę na każdym portalu — pushujemy raz, z najniższą nową ceną.
const dropByGroup = new Map();
for (const d of drops) {
  const key = (groupOf.get(d.id) ?? [d])[0].id;
  const prev = dropByGroup.get(key);
  if (!prev || d.newPrice < prev.newPrice) dropByGroup.set(key, d);
}
const uniqueDrops = [...dropByGroup.values()];
```

Przełącz obliczenia z `unique` na `deduped` (kanoniczne):
- linia 684: `const catOffers = deduped.filter(o => o.cat === cat);`
- linia 701: `const perCat = cat => deduped.filter(o => o.cat === cat).length;`
- linia 710: `catalogByCat[cat] = deduped.filter(o => o.cat === cat).map(o => {`

(Pętle stanu — linie 617-643 — celowo ZOSTAJĄ na `unique`: historia cen śledzona per ogłoszenie-portal.)

- [ ] **Step 4: Rządek „Na portalach" w renderze**

W `render.mjs`, w `renderOffer` po linii `<div class="meta">...` dodaj:

```js
        ${o.mirrors?.length ? `<div class="mirrors">Na portalach: <a href="${esc(o.url)}" target="_blank">${esc(o.portal)}</a>${o.mirrors.map(m => ` · <a href="${esc(m.url)}" target="_blank">${esc(m.portal)}</a>`).join('')}</div>` : ''}
```

Analogicznie w `renderCatalog`, w karcie oferty po linii `<div class="meta">...`. Do obu bloków `<style>` (raport i katalog) dodaj:

```css
.mirrors{font-size:.85rem;color:#555;margin-top:.15rem}
.mirrors a{color:#0b57d0;text-decoration:none}
```

- [ ] **Step 5: Test renderu lustrzanek**

Dopisz do `render.test.mjs`:

```js
test('renderCatalog: rządek Na portalach dla lustrzanek', () => {
  const o = { ...OFERTA, mirrors: [{ portal: 'N-O.pl', url: 'https://n-o.pl/y' }] };
  const html = renderCatalog(CATS, { dzialki: [o], domy: [] }, STATS);
  assert.match(html, /Na portalach:/);
  assert.match(html, /https:\/\/n-o\.pl\/y/);
});
```

- [ ] **Step 6: Testy + składnia + przebieg próbny**

Run: `node --test dedup.test.mjs render.test.mjs` — Expected: PASS
Run: `node --check monitor.mjs` — Expected: OK
Run: `node monitor.mjs` — pełny przebieg na żywych danych. Expected w logu: liczby ofert per kategoria WYRAŹNIE niższe niż wczoraj (scalone ~70 grup dubli); brak wyjątków. Otwórz `wszystkie.html` — karty scalone mają „Na portalach: …". Uwaga: przebieg opublikuje raport na Vercelu i zaktualizuje `state.json` — to normalna praca skryptu.

- [ ] **Step 7: Commit**

```bash
git add monitor.mjs render.mjs render.test.mjs
git commit -m "feat: scalanie dubli miedzy portalami - kanoniczna oferta, ciche lustrzanki, statystyki po scaleniu"
```

---

### Task 5: Archiwum zniknięć

**Files:**
- Modify: `monitor.mjs`, `render.mjs`, `.gitignore`, `render.test.mjs`

**Interfaces:**
- Consumes: `detectDisappearances` (Task 2), `failedSources` (Task 4), `median` z `dedup.mjs`.
- Produces: `archive.json` (lista wpisów jak w Task 2, max 500, najnowsze na początku); `renderCatalog(CATS, catalogByCat, statsByCat, archive)` — nowy 4. parametr (domyślnie `[]`); eksport `renderArchive(CATS, archive) → string` (sekcje HTML).

- [ ] **Step 1: Zapis archiwum w przepływie głównym**

W `monitor.mjs` przy stałych plików (po linii `const NO_COOLDOWN_FILE = ...`) dodaj:

```js
const ARCHIVE_FILE = path.join(DIR, 'archive.json');
const TREND_FILE = path.join(DIR, 'trend.json'); // użyty w kolejnym zadaniu
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
```

Do importu z `./dedup.mjs` dodaj `detectDisappearances`.

Przed przycięciem stanu (obecny blok `const entries = Object.entries(state.seen); ...` przy linii 694) wstaw:

```js
// Zniknięcia: nieobecne ≥3 dni, poza awariami portali; żywy dubel = nie znikła.
const archive = readJson(ARCHIVE_FILE, []);
if (!firstRun) {
  const { archived, gone } = detectDisappearances(state.seen, unique, failedSources, Date.now());
  for (const id of gone) delete state.seen[id];
  if (archived.length) {
    archive.unshift(...archived);
    archive.length = Math.min(archive.length, 500);
    log(`Zniknięte oferty: ${archived.length} → archiwum (np. ${archived[0].title}).`);
  }
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 1));
}
```

- [ ] **Step 2: Sekcja archiwum na podstronie „wszystkie"**

W `render.mjs` dodaj import i funkcję:

```js
import { median } from './dedup.mjs';

// Sekcja "zniknięte" katalogu: lista z 30 dni + mediany z całego archiwum.
export function renderArchive(CATS, archive) {
  const cut = Date.now() - 30 * 864e5;
  return Object.entries(CATS).map(([cat, cfg]) => {
    const all = archive.filter(a => a.cat === cat);
    if (!all.length) return '';
    const recent = all.filter(a => new Date(a.disappearedAt).getTime() >= cut);
    const medDays = median(all.map(a => a.daysOnMarket).filter(v => v != null));
    const medPpm = median(all.map(a => a.pricePerM2).filter(v => v > 0));
    return `
  <section>
    <h2>${cfg.icon} ${esc(cfg.label)} — zniknięte w ost. 30 dniach (${recent.length})</h2>
    <div class="stats">z całego archiwum (${all.length}): mediana dni do zniknięcia: <b>${medDays ?? '?'}</b>${medPpm ? ` · mediana końcowej ceny: <b>${medPpm} zł/m²</b>` : ''}</div>
    ${recent.map(a => `
    <div class="offer">
      <a href="${esc(a.url)}" target="_blank">${esc(a.title)}</a>
      <div class="meta">${esc(a.portal)} · ostatnia cena ${esc(zl(a.lastPrice))}${a.areaM2 ? ` · ${a.areaM2} m²` : ''}${a.daysOnMarket != null ? ` · ~${a.daysOnMarket} dni na rynku` : ''} · zniknęła ${esc(String(a.disappearedAt).slice(0, 10))}</div>
    </div>`).join('')}
  </section>`;
  }).join('');
}
```

Zmień sygnaturę `renderCatalog` na `renderCatalog(CATS, catalogByCat, statsByCat, archive = [])` i wstaw `${renderArchive(CATS, archive)}` po `${secs}` w szablonie strony (przed `<footer>`). W `monitor.mjs` przekaż archiwum: `renderCatalog(CATS, catalogByCat, statsByCat, archive)` — `const archive` jest już zadeklarowane przed `if (!firstRun)` w Step 1, więc jest w zasięgu.

- [ ] **Step 3: `.gitignore` + test**

Do `.gitignore` po linii `no-cooldown.json` dopisz:

```
archive.json
trend.json
```

Dopisz do `render.test.mjs`:

```js
import { renderArchive } from './render.mjs'; // dołącz do istniejącego importu

test('renderArchive: mediany i wpis z 30 dni', () => {
  const wczoraj = new Date(Date.now() - 864e5).toISOString();
  const arch = [
    { cat: 'dzialki', title: 'znikła', url: 'u', portal: 'OLX', lastPrice: 200000, areaM2: 1000, pricePerM2: 200, daysOnMarket: 40, disappearedAt: wczoraj },
    { cat: 'dzialki', title: 'stara', url: 'u', portal: 'OLX', lastPrice: 100000, areaM2: 500, pricePerM2: 200, daysOnMarket: 60, disappearedAt: '2020-01-01T00:00:00Z' },
  ];
  const html = renderArchive(CATS, arch);
  assert.match(html, /zniknięte w ost\. 30 dniach \(1\)/);
  assert.match(html, /mediana dni do zniknięcia: <b>50<\/b>/);
  assert.match(html, /znikła/);
  assert.doesNotMatch(html, /🏠 Domy — zniknięte/);
});
```

- [ ] **Step 4: Testy + składnia**

Run: `node --test dedup.test.mjs render.test.mjs` — Expected: PASS
Run: `node --check monitor.mjs` — Expected: OK

- [ ] **Step 5: Commit**

```bash
git add monitor.mjs render.mjs render.test.mjs .gitignore
git commit -m "feat: archiwum zniknietych ofert + sekcja na podstronie wszystkie"
```

---

### Task 6: Trend mediany zł/m² + wykres SVG

**Files:**
- Modify: `monitor.mjs`, `render.mjs`, `render.test.mjs`

**Interfaces:**
- Consumes: `TREND_FILE`, `readJson`, `errors`, `statsByCat` (Task 4/5).
- Produces: `trend.json` — lista `{ date: 'YYYY-MM-DD', cat, medPpm, count }`; eksport `renderTrendChart(cat, points) → string` (`''` gdy < 5 punktów); `renderReport(CATS, history, statsByCat, negoByCat, trend = [])` — nowy 5. parametr.

- [ ] **Step 1: Zapis punktu trendu**

W `monitor.mjs`, zaraz po pętli liczącej `statsByCat` (obecne linie 682-686) wstaw:

```js
// Punkt trendu tylko z pełnych przebiegów — częściowe dane skrzywiłyby medianę.
const trend = readJson(TREND_FILE, []);
if (!errors.length) {
  const today = now.slice(0, 10);
  for (const cat of Object.keys(CATS)) {
    const s = statsByCat[cat];
    if (!s?.medPpm) continue;
    const point = { date: today, cat, medPpm: s.medPpm, count: s.count };
    const i = trend.findIndex(t => t.date === today && t.cat === cat);
    if (i >= 0) trend[i] = point; else trend.push(point);
  }
  if (trend.length > 1500) trend.splice(0, trend.length - 1500);
  fs.writeFileSync(TREND_FILE, JSON.stringify(trend));
}
```

- [ ] **Step 2: Wykres w `render.mjs`**

Dodaj funkcję (specyfikacja wg skilla dataviz — patrz Global Constraints):

```js
// Wykres trendu mediany zł/m²: jedna seria (bez legendy), linia 2px, siatka
// wycofana, etykieta tylko przy ostatnim punkcie, tooltip (cele 9px), tabelka
// danych w <details> jako dostępny fallback.
export function renderTrendChart(cat, points) {
  if (points.length < 5) return '';
  const W = 460, H = 150, P = { l: 46, r: 64, t: 10, b: 22 };
  const vals = points.map(p => p.medPpm);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, Math.round(hi * 0.02) || 1); // płaska seria ≠ dzielenie przez zero
  const x = i => Math.round(P.l + i * (W - P.l - P.r) / (points.length - 1));
  const y = v => Math.round(P.t + (H - P.t - P.b) * (1 - (v - lo) / span));
  const grid = [lo, lo + span / 2, lo + span];
  return `
    <figure class="trend" data-cat="${cat}">
      <figcaption>Mediana zł/m² w czasie (${points.length} dni pomiarów)</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend mediany zł/m²">
        ${grid.map(v => `<line x1="${P.l}" y1="${y(v)}" x2="${W - P.r}" y2="${y(v)}" stroke="#eee"/><text x="${P.l - 6}" y="${y(v) + 3}" text-anchor="end" class="ax">${Math.round(v)}</text>`).join('')}
        <polyline points="${points.map((p, i) => `${x(i)},${y(p.medPpm)}`).join(' ')}" fill="none" stroke="#0b57d0" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="${x(points.length - 1)}" cy="${y(vals.at(-1))}" r="3" fill="#0b57d0"/>
        <text x="${x(points.length - 1) + 8}" y="${y(vals.at(-1)) + 3}" class="last">${vals.at(-1)} zł/m²</text>
        <text x="${P.l}" y="${H - 6}" class="ax">${points[0].date}</text>
        <text x="${W - P.r}" y="${H - 6}" text-anchor="end" class="ax">${points.at(-1).date}</text>
        ${points.map((p, i) => `<circle class="pt" cx="${x(i)}" cy="${y(p.medPpm)}" r="9" fill="transparent" data-tip="${p.date}: ${p.medPpm} zł/m² (ofert: ${p.count})"/>`).join('')}
      </svg>
      <details><summary>dane wykresu</summary><table class="trendtab">${points.map(p => `<tr><td>${p.date}</td><td>${p.medPpm} zł/m²</td><td>${p.count} ofert</td></tr>`).join('')}</table></details>
    </figure>`;
}
```

W `renderReport` zmień sygnaturę na `(CATS, history, statsByCat, negoByCat, trend = [])` i wstaw wykres po bloku `.stats` każdej kolumny (po `</div>` zamykającym `${s ? ... : ...}`):

```js
    ${renderTrendChart(cat, trend.filter(t => t.cat === cat))}
```

Do `<style>` raportu dodaj:

```css
.trend{margin:.8rem 0 0} .trend figcaption{font-size:.85rem;color:#555;margin-bottom:.2rem}
.trend svg{width:100%;height:auto} .trend .ax{font-size:10px;fill:#777} .trend .last{font-size:11px;font-weight:600;fill:#222}
.trend details{margin-top:.2rem} .trendtab td{padding:.1rem .6rem .1rem 0;font-size:.8rem;color:#555}
#tip{position:absolute;background:#222;color:#fff;padding:.2rem .5rem;border-radius:5px;font-size:.78rem;pointer-events:none;white-space:nowrap}
```

Przed `</body>` raportu dodaj tooltip (dane w `data-tip` to wyłącznie daty i liczby generowane przez skrypt — bez treści z portali, więc bez ryzyka wstrzyknięcia):

```html
<div id="tip" hidden></div>
<script>
document.addEventListener('mouseover', function (e) {
  const tip = document.getElementById('tip');
  if (e.target.classList && e.target.classList.contains('pt')) {
    tip.textContent = e.target.dataset.tip;
    const r = e.target.getBoundingClientRect();
    tip.style.left = (r.left + window.scrollX + 12) + 'px';
    tip.style.top = (r.top + window.scrollY - 26) + 'px';
    tip.hidden = false;
  } else if (!tip.hidden) tip.hidden = true;
});
</script>
```

W `monitor.mjs` przekaż trend do renderu: `renderReport(CATS, history, statsByCat, negoByCat, trend)`.

- [ ] **Step 3: Testy wykresu**

Dopisz do `render.test.mjs` (i `renderTrendChart` do importu):

```js
test('renderTrendChart: pusty <5 punktów, polyline i etykieta ostatniej wartości ≥5', () => {
  const pt = (i, v) => ({ date: `2026-07-0${i}`, cat: 'dzialki', medPpm: v, count: 10 + i });
  assert.equal(renderTrendChart('dzialki', [1, 2, 3, 4].map(i => pt(i, 200))), '');
  const svg = renderTrendChart('dzialki', [pt(1, 180), pt(2, 190), pt(3, 200), pt(4, 195), pt(5, 210)]);
  assert.match(svg, /<polyline points="/);
  assert.match(svg, /210 zł\/m²/);          // etykieta tylko ostatniego punktu
  assert.match(svg, /2026-07-01/);
  assert.match(svg, /data-tip="2026-07-03: 200 zł\/m² \(ofert: 13\)"/);
  assert.match(svg, /<table class="trendtab">/);
});

test('renderTrendChart: płaska seria nie dzieli przez zero', () => {
  const pts = [1, 2, 3, 4, 5].map(i => ({ date: `2026-07-0${i}`, cat: 'domy', medPpm: 5000, count: 8 }));
  assert.doesNotMatch(renderTrendChart('domy', pts), /NaN/);
});
```

- [ ] **Step 4: Testy + składnia**

Run: `node --test dedup.test.mjs render.test.mjs` — Expected: PASS
Run: `node --check monitor.mjs` — Expected: OK

- [ ] **Step 5: Commit**

```bash
git add monitor.mjs render.mjs render.test.mjs
git commit -m "feat: trend.json + wykres SVG mediany zl/m2 na stronie glownej"
```

---

### Task 7: Filtry client-side na podstronie „wszystkie"

**Files:**
- Modify: `render.mjs`, `render.test.mjs`

**Interfaces:**
- Consumes: karty katalogu z `data-price`/`data-area` (istnieją) — dojdą `data-title`, `data-loc`.
- Produces: pasek filtrów nad sekcjami katalogu; licznik widocznych `<span class="viscount">` w nagłówku sekcji; sekcje archiwum NIE podlegają filtrom (filtr działa tylko wewnątrz `[id^="list-"]`).

- [ ] **Step 1: Atrybuty i licznik w kartach katalogu**

W `renderCatalog`:
- nagłówek sekcji `<h2>${cfg.icon} ${esc(cfg.label)} (${items.length})</h2>` zamień na `<h2>${cfg.icon} ${esc(cfg.label)} (<span class="viscount">${items.length}</span>)</h2>`,
- w karcie oferty do `<div class="offer" data-ppm=...>` dopisz `data-title="${esc(o.title.toLowerCase())}" data-loc="${esc(((o.place ?? '') + ' ' + o.title).toLowerCase())}"` (dzielnica często jest tylko w tytule, stąd `data-loc` łączy oba pola).

- [ ] **Step 2: Pasek filtrów + JS**

W `render.mjs` dodaj stałą (znane dzielnice/sołectwa Żor):

```js
const DISTRICTS = ['Baranowice', 'Kleszczów', 'Kleszczówka', 'Osiny', 'Rogoźna', 'Rowień', 'Folwarki', 'Rój', 'Śródmieście'];
```

W szablonie `renderCatalog`, bezpośrednio po `<div class="updated">...</div>`, wstaw:

```html
<div class="filters">
  <input id="f-q" type="search" placeholder="szukaj w tytule…">
  <span>cena <input id="f-pmin" type="number" placeholder="od"> – <input id="f-pmax" type="number" placeholder="do"> zł</span>
  <span>metraż <input id="f-amin" type="number" placeholder="od"> – <input id="f-amax" type="number" placeholder="do"> m²</span>
  <select id="f-d"><option value="">dzielnica: wszystkie</option>${DISTRICTS.map(d => `<option value="${d.toLowerCase()}">${d}</option>`).join('')}</select>
  <button id="f-x">wyczyść</button>
</div>
```

Do bloku `<script>` katalogu (obok istniejącej funkcji `srt`) dopisz:

```js
const F = ['f-q', 'f-pmin', 'f-pmax', 'f-amin', 'f-amax', 'f-d'].map(function (id) { return document.getElementById(id); });
function applyFilters() {
  const q = F[0].value.trim().toLowerCase(), pmin = +F[1].value, pmax = +F[2].value,
        amin = +F[3].value, amax = +F[4].value, d = F[5].value;
  document.querySelectorAll('[id^="list-"] .offer').forEach(function (el) {
    const price = parseFloat(el.dataset.price), area = parseFloat(el.dataset.area);
    const ok = (!q || (el.dataset.title || '').includes(q))
      && (!pmin || price >= pmin) && (!pmax || price <= pmax)
      && (!amin || area >= amin) && (!amax || area <= amax)
      && (!d || (el.dataset.loc || '').includes(d));
    el.style.display = ok ? '' : 'none';
  });
  document.querySelectorAll('[id^="list-"]').forEach(function (box) {
    const n = Array.prototype.filter.call(box.querySelectorAll('.offer'), function (e) { return e.style.display !== 'none'; }).length;
    const c = box.closest('section').querySelector('.viscount');
    if (c) c.textContent = n;
  });
}
F.forEach(function (el) { el.addEventListener('input', applyFilters); });
document.getElementById('f-x').addEventListener('click', function () { F.forEach(function (el) { el.value = ''; }); applyFilters(); });
```

(Świadomy kompromis: oferta bez ceny/metrażu znika przy aktywnym filtrze liczbowym — `NaN` nie przechodzi porównania; to pożądane przy filtrowaniu po wartości.)

Do `<style>` katalogu:

```css
.filters{display:flex;flex-wrap:wrap;gap:.5rem .9rem;align-items:center;background:#f3f6f9;border-radius:8px;padding:.55rem .8rem;font-size:.85rem;color:#555;margin-bottom:.6rem}
.filters input,.filters select{padding:.25rem .45rem;border:1px solid #ccc;border-radius:6px;font-size:.85rem}
.filters input[type=number]{width:5.4rem} .filters input[type=search]{width:11rem}
.filters button{padding:.25rem .7rem;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer}
```

- [ ] **Step 3: Test atrybutów i paska**

Dopisz do `render.test.mjs`:

```js
test('renderCatalog: pasek filtrów i atrybuty data-title/data-loc', () => {
  const html = renderCatalog(CATS, { dzialki: [OFERTA], domy: [] }, STATS);
  assert.match(html, /id="f-q"/);
  assert.match(html, /value="rogoźna"/);
  assert.match(html, /data-title="działka rogoźna &lt;test&gt;"/);
  assert.match(html, /data-loc="żory – rogoźna działka rogoźna &lt;test&gt;"/);
  assert.match(html, /class="viscount"/);
});
```

- [ ] **Step 4: Testy + oględziny w przeglądarce**

Run: `node --test dedup.test.mjs render.test.mjs` — Expected: PASS
Run: `node monitor.mjs` i otwórz `wszystkie.html` w przeglądarce: wpisz dzielnicę/cenę i sprawdź, że karty znikają, licznik w nagłówku się zmienia, sekcja „zniknięte" nie jest filtrowana, „wyczyść" przywraca wszystko.

- [ ] **Step 5: Commit**

```bash
git add render.mjs render.test.mjs
git commit -m "feat: filtry ceny/metrazu/tytulu/dzielnicy na podstronie wszystkie"
```

---

### Task 8: Dokumentacja i weryfikacja końcowa

**Files:**
- Modify: `README.md`, `monitor.mjs` (nagłówek-komentarz)

- [ ] **Step 1: Zaktualizuj opisy**

W nagłówku `monitor.mjs` (linie 1-3) dopisz do opisu deduplikację, np.:

```js
// Monitoring nowych ogłoszeń sprzedaży DZIAŁEK i DOMÓW w Żorach (OLX + Otodom + N-O.pl).
// Duble między portalami scalane (cena + metraż ±3%); uruchamiany przez Harmonogram
// zadań Windows. Bez zależności npm (Node 20+). Testy: node --test.
```

W `README.md` dopisz sekcję (po opisie raportu):

```markdown
## Deduplikacja i dodatki

- Ta sama nieruchomość na kilku portalach jest scalana w jedną kartę
  („Na portalach: OLX · Otodom · N-O.pl"); reguła: identyczna cena + metraż ±3%.
  Dubel znanej oferty nie wysyła powiadomienia.
- `archive.json` — oferty zniknięte ≥3 dni (sekcja „zniknięte" + mediana dni do zniknięcia).
- `trend.json` — dzienna mediana zł/m² (wykres na stronie głównej, od 5 dni pomiarów).
- Podstrona „wszystkie": filtry ceny, metrażu, tytułu i dzielnicy.
- Testy: `node --test` (logika dubli/zniknięć i render).
```

- [ ] **Step 2: Weryfikacja końcowa**

Run: `node --test` (odpali oba pliki testów) — Expected: wszystkie PASS.
Run: `node monitor.mjs` — Expected: przebieg bez błędów; w logu liczby po scaleniu; `report.html` z wykresem-placeholderem (pojawi się po 5 dniach pomiarów — na razie brak `<figure class="trend">` to poprawne zachowanie), `wszystkie.html` z filtrami i (jeśli już są) sekcją zniknięć; deploy na Vercelu w logu.

- [ ] **Step 3: Commit**

```bash
git add README.md monitor.mjs
git commit -m "docs: opis deduplikacji, archiwum, trendu i filtrow"
```
