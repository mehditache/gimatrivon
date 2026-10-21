// מפצל את generated/corpus.bundle.js (קובץ ענק, ~38MB) לכמה קבצי "חלק" קטנים יותר
// (generated/corpus.part0.js .. partN.js) + generated/corpus.loader.js שמאחד אותם מחדש
// ל-window.CORPUS_BUNDLE בזמן ריצה.
//
// למה: GitHub Pages (שכבת ה-CDN) נתגלתה כקוטעת (מחזירה תוכן חלקי בלבד, ללא שגיאת
// HTTP!) בקשות להורדת קובץ JS בודד בגודל כזה — מה שגרם ל-"Uncaught SyntaxError" ול-
// "טוען קורפוס..." שלא מסתיים. פיצול לקבצים קטנים יותר (כמה MB כל אחד) עוקף את זה.
// לא נוגע ב-generated/corpus.bundle.js עצמו (הוא עדיין קובץ-המקור/ה-build artifact
// הקנוני); קורא ממנו בלבד.
//
// הרצה: node scripts/split-corpus.js [N]   (N = מספר חלקים, ברירת מחדל 16 — כמספר תגי ה-script ב-index.html)

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcPath = path.join(root, 'generated', 'corpus.bundle.js');
const N = parseInt(process.argv[2], 10) || 16;

const src = fs.readFileSync(srcPath, 'utf8');
const PREFIX = 'window.CORPUS_BUNDLE=';
const SUFFIX = ';';
if (!src.startsWith(PREFIX) || !src.endsWith(SUFFIX)) {
  console.error('מבנה קובץ לא צפוי — מצפה ל-' + PREFIX + '...' + SUFFIX);
  process.exit(1);
}
const json = src.slice(PREFIX.length, -SUFFIX.length);
JSON.parse(json); // ולידציה: ודא שזה JSON תקין לפני שמפצלים

const chunkSize = Math.ceil(json.length / N);
const parts = [];
for (let i = 0; i < N; i++) {
  parts.push(json.slice(i * chunkSize, (i + 1) * chunkSize));
}

// מוחקים חלקים ישנים אם N הקודם היה שונה
for (const f of fs.readdirSync(path.join(root, 'generated'))) {
  if (/^corpus\.part\d+\.js$/.test(f)) fs.unlinkSync(path.join(root, 'generated', f));
}

parts.forEach((chunk, i) => {
  const out = '(window.__CBP=window.__CBP||[]).push(' + JSON.stringify(chunk) + ');\n';
  fs.writeFileSync(path.join(root, 'generated', `corpus.part${i}.js`), out, 'utf8');
});

const loader = `window.CORPUS_BUNDLE = JSON.parse((window.__CBP || []).join(''));\n`;
fs.writeFileSync(path.join(root, 'generated', 'corpus.loader.js'), loader, 'utf8');

console.log(`פוצל ל-${N} חלקים (~${(chunkSize / 1024 / 1024).toFixed(2)}MB טקסט כל אחד) + corpus.loader.js`);
