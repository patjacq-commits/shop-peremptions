/* ================================================================
   SERVICE WORKER — Péremptions Shop
   Gère les notifications périodiques en arrière-plan
================================================================ */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Pas de cache — toujours réseau */
/* Pas de fetch handler intentionnel */

/* ================================================================
   PERIODIC BACKGROUND SYNC
   Déclenché par Android une fois par jour même app fermée
================================================================ */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-peremptions') {
    event.waitUntil(checkPeremptions());
  }
});

async function checkPeremptions() {
  /* Récupère les données depuis le client (localStorage) */
  const clients = await self.clients.matchAll({ type: 'window' });

  /* Si l'app est ouverte, laisse-la gérer elle-même */
  if (clients.length > 0) return;

  /* App fermée : lit les données depuis IndexedDB via un trick localStorage SW */
  /* On utilise une approche message-based */
  const data = await getStoredProducts();
  if (!data || !data.length) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];

  const critical = data
    .filter(p => !p.removed)
    .filter(p => {
      const exp = new Date(p.date + 'T00:00:00');
      const diff = Math.floor((exp - today) / 86400000);
      return diff <= 5;
    })
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  if (!critical.length) return;

  const first = critical[0];
  const exp = new Date(first.date + 'T00:00:00');
  const diff = Math.floor((exp - today) / 86400000);

  let body;
  if (diff < 0)      body = `${first.name} est expiré !`;
  else if (diff===0) body = `${first.name} expire aujourd'hui !`;
  else if (diff===1) body = `${first.name} expire demain`;
  else               body = `${first.name} expire dans ${diff} jours`;

  if (critical.length > 1) body += ` (+${critical.length-1} autre${critical.length>2?'s':''})`;

  await self.registration.showNotification('⚠ Péremptions Shop', {
    body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%230f0f0f"/><text y="130" x="96" font-size="100" text-anchor="middle">📦</text></svg>',
    tag: 'peremption-alert',
    renotify: true,
    data: { url: self.location.origin + self.location.pathname.replace('sw.js','') }
  });
}

/* Lit les produits depuis le localStorage via un canal de messages */
function getStoredProducts() {
  return new Promise(resolve => {
    /* SW n'a pas accès à localStorage — on passe par IndexedDB */
    const req = indexedDB.open('peremptions-db', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = e => {
      const db = e.target.result;
      try {
        const tx = db.transaction('kv', 'readonly');
        const store = tx.objectStore('kv');
        const get = store.get('expiry_v2');
        get.onsuccess = () => resolve(get.result ? get.result.v : []);
        get.onerror = () => resolve([]);
      } catch(err) { resolve([]); }
    };
    req.onerror = () => resolve([]);
  });
}

/* Ouvre l'app au clic sur la notification */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
