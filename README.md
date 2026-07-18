# zory-monitor — monitoring działek i domów w Żorach

Skrypt sprawdza nowe ogłoszenia sprzedaży **działek i domów** w Żorach na **OLX**, **Otodom**
i **Nieruchomosci-online.pl** i przy nowych ofertach pokazuje powiadomienie Windows
(kliknięcie otwiera `report.html`).

Uwagi o N-O.pl: lista nie podaje dat publikacji (data dociągana ze strony oferty dla nowych),
portal dokleja "oferty z okolicy" (filtrujemy tylko Żory) i łatwo daje HTTP 429 przy zbyt częstych
żądaniach. Obrona: żądania do tego portalu idą szeregowo (nigdy równolegle, 5 s między kategoriami),
między stronami paginacji 4 s przerwy, 2 s po każdym pobraniu szczegółów oferty; przy 429 skrypt
odpuszcza od razu i zapisuje pauzę na czas z nagłówka Retry-After (plik `no-cooldown.json`,
respektowany przez kolejne przebiegi; kasowany po udanym pobraniu).
Bezpiecznik przeciwzalewowy: gdy jedno źródło wysypie naraz >25 nieznanych ofert (powrót po
awarii/throttlingu), są one zapamiętywane po cichu jako baseline, bez powiadomień.

Raport (dwie kolumny: Działki | Domy) zawiera dodatkowo:
- statystyki rynku per kategoria (liczba ofert, mediana ceny, mediana zł/m², mediana powierzchni) — odświeżane co przebieg,
- automatyczną ocenę każdej nowej oferty względem mediany zł/m² (🟢 potencjalna okazja / 🟡 poniżej / ⚪ w normie / 🔴 powyżej) z heurystycznymi ostrzeżeniami (grunt rolny, podejrzanie niska cena, odświeżona oferta itd.),
- checklistę pytań do sprzedającego dla działek i domów,
- wykrywanie w treści ogłoszenia: dla działek media (prąd/woda/gaz/kanalizacja) i wzmianki o MPZP/drodze,
  dla domów fotowoltaika i udogodnienia (pompa ciepła, garaż, klimatyzacja, ogrzewanie…) — wraz z listą
  „Brak wzmianki o: …" dla ważnych rzeczy, których ogłoszenie nie podaje (OLX: opis z listy;
  Otodom: dociągana strona oferty — tylko dla nowych ofert).

Oceny to proste heurystyki statystyczne — pomagają priorytetyzować, nie zastępują weryfikacji.

Raport jest też publikowany publicznie na Vercelu: **https://zory-dzialki.vercel.app**
(deploy robi sam skrypt po każdej zmianie raportu; wymaga zalogowanego Vercel CLI
i podlinkowanego projektu w `public/.vercel` — bez tego krok jest pomijany).

## Deduplikacja i dodatki

- Ta sama nieruchomość na kilku portalach jest scalana w jedną kartę
  („Na portalach: OLX · Otodom · N-O.pl"); reguła: między portalami cena ±5%
  + metraż ±3%, w obrębie portalu ostrzej (±1%), zawsze bez konfliktu dzielnic
  (Rój vs Kleszczów ⇒ osobno), oferta kanoniczna wg priorytetu OLX > Otodom > N-O.pl.
  Dubel znanej oferty nie wysyła powiadomienia; obniżka pushowana raz na grupę.
  Statystyki i mediany liczone po scaleniu.
- `archive.json` — oferty zniknięte ze wszystkich portali na ≥3 dni (sekcja
  „zniknięte" na podstronie „wszystkie" + mediana dni do zniknięcia i końcowej ceny).
- `trend.json` — dzienna mediana zł/m² z pełnych przebiegów (wykres na stronie
  głównej, pojawia się od 5 dni pomiarów).
- Podstrona „wszystkie": filtry ceny, metrażu, tytułu i dzielnicy + sortowanie.
- Testy: `node --test` (logika dubli/zniknięć w `dedup.mjs`, render w `render.mjs`).

## Jak działa

- Harmonogram zadań Windows uruchamia `run-monitor.vbs` (ukryte okno) **co godzinę 7:00–22:00**
  (zadanie: `Monitoring dzialek Zory`; pominięte uruchomienia są nadrabiane po włączeniu komputera).
- `monitor.mjs` pobiera listy ofert, porównuje z zapamiętanymi w `state.json`
  i dla nowych: aktualizuje `report.html`, dopisuje do `history.json`, pokazuje toast
  **i wysyła push na telefony przez ntfy.sh** (temat: `zory-okazje-kx83b2mq7f` — traktować jak hasło;
  aplikacja ntfy z Google Play/App Store → Subscribe to topic). Okazje 🟢 i obniżki ≥10% idą
  z wysokim priorytetem (dźwięk), reszta normalnie.
- **Śledzenie cen**: każda znana oferta ma historię cen; obniżka = powiadomienie + wpis w raporcie.
- **Do negocjacji**: sekcja per kategoria z ofertami wiszącymi 60+ dni albo po obniżkach ≥5%.
- Pierwsze uruchomienie tylko zapamiętuje istniejące oferty (bez powiadomienia).
- Oferta widziana pierwszy raz, ale utworzona >3 dni temu, jest oznaczana jako „możliwe odświeżenie".

## Pliki

| Plik | Rola |
|---|---|
| `monitor.mjs` | główny skrypt (Node 20+, bez zależności npm) |
| `dedup.mjs` / `render.mjs` | logika dubli i zniknięć / renderowanie HTML (+ testy `*.test.mjs`) |
| `archive.json` / `trend.json` | oferty zniknięte / dzienne mediany zł/m² |
| `toast.ps1` | powiadomienie Windows |
| `run-monitor.vbs` | ukryty launcher dla Harmonogramu zadań |
| `sprawdz-teraz.cmd` | ręczne sprawdzenie (podwójny klik) |
| `state.json` | zapamiętane oferty (usunięcie = reset, następny run będzie „pierwszym") |
| `history.json` / `report.html` | historia znalezisk / raport do przeglądania |
| `monitor.log` | log przebiegów |

## Zmiana harmonogramu / odinstalowanie

Harmonogram: `taskschd.msc` → zadanie `Monitoring dzialek Zory` → Właściwości → Wyzwalacze.

Odinstalowanie:
```powershell
Unregister-ScheduledTask -TaskName 'Monitoring dzialek Zory' -Confirm:$false
```
i skasować katalog `C:\Users\bkawa\zory-monitor`.

## Uwagi

- Komputer musi być włączony (i użytkownik zalogowany), żeby sprawdzenie się odbyło.
- Jeśli portal przebuduje stronę, skrypt zgłosi błąd w logu i toaście „awaria" — wtedy trzeba poprawić parser.
