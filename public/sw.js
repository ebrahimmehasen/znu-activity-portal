/*
 * Service worker for the PWA (plan §6.1, §7).
 * - Build assets (/_next/static, hashed) are cache-first.
 * - Only the QR pages are kept for offline use; they render no personal data on the
 *   server, the QR comes from the phone's saved copy. They load network-first.
 * - Any other page that can't load offline falls back to /offline.
 * Bump VERSION to drop old caches.
 */
const VERSION = "v1";
const STATIC_CACHE = `znu-static-${VERSION}`;
const PAGES_CACHE = `znu-pages-${VERSION}`;
const OFFLINE_PAGES = ["/portal/qr", "/dashboard/my-qr"];
const FALLBACK = "/offline";
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(warm([FALLBACK]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("znu-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  const { type, paths } = event.data || {};
  if (type === "warm" && Array.isArray(paths)) {
    event.waitUntil(warm(paths.filter((p) => OFFLINE_PAGES.includes(p))));
  }
});

/** Stores a page and every build asset it references. */
async function warm(paths) {
  const pages = await caches.open(PAGES_CACHE);
  const statics = await caches.open(STATIC_CACHE);
  for (const path of paths) {
    try {
      const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok || res.redirected) continue;
      // The fallback holds no user data, so it lives with the build assets and survives logout.
      await (path === FALLBACK ? statics : pages).put(path, res.clone());
      const html = await res.text();
      const assets = new Set();
      for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)]+/g)) assets.add(m[0]);
      for (const m of html.matchAll(/["'(]static\/(?:chunks|css|media)\/[^"'\s\\)]+/g)) assets.add(`/_next/${m[0].slice(1)}`);
      await Promise.all(
        [...assets].map(async (url) => {
          if (await statics.match(url)) return;
          const r = await fetch(url).catch(() => null);
          if (r && r.ok) await statics.put(url, r);
        }),
      );
    } catch {
      // Offline or server error: keep whatever was cached before.
    }
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode !== "navigate") return;

  if (OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
          // A redirect means the session ended: don't keep the login page as the QR page.
          if (res.ok && !res.redirected) await cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (await cache.match(url.pathname)) || (await caches.match(FALLBACK)) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(async () => (await caches.match(FALLBACK)) || Response.error()),
  );
});
