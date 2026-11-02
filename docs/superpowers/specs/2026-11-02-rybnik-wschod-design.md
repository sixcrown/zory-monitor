# Rozszerzenie monitora o wschodnie dzielnice Rybnika (zjazd z A1) — projekt

Data: 2026-11-02 · Status: wdrożony bez osobnej akceptacji (przebieg autonomiczny; decyzje
oznaczone „założenie" do potwierdzenia) · Dotyczy: `monitor.mjs`, `dedup.mjs`, `render.mjs`,
nowy `areas.mjs`, nowy `parse.mjs`, strona na Vercelu.

## Cel

Oprócz Żor monitorować działki i domy w tej części Rybnika, która leży od strony A1
(węzeł Rybnik na DW935): **Rybnik-Północ, Boguszowice (Stare i Osiedle), Gotartowice,
Ligota-Ligocka Kuźnia** — wg prośby użytkownika — oraz **Kłokocin** (założenie: leży między
Boguszowicami a Żorami, dosłownie „z tej strony od A1"; usunięcie = jedna linijka w `areas.mjs`).
Raszowiec (osiedle w Boguszowicach Starych, osobna „dzielnica" na Otodomie) traktujemy jako
część Boguszowic.

## Ustalenia z portali (pomiar 2026-11-02)

- **Otodom**: dzielnice Rybnika mają slugi `slaskie/rybnik/rybnik/rybnik/<slug>`:
  `rybnik--polnoc`, `boguszowice-stare`, `boguszowice--osiedle`, `gotartowice`, `ligota`,
  `ligocka-kuznia`, `klokocin`, `raszowiec` (podwójny myślnik tam, gdzie w nazwie jest myślnik).
  Adres wielu lokalizacji naraz: `/pl/wyniki/sprzedaz/<dom|dzialka>/wiele-lokalizacji?locations=[id,id,…]`
  działa (36 wyników/stronę, `pagination.totalPages`). **Niepoprawny slug = HTTP 404 całego zapytania;
  strona > `totalPages` = lista ogólnopolska** — paginować tylko do `totalPages`.
  Zapytanie wielodzielnicowe zwraca też pojedyncze oferty z sąsiednich dzielnic (Śródmieście, Meksyk)
  — odfiltrowujemy po dzielnicy z `location.reverseGeocoding`.
  Pole `locationLabel` zniknęło z listy (dziś `place` dla Otodomu zawsze = „Żory") — dzielnicę
  i miasto bierzemy z `reverseGeocoding.locations` (poziomy `city_or_village` i `district`).
- **N-O.pl**: wyszukiwarka miasta `rybnik.nieruchomosci-online.pl/szukaj.html?3,<dzialka|dom>,sprzedaz,,Rybnik`
  (bez ID; 41 ofert/stronę, działki 4 strony, domy 3; po wyczerpaniu Rybnika dokleja okolicę —
  filtr `addressLocality`). JSON-LD nie podaje dzielnicy, ale strona ma per-ogłoszenie blok
  śledzący `"a<ID>":{…,"rlocqtn":"<dzielnica>",…}` — na liście miasta jest to dzielnica ogłoszenia
  (29/144 działek bez dzielnicy). Strony dzielnicowe (`…,Rybnik,Boguszowice Stare`) odrzucone:
  pokazują 6 aktywnych + 35 **archiwalnych** ogłoszeń, a zła nazwa dzielnicy cicho zwraca całą okolicę.
- **OLX**: lista Rybnika nie ma dzielnic w danych (`districtId: 0`), więc zostaje filtr tekstowy
  (tytuł + opis). CloudFront zwraca 403 losowo — w logu od 2026-10-09 OLX/Żory pada w każdym
  przebiegu; w sondach raz działało, raz nie. Źródło traktujemy jako „best effort" (jak dotąd).

## Projekt

### 1. Konfiguracja obszarów — `areas.mjs` (czyste dane + predykat)

- `REGIONS = { zory: {label:'Żory', short:'Żory'}, rybnik: {label:'Rybnik — wschód (zjazd z A1)', short:'Rybnik'} }`.
- `RYBNIK_AREA = new Set(['północ','boguszowice','gotartowice','ligota','kłokocin'])` — klucze
  dzielnic w nomenklaturze `detectDistricts` z `dedup.mjs`.
- `RYBNIK_OTODOM_SLUGS` — lista slugów j.w.; z niej budowany jest URL `wiele-lokalizacji`.
- `inRybnikArea(offer)` — `detectDistricts(place + title + district + desc)` ma część wspólną
  z `RYBNIK_AREA`. Jeden mechanizm dla wszystkich portali (Otodom: dzielnica siedzi w `place`,
  N-O.pl: w `place` z bloku śledzącego, OLX: tylko tytuł/opis).
- `DISTRICT_OPTIONS` — lista `{region, key, label}` do selecta filtrów katalogu (Żory: dotychczasowe
  9; Rybnik: Boguszowice, Gotartowice, Ligota-Ligocka Kuźnia, Kłokocin, Rybnik-Północ).

### 2. Rozpoznawanie dzielnic — `dedup.mjs`

`DISTRICT_PATTERNS` dostaje wpisy Rybnika: `boguszowice` (/boguszowic|raszow/), `gotartowice`,
`ligota` (/\bligot|ligock/), `kłokocin`, `północ` (tylko /rybnik[\s–-]*północ|dzielnic\w*\s+północ/ —
samo „północ" to kierunek świata, nie dzielnica). Konflikt dzielnic działa jak dotąd (część wspólna).

### 3. Kategorie — `monitor.mjs`

`CATS` rośnie z 2 do 4 wpisów: `dzialki`, `domy` (region `zory`, bez zmian) oraz `dzialki_rybnik`,
`domy_rybnik` (region `rybnik`). Pytania do sprzedającego współdzielone per typ (`QUESTIONS`).
Każda kategoria: `region`, `type`, `label`, `name` (do logów: „Działki Rybnik"), URL-e portali,
opcjonalnie `keep` (predykat), `otodomPages`, `noPages`, `noLocality`.
Klucz kategorii trafia do `state.seen`, `history.json`, `archive.json`, `trend.json` — zmiana
addytywna, stare wpisy bez zmian. `isDuplicate` wymaga tej samej `cat` ⇒ Żory i Rybnik nigdy
się nie scalają.

### 4. Pobieranie

- `getOtodom(cat, url, maxPages)` — `place` z `reverseGeocoding` („Rybnik – Gotartowice"),
  paginacja do `min(maxPages, totalPages)`.
- `getNO(cat, url, {pages, locality})` — blok śledzący parsowany przez `parseNoDistricts(html)`
  z `parse.mjs` (czysta funkcja, testowana na fixture) ⇒ `place` = „Rybnik – Boguszowice Stare, ul. X".
  Przy okazji oferty z Żor dostają dzielnicę w `place` (lepsza detekcja konfliktów).
- `getOlx` bez zmian.
- Filtr `cfg.keep` stosowany centralnie po pobraniu każdego źródła, przed deduplikacją.

### 5. Przepływ

- **Baseline nowej kategorii**: kategoria, która nie ma ani jednego rekordu w `state.seen`, przy
  pierwszym pojawieniu się jest zapamiętywana po cichu (jak bezpiecznik przeciwzalewowy), żeby nie
  wysłać kilkudziesięciu „nowych" ofert z Rybnika.
- **Trend per kategoria**: punkt dzienny zapisywany dla kategorii, której żadne źródło nie zawiodło
  w tym przebiegu (dotąd: tylko gdy wszystkie źródła wszystkich kategorii odpowiedziały — przez 403
  z OLX trend nie zapisał się od 2026-09-18). Zasada „bez częściowych danych" zostaje, tylko w granicy
  kategorii.
- **Powiadomienia**: tytuł grupowany po regionie („Żory: 1 × działka · Rybnik: 2 × dom"), każda
  linijka z krótką nazwą regionu. Temat ntfy bez zmian.

### 6. Raport i katalog — `render.mjs`

- Strona główna: sekcja per region (`<h2 class="region">`) z dotychczasową siatką Działki | Domy;
  tytuł „Nieruchomości Żory + Rybnik (wschód) — monitor". Wykres trendu dla kategorii Rybnika pojawi
  się po 5 dniach pomiarów.
- Katalog „wszystkie": nagłówek sekcji „🌱 Działki — Rybnik (wschód)…", filtr dzielnic jako
  `<optgroup>` per region; dopasowanie po `data-dz` (klucze z `detectDistricts`, łapie odmianę),
  nie po surowym tekście.
- Archiwum: nagłówki z regionem.

### 7. Testy (`node --test`)

- `dedup.test.mjs`: nowe dzielnice (odmiana, Raszowiec→boguszowice, „od północy" ≠ Północ).
- `areas.test.mjs`: `inRybnikArea` dla Otodom/N-O.pl/OLX-owych kształtów ofert.
- `parse.test.mjs`: `parseNoDistricts` na fixture bloku śledzącego, `otodomPlace` na fixture `location`.
- `render.test.mjs`: grupowanie po regionach, `optgroup`, `data-dz`.

## Poza zakresem

Obejście 403 z OLX (CloudFront), paginacja Otodomu dla Żor (zmieniłaby zachowanie powiadomień),
mapa ofert, osobne tematy ntfy per region.
