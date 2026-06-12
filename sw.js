const CACHE_NAME = 'luminous-insight-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './index.css',
    './store.js',
    './globals.js',
    './manifest.json',
    './icon.png',
    './icon-192.png',
    './icon-512.png'
];

// インストール時にローカルファイルをキャッシュに保存
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Luminous SW] Caching App Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 古いキャッシュの削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// ネットワークリクエストの傍受（キャッシュ優先、なければネットワーク）
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});