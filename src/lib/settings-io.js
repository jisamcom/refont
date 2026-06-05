// src/lib/settings-io.js
import { DEFAULTS } from './storage.js';

export function serializeSettings(settings) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = settings[k];
  return JSON.stringify(out, null, 2);
}
export function parseSettings(json) {
  const obj = JSON.parse(json); // throws on invalid
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (k in obj) out[k] = obj[k];
  return { ...DEFAULTS, ...out };
}
