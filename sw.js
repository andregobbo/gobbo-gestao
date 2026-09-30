// Service worker: deixa o app instalável e abre mais rápido (cache do "casco" do app).
// Os dados sempre vêm do Supabase (rede); nada de dados da empresa fica neste cache.
const CACHE = "gobbo-v3";
const CASCO = ["./", "index.html", "css/app.css", "js/app.js", "js/db.js", "js/calc.js", "js/config.js",
  "manifest.webmanifest", "icons/logo.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCO)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("demo.json")) return;
  // rede primeiro (sempre a versão mais nova); cache só se estiver offline
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});
