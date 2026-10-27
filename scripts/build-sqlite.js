// בונה את מסדי החיפוש (generated/sqlite/<תחום>.sqlite3 + <תחום>.js) מהקורפוס שב-generated/corpus, generated/talmud ו-generated/tur.
// מסד לכל תחום (SQ.DOMAINS): תנ״ך = פסוקים (cat 0), רש״י (cat 2, דיבור לכל שורה), אונקלוס (cat 3) ויונתן (cat 4);
// משנה = משניות (cat 1) וברטנורא (cat 5, דיבור לכל שורה); רמב״ם = הלכות (cat 7), כסף משנה, השגות הראב״ד ומשנה למלך;
// גמרא = קטעי הגמרא, רש״י ותוספות לכל עמוד; טור = הטור, בית יוסף וב״ח לכל סימן. המבנה והנרמול: ראו sqlite-search.js.
// <תחום>.js = window.GIM_SQ_DBS.<תחום>: גודל המסד ו-hash שלו (לעקיפת מטמון הדפדפן אחרי בנייה חדשה), נטען כ-script.
// <תחום>.sqlite3.gz.000… = אותו מסד דחוס ב-gzip, בחלקים של 32MB: sqmem.js מוריד אותו פעם אחת לזיכרון ול-OPFS (v4.6.0).
// הרצה: node scripts/build-sqlite.js [תחום…]  (ברירת מחדל: כל התחומים; Node 22.5 ומעלה, עם node:sqlite)
//       node scripts/build-sqlite.js --gz [תחום…]  רק הקבצים הדחוסים, מהמסד שכבר בנוי (בלי לבנות מחדש)
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
const SQ = require('../sqlite-search.js');
const root = path.join(__dirname, '..'), dir = path.join(root, 'generated', 'corpus') + path.sep, out = path.join(root, 'generated', 'sqlite');
// עמוד של 16KB (נמדד מול 8KB ו-32KB, בהשהיה של 100ms): כל עלה של האינדקס הוא עמוד אחד (pgsz), מילה = בקשה אחת, טקסט = בקשה אחת
const PAGE = +(process.env.SQ_PAGE || 16384);
// המסד נשמר בחלקים של 32MB (<תחום>.sqlite3.000, .001…): GitHub מגביל קובץ ל-100MB, וגמרא וטור גדולים מזה. sql.js-httpvfs (מצב chunked) קורא מהם בטווחים
const CHUNK = 32 << 20;

const TEAMIM = /[֑-֯]/g, NIKUD = /[ְ-ׇֽֿׁׂׅׄ]/g;
const noTeamim = s => String(s).replace(TEAMIM, '').replace(/\s*׀\s*/g, ' ');
const plain = s => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const win = {};
vm.runInNewContext(fs.readFileSync(dir + 'index.js', 'utf8'), { window: win });
const books = win.GIM_CORPUS_INDEX.books;
const byKey = {}; books.forEach((b, i) => { byKey[b.cat + '|' + b.heTitle] = i; });

// שם הספר שעליו המפרש / התרגום (כותרת הטקסט), לפי תחום
const BASE_KEY = { tanakh: (cat, t) => '0|' + t, mishnah: (cat, t) => '1|' + (cat === 5 ? 'משנה ' + t : t), rambam: (cat, t) => '7|' + t };
const talPlain = s => plain(String(s).replace(/[\u0001-\u0004]/g, ''));
const turPlain = s => plain(String(s || '').replace(/\u0010[yc]\d+\u0011/g, ' ').replace(/[\u0003-\u0006]/g, ''));

/* אוספים: כל אחד מחזיר {units: Map(rowid → טקסט), miss, bk?}. bk = ספרים סינתטיים {k, he, cv} לגמרא ולטור (אין להם ספרים באינדקס הקורפוס) */
function collectCorpus(name) {
  const D = SQ.DOMAINS[name], SRC_OF = D.srcOf, map = SQ.mapOf(books, D.cat);
  const base = {}; books.forEach((b, i) => { if (b.cat === D.cat) base[i] = i; else if (SRC_OF[b.cat] != null) { const t = byKey[BASE_KEY[name](b.cat, b.heTitle)]; if (t != null) base[i] = t; } });
  const units = new Map(), kAt = new Map(); let miss = 0;
  const ctx = vm.createContext({ GimCorpus: { put(b, k, d) {
    const bk = books[b], src = SRC_OF[bk.cat]; if (src == null || base[b] == null || !Array.isArray(d)) return;
    d.forEach(r => {
      const ord = map.ord(base[b], r[0], r[1]); if (ord < 0) { miss++; return; }
      let t = plain(r[2]); t = src === 0 ? noTeamim(t) : t.replace(TEAMIM, '').replace(NIKUD, '');
      if (D.multi.includes(src)) { // דיבור לכל שורה, לפי הסדר באותו מקום (כמו addUnit ב-reader.js)
        const key = src * SQ.SB + ord, kk = kAt.get(key) || 0; kAt.set(key, kk + 1);
        if (kk >= 256) throw new Error('too many comments on one verse');
        units.set(SQ.rid(src, ord, kk), t);
      } else { const id = SQ.rid(src, ord, 0); units.set(id, units.has(id) ? units.get(id) + ' ' + t : t); }
    });
  } } });
  books.forEach((bk, i) => { if (SRC_OF[bk.cat] != null && base[i] != null) bk.f.forEach(f => vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx)); });
  return { units, miss };
}
// גמרא: ספר = מסכת, פרק = עמוד (j + 1), פסוק = קטע (s + 1). src 0 גמרא, 1 רש״י, 2 תוספות (k = מספר הפירוש באותו קטע)
function collectTalmud() {
  const tdir = path.join(root, 'generated', 'talmud') + path.sep, w = {};
  vm.runInNewContext(fs.readFileSync(tdir + 'index.js', 'utf8'), { window: w });
  const T = w.GIM_TALMUD_INDEX, bk = [], rows = [];
  T.forEach((t, b) => {
    const A = []; // j → [קטעים, רש״י, תוספות]
    t.parts.forEach(p => { const g = {}; vm.runInNewContext(fs.readFileSync(tdir + p.f, 'utf8'), { window: g }); const d = Object.values(g.GIM_TP)[0]; d.a.forEach((a, i) => { A[d.from + i] = a; }); });
    const cv = [0];
    for (let j = 0; j < t.n; j++) { const a = A[j] || [[], [], []]; cv[j + 1] = Math.max(a[0].length, ...a[1].map(e => e[0] + 1), ...a[2].map(e => e[0] + 1)); }
    bk.push({ k: t.k, he: t.he, cv });
    rows.push({ b, A, t });
  });
  const map = SQ.mapOf(bk.map(x => ({ cat: 100, cv: x.cv })), 100), units = new Map();
  rows.forEach(({ b, A, t }) => {
    for (let j = 0; j < t.n; j++) {
      const a = A[j]; if (!a) continue;
      a[0].forEach((s, i) => { const x = talPlain(s); if (x) units.set(SQ.rid(0, map.ord(b, j + 1, i + 1), 0), x); });
      [1, 2].forEach(src => { const kAt = new Map(); a[src].forEach(e => {
        const o = map.ord(b, j + 1, e[0] + 1), kk = kAt.get(o) || 0; kAt.set(o, kk + 1);
        if (kk >= 256) throw new Error('too many comments on one segment ' + t.k + ' ' + j);
        const x = talPlain((e[1] ? e[1] + ' ' : '') + e[2]); if (x) units.set(SQ.rid(src, o, kk), x);
      }); });
    }
  });
  return { units, miss: 0, bk };
}
// טור: ספר = אחד מארבעת הטורים, פרק = סימן (s + 1; ההקדמה = 1), פסוק = שורה בטור / פסקה בב״י / פסקה בב״ח (i + 1)
function collectTur() {
  const tdir = path.join(root, 'generated', 'tur') + path.sep, w = {};
  vm.runInNewContext(fs.readFileSync(tdir + 'index.js', 'utf8'), { window: w });
  const T = w.GIM_TUR_INDEX, bk = [], rows = [];
  T.forEach((t, b) => {
    const S = []; t.parts.forEach(p => { const g = {}; vm.runInNewContext(fs.readFileSync(tdir + p.f, 'utf8'), { window: g }); const d = Object.values(g.GIM_TUR_P)[0]; d.s.forEach((r, i) => { S[d.from + i] = r; }); });
    const cv = [0], lo = t.intro ? 0 : 1;
    for (let s = 0; s < t.n; s++) { const r = S[s]; cv[s + 1] = r ? Math.max(String(r[0] || '').split('\n').length, (r[1] || []).length, (r[2] || []).length) : 0; }
    bk.push({ k: t.k, he: t.he, cv });
    rows.push({ b, S, t, lo });
  });
  const map = SQ.mapOf(bk.map(x => ({ cat: 101, cv: x.cv })), 101), units = new Map();
  rows.forEach(({ b, S, t, lo }) => {
    for (let s = lo; s < t.n; s++) {
      const r = S[s]; if (!r) continue;
      String(r[0] || '').split('\n').forEach((l, i) => { const x = turPlain(l); if (x) units.set(SQ.rid(0, map.ord(b, s + 1, i + 1), 0), x); });
      [1, 2].forEach(src => (r[src] || []).forEach((l, i) => { const x = turPlain(l); if (x) units.set(SQ.rid(src, map.ord(b, s + 1, i + 1), 0), x); }));
    }
  });
  return { units, miss: 0, bk };
}

function build(name) {
  const D = SQ.DOMAINS[name], C = name === 'talmud' ? collectTalmud() : name === 'tur' ? collectTur() : collectCorpus(name);
  const units = C.units, TABS = D.tabs;
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, name + '.sqlite3');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA page_size=${PAGE}; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    CREATE TABLE d(id INTEGER PRIMARY KEY, t TEXT NOT NULL);`);
  for (const n of TABS) db.exec(`CREATE VIRTUAL TABLE f${n} USING fts5(o, t, a, b, content='', detail=full, columnsize=0, tokenize='unicode61');
    INSERT INTO f${n}(f${n}, rank) VALUES('pgsz', ${PAGE - 200});`);
  const insF = {}; TABS.forEach(n => { insF[n] = db.prepare(`INSERT INTO f${n}(rowid, o, t, a, b) VALUES (?, ?, ?, ?, ?)`); });
  const insD = db.prepare('INSERT INTO d(id, t) VALUES (?, ?)');
  const ids = [...units.keys()].sort((a, b) => a - b);
  let nw = 0;
  db.exec('BEGIN');
  ids.forEach(id => {
    const t = units.get(id), ws = SQ.words(t).ws, src = SQ.rSrc(id), ar = !!D.ar[src], F = [[], [], [], []];
    ws.forEach(w => SQ.forms(w, ar).forEach((x, c) => F[c].push(x)));
    nw += ws.length;
    if (ws.length) insF[D.tab[src]].run(id, ...F.map(x => x.join(' ')));
    insD.run(id, t);
  });
  db.exec('COMMIT');
  for (const n of TABS) db.exec(`INSERT INTO f${n}(f${n}) VALUES('optimize'); CREATE VIRTUAL TABLE v${n} USING fts5vocab(f${n}, instance);`);
  db.exec('VACUUM');
  db.close();

  const buf = fs.readFileSync(file), hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  fs.readdirSync(out).filter(f => f.startsWith(name + '.sqlite3.')).forEach(f => fs.unlinkSync(path.join(out, f)));
  const parts = Math.ceil(buf.length / CHUNK);
  for (let i = 0; i < parts; i++) fs.writeFileSync(file + '.' + String(i).padStart(3, '0'), buf.subarray(i * CHUNK, (i + 1) * CHUNK));
  fs.unlinkSync(file);
  const meta = { file: 'generated/sqlite/' + name + '.sqlite3', chunk: CHUNK, parts, bytes: buf.length, page: PAGE, hash, units: ids.length, words: nw };
  if (C.bk) meta.bk = C.bk; // ספרים סינתטיים (גמרא וטור): שם ומספר הקטעים בכל פרק, למיפוי מקום ← מספר סידורי
  gzOut(name, buf, meta);
  console.log(name + ': units', ids.length, 'words', nw, 'bytes', buf.length, 'hash', hash, 'missing refs', C.miss);
}
// הקבצים הדחוסים (meta.gz = {parts, bytes}) וקובץ התיאור <תחום>.js
function gzOut(name, buf, meta) {
  const gz = zlib.gzipSync(buf, { level: 9 }), base = path.join(out, name + '.sqlite3.gz.');
  fs.readdirSync(out).filter(f => f.startsWith(name + '.sqlite3.gz.')).forEach(f => fs.unlinkSync(path.join(out, f)));
  const parts = Math.ceil(gz.length / CHUNK);
  for (let i = 0; i < parts; i++) fs.writeFileSync(base + String(i).padStart(3, '0'), gz.subarray(i * CHUNK, (i + 1) * CHUNK));
  meta.gz = { parts, bytes: gz.length };
  fs.writeFileSync(path.join(out, name + '.js'), '// נבנה ב-scripts/build-sqlite.js — לא לערוך\n(window.GIM_SQ_DBS = window.GIM_SQ_DBS || {}).' + name + ' = ' + JSON.stringify(meta) + ';\n');
  console.log(name + ': gz', gz.length, 'parts', parts);
}
function gzOnly(name) {
  const js = fs.readFileSync(path.join(out, name + '.js'), 'utf8'), meta = JSON.parse(js.slice(js.indexOf(').' + name + ' = ') + name.length + 5, js.lastIndexOf(';')));
  const buf = Buffer.concat(Array.from({ length: meta.parts }, (_, i) => fs.readFileSync(path.join(out, name + '.sqlite3.' + String(i).padStart(3, '0')))));
  if (buf.length !== meta.bytes) throw new Error(name + ': size mismatch');
  gzOut(name, buf, meta);
}
const GZ = process.argv[2] === '--gz', want = process.argv.slice(GZ ? 3 : 2); (want.length ? want : Object.keys(SQ.DOMAINS)).forEach(n => { if (!SQ.DOMAINS[n]) throw new Error('unknown domain ' + n); GZ ? gzOnly(n) : build(n); });
