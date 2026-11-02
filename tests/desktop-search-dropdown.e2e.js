/* רגרסיה (v4.17.2): הרשימה הנפתחת של תיבת החיפוש בבנר (desktop.html) לא נפתחה אחרי Esc / החלפת פוקוס / Ctrl+Shift+K,
   כי תיבת המארח (iframe) נוקתה ב-Esc ולא סונכרנה, ולחיצה על תיבה שכבר בפוקוס לא מעוררת focus.
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
  ok('אין שגיאות JS', errs.length === 0, errs[0]);
  await br.close(); srv.close(); console.log(pass + ' עברו, ' + fail + ' נכשלו'); process.exit(fail ? 1 : 0);
})();
