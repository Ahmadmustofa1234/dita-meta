const CACHE_VERSION = 'ecoseaverse-v1';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './error-handler.js',
  './metaverse.js',
  './learning.js',
  './learning-data.js',
  './chatbot.js',
  './kerang-bambu-3d.html',
  './manifest.webmanifest',
  './vendor/three/build/three.module.js',
  './vendor/three/examples/jsm/controls/PointerLockControls.js',
  './vendor/three/examples/jsm/loaders/FBXLoader.js',
  './vendor/three/examples/jsm/loaders/GLTFLoader.js',
  './vendor/three/examples/jsm/curves/NURBSCurve.js',
  './vendor/three/examples/jsm/curves/NURBSUtils.js',
  './vendor/three/examples/jsm/libs/fflate.module.js',
  './vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  './assets/ai_robot.png',
  './assets/materi-pdf/subbab-a.pdf',
  './assets/materi-pdf/subbab-b.pdf',
  './assets/materi-pdf/subbab-c.pdf',
  './assets/materi-pdf/subbab-d.pdf',
  './assets/materi-pdf/subbab-e.pdf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await Promise.allSettled(
        APP_SHELL_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jangan cache endpoint API dinamis atau halaman admin
  if (url.origin === self.location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin'))) {
    return;
  }

  // CDN eksternal (Google Fonts / Font Awesome): Network-first dengan fallback cache atau response kosong agar tidak memblokir offline
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.destination === 'style') {
            return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
          }
          return new Response('', { status: 503 });
        })
    );
    return;
  }

  // Aset statis berat (PDF, audio, gambar, vendor Three.js): Cache-first + runtime cache (bgm.mp3 di-cache saat diputar)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/vendor/')
  ) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // App shell (HTML/JS/CSS): Network-first agar update cepat masuk, fallback ke cache saat offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

