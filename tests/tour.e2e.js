/* בדיקת דפדפן לשני הסיורים המודרכים (v3.31.0): הסיור של מסך הגימטריה והסיור של מסך הקריאה רצים עד הסוף בלי שגיאות,
   הסיור בגימטריה מסביר את כפתור "פתיחה בספר", וחלון הסיור בצבע הבאנר (--rdBar). דורש Playwright; בלעדיו — מדלג.
   node tests/tour.e2e.js */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('tour: Playwright לא מותקן — מדלג'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (info ? ' :: ' + info : '')); } };

// מריץ סיור עד הסוף בלחיצות "הבא"; מחזיר את כותרות הצעדים ואת צבע הרקע של החלון בצעד הראשון
async function walk(p) {
  const titles = []; let bg = null;
  await p.click('#startTour', { force: true }).catch(() => p.evaluate(() => document.querySelector('#startTour').click()));
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(700);
    const pop = await p.$('.driver-popover'); if (!pop) break;
    titles.push(await p.$eval('.driver-popover-title', e => e.textContent));
    if (bg == null) bg = await p.$eval('.driver-popover', e => [getComputedStyle(e).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--rdBar').trim()]);
    await p.click('.driver-popover-next-btn');
  }
  return { titles, bg };
}
const rgb = hex => { const n = parseInt(hex.replace('#', ''), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));

  await p.goto(base + 'index.html#gim');
  await p.evaluate(() => { const t = document.querySelector('#tA'); t.value = 'אב'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForSelector('.resList .rs', { timeout: 120000 });
  const g = await walk(p);
  ok('גימטריה: הסיור הגיע לסוף', g.titles[g.titles.length - 1] === 'זהו, אפשר להתחיל!', g.titles.join(' | '));
  ok('גימטריה: צעד "פתיחה בספר"', g.titles.includes('תוצאה: פתיחה בספר'));
  ok('גימטריה: חלון בצבע הבאנר', g.bg && g.bg[0] === rgb(g.bg[1]), g.bg && g.bg.join(' / '));
  ok('גימטריה: נשאר במסך הגימטריה', await p.evaluate(() => document.body.dataset.mode) === 'gem');

  await p.goto(base + 'index.html#read/TN/Gen/1/1');
  await p.waitForSelector('#rdBook article', { timeout: 60000 });
  await p.waitForTimeout(1500);
  const r = await walk(p);
  ok('קריאה: הסיור נשאר במסך הקריאה', await p.evaluate(() => document.body.dataset.mode) === 'read');
  ok('קריאה: הסיור הגיע לסוף', r.titles[0] === 'מסך הקריאה' && r.titles[r.titles.length - 1] === 'זהו, אפשר לקרוא!', r.titles.join(' | '));
  ok('קריאה: החלוניות נסגרו בסוף', await p.evaluate(() => document.querySelector('#rdSet').hidden && document.querySelector('#rdJump').hidden));
  ok('בלי שגיאות JavaScript', !errs.length, errs.join(' | '));

  await br.close(); server.close();
  console.log(`tour: ${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})();
