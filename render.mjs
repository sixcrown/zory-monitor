// Renderowanie HTML raportu i katalogu — czyste funkcje string → string.
// Wydzielone z monitor.mjs bez zmian logiki. Testy: render.test.mjs.

import { median, detectDistricts } from './dedup.mjs';
import { REGIONS, DISTRICT_OPTIONS } from './areas.mjs';

export const zl = v => (v == null ? '?' : Number(v).toLocaleString('pl-PL') + ' zł');

// Kategorie pogrupowane po regionie, w kolejności REGIONS (region nieznany → grupa bez nagłówka).
function byRegion(CATS) {
  const keys = [...new Set([...Object.keys(REGIONS), ...Object.values(CATS).map(c => c.region)])];
  return keys
    .map(r => ({ region: r, label: REGIONS[r]?.label ?? '', cats: Object.entries(CATS).filter(([, c]) => c.region === r) }))
    .filter(g => g.cats.length);
}
const catHeading = cfg => [cfg.label, REGIONS[cfg.region]?.label].filter(Boolean).join(' — ');
const areaNames = () => Object.values(REGIONS).map(r => r.short).join(' i ');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderOffer(o) {
  return `
      <div class="offer">
        <a href="${esc(o.url)}" target="_blank"><strong>${esc(o.title)}</strong></a>
        <div class="meta">${esc(o.portal)} · ${esc(o.priceText)}${o.areaM2 ? ` · ${o.areaM2} m²` : ''}${o.pricePerM2 ? ` · ${o.pricePerM2} zł/m²` : ''}${o.plotM2 ? ` · działka ${o.plotM2} m²` : ''}${o.kind ? ` · ${esc(o.kind)}` : ''}${o.place ? ` · ${esc(o.place)}` : ''}${o.created ? ` · dodano ${esc(String(o.created).slice(0, 16).replace('T', ' '))}` : ''}${o.maybeRefresh && o.refreshed ? ` · odświeżona ${esc(String(o.refreshed).slice(0, 10))}` : ''}</div>
        ${o.mirrors?.length ? `<div class="mirrors">Na portalach: <a href="${esc(o.url)}" target="_blank">${esc(o.portal)}</a>${o.mirrors.map(m => ` · <a href="${esc(m.url)}" target="_blank">${esc(m.portal)}</a>`).join('')}</div>` : ''}
        ${o.verdict ? `<div class="verdict">${esc(o.verdict)}</div>` : ''}
        ${o.featHave?.length ? `<div class="feat">Z ogłoszenia: ${esc(o.featHave.join(' · '))}</div>` : ''}
        ${o.featMissing?.length ? `<div class="featmiss">Brak wzmianki o: ${esc(o.featMissing.join(', '))}</div>` : ''}
        ${o.notes?.length ? `<ul class="notes">${o.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      </div>`;
}

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

function renderDrop(d) {
  return `
      <div class="offer">
        <a href="${esc(d.url)}" target="_blank"><strong>${esc(d.title)}</strong></a>
        <div class="dropline">↓ obniżka o ${d.dropPct}%: ${esc(zl(d.oldPrice))} → <b>${esc(zl(d.newPrice))}</b> · ${esc(d.portal)}${d.areaM2 ? ` · ${d.areaM2} m²` : ''}</div>
      </div>`;
}

// Strona główna rozwija tylko świeże przebiegi: z ostatnich `days` dni, ale zawsze
// co najmniej `min` najnowszych z treścią (po tygodniach awarii OLX okno bywa puste).
// `runs` muszą być posortowane od najnowszego (tak trzyma je history.json).
export const RECENT_DAYS = 7;
export function splitRuns(runs, nowMs = Date.now(), { days = RECENT_DAYS, min = 3 } = {}) {
  const cut = nowMs - days * 864e5;
  const inWindow = runs.filter(r => new Date(r.at).getTime() >= cut).length;
  const n = Math.max(inWindow, Math.min(min, runs.length));
  return { recent: runs.slice(0, n), older: runs.slice(n) };
}

export function renderReport(CATS, history, statsByCat, negoByCat, trend = []) {
  const renderRun = run => `
    <section>
      <h5 class="run">${esc(new Date(run.at).toLocaleString('pl-PL'))} — ${[run.offers.length ? `nowe: ${run.offers.length}` : '', run.drops.length ? `obniżki: ${run.drops.length}` : ''].filter(Boolean).join(', ')}</h5>
      ${run.offers.map(renderOffer).join('')}
      ${run.drops.map(renderDrop).join('')}
    </section>`;
  const col = ([cat, cfg]) => {
    const s = statsByCat[cat];
    const nego = negoByCat?.[cat] ?? [];
    const runs = history
      .map(run => ({
        at: run.at,
        offers: run.offers.filter(o => (o.cat ?? 'dzialki') === cat),
        drops: (run.drops ?? []).filter(d => (d.cat ?? 'dzialki') === cat),
      }))
      .filter(r => r.offers.length || r.drops.length);
    const { recent, older } = splitRuns(runs);
    const sum = key => older.reduce((n, r) => n + r[key].length, 0);
    return `
  <div class="col" id="cat-${esc(cat)}">
    <h3 class="cat">${cfg.icon} ${esc(cfg.label)}</h3>
    ${s ? `<div class="stats">
      <div>ofert na rynku: <b>${s.count}</b></div>
      ${s.medPrice ? `<div>mediana ceny: <b>${esc(zl(s.medPrice))}</b></div>` : ''}
      ${s.medPpm ? `<div>mediana ceny za m²: <b>${s.medPpm} zł/m²</b> (zakres ${s.minPpm}–${s.maxPpm})</div>` : ''}
      ${s.medArea ? `<div>mediana powierzchni: <b>${s.medArea} m²</b></div>` : ''}
    </div>` : '<div class="stats">brak danych (portal niedostępny w tym przebiegu)</div>'}
    ${renderTrendChart(cat, trend.filter(t => t.cat === cat))}
    ${nego.length ? `<details class="nego"><summary>🤝 Do negocjacji: ${nego.length} — długo na rynku / po obniżkach</summary>
      ${nego.map(o => `
      <div class="offer">
        <a href="${esc(o.url)}" target="_blank">${esc(o.title)}</a>
        <div class="meta">${esc(o.priceText)}${o.pricePerM2 ? ` · ${o.pricePerM2} zł/m²` : ''}${o.dom != null ? ` · na rynku ~${o.dom} dni` : ''}${o.dropPct ? ` · ↓ ${o.dropPct}% od pierwszej znanej ceny` : ''} · ${esc(o.portal)}</div>
      </div>`).join('')}
    </details>` : ''}
    <details><summary>❓ O co zapytać sprzedającego</summary>
      <ul>${cfg.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>
    </details>
    <h4 class="sub">Nowe oferty i obniżki</h4>
    ${runs.length ? recent.map(renderRun).join('') : '<p class="empty">Jeszcze nic nowego się nie pojawiło.</p>'}
    ${older.length ? `<details class="older"><summary>📜 Starsze niż ${RECENT_DAYS} dni: ${sum('offers')} nowych, ${sum('drops')} obniżek (do ${esc(new Date(older[0].at).toLocaleDateString('pl-PL'))})</summary>${older.map(renderRun).join('')}</details>` : ''}
  </div>`;
  };
  // przyklejony pasek: skoki do regionów i kategorii (na telefonie kolumny idą jedna pod drugą)
  const nav = byRegion(CATS).filter(g => g.label).map(g =>
    `<a href="#region-${esc(g.region)}"><b>${esc(REGIONS[g.region]?.short ?? g.label)}</b></a>${g.cats.map(([cat, cfg]) => ` <a href="#cat-${esc(cat)}">${cfg.icon} ${esc(cfg.label.toLowerCase())}</a>`).join('')}`
  ).join(' <span class="sep">·</span> ');
  const total = Object.values(statsByCat).reduce((n, s) => n + (s?.count ?? 0), 0);
  const groups = byRegion(CATS).map(g => `
${g.label ? `<h2 class="region" id="region-${esc(g.region)}">${esc(g.label)}</h2>` : ''}
<div class="cols">
${g.cats.map(col).join('\n')}
</div>`).join('\n');

  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nieruchomości ${esc(areaNames())} — monitor</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:1100px;margin:1.5rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem}
h2.region{font-size:1.3rem;margin:1.8rem 0 .9rem;padding-bottom:.3rem;border-bottom:2px solid #0b57d0}
h3.cat{font-size:1.15rem;margin:.2rem 0 .6rem} h4.sub{font-size:1rem;margin-top:1.4rem}
h5.run{font-size:.9rem;color:#444;border-bottom:1px solid #ddd;padding-bottom:.25rem;margin:1.2rem 0 .4rem}
.updated{color:#777;font-size:.85rem;margin-bottom:.8rem}
.updated a{color:#0b57d0;text-decoration:none}
nav.top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #e3e3e3;margin:0 -1rem 1rem;padding:.45rem 1rem;font-size:.88rem;white-space:nowrap;overflow-x:auto}
nav.top a{color:#0b57d0;text-decoration:none;margin-right:.35rem} nav.top .sep{color:#bbb;margin:0 .3rem}
h2.region,.col{scroll-margin-top:3rem}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem}
@media(max-width:820px){.cols{grid-template-columns:1fr} nav.top{white-space:normal;line-height:1.7} h2.region,.col{scroll-margin-top:4.5rem}}
details.older{margin-top:1.2rem;border-top:1px dashed #ddd;padding-top:.6rem} details.older>summary{color:#555}
.stats{background:#f3f6f9;border-radius:8px;padding:.7rem .9rem;font-size:.92rem;line-height:1.5}
details{margin-top:.7rem;font-size:.9rem} details summary{cursor:pointer;color:#0b57d0}
details ul{margin:.4rem 0 .2rem;padding-left:1.2rem} details li{margin:.25rem 0}
.offer{margin:.8rem 0} .offer a{color:#0b57d0;text-decoration:none} .offer a:hover{text-decoration:underline}
.meta{color:#555;font-size:.88rem;margin-top:.15rem}
.mirrors{font-size:.85rem;color:#555;margin-top:.15rem}
.mirrors a{color:#0b57d0;text-decoration:none}
.verdict{font-size:.9rem;font-weight:600;margin-top:.2rem}
.feat{font-size:.85rem;color:#1a6b2f;margin-top:.15rem}
.featmiss{font-size:.85rem;color:#8a5a00;margin-top:.1rem}
.dropline{font-size:.9rem;color:#1a6b2f;font-weight:600;margin-top:.15rem}
.nego summary{color:#7a4d00}
.notes{margin:.25rem 0 0;padding-left:1.2rem;font-size:.85rem;color:#8a5a00} .notes li{margin:.15rem 0}
.empty{color:#888;font-size:.9rem}
.trend{margin:.8rem 0 0} .trend figcaption{font-size:.85rem;color:#555;margin-bottom:.2rem}
.trend svg{width:100%;height:auto} .trend .ax{font-size:10px;fill:#777} .trend .last{font-size:11px;font-weight:600;fill:#222}
.trend details{margin-top:.2rem} .trendtab td{padding:.1rem .6rem .1rem 0;font-size:.8rem;color:#555}
#tip{position:absolute;background:#222;color:#fff;padding:.2rem .5rem;border-radius:5px;font-size:.78rem;pointer-events:none;white-space:nowrap}
footer{margin-top:3rem;color:#888;font-size:.8rem;line-height:1.5}
</style></head><body>
<h1 id="top">🏡 Nieruchomości ${esc(areaNames())} — monitor</h1>
<div class="updated">Ostatnie sprawdzenie: ${esc(new Date().toLocaleString('pl-PL'))} · OLX + Otodom + Nieruchomosci-online · co godzinę 7:00–22:00</div>
<nav class="top"><a href="#top" title="na górę">⬆</a> ${nav}${nav ? ' <span class="sep">·</span> ' : ''}<a href="wszystkie.html">📋 wszystkie oferty (${total}) →</a></nav>
${groups}
<footer>Oceny „okazja / powyżej mediany" i ostrzeżenia to automatyczne heurystyki liczone względem mediany zł/m² z bieżących ogłoszeń w danym obszarze (${esc(areaNames())} liczone osobno) — pomagają ustalić priorytety, ale nie zastępują weryfikacji oferty. Generowane automatycznie przez zory-monitor.</footer>
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
</body></html>`;
}

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
    <h2>${cfg.icon} ${esc(catHeading(cfg))} — zniknięte w ost. 30 dniach (${recent.length})</h2>
    <div class="stats">z całego archiwum (${all.length}): mediana dni do zniknięcia: <b>${medDays ?? '?'}</b>${medPpm ? ` · mediana końcowej ceny: <b>${medPpm} zł/m²</b>` : ''}</div>
    ${recent.map(a => `
    <div class="offer">
      <a href="${esc(a.url)}" target="_blank">${esc(a.title)}</a>
      <div class="meta">${esc(a.portal)} · ostatnia cena ${esc(zl(a.lastPrice))}${a.areaM2 ? ` · ${a.areaM2} m²` : ''}${a.daysOnMarket != null ? ` · ~${a.daysOnMarket} dni na rynku` : ''} · zniknęła ${esc(String(a.disappearedAt).slice(0, 10))}</div>
    </div>`).join('')}
  </section>`;
  }).join('');
}

// Podstrona-katalog: WSZYSTKIE aktualne oferty, przeglądalne i sortowalne.
export function renderCatalog(CATS, catalogByCat, statsByCat, archive = []) {
  // krótka ocena względem mediany zł/m² (kompaktowa wersja do listy)
  const badge = (o, s) => {
    if (!o.pricePerM2 || !s?.medPpm) return '';
    const r = o.pricePerM2 / s.medPpm;
    const pct = Math.round(Math.abs(1 - r) * 100);
    if (r <= 0.7) return `<span class="b-ok">🟢 ${pct}% taniej niż mediana</span>`;
    if (r <= 0.9) return `<span class="b-ok">🟡 ${pct}% taniej</span>`;
    if (r < 1.1) return '<span class="b-mid">⚪ w normie</span>';
    return `<span class="b-hi">🔴 ${pct}% drożej</span>`;
  };
  const total = Object.values(catalogByCat).reduce((n, a) => n + a.length, 0);
  const secs = Object.entries(CATS).map(([cat, cfg]) => {
    const s = statsByCat[cat];
    const items = [...(catalogByCat[cat] ?? [])].sort((a, b) => (a.pricePerM2 ?? Infinity) - (b.pricePerM2 ?? Infinity));
    return `
  <section>
    <h2>${cfg.icon} ${esc(catHeading(cfg))} (<span class="viscount">${items.length}</span>)</h2>
    ${s ? `<div class="stats">
      <div>mediana ceny: <b>${esc(zl(s.medPrice))}</b> · mediana: <b>${s.medPpm} zł/m²</b> (zakres ${s.minPpm}–${s.maxPpm}) · mediana powierzchni: <b>${s.medArea} m²</b></div>
    </div>` : ''}
    <div class="sorts">Sortuj:
      <button onclick="srt('${cat}','ppm',1)">zł/m² ↑</button>
      <button onclick="srt('${cat}','price',1)">cena ↑</button>
      <button onclick="srt('${cat}','area',-1)">powierzchnia ↓</button>
      <button onclick="srt('${cat}','days',-1)">najdłużej na rynku</button>
    </div>
    <div id="list-${cat}">
      ${items.map(o => `
      <div class="offer" data-ppm="${o.pricePerM2 ?? ''}" data-price="${o.price ?? ''}" data-area="${o.areaM2 ?? ''}" data-days="${o.dom ?? ''}" data-title="${esc(o.title.toLowerCase())}" data-dz="${esc((o.districts ?? [...detectDistricts((o.place ?? '') + ' ' + o.title)]).join(' '))}">
        <a href="${esc(o.url)}" target="_blank"><strong>${esc(o.title)}</strong></a>
        <div class="meta">${esc(o.portal)} · ${esc(o.priceText)}${o.areaM2 ? ` · ${o.areaM2} m²` : ''}${o.pricePerM2 ? ` · ${o.pricePerM2} zł/m²` : ''}${o.place ? ` · ${esc(o.place)}` : ''}${o.dom != null ? ` · ~${o.dom} dni na rynku` : ''}${o.dropPct ? ` · <span class="dr">↓ ${o.dropPct}%</span>` : ''} ${badge(o, s)}</div>
        ${o.mirrors?.length ? `<div class="mirrors">Na portalach: <a href="${esc(o.url)}" target="_blank">${esc(o.portal)}</a>${o.mirrors.map(m => ` · <a href="${esc(m.url)}" target="_blank">${esc(m.portal)}</a>`).join('')}</div>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wszystkie oferty — ${esc(areaNames())}</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:860px;margin:1.5rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem} h2{font-size:1.15rem;margin:1.8rem 0 .5rem}
.updated{color:#777;font-size:.85rem;margin-bottom:1rem}
.updated a{color:#0b57d0;text-decoration:none}
.stats{background:#f3f6f9;border-radius:8px;padding:.6rem .9rem;font-size:.9rem}
.sorts{margin:.6rem 0;font-size:.85rem;color:#555}
.sorts button{margin:0 .2rem;padding:.2rem .6rem;font-size:.8rem;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer}
.sorts button:hover{background:#eef3fb}
.filters{display:flex;flex-wrap:wrap;gap:.5rem .9rem;align-items:center;background:#f3f6f9;border-radius:8px;padding:.55rem .8rem;font-size:.85rem;color:#555;margin-bottom:.6rem}
.filters input,.filters select{padding:.25rem .45rem;border:1px solid #ccc;border-radius:6px;font-size:.85rem}
.filters input[type=number]{width:5.4rem} .filters input[type=search]{width:11rem}
.filters button{padding:.25rem .7rem;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer}
.offer{margin:.7rem 0;padding-bottom:.5rem;border-bottom:1px solid #f0f0f0}
.offer a{color:#0b57d0;text-decoration:none} .offer a:hover{text-decoration:underline}
.meta{color:#555;font-size:.87rem;margin-top:.15rem}
.mirrors{font-size:.85rem;color:#555;margin-top:.15rem}
.mirrors a{color:#0b57d0;text-decoration:none}
.dr{color:#1a6b2f;font-weight:600}
.b-ok{color:#1a6b2f;font-weight:600} .b-mid{color:#888} .b-hi{color:#b3261e}
footer{margin-top:3rem;color:#888;font-size:.8rem}
</style></head><body>
<h1>📋 Wszystkie aktualne oferty (${total}) — ${esc(areaNames())}</h1>
<div class="updated">Stan na ${esc(new Date().toLocaleString('pl-PL'))} · OLX + Otodom + Nieruchomosci-online · <a href="index.html">← wróć do nowości i obniżek</a></div>
<div class="filters">
  <input id="f-q" type="search" placeholder="szukaj w tytule…">
  <span>cena <input id="f-pmin" type="number" placeholder="od"> – <input id="f-pmax" type="number" placeholder="do"> zł</span>
  <span>metraż <input id="f-amin" type="number" placeholder="od"> – <input id="f-amax" type="number" placeholder="do"> m²</span>
  <select id="f-d"><option value="">dzielnica: wszystkie</option>${byRegion(CATS).map(g => {
    const opts = DISTRICT_OPTIONS.filter(d => d.region === g.region);
    return opts.length ? `<optgroup label="${esc(g.label)}">${opts.map(d => `<option value="${esc(d.key)}">${esc(d.label)}</option>`).join('')}</optgroup>` : '';
  }).join('')}</select>
  <button id="f-x">wyczyść</button>
</div>
${secs}
${renderArchive(CATS, archive)}
<footer>Oceny liczone względem mediany zł/m² z bieżących ogłoszeń. „↓ x%" = łączna obniżka od pierwszej zapamiętanej ceny. Dni na rynku wg daty publikacji ogłoszenia.</footer>
<script>
function srt(cat, key, dir) {
  const box = document.getElementById('list-' + cat);
  Array.prototype.slice.call(box.querySelectorAll('.offer')).sort(function (a, b) {
    const va = parseFloat(a.dataset[key]); const vb = parseFloat(b.dataset[key]);
    if (isNaN(va) && isNaN(vb)) return 0;
    if (isNaN(va)) return 1;
    if (isNaN(vb)) return -1;
    return dir * (va - vb);
  }).forEach(function (el) { box.appendChild(el); });
}
const F = ['f-q', 'f-pmin', 'f-pmax', 'f-amin', 'f-amax', 'f-d'].map(function (id) { return document.getElementById(id); });
function applyFilters() {
  const q = F[0].value.trim().toLowerCase(), pmin = +F[1].value, pmax = +F[2].value,
        amin = +F[3].value, amax = +F[4].value, d = F[5].value;
  document.querySelectorAll('[id^="list-"] .offer').forEach(function (el) {
    const price = parseFloat(el.dataset.price), area = parseFloat(el.dataset.area);
    const ok = (!q || (el.dataset.title || '').includes(q))
      && (!pmin || price >= pmin) && (!pmax || price <= pmax)
      && (!amin || area >= amin) && (!amax || area <= amax)
      && (!d || (el.dataset.dz || '').split(' ').indexOf(d) >= 0);
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
</script>
</body></html>`;
}
