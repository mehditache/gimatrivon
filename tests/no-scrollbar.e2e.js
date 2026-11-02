/* רגרסיה (v4.17.3): בתוך הספר אסור שיופיע סרגל גלילה, וההערות בשולחן ערוך (דף מודפס) נכנסות בעמוד בלי לעלות על גדותיו.
   Playwright (אם אינו מותקן — מדלג). node tests/no-scrollbar.e2e.js */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (e) {} }
if (!chromium) { console.log('no-scrollbar: Playwright לא מותקן — מדלג'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
// [שם, כתובת, הגדרות, רוחב, גובה, האם העמוד אמור להיכנס בלי גלישה]
const CASES = [
  ['שו״ע דף מודפס 1366', '#read/TUR/SOC/1', {}, 1366, 768, true],
  ['שו״ע דף מודפס צר', '#read/TUR/SOC/1', {}, 800, 700, true],
  ['זוהר ספר פתוח', '#read/ZH/Bereshit/15b', { tview: 'daf' }, 1460, 820, false],
  ['זוהר + הסולם, עמוד בודד', '#read/ZH/Bereshit/15b', { tview: 'daf', zsul: '1' }, 800, 700, false]
];
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const br = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] }); // כדי שסרגלי הגלילה יופיעו (ברירת המחדל של Playwright מסתירה אותם)
  let fail = 0;
  for (const [name, hash, st, w, h, mustFit] of CASES) {
    const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
    await p.goto(base + '__blank__');
    await p.evaluate(st => { localStorage.clear(); localStorage.setItem('gimatrivonMode', 'read'); localStorage.setItem('gimatrivonReader', JSON.stringify(st)); }, st);
    await p.goto(base + 'index.html?embed=read' + hash);
    await p.waitForFunction(() => { const b = document.querySelector('#rdBook'); return b && !b.querySelector('.rdLoading,.rdSkel') && b.innerHTML.length > 500; }, null, { timeout: 60000 });
    await p.waitForTimeout(600);
    for (let pg = 0; pg < 3; pg++) {
      const r = await p.evaluate(() => {
        const b = document.querySelector('#rdBook'), bar = [], over = [];
        for (const e of [b, ...b.querySelectorAll('*')]) {
          const cs = getComputedStyle(e);
          if (e.offsetWidth - e.clientWidth > 1 && /auto|scroll/.test(cs.overflowY)) bar.push(e.className || e.tagName); // סרגל אנכי גלוי
          if (e.classList.contains('rdPage') && e.scrollHeight > e.clientHeight + 1) over.push(e.scrollHeight + '/' + e.clientHeight);
        }
        return { bar, over };
      });
      const tag = name + ' עמוד ' + (pg + 1);
      if (r.bar.length) { fail++; console.log('FAIL ' + tag + ': סרגל גלילה גלוי: ' + r.bar.join(', ')); }
      if (mustFit && r.over.length) { fail++; console.log('FAIL ' + tag + ': העמוד עולה על גדותיו: ' + r.over.join(', ')); }
      const nx = await p.$('#rdNext'); if (!nx) break; await nx.click().catch(() => {}); await p.waitForTimeout(400);
    }
    await p.context().close();
  }
  await br.close(); server.close();
  console.log(fail ? 'no-scrollbar: ' + fail + ' כשלים' : 'no-scrollbar: הכל עבר');
  process.exit(fail ? 1 : 0);
})();
