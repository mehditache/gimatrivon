/* reader.js — מסך "קריאה ומפרשים" (v3.8.0): תנ״ך ומשנה כספר פתוח, תרגום בטור צד ומפרש בתחתית הדף.
   שני חלקים:
   (1) ליבה טהורה (אינדקס פרק/פסוק, ניתוח מראה-מקום, חיפוש) — נחשפת כ-window.GimReaderCore ונבדקת ב-tests/run-tests.js.
   (2) ממשק — רץ רק בדפדפן, אחרי app.js, ומשתמש ב-window.GimApp שהוא חושף (שפה, שמות ספרים, trackEvent).
   הטקסטים נטענים לפי ספר (corpus-loader.js, v3.12.0): רק הספר הפתוח, המפרשים והתרגום שמוצגים בו והספרים הסמוכים לו.
   unit = [cat, book, chapter, verse, text, …], cat: 0 תנ״ך, 1 משנה,
   2 רש״י, 3 אונקלוס, 4 תרגום יונתן, 5 ברטנורא, 6 מילון (לא בשימוש כאן), 7 רמב״ם (משנה תורה), 8 כסף משנה, 9 השגות הראב״ד,
   10 משנה למלך. ספר בסיס (תנ״ך, משנה, רמב״ם) מקושר לרשימת מפרשים (links.cms): רש״י / ברטנורא, או שלושת מפרשי הרמב״ם. */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;

  /* ================= (1) ליבה ================= */
  const TEAMIM = /[֑-֯]/g, NIKUD = /[ְ-ׇֽֿׁׂׅׄ]/g;
  const noTeamim = s => String(s).replace(TEAMIM, '').replace(/\s*׀\s*/g, ' ');
  const noMarks = s => noTeamim(s).replace(NIKUD, '');
  // נרמול לחיפוש: בלי ניקוד/טעמים, מקף = רווח, רק אותיות עבריות ורווחים
  const norm = s => noMarks(s).replace(/[־-]/g, ' ').replace(/[^א-ת\s]/g, '').replace(/\s+/g, ' ').trim();

  const HV = {};
  [...'אבגדהוזחט'].forEach((c, i) => { HV[c] = i + 1; });
  [...'יכלמנסעפצ'].forEach((c, i) => { HV[c] = (i + 1) * 10; });
  [...'קרשת'].forEach((c, i) => { HV[c] = (i + 1) * 100; });
  Object.assign(HV, { 'ך': 20, 'ם': 40, 'ן': 50, 'ף': 80, 'ץ': 90 });
  const HEB_STEPS = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
  function toHeb(n) { let s = ''; for (const [v, l] of HEB_STEPS) while (n >= v) { s += l; n -= v; } return s.replace('יה', 'טו').replace('יו', 'טז'); }
  function parseNum(t) {
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (!/^[א-ת]{1,4}$/.test(t)) return NaN;
    return [...t].reduce((s, c) => s + HV[c], 0);
  }

  // יחידה אחת אל data[ספר][פרק][פסוק]: מפרשים = מערך פסקאות, כתוב = מחרוזת (יחידות כפולות מתחברות ברווח)
  function addUnit(data, cat, b, ch, v, t) {
    const d = data[b] || (data[b] = []), c = d[ch] || (d[ch] = []);
    if (cat === 2 || cat === 5 || cat >= 8) (c[v] || (c[v] = [])).push(t);
    else c[v] = c[v] ? c[v] + ' ' + t : t;
  }
  // BN.units (אם יש — בבדיקות, מהקורפוס המלא) נכנסות מיד; אחרת data[b] מתמלא כשהספר נטען (addBook)
  function buildIndex(BN) {
    const books = BN.books, data = books.map(() => null), byKey = {};
    books.forEach((b, i) => { byKey[b.cat + '|' + b.heTitle] = i; });
    for (const u of BN.units || []) if (u[0] !== 6) addUnit(data, u[0], u[1], u[2], u[3], u[4]);
    const base = [], links = {};
    books.forEach((b, i) => { if (b.cat === 0 || b.cat === 1 || b.cat === 7) base.push(i); });
    base.forEach(i => {
      const he = books[i].heTitle, cat = books[i].cat;
      const L = cat === 0 ? { onkelos: byKey['3|' + he], yonatan: byKey['4|' + he] } : {};
      // מפרשים: [{b: ספר המפרש, c: קטגוריה}] לפי סדר ההצגה בתחתית הדף; cm = הראשון (לתאימות)
      L.cms = (cat === 0 ? [[2, he]] : cat === 1 ? [[5, he.replace(/^משנה /, '')]] : [[8, he], [9, he], [10, he]])
        .map(([c, t]) => ({ b: byKey[c + '|' + t], c })).filter(x => x.b != null);
      L.cm = L.cms.length ? L.cms[0].b : undefined;
      links[i] = L;
    });
    // כתיב חסר/מלא: "תהלים" = "תהילים", "עוקצין" ~ "עוקצים" — משווים גם בלי י/ו ובלי ם/ן סופיות
    const loose = s => s.replace(/[יו]/g, '').replace(/[םן](?=\s|$)/g, 'ם');
    const clean = s => String(s).toLowerCase().replace(/[׳״'"`.,:;()[\]]/g, ' ').replace(/[־-]/g, ' ').replace(/\s+/g, ' ').trim();
    const names = [];
    base.forEach(i => {
      const b = books[i], add = n => { n = clean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: loose(n) }); };
      add(b.heTitle); add(b.heTitle.replace(/^משנה /, '').replace(/^פרקי /, '')); add(b.title); add(b.title.replace(/^Mishnah /, ''));
      // רמב״ם: "הלכות שבת", "רמבם שבת", "Mishneh Torah, Sabbath", "Sabbath". "שבת" לבד נשאר למשנה (נרשמה קודם)
      if (b.cat === 7) { const s = b.heTitle.replace(/^הלכות /, ''); add('רמבם ' + b.heTitle); add('רמבם ' + s); add(s); add(b.title.replace(/^Mishneh Torah, /, '')); }
    });
    return { books, data, base, links, names, clean, loose, ncache: new Map() };
  }
  // ספר שנטען: each(fn) עובר על היחידות שלו (GimCorpus.each)
  function addBook(IX, b, each) { if (IX.data[b]) return; IX.data[b] = []; each(b, (cat, bb, ch, v, t) => addUnit(IX.data, cat, bb, ch, v, t)); }
  // פרקים ופסוקים: מהטקסט אם הספר נטען, אחרת מהרשימה (books[b].cv = הפסוק הגבוה בכל פרק) — לניווט בלי לטעון
  const chaptersOf = (IX, b) => { const r = [], d = IX.data[b]; if (d) d.forEach((c, i) => { if (c && i > 0) r.push(i); }); else (IX.books[b].cv || []).forEach((n, i) => { if (n && i > 0) r.push(i); }); return r; };
  const versesOf = (IX, b, ch) => {
    const r = [], d = IX.data[b];
    if (d) (d[ch] || []).forEach((t, i) => { if (t && i > 0) r.push(i); });
    else for (let i = 1; i <= ((IX.books[b].cv || [])[ch] || 0); i++) r.push(i);
    return r;
  };
  const hasRef = (IX, b, ch, v) => { const d = IX.data[b]; if (d) return !!d[ch] && (!v || !!d[ch][v]); const n = (IX.books[b].cv || [])[ch]; return !!n && (!v || v <= n); };

  // "בראשית א ו", "שמות יב", "ברכות ב ג", "Exodus 12 2", "ו ג" (פרק ופסוק בספר הנוכחי — רק בשני מספרים)
  function parseRef(IX, q, cur) {
    const toks = IX.clean(noMarks(q)).split(' ').filter(Boolean); if (!toks.length) return null;
    let b = -1, k = 0;
    for (let n = Math.min(8, toks.length); n >= 1 && b < 0; n--) { const cand = toks.slice(0, n).join(' '), lc = IX.loose(cand), hit = IX.names.find(x => x.n === cand) || IX.names.find(x => x.l === lc); if (hit) { b = hit.i; k = n; } }
    const rest = toks.slice(k);
    if (b < 0) { if (cur == null || toks.length !== 2) return null; b = cur; }
    if (rest.length > 2) return null;
    const ch = rest.length ? parseNum(rest[0]) : 1, v = rest.length > 1 ? parseNum(rest[1]) : 0;
    if (!(ch >= 1) || Number.isNaN(v) || !hasRef(IX, b, ch, v)) return null;
    return { b, ch, v, book: k > 0 };
  }
  function suggestBooks(IX, q, max) {
    const c = IX.clean(noMarks(q)); if (c.length < 2) return [];
    const out = []; const lc = IX.loose(c); IX.names.forEach(x => { if ((x.n.startsWith(c) || x.l.startsWith(lc)) && !out.includes(x.i)) out.push(x.i); });
    return out.slice(0, max || 5);
  }
  function normBook(IX, b) {
    if (!IX.ncache.has(b)) IX.ncache.set(b, (IX.data[b] || []).map(c => c ? c.map(t => t ? ' ' + norm(t) + ' ' : '') : null));
    return IX.ncache.get(b);
  }
  function search(IX, q, books, opt) {
    const nq = norm(q), o = opt || {}, limit = o.limit || 100, hits = []; let total = 0;
    if (nq.length < 2) return { hits, total, q: nq };
    for (const b of books) normBook(IX, b).forEach((c, ch) => {
      if (!c || (o.ch && ch !== o.ch)) return;
      c.forEach((t, v) => { if (t && t.includes(nq)) { total++; if (hits.length < limit) hits.push({ b, ch, v }); } });
    });
    return { hits, total, q: nq };
  }
  // סימון מילים בטקסט מוצג: מחזיר את הטוקנים (מילים ומפרידים) ואת אינדקסי המילים התואמות
  function markWords(t, q) {
    const parts = String(t).split(/(\s+|־)/), nq = norm(q || ''), marks = new Set();
    if (nq.length < 2) return { parts, marks };
    const qn = nq.split(' ').length, wi = [];
    parts.forEach((p, i) => { if (i % 2 === 0 && p) wi.push(i); });
    const wn = wi.map(i => norm(parts[i]));
    for (let a = 0; a < wi.length; a++) {
      const s = wn.slice(a, a + qn).join(' ');
      if (qn === 1 ? wn[a].includes(nq) : s.includes(nq)) for (let k = 0; k < qn && a + k < wi.length; k++) marks.add(wi[a + k]);
    }
    return { parts, marks };
  }
  // פירוק פסקת-מפרש לדיבורים: [{dh, body}] — רש״י מגיע כיחידה לכל דיבור, ברטנורא כפסקה אחת עם "ד״ה. פירוש: ד״ה. פירוש:"
  function splitComm(t) {
    return String(t).split(/:\s+(?=\S)/).map((x, i, a) => i < a.length - 1 ? x + ':' : x).map(x => {
      const p = x.indexOf('.'); return p > 0 && p < 90 ? { dh: x.slice(0, p + 1), body: x.slice(p + 1) } : { dh: '', body: x };
    }).filter(x => (x.dh + x.body).trim());
  }

  // מפרשי הרמב״ם (קטגוריה 8 ומעלה): כל יחידה היא הערה אחת — "ד״ה. פירוש", בלי פיצול נוסף בנקודתיים
  function splitOne(t) { t = String(t); const p = t.indexOf('.'); return [p > 0 && p < 120 ? { dh: t.slice(0, p + 1), body: t.slice(p + 1) } : { dh: '', body: t }]; }
  const splitCm = (c, t) => c >= 8 ? splitOne(t) : splitComm(t);


  /* ---- ש״ס: generated/talmud/index.js (רשימת מסכתות) + חלקים לכל מסכת שנטענים לפי דרישה ----
     amud j = דף (j>>1)+2, עמוד א (j זוגי) או ב. */
  const dafOf = j => ({ d: (j >> 1) + 2, side: j & 1 });
  const amudOf = (d, side) => (d - 2) * 2 + (side ? 1 : 0);
  function talIndex(list) {
    const names = [], clean = s => String(s).toLowerCase().replace(/[׳״'"`.,:;()[\]]/g, ' ').replace(/[־-]/g, ' ').replace(/\s+/g, ' ').trim();
    const loose = s => s.replace(/[יו]/g, '').replace(/[םן](?=\s|$)/g, 'ם');
    (list || []).forEach((t, i) => [t.he, t.k].forEach(n => { n = clean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: loose(n) }); }));
    return { list: list || [], names, clean, loose, byK: Object.fromEntries((list || []).map((t, i) => [t.k, i])) };
  }
  // "ברכות ב.", "ברכות ב:", "ברכות דף ב ע״ב", "שבת קכ ב", "Berakhot 2b". explicit = יש סימן שזו גמרא (דף, נקודה/נקודתיים, ע״א, 2b)
  // ולא משנה ("ברכות ב ג" = משנה ברכות פרק ב משנה ג, כשאין סימן כזה ויש שני מספרים)
  function parseDafRef(TX, q) {
    let raw = noMarks(String(q)).trim(); if (!raw) return null;
    const explicit = /[.:]\s*$|ע["״׳']\s?[אב]|(^|\s)(מסכת|דף|גמרא|בבלי|ש["״]ס|daf|talmud|bavli|tractate)(\s|$)|\d+\s*[ab]\b/i.test(raw);
    raw = raw.replace(/ע["״׳']\s?א/g, ' @a ').replace(/ע["״׳']\s?ב/g, ' @b ').replace(/(\d+)\s*([ab])\b/gi, (m, n, s) => n + ' @' + s.toLowerCase())
      .replace(/([א-ת\d])\s*\.\s*$/, '$1 @a').replace(/([א-ת\d])\s*:\s*$/, '$1 @b').replace(/ש["״]ס/g, ' ');
    const toks = TX.clean(raw).split(' ').filter(t => t && !/^(מסכת|גמרא|בבלי|דף|עמוד|talmud|bavli|daf|amud|tractate)$/.test(t));
    if (!toks.length) return null;
    let ti = -1, k = 0;
    for (let n = Math.min(3, toks.length); n >= 1 && ti < 0; n--) { const c = toks.slice(0, n).join(' '), lc = TX.loose(c), hit = TX.names.find(x => x.n === c) || TX.names.find(x => x.l === lc); if (hit) { ti = hit.i; k = n; } }
    if (ti < 0) return null;
    const rest = toks.slice(k), t = TX.list[ti];
    if (rest.length > 2) return null;
    const d = rest.length ? parseNum(rest[0]) : 2;
    const sd = rest.length > 1 ? ({ '@a': 0, '@b': 1, 'א': 0, 'ב': 1, a: 0, b: 1 })[rest[1]] : 0;
    if (!(d >= 2) || sd == null) return null;
    const j = amudOf(d, sd);
    if (j >= t.n) return null;
    return { i: ti, k: t.k, j, explicit };
  }
  const dafLabel = (j, en) => { const x = dafOf(j); return en ? x.d + (x.side ? 'b' : 'a') : toHeb(x.d) + (x.side ? ':' : '.'); };

  /* ---- טור, בית יוסף וב״ח: generated/tur/index.js (ארבעה טורים) + חלקים שנטענים לפי דרישה (scripts/build-tur.py) ----
     בטקסט: \u0003…\u0004 מודגש, \u0005…\u0006 בדק הבית, \n שורה חדשה, \u0010y3\u0011 / \u0010c3\u0011 = כאן מתחיל דיבור 3 (מ-0)
     של בית יוסף / ב״ח. */
  const TUR_ALIAS = { OC: ['אורח חיים', 'אוח', 'orach chayim', 'orach chaim', 'oc'], YD: ['יורה דעה', 'יוד', 'yoreh deah', 'yd'], EH: ['אבן העזר', 'אהע', 'even haezer', 'eh'], CM: ['חושן משפט', 'חומ', 'חום', 'choshen mishpat', 'cm'] };
  const turClean = s => noMarks(String(s)).toLowerCase().replace(/[״"׳'`]/g, '').replace(/[.,:;()[\]־-]/g, ' ').replace(/\s+/g, ' ').trim();
  function turIndex(list) {
    const names = [];
    (list || []).forEach((t, i) => (TUR_ALIAS[t.k] || []).concat(t.he, t.en || '').forEach(n => { n = turClean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n }); }));
    return { list: list || [], names, byK: Object.fromEntries((list || []).map((t, i) => [t.k, i])) };
  }
  // "טור או״ח ס", "או״ח סימן ס", "אורח חיים 60", "בית יוסף יו״ד קצג", "חו״מ הקדמה", "Orach Chayim 60" → {i, k, s}; s = 0 הקדמה
  function parseTurRef(RX, q) {
    let toks = turClean(q).split(' ').filter(Boolean);
    while (toks.length && /^(טור|tur|בח|bach|בית|יוסף|beit|yosef|ארבעה|טורים)$/.test(toks[0])) toks.shift();
    let ti = -1, k = 0;
    for (let n = Math.min(2, toks.length); n >= 1 && ti < 0; n--) { const hit = RX.names.find(x => x.n === toks.slice(0, n).join(' ')); if (hit) { ti = hit.i; k = n; } }
    if (ti < 0) return null;
    const rest = toks.slice(k).filter(x => !/^(סימן|סי|siman)$/.test(x)), t = RX.list[ti];
    if (rest.length > 1) return null;
    const s = !rest.length ? 1 : /^(הקדמה|הקדמת|intro|introduction)$/.test(rest[0]) ? 0 : parseNum(rest[0]);
    if (!(s >= 0) || s >= t.n || (s === 0 && !t.intro)) return null;
    return { i: ti, k: t.k, s };
  }
  // טקסט → אסימונים: מילים, '\n' לשורה חדשה וסימני עוגן כאסימון נפרד
  const turToks = t => String(t).replace(/\u0010[yc]\d+\u0011/g, ' $& ').replace(/\n/g, ' \n ').split(/ +/).filter(Boolean);
  const ANC = /^\u0010([yc])(\d+)\u0011$/;

  const CORE = { noTeamim, noMarks, norm, toHeb, parseNum, buildIndex, addBook, chaptersOf, versesOf, parseRef, suggestBooks, search, markWords, splitComm, splitOne, splitCm, talIndex, parseDafRef, dafOf, amudOf, dafLabel, turIndex, parseTurRef, turToks };
  G.GimReaderCore = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof document === 'undefined' || !G.GimCorpus) return;

  /* ================= (2) ממשק ================= */
  const $r = s => document.querySelector(s);
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const APP = G.GimApp || {}; // מ-app.js: שפה, שמות ספרים וסדרים באנגלית, מדידת שימוש
  const isEn = () => APP.isEn ? APP.isEn() : document.documentElement.lang === 'en';
  const EN = {
    'גימטריה': 'Gematria', 'קריאה ומפרשים': 'Read & commentary', 'קריאה': 'Read', 'מצב עבודה': 'Mode', 'ספר': 'Book', 'פסוק מול תרגום': 'Verse & translation', 'משנה מול תרגום': 'Text & translation',
    'תצוגה': 'Display', 'הגדרות תצוגה': 'Display settings', 'סוג תצוגה': 'Layout', 'תרגום בצד שמאל': 'Translation on the left',
    'תרגום אונקלוס': 'Targum Onkelos', 'תרגום יונתן': 'Targum Yonatan', 'ללא תרגום': 'No translation', 'ברירת מחדל': 'default', 'אין בספר זה': 'not in this book',
    'כתב התרגום': 'Translation script', 'כתב רש״י': 'Rashi script', 'כתב רגיל': 'Regular script', 'גודל אותיות': 'Text size',
    'רש״י': 'Rashi', 'ברטנורא': 'Bartenura', 'פרק': 'Chapter', 'פסוק': 'Verse', 'משנה': 'Mishnah', 'תנ״ך': 'Tanakh', 'מקרא': 'Text',
    'פרק קודם': 'Previous chapter', 'פרק הבא': 'Next chapter', 'עמוד קודם': 'Previous page', 'עמוד הבא': 'Next page',
    'חיפוש, או קפיצה: ״שמות יב ב״': 'Search, or jump: "Exodus 12 2"', 'חיפוש מהיר או קפיצה למקום': 'Quick search or jump to a place',
    'בפרק': 'Chapter', 'בספר': 'Book', 'בכל התנ״ך': 'All Tanakh', 'בכל המשנה': 'All Mishnah', 'תוצאות': 'results', 'תוצאה': 'Result', 'חיפוש ב': 'Search in', 'פסוקים': 'Verses', 'משניות': 'Mishnayot', 'תרגום': 'Targum', 'הכל': 'All', 'מציג': 'showing', 'אין תוצאות': 'No results',
    'מעבר אל': 'Go to', 'פתיחת': 'Open', 'מעבר לפרק ופסוק': 'Go to chapter and verse', 'סגירה': 'Close',
    'אפשר גם להקליד מקום בתיבת החיפוש': 'You can also type a place in the search box', 'דפדוף': 'turn pages',
    'עמוד': 'Page', 'עמודים': 'Pages', 'מתוך': 'of', 'ממשיך ל': 'continues to ', 'ההגדרות נשמרות לפעם הבאה.': 'Settings are saved for next time.',
    'פירוש': 'Commentary', 'הדפסה / PDF': 'Print / PDF', 'מה להדפיס': 'What to print', 'שני העמודים הפתוחים': 'The two open pages', 'הפרק כולו': 'The whole chapter', 'צבע': 'Color', 'צבעוני': 'Color', 'שחור-לבן': 'Black & white', 'רקע נייר וצבעים': 'Paper tone and colors', 'רקע לבן, לחיסכון בדיו': 'White background, saves ink', 'הדפסה': 'Print', 'שני עמודים בכל דף A4 לרוחב.': 'Two pages on each landscape A4 sheet.', 'ליצוא PDF בחרו בחלון ההדפסה ״שמירה כ-PDF״.': 'For a PDF, choose "Save as PDF" in the print dialog.', 'דפים': 'sheets', 'דף': 'sheet', 'דף אחד': '1 sheet', 'המשך': 'cont.', 'כתב הפירוש': 'Commentary script', 'ניקוי חיפוש': 'Clear search',
    'רמב״ם': 'Rambam', 'הלכה': 'Halakhah', 'הלכות': 'Halakhot', 'בכל הרמב״ם': 'All Rambam', 'מפרשים': 'Commentaries', 'הלכה מול תרגום': 'Text & translation',
    'כסף משנה': 'Kessef Mishneh', 'השגות הראב״ד': "Ra'avad", 'משנה למלך': 'Mishneh LaMelech', 'מפרשים בתחתית הדף': 'Commentaries at the foot of the page',
    'ניקוד': 'Vowel points', 'בלי ניקוד': 'Without', 'עם ניקוד': 'With', 'כמו במהדורת פרנקל': 'as in the Frankel edition', 'השגת הראב״ד': "Ra'avad's gloss",
    'ש״ס': 'Talmud', 'צורת הדף': 'Vilna page', 'גמרא ומפרשים': 'Gemara & commentary', 'תוספות': 'Tosafot', 'רשב״ם': 'Rashbam', 'גמרא': 'Gemara', 'מסכת': 'Tractate',
    'דף': 'Daf', 'דף קודם': 'Previous daf', 'דף הבא': 'Next daf', 'עמוד א': 'Side a', 'עמוד ב': 'Side b', 'מעבר לדף': 'Go to daf', 'קטע': 'Passage', 'טוען': 'Loading',
    'לא ניתן לטעון את המסכת.': 'Could not load the tractate.', 'לא ניתן לטעון את הספר.': 'Could not load the book.', 'טוען…': 'Loading…', 'בדף': 'Daf', 'במסכת': 'Tractate', 'אין פירוש על קטע זה': 'No commentary on this passage', 'הדף הנוכחי (שני העמודים)': 'The current daf (both sides)',
    'לחצו על קטע בגמרא כדי לראות את הפירוש שלו.': 'Click a passage of the Gemara to see its commentary.', 'הקטע שנבחר': 'Selected passage', 'הקטע הקודם': 'Previous passage', 'הקטע הבא': 'Next passage',
    'טור': 'Tur', 'בית יוסף': 'Beit Yosef', 'ב״ח': 'Bach', 'בית חדש': 'Bayit Chadash', 'סימן': 'Siman', 'סימן קודם': 'Previous siman', 'סימן הבא': 'Next siman', 'הקדמה': 'Introduction', 'הקדמת הטור': 'Introduction to the Tur',
    'טוען את הטור…': 'Loading the Tur…', 'לא ניתן לטעון את הטור.': 'Could not load the Tur.', 'מעבר לסימן': 'Go to siman', 'ארבעה טורים': 'Arba\'ah Turim', 'הדיבור הקודם': 'Previous comment', 'הדיבור הבא': 'Next comment', 'הסימן כולו': 'The whole siman',
    'הטור באמצע, ב״ח מימין ובית יוסף משמאל.': 'The Tur in the middle, Bach on the right and Beit Yosef on the left.', 'לחצו על סימן בטור או על דיבור כדי לקרוא אותו באותיות גדולות.': 'Click a marker in the Tur or a comment to read it in large letters.',
    'בטור מקלידים מקום: ״או״ח ס״, ״יו״ד קצג״, או מספר סימן.': 'In the Tur, type a place: "OC 60", "YD 193", or a siman number.'
  };
  const T = he => isEn() ? (EN[he] || he) : he;
  const num = n => isEn() ? String(n) : toHeb(n);
  const bkName = he => APP.bookName ? APP.bookName(he) : he;
  const grpName = he => APP.groupName ? APP.groupName(he) : he;

  const ICON = {
    chevR: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    chevL: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    caret: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    book: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    x: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    vBook: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h7v14H3zM14 5h7v14h-7zM16 9h3M16 12h3M5 9h3M5 12h3"/></svg>',
    print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
    vRows: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 6h12M3 12h12M3 18h12M18 6h3M18 12h3M18 18h3"/></svg>'
  };

  let IX = null, built = false, R = null, geo = null, hlTimer = 0, fxDir = 0, fxLast = 0, fxTimer = 0, deskRO = null, roT = 0;
  const PC = new Map(); // מטמון עימוד: ספר:פרק|גאומטריה → [[פסוקים בעמוד]]
  // tk = המסכת הפתוחה (ריק = תנ״ך/משנה), tj = העמוד בה, tview = צורת הדף (daf) או גמרא ומפרשים (study)
  const DEF = { b: 0, ch: 1, anchor: 1, view: 'book', tr: 'onkelos', trFont: 'rashi', cmFont: 'rashi', size: 0, scope: 'book', src: 'txt', prScope: 'spread', prColor: 'color', tk: '', tj: 0, tview: 'daf', tsrc: 'all', cmOff: [], ramNik: true, rk: '', rs: 1 };
  const S = Object.assign({}, DEF, (() => { try { return JSON.parse(localStorage.getItem('gimatrivonReader') || '{}'); } catch (e) { return {}; } })());
  S.p = 0; S.hl = ''; S.lock = null; S.tp = 0; S.sel = null; S.rp = 0; S.rsel = null;
  const save = () => { try { localStorage.setItem('gimatrivonReader', JSON.stringify({ b: S.b, ch: S.ch, anchor: S.anchor, view: S.view, tr: S.tr, trFont: S.trFont, cmFont: S.cmFont, size: S.size, scope: S.scope, src: S.src, prScope: S.prScope, prColor: S.prColor, tk: S.tk, tj: S.tj, tview: S.tview, tsrc: S.tsrc, cmOff: S.cmOff, ramNik: S.ramNik, rk: S.rk, rs: S.rs })); } catch (e) {} };

  let TX = null;
  const ensureIndex = () => {
    if (IX) return;
    TX = talIndex(G.GIM_TALMUD_INDEX);
    if (S.tk && TX.byK[S.tk] == null) S.tk = '';
    RX = turIndex(G.GIM_TUR_INDEX);
    if (S.rk && RX.byK[S.rk] == null) S.rk = '';
    if (S.rk) S.tk = '';
    IX = buildIndex({ books: G.GimCorpus.books });
    if (!IX.base.includes(S.b) || !hasRef(IX, S.b, S.ch, 0)) { S.b = 0; S.ch = 1; S.anchor = 1; }
  };
  /* טעינה לפי דרישה: need(b) = הספר, התרגום והמפרשים שמוצגים בו. ensure(ids, again) מחזיר true אם הכל כבר נטען;
     אחרת מתחיל לטעון, ו-again() נקרא כשהטעינה הסתיימה (כמו loadTract בגמרא). */
  const need = b => { const t = trBook(b); return [b].concat(t ? [t.b] : [], cmsOn(b).map(x => x.b)); };
  const loaded = ids => ids.every(b => IX.data[b]);
  const LOADING = new Set();
  function ensure(ids, again, prog) {
    ids = [...new Set(ids.filter(b => b != null && !IX.data[b]))];
    if (!ids.length) return true;
    const key = ids.join(','); if (LOADING.has(key)) return false;
    LOADING.add(key);
    // התקדמות לפי גודל הקבצים (books[b].fb), כמו במסכת: כל ספר זוחל לעבר 90% וקופץ למלא כשנטען
    const pe = prog ? progEase(prog, ids.map(b => (IX.books[b].fb || [1]).reduce((a, x) => a + x, 0))) : null;
    G.GimCorpus.load(ids, b => { if (pe) pe.got(ids.indexOf(b)); }).then(() => { LOADING.delete(key); if (pe) pe.end(); ids.forEach(b => addBook(IX, b, G.GimCorpus.each)); again(true); },
      () => { LOADING.delete(key); if (pe) pe.end(); again(false); });
    return false;
  }
  // הספרים הסמוכים (לדפדוף רציף בין ספרים) — נטענים יחד עם הספר הפתוח
  const nearBooks = b => { const i = IX.base.indexOf(b); return [IX.base[i - 1], b, IX.base[i + 1]].filter(x => x != null); };
  // מטמונים מוגבלים: Map שומר סדר הכנסה, אז מוחקים את הישנים ביותר
  const trimMap = (m, n) => { while (m.size > n) m.delete(m.keys().next().value); };
  // משנה ורמב״ם: כותרת לכל יחידה ("משנה ה" / "הלכה ה") ואין תרגום. uName = שם היחידה בספר
  const isMishnah = b => IX.books[b].cat === 1 || IX.books[b].cat === 7;
  const isRambam = b => IX.books[b].cat === 7;
  const uName = b => IX.books[b].cat === 7 ? 'הלכה' : IX.books[b].cat === 1 ? 'משנה' : 'פסוק';
  const CM_NAME = { 2: 'רש״י', 5: 'ברטנורא', 8: 'כסף משנה', 9: 'השגות הראב״ד', 10: 'משנה למלך' };
  // המפרשים שמוצגים בספר: כל המפרשים שלו, חוץ ממה שכובה בהגדרות (S.cmOff, רלוונטי לרמב״ם)
  const cmsOn = b => ((IX.links[b] || {}).cms || []).filter(x => !S.cmOff.includes(x.c));
  // התרגום בפועל: ההעדפה אם קיימת בספר, אחרת התרגום האחר שקיים בו, ובלי תרגום אם אין
  function trBook(b) {
    const L = IX.links[b] || {}; if (S.tr === 'none') return null;
    if (L[S.tr] != null) return { b: L[S.tr], k: S.tr };
    const alt = S.tr === 'onkelos' ? 'yonatan' : 'onkelos';
    return L[alt] != null ? { b: L[alt], k: alt } : null;
  }
  const trLabel = k => T(k === 'onkelos' ? 'תרגום אונקלוס' : 'תרגום יונתן');
  const cmLabel = b => T(isRambam(b) ? 'מפרשים' : isMishnah(b) ? 'ברטנורא' : 'רש״י');
  const cmName = c => T(CM_NAME[c]);
  const chText = (b, ch, v) => ((IX.data[b] || [])[ch] || [])[v];

  function hlHtml(t, q) {
    if (!q) return h(t);
    const { parts, marks } = markWords(t, q);
    return parts.map((p, i) => marks.has(i) ? '<mark class="rdHl">' + h(p) + '</mark>' : h(p)).join('');
  }

  function geometry() {
    const desk = $r('#rdDesk'), W = desk.clientWidth, H = desk.clientHeight;
    const narrow = W < 600, two = W >= 1000;
    const pw = two ? Math.min(680, Math.floor((W - 140) / 2)) : Math.min(760, W - (narrow ? 12 : 120));
    const ph = Math.max(300, H - (narrow ? 8 : 30));
    const fs = Math.round(((narrow ? 18 : 20.5) + S.size * 1.5) * 10) / 10;
    const trW = Math.round(pw * (S.view === 'book' ? (S.trFont === 'rashi' ? 0.27 : 0.3) : (S.trFont === 'rashi' ? 0.3 : 0.33)));
    return { W, H, narrow, two, pw, ph, fs, trW, per: two ? 2 : 1, cls: pw < 540 ? ' narrow' : '', key: [two, pw, ph, fs, S.view, S.tr, S.trFont, S.cmFont, isEn(), S.cmOff.join(','), S.ramNik].join('|') };
  }

  // מילים של פסוק/משנה (בלי טעמים) — לפיצול משנה ארוכה בין עמודים
  const WC = new Map();
  const wordsOf = (b, ch, v) => { const k = b + ':' + ch + ':' + v; if (!WC.has(k)) { WC.set(k, noTeamim(chText(b, ch, v) || '').split(/\s+/).filter(Boolean)); trimMap(WC, 6000); } return WC.get(k); };
  // דיבורי המפרש של פרק: [{v, dh, body, pos}] לפי הסדר. pos = מספר המילה בפסוק שבה מופיע הדיבור המתחיל
  // (חיפוש קדימה מהדיבור הקודם; אם לא נמצא — אותו מקום כמו הקודם), כדי שכל דיבור יודפס באותו עמוד עם המילים שלו.
  const CMC = new Map();
  function cmEntries(b, ch) {
    const cms = cmsOn(b), key = b + ':' + ch + ':' + cms.map(x => x.c).join(','); if (!cms.length) return [];
    if (!CMC.has(key)) {
      const out = [];
      versesOf(IX, b, ch).forEach(v => {
        const nw = wordsOf(b, ch, v).map(norm);
        // כל מפרש מחפש את הדיבורים שלו מתחילת הפסוק/ההלכה; c = קטגוריית המפרש (לכותרת בתחתית הדף)
        cms.forEach(({ b: cb, c }) => { let last = 0; (chText(cb, ch, v) || []).forEach(t => splitCm(c, t).forEach(e => {
          const dt = norm(e.dh.replace(/וכו['׳]?|וגו['׳]?/g, '')).split(' ').filter(Boolean);
          let pos = -1;
          if (dt.length) for (let i = last; i < nw.length && pos < 0; i++) if (nw[i] === dt[0] && (dt.length < 2 || i + 1 >= nw.length || nw[i + 1] === dt[1])) pos = i;
          if (pos < 0 && dt.length) for (let i = last; i < nw.length && pos < 0; i++) if (nw[i] === dt[0]) pos = i;
          if (pos >= 0) last = pos; else pos = last;
          out.push({ v, dh: e.dh, body: e.body, pos, c });
        })); });
      });
      CMC.set(key, out); trimMap(CMC, 40);
    }
    return CMC.get(key);
  }
  // עמוד = { segs: [{v, from, to}], cm: [דיבורים], vs: [פסוקים] }. כל עמוד מכיל טקסט (פסוק שלם, או חלק ממשנה ארוכה)
  // ואת כל הפירוש שלו ורק אותו — פירוש לא "זולג" לעמוד אחר בלי הטקסט שלו.
  function pageInner(b, ch, pg, pageNo, q) {
    const segs = pg.segs, tb = trBook(b), bk = IX.books[b], v0 = versesOf(IX, b, ch)[0];
    const first = segs.length && segs[0].v === v0 && segs[0].from === 0;
    const trCls = S.trFont === 'rashi' ? 'fR' : 'fN', cmCls = S.cmFont === 'rashi' ? 'fR' : 'fN';
    const trTxt = s => { if (!tb || s.from > 0) return ''; const t = chText(tb.b, ch, s.v); return t ? (S.trFont === 'rashi' ? noMarks(t) : noTeamim(t)) : ''; };
    const whole = s => s.from === 0 && s.to >= wordsOf(b, ch, s.v).length;
    const main = s => hlHtml(whole(s) ? noTeamim(chText(b, ch, s.v)) : wordsOf(b, ch, s.v).slice(s.from, s.to).join(' '), q) + (s.to < wordsOf(b, ch, s.v).length ? ' <span class="rdCont">…</span>' : '');
    const vn = s => s.from === 0 ? '<span class="vn">' + num(s.v) + '</span>' : '<span class="rdCont">…</span> ';
    const rv = segs.map(s => s.v);
    let html = '<header class="rdHead' + (isRambam(b) ? ' ram' : '') + '"><span>' + h(bkName(bk.heTitle)) + '</span><span class="mid">' + h(grpName(bk.g)) + '</span><span' + (isEn() ? ' dir="ltr"' : '') + '>' + num(ch) + ', ' + num(rv[0]) + (rv[rv.length - 1] !== rv[0] ? '–' + num(rv[rv.length - 1]) : '') + '</span></header>';
    const title = first ? '<div class="rdChTitle">' + (ch === 1 ? '<span class="bk">' + h(bkName(bk.heTitle)) + '</span>' : '') + '<span class="ch">' + T('פרק') + ' ' + num(ch) + '</span></div>' : '';
    if (isRambam(b) && S.view === 'book') html += ramBody(b, ch, pg, segs, first, q);
    else if (isMishnah(b)) {
      // משנה: כותרת לכל משנה ("משנה ה", ובהמשך של משנה מפוצלת "משנה ה (המשך)"), בשתי התצוגות — במשנה אין תרגום
      html += '<div class="rdBody"><div class="rdTxt">' + title + segs.map(s => '<div class="rdMsh rdV" data-v="' + s.v + '"><div class="rdMshH"><span>' + T(uName(b)) + ' ' + num(s.v) + (s.from > 0 ? ' <i>(' + T('המשך') + ')</i>' : '') + '</span></div><p>' + (s.from > 0 ? '<span class="rdCont">…</span> ' : '') + main(s) + '</p></div>').join('') + '</div></div>';
    } else if (S.view === 'book') {
      html += '<div class="rdBody' + (tb ? ' withTr' : '') + '"><div class="rdTxt">' + title + '<p>' + segs.map(s => '<span class="rdV" data-v="' + s.v + '">' + vn(s) + main(s) + '</span>').join(' ') + '</p></div>';
      if (tb) html += '<aside class="rdTr ' + trCls + '" aria-label="' + h(trLabel(tb.k)) + '"><div class="rdTrHd">' + h(trLabel(tb.k)) + '</div><p>' + segs.map(s => { const t = trTxt(s); return t ? '<span class="rdV" data-v="' + s.v + '">' + vn(s) + hlHtml(t, q) + '</span>' : ''; }).join(' ') + '</p></aside>';
      html += '</div>';
    } else {
      html += '<div class="rdBody rdRows' + (tb ? '' : ' noTr') + '">' + title + '<div class="rdRowHd"><span></span><span>' + T(isMishnah(b) ? uName(b) : 'מקרא') + '</span>' + (tb ? '<span class="trh">' + h(trLabel(tb.k)) + '</span>' : '') + '</div>' +
        segs.map(s => '<div class="rdRow" data-v="' + s.v + '"><span class="vnc">' + (s.from === 0 ? vn(s) : '') + '</span><span class="he">' + (s.from > 0 ? '<span class="rdCont">…</span> ' : '') + main(s) + '</span>' + (tb ? '<span class="tr ' + trCls + '">' + hlHtml(trTxt(s), q) + '</span>' : '') + '</div>').join('') + '</div>';
    }
    html += '<div class="rdSp"></div>';
    if (pg.cm.length) {
      // מפרש אחד = מקטע אחד בתחתית הדף; ברמב״ם כמה מקטעים זה אחר זה (כסף משנה, הראב״ד, משנה למלך), כל אחד עם הכותרת שלו
      const fx = s => S.cmFont === 'rashi' ? noMarks(s) : s;
      const inl = isRambam(b) && S.view === 'book'; // בעיצוב פרנקל הראב״ד מודפס בתוך הטקסט (ramBody), לא בתחתית
      cmsOn(b).map(x => x.c).filter(c => !(inl && c === 9) && pg.cm.some(e => e.c === c)).forEach(c => {
        html += '<section class="rdCm ' + cmCls + '" aria-label="' + h(cmName(c)) + '"><div class="rdCmHd"><span class="ln"></span><span>' + h(cmName(c)) + '</span></div><div class="rdCmBody">' +
          pg.cm.filter(e => e.c === c).map(e => '<p data-v="' + e.v + '"' + (e.cont ? ' class="cont"' : '') + '><span class="cv">' + num(e.v) + '</span>' + (e.cont ? '<span class="rdCont">…</span> ' : '') + (e.dh ? '<b>' + hlHtml(fx(e.dh), q) + '</b>' : '') + hlHtml(fx(e.body), q) + (e.cut ? ' <span class="rdCont">…</span>' : '') + '</p>').join('') + '</div></section>';
      });
    }
    html += '<div class="rdNum">' + num(pageNo) + '</div>';
    return html;
  }
  /* דף רמב״ם בעיצוב מהדורת פרנקל: "פרק שמיני" במילים, ההלכות ברצף עם אות מודגשת, בלי ניקוד (אפשר להפעיל בתצוגה),
     והשגות הראב״ד באות קטנה מתחת להלכה שעליה הן נאמרו. כסף משנה ומשנה למלך נשארים בתחתית הדף, בשני טורים.
     הראב״ד הוא חלק מ-pg.cm, ולכן העימוד (pagesFor) מודד אותו כמו כל פירוש — רק המקום שלו בדף שונה. */
  const ORD = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני', 'תשיעי', 'עשירי'];
  const unNik = t => S.ramNik ? t : String(t).replace(/[\u05B0-\u05BD\u05BF-\u05C7]/g, ''); // הניקוד יורד, המקף נשאר
  function ramBody(b, ch, pg, segs, first, q) {
    const bk = IX.books[b], n = s => wordsOf(b, ch, s.v).length;
    const txt = s => hlHtml(unNik(s.from === 0 && s.to >= n(s) ? noTeamim(chText(b, ch, s.v)) : wordsOf(b, ch, s.v).slice(s.from, s.to).join(' ')), q) + (s.to < n(s) ? ' <span class="rdCont">…</span>' : '');
    const fx = t => S.cmFont === 'rashi' ? noMarks(t) : t;
    const rv = list => list.map(e => '<div class="rdRv ' + (S.cmFont === 'rashi' ? 'fR' : 'fN') + '" data-v="' + e.v + '">' + (e.cont ? '<span class="rdCont">…</span> ' : '<span class="rvh">' + T('השגת הראב״ד') + '</span> ') + (e.dh ? '<b>' + hlHtml(fx(e.dh), q) + '</b>' : '') + hlHtml(fx(e.body), q) + (e.cut ? ' <span class="rdCont">…</span>' : '') + '</div>').join('');
    const rvs = pg.cm.filter(e => e.c === 9), vs = segs.map(s => s.v);
    const title = first ? '<div class="rdChTitle rdRamT">' + (ch === 1 ? '<span class="bk">' + h(bkName(bk.heTitle)) + '</span>' : '') + '<span class="ch">' + (isEn() || !ORD[ch] ? T('פרק') + ' ' + num(ch) : 'פרק ' + ORD[ch]) + '</span><span class="orn" aria-hidden="true">❖</span></div>' : '';
    let out = '<div class="rdBody"><div class="rdTxt rdRamTx">' + title + rv(rvs.filter(e => !vs.includes(e.v))) + '<p>';
    segs.forEach((s, i) => {
      out += '<span class="rdV" data-v="' + s.v + '">' + (s.from === 0 ? '<span class="hl">' + num(s.v) + '</span>' : '<span class="rdCont">…</span> ') + txt(s) + '</span> ';
      const mine = rvs.filter(e => e.v === s.v);
      if (mine.length && (s.to >= n(s) || i === segs.length - 1)) out += '</p>' + rv(mine) + '<p>';
    });
    return (out + '</p></div></div>').replace(/<p><\/p>/g, '');
  }
  const over = el => el.scrollHeight > el.clientHeight + 1;
  // חיתוך רשימת דיבורים אחרי n מילים (דיבור מתחיל + פירוש): [מה שנשאר בעמוד, ההמשך]. חלק ראשון מסומן cut, ההמשך cont
  const cmWordsOf = e => (e.dh ? e.dh.split(/\s+/).filter(Boolean) : []).concat(e.body.split(/\s+/).filter(Boolean));
  const cmLen = e => cmWordsOf(e).length;
  function cutCm(list, n) {
    const keep = [], rest = []; let left = n;
    list.forEach(e => {
      const len = cmLen(e);
      if (left >= len) { keep.push(e); left -= len; return; }
      if (left <= 0) { rest.push(e); return; }
      const ws = cmWordsOf(e), dn = e.dh ? e.dh.split(/\s+/).filter(Boolean).length : 0;
      const a = ws.slice(0, left), z = ws.slice(left);
      keep.push(Object.assign({}, e, { dh: a.slice(0, dn).join(' '), body: (left > dn ? ' ' : '') + a.slice(dn).join(' '), cut: true }));
      rest.push(Object.assign({}, e, { dh: z.length > ws.length - dn ? z.slice(0, z.length - (ws.length - dn)).join(' ') : '', body: z.slice(Math.max(0, z.length - (ws.length - dn))).join(' '), cont: true, cut: false }));
      left = 0;
    });
    return [keep, rest];
  }

  function pagesFor(b, ch) {
    const key = b + ':' + ch + '|' + geo.key; if (PC.has(key)) return PC.get(key);
    const probe = $r('#rdProbe'), ents = cmEntries(b, ch), pages = [];
    probe.className = 'rdPage' + geo.cls;
    // דיבורים של קטע: לפי מיקום הדיבור המתחיל במילים [from, to); הקטע האחרון של פסוק לוקח גם את מה שאחרי
    const entsOf = s => { const n = wordsOf(b, ch, s.v).length; return ents.filter(e => e.v === s.v && e.pos >= s.from && (s.to >= n || e.pos < s.to)); };
    // carry = המשך של דיבורים ארוכים מהעמוד הקודם (פירוש שלא נכנס כולו בעמוד אחד עם הטקסט שלו, כמו רש״י על "בראשית").
    // הוא בא בראש הפירוש בעמוד הבא, ותמיד עם טקסט חדש באותו עמוד. cut = כמה מילים של הפירוש להשאיר בעמוד (השאר עובר ל-carry).
    let carry = [];
    const mk = (segs, cut) => { const all = carry.concat(...segs.map(entsOf)); return { segs, vs: [...new Set(segs.map(s => s.v))], cm: cut == null ? all : cutCm(all, cut)[0] }; };
    const fits = (segs, cut) => { probe.innerHTML = pageInner(b, ch, mk(segs, cut), pages.length + 1, ''); return !over(probe); };
    const cmWords = segs => carry.concat(...segs.map(entsOf)).reduce((n, e) => n + cmLen(e), 0);
    // הכמות הגדולה ביותר k (בין lo ל-max) שעבורה ok(k) — ok מונוטוני יורד; חיפוש דוהר+בינארי כדי למדוד מעט פעמים גם בפרקים ארוכים (תהלים קיט)
    const maxOk = (lo, max, ok) => {
      let good = lo, step = 1;
      while (good + step <= max && ok(good + step)) { good += step; step *= 2; }
      let bad = Math.min(good + step, max + 1);
      while (bad - good > 1) { const mid = (good + bad) >> 1; if (ok(mid)) good = mid; else bad = mid; }
      return good;
    };
    // תור הקטעים: בהתחלה כל פסוק שלם; קטע שלא נכנס לבד בעמוד ריק מתפצל במילים
    const queue = versesOf(IX, b, ch).map(v => ({ v, from: 0, to: wordsOf(b, ch, v).length }));
    // רמב״ם: בכל עמוד לפחות Q מילים של הלכה (כ-4 שורות), כמו בדפוס — הטקסט זורם מעמוד לעמוד והפירוש ממשיך אחריו.
    // הלכה שהפירוש שלה ארוך לא "נדחית" לעמוד הבא ומשאירה עמוד של שורה אחת: מתחילים אותה כאן, והפירוש שלא נכנס עובר (carry).
    const ram = isRambam(b), wpl = Math.max(4, Math.round((geo.pw - (geo.narrow ? 32 : 80)) / (geo.fs * 3))), Q = 4 * wpl;
    const nW = list => list.reduce((m, x) => m + x.to - x.from, 0);
    // כמה מילות פירוש נכנסות בעמוד אחד (עם מילה אחת של טקסט) — כדי לפזר את הטקסט על כל העמודים שהפירוש צריך,
    // ולא לגמור את ההלכות לפני הפירוש (בפרקים שהפירוש בהם פי עשרים מהטקסט, כמו יסודי התורה ה)
    let cap = 0;
    const capOf = () => cap || (cap = Math.max(1, maxOk(0, ents.reduce((m, e) => m + cmLen(e), 0), c => {
      const s = queue[0]; probe.innerHTML = pageInner(b, ch, { segs: [{ v: s.v, from: s.from, to: s.from + 1 }], vs: [s.v], cm: cutCm(ents, c)[0] }, 1, ''); return !over(probe);
    })));
    // x המילים הראשונות של התור (הלכות שלמות, ואחריהן חלק מהלכה)
    const take = x => { const out = []; for (let i = 0; x > 0 && i < queue.length; i++) { const s = queue[i], t = Math.min(s.to - s.from, x); out.push({ v: s.v, from: s.from, to: s.from + t }); x -= t; } return out; };
    // חלק הדף שנשאר ריק (הרווח בין הטקסט לפירוש)
    const blank = segs => { probe.innerHTML = pageInner(b, ch, mk(segs), pages.length + 1, ''); const sp = probe.querySelector('.rdSp'); return sp ? sp.offsetHeight / probe.clientHeight : 0; };
    while (ram && queue.length) {
      const k = fits([queue[0]]) ? maxOk(1, queue.length, k => fits(queue.slice(0, k))) : 0;
      const T0 = nW(queue.slice(0, k)), remT = nW(queue), remC = cmWords(queue);
      // היעד לעמוד הזה: 4 שורות, או פחות כשהפירוש שנשאר צריך יותר עמודים ממה שהטקסט מספיק להם
      const Qd = remC ? Math.max(1, Math.min(Q, Math.floor(remT / (Math.ceil(remC / capOf()) + 1)))) : Q;
      let X = T0, cut = null;
      if (k < queue.length) {
        const s = queue[k], n = s.to - s.from;
        // קודם: חלק מההלכה הבאה עם כל הפירוש שלו (רק אם נכנסת לפחות שורה)
        let w = fits(take(T0 + 1)) ? maxOk(1, n - 1, x => fits(take(T0 + x))) : 0;
        if (w < wpl && k) w = 0;
        X = T0 + w;
        // מעט מדי טקסט, או רווח ריק גדול באמצע הדף (הפירוש של ההלכה הבאה ארוך ולכן היא לא נכנסה):
        // ממשיכים את הטקסט בעמוד הזה, והפירוש ממלא את מה שנשאר ונחתך — ההמשך שלו בא בראש הפירוש בעמוד הבא
        const few = X < Qd, gap = !few && blank(take(X)) > 0.2;
        if (few || gap) {
          let want = Math.max(Qd, X + (gap ? wpl : 0));
          // משאירים לעמוד הבא לפחות Qd מילים (אם יש), כדי שהמשך הפירוש לא יבוא עם שורה בודדת
          if (remT - want < Qd) want = Math.max(Math.min(want, remT - Qd), Math.ceil(remT / 2));
          want = Math.min(want, remT - 1);
          if (want > X && !fits(take(want), 0)) want = fits(take(X + 1), 0) ? maxOk(X + 1, want - 1, x => fits(take(x), 0)) : X;
          if (want > X) { X = want; cut = maxOk(0, cmWords(take(X)), c => fits(take(X), c)); }
        }
      }
      if (!X) { X = 1; cut = maxOk(0, cmWords(take(1)), c => fits(take(1), c)); } // מילה אחת שאפילו בלי פירוש לא נכנסת — לא אמור לקרות
      const segs = take(X), pg = mk(segs, cut);
      carry = cut == null ? [] : cutCm(carry.concat(...segs.map(entsOf)), cut)[1];
      segs.forEach(g => { const s = queue[0]; if (g.to < s.to) queue[0] = { v: s.v, from: g.to, to: s.to }; else queue.shift(); });
      pages.push(pg);
      if (pages.length > 600) break;
    }
    // נדיר: נשאר פירוש אחרי המילה האחרונה של הפרק — ממשיכים אותו עם המילים האחרונות שוב, כדי שלא יאבד ולא יהיה עמוד בלי טקסט
    while (ram && carry.length && pages.length < 600) {
      const last = pages[pages.length - 1].segs.slice(-1), pg = c => ({ segs: last, vs: [last[0].v], cm: cutCm(carry, c)[0] });
      const c = Math.max(1, maxOk(0, cmWords([]), c => { probe.innerHTML = pageInner(b, ch, pg(c), pages.length + 1, ''); return !over(probe); }));
      pages.push(pg(c)); carry = cutCm(carry, c)[1];
    }
    while (queue.length) {
      const segs = [];
      // פסוקים שלמים עם כל הפירוש שלהם, כל עוד הם נכנסים
      const k = fits([queue[0]]) ? maxOk(1, queue.length, k => fits(queue.slice(0, k))) : 0;
      let cut = null;
      if (k) segs.push(...queue.splice(0, k));
      else {
        // פסוק/משנה ארוכים מעמוד שלם: חלק ראשון במילים, עם הדיבורים שלו, והשאר בעמוד הבא
        const s = queue[0], n = s.to - s.from;
        const one = fits([{ v: s.v, from: s.from, to: s.from + 1 }]);
        let w = n > 1 && one ? maxOk(1, n - 1, w => fits([{ v: s.v, from: s.from, to: s.from + w }])) : Math.min(n, Math.max(1, (ents.find(e => e.v === s.v && e.pos > s.from) || { pos: s.to }).pos - s.from));
        if (!one) {
          // גם מילה אחת עם הפירוש שלה גדולה מעמוד: חותכים את הפירוש במילים, וממשיכים אותו בעמוד הבא עם המשך הפסוק
          if (w >= n && n > 1) w = n - 1;
          // והטקסט עצמו (בלי הפירוש) חייב להיכנס: דיבור שלא נמצא בפסוק נצמד למילה הראשונה, ואז w עד הדיבור הבא יכול להיות ארוך מעמוד
          if (w > 1 && !fits([{ v: s.v, from: s.from, to: s.from + w }], 0)) w = maxOk(1, w - 1, x => fits([{ v: s.v, from: s.from, to: s.from + x }], 0));
          const seg = [{ v: s.v, from: s.from, to: s.from + w }];
          cut = maxOk(0, cmWords(seg), c => fits(seg, c));
        }
        segs.push({ v: s.v, from: s.from, to: s.from + w });
        if (w < n) queue[0] = { v: s.v, from: s.from + w, to: s.to }; else queue.shift();
      }
      const pg = mk(segs, cut);
      carry = cut == null ? [] : cutCm(carry.concat(...segs.map(entsOf)), cut)[1];
      pages.push(pg);
      if (pages.length > 600) break;
    }
    probe.innerHTML = '';
    PC.set(key, pages); trimMap(PC, 60); return pages;
  }
  const baseIdx = b => IX.base.indexOf(b);
  function nextCh(b, ch, dir) {
    const chs = chaptersOf(IX, b), i = chs.indexOf(ch) + dir;
    if (i >= 0 && i < chs.length) return { b, ch: chs[i] };
    const nb = IX.base[baseIdx(b) + dir]; if (nb == null) return null;
    const nchs = chaptersOf(IX, nb); return { b: nb, ch: dir > 0 ? nchs[0] : nchs[nchs.length - 1] };
  }

  function render() {
    if (!built || document.body.dataset.mode !== 'read') return;
    geo = geometry();
    R.style.setProperty('--rdPw', geo.pw + 'px'); R.style.setProperty('--rdPh', geo.ph + 'px');
    R.style.setProperty('--rdFs', geo.fs + 'px'); R.style.setProperty('--rdTrW', geo.trW + 'px');
    R.classList.toggle('isTal', isTal()); R.classList.toggle('isTur', isTur());
    if (isTur()) return renderTur();
    if (isTal()) return renderTal();
    $r('#rdPrevCh').setAttribute('aria-label', T('פרק קודם')); $r('#rdNextCh').setAttribute('aria-label', T('פרק הבא')); $r('#rdPrevCh').title = T('פרק קודם'); $r('#rdNextCh').title = T('פרק הבא');
    document.querySelectorAll('#rdViewSeg button[data-view=book] .t').forEach(x => { x.textContent = T('ספר'); });
    if (!ensure([].concat(...nearBooks(S.b).map(need)), ok => { if (!ok) { geo = geometry(); $r('#rdBook').innerHTML = '<article class="rdPage single rdLoading' + geo.cls + '"><p>' + T('לא ניתן לטעון את הספר.') + '</p></article>'; } else render(); }, f => loadProg('b' + S.b, f))) {
      $r('#rdBook').innerHTML = loadingHtml('b' + S.b, bkName(IX.books[S.b].heTitle), geo);
      $r('#rdWhereTxt').textContent = bkName(IX.books[S.b].heTitle) + ' · ' + T('פרק') + ' ' + num(S.ch);
      return;
    }
    const pages = pagesFor(S.b, S.ch);
    // בשני עמודים הפריסה רציפה בין פרקים: אם בפרק מספר עמודים אי-זוגי, העמוד הראשון של הפרק הבא ממלא את הצד השמאלי
    // (במקום עמוד ריק). לכן S.p יכול להיות אי-זוגי; בקפיצה לפסוק שומרים על הזוגיות של הפריסה הנוכחית באותו פרק.
    const locked = S.lock != null;
    let idx = locked ? S.lock : pages.findIndex(p => p.vs.includes(S.anchor));
    S.lock = null; if (idx < 0 || idx >= pages.length) idx = 0;
    if (locked || geo.per === 1) S.p = idx;
    else { const par = S.at === S.b + ':' + S.ch ? S.p % 2 : 0; S.p = idx < par ? 0 : idx - ((idx - par) % 2); }
    S.at = S.b + ':' + S.ch;
    const shown = pages.slice(S.p, S.p + geo.per);
    S.anchor = shown[0].segs[0].v;
    const nx = geo.two && shown.length < 2 ? nextCh(S.b, S.ch, 1) : null, nxPg = nx && pagesFor(nx.b, nx.ch)[0];
    const book = $r('#rdBook');
    book.className = 'rdBook' + (geo.two ? ' two' : ' one');
    const side = i => geo.two ? (i ? 'left' : 'right') : 'single', nar = geo.cls;
    book.innerHTML = shown.map((pg, i) => '<article class="rdPage ' + side(i) + nar + '" aria-label="' + T('עמוד') + ' ' + num(S.p + i + 1) + '">' + pageInner(S.b, S.ch, pg, S.p + i + 1, S.hl) + '</article>').join('') +
      (nxPg ? '<article class="rdPage left next' + nar + '" aria-label="' + T('עמוד') + ' ' + num(1) + '">' + pageInner(nx.b, nx.ch, nxPg, 1, '') + '</article>' :
        geo.two && shown.length < 2 ? '<article class="rdPage left blank' + nar + '" aria-hidden="true"></article>' : '') + (geo.two ? '<div class="rdSpine" aria-hidden="true"></div>' : '');
    book.querySelectorAll('.rdPage').forEach(p => { if (over(p)) p.classList.add('tight'); });
    const bk = IX.books[S.b], chs = chaptersOf(IX, S.b);
    $r('#rdWhereTxt').textContent = bkName(bk.heTitle) + ' · ' + T('פרק') + ' ' + num(S.ch);
    $r('#rdPos').textContent = (shown.length > 1 ? T('עמודים') + ' ' + num(S.p + 1) + '–' + num(S.p + 2) : T('עמוד') + ' ' + num(S.p + 1)) + ' ' + T('מתוך') + ' ' + num(pages.length) +
      (nxPg ? ' · ' + T('ממשיך ל') + (nx.b !== S.b ? bkName(IX.books[nx.b].heTitle) + ' ' : '') + T('פרק') + ' ' + num(nx.ch) : '');
    $r('#rdChPos').textContent = T('פרק') + ' ' + num(S.ch) + ' ' + T('מתוך') + ' ' + num(chs.length);
    $r('#rdProgBar').style.width = Math.max(2, Math.round(100 * (chs.indexOf(S.ch) + (S.p + shown.length) / pages.length) / chs.length)) + '%';
    const atStart = S.p === 0 && !nextCh(S.b, S.ch, -1), atEnd = S.p + geo.per >= pages.length && !nextCh(S.b, S.ch, 1);
    ['#rdPrev', '#rdPrev2'].forEach(s => { $r(s).disabled = atStart; });
    ['#rdNext', '#rdNext2'].forEach(s => { $r(s).disabled = atEnd; });
    $r('#rdPrevCh').disabled = !nextCh(S.b, S.ch, -1); $r('#rdNextCh').disabled = !nextCh(S.b, S.ch, 1);
    document.querySelectorAll('#rdViewSeg button').forEach(x => { const on = x.dataset.view === S.view; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    $r('#rdViewSeg [data-view=aligned] .t').textContent = T(uName(S.b) + ' מול תרגום');
    if (fxDir) { reveal(book, fxDir); fxDir = 0; }
    save();
    prePaginate();
  }
  // עימוד הפרק הבא מראש, בזמן מנוחה — כך שהדפדוף אליו מיידי
  function prePaginate() {
    const ric = G.requestIdleCallback || (f => setTimeout(f, 200)), key = geo.key;
    ric(() => {
      if (!built || isTal() || !geo || geo.key !== key) return;
      const n = nextCh(S.b, S.ch, 1); if (n && loaded(need(n.b))) pagesFor(n.b, n.ch);
    });
  }

  /* הופעה הדרגתית של הטקסט בדפדוף ובמעבר פרק (לא בפתיחה, בשינוי גודל או בהגדרות): כל גוש (כותרת, פסקת מקרא/משנה, התרגום,
     כל דיבור בפירוש) נכנס בדהייה עם הזזה קטנה מכיוון הדפדוף — קדימה מגיע משמאל. סדר קבוע בכל עמוד: מקרא, תרגום, פירוש.
     רק opacity ו-transform. הפחתת תנועה = דהייה קצרה של העמוד כולו בלי הזזה; דפדוף מהיר ברצף מדלג על האפקט. */
  const FX_START = [0, 220, 400], FX_STEP = 90, FX_DUR = 880;
  const FX_BLOCKS = '.rdChTitle,.rdTxt>p,.rdMsh,.rdTr,.rdRowHd,.rdRow,.rdCmHd,.rdCmBody>p,.rdDafIn,.trMain,.trSide,.trWide';
  function reveal(book, dir) {
    clearTimeout(fxTimer);
    const now = performance.now(), quick = now - fxLast < 280; fxLast = now;
    if (quick) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let end = 0;
    const set = (el, d, t) => { end = Math.max(end, d + t); el.style.setProperty('--fxD', d + 'ms'); el.style.setProperty('--fxT', t + 'ms'); el.classList.add('fxA'); };
    book.style.setProperty('--fxDx', (dir > 0 ? -10 : 10) + 'px');
    book.querySelectorAll('.rdPage:not(.blank)').forEach(pg => {
      if (calm) { pg.querySelectorAll('.rdBody,.rdCm,.rdDaf').forEach(el => set(el, 0, 160)); return; }
      const n = [0, 0, 0];
      pg.querySelectorAll(FX_BLOCKS).forEach(el => {
        const z = el.closest('.rdCm') || el.classList.contains('trY') ? 2 : el.closest('.rdTr') || el.classList.contains('trC') ? 1 : 0;
        set(el, FX_START[z] + Math.min(n[z]++, 8) * FX_STEP, FX_DUR);
      });
    });
    book.classList.add('fxRun', calm ? 'fxCalm' : 'fxRise');
    // אחרי הסיום מסירים הכל, כך שבחירת טקסט והדגשה פועלות על DOM רגיל
    fxTimer = setTimeout(() => {
      book.classList.remove('fxRun', 'fxCalm', 'fxRise');
      book.querySelectorAll('.fxA').forEach(e => { e.classList.remove('fxA'); e.style.removeProperty('--fxD'); e.style.removeProperty('--fxT'); });
    }, end + 60);
  }

  function flash(v) {
    clearTimeout(hlTimer);
    const els = R.querySelectorAll('.rdBook .rdPage:not(.next) [data-v="' + v + '"]');
    els.forEach(e => { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); });
    hlTimer = setTimeout(() => els.forEach(e => e.classList.remove('flash')), 2600);
  }
  function goTo(b, ch, v) {
    S.tk = ''; S.rk = ''; closeSeg();
    S.b = b; S.ch = ch; S.anchor = v || versesOf(IX, b, ch)[0] || 1;
    render(); if (v) flash(v);
  }
  function turn(dir) {
    if (isTur()) return turTurn(dir);
    if (isTal()) return talTurn(dir);
    // np מעבר לסוף הפרק = כמה עמודים של הפרק הבא כבר הוצגו (0 או 1); מתחת לאפס = כמה עמודים לקחת מסוף הפרק הקודם
    const pages = pagesFor(S.b, S.ch), np = S.p + dir * geo.per;
    if (np >= 0 && np < pages.length) { S.lock = np; fxDir = dir; render(); return; }
    let b = S.b, ch = S.ch, k = dir > 0 ? np - pages.length : np, len;
    for (;;) {
      const n = nextCh(b, ch, dir); if (!n) return;
      b = n.b; ch = n.ch; len = pagesFor(b, ch).length;
      if (dir > 0 ? k < len : len + k >= 0) break;
      k += dir > 0 ? -len : len; // פרק קצר שכולו כבר הוצג בפריסה הקודמת — ממשיכים לפרק שאחריו
    }
    S.b = b; S.ch = ch; S.lock = dir > 0 ? k : len + k;
    fxDir = dir; render();
  }
  function stepChapter(dir) { if (isTur()) return turStep(dir); if (isTal()) return talStep(dir); const n = nextCh(S.b, S.ch, dir); if (n) { fxDir = dir; goTo(n.b, n.ch, 0); } }

  /* ---------- ש״ס: גמרא, רש״י ותוספות ----------
     הנתונים: GIM_TALMUD_INDEX (רשימת מסכתות) וחלקים לכל מסכת (generated/talmud/*.js) שנטענים בתגית script רק
     כשפותחים את המסכת — כך זה עובד גם ב-file://. TD[מסכת] = [[גמרא, רש״י, תוספות, רשב״ם?], …] לכל עמוד.
     שתי תצוגות: "צורת הדף" — כל עמוד (א/ב) הוא דף בספר, בפריסת וילנא של daf-renderer (גמרא באמצע, רש״י בצד
     הפנימי, תוספות בחיצוני), בגודל אותיות שממלא את הדף; "גמרא ומפרשים" — כמו תנ״ך ומשנה: הגמרא בקטעים ממוספרים
     ומתחתיה רש״י ותוספות, בעימוד לפי מדידה. לחיצה על קטע (או על פירוש) מסמנת אותו ואת הפירושים שלו ופותחת חלון. */
  const TD = {}, TLOAD = {};
  const isTal = () => !!S.tk && TX && TX.byK[S.tk] != null;
  const talT = () => TX.list[TX.byK[S.tk]];
  const talName = t => isEn() ? t.k : t.he;
  const dafTxt = j => isEn() ? dafLabel(j, true) : dafLabel(j);
  const amudRow = (k, j) => (TD[k] || [])[j] || [[], [], []];
  const fmtT = s => h(s).replace(/\u0001/g, '<b class="big">').replace(/\u0002/g, '</b>').replace(/\u0003/g, '<b>').replace(/\u0004/g, '</b>');
  const plainT = s => String(s).replace(/[\u0001-\u0004]/g, '');
  const talTxt = (s, q) => q ? hlHtml(plainT(s), q) : fmtT(s);
  const innerLabel = (k, j) => T(amudRow(k, j)[3] ? 'רשב״ם' : 'רש״י');
  // בזיכרון נשארות רק המסכתות האחרונות שנפתחו (מסכת גדולה = כמה MB); אחרת נטענת שוב מהמטמון של הדפדפן
  const TKEEP = [], TMAX = 3;
  function keepTract(k) {
    const i = TKEEP.indexOf(k); if (i >= 0) TKEEP.splice(i, 1); TKEEP.push(k);
    while (TKEEP.length > TMAX) {
      const old = TKEEP.shift(), TP = G.GIM_TP || {}; if (old === S.tk) { TKEEP.push(old); continue; }
      delete TD[old]; TX.list[TX.byK[old]].parts.forEach((p, i) => { delete TP[old + '.' + i]; });
    }
  }
  /* מסך טעינה: שלד של הדף שהשורות שלו "נכתבות", ושם הספר בכתב חלול שמתמלא בזהב (מימין לשמאל) לפי אחוזי הטעינה.
     loadingHtml בונה את הדפים; loadProg(k, 0..1) מעדכן את המילוי אם המסך של k עדיין מוצג. */
  const skLines = (n, c, from) => { let s = ''; for (let i = 0; i < n; i++) s += '<i class="rdSkLn' + c + '" style="--i:' + (from + i) + ';width:' + (i % 6 === 5 ? 58 : 100 - (i * 7 % 13)) + '%"></i>'; return s; };
  function loadingHtml(k, title, geo) {
    const pg = (side, first) => '<article class="rdPage rdSkel ' + side + geo.cls + '"' + (first ? '' : ' aria-hidden="true"') + '><div class="rdSkHead"><i></i><i></i><i></i></div>' +
      (first ? '<div class="rdLoadT" data-k="' + h(k) + '" style="--p:0" role="progressbar" aria-label="' + h(T('טוען') + ' ' + title) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="o">' + h(title) + '</span><span class="f" aria-hidden="true">' + h(title) + '</span></div><div class="rdLoadPct" aria-hidden="true">0%</div>' : '') +
      '<div class="rdSkTx">' + skLines(30, '', 0) + '</div><div class="rdSkCm">' + skLines(30, ' c', first ? 8 : 12) + '</div></article>';
    return geo.two ? pg('right', true) + pg('left', false) : pg('single', true);
  }
  /* התקדמות משוערת לפי גודל (תגית script לא מדווחת על בייטים): כל פריט זוחל לעבר 90% בקצב של בערך 2MB לשנייה,
     got(i) = הפריט נטען (מלא), end() = הכל נטען. set(0..1) מקבל את השבר הכולל. */
  function progEase(set, sizes) {
    const tot = sizes.reduce((a, b) => a + b, 0) || 1, got = sizes.map(() => 0), t0 = Date.now();
    const report = () => set(got.reduce((a, b) => a + b, 0) / tot);
    const tick = setInterval(() => { const sec = (Date.now() - t0) / 1000; sizes.forEach((n, i) => { if (got[i] < n) got[i] = Math.max(got[i], n * 0.9 * (1 - Math.exp(-sec / Math.max(0.6, n / 2e6)))); }); report(); }, 100);
    return { got: i => { if (i >= 0) { got[i] = sizes[i]; report(); } }, end: () => { clearInterval(tick); set(1); } };
  }
  function loadProg(k, f) {
    const el = R.querySelector('.rdLoadT[data-k="' + k + '"]'); if (!el) return;
    const p = Math.max(0, Math.min(100, Math.round(f * 100)));
    el.style.setProperty('--p', p); el.setAttribute('aria-valuenow', p);
    const pc = el.nextElementSibling; if (pc) pc.textContent = p + '%';
  }
  /* התקדמות הטעינה: תגית script לא מדווחת על בייטים (ו-fetch/XHR אסורים, כדי שזה יעבוד offline וב-file://), אז כל חלק
     "זוחל" לעבר 90% בקצב שמותאם לגודל שלו (p.b, מ-build-talmud.py; בערך 2MB לשנייה), וקופץ ל-100% כשהוא נטען בפועל. */
  function loadTract(k, done) {
    if (TD[k]) { keepTract(k); return done(true); }
    if (TLOAD[k]) { TLOAD[k].push(done); return; }
    TLOAD[k] = [done];
    const t = TX.list[TX.byK[k]], TP = G.GIM_TP || (G.GIM_TP = {});
    const need = t.parts.map((p, i) => TP[k + '.' + i] ? 0 : (p.b || 1)), tot = need.reduce((a, b) => a + b, 0) || 1, got = need.map(() => 0);
    const report = () => loadProg(k, got.reduce((a, b) => a + b, 0) / tot);
    const t0 = Date.now(), tick = setInterval(() => { const sec = (Date.now() - t0) / 1000; need.forEach((n, i) => { if (got[i] < n) got[i] = Math.max(got[i], n * 0.9 * (1 - Math.exp(-sec / Math.max(0.6, n / 2e6)))); }); report(); }, 100);
    let left = t.parts.length, failed = false;
    const finish = () => {
      clearInterval(tick); loadProg(k, 1);
      if (!failed) { const all = []; t.parts.forEach((p, i) => { const d = TP[k + '.' + i]; d.a.forEach((row, r) => { all[d.from + r] = row; }); }); TD[k] = all; keepTract(k); }
      const cbs = TLOAD[k]; delete TLOAD[k];
      const go = () => cbs.forEach(cb => cb(!failed));
      if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('16px GimFrank', 'אב'), document.fonts.load('16px GimRashi', 'אב')]).then(go, go); else go();
    };
    const partDone = (i, ok) => { if (!ok || !TP[k + '.' + i]) failed = true; got[i] = need[i]; report(); if (--left === 0) finish(); };
    t.parts.forEach((p, i) => {
      if (TP[k + '.' + i]) { partDone(i, true); return; }
      const sc = document.createElement('script'); sc.src = 'generated/talmud/' + p.f;
      sc.onload = () => partDone(i, true); sc.onerror = () => partDone(i, false);
      document.head.appendChild(sc);
    });
  }
  // פירושי עמוד: [{v: קטע, dh, body, src: 'r'|'t'}]
  const talCm = (k, j) => { const a = amudRow(k, j); return a[1].map(e => ({ v: e[0], dh: e[1], body: e[2], src: 'r' })).concat(a[2].map(e => ({ v: e[0], dh: e[1], body: e[2], src: 't' }))); };

  /* צורת הדף: daf-renderer מחשב את פריסת וילנא לפי שטח הטקסטים. ההגדרות שלו הן משתנים גלובליים אחד לכל הדף,
     ולכן כל עמוד נבנה בנפרד במקום נסתר ו"מוקפא" ל-HTML עם סגנונות קבועים (freezeDaf) — כך שני עמודים
     יכולים להופיע זה לצד זה, וגם בהדפסה. גודל האותיות נבחר בחיפוש בינארי כך שהעמוד ימלא את הגובה. */
  const DC = new Map();
  const FROZE = ['position', 'top', 'left', 'right', 'width', 'height', 'float', 'clear', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'box-sizing'];
  const FROZE_T = ['font-family', 'font-size', 'line-height', 'text-align', 'text-align-last', 'direction'];
  function freezeDaf(el) {
    const cl = el.cloneNode(true), src = [el, ...el.querySelectorAll('div')], dst = [cl, ...cl.querySelectorAll('div')];
    src.forEach((s, i) => {
      const d = dst[i]; if (s.id === 'dummy') { d.remove(); return; }
      const cs = getComputedStyle(s), isText = !s.querySelector('div') && s.querySelector('span') && s.children.length === 1 && s.firstElementChild.tagName === 'SPAN';
      let st = '';
      FROZE.forEach(p => { const v = cs.getPropertyValue(p); if (v && v !== 'auto' && v !== 'none' && v !== 'static' && !(isText && (p === 'width' || p === 'height'))) st += p + ':' + v + ';'; });
      if (isText) FROZE_T.forEach(p => { st += p + ':' + cs.getPropertyValue(p) + ';'; });
      d.removeAttribute('class'); d.removeAttribute('id'); d.setAttribute('style', st + (i === 0 ? 'direction:rtl;position:relative;' : ''));
    });
    cl.className = 'rdDafIn';
    return cl.outerHTML;
  }
  function dafHtml(k, j, W, H, q) {
    const key = k + ':' + j + ':' + W + 'x' + H + ':' + S.size + ':' + (q || ''); if (DC.has(key)) return DC.get(key);
    const a = amudRow(k, j), sp = (cls, s, inner) => '<span class="' + cls + '" data-j="' + j + '" data-s="' + s + '">' + inner + '</span>';
    const main = a[0].map((s, i) => sp('tg', i, talTxt(s, q))).join(' ');
    const cm = (list, c) => list.map(e => sp('tc ' + c, e[0], (e[1] ? '<b>' + talTxt(e[1], q) + '</b> ' : '') + talTxt(e[2], q))).join(' ');
    const host = $r('#rdDafHost'); host.style.width = W + 'px';
    const maxScale = 1 + S.size * 0.12;
    const run = s => {
      host.innerHTML = '<div style="position:relative"></div>'; const el = host.firstChild, fm = 16 * s, fs = 11.2 * s;
      const r = G.dafRenderer(el, { contentWidth: W + 'px', mainWidth: '50%', padding: { vertical: Math.round(9 * s) + 'px', horizontal: Math.round(16 * s) + 'px' }, innerPadding: '4px', outerPadding: '4px',
        fontFamily: { inner: 'GimRashi', outer: 'GimRashi', main: 'GimFrank' }, fontSize: { main: fm.toFixed(2) + 'px', side: fs.toFixed(2) + 'px' }, lineHeight: { main: (fm * 1.38).toFixed(2) + 'px', side: (fs * 1.36).toFixed(2) + 'px' } });
      r.render(main || ' ', cm(a[1], 'cR') || ' ', cm(a[2], 'cT') || ' ', j & 1 ? 'b' : 'a');
      return el.offsetHeight;
    };
    let lo = 0.45, hi = maxScale, out;
    if (run(hi) <= H) lo = hi;
    else for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (run(m) <= H) lo = m; else hi = m; }
    run(lo); out = freezeDaf(host.firstChild); host.innerHTML = '';
    DC.set(key, out); trimMap(DC, 40); return out;
  }
  const talHead = (t, j) => '<header class="rdHead"><span>' + h(T('מסכת') + ' ' + talName(t)) + '</span><span class="mid">' + h(grpName(t.g)) + '</span><span' + (isEn() ? ' dir="ltr"' : '') + '>' + h(dafTxt(j)) + '</span></header>';
  // מידות שטח הטקסט בעמוד (בלי כותרת ומספר), לפי עמוד-בדיקה עם אותן מחלקות
  function dafBox(g) {
    const probe = $r('#rdProbe'); probe.className = 'rdPage tal' + g.cls;
    probe.innerHTML = talHead(talT(), 0) + '<div class="rdDaf"></div><div class="rdNum">א</div>';
    const b = probe.querySelector('.rdDaf'), r = { W: Math.floor(b.clientWidth), H: Math.floor(b.clientHeight) - 4 }; probe.innerHTML = ''; return r;
  }
  function dafPage(k, j, side, g, q) {
    const t = TX.list[TX.byK[k]];
    if (j >= t.n) return '<article class="rdPage ' + side + ' blank' + g.cls + '" aria-hidden="true"></article>';
    const box = dafBox(g);
    return '<article class="rdPage tal ' + side + g.cls + '" aria-label="' + h(T('דף') + ' ' + dafTxt(j)) + '">' + talHead(t, j) +
      '<div class="rdDaf">' + dafHtml(k, j, box.W, box.H, q) + '</div><div class="rdNum">' + h(dafTxt(j)) + '</div></article>';
  }

  /* גמרא ומפרשים: עמודים לכל עמוד-גמרא (pg = {segs: [קטעים], cm: [פירושים]}), כמו pagesFor של תנ״ך/משנה */
  const maxOkF = (lo, max, ok) => {
    let good = lo, step = 1;
    while (good + step <= max && ok(good + step)) { good += step; step *= 2; }
    let bad = Math.min(good + step, max + 1);
    while (bad - good > 1) { const mid = (good + bad) >> 1; if (ok(mid)) good = mid; else bad = mid; }
    return good;
  };
  function studyInner(k, j, pg, q) {
    const t = TX.list[TX.byK[k]], a = amudRow(k, j), cmCls = S.cmFont === 'rashi' ? 'fR' : 'fN';
    const chip = s => '<span class="vn">' + num(s + 1) + '</span>';
    let html = talHead(t, j);
    if (pg.first) html += '<div class="rdChTitle">' + (j === 0 ? '<span class="bk">' + h(T('מסכת') + ' ' + talName(t)) + '</span>' : '') + '<span class="ch">' + h(T('דף') + ' ' + dafTxt(j)) + '</span></div>';
    html += '<div class="rdBody"><div class="rdTxt rdTal"><p>' + pg.segs.map(s => '<span class="rdV tg" data-j="' + j + '" data-s="' + s + '">' + chip(s) + talTxt(a[0][s], q) + '</span>').join(' ') + '</p></div></div><div class="rdSp"></div>';
    [['r', innerLabel(k, j)], ['t', T('תוספות')]].forEach(([src, label]) => {
      const list = pg.cm.filter(e => e.src === src); if (!list.length) return;
      html += '<section class="rdCm ' + cmCls + '" aria-label="' + h(label) + '"><div class="rdCmHd"><span class="ln"></span><span>' + h(label) + '</span></div><div class="rdCmBody">' +
        list.map(e => '<p class="tc ' + (src === 't' ? 'cT' : 'cR') + (e.cont ? ' cont' : '') + '" data-j="' + j + '" data-s="' + e.v + '"><span class="cv">' + num(e.v + 1) + '</span>' + (e.cont ? '<span class="rdCont">…</span> ' : '') + (e.dh ? '<b>' + talTxt(e.dh, q) + '</b> ' : '') + talTxt(e.body, q) + (e.cut ? ' <span class="rdCont">…</span>' : '') + '</p>').join('') + '</div></section>';
    });
    return html + '<div class="rdNum">' + h(dafTxt(j)) + '</div>';
  }
  function studyPages(k, j, g) {
    const key = 'T' + k + ':' + j + '|' + g.key; if (PC.has(key)) return PC.get(key);
    const probe = $r('#rdProbe'), a = amudRow(k, j), ents = talCm(k, j), pages = [];
    probe.className = 'rdPage tal' + g.cls;
    let carry = [];
    const mk = (segs, cut) => { const all = carry.concat(...segs.map(s => ents.filter(e => e.v === s))); return { segs, first: !pages.length, cm: cut == null ? all : cutCm(all, cut)[0] }; };
    const fits = (segs, cut) => { probe.innerHTML = studyInner(k, j, mk(segs, cut), ''); return !over(probe); };
    const queue = a[0].map((_, i) => i);
    if (!queue.length) queue.push(0);
    while (queue.length) {
      let n = fits([queue[0]]) ? maxOkF(1, queue.length, n => fits(queue.slice(0, n))) : 0, cut = null;
      if (!n) { n = 1; const seg = [queue[0]]; cut = maxOkF(0, carry.concat(...seg.map(s => ents.filter(e => e.v === s))).reduce((x, e) => x + cmLen(e), 0), c => fits(seg, c)); }
      const segs = queue.splice(0, n), pg = mk(segs, cut);
      carry = cut == null ? [] : cutCm(carry.concat(...segs.map(s => ents.filter(e => e.v === s))), cut)[1];
      pages.push(pg);
      if (!queue.length && carry.length) { pages.push({ segs: [], first: false, cm: carry }); carry = []; }
      if (pages.length > 200) break;
    }
    probe.innerHTML = '';
    PC.set(key, pages); trimMap(PC, 60); return pages;
  }
  const stNext = (k, j, p, dir, g) => {
    const t = TX.list[TX.byK[k]];
    if (dir > 0) { if (p + 1 < studyPages(k, j, g).length) return { j, p: p + 1 }; return j + 1 < t.n ? { j: j + 1, p: 0 } : null; }
    if (p > 0) return { j, p: p - 1 };
    return j > 0 ? { j: j - 1, p: studyPages(k, j - 1, g).length - 1 } : null;
  };

  function renderTal() {
    const t = talT(), k = t.k, book = $r('#rdBook');
    book.className = 'rdBook' + (geo.two ? ' two' : ' one');
    const setBar = () => {
      $r('#rdWhereTxt').textContent = talName(t) + ' · ' + T('דף') + ' ' + dafTxt(S.tj);
      $r('#rdPrevCh').setAttribute('aria-label', T('דף קודם')); $r('#rdNextCh').setAttribute('aria-label', T('דף הבא'));
      $r('#rdPrevCh').title = T('דף קודם'); $r('#rdNextCh').title = T('דף הבא');
      document.querySelectorAll('#rdViewSeg button').forEach(x => { const v = x.dataset.view === 'book' ? 'daf' : 'study', on = v === S.tview; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); x.querySelector('.t').textContent = T(v === 'daf' ? 'צורת הדף' : 'גמרא ומפרשים'); });
      $r('#rdChPos').textContent = T('מסכת') + ' ' + talName(t);
      $r('#rdProgBar').style.width = Math.max(2, Math.round(100 * (S.tj + 1) / t.n)) + '%';
      $r('#rdPrevCh').disabled = S.tj < 2; $r('#rdNextCh').disabled = (S.tj | 1) + 1 >= t.n;
    };
    if (!TD[k]) {
      setBar(); $r('#rdPos').textContent = '';
      book.innerHTML = loadingHtml(k, T('מסכת') + ' ' + talName(t), geo);
      loadTract(k, ok => { if (!ok) book.innerHTML = '<article class="rdPage single rdLoading' + geo.cls + '"><p>' + T('לא ניתן לטעון את המסכת.') + '</p></article>'; else if (S.tk !== k) return; else if (S.sel) goTal(k, S.sel.j, S.sel.s); else render(); });
      return;
    }
    S.tj = Math.max(0, Math.min(S.tj, t.n - 1));
    let html = '', from = S.tj, last = S.tj, lastPg = null;
    if (S.tview === 'daf') {
      if (geo.two) { from = S.tj - (S.tj & 1); last = Math.min(from + 1, t.n - 1); html = dafPage(k, from, 'right', geo, S.hl) + dafPage(k, from + 1, 'left', geo, S.hl); }
      else html = dafPage(k, S.tj, 'single', geo, S.hl);
      $r('#rdPos').textContent = (from !== last ? T('עמודים') + ' ' + dafTxt(from) + '–' + dafTxt(last) : T('עמוד') + ' ' + dafTxt(from)) + ' ' + T('מתוך') + ' ' + dafTxt(t.n - 1);
    } else {
      const ps = studyPages(k, S.tj, geo); if (S.tp >= ps.length) S.tp = ps.length - 1;
      const shown = [{ j: S.tj, p: S.tp }]; if (geo.two) { const n = stNext(k, S.tj, S.tp, 1, geo); if (n) shown.push(n); }
      const side = i => geo.two ? (i ? 'left' : 'right') : 'single';
      html = shown.map((x, i) => '<article class="rdPage tal ' + side(i) + geo.cls + '">' + studyInner(k, x.j, studyPages(k, x.j, geo)[x.p], S.hl) + '</article>').join('') + (geo.two && shown.length < 2 ? '<article class="rdPage left blank' + geo.cls + '" aria-hidden="true"></article>' : '');
      last = shown[shown.length - 1].j; lastPg = shown[shown.length - 1];
      $r('#rdPos').textContent = T('עמוד') + ' ' + dafTxt(S.tj) + (last !== S.tj ? '–' + dafTxt(last) : '') + ' ' + T('מתוך') + ' ' + dafTxt(t.n - 1);
    }
    book.innerHTML = html + (geo.two ? '<div class="rdSpine" aria-hidden="true"></div>' : '');
    book.querySelectorAll('.rdPage').forEach(p => { if (over(p)) p.classList.add('tight'); });
    if (fxDir) { reveal(book, fxDir); fxDir = 0; }
    setBar();
    const atStart = S.tview === 'daf' ? from === 0 : !stNext(k, S.tj, S.tp, -1, geo);
    const atEnd = S.tview === 'daf' ? (geo.two ? from + 2 >= t.n : S.tj + 1 >= t.n) : !stNext(k, lastPg.j, lastPg.p, 1, geo);
    ['#rdPrev', '#rdPrev2'].forEach(s => { $r(s).disabled = atStart; });
    ['#rdNext', '#rdNext2'].forEach(s => { $r(s).disabled = atEnd; });
    markSel();
    save();
  }
  function talTurn(dir) {
    const t = talT();
    if (S.tview === 'daf') { const step = geo.two ? 2 : 1, base = geo.two ? S.tj - (S.tj & 1) : S.tj, n = base + dir * step; if (n < 0 || n >= t.n) return; S.tj = n; S.tp = 0; fxDir = dir; return render(); }
    let x = { j: S.tj, p: S.tp };
    for (let i = 0; i < (geo.two ? 2 : 1); i++) { const n = stNext(t.k, x.j, x.p, dir, geo); if (!n) { if (i === 0) return; break; } x = n; }
    S.tj = x.j; S.tp = x.p; fxDir = dir; render();
  }
  function talStep(dir) { const t = talT(), base = S.tj - (S.tj & 1), n = base + dir * 2; if (n < 0 || n >= t.n) return; S.tj = n; S.tp = 0; fxDir = dir; render(); }
  function goTal(k, j, s) {
    S.rk = ''; S.tk = k; S.tj = j || 0; S.tp = 0; closeSeg();
    if (s != null) S.sel = { j: S.tj, s }; // אם המסכת עוד לא נטענה — החלון ייפתח אחרי הטעינה
    render();
    if (s == null || !TD[k]) return;
    if (S.tview === 'study') { const p = studyPages(k, S.tj, geo).findIndex(pg => pg.segs.includes(s)); if (p > 0) { S.tp = p; render(); } }
    openSeg(S.tj, s);
  }

  /* חלון הקטע: הקטע שנבחר ופירושיו (רש״י / תוספות), בגודל קריא — בצורת הדף האותיות קטנות */
  let segTab = 'r';
  function markSel() {
    R.querySelectorAll('.rdBook .sel').forEach(e => e.classList.remove('sel'));
    if (!S.sel || !isTal()) return;
    R.querySelectorAll('.rdBook [data-j="' + S.sel.j + '"][data-s="' + S.sel.s + '"]').forEach(e => e.classList.add('sel'));
  }
  function closeSeg() { const p = $r('#rdSeg'); if (p) p.hidden = true; S.sel = null; S.rsel = null; if (R) markSel(); }
  function openSeg(j, s) {
    if (!TD[S.tk]) return;
    S.sel = { j, s }; markSel();
    const a = amudRow(S.tk, j), rl = a[1].filter(e => e[0] === s), tl = a[2].filter(e => e[0] === s);
    if (segTab === 'r' && !rl.length && tl.length) segTab = 't'; else if (segTab === 't' && !tl.length && rl.length) segTab = 'r';
    const list = segTab === 'r' ? rl : tl, cmCls = S.cmFont === 'rashi' ? 'fR' : 'fN';
    const tab = (k, label, n) => '<button type="button" class="' + (segTab === k ? 'on' : '') + '" data-segtab="' + k + '" aria-pressed="' + (segTab === k) + '"' + (n ? '' : ' disabled') + '>' + h(label) + ' · ' + n + '</button>';
    const p = $r('#rdSeg');
    p.innerHTML = '<div class="rdPopHd"><span>' + h(talName(talT()) + ' ' + dafTxt(j) + ' · ' + T('קטע') + ' ' + num(s + 1)) + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<p class="rdSegTxt">' + fmtT(a[0][s] || '') + '</p>' +
      '<div class="rdSegTabs" role="group">' + tab('r', innerLabel(S.tk, j), rl.length) + tab('t', T('תוספות'), tl.length) + '</div>' +
      '<div class="rdSegList ' + cmCls + '">' + (list.length ? list.map(e => '<p>' + (e[1] ? '<b>' + fmtT(e[1]) + '</b> ' : '') + fmtT(e[2]) + '</p>').join('') : '<p class="none">' + T('אין פירוש על קטע זה') + '</p>') + '</div>' +
      '<div class="rdSegNav"><button type="button" data-segmove="-1">' + ICON.chevR + ' ' + T('הקטע הקודם') + '</button><button type="button" data-segmove="1">' + T('הקטע הבא') + ' ' + ICON.chevL + '</button></div>';
    p.hidden = false;
  }
  function segMove(dir) {
    if (!S.sel) return; const t = talT(); let { j, s } = S.sel; s += dir;
    if (s < 0) { if (j === 0) return; j--; s = amudRow(t.k, j)[0].length - 1; }
    else if (s >= amudRow(t.k, j)[0].length) { if (j + 1 >= t.n) return; j++; s = 0; }
    const vis = R.querySelector('.rdBook [data-j="' + j + '"][data-s="' + s + '"]');
    if (!vis) { S.tj = j; S.tp = 0; if (S.tview === 'study') { const p = studyPages(t.k, j, geo).findIndex(pg => pg.segs.includes(s)); if (p > 0) S.tp = p; } render(); }
    openSeg(j, s);
  }

  /* חיפוש במסכת הפתוחה: גמרא, רש״י/רשב״ם, תוספות או הכל */
  function searchTal(q) {
    const nq = norm(q), hits = [], k = S.tk, all = S.tsrc === 'all';
    if (nq.length < 2 || !TD[k]) return { hits, q: nq };
    TD[k].forEach((a, j) => {
      if (all || S.tsrc === 'g') a[0].forEach((s, i) => { if ((' ' + norm(plainT(s)) + ' ').includes(nq)) hits.push({ j, s: i, src: 'g', t: s }); });
      [['r', 1], ['t', 2]].forEach(([src, n]) => { if (all || S.tsrc === src) a[n].forEach(e => { const tx = (e[1] ? e[1] + ' ' : '') + e[2]; if ((' ' + norm(plainT(tx)) + ' ').includes(nq)) hits.push({ j, s: e[0], src, t: tx }); }); });
    });
    return { hits, q: nq };
  }

  /* ---------- טור, בית יוסף וב״ח (בעימוד בסגנון מהדורת "שירת דבורה") ----------
     הנתונים: GIM_TUR_INDEX (ארבעת הטורים) וחלקים (generated/tur/*.js) שנטענים בתגית script רק לסימנים שפותחים.
     כל עמוד: הטור באמצע למעלה (כתב מרובע), ב״ח בטור הימני ובית יוסף בשמאלי (כתב רש״י), והם מקיפים את הטור וממשיכים
     מתחתיו ברוחב מלא של חצי עמוד. שלושה זרמים נפרדים — טור, ב״י, ב״ח — כמו בדפוס: בכל עמוד נכנס מהטור רק מה שצריך כדי
     שהפירושים ימלאו את העמוד, ופירוש לעולם לא מופיע לפני הקטע בטור שהוא מפרש. כל סימן מתחיל בעמוד חדש. */
  const RLOAD = {}, TMC = new Map(), TPC = new Map(), TGC = new Map();
  let RX = null, MEAS = false; // MEAS: בעימוד כל אסימון של זרם עטוף ב-<u>, כדי למדוד את כולם בפריסה אחת
  const isTur = () => !!S.rk && RX && RX.byK[S.rk] != null;
  const turT = () => RX.list[RX.byK[S.rk]];
  const turTOf = k => RX.list[RX.byK[k]];
  const minS = t => t.intro ? 0 : 1;
  const turPart = (t, s) => { let p = 0; t.parts.forEach((x, i) => { if (x.from <= s) p = i; }); return p; };
  const turRow = (k, s) => { const t = turTOf(k), p = turPart(t, s), d = (G.GIM_TUR_P || {})[k + '.' + p]; return d ? d.s[s - d.from] || ['', [], []] : null; };
  const rowsReady = (k, ss) => { const t = turTOf(k); return ss.every(s => s < minS(t) || s >= t.n || turRow(k, s)); };
  const turPartName = t => isEn() ? t.en : t.he;
  const hilOf = (t, s) => { let n = ''; (t.hil || []).forEach(x => { if (x[0] <= s) n = x[1]; }); return s ? n : ''; };
  const RL = (x, i) => x === 'y' ? '(' + toHeb(i + 1) + ')' : '[' + toHeb(i + 1) + ']';
  const turCmName = x => T(x === 'y' ? 'בית יוסף' : 'ב״ח');
  function loadTur(k, ss, done) {
    const t = turTOf(k), TP = G.GIM_TUR_P || (G.GIM_TUR_P = {});
    const need = [...new Set(ss.filter(s => s >= minS(t) && s < t.n).map(s => turPart(t, s)))].filter(p => !TP[k + '.' + p]);
    const fin = ok => { if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('16px GimFrank', 'אב'), document.fonts.load('16px GimRashi', 'אב')]).then(() => done(ok), () => done(ok)); else done(ok); };
    if (!need.length) return done(true);
    let left = need.length, ok = true;
    // מסך הטעינה (אם מוצג): חלק של הטור הוא בערך 2MB
    const pe = progEase(f => loadProg('r' + k, f), need.map(p => t.parts[p].b || 2e6));
    need.forEach((p, n) => {
      const id = k + '.' + p, cb = r => { ok = ok && r; pe.got(n); if (--left === 0) { pe.end(); fin(ok); } };
      if (RLOAD[id]) { RLOAD[id].push(cb); return; }
      RLOAD[id] = [cb];
      const sc = document.createElement('script'); sc.src = 'generated/tur/' + t.parts[p].f;
      const end = r => { const cbs = RLOAD[id]; delete RLOAD[id]; cbs.forEach(c => c(r)); };
      sc.onload = () => end(!!TP[id]); sc.onerror = () => end(false);
      document.head.appendChild(sc);
    });
  }
  // מודל סימן: אסימוני הטור (tt) ולכל מפרש זרם אסימונים אחד — לכל דיבור תווית ואחריה מילותיו. anc[i] = מקום הסימן של
  // דיבור i בטור, cs/ce = תחום הדיבור בזרם. allow(te) = עד איפה מותר להציג מהזרם כשהטור מוצג עד te (לא כולל).
  function turModel(k, s) {
    const key = k + ':' + s; if (TMC.has(key)) return TMC.get(key);
    const row = turRow(k, s), tt = turToks(row[0]), st = {};
    // כותרת "הלכות …" מודגשת בתחילת הסימן (בשורה משלה) — מוצגת ככותרת העמוד ולא כחלק מהטקסט
    let hd = '', a = 0; while (a < tt.length && ANC.test(tt[a])) a++;
    if (tt[a] && tt[a][0] === '\u0003') {
      let e = a; while (e < tt.length && !tt[e].includes('\u0004')) e++;
      const t = tt.slice(a, e + 1).join(' ').replace(/[\u0003\u0004]/g, '').trim();
      if (e < tt.length && tt[e].endsWith('\u0004') && tt[e + 1] === '\n' && /^(הלכות|דיני|סימני) /.test(t) && t.length < 50) { hd = t; tt.splice(a, e + 2 - a); }
    }
    ['y', 'c'].forEach((x, n) => {
      const toks = [], cs = [], ce = [];
      (row[n + 1] || []).forEach((c, i) => { cs[i] = toks.length; if (c) { toks.push('\u0010' + x + i + '\u0011'); toks.push(...turToks(c)); } ce[i] = toks.length; });
      st[x] = { toks, cs, ce, anc: [], n: (row[n + 1] || []).length };
    });
    tt.forEach((w, i) => { const m = ANC.exec(w); if (m && st[m[1]].anc[+m[2]] == null) st[m[1]].anc[+m[2]] = i; });
    ['y', 'c'].forEach(x => { const z = st[x]; z.allow = te => { if (te >= tt.length) return z.toks.length; for (let i = 0; i < z.n; i++) if ((z.anc[i] || 0) >= te) return z.cs[i]; return z.toks.length; }; });
    // נקודות חיתוך בטור: תחילת כל רצף של סימנים (לא חותכים בין שני סימנים צמודים), וסוף הסימן
    const cuts = []; tt.forEach((w, i) => { if (i > 0 && ANC.test(w) && !ANC.test(tt[i - 1])) cuts.push(i); }); cuts.push(tt.length);
    const m = { k, s, tt, st, cuts, hd, empty: (x, i) => !(row[x === 'y' ? 1 : 2] || [])[i] };
    TMC.set(key, m); return m;
  }
  // HTML לאסימונים [a, b) של זרם; from = תחילת הדיבור (או הטור), שממנה מחושב מצב ההדגשה בנקודה a
  function tokHtml(m, toks, a, b, from, inTur) {
    let bold = false, bh = false;
    for (let i = from; i < a; i++) { const w = toks[i]; if (/[\u0003-\u0006]/.test(w)) for (const c of w) { if (c === '\u0003') bold = true; else if (c === '\u0004') bold = false; else if (c === '\u0005') bh = true; else if (c === '\u0006') bh = false; } }
    const out = [(bh ? '<span class="bh">' : '') + (bold ? '<b>' : '')];
    for (let i = a; i < b; i++) {
      const w = toks[i];
      if (w === '\n') { out.push(MEAS && !inTur ? '<u><br></u>' : '<br>'); continue; }
      const an = ANC.exec(w);
      if (an) {
        if (inTur) { if (!m.empty(an[1], +an[2])) out.push('<span class="ra r' + an[1] + '" data-x="' + an[1] + '" data-i="' + an[2] + '">' + RL(an[1], +an[2]) + '</span>'); }
        else out.push((MEAS ? '<u>' : '') + '<b class="rl">' + RL(an[1], +an[2]) + '</b>' + (MEAS ? '</u>' : ''));
        continue;
      }
      if (MEAS && !inTur) { out.push('<u>' + h(w).replace(/[\u0003-\u0006]/g, c => c === '\u0003' ? (bold = true, '<b>') : c === '\u0004' ? (bold = false, '</b>') : c === '\u0005' ? (bh = true, '<span class="bh">') : (bh = false, '</span>')) + '</u>'); continue; }
      out.push(h(w).replace(/[\u0003-\u0006]/g, c => c === '\u0003' ? (bold = true, '<b>') : c === '\u0004' ? (bold = false, '</b>') : c === '\u0005' ? (bh = true, '<span class="bh">') : (bh = false, '</span>')));
    }
    return out.join(' ').replace(/ ?<br> ?/g, '<br>') + (bold ? '</b>' : '') + (bh ? '</span>' : '');
  }
  // זרם מפרש [a, b): כל דיבור (או חלק ממנו) עטוף ב-span שאפשר ללחוץ עליו
  function streamHtml(m, x, a, b) {
    const z = m.st[x], out = [];
    for (let i = 0; i < z.n; i++) {
      const cs = z.cs[i], ce = z.ce[i]; if (ce <= a || cs >= b || ce === cs) continue;
      const pa = Math.max(a, cs), pb = Math.min(b, ce);
      out.push('<span class="rcm r' + x + '" data-x="' + x + '" data-i="' + i + '">' + tokHtml(m, z.toks, pa, pb, cs, false) + '</span>');
    }
    return out.join(' ');
  }
  function turHeadHtml(t, s, hd) {
    if (!s) return '<span class="trH">' + T('הקדמת הטור') + '</span>';
    const hs = (t.hil || []).find(x => x[0] === s), name = hd || (hs && hs[1]);
    return (name ? '<span class="trHil">' + h(name) + '</span>' : '') + '<span class="trH">' + T('סימן') + ' ' + num(s) + '</span>';
  }
  const turMainHtml = (m, a, b, first) => (first ? turHeadHtml(turTOf(m.k), m.s, m.hd) : '') + tokHtml(m, m.tt, a, b, 0, true);
  // מידות העמוד: שטח הטקסט (W×H) ממדידה, וגדלי האותיות ורוחב הטורים לפיו
  function trGeo(g) {
    if (TGC.has(g.key + '|' + S.size)) return TGC.get(g.key + '|' + S.size);
    const probe = $r('#rdProbe'); probe.className = 'rdPage tal tur' + g.cls;
    probe.innerHTML = '<header class="rdHead"><span>א</span><span class="mid">א</span><span>א</span></header><div class="rdDaf"></div><div class="rdNum">א</div>';
    const b = probe.querySelector('.rdDaf'), W = Math.floor(b.clientWidth), H = Math.floor(b.clientHeight) - 3; probe.innerHTML = '';
    const sc = Math.min(1.12, Math.max(0.62, W / 600)) * (1 + S.size * 0.1), r2 = v => Math.round(v * 100) / 100;
    const fm = r2(15.5 * sc), fs = r2(Math.max(9, 11.4 * sc)), gap = Math.max(8, Math.round(13 * sc)), mw = Math.round(W * (W < 470 ? 0.42 : 0.36));
    const out = { W, H, fm, fs, lm: r2(fm * 1.45), ls: r2(fs * 1.4), gap, mw, sw: Math.floor((W - gap) / 2), sp: Math.ceil(mw / 2 + gap / 2), vg: Math.round(fs * 0.45), key: g.key + '|' + S.size + '|' + W + 'x' + H };
    out.vars = '--trW:' + W + 'px;--trH:' + H + 'px;--trMw:' + mw + 'px;--trSw:' + out.sw + 'px;--trSp:' + out.sp + 'px;--trG:' + gap + 'px;--trFm:' + fm + 'px;--trLm:' + out.lm + 'px;--trFs:' + fs + 'px;--trLs:' + out.ls + 'px';
    TGC.set(g.key + '|' + S.size, out); return out;
  }
  function trProbe(Q) {
    const host = $r('#rdDafHost'); host.style.width = Q.W + 'px';
    host.innerHTML = '<div class="trDaf" style="' + Q.vars + ';height:auto"><div class="trMain"></div><div class="trSide trC"><div class="sp"></div><div class="tx"></div></div><div class="trWide"></div></div>';
    return { main: host.querySelector('.trMain'), sp: host.querySelector('.sp'), tx: host.querySelector('.tx'), wide: host.querySelector('.trWide') };
  }
  // עימוד סימן: [{t: [a, b) בטור, y/c: [a, b) בזרמים, hT: גובה הטור בעמוד, first, wide: 'y'|'c' (עמוד של מפרש אחד בשני טורים)}]
  function turPages(k, s, Q) {
    const key = k + ':' + s + '|' + Q.key; if (TPC.has(key)) return TPC.get(key);
    const m = turModel(k, s), P = trProbe(Q), H = Q.H, tt = m.tt, TT = tt.length, Y = m.st.y, C = m.st.c;
    const mainH = (a, b, first) => { P.main.innerHTML = turMainHtml(m, a, b, first); return P.main.offsetHeight; };
    const sideH = (x, a, b, hT) => { P.sp.style.height = (hT ? hT + Q.vg : 0) + 'px'; P.tx.innerHTML = streamHtml(m, x, a, b); return P.tx.offsetHeight; };
    const wideH = (x, a, b) => { P.wide.innerHTML = streamHtml(m, x, a, b); return P.wide.offsetHeight; };
    // הערכה לפי מספר אותיות (רק לבחירת כמות הטור בעמוד): כמה אותיות נכנסות בשורה מלאה של טור צד — נמדד פעם אחת
    if (!Q.cpl) {
      const z = Y.toks.length > C.toks.length ? Y : C, x = z === Y ? 'y' : 'c', n = Math.min(z.toks.length, 500);
      if (n > 60) { const hh = sideH(x, 0, n, 0), ch = z.toks.slice(0, n).reduce((a, w) => a + w.length + 1, 0); Q.cpl = ch / Math.max(1, Math.round(hh / Q.ls)); }
    }
    const cpl = Q.cpl || Q.sw / (Q.fs * 0.5), lines = H / Q.ls;
    const capChars = hh => { const lm = hh > 0 ? Math.min(lines, (hh + Q.vg) / Q.ls) : 0; return cpl * (lines - lm) + cpl * (1 - Q.sp / Q.sw) * lm; };
    const pre = {}; ['y', 'c'].forEach(x => { const a = [0]; m.st[x].toks.forEach((w, i) => { a[i + 1] = a[i] + w.length + 1; }); pre[x] = a; });
    const chars = (x, a, b) => pre[x][b] - pre[x][a];
    // מדידה בפריסה אחת: כל אסימון עטוף ב-<u>; אסימון נכנס אם תחתית השורה שלו (לפי גובה השורה) לא עוברת את H
    const lastFit = (el, n0, ok) => {
      const us = el.getElementsByTagName('u'), top = el.getBoundingClientRect().top;
      let lo = 0, hi = Math.min(n0, us.length);
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ok(us[mid - 1], top)) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const lineOk = (u, top) => { const r = u.getBoundingClientRect(); return r.bottom - top + (Q.ls - r.height) / 2 <= H - 0.5; };
    // כמה אסימונים מהזרם נכנסים בטור הצד (לא מסיימים בתווית של דיבור שהמילים שלו יבואו רק בעמוד הבא)
    const fill = (x, pos, end, hT) => {
      const z = m.st[x]; if (end <= pos) return pos;
      let lim = pos; const want = capChars(hT) * 1.3 + 40; while (lim < end && chars(x, pos, lim) < want) lim++;
      MEAS = true; const hh = sideH(x, pos, lim, hT); MEAS = false;
      let n = hh <= H ? lim - pos : lastFit(P.tx, lim - pos, lineOk);
      if (n === lim - pos && lim < end) n = maxOkF(n, end - pos, c => sideH(x, pos, pos + c, hT) <= H); // ההערכה הייתה קטנה מדי
      else if (n && sideH(x, pos, pos + n, hT) > H) { // ביטחון: שורה עם אותיות בגופן אחר (דיבור המתחיל) גבוהה יותר
        const hi = n; n = 0; let lo = 0, top = hi; while (lo < top) { const mid = (lo + top + 1) >> 1; if (sideH(x, pos, pos + mid, hT) <= H) lo = mid; else top = mid - 1; } n = lo;
      }
      while (n > 0 && ANC.test(z.toks[pos + n - 1])) n--;
      return pos + n;
    };
    let tp = 0, yp = 0, cp = 0, first = true; const pages = [];
    while (pages.length < 400) {
      if (!first && tp >= TT && yp >= Y.toks.length && cp >= C.toks.length) break;
      let te = tp, hT = 0;
      if (tp < TT) {
        const overE = (x, end, hh) => chars(x, x === 'y' ? yp : cp, end) > capChars(hh);
        // הפירושים מפגרים אחרי הטור: מה שכבר מותר ממלא את שני הטורים גם בלי טור חדש — עמוד של פירושים בלבד
        const lag = !first && overE('y', Y.allow(tp), 0) && overE('c', C.allow(tp), 0);
        if (!lag) {
          const cand = m.cuts.filter(c => c > tp);
          const sat = i => {
            const e = cand[i], hh = mainH(tp, e, first);
            const ok = x => { const z = m.st[x], end = z.allow(e); return end >= z.toks.length || overE(x, end, hh); };
            return ok('y') && ok('c');
          };
          if (mainH(tp, cand[0], first) > H && cand[0] - tp > 1) te = tp + maxOkF(1, cand[0] - tp - 1, w => mainH(tp, tp + w, first) <= H); // קטע ארוך מעמוד: חותכים במילים
          else {
            const lastI = maxOkF(0, cand.length - 1, i => mainH(tp, cand[i], first) <= H);
            // הכי מעט טור שבו שני הפירושים כבר ממלאים את העמוד; אם אין כזה — כמה שנכנס
            let pick = lastI;
            if (sat(lastI)) { let lo = 0, hi = lastI; while (lo < hi) { const mid = (lo + hi) >> 1; if (sat(mid)) hi = mid; else lo = mid + 1; } pick = lo; te = cand[pick]; }
            else if (lastI + 1 < cand.length) te = tp + maxOkF(cand[lastI] - tp, cand[lastI + 1] - tp - 1, w => mainH(tp, tp + w, first) <= H); // ממלאים את הטור עד סוף העמוד, גם באמצע קטע
            else te = cand[lastI];
          }
        }
      }
      if (te > tp || first) hT = mainH(tp, te, first);
      let pg;
      if (tp < TT && Y.allow(te) <= yp && C.allow(te) <= cp) {
        // אין פירוש בעמוד הזה: הטור לבדו ברוחב מלא, עד המקום שבו מתחיל הפירוש הבא
        const lim = m.cuts.find(c => c > tp && (Y.allow(c) > yp || C.allow(c) > cp)) || TT;
        P.main.style.width = Q.W + 'px';
        const full = mainH(tp, lim, first) <= H;
        te = full ? lim : tp + maxOkF(1, lim - tp - 1, w => mainH(tp, tp + w, first) <= H);
        P.main.style.width = '';
        pg = { t: [tp, te], y: [yp, yp], c: [cp, cp], hT: 0, first, full: true };
        tp = te;
      } else if (te === tp && tp >= TT && !first && (yp >= Y.toks.length || cp >= C.toks.length)) {
        // הטור נגמר ונשאר רק מפרש אחד: הוא תופס את כל העמוד, בשני טורים
        const x = yp < Y.toks.length ? 'y' : 'c', z = m.st[x], pos = x === 'y' ? yp : cp;
        let end = pos; const want = capChars(0) * 2.6 + 80; while (end < z.toks.length && chars(x, pos, end) < want) end++;
        let n = end - pos;
        if (wideH(x, pos, end) > H) {
          // שני טורים בגובה H: מה שגולש עובר לטור שלישי מחוץ לקופסה (משמאל)
          MEAS = true; P.wide.style.height = H + 'px'; P.wide.style.columnFill = 'auto'; wideH(x, pos, end); MEAS = false;
          const left = P.wide.getBoundingClientRect().left - 1;
          n = lastFit(P.wide, end - pos, u => u.getBoundingClientRect().left >= left);
          P.wide.style.height = ''; P.wide.style.columnFill = '';
          while (n > 1 && wideH(x, pos, pos + n) > H) n--;
        }
        while (n > 1 && ANC.test(z.toks[pos + n - 1])) n--;
        n = Math.max(1, n);
        pg = { t: [tp, tp], wide: x, w: [pos, pos + n], hT: 0, first: false };
        if (x === 'y') yp += n; else cp += n;
      } else {
        let ny = fill('y', yp, Y.allow(te), hT), nc = fill('c', cp, C.allow(te), hT);
        if (te === tp && ny === yp && nc === cp && !first) { if (yp < Y.toks.length) ny = yp + 1; else if (cp < C.toks.length) nc = cp + 1; else te = Math.min(TT, tp + 1); } // תמיד מתקדמים
        pg = { t: [tp, te], y: [yp, ny], c: [cp, nc], hT, first };
        tp = te; yp = ny; cp = nc;
      }
      pages.push(pg); first = false;
    }
    $r('#rdDafHost').innerHTML = '';
    TPC.set(key, pages); return pages;
  }
  function turHeader(t, s) {
    const hil = hilOf(t, s);
    return '<header class="rdHead trHead"><span>' + T('בית חדש') + '</span><span class="mid">' + h(T('טור') + ' ' + turPartName(t) + ' · ' + (s ? T('סימן') + ' ' + num(s) : T('הקדמה')) + (hil ? ' · ' + hil : '')) + '</span><span class="l">' + T('בית יוסף') + '</span></header>';
  }
  function turPageHtml(k, s, p, Q, side, cls) {
    const t = turTOf(k), m = turModel(k, s), ps = turPages(k, s, Q), pg = ps[p];
    let inner;
    if (pg.wide) inner = '<div class="trWide">' + streamHtml(m, pg.wide, pg.w[0], pg.w[1]) + '</div>';
    else {
      const sp = '<div class="sp" style="height:' + (pg.hT ? pg.hT + Q.vg : 0) + 'px"></div>';
      inner = (pg.t[1] > pg.t[0] || pg.first ? '<div class="trMain' + (pg.full ? ' trFull' : '') + '">' + turMainHtml(m, pg.t[0], pg.t[1], pg.first) + '</div>' : '') +
        '<div class="trSide trC">' + sp + '<div class="tx">' + streamHtml(m, 'c', pg.c[0], pg.c[1]) + '</div></div>' +
        '<div class="trSide trY">' + sp + '<div class="tx">' + streamHtml(m, 'y', pg.y[0], pg.y[1]) + '</div></div>';
    }
    const lbl = s ? num(s) + (ps.length > 1 ? ' · ' + num(p + 1) : '') : T('הקדמה') + (ps.length > 1 ? ' · ' + num(p + 1) : '');
    return '<article class="rdPage tal tur ' + side + (cls || '') + '" data-s="' + s + '" aria-label="' + h(T('סימן') + ' ' + num(s)) + '">' + turHeader(t, s) +
      '<div class="rdDaf"><div class="trDaf" style="' + Q.vars + '">' + inner + '</div></div><div class="rdNum">' + h(lbl) + '</div></article>';
  }
  const trNext = (k, s, p, dir, Q) => {
    const t = turTOf(k);
    if (dir > 0) { if (p + 1 < turPages(k, s, Q).length) return { s, p: p + 1 }; return s + 1 < t.n && turRow(k, s + 1) ? { s: s + 1, p: 0 } : null; }
    if (p > 0) return { s, p: p - 1 };
    return s - 1 >= minS(t) && turRow(k, s - 1) ? { s: s - 1, p: turPages(k, s - 1, Q).length - 1 } : null;
  };
  function renderTur() {
    const t = turT(), k = t.k, book = $r('#rdBook');
    book.className = 'rdBook' + (geo.two ? ' two' : ' one');
    S.rs = Math.max(minS(t), Math.min(S.rs, t.n - 1));
    $r('#rdWhereTxt').textContent = turPartName(t) + ' · ' + (S.rs ? T('סימן') + ' ' + num(S.rs) : T('הקדמה'));
    $r('#rdPrevCh').setAttribute('aria-label', T('סימן קודם')); $r('#rdNextCh').setAttribute('aria-label', T('סימן הבא'));
    $r('#rdPrevCh').title = T('סימן קודם'); $r('#rdNextCh').title = T('סימן הבא');
    $r('#rdPrevCh').disabled = S.rs <= minS(t); $r('#rdNextCh').disabled = S.rs + 1 >= t.n;
    $r('#rdChPos').textContent = T('טור') + ' ' + turPartName(t);
    $r('#rdProgBar').style.width = Math.max(2, Math.round(100 * (S.rs + 1) / t.n)) + '%';
    const need = [S.rs - 1, S.rs, S.rs + 1, S.rs + 2];
    if (!rowsReady(k, need)) {
      $r('#rdPos').textContent = '';
      book.innerHTML = loadingHtml('r' + k, T('טור') + ' ' + turPartName(t), geo);
      loadTur(k, need, ok => { if (!ok) book.innerHTML = '<article class="rdPage single rdLoading' + geo.cls + '"><p>' + T('לא ניתן לטעון את הטור.') + '</p></article>'; else if (S.rk === k) { if (S.rsel) openTurCm(S.rsel.s, S.rsel.x, S.rsel.i); render(); } });
      return;
    }
    const Q = trGeo(geo), ps = turPages(k, S.rs, Q);
    S.rp = Math.max(0, Math.min(S.rp, ps.length - 1));
    const shown = [{ s: S.rs, p: S.rp }]; if (geo.two) { const n = trNext(k, S.rs, S.rp, 1, Q); if (n) shown.push(n); }
    const side = i => geo.two ? (i ? 'left' : 'right') : 'single';
    book.innerHTML = shown.map((x, i) => turPageHtml(k, x.s, x.p, Q, side(i), geo.cls)).join('') +
      (geo.two && shown.length < 2 ? '<article class="rdPage left blank' + geo.cls + '" aria-hidden="true"></article>' : '') + (geo.two ? '<div class="rdSpine" aria-hidden="true"></div>' : '');
    const last = shown[shown.length - 1];
    $r('#rdPos').textContent = (S.rs ? T('סימן') + ' ' + num(S.rs) : T('הקדמה')) + ' · ' + T('עמוד') + ' ' + num(S.rp + 1) + (last.s === S.rs && last.p !== S.rp ? '–' + num(last.p + 1) : '') + ' ' + T('מתוך') + ' ' + num(ps.length) +
      (last.s !== S.rs ? ' · ' + T('ממשיך ל') + T('סימן') + ' ' + num(last.s) : '');
    const atStart = S.rs <= minS(t) && S.rp === 0, atEnd = last.s >= t.n - 1 && last.p >= turPages(k, last.s, Q).length - 1;
    ['#rdPrev', '#rdPrev2'].forEach(x => { $r(x).disabled = atStart; });
    ['#rdNext', '#rdNext2'].forEach(x => { $r(x).disabled = atEnd; });
    if (fxDir) { reveal(book, fxDir); fxDir = 0; }
    markTurSel();
    save();
  }
  function turTurn(dir) {
    const t = turT(), k = t.k, need = [S.rs - 2, S.rs - 1, S.rs, S.rs + 1, S.rs + 2, S.rs + 3];
    if (!rowsReady(k, need)) return loadTur(k, need, ok => { if (ok && S.rk === k) turTurn(dir); });
    const Q = trGeo(geo); let x = { s: S.rs, p: S.rp };
    for (let i = 0; i < geo.per; i++) { const n = trNext(k, x.s, x.p, dir, Q); if (!n) { if (i === 0) return; break; } x = n; }
    S.rs = x.s; S.rp = x.p; fxDir = dir; render();
  }
  function turStep(dir) { const t = turT(), n = S.rs + dir; if (n < minS(t) || n >= t.n) return; S.rs = n; S.rp = 0; fxDir = dir; closeSeg(); render(); }
  function goTur(k, s) { S.tk = ''; S.rk = k; S.rs = s; S.rp = 0; closeSeg(); render(); }

  /* חלון הדיבור: הדיבור שנבחר (בית יוסף או ב״ח) במלואו, באותיות קריאות, עם הקטע בטור שהוא מפרש */
  function markTurSel() {
    R.querySelectorAll('.rdBook .sel').forEach(e => e.classList.remove('sel'));
    const z = S.rsel; if (!z || !isTur()) return;
    R.querySelectorAll('.rdBook article[data-s="' + z.s + '"] [data-x="' + z.x + '"][data-i="' + z.i + '"]').forEach(e => e.classList.add('sel'));
  }
  function openTurCm(s, x, i) {
    if (!isTur() || !turRow(S.rk, s)) return;
    const t = turT(), m = turModel(S.rk, s), z = m.st[x];
    if (i < 0 || i >= z.n || m.empty(x, i)) return;
    S.rsel = { s, x, i }; markTurSel();
    // הקטע בטור: מהסימן של הדיבור עד הסימן הבא (או 40 מילים)
    const a = z.anc[i] || 0; let b = a + 1; while (b < m.tt.length && (ANC.test(m.tt[b]) || b === a + 1) && b - a < 3) b++;
    let e = b; while (e < m.tt.length && !ANC.test(m.tt[e]) && e - a < 45) e++;
    const other = x === 'y' ? 'c' : 'y', oz = m.st[other];
    const tab = (k, n) => '<button type="button" class="' + (x === k ? 'on' : '') + '" data-turtab="' + k + '" aria-pressed="' + (x === k) + '"' + (n ? '' : ' disabled') + '>' + h(turCmName(k)) + ' · ' + n + '</button>';
    const cnt = k => m.st[k].ce.filter((v, j) => v > m.st[k].cs[j]).length;
    const p = $r('#rdSeg');
    p.innerHTML = '<div class="rdPopHd"><span>' + h(turPartName(t) + ' ' + (s ? num(s) : T('הקדמה')) + ' · ' + turCmName(x) + ' ' + RL(x, i)) + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<p class="rdSegTxt">' + tokHtml(m, m.tt, a, e, 0, true) + (e < m.tt.length && !ANC.test(m.tt[e]) ? ' …' : '') + '</p>' +
      '<div class="rdSegTabs" role="group">' + tab('y', cnt('y')) + tab('c', cnt('c')) + '</div>' +
      '<div class="rdSegList fR"><p>' + tokHtml(m, z.toks, z.cs[i], z.ce[i], z.cs[i], false) + '</p></div>' +
      '<div class="rdSegNav"><button type="button" data-turmove="-1">' + ICON.chevR + ' ' + T('הדיבור הקודם') + '</button><button type="button" data-turmove="1">' + T('הדיבור הבא') + ' ' + ICON.chevL + '</button></div>';
    p.hidden = false;
    p.dataset.other = (() => { // הדיבור של המפרש השני הקרוב ביותר לאותו מקום בטור
      let best = -1; for (let j = 0; j < oz.n; j++) { if (m.empty(other, j)) continue; if ((oz.anc[j] || 0) <= a || best < 0) best = j; if ((oz.anc[j] || 0) > a) break; } return best;
    })();
  }
  function turCmMove(dir) {
    const z0 = S.rsel; if (!z0) return; const m = turModel(S.rk, z0.s);
    let i = z0.i + dir; while (i >= 0 && i < m.st[z0.x].n && m.empty(z0.x, i)) i += dir;
    if (i < 0 || i >= m.st[z0.x].n) return;
    const vis = R.querySelector('.rdBook article[data-s="' + z0.s + '"] [data-x="' + z0.x + '"][data-i="' + i + '"]');
    if (!vis) { // מדפדפים לעמוד שבו מתחיל הדיבור
      const ps = turPages(S.rk, z0.s, trGeo(geo)), st = m.st[z0.x].cs[i], r = z0.x === 'y' ? 'y' : 'c';
      const pi = ps.findIndex(pg => pg.wide ? pg.wide === r && pg.w[1] > st : pg[r][1] > st);
      if (pi >= 0) { S.rs = z0.s; S.rp = pi; render(); }
    }
    openTurCm(z0.s, z0.x, i);
  }

  /* ---------- הדפסה / PDF ----------
     שני עמודים בכל דף A4 לרוחב. העימוד נמדד מחדש בגודל של חצי דף (אותו pagesFor, עם גאומטריה של הדפסה), נבנה
     ב-#rdPrint (ילד ישיר של body, מוצג רק ב-@media print כש-body.rdPrinting), ואז window.print(). PDF = "שמירה כ-PDF"
     בחלון ההדפסה של הדפדפן — בלי ספריות ובלי רשת. "שחור-לבן" = רקע לבן ודיו שחורה בלבד. */
  const MM = 96 / 25.4;
  function printGeo() {
    const pw = Math.round(139 * MM), ph = Math.round(190 * MM), fs = Math.round((14.5 + S.size) * 10) / 10;
    const trW = Math.round(pw * (S.view === 'book' ? (S.trFont === 'rashi' ? 0.27 : 0.3) : (S.trFont === 'rashi' ? 0.3 : 0.33)));
    return { pw, ph, fs, trW, two: true, per: 2, cls: ' prt', key: ['print', pw, ph, fs, S.view, S.tr, S.trFont, S.cmFont, isEn(), S.cmOff.join(','), S.ramNik].join('|') };
  }
  const setVars = g => { R.style.setProperty('--rdPw', g.pw + 'px'); R.style.setProperty('--rdPh', g.ph + 'px'); R.style.setProperty('--rdFs', g.fs + 'px'); R.style.setProperty('--rdTrW', g.trW + 'px'); };
  // ש״ס: הדף הנוכחי (שני העמודים, א ו-ב) בתצוגה הנוכחית
  function printSheetsTal() {
    const k = S.tk, t = talT(), saved = geo; geo = printGeo(); setVars(geo);
    const from = S.tj - (S.tj & 1), js = [from, from + 1].filter(j => j < t.n);
    let pages;
    if (S.tview === 'daf') pages = js.map(j => side => dafPage(k, j, side, geo, ''));
    else pages = [].concat(...js.map(j => studyPages(k, j, geo).map(pg => side => '<article class="rdPage tal prt ' + side + '">' + studyInner(k, j, pg, '') + '</article>')));
    let html = '';
    for (let i = 0; i < pages.length; i += 2) html += '<div class="rdSheet">' + pages[i]('right') + (pages[i + 1] ? pages[i + 1]('left') : '<article class="rdPage prt left blank"></article>') + '</div>';
    const vars = R.getAttribute('style');
    geo = saved; if (geo) setVars(geo);
    return { html, vars, sheets: Math.ceil(pages.length / 2) };
  }
  // טור: הסימן הנוכחי כולו, בעימוד מחדש לגודל חצי דף
  function printSheetsTur() {
    const k = S.rk, saved = geo; geo = printGeo(); setVars(geo);
    const Q = trGeo(geo), n = turPages(k, S.rs, Q).length;
    let html = '';
    for (let i = 0; i < n; i += 2) html += '<div class="rdSheet">' + turPageHtml(k, S.rs, i, Q, 'right', ' prt') + (i + 1 < n ? turPageHtml(k, S.rs, i + 1, Q, 'left', ' prt') : '<article class="rdPage prt left blank"></article>') + '</div>';
    const vars = R.getAttribute('style');
    geo = saved; if (geo) setVars(geo);
    return { html, vars, sheets: Math.ceil(n / 2) };
  }
  function printSheets() {
    if (isTur()) return printSheetsTur();
    if (isTal()) return printSheetsTal();
    const saved = geo; geo = printGeo(); setVars(geo);
    const pages = pagesFor(S.b, S.ch);
    let from = 0, to = pages.length;
    if (S.prScope === 'spread') { let i = pages.findIndex(p => p.vs.includes(S.anchor)); if (i < 0) i = 0; from = i - i % 2; to = Math.min(from + 2, pages.length); }
    const vars = R.getAttribute('style');
    geo = saved; if (geo) setVars(geo);
    let html = '';
    for (let i = from; i < to; i += 2) {
      html += '<div class="rdSheet">' + [i, i + 1].map((k, j) => k < to
        ? '<article class="rdPage prt ' + (j ? 'left' : 'right') + '">' + pageInner(S.b, S.ch, pages[k], k + 1, '') + '</article>'
        : '<article class="rdPage prt left blank"></article>').join('') + '</div>';
    }
    return { html, vars, sheets: Math.ceil((to - from) / 2) };
  }
  function renderPrintPop() {
    if (isTur()) {
      const opt = (key, val, label, note) => '<button type="button" class="rdOpt' + (S[key] === val ? ' on' : '') + '" data-pset="' + key + '" data-val="' + val + '" aria-pressed="' + (S[key] === val) + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + note + '</span></button>';
      const n = (() => { const saved = geo; geo = printGeo(); setVars(geo); const len = turPages(S.rk, S.rs, trGeo(geo)).length; geo = saved; if (geo) setVars(geo); return Math.ceil(len / 2); })();
      $r('#rdPrintPop').innerHTML = '<div class="rdPopHd"><span>' + T('הדפסה / PDF') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
        '<div class="rdSec"><span class="rdSecT">' + T('מה להדפיס') + '</span><p class="rdNote">' + h(turRefLabel(S.rk, S.rs)) + ' · ' + T('הסימן כולו') + ' · ' + num(n) + ' ' + T(n === 1 ? 'דף' : 'דפים') + '</p></div>' +
        '<div class="rdSec"><span class="rdSecT">' + T('צבע') + '</span>' + opt('prColor', 'color', 'צבעוני', T('רקע נייר וצבעים')) + opt('prColor', 'bw', 'שחור-לבן', T('רקע לבן, לחיסכון בדיו')) + '</div>' +
        '<p class="rdNote">' + T('שני עמודים בכל דף A4 לרוחב.') + ' ' + T('ליצוא PDF בחרו בחלון ההדפסה ״שמירה כ-PDF״.') + '</p>' +
        '<button type="button" class="rdGo rdPrintGo" data-print>' + ICON.print + ' ' + T('הדפסה') + '</button>';
      return;
    }
    if (isTal()) {
      const opt = (key, val, label, note) => '<button type="button" class="rdOpt' + (S[key] === val ? ' on' : '') + '" data-pset="' + key + '" data-val="' + val + '" aria-pressed="' + (S[key] === val) + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + note + '</span></button>';
      const t = talT(), from = S.tj - (S.tj & 1);
      $r('#rdPrintPop').innerHTML = '<div class="rdPopHd"><span>' + T('הדפסה / PDF') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
        '<div class="rdSec"><span class="rdSecT">' + T('מה להדפיס') + '</span><p class="rdNote">' + h(T('מסכת') + ' ' + talName(t) + ' ' + T('דף') + ' ' + dafLabel(from, isEn()).replace(/[.:a-z]$/, '')) + ' · ' + T(S.tview === 'daf' ? 'צורת הדף' : 'גמרא ומפרשים') + '</p></div>' +
        '<div class="rdSec"><span class="rdSecT">' + T('צבע') + '</span>' + opt('prColor', 'color', 'צבעוני', T('רקע נייר וצבעים')) + opt('prColor', 'bw', 'שחור-לבן', T('רקע לבן, לחיסכון בדיו')) + '</div>' +
        '<p class="rdNote">' + T('שני עמודים בכל דף A4 לרוחב.') + ' ' + T('ליצוא PDF בחרו בחלון ההדפסה ״שמירה כ-PDF״.') + '</p>' +
        '<button type="button" class="rdGo rdPrintGo" data-print>' + ICON.print + ' ' + T('הדפסה') + '</button>';
      return;
    }
    const n = (() => { const saved = geo; geo = printGeo(); setVars(geo); const len = pagesFor(S.b, S.ch).length; geo = saved; if (geo) setVars(geo); return Math.ceil(len / 2); })();
    const opt = (key, val, label, note) => '<button type="button" class="rdOpt' + (S[key] === val ? ' on' : '') + '" data-pset="' + key + '" data-val="' + val + '" aria-pressed="' + (S[key] === val) + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + note + '</span></button>';
    const bk = bkName(IX.books[S.b].heTitle) + ' ' + num(S.ch);
    $r('#rdPrintPop').innerHTML = '<div class="rdPopHd"><span>' + T('הדפסה / PDF') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('מה להדפיס') + '</span>' + opt('prScope', 'spread', 'שני העמודים הפתוחים', T('דף אחד')) + opt('prScope', 'chapter', 'הפרק כולו', h(bk) + ' · ' + num(n) + ' ' + T(n === 1 ? 'דף' : 'דפים')) + '</div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('צבע') + '</span>' + opt('prColor', 'color', 'צבעוני', T('רקע נייר וצבעים')) + opt('prColor', 'bw', 'שחור-לבן', T('רקע לבן, לחיסכון בדיו')) + '</div>' +
      '<p class="rdNote">' + T('שני עמודים בכל דף A4 לרוחב.') + ' ' + T('ליצוא PDF בחרו בחלון ההדפסה ״שמירה כ-PDF״.') + '</p>' +
      '<button type="button" class="rdGo rdPrintGo" data-print>' + ICON.print + ' ' + T('הדפסה') + '</button>';
  }
  function printNow() {
    let box = document.getElementById('rdPrint');
    if (!box) { box = document.createElement('div'); box.id = 'rdPrint'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box); }
    const out = printSheets();
    box.className = 'rdPrint' + (S.prColor === 'bw' ? ' bw' : '');
    box.setAttribute('style', out.vars || '');
    box.innerHTML = out.html;
    document.body.classList.add('rdPrinting');
    const done = () => { document.body.classList.remove('rdPrinting'); box.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    if (APP.trackEvent) APP.trackEvent('reader_print', { scope: S.prScope, color: S.prColor });
    const go = () => { window.print(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }

  /* ---------- חלוניות ---------- */
  let openPop = null;
  function closePops() {
    ['#rdSet', '#rdJump', '#rdPrintPop'].forEach(s => { $r(s).hidden = true; });
    $r('#rdScrim').hidden = true; openPop = null;
    $r('#rdSetBtn').setAttribute('aria-expanded', 'false'); $r('#rdPrintBtn').setAttribute('aria-expanded', 'false'); $r('#rdWhere').setAttribute('aria-expanded', 'false');
  }
  function openPopover(id) {
    const was = openPop; closePops(); closeDrop(); if (was === id) return;
    openPop = id; $r('#rdScrim').hidden = false;
    if (id === 'print') { renderPrintPop(); $r('#rdPrintPop').hidden = false; $r('#rdPrintBtn').setAttribute('aria-expanded', 'true'); }
    else if (id === 'set') { renderSet(); $r('#rdSet').hidden = false; $r('#rdSetBtn').setAttribute('aria-expanded', 'true'); }
    else { J.b = S.b; J.ch = S.ch; J.v = 0; J.cat = isTur() ? 20 : isTal() ? 2 : IX.books[S.b].cat; J.tk = S.tk || (TX.list[0] || {}).k; J.tj = isTal() ? S.tj : 0; J.rk = S.rk || (RX.list[0] || {}).k; J.rs = isTur() ? S.rs : 1; renderJump(); $r('#rdJump').hidden = false; $r('#rdWhere').setAttribute('aria-expanded', 'true'); const a = $r('#rdJump .rdJB.on'); if (a) a.scrollIntoView({ block: 'center' }); }
  }

  function renderSetTal() {
    const card = (k, ic, label) => '<button type="button" class="rdCard' + (S.tview === k ? ' on' : '') + '" data-set="tview" data-val="' + k + '" aria-pressed="' + (S.tview === k) + '">' + ic + '<span>' + T(label) + '</span></button>';
    const fontPair = (key, sample) => ['rashi', 'regular'].map(f => '<button type="button" class="rdFont' + (S[key] === f ? ' on' : '') + '" data-set="' + key + '" data-val="' + f + '" aria-pressed="' + (S[key] === f) + '"><span class="smp ' + (f === 'rashi' ? 'fR' : 'fN') + '">' + sample + '</span><span class="lb">' + T(f === 'rashi' ? 'כתב רש״י' : 'כתב רגיל') + '</span></button>').join('');
    $r('#rdSet').innerHTML = '<div class="rdPopHd"><span>' + T('הגדרות תצוגה') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('סוג תצוגה') + '</span><div class="rdCards">' +
      card('daf', '<span class="pv pvDaf"><i></i><i class="m"></i><i></i></span>', 'צורת הדף') + card('study', '<span class="pv pvRows"><i></i><i></i><i></i></span>', 'גמרא ומפרשים') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב הפירוש') + ' (' + T('גמרא ומפרשים') + ')</span><div class="rdFonts">' + fontPair('cmFont', 'מאימתי קורין') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('גודל אותיות') + '</span><div class="rdSizes">' + [-1, 0, 1, 2].map(z => '<button type="button" class="' + (S.size === z ? 'on' : '') + '" data-set="size" data-val="' + z + '" aria-pressed="' + (S.size === z) + '" style="font-size:' + (13 + z * 2.5) + 'px">א</button>').join('') + '</div></div>' +
      '<p class="rdNote">' + T('לחצו על קטע בגמרא כדי לראות את הפירוש שלו.') + ' ' + T('ההגדרות נשמרות לפעם הבאה.') + '</p>';
  }
  function renderSetTur() {
    $r('#rdSet').innerHTML = '<div class="rdPopHd"><span>' + T('הגדרות תצוגה') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('גודל אותיות') + '</span><div class="rdSizes">' + [-1, 0, 1, 2].map(z => '<button type="button" class="' + (S.size === z ? 'on' : '') + '" data-set="size" data-val="' + z + '" aria-pressed="' + (S.size === z) + '" style="font-size:' + (13 + z * 2.5) + 'px">א</button>').join('') + '</div></div>' +
      '<p class="rdNote">' + T('הטור באמצע, ב״ח מימין ובית יוסף משמאל.') + ' ' + T('לחצו על סימן בטור או על דיבור כדי לקרוא אותו באותיות גדולות.') + ' ' + T('ההגדרות נשמרות לפעם הבאה.') + '</p>';
  }
  function renderSet() {
    if (isTur()) return renderSetTur();
    if (isTal()) return renderSetTal();
    const L = IX.links[S.b] || {}, rows = uName(S.b) + ' מול תרגום';
    const card = (k, ic, label) => '<button type="button" class="rdCard' + (S.view === k ? ' on' : '') + '" data-set="view" data-val="' + k + '" aria-pressed="' + (S.view === k) + '">' + ic + '<span>' + T(label) + '</span></button>';
    const opt = (k, label) => { const avail = k === 'none' || L[k] != null, on = S.tr === k; return '<button type="button" class="rdOpt' + (on ? ' on' : '') + '" data-set="tr" data-val="' + k + '" aria-pressed="' + on + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + (k === 'onkelos' ? T('ברירת מחדל') : '') + (avail ? '' : (k === 'onkelos' ? ' · ' : '') + T('אין בספר זה')) + '</span></button>'; };
    const fontPair = (key, sample) => ['rashi', 'regular'].map(f => '<button type="button" class="rdFont' + (S[key] === f ? ' on' : '') + '" data-set="' + key + '" data-val="' + f + '" aria-pressed="' + (S[key] === f) + '"><span class="smp ' + (f === 'rashi' ? 'fR' : 'fN') + '">' + sample + '</span><span class="lb">' + T(f === 'rashi' ? 'כתב רש״י' : 'כתב רגיל') + '</span></button>').join('');
    $r('#rdSet').innerHTML = '<div class="rdPopHd"><span>' + T('הגדרות תצוגה') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('סוג תצוגה') + '</span><div class="rdCards">' +
      card('book', '<span class="pv pvBook"><i></i><i></i><i class="s"></i><b></b></span>', 'ספר') + card('aligned', '<span class="pv pvRows"><i></i><i></i><i></i></span>', rows) + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('תרגום בצד שמאל') + '</span>' + opt('onkelos', 'תרגום אונקלוס') + opt('yonatan', 'תרגום יונתן') + opt('none', 'ללא תרגום') + '</div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב התרגום') + '</span><div class="rdFonts">' + fontPair('trFont', 'בקדמין ברא') + '</div></div>' +
      (isRambam(S.b) ? '<div class="rdSec"><span class="rdSecT">' + T('ניקוד') + '</span>' + [[true, 'עם ניקוד', T('ברירת מחדל')], [false, 'בלי ניקוד', T('כמו במהדורת פרנקל')]].map(([v, l, nt]) => '<button type="button" class="rdOpt' + (S.ramNik === v ? ' on' : '') + '" data-set="ramNik" data-val="' + v + '" aria-pressed="' + (S.ramNik === v) + '"><span class="dot"></span><span class="lb">' + T(l) + '</span><span class="nt">' + nt + '</span></button>').join('') + '</div>' : '') +
      ((L.cms || []).length > 1 ? '<div class="rdSec"><span class="rdSecT">' + T('מפרשים בתחתית הדף') + '</span>' + L.cms.map(({ c }) => { const on = !S.cmOff.includes(c); return '<button type="button" class="rdOpt rdChk' + (on ? ' on' : '') + '" data-set="cm" data-val="' + c + '" aria-pressed="' + on + '"><span class="dot"></span><span class="lb">' + cmName(c) + '</span><span class="nt"></span></button>'; }).join('') + '</div>' : '') +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב הפירוש') + ' (' + cmLabel(S.b) + ')</span><div class="rdFonts">' + fontPair('cmFont', isRambam(S.b) ? 'יסוד היסודות' : isMishnah(S.b) ? 'מאימתי קורין' : 'תהו ובהו') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('גודל אותיות') + '</span><div class="rdSizes">' + [-1, 0, 1, 2].map(z => '<button type="button" class="' + (S.size === z ? 'on' : '') + '" data-set="size" data-val="' + z + '" aria-pressed="' + (S.size === z) + '" style="font-size:' + (13 + z * 2.5) + 'px">א</button>').join('') + '</div></div>' +
      '<p class="rdNote">' + T('ההגדרות נשמרות לפעם הבאה.') + '</p>';
  }

  const J = { cat: 0, b: 0, ch: 1, v: 0, tk: '', tj: 0, rk: '', rs: 1 };
  const jTabs = () => '<div class="rdJTabs" role="group">' + [0, 1, 7, 2, 20].filter(c => c === 2 ? TX.list.length : c === 20 ? RX.list.length : IX.base.some(i => IX.books[i].cat === c)).map(c => '<button type="button" data-jcat="' + c + '" class="' + (J.cat === c ? 'on' : '') + '" aria-pressed="' + (J.cat === c) + '">' + T({ 0: 'תנ״ך', 1: 'משנה', 7: 'רמב״ם', 2: 'ש״ס', 20: 'טור' }[c]) + '</button>').join('') + '</div>';
  function renderJumpTur() {
    const t = turTOf(J.rk), cur = isTur() && S.rk === J.rk ? S.rs : -1, cells = [];
    for (let s = minS(t); s < t.n; s++) {
      const hs = (t.hil || []).find(x => x[0] === s); if (hs) cells.push('<div class="rdJSub">' + h(hs[1]) + '</div>');
      cells.push('<button type="button" class="rdCell' + (s ? '' : ' wide') + (J.rs === s ? ' on' : '') + (s === cur ? ' cur' : '') + '" data-jrs="' + s + '">' + (s ? num(s) : T('הקדמה')) + '</button>');
    }
    $r('#rdJump').innerHTML = '<div class="rdPopHd">' + jTabs() + '<span class="rdJT">' + T('מעבר לסימן') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdJGrid tur"><div class="rdJCol rdJBooks"><div class="rdJGrp">' + T('ארבעה טורים') + '</div>' + RX.list.map(x => '<button type="button" class="rdJB' + (x.k === J.rk ? ' on' : '') + '" data-jrk="' + h(x.k) + '">' + h(turPartName(x)) + '</button>').join('') + '</div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('סימן') + ' · ' + h(T('טור') + ' ' + turPartName(t)) + '</div><div class="rdCells">' + cells.join('') + '</div></div></div>' +
      '<div class="rdJFoot"><span>' + T('אפשר גם להקליד מקום בתיבת החיפוש') + ' · <b>← →</b> ' + T('דפדוף') + ' · <b>Ctrl G</b></span><button type="button" class="rdGo" data-jgo>' + (isEn() ? 'Go to ' : 'מעבר ל') + h(turPartName(t)) + ' ' + (J.rs ? num(J.rs) : T('הקדמה')) + '</button></div>';
  }
  function renderJumpTal() {
    const groups = []; TX.list.forEach(t => { let g = groups.find(x => x.name === t.g); if (!g) groups.push(g = { name: t.g, ts: [] }); g.ts.push(t); });
    const t = TX.list[TX.byK[J.tk]], dapim = []; for (let j = 0; j < t.n; j += 2) dapim.push(j);
    const cur = isTal() && S.tk === J.tk ? S.tj >> 1 : -1;
    $r('#rdJump').innerHTML = '<div class="rdPopHd">' + jTabs() + '<span class="rdJT">' + T('מעבר לדף') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdJGrid"><div class="rdJCol rdJBooks">' + groups.map(g => '<div class="rdJGrp">' + h(grpName(g.name)) + '</div>' + g.ts.map(x => '<button type="button" class="rdJB' + (x.k === J.tk ? ' on' : '') + '" data-jtk="' + h(x.k) + '">' + h(talName(x)) + '</button>').join('')).join('') + '</div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('דף') + ' · ' + h(talName(t)) + '</div><div class="rdCells">' + dapim.map(j => '<button type="button" class="rdCell' + ((J.tj >> 1) === (j >> 1) ? ' on' : '') + ((j >> 1) === cur ? ' cur' : '') + '" data-jd="' + j + '">' + (isEn() ? dafOf(j).d : toHeb(dafOf(j).d)) + '</button>').join('') + '</div></div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('עמוד') + '</div><div class="rdCells">' + [0, 1].map(sd => { const j = (J.tj & ~1) + sd; return '<button type="button" class="rdCell' + (J.tj === j ? ' on' : '') + '" data-jside="' + sd + '"' + (j >= t.n ? ' disabled' : '') + '>' + (isEn() ? 'ab'[sd] : 'אב'[sd]) + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="rdJFoot"><span>' + T('אפשר גם להקליד מקום בתיבת החיפוש') + ' · <b>← →</b> ' + T('דפדוף') + ' · <b>Ctrl G</b></span><button type="button" class="rdGo" data-jgo>' + (isEn() ? 'Go to ' : 'מעבר ל') + h(talName(t)) + ' ' + h(dafTxt(J.tj)) + '</button></div>';
  }
  function renderJump() {
    if (J.cat === 20) return renderJumpTur();
    if (J.cat === 2) return renderJumpTal();
    const groups = [];
    IX.base.forEach(i => { const bk = IX.books[i]; if (bk.cat !== J.cat) return; let g = groups.find(x => x.name === bk.g); if (!g) groups.push(g = { name: bk.g, ids: [] }); g.ids.push(i); });
    const vs = versesOf(IX, J.b, J.ch);
    $r('#rdJump').innerHTML = '<div class="rdPopHd">' + jTabs() + '<span class="rdJT">' + T('מעבר לפרק ופסוק') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdJGrid"><div class="rdJCol rdJBooks">' + groups.map(g => '<div class="rdJGrp">' + h(grpName(g.name)) + '</div>' + g.ids.map(i => '<button type="button" class="rdJB' + (i === J.b ? ' on' : '') + '" data-jb="' + i + '">' + h(bkName(IX.books[i].heTitle)) + '</button>').join('')).join('') + '</div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('פרק') + ' · ' + h(bkName(IX.books[J.b].heTitle)) + '</div><div class="rdCells">' + chaptersOf(IX, J.b).map(c => '<button type="button" class="rdCell' + (c === J.ch ? ' on' : '') + (c === S.ch && J.b === S.b ? ' cur' : '') + '" data-jch="' + c + '">' + num(c) + '</button>').join('') + '</div></div>' +
      '<div class="rdJCol"><div class="rdJH">' + T(uName(J.b)) + ' · ' + T('פרק') + ' ' + num(J.ch) + '</div><div class="rdCells">' + vs.map(v => '<button type="button" class="rdCell' + (v === J.v ? ' on' : '') + '" data-jv="' + v + '">' + num(v) + '</button>').join('') + '</div></div></div>' +
      '<div class="rdJFoot"><span>' + T('אפשר גם להקליד מקום בתיבת החיפוש') + ' · <b>← →</b> ' + T('דפדוף') + ' · <b>Ctrl G</b></span><button type="button" class="rdGo" data-jgo>' + (isEn() ? 'Go to ' : 'מעבר ל') + h(bkName(IX.books[J.b].heTitle)) + ' ' + num(J.ch) + (J.v ? ', ' + num(J.v) : '') + '</button></div>';
  }

  /* ---------- חיפוש מהיר ---------- */
  let dropItems = [], dropAct = -1, qTimer = 0, dropQ = null;
  function closeDrop() { const d = $r('#rdDrop'); if (d) d.hidden = true; dropItems = []; dropAct = -1; }
  function scopeBooks() { if (S.scope === 'all') return IX.base.filter(i => IX.books[i].cat === IX.books[S.b].cat); return [S.b]; }
  function refLabel(r) { return bkName(IX.books[r.b].heTitle) + ' ' + num(r.ch) + (r.v ? ', ' + num(r.v) : ''); }
  /* תוצאות החיפוש: כל ההתאמות (בלי תקרה) ברשימה וירטואלית, בדומה לרשימת התוצאות במסך הגימטריה.
     רק השורות שבחלון הגלילה (ועוד מרווח) נמצאות ב-DOM; לכל שורה ולכל כותרת קבוצה גובה קבוע, ולכן המיקום של כל
     פריט מחושב מראש (RS.off) והגובה הכולל של התוכן מדויק — פס הגלילה מתנהג כאילו הכל מרונדר.
     קבוצות: לפי ספר (בכל התנ״ך / המשנה) או לפי פרק (בספר). פס גלילה מותאם (.rdFs) עם ידית לגרירה, בועה
     ("בראשית · פרק ג" + "תוצאה X מתוך Y"), וסימונים על הפס בתחילת כל חלק (תורה/נביאים/כתובים, סדרי המשנה). */
  /* חיפוש במפרשים (רש״י בתנ״ך, ברטנורא במשנה): כל פסקת פירוש היא תוצאה בפני עצמה {b, ch, v, cm: מספר הפסקה}.
     הטקסט המנורמל של המפרש נשמר במטמון לכל ספר, כמו normBook של הכתוב. "שניהם" = לכל פסוק קודם הכתוב ואחריו הפירוש. */
  const CMN = new Map();
  function cmNorm(cb) {
    if (!CMN.has(cb)) CMN.set(cb, (IX.data[cb] || []).map(c => c ? c.map(a => (a || []).map(t => ' ' + norm(t) + ' ')) : null));
    return CMN.get(cb);
  }
  const cmOf = x => ((IX.links[x.b] || {}).cms || []).find(m => m.c === x.cs) || {};
  const cmText = x => noMarks(((chText(cmOf(x).b, x.ch, x.v) || [])[x.cm]) || '');
  function excerpt(t, q) { // הקטע שסביב ההתאמה הראשונה, כדי שתיראה גם בפסקת פירוש ארוכה
    const { parts, marks } = markWords(t, q), first = Math.min(...marks);
    if (!isFinite(first) || first < 14) return t;
    return '… ' + parts.slice(first - 8).join('');
  }
  function searchNeed(books) {
    if (S.src === 'both' || (S.src === 'tr' && isMishnah(S.b))) S.src = 'all';
    const all = S.src === 'all', out = [];
    books.forEach(b => {
      const L = IX.links[b] || {};
      if (all || S.src === 'txt') out.push(b);
      if (all || S.src === 'cm') (L.cms || []).forEach(m => out.push(m.b));
      if (all || S.src === 'tr') ['onkelos', 'yonatan'].forEach(k => { if (L[k] != null) out.push(L[k]); });
    });
    return out;
  }
  function searchSrc(q, books, onlyCh) {
    if (S.src === 'both' || (S.src === 'tr' && isMishnah(S.b))) S.src = 'all'; // ערך ישן / אין תרגום במשנה וברמב״ם
    const nq = norm(q), hits = [], all = S.src === 'all', txt = all || S.src === 'txt', cm = all || S.src === 'cm', tr = all || S.src === 'tr';
    if (nq.length < 2) return { hits, total: 0, q: nq };
    for (const b of books) {
      const T1 = txt ? normBook(IX, b) : null, L = IX.links[b] || {}, C1 = cm ? (L.cms || []).map(m => ({ c: m.c, n: cmNorm(m.b) })) : [];
      const TR = tr ? ['onkelos', 'yonatan'].filter(k => L[k] != null).map(k => ({ k, n: normBook(IX, L[k]) })) : [];
      chaptersOf(IX, b).forEach(ch => {
        if (onlyCh && ch !== onlyCh) return;
        versesOf(IX, b, ch).forEach(v => {
          if (T1 && ((T1[ch] || [])[v] || '').includes(nq)) hits.push({ b, ch, v });
          TR.forEach(t => { if (((t.n[ch] || [])[v] || '').includes(nq)) hits.push({ b, ch, v, tr: t.k }); });
          C1.forEach(m => ((m.n[ch] || [])[v] || []).forEach((t, k) => { if (t.includes(nq)) hits.push({ b, ch, v, cm: k, cs: m.c }); }));
        });
      });
    }
    return { hits, total: hits.length, q: nq };
  }
  const RH = 58, GH = 28, OVER = 12, cnt = n => n.toLocaleString('en-US'), resN = n => cnt(n) + ' ' + T(n === 1 ? 'תוצאה' : 'תוצאות'); // מספרי תוצאות בספרות, כמו במסך הגימטריה
  let RS = null;
  const talRefLabel = (k, j) => { const t = TX.list[TX.byK[k]]; return T('מסכת') + ' ' + talName(t) + ' ' + T('דף') + ' ' + dafTxt(j); };
  const turRefLabel = (k, s) => T('טור') + ' ' + turPartName(turTOf(k)) + ' ' + (s ? T('סימן') + ' ' + num(s) : T('הקדמה'));
  const refItemLabel = it => it.kind === 'tur' ? turRefLabel(it.k, it.s) : it.kind === 'tal' ? talRefLabel(it.k, it.j) : refLabel(it.r);
  function renderDropTal() {
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; return; }
    const tr = parseDafRef(TX, q), ref = parseRef(IX, q, null), rref = parseTurRef(RX, q);
    if (rref) dropItems.push({ kind: 'tur', k: rref.k, s: rref.s });
    if (tr) dropItems.push({ kind: 'tal', k: tr.k, j: tr.j });
    if (ref && !(tr && tr.explicit)) dropItems.push({ kind: 'ref', r: ref });
    let html = dropItems.length ? '<div class="rdDRefs"><div class="rdDH">' + T('מעבר אל') + '</div>' + dropItems.map((it, i) => '<button type="button" class="rdDI ref" data-i="' + i + '" role="option">' + ICON.book + '<span>' + h(refItemLabel(it)) + '</span></button>').join('') + '</div>' : '';
    const res = searchTal(q), n = res.hits.length, MAX = 400;
    const srcs = [['g', 'גמרא'], ['r', 'רש״י'], ['t', 'תוספות'], ['all', 'הכל']];
    html += '<div class="rdDScope" role="group"><span class="rdSrc" role="group" aria-label="' + T('חיפוש ב') + '">' + srcs.map(([k, l]) => '<button type="button" data-tsrc="' + k + '" class="' + (S.tsrc === k ? 'on' : '') + '" aria-pressed="' + (S.tsrc === k) + '">' + T(l) + '</button>').join('') + '</span><span class="cnt">' + (res.q.length < 2 ? '' : n ? resN(n) + (n > MAX ? ' · ' + T('מציג') + ' ' + cnt(MAX) : '') : T('אין תוצאות')) + '</span></div>';
    const start = dropItems.length;
    res.hits.slice(0, MAX).forEach(x => dropItems.push({ kind: 'thit', x }));
    if (n) html += '<div class="rdTRes">' + res.hits.slice(0, MAX).map((x, i) => {
      const tag = x.src === 'g' ? '' : x.src === 'r' ? innerLabel(S.tk, x.j) : T('תוספות'), t = plainT(x.t);
      return '<button type="button" class="rdDI hit' + (tag ? ' cm' : '') + '" data-i="' + (start + i) + '" role="option"><span class="rf">' + (tag ? '<i>' + h(tag) + '</i> ' : '') + h(dafTxt(x.j) + ' · ' + T('קטע') + ' ' + num(x.s + 1)) + '</span><span class="sn' + (tag ? ' ' + (S.cmFont === 'rashi' ? 'fR' : 'fN') : '') + '">' + hlHtml(tag ? excerpt(t, q) : t, q) + '</span></button>';
    }).join('') + '</div>';
    d.innerHTML = html; d.hidden = false;
    if (dropItems.length) setAct(0);
  }
  function renderDropTur() { // בטור: רק מעבר למקום (סימן, דף, פסוק)
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; return; }
    const rr = parseTurRef(RX, q), tr = parseDafRef(TX, q), ref = parseRef(IX, q, null);
    if (rr) dropItems.push({ kind: 'tur', k: rr.k, s: rr.s });
    else { const n = parseNum(turClean(q)); if (n >= 1 && n < turT().n && /^[א-ת\d]{1,4}$/.test(turClean(q))) dropItems.push({ kind: 'tur', k: S.rk, s: n }); }
    if (tr && tr.explicit) dropItems.push({ kind: 'tal', k: tr.k, j: tr.j });
    if (ref && !rr) dropItems.push({ kind: 'ref', r: ref });
    d.innerHTML = (dropItems.length ? '<div class="rdDRefs"><div class="rdDH">' + T('מעבר אל') + '</div>' + dropItems.map((it, i) => '<button type="button" class="rdDI ref" data-i="' + i + '" role="option">' + ICON.book + '<span>' + h(refItemLabel(it)) + '</span></button>').join('') + '</div>' : '') +
      '<p class="rdNote rdDNote">' + T('בטור מקלידים מקום: ״או״ח ס״, ״יו״ד קצג״, או מספר סימן.') + '</p>';
    d.hidden = false;
    if (dropItems.length) setAct(0);
  }
  function renderDrop() {
    if (isTur()) return renderDropTur();
    if (isTal()) return renderDropTal();
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; return; }
    let html = '';
    const ref = parseRef(IX, q, S.b), tref = parseDafRef(TX, q), rref = parseTurRef(RX, q);
    if (rref) dropItems.push({ kind: 'tur', k: rref.k, s: rref.s });
    if (tref && tref.explicit) dropItems.push({ kind: 'tal', k: tref.k, j: tref.j });
    if (ref) dropItems.push({ kind: 'ref', r: ref });
    if (tref && !tref.explicit) dropItems.push({ kind: 'tal', k: tref.k, j: tref.j });
    if (!dropItems.length) suggestBooks(IX, q, 4).forEach(b => dropItems.push({ kind: 'ref', r: { b, ch: chaptersOf(IX, b)[0], v: 0 } }));
    if (dropItems.length) html += '<div class="rdDRefs"><div class="rdDH">' + T('מעבר אל') + '</div>' + dropItems.map((it, i) => '<button type="button" class="rdDI ref" data-i="' + i + '" role="option">' + ICON.book + '<span>' + h(refItemLabel(it)) + '</span></button>').join('') + '</div>';
    const scopes = [['ch', 'בפרק'], ['book', 'בספר'], ['all', isRambam(S.b) ? 'בכל הרמב״ם' : isMishnah(S.b) ? 'בכל המשנה' : 'בכל התנ״ך']];
    // החיפוש צריך את הספרים שבתחום (והמפרשים/התרגומים שלהם, לפי "חיפוש ב"); עד שהם נטענים — "טוען…" במקום מספר התוצאות
    const sBooks = scopeBooks(), wait = !ensure(searchNeed(sBooks), () => { if (dropQ === q && !$r('#rdDrop').hidden) renderDrop(); });
    const res = wait ? { hits: [], total: 0, q: norm(q) } : searchSrc(q, sBooks, S.scope === 'ch' ? S.ch : 0);
    const srcs = [['txt', isRambam(S.b) ? 'הלכות' : isMishnah(S.b) ? 'משניות' : 'פסוקים'], ['cm', isRambam(S.b) ? 'מפרשים' : isMishnah(S.b) ? 'ברטנורא' : 'רש״י']].concat(isMishnah(S.b) ? [] : [['tr', 'תרגום']], [['all', 'הכל']]);
    html += '<div class="rdDScope" role="group">' + scopes.map(([k, l]) => '<button type="button" data-scope="' + k + '" class="' + (S.scope === k ? 'on' : '') + '" aria-pressed="' + (S.scope === k) + '">' + T(l) + '</button>').join('') + '<span class="sep" aria-hidden="true"></span><span class="rdSrc" role="group" aria-label="' + T('חיפוש ב') + '">' + srcs.map(([k, l]) => '<button type="button" data-src="' + k + '" class="' + (S.src === k ? 'on' : '') + '" aria-pressed="' + (S.src === k) + '">' + T(l) + '</button>').join('') + '</span><span class="cnt">' + (res.q.length < 2 ? '' : wait ? T('טוען…') : res.total ? resN(res.total) : T('אין תוצאות')) + '</span></div>';
    const start = dropItems.length;
    res.hits.forEach(x => dropItems.push({ kind: 'hit', r: x }));
    if (res.hits.length) {
      // רשימה שטוחה: כותרת קבוצה ואחריה התוצאות שלה; off = מיקום כל פריט בפיקסלים
      const byBook = S.scope === 'all', key = x => byBook ? x.b : x.b + ':' + x.ch;
      const items = [], off = [], ticks = []; let y = 0, prevK = null, prevG = null, gi = -1;
      res.hits.forEach((x, j) => {
        if (S.scope !== 'ch' && key(x) !== prevK) {
          let n = 0; for (let t = j; t < res.hits.length && key(res.hits[t]) === key(x); t++) n++;
          const g = IX.books[x.b].g; if (byBook && g !== prevG) { ticks.push({ y, g }); prevG = g; }
          items.push({ gh: true, x, n }); off.push(y); y += GH; prevK = key(x); gi = items.length - 1;
        }
        items.push({ i: start + j, x, gi }); off.push(y); y += RH;
      });
      const pos = []; items.forEach((it, k) => { if (!it.gh) pos[it.i - start] = k; });
      RS = { items, off, total: y, start, n: res.hits.length, pos, ticks, q, from: -1, to: -1 };
      html += '<div class="rdRes"><div class="rdResBox" id="rdResBox"><div class="rdResIn" style="height:' + y + 'px"></div></div>' +
        '<div class="rdResSticky" id="rdResSticky" aria-hidden="true"></div>' +
        '<div class="rdFs" id="rdFs" aria-hidden="true">' + ticks.map(t => '<i class="rdFsTick" style="top:' + (100 * t.y / y).toFixed(2) + '%" title="' + h(grpName(t.g)) + '"></i>').join('') +
        '<div class="rdFsThumb" id="rdFsThumb"><div class="rdFsBub" id="rdFsBub"></div></div></div></div>';
    }
    d.innerHTML = html; d.hidden = false;
    if (RS) { const box = $r('#rdResBox'); box.onscroll = () => resWin(); resWin(); }
    if (dropItems.length) setAct(0);
  }
  const ghLabel = x => S.scope === 'all' ? bkName(IX.books[x.b].heTitle) : T('פרק') + ' ' + num(x.ch);
  function firstAt(y) { // הפריט הראשון שתחתיתו מתחת ל-y (חיפוש בינארי ב-off)
    let lo = 0, hi = RS.items.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (RS.off[m] <= y) lo = m; else hi = m - 1; }
    return lo;
  }
  function resWin(force) {
    if (!RS) return;
    const box = $r('#rdResBox'); if (!box) return;
    const top = box.scrollTop, hgt = box.clientHeight || 400;
    const from = Math.max(0, firstAt(top) - OVER), to = Math.min(RS.items.length, firstAt(top + hgt) + OVER + 1);
    if (force || from !== RS.from || to !== RS.to) {
      RS.from = from; RS.to = to;
      box.firstChild.innerHTML = RS.items.slice(from, to).map((it, k) => {
        const y = RS.off[from + k], x = it.x;
        if (it.gh) return '<div class="rdGh" style="top:' + y + 'px"><span>' + h(ghLabel(x)) + '</span><span class="n">' + resN(it.n) + '</span></div>';
        const cm = x.cm != null, tr = !!x.tr, t = cm ? cmText(x) : tr ? noMarks(chText(IX.links[x.b][x.tr], x.ch, x.v)) : noTeamim(chText(x.b, x.ch, x.v));
        const tag = cm ? cmName(x.cs) : tr ? trLabel(x.tr) : '', fc = cm ? S.cmFont : tr ? S.trFont : '';
        return '<button type="button" class="rdDI hit' + (tag ? ' cm' : '') + (it.i === dropAct ? ' act' : '') + '" style="top:' + y + 'px" data-i="' + it.i + '" role="option"><span class="rf">' + (tag ? '<i>' + h(tag) + '</i> ' : '') + h(refLabel(x)) + '</span><span class="sn' + (fc ? ' ' + (fc === 'rashi' ? 'fR' : 'fN') : '') + '">' + hlHtml(tag ? excerpt(t, RS.q) : t, RS.q) + '</span></button>';
      }).join('');
    }
    // כותרת דבוקה: הקבוצה של הפריט שבראש החלון (מוסתרת כשכותרת אמיתית בדיוק בראש)
    const st = $r('#rdResSticky'), f = RS.items[firstAt(top)];
    const g = f && (f.gh ? f : RS.items[f.gi]);
    st.hidden = !g || (f.gh && RS.off[firstAt(top)] >= top - 1);
    if (g && !st.hidden) st.innerHTML = '<span>' + h(ghLabel(g.x)) + '</span><span class="n">' + resN(g.n) + '</span>';
    fsLay();
  }
  function fsLay() {
    const box = $r('#rdResBox'), tr = $r('#rdFs'), th = $r('#rdFsThumb'); if (!box || !tr) return;
    const max = box.scrollHeight - box.clientHeight;
    tr.hidden = max <= 4; if (tr.hidden) return;
    const H = tr.clientHeight, t = Math.max(30, H * box.clientHeight / box.scrollHeight);
    th.style.height = t + 'px'; th.style.top = (box.scrollTop / max) * (H - t) + 'px';
    const k = Math.min(RS.items.length - 1, firstAt(box.scrollTop + box.clientHeight * (box.scrollTop / max)));
    const it = RS.items[k], hit = it.gh ? RS.items[k + 1] : it;
    $r('#rdFsBub').innerHTML = '<b>' + h(refLabel({ b: hit.x.b, ch: hit.x.ch, v: 0 })) + '</b><span>' + T('תוצאה') + ' ' + cnt(hit.i - RS.start + 1) + ' ' + T('מתוך') + ' ' + cnt(RS.n) + '</span>';
  }
  function fsBind() { // פעם אחת: גרירת הידית ולחיצה על הפס (האירועים מואצלים מ-#rdDrop כי התוכן נבנה מחדש)
    let drag = null, raf = 0, py = 0;
    const d = $r('#rdDrop');
    const apply = () => { raf = 0; if (!drag) return; const box = $r('#rdResBox'), tr = $r('#rdFs'), th = $r('#rdFsThumb'); if (!box) return;
      const rng = tr.clientHeight - th.offsetHeight, max = box.scrollHeight - box.clientHeight;
      box.scrollTop = Math.max(0, Math.min(max, drag.top + (rng > 0 ? (py - drag.y) / rng * max : 0))); };
    d.addEventListener('pointerdown', e => {
      const th = e.target.closest('#rdFsThumb'), tr = e.target.closest('#rdFs'); if (!tr) return;
      e.preventDefault(); const box = $r('#rdResBox');
      if (!th) { const r = tr.getBoundingClientRect(), t = $r('#rdFsThumb').offsetHeight; box.scrollTop = Math.max(0, Math.min(1, (e.clientY - r.top - t / 2) / Math.max(1, r.height - t))) * (box.scrollHeight - box.clientHeight); }
      drag = { y: e.clientY, top: box.scrollTop }; py = e.clientY; tr.classList.add('drag'); try { tr.setPointerCapture(e.pointerId); } catch (_) {}
    });
    d.addEventListener('pointermove', e => { if (!drag) return; py = e.clientY; if (!raf) raf = requestAnimationFrame(apply); });
    const end = () => { if (!drag) return; drag = null; const tr = $r('#rdFs'); if (tr) tr.classList.remove('drag'); };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
  }
  function setAct(i) {
    const n = dropItems.length; if (!n) return;
    dropAct = (i + n) % n;
    R.querySelectorAll('#rdDrop .rdDI').forEach(b => b.classList.toggle('act', Number(b.dataset.i) === dropAct));
    const it = dropItems[dropAct];
    if (it.kind === 'hit' && RS) {
      const box = $r('#rdResBox'), k = RS.pos[dropAct - RS.start], y = RS.off[k], hdr = S.scope === 'ch' ? 0 : GH;
      if (y - hdr < box.scrollTop) box.scrollTop = y - hdr; else if (y + RH > box.scrollTop + box.clientHeight) box.scrollTop = y + RH - box.clientHeight;
      resWin(true);
    } else { const b = R.querySelector('#rdDrop .rdDI[data-i="' + dropAct + '"]'); if (b) b.scrollIntoView({ block: 'nearest' }); if (RS && dropAct === 0) { $r('#rdResBox').scrollTop = 0; } }
  }
  function pickDrop(i) {
    const it = dropItems[i]; if (!it) return;
    const q = $r('#rdQ').value;
    if (it.kind === 'hit' || it.kind === 'thit') { S.hl = q; if (it.r && it.r.tr && S.tr !== it.r.tr) S.tr = it.r.tr; } else { S.hl = ''; $r('#rdQ').value = ''; }
    $r('#rdQ').blur(); // כדי שהחצים ידפדפו מיד
    updClear(); closeDrop();
    if (it.kind === 'tur') return goTur(it.k, it.s);
    if (it.kind === 'tal') return goTal(it.k, it.j);
    if (it.kind === 'thit') { segTab = it.x.src === 't' ? 't' : 'r'; return goTal(S.tk, it.x.j, it.x.s); }
    goTo(it.r.b, it.r.ch, it.r.v);
  }
  function updClear() { $r('#rdQClr').hidden = !$r('#rdQ').value; }

  /* ---------- בנייה ---------- */
  function build() {
    ensureIndex();
    R = $r('#reader');
    // סרגל הקריאה יושב בתוך הבאנר העליון (header.top), אחרי מתג המצב — אין פס נפרד מתחתיו.
    // המחלקה reader על #rdTop נותנת לכפתורים ולרשימת החיפוש את אותם סגנונות (.reader …) ואותו container למסך צר,
    // והיא גם מסתירה אותו כשלא במצב קריאה (.reader{display:none}).
    const old = $r('#rdTop'); if (old) old.remove();
    const head = document.createElement('div'); head.className = 'reader rdTop'; head.id = 'rdTop';
    head.innerHTML =
      '<div class="rdOmni">' +
        '<div class="rdNav"><button type="button" class="rdIco" id="rdPrevCh" aria-label="' + T('פרק קודם') + '" title="' + T('פרק קודם') + '">' + ICON.chevR + '</button>' +
        '<button type="button" class="rdWhere" id="rdWhere" aria-haspopup="dialog" aria-expanded="false" title="' + T('מעבר לפרק ופסוק') + ' (Ctrl G)">' + ICON.book + '<span id="rdWhereTxt"></span>' + ICON.caret + '</button>' +
        '<button type="button" class="rdIco" id="rdNextCh" aria-label="' + T('פרק הבא') + '" title="' + T('פרק הבא') + '">' + ICON.chevL + '</button></div>' +
        '<span class="rdOmniSep" aria-hidden="true"></span>' +
        '<div class="rdSearch" id="rdSearch">' + ICON.search + '<input type="search" id="rdQ" dir="' + (isEn() ? 'auto' : 'rtl') + '" autocomplete="off" spellcheck="false" placeholder="' + T('חיפוש, או קפיצה: ״שמות יב ב״') + '" aria-label="' + T('חיפוש מהיר או קפיצה למקום') + '" role="combobox" aria-controls="rdDrop" aria-expanded="false">' +
        '<button type="button" class="rdIco sm" id="rdQClr" aria-label="' + T('ניקוי חיפוש') + '" hidden>' + ICON.x + '</button><kbd>Ctrl K</kbd><div class="rdDrop" id="rdDrop" role="listbox" hidden></div></div>' +
      '</div>' +
      '<div class="rdTools">' +
        '<div class="rdSeg" id="rdViewSeg" role="group" aria-label="' + T('סוג תצוגה') + '"><button type="button" data-view="book">' + ICON.vBook + '<span class="t">' + T('ספר') + '</span></button><button type="button" data-view="aligned">' + ICON.vRows + '<span class="t"></span></button></div>' +
        '<span class="rdToolsSep" aria-hidden="true"></span>' +
        '<button type="button" class="rdSetBtn" id="rdSetBtn" aria-haspopup="dialog" aria-expanded="false"><span class="aa">אָ</span><span class="t">' + T('תצוגה') + '</span></button>' +
        '<button type="button" class="rdIco rdPrintBtn" id="rdPrintBtn" aria-haspopup="dialog" aria-expanded="false" aria-label="' + T('הדפסה / PDF') + '" title="' + T('הדפסה / PDF') + ' (Ctrl P)">' + ICON.print + '</button>' +
      '</div>';
    const top = $r('header.top'), sideSw = $r('#sideSw');
    if (sideSw) sideSw.after(head); else top.appendChild(head);
    R.innerHTML =
      '<div class="rdDesk" id="rdDesk"><button type="button" class="rdTurn prev" id="rdPrev" aria-label="' + T('עמוד קודם') + '">' + ICON.chevR + '</button><div class="rdBook" id="rdBook"></div>' +
        '<button type="button" class="rdTurn next" id="rdNext" aria-label="' + T('עמוד הבא') + '">' + ICON.chevL + '</button><div class="rdMeasure" aria-hidden="true"><article class="rdPage" id="rdProbe"></article><div id="rdDafHost"></div></div></div>' +
      '<div class="rdFoot"><button type="button" class="rdIco" id="rdPrev2" aria-label="' + T('עמוד קודם') + '">' + ICON.chevR + '</button><span id="rdPos"></span><span class="rdProg"><span id="rdProgBar"></span></span><span id="rdChPos"></span><button type="button" class="rdIco" id="rdNext2" aria-label="' + T('עמוד הבא') + '">' + ICON.chevL + '</button></div>' +
      '<div class="rdScrim" id="rdScrim" hidden></div><div class="rdPop rdSet" id="rdSet" role="dialog" aria-label="' + T('הגדרות תצוגה') + '" hidden></div><div class="rdPop rdJump" id="rdJump" role="dialog" aria-label="' + T('מעבר לפרק ופסוק') + '" hidden></div><div class="rdPop rdPrintPop" id="rdPrintPop" role="dialog" aria-label="' + T('הדפסה / PDF') + '" hidden></div><div class="rdPop rdSegPop" id="rdSeg" role="dialog" aria-label="' + T('קטע ופירושיו') + '" hidden></div>';
    built = true;
    // ש״ס: לחיצה על קטע גמרא או על פירוש פותחת את חלון הקטע
    $r('#rdBook').addEventListener('click', e => {
      if (isTur()) { const x = e.target.closest('[data-x][data-i]'), art = x && x.closest('article[data-s]'); if (!x || !art) return; const s = Number(art.dataset.s), i = Number(x.dataset.i); if (S.rsel && S.rsel.s === s && S.rsel.x === x.dataset.x && S.rsel.i === i && !$r('#rdSeg').hidden) return closeSeg(); return openTurCm(s, x.dataset.x, i); }
    });
    $r('#rdBook').addEventListener('click', e => { const x = isTal() && e.target.closest('[data-j][data-s]'); if (!x) return; const j = Number(x.dataset.j), s = Number(x.dataset.s); if (S.sel && S.sel.j === j && S.sel.s === s && !$r('#rdSeg').hidden) return closeSeg(); if (x.classList.contains('cT')) segTab = 't'; else if (x.classList.contains('cR')) segTab = 'r'; openSeg(j, s); });
    $r('#rdSeg').onclick = e => {
      if (e.target.closest('[data-close]')) return closeSeg();
      const tt = e.target.closest('[data-turtab]'); if (tt && S.rsel) { if (tt.dataset.turtab !== S.rsel.x) { const o = Number($r('#rdSeg').dataset.other); if (o >= 0) openTurCm(S.rsel.s, tt.dataset.turtab, o); } return; }
      const tm = e.target.closest('[data-turmove]'); if (tm) return turCmMove(Number(tm.dataset.turmove));
      const tb = e.target.closest('[data-segtab]'); if (tb) { segTab = tb.dataset.segtab; return openSeg(S.sel.j, S.sel.s); }
      const mv = e.target.closest('[data-segmove]'); if (mv) segMove(Number(mv.dataset.segmove));
    };
    $r('#rdPrevCh').onclick = () => stepChapter(-1); $r('#rdNextCh').onclick = () => stepChapter(1);
    $r('#rdPrev').onclick = $r('#rdPrev2').onclick = () => turn(-1);
    $r('#rdNext').onclick = $r('#rdNext2').onclick = () => turn(1);
    $r('#rdWhere').onclick = () => openPopover('jump');
    $r('#rdSetBtn').onclick = () => openPopover('set');
    $r('#rdPrintBtn').onclick = () => openPopover('print');
    $r('#rdPrintPop').onclick = e => {
      if (e.target.closest('[data-close]')) return closePops();
      if (e.target.closest('[data-print]')) { closePops(); return printNow(); }
      const t = e.target.closest('[data-pset]'); if (!t) return;
      S[t.dataset.pset] = t.dataset.val; save(); renderPrintPop();
    };
    $r('#rdScrim').onclick = closePops;
    document.querySelectorAll('#rdViewSeg button').forEach(x => { x.onclick = () => { if (isTal()) { S.tview = x.dataset.view === 'book' ? 'daf' : 'study'; S.tp = 0; } else S.view = x.dataset.view; render(); }; });
    $r('#rdSet').onclick = e => {
      if (e.target.closest('[data-close]')) return closePops();
      const t = e.target.closest('[data-set]'); if (!t) return;
      const k = t.dataset.set;
      if (k === 'ramNik') S.ramNik = t.dataset.val === 'true';
      else if (k === 'cm') { const c = Number(t.dataset.val); S.cmOff = S.cmOff.includes(c) ? S.cmOff.filter(x => x !== c) : S.cmOff.concat(c); }
      else S[k] = k === 'size' ? Number(t.dataset.val) : t.dataset.val;
      renderSet(); render();
    };
    $r('#rdJump').onclick = e => {
      if (e.target.closest('[data-close]')) return closePops();
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.jcat != null) { J.cat = Number(t.dataset.jcat); if (J.cat === 20) { J.rk = S.rk || RX.list[0].k; J.rs = isTur() ? S.rs : 1; } else if (J.cat === 2) { J.tk = S.tk || TX.list[0].k; J.tj = isTal() ? S.tj : 0; } else { J.b = IX.base.find(i => IX.books[i].cat === J.cat); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; } }
      else if (t.dataset.jrk != null) { J.rk = t.dataset.jrk; J.rs = 1; }
      else if (t.dataset.jrs != null) { J.rs = Number(t.dataset.jrs); closePops(); return goTur(J.rk, J.rs); }
      else if (t.dataset.jtk != null) { J.tk = t.dataset.jtk; J.tj = 0; }
      else if (t.dataset.jd != null) { J.tj = Number(t.dataset.jd); }
      else if (t.dataset.jside != null) { J.tj = (J.tj & ~1) + Number(t.dataset.jside); closePops(); return goTal(J.tk, J.tj); }
      else if (t.dataset.jb != null) { J.b = Number(t.dataset.jb); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; }
      else if (t.dataset.jch != null) { J.ch = Number(t.dataset.jch); J.v = 0; }
      else if (t.dataset.jv != null) { J.v = Number(t.dataset.jv); closePops(); return goTo(J.b, J.ch, J.v); }
      else if (t.dataset.jgo != null) { closePops(); return J.cat === 20 ? goTur(J.rk, J.rs) : J.cat === 2 ? goTal(J.tk, J.tj) : goTo(J.b, J.ch, J.v); }
      const sc = $r('#rdJump .rdJBooks'), top = sc ? sc.scrollTop : 0;
      renderJump(); const nsc = $r('#rdJump .rdJBooks'); if (nsc) nsc.scrollTop = top;
    };
    const q = $r('#rdQ');
    q.addEventListener('input', () => { updClear(); clearTimeout(qTimer); qTimer = setTimeout(renderDrop, 140); if (!q.value && S.hl) { S.hl = ''; render(); } });
    q.addEventListener('focus', () => { closePops(); if (q.value.trim()) renderDrop(); });
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAct(dropAct + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(dropAct - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(qTimer); if ($r('#rdDrop').hidden || dropQ !== q.value) renderDrop(); pickDrop(dropAct < 0 ? 0 : dropAct); }
      else if (e.key === 'Escape') { e.stopPropagation(); if (!$r('#rdDrop').hidden) closeDrop(); else { q.value = ''; updClear(); if (S.hl) { S.hl = ''; render(); } q.blur(); } }
    });
    $r('#rdQClr').onclick = () => { q.value = ''; updClear(); closeDrop(); if (S.hl) { S.hl = ''; render(); } q.focus(); };
    $r('#rdDrop').addEventListener('mousedown', e => e.preventDefault()); // שהפוקוס לא יברח מהתיבה
    fsBind();
    $r('#rdDrop').onclick = e => {
      const sc = e.target.closest('[data-scope]'); if (sc) { S.scope = sc.dataset.scope; save(); return renderDrop(); }
      const sr = e.target.closest('[data-src]'); if (sr) { S.src = sr.dataset.src; save(); return renderDrop(); }
      const ts = e.target.closest('[data-tsrc]'); if (ts) { S.tsrc = ts.dataset.tsrc; save(); return renderDrop(); }
      const it = e.target.closest('.rdDI'); if (it) pickDrop(Number(it.dataset.i));
    };
    document.addEventListener('mousedown', e => { if (!e.target.closest('#rdSearch')) closeDrop(); });
    // החלקה בנייד: ימינה = העמוד הבא (בספר עברי העמוד הבא נמצא משמאל)
    let tx = null, ty = 0;
    const desk = $r('#rdDesk');
    // גודל השולחן יכול להשתנות גם בלי resize של החלון (שורת הכותרת אחרי טעינת גופנים או הודעת סטטוס) — אז מעמדים מחדש
    if (G.ResizeObserver) {
      if (deskRO) deskRO.disconnect();
      deskRO = new ResizeObserver(() => { if (geo && !$r('#rdBook .rdLoading,#rdBook .rdSkel') && (desk.clientWidth !== geo.W || desk.clientHeight !== geo.H)) { clearTimeout(roT); roT = setTimeout(render, 120); } });
      deskRO.observe(desk);
    }
    desk.addEventListener('touchstart', e => { if (e.touches.length === 1) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } }, { passive: true });
    desk.addEventListener('touchend', e => {
      if (tx == null) return; const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; tx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) turn(dx > 0 ? 1 : -1);
    }, { passive: true });
  }

  function rebuild() { if (!built) return; const qv = $r('#rdQ') ? $r('#rdQ').value : ''; built = false; PC.clear(); CMC.clear(); WC.clear(); DC.clear(); TPC.clear(); TGC.clear(); build(); $r('#rdQ').value = qv; updClear(); render(); }

  /* ---------- מעבר בין מצבים (גימטריה / קריאה) ---------- */
  let curMode = null; // המסך האחרון שדווח ל-GA — לחיצה על המסך שכבר פתוח לא נספרת שוב
  function setMode(m, user, via) {
    if (m !== 'read') m = 'gem';
    if (m !== curMode && APP.trackEvent) APP.trackEvent('app_screen', { screen: m === 'read' ? 'reader' : 'gematria', via: via || (user ? 'switch' : 'load') });
    curMode = m;
    document.body.dataset.mode = m;
    document.querySelectorAll('#modeSw button').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    try { localStorage.setItem('gimatrivonMode', m); } catch (e) {}
    if (m === 'read') {
      if (!built) build();
      render();
      if (user && APP.trackEvent) APP.trackEvent('reader_open');
    } else if (built) { closePops(); closeDrop(); }
  }
  function labelModeSw() {
    // בטלפון אין מקום לתווית המלאה — .ls (קצרה) מוצגת במקום .lf
    document.querySelectorAll('#modeSw button').forEach(b => { b.innerHTML = b.dataset.mode === 'read' ? '<span class="lf">' + T('קריאה ומפרשים') + '</span><span class="ls">' + T('קריאה') + '</span>' : T('גימטריה'); });
    const sw = $r('#modeSw'); if (sw) sw.setAttribute('aria-label', T('מצב עבודה'));
  }

  function init() {
    const sw = $r('#modeSw');
    if (sw) sw.onclick = e => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode, true); };
    // הסיור המודרך מצביע על מסך הגימטריה — חוזרים אליו לפני שהסיור מתחיל
    ['#startTour', '#mmTour'].forEach(s => { const b = $r(s); if (b) b.addEventListener('click', () => { if (document.body.dataset.mode === 'read') setMode('gem', false, 'tour'); }, true); });
    const lb = $r('#langSw'); if (lb) lb.addEventListener('click', () => setTimeout(() => { labelModeSw(); rebuild(); }, 0));
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { PC.clear(); DC.clear(); TPC.clear(); TGC.clear(); render(); });
    document.addEventListener('keydown', e => {
      if (document.body.dataset.mode !== 'read' || !built || document.querySelector('dialog[open]')) return;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName), mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); closePops(); $r('#rdQ').focus(); $r('#rdQ').select(); return; }
      if (mod && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); openPopover('jump'); return; }
      if (mod && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); if (openPop !== 'print') openPopover('print'); return; }
      if (e.key === 'Escape' && openPop) { closePops(); return; }
      if (e.key === 'Escape' && $r('#rdSeg') && !$r('#rdSeg').hidden) { closeSeg(); return; }
      if (inField || mod || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); $r('#rdQ').focus(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageDown') { e.preventDefault(); turn(1); }
      else if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); turn(-1); }
    });
    labelModeSw();
    let start = 'gem';
    try { start = localStorage.getItem('gimatrivonMode') === 'read' ? 'read' : 'gem'; } catch (e) {}
    if (/^#read\b/.test(location.hash)) start = 'read';
    setMode(start);
  }
  init();
})();
