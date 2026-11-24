const CACHE_NAME = 'fardamentos-shell-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './assets/icon.svg',
  './js/app.js',
  './js/auth.js',
  './js/firebase-config.js',
  './js/store.js',
  './js/utils.js',
  './js/modules/supervisao.js',
  './js/modules/financeiro.js',
  './js/modules/patrimonio.js',
  './js/modules/admin.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isBypassHost(url) {
  const host = url.hostname;
  return (
    host.includes('brasilapi.com.br') ||
    host.includes('googleapis.com') ||
    host.includes('gstatic.com') ||
    host.includes('firebase') ||
    host.includes('firestore') ||
    host.includes('identitytoolkit') ||
    host.includes('securetoken')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca intercepta chamadas para Firebase, APIs externas ou outros domínios dinâmicos
  if (url.origin !== self.location.origin || isBypassHost(url)) {
    return;
  }

  // Estratégia Network-First com fallback para cache offline do shell local
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});
