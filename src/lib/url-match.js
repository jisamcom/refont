// Pure: decide if a URL is on the disable blocklist.
// An entry matches if it is a substring of the host, or of host+pathname.
export function isBlocked(url, blocklist) {
  if (!Array.isArray(blocklist) || blocklist.length === 0) return false;
  let host = '';
  let hostPath = '';
  try {
    const u = new URL(url);
    host = u.host.toLowerCase();
    hostPath = (u.host + u.pathname).toLowerCase();
  } catch {
    return false;
  }
  return blocklist.some((raw) => {
    const e = String(raw).trim().toLowerCase();
    if (!e) return false;
    return host.includes(e) || hostPath.includes(e);
  });
}
