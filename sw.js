// sw.js (GitHub Pages ile Uyumlu Service Worker Dosyası)

// Her güncellemede bu sürümü değiştirebilirsiniz (v2, v3 vb.)
// Bu, tarayıcının yeni dosyaları tekrar önbelleğe almasını sağlar.
const CACHE_NAME = 'akilli-butce-v2';

// DİKKAT: Tüm dosya yolları, GitHub deponuzun adıyla başlayacak şekilde güncellendi.
// Eğer depo adınız farklıysa, aşağıdaki '/borc-program' kısımlarını kendi depo adınızla değiştirin.
const urlsToCache = [
  '/borc-program/',
  '/borc-program/index.html',
  '/borc-program/style.css',
  '/borc-program/script.js',
  '/borc-program/firebase-init.js',
  '/borc-program/manifest.json',
  '/borc-program/images/icon-192.png',
  '/borc-program/images/icon-512.png'
];

// 1. Yükleme (Install) olayı: Service Worker kurulduğunda çalışır.
self.addEventListener('install', event => {
  // Service Worker'ın yeni sürümünün beklemeden direkt aktif olmasını sağlar.
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Önbellek açıldı ve temel dosyalar kaydediliyor.');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Aktifleştirme (Activate) olayı: Yeni Service Worker aktif olduğunda çalışır.
self.addEventListener('activate', event => {
  // Eski önbellekleri temizler.
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Eski önbellek temizleniyor:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. Fetch (Veri getirme) olayı: Uygulama bir dosya istediğinde çalışır.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Önbellekte varsa, oradan ver.
        // İnternet olmasa bile uygulama çalışmaya devam eder.
        if (response) {
          return response;
        }
        // Önbellekte yoksa, internetten getirmeyi dene.
        return fetch(event.request);
      }
    )
  );
});