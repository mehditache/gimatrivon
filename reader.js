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
  /* ---- ראשי תיבות וקיצורים מקובלים לשמות הספרים (v3.21.0) ----
     בצורה המנוקה, בלי גרשיים: ש״א = "שא", מו״ק = "מוק". נרשמים אחרי השמות המלאים, כך ששם מלא תמיד קודם.
     מסכתות: משותף למשנה ולבבלי. רמב״ם: נרשם רק אחרי "הלכות" / "רמבם" ("הל׳ ת״ת", "רמב״ם יסוה״ת"), כי לבד הם שייכים למשנה. */
  const TANAKH_ABBR = { 'שמואל א': ['שא', 'שמוא', 'שמא'], 'שמואל ב': ['שב', 'שמוב', 'שמב'], 'מלכים א': ['מא', 'מלא', 'מלכא'], 'מלכים ב': ['מב', 'מלב', 'מלכב'],
    'דברי הימים א': ['דהא', 'דהי א', 'דה א'], 'דברי הימים ב': ['דהב', 'דהי ב', 'דה ב'], 'שיר השירים': ['שהש', 'שיר'], 'תהילים': ['תילים'], 'קהלת': ['קוהלת'] };
  const TRACT_ABBR = { 'בבא קמא': ['בק'], 'בבא מציעא': ['במ'], 'בבא בתרא': ['בב'], 'עבודה זרה': ['עז', 'עבז'], 'ראש השנה': ['רה'], 'מועד קטן': ['מוק'],
    'מעשר שני': ['מעש', 'מש'], 'ביצה': ['יוט', 'יום טוב'], 'טבול יום': ['טי', 'טבי'], 'פרקי אבות': ['פרקי אבות'], 'קידושין': ['קדושין'], 'עירובין': ['ערובין'] };
  const RAMBAM_ABBR = { 'הלכות יסודי התורה': ['יסוהת', 'יסודי'], 'הלכות תלמוד תורה': ['תת'], 'הלכות עבודה זרה וחוקות הגויים': ['עז', 'עבז', 'עכום'],
    'הלכות קריאת שמע': ['קש', 'קריש'], 'הלכות תפילין ומזוזה וספר תורה': ['סת'], 'הלכות שביתת יום טוב': ['יוט', 'יום טוב'], 'הלכות שביתת עשור': ['יום הכפורים', 'יוהכ'],
    'הלכות חמץ ומצה': ['חומ', 'חמץ'], 'הלכות קידוש החודש': ['קהח', 'קידוהח', 'קידוה'], 'הלכות איסורי ביאה': ['אסוב', 'איסוב', 'איסורי ביאה'], 'הלכות מאכלות אסורות': ['מאכא', 'מאכלות'],
    'הלכות מתנות עניים': ['מתע', 'מתנע'], 'הלכות מעשר שני ונטע רבעי': ['מעש', 'מש'], 'הלכות שמיטה ויובל': ['שוי', 'שמוי'], 'הלכות בית הבחירה': ['בהב', 'ביהב'],
    'הלכות כלי המקדש והעובדין בו': ['כלהמ', 'כלי המקדש'], 'הלכות איסורי המזבח': ['אסוהמ', 'איסוהמ'], 'הלכות מעשה הקרבנות': ['מעהק', 'מעשה הקרבנות'], 'הלכות תמידים ומוספין': ['תומ'],
    'הלכות פסולי המוקדשין': ['פסוהמ', 'פסולהמ'], 'הלכות עבודת יום הכפורים': ['עיוהכ', 'עבודת יוהכ'], 'הלכות קרבן פסח': ['קפ', 'קרפ'], 'הלכות מחוסרי כפרה': ['מחוכ'],
    'הלכות טומאת מת': ['טומ'], 'הלכות פרה אדומה': ['פא', 'פרה'], 'הלכות טומאת צרעת': ['טוצ', 'צרעת'], 'הלכות מטמאי משכב ומושב': ['מטמומ', 'מומ'], 'הלכות שאר אבות הטומאות': ['שאהט', 'אבות הטומאות'],
    'הלכות טומאת אוכלים': ['טוא'], 'הלכות נזקי ממון': ['נזמ', 'נזקמ'], 'הלכות גזילה ואבידה': ['גזוא'], 'הלכות רוצח ושמירת נפש': ['רוש', 'רושנ'], 'הלכות זכייה ומתנה': ['זומ'],
    'הלכות שלוחין ושותפין': ['שוש'], 'הלכות שאלה ופיקדון': ['שופ'], 'הלכות מלווה ולווה': ['מלול', 'מולו'], 'הלכות טוען ונטען': ['טונ'], 'הלכות נערה בתולה': ['נעב'], 'הלכות יבום וחליצה': ['יוח'] };
  /* מילים בשאילתה: toks מנוקות; ab = נגמרה בגרש (קיצור: "בר׳" = תחילת "בראשית"); mk = "פ״ב" / "ה״ג" / "מ״א" (פרק / הלכה / משנה + מספר).
     prep: "ספר" / "מסכת" / "מס׳" בראש יורדים, "הל׳" = הלכות, "משנה תורה" / "יד החזקה" = רמבם. */
  function qToks(clean, q) {
    const toks = [], ab = [], mk = [];
    noMarks(String(q)).replace(/־/g, ' ').trim().split(/\s+/).forEach(r => {
      const m = /^[פהמ]["״][א-ת]{1,3}$/.test(r) ? r.slice(2) : null, a = /[א-ת][׳'`]$/.test(r);
      const cs = clean(r.replace(/([א-ת])["״]([א-ת])/g, '$1$2')).split(' ').filter(Boolean); // ש״א = שא, ס״ב = סב
      cs.forEach((c, i) => { toks.push(c); ab.push(a && i === cs.length - 1); mk.push(m && cs.length === 1 ? m : null); });
    });
    const cut = (i, n, w) => { toks.splice(i, n, ...(w ? [w] : [])); ab.splice(i, n, ...(w ? [false] : [])); mk.splice(i, n, ...(w ? [null] : [])); };
    while (toks.length > 1 && /^(ספר|מסכת|מס)$/.test(toks[0])) cut(0, 1);
    if (/^(משנה תורה|יד החזקה)$/.test(toks.slice(0, 2).join(' '))) cut(0, 2, 'רמבם');
    for (let i = 0; i < 2 && i < toks.length; i++) if (/^(הל|הלכ)$/.test(toks[i]) && i + 1 < toks.length) { toks[i] = 'הלכות'; ab[i] = false; }
    return { toks, ab, mk };
  }
  // שם ספר בראש השאילתה, הכי הרבה מילים קודם. מילה עם גרש מתאימה לתחילת המילה בשם; אחרת — מילה שלמה (גם בכתיב חסר/מלא)
  function findName(names, loose, toks, ab, max) {
    const wEq = (p, t, a) => p === t || (t.length > 2 && loose(p) === loose(t)) || (a && t.length > 1 && (p.startsWith(t) || (loose(t).length > 1 && loose(p).startsWith(loose(t)))));
    for (let n = Math.min(max, toks.length); n >= 1; n--) {
      const w = toks.slice(0, n), c = w.join(' '), lc = loose(c);
      const hit = ab.slice(0, n).some(Boolean) ? names.find(x => { const p = x.n.split(' '); return p.length === n && w.every((t, j) => wEq(p[j], t, ab[j])); })
        : names.find(x => x.n === c) || (c.length > 2 && lc.length > 1 && names.find(x => x.l === lc));
      if (hit) return { i: hit.i, k: n };
    }
    return null;
  }
  // מילים בשם המקום ("פרק", "סימן"…) שאינן חלק מהמספר
  const FILL = /^(פרק|פסוק|הלכה|משנה|סימן|סי|chapter|verse|halacha|halakhah|siman)$/;
  const looseOf = s => s.replace(/[יו]/g, '').replace(/[םן](?=\s|$)/g, 'ם');
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
    const loose = looseOf;
    const clean = s => String(s).toLowerCase().replace(/[׳״'"`.,:;()[\]]/g, ' ').replace(/[־-]/g, ' ').replace(/\s+/g, ' ').trim();
    const names = [];
    base.forEach(i => {
      const b = books[i], add = n => { n = clean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: loose(n) }); };
      add(b.heTitle); add(b.heTitle.replace(/^משנה /, '').replace(/^פרקי /, '')); add(b.title); add(b.title.replace(/^Mishnah /, ''));
      // רמב״ם: "הלכות שבת", "רמבם שבת", "Mishneh Torah, Sabbath", "Sabbath". "שבת" לבד נשאר למשנה (נרשמה קודם)
      if (b.cat === 7) { const s = b.heTitle.replace(/^הלכות /, ''); add('רמבם ' + b.heTitle); add('רמבם ' + s); add(s); add(b.title.replace(/^Mishneh Torah, /, '')); }
    });
    // ראשי תיבות וקיצורים, אחרי כל השמות המלאים. ברמב״ם גם כל חלק בשם ("הלכות סוכה" = הלכות שופר וסוכה ולולב)
    base.forEach(i => { // לקיצור אין כתיב חסר/מלא (l ריק), אחרת "יבמ" היה נקרא כמו "ב״מ"
      const b = books[i], add = n => { n = clean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: '' }); };
      if (b.cat === 0) (TANAKH_ABBR[b.heTitle] || []).forEach(add);
      if (b.cat === 1) (TRACT_ABBR[b.heTitle.replace(/^משנה /, '')] || TRACT_ABBR[b.heTitle] || []).forEach(a => { add(a); add('משנה ' + a); });
      if (b.cat === 7) {
        const parts = b.heTitle.replace(/^הלכות /, '').split(/ ו(?=[א-ת])/).filter(p => p.length > 1);
        (RAMBAM_ABBR[b.heTitle] || []).concat(parts.length > 1 ? parts : []).forEach(a => { add('הלכות ' + a); add('רמבם ' + a); add('רמבם הלכות ' + a); });
      }
    });
    // owner[b] = הספר שבו b מוצג במסך הקריאה: ספר בסיס לעצמו, ומפרש או תרגום לספר שעליו הם (למעבר מתוצאת גימטריה)
    const owner = books.map(() => null);
    base.forEach(i => { const L = links[i]; owner[i] = i; [L.onkelos, L.yonatan].concat(L.cms.map(x => x.b)).forEach(x => { if (x != null) owner[x] = i; }); });
    return { books, data, base, links, owner, names, clean, loose, ncache: new Map() };
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
    const { toks, ab, mk } = qToks(IX.clean, q); if (!toks.length) return null;
    const f = findName(IX.names, IX.loose, toks, ab, 12);
    let b = f ? f.i : -1; const k = f ? f.k : 0;
    if (b < 0) { if (cur == null || toks.length !== 2) return null; b = cur; }
    const keep = toks.map((t, j) => j >= k && !(k > 0 && FILL.test(t))), rest = toks.filter((_, j) => keep[j]), rmk = mk.filter((_, j) => keep[j]);
    if (rest.length > 2) return null;
    // "פ״ב ה״ג" = פרק ב הלכה ג; "תהלים פ״ב" = מזמור פב — קודם כמספר, ואם אין כזה מקום, כסימון פרק/הלכה
    const at = useMk => {
      const n = rest.map((t, j) => parseNum(useMk && rmk[j] ? rmk[j] : t)), ch = n.length ? n[0] : 1, v = n.length > 1 ? n[1] : 0;
      return ch >= 1 && !Number.isNaN(v) && hasRef(IX, b, ch, v) ? { b, ch, v, book: k > 0 } : null;
    };
    const allMk = rest.length === 2 && rmk.every(Boolean);
    return allMk ? at(true) || at(false) : at(false) || (rmk.some(Boolean) ? at(true) : null);
  }
  function suggestBooks(IX, q, max) {
    const c = IX.clean(noMarks(q)); if (c.length < 2) return [];
    const out = []; const lc = IX.loose(c); IX.names.forEach(x => { if ((x.n.startsWith(c) || x.l.startsWith(lc)) && !out.includes(x.i)) out.push(x.i); });
    return out.slice(0, max || 5);
  }
  /* הצעות תוך כדי הקלדה (v3.21.0): ספרים (תנ״ך, משנה, רמב״ם), מסכתות בבלי (TX) וטורים (RX) שהשם, הכינוי או ראשי
     התיבות שלהם מתחילים במה שהוקלד, מילה מול מילה ("בבא מ" → בבא מציעא, "הל׳ שב" → הלכות שבת). קודם התאמה מלאה.
     → [{kind: 'ref', b} | {kind: 'tal', i} | {kind: 'tur', i}] */
  function suggestPlaces(IX, TX, RX, q, max) {
    let { toks } = qToks(IX.clean, q);
    const turOnly = /^(טור|tur)$/.test(toks[0] || ''); // "טור" / "טור או" — רק הטורים
    if (turOnly) { toks = toks.slice(1); if (!toks.length) return RX ? RX.list.map((_, i) => ({ kind: 'tur', i })) : []; }
    if (!toks.length || toks.join(' ').length < 2) return [];
    const c = toks.join(' '), lc = looseOf(c), out = [], seen = new Set();
    const score = x => { if (x.n === c || (c.length > 2 && lc.length > 1 && x.l === lc)) return 0; const p = x.n.split(' ');
      return p.length >= toks.length && toks.every((t, j) => j === toks.length - 1 ? p[j].startsWith(t) : p[j] === t) ? 1 : lc.length > 2 && x.l.startsWith(lc) ? 2 : -1; };
    const pool = [];
    if (!turOnly) IX.names.forEach((x, o) => pool.push({ kind: 'ref', i: x.i, s: score(x), o }));
    if (TX && !turOnly) TX.names.forEach((x, o) => pool.push({ kind: 'tal', i: x.i, s: score(x), o: 1e4 + o }));
    if (RX) RX.names.forEach((x, o) => pool.push({ kind: 'tur', i: x.i, s: score(x.l ? x : { n: x.n, l: looseOf(x.n) }), o: 2e4 + o }));
    const best = Math.min(...pool.map(x => x.s < 0 ? 9 : x.s)); // כתיב חסר/מלא — רק כשאין התאמה ישירה
    pool.filter(x => x.s >= 0 && (x.s < 2 || best === 2)).sort((a, b) => a.s - b.s || a.o - b.o).forEach(x => { const key = x.kind + x.i; if (!seen.has(key)) { seen.add(key); out.push(x.kind === 'ref' ? { kind: 'ref', b: x.i } : { kind: x.kind, i: x.i }); } });
    return out.slice(0, max || 6);
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
     amud j = דף (j>>1)+2, עמוד א (j זוגי) או ב. ספר הזוהר (generated/zohar/index.js, scripts/build-zohar.py) באותו מבנה:
     כל פרשה היא "מסכת" עם z:1, והדף הראשון שלה d0 (עמוד וילנא: j = 0 הוא עמוד א של דף d0); בגמרא d0 = 2. */
  const dafOf = (j, d0) => ({ d: (j >> 1) + (d0 == null ? 2 : d0), side: j & 1 });
  const amudOf = (d, side, d0) => (d - (d0 == null ? 2 : d0)) * 2 + (side ? 1 : 0);
  function talIndex(list) {
    const names = [], clean = s => String(s).toLowerCase().replace(/[׳״'"`.,:;()[\]]/g, ' ').replace(/[־-]/g, ' ').replace(/\s+/g, ' ').trim();
    const loose = s => s.replace(/[יו]/g, '').replace(/[םן](?=\s|$)/g, 'ם');
    // זוהר: "זוהר בראשית", "זהר נח", "Zohar Bereshit" (בלי "זוהר" שם פרשה לבדו שייך לתנ״ך)
    (list || []).forEach((t, i) => (t.z ? ['זוהר ' + t.he, 'זהר ' + t.he, 'zohar ' + t.en] : [t.he, t.k]).forEach(n => { n = clean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: loose(n) }); }));
    (list || []).forEach((t, i) => (TRACT_ABBR[t.he] || []).forEach(n => { n = clean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: '' }); }));
    return { list: list || [], names, clean, loose, byK: Object.fromEntries((list || []).map((t, i) => [t.k, i])) };
  }
  // "ברכות ב.", "ברכות ב:", "ברכות דף ב ע״ב", "שבת קכ ב", "Berakhot 2b". explicit = יש סימן שזו גמרא (דף, נקודה/נקודתיים, ע״א, 2b)
  // ולא משנה ("ברכות ב ג" = משנה ברכות פרק ב משנה ג, כשאין סימן כזה ויש שני מספרים)
  function parseDafRef(TX, q) {
    let raw = noMarks(String(q)).trim(); if (!raw) return null;
    const explicit = /[.:]\s*$|ע["״׳']\s?[אב]|(^|\s)(מסכת|דף|גמרא|בבלי|ש["״]ס|daf|talmud|bavli|tractate)(\s|$)|\d+\s*[ab]\b/i.test(raw);
    raw = raw.replace(/ע["״׳']\s?א/g, ' @a ').replace(/ע["״׳']\s?ב/g, ' @b ').replace(/(\d+)\s*([ab])\b/gi, (m, n, s) => n + ' @' + s.toLowerCase())
      .replace(/([א-ת])["״]([א-ת])/g, '$1$2').replace(/([א-ת\d])\s*\.\s*$/, '$1 @a').replace(/([א-ת\d])\s*:\s*$/, '$1 @b').replace(/ש["״]ס/g, ' ');
    // מילה שנגמרת בגרש = קיצור ("סנה׳") — מסומנת ב-\u0001 עד אחרי הניקוי
    raw = raw.replace(/([א-ת])[׳'`](?=\s|$)/g, '$1\u0001');
    const all = TX.clean(raw).split(' ').filter(t => t && !/^(מסכת|מס\u0001?|גמרא|בבלי|דף|עמוד|talmud|bavli|daf|amud|tractate)$/.test(t));
    if (!all.length) return null;
    const ab = all.map(t => t.endsWith('\u0001')), toks = all.map(t => t.replace(/\u0001/g, ''));
    const f = findName(TX.names, TX.loose, toks, ab, 3);
    if (!f) return null;
    const ti = f.i, k = f.k, rest = toks.slice(k), t = TX.list[ti];
    if (rest.length > 2) return null;
    const d0 = t.z ? t.d0 : 2, d = rest.length ? parseNum(rest[0]) : d0 + (t.z ? t.j0 >> 1 : 0);
    const sd = rest.length > 1 ? ({ '@a': 0, '@b': 1, 'א': 0, 'ב': 1, a: 0, b: 1 })[rest[1]] : 0;
    if (!(d >= d0) || sd == null) return null;
    const j = rest.length ? amudOf(d, sd, d0) : t.z ? t.j0 : 0;
    if (j < 0 || j >= t.n) return null;
    return { i: ti, k: t.k, j, explicit: explicit || !!t.z };
  }
  const dafLabel = (j, en, d0) => { const x = dafOf(j, d0); return en ? x.d + (x.side ? 'b' : 'a') : toHeb(x.d) + (x.side ? ':' : '.'); };

  /* ---- טור, בית יוסף וב״ח: generated/tur/index.js (ארבעה טורים) + חלקים שנטענים לפי דרישה (scripts/build-tur.py) ----
     בטקסט: \u0003…\u0004 מודגש, \u0005…\u0006 בדק הבית, \n שורה חדשה, \u0010y3\u0011 / \u0010c3\u0011 = כאן מתחיל דיבור 3 (מ-0)
     של בית יוסף / ב״ח. */
  const TUR_ALIAS = { OC: ['אורח חיים', 'אוח', 'אח', 'orach chayim', 'orach chaim', 'oc'], YD: ['יורה דעה', 'יוד', 'yoreh deah', 'yd'], EH: ['אבן העזר', 'אהע', 'אבהע', 'אהעז', 'אבהעז', 'even haezer', 'eh'], CM: ['חושן משפט', 'חומ', 'חום', 'חמ', 'choshen mishpat', 'cm'] };
  const turClean = s => noMarks(String(s)).toLowerCase().replace(/[״"׳'`]/g, '').replace(/[.,:;()[\]־-]/g, ' ').replace(/\s+/g, ' ').trim();
  function turIndex(list) {
    const names = [];
    (list || []).forEach((t, i) => (TUR_ALIAS[t.k] || []).concat(t.he, t.en || '').forEach(n => { n = turClean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: looseOf(n) }); }));
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

  /* קישור ישיר למסך הקריאה (v3.30.0): #read/<אוסף>/<ספר>/<פרק>/<סעיף>, בראשי תיבות באנגלית:
     #read/TN/Gen/1/5 (תנ״ך), #read/MS/Ber/2/3 (משנה), #read/MT/HD/7/4 (רמב״ם), #read/TB/Ber/2b/3 (גמרא: דף, ואם יש — קטע,
     שחלון הפירוש שלו נפתח), #read/TUR/OC/60 (טור; /BY/3 או /BH/3 = דיבור בבית יוסף / ב״ח, שנפתח בחלון),
     #read/ZH/Bereshit/15a/3 (זוהר: פרשה, דף ועמוד בדפוס וילנא, ואם יש — פסקה, שחלון הפירוש שלה נפתח).
     פסוק / הלכה / משנה בכתובת מודגשים בפתיחה. כתובות ישנות עדיין נקראות כמו שורת הקפיצה (עם / או _ במקום רווח):
     #read/Genesis/1/5, #read/Mishneh_Torah_Human_Dispositions/7/4, #read/Berakhot/2b, #read/OC/60, #read/בראשית/א/ה. */
  const bookSlug = t => String(t).replace(/,/g, '').trim().replace(/\s+/g, '_');
  const URL_COL = { 0: 'TN', 1: 'MS', 7: 'MT' };
  const TN_AB = { Genesis: 'Gen', Exodus: 'Exod', Leviticus: 'Lev', Numbers: 'Num', Deuteronomy: 'Deut', Joshua: 'Josh', Judges: 'Judg', 'I Samuel': '1Sam', 'II Samuel': '2Sam',
    'I Kings': '1Kgs', 'II Kings': '2Kgs', Isaiah: 'Isa', Jeremiah: 'Jer', Ezekiel: 'Ezek', Hosea: 'Hos', Joel: 'Joel', Amos: 'Amos', Obadiah: 'Obad', Jonah: 'Jonah', Micah: 'Mic',
    Nahum: 'Nah', Habakkuk: 'Hab', Zephaniah: 'Zeph', Haggai: 'Hag', Zechariah: 'Zech', Malachi: 'Mal', Psalms: 'Ps', Proverbs: 'Prov', Job: 'Job', 'Song of Songs': 'Song',
    Ruth: 'Ruth', Lamentations: 'Lam', Ecclesiastes: 'Eccl', Esther: 'Esth', Daniel: 'Dan', Ezra: 'Ezra', Nehemiah: 'Neh', 'I Chronicles': '1Chr', 'II Chronicles': '2Chr' };
  // מסכתות: משותף למשנה (MS) ולבבלי (TB); המפתח = השם האנגלי בלי "Mishnah " ובלי גרש
  const TRACT_URL = { Berakhot: 'Ber', Peah: 'Peah', Demai: 'Dem', Kilayim: 'Kil', Sheviit: 'Shvi', Terumot: 'Ter', Maasrot: 'Maas', 'Maaser Sheni': 'MSh', Challah: 'Chal', Orlah: 'Orl',
    Bikkurim: 'Bik', Shabbat: 'Shab', Eruvin: 'Eruv', Pesachim: 'Pes', Shekalim: 'Shek', Yoma: 'Yoma', Sukkah: 'Suk', Beitzah: 'Beitz', 'Rosh Hashanah': 'RH', Taanit: 'Taan',
    Megillah: 'Meg', 'Moed Katan': 'MK', Chagigah: 'Chag', Yevamot: 'Yev', Ketubot: 'Ket', Nedarim: 'Ned', Nazir: 'Naz', Sotah: 'Sot', Gittin: 'Git', Kiddushin: 'Kid',
    'Bava Kamma': 'BK', 'Bava Metzia': 'BM', 'Bava Batra': 'BB', Sanhedrin: 'Sanh', Makkot: 'Mak', Shevuot: 'Shvu', Eduyot: 'Ed', 'Avodah Zarah': 'AZ', 'Pirkei Avot': 'Avot',
    Horayot: 'Hor', Zevachim: 'Zev', Menachot: 'Men', Chullin: 'Chul', Bekhorot: 'Bekh', Arakhin: 'Arak', Temurah: 'Tem', Keritot: 'Ker', Meilah: 'Meil', Tamid: 'Tam',
    Middot: 'Mid', Kinnim: 'Kin', Kelim: 'Kel', Oholot: 'Ohol', Negaim: 'Neg', Parah: 'Par', Tahorot: 'Tah', Mikvaot: 'Mik', Niddah: 'Nid', Makhshirin: 'Makh', Zavim: 'Zav',
    'Tevul Yom': 'TY', Yadayim: 'Yad', Oktzin: 'Okt' };
  // רמב״ם: ראשי התיבות של השם האנגלי (Human Dispositions → HD); שם של מילה אחת — שלוש אותיות ראשונות
  const MT_AB = { 'Foundations of the Torah': 'FT', 'Human Dispositions': 'HD', 'Torah Study': 'TS', 'Foreign Worship and Customs of the Nations': 'FW', Repentance: 'Rep',
    'Reading the Shema': 'RS', 'Prayer and the Priestly Blessing': 'PPB', 'Tefillin, Mezuzah and the Torah Scroll': 'TMT', Fringes: 'Fri', Blessings: 'Ble', Circumcision: 'Cir',
    'The Order of Prayer': 'OP', Sabbath: 'Sab', Eruvin: 'Eru', 'Rest on the Tenth of Tishrei': 'RTT', 'Rest on a Holiday': 'RHo', 'Leavened and Unleavened Bread': 'LUB',
    'Shofar, Sukkah and Lulav': 'SSL', 'Sheqel Dues': 'SDu', 'Sanctification of the New Month': 'SNM', Fasts: 'Fas', 'Scroll of Esther and Hanukkah': 'SEH', Marriage: 'Mar',
    Divorce: 'Div', 'Levirate Marriage and Release': 'LMR', 'Virgin Maiden': 'VM', 'Woman Suspected of Infidelity': 'WSI', 'Forbidden Intercourse': 'FI', 'Forbidden Foods': 'FF',
    'Ritual Slaughter': 'RSl', Oaths: 'Oat', Vows: 'Vow', Nazariteship: 'Naz', 'Appraisals and Devoted Property': 'ADP', 'Diverse Species': 'DS', 'Gifts to the Poor': 'GP',
    'Heave Offerings': 'HO', Tithes: 'Tit', "Second Tithes and Fourth Year's Fruit": 'STF', 'First Fruits and other Gifts to Priests Outside the Sanctuary': 'FFG',
    'Sabbatical Year and the Jubilee': 'SYJ', 'The Chosen Temple': 'CT', 'Vessels of the Sanctuary and Those Who Serve Therein': 'VS', 'Admission into the Sanctuary': 'AS',
    'Things Forbidden on the Altar': 'TFA', 'Sacrificial Procedure': 'SP', 'Daily Offerings and Additional Offerings': 'DOA', 'Sacrifices Rendered Unfit': 'SRU',
    'Service on the Day of Atonement': 'SDA', Trespass: 'Tre', 'Paschal Offering': 'PO', 'Festival Offering': 'FO', Firstlings: 'Fir', 'Offerings for Unintentional Transgressions': 'OUT',
    'Offerings for Those with Incomplete Atonement': 'OIA', Substitution: 'Sub', 'Defilement by a Corpse': 'DC', 'Red Heifer': 'RHe', 'Defilement by Leprosy': 'DL',
    'Those Who Defile Bed or Seat': 'DBS', 'Other Sources of Defilement': 'OSD', 'Defilement of Foods': 'DF', Vessels: 'Ves', 'Immersion Pools': 'IP', 'Damages to Property': 'DP',
    Theft: 'Thf', 'Robbery and Lost Property': 'RLP', 'One Who Injures a Person or Property': 'IPP', 'Murderer and the Preservation of Life': 'MPL', Sales: 'Sal',
    'Ownerless Property and Gifts': 'OPG', Neighbors: 'Nei', 'Agents and Partners': 'AP', Slaves: 'Sla', Hiring: 'Hir', 'Borrowing and Deposit': 'BD', 'Creditor and Debtor': 'CD',
    'Plaintiff and Defendant': 'PD', Inheritances: 'Inh', 'The Sanhedrin and the Penalties within Their Jurisdiction': 'San', Testimony: 'Tes', Rebels: 'Reb', Mourning: 'Mou',
    'Kings and Wars': 'KW' };
  const tractUrl = k => TRACT_URL[String(k).replace(/'/g, '')] || bookSlug(k);
  // ספר בסיס → "TN/Gen" / "MS/Ber" / "MT/HD"; ובכיוון ההפוך (באותיות גדולות) — נבנה פעם אחת לכל אינדקס
  function urlOf(IX, b) {
    const t = IX.books[b].title, c = IX.books[b].cat;
    const s = c === 0 ? TN_AB[t] : c === 1 ? tractUrl(t.replace(/^Mishnah /, '')) : MT_AB[t.replace(/^Mishneh Torah, /, '')];
    return URL_COL[c] + '/' + (s || bookSlug(t.replace(/^Mishnah |^Mishneh Torah, /, '')));
  }
  function urlBooks(IX) {
    if (!IX.byUrl) { IX.byUrl = {}; IX.base.forEach(b => { IX.byUrl[urlOf(IX, b).toUpperCase()] = b; }); }
    return IX.byUrl;
  }
  const urlNum = t => { const n = parseNum(String(t || '')); return n >= 1 ? n : NaN; };
  // הצורה החדשה בלבד; undefined = לא מתחיל באוסף מוכר (ואז הצורה הישנה), null = אוסף מוכר ומקום שאין
  function parseUrlRef(IX, TX, RX, seg) {
    const col = (seg[0] || '').toUpperCase(), n = seg.length;
    if (col === 'TB') {
      if (!TX || n < 2 || n > 4) return null;
      const t = TX.list.find(x => tractUrl(x.k).toUpperCase() === seg[1].toUpperCase() || x.k.toUpperCase() === seg[1].toUpperCase()); if (!t) return null;
      const m = n > 2 ? /^(\d+)([ab])?$/i.exec(seg[2]) : ['', '2', 'a']; if (!m) return null;
      const d = +m[1], j = amudOf(d, /b/i.test(m[2] || '') ? 1 : 0); if (d < 2 || j >= t.n) return null;
      const x = { kind: 'tal', k: t.k, j };
      if (n > 3) { const s = urlNum(seg[3]); if (!(s >= 1)) return null; x.s = s - 1; }
      return x;
    }
    if (col === 'ZH') {
      if (!TX || n < 2 || n > 4) return null;
      const t = TX.list.find(x => x.z && x.k.slice(2).toUpperCase() === seg[1].toUpperCase()); if (!t) return null;
      const m = n > 2 ? /^(\d+)([ab])?$/i.exec(seg[2]) : ['', String(t.d0 + (t.j0 >> 1)), t.j0 & 1 ? 'b' : 'a']; if (!m) return null;
      const d = +m[1], j = amudOf(d, /b/i.test(m[2] || '') ? 1 : 0, t.d0); if (d < t.d0 || j < 0 || j >= t.n) return null;
      const x = { kind: 'tal', k: t.k, j };
      if (n > 3) { const s = urlNum(seg[3]); if (!(s >= 1)) return null; x.s = s - 1; }
      return x;
    }
    if (col === 'TUR') {
      if (!RX || n < 2 || n > 5 || n === 4) return null;
      const ti = RX.byK[seg[1].toUpperCase()], t = RX.list[ti]; if (!t) return null;
      const s = n < 3 ? 1 : /^(intro|0)$/i.test(seg[2]) ? 0 : urlNum(seg[2]);
      if (!(s >= 0) || s >= t.n || (s === 0 && !t.intro)) return null;
      const x = { kind: 'tur', k: t.k, s };
      if (n === 5) { const c = ({ BY: 'y', BH: 'c', BACH: 'c' })[seg[3].toUpperCase()], i = urlNum(seg[4]); if (!c || !(i >= 1)) return null; x.x = c; x.i = i - 1; }
      return x;
    }
    if (!['TN', 'MS', 'MT'].includes(col)) return undefined;
    if (n < 2 || n > 4) return null;
    const b = urlBooks(IX)[col + '/' + seg[1].toUpperCase()]; if (b == null) return null;
    const ch = n > 2 ? urlNum(seg[2]) : chaptersOf(IX, b)[0], v = n > 3 ? urlNum(seg[3]) : 0;
    if (!(ch >= 1) || Number.isNaN(v) || !hasRef(IX, b, ch, v)) return null;
    return { kind: 'ref', b, ch, v };
  }
  function parseHashRef(IX, TX, RX, path) {
    let q = String(path || ''); try { q = decodeURIComponent(q); } catch (e) {}
    const nw = parseUrlRef(IX, TX, RX, q.split(/[\/#]+/).filter(Boolean));
    if (nw !== undefined) return nw;
    q = q.replace(/[\/_+#]+/g, ' ').trim(); if (!q) return null;
    const rr = parseTurRef(RX, q), tr = parseDafRef(TX, q), ref = parseRef(IX, q, null);
    if (rr) return { kind: 'tur', k: rr.k, s: rr.s };
    if (tr && (tr.explicit || !ref)) return { kind: 'tal', k: tr.k, j: tr.j };
    if (ref) return { kind: 'ref', b: ref.b, ch: ref.ch, v: ref.v };
    return null;
  }
  // x.s (גמרא) / x.x + x.i (טור) = החלון הפתוח; x.v = הפסוק או ההלכה (כשאינו הראשון בפרק)
  function hashOfRef(IX, x) {
    if (x.kind === 'tur') return '#read/TUR/' + x.k + '/' + (x.s || 'intro') + ((x.x === 'y' || x.x === 'c') && x.i >= 0 ? '/' + (x.x === 'y' ? 'BY' : 'BH') + '/' + (x.i + 1) : '');
    if (x.kind === 'tal' && x.z) return '#read/ZH/' + x.k.slice(2) + '/' + dafLabel(x.j, true, x.d0) + (x.s >= 0 ? '/' + (x.s + 1) : '');
    if (x.kind === 'tal') return '#read/TB/' + tractUrl(x.k) + '/' + dafLabel(x.j, true) + (x.s >= 0 ? '/' + (x.s + 1) : '');
    return '#read/' + urlOf(IX, x.b) + '/' + x.ch + (x.v && x.v !== versesOf(IX, x.b, x.ch)[0] ? '/' + x.v : '');
  }

  /* מקום של יחידה בקורפוס (ספר, פרק, פסוק/משנה/הלכה — גם במפרש או בתרגום) → המקום במסך הקריאה: הספר שמוצג שם,
     הפרק, והפסוק אם קיים בו (מפרש על פסוק שאין → תחילת הפרק). null אם אין לה מקום במסך הקריאה (מילון, פרק שלא קיים). */
  function unitRef(IX, b, ch, v) {
    const o = IX.owner[b]; if (o == null || !hasRef(IX, o, ch, 0)) return null;
    return { kind: 'ref', b: o, ch, v: v && hasRef(IX, o, ch, v) ? v : 0 };
  }

  const CORE = { noTeamim, unitRef, noMarks, norm, toHeb, parseNum, buildIndex, addBook, chaptersOf, versesOf, parseRef, suggestBooks, suggestPlaces, search, markWords, splitComm, splitOne, splitCm, talIndex, parseDafRef, dafOf, amudOf, dafLabel, turIndex, parseTurRef, turToks, parseHashRef, hashOfRef };
  G.GimReaderCore = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof document === 'undefined' || !G.GimCorpus) return;

  /* ================= (2) ממשק ================= */
  // שולחן העבודה מרים את חלונות הבחירה (#rdJump, #rdSet, #rdPrintPop) אל מחוץ ל-iframe, מתחת לבנר: G.GT_POPS מפנה אליהם
  const $r = s => {
    const P = G.GT_POPS, m = P && /^(#rd\w+)(?:\s+(.+))?$/.exec(s), el = m && P[m[1]];
    return el ? (m[2] ? el.querySelector(m[2]) : el) : document.querySelector(s);
  };
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
    'הטור באמצע, ב״ח מימין ובית יוסף משמאל.': 'The Tur in the middle, Bach on the right and Beit Yosef on the left.',
    'טור ומפרשים': 'Tur & commentary', 'משמאל': 'on the left', 'מימין': 'on the right', 'קטעים מהטור, ומתחת לכל אחד הדיבורים שלו.': 'Passages of the Tur, each followed by its comments.',
    'הטור מימין, והפירוש מקיף אותו וממשיך מתחתיו.': 'The Tur on the right; the commentary wraps around it and continues below.', 'הטור לבדו, ברוחב מלא.': 'The Tur alone, at full width.', 'לחצו על סימן בטור או על דיבור כדי לקרוא אותו באותיות גדולות.': 'Click a marker in the Tur or a comment to read it in large letters.',
    'בטור מקלידים מקום: ״או״ח ס״, ״יו״ד קצג״, או מספר סימן.': 'In the Tur, type a place: "OC 60", "YD 193", or a siman number.',
    'הלכה הלכה': 'Halakhah by halakhah', 'מסך הקריאה: תנ״ך, משנה, רמב״ם, ש״ס וטור עם מפרשים': 'Reading: Tanakh, Mishnah, Rambam, Talmud and Tur with commentaries', 'מסך הגימטריה: חישוב, חיפוש והשוואה': 'Gematria: calculate, search and compare', 'סוג תצוגה, מפרשים, כתב וגודל אותיות': 'layout, commentaries, script and text size',
    'צורת הדף: הטור באמצע, וב״ח ובית יוסף מקיפים אותו': 'Page layout: the Tur in the middle, surrounded by the Bach and Beit Yosef',
    'צורת הדף: פריסת דף וילנא — הגמרא באמצע, רש״י ותוספות מסביב': 'Vilna page: the Gemara in the middle, Rashi and Tosafot around it',
    'טור ומפרשים: קטעים מהטור, ומתחת לכל אחד הדיבורים שלו': 'Tur & commentary: passages of the Tur, each followed by its comments',
    'גמרא ומפרשים: קטעי הגמרא ברצף; לחיצה על קטע פותחת את פירושיו': 'Gemara & commentary: the Gemara as running text; click a passage to open its commentary',
    'ספר: עיצוב מהדורת פרנקל — ההלכות ברצף, והשגות הראב״ד בתוך הטקסט': "Book: Frankel edition layout, halakhot as running text with the Ra'avad's glosses inline",
    'הלכה הלכה: כל הלכה בנפרד עם כותרת, והמפרשים בתחתית הדף': 'Halakhah by halakhah: each halakhah under its own heading, commentaries at the foot of the page',
    'ספר: הטקסט ברצף כמו בספר מודפס, והתרגום בטור צד': 'Book: running text as in a printed book, with the translation in a side column',
    'פסוק מול תרגום: כל פסוק בשורה משלו, והתרגום מולו': 'Verse & translation: each verse on its own row, facing its translation',
    'הסתרת התרגום': 'Hide the translation', 'הצגת': 'Show', 'הסתרת': 'Hide', 'בצד שמאל': 'on the left', 'התרגום בכתב רש״י': 'Translation in Rashi script', 'התרגום בכתב מרובע רגיל': 'Translation in regular square script',
    'הפירוש בכתב רש״י': 'Commentary in Rashi script', 'הפירוש בכתב מרובע רגיל': 'Commentary in regular square script', 'בתצוגת גמרא ומפרשים': 'in the Gemara & commentary layout',
    'קטן': 'small', 'רגיל': 'normal', 'גדול': 'large', 'גדול מאוד': 'extra large', 'טקסט הרמב״ם עם ניקוד': 'Rambam text with vowel points', 'טקסט הרמב״ם בלי ניקוד, כמו במהדורת פרנקל': 'Rambam text without vowel points, as in the Frankel edition',
    'הדפסת שני העמודים הפתוחים בלבד': 'Print only the two open pages', 'הדפסת הפרק כולו': 'Print the whole chapter', 'הדפסה בצבע, עם רקע נייר': 'Print in color, with the paper tone', 'הדפסה בשחור-לבן על רקע לבן': 'Print in black & white on white',
    'פתיחת חלון ההדפסה (שם אפשר גם לשמור כ-PDF)': 'Open the print dialog (you can also save as PDF there)', 'רשימת הספרים': 'Book list', 'בחירת': 'Choose',
    'זוהר': 'Zohar', 'פריסה': 'Layout', 'פירוש': 'Commentary', 'הוספת הסולם': 'Add the Sulam', 'בתחתית העמוד': 'At the bottom of the page', 'פירוש מתחת לפסקאות': 'Commentary under paragraphs', 'ספר פתוח': 'Open book', 'ארמית בעמוד ימין, תרגום בשמאל': 'Aramaic on the right page, translation on the left', 'שני טורים': 'Two columns', 'בעמוד אחד, שורה מול שורה': 'On one page, line by line', 'מול הארמית': 'Opposite the Aramaic', 'ארמית': 'Aramaic', 'חלק': 'Volume', 'פסקה': 'Paragraph', 'הסולם': 'Sulam', 'דף מול תרגום': 'Page & translation', 'זוהר והסולם': 'Zohar & Sulam', 'בעמוד השמאלי': 'On the left page', 'מתחת לפסקאות': 'Below the paragraphs',
    'ביאור הסולם': 'Sulam commentary', 'לחצו על פסקה בזוהר כדי לראות את התרגום והסולם שלה.': 'Click a paragraph of the Zohar to see its translation and Sulam commentary.', 'העמודים לפי דפוס וילנא.': 'Pages follow the Vilna edition.',
    'המשך הפסקה מהעמוד הקודם': 'Continued from the previous page', 'הפרשה מתחילה בעמוד הבא': 'The portion begins on the next page', 'אין ביאור לפסקאות אלה': 'No commentary on these paragraphs', 'אין תרגום לפסקאות אלה': 'No translation for these paragraphs',
    'אין תרגום או ביאור לפסקה זו': 'No translation or commentary on this paragraph', 'הפסקה הקודמת': 'Previous paragraph', 'הפסקה הבאה': 'Next paragraph', 'לא ניתן לטעון את הפרשה.': 'Could not load the portion.',
    'דף מול תרגום: עמוד הזוהר בארמית מימין, והתרגום (או הסולם) מולו משמאל': 'Page & translation: the Zohar page in Aramaic on the right, its translation (or the Sulam) facing it on the left',
    'זוהר והסולם: פסקאות הזוהר ברצף, ומתחת להן התרגום וביאור הסולם': 'Zohar & Sulam: the Zohar paragraphs as running text, with the translation and the Sulam commentary below them',
    'בסימן': 'Siman', 'בכל הטור': 'Whole Tur', 'אפשר גם להקליד מקום: ״או״ח ס״, ״יו״ד קצג״.': 'You can also type a place: "OC 60", "YD 193".'
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
  // rview = בטור: צורת הדף (daf) או טור ומפרשים (study); rOff = מפרשים מוסתרים בטור ('y' בית יוסף, 'c' ב״ח)
  const DEF = { b: 0, ch: 1, anchor: 1, view: 'book', ramView: 'book', tr: 'onkelos', trFont: 'rashi', cmFont: 'rashi', size: 0, scope: 'book', src: 'txt', prScope: 'spread', prColor: 'color', tk: '', tj: 0, tview: 'daf', tsrc: 'all', tscope: 'tr', cmOff: [], ramNik: true, rk: '', rs: 1, rscope: 'all', rsrc: 'all', rview: 'daf', rOff: [], zside: 't', zlay: 'spread', zsul: '0', zoff: [] };
  const S = Object.assign({}, DEF, (() => { try { return JSON.parse(localStorage.getItem('gimatrivonReader') || '{}'); } catch (e) { return {}; } })());
  S.p = 0; S.hl = ''; S.lock = null; S.tp = 0; S.sel = null; S.rp = 0; S.rsel = null; S.rgo = null;
  if (!Array.isArray(S.rOff)) S.rOff = []; S.rOff = S.rOff.filter(x => x === 'y' || x === 'c'); if (S.rview !== 'study') S.rview = 'daf'; S.zside = 't'; // התרגום תמיד מול הטקסט; הסולם הוא פירוש if (S.zlay !== 'cols') S.zlay = 'spread'; S.zsul = S.zsul === '1' ? '1' : '0'; if (!Array.isArray(S.zoff)) S.zoff = []; S.zoff = S.zoff.filter(x => x === 't' || x === 'r'); if (S.ramView !== 'aligned') S.ramView = 'book';
  const save = () => { try { localStorage.setItem('gimatrivonReader', JSON.stringify({ b: S.b, ch: S.ch, anchor: S.anchor, view: S.view, ramView: S.ramView, tr: S.tr, trFont: S.trFont, cmFont: S.cmFont, size: S.size, scope: S.scope, src: S.src, prScope: S.prScope, prColor: S.prColor, tk: S.tk, tj: S.tj, tview: S.tview, tsrc: S.tsrc, cmOff: S.cmOff, ramNik: S.ramNik, rk: S.rk, rs: S.rs, rscope: S.rscope, rsrc: S.rsrc, rview: S.rview, rOff: S.rOff, zside: S.zside, zlay: S.zlay, zsul: S.zsul, zoff: S.zoff })); } catch (e) {} syncHash(); };
  /* הכתובת: #read/… במסך הקריאה (מתעדכנת בכל דפדוף, ב-replaceState — בלי רשומות בהיסטוריה), #gim במסך הגימטריה.
     נוגעים בה רק כשהיא ריקה או כבר אחת מאלה — #phone / #desktop (app.js) נשארים */
  const MODE_HASH = /^#(read([\/#].*)?|gim)$/i;
  const setHash = x => { if (location.hash === x || (location.hash && !MODE_HASH.test(location.hash))) return; try { history.replaceState(history.state, '', x); } catch (e) {} };
  // חלון פתוח (קטע בגמרא, דיבור בטור) נכנס לכתובת, כדי שקישור שמועתק ממנו יפתח אותו שוב
  const curRef = () => isTur() ? Object.assign({ kind: 'tur', k: S.rk, s: S.rs }, S.rsel && S.rsel.x !== 't' ? { x: S.rsel.x, i: S.rsel.i, s: S.rsel.s } : {})
    : isTal() ? Object.assign({ kind: 'tal', k: S.tk, j: S.tj }, talT().z ? { z: 1, d0: talT().d0 } : {}, S.sel ? { j: S.sel.j, s: S.sel.s } : {}) : { kind: 'ref', b: S.b, ch: S.ch, v: S.anchor };
  function syncHash() { if (IX && document.body.dataset.mode === 'read') setHash(hashOfRef(IX, curRef())); }

  let TX = null;
  const ensureIndex = () => {
    if (IX) return;
    TX = talIndex((G.GIM_TALMUD_INDEX || []).concat(G.GIM_ZOHAR_INDEX || []));
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
  const FONTS = ['16px GimFrank', '16px GimRashi'];
  const fontsIn = () => !document.fonts || !document.fonts.check || FONTS.every(f => document.fonts.check(f, 'אב'));
  const fontsFor = go => { if (document.fonts && document.fonts.load && !fontsIn()) Promise.all(FONTS.map(f => document.fonts.load(f, 'אב'))).then(go, go); else go(); };
  // fontsLate = נמדד עמוד לפני שהגופנים נטענו — רק אז מעמדים מחדש כשהם מגיעים (לא בכל טעינה, כמו קודם: בפרק ארוך זה עוד כמה שניות)
  let fontsLate = false;
  const reMeasure = () => { if (!fontsLate) return; fontsLate = false; PG.clear(); PC.clear(); DC.clear(); TPC.clear(); TGC.clear(); render(); };
  const measured = () => { if (fontsLate || fontsIn()) return; fontsLate = true; fontsFor(() => setTimeout(reMeasure, 0)); };
  function ensure(ids, again, prog) {
    ids = [...new Set(ids.filter(b => b != null && !IX.data[b]))];
    if (!ids.length) return true;
    const key = ids.join(','); if (LOADING.has(key)) return false;
    LOADING.add(key);
    // התקדמות לפי גודל הקבצים (books[b].fb), כמו במסכת: כל ספר זוחל לעבר 90% וקופץ למלא כשנטען
    const pe = prog ? progEase(prog, ids.map(b => (IX.books[b].fb || [1]).reduce((a, x) => a + x, 0))) : null;
    // הקבצים מוחזקים רק עד שהספר נכנס ל-IX.data (GimCorpus.use), ואז משתחררים — הטקסט כבר נמצא כאן
    const rel = G.GimCorpus.use ? G.GimCorpus.use(ids) : () => {};
    // העימוד מודד בגופנים של הדף — מחכים להם (כמו במסכת), אחרת העמודים נמדדים בגופן חלופי ומחושבים שוב כשהגופנים מגיעים
    G.GimCorpus.load(ids, b => { if (pe) pe.got(ids.indexOf(b)); }).then(() => { LOADING.delete(key); if (pe) pe.end(); ids.forEach(b => addBook(IX, b, G.GimCorpus.each)); rel(); fontsFor(() => setTimeout(() => again(true), 0)); }, // משימה נפרדת לעימוד, כדי שמסך הטעינה יתעדכן ביניהן
      () => { LOADING.delete(key); rel(); if (pe) pe.end(); again(false); });
    return false;
  }
  /* v3.16.0: ספרים שלא בשימוש משתחררים מהזיכרון. נשארים: הספרים של המסך הנוכחי (הספר, הסמוכים, התרגום והמפרשים),
     הספרים של החיפוש הפתוח (PIN), ועוד BKEEP הספרים האחרונים שנפתחו — כדי שחזרה לספר קודם תהיה מיידית.
     ספר שמשתחרר נטען שוב בפעם הבאה (מהמטמון, עם מסך הטעינה) — פרקים ופסוקים מוצגים בינתיים מ-books[b].cv. */
  const BKEEP = 16, RECENT = []; let PIN = [];
  function keepBooks(ids) {
    ids.forEach(b => { const i = RECENT.indexOf(b); if (i >= 0) RECENT.splice(i, 1); RECENT.push(b); });
    while (RECENT.length > BKEEP) RECENT.shift();
    const keep = new Set(ids.concat(PIN, RECENT));
    IX.data.forEach((d, b) => { if (d && !keep.has(b)) { IX.data[b] = null; IX.ncache.delete(b); CMN.delete(b); } });
  }
  // הספרים הסמוכים (לדפדוף רציף בין ספרים) — נטענים יחד עם הספר הפתוח
  const nearBooks = b => { const i = IX.base.indexOf(b); return [IX.base[i - 1], b, IX.base[i + 1]].filter(x => x != null); };
  // מטמונים מוגבלים: Map שומר סדר הכנסה, אז מוחקים את הישנים ביותר
  const trimMap = (m, n) => { while (m.size > n) m.delete(m.keys().next().value); };
  // משנה ורמב״ם: כותרת לכל יחידה ("משנה ה" / "הלכה ה") ואין תרגום. uName = שם היחידה בספר
  const isMishnah = b => IX.books[b].cat === 1 || IX.books[b].cat === 7;
  const isRambam = b => IX.books[b].cat === 7;
  const uName = b => IX.books[b].cat === 7 ? 'הלכה' : IX.books[b].cat === 1 ? 'משנה' : 'פסוק';
  /* סוג התצוגה של הספר: ברמב״ם נפרד (S.ramView: עיצוב פרנקל / הלכה הלכה), כדי ש"פסוק מול תרגום" בתנ״ך לא יחליף גם את הרמב״ם.
     במשנה אין תרגום ושתי התצוגות זהות — לכן אין בה בחירת סוג תצוגה (hasViews). */
  const vw = b => isRambam(b) ? S.ramView : S.view;
  const hasViews = b => IX.books[b].cat !== 1;
  const hasTr = b => { const L = IX.links[b] || {}; return L.onkelos != null || L.yonatan != null; };
  const alignedName = b => isRambam(b) ? 'הלכה הלכה' : uName(b) + ' מול תרגום';
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
    if (SQHL && SQHL.q === q) return sqMarkHtml(t, null, SQHL.test); // v3.31.0: אחרי מעבר מתוצאת חיפוש SQLite
    const { parts, marks } = markWords(t, q);
    return parts.map((p, i) => marks.has(i) ? '<mark class="rdHl">' + h(p) + '</mark>' : h(p)).join('');
  }

  function geometry() {
    const desk = $r('#rdDesk'), W = desk.clientWidth, H = desk.clientHeight;
    const narrow = W < 600, two = W >= 1000;
    const pw = two ? Math.min(680, Math.floor((W - 140) / 2)) : Math.min(760, W - (narrow ? 12 : 120));
    const zc = isTal() && isZ() && S.tview === 'daf' && S.zlay === 'cols' && pw >= 520; // זוהר בשני טורים בכל עמוד (ארמית | תרגום); במסך רחב — שני עמודים כמו בשאר הספרים
    const ph = Math.max(300, H - (narrow ? 8 : 30));
    const fs = Math.round(((narrow ? 18 : 20.5) + S.size * 1.5) * 10) / 10;
    const trW = Math.round(pw * (S.view === 'book' ? (S.trFont === 'rashi' ? 0.27 : 0.3) : (S.trFont === 'rashi' ? 0.3 : 0.33)));
    return { W, H, narrow, two, zc, pw, ph, fs, trW, per: two ? 2 : 1, cls: pw < 540 ? ' narrow' : '', key: [two, pw, ph, fs, S.view, S.ramView, S.tr, S.trFont, S.cmFont, isEn(), S.cmOff.join(','), S.ramNik, S.tview, S.zside, S.zlay, S.zsul, S.zoff.join('')].join('|') };
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
    const nik = t => isRambam(b) ? unNik(t) : t; // ניקוד ברמב״ם — גם בתצוגת הלכה הלכה, לא רק בעיצוב פרנקל
    const main = s => hlHtml(nik(whole(s) ? noTeamim(chText(b, ch, s.v)) : wordsOf(b, ch, s.v).slice(s.from, s.to).join(' ')), q) + (s.to < wordsOf(b, ch, s.v).length ? ' <span class="rdCont">…</span>' : '');
    const vn = s => s.from === 0 ? '<span class="vn">' + num(s.v) + '</span>' : '<span class="rdCont">…</span> ';
    const rv = segs.map(s => s.v);
    let html = '<header class="rdHead' + (isRambam(b) ? ' ram' : '') + '"><span>' + h(bkName(bk.heTitle)) + '</span><span class="mid">' + h(grpName(bk.g)) + '</span><span' + (isEn() ? ' dir="ltr"' : '') + '>' + num(ch) + ', ' + num(rv[0]) + (rv[rv.length - 1] !== rv[0] ? '–' + num(rv[rv.length - 1]) : '') + '</span></header>';
    const title = first ? '<div class="rdChTitle">' + (ch === 1 ? '<span class="bk">' + h(bkName(bk.heTitle)) + '</span>' : '') + '<span class="ch">' + T('פרק') + ' ' + num(ch) + '</span></div>' : '';
    if (isRambam(b) && vw(b) === 'book') html += ramBody(b, ch, pg, segs, first, q);
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
      const inl = isRambam(b) && vw(b) === 'book'; // בעיצוב פרנקל הראב״ד מודפס בתוך הטקסט (ramBody), לא בתחתית
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
  const CML = new WeakMap(); // אורך דיבור במילים — נספר הרבה פעמים בעימוד, לכן נשמר לכל דיבור
  const cmLen = e => { let n = CML.get(e); if (n == null) CML.set(e, n = cmWordsOf(e).length); return n; };
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

  /* v3.29.1: העימוד הוא גנרטור שמחזיר עמוד אחרי עמוד. pagesRun מריץ אותו עד שיש מספיק עמודים להצגה (until),
     והשאר ממשיך ברקע בפרוסות קצרות (pagesBg) — כך פרק ארוך עם פירוש ארוך לא מקפיא את המסך בפתיחה, בדפדוף או
     בשינוי הגדרה. pagesFor = העימוד המלא (הדפסה, פרק קודם). PG = עימודים שהתחילו ועוד לא הסתיימו */
  const PG = new Map();
  function pagesRun(b, ch, until) {
    const key = b + ':' + ch + '|' + geo.key; if (PC.has(key)) return { pages: PC.get(key), done: true };
    let job = PG.get(key);
    if (!job) { measured(); const pages = []; job = { b, ch, pages, it: pageGen(b, ch, pages) }; PG.set(key, job); }
    $r('#rdProbe').className = 'rdPage' + geo.cls; // מדידה אחרת (פרק אחר, ש״ס, טור) יכלה לשנות אותו בינתיים
    while (!(until && until(job.pages))) {
      if (job.it.next().done) { PG.delete(key); $r('#rdProbe').innerHTML = ''; PC.set(key, job.pages); trimMap(PC, 60); return { pages: job.pages, done: true }; }
    }
    pagesBg();
    return { pages: job.pages, done: false };
  }
  const pagesFor = (b, ch) => pagesRun(b, ch).pages;
  let bgT = 0;
  function pagesBg() {
    if (bgT) return;
    bgT = setTimeout(() => {
      bgT = 0; if (!built || !geo) return;
      // ממשיכים רק את הפרק הפתוח והסמוכים לו, בגודל ובהגדרות הנוכחיים; השאר כבר לא יוצג (וייתכן שהספר שלו שוחרר)
      const near = [{ b: S.b, ch: S.ch }, nextCh(S.b, S.ch, 1), nextCh(S.b, S.ch, -1)].filter(Boolean).map(x => x.b + ':' + x.ch + '|' + geo.key);
      PG.forEach((j, key) => { if (isTal() || isTur() || !near.includes(key) || !loaded(need(j.b))) PG.delete(key); });
      const job = near.map(k => PG.get(k)).find(Boolean);
      if (!job) return;
      const t0 = performance.now(), { b, ch } = job;
      const r = pagesRun(b, ch, () => performance.now() - t0 > 30);
      if (r.done && b === S.b && ch === S.ch && !isTal() && !isTur() && document.body.dataset.mode === 'read') render(); // מספר העמודים, הסרגל וכפתורי הדפדוף
      if (PG.size) pagesBg();
    }, 0);
  }
  function* pageGen(b, ch, pages) {
    const probe = $r('#rdProbe'), ents = cmEntries(b, ch);
    probe.className = 'rdPage' + geo.cls;
    // דיבורים של קטע: לפי מיקום הדיבור המתחיל במילים [from, to); הקטע האחרון של פסוק לוקח גם את מה שאחרי
    const entsOf = s => { const n = wordsOf(b, ch, s.v).length; return ents.filter(e => e.v === s.v && e.pos >= s.from && (s.to >= n || e.pos < s.to)); };
    // carry = המשך של דיבורים ארוכים מהעמוד הקודם (פירוש שלא נכנס כולו בעמוד אחד עם הטקסט שלו, כמו רש״י על "בראשית").
    // הוא בא בראש הפירוש בעמוד הבא, ותמיד עם טקסט חדש באותו עמוד. cut = כמה מילים של הפירוש להשאיר בעמוד (השאר עובר ל-carry).
    let carry = [];
    const mk = (segs, cut) => { const all = carry.concat(...segs.map(entsOf)); return { segs, vs: [...new Set(segs.map(s => s.v))], cm: cut == null ? all : cutCm(all, cut)[0] }; };
    /* v3.29.1: מדידה בדפדפן עולה כמה מילישניות, ובחיפוש הדוהר מודדים גם מועמדים ענקיים (עשרות הלכות עם כל הפירוש) —
       בפרקים עם פירוש ארוך (עבודה זרה ז) זה היה כמה שניות שבהן המסך קפוא. capW = כמה מילות פירוש נכנסות בעמוד
       (הכתב הצפוף ביותר בדף); מועמד שיש בו יותר מפי שניים מילים מזה בוודאי לא נכנס, ונדחה בלי מדידה. */
    let capW = 0;
    const capWords = () => {
      if (capW) return capW;
      const all = ents.reduce((m, e) => m + cmLen(e), 0), v = versesOf(IX, b, ch)[0];
      const c = maxOk(0, all, c => { probe.innerHTML = pageInner(b, ch, { segs: [{ v, from: 0, to: 1 }], vs: [v], cm: cutCm(ents, c)[0] }, 1, ''); return !over(probe); });
      return (capW = c >= all ? Infinity : Math.max(40, c)); // כל הפירוש נכנס — אין ממנו חסם
    };
    const pgWords = pg => pg.segs.reduce((m, x) => m + x.to - x.from, 0) + pg.cm.reduce((m, e) => m + cmLen(e), 0);
    const fits = (segs, cut) => {
      const pg = mk(segs, cut), n = ents.length ? pgWords(pg) : 0;
      if (n > 300 && n > 2 * capWords()) return false;
      probe.innerHTML = pageInner(b, ch, pg, pages.length + 1, ''); return !over(probe);
    };
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
      pages.push(pg); yield;
      if (pages.length > 600) break;
    }
    // נדיר: נשאר פירוש אחרי המילה האחרונה של הפרק — ממשיכים אותו עם המילים האחרונות שוב, כדי שלא יאבד ולא יהיה עמוד בלי טקסט
    while (ram && carry.length && pages.length < 600) {
      const last = pages[pages.length - 1].segs.slice(-1), pg = c => ({ segs: last, vs: [last[0].v], cm: cutCm(carry, c)[0] });
      const c = Math.max(1, maxOk(0, cmWords([]), c => { probe.innerHTML = pageInner(b, ch, pg(c), pages.length + 1, ''); return !over(probe); }));
      pages.push(pg(c)); carry = cutCm(carry, c)[1]; yield;
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
      pages.push(pg); yield;
      if (pages.length > 600) break;
    }
  }
  const baseIdx = b => IX.base.indexOf(b);
  function nextCh(b, ch, dir) {
    const chs = chaptersOf(IX, b), i = chs.indexOf(ch) + dir;
    if (i >= 0 && i < chs.length) return { b, ch: chs[i] };
    const nb = IX.base[baseIdx(b) + dir]; if (nb == null) return null;
    const nchs = chaptersOf(IX, nb); return { b: nb, ch: dir > 0 ? nchs[0] : nchs[nchs.length - 1] };
  }

  /* כפתור סוג התצוגה בסרגל: שמות, מצב לחוץ, הסבר בריחוף — לפי הספר הפתוח. מתעדכן לפני הטעינה, כך שגם בזמן שספר נטען
     הכפתור מראה את הסוג של הספר הזה ולא של הקודם (ש״ס / טור) */
  const viewName = v => v === 'book' ? 'ספר' : v === 'aligned' ? alignedName(S.b) : v === 'daf' ? (isZ() ? 'דף מול תרגום' : 'צורת הדף') : isTur() ? 'טור ומפרשים' : isZ() ? 'זוהר והסולם' : 'גמרא ומפרשים';
  function syncSeg() {
    const seg = $r('#rdViewSeg'), tal = isTal(), tur = isTur(), cur = tur ? S.rview : tal ? S.tview : vw(S.b);
    seg.hidden = !tal && !tur && !hasViews(S.b);
    seg.querySelectorAll('button').forEach(x => {
      const v = tal || tur ? (x.dataset.view === 'book' ? 'daf' : 'study') : x.dataset.view, on = v === cur;
      x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on));
      x.querySelector('.t').textContent = T(viewName(v));
    });
  }
  function render() {
    if (!built || document.body.dataset.mode !== 'read') return;
    geo = geometry();
    R.style.setProperty('--rdPw', geo.pw + 'px'); R.style.setProperty('--rdPh', geo.ph + 'px');
    R.style.setProperty('--rdFs', geo.fs + 'px'); R.style.setProperty('--rdTrW', geo.trW + 'px');
    R.classList.toggle('isTal', isTal()); R.classList.toggle('isTur', isTur());
    syncSeg(); if (openPop === 'set') renderSet(); // גם אם הסוג השתנה מהכפתור שבסרגל כשחלון ההגדרות פתוח
    sqWarm();
    if (isTur()) return renderTur();
    if (isTal()) return renderTal();
    $r('#rdPrevCh').setAttribute('aria-label', T('פרק קודם')); $r('#rdNextCh').setAttribute('aria-label', T('פרק הבא')); $r('#rdPrevCh').title = T('פרק קודם'); $r('#rdNextCh').title = T('פרק הבא');
    if (!ensure([].concat(...nearBooks(S.b).map(need)), ok => { if (!ok) { geo = geometry(); $r('#rdBook').innerHTML = '<article class="rdPage single rdLoading' + geo.cls + '"><p>' + T('לא ניתן לטעון את הספר.') + '</p></article>'; } else render(); }, f => loadProg('b' + S.b, f))) {
      $r('#rdBook').innerHTML = loadingHtml('b' + S.b, bkName(IX.books[S.b].heTitle), geo);
      $r('#rdWhereTxt').textContent = bkName(IX.books[S.b].heTitle) + ' · ' + T('פרק') + ' ' + num(S.ch);
      return;
    }
    keepBooks([].concat(...nearBooks(S.b).map(need)));
    // רק העמודים עד המקום המבוקש (והפריסה שלו); השאר מעומד ברקע, ואז render נקרא שוב
    const want = S.lock != null ? pg => pg.length > S.lock + geo.per : pg => { const i = pg.findIndex(p => p.vs.includes(S.anchor)); return i >= 0 && pg.length >= i + geo.per; };
    const run = pagesRun(S.b, S.ch, want), pages = run.pages, all = run.done;
    // בשני עמודים הפריסה רציפה בין פרקים: אם בפרק מספר עמודים אי-זוגי, העמוד הראשון של הפרק הבא ממלא את הצד השמאלי
    // (במקום עמוד ריק). לכן S.p יכול להיות אי-זוגי; בקפיצה לפסוק שומרים על הזוגיות של הפריסה הנוכחית באותו פרק.
    const locked = S.lock != null;
    let idx = locked ? S.lock : pages.findIndex(p => p.vs.includes(S.anchor));
    S.lock = null; if (idx < 0 || idx >= pages.length) idx = 0;
    // קפיצה לפסוק / הלכה מסוימים (קישור, תוצאת גימטריה): העמוד שלהם הוא הימני בפריסה, ולא השמאלי אחרי עמוד קודם
    if (locked || geo.per === 1 || flashV) S.p = idx;
    else { const par = S.at === S.b + ':' + S.ch ? S.p % 2 : 0; S.p = idx < par ? 0 : idx - ((idx - par) % 2); }
    S.at = S.b + ':' + S.ch;
    const shown = pages.slice(S.p, S.p + geo.per);
    S.anchor = shown[0].segs[0].v;
    const nx = geo.two && shown.length < 2 ? nextCh(S.b, S.ch, 1) : null, nxPg = nx && pagesRun(nx.b, nx.ch, pg => pg.length > 0).pages[0];
    const book = $r('#rdBook');
    book.className = 'rdBook' + (geo.two ? ' two' : ' one');
    const side = i => geo.two ? (i ? 'left' : 'right') : 'single', nar = geo.cls;
    book.innerHTML = shown.map((pg, i) => '<article class="rdPage ' + side(i) + nar + '" aria-label="' + T('עמוד') + ' ' + num(S.p + i + 1) + '">' + pageInner(S.b, S.ch, pg, S.p + i + 1, S.hl) + '</article>').join('') +
      (nxPg ? '<article class="rdPage left next' + nar + '" aria-label="' + T('עמוד') + ' ' + num(1) + '">' + pageInner(nx.b, nx.ch, nxPg, 1, '') + '</article>' :
        geo.two && shown.length < 2 ? '<article class="rdPage left blank' + nar + '" aria-hidden="true"></article>' : '') + (geo.two ? '<div class="rdSpine" aria-hidden="true"></div>' : '');
    book.querySelectorAll('.rdPage').forEach(p => { if (over(p)) p.classList.add('tight'); });
    if (flashV) { const v = flashV; flashV = 0; flash(v, flashKeep); flashKeep = false; }
    else if (flashOn && flashOn.at === S.b + ':' + S.ch) flashEls(flashOn.v).forEach(e => e.classList.add('flash'));
    else if (flashOn) { clearTimeout(hlTimer); flashOn = null; } // עברו לפרק אחר — הדגשה מקישור לא חוזרת כשחוזרים
    const bk = IX.books[S.b], chs = chaptersOf(IX, S.b);
    $r('#rdWhereTxt').textContent = bkName(bk.heTitle) + ' · ' + T('פרק') + ' ' + num(S.ch);
    $r('#rdPos').textContent = (shown.length > 1 ? T('עמודים') + ' ' + num(S.p + 1) + '–' + num(S.p + 2) : T('עמוד') + ' ' + num(S.p + 1)) + ' ' + T('מתוך') + ' ' + (all ? num(pages.length) : '…') +
      (nxPg ? ' · ' + T('ממשיך ל') + (nx.b !== S.b ? bkName(IX.books[nx.b].heTitle) + ' ' : '') + T('פרק') + ' ' + num(nx.ch) : '');
    $r('#rdChPos').textContent = T('פרק') + ' ' + num(S.ch) + ' ' + T('מתוך') + ' ' + num(chs.length);
    $r('#rdProgBar').style.width = Math.max(2, Math.round(100 * (chs.indexOf(S.ch) + (S.p + shown.length) / pages.length) / chs.length)) + '%';
    const atStart = S.p === 0 && !nextCh(S.b, S.ch, -1), atEnd = all && S.p + geo.per >= pages.length && !nextCh(S.b, S.ch, 1);
    ['#rdPrev', '#rdPrev2'].forEach(s => { $r(s).disabled = atStart; });
    ['#rdNext', '#rdNext2'].forEach(s => { $r(s).disabled = atEnd; });
    $r('#rdPrevCh').disabled = !nextCh(S.b, S.ch, -1); $r('#rdNextCh').disabled = !nextCh(S.b, S.ch, 1);
    fxAfter(book);
    save();
    prePaginate();
  }
  // עימוד הפרק הבא מראש, בזמן מנוחה — כך שהדפדוף אליו מיידי
  function prePaginate() {
    const ric = G.requestIdleCallback || (f => setTimeout(f, 200)), key = geo.key;
    ric(() => {
      if (!built || isTal() || !geo || geo.key !== key) return;
      const n = nextCh(S.b, S.ch, 1); if (n && loaded(need(n.b))) pagesRun(n.b, n.ch, pg => pg.length > 0);
    });
  }

  /* הופעה הדרגתית של הטקסט בדפדוף ובמעבר פרק (לא בפתיחה או בשינוי גודל): כל גוש (כותרת, פסקת מקרא/משנה, התרגום,
     כל דיבור בפירוש) נכנס בדהייה עם הזזה קטנה מכיוון הדפדוף — קדימה מגיע משמאל. סדר קבוע בכל עמוד: מקרא, תרגום, פירוש.
     רק opacity ו-transform. הפחתת תנועה = דהייה קצרה של העמוד כולו בלי הזזה; דפדוף מהיר ברצף מדלג על האפקט.
     בשינוי הגדרת תצוגה (fxSetting) אותו אפקט רץ רק על הכתב שההגדרה נוגעת בו — ועל כתב שהעימוד החדש שינה את תוכנו בעמוד. */
  const FX_START = [0, 220, 400], FX_STEP = 90, FX_DUR = 880;
  const FX_BLOCKS = '.rdChTitle,.rdTxt>p,.rdMsh,.rdTr,.rdRowHd,.rdRow,.rdCmHd,.rdCmBody>p,.rdDafIn,.trMain,.trSide,.trWide';
  // אזורי הכתב לאפקט ההגדרות: מקרא/משנה/גמרא/טור, תרגום, פירוש. בתצוגת פסוק מול תרגום — כל תא בשורה לחוד
  const FX_Z = {
    main: '.rdChTitle,.rdTxt>p,.rdMsh,.rdRowHd>span:not(.trh),.rdRow>.vnc,.rdRow>.he,.rdDafIn,.trMain,.trWide',
    tr: '.rdTr,.rdRowHd>.trh,.rdRow>.tr',
    cm: '.rdTxt>.rdRv,.rdCmHd,.rdCmBody>p,.trSide'
  };
  const FX_KEY = { tr: ['tr'], trFont: ['tr'], cmFont: ['cm'], cm: ['cm'], rcm: ['cm'], ramNik: ['main'], zside: ['cm'], zlay: ['cm'], zsul: ['cm'], zoff: ['cm'] }; // כל השאר (סוג תצוגה, גודל): הכל
  const fxEls = (book, sel) => [...book.querySelectorAll('.rdPage:not(.blank)')].flatMap(pg => [...pg.querySelectorAll(sel)]);
  const fxSig = book => Object.fromEntries(Object.keys(FX_Z).map(z => [z, fxEls(book, FX_Z[z]).map(e => e.textContent).join('\u0001')]));
  // לפני שינוי הגדרה: לזכור אילו אזורים ההגדרה משנה ומה הכתב בכל אזור עכשיו. הציור הבא של הספר (fxAfter) משווה ומפעיל
  let fxSet = null;
  function fxSetting(k) { const book = R && $r('#rdBook'); fxSet = { z: FX_KEY[k] || Object.keys(FX_Z), sig: book ? fxSig(book) : {} }; }
  function fxAfter(book) {
    if (fxDir) { reveal(book, fxDir); fxDir = 0; fxSet = null; return; }
    const x = fxSet; fxSet = null; if (!x) return;
    const now = fxSig(book), zs = Object.keys(FX_Z).filter(z => x.z.includes(z) || now[z] !== x.sig[z]);
    if (zs.length) reveal(book, 1, zs);
  }
  function reveal(book, dir, zs) {
    clearTimeout(fxTimer);
    const now = performance.now(), quick = now - fxLast < 280; fxLast = now;
    if (quick && !zs) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let end = 0;
    const set = (el, d, t) => { end = Math.max(end, d + t); el.style.setProperty('--fxD', d + 'ms'); el.style.setProperty('--fxT', t + 'ms'); el.classList.add('fxA'); };
    book.querySelectorAll('.fxA').forEach(e => e.classList.remove('fxA')); // אפקט קודם שעוד רץ (שתי הגדרות ברצף)
    book.classList.remove('fxRun', 'fxCalm', 'fxRise'); void book.offsetWidth;
    book.style.setProperty('--fxDx', (dir > 0 ? -10 : 10) + 'px');
    if (zs) book.querySelectorAll('.rdPage:not(.blank)').forEach(pg => zs.forEach((z, zi) => {
      let n = 0; pg.querySelectorAll(FX_Z[z]).forEach(el => set(el, calm ? 0 : FX_START[zi] + Math.min(n++, 8) * FX_STEP, calm ? 160 : FX_DUR));
    }));
    else book.querySelectorAll('.rdPage:not(.blank)').forEach(pg => {
      if (calm) { pg.querySelectorAll('.rdBody,.rdCm,.rdDaf').forEach(el => set(el, 0, 160)); return; }
      const n = [0, 0, 0];
      pg.querySelectorAll(FX_BLOCKS).forEach(el => {
        const z = el.closest('.rdCm') || el.classList.contains('trY') ? 2 : el.closest('.rdTr') || el.classList.contains('trC') ? 1 : 0;
        set(el, FX_START[z] + Math.min(n[z]++, 8) * FX_STEP, FX_DUR);
      });
    });
    if (!end) return;
    book.classList.add('fxRun', calm ? 'fxCalm' : 'fxRise');
    // אחרי הסיום מסירים הכל, כך שבחירת טקסט והדגשה פועלות על DOM רגיל
    fxTimer = setTimeout(() => {
      book.classList.remove('fxRun', 'fxCalm', 'fxRise');
      book.querySelectorAll('.fxA').forEach(e => { e.classList.remove('fxA'); e.style.removeProperty('--fxD'); e.style.removeProperty('--fxT'); });
    }, end + 60);
  }

  // flashOn = הפסוק שמהבהב עכשיו: ציור חוזר בזמן ההבהוב (שינוי גודל, טעינת גופנים) מסמן אותו שוב
  let flashOn = null;
  const flashEls = v => R.querySelectorAll('.rdBook .rdPage:not(.next) [data-v="' + v + '"]');
  // keep = מקישור (#read/…/פרק/פסוק): ההדגשה נשארת כל עוד הפרק פתוח, ולא נעלמת אחרי שתי שניות
  function flash(v, keep) {
    clearTimeout(hlTimer); flashOn = { at: S.b + ':' + S.ch, v };
    flashEls(v).forEach(e => { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); });
    if (!keep) hlTimer = setTimeout(() => { flashOn = null; flashEls(v).forEach(e => e.classList.remove('flash')); }, 2600);
  }
  // flashV = פסוק להבהב בציור הבא של הספר — גם כשהספר עוד נטען והציור מגיע רק אחרי הטעינה
  let flashV = 0, flashKeep = false;
  /* קישורי רפרנס (v4.8.0): מראה מקום בטקסט המוצג (פירושים, גמרא, משנה, רמב״ם, טור) הופך לקישור: פסוק "(שמות י״ח:ד׳)",
     דף גמרא "ברכות דף ג ע״א" / "(ברכות ג.)", "הלכות שבת פרק ב הלכה ג", "או״ח סימן ס". מוזרק אחרי הציור על ה-DOM, כך שהנתונים,
     החיפוש והעימוד לא משתנים, וכל זיהוי מאומת מול האינדקס (ספר, דף, סימן שקיימים). לחיצה: אותו חלון; Ctrl/Shift: חלון חדש. */
  const HNR = '[א-ת"״׳\']{1,5}', AMR = '(?: ?ע["״׳\']?[אב]|[.:])';
  // מספר עברי תקין: ערכי האותיות לא עולים (קכ, ריז, טו) — מסנן מילים כמו "הוה"
  const validNum = x => { const v = [...x.replace(/["״׳']/g, '')].map(c => 'אבגדהוזחטיכלמנסעפצקרשת'.indexOf(c)).map(i => i < 0 ? -1 : i < 9 ? i + 1 : i < 18 ? (i - 8) * 10 : Math.min(400, (i - 17) * 100)); return v.length > 0 && v.every((n, i) => n > 0 && (i === 0 || n <= v[i - 1])); };
  // מראה המקום האחרון (ספר בסיס, פרק) לפני המקום בטקסט, באותה פסקה, עד 400 תווים אחורה — בשביל "שם"
  const PREV_RX = new RegExp('\\(([א-ת]{2,10}(?: [א-ת]{2,8})?) (HN)(?:[:,] ?(HN))?\\)'.replace(/HN/g, HNR), 'g');
  function prevRef(c) {
    const blk = c.node.parentNode.closest('p,li,.rdRow,.rdRv,article'); if (!blk) return null;
    const rg = document.createRange(); rg.setStart(blk, 0); rg.setEnd(c.node, c.idx);
    const t = rg.toString().slice(-400); let last = null;
    PREV_RX.lastIndex = 0;
    for (let m; (m = PREV_RX.exec(t));) { if (m[1] === 'שם') { const c2 = m[3] ? parseNum(m[2].replace(/["״׳']/g, '')) : NaN; if (last && c2 >= 1) last = { b: last.b, ch: c2 }; continue; } const r = parseRef(IX, m[1] + ' ' + m[2] + (m[3] ? ' ' + m[3] : ''), null); if (r && r.book && IX.owner[r.b] === r.b) last = { b: r.b, ch: r.ch }; }
    return last;
  }
  let REF_RULES = null;
  function refRules() {
    if (REF_RULES) return REF_RULES;
    const tn = TX.list.filter(t => !t.z).map(t => t.name || t.he || '').filter(Boolean);
    const tnames = tn.length ? tn.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : null;
    const ref = (b, ch, v) => ({ x: { kind: 'ref', b, ch, v }, d: { k: 'r', b, ch, v } });
    REF_RULES = [
      { rx: '\\(([א-ת]{2,10}(?: [א-ת]{2,8})?) (HN)(?:[:,] ?(HN))?\\)'.replace(/HN/g, HNR), res: m => { const r = parseRef(IX, m[1] + ' ' + m[2] + (m[3] ? ' ' + m[3] : ''), null); return r && r.book && (m[3] ? r.v : true) && IX.owner[r.b] === r.b ? ref(r.b, r.ch, r.v || 0) : null; } },
      // "(שם כ״ז)" / "(שם י״ח, ד׳)": "שם" = הספר (והפרק) של מראה המקום הקודם באותה פסקה. שני מספרים = פרק ופסוק. מספר אחד = פסוק באותו פרק
      // (אם ההפניה הקודמת הייתה לפרק ולא רק לספר), ואם הפסוק לא קיים — לא מקשרים. בלי הפניה קודמת בטווח — לא מקשרים.
      { rx: '\\(שם (HN)(?:[:,] ?(HN))?\\)'.replace(/HN/g, HNR), res: (m, c) => {
        const pv = prevRef(c); if (!pv) return null;
        let ch, v;
        const pn = x => parseNum(x.replace(/["״׳']/g, ''));
        if (m[2]) { ch = pn(m[1]); v = pn(m[2]); } else if (pv.ch) { ch = pv.ch; v = pn(m[1]); } else return null;
        return Number.isNaN(ch) || Number.isNaN(v) || !(ch >= 1) || !hasRef(IX, pv.b, ch, v) ? null : ref(pv.b, ch, v);
      } },
      { rx: 'הל(?:כות|[\'׳])\\s([א-ת]{2,10}(?: [א-ת]{2,8})?) (?:פרק |פ["״\'׳]?\\s?)?(HN)(?:[ ,]+(?:הלכה |ה["״\'׳]?\\s?)?(HN))?'.replace(/HN/g, HNR), res: m => { const r = parseRef(IX, 'הלכות ' + m[1] + ' ' + m[2] + (m[3] ? ' ' + m[3] : ''), null); return r && r.book && IX.owner[r.b] === r.b ? ref(r.b, r.ch, r.v) : null; } },
      { rx: '(?:או["״]ח|יו["״]ד|אה["״]ע|חו["״]מ|אורח חיים|יורה דעה|אבן העזר|חושן משפט) (?:סימן|סי[׳\'.]?) (HN)'.replace(/HN/g, HNR), res: m => { const r = parseTurRef(RX, m[0].replace(/ (?:סימן|סי[׳\'.]?) /, ' ')); return r && r.s ? { x: { kind: 'tur', k: r.k, s: r.s }, d: { k: 'u', tk: r.k, s: r.s } } : null; } }
    ];
    if (tnames) {
      const tal = m => { const r = parseDafRef(TX, m[1] + ' דף ' + m[2] + (m[3] ? ' ' + m[3] : '')); return r && r.explicit ? { x: { kind: 'tal', k: r.k, j: r.j, s: -1 }, d: { k: 't', tk: r.k, j: r.j } } : null; };
      // "דף ג." בלי שם מסכת בתוך מסכת פתוחה (גמרא, רש״י, תוס׳) → אותה מסכת
      REF_RULES.push({ rx: '(?<![א-ת])דף (HN)(AM)'.replace('HN', HNR).replace('AM', AMR), res: m => {
        const t = isTal() && !isZ() && TX.list.find(x => x.k === S.tk); if (!t || !validNum(m[1])) return null;
        const r = parseDafRef(TX, t.he + ' דף ' + m[1] + (m[2] ? ' ' + m[2] : '')); return r && r.k === t.k ? { x: { kind: 'tal', k: r.k, j: r.j, s: -1 }, d: { k: 't', tk: r.k, j: r.j } } : null; } });
      REF_RULES.push({ rx: '(' + tnames + ') דף (HN)(AM)?'.replace('HN', HNR).replace('AM', AMR), res: tal });
      REF_RULES.push({ rx: '\\((' + tnames + ') (HN)(AM)\\)'.replace('HN', HNR).replace('AM', AMR), res: tal });
    }
    REF_RULES.forEach(r => { r.re = new RegExp(r.rx, 'g'); });
    return REF_RULES;
  }
  function refLinks(root) {
    if (!root || !IX || !TX || !RX) return;
    const rules = refRules(), w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.data.length < 6 || n.parentNode.closest('a,button,script,.rdNum,.rdHead') ? 3 : 1 }), todo = [];
    for (let n; (n = w.nextNode());) todo.push(n);
    todo.forEach(n => {
      const t = n.data, hits = [];
      rules.forEach(r => { r.re.lastIndex = 0; for (let m; (m = r.re.exec(t));) { const o = r.res(m, { node: n, idx: m.index }); if (o) hits.push({ i: m.index, e: m.index + m[0].length, o, tx: m[0] }); if (m[0] === '') r.re.lastIndex++; } });
      if (!hits.length) return;
      hits.sort((a, b) => a.i - b.i || b.e - a.e);
      const frag = document.createDocumentFragment(); let last = 0;
      hits.forEach(hh => {
        if (hh.i < last) return;
        frag.appendChild(document.createTextNode(t.slice(last, hh.i)));
        const a = document.createElement('a'); a.className = 'rdRef'; a.href = hashOfRef(IX, hh.o.x); a.dataset.ref = JSON.stringify(hh.o.d); a.textContent = hh.tx;
        frag.appendChild(a); last = hh.e;
      });
      frag.appendChild(document.createTextNode(t.slice(last))); n.parentNode.replaceChild(frag, n);
    });
  }
  function refLinksInit() {
    ['#rdBook', '#rdSeg'].forEach(sel => {
      const el = $r(sel); if (!el) return;
      let busy = 0; new MutationObserver(() => { if (busy) return; busy = 1; try { refLinks(el); } finally { busy = 0; } }).observe(el, { childList: true, subtree: true });
      refLinks(el);
      el.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a.rdRef'); if (!a) return;
        e.preventDefault(); const d = JSON.parse(a.dataset.ref);
        if ((e.ctrlKey || e.shiftKey || e.metaKey) && G.GT_EMBED && G.parent !== G) G.parent.postMessage({ gtDesk: 'open', hash: a.getAttribute('href'), fresh: 1 }, '*');
        else if (d.k === 't') goTal(d.tk, d.j); else if (d.k === 'u') goTur(d.tk, d.s); else goTo(d.b, d.ch, d.v);
      });
    });
  }
  function goTo(b, ch, v) {
    S.tk = ''; S.rk = ''; closeSeg();
    S.b = b; S.ch = ch; S.anchor = v || versesOf(IX, b, ch)[0] || 1;
    flashV = v || 0; flashKeep = false; render();
  }
  function turn(dir) {
    if (isTur()) return turTurn(dir);
    if (isTal()) return talTurn(dir);
    // np מעבר לסוף הפרק = כמה עמודים של הפרק הבא כבר הוצגו (0 או 1); מתחת לאפס = כמה עמודים לקחת מסוף הפרק הקודם
    const np = S.p + dir * geo.per, pages = pagesRun(S.b, S.ch, pg => np < 0 || pg.length > np).pages; // קדימה: מספיק שהעמוד הבא כבר עומד
    if (np >= 0 && np < pages.length) { S.lock = np; fxDir = dir; render(); return; }
    let b = S.b, ch = S.ch, k = dir > 0 ? np - pages.length : np, len;
    for (;;) {
      const n = nextCh(b, ch, dir); if (!n) return;
      b = n.b; ch = n.ch; const kk = k; len = (dir > 0 ? pagesRun(b, ch, pg => pg.length > kk).pages : pagesFor(b, ch)).length;
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
  const isZ = () => isTal() && !!talT().z; // ספר הזוהר: פרשה בתור "מסכת" (z:1), עמודי וילנא, תרגום והסולם במקום רש״י ותוספות
  const tOf = k => TX.list[TX.byK[k == null ? S.tk : k]];
  const talName = t => isEn() ? (t.z ? t.en : t.k) : t.he;
  const talTitle = t => t.z ? T('זוהר') + ' · ' + talName(t) : T('מסכת') + ' ' + talName(t);
  const dafTxt = (j, k) => {
    const t = tOf(k);
    if (t && t.z) { const x = dafOf(j, t.d0); return isEn() ? x.d + (x.side ? 'b' : 'a') : toHeb(x.d) + ' ע״' + (x.side ? 'ב' : 'א'); }
    return isEn() ? dafLabel(j, true) : dafLabel(j);
  };
  // שמות המקורות בחלון הקטע ובעימוד: בגמרא רש״י ותוספות (או רשב״ם), בזוהר הסולם והתרגום
  const srcLabel = (k, j, src) => { const t = tOf(k); return t && t.z ? T(src === 'r' ? 'הסולם' : 'תרגום') : src === 'r' ? innerLabel(k, j) : T('תוספות'); };
  const amudRow = (k, j) => (TD[k] || [])[j] || [[], [], []];
  const fmtT = s => { // סימוני הדגשה מאוזנים תמיד: סגירה בלי פתיחה נזרקת, ופתיחה שלא נסגרה נסגרת בסוף (אחרת ההדגשה דולפת לעמוד הבא)
    let open = 0; const out = h(s).replace(/[\u0001-\u0004]/g, c => c === '\u0001' || c === '\u0003' ? (open++, c === '\u0001' ? '<b class="big">' : '<b>') : open > 0 ? (open--, '</b>') : '');
    return open > 0 ? out + '</b>'.repeat(open) : out;
  };
  const plainT = s => String(s).replace(/[\u0001-\u0004]/g, '');
  const talTxt = (s, q) => q ? hlHtml(plainT(s), q) : fmtT(s);
  const innerLabel = (k, j) => T(amudRow(k, j)[3] ? 'רשב״ם' : 'רש״י');
  // בזיכרון נשארות רק המסכתות האחרונות שנפתחו (מסכת גדולה = כמה MB); אחרת נטענת שוב מהמטמון של הדפדפן
  const TKEEP = [], TMAX = 3;
  function keepTract(k) {
    const i = TKEEP.indexOf(k); if (i >= 0) TKEEP.splice(i, 1); TKEEP.push(k);
    while (TKEEP.length > TMAX) {
      const old = TKEEP.shift(), TP = G.GIM_TP || {}; if (old === S.tk) { TKEEP.push(old); continue; }
      delete TD[old]; TX.list[TX.byK[old]].parts.forEach((p, i) => { delete TP[old + '.' + i]; }); // (הזוהר: כל פרשה בנפרד, אותו מנגנון)
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
      const sc = document.createElement('script'); sc.src = (t.z ? 'generated/zohar/' : 'generated/talmud/') + p.f;
      sc.onload = () => partDone(i, true); sc.onerror = () => partDone(i, false);
      document.head.appendChild(sc);
    });
  }
  // פירושי עמוד: [{v: קטע, dh, body, src: 'r'|'t'}]
  const zOf = k => { const t = tOf(k); return !!(t && t.z); };
  const zEmpty = (t, j) => T(j < t.j0 ? 'הפרשה מתחילה בעמוד הבא' : 'המשך הפסקה מהעמוד הקודם'); // עמוד בלי פסקאות
  const talCm = (k, j) => {
    const a = amudRow(k, j), l = a[1].map(e => ({ v: e[0], dh: e[1], body: e[2], src: 'r' })).concat(a[2].map(e => ({ v: e[0], dh: e[1], body: e[2], src: 't' })));
    // זוהר: r = הסולם, t = תרגום. בדף מול תרגום — רק המקור שבעמוד השמאלי; בהזוהר והסולם — מה שלא הוסתר בהגדרות
    return !zOf(k) ? l : S.tview === 'daf' ? l.filter(e => e.src === 't' || (S.zsul === '1' && e.src === 'r')) : l.filter(e => e.src === 'r' && !S.zoff.includes('r'));
  };

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
    measured(); DC.set(key, out); trimMap(DC, 40); return out;
  }
  const talHead = (t, j) => t.z
    ? '<header class="rdHead"><span>' + h(T('זוהר') + ' · ' + T('חלק') + ' ' + (isEn() ? t.v : ['', 'א׳', 'ב׳', 'ג׳'][t.v])) + '</span><span class="mid">' + h(talName(t)) + '</span><span' + (isEn() ? ' dir="ltr"' : '') + '>' + h(T('דף') + ' ' + dafTxt(j, t.k)) + '</span></header>'
    : '<header class="rdHead"><span>' + h(T('מסכת') + ' ' + talName(t)) + '</span><span class="mid">' + h(grpName(t.g)) + '</span><span' + (isEn() ? ' dir="ltr"' : '') + '>' + h(dafTxt(j)) + '</span></header>';
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
    const t = TX.list[TX.byK[k]], a = amudRow(k, j), cmCls = t.z || S.cmFont !== 'rashi' ? 'fN' : 'fR';
    const chip = s => '<span class="vn">' + num(s + 1) + '</span>';
    let html = talHead(t, j);
    if (pg.first) html += '<div class="rdChTitle">' + (j === 0 ? '<span class="bk">' + h(talTitle(t)) + '</span>' : '') + '<span class="ch">' + h(T('דף') + ' ' + dafTxt(j, k)) + '</span></div>';
    html += '<div class="rdBody"><div class="rdTxt rdTal"><p>' + (pg.segs.length || !t.z ? pg.segs.map(s => '<span class="rdV tg" data-j="' + j + '" data-s="' + s + '">' + chip(s) + talTxt(a[0][s], q) + '</span>').join(' ') : '<span class="rdCont">' + h(zEmpty(t, j)) + '</span>') + '</p></div></div><div class="rdSp"></div>';
    (t.z ? [['t', T('תרגום')], ['r', T('הסולם')]] : [['r', innerLabel(k, j)], ['t', T('תוספות')]]).forEach(([src, label]) => {
      const list = pg.cm.filter(e => e.src === src); if (!list.length) return;
      html += '<section class="rdCm ' + cmCls + '" aria-label="' + h(label) + '"><div class="rdCmHd"><span class="ln"></span><span>' + h(label) + '</span></div><div class="rdCmBody">' +
        list.map(e => '<p class="tc ' + (src === 't' ? 'cT' : 'cR') + (e.cont ? ' cont' : '') + '" data-j="' + j + '" data-s="' + e.v + '"><span class="cv">' + num(e.v + 1) + '</span>' + (e.cont ? '<span class="rdCont">…</span> ' : '') + (e.dh ? '<b>' + talTxt(e.dh, q) + '</b> ' : '') + talTxt(e.body, q) + (e.cut ? ' <span class="rdCont">…</span>' : '') + '</p>').join('') + '</div></section>';
    });
    return html + '<div class="rdNum">' + h(dafTxt(j, k)) + '</div>';
  }
  /* זוהר, "דף מול תרגום": עמוד ימין = הארמית של העמוד בדפוס וילנא, עמוד שמאל = התרגום (או הסולם, לפי ההגדרה), פסקה מול פסקה.
     side: 'a' = עמוד הארמית, 'b' = עמוד הצד, 's' = עמוד אחד (מסך צר): אחרי כל פסקה — התרגום שלה. pg = {segs, first, cm} כמו בגמרא ומפרשים. */
  function zdInner(k, j, pg, q, side) {
    const t = tOf(k), a = amudRow(k, j), chip = s => '<span class="vn">' + num(s + 1) + '</span>';
    const ent = e => '<p class="tc ' + (e.src === 't' ? 'cT' : 'cR') + (e.cont ? ' cont' : '') + '" data-j="' + j + '" data-s="' + e.v + '">' + (e.k2 ? '' : '<span class="cv">' + num(e.v + 1) + '</span>') + (e.cont ? '<span class="rdCont">…</span> ' : '') + (e.dh ? '<b>' + talTxt(e.dh, q) + '</b> ' : '') + talTxt(e.body, q) + (e.cut ? ' <span class="rdCont">…</span>' : '') + '</p>';
    const rg = s => (pg.rng && pg.rng[s]) || null;
    const para = s => { const r = rg(s); return '<span class="rdV tg" data-j="' + j + '" data-s="' + s + '">' + (r && r[0] > 0 ? '<span class="rdCont">…</span> ' : chip(s)) + talTxt(r ? wSlice(a[0][s], r[0], r[1]) : a[0][s], q) + (r && r[1] < 1 ? ' <span class="rdCont">…</span>' : '') + '</span>'; };
    const none = '<p class="none">' + T(S.zside === 'r' ? 'אין ביאור לפסקאות אלה' : 'אין תרגום לפסקאות אלה') + '</p>';
    let html = talHead(t, j);
    if (pg.first && side !== 'b') html += '<div class="rdChTitle">' + (j === 0 ? '<span class="bk">' + h(talTitle(t)) + '</span>' : '') + '<span class="ch">' + h(T('דף') + ' ' + dafTxt(j, k)) + '</span></div>';
    const E = talCm(k, j), R = pg.rows || [];
    const aCell = r => r.f1 <= r.f0 ? '' : '<span class="rdV tg" data-j="' + j + '" data-s="' + r.s + '">' + (r.f0 <= 0 ? chip(r.s) : r.top ? '<span class="rdCont">…</span> ' : '') + talTxt(wSlice(a[0][r.s], r.f0, r.f1), q) + (r.bot ? ' <span class="rdCont">…</span>' : '') + '</span>';
    const tCell = r => r.t1 <= r.t0 ? '' : E.filter(e => e.v === r.s && e.src === 't').map(e => { const body = wSlice(e.body, r.t0, r.t1); return body.trim() ? ent(Object.assign({}, e, { body, dh: r.t0 > 0 ? '' : e.dh, cont: r.ttop, cut: r.tbot, k2: r.t0 > 0 })) : ''; }).join('');
    const tail = '', SL = pg.cm.filter(e => e.src === 'r'), TL = pg.cm.filter(e => e.src === 't');
    const strip = list => list.length ? '<div class="rdSp"></div><section class="rdCm fN zSul" aria-label="' + h(T('הסולם')) + '"><div class="rdCmHd"><span class="ln"></span><span>' + h(T('הסולם')) + '</span></div><div class="rdCmBody">' + list.map(ent).join('') + '</div></section>' : '';
    const half = i => { if (side === 'c' || !SL.length) return SL; const tot = SL.reduce((x, e) => x + cmLen(e), 0), c = cutCm(SL, Math.ceil(tot / 2)); return c[i]; }; // בספר פתוח הסולם זורם מתחתית עמוד הארמית לתחתית עמוד התרגום
    const sideLb = T(S.zside === 'r' ? 'הסולם' : 'תרגום');
    if (side === 'c') return html + '<div class="rdBody"><div class="rdTxt rdTal zCols"><div class="zColHd">' + h(T('ארמית')) + '</div><div class="zColHd">' + h(sideLb) + '</div>' + (R.length ? R.map((r, x) => '<div class="zA' + (r.f1 >= 1 ? ' ze' : '') + '">' + aCell(r) + '</div><div class="zT' + (r.t1 >= 1 ? ' ze' : '') + '">' + (tCell(r) || (!x && !TL.length ? none : '')) + '</div>').join('') : '<div class="zA"><span class="rdCont">' + h(zEmpty(t, j)) + '</span></div><div class="zT"></div>') + '</div></div>' + strip(half(0)) + '<div class="rdNum">' + h(dafTxt(j, k)) + '</div>';
    if (side === 'b') return html + '<div class="rdCmHd zHd"><span class="ln"></span><span>' + h(T(S.zside === 'r' ? 'הסולם' : 'תרגום')) + '</span></div><div class="rdBody"><div class="rdTxt rdTal zSide">' + R.map((r, x) => '<div class="zr' + (r.t1 >= 1 ? ' ze' : '') + '" data-r="' + x + '">' + (tCell(r) || (!x && !TL.length ? none : '')) + '</div>').join('') + '</div></div>' + strip(half(1)) + '<div class="rdNum">' + h(dafTxt(j, k)) + '</div>';
    if (side === 'a') return html + '<div class="rdBody"><div class="rdTxt rdTal">' + (R.length ? R.map((r, x) => '<p class="zr' + (r.f1 >= 1 ? ' ze' : '') + '" data-r="' + x + '">' + aCell(r) + '</p>').join('') : '<p><span class="rdCont">' + h(zEmpty(t, j)) + '</span></p>') + '</div></div>' + strip(half(0)) + '<div class="rdNum">' + h(dafTxt(j, k)) + '</div>';
    return html + '<div class="rdBody"><div class="rdTxt rdTal zOne">' + (pg.segs.length ? pg.segs.map(s => '<p class="zp">' + para(s) + '</p>' + pg.cm.filter(e => e.v === s).map(ent).join('')).join('') : '<p class="zp"><span class="rdCont">' + h(zEmpty(t, j)) + '</span></p>') + tail + '</div></div><div class="rdNum">' + h(dafTxt(j, k)) + '</div>';
  }
  /* זוהר, ספר פתוח: שורה מול שורה. כל פסקה בעמוד הארמית ותרגומה בעמוד שמול מקבלות אותו גובה, וראשי העמודים מיושרים.
     apply = לקבוע בפועל (גם במדידת החלוקה לעמודים, כדי שהגלישה תימדד אחרי היישור); מחזיר כמה גובה נוסף נדרש לכל עמוד. */
  function zAlign(a, b, apply) {
    const A = {}, B = {}; a.querySelectorAll('.zr').forEach(e => A[e.dataset.r] = e); b.querySelectorAll('.zr').forEach(e => B[e.dataset.r] = e);
    let ea = 0, eb = 0;
    Object.keys(A).forEach(r => { if (!B[r]) return; const ha = A[r].offsetHeight, hb = B[r].offsetHeight, m = Math.max(ha, hb); ea += m - ha; eb += m - hb; if (apply) { A[r].style.minHeight = B[r].style.minHeight = m + 'px'; } });
    const fa = a.querySelector('.zr'), fb = b.querySelector('.zr');
    if (fa && fb) { const d = Math.round((fb.getBoundingClientRect().top - b.getBoundingClientRect().top) - (fa.getBoundingClientRect().top - a.getBoundingClientRect().top)); if (d > 0) { ea += d; if (apply) fa.style.marginTop = d + 'px'; } else if (d < 0) { eb -= d; if (apply) fb.style.marginTop = -d + 'px'; } }
    return [ea, eb];
  }
  /* זוהר: חלוקה לעמודים שממלאת את גובה העמוד. פסקה שלא נכנסת כולה נחתכת באמצע (במילים): הארמית והתרגום נחתכים באותו יחס,
     והמשכה בראש העמוד הבא. rng[s] = [מאיפה, עד איפה] כשבר מהפסקה. */
  function wSlice(t, f0, f1) {
    const w = t.split(' '), n = w.length, A = Math.round(f0 * n), B = f1 >= 1 ? n : Math.round(f1 * n);
    let bold = false; const scan = x => { for (const c of x) { if (c === '\u0003') bold = true; else if (c === '\u0004') bold = false; } };
    scan(w.slice(0, A).join(' ')); const open = bold, body = w.slice(A, B).join(' '); scan(body);
    return (open ? '\u0003' : '') + body + (bold ? '\u0004' : '');
  }
  /* זוהר: חלוקה לעמודים לפי שורות אמיתיות. מודדים בדף כמה שורות תופסת כל פסקה (ארמית ותרגום, ברוחב העמוד או הטור), וחותכים אותה
     לקטעים של שתי שורות שלמות מכל צד. כך כל שורה מלאה לרוחבה, שורות הארמית והתרגום מיושרות זו מול זו, והעמוד מתמלא לגובהו.
     הפסקה שנגמרה בצד אחד לפני השני משאירה שם תא ריק, ומיד אחריה מתחילה הפסקה הבאה. */
  function zdPages(k, j, g, probe, a, ents, two) {
    const N = a[0].length, pages = [], LN = S.zsul === '1' ? 1 : 2, mode = two ? 'a' : g.zc ? 'c' : 's';
    const units = [];
    const toks = t => { const n = t.split(' ').length; return Array.from({ length: n }, (_, i) => talTxt(wSlice(t, i / n, (i + 1) / n), '')); };
    const lineStarts = els => { const tops = els.map(e => Math.round(e.getBoundingClientRect().top)), st = [0]; for (let i = 1; i < tops.length; i++) if (tops[i] > tops[i - 1] + 3) st.push(i); return st; };
    const wrap = (tk, chip) => (chip || '') + tk.map(x => '<i class="mw">' + x + '</i>').join(' ');
    const measure = (s) => { // לכל צד: מספרי המילים שפותחות שורה
      const t = ents.filter(e => e.v === s && e.src === 't').sort((x, y) => y.body.length - x.body.length)[0], ta = toks(a[0][s]), tt = t ? toks(t.body) : [];
      const ca = wrap(ta, '<span class="vn">' + num(s + 1) + '</span> '), ct = wrap(tt, '<span class="cv">' + num(s + 1) + '</span> ');
      let ha, ht;
      if (mode === 'c') { probe.innerHTML = '<div class="rdBody"><div class="rdTxt rdTal zCols"><div class="zA">' + ca + '</div><div class="zT"><p class="tc cT">' + ct + '</p></div></div></div>'; ha = probe.querySelectorAll('.zA i.mw'); ht = probe.querySelectorAll('.zT i.mw'); return [lineStarts([...ha]), lineStarts([...ht]), ta.length, tt.length]; }
      probe.innerHTML = '<div class="rdBody"><div class="rdTxt rdTal"><p class="zr">' + ca + '</p></div></div>'; const la = lineStarts([...probe.querySelectorAll('i.mw')]);
      probe.innerHTML = '<div class="rdBody"><div class="rdTxt rdTal zSide"><div class="zr"><p class="tc cT">' + ct + '</p></div></div></div>'; const lt = tt.length ? lineStarts([...probe.querySelectorAll('i.mw')]) : [];
      return [la, lt, ta.length, tt.length];
    };
    for (let s = 0; s < N; s++) {
      if (mode === 's') { const nw = a[0][s].split(' ').length, m = Math.max(1, Math.round(nw / 14)); for (let x = 0; x < m; x++) units.push({ s, f0: x / m, f1: x + 1 < m ? (x + 1) / m : 1, t0: x / m, t1: x + 1 < m ? (x + 1) / m : 1 }); continue; }
      const [la, lt, na, nt] = measure(s), R = Math.max(1, Math.ceil(la.length / LN), Math.ceil(lt.length / LN));
      const fr = (st, n, r) => { const i = r * LN, w0 = i < st.length ? st[i] : n, w1 = i + LN < st.length ? st[i + LN] : n; return [n ? w0 / n : 1, n ? w1 / n : 1]; };
      for (let r = 0; r < R; r++) { const fa = fr(la, na, r), ft = nt ? fr(lt, nt, r) : [1, 1]; units.push({ s, f0: fa[0], f1: fa[1], t0: ft[0], t1: ft[1] }); }
    }
    /* הסולם זורם בנפרד משורות הטקסט: sulPos[s] = כמה מהסולם של הפסקה כבר הוצג בעמודים הקודמים (שבר). העמוד מקבל את חלקו היחסי של הסולם
       לפי השורות שבו, ואחר כך מוסיפים מילים מהמשך הסולם עד שהעמוד מתמלא (ext), והן לא יחזרו בעמוד הבא. */
    const sulPos = {}, nS = {};
    for (let s = 0; s < N; s++) nS[s] = Math.max(0, ...ents.filter(e => e.v === s && e.src === 'r').map(e => cmLen(e)));
    const mk = (list, ext) => {
      const rows = list.map((u, x) => Object.assign({}, u, { top: !x && u.f0 > 0 && u.f0 < 1, bot: x === list.length - 1 && u.f1 < 1 && u.f1 > u.f0, ttop: !x && u.t0 > 0 && u.t0 < 1, tbot: x === list.length - 1 && u.t1 < 1 && u.t1 > u.t0 })), segs = [], rng = {}, sr = {};
      rows.forEach(r => { if (!segs.includes(r.s)) segs.push(r.s); if (r.f1 <= r.f0 && rng[r.s]) return; const c = rng[r.s]; rng[r.s] = c ? [Math.min(c[0], r.f0), Math.max(c[1], r.f1)] : [r.f0, r.f1]; });
      segs.forEach(sg => { const r = rng[sg]; sr[sg] = [sulPos[sg] != null ? sulPos[sg] : r[0], r[1]]; });
      if (ext) { if (sr[ext.s]) sr[ext.s][1] = Math.max(sr[ext.s][1], ext.to); else sr[ext.s] = [sulPos[ext.s] != null ? sulPos[ext.s] : 0, ext.to]; }
      Object.keys(rng).forEach(x => { if (rng[x][0] <= 0 && rng[x][1] >= 1) delete rng[x]; });
      const order = segs.concat(ext && !segs.includes(ext.s) ? [ext.s] : []);
      const cm = [].concat(...order.map(sg => ents.filter(e => e.v === sg).map(e => {
        if (e.src === 'r') { const q = sr[sg]; if (!q || q[1] <= q[0]) return null; return q[0] <= 0 && q[1] >= 1 ? e : Object.assign({}, e, { body: wSlice(e.body, q[0], q[1]), cont: q[0] > 0, cut: q[1] < 1 }); }
        const r = rng[sg]; return r ? Object.assign({}, e, { body: wSlice(e.body, r[0], r[1]), cont: r[0] > 0, cut: r[1] < 1 }) : e;
      }))).filter(Boolean);
      return { segs, rows, rng, first: !pages.length, cm, sr };
    };
    const fits = pg => {
      if (!two) { probe.innerHTML = zdInner(k, j, pg, '', g.zc ? 'c' : 's'); return !over(probe); }
      probe.innerHTML = zdInner(k, j, pg, '', 'a'); if (over(probe)) return false;
      const ha = probe.cloneNode(true); ha.id = ''; ha.style.visibility = 'hidden'; probe.parentNode.insertBefore(ha, probe);
      probe.innerHTML = zdInner(k, j, pg, '', 'b'); zAlign(ha, probe, true); const ok = !over(probe) && !over(ha); ha.remove();
      return ok;
    };
    for (let i = 0; i < units.length && pages.length < 300;) {
      let n = maxOkF(1, units.length - i, m => fits(mk(units.slice(i, i + m))));
      for (let x = 0; x < 16 && i + n < units.length && fits(mk(units.slice(i, i + n + 1))); x++) n++; // המדידה לא תמיד מונוטונית (יישור שורות, חלוקת הסולם): ממשיכים קדימה כל עוד נכנס
      const list = units.slice(i, i + n); let ext = null;
      if (S.zsul === '1') { // ממלאים את שארית העמוד במילים מהמשך הסולם (של הפסקה האחרונה, ואם נגמרה — של הבאה)
        const base = mk(list), last = list[list.length - 1], nxt = units[i + n], es = last && base.sr[last.s] && base.sr[last.s][1] < 1 ? last.s : nxt ? nxt.s : null;
        if (es != null && nS[es] > 1) { const from = base.sr[es] ? base.sr[es][1] : (sulPos[es] != null ? sulPos[es] : 0), left = Math.floor((1 - from) * nS[es]);
          const w = left > 0 ? maxOkF(0, left, w => !w || fits(mk(list, { s: es, to: from + w / nS[es] }))) : 0; if (w > 0) ext = { s: es, to: from + w / nS[es] }; }
      }
      const pg = mk(list, ext); pages.push(pg); i += n;
      Object.keys(pg.sr).forEach(x => { sulPos[x] = Math.max(sulPos[x] != null ? sulPos[x] : 0, pg.sr[x][1]); });
    }
    probe.innerHTML = ''; return pages;
  }
  function studyPages(k, j, g) {
    const tt = tOf(k), zd = !!tt.z && S.tview === 'daf', two = zd && !!g.two && !g.zc;
    const key = 'T' + k + ':' + j + '|' + g.key + (tt.z ? '|' + S.tview + S.zside + S.zlay + S.zsul + S.zoff.join('') : ''); if (PC.has(key)) return PC.get(key);
    const probe = $r('#rdProbe'), a = amudRow(k, j), ents = talCm(k, j), pages = [];
    probe.className = 'rdPage tal' + g.cls;
    if (zd && a[0].length) { const zp = zdPages(k, j, g, probe, a, ents, two); PC.set(key, zp); trimMap(PC, 60); return zp; }
    let carry = [];
    const mk = (segs, cut) => { const all = carry.concat(...segs.map(s => ents.filter(e => e.v === s))); return { segs, first: !pages.length, cm: cut == null ? all : cutCm(all, cut)[0] }; };
    const fits = (segs, cut) => {
      const pg = mk(segs, cut);
      if (!zd) { probe.innerHTML = studyInner(k, j, pg, ''); return !over(probe); }
      if (!two) { probe.innerHTML = zdInner(k, j, pg, '', g.zc ? 'c' : 's'); return !over(probe); }
      probe.innerHTML = zdInner(k, j, pg, '', 'a'); if (over(probe)) return false;
      const ha = probe.cloneNode(true); ha.id = ''; ha.style.visibility = 'hidden'; probe.parentNode.insertBefore(ha, probe);
      probe.innerHTML = zdInner(k, j, pg, '', 'b'); zAlign(ha, probe, true); const ok = !over(probe) && !over(ha); ha.remove();
      return ok;
    };
    if (tt.z && !a[0].length) { const pg = { segs: [], first: true, cm: [] }; PC.set(key, [pg]); return [pg]; } // עמוד בלי פסקאות (פסקה ארוכה שנמשכת מהעמוד הקודם)
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
    const t = talT(), k = t.k, book = $r('#rdBook'), zd = !!t.z && S.tview === 'daf';
    book.className = 'rdBook' + (geo.two ? ' two' : ' one');
    const setBar = () => {
      $r('#rdWhereTxt').textContent = (t.z ? T('זוהר') + ' ' + talName(t) + ' · ' : talName(t) + ' · ' + T('דף') + ' ') + dafTxt(S.tj, k);
      $r('#rdPrevCh').setAttribute('aria-label', T('דף קודם')); $r('#rdNextCh').setAttribute('aria-label', T('דף הבא'));
      $r('#rdPrevCh').title = T('דף קודם'); $r('#rdNextCh').title = T('דף הבא');
      $r('#rdChPos').textContent = talTitle(t);
      $r('#rdProgBar').style.width = Math.max(2, Math.round(100 * (S.tj + 1) / t.n)) + '%';
      $r('#rdPrevCh').disabled = S.tj < 2; $r('#rdNextCh').disabled = (S.tj | 1) + 1 >= t.n;
    };
    if (!TD[k]) {
      setBar(); $r('#rdPos').textContent = '';
      book.innerHTML = loadingHtml(k, talTitle(t), geo);
      loadTract(k, ok => { if (!ok) book.innerHTML = '<article class="rdPage single rdLoading' + geo.cls + '"><p>' + T(t.z ? 'לא ניתן לטעון את הפרשה.' : 'לא ניתן לטעון את המסכת.') + '</p></article>'; else if (S.tk !== k) return; else if (S.sel) goTal(k, S.sel.j, S.sel.s); else render(); });
      return;
    }
    S.tj = Math.max(0, Math.min(S.tj, t.n - 1));
    let html = '', from = S.tj, last = S.tj, lastPg = null;
    if (S.tview === 'daf' && !t.z) {
      if (geo.two) { from = S.tj - (S.tj & 1); last = Math.min(from + 1, t.n - 1); html = dafPage(k, from, 'right', geo, S.hl) + dafPage(k, from + 1, 'left', geo, S.hl); }
      else html = dafPage(k, S.tj, 'single', geo, S.hl);
      $r('#rdPos').textContent = (from !== last ? T('עמודים') + ' ' + dafTxt(from) + '–' + dafTxt(last) : T('עמוד') + ' ' + dafTxt(from)) + ' ' + T('מתוך') + ' ' + dafTxt(t.n - 1);
    } else {
      const ps = studyPages(k, S.tj, geo); if (S.tp >= ps.length) S.tp = ps.length - 1;
      const shown = [{ j: S.tj, p: S.tp }]; if (geo.two && (!zd || geo.zc)) { const n = stNext(k, S.tj, S.tp, 1, geo); if (n) shown.push(n); }
      const side = i => geo.two ? (i ? 'left' : 'right') : 'single';
      if (zd && !geo.zc) { // דף מול תרגום: מסך אחד = עמוד ארמית (ימין) ועמוד תרגום (שמאל)
        const pg = ps[S.tp];
        html = geo.two ? '<article class="rdPage tal right' + geo.cls + '" aria-label="' + h(T('דף') + ' ' + dafTxt(S.tj, k)) + '">' + zdInner(k, S.tj, pg, S.hl, 'a') + '</article><article class="rdPage tal left' + geo.cls + '">' + zdInner(k, S.tj, pg, S.hl, 'b') + '</article>'
          : '<article class="rdPage tal single' + geo.cls + (geo.zc ? ' zWide' : '') + '">' + zdInner(k, S.tj, pg, S.hl, geo.zc ? 'c' : 's') + '</article>';
      } else html = shown.map((x, i) => '<article class="rdPage tal ' + side(i) + geo.cls + '">' + (zd ? zdInner(k, x.j, studyPages(k, x.j, geo)[x.p], S.hl, 'c') : studyInner(k, x.j, studyPages(k, x.j, geo)[x.p], S.hl)) + '</article>').join('') + (geo.two && shown.length < 2 ? '<article class="rdPage left blank' + geo.cls + '" aria-hidden="true"></article>' : '');
      last = shown[shown.length - 1].j; lastPg = shown[shown.length - 1];
      $r('#rdPos').textContent = T('עמוד') + ' ' + dafTxt(S.tj, k) + (last !== S.tj ? '–' + dafTxt(last, k) : '') + ' ' + T('מתוך') + ' ' + dafTxt(t.n - 1, k) + (t.z && ps.length > 1 ? ' · ' + num(S.tp + 1) + '/' + num(ps.length) : '');
    }
    book.innerHTML = html + (geo.two ? '<div class="rdSpine" aria-hidden="true"></div>' : '');
    if (zd && geo.two) { const pgs = book.querySelectorAll('.rdPage'); if (pgs.length > 1) zAlign(pgs[0], pgs[1], true); }
    book.querySelectorAll('.rdPage').forEach(p => { if (over(p)) p.classList.add('tight'); });
    fxAfter(book);
    setBar();
    const dafV = S.tview === 'daf' && !t.z;
    const atStart = dafV ? from === 0 : !stNext(k, S.tj, S.tp, -1, geo);
    const atEnd = dafV ? (geo.two ? from + 2 >= t.n : S.tj + 1 >= t.n) : !stNext(k, lastPg.j, lastPg.p, 1, geo);
    ['#rdPrev', '#rdPrev2'].forEach(s => { $r(s).disabled = atStart; });
    ['#rdNext', '#rdNext2'].forEach(s => { $r(s).disabled = atEnd; });
    markSel();
    save();
  }
  function talTurn(dir) {
    const t = talT();
    if (S.tview === 'daf' && !t.z) { const step = geo.two ? 2 : 1, base = geo.two ? S.tj - (S.tj & 1) : S.tj, n = base + dir * step; if (n < 0 || n >= t.n) return; S.tj = n; S.tp = 0; fxDir = dir; return render(); }
    let x = { j: S.tj, p: S.tp };
    for (let i = 0; i < (geo.two && !(t.z && S.tview === 'daf' && !geo.zc) ? 2 : 1); i++) { const n = stNext(t.k, x.j, x.p, dir, geo); if (!n) { if (i === 0) return; break; } x = n; }
    S.tj = x.j; S.tp = x.p; fxDir = dir; render();
  }
  function talStep(dir) { const t = talT(), base = S.tj - (S.tj & 1), n = base + dir * 2; if (n < 0 || n >= t.n) return; S.tj = n; S.tp = 0; fxDir = dir; render(); }
  function goTal(k, j, s) {
    S.rk = ''; S.tk = k; S.tj = j || 0; S.tp = 0; closeSeg();
    if (s != null) S.sel = { j: S.tj, s }; // אם המסכת עוד לא נטענה — החלון ייפתח אחרי הטעינה
    render();
    if (s == null || !TD[k]) return;
    if (S.tview === 'study' || isZ()) { const p = studyPages(k, S.tj, geo).findIndex(pg => pg.segs.includes(s)); if (p > 0) { S.tp = p; render(); } }
    openSeg(S.tj, s);
  }

  /* חלון הקטע: הקטע שנבחר ופירושיו (רש״י / תוספות), בגודל קריא — בצורת הדף האותיות קטנות */
  let segTab = 'r', zTabSet = false;
  function markSel() {
    R.querySelectorAll('.rdBook .sel').forEach(e => e.classList.remove('sel'));
    if (!S.sel || !isTal()) return;
    R.querySelectorAll('.rdBook [data-j="' + S.sel.j + '"][data-s="' + S.sel.s + '"]').forEach(e => e.classList.add('sel'));
  }
  function closeSeg() { const p = $r('#rdSeg'), was = S.sel || S.rsel; if (p) p.hidden = true; S.sel = null; S.rsel = null; if (R) markSel(); if (was) syncHash(); }
  function openSeg(j, s) {
    if (!TD[S.tk]) return;
    S.sel = { j, s }; markSel(); syncHash();
    const a = amudRow(S.tk, j), rl = a[1].filter(e => e[0] === s), tl = a[2].filter(e => e[0] === s);
    if (segTab === 'r' && !rl.length && tl.length) segTab = 't'; else if (segTab === 't' && !tl.length && rl.length) segTab = 'r';
    const zt = talT().z;
    if (zt && !zTabSet) { zTabSet = true; segTab = tl.length ? 't' : 'r'; }
    const list = segTab === 'r' ? rl : tl, cmCls = !zt && S.cmFont === 'rashi' ? 'fR' : 'fN';
    const tab = (k, label, n) => '<button type="button" class="' + (segTab === k ? 'on' : '') + '" data-segtab="' + k + '" aria-pressed="' + (segTab === k) + '"' + (n ? '' : ' disabled') + '>' + h(label) + ' · ' + n + '</button>';
    const p = $r('#rdSeg');
    p.innerHTML = '<div class="rdPopHd"><span>' + h((zt ? talTitle(talT()) : talName(talT())) + ' ' + dafTxt(j) + ' · ' + T(zt ? 'פסקה' : 'קטע') + ' ' + num(s + 1)) + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<p class="rdSegTxt">' + fmtT(a[0][s] || '') + '</p>' +
      '<div class="rdSegTabs" role="group">' + (zt ? tab('t', T('תרגום'), tl.length) + tab('r', T('הסולם'), rl.length) : tab('r', innerLabel(S.tk, j), rl.length) + tab('t', T('תוספות'), tl.length)) + '</div>' +
      '<div class="rdSegList ' + cmCls + '">' + (list.length ? list.map(e => '<p>' + (e[1] ? '<b>' + fmtT(e[1]) + '</b> ' : '') + fmtT(e[2]) + '</p>').join('') : '<p class="none">' + T(zt ? 'אין תרגום או ביאור לפסקה זו' : 'אין פירוש על קטע זה') + '</p>') + '</div>' +
      '<div class="rdSegNav"><button type="button" data-segmove="-1">' + ICON.chevR + ' ' + T(zt ? 'הפסקה הקודמת' : 'הקטע הקודם') + '</button><button type="button" data-segmove="1">' + T(zt ? 'הפסקה הבאה' : 'הקטע הבא') + ' ' + ICON.chevL + '</button></div>';
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
  let RX = null, MEAS = false, TURQ = false; // MEAS: בעימוד כל אסימון של זרם עטוף ב-<u>, כדי למדוד את כולם בפריסה אחת
  // TURQ: בזמן בניית עמוד להצגה (לא במדידה) — מסמנים את מילות החיפוש (S.hl) בטור ובמפרשים
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
  // חלקי הטור בזיכרון: אלה שהמסך צריך עכשיו, ועוד TUR_KEEP האחרונים (חלק = בערך 2MB); השאר נטענים שוב כשצריך
  const TUR_KEEP = 4, TUR_RECENT = [];
  function keepTur(ids) {
    ids.forEach(id => { const i = TUR_RECENT.indexOf(id); if (i >= 0) TUR_RECENT.splice(i, 1); TUR_RECENT.push(id); });
    while (TUR_RECENT.length > Math.max(TUR_KEEP, new Set(ids).size)) { const id = TUR_RECENT.shift(); if (!ids.includes(id) && G.GIM_TUR_P) delete G.GIM_TUR_P[id]; }
  }
  function loadTur(k, ss, done) {
    const t = turTOf(k), TP = G.GIM_TUR_P || (G.GIM_TUR_P = {});
    const need = [...new Set(ss.filter(s => s >= minS(t) && s < t.n).map(s => turPart(t, s)))].filter(p => !TP[k + '.' + p]);
    const fin = ok => { if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('16px GimFrank', 'אב'), document.fonts.load('16px GimRashi', 'אב')]).then(() => done(ok), () => done(ok)); else done(ok); };
    keepTur(ss.filter(s => s >= minS(t) && s < t.n).map(s => k + '.' + turPart(t, s)));
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
    const off = S.rOff.join(''), key = k + ':' + s + '|' + off; if (TMC.has(key)) return TMC.get(key);
    const row = turRow(k, s), tt = turToks(row[0]), st = {}, on = x => !off.includes(x);
    // כותרת "הלכות …" מודגשת בתחילת הסימן (בשורה משלה) — מוצגת ככותרת העמוד ולא כחלק מהטקסט
    let hd = '', a = 0; while (a < tt.length && ANC.test(tt[a])) a++;
    if (tt[a] && tt[a][0] === '\u0003') {
      let e = a; while (e < tt.length && !tt[e].includes('\u0004')) e++;
      const t = tt.slice(a, e + 1).join(' ').replace(/[\u0003\u0004]/g, '').trim();
      if (e < tt.length && tt[e].endsWith('\u0004') && tt[e + 1] === '\n' && /^(הלכות|דיני|סימני) /.test(t) && t.length < 50) { hd = t; tt.splice(a, e + 2 - a); }
    }
    ['y', 'c'].forEach((x, n) => {
      const toks = [], cs = [], ce = [];
      const list = on(x) ? row[n + 1] || [] : []; // מפרש מוסתר (הגדרות תצוגה) = זרם ריק, וגם הסימנים שלו בטור לא מוצגים
      list.forEach((c, i) => { cs[i] = toks.length; if (c) { toks.push('\u0010' + x + i + '\u0011'); toks.push(...turToks(c)); } ce[i] = toks.length; });
      st[x] = { toks, cs, ce, anc: [], n: list.length };
    });
    tt.forEach((w, i) => { const m = ANC.exec(w); if (m && on(m[1]) && st[m[1]].anc[+m[2]] == null) st[m[1]].anc[+m[2]] = i; });
    ['y', 'c'].forEach(x => { const z = st[x]; z.allow = te => { if (te >= tt.length) return z.toks.length; for (let i = 0; i < z.n; i++) if ((z.anc[i] || 0) >= te) return z.cs[i]; return z.toks.length; }; });
    // נקודות חיתוך בטור: תחילת כל רצף של סימנים (לא חותכים בין שני סימנים צמודים), וסוף הסימן
    const cuts = []; tt.forEach((w, i) => { if (i > 0 && ANC.test(w) && !ANC.test(tt[i - 1])) cuts.push(i); }); cuts.push(tt.length);
    const m = { k, s, tt, st, cuts, hd, empty: (x, i) => !on(x) || !(row[x === 'y' ? 1 : 2] || [])[i] };
    TMC.set(key, m); trimMap(TMC, 40); return m;
  }
  // HTML לאסימונים [a, b) של זרם; from = תחילת הדיבור (או הטור), שממנה מחושב מצב ההדגשה בנקודה a
  function tokHtml(m, toks, a, b, from, inTur) {
    let bold = false, bh = false;
    for (let i = from; i < a; i++) { const w = toks[i]; if (/[\u0003-\u0006]/.test(w)) for (const c of w) { if (c === '\u0003') bold = true; else if (c === '\u0004') bold = false; else if (c === '\u0005') bh = true; else if (c === '\u0006') bh = false; } }
    const out = [(bh ? '<span class="bh">' : '') + (bold ? '<b>' : '')];
    const mk = TURQ && !MEAS ? turHl(m) : null, ms = mk && (toks === m.tt ? mk.t : toks === m.st.y.toks ? mk.y : mk.c);
    const conv = x => h(x).replace(/[\u0003-\u0006]/g, c => c === '\u0003' ? (bold = true, '<b>') : c === '\u0004' ? (bold = false, '</b>') : c === '\u0005' ? (bh = true, '<span class="bh">') : (bh = false, '</span>'));
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
      if (ms && ms.has(i)) { const r = /^([\u0003-\u0006]*)([^]*?)([\u0003-\u0006]*)$/.exec(w); out.push(conv(r[1]) + '<mark class="rdHl">' + conv(r[2]) + '</mark>' + conv(r[3])); continue; }
      out.push(conv(w));
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
  // מפרש אחד בלבד (השני מוסתר): הטור בחצי הימני למעלה, והפירוש ברוחב מלא מקיף אותו משמאל וממשיך מתחתיו
  const turOne = () => S.rOff.length === 1;
  function trDafGeo(g) {
    const gk = g.key + '|' + S.size + '|' + S.rOff.join('');
    if (TGC.has(gk)) return TGC.get(gk);
    const probe = $r('#rdProbe'); probe.className = 'rdPage tal tur' + g.cls;
    probe.innerHTML = '<header class="rdHead"><span>א</span><span class="mid">א</span><span>א</span></header><div class="rdDaf"></div><div class="rdNum">א</div>';
    const b = probe.querySelector('.rdDaf'), W = Math.floor(b.clientWidth), H = Math.floor(b.clientHeight) - 3; probe.innerHTML = '';
    const sc = Math.min(1.12, Math.max(0.62, W / 600)) * (1 + S.size * 0.1), r2 = v => Math.round(v * 100) / 100;
    const fm = r2(15.5 * sc), fs = r2(Math.max(9, 11.4 * sc)), gap = Math.max(8, Math.round(13 * sc)), one = turOne();
    const mw = one ? Math.floor((W - gap) / 2) : Math.round(W * (W < 470 ? 0.42 : 0.36));
    const out = { W, H, fm, fs, lm: r2(fm * 1.45), ls: r2(fs * 1.4), gap, mw, sw: one ? W : Math.floor((W - gap) / 2), sp: one ? mw + gap : Math.ceil(mw / 2 + gap / 2), vg: Math.round(fs * 0.45), key: gk + '|' + W + 'x' + H };
    out.dc = (one ? ' trOne' : '') + (S.cmFont === 'rashi' ? '' : ' fN');
    out.vars = '--trW:' + W + 'px;--trH:' + H + 'px;--trMw:' + mw + 'px;--trSw:' + out.sw + 'px;--trSp:' + out.sp + 'px;--trG:' + gap + 'px;--trFm:' + fm + 'px;--trLm:' + out.lm + 'px;--trFs:' + fs + 'px;--trLs:' + out.ls + 'px';
    measured(); TGC.set(gk, out); return out;
  }
  function trProbe(Q) {
    const host = $r('#rdDafHost'); host.style.width = Q.W + 'px';
    host.innerHTML = '<div class="trDaf' + Q.dc + '" style="' + Q.vars + ';height:auto"><div class="trMain"></div><div class="trSide trC"><div class="sp"></div><div class="tx"></div></div><div class="trWide"></div></div>';
    return { main: host.querySelector('.trMain'), sp: host.querySelector('.sp'), tx: host.querySelector('.tx'), wide: host.querySelector('.trWide') };
  }
  // עימוד סימן: [{t: [a, b) בטור, y/c: [a, b) בזרמים, hT: גובה הטור בעמוד, first, wide: 'y'|'c' (עמוד של מפרש אחד בשני טורים)}]
  function trDafPages(k, s, Q) {
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
        // מפרש יחיד (לשני אין עוד מה להוסיף) ממלא את שני טורי הצד, ולכן נמדד מול קיבולת כפולה
        const solo = e => turOne() ? '' : C.allow(e) <= cp ? 'y' : Y.allow(e) <= yp ? 'c' : '';
        const over2 = (x, e, hh) => { const z = m.st[x], end = z.allow(e); return end >= z.toks.length || chars(x, x === 'y' ? yp : cp, end) > 2 * capChars(hh); };
        const s0 = solo(tp), lag = !first && (s0 ? Y.allow(tp) + C.allow(tp) > yp + cp && chars(s0, s0 === 'y' ? yp : cp, m.st[s0].allow(tp)) > 2 * capChars(0) : overE('y', Y.allow(tp), 0) && overE('c', C.allow(tp), 0));
        if (!lag) {
          const cand = m.cuts.filter(c => c > tp);
          const sat = i => {
            const e = cand[i], hh = mainH(tp, e, first);
            const ok = x => { const z = m.st[x], end = z.allow(e); return end >= z.toks.length || overE(x, end, hh); }, x = solo(e);
            return x ? over2(x, e, hh) : ok('y') && ok('c');
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
        let ny = fill('y', yp, Y.allow(te), hT), nc = fill('c', cp, C.allow(te), hT), mid = -1;
        // רק מפרש אחד בעמוד: הוא ממשיך גם לטור הצד הפנוי — קודם בטור הימני, ואחר כך בשמאלי
        if (!turOne()) {
          if (nc === cp && ny > yp && ny < Y.allow(te)) { mid = ny; ny = fill('y', mid, Y.allow(te), hT); }
          else if (ny === yp && nc > cp && nc < C.allow(te)) { mid = nc; nc = fill('c', mid, C.allow(te), hT); }
        }
        if (te === tp && ny === yp && nc === cp && !first) { if (yp < Y.toks.length) ny = yp + 1; else if (cp < C.toks.length) nc = cp + 1; else te = Math.min(TT, tp + 1); } // תמיד מתקדמים
        pg = { t: [tp, te], y: [yp, ny], c: [cp, nc], hT, first };
        if (mid >= 0) pg.mid = mid; // pg.mid: גבול בין הטור הימני לשמאלי, בזרם של המפרש היחיד
        tp = te; yp = ny; cp = nc;
      }
      pages.push(pg); first = false;
    }
    $r('#rdDafHost').innerHTML = '';
    measured(); TPC.set(key, pages); trimMap(TPC, 60); return pages;
  }
  function turHeader(t, s, study, pg) {
    const hil = hilOf(t, s), on = x => !S.rOff.includes(x);
    // בצד: שם המפרש שבאותו צד בדף. מפרש אחד = ברוחב מלא, ושמו משמאל; ב"טור ומפרשים" אין צדדים
    let rt = study ? T('טור') : on('c') && on('y') ? T('בית חדש') : '', lt = study ? '' : on('y') ? T('בית יוסף') : on('c') ? T('בית חדש') : '';
    if (!study && pg) {
      // בעמוד שיש בו רק מפרש אחד — שמו בשני הצדדים
      const has = x => on(x) && (pg.wide ? pg.wide === x : pg[x][1] > pg[x][0]);
      if (has('y') !== has('c')) rt = lt = T(has('y') ? 'בית יוסף' : 'בית חדש');
    }
    return '<header class="rdHead trHead"><span>' + rt + '</span><span class="mid">' + h(T('טור') + ' ' + turPartName(t) + ' · ' + (s ? T('סימן') + ' ' + num(s) : T('הקדמה')) + (hil ? ' · ' + hil : '')) + '</span><span class="l">' + lt + '</span></header>';
  }
  function trDafPageHtml(k, s, p, Q, side, cls) {
    const t = turTOf(k), m = turModel(k, s), ps = turPages(k, s, Q), pg = ps[p];
    let inner; TURQ = true;
    if (pg.wide) inner = '<div class="trWide">' + streamHtml(m, pg.wide, pg.w[0], pg.w[1]) + '</div>';
    else {
      const sp = '<div class="sp" style="height:' + (pg.hT ? pg.hT + Q.vg : 0) + 'px"></div>';
      inner = (pg.t[1] > pg.t[0] || pg.first ? '<div class="trMain' + (pg.full ? ' trFull' : '') + '">' + turMainHtml(m, pg.t[0], pg.t[1], pg.first) + '</div>' : '');
      const x = pg.mid >= 0 ? (pg.y[1] > pg.y[0] ? 'y' : 'c') : '', r = x ? streamHtml(m, x, pg[x][0], pg.mid) : streamHtml(m, 'c', pg.c[0], pg.c[1]), l = x ? streamHtml(m, x, pg.mid, pg[x][1]) : streamHtml(m, 'y', pg.y[0], pg.y[1]);
      inner += '<div class="trSide trC">' + sp + '<div class="tx">' + r + '</div></div>' +
        '<div class="trSide trY">' + sp + '<div class="tx">' + l + '</div></div>';
    }
    TURQ = false;
    const lbl = s ? num(s) + (ps.length > 1 ? ' · ' + num(p + 1) : '') : T('הקדמה') + (ps.length > 1 ? ' · ' + num(p + 1) : '');
    return '<article class="rdPage tal tur ' + side + (cls || '') + '" data-s="' + s + '" aria-label="' + h(T('סימן') + ' ' + num(s)) + '">' + turHeader(t, s, false, pg) +
      '<div class="rdDaf"><div class="trDaf' + Q.dc + '" style="' + Q.vars + '">' + inner + '</div></div><div class="rdNum">' + h(lbl) + '</div></article>';
  }
  /* טור ומפרשים: בכל עמוד קטעים מהטור, ומתחתיהם הדיבורים שלהם — בית יוסף ואחריו ב״ח, כמו "גמרא ומפרשים".
     עמוד = אותו מבנה כמו בצורת הדף ({t, y, c}: תחומים בטור ובזרמים), כך שהחיפוש, הדיבור הבא וההדפסה עובדים בשתי התצוגות.
     ממלאים קטעים שלמים (עד נקודות החיתוך) עם כל הפירוש שלהם; קטע שלא נכנס עם הפירוש — הפירוש ממשיך לעמוד הבא. */
  const trGeo = g => S.rview === 'study' ? { study: true, g, key: 'S|' + g.key + '|' + S.rOff.join('') } : trDafGeo(g);
  const turPages = (k, s, Q) => Q.study ? tsPages(k, s, Q) : trDafPages(k, s, Q);
  const turPageHtml = (k, s, p, Q, side, cls) => Q.study ? tsPageHtml(k, s, p, Q, side, cls) : trDafPageHtml(k, s, p, Q, side, cls);
  function tsStream(m, x, a, b) {
    const z = m.st[x], out = [];
    for (let i = 0; i < z.n; i++) {
      const cs = z.cs[i], ce = z.ce[i]; if (ce <= a || cs >= b || ce === cs) continue;
      out.push('<p class="rcm r' + x + (cs < a ? ' cont' : '') + '" data-x="' + x + '" data-i="' + i + '">' + (cs < a ? '<span class="rdCont">…</span> ' : '') + tokHtml(m, z.toks, Math.max(a, cs), Math.min(b, ce), cs, false) + (ce > b ? ' <span class="rdCont">…</span>' : '') + '</p>');
    }
    return out.join('');
  }
  function tsInner(m, pg) {
    const t = turTOf(m.k), cls = S.cmFont === 'rashi' ? 'fR' : 'fN';
    let html = turHeader(t, m.s, true);
    html += '<div class="rdBody"><div class="rdTxt trStudy"><p>' + (pg.t[1] > pg.t[0] || pg.first ? turMainHtml(m, pg.t[0], pg.t[1], pg.first) : '') + '</p></div></div><div class="rdSp"></div>';
    ['y', 'c'].forEach(x => {
      if (pg[x][1] <= pg[x][0]) return;
      html += '<section class="rdCm ' + cls + '" aria-label="' + h(turCmName(x)) + '"><div class="rdCmHd"><span class="ln"></span><span>' + h(turCmName(x)) + '</span></div><div class="rdCmBody">' + tsStream(m, x, pg[x][0], pg[x][1]) + '</div></section>';
    });
    return html;
  }
  const tsLbl = (s, p, n) => (s ? num(s) : T('הקדמה')) + (n > 1 ? ' · ' + num(p + 1) : '');
  function tsPageHtml(k, s, p, Q, side, cls) {
    const m = turModel(k, s), ps = tsPages(k, s, Q);
    TURQ = true; const inner = tsInner(m, ps[p]); TURQ = false;
    return '<article class="rdPage tal tur study ' + side + (cls || '') + '" data-s="' + s + '" aria-label="' + h(T('סימן') + ' ' + num(s)) + '">' + inner + '<div class="rdNum">' + h(tsLbl(s, p, ps.length)) + '</div></article>';
  }
  function tsPages(k, s, Q) {
    const key = k + ':' + s + '|' + Q.key; if (TPC.has(key)) return TPC.get(key);
    const m = turModel(k, s), TT = m.tt.length, Y = m.st.y, C = m.st.c, probe = $r('#rdProbe'), pages = [];
    probe.className = 'rdPage tal tur study' + Q.g.cls;
    const fits = (tp, te, y, c, first) => { probe.innerHTML = tsInner(m, { t: [tp, te], y, c, first }) + '<div class="rdNum">א</div>'; return !over(probe); };
    const back = (z, a, n) => { while (n > a && ANC.test(z.toks[n - 1])) n--; return n; }; // לא מסיימים בתווית של דיבור
    let tp = 0, yp = 0, cp = 0, first = true;
    while (pages.length < 400) {
      if (!first && tp >= TT && yp >= Y.toks.length && cp >= C.toks.length) break;
      let te = tp, by = yp, bc = cp; // by, bc = עד כאן הפירוש בטוח נכנס
      const all = e => fits(tp, e, [yp, Y.allow(e)], [cp, C.allow(e)], first);
      // פירוש שנשאר מהעמוד הקודם וגדול מעמוד שלם — עמוד של פירוש בלבד
      if (tp < TT && !(Y.allow(tp) > yp || C.allow(tp) > cp) || tp < TT && all(tp)) {
        const cand = m.cuts.filter(c => c > tp);
        if (all(cand[0])) {
          const i = maxOkF(0, cand.length - 1, i => all(cand[i])); te = cand[i]; by = Y.allow(te); bc = C.allow(te);
          // הקטע הבא בטור נכנס בלי הפירוש שלו: מוסיפים אותו, ומהפירוש שלו כמה שנכנס — כדי שלא יישאר רווח ריק בעמוד
          if (i + 1 < cand.length) {
            const nx = cand[i + 1], w = fits(tp, nx, [yp, by], [cp, bc], first) ? nx - te : maxOkF(0, nx - te - 1, w => fits(tp, te + w, [yp, by], [cp, bc], first));
            if (w === nx - te || w >= 8) te += w; // באמצע קטע — רק אם נכנסת יותר משורה בערך
          }
        }
        else if (fits(tp, cand[0], [yp, yp], [cp, cp], first)) te = cand[0];
        else te = tp + maxOkF(1, cand[0] - tp - 1, w => fits(tp, tp + w, [yp, yp], [cp, cp], first)); // קטע ארוך מעמוד: חותכים במילים
      }
      let ny = Y.allow(te), nc = C.allow(te);
      if (!fits(tp, te, [yp, ny], [cp, nc], first)) {
        ny = back(Y, by, by + maxOkF(0, ny - by, n => fits(tp, te, [yp, by + n], [cp, bc], first)));
        nc = ny < Y.allow(te) ? bc : back(C, bc, bc + maxOkF(0, nc - bc, n => fits(tp, te, [yp, ny], [cp, bc + n], first)));
      }
      if (te === tp && ny === yp && nc === cp && !first) { // תמיד מתקדמים
        if (Y.allow(te) > yp) ny = Math.min(Y.allow(te), yp + 2); else if (C.allow(te) > cp) nc = Math.min(C.allow(te), cp + 2); else te = Math.min(TT, tp + 1);
      }
      pages.push({ t: [tp, te], y: [yp, ny], c: [cp, nc], first });
      tp = te; yp = ny; cp = nc; first = false;
    }
    probe.innerHTML = '';
    measured(); TPC.set(key, pages); trimMap(TPC, 60); return pages;
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
    const Q = trGeo(geo), ps = turPages(k, S.rs, Q), go = S.rgo && S.rgo.k === k && S.rgo.s === S.rs ? S.rgo : null;
    if (go) { S.rgo = null; S.rp = turHitPage(go, ps); }
    S.rp = Math.max(0, Math.min(S.rp, ps.length - 1));
    const shown = [{ s: S.rs, p: S.rp }]; if (geo.two) { const n = trNext(k, S.rs, S.rp, 1, Q); if (n) shown.push(n); }
    const side = i => geo.two ? (i ? 'left' : 'right') : 'single';
    book.innerHTML = shown.map((x, i) => turPageHtml(k, x.s, x.p, Q, side(i), geo.cls)).join('') +
      (geo.two && shown.length < 2 ? '<article class="rdPage left blank' + geo.cls + '" aria-hidden="true"></article>' : '') + (geo.two ? '<div class="rdSpine" aria-hidden="true"></div>' : '');
    if (Q.study) book.querySelectorAll('.rdPage').forEach(p => { if (over(p)) p.classList.add('tight'); });
    const last = shown[shown.length - 1];
    $r('#rdPos').textContent = (S.rs ? T('סימן') + ' ' + num(S.rs) : T('הקדמה')) + ' · ' + T('עמוד') + ' ' + num(S.rp + 1) + (last.s === S.rs && last.p !== S.rp ? '–' + num(last.p + 1) : '') + ' ' + T('מתוך') + ' ' + num(ps.length) +
      (last.s !== S.rs ? ' · ' + T('ממשיך ל') + T('סימן') + ' ' + num(last.s) : '');
    const atStart = S.rs <= minS(t) && S.rp === 0, atEnd = last.s >= t.n - 1 && last.p >= turPages(k, last.s, Q).length - 1;
    ['#rdPrev', '#rdPrev2'].forEach(x => { $r(x).disabled = atStart; });
    ['#rdNext', '#rdNext2'].forEach(x => { $r(x).disabled = atEnd; });
    fxAfter(book);
    markTurSel();
    if (go && go.x !== 't') openTurCm(go.s, go.x, go.i); // תוצאה בבית יוסף / ב״ח: גם פותחים את הדיבור, כמו קטע בגמרא
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
  // שינוי הגדרה בטור (תצוגה, מפרשים, כתב, גודל): העימוד משתנה, ונשארים בעמוד שבו נמצא אותו מקום בטור
  function turKeep(fn) {
    const k = S.rk, ready = rowsReady(k, [S.rs]), pg = ready ? turPages(k, S.rs, trGeo(geo))[S.rp] : null, at = pg ? (pg.t[1] > pg.t[0] ? pg.t[0] : Math.max(0, pg.t[0] - 1)) : 0;
    const fs = fxSet; fn(); render();
    if (pg && isTur() && rowsReady(k, [S.rs])) { const i = Math.max(0, turPages(k, S.rs, trGeo(geo)).findIndex(p => p.t[1] > at)); if (i !== S.rp) { S.rp = i; fxSet = fs; render(); } }
  }

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
    S.rsel = { s, x, i }; markTurSel(); syncHash();
    // הקטע בטור: מהסימן של הדיבור עד הסימן הבא (או 40 מילים)
    const a = z.anc[i] || 0; let b = a + 1; while (b < m.tt.length && (ANC.test(m.tt[b]) || b === a + 1) && b - a < 3) b++;
    let e = b; while (e < m.tt.length && !ANC.test(m.tt[e]) && e - a < 45) e++;
    const other = x === 'y' ? 'c' : 'y', oz = m.st[other];
    const tab = (k, n) => '<button type="button" class="' + (x === k ? 'on' : '') + '" data-turtab="' + k + '" aria-pressed="' + (x === k) + '"' + (n ? '' : ' disabled') + '>' + h(turCmName(k)) + ' · ' + n + '</button>';
    const cnt = k => m.st[k].ce.filter((v, j) => v > m.st[k].cs[j]).length;
    const p = $r('#rdSeg'); TURQ = true;
    p.innerHTML = '<div class="rdPopHd"><span>' + h(turPartName(t) + ' ' + (s ? num(s) : T('הקדמה')) + ' · ' + turCmName(x) + ' ' + RL(x, i)) + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<p class="rdSegTxt">' + tokHtml(m, m.tt, a, e, 0, true) + (e < m.tt.length && !ANC.test(m.tt[e]) ? ' …' : '') + '</p>' +
      '<div class="rdSegTabs" role="group">' + tab('y', cnt('y')) + tab('c', cnt('c')) + '</div>' +
      '<div class="rdSegList fR"><p>' + tokHtml(m, z.toks, z.cs[i], z.ce[i], z.cs[i], false) + '</p></div>' +
      '<div class="rdSegNav"><button type="button" data-turmove="-1">' + ICON.chevR + ' ' + T('הדיבור הקודם') + '</button><button type="button" data-turmove="1">' + T('הדיבור הבא') + ' ' + ICON.chevL + '</button></div>';
    TURQ = false; p.hidden = false;
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

  /* חיפוש בטור: בסימן הפתוח או בכל הטור (או״ח, יו״ד… — כל אחד לחוד), בטור, בבית יוסף, בב״ח או בכולם.
     תוצאה בטור = פסקה (עד שורה חדשה) שיש בה התאמה, ובמפרשים = דיבור; x = 't' / 'y' / 'c', i = מספר הפסקה / הדיבור.
     הטקסט המנורמל נשמר במטמון לכל סימן (TSN). בבחירת תוצאה מדפדפים בדיוק לעמוד שבו נמצאת המילה הראשונה שהתאימה. */
  const TSN = new Map();
  const turPlain = x => String(x || '').replace(/\u0010[yc]\d+\u0011/g, ' ').replace(/[\u0003-\u0006]/g, '').replace(/\s+/g, ' ').trim();
  function turNorm(k, s) {
    const key = k + ':' + s; if (TSN.has(key)) return TSN.get(key);
    const row = turRow(k, s), nz = x => x ? ' ' + norm(String(x).replace(/\u0010[yc]\d+\u0011/g, ' ')) + ' ' : '';
    const r = { t: String(row[0] || '').split('\n').map(nz), y: (row[1] || []).map(nz), c: (row[2] || []).map(nz) };
    TSN.set(key, r); trimMap(TSN, 3000); return r;
  }
  const turAll = t => t.parts.map(p => Math.max(p.from, minS(t)));
  function searchTur(q) {
    const nq = norm(q), hits = [], t = turT(), k = t.k, src = S.rsrc;
    if (nq.length < 2) return { hits, q: nq };
    const ss = []; if (S.rscope === 's') ss.push(S.rs); else for (let s = minS(t); s < t.n; s++) ss.push(s);
    if (!rowsReady(k, ss)) return { hits, q: nq, wait: true };
    ss.forEach(s => {
      const n = turNorm(k, s);
      if (src === 'all' || src === 't') n.t.forEach((p, i) => { if (p.includes(nq)) hits.push({ k, s, x: 't', i }); });
      ['y', 'c'].forEach(x => { if ((src === 'all' || src === x) && !S.rOff.includes(x)) n[x].forEach((p, i) => { if (p.includes(nq)) hits.push({ k, s, x, i }); }); });
    });
    return { hits, q: nq };
  }
  const turHitText = x => { const row = turRow(x.k, x.s); return turPlain(x.x === 't' ? String(row[0] || '').split('\n')[x.i] : (row[x.x === 'y' ? 1 : 2] || [])[x.i]); };
  // המילים שתואמות את החיפוש (S.hl) באסימונים של הסימן: אינדקסים בטור (t) ובזרמי המפרשים (y, c)
  function turMarks(toks, nq) {
    if (SQHL && SQHL.q === S.hl) { const mk = new Set(); toks.forEach((w, i) => { if (w === '\n' || w[0] === '\u0010') return; const n = G.GimSq.letters(w); if (n && SQHL.test(n)) mk.add(i); }); return mk; } // אחרי מעבר מתוצאת SQLite: כל צורות המילים
    const wi = [], wn = [], mk = new Set(), qn = nq.split(' ').length;
    toks.forEach((w, i) => { if (w === '\n' || w[0] === '\u0010') return; const n = norm(w); if (n) { wi.push(i); wn.push(n); } });
    for (let a = 0; a < wi.length; a++) { const z = qn === 1 ? wn[a] : wn.slice(a, a + qn).join(' '); if (z.includes(nq)) for (let j = 0; j < qn && a + j < wi.length; j++) mk.add(wi[a + j]); }
    return mk;
  }
  function turHl(m) {
    const nq = norm(S.hl || ''); if (nq.length < 2) return null;
    if (!m.mk || m.mk.q !== nq) m.mk = { q: nq, t: turMarks(m.tt, nq), y: turMarks(m.st.y.toks, nq), c: turMarks(m.st.c.toks, nq) };
    return m.mk;
  }
  // העמוד בסימן שבו נמצאת ההתאמה של התוצאה x
  function turHitPage(x, ps) {
    const m = turModel(x.k, x.s), mk = turHl(m);
    if (x.x === 't') {
      const p = x.i - (m.hd ? 1 : 0); if (p < 0) return 0; // הכותרת ("הלכות …") מוצגת בראש העמוד הראשון
      let a = 0, n = 0; while (n < p && a < m.tt.length) { if (m.tt[a] === '\n') n++; a++; }
      let w = a; for (let i = a; i < m.tt.length && m.tt[i] !== '\n'; i++) if (mk && mk.t.has(i)) { w = i; break; }
      return Math.max(0, ps.findIndex(pg => !pg.wide && pg.t[1] > w));
    }
    const z = m.st[x.x]; let st = z.cs[x.i] || 0;
    for (let i = z.cs[x.i]; i < z.ce[x.i]; i++) if (mk && mk[x.x].has(i)) { st = i; break; }
    return Math.max(0, ps.findIndex(pg => pg.wide ? pg.wide === x.x && pg.w[1] > st : !pg.wide && pg[x.x][1] > st));
  }
  function goTurHit(x) { S.tk = ''; S.rk = x.k; S.rs = x.s; S.rp = 0; closeSeg(); S.rgo = x; render(); }

  /* ---------- הדפסה / PDF ----------
     שני עמודים בכל דף A4 לרוחב. העימוד נמדד מחדש בגודל של חצי דף (אותו pagesFor, עם גאומטריה של הדפסה), נבנה
     ב-#rdPrint (ילד ישיר של body, מוצג רק ב-@media print כש-body.rdPrinting), ואז window.print(). PDF = "שמירה כ-PDF"
     בחלון ההדפסה של הדפדפן — בלי ספריות ובלי רשת. "שחור-לבן" = רקע לבן ודיו שחורה בלבד. */
  const MM = 96 / 25.4;
  function printGeo() {
    const pw = Math.round(139 * MM), ph = Math.round(190 * MM), fs = Math.round((14.5 + S.size) * 10) / 10;
    const trW = Math.round(pw * (S.view === 'book' ? (S.trFont === 'rashi' ? 0.27 : 0.3) : (S.trFont === 'rashi' ? 0.3 : 0.33)));
    return { pw, ph, fs, trW, two: true, per: 2, cls: ' prt', key: ['print', pw, ph, fs, S.view, S.ramView, S.tr, S.trFont, S.cmFont, isEn(), S.cmOff.join(','), S.ramNik, S.tview, S.zside, S.zoff.join('')].join('|') };
  }
  const setVars = g => { R.style.setProperty('--rdPw', g.pw + 'px'); R.style.setProperty('--rdPh', g.ph + 'px'); R.style.setProperty('--rdFs', g.fs + 'px'); R.style.setProperty('--rdTrW', g.trW + 'px'); };
  // ש״ס: הדף הנוכחי (שני העמודים, א ו-ב) בתצוגה הנוכחית
  function printSheetsTal() {
    const k = S.tk, t = talT(), saved = geo; geo = printGeo(); setVars(geo);
    const from = S.tj - (S.tj & 1), js = [from, from + 1].filter(j => j < t.n);
    let pages;
    if (t.z && S.tview === 'daf') { // זוהר, דף מול תרגום: כל מסך הוא גיליון (ארמית מימין, תרגום משמאל)
      let html = '', n = 0;
      js.forEach(j => studyPages(k, j, geo).forEach(pg => { n++; html += '<div class="rdSheet"><article class="rdPage tal prt right">' + zdInner(k, j, pg, '', 'a') + '</article><article class="rdPage tal prt left">' + zdInner(k, j, pg, '', 'b') + '</article></div>'; }));
      const vars = R.getAttribute('style'); geo = saved; if (geo) setVars(geo);
      return { html, vars, sheets: n };
    }
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
        '<div class="rdSec"><span class="rdSecT">' + T('מה להדפיס') + '</span><p class="rdNote">' + h(turRefLabel(S.rk, S.rs)) + ' · ' + T('הסימן כולו') + ' · ' + T(S.rview === 'study' ? 'טור ומפרשים' : 'צורת הדף') + ' · ' + num(n) + ' ' + T(n === 1 ? 'דף' : 'דפים') + '</p></div>' +
        '<div class="rdSec"><span class="rdSecT">' + T('צבע') + '</span>' + opt('prColor', 'color', 'צבעוני', T('רקע נייר וצבעים')) + opt('prColor', 'bw', 'שחור-לבן', T('רקע לבן, לחיסכון בדיו')) + '</div>' +
        '<p class="rdNote">' + T('שני עמודים בכל דף A4 לרוחב.') + ' ' + T('ליצוא PDF בחרו בחלון ההדפסה ״שמירה כ-PDF״.') + '</p>' +
        '<button type="button" class="rdGo rdPrintGo" data-print>' + ICON.print + ' ' + T('הדפסה') + '</button>';
      return;
    }
    if (isTal()) {
      const opt = (key, val, label, note) => '<button type="button" class="rdOpt' + (S[key] === val ? ' on' : '') + '" data-pset="' + key + '" data-val="' + val + '" aria-pressed="' + (S[key] === val) + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + note + '</span></button>';
      const t = talT(), from = S.tj - (S.tj & 1);
      $r('#rdPrintPop').innerHTML = '<div class="rdPopHd"><span>' + T('הדפסה / PDF') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
        '<div class="rdSec"><span class="rdSecT">' + T('מה להדפיס') + '</span><p class="rdNote">' + h((t.z ? talTitle(t) : T('מסכת') + ' ' + talName(t)) + ' ' + T('דף') + ' ' + (t.z ? (isEn() ? dafOf(from, t.d0).d : toHeb(dafOf(from, t.d0).d)) : dafLabel(from, isEn()).replace(/[.:a-z]$/, ''))) + ' · ' + T(viewName(S.tview)) + '</p></div>' +
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
    else { J.b = S.b; J.ch = S.ch; J.v = 0; J.cat = isTur() ? 20 : isTal() ? (talT().z ? 30 : 2) : IX.books[S.b].cat; J.tk = isTal() ? S.tk : jDef(false); J.tj = isTal() ? S.tj : 0; J.rk = S.rk || (RX.list[0] || {}).k; J.rs = isTur() ? S.rs : 1; renderJump(); $r('#rdJump').hidden = false; $r('#rdWhere').setAttribute('aria-expanded', 'true'); const a = $r('#rdJump .rdJB.on'); if (a) a.scrollIntoView({ block: 'center' }); }
  }

  function renderSetZoh() {
    const t = talT(), daf = S.tview === 'daf';
    const card = (k, ic, label) => '<button type="button" class="rdCard' + (S.tview === k ? ' on' : '') + '" data-set="tview" data-val="' + k + '" aria-pressed="' + (S.tview === k) + '">' + ic + '<span>' + T(label) + '</span></button>';
    const opt = (key, val, label, note) => '<button type="button" class="rdOpt' + (S[key] === val ? ' on' : '') + '" data-set="' + key + '" data-val="' + val + '" aria-pressed="' + (S[key] === val) + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + T(note) + '</span></button>';
    const chk = (x, label) => { const on = !S.zoff.includes(x); return '<button type="button" class="rdOpt rdChk' + (on ? ' on' : '') + '" data-set="zoff" data-val="' + x + '" aria-pressed="' + on + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt"></span></button>'; };
    $r('#rdSet').innerHTML = '<div class="rdPopHd"><span>' + T('הגדרות תצוגה') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('סוג תצוגה') + '</span><div class="rdCards">' +
      card('daf', '<span class="pv pvBook"><i></i><i></i><i class="s"></i><b></b></span>', 'דף מול תרגום') + card('study', '<span class="pv pvRows"><i></i><i></i><i></i></span>', 'זוהר והסולם') + '</div></div>' +
      (daf ? '<div class="rdSec"><span class="rdSecT">' + T('פריסה') + '</span>' + opt('zlay', 'spread', 'ספר פתוח', 'ארמית בעמוד ימין, תרגום בשמאל') + opt('zlay', 'cols', 'שני טורים', 'בעמוד אחד, שורה מול שורה') + '</div>' : '') +
      (daf ? '<div class="rdSec"><span class="rdSecT">' + T('פירוש') + '</span><button type="button" class="rdOpt rdChk' + (S.zsul === '1' ? ' on' : '') + '" data-set="zsul" data-val="' + (S.zsul === '1' ? '0' : '1') + '" aria-pressed="' + (S.zsul === '1') + '"><span class="dot"></span><span class="lb">' + T('הוספת הסולם') + '</span><span class="nt">' + T('בתחתית העמוד') + '</span></button></div>' : '<div class="rdSec"><span class="rdSecT">' + T('פירוש מתחת לפסקאות') + '</span>' + chk('r', 'הסולם') + '</div>') +
      '<div class="rdSec"><span class="rdSecT">' + T('גודל אותיות') + '</span><div class="rdSizes">' + [-1, 0, 1, 2].map(z => '<button type="button" class="' + (S.size === z ? 'on' : '') + '" data-set="size" data-val="' + z + '" aria-pressed="' + (S.size === z) + '" style="font-size:' + (13 + z * 2.5) + 'px">א</button>').join('') + '</div></div>' +
      '<p class="rdNote">' + T('לחצו על פסקה בזוהר כדי לראות את התרגום והסולם שלה.') + ' ' + T('העמודים לפי דפוס וילנא.') + ' ' + T('ההגדרות נשמרות לפעם הבאה.') + '</p>';
  }
  function renderSetTal() {
    if (talT().z) return renderSetZoh();
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
    const card = (k, ic, label) => '<button type="button" class="rdCard' + (S.rview === k ? ' on' : '') + '" data-set="rview" data-val="' + k + '" aria-pressed="' + (S.rview === k) + '">' + ic + '<span>' + T(label) + '</span></button>';
    const chk = x => { const on = !S.rOff.includes(x); return '<button type="button" class="rdOpt rdChk' + (on ? ' on' : '') + '" data-set="rcm" data-val="' + x + '" aria-pressed="' + on + '"><span class="dot"></span><span class="lb">' + turCmName(x) + '</span><span class="nt">' + (S.rview === 'daf' ? T(x === 'y' ? 'משמאל' : 'מימין') : '') + '</span></button>'; };
    const fontPair = (key, sample) => ['rashi', 'regular'].map(f => '<button type="button" class="rdFont' + (S[key] === f ? ' on' : '') + '" data-set="' + key + '" data-val="' + f + '" aria-pressed="' + (S[key] === f) + '"><span class="smp ' + (f === 'rashi' ? 'fR' : 'fN') + '">' + sample + '</span><span class="lb">' + T(f === 'rashi' ? 'כתב רש״י' : 'כתב רגיל') + '</span></button>').join('');
    const on = ['y', 'c'].filter(x => !S.rOff.includes(x));
    $r('#rdSet').innerHTML = '<div class="rdPopHd"><span>' + T('הגדרות תצוגה') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('סוג תצוגה') + '</span><div class="rdCards">' +
      card('daf', '<span class="pv pvDaf"><i></i><i class="m"></i><i></i></span>', 'צורת הדף') + card('study', '<span class="pv pvRows"><i></i><i></i><i></i></span>', 'טור ומפרשים') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('מפרשים') + '</span>' + chk('y') + chk('c') + '</div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב הפירוש') + ' (' + T('בית יוסף') + ', ' + T('ב״ח') + ')</span><div class="rdFonts">' + fontPair('cmFont', 'ומ״ש רבינו') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('גודל אותיות') + '</span><div class="rdSizes">' + [-1, 0, 1, 2].map(z => '<button type="button" class="' + (S.size === z ? 'on' : '') + '" data-set="size" data-val="' + z + '" aria-pressed="' + (S.size === z) + '" style="font-size:' + (13 + z * 2.5) + 'px">א</button>').join('') + '</div></div>' +
      '<p class="rdNote">' + (S.rview === 'study' ? T('קטעים מהטור, ומתחת לכל אחד הדיבורים שלו.') : on.length === 2 ? T('הטור באמצע, ב״ח מימין ובית יוסף משמאל.') : on.length ? T('הטור מימין, והפירוש מקיף אותו וממשיך מתחתיו.') : T('הטור לבדו, ברוחב מלא.')) + ' ' + (on.length ? T('לחצו על סימן בטור או על דיבור כדי לקרוא אותו באותיות גדולות.') : '') + ' ' + T('ההגדרות נשמרות לפעם הבאה.') + '</p>';
  }
  // חלון הגדרות התצוגה של הספר הפתוח; מקום הגלילה בחלון נשמר כשהוא מצויר מחדש אחרי בחירה
  function renderSet() { const el = $r('#rdSet'), top = el.scrollTop; if (isTur()) renderSetTur(); else if (isTal()) renderSetTal(); else renderSetBook(); el.scrollTop = top; }
  // תנ״ך, משנה ורמב״ם: רק אפשרויות שמשנות משהו בספר הזה — בלי סוג תצוגה במשנה ובלי תרגום בספר שאין בו תרגום
  function renderSetBook() {
    const L = IX.links[S.b] || {}, rows = alignedName(S.b), cv = vw(S.b);
    const card = (k, ic, label) => '<button type="button" class="rdCard' + (cv === k ? ' on' : '') + '" data-set="view" data-val="' + k + '" aria-pressed="' + (cv === k) + '">' + ic + '<span>' + T(label) + '</span></button>';
    const opt = (k, label) => { const avail = k === 'none' || L[k] != null, on = S.tr === k; return '<button type="button" class="rdOpt' + (on ? ' on' : '') + '" data-set="tr" data-val="' + k + '" aria-pressed="' + on + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + (k === 'onkelos' ? T('ברירת מחדל') : '') + (avail ? '' : (k === 'onkelos' ? ' · ' : '') + T('אין בספר זה')) + '</span></button>'; };
    const fontPair = (key, sample) => ['rashi', 'regular'].map(f => '<button type="button" class="rdFont' + (S[key] === f ? ' on' : '') + '" data-set="' + key + '" data-val="' + f + '" aria-pressed="' + (S[key] === f) + '"><span class="smp ' + (f === 'rashi' ? 'fR' : 'fN') + '">' + sample + '</span><span class="lb">' + T(f === 'rashi' ? 'כתב רש״י' : 'כתב רגיל') + '</span></button>').join('');
    $r('#rdSet').innerHTML = '<div class="rdPopHd"><span>' + T('הגדרות תצוגה') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      (hasViews(S.b) ? '<div class="rdSec"><span class="rdSecT">' + T('סוג תצוגה') + '</span><div class="rdCards">' +
      card('book', '<span class="pv pvBook"><i></i><i></i><i class="s"></i><b></b></span>', 'ספר') + card('aligned', '<span class="pv pvRows"><i></i><i></i><i></i></span>', rows) + '</div></div>' : '') +
      (hasTr(S.b) ? '<div class="rdSec"><span class="rdSecT">' + T('תרגום בצד שמאל') + '</span>' + opt('onkelos', 'תרגום אונקלוס') + opt('yonatan', 'תרגום יונתן') + opt('none', 'ללא תרגום') + '</div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב התרגום') + '</span><div class="rdFonts">' + fontPair('trFont', 'בקדמין ברא') + '</div></div>' : '') +
      (isRambam(S.b) ? '<div class="rdSec"><span class="rdSecT">' + T('ניקוד') + '</span>' + [[true, 'עם ניקוד', T('ברירת מחדל')], [false, 'בלי ניקוד', T('כמו במהדורת פרנקל')]].map(([v, l, nt]) => '<button type="button" class="rdOpt' + (S.ramNik === v ? ' on' : '') + '" data-set="ramNik" data-val="' + v + '" aria-pressed="' + (S.ramNik === v) + '"><span class="dot"></span><span class="lb">' + T(l) + '</span><span class="nt">' + nt + '</span></button>').join('') + '</div>' : '') +
      ((L.cms || []).length > 1 ? '<div class="rdSec"><span class="rdSecT">' + T('מפרשים בתחתית הדף') + '</span>' + L.cms.map(({ c }) => { const on = !S.cmOff.includes(c); return '<button type="button" class="rdOpt rdChk' + (on ? ' on' : '') + '" data-set="cm" data-val="' + c + '" aria-pressed="' + on + '"><span class="dot"></span><span class="lb">' + cmName(c) + '</span><span class="nt"></span></button>'; }).join('') + '</div>' : '') +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב הפירוש') + ' (' + cmLabel(S.b) + ')</span><div class="rdFonts">' + fontPair('cmFont', isRambam(S.b) ? 'יסוד היסודות' : isMishnah(S.b) ? 'מאימתי קורין' : 'תהו ובהו') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('גודל אותיות') + '</span><div class="rdSizes">' + [-1, 0, 1, 2].map(z => '<button type="button" class="' + (S.size === z ? 'on' : '') + '" data-set="size" data-val="' + z + '" aria-pressed="' + (S.size === z) + '" style="font-size:' + (13 + z * 2.5) + 'px">א</button>').join('') + '</div></div>' +
      '<p class="rdNote">' + T('ההגדרות נשמרות לפעם הבאה.') + '</p>';
  }

  const J = { cat: 0, b: 0, ch: 1, v: 0, tk: '', tj: 0, rk: '', rs: 1 };
  const jDef = z => (TX.list.find(t => !!t.z === z) || {}).k || ''; // המסכת (או הפרשה) הראשונה ברשימה שבחלון המעבר
  const jTabs = () => '<div class="rdJTabs" role="group">' + [0, 1, 7, 2, 30, 20].filter(c => c === 2 ? TX.list.some(t => !t.z) : c === 30 ? TX.list.some(t => t.z) : c === 20 ? RX.list.length : IX.base.some(i => IX.books[i].cat === c)).map(c => '<button type="button" data-jcat="' + c + '" class="' + (J.cat === c ? 'on' : '') + '" aria-pressed="' + (J.cat === c) + '">' + T({ 0: 'תנ״ך', 1: 'משנה', 7: 'רמב״ם', 2: 'ש״ס', 30: 'זוהר', 20: 'טור' }[c]) + '</button>').join('') + '</div>';
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
  function renderJumpZoh() {
    const groups = []; TX.list.forEach(t => { if (!t.z) return; let g = groups.find(x => x.name === t.g); if (!g) groups.push(g = { name: t.g, ts: [] }); g.ts.push(t); });
    const t = TX.list[TX.byK[J.tk]], dapim = []; for (let j = 0; j < t.n; j += 2) dapim.push(j);
    const cur = isTal() && S.tk === J.tk ? S.tj >> 1 : -1, dn = j => isEn() ? dafOf(j, t.d0).d : toHeb(dafOf(j, t.d0).d);
    $r('#rdJump').innerHTML = '<div class="rdPopHd">' + jTabs() + '<span class="rdJT">' + T('מעבר לדף') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdJGrid"><div class="rdJCol rdJBooks">' + groups.map(g => '<div class="rdJGrp">' + h(grpName(g.name)) + '</div>' + g.ts.map(x => '<button type="button" class="rdJB' + (x.k === J.tk ? ' on' : '') + '" data-jtk="' + h(x.k) + '">' + h(talName(x)) + '</button>').join('')).join('') + '</div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('דף') + ' · ' + h(talTitle(t)) + '</div><div class="rdCells">' + dapim.map(j => '<button type="button" class="rdCell' + ((J.tj >> 1) === (j >> 1) ? ' on' : '') + ((j >> 1) === cur ? ' cur' : '') + '" data-jd="' + j + '">' + dn(j) + '</button>').join('') + '</div></div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('עמוד') + '</div><div class="rdCells">' + [0, 1].map(sd => { const j = (J.tj & ~1) + sd; return '<button type="button" class="rdCell' + (J.tj === j ? ' on' : '') + '" data-jside="' + sd + '"' + (j >= t.n ? ' disabled' : '') + '>' + (isEn() ? 'ab'[sd] : 'אב'[sd]) + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="rdJFoot"><span>' + T('אפשר גם להקליד מקום בתיבת החיפוש') + ' · <b>← →</b> ' + T('דפדוף') + ' · <b>Ctrl G</b></span><button type="button" class="rdGo" data-jgo>' + (isEn() ? 'Go to ' : 'מעבר ל') + h(talTitle(t)) + ' ' + h(dafTxt(J.tj, t.k)) + '</button></div>';
  }
  function renderJumpTal() {
    const groups = []; TX.list.forEach(t => { if (t.z) return; let g = groups.find(x => x.name === t.g); if (!g) groups.push(g = { name: t.g, ts: [] }); g.ts.push(t); });
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
    if (J.cat === 30) return renderJumpZoh();
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
  const spin = () => '<span class="rdSpin" role="status" aria-label="' + T('טוען') + '"></span>'; // איקון קטן מסתובב במקום ״טוען…״
  let dropItems = [], dropAct = -1, qTimer = 0, dropQ = null;
  function closeDrop() { const d = $r('#rdDrop'); if (d) d.hidden = true; dropItems = []; dropAct = -1; PIN = []; busy(false); }
  // פס זוהר מסתובב סביב מסגרת החיפוש מההקלדה ועד שהתוצאות מוצגות
  function busy(on) { const o = $r('.rdOmni'); if (o) o.classList.toggle('rdBusy', !!on); }
  function scopeBooks() { const e = effScope(sqDomOf() || 'tanakh'); if (e === 'all') return IX.base.filter(i => IX.books[i].cat === IX.books[S.b].cat); if (e === 'grp') return grpBooks(S.b); return [S.b]; }
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
    const ss = srcSet(sqDomOf(), S.src), all = false, out = [], hasCm = ['cm', 'ks', 'ra', 'mm'].some(k => ss.has(k)), hasTr = ss.has('on') || ss.has('yo');
    books.forEach(b => {
      const L = IX.links[b] || {};
      if (ss.has('txt')) out.push(b);
      if (hasCm) (L.cms || []).forEach(m => out.push(m.b));
      if (hasTr) ['onkelos', 'yonatan'].forEach(k => { if (L[k] != null && ss.has(k === 'onkelos' ? 'on' : 'yo')) out.push(L[k]); });
    });
    return out;
  }
  function searchSrc(q, books, onlyCh) {
    const ss = srcSet(sqDomOf(), S.src), nq = norm(q), hits = [], txt = ss.has('txt'), cm = ['cm', 'ks', 'ra', 'mm'].some(k => ss.has(k)), tr = ss.has('on') || ss.has('yo');
    if (nq.length < 2) return { hits, total: 0, q: nq };
    // v3.31.0: ביטוי של כמה מילים נמצא גם כשהמילים לא צמודות (כל המילים באותו פסוק / פירוש) — בטלפון, ב-file:// ובנפילה מ-SQLite
    const ws = nq.split(' '), has = t => t.includes(nq) || (ws.length > 1 && ws.every(w => t.includes(w)));
    for (const b of books) {
      const T1 = txt ? normBook(IX, b) : null, L = IX.links[b] || {}, C1 = cm ? (L.cms || []).map(m => ({ c: m.c, n: cmNorm(m.b) })) : [];
      const TR = tr ? ['onkelos', 'yonatan'].filter(k => L[k] != null && ss.has(k === 'onkelos' ? 'on' : 'yo')).map(k => ({ k, n: normBook(IX, L[k]) })) : [];
      chaptersOf(IX, b).forEach(ch => {
        if (onlyCh && ch !== onlyCh) return;
        versesOf(IX, b, ch).forEach(v => {
          if (T1 && has((T1[ch] || [])[v] || '')) hits.push({ b, ch, v });
          TR.forEach(t => { if (has((t.n[ch] || [])[v] || '')) hits.push({ b, ch, v, tr: t.k }); });
          C1.forEach(m => ((m.n[ch] || [])[v] || []).forEach((t, k) => { if (has(t)) hits.push({ b, ch, v, cm: k, cs: m.c }); }));
        });
      });
    }
    return { hits, total: hits.length, q: nq };
  }
  const RH = 58, GH = 28, OVER = 12, cnt = n => n.toLocaleString('en-US'), resN = n => cnt(n) + ' ' + T(n === 1 ? 'תוצאה' : 'תוצאות'); // מספרי תוצאות בספרות, כמו במסך הגימטריה
  let RS = null;
  const talRefLabel = (k, j) => { const t = TX.list[TX.byK[k]]; return (t.z ? talTitle(t) : T('מסכת') + ' ' + talName(t)) + ' ' + T('דף') + ' ' + dafTxt(j, k); };
  const turRefLabel = (k, s) => T('טור') + ' ' + turPartName(turTOf(k)) + ' ' + (s ? T('סימן') + ' ' + num(s) : T('הקדמה'));
  const refItemLabel = it => it.kind === 'tur' ? turRefLabel(it.k, it.s) : it.kind === 'tal' ? talRefLabel(it.k, it.j) : (isRambam(it.r.b) ? T('רמב״ם') + ', ' : '') + refLabel(it.r);
  /* הצעות ספרים תוך כדי הקלדה (v3.21.0): כל ספר — תנ״ך, משנה, רמב״ם, מסכת בבלי או טור — ששמו או ראשי התיבות שלו מתחילים
     במה שהוקלד, אם עוד אינו ב"מעבר אל". sg = הצעה (ולא מקום שזוהה), ולכן Enter עדיין הולך לתוצאת החיפוש הראשונה. */
  const itKey = it => it.kind === 'ref' || it.kind === 'hit' ? 'b' + it.r.b : it.kind === 'tal' ? 't' + it.k : 'r' + it.k;
  function addSugg(q, max) {
    const have = new Set(dropItems.map(itKey));
    suggestPlaces(IX, TX, RX, q, max).forEach(x => {
      const it = x.kind === 'ref' ? { kind: 'ref', r: { b: x.b, ch: chaptersOf(IX, x.b)[0], v: 0 }, sg: true } : x.kind === 'tal' ? { kind: 'tal', k: TX.list[x.i].k, j: TX.list[x.i].j0 || 0, sg: true } : { kind: 'tur', k: RX.list[x.i].k, s: 1, sg: true };
      if (dropItems.length < max && !have.has(itKey(it))) { have.add(itKey(it)); dropItems.push(it); }
    });
  }
  const refsHtml = () => dropItems.length ? '<div class="rdDRefs"><div class="rdDH">' + T('מעבר אל') + '</div>' + dropItems.map((it, i) => '<button type="button" class="rdDI ref" data-i="' + i + '" role="option">' + ICON.book + '<span>' + h(refItemLabel(it)) + '</span></button>').join('') + '</div>' : '';
  function renderDropTal() {
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; busy(false); return; }
    const tr = parseDafRef(TX, q), ref = parseRef(IX, q, null), rref = parseTurRef(RX, q);
    if (rref) dropItems.push({ kind: 'tur', k: rref.k, s: rref.s });
    if (tr) dropItems.push({ kind: 'tal', k: tr.k, j: tr.j });
    if (ref && !(tr && tr.explicit)) dropItems.push({ kind: 'ref', r: ref });
    addSugg(q, 6);
    let html = refsHtml();
    const sq = sqOn(), res = sq ? sqSearch(q) : searchTal(q), n = sq ? res.total : res.hits.length;
    const cntTxt = res.q.length < 2 ? '' : res.wait ? spin() : n ? resN(n) : T('אין תוצאות');
    if (talT().z) { // בזוהר: מקורות החיפוש בפרשה — הזוהר, התרגום, הסולם או הכל
      html += '<div class="rdDScope" role="group"><span class="rdSrc" role="group" aria-label="' + T('חיפוש ב') + '">' + [['g', 'זוהר'], ['t', 'תרגום'], ['r', 'הסולם'], ['all', 'הכל']].map(([v, l]) => '<button type="button" data-tsrc="' + v + '" class="' + (S.tsrc === v ? 'on' : '') + '" aria-pressed="' + (S.tsrc === v) + '">' + T(l) + '</button>').join('') + '</span><span class="cnt">' + cntTxt + '</span></div>';
    } else html += dropBar('talmud', cntTxt);
    // כל ההתאמות במסכת, ברשימה הווירטואלית עם פס הגלילה המהיר: קבוצה לכל דף (עמוד), וסימון על הפס בכל עשרה דפים
    const start = dropItems.length, t0 = talT();
    res.hits.forEach(x => dropItems.push(sq ? sqItem(x, 'talmud') : { kind: 'thit', x }));
    if (n) html += resList(res.hits, start, q, {
      sq, key: sq ? null : x => x.j, gh: x => T('דף') + ' ' + dafTxt(x.j),
      tick: sq ? null : x => Math.floor((dafOf(x.j, t0.z ? t0.d0 : 2).d) / 10), tickName: g => T('דף') + ' ' + (isEn() ? Math.max(t0.z ? t0.d0 : 2, g * 10) : toHeb(Math.max(t0.z ? t0.d0 : 2, g * 10))),
      bub: x => (x.tk ? talName(TX.list[TX.byK[x.tk]]) : talName(t0)) + ' ' + dafTxt(x.j),
      row: x => {
        const tag = x.src === 'g' ? '' : x.src === 'r' ? (TD[x.tk || S.tk] ? srcLabel(x.tk || S.tk, x.j, 'r') : T('רש״י')) : srcLabel(x.tk || S.tk, x.j, 't');
        return { tag, fc: tag && !t0.z ? S.cmFont : '', ref: x.ref || dafTxt(x.j) + ' · ' + T(t0.z ? 'פסקה' : 'קטע') + ' ' + num(x.s + 1), t: plainT(x.t), html: x.html };
      }
    });
    d.innerHTML = html; d.hidden = false; busy(sq && res.wait);
    bindRes();
    if (dropItems.length) setAct(lastAct());
  }
  function renderDropTur() { // בטור: מעבר למקום (סימן, דף, פסוק) וחיפוש בטור ובמפרשיו
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; busy(false); return; }
    const rr = parseTurRef(RX, q), tr = parseDafRef(TX, q), ref = parseRef(IX, q, null);
    if (rr) dropItems.push({ kind: 'tur', k: rr.k, s: rr.s });
    else { const n = parseNum(turClean(q)); if (n >= 1 && n < turT().n && /^[א-ת\d]{1,4}$/.test(turClean(q))) dropItems.push({ kind: 'tur', k: S.rk, s: n }); }
    if (tr && tr.explicit) dropItems.push({ kind: 'tal', k: tr.k, j: tr.j });
    if (ref && !rr) dropItems.push({ kind: 'ref', r: ref });
    addSugg(q, 6);
    let html = refsHtml();
    const t = turT(), k = t.k, sq = sqOn(), res = sq ? sqSearch(q) : searchTur(q), n = res.hits.length;
    // בכל הטור צריך את כל החלקים שלו (כ-2MB כל אחד); עד שהם נטענים — "טוען…" במקום מספר התוצאות
    if (res.wait && !sq) loadTur(k, turAll(t), ok => { if (ok && S.rk === k && dropQ === q && !$r('#rdDrop').hidden) renderDrop(); });
    const scopes = [['s', 'בסימן'], ['all', 'בכל הטור']].concat(sq ? [['every', 'בכל הטורים']] : []), srcs = [['t', 'טור'], ['y', 'בית יוסף'], ['c', 'ב״ח'], ['all', 'הכל']];
    html += dropBar('tur', (res.q.length < 2 ? '' : res.wait ? spin() : n ? resN(n) : T('אין תוצאות')));
    const start = dropItems.length, sLabel = s => s ? T('סימן') + ' ' + num(s) : T('הקדמה');
    res.hits.forEach(x => dropItems.push(sq ? sqItem(x, 'tur') : { kind: 'rhit', x }));
    if (n) html += resList(res.hits, start, q, {
      sq, key: sq || S.rscope === 's' ? null : x => x.s, gh: x => sLabel(x.s) + (hilOf(t, x.s) ? ' · ' + hilOf(t, x.s) : ''),
      tick: sq || S.rscope === 's' ? null : x => hilOf(t, x.s) || null, tickName: g => g,
      bub: x => turPartName(x.k ? turTOf(x.k) : t) + ' · ' + sLabel(x.s),
      row: x => ({ tag: x.x === 't' ? '' : turCmName(x.x) + ' ' + RL(x.x, x.i), fc: x.x === 't' ? '' : 'rashi', ref: x.ref || sLabel(x.s), t: x.pt != null ? x.pt : turHitText(x), html: x.html })
    });
    else if (!res.wait) html += '<p class="rdNote rdDNote">' + T(res.q.length < 2 ? 'בטור מקלידים מקום: ״או״ח ס״, ״יו״ד קצג״, או מספר סימן.' : 'אפשר גם להקליד מקום: ״או״ח ס״, ״יו״ד קצג״.') + '</p>';
    d.innerHTML = html; d.hidden = false; busy(res.wait);
    bindRes();
    if (dropItems.length) setAct(lastAct());
  }
  /* ---------- חיפוש בתנ״ך ובמשנה עם SQLite FTS5 (v3.31.0-search-sqlite) ----------
     המנוע: sqlite-search.js (GimSq). המסד לכל תחום (תנ״ך, משנה): generated/sqlite/<תחום>.sqlite3, שנקרא בטווחים (HTTP Range) דרך sql.js-httpvfs
     (vendor/sql.js-httpvfs, Apache-2.0) — הדפדפן מוריד רק את עמודי המסד שהחיפוש צריך, ולא טוענים לזיכרון את ספרי התנ״ך.
     כמה Workers במקביל (SQ_N), כל אחד עם עותק של המסד: המילים של שאילתה והטקסטים של התוצאות נקראים בו-זמנית, כך
     שההשהיה של הרשת לא מצטברת. הכל נטען ברקע כשנפתח ספר תנ״ך, לפני החיפוש הראשון.
     פועל בתנ״ך, בכל התחומים (פרק, ספר, כל התנ״ך) ובכל המקורות (פסוקים, רש״י, תרגום, הכל), ב-http/https ובמחשב.
     בטלפון, ב-file:// או בכשל — החיפוש הקודם. התוצאות: לפי דירוג, 50 בכל פעם (עוד 50 בגלילה), עם הסכום הכולל. */
  const SQ_N = 4, SQ_MAX = 8 << 20; // 4 Workers; כל אחד עד כ-8MB של עמודים בזיכרון
  const SQD = {}; // תחום ('tanakh' / 'mishnah') → {P: הבטחה, E: המנוע, fail}
  let SQ = null, SQHL = null;
  const sqDomOf = () => { if (isTur()) return 'tur'; if (isTal()) return isZ() ? null : 'talmud'; const c = IX.books[S.b].cat; return c === 0 ? 'tanakh' : c === 1 ? 'mishnah' : c === 7 ? 'rambam' : null; }; // בזוהר: חיפוש בפרשה הפתוחה, בלי מסד SQLite
  const sqPhone = () => G.matchMedia && G.matchMedia('(hover: none) and (pointer: coarse)').matches; // טלפון / טאבלט (מסך מגע בלי עכבר)
  const sqOn = () => { const d = sqDomOf(); return !!d && !(SQD[d] && SQD[d].fail) && !!G.GimSq && /^https?:$/.test(location.protocol) && !sqPhone() && typeof Worker !== 'undefined'; };
  const sqScript = src => new Promise((ok, no) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); });
  const sqAbs = p => new URL(p, location.href).href;
  const sqShared = () => { try { return G.GT_EMBED && G.parent && G.parent !== G && G.parent.GimSqPool || null; } catch (e) { return null; } };
  function sqReady(name, glob) {
    const st = SQD[name] || (SQD[name] = { P: null, E: null, fail: false });
    if (st.P) return st.P;
    // בשולחן העבודה: המנוע והמאגר משותפים לכל החלונות (sqpool.js בדף השולחן), בלי Workers משלנו
    const sh = sqShared();
    if (sh) { st.stop = () => {}; st.P = sh.engine(name, IX.books).then(E => { G.GIM_SQ_DBS = Object.assign(G.GIM_SQ_DBS || {}, G.parent.GIM_SQ_DBS); return (st.E = E); }); st.P.catch(() => { st.fail = true; }); return st.P; }
    const DM = G.GimSq.DOMAINS[name], TB = DM.tabs;
    if (!glob) Object.keys(SQD).forEach(o => { if (o !== name && SQD[o].P) SQD[o].stop(); }); // תחום אחד פעיל בכל רגע, כדי שהזיכרון לא יצטבר (בחיפוש בכל הספרים — כולם פעילים, 2 Workers לכל אחד)
    st.P = Promise.all([G.createDbWorker || sqScript('vendor/sql.js-httpvfs/index.js'), (G.GIM_SQ_DBS && G.GIM_SQ_DBS[name]) || sqScript('generated/sqlite/' + name + '.js')]).then(async () => {
      // maxReadSpeed: קריאה מראש של עד 8 עמודים כשהקריאה רציפה (רשימת מופעים ארוכה); ראו הערה ב-vendor/sql.js-httpvfs/README.md
      // כתובת נפרדת לכל Worker (&w=): הדפדפן מעביר בקשות לאותה כתובת אחת-אחת (נעילת המטמון), וכך הן יוצאות במקביל
      const D = G.GIM_SQ_DBS[name], cfg = i => [{ from: 'inline', config: { serverMode: 'chunked', urlPrefix: sqAbs(D.file) + '.', suffixLength: 3, serverChunkSize: D.chunk, databaseLengthBytes: D.bytes, cacheBust: D.hash + '&w=' + i, requestChunkSize: D.page, maxReadSpeed: D.page * 8 } }];
      const NW = glob || D.bytes > 40 << 20 ? 2 : SQ_N; // מסד גדול (גמרא, טור): פחות Workers, כל אחד מוריד בעצמו את השורשים
      const open = async (i, first) => {
        const w = await G.createDbWorker(cfg(i), sqAbs('vendor/sql.js-httpvfs/sqlite.worker.js'), sqAbs('vendor/sql.js-httpvfs/sql-wasm.wasm'));
        // ה-WASM כבר במטמון — שאר ה-Workers נפתחים ומתחממים במקביל לראשון, ולא אחריו
        if (first) for (let k = 1; k < NW; k++) open(k).then(x => { pool.push(x); pump(); }, () => {});
        // השורשים והעמודים הפנימיים של האינדקסים ושל הטקסטים — פעם אחת לכל Worker, כך שכל מילה בחיפוש היא בקשה אחת
        // Worker נכנס לתור אחרי שחימם טבלה אחת בלבד (בסדר מסובב לפי מספרו); שאר הטבלאות מתחממות ברקע בזמן שהוא פנוי לשאילתות על הטבלה הראשונה
        const wq = k => 'SELECT count(*) FROM f' + k + '_idx; SELECT max(id) FROM f' + k + '_data; SELECT count(*) FROM v' + k + " WHERE term = 'אאא';", TR = TB.map((_, n) => TB[(n + i) % TB.length]);
        await w.db.exec(wq(TR[0]) + ' SELECT min(id) FROM d; SELECT max(id) FROM d;');
        const st = await w.worker.getStats(); if (st && st.totalFetchedBytes > 6 << 20) throw new Error('no range support'); // שרת בלי Range מחזיר את כל הקובץ
        const x = { w, i, busy: 0, jobs: 0 };
        if (TR.length > 1) { x.busy = 1; w.db.exec(TR.slice(1).map(wq).join(' ')).catch(() => {}).then(() => { x.busy = 0; pump(); }); }
        return x;
      };
      /* תור משותף לכל ה-Workers: Worker פנוי לוקח את השאילתה בעדיפות הגבוהה ביותר (0 מילים, 1 טקסטים שבחלון, 2 השאר).
         שאילתה של חיפוש שכבר הוחלף (alive() = false) לא נשלחת בכלל — כך הקלדה מהירה לא מעכבת את החיפוש האחרון. */
      const pool = [], Q = [];
      st.stop = () => { pool.splice(0).forEach(x => { x.old = true; x.w.raw && x.w.raw.terminate(); }); Q.splice(0).forEach(j => j.no(new Error('stale'))); st.P = st.E = null; };
      const pump = () => {
        for (const x of pool) {
          if (x.busy) continue;
          let j = null;
          while (Q.length) { Q.sort((a, b) => a.pri - b.pri || a.n - b.n); j = Q.shift(); if (!j.alive || j.alive()) break; j.no(new Error('stale')); j = null; }
          if (!j) return;
          x.busy = 1;
          x.w.db.exec(j.sql, j.args).then(r => { x.busy = 0; j.ok(r.length ? r[0].values : []); done(x); }, e => { x.busy = 0; j.no(e); done(x); });
        }
      };
      // כל Worker שומר בזיכרון כל עמוד שקרא. אחרי SQ_MAX בתים הוא מוחלף ב-Worker חדש, כדי שהזיכרון לא יגדל בלי סוף
      const done = x => {
        if (++x.jobs % 16 === 0) x.w.worker.getStats().then(st => {
          if (!st || st.totalFetchedBytes < SQ_MAX || x.old || pool.length < 2) return;
          x.old = true; pool.splice(pool.indexOf(x), 1);
          open(x.i).then(y => { pool.push(y); pump(); }, () => {});
          const end = () => x.busy ? setTimeout(end, 200) : x.w.raw && x.w.raw.terminate(); end();
        }, () => {});
        pump();
      };
      let n = 0;
      const backend = { all: (sql, args, o) => new Promise((ok, no) => { Q.push({ sql, args, ok, no, n: n++, pri: o && o.pri != null ? o.pri : 0, alive: o && o.alive }); pump(); }) };
      pool.push(await open(0, true)); // הראשון קודם, כדי שה-WASM יירד פעם אחת ושאר ה-Workers יקבלו אותו מהמטמון
      return st.E = G.GimSq.create(backend, D.bk ? D.bk.map(x => ({ cat: DM.cat, cv: x.cv })) : IX.books, name);
    });
    st.P.catch(() => { st.fail = true; });
    return st.P;
  }
  let sqWarmed = null;
  function sqWarm() { const d = sqDomOf(); if (!d || !sqOn() || SQD[d] && SQD[d].P || sqWarmed === d) return; sqWarmed = d; setTimeout(() => sqReady(d).catch(() => {}), 150); } // אחרי שהספר מוצג
  // מילה מוצגת → האם היא אחת ממילות השאילתה (לסימון בעמוד אחרי מעבר): בכל צורה שהאינדקס מכיר (כתיב, אותיות שימוש, תחילית)
  function sqHl(q) {
    const ws = []; (function walk(e) { if (!e) return; if (e.k === 'w') ws.push(e); else if (e.k === 'p') e.ws.forEach(x => ws.push(x)); else if (e.k === 'not') walk(e.a); else (e.c && e.k !== 'neg' ? e.c : []).forEach(walk); })(G.GimSq.parse(q));
    const test = w => { const f = G.GimSq.forms(w, false).slice(1).concat(G.GimSq.forms(w, true).slice(2)); return ws.some(x => f.some(y => x.pre ? y.startsWith(x.kf) : y === x.kf)); };
    return { q, test };
  }
  // טקסט מוצג + המילים לסימון (Set של מספרי מילים, או test על המילה) → HTML; בטקסט ארוך — מתחילים קצת לפני ההתאמה הראשונה
  function sqMarkHtml(t, marks, test) {
    const W = G.GimSq.words(t), on = W.parts.map((p, i) => W.wi[i] >= 0 && (marks ? marks.has(W.wi[i]) : test(W.ws[W.wi[i]])));
    return W.parts.map((p, k) => {
      if (!on[k]) return h(p);
      const m = /^([^א-ת]*)(.*?)([^א-ת\u0591-\u05C7]*)$/.exec(p); // סימני פיסוק מחוץ לסימון
      return h(m[1]) + '<mark class="rdHl">' + h(m[2]) + '</mark>' + h(m[3]);
    }).join('');
  }
  /* שורת תוצאה (שורה אחת ברשימה): כל המילים שנמצאו תמיד נראות. units = [{t, marks}] (בקטע — כמה פסוקים). אם הכל לא נכנס
     ברוחב השורה (נמדד בפיקסלים לפי רוחב מסגרת החיפוש והגופן), מציגים את סביבת המילים שנמצאו — כמה שיותר מילים מכל צד שעדיין
     נכנסות (עד 0), עם ״…״ בין הקטעים */
  let sqCtx = null;
  function sqFit() {
    const cl = document.documentElement.classList; // שולחן העבודה: הכותרת מוסתרת, אז מודדים לפי רוחב המארח / חלון התוצאות (שתי שורות)
    if (cl.contains('gtSearch')) return Math.max(300, innerWidth - 54);
    if (cl.contains('gtResults')) return Math.max(300, (innerWidth - 330) * 1.8);
    const o = $r('.rdOmni'), w = o ? o.getBoundingClientRect().width : 0;
    return w ? w - 54 : 470; // ריפוד הפנל והשורה, פס הגלילה ומרווח ביטחון
  }
  function sqWidth(t) {
    if (!sqCtx) { try { sqCtx = document.createElement('canvas').getContext('2d'); } catch (e) { sqCtx = false; } }
    if (!sqCtx) return t.length * 8;
    sqCtx.font = '14.5px "GimFrank", serif';
    return sqCtx.measureText(t).width;
  }
  function sqSnippet(units, sep) {
    const P = []; // {p, w (מספר המילה הרץ או -1), on}
    let nw = 0;
    units.forEach((x, k) => {
      if (k) P.push({ p: sep, w: -1, sep: true });
      const W = G.GimSq.words(x.t);
      W.parts.forEach((p, i) => { if (!p) return; const wi = W.wi[i]; P.push({ p, w: wi >= 0 ? nw + wi : -1, on: wi >= 0 && x.marks.has(wi) }); });
      nw += W.ws.length;
    });
    const hits = P.filter(x => x.on).map(x => x.w);
    const mark = p => { const m = /^([^א-ת]*)(.*?)([^א-ת\u0591-\u05C7]*)$/.exec(p); return h(m[1]) + '<mark class="rdHl">' + h(m[2]) + '</mark>' + h(m[3]); };
    const plainSep = x => x.sep ? ' … ' : x.p;
    const build = keep => {
      if (!keep) return { html: P.map(x => x.sep ? x.p : x.on ? mark(x.p) : h(x.p)).join(''), txt: P.map(plainSep).join('') };
      let html = '', txt = '', last = -2, open = false;
      P.forEach((x, i) => {
        if (x.w < 0) { if (open && P[i + 1] && keep.has(P[i + 1].w)) { html += x.sep ? x.p : h(x.p); txt += plainSep(x); } return; }
        if (!keep.has(x.w)) { open = false; return; }
        if (x.w !== last + 1 || !open) { const d = x.w > 0 || last >= 0 ? (html ? ' … ' : '… ') : ''; html += d; txt += d; }
        html += x.on ? mark(x.p) : h(x.p); txt += x.p; last = x.w; open = true;
      });
      const end = last < nw - 1 ? ' …' : '';
      return { html: html + end, txt: txt + end };
    };
    const fit = sqFit();
    let best = build(null);
    if (!hits.length || sqWidth(best.txt) <= fit) return best.html;
    for (const r of [16, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0]) {
      const keep = new Set(); hits.forEach(w => { for (let k = w - r; k <= w + r; k++) keep.add(k); });
      best = build(keep);
      if (sqWidth(best.txt) <= fit) break;
    }
    return best.html;
  }
  /* ---- היקף ומקורות החיפוש (v4.5.0) ----
     היקף: פרק, פרשה (בתורה), ספר, חלק (תורה / נביאים / כתובים, סדר במשנה, ספר ברמב״ם, סדר בגמרא), כל התחום, וכל הספרים.
     מקורות: כל שכבה בנפרד (פסוקים, רש״י, כל תרגום, כל מפרש ברמב״ם…) כקבוצה מסומנת: 'all' או 'a+b'. ערכים ישנים (tr, cm) עדיין נקראים. */
  const SRC_DEF = { tanakh: [['txt', 'פסוקים'], ['cm', 'רש״י'], ['on', 'תרגום אונקלוס'], ['yo', 'תרגום יונתן']], mishnah: [['txt', 'משניות'], ['cm', 'ברטנורא']],
    rambam: [['txt', 'הלכות'], ['ks', 'כסף משנה'], ['ra', 'השגות הראב״ד'], ['mm', 'משנה למלך']], talmud: [['g', 'גמרא'], ['r', 'רש״י'], ['t', 'תוספות']], tur: [['t', 'טור'], ['y', 'בית יוסף'], ['c', 'ב״ח']] };
  const srcKeys = dom => SRC_DEF[dom].map(x => x[0]);
  function srcSet(dom, v) {
    const all = srcKeys(dom); if (v === 'none') return new Set(); if (!v || v === 'all') return new Set(all);
    const out = new Set();
    String(v).split('+').forEach(k => {
      if (dom === 'tanakh' && k === 'tr') { out.add('on'); out.add('yo'); } else if (dom === 'rambam' && k === 'cm') { ['ks', 'ra', 'mm'].forEach(x => out.add(x)); }
      else if (dom === 'mishnah' && k === 'tr') all.forEach(x => out.add(x)); else if (all.includes(k)) out.add(k);
    });
    return out.size ? out : new Set(all);
  }
  const srcStr = (dom, set) => { const all = srcKeys(dom), l = all.filter(k => set.has(k)); return l.length === all.length ? 'all' : l.length ? l.join('+') : 'none'; };
  const srcIdx = (dom, set) => { const SR = G.GimSq.DOMAINS[dom].srcs, out = new Set(); set.forEach(k => (SR[k] || []).forEach(i => out.add(i))); return [...out]; };
  // פרשות התורה (חלוקה מסורתית, מספור פרקים עברי): [ספר, שם, פרק התחלה, פסוק, פרק סיום, פסוק]
  const PAR = [['בראשית', 'בראשית', 1, 1, 6, 8], ['בראשית', 'נח', 6, 9, 11, 32], ['בראשית', 'לך לך', 12, 1, 17, 27], ['בראשית', 'וירא', 18, 1, 22, 24], ['בראשית', 'חיי שרה', 23, 1, 25, 18], ['בראשית', 'תולדות', 25, 19, 28, 9],
    ['בראשית', 'ויצא', 28, 10, 32, 3], ['בראשית', 'וישלח', 32, 4, 36, 43], ['בראשית', 'וישב', 37, 1, 40, 23], ['בראשית', 'מקץ', 41, 1, 44, 17], ['בראשית', 'ויגש', 44, 18, 47, 27], ['בראשית', 'ויחי', 47, 28, 50, 26],
    ['שמות', 'שמות', 1, 1, 6, 1], ['שמות', 'וארא', 6, 2, 9, 35], ['שמות', 'בא', 10, 1, 13, 16], ['שמות', 'בשלח', 13, 17, 17, 16], ['שמות', 'יתרו', 18, 1, 20, 23], ['שמות', 'משפטים', 21, 1, 24, 18], ['שמות', 'תרומה', 25, 1, 27, 19],
    ['שמות', 'תצוה', 27, 20, 30, 10], ['שמות', 'כי תשא', 30, 11, 34, 35], ['שמות', 'ויקהל', 35, 1, 38, 20], ['שמות', 'פקודי', 38, 21, 40, 38],
    ['ויקרא', 'ויקרא', 1, 1, 5, 26], ['ויקרא', 'צו', 6, 1, 8, 36], ['ויקרא', 'שמיני', 9, 1, 11, 47], ['ויקרא', 'תזריע', 12, 1, 13, 59], ['ויקרא', 'מצורע', 14, 1, 15, 33], ['ויקרא', 'אחרי מות', 16, 1, 18, 30],
    ['ויקרא', 'קדושים', 19, 1, 20, 27], ['ויקרא', 'אמור', 21, 1, 24, 23], ['ויקרא', 'בהר', 25, 1, 26, 2], ['ויקרא', 'בחוקותי', 26, 3, 27, 34],
    ['במדבר', 'במדבר', 1, 1, 4, 20], ['במדבר', 'נשא', 4, 21, 7, 89], ['במדבר', 'בהעלותך', 8, 1, 12, 16], ['במדבר', 'שלח', 13, 1, 15, 41], ['במדבר', 'קרח', 16, 1, 18, 32], ['במדבר', 'חקת', 19, 1, 22, 1],
    ['במדבר', 'בלק', 22, 2, 25, 9], ['במדבר', 'פינחס', 25, 10, 30, 1], ['במדבר', 'מטות', 30, 2, 32, 42], ['במדבר', 'מסעי', 33, 1, 36, 13],
    ['דברים', 'דברים', 1, 1, 3, 22], ['דברים', 'ואתחנן', 3, 23, 7, 11], ['דברים', 'עקב', 7, 12, 11, 25], ['דברים', 'ראה', 11, 26, 16, 17], ['דברים', 'שופטים', 16, 18, 21, 9], ['דברים', 'כי תצא', 21, 10, 25, 19],
    ['דברים', 'כי תבוא', 26, 1, 29, 8], ['דברים', 'נצבים', 29, 9, 30, 20], ['דברים', 'וילך', 31, 1, 31, 30], ['דברים', 'האזינו', 32, 1, 32, 52], ['דברים', 'וזאת הברכה', 33, 1, 34, 12]];
  const parashaOf = (b, ch) => { const t = IX.books[b].heTitle; const p = PAR.find(x => x[0] === t && (ch > x[2] || ch === x[2]) && (ch < x[4] || ch === x[4])); return p ? { name: p[1], c1: p[2], v1: p[3], c2: p[4], v2: p[5] } : null; };
  const bookVerses = i => IX.books[i].cv.reduce((a, c) => a + (c || 0), 0);
  const grpBooks = b => IX.base.filter(i => IX.books[i].cat === IX.books[b].cat && IX.books[i].g && IX.books[i].g === IX.books[b].g);
  const grpRange = (M, b) => { const l = grpBooks(b); return { lo: Math.min(...l.map(i => M.first[i])), hi: Math.max(...l.map(i => M.first[i] + bookVerses(i) - 1)) }; };
  const talG = k => { const t = TX.list[TX.byK[k]]; return t && t.g || ''; };
  const talGrpIdx = (bk, k) => { const g = talG(k); return g ? bk.map((x, i) => talG(x.k) === g ? i : -1).filter(i => i >= 0) : []; };
  // רמות ההיקף הזמינות לתחום, לפי המקום הנוכחי: [מפתח, תווית, שם]
  function scopeLevels(dom, sq) {
    if (dom === 'tur') return [['s', 'בסימן', ''], ['all', 'בכל הטור', turPartName(turTOf(S.rk))]].concat(sq ? [['every', 'בכל הטורים', '']] : []);
    if (dom === 'talmud') { if (!sq) return []; const t = TX.list[TX.byK[S.tk]] || {}, L = [['tr', 'במסכת', talName(t)]]; if (t.g) L.push(['grp', 'בסדר', t.g]); return L.concat([['all', 'בכל הש״ס', '']]); }
    const B = IX.books[S.b], L = [['ch', 'בפרק', '']];
    if (sq && dom === 'tanakh' && B.g === 'תורה') { const p = parashaOf(S.b, S.ch); if (p) L.push(['par', 'בפרשה', 'פרשת ' + p.name]); }
    L.push(['book', dom === 'tanakh' ? 'בספר' : dom === 'mishnah' ? 'במסכת' : 'בהלכות', bkName(B.heTitle)]);
    if (sq && B.g && grpBooks(S.b).length > 1) L.push(['grp', dom === 'tanakh' ? 'בחלק' : dom === 'mishnah' ? 'בסדר' : 'בספר', B.g]);
    L.push(['all', dom === 'tanakh' ? 'בכל התנ״ך' : dom === 'mishnah' ? 'בכל המשנה' : 'בכל הרמב״ם', '']);
    return L;
  }
  const scopeProp = dom => dom === 'talmud' ? 'tscope' : dom === 'tur' ? 'rscope' : 'scope', srcProp = dom => dom === 'talmud' ? 'tsrc' : dom === 'tur' ? 'rsrc' : 'src';
  // ההיקף בפועל: ערך שאין לו מקום בספר הנוכחי (פרשה בנביאים, חלק של ספר בודד) יורד לספר
  function effScope(dom) { const k = S[scopeProp(dom)]; return scopeLevels(dom, true).some(l => l[0] === k) ? k : (dom === 'talmud' ? 'tr' : dom === 'tur' ? 'all' : 'book'); }
  function scopeSig(dom) {
    const k = effScope(dom);
    if (dom === 'talmud') return k + (k === 'tr' ? S.tk : k === 'grp' ? talG(S.tk) : '');
    if (dom === 'tur') return k + S.rk + (k === 's' ? S.rs : '');
    return k + (k === 'all' ? '' : k === 'book' ? S.b : k === 'ch' ? S.b + ':' + S.ch : k === 'grp' ? IX.books[S.b].g : (parashaOf(S.b, S.ch) || {}).name);
  }
  // המפתח של החיפוש הנוכחי: שאילתה חדשה רק כשמשהו מאלה משתנה (תחום, מקורות, תחום חיפוש, והמקום שהתחום תלוי בו)
  function sqKey(dom) {
    if (dom === 'talmud') return dom + '|' + srcStr(dom, srcSet(dom, S.tsrc)) + '|' + scopeSig(dom);
    if (dom === 'tur') return dom + '|' + srcStr(dom, srcSet(dom, S.rsrc)) + '|' + scopeSig(dom) + '|' + S.rOff.join('');
    return dom + '|' + srcStr(dom, srcSet(dom, S.src)) + '|' + scopeSig(dom);
  }
  // טווח (ord) של ספר סינתטי (מסכת / טור) ושל פרק בו (עמוד / סימן); הפרקים ממוספרים מ-1
  function sqBookRange(M, bk, bi, ch) {
    const cv = bk[bi].cv, lo = ch ? M.ord(bi, ch, 1) : M.first[bi];
    return { lo, hi: lo + (ch ? cv[ch] : cv.reduce((a, c) => a + (c || 0), 0)) - 1 };
  }
  function sqOpt(dom) {
    const E = SQD[dom].E, M = E.map, bk = (G.GIM_SQ_DBS[dom] || {}).bk, ss = srcIdx(dom, srcSet(dom, S[srcProp(dom)])), es = effScope(dom);
    if (dom === 'talmud') {
      const o = { srcs: ss };
      if (es === 'tr') Object.assign(o, sqBookRange(M, bk, bk.findIndex(x => x.k === S.tk)));
      else if (es === 'grp') { const l = talGrpIdx(bk, S.tk).map(i => sqBookRange(M, bk, i)); o.lo = Math.min(...l.map(r => r.lo)); o.hi = Math.max(...l.map(r => r.hi)); }
      return o;
    }
    if (dom === 'tur') {
      const srcs = ss.filter(x => !(x === 1 && S.rOff.includes('y')) && !(x === 2 && S.rOff.includes('c')));
      const o = { srcs }, bi = bk.findIndex(x => x.k === S.rk);
      if (es === 's') Object.assign(o, sqBookRange(M, bk, bi, S.rs + 1)); else if (es !== 'every') Object.assign(o, sqBookRange(M, bk, bi));
      return o;
    }
    const o = { srcs: ss };
    if (es === 'ch') { o.lo = M.ord(S.b, S.ch, 1); o.hi = o.lo + (IX.books[S.b].cv[S.ch] || 1) - 1; }
    else if (es === 'book') { o.lo = M.first[S.b]; o.hi = M.first[S.b] + bookVerses(S.b) - 1; }
    else if (es === 'grp') Object.assign(o, grpRange(M, S.b));
    else if (es === 'par') { const p = parashaOf(S.b, S.ch); o.lo = M.ord(S.b, p.c1, p.v1); o.hi = M.ord(S.b, p.c2, p.v2); }
    return o;
  }
  // תוצאת המנוע → תוצאה ברשימה: {b, ch, v, cm/cs או tr, pt (הטקסט), html (עם הסימון), ref (בקטע של כמה פסוקים)}
  function sqSegText(us, r, tx, DM) { // הטקסט (pt) ו-HTML עם הסימון, לכל התחומים
    return { pt: us.map(u => tx.get(u)).join(' '), html: sqSnippet(us.map(u => ({ t: tx.get(u), marks: r.marks.get(u) || new Set() })), DM.multi.includes(r.src) ? ' <span class="rdCont">…</span> ' : ' ') };
  }
  // גמרא וטור: אותה תוצאה כמו בחיפוש הקודם (thit / rhit), עם שם המסכת / הטור, כי החיפוש יכול לחצות מסכתות
  function sqHitBk(r, tx, dom) {
    const E = SQD[dom].E, M = E.map, DM = G.GimSq.DOMAINS[dom], bk = G.GIM_SQ_DBS[dom].bk, us = E.unitsOf(r).filter(u => tx.get(u) != null), u0 = us[0] != null ? us[0] : E.unitsOf(r)[0], ord = G.GimSq.rOrd(u0);
    const k = bk[M.ob[ord]].k, ch = M.oc[ord], v = M.ov[ord], t = sqSegText(us, r, tx, DM), x = { sq: true, sc: r.sc, pt: t.pt, html: t.html };
    let e = r.e > r.s ? (DM.multi.includes(r.src) ? G.GimSq.rOrd(us[us.length - 1]) : r.e) : ord;
    if (dom === 'talmud') {
      const tt = TX.list[TX.byK[k]], j = ch - 1; Object.assign(x, { tk: k, j, s: v - 1, src: ['g', 'r', 't'][r.src], t: t.pt });
      x.ref = talName(tt) + ' ' + dafTxt(j) + ' · ' + T('קטע') + ' ' + num(v) + (e > ord ? '–' + (M.oc[e] === ch ? num(M.ov[e]) : dafTxt(M.oc[e] - 1) + ' · ' + num(M.ov[e])) : '');
    } else {
      const tt = turTOf(k), sL = s => s ? T('סימן') + ' ' + num(s) : T('הקדמה');
      Object.assign(x, { k, s: ch - 1, x: 'tyc'[r.src], i: v - 1 });
      x.ref = turPartName(tt) + ' · ' + sL(ch - 1) + (e > ord && M.oc[e] === ch ? ', ' + T('פסקאות') + ' ' + num(v) + '–' + num(M.ov[e]) : '');
    }
    return x;
  }
  function sqHit(r, tx, dom) {
    if (dom === 'talmud' || dom === 'tur') return sqHitBk(r, tx, dom);
    const E = SQD[dom].E, M = E.map, us = E.unitsOf(r).filter(u => tx.get(u) != null), u0 = us[0] != null ? us[0] : E.unitsOf(r)[0], ord = G.GimSq.rOrd(u0);
    const x = { b: M.ob[ord], ch: M.oc[ord], v: M.ov[ord], sq: true, sc: r.sc };
    const DM = G.GimSq.DOMAINS[dom];
    if (DM.csOf[r.src]) { x.cm = G.GimSq.rK(u0); x.cs = DM.csOf[r.src]; } else if (r.src >= 2) x.tr = r.src === 2 ? 'onkelos' : 'yonatan';
    if (r.e > r.s) { const e = DM.multi.includes(r.src) ? G.GimSq.rOrd(us[us.length - 1]) : r.e; if (e > ord) x.ref = refLabel(x) + '–' + (M.oc[e] === x.ch ? num(M.ov[e]) : num(M.oc[e]) + ', ' + num(M.ov[e])); }
    x.pt = us.map(u => tx.get(u)).join(' ');
    x.html = sqSnippet(us.map(u => ({ t: tx.get(u), marks: r.marks.get(u) || new Set() })), DM.multi.includes(r.src) ? ' <span class="rdCont">…</span> ' : ' ');
    return x;
  }
  /* הרשימה בגודל כל התוצאות (פס הגלילה המהיר מדויק מהרגע הראשון); שורות שעוד לא נטענו הן {ph:true}. הטקסטים נטענים לפי החלון
     הנראה (sqLoad מ-resWin), והשורה מתעדכנת במקומה (sqPaint) בלי לבנות את הרשימה מחדש ובלי לאבד את מקום הגלילה. */
  const sqItem = (x, dom) => x.ph ? { kind: 'ph' } : (x.dom || dom) === 'talmud' ? { kind: 'thit', x } : (x.dom || dom) === 'tur' ? { kind: 'rhit', x } : { kind: 'hit', r: x };
  const sqPh = n => Array.from({ length: n }, (_, i) => ({ ph: true, i }));
  function sqMeta(me, i) { // מקום התוצאה (לבועה) — מהמנוע, בלי הטקסט
    const e = me.r && me.r.res[i]; if (!e) return {};
    const d = me.dom === 'glob' ? e.d : me.dom, r = me.dom === 'glob' ? e.r : e, E = SQD[d].E, M = E.map, ord = G.GimSq.rOrd(E.unitsOf(r)[0]), bi = M.ob[ord], ch = M.oc[ord];
    if (d === 'talmud' || d === 'tur') { const k = G.GIM_SQ_DBS[d].bk[bi].k; return d === 'talmud' ? { dom: d, tk: k, j: ch - 1 } : { dom: d, k, s: ch - 1 }; }
    return { dom: d, b: bi, ch };
  }
  function sqPaint(me, idx) {
    if (SQ !== me || !RS || RS.me !== me) return;
    idx.forEach(i => { const k = RS.pos[i]; if (k == null) return; RS.items[k].x = me.hits[i]; dropItems[RS.start + i] = sqItem(me.hits[i], me.dom); });
    resWin(true);
  }
  async function sqLoad(me, lo, hi, pri, only) {
    if (!me.r) return;
    const want = [], v = me.v || 0;
    if (only) only.forEach(i => { if (me.hits[i] && me.hits[i].ph && !me.ld.has(i)) { want.push(i); me.ld.add(i); } });
    else for (let i = Math.max(0, lo); i <= Math.min(hi, me.r.res.length - 1); i++) if (me.hits[i] && me.hits[i].ph && !me.ld.has(i)) { want.push(i); me.ld.add(i); }
    if (!want.length) return;
    let done = false; const by = {}, tx = {}, ok = () => SQ === me && (me.v || 0) === v;
    want.forEach(i => { const d = me.dom === 'glob' ? me.r.res[i].d : me.dom; (by[d] = by[d] || []).push(me.dom === 'glob' ? me.r.res[i].r : me.r.res[i]); });
    const alive = () => ok() && (pri < 2 || !me.want || (want[0] <= me.want[1] + 40 && want[want.length - 1] >= me.want[0] - 40));
    try {
      // שאילתה שנתקעה (Worker שלא ענה) לא משאירה את השורות "בטעינה" לנצח: אחרי 12 שניות נכשלת, ובקשה חדשה תנסה שוב
      let to; const stuck = new Promise((_, rej) => { to = setTimeout(() => rej(new Error('timeout')), 12000); });
      try { await Promise.race([Promise.all(Object.keys(by).map(async d => { const E = SQD[d].E || await sqReady(d, true); tx[d] = await E.texts([].concat(...by[d].map(E.unitsOf)), { pri, alive }); })), stuck]); } finally { clearTimeout(to); }
      if (!ok()) return;
      want.forEach(i => { const e = me.r.res[i], d = me.dom === 'glob' ? e.d : me.dom, x = sqHit(me.dom === 'glob' ? e.r : e, tx[d], d); if (me.dom === 'glob') x.dom = d; me.hits[i] = x; });
      sqPaint(me, want); me.rt = 0; done = true; if (me.onLoad) me.onLoad(want);
    } catch (e) { /* שאילתה שהוחלפה בגלילה */ } finally {
      want.forEach(i => me.ld.delete(i));
      // בקשה שנפלה (הוחלפה בגלילה מהירה) — טוענים שוב את החלון הנוכחי, גם בלי אירוע גלילה נוסף
      if (!done && SQ === me && me.want && (me.rt = (me.rt || 0) + 1) <= 8) setTimeout(() => { if (SQ === me && me.want) sqLoad(me, me.want[0] - 4, me.want[1] + 8, 1); }, 60 * me.rt);
    }
  }
  function sqSearch(raw) {
    const nq = norm(raw);
    if (G.GimSq.letters(raw).length < 2) return { hits: [], total: 0, q: '' };
    const dom = sqDomOf(), sc = sqKey(dom);
    if (!SQ || SQ.q !== raw || SQ.sc !== sc) {
      const me = SQ = { q: raw, sc, dom, hits: [], r: null, busy: true, ld: new Set() };
      const again = () => { if (dropQ === raw && !$r('#rdDrop').hidden) renderDrop(); };
      // קודם הטקסטים של התוצאות הראשונות (מה שנראה בחלון) ומציגים; את השאר עד 50 — מיד אחר כך, ברקע
      sqReady(dom).then(() => SQD[dom].E.search(raw, sqOpt(dom))).then(r => { if (SQ !== me) return; me.r = r; me.hits = sqPh(r.res.length); return sqLoad(me, 0, 11, 1); }).then(() => {
        if (SQ !== me) return; me.busy = false; again(); sqLoad(me, 12, 49, 2);
      }).catch(e => { if (SQ !== me) return; if (G.console) console.warn('sqlite search failed, falling back', e); SQD[dom].fail = true; SQ = null; again(); });
    }
    return { hits: SQ.busy ? [] : SQ.hits, total: SQ.r ? SQ.r.total : 0, q: nq, wait: SQ.busy };
  }

  /* ---------- חיפוש בכל הספרים (תנ״ך, משנה, רמב״ם, גמרא, טור — עם כל המפרשים) ----------
     אותה שאילתה נשלחת במקביל לכל התחומים (כל תחום עם ה-Workers שלו), והתוצאות ממוזגות לפי הדירוג. כל תחום מצטרף ברגע שהוא מוכן —
     התוצאות הראשונות מופיעות מיד, והסכום והסדר מתעדכנים כשהאטיים (גמרא, טור) מסיימים. */
  function sqSearchGlob(raw, pre) {
    const nq = norm(raw);
    if (G.GimSq.letters(raw).length < 2) return { hits: [], total: 0, q: '' };
    if (!SQ || SQ.q !== raw || SQ.sc !== 'glob') {
      const DS = G.GimSq.DOMAINS, names = Object.keys(DS), got = {}, fin = new Set();
      let me = SQ = { q: raw, sc: 'glob', dom: 'glob', hits: [], r: { total: 0, res: [] }, total: 0, busy: true, v: 0, pend: names.length, ld: new Set() };
      const again = () => { if (dropQ === raw && !$r('#rdDrop').hidden) renderDrop(); };
      let fails = 0; const bad = new Set(), err = {}; // תחומים שלא נטענו — חלון התוצאות מציג אותם עם "לנסות שוב"
      // pub: מפרסם גרסה חדשה של התוצאות. final=false — תוצאות ההיקף שנבחר (נשלפות מהמטמון של הרשימה הנפתחת), מוצגות לפני שהחיפוש בכל הספרים מסתיים
      const pub = (d, final) => {
        if (SQ === null || SQ.q !== raw || SQ.sc !== 'glob') return;
        me = SQ;
        if (final) { me.pend--; fin.add(d); }
        if (fails === names.length) { S.glob = false; SQ = null; return again(); } // כשל בכולם — החיפוש הרגיל
        const res = []; names.forEach(n => got[n] && got[n].res.forEach(r => res.push({ d: n, r })));
        res.sort((a, b) => b.r.sc - a.r.sc);
        // כל גרסה היא אובייקט חדש: חלון התוצאות מחזיק אינדקס של הגרסה הקודמת, ושינוי הסדר במקום היה מערבב לו שורות וטעינות
        me = SQ = Object.assign({}, me, { r: { total: res.length, res }, total: res.length, v: me.v + 1, hits: sqPh(res.length), ld: new Set(), onLoad: null, dn: [...fin], bad: [...bad], err });
        const v = me.v, mine = me;
        (res.length ? sqLoad(mine, 0, 11, 1) : Promise.resolve()).then(() => {
          if (SQ !== mine || mine.v !== v) return;
          if (res.length || !mine.pend) { mine.busy = false; again(); if (res.length) sqLoad(mine, 12, 49, 2); } else again();
        }, () => {});
      };
      if (pre && pre.dom && names.includes(pre.dom)) sqReady(pre.dom, true).then(() => SQD[pre.dom].E.search(raw, pre.opt)).then(r => { if (!fin.has(pre.dom)) { got[pre.dom] = r; pub(pre.dom, false); } }, () => {});
      // תחום שנכשל (רשת, Worker שלא עלה) מקבל ניסיון חוזר אחד אחרי שנייה וחצי, ורק אז נרשם כ"לא נטען" עם סיבת הכשל
      const one = (d, k) => sqReady(d, true).then(() => SQD[d].E.search(raw, { srcs: DS[d].srcs.all })).catch(e => {
        if (k || !SQ || SQ.q !== raw) throw e;
        if (SQD[d] && SQD[d].fail) { SQD[d].P = null; SQD[d].fail = false; }
        return new Promise(r => setTimeout(r, 1500)).then(() => one(d, 1));
      });
      names.forEach(d => one(d, 0).then(r => { got[d] = r; }, e => { fails++; bad.add(d); err[d] = String(e && e.message || e || '').slice(0, 160); try { console.warn('[GimSq] ' + d + ':', e); } catch (x) {} }).then(() => pub(d, true)));
    }
    return { hits: SQ.busy ? [] : SQ.hits, total: SQ.total, q: nq, wait: SQ.busy, part: SQ.pend > 0 };
  }
  function renderDropGlob() {
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; busy(false); return; }
    const res = sqSearchGlob(q), btn = (g, l, on) => '<button type="button" data-glob="' + g + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '">' + T(l) + '</button>';
    let html = '<div class="rdDScope" role="group">' + btn(0, 'חיפוש בספר', false) + btn(1, 'בכל הספרים', true) + '<span class="cnt">' + (res.q.length < 2 ? '' : res.wait ? spin() : res.total ? resN(res.total) + (res.part ? ' ' + spin() : '') : T('אין תוצאות')) + '</span></div>';
    const start = 0;
    res.hits.forEach(x => dropItems.push(sqItem(x, 'glob')));
    const DL = { tanakh: 'תנ״ך', mishnah: 'משנה', rambam: 'רמב״ם', talmud: 'גמרא', tur: 'טור' };
    if (res.hits.length) html += resList(res.hits, start, q, {
      sq: true, key: null, gh: () => '', bub: x => T(DL[x.dom]) + ' · ' + (x.dom === 'talmud' ? talName(TX.list[TX.byK[x.tk]]) + ' ' + dafTxt(x.j) : x.dom === 'tur' ? turPartName(turTOf(x.k)) + ' · ' + (x.s ? T('סימן') + ' ' + num(x.s) : T('הקדמה')) : refLabel({ b: x.b, ch: x.ch, v: 0 })),
      row: x => {
        if (x.dom === 'talmud') {
          const tt = TX.list[TX.byK[x.tk]], tag = x.src === 'g' ? '' : x.src === 'r' ? T('רש״י') : T('תוספות');
          return { tag, fc: tag ? S.cmFont : '', ref: talName(tt) + ' ' + x.ref, t: plainT(x.t), html: x.html };
        }
        if (x.dom === 'tur') return { tag: x.x === 't' ? '' : turCmName(x.x) + ' ' + RL(x.x, x.i), fc: x.x === 't' ? '' : 'rashi', ref: x.ref, t: x.pt, html: x.html };
        const cm = x.cm != null, tr = !!x.tr;
        return { tag: cm ? cmName(x.cs) : tr ? trLabel(x.tr) : '', fc: cm ? S.cmFont : tr ? S.trFont : '', ref: x.ref || refLabel(x), t: x.pt, html: x.html };
      }
    });
    d.innerHTML = html; d.hidden = false; busy(res.wait);
    bindRes();
    if (dropItems.length) setAct(lastAct());
  }
  function renderDrop() {
    if (S.glob && sqOn()) return renderDropGlob();
    if (isTur()) return renderDropTur();
    if (isTal()) return renderDropTal();
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q; RS = null;
    if (!q.trim()) { d.hidden = true; busy(false); return; }
    let html = '';
    const ref = parseRef(IX, q, S.b), tref = parseDafRef(TX, q), rref = parseTurRef(RX, q);
    if (rref) dropItems.push({ kind: 'tur', k: rref.k, s: rref.s });
    if (tref && tref.explicit) dropItems.push({ kind: 'tal', k: tref.k, j: tref.j });
    if (ref) dropItems.push({ kind: 'ref', r: ref });
    if (tref && !tref.explicit) dropItems.push({ kind: 'tal', k: tref.k, j: tref.j });
    addSugg(q, 6);
    html += refsHtml();
    const scopes = [['ch', 'בפרק'], ['book', 'בספר'], ['all', isRambam(S.b) ? 'בכל הרמב״ם' : isMishnah(S.b) ? 'בכל המשנה' : 'בכל התנ״ך']];
    // החיפוש צריך את הספרים שבתחום (והמפרשים/התרגומים שלהם, לפי "חיפוש ב"); עד שהם נטענים — "טוען…" במקום מספר התוצאות
    const sBooks = scopeBooks(), sq = sqOn(); PIN = sq ? [] : searchNeed(sBooks); // v3.31.0: בתנ״ך — SQLite, בלי לטעון את הספרים
    const wait = !sq && !ensure(PIN, () => { if (dropQ === q && !$r('#rdDrop').hidden) renderDrop(); });
    const res = sq ? sqSearch(q) : wait ? { hits: [], total: 0, q: norm(q) } : searchSrc(q, sBooks, effScope(sqDomOf()) === 'ch' ? S.ch : 0);
    const srcs = [['txt', isRambam(S.b) ? 'הלכות' : isMishnah(S.b) ? 'משניות' : 'פסוקים'], ['cm', isRambam(S.b) ? 'מפרשים' : isMishnah(S.b) ? 'ברטנורא' : 'רש״י']].concat(isMishnah(S.b) ? [] : [['tr', 'תרגום']], [['all', 'הכל']]);
    html += dropBar(sqDomOf(), (res.q.length < 2 ? '' : wait || res.wait ? spin() : res.total ? resN(res.total) : T('אין תוצאות')));
    const start = dropItems.length;
    res.hits.forEach(x => dropItems.push(sq ? sqItem(x, sqDomOf()) : { kind: 'hit', r: x }));
    if (res.hits.length) {
      const byBook = S.scope === 'all' && !sq; // SQLite: לפי דירוג, בלי קבוצות
      html += resList(res.hits, start, q, {
        sq, key: sq || S.scope === 'ch' ? null : byBook ? x => x.b : x => x.b + ':' + x.ch,
        gh: x => byBook ? bkName(IX.books[x.b].heTitle) : T('פרק') + ' ' + num(x.ch),
        tick: byBook ? x => IX.books[x.b].g : null, tickName: grpName,
        bub: x => refLabel({ b: x.b, ch: x.ch, v: 0 }),
        row: x => {
          const cm = x.cm != null, tr = !!x.tr, t = x.pt != null ? x.pt : cm ? cmText(x) : tr ? noMarks(chText(IX.links[x.b][x.tr], x.ch, x.v)) : noTeamim(chText(x.b, x.ch, x.v));
          return { tag: cm ? cmName(x.cs) : tr ? trLabel(x.tr) : '', fc: cm ? S.cmFont : tr ? S.trFont : '', ref: x.ref || refLabel(x), t, html: x.html };
        }
      });
    }
    d.innerHTML = html; d.hidden = false; busy(sq ? res.wait : wait);
    bindRes();
    if (dropItems.length) setAct(lastAct());
  }
  /* רשימת תוצאות וירטואלית — משותפת לכל הספרים (תנ״ך, משנה, רמב״ם, גמרא, טור). o: key(x) = מפתח קבוצה (null = בלי
     כותרות), gh(x) = שם הקבוצה, tick(x)/tickName = סימון על פס הגלילה בתחילת כל חלק, bub(x) = הכותרת בבועה,
     row(x) = {tag, fc, ref, t} לשורה. */
  /* פסי צבע על פס הגלילה: לכל תוצאה צבע לפי המקור (טקסט, רש״י/מפרשים, תרגום…) ובחיפוש בכל הספרים — לפי התחום; רצף של אותו צבע הוא פס אחד */
  function sqBands(me, a, b) {
    const res = me.r ? me.r.res.slice(a || 0, b == null ? undefined : b) : [], n = res.length, DI = { tanakh: 0, mishnah: 1, rambam: 2, talmud: 3, tur: 4 };
    if (!n) return '';
    const cls = i => me.dom === 'glob' ? DI[res[i].d] : res[i].src, B = Math.min(n, 160); let out = '', prev = -1, from = 0;
    const put = (a, b, c) => { out += '<i class="rdFsBand b' + c + '" style="top:' + (100 * a / n).toFixed(2) + '%;height:' + (100 * (b - a) / n).toFixed(2) + '%"></i>'; };
    for (let b = 0; b < B; b++) {
      const lo = Math.floor(b * n / B), hi = Math.floor((b + 1) * n / B), cnt = {}; let best = 0, bc = 0;
      for (let i = lo; i < hi; i++) { const c = cls(i); cnt[c] = (cnt[c] || 0) + 1; if (cnt[c] > best) { best = cnt[c]; bc = c; } }
      if (bc !== prev) { if (prev >= 0) put(from, lo, prev); prev = bc; from = lo; }
    }
    put(from, n, prev);
    return out;
  }
  // עימוד: 100 תוצאות בדף (RPG = הדף הנוכחי; חוזר לראשון כשהחיפוש או התחום משתנים). כל האינדקסים נשארים מוחלטים (j = מקום התוצאה ברשימה המלאה)
  const PGD = 100; let RPG = 0, RPK = '';
  function resList(hits, start, q, o) {
    const N = hits.length, k0 = q + '|' + dropSig(); if (k0 !== RPK) { RPK = k0; RPG = LP && LP.q === q && LP.sig === dropSig() && LP.i >= start ? Math.floor((LP.i - start) / PGD) : 0; } // חיפוש חדש: דף ראשון; חזרה לאותו חיפוש: הדף של התוצאה האחרונה שנבחרה
    const npg = Math.max(1, Math.ceil(N / PGD)); RPG = Math.max(0, Math.min(RPG, npg - 1));
    const a = N > PGD ? RPG * PGD : 0, b = N > PGD ? Math.min(N, a + PGD) : N;
    const items = [], off = [], ticks = []; let y = 0, prevK = null, prevT = null, gi = -1;
    hits.slice(a, b).forEach((x, jj) => { const j = a + jj;
      if (o.key && o.key(x) !== prevK) {
        const kx = o.key(x); let n = 0; for (let t = j; t < hits.length && o.key(hits[t]) === kx; t++) n++;
        if (o.tick) { const g = o.tick(x); if (g != null && g !== prevT) { ticks.push({ y, g }); prevT = g; } }
        items.push({ gh: true, x, n }); off.push(y); y += GH; prevK = kx; gi = items.length - 1;
      }
      items.push({ i: start + j, x, gi }); off.push(y); y += RH;
    });
    const pos = []; items.forEach((it, k) => { if (!it.gh) pos[it.i - start] = k; });
    const me = o.sq ? SQ : null; if (me) o.meta = i => sqMeta(me, i);
    RS = { items, off, total: y, start, n: hits.length, pos, ticks, q, from: -1, to: -1, o, me, a, b, npg };
    const pager = npg > 1 ? '<div class="rdPg" id="rdPg"><button type="button" data-pg="' + (RPG - 1) + '"' + (RPG ? '' : ' disabled') + '>' + T('הקודם') + '</button><span>' + T('תוצאות') + ' ' + cnt(a + 1) + '–' + cnt(b) + ' · ' + T('דף') + ' ' + cnt(RPG + 1) + ' ' + T('מתוך') + ' ' + cnt(npg) + '</span><button type="button" data-pg="' + (RPG + 1) + '"' + (RPG < npg - 1 ? '' : ' disabled') + '>' + T('הבא') + '</button></div>' : '';
    return '<div class="rdResWrap"><div class="rdRes"><div class="rdResBox" id="rdResBox"><div class="rdResIn" style="height:' + y + 'px"></div></div>' +
      '<div class="rdResSticky" id="rdResSticky" aria-hidden="true"></div>' +
      '<div class="rdFs" id="rdFs" aria-hidden="true">' + (me ? sqBands(me, a, b) : '') + ticks.map(t => '<i class="rdFsTick" style="top:' + (100 * t.y / y).toFixed(2) + '%" title="' + h(o.tickName ? o.tickName(t.g) : '') + '"></i>').join('') +
      '<div class="rdFsThumb" id="rdFsThumb"><div class="rdFsBub" id="rdFsBub"></div></div></div></div>' + pager + '</div>';
  }
  const ghLabel = x => RS.o.gh(x);
  function bindRes() {
    if (!RS) return; const box = $r('#rdResBox'); box.onscroll = () => resWin(); resWin();
    const pg = $r('#rdPg'); if (pg) pg.onclick = e => { const b = e.target.closest('button[data-pg]'); if (b && !b.disabled) { e.preventDefault(); dropPage(+b.dataset.pg); } };
  }
  // מעבר לדף אחר ברשימה הנפתחת; act = מקום (ב-dropItems) להפעיל בו אחרי המעבר
  let noJump = false;
  function dropPage(p, act) { RPG = Math.max(0, p); noJump = true; try { renderDrop(); } finally { noJump = false; } if (act != null) setAct(act); else if (RS) { $r('#rdResBox').scrollTop = 0; dropAct = RS.start + RS.a; setAct(dropAct); } }
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
        if (x.ph) return '<div class="rdDI hit ph" style="top:' + y + 'px" data-i="' + it.i + '" aria-hidden="true"><span class="rf">…</span><span class="sn"><i></i></span></div>';
        const { tag, fc, ref, t, html } = RS.o.row(x);
        return '<button type="button" class="rdDI hit' + (tag ? ' cm' : '') + (it.i === dropAct ? ' act' : '') + '" style="top:' + y + 'px" data-i="' + it.i + '" role="option"><span class="rf">' + (tag ? '<i>' + h(tag) + '</i> ' : '') + h(ref) + '</span><span class="sn' + (fc ? ' ' + (fc === 'rashi' ? 'fR' : 'fN') : '') + '">' + (html != null ? html : hlHtml(tag ? excerpt(t, RS.q) : t, RS.q)) + '</span></button>';
      }).join('');
    }
    // כותרת דבוקה: הקבוצה של הפריט שבראש החלון (מוסתרת כשכותרת אמיתית בדיוק בראש)
    const st = $r('#rdResSticky'), f = RS.items[firstAt(top)];
    const g = f && (f.gh ? f : RS.items[f.gi]);
    st.hidden = !g || (f.gh && RS.off[firstAt(top)] >= top - 1);
    if (g && !st.hidden) st.innerHTML = '<span>' + h(ghLabel(g.x)) + '</span><span class="n">' + resN(g.n) + '</span>';
    fsLay();
    if (RS.me) { RS.me.want = [RS.a + from, RS.a + to - 1]; sqLoad(RS.me, RS.a + from - 4, RS.a + to + 8, 1); }
  }
  // רשת ביטחון: שורות שלד בתוך הרשימה הנפתחת שלא נטענו (בקשה שנפלה או נתקעה) נדרשות שוב כל שנייה וחצי, כל עוד הרשימה פתוחה
  setInterval(() => { if (RS && RS.me && SQ === RS.me && !$r('#rdDrop').hidden && document.querySelector('#rdResBox .rdDI.ph')) resWin(true); }, 1500);
  function fsLay() {
    const box = $r('#rdResBox'), tr = $r('#rdFs'), th = $r('#rdFsThumb'); if (!box || !tr) return;
    const max = box.scrollHeight - box.clientHeight;
    tr.hidden = max <= 4; if (tr.hidden) return;
    const H = tr.clientHeight, t = Math.max(30, H * box.clientHeight / box.scrollHeight);
    th.style.height = t + 'px'; th.style.top = (box.scrollTop / max) * (H - t) + 'px';
    const k = Math.min(RS.items.length - 1, firstAt(box.scrollTop + box.clientHeight * (box.scrollTop / max)));
    const it = RS.items[k], hit = it.gh ? RS.items[k + 1] : it;
    const bx = RS.o.meta ? RS.o.meta(hit.i - RS.start) : hit.x;
    $r('#rdFsBub').innerHTML = '<b>' + h(RS.o.bub(bx)) + '</b><span>' + T('תוצאה') + ' ' + cnt(hit.i - RS.start + 1) + ' ' + T('מתוך') + ' ' + cnt(RS.n) + '</span>';
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
    if (!noJump && RS && RS.npg > 1 && i >= RS.start && i < RS.start + RS.n && (i < RS.start + RS.a || i >= RS.start + RS.b)) return dropPage(Math.floor((i - RS.start) / PGD), i); // חץ/בחירה מחוץ לדף הנוכחי — עוברים דף
    const center = dropAct < 0 && i > 0; // פתיחה מחדש על התוצאה האחרונה: באמצע החלון
    dropAct = (i + n) % n;
    R.querySelectorAll('#rdDrop .rdDI').forEach(b => b.classList.toggle('act', Number(b.dataset.i) === dropAct));
    const it = dropItems[dropAct];
    if (RS && dropAct >= RS.start) {
      const box = $r('#rdResBox'), k = RS.pos[dropAct - RS.start], y = RS.off[k], hdr = RS.o.key ? GH : 0;
      if (center) box.scrollTop = Math.max(0, y - (box.clientHeight - RH) / 2);
      else if (y - hdr < box.scrollTop) box.scrollTop = y - hdr; else if (y + RH > box.scrollTop + box.clientHeight) box.scrollTop = y + RH - box.clientHeight;
      resWin(true);
    } else { const b = R.querySelector('#rdDrop .rdDI[data-i="' + dropAct + '"]'); if (b) b.scrollIntoView({ block: 'nearest' }); if (RS && dropAct === 0) { $r('#rdResBox').scrollTop = 0; } }
  }
  /* חזרה לרשימה: כשפותחים שוב את אותו חיפוש (אותה מילה, אותו תחום ומקורות), הרשימה נפתחת על התוצאה שנבחרה
     אחרונה — באמצע החלון — ולא בראש, כדי שאפשר יהיה להמשיך לתוצאה הבאה (חץ למטה + Enter). */
  let LP = null;
  // מודל הבורר (משותף לרשימה הנפתחת ולשולחן העבודה): רמות היקף ומקורות מסומנים לתחום הנוכחי
  function scopeModel() {
    const dom = sqDomOf(); if (!dom) return null;
    const sq = sqOn(), es = effScope(dom), on = srcSet(dom, S[srcProp(dom)]);
    return { dom, glob: !!S.glob, levels: scopeLevels(dom, sq).map(l => ({ k: l[0], label: T(l[1]), name: l[2], on: !S.glob && l[0] === es })),
      srcs: SRC_DEF[dom].map(x => ({ k: x[0], label: T(x[1]), on: on.has(x[0]) })) };
  }
  function setScope(k) {
    if (k === 'glob') { S.glob = true; save(); return renderDrop(); }
    const dom = sqDomOf(); S.glob = false; S[scopeProp(dom || 'tanakh')] = k; save(); renderDrop();
  }
  function toggleSrc(k) {
    const dom = sqDomOf(); if (!dom) return; const set = srcSet(dom, S[srcProp(dom)]);
    if (set.has(k)) set.delete(k); else set.add(k); // אפשר גם בלי אף מקור מסומן ('none')
    S[srcProp(dom)] = srcStr(dom, set); save(); renderDrop();
  }
  // ברירת מחדל לפי החלון הפעיל: קריאה = כל הספר בלי מפרשים; גימטריה = כל התנ״ך עם מפרשים (חיפוש מכל הספרים נשאר רק לבחירת המשתמש)
  function applyDefault(kind) {
    S.glob = false;
    if (kind === 'gem') { S.scope = 'all'; S.src = 'all'; } else { S.scope = 'book'; S.src = 'txt'; S.tscope = 'tr'; S.tsrc = 'g'; S.rscope = 'all'; S.rsrc = 't'; }
    save(); if ($r('#rdQ') && $r('#rdQ').value.trim()) renderDrop();
  }
  // סרגל הבועות בראש הרשימה הנפתחת: רמות ההיקף (אחת נבחרת) + המקורות (סימון)
  function dropBar(dom, cnt) {
    const m = S.glob ? null : scopeModel(), sq = sqOn();
    return '<div class="rdDScope" role="group">' + (m ? m.levels.map(l => '<button type="button" data-sc="' + l.k + '" class="' + (l.on ? 'on' : '') + '" aria-pressed="' + l.on + '">' + T(l.label) + '</button>').join('') : '') +
      (sq ? '<button type="button" data-glob="1" aria-pressed="false">' + T('בכל הספרים') + '</button>' : '') + '<span class="sep" aria-hidden="true"></span><span class="rdSrc" role="group" aria-label="' + T('חיפוש ב') + '">' +
      (m ? m.srcs.map(x => '<button type="button" data-tg="' + x.k + '" class="' + (x.on ? 'on' : '') + '" aria-pressed="' + x.on + '">' + T(x.label) + '</button>').join('') : '') + '</span><span class="cnt">' + cnt + '</span></div>';
  }
  const dropSig = () => S.glob ? 'glob' : isTur() ? 'r' + srcStr('tur', srcSet('tur', S.rsrc)) + scopeSig('tur') : isTal() ? 't' + srcStr('talmud', srcSet('talmud', S.tsrc)) + scopeSig('talmud') :
    'b' + srcStr(sqDomOf() || 'tanakh', srcSet(sqDomOf() || 'tanakh', S.src)) + scopeSig(sqDomOf() || 'tanakh');
  function lastAct() {
    const q = $r('#rdQ').value, it = LP && dropItems[LP.i];
    if (it && LP.q === q && LP.sig === dropSig() && it.kind === LP.kind) return LP.i;
    return dropItems[0] && dropItems[0].sg && RS && RS.n ? RS.start : 0; // רק הצעות ספרים — Enter לתוצאה הראשונה
  }
  function pickDrop(i) {
    const it = dropItems[i]; if (!it || it.kind === 'ph') return;
    const q = $r('#rdQ').value;
    if (it.kind === 'hit' || it.kind === 'thit' || it.kind === 'rhit') { S.hl = q; SQHL = (it.kind === 'hit' ? it.r : it.x).sq ? sqHl(q) : null; LP = { q, sig: dropSig(), i, kind: it.kind }; if (it.r && it.r.tr && S.tr !== it.r.tr) S.tr = it.r.tr; } else { S.hl = ''; $r('#rdQ').value = ''; }
    $r('#rdQ').blur(); // כדי שהחצים ידפדפו מיד
    updClear(); closeDrop();
    if (it.kind === 'tur') return goTur(it.k, it.s);
    if (it.kind === 'tal') return goTal(it.k, it.j);
    if (it.kind === 'rhit') return goTurHit(it.x);
    if (it.kind === 'thit') { segTab = it.x.src === 't' ? 't' : 'r'; return goTal(it.x.tk || S.tk, it.x.j, it.x.s); }
    goTo(it.r.b, it.r.ch, it.r.v);
  }
  function updClear() { $r('#rdQClr').hidden = !$r('#rdQ').value; }

  /* ---------- בנייה ---------- */
  /* ---------- הסבר בריחוף (title) לכל כפתור במסך הקריאה ----------
     tipOf(b) לפי ה-id או ה-data של הכפתור; כפתור בלי הסבר משלו מקבל את ה-aria-label או את הטקסט שלו.
     MutationObserver (tipsWatch) מעדכן אחרי כל ציור של הסרגל, הדף והחלונות — גם כפתורים שנוצרים מחדש מקבלים הסבר. */
  function viewTip(v) {
    if (v === 'daf') return T(isTur() ? 'צורת הדף: הטור באמצע, וב״ח ובית יוסף מקיפים אותו' : isZ() ? 'דף מול תרגום: עמוד הזוהר בארמית מימין, והתרגום (או הסולם) מולו משמאל' : 'צורת הדף: פריסת דף וילנא — הגמרא באמצע, רש״י ותוספות מסביב');
    if (v === 'study') return T(isTur() ? 'טור ומפרשים: קטעים מהטור, ומתחת לכל אחד הדיבורים שלו' : isZ() ? 'זוהר והסולם: פסקאות הזוהר ברצף, ומתחת להן התרגום וביאור הסולם' : 'גמרא ומפרשים: קטעי הגמרא ברצף; לחיצה על קטע פותחת את פירושיו');
    if (isRambam(S.b)) return T(v === 'book' ? 'ספר: עיצוב מהדורת פרנקל — ההלכות ברצף, והשגות הראב״ד בתוך הטקסט' : 'הלכה הלכה: כל הלכה בנפרד עם כותרת, והמפרשים בתחתית הדף');
    return T(v === 'book' ? 'ספר: הטקסט ברצף כמו בספר מודפס, והתרגום בטור צד' : 'פסוק מול תרגום: כל פסוק בשורה משלו, והתרגום מולו');
  }
  function tipOf(b) {
    const d = b.dataset, txt = b.textContent.replace(/\s+/g, ' ').trim(), lbl = b.getAttribute('aria-label') || '';
    if (b.closest('#rdViewSeg')) return viewTip(isTal() || isTur() ? (d.view === 'book' ? 'daf' : 'study') : d.view);
    if (b.id === 'rdSetBtn') return T('הגדרות תצוגה') + ': ' + T('סוג תצוגה, מפרשים, כתב וגודל אותיות');
    if (b.id === 'rdPrev' || b.id === 'rdPrev2') return lbl + ' (→)';
    if (b.id === 'rdNext' || b.id === 'rdNext2') return lbl + ' (←)';
    if (b.id === 'rdQClr') return T('ניקוי חיפוש') + ' (Esc)';
    if (d.close != null) return T('סגירה') + ' (Esc)';
    if (d.set) {
      const k = d.set, v = d.val, on = b.getAttribute('aria-pressed') === 'true';
      if (k === 'view') return viewTip(v);
      if (k === 'tview' || k === 'rview') return viewTip(v);
      if (k === 'tr') return v === 'none' ? T('הסתרת התרגום') : T('הצגת') + ' ' + T(v === 'onkelos' ? 'תרגום אונקלוס' : 'תרגום יונתן') + ' ' + T('בצד שמאל') + ((IX.links[S.b] || {})[v] != null ? '' : ' (' + T('אין בספר זה') + ')');
      if (k === 'trFont') return T(v === 'rashi' ? 'התרגום בכתב רש״י' : 'התרגום בכתב מרובע רגיל');
      if (k === 'cmFont') return T(v === 'rashi' ? 'הפירוש בכתב רש״י' : 'הפירוש בכתב מרובע רגיל') + (isTal() ? ' (' + T('בתצוגת גמרא ומפרשים') + ')' : '');
      if (k === 'size') return T('גודל אותיות') + ': ' + T(['קטן', 'רגיל', 'גדול', 'גדול מאוד'][Number(v) + 1]);
      if (k === 'ramNik') return T(v === 'true' ? 'טקסט הרמב״ם עם ניקוד' : 'טקסט הרמב״ם בלי ניקוד, כמו במהדורת פרנקל');
      if (k === 'cm' || k === 'rcm') return T(on ? 'הסתרת' : 'הצגת') + ' ' + (k === 'cm' ? cmName(Number(v)) : turCmName(v));
    }
    if (d.pset) return T({ spread: 'הדפסת שני העמודים הפתוחים בלבד', chapter: 'הדפסת הפרק כולו', color: 'הדפסה בצבע, עם רקע נייר', bw: 'הדפסה בשחור-לבן על רקע לבן' }[d.val] || txt);
    if (d.print != null) return T('פתיחת חלון ההדפסה (שם אפשר גם לשמור כ-PDF)');
    if (d.jcat != null) return T('רשימת הספרים') + ': ' + txt;
    if (d.jb != null || d.jtk != null || d.jrk != null) return T('בחירת') + ' ' + txt;
    if (d.jch != null) return T('פרק') + ' ' + txt + ' · ' + T('בחירת') + ' ' + T(uName(J.b));
    if (d.jv != null) return T('מעבר אל') + ' ' + T(uName(J.b)) + ' ' + txt;
    if (d.jd != null) return T('דף') + ' ' + txt;
    if (d.jside != null) return T('מעבר אל') + ' ' + txt;
    if (d.jrs != null) return T('מעבר אל') + ' ' + (Number(d.jrs) ? T('סימן') + ' ' : '') + txt;
    if (d.scope || d.src || d.tsrc || d.rscope || d.rsrc) return T('חיפוש ב') + ': ' + txt;
    if (d.segtab || d.turtab) return T('הצגת') + ' ' + txt;
    if (b.classList.contains('rdDI')) return txt;
    return lbl || txt;
  }
  const tips = () => { if (built) [R, $r('#rdTop')].forEach(root => root && root.querySelectorAll('button').forEach(b => { const t = tipOf(b); if (t && b.title !== t) b.title = t; })); };
  let tipsMO = null, tipsQ = false;
  function tipsWatch() {
    if (tipsMO) tipsMO.disconnect(); if (!G.MutationObserver) return;
    tipsMO = new MutationObserver(() => { if (!tipsQ) { tipsQ = true; Promise.resolve().then(() => { tipsQ = false; tips(); }); } });
    [R, $r('#rdTop')].forEach(root => tipsMO.observe(root, { childList: true, subtree: true }));
  }

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
        '<button type="button" class="rdIco sm" id="rdQClr" aria-label="' + T('ניקוי חיפוש') + '" hidden>' + ICON.x + '</button><kbd>Ctrl ⇧ K</kbd><div class="rdDrop" id="rdDrop" role="listbox" hidden></div></div>' +
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
    built = true; tipsWatch(); refLinksInit();
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
    document.querySelectorAll('#rdViewSeg button').forEach(x => { x.onclick = () => { if (x.classList.contains('on')) return; fxSetting('view'); if (isTur()) return turKeep(() => { S.rview = x.dataset.view === 'book' ? 'daf' : 'study'; }); if (isTal()) { S.tview = x.dataset.view === 'book' ? 'daf' : 'study'; S.tp = 0; } else if (isRambam(S.b)) S.ramView = x.dataset.view; else S.view = x.dataset.view; render(); }; });
    $r('#rdSet').onclick = e => {
      if (e.target.closest('[data-close]')) return closePops();
      const t = e.target.closest('[data-set]'); if (!t) return;
      const k = t.dataset.set;
      if (k !== 'cm' && k !== 'rcm' && k !== 'zoff' && t.dataset.val === String(k === 'view' ? vw(S.b) : S[k])) return; // כבר בחור — בלי ציור ובלי אפקט
      fxSetting(k);
      if (isTur()) return turKeep(() => {
        if (k === 'rcm') { const x = t.dataset.val; S.rOff = S.rOff.includes(x) ? S.rOff.filter(v => v !== x) : S.rOff.concat(x); if (S.rsel && S.rOff.includes(S.rsel.x)) closeSeg(); }
        else S[k] = k === 'size' ? Number(t.dataset.val) : t.dataset.val;
        renderSet();
      });
      if (k === 'zoff') { const x = t.dataset.val; S.zoff = S.zoff.includes(x) ? S.zoff.filter(v => v !== x) : S.zoff.concat(x); S.tp = 0; renderSet(); return render(); }
      if (k === 'zside' || k === 'zlay' || k === 'zsul') S.tp = 0;
      if (k === 'ramNik') S.ramNik = t.dataset.val === 'true';
      else if (k === 'view' && isRambam(S.b)) S.ramView = t.dataset.val;
      else if (k === 'cm') { const c = Number(t.dataset.val); S.cmOff = S.cmOff.includes(c) ? S.cmOff.filter(x => x !== c) : S.cmOff.concat(c); }
      else S[k] = k === 'size' ? Number(t.dataset.val) : t.dataset.val;
      renderSet(); render();
    };
    $r('#rdJump').onclick = e => {
      if (e.target.closest('[data-close]')) return closePops();
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.jcat != null) { J.cat = Number(t.dataset.jcat); if (J.cat === 20) { J.rk = S.rk || RX.list[0].k; J.rs = isTur() ? S.rs : 1; } else if (J.cat === 2 || J.cat === 30) { const same = isTal() && !!talT().z === (J.cat === 30); J.tk = same ? S.tk : jDef(J.cat === 30); J.tj = same ? S.tj : (TX.list[TX.byK[J.tk]].j0 || 0); } else { J.b = IX.base.find(i => IX.books[i].cat === J.cat); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; } }
      else if (t.dataset.jrk != null) { J.rk = t.dataset.jrk; J.rs = 1; }
      else if (t.dataset.jrs != null) { J.rs = Number(t.dataset.jrs); }
      else if (t.dataset.jtk != null) { J.tk = t.dataset.jtk; J.tj = TX.list[TX.byK[J.tk]].j0 || 0; }
      else if (t.dataset.jd != null) { J.tj = Number(t.dataset.jd); }
      else if (t.dataset.jside != null) { J.tj = (J.tj & ~1) + Number(t.dataset.jside); }
      else if (t.dataset.jb != null) { J.b = Number(t.dataset.jb); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; }
      else if (t.dataset.jch != null) { J.ch = Number(t.dataset.jch); J.v = 0; }
      else if (t.dataset.jv != null) { J.v = Number(t.dataset.jv); }
      else if (t.dataset.jgo != null) { closePops(); return J.cat === 20 ? goTur(J.rk, J.rs) : J.cat === 2 || J.cat === 30 ? goTal(J.tk, J.tj) : goTo(J.b, J.ch, J.v); }
      const sc = $r('#rdJump .rdJBooks'), top = sc ? sc.scrollTop : 0, fk = Object.keys(t.dataset).find(k => /^j/.test(k));
      renderJump(); const nsc = $r('#rdJump .rdJBooks'); if (nsc) nsc.scrollTop = top;
      // הפוקוס נשאר על הכפתור שנבחר (הוא נבנה מחדש), כדי שאפשר יהיה להמשיך במקלדת
      const nf = fk && $r('#rdJump [data-' + fk.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + '="' + t.dataset[fk] + '"]'); if (nf) nf.focus({ preventScroll: true });
    };
    // בחירת פרק / פסוק / דף / עמוד / סימן רק מסמנת; הספר נפתח רק בכפתורים שלמטה. Enter על משבצת בוחר בה ופותח (כמו לחיצה על "מעבר ל…")
    $r('#rdJump').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target.closest && e.target.closest('button'), j = $r('#rdJump');
      if (t && (t.dataset.close != null || t.dataset.jgo != null || t.closest('.dkJ,.dkJMarks,.rdJTabs') || t.dataset.jb != null || t.dataset.jtk != null || t.dataset.jrk != null)) return; // כפתורים רגילים: Enter לוחץ עליהם כרגיל
      e.preventDefault(); e.stopPropagation();
      if (t && t.classList.contains('rdCell') && !t.classList.contains('on')) t.click();
      const go = j.querySelector('[data-jgo]'); if (go) go.click();
    });
    const q = $r('#rdQ');
    q.addEventListener('focus', () => { const d = sqDomOf(); if (d && sqOn()) sqReady(d).catch(() => {}); if (sqShared() && sqOn()) ['tanakh', 'mishnah', 'rambam', 'talmud', 'tur'].forEach((n, i) => setTimeout(() => sqReady(n, true).catch(() => {}), 150 * (i + 1))); }); // בשולחן העבודה: מחממים את כל התחומים (חיפוש בכל הספרים), בהדרגה // מתחילים לטעון את המסד כשנכנסים לתיבת החיפוש, לפני ההקלדה
    q.addEventListener('input', () => { updClear(); clearTimeout(qTimer); qTimer = setTimeout(renderDrop, 140); busy(q.value.trim()); if (!q.value && S.hl) { S.hl = ''; render(); } });
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
      const gl = e.target.closest('[data-glob]'); if (gl) { S.glob = gl.dataset.glob === '1'; return renderDrop(); }
      const nsc = e.target.closest('[data-sc]'); if (nsc) return setScope(nsc.dataset.sc);
      const ntg = e.target.closest('[data-tg]'); if (ntg) return toggleSrc(ntg.dataset.tg);
      const sc = e.target.closest('[data-scope]'); if (sc) { S.scope = sc.dataset.scope; save(); return renderDrop(); }
      const sr = e.target.closest('[data-src]'); if (sr) { S.src = sr.dataset.src; save(); return renderDrop(); }
      const ts = e.target.closest('[data-tsrc]'); if (ts) { S.tsrc = ts.dataset.tsrc; save(); return renderDrop(); }
      const tsc = e.target.closest('[data-tscope]'); if (tsc) { S.tscope = tsc.dataset.tscope; save(); return renderDrop(); }
      const rc = e.target.closest('[data-rscope]'); if (rc) { S.rscope = rc.dataset.rscope; save(); return renderDrop(); }
      const rs = e.target.closest('[data-rsrc]'); if (rs) { S.rsrc = rs.dataset.rsrc; save(); return renderDrop(); }
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

  function rebuild() { if (!built) return; const qv = $r('#rdQ') ? $r('#rdQ').value : ''; built = false; PG.clear(); PC.clear(); CMC.clear(); WC.clear(); DC.clear(); TPC.clear(); TGC.clear(); build(); $r('#rdQ').value = qv; updClear(); render(); }

  /* ---------- מעבר בין מצבים (גימטריה / קריאה) ---------- */
  let curMode = null; // המסך האחרון שדווח ל-GA — לחיצה על המסך שכבר פתוח לא נספרת שוב
  function setMode(m, user, via) {
    if (m !== 'read') m = 'gem';
    // בתוך חלון של שולחן העבודה (desktop.js): חלון הגימטריה לא עובר למסך הקריאה — המקום נפתח בחלון קריאה;
    // וחלון קריאה לא עובר לגימטריה — מביאים את חלון הגימטריה לפנים
    if (G.GT_EMBED && m !== G.GT_EMBED && G.parent !== G) {
      if (m === 'read') { ensureIndex(); G.parent.postMessage({ gtDesk: 'open', hash: hashOfRef(IX, curRef()) }, '*'); }
      else G.parent.postMessage({ gtDesk: 'gem' }, '*');
      return;
    }
    if (m !== curMode && APP.trackEvent) APP.trackEvent('app_screen', { screen: m === 'read' ? 'reader' : 'gematria', via: via || (user ? 'switch' : 'load') });
    curMode = m;
    document.body.dataset.mode = m;
    document.querySelectorAll('#modeSw button').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    try { localStorage.setItem('gimatrivonMode', m); } catch (e) {}
    if (m === 'read') {
      if (!built) build();
      render(); syncHash();
      if (user && APP.trackEvent) APP.trackEvent('reader_open');
    } else if (built) { closePops(); closeDrop(); }
    if (m === 'gem' && (user || /^#read/i.test(location.hash))) setHash('#gim');
  }
  // #read/<מקום> → המקום נקבע ב-S לפני הציור (ספר / מסכת ודף / טור וסימן); מחזיר אם הכתובת היא של מסך הקריאה
  function hashTarget() {
    const m = location.hash.match(/^#read(?:[\/#]+(.*))?$/i); if (!m) return false;
    ensureIndex();
    const x = m[1] ? parseHashRef(IX, TX, RX, m[1]) : null;
    if (x) {
      closeSeg(); S.lock = null;
      // דיבור בטור: נפתח בחלון אחרי הציור (S.rgo, כמו תוצאת חיפוש); קטע בגמרא: goTal אחרי הציור (linkSeg)
      if (x.kind === 'tur') { S.tk = ''; S.rk = x.k; S.rs = x.s; S.rp = 0; S.rgo = x.x ? { k: x.k, s: x.s, x: x.x, i: x.i } : null; }
      else if (x.kind === 'tal') { S.rk = ''; S.tk = x.k; S.tj = x.j; S.tp = 0; linkSeg = x.s >= 0 ? x : null; }
      else { S.tk = ''; S.rk = ''; S.b = x.b; S.ch = x.ch; S.anchor = x.v || versesOf(IX, x.b, x.ch)[0] || 1; flashV = x.v || 0; flashKeep = !!x.v; }
    }
    return true;
  }
  let linkSeg = null;
  const openLinkSeg = () => { const x = linkSeg; linkSeg = null; if (x && isTal() && S.tk === x.k) goTal(x.k, x.j, x.s); };
  /* מעבר מתוצאה במסך הגימטריה (app.js) אל המקום שלה במסך הקריאה: ספר b בקורפוס (גם מפרש או תרגום), פרק ch, יחידה v */
  const canOpen = b => { ensureIndex(); return IX.owner[b] != null; };
  function openUnit(b, ch, v) {
    ensureIndex();
    const x = unitRef(IX, b, ch, v); if (!x) return false;
    S.lock = null;
    if (document.body.dataset.mode !== 'read') { S.tk = ''; S.rk = ''; closeSeg(); S.b = x.b; S.ch = x.ch; S.anchor = x.v || versesOf(IX, x.b, x.ch)[0] || 1; flashV = x.v; setMode('read', true, 'result'); }
    else goTo(x.b, x.ch, x.v);
    save();
    return true;
  }
  /* ---------- סיור מודרך של מסך הקריאה (v3.31.0) ----------
     נפרד מהסיור של מסך הגימטריה (app.js: startTour), עם אותן הגדרות driver.js ואותו עיצוב (APP.tourBase, .gtTourPopover).
     מופעל מ"סיור מודרך" בתפריט ⋮ כשמסך הקריאה פתוח. לא משנה את המקום ולא את ההגדרות: שני צעדים פותחים לרגע את חלון
     המעבר ואת חלון "תצוגה" (היעד הוא פונקציה, ש-driver.js קורא לה כשהוא מגיע לצעד), והם נסגרים במעבר לצעד הבא ובסוף.
     צעד שהיעד שלו מוסתר במסך הזה (למשל סוג התצוגה במשנה, או החצים לפרק בחלון צר) לא נכנס לסיור. */
  function tour() {
    if (!G.driverjs || !APP.tourBase || !built) return;
    const en = isEn(), tal = isTal(), tur = isTur();
    closePops(); closeDrop();
    const shown = sel => { const e = typeof sel === 'string' ? $r(sel) : sel; if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const pop = id => () => { if (openPop !== id) openPopover(id); return $r(id === 'jump' ? '#rdJump' : '#rdSet'); };
    const st = (element, he, heD, enT, enD, side, align, extra) => Object.assign({ element, popover: { title: en ? enT : he, description: en ? enD : heD, side: side || 'bottom', align: align || 'center' } }, extra || {});
    const bookTip = tal && talT().z
      ? ['לחיצה על פסקה בזוהר (או על תרגום) פותחת חלון עם הפסקה, התרגום וביאור הסולם שלה. העמודים לפי דפוס וילנא.', 'Clicking a paragraph of the Zohar (or a translation) opens a window with the paragraph, its translation and the Sulam commentary. Pages follow the Vilna edition.']
      : tal
      ? ['לחיצה על קטע בגמרא (או על פירוש) פותחת חלון עם הקטע ועם רש״י ותוספות עליו.', 'Clicking a passage of Gemara (or a commentary) opens a window with the passage and its Rashi and Tosafot.']
      : tur
        ? ['לחיצה על סימן בטור, (א) או [א], פותחת את הדיבור בבית יוסף או בב״ח.', 'Clicking a marker in the Tur, (א) or [א], opens that comment in the Beit Yosef or the Bach.']
        : ['המפרשים והתרגום מוצגים לצד הטקסט, לפי ההגדרות בחלון "תצוגה".', 'The commentaries and the translation appear beside the text, according to the "Display" settings.'];
    const steps = [
      st(null, 'מסך הקריאה', 'כאן קוראים את המקורות עצמם, כמו בספר: תנ״ך עם תרגומים ורש״י, משנה, רמב״ם, ש״ס, זוהר וטור, עם המפרשים. סיור קצר, אפשר לדלג או לצאת בכל רגע.',
        'The reading screen', 'Here you read the sources themselves, like a book: Tanakh with translations and Rashi, Mishnah, Rambam, Talmud, Zohar and Tur, with their commentaries. A short tour; skip or exit any time.'),
      st('#modeSw', 'גימטריה / קריאה', 'המתג הזה עובר בין מסך הגימטריה למסך הקריאה. כשחוזרים לכאן, הספר נפתח במקום שבו הפסקתם.',
        'Gematria / Reading', 'This switch moves between the gematria screen and the reading screen. When you come back here, the book opens where you stopped.'),
      st('#rdWhere', 'המקום בספר', 'הספר והפרק שפתוחים עכשיו. החצים משני הצדדים עוברים לפרק הקודם ולפרק הבא.',
        'Where you are', 'The book and chapter open now. The arrows on either side go to the previous and next chapter.'),
      st(pop('jump'), 'מעבר לפרק ופסוק', 'לחיצה על המקום (או Ctrl G) פותחת את החלון הזה: בוחרים אוסף, ספר, פרק ופסוק, ועוברים ישר לשם. פתחנו אותו בשבילכם, והוא ייסגר בצעד הבא.',
        'Go to chapter and verse', 'Clicking the location (or Ctrl G) opens this window: choose a collection, a book, a chapter and a verse, and go straight there. We opened it for you; it closes at the next step.', 'bottom', 'center', { onDeselected: () => closePops() }),
      st('#rdSearch', 'חיפוש וקפיצה', 'מקלידים מילים כדי לחפש בספר הפתוח (או בכל האוסף), או מקום כדי לקפוץ אליו: "שמות יב ב", "ב״מ נט:", "או״ח ס", גם בראשי תיבות. הצעות מופיעות תוך כדי הקלדה. קיצור: Ctrl+Shift+K.',
        'Search and jump', 'Type words to search the open book (or the whole collection), or a place to jump to it: "Exodus 12 2", "BM 59b", "OC 60", abbreviations too. Suggestions appear as you type. Shortcut: Ctrl+Shift+K.'),
      st('#rdViewSeg', 'סוג התצוגה', 'מחליף את צורת הדף, לפי הספר: למשל "ספר" או "פסוק מול תרגום" בתנ״ך, "צורת הדף" או "גמרא ומפרשים" בש״ס.',
        'View type', 'Switches the page layout, depending on the book: for example "Book" or "Verse and translation" in Tanakh, "Daf" or "Gemara and commentaries" in the Talmud.'),
      st(pop('set'), 'הגדרות תצוגה (אָ)', 'הכפתור אָ פותח את החלון הזה: גודל אותיות, אילו מפרשים ותרגום מוצגים, כתב הפירוש, ניקוד ברמב״ם ועוד. ההגדרות נשמרות לפעם הבאה. פתחנו אותו בשבילכם, והוא ייסגר בצעד הבא.',
        'Display settings (אָ)', 'The אָ button opens this window: letter size, which commentaries and translation are shown, the commentary font, vowels in the Rambam and more. Settings are saved for next time. We opened it for you; it closes at the next step.', 'bottom', 'center', { onDeselected: () => closePops() }),
      st('#rdPrintBtn', 'הדפסה / PDF', 'בוחרים מה להדפיס, ברקע נייר וצבעים או ברקע לבן לחיסכון בדיו, ומדפיסים או שומרים כ-PDF. קיצור: Ctrl P.',
        'Print / PDF', 'Choose what to print, with a paper background and colours or a white background to save ink, then print or save as PDF. Shortcut: Ctrl P.'),
      st('#rdBook', 'הדף', bookTip[0] + ' דפדוף: החצים בצדי הדף, מקשי החצים במקלדת, או החלקה בטלפון.',
        'The page', bookTip[1] + ' Turning pages: the arrows beside the page, the arrow keys, or a swipe on a phone.', 'top', 'center'),
      st('.rdFoot', 'מיקום בפרק', 'כאן רואים באיזה עמוד אתם מתוך כמה בפרק, ופס התקדמות. הכפתורים בצדדים מדפדפים גם הם.',
        'Position in the chapter', 'Shows which page you are on out of how many in the chapter, with a progress bar. The buttons at the sides turn pages too.', 'top', 'center'),
      st('.themeSw', 'מראה', 'מעבר בין מראה בהיר ("גוויל") למראה כהה ("לילה").', 'Appearance', 'Switches between the light "parchment" look and the dark "night" look.', 'bottom', 'end'),
      st('#mKebab', 'זהו, אפשר לקרוא!', 'בתפריט הזה: שיטות הגימטריה, אודות, צור קשר, והסיור הזה שוב. למסך הגימטריה יש סיור משלו, ומכל תוצאה שם כפתור הספר פותח אותה כאן, במקום המדויק.',
        "That's it, happy reading!", 'This menu has the gematria methods, About, Contact, and this tour again. The gematria screen has its own tour, and from any result there the book button opens it here, at the exact place.', 'bottom', 'end'),
    ].filter(x => !x.element || typeof x.element === 'function' || shown(x.element));
    const d = G.driverjs.driver(Object.assign(APP.tourBase(), { steps, onDestroyed: () => closePops() }));
    d.drive();
    return d;
  }
  /* ---------- חלון "תוצאות חיפוש" של שולחן העבודה (results.js): חיפוש בכל הספרים עם סינון לפי ספר / מקור ----------
     אותו מנוע ואותן תוצאות כמו הרשימה הנפתחת של החיפוש; מכאן רק ממשק קטן: הרצת החיפוש, אינדקס (תחום, ספר, מקור, מקום)
     לכל התוצאות בלי לטעון טקסט, טעינת טקסט לשורות שנראות, ושורה / כתובת של תוצאה שנטענה. */
  const RES_DOMS = ['tanakh', 'mishnah', 'rambam', 'talmud', 'tur'], RES_DL = { tanakh: 'תנ״ך', mishnah: 'משנה', rambam: 'רמב״ם', talmud: 'גמרא', tur: 'טור ושו״ע' };
  const RES_SRC = { tanakh: ['פסוקים', 'רש״י', 'אונקלוס', 'יונתן'], mishnah: ['משנה', 'ברטנורא'], rambam: ['רמב״ם', 'כסף משנה', 'השגות', 'משנה למלך'], talmud: ['גמרא', 'רש״י', 'תוספות'], tur: ['טור', 'בית יוסף', 'ב״ח'] };
  function resRow(x) { // כמו row ברשימה הנפתחת של "בכל הספרים"
    if (x.dom === 'talmud') { const tt = TX.list[TX.byK[x.tk]], tag = x.src === 'g' ? '' : x.src === 'r' ? T('רש״י') : T('תוספות'); return { tag, ref: talName(tt) + ' ' + x.ref, html: x.html }; }
    if (x.dom === 'tur') return { tag: x.x === 't' ? '' : turCmName(x.x) + ' ' + RL(x.x, x.i), ref: x.ref, html: x.html };
    const cm = x.cm != null, tr = !!x.tr;
    return { tag: cm ? cmName(x.cs) : tr ? trLabel(x.tr) : '', ref: x.ref || refLabel(x), html: x.html };
  }
  G.GimResults = {
    DOMS: RES_DOMS, DL: RES_DL, SRC: RES_SRC,
    ready() { return !!(IX && G.GimSq); },
    // חלון תוצאות ממתין: משחררים את ה-Workers (זיכרון); הם נפתחים שוב לבד כשצריך לטעון טקסט (sqLoad)
    sleep() { Object.keys(SQD).forEach(d => { if (SQD[d].P && SQD[d].stop) SQD[d].stop(); }); },
    // מריץ חיפוש בכל הספרים; cb(me) כשכל התחומים סיימו (או null בכשל)
    start(raw, cb, onProg, pre) {
      ensureIndex(); SQ = null; Object.keys(SQD).forEach(d => { if (SQD[d].fail) { SQD[d].P = null; SQD[d].fail = false; } }); // ניסיון חדש לתחום שנכשל
      const r0 = sqSearchGlob(raw, pre);
      if (!r0.q) return cb(null);
      // cb(me, partial): כל תחום שמסיים מעדכן את התוצאות — מציגים אותן מיד, ובסיום כל התחומים קוראים שוב עם partial=false
      let seen = -1, dn = -1;
      const tick = () => {
        if (!SQ || SQ.q !== raw) { clearInterval(t); return cb(null); }
        if (SQ.pend === 0 && !SQ.busy) { clearInterval(t); return cb(SQ, false); }
        if (onProg && SQ.dn && SQ.dn.length !== dn) { dn = SQ.dn.length; onProg(SQ.dn, SQ.pend); }
        if (SQ.v !== seen && SQ.r.res.length) { seen = SQ.v; cb(SQ, true); }
      }, t = setInterval(tick, 25);
    },
    // אינדקס לכל התוצאות (עד cap), בחתיכות כדי לא לתקוע את הממשק: dom (אינדקס ב-DOMS), bk (ספר), src, ord (מקום)
    index(me, cap, prog, cb) {
      const res = me.r.res, n = Math.min(res.length, cap), dom = new Uint8Array(n), bk = new Int16Array(n), src = new Uint8Array(n), ord = new Int32Array(n);
      let i = 0; const step = () => {
        for (const end = Math.min(n, i + 15000); i < end; i++) {
          const e = res[i], E = SQD[e.d].E, o = G.GimSq.rOrd(E.unitsOf(e.r)[0]);
          dom[i] = RES_DOMS.indexOf(e.d); bk[i] = E.map.ob[o]; src[i] = e.r.src; ord[i] = o;
        }
        if (prog) prog(i, n);
        if (i < n) setTimeout(step, 0); else cb({ n, total: res.length, dom, bk, src, ord });
      };
      step();
    },
    // שם ספר / קבוצה (תורה, סדר זרעים…) של תוצאה
    book(d, bi) {
      ensureIndex();
      if (d === 'talmud') { const k = G.GIM_SQ_DBS.talmud.bk[bi].k, tt = TX.list[TX.byK[k]]; return { name: talName(tt), group: tt.g || '' }; }
      if (d === 'tur') { const k = G.GIM_SQ_DBS.tur.bk[bi].k; return { name: turPartName(turTOf(k)), group: '' }; }
      const b = IX.books[bi]; return { name: bkName(b.heTitle), group: b.g || '' };
    },
    load(me, idxs, pri) { return sqLoad(me, 0, 0, pri || 1, idxs); },
    row: resRow,
    hashOf(x) {
      ensureIndex();
      if (x.dom === 'talmud') return hashOfRef(IX, { kind: 'tal', k: x.tk, j: x.j, s: x.s });
      if (x.dom === 'tur') return hashOfRef(IX, { kind: 'tur', k: x.k, s: x.s, x: x.x, i: x.i });
      return hashOfRef(IX, { kind: 'ref', b: x.b, ch: x.ch, v: x.v });
    }
  };
  // הדגשת מילות החיפוש במקום שנפתח (שולחן העבודה: התוצאה נבחרה במארח החיפוש ונפתחת בחלון אחר)
  function highlight(q) { if (!q || document.body.dataset.mode !== 'read') return; S.hl = q; SQHL = null; render(); }
  // ההיקף שנבחר ברשימה הנפתחת של החיפוש (לשולחן העבודה: חלון התוצאות נפתח באותו היקף, עם אפשרות להרחיב לכל הספרים)
  // sel — מפתחות סינון של חלון התוצאות: d:<תחום> או b:<תחום>:<ספר>; null = בכל הספרים
  function dropScope() {
    try {
      if (S.glob || !sqOn()) return null;
      const dom = sqDomOf(); if (!dom) return null;
      const di = RES_DOMS.indexOf(dom), es = effScope(dom), set = srcSet(dom, S[srcProp(dom)]), SR = G.GimSq.DOMAINS[dom].srcs, srcOff = [];
      srcKeys(dom).forEach(k => { if (!set.has(k)) (SR[k] || []).forEach(i => srcOff.push(di + ':' + i)); });
      const out = (sel, name) => ({ sel, name, srcOff, pre: { dom, opt: sqOpt(dom) } }); // pre: חיפוש ההיקף עצמו, לתצוגה מיידית בחלון התוצאות
      if (dom === 'tur') {
        if (es === 'every') return out(['d:' + di], RES_DL.tur);
        const bi = G.GIM_SQ_DBS.tur.bk.findIndex(x => x.k === S.rk); return bi < 0 ? null : out(['b:' + di + ':' + bi], turPartName(turTOf(S.rk)));
      }
      if (dom === 'talmud') {
        const bk = G.GIM_SQ_DBS.talmud.bk;
        if (es === 'all') return out(['d:' + di], RES_DL.talmud);
        if (es === 'grp') return out(talGrpIdx(bk, S.tk).map(i => 'b:' + di + ':' + i), talG(S.tk));
        const bi = bk.findIndex(x => x.k === S.tk); return bi < 0 ? null : out(['b:' + di + ':' + bi], talName(TX.list[TX.byK[S.tk]]));
      }
      if (es === 'all') return out(['d:' + di], isRambam(S.b) ? 'כל הרמב״ם' : isMishnah(S.b) ? 'כל המשנה' : 'כל התנ״ך');
      if (es === 'grp') return out(grpBooks(S.b).map(i => 'b:' + di + ':' + i), IX.books[S.b].g);
      if (es === 'ch' || es === 'par') {
        const o = sqOpt(dom), r = out(['b:' + di + ':' + S.b], es === 'par' ? 'פרשת ' + parashaOf(S.b, S.ch).name : bkName(IX.books[S.b].heTitle) + ' ' + T('פרק') + ' ' + num(S.ch)); r.ord = [o.lo, o.hi]; return r;
      }
      return out(['b:' + di + ':' + S.b], bkName(IX.books[S.b].heTitle));
    } catch (e) { return null; }
  }
  // שם מילולי של מקום מכתובת (#read/TUR/OC/34 → "אורח חיים · סימן לד"), באותו נוסח כמו בורר הספר בסרגל — לסימניות בשולחן
  function placeLabel(h) {
    const m = String(h || '').match(/^#read(?:[\/#]+(.*))?$/i); if (!m || !m[1]) return '';
    try {
      ensureIndex(); const x = parseHashRef(IX, TX, RX, m[1]); if (!x) return '';
      if (x.kind === 'tur') { const t = RX.list.find(r => r.k === x.k); return t ? turPartName(t) + ' · ' + (x.s ? T('סימן') + ' ' + num(x.s) : T('הקדמה')) : ''; }
      if (x.kind === 'tal') { const t = TX.list.find(r => r.k === x.k); return t ? (t.z ? talTitle(t) + ' · ' + dafTxt(x.j, t.k) : talName(t) + ' · ' + T('דף') + ' ' + dafTxt(x.j)) : ''; }
      return bkName(IX.books[x.b].heTitle) + ' · ' + T('פרק') + ' ' + num(x.ch) + (x.v ? ', ' + num(x.v) : '');
    } catch (e) { return ''; }
  }
  G.GimReader = { canOpen, openUnit, tour, highlight, dropScope, scopeModel, setScope, toggleSrc, applyDefault, placeLabel };
  function fromHash() {
    if (/^#gim$/i.test(location.hash)) { if (document.body.dataset.mode === 'read') setMode('gem', false, 'link'); return; }
    if (!hashTarget()) return;
    if (document.body.dataset.mode === 'read') { render(); syncHash(); } else setMode('read', false, 'link');
    openLinkSeg();
  }
  function labelModeSw() {
    // בטלפון אין מקום לתווית המלאה — .ls (קצרה) מוצגת במקום .lf
    document.querySelectorAll('#modeSw button').forEach(b => { const rd = b.dataset.mode === 'read'; b.innerHTML = rd ? '<span class="lf">' + T('קריאה ומפרשים') + '</span><span class="ls">' + T('קריאה') + '</span>' : T('גימטריה'); b.title = T(rd ? 'מסך הקריאה: תנ״ך, משנה, רמב״ם, ש״ס וטור עם מפרשים' : 'מסך הגימטריה: חישוב, חיפוש והשוואה'); });
    const sw = $r('#modeSw'); if (sw) sw.setAttribute('aria-label', T('מצב עבודה'));
  }

  function init() {
    const sw = $r('#modeSw');
    if (sw) sw.onclick = e => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode, true); };
    const lb = $r('#langSw'); if (lb) lb.addEventListener('click', () => setTimeout(() => { labelModeSw(); rebuild(); }, 0));
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reMeasure);
    document.addEventListener('keydown', e => {
      if (document.body.dataset.mode !== 'read' || !built || document.querySelector('dialog[open]')) return;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName), mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); closePops(); $r('#rdQ').focus(); $r('#rdQ').select(); return; }
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
    if (G.GT_EMBED) start = G.GT_EMBED; // חלון בשולחן העבודה: תמיד המסך של החלון
    if (hashTarget()) { setMode('read', false, 'link'); openLinkSeg(); }
    else setMode(/^#gim$/i.test(location.hash) ? 'gem' : start, false, /^#gim$/i.test(location.hash) ? 'link' : undefined);
    window.addEventListener('hashchange', fromHash);
  }
  init();
})();
