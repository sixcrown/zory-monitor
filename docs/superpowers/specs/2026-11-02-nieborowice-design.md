# Nieborowice jako osobny region

Data: 2026-11-02. Prośba: „dodaj jeszcze Nieborowice", doprecyzowana: „nie do końca jest to przy A1,
jako osobną zakładkę".

## Ustalenia z portali

- Nieborowice to wieś w gminie Pilchowice (powiat gliwicki), przy węźle A1 „Knurów" (DW921) —
  z dala od Żor i wschodniego Rybnika.
- **Otodom**: slug wsi `slaskie/gliwicki/pilchowice/nieborowice` (9 działek, 8 domów, tylko
  Nieborowice — bez sąsiednich wsi).
- **N-O.pl**: `nieborowice.nieruchomosci-online.pl/szukaj.html?3,dzialka,sprzedaz,,Nieborowice`
  deklaruje 9 działek i 6 domów; strona dopełniona okolicą (Knurów, Żernica, Wilcza, Pilchowice)
  i archiwaliami z Nieborowic (22 pozycje „Nieborowice" przy 9 żywych) — limit do deklarowanej
  liczby (spec Świerklan) odcina to bez zmian w parserze.
- **OLX**: miasto `nieborowice` istnieje (3 domy; działki 403 CloudFront).

## Decyzje

1. **Osobny region `nieborowice`** z kategoriami `dzialki_nieborowice` i `domy_nieborowice`:
   własna sekcja raportu z dwiema kolumnami, własne mediany i trend, własny wpis w pasku
   nawigacji i w tytule powiadomień („Nieborowice: 1 × działka"). Region Rybnika wraca do nazwy
   „Rybnik — wschód (zjazd z A1) i Świerklany" (pierwsza wersja wpinała Nieborowice do Rybnika
   pod etykietą „Przy A1" — odrzucona przez użytkownika).
2. **Bez filtra obszaru** — listy portali są już zawężone do wsi (Otodom slug wsi, OLX miasto,
   N-O.pl lokalizacja + limit deklarowanej liczby). Klucz `nieborowice` w `DISTRICT_PATTERNS`
   zostaje do rozpoznawania dzielnic w tytułach (`data-dz`, konflikt dzielnic przy dublach).
3. **Bez grupy w filtrze dzielnic** katalogu — wieś nie ma dzielnic; `DISTRICT_OPTIONS` bez wpisu,
   katalog nie renderuje pustego `<optgroup>`.
4. **Cichy start**: nowa kategoria bez wpisów w `state.json` → istniejąca logika „Nowa kategoria …:
   baseline" zapamiętuje oferty bez powiadomień.
5. Helpery `OTODOM_URL(estate, ścieżka)` i `NO_URL(kind, subdomena, nazwa)` w `monitor.mjs`
   zastępują literały; URL-e Żor i Rybnika generowane helperem są identyczne z dotychczasowymi.

## Odkryte przy okazji: zaślepkowe id Otodomu

Każda lista Otodomu (Żory, Rybnik, Nieborowice; działki i domy) ma na pierwszej pozycji
„wyróżniony" duplikat zwykłego ogłoszenia z tej samej strony — z tym samym id `9000062279`
na każdej liście i datą `1999-02-29 00:00:01` (dzień, który nie istnieje). Monitor kluczował
rekordy po `it.id`, więc jeden rekord `oto-9000062279` zbierał po kolei obce ogłoszenia:
„Piękna działka… Rybnik-Północ" 1 250 000 → „Dom po generalnym remoncie" 590 000 (fałszywa
obniżka -53 % wypchnięta pushem 2026-11-02 20:47) → „Mały dom do remontu" Nieborowice 360 000.
W stanie były trzy takie rekordy (`…273`, `…278`, `…279`).

Naprawa (`parse.mjs`, testy w `parse.test.mjs`): `otodomDedupItems` odrzuca zaślepkę, gdy
zwykła kopia (ten sam slug) jest na liście; samotna zaślepka dostaje klucz z publicznego ID
ze sluga (`…-ID4DxnS`); `otodomCreated` ignoruje datę z 1999. Klucze zwykłych ogłoszeń bez
zmian, więc stan nie przeżywa żadnej migracji. Trzy sklejone rekordy usunięte ze stanu,
fałszywa obniżka usunięta z `history.json` (kopie w scratchpadzie sesji).

## Poza zakresem

- Prawdziwe zakładki (JS) zamiast sekcji — pasek nawigacji z kotwicami daje ten sam efekt;
  trzeci region to jeden dodatkowy ekran na końcu strony.
- Sąsiednie wsie gminy Pilchowice (Żernica, Wilcza) i Knurów.

## Testy

- `dedup`: `detectDistricts` dla Nieborowic z odmianą; Pilchowice nie łapią.
- `areas`: trzy regiony w kolejności zory → rybnik → nieborowice; Nieborowice nie wchodzą do
  `inRybnikArea`; etykieta Rybnika bez zmian.
- `render`: sekcja Nieborowic po Rybniku, wpis w pasku, nagłówek katalogu, brak pustego optgroup,
  `data-dz="nieborowice"`.
- Dry-run: „Nowa kategoria Działki Nieborowice / Domy Nieborowice: … baseline", liczby zgodne
  z deklaracjami portali.
