const CACHE_NAME = 'khata-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/signin.html',
  '/signup.html',
  '/dashboard.html',
  '/Transation.html',
  '/add-entry.html',
  '/profile.html',
  '/style.css',
  '/app.js',
  '/signin.js',
  '/signup.js',
  '/dashboard.js',
  '/transaction.js',
  '/add-entry.js',
  '/profile.js',
  '/icon.jpeg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});