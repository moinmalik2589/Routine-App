const CACHE_NAME = 'moin-routine-v10';
const APP_ROOT = new URL('./', self.registration.scope).pathname;

const appPath = (file = '') => `${APP_ROOT}${file}`;

const APP_SHELL = [
  appPath(),
  appPath('index.html'),
  appPath('manifest.webmanifest'),
  appPath('icons/icon-192.png'),
  appPath('icons/icon-512.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || caches.match(appPath('index.html'));
      }),
  );
});
