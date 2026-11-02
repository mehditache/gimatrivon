/* רגרסיה (v4.17.2): הרשימה הנפתחת של תיבת החיפוש בבנר (desktop.html) לא נפתחה אחרי Esc / החלפת פוקוס / Ctrl+Shift+K,
   כי תיבת המארח (iframe) נוקתה ב-Esc ולא סונכרנה, ולחיצה על תיבה שכבר בפוקוס לא מעוררת focus.
   רגרסיה (v4.17.4): בזוהר תפריט הטווח ("בספר") נפתח ריק — לזוהר לא היה מודל טווח (scopeModel החזיר null).
   node tests/desktop-search-dropdown.e2e.js  (דורש Playwright; אחרת מדלג) */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('desktop-search-dropdown: Playwright לא מותקן — מדלג'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const size = fs.statSync(f).size, m = /bytes=(\d+)-(\d+)?/.exec(q.headers.range || ''), ty = T[path.extname(f)] || 'application/octet-stream';
  if (m) { const a = +m[1], b = Math.min(size - 1, m[2] ? +m[2] : size - 1); r.writeHead(206, { 'Content-Type': ty, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f, { start: a, end: b }).pipe(r); }
  else { r.writeHead(200, { 'Content-Type': ty, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(r); }
});
let pass = 0, fail = 0; const ok = (n, c, i) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (i ? ' — ' + i : '')); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/';
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base + 'desktop.html#read/Jer/1'); await pg.waitForTimeout(3000);
  const shown = () => pg.evaluate(() => { const fr = document.querySelector('.dkHost'), d = fr && fr.contentDocument, dr = d && d.getElementById('rdDrop'); return !!dr && !dr.hidden && !fr.hidden && dr.innerHTML.length > 100; });
  const waitShown = async () => { for (let i = 0; i < 30; i++) { if (await shown()) return true; await pg.waitForTimeout(200); } return false; };
  await pg.click('#dkQ'); await pg.keyboard.type('משה', { delay: 30 });
  ok('נפתחת אחרי הקלדה', await waitShown());
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); ok('Esc סוגרת', !(await shown()));
  await pg.click('#dkQ'); ok('לחיצה על תיבה שכבר בפוקוס פותחת מחדש', await waitShown());
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  await pg.keyboard.press('Control+Shift+K'); ok('Ctrl+Shift+K פותח מחדש אחרי Esc', await waitShown());
  await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  ok('Esc כפול מנקה את התיבה (בבנר ובמארח יחד)', (await pg.inputValue('#dkQ')) === '');
  await pg.keyboard.type('אהרן', { delay: 30 }); ok('הקלדה אחרי ניקוי פותחת', await waitShown());
  await pg.keyboard.press('Escape'); await pg.mouse.click(1350, 700); await pg.waitForTimeout(500);
  await pg.click('#dkQ'); ok('אחרי לחיצה בחוץ וחזרה לתיבה', await waitShown());
  await pg.click('#dkScope'); await pg.waitForTimeout(500); await pg.click('#dkScMenu [data-sc="glob"]'); await pg.waitForTimeout(300);
  await pg.click('#dkQ'); ok('אחרי שינוי טווח', await waitShown());
  // זוהר: תפריט הטווח בבנר מציג "בפרשה" / "בכל הספרים" ואת המקורות, והם פועלים
  await pg.goto(base + 'desktop.html#read/ZH/Introduction/14a'); await pg.reload(); await pg.waitForTimeout(3500);
  const menu = () => pg.evaluate(() => { const m = document.getElementById('dkScMenu'); return { open: !m.hidden, h: m.offsetHeight, sc: [...m.querySelectorAll('[data-sc]')].map(b => b.dataset.sc), tg: [...m.querySelectorAll('[data-tg]')].map(b => b.dataset.tg + (b.classList.contains('on') ? '+' : '')), lbl: document.getElementById('dkScope').textContent }; });
  await pg.click('#dkScope'); await pg.waitForTimeout(1200); let m = await menu();
  ok('זוהר: תפריט הטווח נפתח עם תוכן', m.open && m.h > 100 && m.sc.join() === 'par,glob' && m.tg.length === 3, JSON.stringify(m));
  ok('זוהר: התווית "בפרשה"', m.lbl === 'בפרשה', m.lbl);
  await pg.click('#dkScMenu [data-tg="t"]'); await pg.waitForTimeout(300); m = await menu();
  ok('זוהר: סימון מקור נוסף (תרגום)', m.tg.includes('t+') && m.tg.includes('g+') && !m.tg.includes('r+'), m.tg.join());
  const hostQ = async q => { await pg.click('#dkQ'); await pg.fill('#dkQ', ''); await pg.keyboard.type(q, { delay: 20 }); await waitShown(); await pg.waitForTimeout(800); return pg.evaluate(() => { const d = document.querySelector('.dkHost').contentDocument; return { n: d.querySelectorAll('#rdDrop .rdDI').length + (d.getElementById('rdResBox') ? 1 : 0), glob: !!d.querySelector('#rdDrop [data-glob="0"]'), txt: (d.querySelector('#rdDrop .cnt') || {}).textContent || '' }; }); };
  let h = await hostQ('אדם'); ok('זוהר: חיפוש בפרשה עם שני מקורות מוצא תוצאות', /\d/.test(h.txt) && !h.glob, JSON.stringify(h));
  await pg.click('#dkScope'); await pg.waitForTimeout(800); await pg.click('#dkScMenu [data-sc="glob"]'); await pg.waitForTimeout(500);
  ok('זוהר: מעבר ל"בכל הספרים"', (await pg.textContent('#dkScope')) === 'בכל הספרים');
  h = await hostQ('אדם'); ok('זוהר: הרשימה עוברת לחיפוש בכל הספרים', h.glob, JSON.stringify(h));
  await pg.keyboard.press('Escape'); await pg.click('#dkScope'); await pg.waitForTimeout(800); await pg.click('#dkScMenu [data-sc="par"]'); await pg.waitForTimeout(500);
  ok('זוהר: חזרה ל"בפרשה" בלי לדרוס את היקף התנ״ך', (await pg.textContent('#dkScope')) === 'בפרשה' && JSON.parse(await pg.evaluate(() => localStorage.getItem('gimatrivonReader'))).scope !== 'par');
  ok('אין שגיאות JS', errs.length === 0, errs[0]);
  await br.close(); srv.close(); console.log(pass + ' עברו, ' + fail + ' נכשלו'); process.exit(fail ? 1 : 0);
})();
