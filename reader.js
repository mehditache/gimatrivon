/* reader.js — מסך "קריאה ומפרשים" (v3.8.0): תנ״ך ומשנה כספר פתוח, תרגום בטור צד ומפרש בתחתית הדף.
   שני חלקים:
   (1) ליבה טהורה (אינדקס פרק/פסוק, ניתוח מראה-מקום, חיפוש) — נחשפת כ-window.GimReaderCore ונבדקת ב-tests/run-tests.js.
   (2) ממשק — רץ רק בדפדפן, אחרי app.js, ומשתמש ב-window.GimApp שהוא חושף (שפה, שמות ספרים, trackEvent).
   הטקסטים כולם מתוך window.CORPUS_BUNDLE הקיים: unit = [cat, book, chapter, verse, text, …], cat: 0 תנ״ך, 1 משנה,
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

  function buildIndex(BN) {
    const books = BN.books, data = books.map(() => null), byKey = {};
    books.forEach((b, i) => { byKey[b.cat + '|' + b.heTitle] = i; });
    for (const u of BN.units) {
      const cat = u[0]; if (cat === 6) continue;
      const d = data[u[1]] || (data[u[1]] = []), c = d[u[2]] || (d[u[2]] = []);
      if (cat === 2 || cat === 5 || cat >= 8) (c[u[3]] || (c[u[3]] = [])).push(u[4]);
      else c[u[3]] = c[u[3]] ? c[u[3]] + ' ' + u[4] : u[4];
    }
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
  const chaptersOf = (IX, b) => { const d = IX.data[b] || []; const r = []; d.forEach((c, i) => { if (c && i > 0) r.push(i); }); return r; };
  const versesOf = (IX, b, ch) => { const c = (IX.data[b] || [])[ch] || []; const r = []; c.forEach((t, i) => { if (t && i > 0) r.push(i); }); return r; };

  // "בראשית א ו", "שמות יב", "ברכות ב ג", "Exodus 12 2", "ו ג" (פרק ופסוק בספר הנוכחי — רק בשני מספרים)
  function parseRef(IX, q, cur) {
    const toks = IX.clean(noMarks(q)).split(' ').filter(Boolean); if (!toks.length) return null;
    let b = -1, k = 0;
    for (let n = Math.min(8, toks.length); n >= 1 && b < 0; n--) { const cand = toks.slice(0, n).join(' '), lc = IX.loose(cand), hit = IX.names.find(x => x.n === cand) || IX.names.find(x => x.l === lc); if (hit) { b = hit.i; k = n; } }
    const rest = toks.slice(k);
    if (b < 0) { if (cur == null || toks.length !== 2) return null; b = cur; }
    if (rest.length > 2) return null;
    const ch = rest.length ? parseNum(rest[0]) : 1, v = rest.length > 1 ? parseNum(rest[1]) : 0;
    const d = IX.data[b];
    if (!d || !(ch >= 1) || !d[ch] || Number.isNaN(v) || (v && !d[ch][v])) return null;
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


  const CORE = { noTeamim, noMarks, norm, toHeb, parseNum, buildIndex, chaptersOf, versesOf, parseRef, suggestBooks, search, markWords, splitComm, splitOne, splitCm, talIndex, parseDafRef, dafOf, amudOf, dafLabel };
  G.GimReaderCore = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof document === 'undefined' || !G.CORPUS_BUNDLE) return;

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
    'לא ניתן לטעון את המסכת.': 'Could not load the tractate.', 'בדף': 'Daf', 'במסכת': 'Tractate', 'אין פירוש על קטע זה': 'No commentary on this passage', 'הדף הנוכחי (שני העמודים)': 'The current daf (both sides)',
    'לחצו על קטע בגמרא כדי לראות את הפירוש שלו.': 'Click a passage of the Gemara to see its commentary.', 'הקטע שנבחר': 'Selected passage', 'הקטע הקודם': 'Previous passage', 'הקטע הבא': 'Next passage'
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

  let IX = null, built = false, R = null, geo = null, hlTimer = 0, fxDir = 0, fxLast = 0, fxTimer = 0;
  const PC = new Map(); // מטמון עימוד: ספר:פרק|גאומטריה → [[פסוקים בעמוד]]
  // tk = המסכת הפתוחה (ריק = תנ״ך/משנה), tj = העמוד בה, tview = צורת הדף (daf) או גמרא ומפרשים (study)
  const DEF = { b: 0, ch: 1, anchor: 1, view: 'book', tr: 'onkelos', trFont: 'rashi', cmFont: 'rashi', size: 0, scope: 'book', src: 'txt', prScope: 'spread', prColor: 'color', tk: '', tj: 0, tview: 'daf', tsrc: 'all', cmOff: [], ramNik: true };
  const S = Object.assign({}, DEF, (() => { try { return JSON.parse(localStorage.getItem('gimatrivonReader') || '{}'); } catch (e) { return {}; } })());
  S.p = 0; S.hl = ''; S.lock = null; S.tp = 0; S.sel = null;
  const save = () => { try { localStorage.setItem('gimatrivonReader', JSON.stringify({ b: S.b, ch: S.ch, anchor: S.anchor, view: S.view, tr: S.tr, trFont: S.trFont, cmFont: S.cmFont, size: S.size, scope: S.scope, src: S.src, prScope: S.prScope, prColor: S.prColor, tk: S.tk, tj: S.tj, tview: S.tview, tsrc: S.tsrc, cmOff: S.cmOff, ramNik: S.ramNik })); } catch (e) {} };

  let TX = null;
  const ensureIndex = () => {
    if (IX) return;
    TX = talIndex(G.GIM_TALMUD_INDEX);
    if (S.tk && TX.byK[S.tk] == null) S.tk = '';
    IX = buildIndex(G.CORPUS_BUNDLE);
    if (!IX.base.includes(S.b) || !(IX.data[S.b] || [])[S.ch]) { S.b = 0; S.ch = 1; S.anchor = 1; }
  };
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
  const wordsOf = (b, ch, v) => { const k = b + ':' + ch + ':' + v; if (!WC.has(k)) WC.set(k, noTeamim(chText(b, ch, v) || '').split(/\s+/).filter(Boolean)); return WC.get(k); };
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
      CMC.set(key, out);
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
    PC.set(key, pages); return pages;
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
    R.classList.toggle('isTal', isTal());
    if (isTal()) return renderTal();
    $r('#rdPrevCh').setAttribute('aria-label', T('פרק קודם')); $r('#rdNextCh').setAttribute('aria-label', T('פרק הבא')); $r('#rdPrevCh').title = T('פרק קודם'); $r('#rdNextCh').title = T('פרק הבא');
    R.querySelectorAll('#rdViewSeg button[data-view=book] .t').forEach(x => { x.textContent = T('ספר'); });
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
    R.querySelectorAll('#rdViewSeg button').forEach(x => { const on = x.dataset.view === S.view; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    $r('#rdViewSeg [data-view=aligned] .t').textContent = T(uName(S.b) + ' מול תרגום');
    if (fxDir) { reveal(book, fxDir); fxDir = 0; }
    save();
  }

  /* הופעה הדרגתית של הטקסט בדפדוף ובמעבר פרק (לא בפתיחה, בשינוי גודל או בהגדרות): כל גוש (כותרת, פסקת מקרא/משנה, התרגום,
     כל דיבור בפירוש) נכנס בדהייה עם הזזה קטנה מכיוון הדפדוף — קדימה מגיע משמאל. סדר קבוע בכל עמוד: מקרא, תרגום, פירוש.
     רק opacity ו-transform. הפחתת תנועה = דהייה קצרה של העמוד כולו בלי הזזה; דפדוף מהיר ברצף מדלג על האפקט. */
  const FX_START = [0, 220, 400], FX_STEP = 90, FX_DUR = 880;
  const FX_BLOCKS = '.rdChTitle,.rdTxt>p,.rdMsh,.rdTr,.rdRowHd,.rdRow,.rdCmHd,.rdCmBody>p,.rdDafIn';
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
        const z = el.closest('.rdCm') ? 2 : el.closest('.rdTr') ? 1 : 0;
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
    S.tk = ''; closeSeg();
    S.b = b; S.ch = ch; S.anchor = v || versesOf(IX, b, ch)[0] || 1;
    render(); if (v) flash(v);
  }
  function turn(dir) {
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
  function stepChapter(dir) { if (isTal()) return talStep(dir); const n = nextCh(S.b, S.ch, dir); if (n) { fxDir = dir; goTo(n.b, n.ch, 0); } }

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
  /* מסך טעינה: שלד של הדף שהשורות שלו "נכתבות", ושם הספר בכתב חלול שמתמלא בזהב (מימין לשמאל) לפי אחוזי הטעינה.
     loadingHtml בונה את הדפים; loadProg(k, 0..1) מעדכן את המילוי אם המסך של k עדיין מוצג. */
  const skLines = (n, c, from) => { let s = ''; for (let i = 0; i < n; i++) s += '<i class="rdSkLn' + c + '" style="--i:' + (from + i) + ';width:' + (i % 6 === 5 ? 58 : 100 - (i * 7 % 13)) + '%"></i>'; return s; };
  function loadingHtml(k, title, geo) {
    const pg = (side, first) => '<article class="rdPage rdSkel ' + side + geo.cls + '"' + (first ? '' : ' aria-hidden="true"') + '><div class="rdSkHead"><i></i><i></i><i></i></div>' +
      (first ? '<div class="rdLoadT" data-k="' + h(k) + '" style="--p:0" role="progressbar" aria-label="' + h(T('טוען') + ' ' + title) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="o">' + h(title) + '</span><span class="f" aria-hidden="true">' + h(title) + '</span></div><div class="rdLoadPct" aria-hidden="true">0%</div>' : '') +
      '<div class="rdSkTx">' + skLines(30, '', 0) + '</div><div class="rdSkCm">' + skLines(30, ' c', first ? 8 : 12) + '</div></article>';
    return geo.two ? pg('right', true) + pg('left', false) : pg('single', true);
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
    if (TD[k]) return done(true);
    if (TLOAD[k]) { TLOAD[k].push(done); return; }
    TLOAD[k] = [done];
    const t = TX.list[TX.byK[k]], TP = G.GIM_TP || (G.GIM_TP = {});
    const need = t.parts.map((p, i) => TP[k + '.' + i] ? 0 : (p.b || 1)), tot = need.reduce((a, b) => a + b, 0) || 1, got = need.map(() => 0);
    const report = () => loadProg(k, got.reduce((a, b) => a + b, 0) / tot);
    const t0 = Date.now(), tick = setInterval(() => { const sec = (Date.now() - t0) / 1000; need.forEach((n, i) => { if (got[i] < n) got[i] = Math.max(got[i], n * 0.9 * (1 - Math.exp(-sec / Math.max(0.6, n / 2e6)))); }); report(); }, 100);
    let left = t.parts.length, failed = false;
    const finish = () => {
      clearInterval(tick); loadProg(k, 1);
      if (!failed) { const all = []; t.parts.forEach((p, i) => { const d = TP[k + '.' + i]; d.a.forEach((row, r) => { all[d.from + r] = row; }); }); TD[k] = all; }
      const cbs = TLOAD[k]; delete TLOAD[k];
      const go = () => cbs.forEach(cb => cb(!failed));
      if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('16px GimFrank'), document.fonts.load('16px GimRashi')]).then(go, go); else go();
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
    const cap = 1 + S.size * 0.12;
    const run = s => {
      host.innerHTML = '<div style="position:relative"></div>'; const el = host.firstChild, fm = 16 * s, fs = 11.2 * s;
      const r = G.dafRenderer(el, { contentWidth: W + 'px', mainWidth: '50%', padding: { vertical: Math.round(9 * s) + 'px', horizontal: Math.round(16 * s) + 'px' }, innerPadding: '4px', outerPadding: '4px',
        fontFamily: { inner: 'GimRashi', outer: 'GimRashi', main: 'GimFrank' }, fontSize: { main: fm.toFixed(2) + 'px', side: fs.toFixed(2) + 'px' }, lineHeight: { main: (fm * 1.38).toFixed(2) + 'px', side: (fs * 1.36).toFixed(2) + 'px' } });
      r.render(main || ' ', cm(a[1], 'cR') || ' ', cm(a[2], 'cT') || ' ', j & 1 ? 'b' : 'a');
      return el.offsetHeight;
    };
    let lo = 0.45, hi = cap, out;
    if (run(hi) <= H) lo = hi;
    else for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (run(m) <= H) lo = m; else hi = m; }
    run(lo); out = freezeDaf(host.firstChild); host.innerHTML = '';
    DC.set(key, out); return out;
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
    PC.set(key, pages); return pages;
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
      R.querySelectorAll('#rdViewSeg button').forEach(x => { const v = x.dataset.view === 'book' ? 'daf' : 'study', on = v === S.tview; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); x.querySelector('.t').textContent = T(v === 'daf' ? 'צורת הדף' : 'גמרא ומפרשים'); });
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
    S.tk = k; S.tj = j || 0; S.tp = 0; closeSeg();
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
  function closeSeg() { const p = $r('#rdSeg'); if (p) p.hidden = true; S.sel = null; if (R) markSel(); }
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
  function printSheets() {
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
    else { J.b = S.b; J.ch = S.ch; J.v = 0; J.cat = isTal() ? 2 : IX.books[S.b].cat; J.tk = S.tk || (TX.list[0] || {}).k; J.tj = isTal() ? S.tj : 0; renderJump(); $r('#rdJump').hidden = false; $r('#rdWhere').setAttribute('aria-expanded', 'true'); const a = $r('#rdJump .rdJB.on'); if (a) a.scrollIntoView({ block: 'center' }); }
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
  function renderSet() {
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

  const J = { cat: 0, b: 0, ch: 1, v: 0, tk: '', tj: 0 };
  const jTabs = () => '<div class="rdJTabs" role="group">' + [0, 1, 7, 2].filter(c => c === 2 ? TX.list.length : IX.base.some(i => IX.books[i].cat === c)).map(c => '<button type="button" data-jcat="' + c + '" class="' + (J.cat === c ? 'on' : '') + '" aria-pressed="' + (J.cat === c) + '">' + T({ 0: 'תנ״ך', 1: 'משנה', 7: 'רמב״ם', 2: 'ש״ס' }[c]) + '</button>').join('') + '</div>';
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
  const refItemLabel = it => it.kind === 'tal' ? talRefLabel(it.k, it.j) : refLabel(it.r);
  function renderDropTal() {
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; return; }
    const tr = parseDafRef(TX, q), ref = parseRef(IX, q, null);
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
  function renderDrop() {
    if (isTal()) return renderDropTal();
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; return; }
    let html = '';
    const ref = parseRef(IX, q, S.b), tref = parseDafRef(TX, q);
    if (tref && tref.explicit) dropItems.push({ kind: 'tal', k: tref.k, j: tref.j });
    if (ref) dropItems.push({ kind: 'ref', r: ref });
    if (tref && !tref.explicit) dropItems.push({ kind: 'tal', k: tref.k, j: tref.j });
    if (!dropItems.length) suggestBooks(IX, q, 4).forEach(b => dropItems.push({ kind: 'ref', r: { b, ch: chaptersOf(IX, b)[0], v: 0 } }));
    if (dropItems.length) html += '<div class="rdDRefs"><div class="rdDH">' + T('מעבר אל') + '</div>' + dropItems.map((it, i) => '<button type="button" class="rdDI ref" data-i="' + i + '" role="option">' + ICON.book + '<span>' + h(refItemLabel(it)) + '</span></button>').join('') + '</div>';
    const scopes = [['ch', 'בפרק'], ['book', 'בספר'], ['all', isRambam(S.b) ? 'בכל הרמב״ם' : isMishnah(S.b) ? 'בכל המשנה' : 'בכל התנ״ך']];
    const res = searchSrc(q, scopeBooks(), S.scope === 'ch' ? S.ch : 0);
    const srcs = [['txt', isRambam(S.b) ? 'הלכות' : isMishnah(S.b) ? 'משניות' : 'פסוקים'], ['cm', isRambam(S.b) ? 'מפרשים' : isMishnah(S.b) ? 'ברטנורא' : 'רש״י']].concat(isMishnah(S.b) ? [] : [['tr', 'תרגום']], [['all', 'הכל']]);
    html += '<div class="rdDScope" role="group">' + scopes.map(([k, l]) => '<button type="button" data-scope="' + k + '" class="' + (S.scope === k ? 'on' : '') + '" aria-pressed="' + (S.scope === k) + '">' + T(l) + '</button>').join('') + '<span class="sep" aria-hidden="true"></span><span class="rdSrc" role="group" aria-label="' + T('חיפוש ב') + '">' + srcs.map(([k, l]) => '<button type="button" data-src="' + k + '" class="' + (S.src === k ? 'on' : '') + '" aria-pressed="' + (S.src === k) + '">' + T(l) + '</button>').join('') + '</span><span class="cnt">' + (res.q.length < 2 ? '' : res.total ? resN(res.total) : T('אין תוצאות')) + '</span></div>';
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
    if (it.kind === 'tal') return goTal(it.k, it.j);
    if (it.kind === 'thit') { segTab = it.x.src === 't' ? 't' : 'r'; return goTal(S.tk, it.x.j, it.x.s); }
    goTo(it.r.b, it.r.ch, it.r.v);
  }
  function updClear() { $r('#rdQClr').hidden = !$r('#rdQ').value; }

  /* ---------- בנייה ---------- */
  function build() {
    ensureIndex();
    R = $r('#reader');
    R.innerHTML =
      '<div class="rdBar">' +
        '<div class="rdNav"><button type="button" class="rdIco" id="rdPrevCh" aria-label="' + T('פרק קודם') + '" title="' + T('פרק קודם') + '">' + ICON.chevR + '</button>' +
        '<button type="button" class="rdWhere" id="rdWhere" aria-haspopup="dialog" aria-expanded="false" title="' + T('מעבר לפרק ופסוק') + ' (Ctrl G)">' + ICON.book + '<span id="rdWhereTxt"></span>' + ICON.caret + '</button>' +
        '<button type="button" class="rdIco" id="rdNextCh" aria-label="' + T('פרק הבא') + '" title="' + T('פרק הבא') + '">' + ICON.chevL + '</button></div>' +
        '<div class="rdSearch" id="rdSearch">' + ICON.search + '<input type="search" id="rdQ" dir="' + (isEn() ? 'auto' : 'rtl') + '" autocomplete="off" spellcheck="false" placeholder="' + T('חיפוש, או קפיצה: ״שמות יב ב״') + '" aria-label="' + T('חיפוש מהיר או קפיצה למקום') + '" role="combobox" aria-controls="rdDrop" aria-expanded="false">' +
        '<button type="button" class="rdIco sm" id="rdQClr" aria-label="' + T('ניקוי חיפוש') + '" hidden>' + ICON.x + '</button><kbd>Ctrl K</kbd><div class="rdDrop" id="rdDrop" role="listbox" hidden></div></div>' +
        '<div class="rdSeg" id="rdViewSeg" role="group" aria-label="' + T('סוג תצוגה') + '"><button type="button" data-view="book">' + ICON.vBook + '<span class="t">' + T('ספר') + '</span></button><button type="button" data-view="aligned">' + ICON.vRows + '<span class="t"></span></button></div>' +
        '<button type="button" class="rdSetBtn" id="rdSetBtn" aria-haspopup="dialog" aria-expanded="false"><span class="aa">אָ</span><span class="t">' + T('תצוגה') + '</span></button>' +
        '<button type="button" class="rdIco rdPrintBtn" id="rdPrintBtn" aria-haspopup="dialog" aria-expanded="false" aria-label="' + T('הדפסה / PDF') + '" title="' + T('הדפסה / PDF') + ' (Ctrl P)">' + ICON.print + '</button>' +
      '</div>' +
      '<div class="rdDesk" id="rdDesk"><button type="button" class="rdTurn prev" id="rdPrev" aria-label="' + T('עמוד קודם') + '">' + ICON.chevR + '</button><div class="rdBook" id="rdBook"></div>' +
        '<button type="button" class="rdTurn next" id="rdNext" aria-label="' + T('עמוד הבא') + '">' + ICON.chevL + '</button><div class="rdMeasure" aria-hidden="true"><article class="rdPage" id="rdProbe"></article><div id="rdDafHost"></div></div></div>' +
      '<div class="rdFoot"><button type="button" class="rdIco" id="rdPrev2" aria-label="' + T('עמוד קודם') + '">' + ICON.chevR + '</button><span id="rdPos"></span><span class="rdProg"><span id="rdProgBar"></span></span><span id="rdChPos"></span><button type="button" class="rdIco" id="rdNext2" aria-label="' + T('עמוד הבא') + '">' + ICON.chevL + '</button></div>' +
      '<div class="rdScrim" id="rdScrim" hidden></div><div class="rdPop rdSet" id="rdSet" role="dialog" aria-label="' + T('הגדרות תצוגה') + '" hidden></div><div class="rdPop rdJump" id="rdJump" role="dialog" aria-label="' + T('מעבר לפרק ופסוק') + '" hidden></div><div class="rdPop rdPrintPop" id="rdPrintPop" role="dialog" aria-label="' + T('הדפסה / PDF') + '" hidden></div><div class="rdPop rdSegPop" id="rdSeg" role="dialog" aria-label="' + T('קטע ופירושיו') + '" hidden></div>';
    built = true;
    // ש״ס: לחיצה על קטע גמרא או על פירוש פותחת את חלון הקטע
    $r('#rdBook').addEventListener('click', e => { const x = isTal() && e.target.closest('[data-j][data-s]'); if (!x) return; const j = Number(x.dataset.j), s = Number(x.dataset.s); if (S.sel && S.sel.j === j && S.sel.s === s && !$r('#rdSeg').hidden) return closeSeg(); if (x.classList.contains('cT')) segTab = 't'; else if (x.classList.contains('cR')) segTab = 'r'; openSeg(j, s); });
    $r('#rdSeg').onclick = e => {
      if (e.target.closest('[data-close]')) return closeSeg();
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
    R.querySelectorAll('#rdViewSeg button').forEach(x => { x.onclick = () => { if (isTal()) { S.tview = x.dataset.view === 'book' ? 'daf' : 'study'; S.tp = 0; } else S.view = x.dataset.view; render(); }; });
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
      if (t.dataset.jcat != null) { J.cat = Number(t.dataset.jcat); if (J.cat === 2) { J.tk = S.tk || TX.list[0].k; J.tj = isTal() ? S.tj : 0; } else { J.b = IX.base.find(i => IX.books[i].cat === J.cat); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; } }
      else if (t.dataset.jtk != null) { J.tk = t.dataset.jtk; J.tj = 0; }
      else if (t.dataset.jd != null) { J.tj = Number(t.dataset.jd); }
      else if (t.dataset.jside != null) { J.tj = (J.tj & ~1) + Number(t.dataset.jside); closePops(); return goTal(J.tk, J.tj); }
      else if (t.dataset.jb != null) { J.b = Number(t.dataset.jb); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; }
      else if (t.dataset.jch != null) { J.ch = Number(t.dataset.jch); J.v = 0; }
      else if (t.dataset.jv != null) { J.v = Number(t.dataset.jv); closePops(); return goTo(J.b, J.ch, J.v); }
      else if (t.dataset.jgo != null) { closePops(); return J.cat === 2 ? goTal(J.tk, J.tj) : goTo(J.b, J.ch, J.v); }
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
    desk.addEventListener('touchstart', e => { if (e.touches.length === 1) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } }, { passive: true });
    desk.addEventListener('touchend', e => {
      if (tx == null) return; const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; tx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) turn(dx > 0 ? 1 : -1);
    }, { passive: true });
  }

  function rebuild() { if (!built) return; const qv = $r('#rdQ') ? $r('#rdQ').value : ''; built = false; PC.clear(); CMC.clear(); WC.clear(); DC.clear(); build(); $r('#rdQ').value = qv; updClear(); render(); }

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
    } else { closePops(); closeDrop(); }
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
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { PC.clear(); DC.clear(); render(); });
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
