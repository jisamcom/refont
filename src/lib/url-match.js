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
// domain), then a port-qualified rule over an all-ports one, then a longer path.
// hostname length dominates, then the port bonus, so neither the port nor any
// bounded path can out-rank a more specific host. (Storage caps rules to a few
// hundred chars, well under the port bonus, so the ordering is total.)
function entryScore(target, hostname, pathname, raw) {
  const entry = parseEntry(raw);
  if (!entry || !entry.hostname) return -1;
  const hostMatches = hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`);
  if (!hostMatches) return -1;
  if (entry.port && entry.port !== target.port) return -1;
  if (entry.path && !(pathname === entry.path || pathname.startsWith(`${entry.path}/`))) return -1;
  return entry.hostname.length * 1000000 + (entry.port ? 500000 : 0) + (entry.path ? entry.path.length : 0);
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

// Pure list math for the site on/off toggle. `enable` is the DESIRED state, and
// the result is GUARANTEED to satisfy it — isBlocked(url, next) === !enable — even
// when a path- or port-scoped rule is the most specific match. We drop our own
// exact-host / exact-host+path entries for this URL, then, if the state hasn't
// flipped, add the LEAST specific exception that out-ranks the top opposing rule:
// the host first, escalating to host+path only when a more specific rule needs to
// be beaten. A user's broader parent/prefix rules are never widened or deleted.
// An unparseable URL is a no-op.
export function computeSiteToggle(url, enable, blocklist = [], allowlist = []) {
  const bl = Array.isArray(blocklist) ? blocklist.slice() : [];
  const al = Array.isArray(allowlist) ? allowlist.slice() : [];
  let u;
  try { u = new URL(url); } catch { return { blocklist: bl, allowlist: al }; }
  const host = u.host.toLowerCase();
  const path = u.pathname.replace(/\/+$/, '');
  const hostPath = path ? `${host}${path}` : host;
  // The entries we own for this page (exact host, and exact host+path). Ordered
  // least → most specific so we add the smallest exception that does the job.
  const keys = hostPath === host ? [host] : [host, hostPath];
  const without = (list) => list.filter((e) => !keys.includes(String(e).trim().toLowerCase()));
  const want = typeof enable === 'boolean' ? enable : isBlocked(url, bl, al);
  if (want) {
    // Want ON (not blocked): drop our exact blocks; if a broader rule still blocks,
    // add the least-specific allow exception that wins.
    const nbl = without(bl);
    if (!isBlocked(url, nbl, al)) return { blocklist: nbl, allowlist: without(al) };
    for (const key of keys) {
      const nal = without(al).concat(key);
      if (!isBlocked(url, nbl, nal)) return { blocklist: nbl, allowlist: nal };
    }
    return { blocklist: nbl, allowlist: without(al).concat(hostPath) };
  }
  // Want OFF (blocked): drop our exact allows (incl. one that exactly re-enabled
  // this page); if nothing blocks yet, add the least-specific block that wins.
  const nal = without(al);
  if (isBlocked(url, bl, nal)) return { blocklist: bl, allowlist: nal };
  for (const key of keys) {
    const nbl = without(bl).concat(key);
    if (isBlocked(url, nbl, nal)) return { blocklist: nbl, allowlist: nal };
  }
  return { blocklist: without(bl).concat(hostPath), allowlist: nal };
}
