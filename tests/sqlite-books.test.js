/* בדיקות חיפוש בכל התחומים (תנ״ך, משנה, רמב״ם, גמרא, טור) מול המסדים הבנויים: לכל תחום כמה שאילתות, בכל מקור (טקסט / מפרשים), ובדיקה שבכל תוצאה
   נמצאות המילים שחיפשנו (בכל צורה שהאינדקס מכיר). node tests/sqlite-books.test.js */
process.removeAllListeners('warning');
const fs = require('fs'), vm = require('vm'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const SQ = require('../sqlite-search.js');
const root = path.join(__dirname, '..'), dir = path.join(root, 'generated/sqlite');
const w0 = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'generated/corpus/index.js'), 'utf8'), { window: w0 });
const corpus = w0.GIM_CORPUS_INDEX.books;
function open(name) {
  const w = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, name + '.js'), 'utf8'), { window: w }); const m = w.GIM_SQ_DBS[name];
  const f = path.join(os.tmpdir(), 'gim-' + name + '-' + m.hash + '.sqlite3');
  if (!fs.existsSync(f) || fs.statSync(f).size !== m.bytes) fs.writeFileSync(f, Buffer.concat(Array.from({ length: m.parts }, (_, i) => fs.readFileSync(path.join(dir, name + '.sqlite3.' + String(i).padStart(3, '0'))))));
  const db = new DatabaseSync(f, { readOnly: true });
  return { db, m, E: SQ.create({ all: (sql, args) => db.prepare(sql).all(...args).map(r => Object.values(r)) }, m.bk ? m.bk.map(x => ({ cat: SQ.DOMAINS[name].cat, cv: x.cv })) : corpus, name) };
}
const SRC_NAME = { tanakh: ['פסוקים', 'רש״י', 'אונקלוס', 'יונתן'], mishnah: ['משניות', 'ברטנורא'], rambam: ['הלכות', 'כסף משנה', 'השגות', 'משנה למלך'], talmud: ['גמרא', 'רש״י', 'תוספות'], tur: ['טור', 'בית יוסף', 'ב״ח'] };
// שאילתות לכל תחום: מילה, שתי מילים (קרובות), ביטוי, תחילית, NOT, OR
const Q = {
  tanakh: ['אברהם', 'משה אהרן', '"ויאמר אלהים"', 'שמע*', 'ארץ -שמים', 'יעקב OR ישראל'],
  mishnah: ['שבת', 'חייב פטור', '"מאימתי קורין"', 'קורי*', 'שור -חמור', 'ביכורים OR תרומה'],
  rambam: ['ברכה', 'שבת עירוב', '"קריאת שמע"', 'תפיל*', 'ברכה -שבת', 'מזוזה OR תפילין'],
  talmud: ['ברכה', 'מאי טעמא', '"מאימתי קורין"', 'תנו*', 'שבת -עירוב', 'רב OR שמואל'],
  tur: ['ברכה', 'תפילה שבת', '"בית הכנסת"', 'ציצי*', 'שבת -יום', 'יין OR שכר']
};
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) pass++; else { fail++; console.log('FAIL ' + n + (i ? ' — ' + i : '')); } };
(async () => {
  for (const name of Object.keys(Q)) {
    const { db, E, m } = open(name), D = SQ.DOMAINS[name], N = D.tab.length, row = id => (db.prepare('SELECT t FROM d WHERE id = ?').get(id) || {}).t;
    ok(name + ': מסד', m.units > 5000 && m.parts >= 1);
    const perSrc = Array(N).fill(0);
    for (const q of Q[name]) {
      const r = await E.search(q, {}), ast = SQ.parse(q); perSrc.forEach((_, s) => { });
      ok(name + ' ' + q + ': יש תוצאות', r.total > 0, 'total=' + r.total);
      // בכל תוצאה שמורכבת מיחידה אחת — כל מילה חיובית בשאילתה נמצאת בטקסט (בכל צורה, כולל תחילית*)
      const pos = []; (function w(e) { if (!e) return; if (e.k === 'w') pos.push(e); else if (e.k === 'p') e.ws.forEach(x => pos.push(x)); else if (e.k === 'and' || e.k === 'near' || e.k === 'or') e.c.forEach(w); else if (e.k === 'not') w(e.a); })(ast);
      const orQ = /\bOR\b|\|/.test(q), neg = / -|NOT/.test(q), bad = [];
      r.res.slice(0, 40).filter(x => x.u >= 0).forEach(x => {
        const ws = SQ.words(row(x.u) || '').ws, ar = !!D.ar[x.src];
        const has = p => ws.some(w => SQ.forms(w, ar).some((f, c) => c > 0 && (p.pre ? f.startsWith(p.kf) : f === p.kf)) || SQ.forms(w, !ar).some((f, c) => c > 1 && (p.pre ? f.startsWith(p.kf) : f === p.kf)));
        if (orQ ? !pos.some(has) : !pos.every(has)) bad.push(x.u);
      });
      ok(name + ' ' + q + ': המילים בכל תוצאה', !bad.length, bad.slice(0, 3).join(','));
    }
    // כל מקור בנפרד (טקסט, כל מפרש): מילה נפוצה נמצאת בו
    for (let s = 0; s < N; s++) {
      const q = { tanakh: 'אשר', mishnah: 'אשר', rambam: 'דבר', talmud: 'דבר', tur: 'דבר' }[name], r = await E.search(q, { srcs: [s] });
      ok(name + ': מקור ' + SRC_NAME[name][s], r.total > 20 && r.res.every(x => x.src === s), 'total=' + r.total);
    }
    // טקסט להצגה לכל התוצאות הראשונות
    const r = await E.search(Q[name][0], {}), tx = await E.texts([].concat(...r.res.slice(0, 20).map(E.unitsOf)), {});
    ok(name + ': טקסט לתוצאות', [...tx.values()].every(t => t && t.length > 1));
    console.log(name.padEnd(8), 'יחידות', m.units, 'מילים', m.words, 'חלקים', m.parts);
  }
  console.log('\nהכל: ' + pass + ' עברו, ' + fail + ' נכשלו'); process.exit(fail ? 1 : 0);
})();
