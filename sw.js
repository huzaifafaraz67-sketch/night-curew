/* sw.js \u2014 service worker for I WILL FIND YOU.
   Makes the game fully playable OFFLINE: after the first successful load it
   caches every local file AND the Three.js engine pulled from the CDN, so no
   further network access is required.

   NOTE: service workers only run over http(s) or http://localhost \u2014 not from
   a file:// double-click. Start a tiny local server (see README) and the SW
   installs itself; from then on you can go fully offline.  */

const VERSION = 'iwfy-v1';
const CORE = 'iwfy-core-' + VERSION;   // our own files
const LIB  = 'iwfy-lib-'  + VERSION;   // third-party engine (CDN)

/* local files that make up the game */
const LOCAL = [
  './',
  './index.html',
  './style.css',
  './logic.js',
  './4k.js',
  './manifest.json',
  './srm/config.js',
  './srm/save.js',
  './srm/graphics.js',
  './srm/hud.js',
  './srm/animation.js',
  './srm/audio.js',
  './srm/move.js',
  './srm/control.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

/* the exact engine files the game imports from jsDelivr */
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const ENGINE = [
  CDN_BASE + 'build/three.module.js',
  CDN_BASE + 'examples/jsm/controls/PointerLockControls.js',
  CDN_BASE + 'examples/jsm/postprocessing/EffectComposer.js',
  CDN_BASE + 'examples/jsm/postprocessing/RenderPass.js',
  CDN_BASE + 'examples/jsm/postprocessing/UnrealBloomPass.js',
  CDN_BASE + 'examples/jsm/postprocessing/ShaderPass.js',
  CDN_BASE + 'examples/jsm/postprocessing/OutputPass.js',
  CDN_BASE + 'examples/jsm/postprocessing/GTAOPass.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const core = await caches.open(CORE);
    await core.addAll(LOCAL);
    /* engine: fetch permissively so a hiccup on one file never aborts install */
    const lib = await caches.open(LIB);
    await Promise.all(ENGINE.map(async (u) => {
      try {
        const res = await fetch(u, { mode: 'cors' });
        if (res && (res.ok || res.type === 'opaque')) await lib.put(u, res.clone());
      } catch (err) { /* will be cached on first runtime use instead */ }
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k !== CORE && k !== LIB)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* engine from the CDN: cache-first, then network, then cache the result */
  if (url.origin === 'https://cdn.jsdelivr.net') {
    e.respondWith((async () => {
      const lib = await caches.open(LIB);
      const hit = await lib.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req, { mode: 'cors' });
        if (res && (res.ok || res.type === 'opaque')) lib.put(req, res.clone());
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  /* our own files: cache-first, fall back to network */
  e.respondWith((async () => {
    const core = await caches.open(CORE);
    const hit = await core.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && url.origin === self.location.origin) core.put(req, res.clone());
      return res;
    } catch (err) {
      /* offline navigation falls back to the cached shell */
      if (req.mode === 'navigate') return (await core.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
