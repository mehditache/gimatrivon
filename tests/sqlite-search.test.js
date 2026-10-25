/* בדיקות למנוע חיפוש SQLite (sqlite-search.js) מול המסד הבנוי (generated/sqlite/tanakh.sqlite3), דרך node:sqlite (Node 22.5+).
   ניתוח השאילתה, נרמול, ביטוי, תחילית, AND/OR/NOT, NEAR, ^, אותיות שימוש, כתיב חסר ומלא, קרבה עד 3 פסוקים (גם מעבר לסוף
   פרק, לא מעבר לסוף ספר), דירוג לפי מרחק, תחומים ומקורות, ודגימות אקראיות מול הטקסט עצמו. node tests/sqlite-search.test.js */
process.removeAllListeners('warning');
const fs = require('fs'), vm = require('vm'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const SQ = require('../sqlite-search.js');
const root = path.join(__dirname, '..');
const win = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'generated/corpus/index.js'), 'utf8'), { window: win });
const books = win.GIM_CORPUS_INDEX.books, bookOf = he => books.findIndex(b => b.cat === 0 && b.heTitle === he);
const db = new DatabaseSync(path.join(root, 'generated/sqlite/tanakh.sqlite3'), { readOnly: true });
let nq = 0;
const backend = { all(sql, args) { nq++; const st = db.prepare(sql); return st.all(...args).map(r => Object.values(r)); } };
const E = SQ.create(backend, books), M = E.map;
const meta = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'generated/sqlite/tanakh.js'), 'utf8'), { window: w }); return w.GIM_SQ_DBS.tanakh; })();

let pass = 0, fail = 0; const grp = {};
const T = [];
const t = (g, name, fn) => T.push([g, name, fn]);
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
const ref = r => { const o = r.u >= 0 ? SQ.rOrd(r.u) : r.s; return books[M.ob[o]].heTitle + ' ' + M.oc[o] + ':' + M.ov[o] + (r.e > r.s ? '-' + M.oc[r.e] + ':' + M.ov[r.e] : ''); };
const src = r => ['txt', 'rashi', 'onkelos', 'yonatan'][r.src];
const S = (q, o) => E.search(q, o || { srcs: [0] });
const refs = r => r.res.map(ref);
const scope = (he, ch) => { const b = bookOf(he); if (ch) { const lo = M.ord(b, ch, 1); return { lo, hi: lo + books[b].cv[ch] - 1 }; } return { lo: M.first[b], hi: M.first[b] + books[b].cv.reduce((a, x) => a + (x || 0), 0) - 1 }; };
const text = u => (db.prepare('SELECT t FROM d WHERE id = ?').get(u) || {}).t;

/* ---- נרמול ---- */
t('norm', 'K: כתיב חסר ומלא זהים', () => eq([SQ.K('וחושך'), SQ.K('וחשך'), SQ.K('ירושלים'), SQ.K('ירושלם')], ['וחשכ', 'וחשכ', 'ירשלמ', 'ירשלמ']));
t('norm', 'K: האות הראשונה נשמרת (ו החיבור, י)', () => eq([SQ.K('ויאמר'), SQ.K('יום')], ['ואמר', 'ימ']));
t('norm', 'words: ניקוד, טעמים, מקף, פסק, סוף פסוק', () => eq(SQ.words('וַֽיְהִי־א֑וֹר ׀ טוֹב׃').ws, ['ויהי', 'אור', 'טוב']));
t('norm', 'words: גרשיים ופיסוק בתוך מילה', () => eq(SQ.words('רש״י, וכו\' (בראשית)').ws, ['רשי', 'וכו', 'בראשית']));
t('norm', 'forms: אותיות שימוש', () => eq([SQ.forms('והארץ'), SQ.forms('בראשית'), SQ.forms('שמים')], [['והארצ', 'והארצ', 'הארצ', 'ארצ'], ['בראשית', 'בראשת', 'ראשת', 'x'], ['שמימ', 'שממ', 'ממ', 'x']]) && eq(SQ.forms('והיום'), ['והימ', 'והמ', 'הימ', 'ימ']));
t('norm', 'forms: תרגום — ד שימוש', () => eq(SQ.forms('דבית', true).slice(2), ['בת', 'x']));
t('norm', 'forms: שארית של אות אחת — בלי צורה', () => eq(SQ.forms('בו').slice(2), ['x', 'x']));
t('norm', 'rid: הלוך ושוב', () => { const r = SQ.rid(1, 12345, 7); return SQ.rSrc(r) === 1 && SQ.rOrd(r) === 12345 && SQ.rK(r) === 7; });
t('norm', 'map: ord לכל פסוק ובחזרה', () => { const b = bookOf('שמות'), o = M.ord(b, 12, 2); return M.ob[o] === b && M.oc[o] === 12 && M.ov[o] === 2 && M.ord(b, 12, 99) === -1; });
t('norm', 'map: כל פסוק במסד במקום משלו (בקורפוס חסרים 2 פסוקים ביהושע)', () => { const n = db.prepare('SELECT count(*) n FROM d WHERE id < ?').get(SQ.SB).n; return M.n - n === 2; });
t('norm', 'מסד: הגודל וה-hash שב-tanakh.js', () => meta.bytes === fs.statSync(path.join(root, meta.file)).size && /^[0-9a-f]{10}$/.test(meta.hash));

/* ---- ניתוח השאילתה ---- */
const P = q => JSON.stringify(SQ.parse(q), (k, v) => k === 'key' || k === 'okey' || k === 'w' || k === 'of' || k === 'caret' && v === false || k === 'pre' && v === false ? undefined : v);
t('parse', 'מילים = AND', () => eq(SQ.parse('משה אהרן').k, 'and'));
t('parse', 'מירכאות = ביטוי', () => eq(SQ.parse('"ויאמר אלהים"').k, 'p'));
t('parse', 'מירכאות עבריות ״…״ = ביטוי', () => eq(SQ.parse('״ויאמר אלהים״').k, 'p'));
t('parse', 'גרשיים בתוך מילה אינם מירכאות', () => { const a = SQ.parse('רש״י'), b = SQ.parse('רש"י אמר'); return a.k === 'w' && a.kf === 'רש' && b.k === 'and' && b.c.length === 2; });
t('parse', 'ביטוי עם גרשיים בתוכו', () => { const e = SQ.parse('"פירש רש״י כאן"'); return e.k === 'p' && e.ws.length === 3; });
t('parse', 'תחילית *', () => { const e = SQ.parse('בר*'); return e.k === 'w' && e.pre && e.kf === 'בר'; });
t('parse', '^ תחילת פסוק', () => SQ.parse('^וידבר').caret === true);
t('parse', 'OR / | ', () => eq([SQ.parse('משה OR אהרן').k, SQ.parse('משה | אהרן').k, SQ.parse('משה or אהרן').k], ['or', 'or', 'or']));
t('parse', 'NOT ו-מילה', () => { const a = SQ.parse('משה NOT אהרן'), b = SQ.parse('משה -אהרן'); return a.k === 'not' && b.k === 'and' && b.neg.length === 1; });
t('parse', 'סדר: NOT > AND > OR', () => { const e = SQ.parse('א1 אב OR גד NOT הו'); return e.k === 'or' && e.c[1].k === 'not'; });
t('parse', 'סוגריים', () => { const e = SQ.parse('(משה OR אהרן) פרעה'); return e.k === 'and' && e.c[0].k === 'or'; });
t('parse', 'NEAR(…, n) ו-NEAR/n', () => { const a = SQ.parse('NEAR(משה אהרן, 3)'), b = SQ.parse('משה NEAR/2 אהרן'); return a.k === 'near' && a.n === 3 && b.k === 'near' && b.n === 2; });
t('parse', 'NEAR בלי מספר = 10', () => eq(SQ.parse('NEAR(משה אהרן)').n, 10));
t('parse', 'מקף מפריד מילים', () => eq(SQ.parse('על־פני').c.length, 2));
t('parse', 'מילה של אות אחת נשמטת', () => eq(SQ.parse('ו משה').k, 'w'));
t('parse', 'ניקוד וטעמים בשאילתה', () => eq(SQ.parse('בְּרֵאשִׁ֖ית').kf, 'בראשת'));
t('parse', 'קלט ריק או שבור — בלי קריסה', () => ['', ' ', '"', '""', '()', ')(', 'AND', 'OR OR', 'NOT', 'NEAR(', 'NEAR()', '*', '^', '-', '"א', 'א"', '(משה', 'משה)', 'NEAR(משה', '***', 'abc', '123'].every(q => { SQ.parse(q); return true; }));

/* ---- חיפוש ---- */
t('search', 'כתיב חסר ומלא: ״והארץ וחושך״ → בראשית א:ב', async () => eq(refs(await S('והארץ וחושך')).slice(0, 1), ['בראשית 1:2']));
t('search', 'מילה אחת: כל ההתאמות, ובהן הצורות עם אותיות שימוש', async () => { const r = await S('ארץ'); const all = await S('"ארץ"'); return r.total > all.total && all.total > 400; });
t('search', 'צורה מדויקת לפני צורה עם אותיות שימוש', async () => { const r = await S('ארץ'), first = r.res.findIndex(x => x.sc < 2000); return first > 0 && r.res.slice(first).every(x => x.sc < 2000); });
t('search', 'כתיב מדויק לפני כתיב חסר/מלא אחר', async () => { const r = await S('רש״י', { srcs: [1] }); return r.res[0].sc === 2000 && r.res.some(x => x.sc === 1998); });
t('search', 'ביטוי במירכאות: רק רצוף', async () => { const r = await S('"ויאמר אלהים"'); const any = await S('ויאמר אלהים'); return r.total > 30 && r.res.every(x => x.sc >= 1990) && any.total > r.total; });
t('search', 'ביטוי רצוף קודם, אחר כך מילים רחוקות', async () => { const r = await S('ויאמר אלהים'), k = r.res.findIndex(x => x.sc < 2900); return k > 30 && r.res.slice(0, k).every(x => x.sc >= 2900) && r.res.slice(k).every(x => x.sc < 2900); });
t('search', 'ביטוי של 3 מילים', async () => eq(refs(await S('"ויבא יעקב שלם"')), ['בראשית 33:18']));
t('search', 'ביטוי לא מוצא מילים בסדר אחר', async () => eq((await S('"אלהים ויאמר"')).res.filter(x => ref(x) === 'בראשית 1:3').length, 0));
t('search', 'תחילית: בראש*', async () => { const r = await S('בראש*'); return r.total > 50 && refs(r).includes('בראשית 1:1'); });
t('search', 'תחילית בתוך ביטוי', async () => { const r = await S('"ויאמר אל*"'); return r.total > 400; });
t('search', 'תחילית עם אותיות שימוש: ראשי* מוצא בראשית', async () => refs(await S('ראשית*')).includes('בראשית 1:1'));
t('search', '^: רק בתחילת פסוק', async () => { const r = await S('^וידבר משה'); const tx = r.res.slice(0, 30).map(x => SQ.words(text(x.u)).ws[0]); return r.total > 50 && tx.every(w => w === 'וידבר'); });
t('search', 'OR: איחוד', async () => { const a = (await S('"פרעה"')).total, b = (await S('"מצרים"')).total, o = (await S('"פרעה" OR "מצרים"')).total; return o >= Math.max(a, b) && o <= a + b; });
t('search', 'NOT: אין בתוצאה את המילה', async () => { const r = await S('משה NOT אהרן'); return r.total > 200 && r.res.every(x => x.u < 0 || !SQ.words(text(x.u)).ws.map(SQ.K).some(w => w === SQ.K('אהרן') || w.endsWith(SQ.K('אהרן')))); });
t('search', '-מילה = NOT', async () => eq((await S('משה -אהרן')).total, (await S('משה NOT אהרן')).total));
t('search', 'NEAR(…, 0): צמודות, בכל סדר', async () => { const r = await S('NEAR(משה אהרן, 0)'); return r.total > 40 && r.res.every(x => x.u >= 0); });
t('search', 'NEAR מצמצם לעומת AND', async () => { const a = (await S('משה אהרן')).total, n = (await S('NEAR(משה אהרן, 3)')).total; return n < a && n > 0; });
t('search', 'סוגריים: (משה OR אהרן) פרעה', async () => { const r = await S('(משה OR אהרן) פרעה'); return r.total >= (await S('משה פרעה')).total; });
t('search', '״שמים״ אינה גם ״מים״ באותו מקום', async () => { const r = await S('שמים מים'); return r.res.every(x => { if (x.u < 0) return true; const m = x.marks.get(x.u); return m && m.size >= 2; }); });
t('search', 'מילים שאינן בתנ״ך — אין תוצאות', async () => eq((await S('קומפיוטר')).total, 0));

/* ---- קרבה ודירוג ---- */
// בראשית א:א ״בראשית ברא״, א:ג ״יהי אור״: ״בראשית״ + ״אור״ = שני פסוקים זה מזה (1→3, חלון של 3)
t('near', 'מילים בפסוקים שונים, עד 3 פסוקים', async () => { const r = await S('בראשית ויהי אור', { srcs: [0], ...scope('בראשית', 1) }); return refs(r).some(x => /^בראשית 1:1-1:3$/.test(x)); });
t('near', 'יותר מ-3 פסוקים זה מזה — לא נמצא', async () => { const r = await S('"בראשית ברא" "ויכלו השמים"', { srcs: [0] }); return r.total === 0; });
for (const q of ['גר בארץ', 'בארץ גר']) for (const [n, o] of [['פסוקים', { srcs: [0] }], ['הכל', { srcs: [0, 1, 2, 3] }], ['בראשית', { srcs: [0], ...scope('בראשית') }], ['פרק', { srcs: [0], ...scope('בראשית', 15) }]])
  t('near', `״${q}״ (${n}) — בראשית טו:יג (כי גר יהיה זרעך בארץ) ב-50 הראשונות`, async () => { const r = await S(q, o); return r.res.slice(0, 50).some(x => x.src === 0 && ref(x) === 'בראשית 15:13'); });
t('near', 'מעבר לסוף פרק באותו ספר', async () => { // בראשית א:לא ״יום הששי״ ו-ב:א ״ויכלו״
  const r = await S('"יום הששי" ויכלו', { srcs: [0] }); return refs(r).includes('בראשית 1:31-2:1'); });
t('near', 'לא מעבר לסוף ספר', async () => { // סוף בראשית ״במצרים״ (נ:כו) ותחילת שמות ״ואלה שמות״ (א:א)
  const r = await S('"ויישם בארון במצרים" "ואלה שמות"', { srcs: [0] }); return r.total === 0; });
t('near', 'באותו פסוק קודם לפסוקים סמוכים', async () => { const r = await S('משה פרעה'); const k = r.res.findIndex(x => x.u < 0); return k > 0 && r.res.slice(0, k).every(x => x.u >= 0) && r.res.slice(k).every(x => x.u < 0); });
t('near', 'קרובות יותר באותו פסוק — ציון גבוה יותר', async () => { const r = await S('משה פרעה'); const one = r.res.filter(x => x.u >= 0), gaps = one.map(x => { const ws = SQ.words(text(x.u)).ws.map(SQ.K), a = [], b = []; ws.forEach((w, i) => { if (w === 'משה') a.push(i); if (w.endsWith('פרעה')) b.push(i); }); return Math.min(...a.flatMap(i => b.map(j => Math.abs(i - j)))); }); return gaps.every((g, i) => i === 0 || one[i].sc <= one[i - 1].sc) && gaps[0] <= gaps[gaps.length - 1]; });
t('near', 'פסוק אחד ביניהן — ציון גבוה מ-2', async () => { const r = await S('משה פרעה'); const p = r.res.filter(x => x.u < 0); const g1 = p.filter(x => x.e - x.s === 1), g2 = p.filter(x => x.e - x.s === 2); return g1.length && g2.length && Math.min(...g1.map(x => x.sc)) > Math.max(...g2.map(x => x.sc)); });
t('near', 'קטעים לא חופפים', async () => { const r = await S('משה פרעה'), seen = new Set(); return r.res.every(x => { for (let o = x.s; o <= x.e; o++) { const k = x.src + ':' + o + (x.u >= 0 ? ':' + x.u : ''); if (x.u < 0 && seen.has(x.src + ':' + o)) return false; if (x.u < 0) seen.add(x.src + ':' + o); } return true; }); });
t('near', 'קטע לא כולל פסוק שהוא תוצאה בעצמו', async () => { const r = await S('משה פרעה'), full = new Set(r.res.filter(x => x.u >= 0).map(x => x.u)); return r.res.filter(x => x.u < 0).every(x => x.us.every(u => !full.has(u))); });

/* ---- תחומים ומקורות ---- */
t('scope', 'בפרק', async () => { const r = await S('ארץ', { srcs: [0], ...scope('בראשית', 1) }); return r.total > 3 && refs(r).every(x => /^בראשית 1:/.test(x)); });
t('scope', 'בספר', async () => { const r = await S('ארץ', { srcs: [0], ...scope('רות') }); return r.total >= 3 && refs(r).every(x => /^רות /.test(x)); });
t('scope', 'בפרק: קטע לא יוצא מהפרק', async () => { const r = await S('"יום הששי" ויכלו', { srcs: [0], ...scope('בראשית', 1) }); return r.total === 0; });
t('scope', 'רש״י', async () => { const r = await S('ברא', { srcs: [1] }); return r.total > 20 && r.res.every(x => x.src === 1); });
t('scope', 'תרגום: אונקלוס ויונתן', async () => { const r = await S('בקדמין', { srcs: [2, 3] }); return r.total > 0 && r.res.every(x => x.src >= 2) && src(r.res[0]) === 'onkelos'; });
t('scope', 'תרגום יונתן בנביאים', async () => { const r = await S('"פתגמי עמוס"', { srcs: [2, 3] }); return refs(r).includes('עמוס 1:1') && src(r.res[0]) === 'yonatan'; });
t('scope', 'הכל: כמה מקורות', async () => { const r = await S('ויאמר אלהים יהי אור', { srcs: [0, 1, 2, 3] }); return new Set(r.res.map(x => x.src)).size >= 2; });
t('scope', 'הכל = סכום המקורות (מילה אחת)', async () => { const a = await Promise.all([[0], [1], [2, 3]].map(s => S('שלום', { srcs: s }))), all = await S('שלום', { srcs: [0, 1, 2, 3] }); return all.total === a.reduce((x, y) => x + y.total, 0); });
t('scope', 'רש״י: מספר הדיבור (k) לפי הסדר בפסוק', async () => { const r = await S('"אמר רבי יצחק"', { srcs: [1] }); return r.res.some(x => ref(x) === 'בראשית 1:1' && SQ.rK(x.u) === 0); });

/* ---- טקסטים ---- */
t('texts', 'texts מחזיר את הטקסט לכל יחידה', async () => { const r = await S('"ויבא יעקב שלם"'), tx = await E.texts(E.unitsOf(r.res[0])); return /יַעֲקֹב/.test(tx.get(r.res[0].u)); });
t('texts', 'קטע: כל הפסוקים שבו', async () => { const r = await S('"יום הששי" ויכלו', { srcs: [0] }), x = r.res.find(y => y.u < 0), us = E.unitsOf(x); return us.length === 2; });
t('texts', 'הסימון מצביע על המילים הנכונות', async () => { const r = await S('והארץ וחושך'), x = r.res[0], W = SQ.words(text(x.u)), m = [...x.marks.get(x.u)].map(i => W.ws[i]); eq(m.sort(), ['והארץ', 'וחשך'].sort()); });

/* ---- דגימות אקראיות מול הטקסט ---- */
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const allIds = db.prepare('SELECT id FROM d').all().map(r => r.id);
t('sample', '300 מילים אקראיות: היחידה שלהן נמצאת', async () => {
  const bad = [];
  for (let i = 0; i < 300; i++) {
    const u = allIds[rnd(allIds.length)], ws = SQ.words(text(u)).ws.filter(w => w.length >= 2); if (!ws.length) continue;
    const w = ws[rnd(ws.length)], r = await E.search('"' + w + '"', { srcs: [SQ.rSrc(u)] });
    if (!r.res.some(x => x.u === u)) bad.push(w + '@' + u);
  }
  if (bad.length) throw new Error(bad.slice(0, 5).join(' '));
});
t('sample', '200 ביטויים אקראיים של 3 מילים: הפסוק שלהם נמצא, ובציון של ביטוי', async () => {
  const bad = [];
  for (let i = 0; i < 200; i++) {
    const u = allIds[rnd(allIds.length)], ws = SQ.words(text(u)).ws; if (ws.length < 4 || ws.slice(0, 4).some(w => w.length < 2)) continue;
    const k = rnd(ws.length - 3), ph = ws.slice(k, k + 3); if (ph.some(w => w.length < 2)) continue;
    const r = await E.search(ph.join(' '), { srcs: [SQ.rSrc(u)] }), hit = r.res.find(x => x.u === u);
    if (!hit || hit.sc < 2900) bad.push(ph.join(' ') + '@' + u + ':' + (hit && hit.sc));
  }
  if (bad.length) throw new Error(bad.slice(0, 5).join(' | '));
});
t('sample', '40 מילים: כל פסוק שהמילה בו כמילה שלמה נמצא (מול סריקה של כל הפסוקים)', async () => {
  const verses = db.prepare('SELECT id, t FROM d WHERE id < ?').all(SQ.SB).map(r => [r.id, SQ.words(r.t).ws]);
  const bad = [];
  for (let i = 0; i < 40; i++) {
    const v = verses[rnd(verses.length)][1].filter(w => w.length >= 3); if (!v.length) continue;
    const w = v[rnd(v.length)], kw = SQ.K(w), want = verses.filter(x => x[1].some(y => SQ.K(y) === kw)).map(x => x[0]);
    const got = new Set((await S('"' + w + '"')).res.map(x => x.u));
    const miss = want.filter(u => !got.has(u)); if (miss.length || got.size !== want.length) bad.push(w + ' ' + miss.length + '/' + want.length + ' got ' + got.size);
  }
  if (bad.length) throw new Error(bad.slice(0, 5).join(' | '));
});
t('sample', 'מילה + אותיות שימוש: ״ארץ״ מוצא כל פסוק עם הארץ/בארץ/לארץ/מארץ/והארץ', async () => {
  const verses = db.prepare('SELECT id, t FROM d WHERE id < ?').all(SQ.SB).map(r => [r.id, SQ.words(r.t).ws]);
  const want = verses.filter(x => x[1].some(w => /^(ו?(ה|ב|ל|מ|כ|מה|ש)?)ארץ$/.test(w))).map(x => x[0]), got = new Set((await S('ארץ')).res.map(x => x.u));
  const miss = want.filter(u => !got.has(u)); if (miss.length) throw new Error(miss.length + ' missing of ' + want.length);
});

/* ---- מהירות (במקום, בלי רשת) ---- */
t('speed', '30 חיפושים שונים — כל אחד מתחת ל-300ms', async () => {
  const qs = ['את', 'ויאמר', 'יהוה', 'ויאמר משה', '"ויאמר יהוה אל משה"', 'אל*', 'ב*', 'משה OR אהרן OR מרים', 'NEAR(אברהם יצחק יעקב, 5)', 'שמים ארץ', 'כי טוב', 'ויהי ערב ויהי בקר', 'ארץ NOT שמים', 'לא', 'כל', 'ישראל', 'בני ישראל', 'ירושלים', 'דוד', 'שלמה המלך', 'אמר', 'דבר', 'הקב"ה', 'ת"ל', 'רש"י', 'מלך', 'עם', 'בית', 'יום', 'איש'];
  const slow = [];
  for (const q of qs) { const t0 = Date.now(); const r = await E.search(q, { srcs: [0, 1, 2, 3] }); const ms = Date.now() - t0; if (ms > 300) slow.push(q + ' ' + ms + 'ms/' + r.total); }
  if (slow.length) throw new Error(slow.join(', '));
});

/* ---- משנה וברטנורא (מסד נפרד) ---- */
const dbM = new DatabaseSync(path.join(root, 'generated/sqlite/mishnah.sqlite3'), { readOnly: true });
const EM = SQ.create({ all(sql, args) { return dbM.prepare(sql).all(...args).map(r => Object.values(r)); } }, books, 1), MM = EM.map;
const refM = r => { const o = r.u >= 0 ? SQ.rOrd(r.u) : r.s; return books[MM.ob[o]].heTitle + ' ' + MM.oc[o] + ':' + MM.ov[o]; };
t('mishnah', 'משנה: ״מאימתי קורין את שמע״ = ברכות א:א', async () => { const r = await EM.search('"מאימתי קורין את שמע"', { srcs: [0] }); return r.res.length > 0 && refM(r.res[0]) === 'משנה ברכות 1:1'; });
t('mishnah', 'ברטנורא: נמצא רק במפרש', async () => { const r = await EM.search('מאימתי קורין', { srcs: [1] }); return r.total > 0 && r.res.every(x => x.src === 1); });
t('mishnah', 'משנה: תחום פרק וספר', async () => { const b = books.findIndex(x => x.cat === 1 && x.heTitle === 'משנה ברכות'), lo = MM.ord(b, 1, 1), r = await EM.search('קורין', { srcs: [0], lo, hi: lo + books[b].cv[1] - 1 }); return r.total > 0 && r.res.every(x => MM.ob[SQ.rOrd(x.u >= 0 ? x.u : rOrdOf(x))] === b); });
const rOrdOf = x => x.s;
t('mishnah', 'משנה: בכל התחום מוצא ממסכתות שונות', async () => { const r = await EM.search('שבת', { srcs: [0] }); return new Set(r.res.map(x => MM.ob[x.u >= 0 ? SQ.rOrd(x.u) : x.s])).size > 5; });

(async () => {
  for (const [g, name, fn] of T) {
    try { const r = await fn(); if (r === false) throw new Error('false'); pass++; (grp[g] = grp[g] || { p: 0, f: 0 }).p++; }
    catch (e) { fail++; (grp[g] = grp[g] || { p: 0, f: 0 }).f++; console.log('FAIL [' + g + '] ' + name + ' :: ' + e.message); }
  }
  console.log('\n' + Object.entries(grp).map(([g, v]) => `${g}: ${v.p} passed, ${v.f} failed`).join('\n') + `\n\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
