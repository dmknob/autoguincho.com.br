const CACHE_NAME = 'autoguincho-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/css/output.css',
  '/favicon.svg'
];

// Install event: cache basic layout assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch event: Network first, fallback to Cache for resilience
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If valid response, clone and update cache
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Avoid caching analytics or api endpoints
          if (!event.request.url.includes('/analytics')) {
            cache.put(event.request, resClone);
          }
        });
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          // Return a basic offline response if both network and cache fail
          if (event.request.headers.get('accept').includes('text/html')) {
            return new Response(`
              <!DOCTYPE html>
              <html lang="pt-BR">
              <head>
                <meta charset="UTF-8">
                <title>Offline | Auto Guincho</title>
                <style>
                  body { background: #0a1628; color: #eceadd; font-family: sans-serif; text-align: center; padding: 2rem; }
                  h1 { color: #d4af37; }
                </style>
              </head>
              <body>
                <h1>Sem Conexão</h1>
                <p>O Auto Guincho precisa de internet para buscar ajudas próximas.</p>
                <button onclick="window.location.reload()">Tentar novamente</button>
              </body>
              </html>
            `, { headers: { 'Content-Type': 'text/html' } });
          }
        });
      })
  );
});
