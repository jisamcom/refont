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

// The nearest same-origin ancestor frame's full URL, or '' if none is reachable.
// about:blank/srcdoc frames inherit the embedder's origin, so parent/top are
// same-origin and readable; a cross-origin ancestor throws and is skipped. The
// full URL (path included) is what makes path-scoped rules work in opaque frames
// and lets them observe a parent SPA route change.
function sameOriginAncestorHref(win) {
  if (!win) return '';
  for (const key of ['parent', 'top']) {
    try {
      const w = win[key];
      if (w && w !== win) {
        const h = String(w.location.href || ''); // throws for a cross-origin ancestor
        if (/^https?:\/\//i.test(h)) return h;
      }
    } catch {}
  }
  return '';
}

export function effectivePageUrl(loc = globalThis.location, doc = globalThis.document, win = globalThis) {
  const href = String((loc && loc.href) || '');
  let blobOrigin = '';
  try {
    const u = new URL(href);
    if (/^https?:$/.test(u.protocol)) return u.href;
    if (u.protocol === 'blob:' && u.origin && u.origin !== 'null') blobOrigin = u.origin;
  } catch {}

  // Opaque frame (about:blank / srcdoc / blob): prefer a same-origin ancestor's
  // full URL (path included) so path-scoped rules match and a parent SPA route
  // change is observable. A blob's own creator origin is the next-best value —
  // ahead of the origin-only ancestorOrigins/referrer fallbacks below.
  const inherited = sameOriginAncestorHref(win);
  if (inherited) return inherited;
  if (blobOrigin) return blobOrigin;

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

// Does `url` match any bare-domain / domain+path entry in `list`? Shared by both
// the blocklist and the allowlist (same host/path semantics).
export function matchesList(url, list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  let target;
  try { target = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(target.protocol)) return false;

  const hostname = target.hostname.toLowerCase();
  const pathname = target.pathname.toLowerCase();
  return list.some((raw) => {
    const entry = parseEntry(raw);
    if (!entry || !entry.hostname) return false;
    const hostMatches = hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`);
    if (!hostMatches) return false;
    if (entry.port && entry.port !== target.port) return false;
    return !entry.path || pathname === entry.path || pathname.startsWith(`${entry.path}/`);
  });
}

// A site is blocked when the blocklist matches AND the allowlist does not. The
// allowlist re-enables a specific host/path that a broader block rule (a parent
// domain, or a path prefix) would otherwise catch — without narrowing the block
// for siblings. `allowlist` is optional so existing 2-arg callers are unchanged.
export function isBlocked(url, blocklist, allowlist = []) {
  return matchesList(url, blocklist) && !matchesList(url, allowlist);
}

// Pure list math for the site on/off toggle. `enable` is the DESIRED state, so a
// site blocked by a broader rule can be undone instead of gaining a redundant
// exact-host block:
//   enable=true  → drop an exact-host block; if a parent/path rule still catches
//                  the URL, add a host allow-exception (which overrides the block).
//   enable=false → drop any allow-exception; if nothing blocks the URL yet, add
//                  an exact-host block.
// Only OUR exact-host entries are ever added/removed — a user's parent/path rules
// are never widened or deleted. Returns the next {blocklist, allowlist}; an
// unparseable URL is a no-op.
export function computeSiteToggle(url, enable, blocklist = [], allowlist = []) {
  const bl = Array.isArray(blocklist) ? blocklist.slice() : [];
  const al = Array.isArray(allowlist) ? allowlist.slice() : [];
  let host = '';
  try { host = new URL(url).host.toLowerCase(); } catch { return { blocklist: bl, allowlist: al }; }
  const want = typeof enable === 'boolean' ? enable : isBlocked(url, bl, al);
  const dropExact = (list) => { const i = list.indexOf(host); if (i >= 0) list.splice(i, 1); };
  if (want) {
    dropExact(bl);
    if (matchesList(url, bl)) { if (!al.includes(host)) al.push(host); } else dropExact(al);
  } else {
    dropExact(al);
    if (!matchesList(url, bl)) bl.push(host);
  }
  return { blocklist: bl, allowlist: al };
}
