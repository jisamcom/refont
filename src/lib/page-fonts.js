// src/lib/page-fonts.js
// Pure helpers for building the "fonts in use on this page" list.
import { sanitizeFamilyName } from './engine.js';

// Record a page font in a recency-ordered Map with a hard cap (LRU eviction).
// The read pass captures each element's ORIGINAL family (before Refont overrides
// it), and in a long-lived SPA that set only ever grew — so once it hit the cap,
// newly-seen fonts were silently dropped. LRU keeps the most-recently-seen fonts
// instead: re-seeing a family refreshes its recency, and the oldest is evicted
// past the cap. Bounds memory and prevents new-font starvation.
export function rememberFamily(map, key, value, cap) {
  if (map.has(key)) map.delete(key); // re-insert to move to the most-recent end
  map.set(key, value);
  while (map.size > cap) map.delete(map.keys().next().value); // evict least-recent
}

// '"Font Awesome 6 Free", sans-serif' -> 'Font Awesome 6 Free'
export function firstFamilyToken(fontFamily) {
  const first = String(fontFamily || '').split(',')[0] || '';
  return sanitizeFamilyName(first.replace(/^["']|["']$/g, ''));
}

// rawFamilies: array of computed `font-family` strings (one per element).
// isProtectedFn: (name) => boolean. Returns deduped [{name, protected}], capped.
// exclude: family names to drop — used to hide Refont's OWN applied body/code
// font, which would otherwise show up since we read computed styles after apply.
export function dedupeClassify(rawFamilies, isProtectedFn, cap = 40, exclude = []) {
  const skip = new Set((exclude || []).map((e) => firstFamilyToken(e).toLowerCase()).filter(Boolean));
  const seen = new Map(); // lowercased name -> {name, protected}
  for (const raw of rawFamilies || []) {
    const name = firstFamilyToken(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (skip.has(key) || seen.has(key)) continue;
    seen.set(key, { name, protected: !!isProtectedFn(name) });
    if (seen.size >= cap) break;
  }
  return [...seen.values()];
}
