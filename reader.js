/* reader.js — מסך "קריאה ומפרשים" (v3.8.0): תנ״ך ומשנה כספר פתוח, תרגום בטור צד ומפרש בתחתית הדף.
   שני חלקים:
   (1) ליבה טהורה (אינדקס פרק/פסוק, ניתוח מראה-מקום, חיפוש) — נחשפת כ-window.GimReaderCore ונבדקת ב-tests/run-tests.js.
   (2) ממשק — רץ רק בדפדפן, אחרי app.js, ומשתמש ב-window.GimApp שהוא חושף (שפה, שמות ספרים, trackEvent).
   הטקסטים כולם מתוך window.CORPUS_BUNDLE הקיים: unit = [cat, book, chapter, verse, text, …], cat: 0 תנ״ך, 1 משנה,
   2 רש״י, 3 אונקלוס, 4 תרגום יונתן, 5 ברטנורא, 6 מילון (לא בשימוש כאן). */
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
      if (cat === 2 || cat === 5) (c[u[3]] || (c[u[3]] = [])).push(u[4]);
      else c[u[3]] = c[u[3]] ? c[u[3]] + ' ' + u[4] : u[4];
    }
    const base = [], links = {};
    books.forEach((b, i) => { if (b.cat === 0 || b.cat === 1) base.push(i); });
    base.forEach(i => {
      const he = books[i].heTitle;
      links[i] = books[i].cat === 0 ? { cm: byKey['2|' + he], onkelos: byKey['3|' + he], yonatan: byKey['4|' + he] } : { cm: byKey['5|' + he.replace(/^משנה /, '')] };
    });
    // כתיב חסר/מלא: "תהלים" = "תהילים", "עוקצין" ~ "עוקצים" — משווים גם בלי י/ו ובלי ם/ן סופיות
    const loose = s => s.replace(/[יו]/g, '').replace(/[םן](?=\s|$)/g, 'ם');
    const clean = s => String(s).toLowerCase().replace(/[׳״'"`.,:;()[\]]/g, ' ').replace(/[־-]/g, ' ').replace(/\s+/g, ' ').trim();
    const names = [];
    base.forEach(i => {
      const b = books[i], add = n => { n = clean(n); if (n && !names.some(x => x.n === n)) names.push({ i, n, l: loose(n) }); };
      add(b.heTitle); add(b.heTitle.replace(/^משנה /, '').replace(/^פרקי /, '')); add(b.title); add(b.title.replace(/^Mishnah /, ''));
    });
    return { books, data, base, links, names, clean, loose, ncache: new Map() };
  }
  const chaptersOf = (IX, b) => { const d = IX.data[b] || []; const r = []; d.forEach((c, i) => { if (c && i > 0) r.push(i); }); return r; };
  const versesOf = (IX, b, ch) => { const c = (IX.data[b] || [])[ch] || []; const r = []; c.forEach((t, i) => { if (t && i > 0) r.push(i); }); return r; };

  // "בראשית א ו", "שמות יב", "ברכות ב ג", "Exodus 12 2", "ו ג" (פרק ופסוק בספר הנוכחי — רק בשני מספרים)
  function parseRef(IX, q, cur) {
    const toks = IX.clean(noMarks(q)).split(' ').filter(Boolean); if (!toks.length) return null;
    let b = -1, k = 0;
    for (let n = Math.min(4, toks.length); n >= 1 && b < 0; n--) { const cand = toks.slice(0, n).join(' '), lc = IX.loose(cand), hit = IX.names.find(x => x.n === cand) || IX.names.find(x => x.l === lc); if (hit) { b = hit.i; k = n; } }
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

  const CORE = { noTeamim, noMarks, norm, toHeb, parseNum, buildIndex, chaptersOf, versesOf, parseRef, suggestBooks, search, markWords, splitComm };
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
    'בפרק': 'Chapter', 'בספר': 'Book', 'בכל התנ״ך': 'All Tanakh', 'בכל המשנה': 'All Mishnah', 'תוצאות': 'results', 'מציג': 'showing', 'אין תוצאות': 'No results',
    'מעבר אל': 'Go to', 'פתיחת': 'Open', 'מעבר לפרק ופסוק': 'Go to chapter and verse', 'סגירה': 'Close',
    'אפשר גם להקליד מקום בתיבת החיפוש': 'You can also type a place in the search box', 'דפדוף': 'turn pages',
    'עמוד': 'Page', 'עמודים': 'Pages', 'מתוך': 'of', 'ההגדרות נשמרות לפעם הבאה.': 'Settings are saved for next time.',
    'פירוש': 'Commentary', 'המשך': 'cont.', 'כתב הפירוש': 'Commentary script', 'ניקוי חיפוש': 'Clear search'
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
    vRows: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 6h12M3 12h12M3 18h12M18 6h3M18 12h3M18 18h3"/></svg>'
  };

  let IX = null, built = false, R = null, geo = null, hlTimer = 0;
  const PC = new Map(); // מטמון עימוד: ספר:פרק|גאומטריה → [[פסוקים בעמוד]]
  const DEF = { b: 0, ch: 1, anchor: 1, view: 'book', tr: 'onkelos', trFont: 'rashi', cmFont: 'rashi', size: 0, scope: 'book' };
  const S = Object.assign({}, DEF, (() => { try { return JSON.parse(localStorage.getItem('gimatrivonReader') || '{}'); } catch (e) { return {}; } })());
  S.p = 0; S.hl = ''; S.lock = null;
  const save = () => { try { localStorage.setItem('gimatrivonReader', JSON.stringify({ b: S.b, ch: S.ch, anchor: S.anchor, view: S.view, tr: S.tr, trFont: S.trFont, cmFont: S.cmFont, size: S.size, scope: S.scope })); } catch (e) {} };

  const ensureIndex = () => {
    if (IX) return;
    IX = buildIndex(G.CORPUS_BUNDLE);
    if (!IX.base.includes(S.b) || !(IX.data[S.b] || [])[S.ch]) { S.b = 0; S.ch = 1; S.anchor = 1; }
  };
  const isMishnah = b => IX.books[b].cat === 1;
  // התרגום בפועל: ההעדפה אם קיימת בספר, אחרת התרגום האחר שקיים בו, ובלי תרגום אם אין
  function trBook(b) {
    const L = IX.links[b] || {}; if (S.tr === 'none') return null;
    if (L[S.tr] != null) return { b: L[S.tr], k: S.tr };
    const alt = S.tr === 'onkelos' ? 'yonatan' : 'onkelos';
    return L[alt] != null ? { b: L[alt], k: alt } : null;
  }
  const trLabel = k => T(k === 'onkelos' ? 'תרגום אונקלוס' : 'תרגום יונתן');
  const cmLabel = b => T(isMishnah(b) ? 'ברטנורא' : 'רש״י');
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
    return { W, H, narrow, two, pw, ph, fs, trW, per: two ? 2 : 1, key: [two, pw, ph, fs, S.view, S.tr, S.trFont, S.cmFont, isEn()].join('|') };
  }

  // דיבורי המפרש של פרק: [{v, dh, body}] לפי סדר הפסוקים
  const CMC = new Map();
  function cmEntries(b, ch) {
    const L = IX.links[b] || {}, key = b + ':' + ch; if (L.cm == null) return [];
    if (!CMC.has(key)) {
      const out = [];
      versesOf(IX, b, ch).forEach(v => (chText(L.cm, ch, v) || []).forEach(t => splitComm(t).forEach(e => out.push({ v, dh: e.dh, body: e.body }))));
      CMC.set(key, out);
    }
    return CMC.get(key);
  }
  // עמוד = { vs: [פסוקים], cm: [דיבורי מפרש] } — דיבורים שלא נכנסו עוברים לעמוד הבא (כמו בדפוס מקראות גדולות)
  function pageInner(b, ch, pg, pageNo, q) {
    const vs = pg.vs, tb = trBook(b), bk = IX.books[b], first = vs.length && vs[0] === versesOf(IX, b, ch)[0];
    const trCls = S.trFont === 'rashi' ? 'fR' : 'fN', cmCls = S.cmFont === 'rashi' ? 'fR' : 'fN';
    const trTxt = v => { if (!tb) return ''; const t = chText(tb.b, ch, v); return t ? (S.trFont === 'rashi' ? noMarks(t) : noTeamim(t)) : ''; };
    const main = v => hlHtml(noTeamim(chText(b, ch, v)), q);
    const vn = v => '<span class="vn">' + num(v) + '</span>';
    const rv = vs.length ? vs : [pg.cm[0].v, pg.cm[pg.cm.length - 1].v];
    let html = '<header class="rdHead"><span>' + h(bkName(bk.heTitle)) + '</span><span class="mid">' + h(grpName(bk.g)) + '</span><span' + (isEn() ? ' dir="ltr"' : '') + '>' + num(ch) + ', ' + num(rv[0]) + (rv[rv.length - 1] !== rv[0] ? '–' + num(rv[rv.length - 1]) : '') + '</span></header>';
    const title = first ? '<div class="rdChTitle">' + (ch === 1 ? '<span class="bk">' + h(bkName(bk.heTitle)) + '</span>' : '') + '<span class="ch">' + T('פרק') + ' ' + num(ch) + '</span></div>' : '';
    if (!vs.length) { /* עמוד המשך של המפרש בלבד */ } else if (S.view === 'book') {
      html += '<div class="rdBody' + (tb ? ' withTr' : '') + '"><div class="rdTxt">' + title + '<p>' + vs.map(v => '<span class="rdV" data-v="' + v + '">' + vn(v) + main(v) + '</span>').join(' ') + '</p></div>';
      if (tb) html += '<aside class="rdTr ' + trCls + '" aria-label="' + h(trLabel(tb.k)) + '"><div class="rdTrHd">' + h(trLabel(tb.k)) + '</div><p>' + vs.map(v => { const t = trTxt(v); return t ? '<span class="rdV" data-v="' + v + '">' + vn(v) + h(t) + '</span>' : ''; }).join(' ') + '</p></aside>';
      html += '</div>';
    } else {
      html += '<div class="rdBody rdRows' + (tb ? '' : ' noTr') + '">' + title + '<div class="rdRowHd"><span></span><span>' + T(isMishnah(b) ? 'משנה' : 'מקרא') + '</span>' + (tb ? '<span class="trh">' + h(trLabel(tb.k)) + '</span>' : '') + '</div>' +
        vs.map(v => '<div class="rdRow" data-v="' + v + '"><span class="vnc">' + vn(v) + '</span><span class="he">' + main(v) + '</span>' + (tb ? '<span class="tr ' + trCls + '">' + h(trTxt(v)) + '</span>' : '') + '</div>').join('') + '</div>';
    }
    html += '<div class="rdSp"></div>';
    if (pg.cm.length) {
      const fx = s => S.cmFont === 'rashi' ? noMarks(s) : s;
      html += '<section class="rdCm ' + cmCls + '" aria-label="' + h(cmLabel(b)) + '"><div class="rdCmHd"><span class="ln"></span><span>' + h(cmLabel(b)) + (vs.length && pg.cm[0].v < vs[0] ? ' <i>(' + T('המשך') + ')</i>' : '') + '</span></div><div class="rdCmBody">' +
        pg.cm.map(e => '<p data-v="' + e.v + '"><span class="cv">' + num(e.v) + '</span>' + (e.dh ? '<b>' + hlHtml(fx(e.dh), q) + '</b>' : '') + hlHtml(fx(e.body), q) + '</p>').join('') + '</div></section>';
    }
    html += '<div class="rdNum">' + num(pageNo) + '</div>';
    return html;
  }
  const over = el => el.scrollHeight > el.clientHeight + 1;

  function pagesFor(b, ch) {
    const key = b + ':' + ch + '|' + geo.key; if (PC.has(key)) return PC.get(key);
    const probe = $r('#rdProbe'), vs = versesOf(IX, b, ch), ents = cmEntries(b, ch), pages = [];
    probe.className = 'rdPage' + (geo.pw < 540 ? ' narrow' : '');
    const fits = pg => { probe.innerHTML = pageInner(b, ch, pg, pages.length + 1, ''); return !over(probe); };
    const entsOfVs = list => ents.filter(e => list.includes(e.v));
    const mainFrac = list => { probe.innerHTML = pageInner(b, ch, { vs: list, cm: [] }, 1, ''); return probe.querySelector('.rdSp').offsetTop / probe.clientHeight; };
    // הכמות הגדולה ביותר k (בין lo ל-max) שעבורה ok(k) — ok מונוטוני יורד; חיפוש דוהר+בינארי כדי למדוד מעט פעמים גם בפרקים ארוכים (תהלים קיט)
    const maxOk = (lo, max, ok) => {
      let good = lo, step = 1;
      while (good + step <= max && ok(good + step)) { good += step; step *= 2; }
      let bad = Math.min(good + step, max + 1);
      while (bad - good > 1) { const mid = (good + bad) >> 1; if (ok(mid)) good = mid; else bad = mid; }
      return good;
    };
    let Q = [], i = 0;
    while (i < vs.length || Q.length) {
      const R = vs.slice(i);
      let k = 0;
      if (R.length && (!Q.length || fits({ vs: [R[0]], cm: Q.slice(0, 1) }))) {
        const cmFor = k => Q.concat(entsOfVs(R.slice(0, k - 1)));
        // פסוק נוסף נכנס לעמוד אם כל הפירוש של הפסוקים שלפניו (כולל מה שנגרר מעמודים קודמים) עדיין נכנס איתו…
        const kA = maxOk(1, R.length, k => fits({ vs: R.slice(0, k), cm: cmFor(k) }));
        // …או, כשהטקסט עדיין תופס פחות מ-60% מהעמוד, אם לפחות דיבור אחד נכנס איתו (השאר נגרר הלאה, כמו בדפוס מקראות גדולות)
        const kB = maxOk(1, R.length, k => mainFrac(R.slice(0, k)) <= 0.6 && fits({ vs: R.slice(0, k), cm: cmFor(k).slice(0, 1) }));
        k = Math.max(kA, kB);
      }
      const pv = R.slice(0, k); i += k;
      const C = Q.concat(entsOfVs(pv));
      let n = C.length && fits({ vs: pv, cm: C.slice(0, 1) }) ? maxOk(1, C.length, n => fits({ vs: pv, cm: C.slice(0, n) })) : 0;
      if (!n && C.length && !pv.length) n = 1; // דיבור ארוך מעמוד שלם: עמוד נגלל
      pages.push({ vs: pv, cm: C.slice(0, n) }); Q = C.slice(n);
      if (pages.length > 400) break;
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
    const pages = pagesFor(S.b, S.ch);
    let idx = S.lock != null ? S.lock : pages.findIndex(p => p.vs.includes(S.anchor));
    S.lock = null; if (idx < 0 || idx >= pages.length) idx = 0;
    S.p = Math.floor(idx / geo.per) * geo.per;
    const shown = pages.slice(S.p, S.p + geo.per);
    S.anchor = (shown[0].vs[0] || shown[0].cm[0].v);
    const book = $r('#rdBook');
    book.className = 'rdBook' + (geo.two ? ' two' : ' one');
    const side = i => geo.two ? (i ? 'left' : 'right') : 'single', nar = geo.pw < 540 ? ' narrow' : '';
    book.innerHTML = shown.map((pg, i) => '<article class="rdPage ' + side(i) + nar + '" aria-label="' + T('עמוד') + ' ' + num(S.p + i + 1) + '">' + pageInner(S.b, S.ch, pg, S.p + i + 1, S.hl) + '</article>').join('') +
      (geo.two && shown.length < 2 ? '<article class="rdPage left blank' + nar + '" aria-hidden="true"></article>' : '') + (geo.two ? '<div class="rdSpine" aria-hidden="true"></div>' : '');
    book.querySelectorAll('.rdPage').forEach(p => { if (over(p)) p.classList.add('tight'); });
    const bk = IX.books[S.b], chs = chaptersOf(IX, S.b);
    $r('#rdWhereTxt').textContent = bkName(bk.heTitle) + ' · ' + T('פרק') + ' ' + num(S.ch);
    $r('#rdPos').textContent = (shown.length > 1 ? T('עמודים') + ' ' + num(S.p + 1) + '–' + num(S.p + 2) : T('עמוד') + ' ' + num(S.p + 1)) + ' ' + T('מתוך') + ' ' + num(pages.length);
    $r('#rdChPos').textContent = T('פרק') + ' ' + num(S.ch) + ' ' + T('מתוך') + ' ' + num(chs.length);
    $r('#rdProgBar').style.width = Math.max(2, Math.round(100 * (chs.indexOf(S.ch) + (S.p + shown.length) / pages.length) / chs.length)) + '%';
    const atStart = S.p === 0 && !nextCh(S.b, S.ch, -1), atEnd = S.p + geo.per >= pages.length && !nextCh(S.b, S.ch, 1);
    ['#rdPrev', '#rdPrev2'].forEach(s => { $r(s).disabled = atStart; });
    ['#rdNext', '#rdNext2'].forEach(s => { $r(s).disabled = atEnd; });
    $r('#rdPrevCh').disabled = !nextCh(S.b, S.ch, -1); $r('#rdNextCh').disabled = !nextCh(S.b, S.ch, 1);
    R.querySelectorAll('#rdViewSeg button').forEach(x => { const on = x.dataset.view === S.view; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    $r('#rdViewSeg [data-view=aligned] .t').textContent = T(isMishnah(S.b) ? 'משנה מול תרגום' : 'פסוק מול תרגום');
    save();
  }

  function flash(v) {
    clearTimeout(hlTimer);
    const els = R.querySelectorAll('.rdBook [data-v="' + v + '"]');
    els.forEach(e => { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); });
    hlTimer = setTimeout(() => els.forEach(e => e.classList.remove('flash')), 2600);
  }
  function goTo(b, ch, v) {
    S.b = b; S.ch = ch; S.anchor = v || versesOf(IX, b, ch)[0] || 1;
    render(); if (v) flash(v);
  }
  function turn(dir) {
    const pages = pagesFor(S.b, S.ch), np = S.p + dir * geo.per;
    if (np >= 0 && np < pages.length) { S.lock = np; render(); return; }
    const n = nextCh(S.b, S.ch, dir); if (!n) return;
    S.b = n.b; S.ch = n.ch;
    S.lock = dir > 0 ? 0 : Math.floor((pagesFor(n.b, n.ch).length - 1) / geo.per) * geo.per;
    render();
  }
  function stepChapter(dir) { const n = nextCh(S.b, S.ch, dir); if (n) goTo(n.b, n.ch, 0); }

  /* ---------- חלוניות ---------- */
  let openPop = null;
  function closePops() {
    ['#rdSet', '#rdJump'].forEach(s => { $r(s).hidden = true; });
    $r('#rdScrim').hidden = true; openPop = null;
    $r('#rdSetBtn').setAttribute('aria-expanded', 'false'); $r('#rdWhere').setAttribute('aria-expanded', 'false');
  }
  function openPopover(id) {
    const was = openPop; closePops(); closeDrop(); if (was === id) return;
    openPop = id; $r('#rdScrim').hidden = false;
    if (id === 'set') { renderSet(); $r('#rdSet').hidden = false; $r('#rdSetBtn').setAttribute('aria-expanded', 'true'); }
    else { J.b = S.b; J.ch = S.ch; J.v = 0; J.cat = IX.books[S.b].cat; renderJump(); $r('#rdJump').hidden = false; $r('#rdWhere').setAttribute('aria-expanded', 'true'); const a = $r('#rdJump .rdJB.on'); if (a) a.scrollIntoView({ block: 'center' }); }
  }

  function renderSet() {
    const L = IX.links[S.b] || {}, rows = isMishnah(S.b) ? 'משנה מול תרגום' : 'פסוק מול תרגום';
    const card = (k, ic, label) => '<button type="button" class="rdCard' + (S.view === k ? ' on' : '') + '" data-set="view" data-val="' + k + '" aria-pressed="' + (S.view === k) + '">' + ic + '<span>' + T(label) + '</span></button>';
    const opt = (k, label) => { const avail = k === 'none' || L[k] != null, on = S.tr === k; return '<button type="button" class="rdOpt' + (on ? ' on' : '') + '" data-set="tr" data-val="' + k + '" aria-pressed="' + on + '"><span class="dot"></span><span class="lb">' + T(label) + '</span><span class="nt">' + (k === 'onkelos' ? T('ברירת מחדל') : '') + (avail ? '' : (k === 'onkelos' ? ' · ' : '') + T('אין בספר זה')) + '</span></button>'; };
    const fontPair = (key, sample) => ['rashi', 'regular'].map(f => '<button type="button" class="rdFont' + (S[key] === f ? ' on' : '') + '" data-set="' + key + '" data-val="' + f + '" aria-pressed="' + (S[key] === f) + '"><span class="smp ' + (f === 'rashi' ? 'fR' : 'fN') + '">' + sample + '</span><span class="lb">' + T(f === 'rashi' ? 'כתב רש״י' : 'כתב רגיל') + '</span></button>').join('');
    $r('#rdSet').innerHTML = '<div class="rdPopHd"><span>' + T('הגדרות תצוגה') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('סוג תצוגה') + '</span><div class="rdCards">' +
      card('book', '<span class="pv pvBook"><i></i><i></i><i class="s"></i><b></b></span>', 'ספר') + card('aligned', '<span class="pv pvRows"><i></i><i></i><i></i></span>', rows) + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('תרגום בצד שמאל') + '</span>' + opt('onkelos', 'תרגום אונקלוס') + opt('yonatan', 'תרגום יונתן') + opt('none', 'ללא תרגום') + '</div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב התרגום') + '</span><div class="rdFonts">' + fontPair('trFont', 'בקדמין ברא') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('כתב הפירוש') + ' (' + cmLabel(S.b) + ')</span><div class="rdFonts">' + fontPair('cmFont', isMishnah(S.b) ? 'מאימתי קורין' : 'תהו ובהו') + '</div></div>' +
      '<div class="rdSec"><span class="rdSecT">' + T('גודל אותיות') + '</span><div class="rdSizes">' + [-1, 0, 1, 2].map(z => '<button type="button" class="' + (S.size === z ? 'on' : '') + '" data-set="size" data-val="' + z + '" aria-pressed="' + (S.size === z) + '" style="font-size:' + (13 + z * 2.5) + 'px">א</button>').join('') + '</div></div>' +
      '<p class="rdNote">' + T('ההגדרות נשמרות לפעם הבאה.') + '</p>';
  }

  const J = { cat: 0, b: 0, ch: 1, v: 0 };
  function renderJump() {
    const groups = [];
    IX.base.forEach(i => { const bk = IX.books[i]; if (bk.cat !== J.cat) return; let g = groups.find(x => x.name === bk.g); if (!g) groups.push(g = { name: bk.g, ids: [] }); g.ids.push(i); });
    const vs = versesOf(IX, J.b, J.ch);
    $r('#rdJump').innerHTML = '<div class="rdPopHd"><div class="rdJTabs" role="group">' + [0, 1].map(c => '<button type="button" data-jcat="' + c + '" class="' + (J.cat === c ? 'on' : '') + '" aria-pressed="' + (J.cat === c) + '">' + T(c ? 'משנה' : 'תנ״ך') + '</button>').join('') + '</div><span class="rdJT">' + T('מעבר לפרק ופסוק') + '</span><button type="button" class="rdX" data-close aria-label="' + T('סגירה') + '">' + ICON.x + '</button></div>' +
      '<div class="rdJGrid"><div class="rdJCol rdJBooks">' + groups.map(g => '<div class="rdJGrp">' + h(grpName(g.name)) + '</div>' + g.ids.map(i => '<button type="button" class="rdJB' + (i === J.b ? ' on' : '') + '" data-jb="' + i + '">' + h(bkName(IX.books[i].heTitle)) + '</button>').join('')).join('') + '</div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('פרק') + ' · ' + h(bkName(IX.books[J.b].heTitle)) + '</div><div class="rdCells">' + chaptersOf(IX, J.b).map(c => '<button type="button" class="rdCell' + (c === J.ch ? ' on' : '') + (c === S.ch && J.b === S.b ? ' cur' : '') + '" data-jch="' + c + '">' + num(c) + '</button>').join('') + '</div></div>' +
      '<div class="rdJCol"><div class="rdJH">' + T('פסוק') + ' · ' + T('פרק') + ' ' + num(J.ch) + '</div><div class="rdCells">' + vs.map(v => '<button type="button" class="rdCell' + (v === J.v ? ' on' : '') + '" data-jv="' + v + '">' + num(v) + '</button>').join('') + '</div></div></div>' +
      '<div class="rdJFoot"><span>' + T('אפשר גם להקליד מקום בתיבת החיפוש') + ' · <b>← →</b> ' + T('דפדוף') + ' · <b>Ctrl G</b></span><button type="button" class="rdGo" data-jgo>' + (isEn() ? 'Go to ' : 'מעבר ל') + h(bkName(IX.books[J.b].heTitle)) + ' ' + num(J.ch) + (J.v ? ', ' + num(J.v) : '') + '</button></div>';
  }

  /* ---------- חיפוש מהיר ---------- */
  let dropItems = [], dropAct = -1, qTimer = 0, dropQ = null;
  function closeDrop() { const d = $r('#rdDrop'); if (d) d.hidden = true; dropItems = []; dropAct = -1; }
  function scopeBooks() { if (S.scope === 'all') return IX.base.filter(i => IX.books[i].cat === IX.books[S.b].cat); return [S.b]; }
  function refLabel(r) { return bkName(IX.books[r.b].heTitle) + ' ' + num(r.ch) + (r.v ? ', ' + num(r.v) : ''); }
  function renderDrop() {
    const q = $r('#rdQ').value, d = $r('#rdDrop'); dropItems = []; dropAct = -1; dropQ = q;
    if (!q.trim()) { d.hidden = true; return; }
    let html = '';
    const ref = parseRef(IX, q, S.b);
    if (ref) dropItems.push({ kind: 'ref', r: ref });
    else suggestBooks(IX, q, 4).forEach(b => dropItems.push({ kind: 'ref', r: { b, ch: chaptersOf(IX, b)[0], v: 0 } }));
    if (dropItems.length) html += '<div class="rdDH">' + T('מעבר אל') + '</div>' + dropItems.map((it, i) => '<button type="button" class="rdDI ref" data-i="' + i + '" role="option">' + ICON.book + '<span>' + h(refLabel(it.r)) + '</span></button>').join('');
    const scopes = [['ch', 'בפרק'], ['book', 'בספר'], ['all', isMishnah(S.b) ? 'בכל המשנה' : 'בכל התנ״ך']];
    const res = search(IX, q, scopeBooks(), { limit: 80, ch: S.scope === 'ch' ? S.ch : 0 });
    html += '<div class="rdDScope" role="group">' + scopes.map(([k, l]) => '<button type="button" data-scope="' + k + '" class="' + (S.scope === k ? 'on' : '') + '" aria-pressed="' + (S.scope === k) + '">' + T(l) + '</button>').join('') + '<span class="cnt">' + (res.q.length < 2 ? '' : res.total ? num(res.total) + ' ' + T('תוצאות') + (res.total > res.hits.length ? ' · ' + T('מציג') + ' ' + num(res.hits.length) : '') : T('אין תוצאות')) + '</span></div>';
    const start = dropItems.length;
    res.hits.forEach(x => dropItems.push({ kind: 'hit', r: x }));
    html += dropItems.slice(start).map((it, j) => { const x = it.r, t = noTeamim(chText(x.b, x.ch, x.v)); return '<button type="button" class="rdDI hit" data-i="' + (start + j) + '" role="option"><span class="rf">' + h(refLabel(x)) + '</span><span class="sn">' + hlHtml(t, q) + '</span></button>'; }).join('');
    d.innerHTML = html; d.hidden = false;
    if (dropItems.length) setAct(0);
  }
  function setAct(i) {
    const btns = R.querySelectorAll('#rdDrop .rdDI'); if (!btns.length) return;
    dropAct = (i + btns.length) % btns.length;
    btns.forEach((b, j) => b.classList.toggle('act', j === dropAct));
    btns[dropAct].scrollIntoView({ block: 'nearest' });
  }
  function pickDrop(i) {
    const it = dropItems[i]; if (!it) return;
    const q = $r('#rdQ').value;
    if (it.kind === 'hit') S.hl = q; else { S.hl = ''; $r('#rdQ').value = ''; }
    $r('#rdQ').blur(); // כדי שהחצים ידפדפו מיד
    updClear(); closeDrop(); goTo(it.r.b, it.r.ch, it.r.v);
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
      '</div>' +
      '<div class="rdDesk" id="rdDesk"><button type="button" class="rdTurn prev" id="rdPrev" aria-label="' + T('עמוד קודם') + '">' + ICON.chevR + '</button><div class="rdBook" id="rdBook"></div>' +
        '<button type="button" class="rdTurn next" id="rdNext" aria-label="' + T('עמוד הבא') + '">' + ICON.chevL + '</button><div class="rdMeasure" aria-hidden="true"><article class="rdPage" id="rdProbe"></article></div></div>' +
      '<div class="rdFoot"><button type="button" class="rdIco" id="rdPrev2" aria-label="' + T('עמוד קודם') + '">' + ICON.chevR + '</button><span id="rdPos"></span><span class="rdProg"><span id="rdProgBar"></span></span><span id="rdChPos"></span><button type="button" class="rdIco" id="rdNext2" aria-label="' + T('עמוד הבא') + '">' + ICON.chevL + '</button></div>' +
      '<div class="rdScrim" id="rdScrim" hidden></div><div class="rdPop rdSet" id="rdSet" role="dialog" aria-label="' + T('הגדרות תצוגה') + '" hidden></div><div class="rdPop rdJump" id="rdJump" role="dialog" aria-label="' + T('מעבר לפרק ופסוק') + '" hidden></div>';
    built = true;
    $r('#rdPrevCh').onclick = () => stepChapter(-1); $r('#rdNextCh').onclick = () => stepChapter(1);
    $r('#rdPrev').onclick = $r('#rdPrev2').onclick = () => turn(-1);
    $r('#rdNext').onclick = $r('#rdNext2').onclick = () => turn(1);
    $r('#rdWhere').onclick = () => openPopover('jump');
    $r('#rdSetBtn').onclick = () => openPopover('set');
    $r('#rdScrim').onclick = closePops;
    R.querySelectorAll('#rdViewSeg button').forEach(x => { x.onclick = () => { S.view = x.dataset.view; render(); }; });
    $r('#rdSet').onclick = e => {
      if (e.target.closest('[data-close]')) return closePops();
      const t = e.target.closest('[data-set]'); if (!t) return;
      const k = t.dataset.set; S[k] = k === 'size' ? Number(t.dataset.val) : t.dataset.val;
      renderSet(); render();
    };
    $r('#rdJump').onclick = e => {
      if (e.target.closest('[data-close]')) return closePops();
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.jcat != null) { J.cat = Number(t.dataset.jcat); J.b = IX.base.find(i => IX.books[i].cat === J.cat); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; }
      else if (t.dataset.jb != null) { J.b = Number(t.dataset.jb); J.ch = chaptersOf(IX, J.b)[0]; J.v = 0; }
      else if (t.dataset.jch != null) { J.ch = Number(t.dataset.jch); J.v = 0; }
      else if (t.dataset.jv != null) { J.v = Number(t.dataset.jv); closePops(); return goTo(J.b, J.ch, J.v); }
      else if (t.dataset.jgo != null) { closePops(); return goTo(J.b, J.ch, J.v); }
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
    $r('#rdDrop').onclick = e => {
      const sc = e.target.closest('[data-scope]'); if (sc) { S.scope = sc.dataset.scope; save(); return renderDrop(); }
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

  function rebuild() { if (!built) return; const qv = $r('#rdQ') ? $r('#rdQ').value : ''; built = false; PC.clear(); CMC.clear(); build(); $r('#rdQ').value = qv; updClear(); render(); }

  /* ---------- מעבר בין מצבים (גימטריה / קריאה) ---------- */
  function setMode(m, user) {
    if (m !== 'read') m = 'gem';
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
    ['#startTour', '#mmTour'].forEach(s => { const b = $r(s); if (b) b.addEventListener('click', () => { if (document.body.dataset.mode === 'read') setMode('gem'); }, true); });
    const lb = $r('#langSw'); if (lb) lb.addEventListener('click', () => setTimeout(() => { labelModeSw(); rebuild(); }, 0));
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { PC.clear(); render(); });
    document.addEventListener('keydown', e => {
      if (document.body.dataset.mode !== 'read' || !built || document.querySelector('dialog[open]')) return;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName), mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); closePops(); $r('#rdQ').focus(); $r('#rdQ').select(); return; }
      if (mod && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); openPopover('jump'); return; }
      if (e.key === 'Escape' && openPop) { closePops(); return; }
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
