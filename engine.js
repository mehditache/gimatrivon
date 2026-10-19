/* GematriaEngine — normalization, gematria methods, comparison, boundary-safe search. UMD, no dependencies. */
(function (root) {
'use strict';
const VALUES = {א:1,ב:2,ג:3,ד:4,ה:5,ו:6,ז:7,ח:8,ט:9,י:10,כ:20,ל:30,מ:40,נ:50,ס:60,ע:70,פ:80,צ:90,ק:100,ר:200,ש:300,ת:400};
const FINALS = {ך:'כ',ם:'מ',ן:'נ',ף:'פ',ץ:'צ'};
const LETTER = /[א-ת]/, NON_LETTER_SEP = /[\s\u05BE\-–—_/\\.,;:!?()\[\]{}"'׳״<>|׀׃]+/;
// v3.5.0: קבוצה-לוכדת של NON_LETTER_SEP, מחושבת *פעם אחת* (לא בכל קריאה ל-tokens!) — buildIndex קורא
// ל-tokens() פעם לכל יחידה בקורפוס (כ-400,000 פעמים), וכל `new RegExp(...)` מקמפל ביטוי-רגולרי מחדש; זו
// הייתה רוב-רובה של זמן-הטעינה (buildIndex נמדד בכ-4 שניות, ורוב הזמן הזה היה קומפילציית-regex חזרתית-
// לחינם). דווח ע״י המשתמש: "שפר ביצועים... טעינה מהירה יותר".
const NON_LETTER_SEP_CAP = new RegExp('(' + NON_LETTER_SEP.source + ')');
const MARKS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g; // ניקוד + טעמים (maqaf U+05BE stays a word separator)
const MILUI_NAMES = {א:'אלף',ב:'בית',ג:'גימל',ד:'דלת',ה:'הא',ו:'ואו',ז:'זין',ח:'חית',ט:'טית',י:'יוד',כ:'כף',ל:'למד',מ:'מם',נ:'נון',ס:'סמך',ע:'עין',פ:'פא',צ:'צדי',ק:'קוף',ר:'ריש',ש:'שין',ת:'תו'};
const ATBASH = {א:'ת',ב:'ש',ג:'ר',ד:'ק',ה:'צ',ו:'פ',ז:'ע',ח:'ס',ט:'נ',י:'מ',כ:'ל'};
Object.keys(ATBASH).forEach(k => { ATBASH[ATBASH[k]] = k; });
// טבלת אטב״ח כפי שהוגדרה על ידי המשתמש (22 אותיות, זוגות הדדיים). ניתנת להחלפה מפורשת דרך setAtbachTable (לפני buildIndex).
const ATBACH_DEFAULT = {א:'ח',ב:'ז',ג:'ו',ד:'ה',ה:'ד',ו:'ג',ז:'ב',ח:'א',ט:'צ',י:'פ',כ:'ע',ל:'ס',מ:'נ',נ:'מ',ס:'ל',ע:'כ',פ:'י',צ:'ט',ק:'ת',ר:'ש',ש:'ר',ת:'ק'};
let ATBACH_TABLE = Object.assign({}, ATBACH_DEFAULT);
const METHODS = [
  {id:'regular',name:'רגילה'},{id:'kollel',name:'עם הכולל'},{id:'words',name:'עם מספר תיבות'},
  {id:'letters',name:'עם מספר אותיות'},{id:'milui',name:'מילוי'},
  {id:'atbash',name:'אתב״ש'},{id:'atbashKollel',name:'אתב״ש עם הכולל'},{id:'atbashWords',name:'אתב״ש עם מספר תיבות'},{id:'atbashLetters',name:'אתב״ש עם מספר אותיות'},
  {id:'atbach',name:'אטב״ח'},{id:'atbachKollel',name:'אטב״ח עם הכולל'},{id:'atbachWords',name:'אטב״ח עם מספר תיבות'},{id:'atbachLetters',name:'אטב״ח עם מספר אותיות'}];
const base = c => FINALS[c] || c;
const val = c => VALUES[base(c)] || 0;
const regOf = s => { let t = 0; for (const c of s) t += val(c); return t; };
const MILUI = {}; Object.keys(MILUI_NAMES).forEach(k => { MILUI[k] = regOf(MILUI_NAMES[k]); });

// v3.4.0: תיבה מקבלת גם maqafBefore — true אם היא חוברה לתיבה הקודמת במקף-עליון בלבד (־, ללא שום
// רווח/תו-מפריד אחר ביניהן בטקסט המקורי) — למשל "אֶת־הָאָרֶץ". נדרש כדי שחיפוש "מילה בודדת/זוג-מקף" (ראו
// search()'s filter.singleWord) יוכל להבחין בין שני-תיבות-שחוברו-במקף לבין שני-תיבות-רגילות-מופרדות-ברווח
// — הבחנה שנמחקת לגמרי אם רק מפצלים לפי NON_LETTER_SEP (שמתייחס למקף ולרווח כאותו דבר בדיוק).
function tokens(text) {
  const out = [];
  const parts = String(text == null ? '' : text).replace(/<[^>]*>/g, ' ').split(NON_LETTER_SEP_CAP);
  let maqafPending = false;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const raw = parts[i]; if (!raw) continue;
      const norm = raw.replace(/[^א-ת]/g, ''); // v3.5.0: MARKS אינה מופיעה כלל בתוצאה אחרי [^א-ת] (אין חפיפה בין הטווחים) — replace(MARKS,'') מיותר, הוסר (היה כפל-regex לחינם על 2.18M תיבות)
      if (norm) { out.push({ orig: raw, norm, maqafBefore: maqafPending }); maqafPending = false; }
    } else {
      maqafPending = /^־+$/.test(parts[i]); // המפריד בין שתי התיבות הוא מקף(ים) בלבד — לא רווח/פיסוק אחר
    }
  }
  return out;
}
function normalizeText(text) {
  const t = tokens(text);
  return { originalText: String(text == null ? '' : text), normalizedText: t.map(x => x.norm).join(' '), words: t.map(x => x.norm) };
}
const letterList = n => [...n.normalizedText.replace(/ /g, '')];
function calculateRegular(text) { const n = normalizeText(text); return regOf(n.normalizedText); }
function calculateKollel(text) { return calculateRegular(text) + 1; }
function calculateWords(text) { const n = normalizeText(text); return regOf(n.normalizedText) + n.words.length; }
function calculateLetters(text) { const n = normalizeText(text); return regOf(n.normalizedText) + letterList(n).length; }
function calculateMilui(text) { let t = 0; for (const c of letterList(normalizeText(text))) t += MILUI[base(c)]; return t; }
function transformAtbash(s) { return [...s].map(c => c === ' ' ? c : ATBASH[base(c)]).join(''); }
function calculateAtbash(text) { return regOf(transformAtbash(normalizeText(text).normalizedText)); }
function transformAtbach(s) { return [...s].map(c => c === ' ' ? c : ATBACH_TABLE[base(c)] || base(c)).join(''); }
function calculateAtbach(text) { return ATBACH_TABLE ? regOf(transformAtbach(normalizeText(text).normalizedText)) : null; }
function setAtbachTable(t) { ATBACH_TABLE = Object.assign({}, t && Object.keys(t).length ? t : ATBACH_DEFAULT); }
const getAtbachTable = () => ATBACH_TABLE;

function calculateGematria(text, method) {
  const n = normalizeText(text), reg = regOf(n.normalizedText), L = letterList(n).length, W = n.words.length;
  const r = { method, originalText: n.originalText, normalizedText: n.normalizedText, transformedText: n.normalizedText, value: 0, details: {} };
  if (method === 'regular') { r.value = reg; r.details = { formula: `${reg}` }; }
  else if (method === 'kollel') { r.value = reg + 1; r.details = { regular: reg, formula: `${reg} + 1 = ${reg + 1}` }; }
  else if (method === 'words') { r.value = reg + W; r.details = { regular: reg, wordCount: W, formula: `${reg} + ${W} תיבות = ${reg + W}` }; }
  else if (method === 'letters') { r.value = reg + L; r.details = { regular: reg, letterCount: L, formula: `${reg} + ${L} אותיות = ${reg + L}` }; }
  else if (method === 'milui') {
    const parts = letterList(n).map(c => `${c}=${MILUI_NAMES[base(c)]}(${MILUI[base(c)]})`);
    r.transformedText = letterList(n).map(c => MILUI_NAMES[base(c)]).join(' ');
    r.value = calculateMilui(text); r.details = { formula: parts.join(' + ') + ` = ${r.value}` };
  } else if (method === 'atbash') {
    r.transformedText = transformAtbash(n.normalizedText); r.value = regOf(r.transformedText);
    r.details = { formula: `${n.normalizedText} ← ${r.transformedText} = ${r.value}` };
  } else if (method === 'atbach') {
    if (!ATBACH_TABLE) { r.value = null; r.pending = true; r.details = { formula: 'ממתינה להגדרת טבלת 9 הקבוצות (לא קיימת בקבצי הפרויקט)' }; }
    else { r.transformedText = transformAtbach(n.normalizedText); r.value = regOf(r.transformedText); r.details = { formula: `${n.normalizedText} ← ${r.transformedText} = ${r.value}` }; }
  } else if (method === 'atbashKollel' || method === 'atbashWords' || method === 'atbashLetters') {
    r.transformedText = transformAtbash(n.normalizedText); const base = regOf(r.transformedText);
    if (method === 'atbashKollel') { r.value = base + 1; r.details = { atbash: base, formula: `${base} + 1 = ${r.value}` }; }
    else if (method === 'atbashWords') { r.value = base + W; r.details = { atbash: base, wordCount: W, formula: `${base} + ${W} תיבות = ${r.value}` }; }
    else { r.value = base + L; r.details = { atbash: base, letterCount: L, formula: `${base} + ${L} אותיות = ${r.value}` }; }
  } else if (method === 'atbachKollel' || method === 'atbachWords' || method === 'atbachLetters') {
    if (!ATBACH_TABLE) { r.value = null; r.pending = true; r.details = { formula: 'ממתינה להגדרת טבלת 9 הקבוצות (לא קיימת בקבצי הפרויקט)' }; }
    else {
      r.transformedText = transformAtbach(n.normalizedText); const base = regOf(r.transformedText);
      if (method === 'atbachKollel') { r.value = base + 1; r.details = { atbach: base, formula: `${base} + 1 = ${r.value}` }; }
      else if (method === 'atbachWords') { r.value = base + W; r.details = { atbach: base, wordCount: W, formula: `${base} + ${W} תיבות = ${r.value}` }; }
      else { r.value = base + L; r.details = { atbach: base, letterCount: L, formula: `${base} + ${L} אותיות = ${r.value}` }; }
    }
  } else throw new Error('שיטה לא מוכרת: ' + method);
  return r;
}

// תשע שיטות "הבונוס" (כולל / עם-מספר-תיבות / עם-מספר-אותיות, משלוש המשפחות: רגילה/אתב״ש/אטב״ח) לעולם
// לא נחשבות התאמה זו כנגד זו — אפילו אותה שיטה בדיוק משני הצדדים, וגם לא בין משפחות שונות (למשל
// אתב״ש-כולל מול רגילה-כולל) — כי הן נוספות-כמותיות על הערך ה"בסיסי" של המשפחה ולא שיטות עצמאיות אמיתיות.
// מוגדר פעם אחת ומשמש גם בהשוואת צד-מול-צד (compareAll) וגם בהתאמת מילה-מול-חיפוש-במקורות (app.js).
const NEVER_CROSS = new Set(['kollel', 'words', 'letters', 'atbashKollel', 'atbashWords', 'atbashLetters', 'atbachKollel', 'atbachWords', 'atbachLetters']);
const pairAllowed = (m1, m2) => !(NEVER_CROSS.has(m1) && NEVER_CROSS.has(m2));

function compareAll(textA, textB, methodsA, methodsB) { // כל שיטה בצד א׳ מול כל שיטה בצד ב׳ (בכפוף לחוק אי-ההתאמה)
  const A = methodsA.map(m => calculateGematria(textA, m)), B = methodsB.map(m => calculateGematria(textB, m));
  const empty = !normalizeText(textA).words.length || !normalizeText(textB).words.length, matches = [];
  if (!empty) A.forEach(a => B.forEach(b => { if (pairAllowed(a.method, b.method) && a.value != null && b.value != null && a.value === b.value) matches.push({ id: matches.length + 1, a, b, value: a.value }); }));
  return { A, B, matches };
}

/* ---------- אינדקס וחיפוש ---------- */
// units: [{c: קטגוריה, b: אינדקס ספר, ch, n, t: טקסט מנוקה}] — כל יחידה = פסוק / משנה. חלונות אינם חוצים יחידות.
// opts.keepText (ברירת מחדל true): כשכבוי (לשימוש ב-worker שרק סורק ולא מציג טקסט), לא נשמרים מערך התיבות
// (toks) ולא שדה הטקסט (t) של כל יחידה — חוסך זיכרון משמעותי (המילים המקוריות של כל הקורפוס) כשלא נדרש.
function buildIndex(units, opts) {
  const keepText = !opts || opts.keepText !== false;
  // טבלאות לפי קוד תו (אותיות סופיות ממופות לבסיס) — מהיר פי כמה מבניית מערכים לכל תיבה
  const reg = new Int32Array(1500), mil = new Int32Array(1500), atb = new Int32Array(1500), ath = new Int32Array(1500), OFF = 0x5D0;
  for (const c of Object.keys(VALUES)) { const i = c.charCodeAt(0) - OFF; reg[i] = VALUES[c]; mil[i] = MILUI[c]; atb[i] = VALUES[ATBASH[c]]; ath[i] = ATBACH_TABLE ? VALUES[ATBACH_TABLE[c] || c] : 0; }
  for (const f of Object.keys(FINALS)) { const i = f.charCodeAt(0) - OFF, j = FINALS[f].charCodeAt(0) - OFF; reg[i] = reg[j]; mil[i] = mil[j]; atb[i] = atb[j]; ath[i] = ath[j]; }
  const toks = [], R = [], L = [], M = [], A = [], H = [], MQ = [], start = new Int32Array(units.length + 1);
  let n = 0;
  units.forEach((u, i) => {
    start[i] = n;
    for (const t of tokens(u.t)) {
      const s = t.norm; let r = 0, m = 0, a = 0, h = 0;
      for (let k = 0; k < s.length; k++) { const c = s.charCodeAt(k) - OFF; r += reg[c]; m += mil[c]; a += atb[c]; h += ath[c]; }
      if (keepText) toks.push(t.orig);
      R.push(r); L.push(s.length); M.push(m); A.push(a); H.push(h); MQ.push(t.maqafBefore ? 1 : 0); n++;
    }
  });
  start[units.length] = n;
  const N = n, W = {regular:new Uint32Array(N), words:new Uint32Array(N), letters:new Uint32Array(N), milui:new Uint32Array(N), atbash:new Uint32Array(N), atbach:new Uint32Array(N)};
  for (let i = 0; i < N; i++) { W.regular[i] = R[i]; W.words[i] = R[i] + 1; W.letters[i] = R[i] + L[i]; W.milui[i] = M[i]; W.atbash[i] = A[i]; W.atbach[i] = H[i]; }
  W.kollel = W.regular; // כולל: סכום החלון + 1
  // אתב״ש/אטב״ח + כולל/תיבות/אותיות: ממומשות ללא מערכים חדשים (אופטימיזציית זיכרון, ~2MB במקום ~33MB) —
  // אליאס-כולל חינמי בדיוק כמו W.kollel; תיבות/אותיות מחושבות ב-search() ישירות מהמערך הבסיסי + idx.L המשותף.
  W.atbashKollel = W.atbash; W.atbachKollel = W.atbach;
  const outUnits = keepText ? units : units.map(u => ({ c: u.c, b: u.b, ch: u.ch }));
  // MAQAF[i]=1 אם התיבה i חוברה במקף-עליון לתיבה i-1 (ראו tokens() למעלה) — משמש ב-search()'s
  // filter.singleWord כדי להבחין בין זוג-תיבות-שחוברו-במקף (למשל "אֶת־הָאָרֶץ", נחשב "מילה אחת" לצורך
  // הסינון הזה) לבין שתי תיבות רגילות המופרדות ברווח.
  return { units: outUnits, toks: keepText ? toks : null, start, W, L: Uint8Array.from(L), MAQAF: Uint8Array.from(MQ) };
}
// targets: מספר יחיד (לתאימות לאחור) או מערך [{value, tag}] — כמה ערכי-יעד לאותה שיטה/שיטות בבת אחת.
// כשיש כמה יעדים לאותה שיטה, מתבצע מעבר יחיד על הקורפוס (לא מעבר נפרד לכל יעד): עבור יעד בודד נשמר המסלול
// המהיר של "שני מצביעים"; עבור כמה יעדים בו-זמנית נעשה שימוש בסכומי קידומת + טבלת חיפוש בתוך כל יחידה,
// כך שבדיקות הסינון (עץ מקורות/טווח) והמעבר על התיבות מתבצעים פעם אחת בלבד לכל שיטה, לא פעם לכל יעד.
// filter.uFrom/filter.uTo (אופציונלי): טווח אינדקסים של יחידות לסריקה (ברירת מחדל: כל הקורפוס) —
// מאפשר לקרוא ל-search() בפרוסות קטנות (למשל מ-app.js, "נשימה" לדפדפן בין פרוסה לפרוסה) בלי לשנות תוצאה.
// filter.fullUnit (אופציונלי, ברירת מחדל false): כשדולק, נספרות/מוחזרות רק התאמות שהחלון שלהן הוא *כל*
// היחידה (הפסוק/המשנה) מתחילתה ועד סופה — כלומר l === s (תחילת היחידה) וגם r === e-1 (התיבה האחרונה בה),
// לא התאמה לקטע-חלקי בתוכה. בודק זאת ב-4 מסלולי-הלולאה (יעד-בודד/כמה-יעדים × בסיס/תוספת-תיבות-אותיות)
// ברגע שבדיקת sum===T/cur===T כבר עברה — לא משנה את לוגיקת-הסכימה עצמה, רק מה שנחשב "התאמה" לצורך ספירה/החזרה.
function search(idx, targets, methods, filter, limit) {
  filter = filter || {}; limit = limit == null ? 1000 : limit; // 0 הוא ערך תקין (לדוגמה: תקציב-תוצאות שכבר מוצה בפרוסה קודמת)
  const list = Array.isArray(targets) ? targets : [{ value: targets, tag: null }];
  const res = [], counts = {}; let total = 0;
  const uFrom = filter.uFrom || 0, uTo = filter.uTo != null ? filter.uTo : idx.units.length;
  const passFilter = un => {
    if (filter.corpus && filter.corpus !== 'all' && un.c !== filter.corpus) return false;
    if (filter.book != null && filter.book !== '' && un.b !== +filter.book) return false;
    if (filter.books && !filter.books.has(un.b)) return false; // סינון מרובה לפי עץ המקורות
    if (filter.chFrom && un.ch < filter.chFrom) return false; if (filter.chTo && un.ch > filter.chTo) return false; // טווח פרקים גלובלי (legacy)
    if (filter.ranges && filter.ranges.size) { // טווח פרק:פסוק פר-ספר (Map<bookIndex,{fc,fv,tc,tv}>) — ריק/לא-קיים = כל הספר
      const rg = filter.ranges.get(un.b);
      if (rg) {
        const pos = un.ch * 1000 + (un.n || 0);
        if (rg.fc != null) { const fp = rg.fc * 1000 + (rg.fv || 0); if (pos < fp) return false; }
        if (rg.tc != null) { const tp = rg.tc * 1000 + (rg.tv != null ? rg.tv : 999); if (pos > tp) return false; }
      }
    }
    return true;
  };
  // filter.singleWord (אופציונלי, ברירת מחדל false, v3.4.0): כשדולק, נספרות/מוחזרות רק התאמות שאורכן
  // (במספר תיבות) הוא בדיוק 1, או 2 כאשר שתי התיבות חוברו ביניהן במקף-עליון בטקסט המקורי (idx.MAQAF —
  // ראו tokens()/buildIndex למעלה) — למשל "אֶת־הָאָרֶץ" נחשבת "מילה אחת" (שתי תיבות הצמודות-במקף), אבל
  // שתי תיבות נפרדות המופרדות ברווח רגיל (גם אם סכומן יחד שווה ליעד) לא נחשבות. משולב עם fullUnit (לא
  // סותר — אפשר לדלוק יחד: למשל "מילה בודדת שהיא גם כל הפסוק", פסוק בן-מילה-אחת).
  const MQ = idx.MAQAF;
  const passSpan = (l, r, s, e) => {
    if (filter.fullUnit && !(l === s && r === e - 1)) return false;
    if (filter.singleWord) { const len = r - l + 1; if (len !== 1 && !(len === 2 && MQ && MQ[l + 1])) return false; }
    return true;
  };
  // אתב״ש-תיבות/אטב״ח-תיבות ואתב״ש-אותיות/אטב״ח-אותיות: אין עבורן מערך-אינדקס אפוי ייעודי (אופטימיזציית
  // זיכרון, ~2MB במקום ~33MB) — הן נגזרות בזמן-ריצה מהמערך הבסיסי (אתב״ש/אטב״ח) בתוספת אורך-החלון (תיבות)
  // או סכום-רץ של idx.L (אותיות). אתב״ש-כולל/אטב״ח-כולל, לעומת זאת, הן אליאס חינמי כמו kollel הקיים —
  // אין להן overhead כלל, הן עוברות במסלול הרגיל (הלא-"extra") עם תיקון יעד T-1 בלבד.
  const WORDS_EXTRA = { atbashWords: 'atbash', atbachWords: 'atbach' };
  const LETTERS_EXTRA = { atbashLetters: 'atbash', atbachLetters: 'atbach' };
  const KOLLEL_LIKE = new Set(['kollel', 'atbashKollel', 'atbachKollel']);
  for (const m of methods) {
    const wordsBase = WORDS_EXTRA[m], lettersBase = LETTERS_EXTRA[m], extraBase = wordsBase || lettersBase;
    const w = idx.W[extraBase || m]; if (!w) continue;
    const kollel = KOLLEL_LIKE.has(m);
    const tmap = new Map(); // יעד-מתוקן (T) → {value, tag}
    for (const t of list) { const T = kollel ? t.value - 1 : t.value; if (T > 0 && !tmap.has(T)) tmap.set(T, t); }
    const cnt = new Map(); counts[m] = cnt; // value → מספר התאמות (לא מוגבל ע״י limit)
    if (!tmap.size) continue;
    if (!extraBase) {
      if (tmap.size === 1) {
        // מסלול מהיר: יעד יחיד — שני מצביעים (כמו במקור)
        const [[T, tag]] = tmap.entries();
        cnt.set(tag.value, 0);
        for (let u = uFrom; u < uTo; u++) {
          const un = idx.units[u]; if (!passFilter(un)) continue;
          const s = idx.start[u], e = idx.start[u + 1]; let l = s, sum = 0;
          for (let r = s; r < e; r++) {
            sum += w[r]; while (sum > T && l <= r) sum -= w[l++];
            if (sum === T && l <= r && passSpan(l, r, s, e)) { cnt.set(tag.value, cnt.get(tag.value) + 1); total++; if (res.length < limit) res.push({ u, l, r: r + 1, method: m, value: tag.value, tag: tag.tag }); }
          }
        }
      } else {
        // כמה יעדים לאותה שיטה: מסלול "שני מצביעים" נפרד לכל יעד (נבדק באופן ניסיוני — ניסיון לאחד את מעבר
        // היחידות/הסינון לפעם אחת לא שיפר ביצועים בפועל, כי צוואר הבקבוק האמיתי הוא נפח החישוב האריתמטי עצמו
        // ולא ה-overhead של בדיקת הסינון; ראו CHANGELOG — שיפור אמיתי דורש הרצה מקבילית, לא איחוד לוגי).
        for (const [T, tag] of tmap) {
          cnt.set(tag.value, 0);
          for (let u = uFrom; u < uTo; u++) {
            const un = idx.units[u]; if (!passFilter(un)) continue;
            const s = idx.start[u], e = idx.start[u + 1]; let l = s, sum = 0;
            for (let r = s; r < e; r++) {
              sum += w[r]; while (sum > T && l <= r) sum -= w[l++];
              if (sum === T && l <= r && passSpan(l, r, s, e)) { cnt.set(tag.value, cnt.get(tag.value) + 1); total++; if (res.length < limit) res.push({ u, l, r: r + 1, method: m, value: tag.value, tag: tag.tag }); }
            }
          }
        }
      }
    } else {
      // מסלול "תוספת": תיבות → תוספת = אורך-החלון (r-l+1), ללא מערך נוסף; אותיות → תוספת = סכום-רץ
      // של idx.L על פני החלון (סכום-כפול: בסיס + אותיות). זהה מתמטית למערך אפוי מלא, נבדק מול מימוש-ייחוס.
      const Larr = lettersBase ? idx.L : null;
      if (tmap.size === 1) {
        const [[T, tag]] = tmap.entries();
        cnt.set(tag.value, 0);
        for (let u = uFrom; u < uTo; u++) {
          const un = idx.units[u]; if (!passFilter(un)) continue;
          const s = idx.start[u], e = idx.start[u + 1]; let l = s, sumB = 0, sumL = 0;
          for (let r = s; r < e; r++) {
            sumB += w[r]; if (Larr) sumL += Larr[r];
            let cur = wordsBase ? sumB + (r - l + 1) : sumB + sumL;
            while (cur > T && l <= r) { sumB -= w[l]; if (Larr) sumL -= Larr[l]; l++; cur = wordsBase ? sumB + (r - l + 1) : sumB + sumL; }
            if (cur === T && l <= r && passSpan(l, r, s, e)) { cnt.set(tag.value, cnt.get(tag.value) + 1); total++; if (res.length < limit) res.push({ u, l, r: r + 1, method: m, value: tag.value, tag: tag.tag }); }
          }
        }
      } else {
        for (const [T, tag] of tmap) {
          cnt.set(tag.value, 0);
          for (let u = uFrom; u < uTo; u++) {
            const un = idx.units[u]; if (!passFilter(un)) continue;
            const s = idx.start[u], e = idx.start[u + 1]; let l = s, sumB = 0, sumL = 0;
            for (let r = s; r < e; r++) {
              sumB += w[r]; if (Larr) sumL += Larr[r];
              let cur = wordsBase ? sumB + (r - l + 1) : sumB + sumL;
              while (cur > T && l <= r) { sumB -= w[l]; if (Larr) sumL -= Larr[l]; l++; cur = wordsBase ? sumB + (r - l + 1) : sumB + sumL; }
              if (cur === T && l <= r && passSpan(l, r, s, e)) { cnt.set(tag.value, cnt.get(tag.value) + 1); total++; if (res.length < limit) res.push({ u, l, r: r + 1, method: m, value: tag.value, tag: tag.tag }); }
            }
          }
        }
      }
    }
  }
  return { results: res, counts, total };
}
/* ---------- נוטריקון: ר״ת / אות ב׳ / אות ג׳ / ס״ת ---------- */
// idx.W.notRt/notB/notC/notSt אינם נבנים ב-buildIndex (כדי לא לשלם ~35MB זיכרון למשתמש שלא משתמש בפיצ'ר
// כלל) — אלא lazily, בפעם הראשונה שנדרשים, דרך ensureNotarikonAsync/ensureNotarikonSync. כל אחד מהם הוא
// מערך משקל-לכל-תיבה, כמו idx.W.regular וכו', אבל במקום "סכום האותיות של התיבה" הוא "ערך האות ה-N של
// התיבה" (0 אם לתיבה אין אות כזו — למשל "אות ג׳" על מילה בת 2 אותיות) — כך שחיפוש-חלון-עם-שני-מצביעים
// (כמו search()) עובד נכון גם כאן: תיבה-בלי-אות-רלוונטית פשוט לא תורמת לסכום.
const NOTARIKON_POS = { notRt: 0, notB: 1, notC: 2, notSt: -1 };
const VALUE_TO_LETTER = {}; Object.keys(VALUES).forEach(c => { VALUE_TO_LETTER[VALUES[c]] = c; }); // כל 22 הערכים שונים זה מזה — החזרה מערך לאות חד-משמעית
function notarikonValueOf(norm, pos) { if (!norm) return 0; const i = pos < 0 ? norm.length + pos : pos; return (i >= 0 && i < norm.length) ? val(norm[i]) : 0; }
// בונה טווח-יחידות [uFrom,uTo) לתוך buf (4 מערכי Uint32Array באורך idx.toks.length) — משותף לגרסה הסינכרונית והמדורגת
function notarikonBuildRange(idx, buf, uFrom, uTo) {
  const s0 = idx.start[uFrom], e0 = idx.start[uTo];
  for (let i = s0; i < e0; i++) {
    const norm = idx.toks[i].replace(/[^א-ת]/g, ''); // v3.5.0: ראו הערה ב-tokens() — replace(MARKS,'') מיותר
    buf.notRt[i] = notarikonValueOf(norm, 0); buf.notB[i] = notarikonValueOf(norm, 1);
    buf.notC[i] = notarikonValueOf(norm, 2); buf.notSt[i] = notarikonValueOf(norm, -1);
  }
}
function ensureNotarikonSync(idx) {
  if (idx.W.notRt) return idx;
  if (!idx.toks) throw new Error('נוטריקון דורש idx שנבנה עם keepText (ברירת מחדל)');
  const N = idx.toks.length, buf = { notRt: new Uint32Array(N), notB: new Uint32Array(N), notC: new Uint32Array(N), notSt: new Uint32Array(N) };
  notarikonBuildRange(idx, buf, 0, idx.units.length);
  Object.assign(idx.W, buf);
  return idx;
}
// גרסה מדורגת (chunked, setTimeout בין פרוסה לפרוסה) — כדי לא "להקפיא" את הדפדפן בפעם הראשונה שהנוטריקון
// נדרש (בנייה מלאה על כל הקורפוס יכולה לקחת כשנייה-וחצי אם הייתה נעשית בבת-אחת). קריאות חוזרות/מקבילות
// (שני הצדדים ביקשו בו-זמנית) מצטרפות לאותה בנייה-בתהליך במקום לכפול אותה.
function ensureNotarikonAsync(idx, cb) {
  if (idx.W.notRt) { cb(); return; }
  if (idx.__notBuilding) { idx.__notBuilding.push(cb); return; }
  idx.__notBuilding = [cb];
  if (!idx.toks) { const cbs = idx.__notBuilding; idx.__notBuilding = null; const err = new Error('נוטריקון דורש idx שנבנה עם keepText'); cbs.forEach(f => f(err)); return; }
  const N = idx.toks.length, buf = { notRt: new Uint32Array(N), notB: new Uint32Array(N), notC: new Uint32Array(N), notSt: new Uint32Array(N) };
  const UNITS_PER_CHUNK = 20000;
  let u = 0;
  const step = () => {
    const uEnd = Math.min(idx.units.length, u + UNITS_PER_CHUNK);
    notarikonBuildRange(idx, buf, u, uEnd);
    u = uEnd;
    if (u < idx.units.length) { setTimeout(step, 0); return; }
    Object.assign(idx.W, buf);
    const cbs = idx.__notBuilding; idx.__notBuilding = null; cbs.forEach(f => f());
  };
  setTimeout(step, 0);
}
// חיפוש נוטריקון: target הוא מספר יחיד (ערך ה'רגילה' של ביטוי-החיפוש) — לא מערך-יעדים כמו search() הרגילה,
// כי כאן תמיד יש יעד בודד. filter.books/filter.ranges כמו ב-search(). opts.maxWindow (ברירת מחדל 12) — חלון
// לא חוצה יחידה ולא ארוך מ-maxWindow תיבות. opts.compareLetters (מחרוזת אותיות-בסיס, ללא רווחים — ראו
// FINALS לבסיוס) — אם סופקה, כל התאמה מתויגת r.literal (האם האותיות שחולצו מהפסוק זהות, אות-באות ובאותו
// סדר, לאותיות compareLetters — התעלמות מתיבות עם משקל 0, בדיוק כמו בחישוב הגימטרי) וגם r.perm (האם
// אותן אותיות ממש, בכל סדר שהוא — "צירופים"/אנגרמה; literal=true גורר תמיד גם perm=true). opts.literalOnly —
// אם true (ורק אם סופק compareLetters), מסננים גם את הספירה (counts) וגם את השורות להתאמות מילוליות-מדויקות
// בלבד. opts.permOnly — כנ"ל, אך מסנן להתאמות-צירופים בלבד (מילוליות ייספרו כאן גם הן, כי הן תת-קבוצה).
function searchNotarikon(idx, target, methods, filter, limit, opts) {
  filter = filter || {}; limit = limit == null ? 1000 : limit; opts = opts || {};
  const maxWindow = opts.maxWindow || 12, compareLetters = opts.compareLetters || null, literalOnly = !!(opts.literalOnly && compareLetters), permOnly = !!(opts.permOnly && compareLetters);
  const sortLetters = s => [...s].sort().join(''), compareSorted = compareLetters ? sortLetters(compareLetters) : null;
  const res = [], counts = {}; let total = 0;
  const passFilter = un => {
    if (filter.books && !filter.books.has(un.b)) return false;
    if (filter.ranges && filter.ranges.size) {
      const rg = filter.ranges.get(un.b);
      if (rg) {
        const pos = un.ch * 1000 + (un.n || 0);
        if (rg.fc != null) { const fp = rg.fc * 1000 + (rg.fv || 0); if (pos < fp) return false; }
        if (rg.tc != null) { const tp = rg.tc * 1000 + (rg.tv != null ? rg.tv : 999); if (pos > tp) return false; }
      }
    }
    return true;
  };
  const windowLetters = (w, l, r) => { let s = ''; for (let i = l; i < r; i++) if (w[i]) s += VALUE_TO_LETTER[w[i]] || '?'; return s; };
  for (const m of methods) {
    const w = idx.W[m]; if (!w) continue;
    counts[m] = 0;
    for (let u = 0; u < idx.units.length; u++) {
      const un = idx.units[u]; if (!passFilter(un)) continue;
      const s = idx.start[u], e = idx.start[u + 1];
      let l = s, sum = 0;
      for (let r = s; r < e; r++) {
        sum += w[r];
        while (l <= r && (sum > target || (r - l + 1) > maxWindow)) sum -= w[l++];
        if (sum === target && l <= r) {
          // כמו ב-search(): כש-יש תיבות במשקל 0 בקצה השמאלי, כמה חלונות-תחלה שונים מניבים אותו סכום —
          // כולם התאמות תקפות (כל אחד מהם "חלון נוטריקון" אחר, גם אם סכומו זהה).
          let ll = l;
          for (;;) {
            const wl = compareLetters ? windowLetters(w, ll, r + 1) : null;
            const lit = compareLetters ? wl === compareLetters : false;
            const perm = compareLetters ? (lit || sortLetters(wl) === compareSorted) : false;
            if ((!literalOnly || lit) && (!permOnly || perm)) {
              counts[m]++; total++;
              if (res.length < limit) res.push({ u, l: ll, r: r + 1, method: m, value: target, literal: lit, perm });
            }
            if (ll < r && w[ll] === 0) ll++; else break;
          }
        }
      }
    }
  }
  return { results: res, counts, total };
}
root.GematriaEngine = { METHODS, VALUES, FINALS, MILUI_NAMES, MILUI, ATBASH, normalizeText, tokens, calculateRegular, calculateKollel, calculateWords, calculateLetters, calculateMilui, calculateAtbash, calculateAtbach, calculateGematria, setAtbachTable, getAtbachTable, compareAll, buildIndex, search, pairAllowed, NOTARIKON_POS, ensureNotarikonSync, ensureNotarikonAsync, searchNotarikon };
if (typeof module !== 'undefined') module.exports = root.GematriaEngine;
})(typeof window !== 'undefined' ? window : globalThis);
