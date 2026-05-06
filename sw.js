/* ============================================================
   SERVICE WORKER — Péremptions Shop PWA
   Stratégie : Cache-First pour les assets, Network-First pour les données
   ============================================================ */

const CACHE_NAME = 'peremptions-v1';

/* Fichiers à mettre en cache lors de l'installation */
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

/* ---- Installation : mise en cache des assets statiques ---- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  /* Active le nouveau SW immédiatement sans attendre la fermeture des onglets */
  self.skipWaiting();
});

/* ---- Activation : suppression des anciens caches ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  /* Prend le contrôle de tous les clients ouverts */
  self.clients.claim();
});

/* ---- Fetch : Cache-First (hors ligne possible) ---- */
self.addEventListener('fetch', (event) => {
  /* On ne gère que les requêtes GET vers notre propre origine */
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        /* Ressource trouvée dans le cache → on la retourne directement */
        return cachedResponse;
      }
      /* Sinon on va chercher sur le réseau et on met en cache */
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        /* Réseau indisponible et ressource absente du cache → page hors-ligne */
        return caches.match('./index.html');
      });
    })
  );
});
