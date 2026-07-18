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

// Specificity score for `raw` matching (hostname, pathname), or -1 if it doesn't
// match. More specific = a longer entry hostname (an exact host beats a parent
// domain), then a longer path. hostname length dominates (×1e5) so any path can't
// out-rank a more specific host.
function entryScore(target, hostname, pathname, raw) {
  const entry = parseEntry(raw);
  if (!entry || !entry.hostname) return -1;
  const hostMatches = hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`);
  if (!hostMatches) return -1;
  if (entry.port && entry.port !== target.port) return -1;
  if (entry.path && !(pathname === entry.path || pathname.startsWith(`${entry.path}/`))) return -1;
  return entry.hostname.length * 100000 + (entry.path ? entry.path.length : 0);
}

// Best (most specific) matching entry's score for `url` in `list`, or -1 if none.
function bestScore(url, list) {
  if (!Array.isArray(list) || list.length === 0) return -1;
  let target;
  try { target = new URL(url); } catch { return -1; }
  if (!/^https?:$/.test(target.protocol)) return -1;
  const hostname = target.hostname.toLowerCase();
  const pathname = target.pathname.toLowerCase();
  let best = -1;
  for (const raw of list) {
    const s = entryScore(target, hostname, pathname, raw);
    if (s > best) best = s;
  }
  return best;
}

// Does `url` match any bare-domain / domain+path entry in `list`? Shared by both
// the blocklist and the allowlist (same host/path semantics).
export function matchesList(url, list) {
  return bestScore(url, list) >= 0;
}

// A site is blocked when the MOST SPECIFIC matching rule across both lists is a
// block rule. The allowlist re-enables a host/path that a broader block rule (a
// parent domain, or a path prefix) would otherwise catch; a still-more-specific
// block rule (e.g. an exact sub-host under an allowed parent) wins back over it.
// On an exact tie the allow wins (an explicit same-target re-enable). `allowlist`
// is optional so existing 2-arg callers are unchanged.
export function isBlocked(url, blocklist, allowlist = []) {
  const block = bestScore(url, blocklist);
  if (block < 0) return false;
  const allow = bestScore(url, allowlist);
  if (allow < 0) return true;
  return block > allow;
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
    // Want ON (not blocked): drop our exact block; if a broader rule still blocks,
    // add an exact-host allow (more specific → wins). Otherwise clean a stray allow.
    dropExact(bl);
    if (isBlocked(url, bl, al)) { if (!al.includes(host)) al.push(host); } else dropExact(al);
  } else {
    // Want OFF (blocked): drop our exact allow; if nothing blocks yet (incl. a
    // parent allow winning), add an exact-host block (most specific → wins).
    dropExact(al);
    if (!isBlocked(url, bl, al)) bl.push(host);
  }
  return { blocklist: bl, allowlist: al };
}
