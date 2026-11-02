/* בדיקת דפדפן לשני הסיורים המודרכים (v3.31.0): הסיור של מסך הגימטריה והסיור של מסך הקריאה רצים עד הסוף בלי שגיאות,
   הסיור בגימטריה מסביר את כפתור "פתיחה בספר", וחלון הסיור בצבע הבאנר (--rdBar). דורש Playwright; בלעדיו — מדלג.
   רץ על תוכן החלונות של שולחן העבודה (index.html?embed=…), לא על המסך הישן, ובשולחן עצמו (desktop.html): שלושת הסיורים מהתפריט.
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
  await p.evaluate(() => document.querySelector('#startTour').click()); // בחלון הכותרת מוסתרת; שולחן העבודה לוחץ על הכפתור מבפנים באותה דרך
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

  await p.goto(base + 'index.html?embed=gem#gim');
  await p.evaluate(() => { const t = document.querySelector('#tA'); t.value = 'אב'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForSelector('.resList .rs', { timeout: 120000 });
  const g = await walk(p);
  ok('גימטריה: הסיור הגיע לסוף', g.titles[g.titles.length - 1] === 'זהו, אפשר להתחיל!', g.titles.join(' | '));
  ok('גימטריה: צעד "פתיחה בספר"', g.titles.includes('תוצאה: פתיחה בספר'));
  ok('גימטריה: חלון בצבע הבאנר', g.bg && g.bg[0] === rgb(g.bg[1]), g.bg && g.bg.join(' / '));
  ok('גימטריה: נשאר במסך הגימטריה', await p.evaluate(() => document.body.dataset.mode) === 'gem');

  await p.goto(base + 'index.html?embed=read#read/TN/Gen/1/1');
  await p.waitForSelector('#rdBook article', { timeout: 60000 });
  await p.waitForTimeout(1500);
  const r = await walk(p);
  ok('קריאה: הסיור נשאר במסך הקריאה', await p.evaluate(() => document.body.dataset.mode) === 'read');
  // בחלון אין כותרת ישנה (מתג המראה ותפריט ⋮), ולכן הסיור מסתיים בצעד של שורת המיקום
  ok('קריאה: הסיור הגיע לסוף', r.titles[0] === 'מסך הקריאה' && r.titles[r.titles.length - 1] === 'מיקום בפרק' && !(await p.$('.driver-popover')), r.titles.join(' | '));
  ok('קריאה: החלוניות נסגרו בסוף', await p.evaluate(() => document.querySelector('#rdSet').hidden && document.querySelector('#rdJump').hidden));
  // v4.18.0: שולחן העבודה — שלושת הסיורים מתפריט "? סיור מודרך" רצים בשולחן עצמו (ההחשכה מכסה גם את הבנר), עד הסוף, ומנקים אחריהם
  const dp = await ctx.newPage(); dp.on('pageerror', e => errs.push('desk: ' + e.message));
  await dp.goto(base + 'desktop.html#read/TN/Gen/1/1');
  await dp.waitForTimeout(4000);
  async function deskWalk(k) {
    await dp.click('#dkGemTools .tourBtn'); await dp.click('[data-tour=' + k + ']');
    await dp.waitForSelector('.driver-popover', { timeout: 120000 });
    const titles = [], shellHits = [];
    for (let i = 0; i < 40; i++) {
      await dp.waitForTimeout(500); await dp.waitForFunction(() => !document.querySelector('.dkTourBusy'), null, { timeout: 30000 }); await dp.waitForTimeout(300);
      if (!(await dp.$('.driver-popover'))) break;
      titles.push(await dp.$eval('.driver-popover-title', e => e.textContent));
      shellHits.push(await dp.evaluate(() => { const a = document.querySelector('.driver-active-element'); return a ? (a.dataset.shell ? 'banner' : a.classList.contains('dkTourGhost') ? 'ghost' : a.closest('#dkBan,#dkTask') ? 'banner' : 'shell') : 'none'; }));
      await dp.click('.driver-popover-next-btn');
    }
    await dp.waitForTimeout(800);
    const clean = await dp.evaluate(() => !document.querySelector('.driver-overlay,.driver-popover,.dkTourGhost') && !document.documentElement.classList.contains('dkTouring') && !document.querySelector('#dkQ').value);
    return { titles, shellHits, clean };
  }
  const dr = await deskWalk('read');
  ok('שולחן: סיור הקריאה הגיע לסוף', dr.titles[dr.titles.length - 1] === 'זהו, אפשר לקרוא!', dr.titles.join(' | '));
  ok('שולחן: סיור הקריאה מצביע על פקדי הבנר', ['חלונות', 'המקום בספר', 'חיפוש וקפיצה', 'הדפסה / PDF'].every(t => dr.shellHits[dr.titles.indexOf(t)] === 'banner'), dr.shellHits.join(','));
  ok('שולחן: סיור הקריאה ניקה אחריו', dr.clean);
  const ds = await deskWalk('search');
  ok('שולחן: סיור החיפוש הגיע לסוף', ds.titles.length >= 10 && ds.titles[ds.titles.length - 1] === 'גם מתוך הטקסט', ds.titles.join(' | '));
  ok('שולחן: סיור החיפוש סימן את הרשימה ואת חלון התוצאות', ds.shellHits[ds.titles.indexOf('חיפוש חכם')] === 'ghost' && ds.shellHits[ds.titles.indexOf('סינון לפי ספר ומקור')] === 'ghost', ds.shellHits.join(','));
  ok('שולחן: סיור החיפוש ניקה אחריו', ds.clean);
  const dg = await deskWalk('gem');
  ok('שולחן: סיור הגימטריה הגיע לסוף', dg.titles[dg.titles.length - 1] === 'זהו, אפשר להתחיל!', dg.titles.join(' | '));
  ok('שולחן: מתג המראה בסיור הגימטריה מסומן בבנר', dg.shellHits[dg.titles.indexOf('מראה האפליקציה')] === 'banner', dg.shellHits.join(','));
  ok('שולחן: סיור הגימטריה ניקה אחריו', dg.clean);
  ok('בלי שגיאות JavaScript', !errs.length, errs.join(' | '));

  await br.close(); server.close();
  console.log(`tour: ${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})();
