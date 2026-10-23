// בונה את אינדקס Pagefind לחיפוש בתנ״ך (generated/search/): רשומה לכל פסוק, מנורמלת כמו norm() ב-reader.js.
// meta.t = הפסוק להצגה (עם ניקוד, בלי טעמים); filters: b = ספר, c = ספר:פרק — לחיפוש בספר / בפרק.
// הרצה: npm i && node scripts/build-search.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..'), dir = path.join(root, 'generated', 'corpus') + path.sep, out = path.join(root, 'generated', 'search');

const TEAMIM = /[֑-֯]/g, NIKUD = /[ְ-ׇֽֿׁׂׅׄ]/g;
const noTeamim = s => String(s).replace(TEAMIM, '').replace(/\s*׀\s*/g, ' ');
const norm = s => noTeamim(s).replace(NIKUD, '').replace(/[־-]/g, ' ').replace(/[^א-ת\s]/g, '').replace(/\s+/g, ' ').trim();

const win = {};
vm.runInNewContext(fs.readFileSync(dir + 'index.js', 'utf8'), { window: win });
const books = win.GIM_CORPUS_INDEX.books, recs = [];
const ctx = vm.createContext({ GimCorpus: { put(b, k, d) {
  if (books[b].cat !== 0 || !Array.isArray(d)) return;
  d.forEach(r => recs.push({ b, ch: r[0], v: r[1], t: r[2] }));
} } });
books.forEach(bk => bk.cat === 0 && bk.f.forEach(f => vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx)));

(async () => {
  const pf = await import('pagefind');
  const { index } = await pf.createIndex({ forceLanguage: 'he' });
  for (const r of recs) {
    const content = norm(r.t); if (!content) continue;
    await index.addCustomRecord({ url: '/' + r.b + '/' + r.ch + '/' + r.v, content, language: 'he', meta: { t: noTeamim(r.t) }, filters: { b: [String(r.b)], c: [r.b + ':' + r.ch] } });
  }
  fs.rmSync(out, { recursive: true, force: true });
  await index.writeFiles({ outputPath: out });
  for (const f of fs.readdirSync(out)) if (/^pagefind-.*(ui|highlight)/.test(f)) fs.rmSync(path.join(out, f)); // ממשקי ה-UI המובנים לא בשימוש
  await pf.close();
  console.log('records', recs.length);
})();
