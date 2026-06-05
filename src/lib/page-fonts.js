// src/lib/page-fonts.js
// Pure helpers for building the "fonts in use on this page" list.
import { sanitizeFamilyName } from './engine.js';

// '"Font Awesome 6 Free", sans-serif' -> 'Font Awesome 6 Free'
export function firstFamilyToken(fontFamily) {
  const first = String(fontFamily || '').split(',')[0] || '';
  return sanitizeFamilyName(first.replace(/^["']|["']$/g, ''));
}

// rawFamilies: array of computed `font-family` strings (one per element).
// isProtectedFn: (name) => boolean. Returns deduped [{name, protected}], capped.
export function dedupeClassify(rawFamilies, isProtectedFn, cap = 40) {
  const seen = new Map(); // lowercased name -> {name, protected}
  for (const raw of rawFamilies || []) {
    const name = firstFamilyToken(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { name, protected: !!isProtectedFn(name) });
    if (seen.size >= cap) break;
  }
  return [...seen.values()];
}
