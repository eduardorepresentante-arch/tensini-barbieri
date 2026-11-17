/* Deixa o site e o painel instaláveis como aplicativo e abrindo rápido.
   Páginas e scripts: sempre tenta a rede primeiro (para nunca mostrar agenda velha).
   Imagens: usa a cópia guardada. Nada do Supabase passa por aqui. */
const CACHE = "tensini-v1";
const SHELL = ["./", "index.html", "admin.html", "config.js", "catalog.js", "data.js", "site.js", "admin.js", "finance.js",
  "vendor/supabase-js-2.117.2.js", "logo.webp", "mark.webp", "icon-192.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const asset = /\.(webp|png|woff2?)$/.test(url.pathname);
  if (asset) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })));
  } else {
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request)));
  }
});
