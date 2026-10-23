// בונה את אינדקס FlexSearch לחיפוש בתנ״ך (generated/flexsearch/tanakh.js, ‏window.GIM_FX_TANAKH): רשומה לכל פסוק.
// docs[i] = [ספר, פרק, פסוק, הפסוק להצגה (עם ניקוד, בלי טעמים)]; ix = האינדקס המיוצא של FlexSearch.
// המילים מנורמלות כמו norm() ב-reader.js, ובנוסף ktiv(): בלי ו/י באמצע מילה ובלי אותיות סופיות — כך "וחושך" מוצא גם "וחשך".
// להוסיף ספרים: להרחיב את התנאי ב-put (כרגע cat === 0 = תנ״ך). הרצה: node scripts/build-flexsearch.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..'), dir = path.join(root, 'generated', 'corpus') + path.sep, out = path.join(root, 'generated', 'flexsearch');

const TEAMIM = /[֑-֯]/g, NIKUD = /[ְ-ׇֽֿׁׂׅׄ]/g;
const noTeamim = s => String(s).replace(TEAMIM, '').replace(/\s*׀\s*/g, ' ');
const norm = s => noTeamim(s).replace(NIKUD, '').replace(/[־-]/g, ' ').replace(/[^א-ת\s]/g, '').replace(/\s+/g, ' ').trim();
// חייב להיות זהה ל-fxKtiv ב-reader.js
const ktiv = w => (w[0] + w.slice(1).replace(/[וי]/g, '')).replace(/[ךםןףץ]/g, c => 'כמנפצ'['ךםןףץ'.indexOf(c)]);

const win = {};
vm.runInNewContext(fs.readFileSync(dir + 'index.js', 'utf8'), { window: win });
const books = win.GIM_CORPUS_INDEX.books, docs = [];
const ctx = vm.createContext({ GimCorpus: { put(b, k, d) {
  if (books[b].cat !== 0 || !Array.isArray(d)) return;
  d.forEach(r => docs.push([b, r[0], r[1], noTeamim(r[2]).replace(/<[^>]+>/g, '')]));
} } });
books.forEach(bk => bk.cat === 0 && bk.f.forEach(f => vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx)));

vm.runInThisContext(fs.readFileSync(path.join(root, 'vendor', 'flexsearch.compact.min.js'), 'utf8'));
const FlexSearch = globalThis.FlexSearch;
const index = new FlexSearch.Index({ tokenize: 'strict', encoder: new FlexSearch.Encoder({ normalize: false, dedupe: false }) });
docs.forEach((d, i) => { const t = norm(d[3]); if (t) index.add(i, t.split(' ').map(ktiv).join(' ')); });
const ix = {};
index.export((k, v) => { ix[k] = v; });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'tanakh.js'), 'window.GIM_FX_TANAKH=' + JSON.stringify({ docs, ix }) + ';\n');
console.log('verses', docs.length, 'bytes', fs.statSync(path.join(out, 'tanakh.js')).size);
