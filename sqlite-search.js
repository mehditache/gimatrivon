/* sqlite-search.js — מנוע החיפוש בתנ״ך מעל SQLite FTS5 (v3.31.0-search-sqlite). בלי DOM ובלי רשת: מקבל backend
   שמריץ SQL (בדפדפן: מאגר Workers של sql.js-httpvfs שטוענים מהמסד רק את העמודים הדרושים; בבדיקות: node:sqlite).
   נחשף כ-window.GimSq (ו-module.exports ב-Node), ומשמש גם את scripts/build-sqlite.js — כך הנרמול בבנייה ובחיפוש זהה.

   המסד (generated/sqlite/tanakh.sqlite3, נבנה ב-node scripts/build-sqlite.js):
   - f0, f1, f2: טבלאות FTS5 בלי תוכן (content=''), detail=full. שורה לכל יחידה: פסוק, תרגום אונקלוס / יונתן לפסוק, או דיבור אחד ברש״י.
     ארבע עמודות מיושרות מילה מול מילה: o = הכתיב כמו שהוא (לדירוג), t = המילה בכתיב מנורמל (K), a = המילה בלי אות שימוש אחת (ו, ה, ב, כ, ל, מ, ש;
     בתרגום גם ד), b = בלי צירוף של 2–3 אותיות שימוש (וה, וב, שה, מה, וכש…). מילה שאין לה צורה כזאת = "x" (שומר על המיקום).
     כך ״ארץ״ מוצא בשאילתה אחת גם ״הארץ״, ״בארץ״ ו״והארץ״, וכל ההתאמות של מילה הן רשומה אחת באינדקס.
   - v0/v1/v2: fts5vocab(f0/f1/f2, instance) — לכל מילה: היחידה (doc), העמודה והמיקום. מכאן מחושבים ביטוי, מרחק, NEAR ודירוג.
     טבלה לכל סוג מקור (f0 פסוקים, f1 רש״י, f2 תרגומים), כך שחיפוש במקור אחד קורא רק את שלו, ו״הכל״ קורא את שלושתן במקביל.
   - d: הטקסט להצגה (עם ניקוד; בפסוקים בלי טעמים), לפי אותו מזהה.
   מזהה יחידה (rowid) = src·2^21 + ord·64 + k: src 0 פסוק, 1 רש״י, 2 אונקלוס, 3 יונתן; ord = מספר הפסוק בתנ״ך (לפי סדר
   הספרים ו-cv שב-generated/corpus/index.js); k = מספר הדיבור ברש״י באותו פסוק.

   תחביר: מילים = כולן, קרובות זו לזו (באותה יחידה, או עד 3 פסוקים זה מזה באותו ספר, גם מעבר לסוף פרק); "ביטוי מדויק";
   בר* (תחילת מילה); ^מילה (בתחילת פסוק / דיבור); AND, OR (גם |), NOT (גם -מילה); סוגריים; NEAR(א ב, 5) או א NEAR/5 ב.
   גרשיים בתוך מילה (רש״י, רש"י) אינם מירכאות. כתיב חסר ומלא זהים (K: בלי ו/י אחרי האות הראשונה, בלי אותיות סופיות).
   דירוג: ביטוי רצוף באותה יחידה, אחריו כל המילים באותה יחידה (כמה שקרובות יותר — גבוה יותר), אחריו מילים בפסוקים
   סמוכים (פסוק אחד ביניהם — גבוה מ-2). צורה מדויקת קודמת לצורה עם אות שימוש. */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;

  /* ---- נרמול: זהה ל-norm ב-reader.js, ולכל מילה בנפרד ---- */
  const TEAMIM = /[֑-֯]/g, NIKUD = /[ְ-ׇֽֿׁׂׅׄ]/g;
  const SEP = /([\s־׀|\-]+)/; // רווח, מקף, פסק (׀)
  const letters = s => String(s).replace(TEAMIM, '').replace(NIKUD, '').replace(/[^א-ת]/g, '');
  // טקסט → החלקים (מילים ומפרידים, כמו markWords) ומספר המילה (או -1) לכל חלק. המילה ה-n באינדקס = המילה ה-n כאן.
  function words(text) {
    const parts = String(text).split(SEP), wi = [], ws = [];
    parts.forEach((p, i) => { const w = i % 2 ? '' : letters(p); wi.push(w ? ws.length : -1); if (w) ws.push(w); });
    return { parts, wi, ws };
  }
  const FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const K = w => (w[0] + w.slice(1).replace(/[וי]/g, '')).replace(/[ךםןףץ]/g, c => FIN[c]);
  const PRE_HE = /^ו?(?:ש|כש|מש)?(?:[בכלמ]|מה|ה)?$/, PRE_AR = /^ו?ד?[בכלמ]?$/;
  const O = w => w.replace(/[ךםןףץ]/g, c => FIN[c]); // הכתיב כמו שהוא (רק אותיות סופיות מנורמלות)
  // צורות המילה לארבע העמודות: [o, t, a, b]. השארית אחרי אות שימוש אחת — לפחות 2 אותיות, ואחרי צירוף — לפחות 3
  // (אחרת ״שמים״ = ש+מ+״ים״)
  function forms(w, ar) {
    const P = ar ? PRE_AR : PRE_HE, ok = n => w.length - n >= (n > 1 ? 3 : 2) && P.test(w.slice(0, n));
    const b = ok(3) ? K(w.slice(3)) : ok(2) ? K(w.slice(2)) : 'x';
    return [O(w), K(w), ok(1) ? K(w.slice(1)) : 'x', b];
  }

  /* ---- מזהים ---- */
  const SB = 2097152, SRC = { txt: 0, rashi: 1, onkelos: 2, yonatan: 3 };
  const rid = (src, ord, k) => src * SB + ord * 64 + (k || 0);
  const rSrc = r => Math.floor(r / SB), rOrd = r => Math.floor(r / 64) % 32768, rK = r => r % 64;
  // books: רשימת הספרים (GIM_CORPUS_INDEX.books); ord לפי ספרי התנ״ך (cat 0) בסדר הרשימה, ו-cv של כל ספר
  function mapOf(books) {
    const bs = [], first = [], chStart = [];
    let n = 0;
    books.forEach((bk, i) => {
      if (bk.cat !== 0) return;
      const cs = []; first[i] = n; bs.push(i);
      (bk.cv || []).forEach((c, ch) => { if (ch > 0) { cs[ch] = n; n += c || 0; } });
      chStart[i] = cs;
    });
    const ob = new Int16Array(n), oc = new Int16Array(n), ov = new Int16Array(n);
    bs.forEach(b => chStart[b].forEach((s, ch) => { if (s == null) return; for (let v = 1; v <= books[b].cv[ch]; v++) { ob[s + v - 1] = b; oc[s + v - 1] = ch; ov[s + v - 1] = v; } }));
    return { n, books: bs, first, chStart, ob, oc, ov, ord: (b, ch, v) => chStart[b] && chStart[b][ch] != null && v >= 1 && v <= books[b].cv[ch] ? chStart[b][ch] + v - 1 : -1 };
  }

  /* ---- ניתוח השאילתה ---- */
  const HEB = /[א-ת֑-ׇ]/;
  function lex(q) {
    const s = String(q), out = []; let i = 0;
    const isQ = c => c === '"' || c === '“' || c === '”' || c === '״' || c === '„';
    const brk = c => c == null || /\s/.test(c) || c === '(' || c === ')' || c === ',';
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(' || c === ')' || c === ',') { out.push({ t: c }); i++; continue; }
      if (isQ(c)) { // מירכאות פותחות: עד מירכאות סוגרות שאחריהן גבול (לא גרשיים בין אותיות, כמו רש״י)
        let j = i + 1;
        while (j < s.length && !(isQ(s[j]) && !(HEB.test(s[j - 1] || '') && HEB.test(s[j + 1] || '')) && brk(s[j + 1]))) j++;
        out.push({ t: 'p', s: s.slice(i + 1, j) }); i = j + 1; continue;
      }
      let j = i; while (j < s.length && !brk(s[j])) j++;
      const w = s.slice(i, j); i = j;
      if (/^(and|&|&&)$/i.test(w)) out.push({ t: 'AND' });
      else if (/^(or|\|\|?)$/i.test(w)) out.push({ t: 'OR' });
      else if (/^not$/i.test(w)) out.push({ t: 'NOT' });
      else if (/^near(\/\d+)?$/i.test(w)) out.push({ t: 'NEAR', n: /\d/.test(w) ? +w.split('/')[1] : null });
      else if (/^\d+$/.test(w)) out.push({ t: 'n', n: +w });
      else out.push({ t: 'w', s: w });
    }
    return out;
  }
  // מילה גולמית → [{w, pre, caret}] (מקף מפריד מילים). מילה של אות אחת נשמטת
  function wordsOf(raw) {
    let s = String(raw), neg = false;
    if (/^-./.test(s) && !/^-[־-]/.test(s)) { neg = true; s = s.slice(1); }
    const caret = s[0] === '^'; if (caret) s = s.slice(1);
    const pts = s.split(/[־\-]+/), out = [];
    pts.forEach((p, k) => {
      const pre = /\*\s*$/.test(p), w = letters(p);
      if (w.length >= 2) out.push({ w, kf: K(w), of: O(w), pre, caret: caret && k === 0 });
    });
    return { neg, ws: out };
  }
  // דקדוק: or := and (OR and)* ; and := not ((AND)? not)* ; not := un (NOT un)* ; un := -un | prim
  function parse(q) {
    const tk = lex(q); let i = 0;
    const peek = () => tk[i], eat = t => (tk[i] && tk[i].t === t ? tk[i++] : null);
    const leafOf = ws => ws.length === 1 ? { k: 'w', ...ws[0] } : { k: 'and', c: ws.map(x => ({ k: 'w', ...x })), neg: [] };
    function prim() {
      const t = peek(); if (!t) return null;
      if (t.t === '(') { i++; const e = or(); eat(')'); return e; }
      if (t.t === 'NEAR' && tk[i + 1] && tk[i + 1].t === '(') {
        i += 2; const items = []; let n = 10;
        while (peek() && peek().t !== ')') {
          const x = peek();
          if (x.t === ',') { i++; if (peek() && peek().t === 'n') n = tk[i++].n; continue; }
          i++;
          if (x.t === 'p') { const ws = phraseWs(x.s); if (ws.length) items.push(ws.length > 1 ? { k: 'p', ws } : { k: 'w', ...ws[0] }); }
          else if (x.t === 'w') wordsOf(x.s).ws.forEach(w => items.push({ k: 'w', ...w }));
        }
        eat(')');
        return items.length > 1 ? { k: 'near', c: items, n } : items[0] || null;
      }
      if (t.t === 'p') { i++; const ws = phraseWs(t.s); return ws.length > 1 ? { k: 'p', ws } : ws.length ? { k: 'w', ...ws[0], ex: true } : null; }
      if (t.t === 'w') { i++; const r = wordsOf(t.s); if (!r.ws.length) return null; const e = leafOf(r.ws); return r.neg ? { k: 'neg', c: e } : e; }
      i++; return null; // אופרטור במקום לא צפוי — מדלגים
    }
    function bin() { // a NEAR/n b
      let a = prim();
      while (peek() && peek().t === 'NEAR' && !(tk[i + 1] && tk[i + 1].t === '(')) {
        const n = tk[i++].n, b = prim();
        if (a && b) a = { k: 'near', c: [a, b], n: n == null ? 10 : n }; else a = a || b;
      }
      return a;
    }
    function not() {
      let a = bin();
      while (eat('NOT')) { const b = bin(); if (a && b) a = { k: 'not', a, b }; }
      return a;
    }
    function and() {
      const c = [], neg = [];
      while (peek() && peek().t !== 'OR' && peek().t !== ')') {
        if (eat('AND')) continue;
        const x = not(); if (!x) continue;
        if (x.k === 'neg') neg.push(x.c); else c.push(x);
      }
      if (!c.length) return null;
      return c.length === 1 && !neg.length ? c[0] : { k: 'and', c, neg };
    }
    function or() {
      const c = []; let x = and(); if (x) c.push(x);
      while (eat('OR')) { x = and(); if (x) c.push(x); }
      return c.length > 1 ? { k: 'or', c } : c[0] || null;
    }
    const e = or();
    return e;
  }
  function phraseWs(s) { const out = []; String(s).split(/\s+/).forEach(r => wordsOf(r).ws.forEach(w => out.push({ ...w, caret: false }))); return out; }
  // המילים לבדיקה באינדקס: key ('=' מילה / '*' תחילית) → {kf, pre}; כל עלה מקבל את ה-key שלו
  function lookups(e, out) {
    out = out || new Map(); if (!e) return out;
    // מילה: הצורה בכתיב המנורמל (עמודות t, a, b), וגם הכתיב המדויק (עמודה o) כשהוא שונה — לדירוג
    const one = (kf, pre) => { const key = (pre ? '*' : '=') + kf; if (!out.has(key)) out.set(key, { kf, pre }); return key; };
    const add = w => { w.key = one(w.kf, w.pre); w.okey = w.of !== w.kf ? one(w.of, w.pre) : null; };
    if (e.k === 'w') add(e);
    else if (e.k === 'p') e.ws.forEach(add);
    else if (e.k === 'not') { lookups(e.a, out); lookups(e.b, out); }
    else if (e.k === 'neg') lookups(e.c, out);
    else (e.c || []).concat(e.neg || []).forEach(x => lookups(x, out));
    return out;
  }

  /* ---- backend: SQL לכל מילה. occ = {doc: Float64Array, col: Uint8Array, off: Uint16Array}, ממוין לפי doc ואז off ---- */
  const COLS = "(CASE col WHEN 'o' THEN 0 WHEN 't' THEN 1 WHEN 'a' THEN 2 ELSE 3 END)";
  const nextStr = s => s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) + 1);
  // טבלת אינדקס לכל סוג מקור (v0 פסוקים, v1 רש״י, v2 תרגומים): חיפוש בפסוקים לא קורא את ההתאמות שבמפרשים
  const TAB = [0, 1, 2, 2];
  function lookupSql(L, tab) {
    const where = L.pre ? 'term >= ? AND term < ?' : 'term = ?', args = L.pre ? [L.kf, nextStr(L.kf)] : [L.kf];
    return { sql: 'SELECT doc, ' + COLS + ', offset FROM v' + tab + ' WHERE ' + where, args };
  }
  function joinOcc(list) { // מטבלאות שונות: טווחי doc נפרדים ועולים (src בראש המזהה), אז מספיק לשרשר
    if (list.length === 1) return list[0];
    const n = list.reduce((a, o) => a + o.n, 0), doc = new Float64Array(n), col = new Uint8Array(n), off = new Uint16Array(n); let k = 0;
    list.forEach(o => { doc.set(o.doc, k); col.set(o.col, k); off.set(o.off, k); k += o.n; });
    return { doc, col, off, n };
  }
  function toOcc(rows) { // rows = [[doc, col, off], …]
    const n = rows.length, ix = new Array(n);
    for (let i = 0; i < n; i++) ix[i] = i;
    let sorted = true; for (let i = 1; i < n; i++) { const a = rows[i - 1], b = rows[i]; if (a[0] > b[0] || (a[0] === b[0] && a[2] > b[2])) { sorted = false; break; } }
    if (!sorted) ix.sort((x, y) => rows[x][0] - rows[y][0] || rows[x][2] - rows[y][2]);
    const doc = new Float64Array(n), col = new Uint8Array(n), off = new Uint16Array(n);
    for (let i = 0; i < n; i++) { const r = rows[ix[i]]; doc[i] = r[0]; col[i] = r[1]; off[i] = r[2]; }
    return { doc, col, off, n };
  }

  /* ---- הערכה ---- */
  const WIN = 3; // חלון הקרבה: עד 3 פסוקים (הראשון והאחרון כלולים)
  // item = {u (יחידה, או -1 כשמשתרע על כמה), src, s, e (ord), o1, o2, sc, q, mk: [u, off, u, off…]}
  function evalNode(e, C) {
    if (!e) return [];
    if (e.k === 'w') return wordItems(e, C);
    if (e.k === 'p') return phraseItems(e, C);
    if (e.k === 'or') { const all = [].concat(...e.c.map(x => evalNode(x, C))); return sortItems(all); }
    if (e.k === 'not') return dropNeg(evalNode(e.a, C), [e.b], C);
    if (e.k === 'neg') return [];
    if (e.k === 'near') return dropNeg(windows(e.c.map(x => evalNode(x, C)), C, e.n), [], C);
    if (e.k === 'and') return dropNeg(e.c.length === 1 ? evalNode(e.c[0], C) : windows(e.c.map(x => evalNode(x, C)), C, -1), e.neg, C);
    return [];
  }
  const cmpItem = (a, b) => a.src - b.src || a.s - b.s || a.u - b.u || a.o1 - b.o1;
  const sortItems = a => a.sort(cmpItem);
  // q: 0 = הכתיב המדויק, -2 = כתיב חסר/מלא אחר, -3 = עם אותיות שימוש
  function wordItems(e, C) {
    const out = [], same = e.of === e.kf;
    const take = (o, exact) => {
      if (!o) return;
      for (let i = 0; i < o.n; i++) {
        const u = o.doc[i], off = o.off[i], c = o.col[i];
        if (exact && c !== 0) continue;
        if (e.caret && off !== 0) continue;
        if (e.ex && c > 1) continue;
        if (!C.allow(u)) continue;
        const ord = rOrd(u), q = c === 0 ? (exact || same ? 0 : -2) : c === 1 ? -2 : -3;
        out.push({ u, src: rSrc(u), s: ord, e: ord, o1: off, o2: off, sc: 2000 + q, q, mk: [u, off] });
      }
    };
    take(C.occ.get(e.key), false); if (e.okey) take(C.occ.get(e.okey), true);
    return dedupe(sortItems(out)); // אותה מילה פעמיים באותו מקום (כמה עמודות) — פעם אחת, בדירוג הטוב
  }
  function dedupe(a) {
    const out = []; let p = null;
    for (const x of a) { if (p && p.u === x.u && p.o1 === x.o1) { if (x.q > p.q) { p.q = x.q; p.sc = x.sc; } continue; } out.push(x); p = x; }
    return out;
  }
  function phraseItems(e, C) { // מילים רצופות, בלי אותיות שימוש נוספות (עמודות o, t)
    const per = e.ws.map(w => {
      const m = new Map(), same = w.of === w.kf, add = (o, exact) => { if (!o) return; for (let i = 0; i < o.n; i++) if (o.col[i] <= 1 && (!exact || o.col[i] === 0)) {
        const u = o.doc[i]; let s = m.get(u); if (!s) m.set(u, s = new Map());
        const q = o.col[i] === 0 && (exact || same) ? 0 : -2; if (!(s.get(o.off[i]) >= q)) s.set(o.off[i], q);
      } };
      add(C.occ.get(w.key), false); if (w.okey) add(C.occ.get(w.okey), true);
      return m;
    });
    const out = [], n = e.ws.length;
    per[0].forEach((offs, u) => {
      if (!C.allow(u)) return;
      for (let j = 1; j < n; j++) if (!per[j].has(u)) return;
      offs.forEach((q0, off) => {
        let qs = q0;
        for (let j = 1; j < n; j++) { const q = per[j].get(u).get(off + j); if (q == null) return; qs += q; }
        const mk = []; for (let j = 0; j < n; j++) mk.push(u, off + j);
        const ord = rOrd(u), q = qs / n; out.push({ u, src: rSrc(u), s: ord, e: ord, o1: off, o2: off + n - 1, sc: 2000 + q, q, ph: true, mk });
      });
    });
    return sortItems(out);
  }
  /* בחירת נציג אחד לכל ילד בחלון, בלי שמילה אחת תשמש לשני ילדים (״שמים״ אינה גם ״מים״ באותו מקום), והציון הטוב ביותר.
     באותה יחידה: ביטוי רצוף לפי הסדר (3000), אחרת 2000 פחות 10 לכל מילה שביניהן (עד 50), +15 כשהסדר כמו בשאילתה.
     בכמה פסוקים: 1000 פחות 200 לכל פסוק נוסף. q (כתיב / אותיות שימוש) מוריד מעט. */
  function pick(w, n, one, near) {
    const by = Array.from({ length: n }, () => []); w.forEach(y => by[y.c].push(y.x));
    let combos = 1; by.forEach(l => { combos *= l.length; });
    const lim = combos <= 256, ch = new Array(n), used = new Set(); let best = null;
    const keyOf = x => x.u * 65536 + x.o1;
    function score() {
      let qs = 0, e = -1, s0 = 1e9, len = 0, o1 = 1e9, o2 = -1;
      ch.forEach(x => { qs += Math.max(-60, Math.min(0, x.sc - 2000)); e = Math.max(e, x.e); s0 = Math.min(s0, x.s); len += x.o2 - x.o1 + 1; o1 = Math.min(o1, x.o1); o2 = Math.max(o2, x.o2); });
      const q = qs / n;
      if (!one) return { sc: 1000 - 200 * (e - s0) + q, e };
      const gap = Math.max(0, o2 - o1 + 1 - len); if (near >= 0 && gap > near) return null;
      const ord = ch.map((x, c) => [x.o1, c, x]).sort((a, b) => a[0] - b[0]), inOrd = ord.every((t, k) => t[1] === k);
      const ph = near < 0 && inOrd && ch.every(x => x.q >= -2) && ord.every((t, k) => k === 0 || t[2].o1 === ord[k - 1][2].o2 + 1);
      return { sc: 2000 + (ph ? 1000 : -10 * Math.min(gap, 50) + (inOrd ? 15 : 0)) + q, o1, o2 };
    }
    (function go(c) {
      if (best && !lim) return;
      if (c === n) { const r = score(); if (r && (!best || r.sc > best.sc)) best = r; return; }
      for (const x of by[c]) {
        const ks = []; for (let o = x.o1; o <= x.o2; o++) ks.push(keyOf(x) + o - x.o1);
        if (ks.some(k => used.has(k))) continue;
        ks.forEach(k => used.add(k)); ch[c] = x; go(c + 1); ks.forEach(k => used.delete(k));
      }
    })(0);
    return best;
  }
  // חלונות מינימליים שמכילים פריט מכל ילד. near >= 0: באותה יחידה, עם עד near מילים בין הפריטים; אחרת: עד WIN פסוקים
  function windows(lists, C, near) {
    const n = lists.length; if (lists.some(l => !l.length)) return [];
    const all = []; lists.forEach((l, c) => l.forEach(x => all.push({ x, c })));
    all.sort((a, b) => cmpItem(a.x, b.x));
    const cnt = new Int32Array(n), out = []; let have = 0, L = 0, Lv = 0; // Lv = גבול החלון (ספר, 3 פסוקים); L = החלון המינימלי
    const book = ord => C.map.ob[ord];
    for (let R = 0; R < all.length; R++) {
      const r = all[R].x;
      if (cnt[all[R].c]++ === 0) have++;
      const bad = l => l.src !== r.src || (near >= 0 ? l.u !== r.u : book(l.s) !== book(r.e) || r.e - l.s > WIN - 1);
      while (Lv < R && bad(all[Lv].x)) { if (Lv >= L) { if (--cnt[all[Lv].c] === 0) have--; L = Lv + 1; } Lv++; }
      if (L < Lv) L = Lv;
      while (L < R && cnt[all[L].c] > 1) { cnt[all[L].c]--; L++; }
      if (have < n) continue;
      let w = all.slice(L, R + 1), l = w[0].x, one = w.every(y => y.x.u === l.u && y.x.u >= 0), best = pick(w, n, one, near);
      // אותה מילה מתאימה לשני ילדים (מילה כפולה בשאילתה, ״כעשרת״ גם ״עשרת״): מרחיבים שמאלה עד גבול החלון
      if (!best && L > Lv) {
        w = all.slice(Math.max(Lv, L - 64), R + 1); if (one) w = w.filter(y => y.x.u === r.u);
        l = w[0].x; one = w.every(y => y.x.u === l.u && y.x.u >= 0); best = pick(w, n, one, near);
        if (!best && !one) { w = w.filter(y => y.x.u === r.u); l = w[0].x; one = r.u >= 0; best = pick(w, n, one, near); }
      }
      if (!best) continue;
      const mk = [].concat(...w.map(y => y.x.mk));
      if (one) out.push({ u: l.u, src: l.src, s: l.s, e: l.e, o1: best.o1, o2: best.o2, sc: best.sc, q: best.sc - 2000, mk });
      else out.push({ u: -1, src: l.src, s: l.s, e: best.e, o1: 0, o2: 0, sc: best.sc, q: -60, mk });
    }
    return out;
  }
  // הסרת פריטים שיש בהם מילה אסורה (NOT / -מילה): ביחידה עצמה, או בפסוקים שבקטע
  function dropNeg(items, negs, C) {
    if (!negs || !negs.length) return items;
    const U = new Set(), V = new Set();
    negs.forEach(ng => evalNode(ng, C).forEach(x => { for (let k = 0; k < x.mk.length; k += 2) { U.add(x.mk[k]); V.add(rSrc(x.mk[k]) * 32768 + rOrd(x.mk[k])); } }));
    return items.filter(x => {
      if (x.u >= 0) return !U.has(x.u);
      for (let o = x.s; o <= x.e; o++) if (V.has(x.src * 32768 + o)) return false;
      return true;
    });
  }
  const SRC_RANK = [0, 3, 1, 2]; // באותו פסוק: הכתוב, אונקלוס, יונתן, רש״י
  // הפריטים → תוצאות: יחידה אחת (הציון הטוב ביותר בה, וכל הסימונים) או קטע של כמה פסוקים שאף פסוק בו אינו תוצאה בעצמו
  function results(items) {
    const units = new Map(), pass = [];
    items.forEach(x => {
      if (x.u >= 0) { const r = units.get(x.u); if (!r) units.set(x.u, { u: x.u, src: x.src, s: x.s, e: x.s, sc: x.sc, mk: x.mk.slice() }); else { if (x.sc > r.sc) r.sc = x.sc; r.mk.push(...x.mk); } }
      else pass.push(x);
    });
    const out = [...units.values()], full = new Set(units.keys()), cov = new Set();
    pass.sort((a, b) => b.sc - a.sc || a.s - b.s || a.src - b.src);
    pass.forEach(x => {
      const us = []; for (let k = 0; k < x.mk.length; k += 2) us.push(x.mk[k]);
      if (us.some(u => full.has(u))) return;
      for (let o = x.s; o <= x.e; o++) if (cov.has(x.src * 32768 + o)) return;
      for (let o = x.s; o <= x.e; o++) cov.add(x.src * 32768 + o);
      out.push({ u: -1, src: x.src, s: x.s, e: x.e, sc: x.sc, mk: x.mk.slice(), us: [...new Set(us)].sort((a, b) => a - b) });
    });
    out.forEach(r => { const m = new Map(); for (let k = 0; k < r.mk.length; k += 2) { let s = m.get(r.mk[k]); if (!s) m.set(r.mk[k], s = new Set()); s.add(r.mk[k + 1]); } r.marks = m; delete r.mk; });
    return out.sort((a, b) => b.sc - a.sc || a.s - b.s || SRC_RANK[a.src] - SRC_RANK[b.src] || a.u - b.u);
  }

  /* ---- מנוע: backend.all(sql, args, opt) → Promise<[[...], …]> ---- */
  function create(backend, books) {
    const map = mapOf(books), cache = new Map(), MAXC = 80;
    function occOf(L, tab) {
      const key = tab + (L.pre ? '*' : '=') + L.kf;
      if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
      const { sql, args } = lookupSql(L, tab);
      const p = Promise.resolve(backend.all(sql, args)).then(toOcc);
      p.catch(() => cache.delete(key));
      cache.set(key, p); while (cache.size > MAXC) cache.delete(cache.keys().next().value);
      return p;
    }
    /* opt: {srcs: [0..3], lo, hi (ord, כולל)} → {total, res: [תוצאה…], ast, ms} */
    async function search(q, opt) {
      const t0 = Date.now(), ast = parse(q), o = opt || {};
      if (!ast) return { total: 0, res: [], ast, ms: 0 };
      const L = lookups(ast), occ = new Map(), srcs = new Set(o.srcs || [0, 1, 2, 3]), tabs = [...new Set([...srcs].map(x => TAB[x]))].sort();
      await Promise.all([...L].map(([key, x]) => Promise.all(tabs.map(t => occOf(x, t))).then(v => occ.set(key, joinOcc(v)))));
      const lo = o.lo == null ? 0 : o.lo, hi = o.hi == null ? map.n - 1 : o.hi;
      const C = { occ, map, allow: u => { const ord = rOrd(u); return ord >= lo && ord <= hi && srcs.has(rSrc(u)); } };
      const res = results(evalNode(ast, C));
      return { total: res.length, res, ast, ms: Date.now() - t0 };
    }
    /* הטקסט להצגה של יחידות: Map u → טקסט. כל קבוצה של יחידות סמוכות (כנראה באותו עמוד במסד) = שאילתה נפרדת, כדי שכל
       ה-Workers יעבדו במקביל. opt = {pri, alive} עובר ל-backend: עדיפות, ובדיקה שהחיפוש עוד רלוונטי (אחרת השאילתה מדולגת) */
    const tcache = new Map();
    async function texts(us, opt) {
      const need = [...new Set(us)].filter(u => !tcache.has(u)).sort((a, b) => a - b), runs = [];
      need.forEach(u => { const r = runs[runs.length - 1], p = r && r[r.length - 1]; if (r && r.length < 8 && rSrc(p) === rSrc(u) && rOrd(u) - rOrd(p) <= 30) r.push(u); else runs.push([u]); });
      await Promise.all(runs.map(part => Promise.resolve(backend.all('SELECT id, t FROM d WHERE id IN (' + part.map(() => '?').join(',') + ')', part, opt)).then(rows => rows.forEach(r => tcache.set(r[0], r[1])))));
      while (tcache.size > 4000) tcache.delete(tcache.keys().next().value);
      return new Map(us.map(u => [u, tcache.get(u)]));
    }
    // היחידות שתוצאה מציגה: יחידה אחת, או כל הפסוקים שבקטע (ברש״י — הדיבורים שבו)
    const unitsOf = r => r.u >= 0 ? [r.u] : r.src === 1 ? r.us : Array.from({ length: r.e - r.s + 1 }, (_, k) => rid(r.src, r.s + k, 0));
    return { search, texts, unitsOf, map, parse };
  }

  const API = { words, letters, K, forms, parse, rid, rSrc, rOrd, rK, SRC, SB, TAB, mapOf, create, WIN, lookupSql, toOcc };
  G.GimSq = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
