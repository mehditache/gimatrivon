/* בדיקת דפדפן למסך הקריאה (v3.24.0): כפתור סוג התצוגה, כל אפשרות בחלון "תצוגה" והסברי הריחוף — בכל סוגי הספרים
   (תנ״ך, משנה, רמב״ם, ש״ס, טור), בדסקטופ ובטלפון. דורש Playwright (npm i -D playwright, או מותקן גלובלית);
   אם אינו מותקן — הבדיקה מדלגת. node tests/reader-ui.e2e.js
   לכל אפשרות: לוחצים, מוודאים שהדף השתנה (או שאין בעמוד הזה ממה לשנות — מפרש שלא מופיע בו), ואז מחזירים. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('reader-ui: Playwright לא מותקן — מדלג'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

// [שם, כתובת, שתי התצוגות, מפתח ההגדרה של סוג התצוגה]
const BOOKS = [
  ['תנ״ך', '#read/Genesis/1', ['book', 'aligned'], 'view'],
  ['משנה', '#read/Mishnah_Berakhot/1', null, 'view'],
  ['רמב״ם', '#read/Mishneh_Torah_Sabbath/1', ['book', 'aligned'], 'ramView'],
  ['ש״ס', '#read/Berakhot/2a', ['daf', 'study'], 'tview'],
  ['טור', '#read/OC/1', ['daf', 'study'], 'rview']
];
// אפשרות שבכוונה לא משפיעה בתצוגה הזו (וכתוב כך בחלון ובהסבר): כתב הפירוש בש״ס חל רק על "גמרא ומפרשים"
const INERT = { 'ש״ס|daf|cmFont': 1 };
const CM_SEL = { 8: '.rdCm[aria-label="כסף משנה"]', 9: '.rdRv,.rdCm[aria-label="השגות הראב״ד"]', 10: '.rdCm[aria-label="משנה למלך"]', 2: '.rdCm', 5: '.rdCm', y: '[data-x=y]', c: '[data-x=c]' };

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (info ? ' :: ' + info : '')); } };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const br = await chromium.launch();
  for (const [vpName, vp] of [['דסקטופ', { width: 1440, height: 900 }], ['טלפון', { width: 390, height: 844 }]]) {
    const ctx = await br.newContext({ viewport: vp }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    const sig = () => p.evaluate(() => { let x = 0; for (const c of document.querySelector('#rdBook').innerHTML + getComputedStyle(document.querySelector('#reader')).getPropertyValue('--rdFs')) x = (x * 31 + c.charCodeAt(0)) | 0; return x; });
    const settle = async () => { await p.waitForFunction(() => { const b = document.querySelector('#rdBook'); return b && !b.querySelector('.rdLoading,.rdSkel') && b.innerHTML.length > 500; }, null, { timeout: 60000 }); await p.waitForTimeout(700); };
    const open = async (hash, st) => {
      await p.goto(base + '__blank__'); // מקור זהה, בלי האפליקציה — כדי שלא תשמור מצב ישן מעל מה שנקבע כאן
      await p.evaluate(st => { localStorage.clear(); localStorage.setItem('gimatrivonMode', 'read'); localStorage.setItem('gimatrivonReader', JSON.stringify(st)); }, st);
      await p.goto(base + 'index.html' + hash); await settle();
    };
    const setBtns = () => p.$$eval('#rdSet [data-set]', a => a.map(x => ({ k: x.dataset.set, v: x.dataset.val, on: x.getAttribute('aria-pressed') === 'true' })));
    const click = async sel => { await p.click(sel); await p.waitForTimeout(250); await settle(); };

    for (const [bn, hash, views, vk] of BOOKS) for (const view of views || [null]) {
      const tag = vpName + ' ' + bn + (view ? ' ' + view : '');
      await open(hash, view ? { [vk]: view } : {});
      const desk = vp.width > 640;
      // (1) כפתור סוג התצוגה בסרגל (בטלפון הוא בחלון "תצוגה" בלבד); במשנה אין בחירת סוג תצוגה
      const segVis = await p.isVisible('#rdViewSeg');
      ok(tag + ': כפתור סוג תצוגה ' + (views && desk ? 'מוצג' : 'מוסתר'), segVis === !!(views && desk));
      if (views && desk) {
        const other = views[1 - views.indexOf(view)], dv = v => (v === 'daf' ? 'book' : v === 'study' ? 'aligned' : v);
        const s0 = await sig();
        await click('#rdViewSeg [data-view=' + dv(other) + ']');
        ok(tag + ': מעבר ל-' + other + ' משנה את הדף', (await sig()) !== s0);
        ok(tag + ': הכפתור הלחוץ מתעדכן', (await p.getAttribute('#rdViewSeg [data-view=' + dv(other) + ']', 'aria-pressed')) === 'true');
        // חלון ההגדרות פתוח בזמן לחיצה על הכפתור בסרגל — הכרטיס המסומן בחלון חייב להתעדכן
        await click('#rdSetBtn');
        await p.click('#rdViewSeg [data-view=' + dv(view) + ']', { force: true }).catch(() => {}); await p.waitForTimeout(400); await settle();
        const cards = await p.$$eval('#rdSet .rdCard', a => a.map(x => x.dataset.val + ':' + x.getAttribute('aria-pressed')));
        ok(tag + ': חלון ההגדרות מראה את סוג התצוגה הנוכחי', cards.includes(view + ':true'), cards.join(','));
        ok(tag + ': חזרה לתצוגה המקורית', (await sig()) === s0);
        await p.keyboard.press('Escape');
      }
      // (2) כל אפשרות בחלון "תצוגה"
      await click('#rdSetBtn');
      const opts = await setBtns();
      ok(tag + ': אין אפשרויות תרגום בספר בלי תרגום', bn === 'תנ״ך' || !opts.some(o => o.k === 'tr' || o.k === 'trFont'));
      ok(tag + ': אין "סוג תצוגה" במשנה', views || !opts.some(o => o.k === vk));
      for (const o of opts) {
        if (o.on && o.k !== 'cm' && o.k !== 'rcm') continue;
        const was = (await setBtns()).find(x => x.k === o.k && x.on), sel = '#rdSet [data-set="' + o.k + '"][data-val="' + o.v + '"]';
        const s0 = await sig();
        const cmSel = (o.k === 'cm' || o.k === 'rcm') ? CM_SEL[o.v] : o.k === 'cmFont' && views !== null && vk !== 'tview' && vk !== 'rview' ? '.rdCm,.rdRv' : o.k === 'cmFont' && !views ? '.rdCm' : null;
        const present = cmSel ? await p.$$eval('#rdBook ' + cmSel.split(',').join(',#rdBook '), a => a.length) : 1; // מפרש שלא מופיע בעמוד הזה — אין מה לשנות
        await click(sel);
        const s1 = await sig(), now = (await setBtns()).find(x => x.k === o.k && x.v === o.v);
        const name = tag + ': ' + o.k + '=' + o.v;
        ok(name + ' מסומן אחרי לחיצה', now && now.on === (o.k === 'cm' || o.k === 'rcm' ? !o.on : true));
        if (!INERT[bn + '|' + view + '|' + o.k] && present) ok(name + ' משנה את הדף', s1 !== s0);
        await click((o.k === 'cm' || o.k === 'rcm') ? sel : '#rdSet [data-set="' + o.k + '"][data-val="' + was.v + '"]');
        ok(name + ' ומחזירים — הדף חוזר', (await sig()) === s0);
      }
      // (3) הסבר בריחוף לכל כפתור גלוי: בסרגל, בדף, בחלון "תצוגה", במעבר למקום ובהדפסה
      const noTitle = async () => p.$$eval('#rdTop button, #reader button', a => a.filter(b => b.offsetParent && !(b.title || '').trim()).map(b => b.id || b.className || b.textContent.trim().slice(0, 12)));
      let miss = await noTitle();
      for (const s of ['#rdWhere', '#rdPrintBtn']) { await p.keyboard.press('Escape'); if (await p.isVisible(s)) { await click(s); miss = miss.concat(await noTitle()); } }
      if (!desk) { await p.keyboard.press('Escape'); await p.keyboard.press('Control+g'); await p.waitForTimeout(300); miss = miss.concat(await noTitle()); }
      ok(tag + ': לכל כפתור יש הסבר בריחוף', !miss.length, [...new Set(miss)].join(', '));
      await p.keyboard.press('Escape');
    }

    // (4) רמב״ם: "בלי ניקוד" עובד גם בתצוגת הלכה הלכה; סוג התצוגה של הרמב״ם נפרד מזה של התנ״ך
    await open('#read/Mishneh_Torah_Sabbath/1', { ramView: 'aligned', ramNik: false });
    ok(vpName + ' רמב״ם: בלי ניקוד בתצוגת הלכה הלכה', await p.$$eval('#rdBook .rdMsh p', a => a.length > 0 && !a.some(x => /[ְ-ּ]/.test(x.textContent))));
    await open('#read/Mishneh_Torah_Sabbath/1', { view: 'aligned' });
    ok(vpName + ' רמב״ם: "פסוק מול תרגום" בתנ״ך לא מחליף את עיצוב פרנקל', !!(await p.$('#rdBook .rdRamTx')));
    ok(vpName + ': בלי שגיאות JavaScript', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  await br.close(); server.close();
  console.log(`\nreader-ui: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
