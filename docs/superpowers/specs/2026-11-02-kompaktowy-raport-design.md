# Kompaktowa strona główna raportu

Data: 2026-11-02. Prośba: „zrobić coś, żeby tej stronki nie scrollować aż tak".

## Diagnoza

Strona główna (`public/index.html`, ~285 KB) renderuje pod każdą kategorią **całą** historię
nowości i obniżek — 98 przebiegów od lipca, 426 kart ofert, 133 nagłówki przebiegów.
Po dodaniu Rybnika sekcja Rybnika jest pod całą historią Żor. Na telefonie kolumny
układają się jedna pod drugą, więc długość się podwaja.

## Decyzje

1. **Okno czasowe na stronie głównej.** Pod „Nowe oferty i obniżki" rozwinięte są tylko
   przebiegi z ostatnich 7 dni, ale zawsze co najmniej 3 najnowsze przebiegi z treścią
   (po awariach OLX bywają tygodnie bez nowości — strona nie może wtedy świecić pustką).
   Starsze przebiegi trafiają w całości do zwiniętego `<details class="older">` z podsumowaniem
   „📜 Starsze niż 7 dni: N nowych, M obniżek (do DATA)". Nic nie ginie — jest jeden klik dalej.
   Logika wydzielona do czystej funkcji `splitRuns(runs, nowMs, { days, min })` w `render.mjs`
   (testowalna bez DOM).
2. **Przyklejony pasek nawigacji** pod nagłówkiem: skoki do regionów i kategorii
   (`#region-…`, `#cat-…`) oraz link do katalogu. Jedna linia, na telefonie przewijana
   poziomo zamiast łamana. Nagłówki mają `scroll-margin-top`, żeby pasek ich nie zasłaniał.
3. **Karty ofert bez zmian.** Werdykt, cechy z ogłoszenia i uwagi to sens strony głównej;
   zwijanie ich oszczędziłoby ~1 linię na kartę kosztem kliknięcia na każdej.
4. **Wykres trendu, negocjacje, pytania bez zmian** — negocjacje i pytania już są w `<details>`.

## Poza zakresem

- Zakładki per region (JS) — po oknie czasowym strona ma 2–3 ekrany, pasek nawigacji wystarcza.
- Katalog `wszystkie.html` — ma filtry i sortowanie, długość wynika z liczby ofert.
- Rozmiar pliku HTML — starsza historia nadal jest w HTML (zwinięta), ~285 KB to nie problem.

## Testy

- `splitRuns`: okno 7 dni; minimum 3 przebiegi, gdy w oknie jest mniej; pusta lista.
- `renderReport`: stary przebieg ląduje w `<details class="older">`, świeży poza nim;
  pasek nawigacji zawiera kotwice regionów i kategorii.
