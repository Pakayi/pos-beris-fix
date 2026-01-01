const CACHE_NAME = 'warung-pos-v1';

// Daftar URL eksternal yang WAJIB disimpan agar aplikasi jalan offline
// Kita tidak perlu melist semua file JS React karena strategi caching kita dinamis
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// 1. Install Service Worker
self.addEventListener('install', (event) => {
  // Paksa SW baru untuk segera aktif
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

// 2. Activate Service Worker
self.addEventListener('activate', (event) => {
  // Ambil alih kontrol semua tab yang terbuka segera
  event.waitUntil(self.clients.claim());
  
  // Hapus cache lama jika ada update versi
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. Fetch Event (Intercept Network Requests)
self.addEventListener('fetch', (event) => {
  // Hanya handle request GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // A. Jika ada di cache, gunakan itu (OFFLINE MODE)
      if (cachedResponse) {
        return cachedResponse;
      }

      // B. Jika tidak ada, ambil dari internet
      return fetch(event.request).then((networkResponse) => {
        // Cek validitas respon
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors' && networkResponse.type !== 'opaque') {
          return networkResponse;
        }

        // C. Simpan respon baru ke cache untuk penggunaan offline berikutnya
        // Kita clone karena stream hanya bisa dikonsumsi sekali
        const responseToCache = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          // Cache resource, termasuk CDN eksternal (Tailwind, React, FontAwesome)
          // Browser modern mengizinkan caching 'opaque' response (no-cors)
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // D. Fallback jika offline dan tidak ada di cache
        // Bisa return halaman offline kustom jika mau
        // Untuk sekarang, biarkan error network standar
      });
    })
  );
});