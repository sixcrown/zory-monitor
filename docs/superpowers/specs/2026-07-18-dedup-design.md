# Deduplikacja ofert + ulepszenia raportu — projekt

Data: 2026-07-18 · Status: zatwierdzony przez użytkownika (rozmowa) · Dotyczy: `monitor.mjs`, strona na Vercelu

## Problem

Ta sama nieruchomość wisi równolegle na OLX, Otodom i N-O.pl (agencje publikują wszędzie).
Pomiar na żywych danych (2026-07-18): na 381 aktywnych ofert 73 grupy mają identyczną cenę
na >1 portalu — lista i statystyki są zaśmiecone lustrzankami, a powiadomienia pingują
o „nowych" ofertach, które są znane z innego portalu.

## Zakres

1. Scalanie dubli między portalami (rdzeń).
2. Śledzenie zniknięć ofert (sekcja „sprzedane/wycofane").
3. Wykres trendu mediany zł/m².
4. Filtry client-side na podstronie „wszystkie".

Poza zakresem: mapka ofert (odrzucona przy wyborze), zmiany w deployu na Vercela,
scoring wielosygnałowy i dopasowywanie przez LLM (odrzucone — wybrano wariant
deterministyczny).

## 1. Scalanie dubli

**Reguła dopasowania** (v3 — po obserwacjach: agencje różnicują cenę między portalami
o 0,1–5%, a ta sama nieruchomość bywa wystawiona kilka razy na jednym portalu przez
różne agencje): dwie oferty to dubel, gdy
- ta sama kategoria (`cat`), oraz
- cena i metraż w tolerancji `|a − b| / max(a, b)`:
  - **różne portale**: cena ≤ 5%, metraż ≤ 3% (portale różnie zaokrąglają),
  - **ten sam portal**: cena ≤ 1% i metraż ≤ 1% (ostrzej — luźniejszy próg skleiłby
    bliźniacze domy z osiedla deweloperskiego), oraz
- **brak konfliktu dzielnic**: jeśli obie oferty (pole lokalizacji + tytuł) deklarują
  znane dzielnice Żor i żadna się nie pokrywa ⇒ nie scalamy (przypadek z danych:
  działka „Rój" 279 000 zł/989 m² vs działka „Kleszczów" 285 000 zł/1000 m²).

Świadomy kompromis: dwa identycznie wycenione bliźniaki deweloperskie o tym samym
metrażu skleją się w jedną kartę — akceptowalne, bo karta linkuje do WSZYSTKICH
ogłoszeń grupy (nic nie ginie, zaniżony jest tylko licznik).

Brak metrażu po którejkolwiek stronie ⇒ **nie** scalamy (wolimy zostawić dubel niż skleić
dwie różne działki). Przykład kontrolny z danych: dwie działki po 149 000 zł, 885 vs 921 m²
(Δ 4%) — pozostają osobno; działka 1804 m² za 415 000 zł na Otodom + N-O.pl — scala się.

**Grupowanie**: przechodzimy oferty posortowane wg priorytetu portalu
**OLX > Otodom > N-O.pl**; oferta dołącza do istniejącej grupy, jeśli pasuje do jej oferty
kanonicznej. Kanoniczna jest pierwsza wg priorytetu (OLX/Otodom mają daty publikacji
i naturalne tytuły; N-O.pl generuje tytuły automatycznie). Kanoniczna dostaje pole
`mirrors: [{portal, url, id}]`.

**Miejsce w przepływie**: zaraz po zbudowaniu `unique` (dziś `monitor.mjs:616`), przed
wyznaczeniem `fresh`, statystyk, katalogu i powiadomień. Wszystkie dalsze obliczenia
(mediana zł/m², liczniki, sekcja negocjacyjna, katalog) pracują na liście po scaleniu.

**Powiadomienia**: świeża oferta, która jest dublem oferty już obecnej w `state.seen`
(po tej samej regule dopasowania względem żywych ofert znanych wcześniej), nie trafia do
`news` — nie generuje pusha ani toasta, po prostu pojawi się jako dodatkowy link przy
kanonicznej.

**Obniżki**: historia cen dalej śledzona per ogłoszenie-portal w `state.seen` (agencje
potrafią obniżyć najpierw na jednym portalu). Wykryte obniżki deduplikujemy per grupa:
jedno powiadomienie, z najniższą aktualną ceną w grupie.

**Stan**: `state.json` bez zmian strukturalnych — grupowanie liczone na żywo w każdym
przebiegu. Zero migracji, łatwy rollback.

**UI**: karta oferty pokazuje rządek „Na portalach: OLX · Otodom · N-O.pl" (linki do
wszystkich ogłoszeń grupy).

## 2. Śledzenie zniknięć

- Nowy plik `archive.json` (gitignorowany, jak pozostałe dane runtime).
- Oferta z `state.seen`, której nie ma w bieżącym przebiegu, dostaje status kandydata;
  po **3 dniach** nieprzerwanej nieobecności przenosimy ją do archiwum z polami:
  tytuł, url, portal, kategoria, cena końcowa, dni na rynku (od `created` ?? `firstSeen`),
  data zniknięcia.
- Bezpieczniki:
  - jeśli portal w danym przebiegu zawiódł (jest w `errors`), jego ofert **nie** liczymy
    jako nieobecnych (czkawka portalu ≠ sprzedaż);
  - nieruchomość z grupy dubli jest „zniknięta" dopiero, gdy znikną **wszystkie**
    ogłoszenia grupy.
- UI: na podstronie „wszystkie" sekcja „Zniknięte w ostatnich 30 dniach" + dwie liczby
  zbiorcze: mediana dni do zniknięcia i mediana końcowej ceny zł/m² (liczone z całego
  archiwum, per kategoria).
- Archiwum przycinane do 500 wpisów (najstarsze wypadają).

## 3. Wykres trendu cen

- Nowy plik `trend.json` (gitignorowany): po przebiegu, w którym **wszystkie 3 portale
  odpowiedziały** (`errors.length === 0` — częściowe dane skrzywiłyby medianę), dopisujemy
  `{date: 'YYYY-MM-DD', cat, medianPricePerM2, count}`; max jeden punkt na dzień i kategorię
  (kolejny przebieg tego samego dnia nadpisuje punkt).
- Render: prosty wykres liniowy jako inline SVG generowany w skrypcie (bez bibliotek,
  bez CDN), na stronie głównej, po jednym na kategorię, widoczny gdy ≥ 5 punktów.
- Przy implementacji wykresu przeczytać skill `dataviz` (wymóg harnessu dla wszelkich
  wykresów).

## 4. Filtry na podstronie „wszystkie"

- Czysty JS w wygenerowanym HTML (jak istniejące sortowanie `srt()`).
- Pola: cena od–do, metraż od–do, tekstowa szukajka po tytule, select dzielnicy
  (dzielnice zebrane z pola `place` ofert).
- Karty dostają dodatkowe atrybuty `data-title`, `data-place`; filtr chowa niepasujące
  (`display:none`) i aktualizuje licznik widocznych przy nagłówku sekcji.

## Zmiany techniczne towarzyszące

- Wydzielenie renderowania HTML z `monitor.mjs` do `render.mjs` (czysta przeprowadzka
  funkcji `renderReport`/`renderCatalog` i pomocników; bez zmian logiki) — plik główny
  wróci poniżej ~600 linii zamiast urosnąć ponad 1000.
- Grupowanie dubli i logika zniknięć jako czyste funkcje (wejście: listy ofert/stan,
  wyjście: grupy/archiwum) w `dedup.mjs` + testy `node --test` (`dedup.test.mjs`) —
  pierwsze testy w repo, celowo tylko dla logiki, gdzie pomyłka realnie boli.
- `.gitignore`: dopisać `archive.json`, `trend.json`.
- Deploy na Vercela i mechanizm powiadomień (ntfy/toast) bez zmian architektonicznych.

## Obsługa błędów

- Awaria pojedynczego portalu: jak dziś (log + częściowe dane), dodatkowo wyłącza
  wykrywanie zniknięć dla tego portalu i zapis punktu trendu w tym przebiegu.
- Uszkodzony/nieistniejący `archive.json` lub `trend.json`: traktowane jak puste
  (wzorzec identyczny z obecnym odczytem `no-cooldown.json`).

## Kryteria sukcesu

- Lustrzanki z pomiaru (np. działka 1804 m²/415 000 zł) występują na stronie raz,
  z linkami do obu portali; liczniki ofert i mediany liczone po scaleniu.
- Dubel znanej oferty pojawiający się na kolejnym portalu nie wysyła pusha.
- Zniknięcia pojawiają się w sekcji dopiero po 3 dniach i nie są wyzwalane awarią portalu.
- Testy `node --test` przechodzą; przypadek 885 vs 921 m² pozostaje niescalony.
