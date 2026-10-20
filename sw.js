/* ═══════════════════════════════════════════════════════════════
   Qentiv · Python Course — Offline Service Worker
   ───────────────────────────────────────────────────────────────
   ይህን ፋይል ከ python-course.html (ወይም index.html) ጋር በአንድ
   አቃፊ (folder) ውስጥ ያስቀምጡ። ገጹ ራሱ ይመዘግበዋል (register)።

   • አንዴ በኢንተርኔት ከተገባ በኋላ ገጹ፣ ሁሉም 10 ትምህርቶች፣ የ font ፋይሎችና
     የ Python Engine (Pyodide) በዚያው browser ውስጥ ይቀመጣሉ።
   • በኋላ ያለ ኢንተርኔት ተመሳሳዩን link ሲከፍቱ በቀጥታ ይከፈታል።
   • እድገት (progress) የሚቀመጠው በ localStorage ነው፤ አይነካም።
   • HTTPS (ወይም localhost) ያስፈልጋል።
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* የገጹ ስሪት ሲቀየር ብቻ ይህን ቁጥር ይጨምሩ (የ shell cache ይታደሳል) */
const SHELL_CACHE = 'qentiv-py-shell-v1';
/* ትልቅ ፋይሎች (Pyodide + fonts) — ስሪቱ ካልተቀየረ እንደገና አይወርዱም */
const ASSET_CACHE = 'qentiv-py-assets-v1';

const PY_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const PY_FILES = [
  { f: 'pyodide.js',          w: 3 },
  { f: 'pyodide.asm.js',      w: 10 },
  { f: 'pyodide.asm.wasm',    w: 55 },
  { f: 'python_stdlib.zip',   w: 15 },
  { f: 'pyodide-lock.json',   w: 3 }
];
const FONT_CSS = [
  'https://api.fontshare.com/v2/css?f[]=clash-display@700,600,500&display=swap',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Ethiopic:wght@400;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Noto+Sans+Ethiopic:wght@300;400;700;900&family=Space+Grotesk:wght@300;400;600;700;800;900&display=swap'
];
const CSS_HOSTS = new Set(['fonts.googleapis.com', 'api.fontshare.com']);
const FONT_HOSTS = new Set(['fonts.gstatic.com', 'cdn.fontshare.com']);

/* ገጹ ራሱን ሲመዘግብ የራሱን path በ ?p= ይልካል */
const SW_URL = new URL(self.location.href);
const PAGE_PATH = SW_URL.searchParams.get('p') || '/';
const SHELL_KEY = new URL('__qentiv_shell__', self.registration.scope).href;

const normPath = (p) => p.replace(/index\.html$/i, '');
function isPageNav(url) {
  return url.origin === self.location.origin && normPath(url.pathname) === normPath(PAGE_PATH);
}
const isCacheable = (res) => !!res && res.ok && !res.redirected;
const fetchCors = (u) => fetch(new Request(u, { mode: 'cors', credentials: 'omit' }));
const sig = (res) => ['etag', 'last-modified', 'content-length'].map((h) => res.headers.get(h) || '').join('|');

async function notify(msg) {
  const all = await self.clients.matchAll({ includeUncontrolled: true });
  all.forEach((c) => c.postMessage(msg));
}

/* ───────── install / activate ───────── */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch(new Request(new URL(PAGE_PATH, self.location.origin).href, { cache: 'reload' }));
      if (isCacheable(res)) await (await caches.open(SHELL_CACHE)).put(SHELL_KEY, res);
    } catch (_) { /* ገጹ በመጀመሪያው ጉብኝት ወቅት ይቀመጣል */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('qentiv-py-') && !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ───────── fetch ───────── */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && isPageNav(url)) {
    event.respondWith(pageResponse(event, url));
    return;
  }
  if (url.href.startsWith(PY_BASE) || CSS_HOSTS.has(url.hostname) || FONT_HOSTS.has(url.hostname)) {
    event.respondWith(assetResponse(event, url));
  }
});

/* ገጹ፦ ወዲያውኑ ከ cache ይከፈታል፤ በኢንተርኔት ላይ ሲሆን በጀርባ ይታደሳል */
async function pageResponse(event, url) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(SHELL_KEY);

  const refresh = fetch(new Request(url.origin + url.pathname, { cache: 'no-cache' }))
    .then(async (res) => {
      const isHtml = (res.headers.get('content-type') || '').includes('text/html');
      if (isCacheable(res) && isHtml) {
        const changed = cached && sig(cached) !== sig(res);
        await cache.put(SHELL_KEY, res.clone());
        if (changed) notify({ type: 'SHELL_UPDATED' });
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const res = await refresh;
  if (res) return res;
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="background:#0a0914;color:#E9E3FF;font-family:sans-serif;padding:40px;text-align:center">' +
    '<h2>📡 ኢንተርኔት የለም</h2><p>ይህ ገጽ ገና ለ offline አልተቀመጠም። አንዴ በኢንተርኔት ክፈቱት፤ ከዚያ በኋላ ያለ ኢንተርኔት ይሰራል።</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/* Pyodide + fonts፦ cache-first (CSS ብቻ stale-while-revalidate) */
async function assetResponse(event, url) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(url.href, { ignoreVary: true });
  const isCss = CSS_HOSTS.has(url.hostname);
  if (hit && !isCss) return hit;

  const net = fetchCors(url.href).then((res) => {
    if (isCacheable(res)) cache.put(url.href, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(net.catch(() => {}));
    return hit;
  }
  return net;
}

/* ───────── offline ዝግጅት (ገጹ 'PRECACHE' ሲልክ) ───────── */
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'PRECACHE') event.waitUntil(precache());
});

let running = null;
function precache() {
  if (!running) running = doPrecache().catch(() => {}).finally(() => { running = null; });
  return running;
}

function fontUrlsFromCss(css, base) {
  const out = new Set();
  const labeled = [...css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/gi)];
  /* Google CSS፦ latin + ethiopic ብቻ (ሌሎቹ በሚያስፈልጉ ጊዜ ይቀመጣሉ) */
  const blocks = labeled.length
    ? labeled.filter((m) => /^(latin|ethiopic)$/i.test(m[1])).map((m) => m[2])
    : [...css.matchAll(/@font-face\s*\{([^}]*)\}/gi)].map((m) => m[1]);
  for (const b of blocks) {
    const w2 = b.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)\s*format\(\s*['"]woff2['"]\s*\)/i);
    const any = b.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    const pick = w2 || any;
    if (pick) { try { out.add(new URL(pick[1], base).href); } catch (_) {} }
  }
  return [...out];
}

async function doPrecache() {
  const cache = await caches.open(ASSET_CACHE);

  /* 1) font CSS (ትንንሽ) ወርዶ የ font ፋይሎች ዝርዝር ይወጣል */
  const fontFiles = new Set();
  await Promise.all(FONT_CSS.map(async (cssUrl) => {
    try {
      const res = await fetchCors(cssUrl);
      if (!isCacheable(res)) return;
      await cache.put(cssUrl, res.clone());
      fontUrlsFromCss(await res.text(), cssUrl).forEach((u) => fontFiles.add(u));
    } catch (_) {}
  }));

  /* 2) ሙሉ የስራ ዝርዝር */
  const jobs = [
    ...PY_FILES.map((p) => ({ url: PY_BASE + p.f, w: p.w, required: true })),
    ...[...fontFiles].map((u) => ({ url: u, w: 1, required: false }))
  ];
  const total = jobs.reduce((s, j) => s + j.w, 0);
  let done = 0, lastPct = -1;
  const failed = [];

  const bump = (w) => {
    done += w;
    const pct = Math.min(99, Math.floor((done / total) * 100));
    if (pct !== lastPct) { lastPct = pct; notify({ type: 'PRECACHE_PROGRESS', pct }); }
  };

  const queue = jobs.slice();
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      try {
        if (await cache.match(job.url, { ignoreVary: true })) { bump(job.w); continue; }
        const res = await fetchCors(job.url);
        if (!isCacheable(res)) throw new Error('bad response ' + res.status);
        await cache.put(job.url, res);
      } catch (_) {
        if (job.required) failed.push(job.url);
      }
      bump(job.w);
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  notify({ type: 'PRECACHE_PROGRESS', pct: 100 });
  notify({ type: 'PRECACHE_DONE', ok: failed.length === 0, failed });
}
