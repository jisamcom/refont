// URL helpers for site scoping. Blocklist entries support a bare domain or a
// domain + path prefix, e.g. "google.com" or "docs.google.com/spreadsheets".

const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' };
// A URL's effective port: the explicit one, or the protocol default. The URL API
// normalises a default port (:443 on https, :80 on http) to '', so this is what a
// port-scoped rule must be compared against.
function effectivePort(u) { return u.port || DEFAULT_PORTS[u.protocol] || ''; }

// Parse a rule string into { hostname, port, path }. The explicit port is read
// from the raw text (not via URL.port, which drops default ports) so `example.com:443`
// keeps its :443 constraint and a pasted `https://…:443` doesn't silently become an
// all-ports rule. An empty port means "any port".
function parseEntry(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  const scheme = value.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  const rest = scheme ? value.slice(scheme[0].length) : value;
  // The authority ends at the FIRST of / ? # — so a pasted URL whose port is
  // followed directly by a query/hash (example.com:443?x=1) doesn't fold the
  // query into the authority and lose the port.
  const cut = rest.search(/[/?#]/);
  const authority = (cut >= 0 ? rest.slice(0, cut) : rest).replace(/^\*\./, '');
  let path = '';
  if (cut >= 0 && rest[cut] === '/') {
    const pathPart = rest.slice(cut);
    const qh = pathPart.search(/[?#]/);
    path = (qh >= 0 ? pathPart.slice(0, qh) : pathPart).replace(/\/+$/, '');
  }
  const portMatch = authority.match(/:(\d{1,5})$/);
  const port = portMatch ? portMatch[1] : '';
  const hostRaw = portMatch ? authority.slice(0, authority.length - portMatch[0].length) : authority;
  let hostname;
  try { hostname = new URL(`http://${hostRaw}`).hostname; } catch { return null; }
  if (!hostname) return null;
  return { hostname, port, path };
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
function entryScore(tport, hostname, pathname, raw) {
  const entry = parseEntry(raw);
  if (!entry || !entry.hostname) return -1;
  const hostMatches = hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`);
  if (!hostMatches) return -1;
  if (entry.port && entry.port !== tport) return -1;
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
  const tport = effectivePort(target);
  let best = -1;
  for (const raw of list) {
    const s = entryScore(tport, hostname, pathname, raw);
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
// Canonical form of a rule string (hostname[:port][/path]), matching how
// matchesList compares — lowercased, trailing slashes stripped. Two differently
// spelled rules for the same target (uppercase path, a pasted full URL, a trailing
// slash, an explicit :443) canonicalize equal. null if unparseable.
function canonOf(raw) {
  const e = parseEntry(raw);
  if (!e || !e.hostname) return null;
  return e.hostname + (e.port ? `:${e.port}` : '') + (e.path || '');
}

export function computeSiteToggle(url, enable, blocklist = [], allowlist = []) {
  const bl = Array.isArray(blocklist) ? blocklist.slice() : [];
  const al = Array.isArray(allowlist) ? allowlist.slice() : [];
  let u;
  try { u = new URL(url); } catch { return { blocklist: bl, allowlist: al }; }
  const hostname = u.hostname.toLowerCase();
  const eport = effectivePort(u); // default-filled, so :443/:80 rules are addressable
  const portHost = `${hostname}:${eport}`;
  const pathLower = u.pathname.toLowerCase().replace(/\/+$/, '');
  // The entries that canonically identify this page, ordered least → most specific
  // (host < host/path < host:port < host:port/path). Both the portless and the
  // port-qualified forms are candidates, so a rule written either way (or a page on
  // a default port, where matching uses the effective port) can be removed or beaten.
  const keys = [hostname];
  if (pathLower) keys.push(`${hostname}${pathLower}`);
  keys.push(portHost);
  if (pathLower) keys.push(`${portHost}${pathLower}`);
  const pathKey = keys[keys.length - 1]; // most specific — the guaranteed-winning fallback
  // Remove ONLY the entries that canonicalize to one of our page keys (compared
  // canonically, so casing/format differences still match). A user's broader
  // parent/prefix rules are left intact so sibling paths keep their state.
  const without = (list, drop) => list.filter((e) => !drop.includes(canonOf(e)));
  // Add a canonical key unless an equivalent entry is already present.
  const addKey = (list, key) => (list.some((e) => canonOf(e) === key) ? list : list.concat(key));
  const want = typeof enable === 'boolean' ? enable : isBlocked(url, bl, al);
  if (want) {
    // Want ON (not blocked): drop our exact blocks; if a broader rule still blocks,
    // add the least-specific allow exception that wins — WITHOUT dropping existing
    // allows (an exact-host allow may still be re-enabling sibling paths).
    const nbl = without(bl, keys);
    if (!isBlocked(url, nbl, al)) return { blocklist: nbl, allowlist: al };
    for (const key of keys) {
      const nal = addKey(al, key);
      if (!isBlocked(url, nbl, nal)) return { blocklist: nbl, allowlist: nal };
    }
    return { blocklist: nbl, allowlist: addKey(al, pathKey) };
  }
  // Want OFF (blocked): drop our exact allows (incl. one that exactly re-enabled
  // this page); if nothing blocks yet, add the least-specific block that wins,
  // preserving existing blocks.
  const nal = without(al, keys);
  if (isBlocked(url, bl, nal)) return { blocklist: bl, allowlist: nal };
  for (const key of keys) {
    const nbl = addKey(bl, key);
    if (isBlocked(url, nbl, nal)) return { blocklist: nbl, allowlist: nal };
  }
  return { blocklist: addKey(bl, pathKey), allowlist: nal };
}
