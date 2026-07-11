// URL helpers for site scoping. Blocklist entries support a bare domain or a
// domain + path prefix, e.g. "google.com" or "docs.google.com/spreadsheets".

function parseEntry(raw) {
  let value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      const u = new URL(value);
      return { hostname: u.hostname, port: u.port, path: u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '') };
    }
  } catch { return null; }

  const slash = value.indexOf('/');
  const hostPart = slash >= 0 ? value.slice(0, slash) : value;
  const path = slash >= 0 ? value.slice(slash).replace(/\/+$/, '') : '';
  try {
    const u = new URL(`http://${hostPart.replace(/^\*\./, '')}`);
    return { hostname: u.hostname, port: u.port, path };
  } catch { return null; }
}

export function effectivePageUrl(loc = globalThis.location, doc = globalThis.document) {
  const href = String((loc && loc.href) || '');
  try {
    const u = new URL(href);
    if (/^https?:$/.test(u.protocol)) return u.href;
    if (u.protocol === 'blob:' && u.origin && u.origin !== 'null') return u.origin;
  } catch {}

  try {
    const origins = loc && loc.ancestorOrigins;
    if (origins && origins.length && /^https?:\/\//i.test(origins[0])) return origins[0];
  } catch {}
  try {
    const referrer = String((doc && doc.referrer) || '');
    if (/^https?:\/\//i.test(referrer)) return referrer;
  } catch {}
  return href;
}

export function isBlocked(url, blocklist) {
  if (!Array.isArray(blocklist) || blocklist.length === 0) return false;
  let target;
  try { target = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(target.protocol)) return false;

  const hostname = target.hostname.toLowerCase();
  const pathname = target.pathname.toLowerCase();
  return blocklist.some((raw) => {
    const entry = parseEntry(raw);
    if (!entry || !entry.hostname) return false;
    const hostMatches = hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`);
    if (!hostMatches) return false;
    if (entry.port && entry.port !== target.port) return false;
    return !entry.path || pathname === entry.path || pathname.startsWith(`${entry.path}/`);
  });
}
