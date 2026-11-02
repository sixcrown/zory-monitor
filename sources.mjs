// Kształt konfiguracji źródeł kategorii (CATS w monitor.mjs) — czyste helpery, bez I/O.
// Źródło portalu może być pojedyncze albo listą (Rybnik: miasto + Świerklany).
// Testy: sources.test.mjs.

import { createHash } from 'node:crypto';

export const olxUrls = cfg => [].concat(cfg.olx ?? []);
export const noSources = cfg => (Array.isArray(cfg.no) ? cfg.no : [{ url: cfg.no, pages: cfg.noPages, locality: cfg.noLocality }]);

const SOURCE_CFG = {
  // „curl" = znacznik transportu: po przejściu OLX-a na curl.exe (2026-11-02) pierwsza udana
  // odpowiedź po tygodniach 403 ma zapamiętać zaległe oferty po cichu, nie jako lawinę nowości
  'OLX': cfg => [olxUrls(cfg), 'curl'],
  'Otodom': cfg => [cfg.otodom, cfg.otodomPages ?? null],
  'N-O.pl': cfg => noSources(cfg),
};

// Odcisk konfiguracji źródła. Zmiana (nowy URL, dodatkowa miejscowość, więcej stron) oznacza,
// że pierwszy udany przebieg po niej zapamiętuje nieznane oferty po cichu (baseline),
// zamiast zgłaszać je jako nowości.
export function sourceHash(portal, cfg) {
  const json = JSON.stringify(SOURCE_CFG[portal](cfg), (_, v) => (v instanceof RegExp ? String(v) : v));
  return createHash('sha1').update(json).digest('hex').slice(0, 12);
}
