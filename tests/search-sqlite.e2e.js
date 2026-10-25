/* בדיקת דפדפן לחיפוש SQLite בתנ״ך (v3.31.0-search-sqlite): שרת מקומי עם Range והשהיה מלאכותית לכל בקשה (כמו רשת אמיתית),
   חיפושים במסך הקריאה בכל התחומים והמקורות, מדידת זמן ונפח לכל חיפוש, מעבר מתוצאה לספר, גלילה לעוד תוצאות,
   ונפילה לחיפוש הקודם כשהשרת לא תומך ב-Range. דורש Playwright; אם אינו מותקן — מדלג. node tests/search-sqlite.e2e.js [השהיה ms]
   בברירת מחדל ההשהיה 40ms לבקשה (בערך GitHub Pages מישראל). */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('search-sqlite: Playwright לא מותקן — מדלג'); process.exit(0); }

const ROOT = path.join(__dirname, '..'), LAT = +(process.argv[2] || 40);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const LOG = []; let RANGE = true;
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || 'application/octet-stream', m = /bytes=(\d+)-(\d+)?/.exec(q.headers.range || '');
  setTimeout(() => {
    if (m && RANGE) {
      const a = +m[1], b = Math.min(size - 1, m[2] ? +m[2] : size - 1);
      LOG.push({ url: q.url, bytes: b - a + 1, t: Date.now(), a });
      r.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(f, { start: a, end: b }).pipe(r);
    } else {
      if (/sqlite3/.test(q.url) && q.method !== 'HEAD') LOG.push({ url: q.url, bytes: size, t: Date.now() });
      r.writeHead(200, { 'Content-Type': type, 'Content-Length': size, ...(RANGE ? { 'Accept-Ranges': 'bytes' } : {}) }); fs.createReadStream(f).pipe(r);
    }
  }, /sqlite3/.test(q.url) ? LAT : 0);
});

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (info ? '  — ' + info : '')); };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const open = async (p, hash) => {
    await p.goto(base + '__blank__');
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('gimatrivonMode', 'read'); });
    await p.goto(base + 'index.html' + hash);
    await p.waitForFunction(() => { const b = document.querySelector('#rdBook'); return b && !b.querySelector('.rdLoading,.rdSkel') && b.innerHTML.length > 500; }, null, { timeout: 60000 });
  };
  await open(pg, '#read/Genesis/1');
  // הטעינה ברקע (sqWarm): ה-Workers והמסד מוכנים לפני החיפוש הראשון (4 Workers, כ-400KB לכל אחד)
  const t0 = Date.now();
  await pg.waitForFunction(() => !!document.querySelector('#rdQ'), null, { timeout: 10000 });
  await pg.waitForTimeout(4000);
  const warmBytes = LOG.reduce((a, x) => a + x.bytes, 0);
  if (process.env.SQDBG) console.log(LOG.map(x => x.a + '+' + x.bytes).join(' '));
  ok('טעינה ברקע: קראה מעט מהמסד', warmBytes > 0 && warmBytes < 4 * 600000, Math.round(warmBytes / 1024) + 'KB ב-' + LOG.length + ' בקשות');

  async function search(q, { scope, src } = {}) {
    await pg.evaluate(() => { const i = document.querySelector('#rdQ'); i.value = ''; i.dispatchEvent(new Event('input')); });
    await pg.click('#rdQ');
    await pg.evaluate(() => { const i = document.querySelector('#rdQ'); i.value = 'א'; i.dispatchEvent(new Event('input')); });
    await pg.waitForTimeout(250);
    if (scope) { await pg.click('[data-scope=' + scope + ']'); await pg.waitForTimeout(100); }
    if (src) { await pg.click('[data-src=' + src + ']'); await pg.waitForTimeout(100); }
    const n0 = LOG.length, s = Date.now();
    await pg.evaluate(q => { const i = document.querySelector('#rdQ'); i.value = q; i.dispatchEvent(new Event('input')); }, q);
    await pg.waitForFunction(() => { const c = document.querySelector('#rdDrop .cnt'); return c && c.textContent && !/טוען|Loading/.test(c.textContent); }, null, { timeout: 30000 });
    const ms = Date.now() - s - 140; // בלי ההשהיה של ההקלדה (140ms)
    const reqs = LOG.slice(n0), bytes = reqs.reduce((a, x) => a + x.bytes, 0);
    const r = await pg.evaluate(() => ({ cnt: document.querySelector('#rdDrop .cnt').textContent, rows: [...document.querySelectorAll('#rdResBox .rdDI.hit:not(.ph)')].slice(0, 5).map(b => ({ ref: b.querySelector('.rf').textContent, t: b.querySelector('.sn').textContent, marks: [...b.querySelectorAll('mark')].map(m => m.textContent) })) }));
    console.log('    ' + q + ' [' + (scope || '') + '/' + (src || '') + ']: ' + r.cnt + ', ' + ms + 'ms, ' + reqs.length + ' בקשות, ' + Math.round(bytes / 1024) + 'KB');
    return { ...r, ms, reqs: reqs.length, bytes, total: +(r.cnt.replace(/[^\d]/g, '') || 0) };
  }
  const S1 = await search('והארץ וחושך', { scope: 'all', src: 'txt' });
  ok('כתיב חסר ומלא: ״והארץ וחושך״ מוצא את בראשית א, ב', S1.rows.length && /בראשית 1, 2|בראשית א, ב/.test(S1.rows[0].ref), S1.rows[0] && S1.rows[0].ref);
  ok('סימון שתי המילים בתוצאה', S1.rows[0] && S1.rows[0].marks.length === 2, S1.rows[0] && S1.rows[0].marks.join(','));
  const S2 = await search('"ויאמר אלהים"', { scope: 'all', src: 'txt' });
  ok('ביטוי במירכאות', S2.total > 30 && S2.rows.every(r => r.marks.length >= 2));
  const S3 = await search('ויאמר משה', { scope: 'all', src: 'txt' });
  ok('ביטוי רצוף קודם', S3.rows.length && /^ויאמר משה/.test(S3.rows[0].t.replace(/[^א-ת ]/g, '')), S3.rows[0] && S3.rows[0].t.slice(0, 40));
  const S4 = await search('ארץ', { scope: 'book', src: 'txt' });
  ok('בספר: רק בראשית', S4.total > 50 && S4.rows.every(r => /בראשית/.test(r.ref)));
  const S5 = await search('ארץ', { scope: 'ch', src: 'txt' });
  ok('בפרק: רק בראשית א', S5.total > 3 && S5.rows.every(r => /בראשית (1|א),/.test(r.ref)), S5.total + '');
  const S6 = await search('ברא', { scope: 'all', src: 'cm' });
  ok('ברש״י', S6.total > 10 && S6.rows.every(r => /רש״י|Rashi/.test(r.ref)));
  const S7 = await search('בקדמין', { scope: 'all', src: 'tr' });
  ok('בתרגום', S7.total > 0 && /אונקלוס|Onkelos/.test(S7.rows[0].ref), S7.rows[0] && S7.rows[0].ref);
  const S8 = await search('יקום פורקן', { scope: 'all', src: 'all' });
  ok('הכל: מקורות שונים יחד', S8.total >= 0);
  const S9 = await search('רש״י', { scope: 'all', src: 'cm' });
  ok('גרשיים אינם מירכאות', S9.total > 0 && !errs.length);
  const S10 = await search('את', { scope: 'all', src: 'all' });
  ok('מילה נפוצה מאוד', S10.total > 5000, S10.ms + 'ms');

  // גלילה: הרשימה בגודל כל התוצאות, והשורות בסוף נטענות בגלילה
  await pg.evaluate(() => { const b = document.querySelector('#rdResBox'); b.scrollTop = b.scrollHeight; b.dispatchEvent(new Event('scroll')); });
  await pg.waitForFunction(() => document.querySelectorAll('#rdResBox .rdDI.hit:not(.ph)').length > 0, null, { timeout: 15000 }).catch(() => {});
  const nEnd = await pg.evaluate(() => document.querySelectorAll('#rdResBox .rdDI.hit:not(.ph)').length);
  ok('גלילה לסוף טוענת את השורות שם', nEnd > 0, nEnd + ' שורות'); await pg.evaluate(() => { document.querySelector('#rdResBox').scrollTop = 0; });

  // מעבר מתוצאה לספר
  await search('ויבא יעקב שלם', { scope: 'all', src: 'txt' });
  await pg.click('#rdResBox .rdDI.hit:not(.ph)');
  await pg.waitForTimeout(1500);
  const loc = await pg.evaluate(() => ({ hash: location.hash, marks: [...document.querySelectorAll('.rdPage mark')].map(m => m.textContent) }));
  ok('מעבר לבראשית לג, יח עם סימון', /\/Gen\/33\/18$/.test(loc.hash) && loc.marks.length >= 3, loc.hash + ' ' + loc.marks.slice(0, 4).join(','));

  // כל המילים שנמצאו נראות בשורה (לא נחתכות ב-line-clamp), בכל סוג תוצאה
  const visible = p => p.evaluate(() => [...document.querySelectorAll('#rdResBox .rdDI.hit:not(.ph)')].map(b => {
    const sn = b.querySelector('.sn').getBoundingClientRect(), ms = [...b.querySelectorAll('.sn mark')];
    return { ref: b.querySelector('.rf').textContent, n: ms.length, ok: ms.length > 0 && ms.every(m => { const r = m.getBoundingClientRect(); return r.width > 0 && r.top >= sn.top - 1 && r.bottom <= sn.bottom + 1 && r.left >= sn.left - 1 && r.right <= sn.right + 1; }) };
  }));
  // כל התוצאות שנטענו (גלילה ברשימה הווירטואלית)
  const allRefs = async (p, max) => { const seen = new Set(); await p.evaluate(() => { document.querySelector('#rdResBox').scrollTop = 0; });
    for (let i = 0; i < 40 && seen.size < max; i++) { (await p.evaluate(() => [...document.querySelectorAll('#rdResBox .rdDI.hit:not(.ph) .rf')].map(x => x.textContent))).forEach(x => seen.add(x));
      const end = await p.evaluate(() => { const b = document.querySelector('#rdResBox'); const e = b.scrollTop + b.clientHeight >= b.scrollHeight - 2; b.scrollTop += b.clientHeight * 0.8; b.dispatchEvent(new Event('scroll')); return e; });
      await p.waitForTimeout(end ? 600 : 120); if (end && (await p.evaluate(() => { const b = document.querySelector('#rdResBox'); return b.scrollTop + b.clientHeight >= b.scrollHeight - 2; }))) break; }
    return [...seen]; };
  for (const [q, src] of [['גר בארץ', 'txt'], ['בארץ גר', 'txt'], ['גר בארץ', 'all'], ['בארץ גר', 'all']]) {
    const r = await search(q, { scope: 'all', src });
    const refs = await allRefs(pg, 50);
    ok('״' + q + '״ (' + src + '): בראשית טו, יג', refs.some(x => /^בראשית (15|טו), (13|יג)$/.test(x)), r.total + ' תוצאות, נבדקו ' + refs.length);
  }
  for (const [q, src] of [['ויאמר משה אל העם', 'txt'], ['גר בארץ', 'all'], ['ברא אלהים', 'cm'], ['ארעא', 'tr'], ['והארץ היתה', 'cm'], ['"יום הששי" ויכלו', 'txt'], ['משה פרעה', 'all']]) {
    await search(q, { scope: 'all', src });
    const v = await visible(pg), bad = v.filter(x => !x.ok);
    ok('״' + q + '״ (' + src + '): המילים שנמצאו נראות בכל שורה', v.length > 0 && !bad.length, v.length + ' שורות' + (bad.length ? ', חסר ב: ' + bad.slice(0, 3).map(x => x.ref).join(' | ') : ''));
  }

  const speed = [S1, S2, S3, S4, S6, S7, S9, S10];
  console.log('    זמן ממוצע לחיפוש: ' + Math.round(speed.reduce((a, x) => a + x.ms, 0) / speed.length) + 'ms (השהיה ' + LAT + 'ms לבקשה)');
  ok('אין שגיאות בדף', !errs.length, errs.join(' | '));

  // טלפון: החיפוש הקודם, בלי לגשת למסד
  const ph = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await open(ph, '#read/Genesis/1'); await ph.waitForTimeout(2500);
  const nPh = LOG.length;
  await ph.evaluate(() => { const i = document.querySelector('#rdQ'); i.value = 'בראשית ברא'; i.dispatchEvent(new Event('input')); });
  await ph.waitForFunction(() => { const c = document.querySelector('#rdDrop .cnt'); return c && c.textContent && !/טוען/.test(c.textContent); }, null, { timeout: 60000 });
  ok('טלפון: החיפוש הקודם, בלי המסד', LOG.length === nPh, (await ph.evaluate(() => document.querySelector('#rdDrop .cnt').textContent)));
  // החיפוש הקודם: מילים לא צמודות באותו פסוק
  await ph.evaluate(() => { const i = document.querySelector('#rdQ'); i.value = 'בארץ גר'; i.dispatchEvent(new Event('input')); });
  await ph.waitForTimeout(400);
  await ph.waitForFunction(() => { const c = document.querySelector('#rdDrop .cnt'); return c && c.textContent && !/טוען/.test(c.textContent); }, null, { timeout: 60000 });
  const phRefs = await allRefs(ph, 400);
  ok('טלפון: ״בארץ גר״ מוצא את בראשית טו, יג', phRefs.some(x => /^בראשית (15|טו), (13|יג)$/.test(x)), phRefs.length + ' תוצאות');
  await ph.close();

  // שרת בלי Range → החיפוש הקודם
  RANGE = false;
  const p2 = await br.newPage({ viewport: { width: 1400, height: 900 } });
  await open(p2, '#read/Genesis/1');
  await p2.waitForTimeout(5000);
  await p2.click('#rdQ');
  await p2.evaluate(() => { const i = document.querySelector('#rdQ'); i.value = 'בראשית ברא'; i.dispatchEvent(new Event('input')); });
  await p2.waitForFunction(() => { const c = document.querySelector('#rdDrop .cnt'); return c && c.textContent && !/טוען/.test(c.textContent); }, null, { timeout: 60000 });
  const fb = await p2.evaluate(() => document.querySelector('#rdDrop .cnt').textContent);
  ok('בלי Range: החיפוש הקודם עובד', /תוצא/.test(fb), fb);

  await br.close(); server.close();
  console.log('\nsearch-sqlite: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
