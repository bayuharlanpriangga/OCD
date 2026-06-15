// OCD Service Worker — Network First
// Network first = selalu ambil dari server dulu, fallback ke cache kalau offline
// Ga perlu update CACHE_NAME tiap deploy — network selalu prioritas

const CACHE_NAME = 'ocd-shell';

// File yang di-cache sebagai fallback offline
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// CDN libraries — cache selamanya (mereka versioned by URL)
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

// ============================================================
// INSTALL — cache shell + CDN assets
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache CDN assets dulu (versioned, aman di-cache lama)
      cache.addAll(CDN_ASSETS).catch(() => {});
      // Cache shell
      return cache.addAll(SHELL_ASSETS);
    }).then(() => {
      // Skip waiting — langsung aktif tanpa nunggu tab lama tutup
      self.skipWaiting();
    })
  );
});

// ============================================================
// ACTIVATE — bersihkan cache lama, klaim semua client
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[OCD SW] Hapus cache lama:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — Network First
// Urutan: network → kalau gagal/offline → cache
// CDN assets: Cache First (versioned URL, ga akan berubah)
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isCDN = CDN_ASSETS.some(a => event.request.url.startsWith(a.split('/').slice(0,3).join('/')))
    && !url.origin.includes(self.location.origin);

  // CDN → Cache First (URL sudah versioned, aman)
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Local assets (index.html, manifest, icons) → Network First
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Network berhasil → update cache dengan versi terbaru
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline → fallback ke cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Kalau resource ga ada di cache dan offline, return index.html sebagai fallback
          return caches.match('./index.html');
        });
      })
  );
});

// ============================================================
// MESSAGE — support manual skipWaiting dari app
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
