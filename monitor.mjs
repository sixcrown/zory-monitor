// Monitoring nowych ogłoszeń sprzedaży DZIAŁEK i DOMÓW w Żorach (OLX + Otodom).
// Uruchamiany przez Harmonogram zadań Windows 2x dziennie. Bez zależności npm (Node 20+).
// Nowe oferty => powiadomienie Windows (toast) + raport HTML (lokalnie i na Vercelu).

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderReport, renderCatalog, zl } from './render.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(DIR, 'state.json');
const HISTORY_FILE = path.join(DIR, 'history.json');
const REPORT_FILE = path.join(DIR, 'report.html');
const CATALOG_FILE = path.join(DIR, 'wszystkie.html');
const LOG_FILE = path.join(DIR, 'monitor.log');
const TOAST_PS1 = path.join(DIR, 'toast.ps1');
const PUBLIC_DIR = path.join(DIR, 'public');
const VERCEL_CMD = 'C:\\Users\\bkawa\\AppData\\Local\\nvs\\default\\vercel.cmd';
const REPORT_URL = 'https://zory-dzialki.vercel.app';
// temat ntfy.sh działa jak hasło — kto go zna, dostaje powiadomienia
const NTFY_TOPIC = 'zory-okazje-kx83b2mq7f';
const NO_COOLDOWN_FILE = path.join(DIR, 'no-cooldown.json');

const CATS = {
  dzialki: {
    label: 'Działki',
    icon: '🌱',
    olx: 'https://www.olx.pl/nieruchomosci/dzialki/sprzedaz/zory/?search%5Border%5D=created_at%3Adesc',
    otodom: 'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/slaskie/zory/zory/zory?by=LATEST&direction=DESC',
    no: 'https://zory.nieruchomosci-online.pl/szukaj.html?3,dzialka,sprzedaz,,%C5%BBory:359',
    questions: [
      'Czy teren ma MPZP i co dokładnie dopuszcza? Jeśli nie ma — czy wydano warunki zabudowy?',
      'Media: które są W działce, a które tylko „w drodze"? Warunki i koszt przyłączy?',
      'Czy jest bezpośredni dostęp do drogi publicznej? Jeśli przez służebność — jak uregulowana?',
      'Numer księgi wieczystej — obciążenia, hipoteki, współwłaściciele?',
      'Klasa gruntu — czy budowa wymaga wyłączenia z produkcji rolnej? Były badania geotechniczne?',
      'Czy działka bywa podmokła / jak wygląda po większym deszczu? Jaki spadek terenu?',
      'Czy granice są wznowione geodezyjnie (punkty graniczne, aktualna mapa)?',
      'Co może powstać w sąsiedztwie (MPZP działek obok — usługi, produkcja, droga)?',
      'Od kiedy oferta jest aktywna i dlaczego sprzedają? (pole do negocjacji)',
    ],
  },
  domy: {
    label: 'Domy',
    icon: '🏠',
    olx: 'https://www.olx.pl/nieruchomosci/domy/sprzedaz/zory/?search%5Border%5D=created_at%3Adesc',
    otodom: 'https://www.otodom.pl/pl/wyniki/sprzedaz/dom/slaskie/zory/zory/zory?by=LATEST&direction=DESC',
    no: 'https://zory.nieruchomosci-online.pl/szukaj.html?3,dom,sprzedaz,,%C5%BBory:359',
    questions: [
      'Rok budowy i technologia? Czy i czym ocieplony?',
      'Dach, fundamenty, wilgoć — stan i daty ostatnich remontów?',
      'Instalacje: elektryka, hydraulika, ogrzewanie — czym grzane i ile kosztuje sezon?',
      'Świadectwo charakterystyki energetycznej — jaka klasa?',
      'Stan prawny: KW, obciążenia, czy budynek formalnie odebrany (pozwolenie na użytkowanie)?',
      'Co zostaje w cenie (meble/AGD)? Jakie umowy na media przechodzą?',
      'Powierzchnia i granice działki — czy ogrodzenie stoi w granicach?',
      'Koszty stałe: podatek od nieruchomości, media, ewentualne opłaty?',
      'Od kiedy ogłoszenie wisi, dlaczego sprzedają, czy cena do negocjacji?',
    ],
  },
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9',
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function fetchHtml(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      // 429 = throttling; ponawianie tylko pogarsza sprawę — poddajemy się od razu,
      // ale zapamiętujemy Retry-After, żeby uszanować wskazaną pauzę
      if (res.status === 429) {
        throw Object.assign(new Error('HTTP 429 (throttling)'),
          { noRetry: true, retryAfter: Number(res.headers.get('retry-after')) || null });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e.noRetry) break;
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function getOlx(cat, url) {
  const html = await fetchHtml(url);
  const m = html.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*");/s);
  if (!m) throw new Error('OLX: brak __PRERENDERED_STATE__ (zmiana struktury strony?)');
  const state = JSON.parse(JSON.parse(m[1]));
  const ads = state?.listing?.listing?.ads;
  if (!Array.isArray(ads)) throw new Error('OLX: brak listy ogłoszeń w danych (zmiana struktury?)');
  return ads.map(ad => {
    const param = key => ad.params?.find(p => p.key === key);
    const price = ad.price?.regularPrice?.value ?? null;
    const areaM2 = Number(param('m')?.normalizedValue) || null;
    return {
      id: 'olx-' + ad.id,
      cat,
      portal: 'OLX',
      title: ad.title,
      price,
      priceText: ad.price?.displayValue ?? '?',
      areaM2,
      pricePerM2: Number(param('price_per_m')?.normalizedValue) || (price && areaM2 ? Math.round(price / areaM2) : null),
      kind: param('type')?.value ?? '',
      place: [ad.location?.cityName, ad.location?.districtName].filter(Boolean).join(' – '),
      url: ad.url,
      created: ad.createdTime ?? null,
      refreshed: ad.pushupTime ?? ad.lastRefreshTime ?? null,
      desc: String(ad.description ?? '').replace(/<[^>]+>/g, ' '),
    };
  });
}

async function getOtodom(cat, url) {
  const html = await fetchHtml(url);
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new Error('Otodom: brak __NEXT_DATA__ (blokada albo zmiana struktury?)');
  const items = JSON.parse(m[1])?.props?.pageProps?.data?.searchAds?.items;
  if (!Array.isArray(items)) throw new Error('Otodom: brak listy ogłoszeń w danych (zmiana struktury?)');
  return items.map(it => {
    const price = it.totalPrice?.value ?? null;
    const areaM2 = it.areaInSquareMeters ?? null;
    return {
      id: 'oto-' + (it.id ?? it.slug),
      cat,
      portal: 'Otodom',
      title: it.title,
      price,
      priceText: zl(price),
      areaM2,
      pricePerM2: price && areaM2 ? Math.round(price / areaM2) : null,
      plotM2: it.terrainAreaInSquareMeters ?? null,
      kind: '',
      place: it.locationLabel?.value ?? 'Żory',
      url: 'https://www.otodom.pl/pl/oferta/' + it.slug,
      created: it.dateCreatedFirst || it.dateCreated || null,
    };
  });
}

// Nieruchomosci-online.pl: oferty siedzą w JSON-LD (CollectionPage), paginacja przez &p=N.
// Lista nie podaje dat publikacji — datę dociągamy ze strony oferty tylko dla nowych.
async function getNO(cat, baseUrl) {
  // po 429 respektujemy pauzę wskazaną przez serwer (plik-flaga trwa między przebiegami)
  let cd = null;
  try { cd = JSON.parse(fs.readFileSync(NO_COOLDOWN_FILE, 'utf8')); } catch {}
  if (cd && Date.now() < new Date(cd.until).getTime()) {
    throw new Error(`pauza po HTTP 429 (do ${new Date(cd.until).toLocaleTimeString('pl-PL')})`);
  }
  try {
    const seen = new Map();
    for (let p = 1; p <= 4; p++) {
      if (p > 1) await new Promise(r => setTimeout(r, 4000)); // grzeczny odstęp — portal łatwo daje 429
      const url = p === 1 ? baseUrl : `${baseUrl}&p=${p}`;
      const html = await fetchHtml(url);
    const m = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    if (!m) {
      if (p === 1) throw new Error('N-O.pl: brak JSON-LD (zmiana struktury strony?)');
      break;
    }
    let items = [];
    try {
      const j = JSON.parse(m[1]);
      items = (j.mainEntity?.offers ?? []).flatMap(a => a.offers ?? []);
    } catch {}
    if (p === 1 && !items.length) throw new Error('N-O.pl: brak ofert w danych (zmiana struktury?)');
    let added = 0;
    for (const it of items) {
      const idm = String(it.url ?? '').match(/(\d{6,})\.html/);
      if (!idm || seen.has(idm[1])) continue;
      // po wyczerpaniu ofert z Żor portal dokleja "oferty z okolicy" — pomijamy je
      if (!/żory/i.test(String(it.itemOffered?.address?.addressLocality ?? ''))) continue;
      added++;
      const price = Number(it.price) || null;
      const areaM2 = Math.round(Number(it.itemOffered?.floorSize?.value)) || null;
      seen.set(idm[1], {
        id: 'no-' + idm[1],
        cat,
        portal: 'N-O.pl',
        title: it.name ?? 'oferta',
        price,
        priceText: zl(price),
        areaM2,
        pricePerM2: Math.round(Number(it.priceSpecification?.price)) || (price && areaM2 ? Math.round(price / areaM2) : null),
        kind: '',
        place: [it.itemOffered?.address?.streetAddress, it.itemOffered?.address?.addressLocality].filter(Boolean).join(', ') || 'Żory',
        url: it.url,
        created: null,
        desc: String(it.itemOffered?.description ?? ''),
      });
    }
      if (!added) break;
    }
    fs.rmSync(NO_COOLDOWN_FILE, { force: true }); // sukces = pauza nieaktualna
    return [...seen.values()];
  } catch (e) {
    if (e.retryAfter != null || /429/.test(String(e.message))) {
      const until = new Date(Date.now() + ((e.retryAfter ?? 3600) + 120) * 1000).toISOString();
      try { fs.writeFileSync(NO_COOLDOWN_FILE, JSON.stringify({ until })); } catch {}
    }
    throw e;
  }
}

// Strona oferty N-O.pl: JSON-LD RealEstateListing z pełnym opisem, parametrami i datePosted.
async function fetchNoAdText(o) {
  try {
    const html = await fetchHtml(o.url);
    for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)) {
      let x;
      try { x = JSON.parse(m[1]); } catch { continue; }
      if (x['@type'] === 'RealEstateListing') {
        if (x.datePosted && !o.created) o.created = x.datePosted;
        return JSON.stringify([x.name, x.description, x.additionalProperty]);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Dla nowych ofert z Otodomu dociągamy stronę ogłoszenia — tam są media/udogodnienia i opis.
async function fetchOtodomAdText(o) {
  try {
    const html = await fetchHtml(o.url);
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s);
    const ad = m ? JSON.parse(m[1])?.props?.pageProps?.ad : null;
    if (!ad) return null;
    if (!o.created && ad.createdAt) o.created = ad.createdAt;
    if (ad.pushedUpAt || ad.modifiedAt) o.refreshed = ad.pushedUpAt ?? ad.modifiedAt;
    return JSON.stringify([ad.target, ad.characteristics, ad.features, ad.featuresByCategory,
      ad.additionalInformation, String(ad.description ?? '')]);
  } catch {
    return null;
  }
}

// ---- wykrywanie mediów/udogodnień w treści ogłoszenia (heurystyka słów kluczowych) ----

const PLOT_MEDIA = [
  { label: 'prąd', re: /\bpr[aą]d|energia elektryczna|elektryczn/i },
  { label: 'woda', re: /\bwod[aąęoy]|wodoci[aą]g/i },
  { label: 'gaz', re: /\bgaz(u|em|owy|owe|owa|oci[aą]g)?\b/i },
  { label: 'kanalizacja', re: /kanalizacj|szambo|oczyszczalni/i },
];
const PLOT_EXTRA = [
  { label: 'wzmianka o MPZP/WZ', re: /mpzp|plan(?:ie|u)? zagospodarowania|warunk(?:i|ów|ach)? zabudowy/i },
  { label: 'utwardzona/asfaltowa droga', re: /asfalt|utwardzon/i },
  { label: 'służebność', re: /s[łl]u[żz]ebno/i },
  { label: 'ogrodzona', re: /ogrodzon|ogrodzenie/i },
];
// ważne dla domów — jeśli brak w ogłoszeniu, wypisujemy to wprost
const HOUSE_IMPORTANT = [
  { label: 'fotowoltaika', re: /fotowolta|panele s[łl]oneczne|\bpv\b/i },
  { label: 'rok budowy', re: /rok budowy|build_year|wybudowan/i },
  { label: 'ogrzewanie', re: /ogrzewan|heating|pomp[aąyę] ciep|kocio[łl]|kot[łl]a|piec/i },
];
const HOUSE_EXTRA = [
  { label: 'pompa ciepła', re: /pomp[aąyę] ciep/i },
  { label: 'ogrzewanie gazowe', re: /ogrzewanie gazowe|piec gazowy|kocio[łl] gazowy|c\.?o\.? gazowe/i },
  { label: 'ekogroszek/węgiel', re: /ekogroszek|w[ęe]glow/i },
  { label: 'klimatyzacja', re: /klimatyzacj|air_conditioning/i },
  { label: 'garaż', re: /gara[żz]/i },
  { label: 'piwnica', re: /piwnic|basement/i },
  { label: 'rekuperacja', re: /rekuperac/i },
  { label: 'ocieplony', re: /ociepl|termomodernizacj/i },
  { label: 'do remontu', re: /do remontu|to_renovation/i },
  { label: 'do wykończenia', re: /do wyko[ńn]czenia|to_completion/i },
  { label: 'stan surowy', re: /stan surowy/i },
];

function analyzeOffer(o, corpus) {
  const text = [o.title, o.kind, corpus ?? ''].join(' ');
  // bez treści ogłoszenia nie wolno twierdzić "brak wzmianki" — raportujemy tylko znaleziska z tytułu
  const canJudgeMissing = (corpus ?? '').length >= 40;
  if (o.cat === 'dzialki') {
    o.featHave = [
      ...PLOT_MEDIA.filter(c => c.re.test(text)).map(c => c.label + ' ✓'),
      ...PLOT_EXTRA.filter(c => c.re.test(text)).map(c => c.label),
    ];
    if (canJudgeMissing) o.featMissing = PLOT_MEDIA.filter(c => !c.re.test(text)).map(c => c.label);
  } else {
    const pv = HOUSE_IMPORTANT[0].re.test(text);
    o.featHave = [
      ...(pv ? ['fotowoltaika ✓'] : []),
      ...HOUSE_EXTRA.filter(c => c.re.test(text)).map(c => c.label),
    ];
    if (canJudgeMissing) o.featMissing = HOUSE_IMPORTANT.filter(c => !c.re.test(text)).map(c => c.label);
  }
  if (!canJudgeMissing) (o.notes ??= []).push('nie udało się pobrać treści ogłoszenia — media/udogodnienia sprawdź ręcznie');
}

// ---- statystyki i ocena ofert ----

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function calcStats(offers) {
  const prices = offers.map(o => o.price).filter(v => v > 0);
  const ppms = offers.map(o => o.pricePerM2).filter(v => v > 0);
  const areas = offers.map(o => o.areaM2).filter(v => v > 0);
  return {
    count: offers.length,
    medPrice: median(prices),
    medPpm: median(ppms),
    minPpm: ppms.length ? Math.min(...ppms) : null,
    maxPpm: ppms.length ? Math.max(...ppms) : null,
    medArea: median(areas),
  };
}

function assess(o, stats) {
  const notes = [];
  let verdict = null;
  if (o.pricePerM2 && stats?.medPpm) {
    const r = o.pricePerM2 / stats.medPpm;
    if (r <= 0.7) {
      verdict = `🟢 potencjalna okazja: ${Math.round((1 - r) * 100)}% poniżej mediany zł/m²`;
      notes.push(o.cat === 'dzialki'
        ? 'tak niska cena bywa sygnałem problemów — sprawdź MPZP, dostęp do drogi, media i czy grunt nie jest rolny'
        : 'tak niska cena zwykle oznacza remont / stan surowy albo problem prawny — obejrzyj z fachowcem i sprawdź KW');
    } else if (r <= 0.9) verdict = `🟡 ${Math.round((1 - r) * 100)}% poniżej mediany zł/m²`;
    else if (r < 1.1) verdict = '⚪ cena w okolicach mediany zł/m²';
    else verdict = `🔴 ${Math.round((r - 1) * 100)}% powyżej mediany zł/m²`;
  } else {
    notes.push('nie da się policzyć zł/m² (brak ceny lub powierzchni) — dopytaj o szczegóły');
  }
  if (/rolne/i.test(o.kind)) notes.push('działka rolna — budowa może wymagać warunków zabudowy i wyłączenia z produkcji rolnej');
  if (/rekreacyjn/i.test(o.kind)) notes.push('działka rekreacyjna — możliwe ograniczenia zabudowy całorocznej');
  if (o.maybeRefresh) {
    const d = s => String(s).slice(0, 10);
    notes.push(`prawdopodobnie odświeżona starsza oferta (wystawiona ${o.created ? d(o.created) : '?'}${o.refreshed ? `, odświeżona ${d(o.refreshed)}` : ''}) — długo się nie sprzedaje, jest pole do negocjacji`);
  }
  return { verdict, notes };
}

// ---- publikacja i powiadomienia ----

function deployReport() {
  return new Promise(resolve => {
    if (!fs.existsSync(path.join(PUBLIC_DIR, '.vercel')) || !fs.existsSync(VERCEL_CMD)) {
      log('Vercel: pomijam publikację (projekt niepodlinkowany).');
      return resolve();
    }
    try {
      fs.copyFileSync(REPORT_FILE, path.join(PUBLIC_DIR, 'index.html'));
      if (fs.existsSync(CATALOG_FILE)) fs.copyFileSync(CATALOG_FILE, path.join(PUBLIC_DIR, 'wszystkie.html'));
      // shell:true wymagane dla plików .cmd (Node blokuje je w spawn bez shella)
      execFile(VERCEL_CMD, ['deploy', '--prod', '--yes'],
        { cwd: PUBLIC_DIR, windowsHide: true, timeout: 120000, shell: true },
        err => {
          if (err) log('Vercel deploy błąd: ' + err.message);
          else log('Vercel: opublikowano raport.');
          resolve();
        });
    } catch (e) {
      log('Vercel deploy błąd: ' + e.message);
      resolve();
    }
  });
}

// push na telefony przez ntfy.sh (priorytet 4 = głośne powiadomienie przy okazjach)
async function sendNtfy(title, message, priority = 3) {
  try {
    const res = await fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ topic: NTFY_TOPIC, title, message, priority, click: REPORT_URL, tags: ['house'] }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    log('ntfy: wysłano push.');
  } catch (e) {
    log('ntfy błąd: ' + e.message);
  }
}

function showToast(title, body) {
  return new Promise(resolve => {
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', TOAST_PS1, '-Title', title, '-Body', body, '-OpenPath', REPORT_FILE],
      { windowsHide: true, timeout: 30000 },
      err => { if (err) log('Toast błąd: ' + err.message); resolve(); });
  });
}

// ---- główny przebieg ----

// żądania do N-O.pl idą szeregowo, z odstępem — portal karze za równoległość (429)
let noChain = Promise.resolve();
function queuedGetNO(cat, url) {
  const run = noChain.then(() => getNO(cat, url));
  noChain = run.catch(() => {}).then(() => new Promise(r => setTimeout(r, 5000)));
  return run;
}

const jobs = Object.entries(CATS).flatMap(([cat, cfg]) => [
  getOlx(cat, cfg.olx).catch(e => { throw new Error(`${cfg.label}/${e.message}`); }),
  getOtodom(cat, cfg.otodom).catch(e => { throw new Error(`${cfg.label}/${e.message}`); }),
  queuedGetNO(cat, cfg.no).catch(e => { throw new Error(`${cfg.label}/N-O.pl: ${e.message}`); }),
]);
const results = await Promise.allSettled(jobs);
const offers = [];
const errors = [];
for (const r of results) {
  if (r.status === 'fulfilled') offers.push(...r.value);
  else errors.push(r.reason.message);
}
if (errors.length) log('UWAGA, częściowa awaria: ' + errors.join(' | '));

if (!offers.length) {
  log('BŁĄD: żaden portal nie odpowiedział.');
  await showToast('Monitoring nieruchomości: awaria', 'Nie udało się pobrać żadnego portalu. Szczegóły w monitor.log.');
  await sendNtfy('Monitoring Żory: awaria', 'Nie udało się pobrać żadnego portalu — sprawdź monitor.log na PC.', 2);
  process.exit(1);
}

const firstRun = !fs.existsSync(STATE_FILE);
const state = firstRun ? { seen: {} } : JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const now = new Date().toISOString();

const unique = [...new Map(offers.map(o => [o.id, o])).values()];
const fresh = unique.filter(o => !state.seen[o.id]);
for (const o of fresh) {
  state.seen[o.id] = {
    firstSeen: now, lastSeen: now, title: o.title, url: o.url, cat: o.cat,
    portal: o.portal, created: o.created,
    priceHistory: o.price ? [{ at: now, price: o.price }] : [],
  };
}

// śledzenie cen znanych ofert — obniżka to najlepszy sygnał negocjacyjny
const drops = [];
for (const o of unique) {
  const rec = state.seen[o.id];
  if (!rec || rec.firstSeen === now) continue;
  rec.lastSeen = now;
  rec.url ??= o.url; rec.cat ??= o.cat; rec.portal ??= o.portal; rec.created ??= o.created;
  rec.priceHistory ??= (o.price ? [{ at: rec.firstSeen, price: o.price }] : []);
  const last = rec.priceHistory.at(-1);
  if (o.price && last && o.price !== last.price) {
    rec.priceHistory.push({ at: now, price: o.price });
    if (o.price < last.price) {
      drops.push({ ...o, oldPrice: last.price, newPrice: o.price, dropPct: Math.round((1 - o.price / last.price) * 100) });
    }
  } else if (o.price && !last) {
    rec.priceHistory.push({ at: now, price: o.price });
  }
}

// bezpiecznik: portal wracający po awarii/throttlingu wysypuje naraz całą swoją pulę
// jako "nowe" — traktujemy to jak cichy baseline źródła, nie jak lawinę nowości
const FLOOD_LIMIT = 25;
const flooded = new Set();
if (!firstRun) {
  for (const portal of new Set(fresh.map(o => o.portal))) {
    for (const cat of Object.keys(CATS)) {
      const n = fresh.filter(o => o.portal === portal && o.cat === cat).length;
      if (n > FLOOD_LIMIT) {
        flooded.add(portal + '|' + cat);
        log(`Cichy baseline źródła ${portal}/${cat}: ${n} nieznanych ofert naraz — bez powiadomień.`);
      }
    }
  }
}
const news = fresh.filter(o => !flooded.has(o.portal + '|' + o.cat));

// media/udogodnienia z treści ogłoszenia; Otodom i N-O.pl wymagają dociągnięcia strony
// oferty (N-O.pl przy okazji uzupełnia datę publikacji, której nie ma na liście)
for (const o of news) {
  let corpus;
  if (o.portal === 'Otodom') corpus = await fetchOtodomAdText(o);
  else if (o.portal === 'N-O.pl') {
    corpus = (await fetchNoAdText(o)) ?? o.desc;
    await new Promise(r => setTimeout(r, 2000)); // nie męczymy portalu też przy detalach
  } else corpus = o.desc ?? '';
  analyzeOffer(o, corpus);
  if (o.created && state.seen[o.id] && !state.seen[o.id].created) state.seen[o.id].created = o.created;
  delete o.desc;
}

// oferta "nowa" dla nas, ale utworzona >3 dni temu = raczej odświeżona/podbita
for (const o of news) {
  if (o.created && Date.now() - new Date(o.created).getTime() > 3 * 864e5) o.maybeRefresh = true;
}

// statystyki rynku per kategoria + ocena każdej nowej oferty
const statsByCat = {};
for (const cat of Object.keys(CATS)) {
  const catOffers = unique.filter(o => o.cat === cat);
  statsByCat[cat] = catOffers.length ? calcStats(catOffers) : null;
}
for (const o of news) {
  const a = assess(o, statsByCat[o.cat]);
  o.verdict = a.verdict;
  o.notes = [...a.notes, ...(o.notes ?? [])];
}

// przytnij stan, żeby nie rósł w nieskończoność
const entries = Object.entries(state.seen);
if (entries.length > 6000) {
  entries.sort((a, b) => String(a[1].firstSeen).localeCompare(String(b[1].firstSeen)));
  state.seen = Object.fromEntries(entries.slice(entries.length - 6000));
}
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

const perCat = cat => unique.filter(o => o.cat === cat).length;
const counts = Object.entries(CATS).map(([cat, cfg]) => `${cfg.label}: ${perCat(cat)}`).join(', ');

// pełny katalog aktualnych ofert (z dniami na rynku i łączną obniżką) — dla podstrony
// "wszystkie" i jako baza sekcji negocjacyjnej (60+ dni na rynku albo obniżka ≥5%)
const daysOn = c => (c ? Math.floor((Date.now() - new Date(c).getTime()) / 864e5) : null);
const catalogByCat = {};
const negoByCat = {};
for (const cat of Object.keys(CATS)) {
  catalogByCat[cat] = unique.filter(o => o.cat === cat).map(o => {
    const rec = state.seen[o.id] ?? {};
    const first = rec.priceHistory?.[0]?.price;
    const dropPct = first && o.price && o.price < first ? Math.round((1 - o.price / first) * 100) : 0;
    return { ...o, dropPct, dom: daysOn(o.created ?? rec.firstSeen) };
  });
  negoByCat[cat] = catalogByCat[cat]
    .filter(o => (o.dom ?? 0) >= 60 || o.dropPct >= 5)
    .sort((a, b) => (b.dropPct - a.dropPct) || ((b.dom ?? 0) - (a.dom ?? 0)))
    .slice(0, 10);
}

const history = !firstRun && fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : [];
if (!firstRun && (news.length || drops.length)) {
  history.unshift({ at: now, offers: news, drops });
  history.length = Math.min(history.length, 100);
}
fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 1));

// raport i katalog renderujemy i publikujemy co przebieg — statystyki mają być aktualne
fs.writeFileSync(REPORT_FILE, renderReport(CATS, history, statsByCat, negoByCat));
fs.writeFileSync(CATALOG_FILE, renderCatalog(CATS, catalogByCat, statsByCat));
await deployReport();

if (firstRun) {
  log(`Pierwsze uruchomienie: zapamiętano ${unique.length} istniejących ofert (${counts}). Bez powiadomienia.`);
} else if (news.length || drops.length) {
  const parts = Object.entries(CATS)
    .map(([cat, cfg]) => [cfg.label, news.filter(o => o.cat === cat).length])
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${n} × ${l.toLowerCase().replace(/y$/, '')}`);
  if (drops.length) parts.push(`${drops.length} × obniżka`);
  const title = `Żory: ${parts.join(', ')}`;
  const lines = [
    ...news.slice(0, 4).map(o => `• ${o.title} — ${o.priceText}${o.verdict ? ' ' + o.verdict.slice(0, 2) : ''}${o.maybeRefresh ? ` ♻ odświeżona${o.refreshed ? ' ' + String(o.refreshed).slice(0, 10) : ''}` : ''}`),
    ...drops.slice(0, 3).map(d => `↓ ${d.title}: ${zl(d.oldPrice)} → ${zl(d.newPrice)} (-${d.dropPct}%)`),
  ];
  const extra = news.length + drops.length - lines.length;
  const body = (lines.join('\n') + (extra > 0 ? `\n(+${extra} więcej)` : '')).slice(0, 400);
  const hot = news.some(o => o.verdict?.startsWith('🟢')) || drops.some(d => d.dropPct >= 10);
  await showToast(title, body.replace(/\n/g, '  ·  '));
  await sendNtfy(title, body, hot ? 4 : 3);
  log(`NOWE: ${news.length}, OBNIŻKI: ${drops.length} (${counts})`);
} else {
  log(`Nic nowego (${counts}, w bazie ${Object.keys(state.seen).length} ofert).`);
}
