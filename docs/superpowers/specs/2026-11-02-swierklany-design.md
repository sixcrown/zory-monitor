# Świerklany w regionie Rybnik (zjazd z A1)

Data: 2026-11-02. Prośba: „dodajmy jeszcze Świerklany Górne".

## Ustalenia z portali

- **Świerklany Górne nie istnieją już jako miejscowość w portalach.** Otodom i OLX znają jedną
  wieś „Świerklany" (gmina Świerklany: Świerklany + Jankowice). N-O.pl: strona `swierklany.…/szukaj.html?3,dzialka,sprzedaz,,Świerklany`
  ma listę (19 działek), strona „Świerklany Górne" jest pusta. Podział Górne/Dolne zniknął
  po połączeniu wsi (2024); sprzedający nadal piszą „w Świerklanach Górnych" w opisach.
- **Otodom**: slug wsi `slaskie/rybnicki/swierklany/swierklany` (11 działek, tylko Świerklany);
  slug gminy `slaskie/rybnicki/swierklany` doklejałby Jankowice. Wieś wchodzi do istniejącego
  zapytania „wiele lokalizacji" razem z dzielnicami Rybnika (37 → ~48 działek, 2 strony;
  limit stron podniesiony do 3).
- **OLX**: miasto `swierklany` istnieje (7 domów); działki dały 403 CloudFront (blokada, nie 404).
- **N-O.pl**: lista bez id miejscowości działa; `locqtn` puste (brak dzielnic), lokalizacja
  w `addressLocality` = „Świerklany". **Lista jest dopełniana**: strona ma zawsze 41 pozycji —
  najpierw żywe oferty z miejscowości (tyle, ile mówi „Zobacz N ogłoszeń" w opisie JSON-LD:
  19 działek, 11 domów), potem „oferty z okolicy" (Jankowice, Marklowice, Połomia), a resztę
  i kolejne strony wypełniają **archiwalne** oferty z tą samą miejscowością (dla domów już na
  stronie 1: 31 pozycji „Świerklany" przy 11 żywych). To samo dotyczy Rybnika (144 żywych
  działek = 3,5 strony, a pobieraliśmy 6) i Żor (72 działki, pobieraliśmy 4 strony).

## Decyzje

1. **Świerklany dołączają do regionu „Rybnik"** jako dodatkowe źródła kategorii `dzialki_rybnik`
   i `domy_rybnik` (wspólne mediany, trend, sekcje). Osobny region dla kilkunastu ofert dałby
   bezsensowne mediany i kolejne kolumny do przewijania. Etykieta regionu:
   „Rybnik — wschód (zjazd z A1) i Świerklany"; `short` zostaje „Rybnik".
2. **Źródło portalu może być listą.** `olx: [rybnik, swierklany]`, `no: [{url, pages, locality}, …]`
   (helpery `olxUrls`/`noSources` w `sources.mjs`). Wyniki części są sklejane; awaria dowolnej
   części = awaria źródła `portal|cat` (ochrona zniknięć i trendu bez zmian, konserwatywnie).
3. **Filtr obszaru**: klucz `świerklany` w `RYBNIK_AREA`, ale liczony tylko z `place`+`title`
   (listy Świerklan zawsze mają nazwę w `place`; opis oferty z Rybnika bywa „10 min do Świerklan").
   Oferty wprost opisane jako **Świerklany Dolne** (klucz `świerklany-dolne` z place/title/desc)
   są odrzucane — użytkownik prosił o Górne, a Dolne leżą 3 km dalej od A1. Oferty bez
   doprecyzowania zostają (większość, bo portale nie rozróżniają).
4. **Cichy baseline po zmianie źródeł.** Dotąd baseline obejmował tylko nową kategorię i zalew
   >25 ofert z jednego źródła; Świerklany dodają ~7–19 ofert na źródło, czyli poniżej progu —
   bez zabezpieczenia poszłoby ~40 fałszywych „nowych". Rozwiązanie: `state.sources[portal|cat]`
   trzyma odcisk konfiguracji źródła (`sourceHash` — sha1 z URL-i, stron i regexów). Gdy odcisk
   się różni (albo go nie ma), nieznane oferty tego źródła w tym przebiegu są baseline'em bez
   powiadomień. Odcisk zapisuje się dopiero po **udanym** pobraniu, więc OLX z 403 zostaje
   w trybie baseline aż odpowie — bez wpływu na pozostałe portale.
   Żeby Żory nie dostały jednorazowego cichego przebiegu, `state.json` jest zasilony bieżącymi
   odciskami źródeł Żor (ich konfiguracja się nie zmienia).

5. **Limit N-O.pl do deklarowanej liczby ofert.** `getNO` czyta ze strony 1 „Zobacz N ogłoszeń"
   i bierze najwyżej N ofert pasujących do miejscowości, przerywając paginację po osiągnięciu N.
   Żywe oferty idą na liście pierwsze, więc odcięcie trafia dokładnie w okolicę i archiwalia.
   Dotyczy wszystkich list N-O.pl — Żory i Rybnik przestają zasysać archiwalia z końcowych stron
   (te, które już są w stanie, znikną normalną ścieżką do `archive.json` po 3 dniach).
   Brak frazy w opisie = brak limitu (zachowanie jak dotąd).
   Weryfikacja na domach w Żorach: deklarowane 62, pozycja 62 to żywa oferta, 63 i dalej mają
   na stronie „Ogłoszenie archiwalne". Stan niósł 132 rekordy N-O.pl domów Żory, z czego 70
   archiwalnych — usunięte jednorazowo ze `state.json` (bez wpisów w archiwum, bo nigdy nie były
   żywe w czasie obserwacji), kopia w scratchpadzie sesji.

## Poza zakresem

- Jankowice (druga wieś gminy) — nie przy A1, nie w prośbie.
- Rozróżnianie Górne/Dolne po współrzędnych — portale nie dają geolokalizacji na listach.

## Testy

- `dedup`: `detectDistricts` dla Świerklan z odmianą, „Dolne" osobno, Świerklaniec nie łapie.
- `areas`: `inRybnikArea` — z place/title tak, z opisu nie, Dolne odrzucone, Jankowice nie;
  `RYBNIK_OTODOM_LOCATIONS` = slugi Rybnika + wieś Świerklany.
- `sources`: normalizacja pojedynczego źródła i listy; `sourceHash` stabilny i czuły na zmiany.
- `render`: nowa etykieta regionu, opcja „Świerklany" w filtrze dzielnic.
- Dry-run: log „Zmiana źródeł …/Działki Rybnik" i „…/Domy Rybnik" bez wpisów dla Żor.
