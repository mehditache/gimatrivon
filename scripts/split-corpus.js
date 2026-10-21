// מפצל את generated/corpus.bundle.js (קובץ ענק, ~38MB) לקובץ נפרד לכל ספר:
//   generated/corpus/index.js        — רשימת הספרים, הסטטיסטיקה, ולכל ספר את שמות הקבצים שלו (קטן, נטען תמיד)
//   generated/corpus/<ספר>.<hash>.js — היחידות של ספר אחד (ספר גדול מאוד, כמו המילון, בכמה חלקים)
// corpus-loader.js טוען ספרים לפי דרישה: מסך הקריאה רק את הספר הפתוח ומפרשיו, הגימטריה את המקורות שנבחרו.
//
// למה קובץ לכל ספר: (1) לא מורידים ולא מחזיקים בזיכרון ספרים שלא משתמשים בהם; (2) ה-hash בשם הקובץ
// משתנה רק כשהספר עצמו משתנה, כך שהדפדפן (וה-Service Worker, sw.js) שומרים כל ספר לתמיד;
// (3) GitHub Pages קוטע (ללא שגיאת HTTP!) קבצים סטטיים גדולים מדי — כל קובץ כאן קטן מ-~3MB.
// הקבצים הם script ולא JSON כדי שהאתר יעבוד גם ב-file://.
//
// פורמט: GimCorpus.put(ספר, חלק, נתונים). נתונים = מערך של u.slice(2) (פרק, פסוק, טקסט, …) לכל יחידה,
// או במילון (kind=word) { w: "מילה\nמילה…", from } — בלי מערך לכל מילה. corpus-loader.js משחזר מזה את
// היחידות המקוריות [cat, book, chapter, verse, text, …] בדיוק.
//
// הרצה: node scripts/split-corpus.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const gen = path.join(root, 'generated');
const outDir = path.join(gen, 'corpus');
const MAX_PART = 1500000; // תווים לחלק (עברית = 2 בתים ב-UTF-8, כלומר ~3MB לכל היותר)

const src = fs.readFileSync(path.join(gen, 'corpus.bundle.js'), 'utf8');
const PREFIX = 'window.CORPUS_BUNDLE=';
if (!src.startsWith(PREFIX) || !src.endsWith(';')) {
  console.error('מבנה קובץ לא צפוי — מצפה ל-' + PREFIX + '...;');
  process.exit(1);
}
const B = JSON.parse(src.slice(PREFIX.length, -1));

const byBook = B.books.map(() => []);
for (const u of B.units) byBook[u[1]].push(u);

// מוחקים את הפלט הקודם (וגם את פורמט ה-part הישן)
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(gen)) if (/^corpus\.(part\d+|loader)\.js$/.test(f)) fs.unlinkSync(path.join(gen, f));

const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
let files = 0, chars = 0;
const books = B.books.map((b, i) => {
  const units = byBook[i], word = b.kind === 'word';
  if (word && !units.every((u, k) => u[2] === 0 && u[3] === k + 1 && u.length === 7 && !u[5] && !u[6] && !u[4].includes('\n'))) throw new Error('מילון במבנה לא צפוי: ' + b.heTitle);
  // חלוקה לחלקים לפי גודל
  const parts = []; let cur = [], size = 0;
  units.forEach(u => {
    const s = word ? u[4].length + 1 : JSON.stringify(u).length;
    if (cur.length && size + s > MAX_PART) { parts.push(cur); cur = []; size = 0; }
    cur.push(u); size += s;
  });
  if (cur.length) parts.push(cur);
  let from = 0;
  const f = parts.map((p, k) => {
    const data = word ? { w: p.map(u => u[4]).join('\n'), from } : p.map(u => u.slice(2));
    from += p.length;
    const body = 'GimCorpus.put(' + i + ',' + k + ',' + JSON.stringify(data) + ');\n';
    const name = i + '.' + (parts.length > 1 ? k + '.' : '') + hash(body) + '.js';
    fs.writeFileSync(path.join(outDir, name), body, 'utf8');
    files++; chars += body.length;
    return name;
  });
  // cv[פרק] = מספר הפסוק/המשנה הגבוה בפרק — כדי שמסך הקריאה יציג פרקים ופסוקים בלי לטעון את הספר
  const cv = [];
  if (!word) units.forEach(u => { if (u[2] > 0 && u[3] > 0) cv[u[2]] = Math.max(cv[u[2]] || 0, u[3]); });
  return Object.assign({}, b, { f, n: units.length }, word ? {} : { cv: Array.from(cv, x => x || 0) });
});

const index = { books, stats: B.stats, report: B.report };
fs.writeFileSync(path.join(outDir, 'index.js'), 'window.GIM_CORPUS_INDEX=' + JSON.stringify(index) + ';\n', 'utf8');
console.log(`פוצל ל-${files} קבצים ב-generated/corpus/ (${(chars / 1024 / 1024).toFixed(1)}M תווים) + index.js`);
