// Renderowanie HTML raportu i katalogu — czyste funkcje string → string.
// Wydzielone z monitor.mjs bez zmian logiki. Testy: render.test.mjs.

import { median } from './dedup.mjs';

export const zl = v => (v == null ? '?' : Number(v).toLocaleString('pl-PL') + ' zł');

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

function renderDrop(d) {
  return `
      <div class="offer">
        <a href="${esc(d.url)}" target="_blank"><strong>${esc(d.title)}</strong></a>
        <div class="dropline">↓ obniżka o ${d.dropPct}%: ${esc(zl(d.oldPrice))} → <b>${esc(zl(d.newPrice))}</b> · ${esc(d.portal)}${d.areaM2 ? ` · ${d.areaM2} m²` : ''}</div>
      </div>`;
}

export function renderReport(CATS, history, statsByCat, negoByCat) {
  const cols = Object.entries(CATS).map(([cat, cfg]) => {
    const s = statsByCat[cat];
    const nego = negoByCat?.[cat] ?? [];
    const runs = history
      .map(run => ({
        at: run.at,
        offers: run.offers.filter(o => (o.cat ?? 'dzialki') === cat),
        drops: (run.drops ?? []).filter(d => (d.cat ?? 'dzialki') === cat),
      }))
      .filter(r => r.offers.length || r.drops.length);
    return `
  <div class="col">
    <h2>${cfg.icon} ${esc(cfg.label)}</h2>
    ${s ? `<div class="stats">
      <div>ofert na rynku: <b>${s.count}</b></div>
      ${s.medPrice ? `<div>mediana ceny: <b>${esc(zl(s.medPrice))}</b></div>` : ''}
      ${s.medPpm ? `<div>mediana ceny za m²: <b>${s.medPpm} zł/m²</b> (zakres ${s.minPpm}–${s.maxPpm})</div>` : ''}
      ${s.medArea ? `<div>mediana powierzchni: <b>${s.medArea} m²</b></div>` : ''}
    </div>` : '<div class="stats">brak danych (portal niedostępny w tym przebiegu)</div>'}
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
    <h3>Nowe oferty i obniżki</h3>
    ${runs.length ? runs.map(run => `
    <section>
      <h4>${esc(new Date(run.at).toLocaleString('pl-PL'))} — ${[run.offers.length ? `nowe: ${run.offers.length}` : '', run.drops.length ? `obniżki: ${run.drops.length}` : ''].filter(Boolean).join(', ')}</h4>
      ${run.offers.map(renderOffer).join('')}
      ${run.drops.map(renderDrop).join('')}
    </section>`).join('') : '<p class="empty">Jeszcze nic nowego się nie pojawiło.</p>'}
  </div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nieruchomości Żory — monitor</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:1100px;margin:1.5rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem} h2{font-size:1.15rem;margin:.2rem 0 .6rem} h3{font-size:1rem;margin-top:1.4rem}
h4{font-size:.9rem;color:#444;border-bottom:1px solid #ddd;padding-bottom:.25rem;margin:1.2rem 0 .4rem}
.updated{color:#777;font-size:.85rem;margin-bottom:1.2rem}
.updated a{color:#0b57d0;text-decoration:none}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem}
@media(max-width:820px){.cols{grid-template-columns:1fr}}
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
footer{margin-top:3rem;color:#888;font-size:.8rem;line-height:1.5}
</style></head><body>
<h1>🏡 Nieruchomości w Żorach — monitor</h1>
<div class="updated">Ostatnie sprawdzenie: ${esc(new Date().toLocaleString('pl-PL'))} · OLX + Otodom + Nieruchomosci-online · co godzinę 7:00–22:00 · <a href="wszystkie.html">📋 wszystkie oferty (${Object.values(statsByCat).reduce((n, s) => n + (s?.count ?? 0), 0)}) →</a></div>
<div class="cols">
${cols}
</div>
<footer>Oceny „okazja / powyżej mediany" i ostrzeżenia to automatyczne heurystyki liczone względem mediany zł/m² z bieżących ogłoszeń w Żorach — pomagają ustalić priorytety, ale nie zastępują weryfikacji oferty. Generowane automatycznie przez zory-monitor.</footer>
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
    <h2>${cfg.icon} ${esc(cfg.label)} (${items.length})</h2>
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
      <div class="offer" data-ppm="${o.pricePerM2 ?? ''}" data-price="${o.price ?? ''}" data-area="${o.areaM2 ?? ''}" data-days="${o.dom ?? ''}">
        <a href="${esc(o.url)}" target="_blank"><strong>${esc(o.title)}</strong></a>
        <div class="meta">${esc(o.portal)} · ${esc(o.priceText)}${o.areaM2 ? ` · ${o.areaM2} m²` : ''}${o.pricePerM2 ? ` · ${o.pricePerM2} zł/m²` : ''}${o.place ? ` · ${esc(o.place)}` : ''}${o.dom != null ? ` · ~${o.dom} dni na rynku` : ''}${o.dropPct ? ` · <span class="dr">↓ ${o.dropPct}%</span>` : ''} ${badge(o, s)}</div>
        ${o.mirrors?.length ? `<div class="mirrors">Na portalach: <a href="${esc(o.url)}" target="_blank">${esc(o.portal)}</a>${o.mirrors.map(m => ` · <a href="${esc(m.url)}" target="_blank">${esc(m.portal)}</a>`).join('')}</div>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wszystkie oferty — Żory</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:860px;margin:1.5rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem} h2{font-size:1.15rem;margin:1.8rem 0 .5rem}
.updated{color:#777;font-size:.85rem;margin-bottom:1rem}
.updated a{color:#0b57d0;text-decoration:none}
.stats{background:#f3f6f9;border-radius:8px;padding:.6rem .9rem;font-size:.9rem}
.sorts{margin:.6rem 0;font-size:.85rem;color:#555}
.sorts button{margin:0 .2rem;padding:.2rem .6rem;font-size:.8rem;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer}
.sorts button:hover{background:#eef3fb}
.offer{margin:.7rem 0;padding-bottom:.5rem;border-bottom:1px solid #f0f0f0}
.offer a{color:#0b57d0;text-decoration:none} .offer a:hover{text-decoration:underline}
.meta{color:#555;font-size:.87rem;margin-top:.15rem}
.mirrors{font-size:.85rem;color:#555;margin-top:.15rem}
.mirrors a{color:#0b57d0;text-decoration:none}
.dr{color:#1a6b2f;font-weight:600}
.b-ok{color:#1a6b2f;font-weight:600} .b-mid{color:#888} .b-hi{color:#b3261e}
footer{margin-top:3rem;color:#888;font-size:.8rem}
</style></head><body>
<h1>📋 Wszystkie aktualne oferty w Żorach (${total})</h1>
<div class="updated">Stan na ${esc(new Date().toLocaleString('pl-PL'))} · OLX + Otodom + Nieruchomosci-online · <a href="index.html">← wróć do nowości i obniżek</a></div>
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
</script>
</body></html>`;
}
