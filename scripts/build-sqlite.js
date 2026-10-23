// בונה את מסד החיפוש בתנ״ך (generated/sqlite/tanakh.sqlite3 + generated/sqlite/tanakh.js) מהקורפוס שב-generated/corpus.
// יחידות: פסוקים (cat 0), רש״י (cat 2, דיבור לכל שורה), אונקלוס (cat 3) ויונתן (cat 4). המבנה והנרמול: ראו sqlite-search.js.
// tanakh.js = window.GIM_SQ_DB: גודל המסד ו-hash שלו (לעקיפת מטמון הדפדפן אחרי בנייה חדשה), נטען כ-script.
// הרצה: node scripts/build-sqlite.js (Node 22.5 ומעלה, עם node:sqlite)
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const SQ = require('../sqlite-search.js');
const root = path.join(__dirname, '..'), dir = path.join(root, 'generated', 'corpus') + path.sep, out = path.join(root, 'generated', 'sqlite');
// עמוד של 16KB (נמדד מול 8KB ו-32KB, בהשהיה של 100ms): כל עלה של האינדקס הוא עמוד אחד (pgsz), מילה = בקשה אחת, טקסט = בקשה אחת
const PAGE = +(process.env.SQ_PAGE || 16384);

const TEAMIM = /[֑-֯]/g, NIKUD = /[ְ-ׇֽֿׁׂׅׄ]/g;
const noTeamim = s => String(s).replace(TEAMIM, '').replace(/\s*׀\s*/g, ' ');
const plain = s => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const win = {};
vm.runInNewContext(fs.readFileSync(dir + 'index.js', 'utf8'), { window: win });
const books = win.GIM_CORPUS_INDEX.books, map = SQ.mapOf(books);
const byKey = {}; books.forEach((b, i) => { byKey[b.cat + '|' + b.heTitle] = i; });
const SRC_OF = { 0: 0, 2: 1, 3: 2, 4: 3 };
// ספר מפרש / תרגום → ספר התנ״ך שעליו
const base = {}; books.forEach((b, i) => { if (b.cat === 0) base[i] = i; else if (SRC_OF[b.cat] != null) { const t = byKey['0|' + b.heTitle]; if (t != null) base[i] = t; } });

const units = new Map(); // rowid → טקסט להצגה
let cur = null, kAt = new Map(), miss = 0;
const ctx = vm.createContext({ GimCorpus: { put(b, k, d) {
  const bk = books[b], src = SRC_OF[bk.cat]; if (src == null || base[b] == null || !Array.isArray(d)) return;
  d.forEach(r => {
    const ord = map.ord(base[b], r[0], r[1]); if (ord < 0) { miss++; return; }
    let t = plain(r[2]); t = src === 0 ? noTeamim(t) : t.replace(TEAMIM, '').replace(NIKUD, '');
    if (src === 1) { // דיבור לכל שורה, לפי הסדר באותו פסוק (כמו addUnit ב-reader.js)
      const key = ord, kk = kAt.get(key) || 0; kAt.set(key, kk + 1);
      if (kk >= 64) throw new Error('too many comments on one verse');
      units.set(SQ.rid(1, ord, kk), t);
    } else { const id = SQ.rid(src, ord, 0); units.set(id, units.has(id) ? units.get(id) + ' ' + t : t); }
  });
} } });
books.forEach((bk, i) => { if (SRC_OF[bk.cat] != null && base[i] != null) bk.f.forEach(f => vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx)); });

fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'tanakh.sqlite3');
if (fs.existsSync(file)) fs.unlinkSync(file);
const db = new DatabaseSync(file);
db.exec(`PRAGMA page_size=${PAGE}; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
  CREATE TABLE d(id INTEGER PRIMARY KEY, t TEXT NOT NULL);`);
for (const n of [0, 1, 2]) db.exec(`CREATE VIRTUAL TABLE f${n} USING fts5(o, t, a, b, content='', detail=full, columnsize=0, tokenize='unicode61');
  INSERT INTO f${n}(f${n}, rank) VALUES('pgsz', ${PAGE - 200});`);
const insF = [0, 1, 2].map(n => db.prepare(`INSERT INTO f${n}(rowid, o, t, a, b) VALUES (?, ?, ?, ?, ?)`)), insD = db.prepare('INSERT INTO d(id, t) VALUES (?, ?)');
const ids = [...units.keys()].sort((a, b) => a - b);
let nw = 0;
db.exec('BEGIN');
ids.forEach(id => {
  const t = units.get(id), ws = SQ.words(t).ws, ar = SQ.rSrc(id) >= 2, F = [[], [], [], []];
  ws.forEach(w => SQ.forms(w, ar).forEach((x, c) => F[c].push(x)));
  nw += ws.length;
  if (ws.length) insF[SQ.TAB[SQ.rSrc(id)]].run(id, ...F.map(x => x.join(' ')));
  insD.run(id, t);
});
db.exec('COMMIT');
for (const n of [0, 1, 2]) db.exec(`INSERT INTO f${n}(f${n}) VALUES('optimize'); CREATE VIRTUAL TABLE v${n} USING fts5vocab(f${n}, instance);`);
db.exec('VACUUM');
db.close();

const buf = fs.readFileSync(file), hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(out, 'tanakh.js'), '// נבנה ב-scripts/build-sqlite.js — לא לערוך\nwindow.GIM_SQ_DB=' + JSON.stringify({ file: 'generated/sqlite/tanakh.sqlite3', bytes: buf.length, page: PAGE, hash, units: ids.length, words: nw }) + ';\n');
console.log('units', ids.length, 'words', nw, 'bytes', buf.length, 'hash', hash, 'missing refs', miss);
