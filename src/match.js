// URL -> app lookup. Shared by the content script and the tests.
(function (root) {
  const LOCALE = /^[a-z]{2}(?:[-_][a-z0-9]{2,4})?$/;

  // A rule is "host" or "host/path". Host rules match the host and its subdomains.
  // Path rules match the path, or the path after up to two leading locale segments
  // (adobe.com/products/photoshop matches /de/products/photoshop.html).
  function parseRule(rule) {
    const i = rule.indexOf("/");
    if (i < 0) return { host: rule, path: "" };
    let path = rule.slice(i);
    try { path = decodeURIComponent(path); } catch {}
    return { host: rule.slice(0, i), path };
  }

  function buildIndex(apps) {
    const index = {};
    apps.forEach((app, n) => {
      for (const rule of app.match) {
        const { host, path } = parseRule(rule);
        (index[host] ||= []).push([path, n]);
      }
    });
    for (const rules of Object.values(index)) rules.sort((a, b) => b[0].length - a[0].length);
    return index;
  }

  function pathMatches(path, rulePath) {
    if (!rulePath) return true;
    if (!path.startsWith(rulePath)) return false;
    const next = path.charAt(rulePath.length);
    return next === "" || next === "/" || next === ".";
  }

  // Microsoft Store pages: /store/detail/name/ID, /detail/name/ID and /detail/ID all mean /detail/id.
  const STORE = /^(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?(?:\/store)?\/detail(?:\/[^/]+)?\/(9[0-9a-z]{11}|xp[0-9a-z]{12})$/;

  function candidatePaths(host, pathname) {
    let p = pathname.toLowerCase();
    try { p = decodeURIComponent(p); } catch {}
    p = p.replace(/\/+$/, "") || "/";
    if (host === "apps.microsoft.com") {
      const m = p.match(STORE);
      if (m) return [`/detail/${m[1]}`];
    }
    const out = [p];
    // Up to two locale segments: /de/..., /us/en/...
    for (let i = 0; i < 2; i++) {
      const m = out[out.length - 1].match(/^\/([^/]+)(\/.*)?$/);
      if (!m || !LOCALE.test(m[1])) break;
      out.push(m[2] || "/");
    }
    return out;
  }

  // Returns the app index for a URL, or -1. The most specific host wins, then the longest path.
  function lookup(index, url) {
    let u;
    try { u = new URL(url); } catch { return -1; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return -1;
    const hostname = u.hostname.toLowerCase().replace(/\.$/, "");
    const labels = hostname.split(".");
    const paths = candidatePaths(hostname, u.pathname);
    for (let i = 0; i < labels.length - 1; i++) {
      const rules = index[labels.slice(i).join(".")];
      if (!rules) continue;
      for (const [rulePath, n] of rules) {
        if (paths.some((p) => pathMatches(p, rulePath))) return n;
      }
    }
    return -1;
  }

  root.BetterHereMatch = { parseRule, buildIndex, lookup };
})(globalThis);
