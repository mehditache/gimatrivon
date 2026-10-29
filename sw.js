/* sw.js — Service Worker (v3.12.0): ביקור חוזר לא מוריד שוב את הקורפוס, והאתר עובד גם בלי אינטרנט.
   - קובצי ספרים עם hash בשם (generated/corpus/<ספר>.<hash>.js) וגופנים: מהמטמון תמיד — התוכן שלהם לא משתנה לעולם
     (ספר שהשתנה מקבל שם חדש ב-index.js).
   - מסכתות הגמרא והטור (generated/talmud/*.js, generated/talmud-stz/*.js, generated/tur/*.js, generated/zohar/*.js, בלי hash): מהמטמון מיד, ומתעדכנות ברקע לפעם הבאה.
   - כל השאר (index.html, app.js, reader.js, styles.css, generated/corpus/index.js…): קודם מהרשת, כך שגרסה חדשה
     מופיעה מיד; בלי רשת — מהמטמון.
   - מסד החיפוש (generated/sqlite/): לא נוגעים — הדפדפן קורא ממנו טווחים ישר מהשרת.
   נרשם מ-app.js רק ב-http(s) (לא ב-file:// ולא ב-localhost). בקשות לאתרים אחרים (EmailJS, Analytics) לא נוגעים בהן. */
const CACHE = 'gimatrivon-v1';
const HASHED = /\/generated\/corpus\/\d+\.(\d+\.)?[0-9a-f]{8}\.js$|\/vendor\/fonts\//;
const TALMUD = /\/generated\/(talmud|talmud-stz|tur|zohar)\/(?!index\.js)[^/]+\.js$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const put = (req, res) => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(cache => cache.put(req, c)); } return res; };

// אחרי עדכון של index.js: מוחקים מהמטמון קובצי ספרים שכבר לא מופיעים בו (גרסאות קודמות של ספרים שהשתנו)
const prune = res => res.text().then(t => {
  const live = new Set(t.match(/\d+\.(\d+\.)?[0-9a-f]{8}\.js/g) || []);
  if (!live.size) return;
  return caches.open(CACHE).then(c => c.keys().then(keys => Promise.all(keys.map(k => {
    const m = new URL(k.url).pathname.match(/\/generated\/corpus\/([^/]+)$/);
    return m && m[1] !== 'index.js' && !live.has(m[1]) ? c.delete(k) : null;
  }))));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/generated/sqlite/')) return; // מסד החיפוש (v3.31.0): נקרא בטווחים (Range), ישר מהרשת, בלי מטמון
  if (HASHED.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
  } else if (TALMUD.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => put(req, res));
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
  } else {
    e.respondWith(fetch(req).then(res => {
      if (res.ok && url.pathname.endsWith('/generated/corpus/index.js')) e.waitUntil(prune(res.clone()));
      return put(req, res);
    }).catch(() => caches.match(req).then(hit => hit || Response.error())));
  }
});
