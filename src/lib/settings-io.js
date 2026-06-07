// src/lib/settings-io.js
import { DEFAULTS, migrate } from './storage.js';

export function serializeSettings(settings) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = settings[k];
  return JSON.stringify(out, null, 2);
}
// Run the imported JSON through migrate() — exactly like a stored object — so an
// older export is schema-upgraded on import (e.g. schema 4 converts px
// letter/word-spacing to em). Without this, the import flow stamps the current
// schema version onto un-migrated values, silently misinterpreting them.
export function parseSettings(json) {
  const obj = JSON.parse(json); // throws on invalid JSON
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('invalid settings');
  return migrate(obj);
}
