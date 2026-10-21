/* corpus-loader.js — טעינת הקורפוס לפי ספר, לפי דרישה (v3.12.0).
   generated/corpus/index.js (נטען תמיד, קטן) = רשימת הספרים ולכל ספר את קובצי הנתונים שלו (ראו scripts/split-corpus.js).
   כל קובץ נתונים הוא script שקורא ל-GimCorpus.put — כך זה עובד גם ב-file://, כמו מסכתות הגמרא.
   הנתונים נשמרים כאן בצורה הקומפקטית שבה הגיעו (במילון: מחרוזת אחת לכל חלק), ו-each() מעביר אותם יחידה-יחידה
   למי שבונה מהם אינדקס (app.js לגימטריה, reader.js לקריאה) — בלי להחזיק עוד עותק של כל היחידות. */
(function () {
  'use strict';
  const G = window, IDX = G.GIM_CORPUS_INDEX || { books: [] };
  const BOOKS = IDX.books, DIR = 'generated/corpus/', CONC = 12;
  const parts = BOOKS.map(() => null); // parts[b][k] = הנתונים של חלק k
  const waiting = new Map(); // שם קובץ → [{ok, fail}]
  const queue = []; let active = 0;

  const ready = b => { const p = parts[b]; return !!p && p.length === BOOKS[b].f.length && p.every(x => x !== undefined); };
  function put(b, k, data) {
    const p = parts[b] || (parts[b] = new Array(BOOKS[b].f.length).fill(undefined));
    p[k] = data;
  }
  function pump() {
    while (active < CONC && queue.length) {
      const f = queue.shift(); active++;
      const sc = document.createElement('script');
      const done = ok => { active--; sc.remove(); const cbs = waiting.get(f) || []; waiting.delete(f); cbs.forEach(c => ok ? c.ok() : c.fail(new Error('load ' + f))); pump(); };
      sc.src = DIR + f; sc.async = true;
      sc.onload = () => done(true); sc.onerror = () => done(false);
      document.head.appendChild(sc);
    }
  }
  const loadFile = (f, retry) => new Promise((ok, fail) => {
    if (waiting.has(f)) { waiting.get(f).push({ ok, fail }); return; }
    waiting.set(f, [{ ok, fail }]); queue.push(f); pump();
  }).catch(e => { if (retry) throw e; return loadFile(f, true); }); // ניסיון חוזר אחד (רשת לא יציבה בנייד)

  // טוען את הספרים (אינדקסים) שעוד לא נטענו. onBook(b) נקרא כשכל ספר מוכן — לטעינה הדרגתית.
  function load(ids, onBook) {
    const todo = [...new Set(ids)].filter(b => BOOKS[b] && !ready(b));
    return Promise.all(todo.map(b => Promise.all(BOOKS[b].f.map((f, k) => parts[b] && parts[b][k] !== undefined ? null : loadFile(f))).then(() => {
      if (!ready(b)) throw new Error('missing data for book ' + b);
      if (onBook) onBook(b);
    }))).then(() => ids);
  }

  // fn(cat, book, chapter, verse, text, k, s) לכל יחידה של הספר, לפי הסדר המקורי
  function each(b, fn) {
    if (!ready(b)) return 0;
    const cat = BOOKS[b].cat; let n = 0;
    parts[b].forEach(d => {
      if (Array.isArray(d)) d.forEach(r => { fn(cat, b, r[0], r[1], r[2], r[3], r[4]); n++; });
      else { let v = d.from; d.w.split('\n').forEach(w => { fn(cat, b, 0, ++v, w, 0, 0); n++; }); }
    });
    return n;
  }
  // לבדיקות ולכלים: היחידות המקוריות [cat, book, chapter, verse, text, …] של ספר
  function units(b) { const out = []; each(b, (...u) => out.push(u)); return out; }
  const drop = b => { parts[b] = null; };

  G.GimCorpus = { index: IDX, books: BOOKS, put, load, ready, each, units, drop };
})();
