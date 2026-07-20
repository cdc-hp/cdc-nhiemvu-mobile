/* ===================================================================
   Service Worker — CDC Nhiệm vụ (bản di động / PWA)
   - App shell (HTML/CSS/JS/icon): cache-first, cập nhật ngầm.
   - Gọi API (script.google.com): network-only — KHÔNG cache dữ liệu
     nghiệp vụ, tránh hiển thị số liệu cũ như thể là mới; app.js tự xử lý
     trạng thái offline (banner "Không có mạng — Thử lại").
   Tăng CACHE_VERSION mỗi khi sửa các file trong PRECACHE để buộc client
   tải bản mới.
   =================================================================== */

'use strict';

const CACHE_VERSION = 'cdc-nhiemvu-v2';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './icons/icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API Apps Script: luôn ra mạng thật, không cache (kể cả GET).
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) {
    return; // để trình duyệt tự fetch bình thường
  }

  // App shell cùng origin: cache-first, đồng thời cập nhật cache ngầm (stale-while-revalidate).
  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((banTrongCache) => {
        const taiMoi = fetch(event.request).then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        }).catch(() => banTrongCache); // offline: dùng cache nếu có
        return banTrongCache || taiMoi;
      })
    );
  }
});
