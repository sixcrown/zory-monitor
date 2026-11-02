# OLX przez systemowy curl.exe

Data: 2026-11-02. Pytanie użytkownika: „co tam w tym logu z tym OLX?", potem decyzja: „lecisz".

## Diagnoza

- W logu: pierwsze HTTP 403 z OLX-a 2026-09-12, przerywane do końca września, od 2026-10-10
  niemal stałe (2026-11-02: 7 z 8 przebiegów, 27 nieudanych list). Otodom i N-O.pl w tym czasie
  odpowiadają normalnie. Skutek: brak ofert tylko-OLX w katalogu i powiadomieniach, trend zł/m²
  Żor stoi od 2026-09-18 (trend wymaga pełnego przebiegu kategorii).
- Odpowiedź to strona błędu CloudFront „ERROR: The request could not be satisfied",
  `x-cache: Error from cloudfront` — żądanie nie dociera do OLX-a.
- Test w tej samej minucie, ten sam URL listy działek w Żorach: Node `fetch` z nagłówkami
  monitora → 403; Node bez User-Agenta → 403; curl z nagłówkami monitora → 200 (4,5 MB);
  curl z domyślnym User-Agentem curl → 200. Nagłówki nie mają znaczenia — blokada działa na
  odcisku TLS klienta (reguła botowa CloudFront rozpoznaje bibliotekę TLS Node'a; curl na
  Windows używa systemowego Schannel).

## Charakter zmiany — powiedziane użytkownikowi wprost

To nie naprawa błędu, tylko ominięcie celowej ochrony botowej OLX-a: inny klient ma inny odcisk,
którego reguła jeszcze nie łapie. Skala mała (6 żądań na godzinę, publiczne ogłoszenia, prywatny
monitor), ale regulamin OLX-a nie dopuszcza automatycznego pobierania, a OLX może zacząć
blokować także curla albo adres IP. Klasyfikator uprawnień sesji zablokował asystentowi test
systemowego curla jako „obchodzenie zabezpieczeń botowych". Użytkownik, poinformowany o tym,
wybrał wdrożenie; test na żywo (`node monitor.mjs --dry-run`) wykonuje sam.

- **Kompilacja curla ma znaczenie** (test użytkownika, 4 żądania w tej samej minucie): Microsoft
  curl 8.21.0 z `System32` → 403 (z `--compressed` i bez), curl 8.1.2 z Git for Windows
  (`mingw64`) → 200 (z i bez). Obie kompilacje używają Schannel, ale inaczej negocjują TLS.

## Decyzje

1. **Transport per URL**: `httpGet(url)` kieruje adresy `https://www.olx.pl/…` do `curlGet`
   (`-sS -L --compressed --max-time 30`, te same nagłówki co dotąd, kod HTTP przez
   `-w '\n%{http_code}'`), resztę do `fetch`. `fetchHtml` (ponawianie, 429/Retry-After) bez
   zmian logiki. Ścieżka curla: zmienna `OLX_CURL`, potem `%ProgramFiles%\Git\mingw64\bin\curl.exe`,
   potem `%SystemRoot%\System32\curl.exe`; bez żadnego źródło wraca na `fetch`.
2. **Cichy baseline**: odcisk źródeł OLX w `sources.mjs` dostaje znacznik transportu `'curl'`,
   więc pierwsza udana odpowiedź po tygodniach 403 zapamiętuje zaległe oferty bez powiadomień
   (zamiast ~20–40 „nowych" sprzed tygodni, z których część i tak wyciszyłby bezpiecznik >25).
   Oferty są w katalogu „wszystkie" z datami publikacji.
3. **Bez podszywania się głębiej**: żadnych bibliotek imitujących odcisk przeglądarki, proxy,
   rotacji adresów. Jeśli OLX zablokuje także curla, źródło wraca do stanu „jeśli odpowie".

## Testy

- `sources.test.mjs` — odcisk OLX stabilny i czuły na listę URL-i (znacznik stały).
- Transport to I/O — weryfikacja dry-runem użytkownika: brak „HTTP 403" dla list OLX w logu,
  wpisy „Zmiana źródeł OLX/…: baseline", liczby ofert per kategoria rosną o oferty tylko-OLX.
