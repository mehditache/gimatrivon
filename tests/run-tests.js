/* בדיקות: unit, השוואה, multi-match, חיפוש, גבולות, קורפוס, offline-audit. node tests/run-tests.js */
const path = require('path'), fs = require('fs'); global.window = {};
const E = require('../engine.js'); require('../generated/corpus.bundle.js'); const B = window.CORPUS_BUNDLE;
let pass = 0, fail = 0; const grp = {};
function t(g, name, fn) { try { const r = fn(); if (r === false) throw new Error('false'); pass++; (grp[g] = grp[g] || { p: 0, f: 0 }).p++; } catch (e) { fail++; (grp[g] = grp[g] || { p: 0, f: 0 }).f++; console.log('FAIL [' + g + '] ' + name + ' :: ' + e.message); } }
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
const V = (x, m) => E.calculateGematria(x, m).value;

// ---- unit ----
t('unit', 'normalize: ניקוד וטעמים', () => eq(E.normalizeText('בְּרֵאשִׁ֖ית בָּרָ֣א').normalizedText, 'בראשית ברא'));
t('unit', 'normalize: פיסוק ורווחים', () => eq(E.normalizeText('  אבא,  אמא!!  ').words, ['אבא', 'אמא']));
t('unit', 'normalize: מקף מפריד, סוף פסוק', () => eq(E.normalizeText('וַֽיְהִי־אוֹר׃').words, ['ויהי', 'אור']));
t('unit', 'normalize: שומר originalText', () => eq(E.normalizeText('אָב').originalText, 'אָב'));
t('unit', 'normalize: ריק', () => eq(E.normalizeText('').words, []));
t('unit', 'regular: סופיות', () => eq([V('ך','regular'), V('ם','regular'), V('ן','regular'), V('ף','regular'), V('ץ','regular')], [20, 40, 50, 80, 90]));
t('unit', 'regular: כל האותיות = 1495', () => eq(V('אבגדהוזחטיכלמנסעפצקרשת', 'regular'), 1495));
t('unit', 'regular: שלום=376, ניקוד לא משנה', () => eq([V('שלום', 'regular'), V('שָׁלוֹם', 'regular')], [376, 376]));
t('unit', 'regular: אבא=4', () => eq(V('אבא', 'regular'), 4));
t('unit', 'kollel', () => eq(V('אבא', 'kollel'), 5));
t('unit', 'words: אבא אמא = 4+42+... (רגילה + 2 תיבות)', () => eq(V('אבא אמא', 'words'), V('אבא אמא', 'regular') + 2));
t('unit', 'words: פיסוק לא יוצר תיבה', () => eq(E.calculateGematria('אבא, !! ... אמא', 'words').details.wordCount, 2));
t('unit', 'letters: רגילה + מספר אותיות', () => eq(V('אבא', 'letters'), 4 + 3));
t('unit', 'letters: לא סופר ניקוד/רווח/פיסוק', () => eq(E.calculateGematria('אָ בָּ, א׃', 'letters').details.letterCount, 3));
t('unit', 'milui: גד=517', () => eq(V('גד', 'milui'), 517));
t('unit', 'milui: גימל=83, דלת=434', () => eq([E.MILUI['ג'], E.MILUI['ד']], [83, 434]));
t('unit', 'milui: טבלה מלאה לכל 22 האותיות', () => Object.keys(E.VALUES).every(k => E.MILUI[k] > 0 && E.MILUI_NAMES[k]));
t('unit', 'milui: סופיות כבסיס', () => eq(V('ם', 'milui'), V('מ', 'milui')));
t('unit', 'atbash: אבא→תשת→1100', () => { const r = E.calculateGematria('אבא', 'atbash'); eq([r.transformedText, r.value], ['תשת', 1100]); });
t('unit', 'atbash: כל 11 הזוגות ↔', () => Object.entries({ א:'ת', ב:'ש', ג:'ר', ד:'ק', ה:'צ', ו:'פ', ז:'ע', ח:'ס', ט:'נ', י:'מ', כ:'ל' }).every(([a, b]) => E.calculateGematria(a, 'atbash').transformedText === b && E.calculateGematria(b, 'atbash').transformedText === a));
t('unit', 'atbash: סופית ך→ל', () => eq(E.calculateGematria('ך', 'atbash').transformedText, 'ל'));
t('unit', 'atbach: אבא→חזח→23', () => { const r = E.calculateGematria('אבא', 'atbach'); eq([r.transformedText, r.value], ['חזח', 23]); });
t('unit', 'atbach: טבלה מלאה של 22 אותיות, הדדית', () => { const T = E.getAtbachTable(); return Object.keys(T).length === 22 && Object.keys(E.VALUES).every(k => T[k] && T[T[k]] === k); });
t('unit', 'atbach: זוגות לפי הטבלה שהוגדרה', () => Object.entries({ א:'ח', ב:'ז', ג:'ו', ד:'ה', ט:'צ', י:'פ', כ:'ע', ל:'ס', מ:'נ', ק:'ת', ר:'ש' }).every(([a, b]) => E.calculateGematria(a, 'atbach').transformedText === b && E.calculateGematria(b, 'atbach').transformedText === a));
t('unit', 'atbach: סופית ך→כ→ע, ניקוד לא משנה', () => eq([E.calculateGematria('ך', 'atbach').transformedText, V('שָׁלוֹם', 'atbach')], ['ע', V('שלום', 'atbach')]));
t('unit', 'atbach: הגדרה מפורשת מחליפה טבלה ואיפוס חוזר לברירת המחדל', () => { E.setAtbachTable({ א: 'ב', ב: 'א' }); const r = E.calculateGematria('אב', 'atbach').transformedText; E.setAtbachTable(null); return r === 'בא' && V('אבא', 'atbach') === 23; });
t('unit', 'API: החזרה כוללת שדות חובה', () => ['method', 'originalText', 'normalizedText', 'transformedText', 'value', 'details'].every(k => k in E.calculateGematria('אבא', 'regular')));
t('unit', 'pairAllowed: 9 שיטות הבונוס (כולל/תיבות/אותיות משלוש המשפחות) אסורות זו-כנגד-זו, גם בין משפחות, כל שאר הזוגות מותרים', () => {
  const trio = ['kollel', 'words', 'letters', 'atbashKollel', 'atbashWords', 'atbashLetters', 'atbachKollel', 'atbachWords', 'atbachLetters'], all = E.METHODS.map(m => m.id);
  return trio.every(m1 => trio.every(m2 => !E.pairAllowed(m1, m2))) && // כל זוג בתוך ה-9 — אסור, גם m1===m2, גם בין משפחות (למשל atbashKollel/atbachWords)
    all.every(m1 => all.every(m2 => (trio.includes(m1) && trio.includes(m2)) === !E.pairAllowed(m1, m2))); // שום איסור נוסף מעבר לזה
});
t('unit', 'METHODS: 13 שיטות סה״כ (7 ישנות + 6 בונוס אתב״ש/אטב״ח)', () => eq(E.METHODS.length, 13));
t('unit', 'atbashKollel/atbashWords/atbashLetters: בראשית → 747/747/752', () => eq([V('בראשית', 'atbashKollel'), V('בראשית', 'atbashWords'), V('בראשית', 'atbashLetters')], [747, 747, 752]));
t('unit', 'atbachKollel/atbachWords/atbachLetters: בראשית → 696/696/701', () => eq([V('בראשית', 'atbachKollel'), V('בראשית', 'atbachWords'), V('בראשית', 'atbachLetters')], [696, 696, 701]));
t('unit', 'atbashKollel/atbashWords/atbashLetters = ערך אתב״ש + 1/מספר-תיבות/מספר-אותיות', () => { const a = V('בראשית ברא', 'atbash'); return eq([V('בראשית ברא', 'atbashKollel'), V('בראשית ברא', 'atbashWords'), V('בראשית ברא', 'atbashLetters')], [a + 1, a + 2, a + 9]); });
t('unit', 'atbachKollel/atbachWords/atbachLetters = ערך אטב״ח + 1/מספר-תיבות/מספר-אותיות', () => { const a = V('בראשית ברא', 'atbach'); return eq([V('בראשית ברא', 'atbachKollel'), V('בראשית ברא', 'atbachWords'), V('בראשית ברא', 'atbachLetters')], [a + 1, a + 2, a + 9]); });

// ---- comparison ----
const C = (a, b, ma, mb) => E.compareAll(a, b, ma || E.METHODS.map(m => m.id), mb || E.METHODS.map(m => m.id));
t('comparison', 'אטב״ח א׳ ↔ רגילה ב׳ (אבא=23 ↔ כג)', () => { const m = C('אבא', 'כג', ['atbach'], ['regular']).matches; return m.length === 1 && m[0].value === 23; });
t('comparison', 'רגילה↔רגילה', () => C('שלום', 'שלום', ['regular'], ['regular']).matches.length === 1);
t('comparison', 'אתב״ש א׳ ↔ רגילה ב׳ (אבא↔תשת)', () => { const m = C('אבא', 'תשת', ['atbash'], ['regular']).matches; return m.length === 1 && m[0].a.method === 'atbash' && m[0].b.method === 'regular' && m[0].value === 1100; });
t('comparison', 'רגילה א׳ ↔ אתב״ש ב׳', () => C('תשת', 'אבא', ['regular'], ['atbash']).matches.length === 1);
t('comparison', 'מילוי א׳ ↔ כולל ב׳ (גד↔תקיו)', () => { const m = C('גד', 'תקיו', ['milui'], ['kollel']).matches; return m.length === 1 && m[0].value === 517; });
t('comparison', 'אין התאמות', () => eq(C('אבג', 'ש', ['regular'], ['regular']).matches.length, 0));
t('comparison', 'טקסט ריק — אין התאמה', () => eq([C('', '', ['regular'], ['regular']).matches.length, C('אבא', '', ['regular'], ['regular']).matches.length], [0, 0]));
t('comparison', 'ניקוד/פיסוק/סופיות אינם משנים', () => C('שָׁלוֹם!', 'שלום', ['regular'], ['regular']).matches.length === 1 && C('מלך', 'מלכ', ['regular'], ['regular']).matches.length === 1);
t('comparison', 'כל-מול-כל: שמות שונים מושווים', () => { const r = C('אבא', 'אבא'); const cross = r.matches.filter(m => m.a.method !== m.b.method); return r.matches.length >= 6 && r.A.length === 13 && cross.length > 0 ? true : r.matches.some(m => m.a.method === 'regular' && m.b.method === 'regular'); });
t('comparison', 'כל-מול-כל: מספר צירופים = מכפלה קרטזית של ערכים שווים, בכפוף לחוק אי-ההתאמה (קולל/תיבות/אותיות לעולם לא כנגד עצמן)', () => { const r = C('אבא', 'אבא'); let n = 0; r.A.forEach(a => r.B.forEach(b => { if (E.pairAllowed(a.method, b.method) && a.value === b.value) n++; })); return n === r.matches.length && r.matches.every(m => E.pairAllowed(m.a.method, m.b.method)); });
t('multi', '3 התאמות מקבילות עם מזהים נפרדים', () => { // A: regular=D, atbash=X ; B: regular=D, kollel... בונים ידנית לפי ערכים
  const A = 'אבא', Bt = 'תשת'; // A.atbash=1100=B.regular ; A.regular=4=... נוסיף התאמה נוספת: A.regular ↔ B? אין
  const r = E.compareAll('גד', 'תקיו', ['regular', 'milui', 'atbash'], ['regular', 'kollel']); const ids = r.matches.map(m => m.id); return ids.length >= 1 && new Set(ids).size === ids.length; });
t('multi', 'חוק אי-ההתאמה: קולל/תיבות לעולם לא כנגד עצמן, גם כשהערכים שווים', () => { // "אבא" מול "אבא": רגילה=4, כולל=5, תיבות=5 (מילה אחת) — קולל/תיבות אסורות זו-כנגד-זו ואף כנגד עצמן, נשאר רק רגילה↔רגילה
  const r = C('אבא', 'אבא', ['regular', 'kollel', 'words'], ['regular', 'kollel', 'words']); const pairs = r.matches.map(m => m.a.method + '>' + m.b.method);
  return r.matches.length === 1 && pairs[0] === 'regular>regular' && !pairs.some(p => p.includes('kollel') || p.includes('words')); });
t('multi', 'כל השיטות ביחד (בכפוף לחוק אי-ההתאמה)', () => { const r = C('בראשית ברא אלהים', 'בראשית ברא אלהים'); return r.matches.length > 0 && r.matches.every(m => E.pairAllowed(m.a.method, m.b.method)); });
t('multi', 'חוק אי-ההתאמה חוצה-משפחות: אתב״ש-כולל לעולם לא כנגד רגילה-כולל/אטב״ח-תיבות, גם כשהערכים שווים', () => {
  const r = C('בראשית ברא אלהים', 'בראשית ברא אלהים', ['kollel', 'atbashKollel', 'atbachWords'], ['kollel', 'atbashKollel', 'atbachWords']);
  return r.matches.length === 0; // כל 3 השיטות הן בונוס — אף זוג לא מותר, אפילו שכל הערכים שווים (אותו טקסט משני הצדדים)
});

// ---- corpus (from bundle) ----
t('corpus', '39 תנ״ך + 63 משנה = 102', () => eq([B.books.filter(b => b.category === 'תנ״ך').length, B.books.filter(b => b.category === 'משנה').length, B.books.filter(b => b.cat < 2).length], [39, 63, 102]));
t('corpus', 'יחידות: 23,204 פסוקים + 4,106 משניות', () => eq([B.stats.tanakh, B.stats.mishnah], [23204, 4106]));
t('corpus', 'רמב״ם: 84 ספרי הלכות, 72 כסף משנה, 80 ראב״ד, 82 משנה למלך, כולם עם רישיון מתועד', () => eq([7, 8, 9, 10].map(c => B.books.filter(b => b.cat === c).length), [84, 72, 80, 82]) && B.books.filter(b => b.cat >= 7).every(b => b.src && b.lic) && B.stats.rambam === 15087);
t('corpus', 'אין אותיות לטיניות בטקסט המנוקה', () => B.units.filter(u => u[0] < 3).every(u => !/[A-Za-z<>{}&]/.test(u[4])));
t('corpus', 'אין {פ}/{ס}/הערות שוליים בטקסט', () => B.units.every(u => !/[{}׆*]/.test(u[4])));

// ---- search ----
const ALL13 = E.METHODS.map(m => m.id);
const IDX = E.buildIndex(B.units.map(u => ({ c: u[0] ? 'mishnah' : 'tanakh', b: u[1], ch: u[2], n: u[3], t: u[4] })));
// v3.16.0: בנייה בפרוסות (indexBuilder) — אותו אינדקס בדיוק כמו בבת אחת
t('search', 'indexBuilder בפרוסות קטנות בונה אינדקס זהה ל-buildIndex', () => {
  const us = B.units.slice(0, 30000).map(u => ({ c: 'tanakh', b: u[1], ch: u[2], n: u[3], t: u[4] }));
  const a = E.buildIndex(us), bd = E.indexBuilder(us); let n = 0; while (!bd.step(0)) n++; const x = bd.finish();
  const same = (p, q) => p.length === q.length && p.every((v, i) => v === q[i]);
  return n > 10 && ['regular', 'words', 'letters', 'milui', 'atbash', 'atbach'].every(m => same(x.W[m], a.W[m])) && same(x.L, a.L) && same(x.MAQAF, a.MAQAF) && same(x.start, a.start) && same(x.toks, a.toks) && x.W.kollel === x.W.regular;
});
t('search', 'buildIndex: idx.L (סכום-אותיות-לכל-תיבה) קיים, אורכו תואם מספר התיבות, וערכיו תואמים את calculateLetters', () => {
  return IDX.L && IDX.L.length === IDX.toks.length && [0, 1, 2, 100, IDX.L.length - 1].every(i => IDX.L[i] === E.normalizeText(IDX.toks[i]).normalizedText.replace(/ /g, '').length);
});
const wordsOf = r => IDX.toks.slice(r.l, r.r).join(' '); const uOf = r => IDX.units[r.u];
t('search', 'בראשית 913 נמצא בבראשית א:א', () => E.search(IDX, V('בראשית', 'regular'), ['regular'], { corpus: 'tanakh' }, 100000).results.some(r => { const u = uOf(r); return B.books[u.b].title === 'Genesis' && u.ch === 1 && u.n === 1 && E.normalizeText(wordsOf(r)).words.join(' ') === 'בראשית'; }));
t('search', 'פסוק שלם בראשית א:א נמצא כ-7 תיבות', () => { const u = IDX.units.findIndex(x => B.books[x.b].title === 'Genesis' && x.ch === 1 && x.n === 1), txt = IDX.toks.slice(IDX.start[u], IDX.start[u + 1]).join(' '); const r = E.search(IDX, V(txt, 'regular'), ['regular'], { book: IDX.units[u].b }, 1000).results; return r.some(x => x.u === u && x.r - x.l === 7); });
t('search', 'חיפוש במשנה: מאימתי קורין… (ברכות א:א)', () => { const u = IDX.units.findIndex(x => B.books[x.b].title === 'Mishnah Berakhot' && x.ch === 1 && x.n === 1), txt = IDX.toks.slice(IDX.start[u], IDX.start[u] + 3).join(' '); return E.search(IDX, V(txt, 'regular'), ['regular'], { corpus: 'mishnah' }, 100000).results.some(x => x.u === u && x.l === IDX.start[u] && x.r === IDX.start[u] + 3); });
t('search', 'מסנן קורפוס: תנ״ך בלבד לא מחזיר משנה', () => E.search(IDX, 500, ['regular'], { corpus: 'tanakh' }, 5000).results.every(r => uOf(r).c === 'tanakh'));
t('search', 'מסנן ספר', () => E.search(IDX, 500, ['regular'], { book: 0 }, 5000).results.every(r => uOf(r).b === 0));
t('search', 'כל 13 השיטות: ערך התוצאה תואם חישוב מחדש', () => { let ok = true; for (const m of ALL13) { const tgt = V('אור', m); if (tgt == null) continue; const rs = E.search(IDX, tgt, [m], { book: 0 }, 60).results; ok = ok && rs.length > 0 && rs.every(r => V(wordsOf(r), m) === tgt); } return ok; });
// אימות מול מימוש עצמאי (brute-force דרך calculateGematria) — כולל 6 השיטות החדשות (אתב״ש/אטב״ח + כולל/תיבות/אותיות)
t('search', 'התאמה מלאה ל-brute-force ב-150 יחידות × 13 שיטות (כולל המסלולים החדשים: אליאס-כולל, תוספת-אורך-חלון, סכום-כפול)', () => { let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const sample = []; for (let i = 0; i < 150; i++) sample.push(IDX.units[Math.floor(rnd() * IDX.units.length)]);
  const mini = E.buildIndex(sample.map(u => ({ c: u.c, b: u.b, ch: u.ch, n: u.n, t: B.units.find(x => x[1] === u.b && x[2] === u.ch && x[3] === u.n)[4] })));
  for (const m of ALL13) for (let k = 0; k < 6; k++) { const ui = Math.floor(rnd() * mini.units.length), s = mini.start[ui], e = mini.start[ui + 1]; if (e - s < 2) continue; const l = s + Math.floor(rnd() * (e - s - 1)), r = l + 1 + Math.floor(rnd() * Math.min(4, e - l - 1)), tgt = V(mini.toks.slice(l, r).join(' '), m); if (tgt == null) continue; const got = E.search(mini, tgt, [m], {}, 1e7).results.map(x => x.l + ':' + x.r).sort().join();
    const exp = []; for (let u = 0; u < mini.units.length; u++) for (let a = mini.start[u]; a < mini.start[u + 1]; a++) for (let z = a + 1; z <= mini.start[u + 1]; z++) if (V(mini.toks.slice(a, z).join(' '), m) === tgt) exp.push(a + ':' + z); if (exp.sort().join() !== got) throw new Error(`mismatch ${m} target ${tgt}`); } return true; });

// ---- boundaries ----
t('boundary', 'סינתטי: חלון אינו חוצה יחידה (שלום|עולם)', () => { const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'שלום' }, { c: 'tanakh', b: 0, ch: 1, n: 2, t: 'עולם' }]); return E.search(mi, V('שלום', 'regular') + V('עולם', 'regular'), ['regular', 'words', 'letters'], {}, 100).total === 0; });
t('boundary', 'סינתטי: לכל 13 השיטות — סכום חוצה־יחידות אינו נמצא', () => { const mi = E.buildIndex([{ c: 'mishnah', b: 0, ch: 1, n: 1, t: 'אבג' }, { c: 'mishnah', b: 0, ch: 1, n: 2, t: 'דהו' }]); return ALL13.every(m => { const tgt = V('אבג דהו', m); return tgt == null || E.search(mi, tgt, [m], {}, 100).total === 0; }); });
t('boundary', 'תנ״ך: סוף פסוק + תחילת הבא (500 זוגות) — אין חלון חוצה', () => { let bad = 0, checked = 0; for (let u = 0; u + 1 < IDX.units.length && checked < 500; u += 53) { const a = IDX.units[u], b = IDX.units[u + 1]; if (a.c !== 'tanakh' || b.c !== 'tanakh') continue; const lw = IDX.toks[IDX.start[u + 1] - 1], fw = IDX.toks[IDX.start[u + 1]]; if (!lw || !fw) continue; checked++;
    const tgt = V(lw + ' ' + fw, 'regular'); for (const r of E.search(IDX, tgt, ['regular'], { book: a.b }, 1e6).results) if (r.l < IDX.start[r.u] || r.r > IDX.start[r.u + 1]) bad++; } return bad === 0 && checked > 100; });
t('boundary', 'משנה: סוף משנה + תחילת הבאה — אין חלון חוצה', () => { let bad = 0, checked = 0; for (let u = 0; u + 1 < IDX.units.length && checked < 400; u += 7) { const a = IDX.units[u], b = IDX.units[u + 1]; if (a.c !== 'mishnah' || b.c !== 'mishnah') continue; const lw = IDX.toks[IDX.start[u + 1] - 1], fw = IDX.toks[IDX.start[u + 1]]; if (!lw || !fw) continue; checked++;
    const tgt = V(lw + ' ' + fw, 'regular'); for (const r of E.search(IDX, tgt, ['regular'], { book: a.b }, 1e6).results) if (r.l < IDX.start[r.u] || r.r > IDX.start[r.u + 1]) bad++; } return bad === 0 && checked > 100; });
t('boundary', 'כל תוצאה בכל 13 השיטות נשארת בתוך יחידה אחת', () => ALL13.every(m => [26, 86, 300, 913, 2000].every(tg => E.search(IDX, tg, [m], {}, 1e6).results.every(r => r.l >= IDX.start[r.u] && r.r <= IDX.start[r.u + 1] && r.r > r.l))));
t('boundary', 'מספר התיבות ב-Genesis 1:1 = 7 והחלון המקסימלי אינו חורג', () => { const u = IDX.units.findIndex(x => B.books[x.b].title === 'Genesis' && x.ch === 1 && x.n === 1); return IDX.start[u + 1] - IDX.start[u] === 7; });

// ---- notarikon (ר״ת/אות ב׳/אות ג׳/ס״ת) ----
t('notarikon', 'ensureNotarikonSync בונה 4 מערכים באורך idx.toks.length, lazy (לא קיימים לפני הקריאה)', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]);
  const before = !!mi.W.notRt; E.ensureNotarikonSync(mi);
  return !before && mi.W.notRt.length === mi.toks.length && mi.W.notB.length === mi.toks.length && mi.W.notC.length === mi.toks.length && mi.W.notSt.length === mi.toks.length;
});
t('notarikon', 'ensureNotarikonSync: ר״ת/ב׳/ג׳/ס״ת של "בראשית"(=2,200,1,400) ו"ברא"(=2,200,1) ו"אלהים"(=1,30,5,40)', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]); E.ensureNotarikonSync(mi);
  return eq([...mi.W.notRt], [2, 2, 1]) && eq([...mi.W.notB], [200, 200, 30]) && eq([...mi.W.notC], [1, 1, 5]) && eq([...mi.W.notSt], [400, 0, 40]);
  // ברא בת 3 אותיות — ס״ת=א=1, לא 0; בודק גם מקרה-גבול: תיבה קצרה מ-3 אותיות (אין כאן, רק לוודא שהחישוב לא נשבר)
});
t('notarikon', 'ר״ת: "בראשית ברא אלהים" — ר״ת=ב+ב+א=5, נמצא כחלון יחיד (3 תיבות)', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]); E.ensureNotarikonSync(mi);
  const r = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { maxWindow: 12 });
  return r.total === 1 && r.results[0].l === 0 && r.results[0].r === 3;
});
t('notarikon', 'ר״ת: ערך 5 גם ל"בבא" וגם ל"דא" וגם ל"ה" — כולם מתאימים (התאמה ערכית, לא תלויה באורך המילה)', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]); E.ensureNotarikonSync(mi);
  return [E.calculateGematria('בבא', 'regular').value, E.calculateGematria('דא', 'regular').value, E.calculateGematria('ה', 'regular').value].every(v => v === 5)
    && E.searchNotarikon(mi, 5, ['notRt'], {}, 100, {}).total === 1;
});
t('notarikon', 'compareLetters/literal: "בבא" (ב-ב-א, אותן אותיות) מתויג literal=true; "דא" (אותיות שונות, רק ערך שווה) מתויג literal=false', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]); E.ensureNotarikonSync(mi);
  const rBaba = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'בבא' });
  const rDa = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'דא' });
  return rBaba.results[0].literal === true && rDa.results[0].literal === false;
});
t('notarikon', 'literalOnly: "בבא" מחזיר התאמה (מילולי), "דא" לא מחזיר כלום (רק ערכי) — בדיוק כמו שהמשתמש ביקש', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]); E.ensureNotarikonSync(mi);
  const rBaba = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'בבא', literalOnly: true });
  const rDa = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'דא', literalOnly: true });
  return rBaba.total === 1 && rDa.total === 0;
});
t('notarikon', 'perm (צירופים/אנגרמה): "אבב" (אנגרמה של בבא — אותן אותיות, סדר שונה) מתויג literal=false אך perm=true; "דא" (אותיות שונות לגמרי) מתויג perm=false', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]); E.ensureNotarikonSync(mi); // ר״ת = ב+ב+א = "בבא"
  const rAnagram = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'אבב' });
  const rDa = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'דא' });
  return rAnagram.results[0].literal === false && rAnagram.results[0].perm === true && rDa.results[0].perm === false;
});
t('notarikon', 'permOnly: "אבב" (אנגרמה) מחזיר התאמה, "דא" (רק ערכי) לא מחזיר כלום; literal תמיד גורר perm=true גם תחת permOnly', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]); E.ensureNotarikonSync(mi);
  const rAnagram = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'אבב', permOnly: true });
  const rDa = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'דא', permOnly: true });
  const rBaba = E.searchNotarikon(mi, 5, ['notRt'], {}, 100, { compareLetters: 'בבא', permOnly: true });
  return rAnagram.total === 1 && rDa.total === 0 && rBaba.total === 1 && rBaba.results[0].literal === true && rBaba.results[0].perm === true;
});
t('notarikon', 'אות ב׳/אות ג׳: משקל 0 לתיבה קצרה מדי, ולא נספרת כהתאמה ל-target>0 אלא אם יש הצטברות ממקום אחר', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'דן גל' }]); E.ensureNotarikonSync(mi); // שתי מילים בנות 2 אותיות — "אות ג׳" = 0 לשתיהן
  return [...mi.W.notC].every(v => v === 0) && E.searchNotarikon(mi, 5, ['notC'], {}, 100, {}).total === 0;
});
t('notarikon', 'אות ב׳: תיקון-הבאג של תיקו בין תיבות-משקל-0 — כמה חלונות-התחלה שונים לאותו סכום נספרים כולם (כמו ב-search הרגילה)', () => {
  // "א" (תיבה בת אות 1, אות-ב=0) ואז "אב"(אות-ב=2): חלונות [א,אב]=2 ו-[אב]=2 — שני חלונות שונים, אותו סכום (2)
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'א אב' }]); E.ensureNotarikonSync(mi);
  const r = E.searchNotarikon(mi, 2, ['notB'], {}, 100, {});
  return r.total === 2 && r.results.some(x => x.l === 0 && x.r === 2) && r.results.some(x => x.l === 1 && x.r === 2);
});
t('notarikon', 'maxWindow: חלון שאורכו עולה על maxWindow לא נספר, גם אם סכומו תואם', () => {
  // 13 תיבות בנות אות אחת כל אחת, ר״ת כל אחת = 1 (א) — סכום 13 התיבות = 13, חלון ארוך מ-12 → לא תקף
  const txt = Array(13).fill('א').join(' '); const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: txt }]); E.ensureNotarikonSync(mi);
  const r12 = E.searchNotarikon(mi, 12, ['notRt'], {}, 1000, { maxWindow: 12 }); // 12 תיבות — תקף
  const r13 = E.searchNotarikon(mi, 13, ['notRt'], {}, 1000, { maxWindow: 12 }); // 13 תיבות — לא תקף (חוצה את המגבלה)
  return r12.total > 0 && r13.total === 0;
});
t('notarikon', 'filter.books מצמצם לפי קבוצת-ספרים (כמו ב-search הרגילה)', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'בראשית ברא אלהים' }, { c: 'tanakh', b: 1, ch: 1, n: 1, t: 'בראשית ברא אלהים' }]);
  E.ensureNotarikonSync(mi);
  const r = E.searchNotarikon(mi, 5, ['notRt'], { books: new Set([1]) }, 100, {});
  return r.total === 1 && mi.units[r.results[0].u].b === 1;
});
t('notarikon', 'חלון לא חוצה יחידה (כמו ב-search הרגילה)', () => {
  const mi = E.buildIndex([{ c: 'tanakh', b: 0, ch: 1, n: 1, t: 'דן' }, { c: 'tanakh', b: 0, ch: 1, n: 2, t: 'גל' }]); E.ensureNotarikonSync(mi);
  // ר״ת(דן)=4, ר״ת(גל)=3 — סכום חוצה-יחידות=7 לא אמור להימצא
  return E.searchNotarikon(mi, 7, ['notRt'], {}, 100, {}).total === 0;
});

// ---- reader (מסך "קריאה ומפרשים", reader.js) ----
const RC = require('../reader.js'), RIX = RC.buildIndex(B);
const bkIdx = (cat, he) => B.books.findIndex(b => b.cat === cat && b.heTitle === he);
t('reader', 'אינדקס: בראשית א א מהקורפוס, עם רש״י ואונקלוס ויונתן', () => { const g = bkIdx(0, 'בראשית'), L = RIX.links[g]; return RC.noMarks(RIX.data[g][1][1]).startsWith('בראשית ברא') && L.cm != null && L.onkelos != null && L.yonatan != null && Array.isArray(RIX.data[L.cm][1][1]) && /בקדמין/.test(RC.noMarks(RIX.data[L.onkelos][1][1])); });
t('reader', 'כל ספרי התנ״ך, המשנה והרמב״ם מקושרים למפרש (רש״י / ברטנורא / מפרשי הרמב״ם)', () => RIX.base.length === 102 + 84 && RIX.base.filter(i => RIX.links[i].cm == null).map(i => B.books[i].heTitle).join() === 'סדר התפילה'); // לסדר התפילה אין מפרשים בספריא
t('reader', 'רמב״ם: הלכות יסודי התורה עם כסף משנה, הראב״ד ומשנה למלך, מיושרים לפרק והלכה', () => { const y = bkIdx(7, 'הלכות יסודי התורה'), L = RIX.links[y]; return eq(L.cms.map(m => m.c), [8, 9, 10]) && RC.noMarks(RIX.data[y][1][1]).startsWith('יסוד היסודות') && /^יסוד היסודות/.test(RIX.data[L.cms[0].b][1][1][0]); });
t('reader', 'parseRef: הלכות ברמב״ם; "שבת" לבד נשאר משנה', () => { const sh = bkIdx(7, 'הלכות שבת'), yt = bkIdx(7, 'הלכות יסודי התורה'), ms = bkIdx(1, 'משנה שבת'), bk = bkIdx(7, 'הלכות ביכורים ושאר מתנות כהונה שבגבולין');
  const r = q => { const x = RC.parseRef(RIX, q, 0); return x && [x.b, x.ch, x.v]; };
  eq([r('הלכות שבת ג ה'), r('רמבם יסודי התורה א'), r('Sabbath 3 5'), r('שבת ב'), r('הלכות ביכורים ושאר מתנות כהונה שבגבולין א ב')], [[sh, 3, 5], [yt, 1, 0], [sh, 3, 5], [ms, 2, 0], [bk, 1, 2]]); });
t('reader', 'splitCm: הערה במפרשי הרמב״ם לא מתפצלת בנקודתיים', () => { const s = RC.splitCm(8, 'יסוד היסודות. פירוש: עוד פירוש:'); return s.length === 1 && s[0].dh === 'יסוד היסודות.' && RC.splitCm(5, 'א. ב: ג. ד:').length === 2; });
t('reader', 'תרגום: אונקלוס בתורה בלבד (5), יונתן בתורה ובנביאים', () => eq([RIX.base.filter(i => RIX.links[i].onkelos != null).length, RIX.links[bkIdx(0, 'ישעיהו')].yonatan != null, RIX.links[bkIdx(0, 'תהילים')].yonatan == null], [5, true, true]));
t('reader', 'parseRef: עברית, אנגלית, משנה, כתיב חסר ומספרים', () => { const ex = bkIdx(0, 'שמות'), br = bkIdx(1, 'משנה ברכות'), ps = bkIdx(0, 'תהילים');
  const r = q => { const x = RC.parseRef(RIX, q, 0); return x && [x.b, x.ch, x.v]; };
  eq([r('שמות יב ב'), r('Exodus 12 2'), r('שמות 12 2'), r('ברכות ב ג'), r('משנה ברכות א'), r('תהלים קיט'), r('ו ג')], [[ex, 12, 2], [ex, 12, 2], [ex, 12, 2], [br, 2, 3], [br, 1, 0], [ps, 119, 0], [0, 6, 3]]); });
t('reader', 'parseRef: מקום שלא קיים / טקסט חופשי → null', () => eq([RC.parseRef(RIX, 'בראשית נא', 0), RC.parseRef(RIX, 'בראשית א לב', 0), RC.parseRef(RIX, 'ויהי אור', 0), RC.parseRef(RIX, 'שלום', null)], [null, null, null, null]));
t('reader', 'toHeb/parseNum: טו, טז, קיט', () => eq([RC.toHeb(15), RC.toHeb(16), RC.toHeb(119), RC.parseNum('קיט'), RC.parseNum('טז'), RC.parseNum('12')], ['טו', 'טז', 'קיט', 119, 16, 12]));
t('reader', 'חיפוש: בלי ניקוד, בתחום פרק / ספר', () => { const g = bkIdx(0, 'בראשית'); const a = RC.search(RIX, 'יְהִי אוֹר', [g], {}), c = RC.search(RIX, 'אור', [g], { ch: 1 }); return a.total >= 1 && a.hits[0].ch === 1 && a.hits[0].v === 3 && c.hits.every(h => h.ch === 1) && c.total >= 1; });
t('reader', 'markWords מסמן את המילה המנוקדת', () => { const m = RC.markWords('וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר', 'אור'); return m.marks.size === 1 && m.parts[[...m.marks][0]] === 'אוֹר'; });
t('reader', 'splitComm: ברטנורא לדיבורים, דיבור המתחיל עד הנקודה', () => { const s = RC.splitComm('מאימתי. פירוש א: ועד. פירוש ב:'); return s.length === 2 && s[0].dh === 'מאימתי.' && s[1].dh === 'ועד.'; });
t('reader', 'גופנים מקומיים קיימים (vendor/fonts) ומוצהרים ב-styles.css', () => ['FrankRuhlLibre-hebrew.woff2', 'NotoRashiHebrew-hebrew.woff2'].every(f => fs.existsSync(path.join(__dirname, '..', 'vendor/fonts', f)) && fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8').includes('url(vendor/fonts/' + f + ')')));

// ---- ש״ס (generated/talmud, נבנה ב-scripts/build-talmud.py) ----
const TIDX = (() => { const w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '..', 'generated/talmud/index.js'), 'utf8'))(w); return w.GIM_TALMUD_INDEX; })();
const TX = RC.talIndex(TIDX), tk = he => TIDX.findIndex(t => t.he === he);
t('reader', 'ש״ס: 37 מסכתות בסדר, וכל קובצי החלקים קיימים ומתחת ל-2.5MB', () => TIDX.length === 37 && TIDX[0].k === 'Berakhot' && TIDX[36].k === 'Niddah' && TIDX.every(t => t.parts.length && t.parts.every(p => { const f = path.join(__dirname, '..', 'generated/talmud', p.f); return fs.existsSync(f) && fs.statSync(f).size < 2.5e6; })));
t('reader', 'ש״ס: ברכות ב. מתחיל במשנה "מאימתי", עם רש״י ותוספות', () => { const w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '..', 'generated/talmud/Berakhot.0.js'), 'utf8'))(w); const a = w.GIM_TP['Berakhot.0'].a[0]; return /^מתני[׳']\s*מאימתי/.test(RC.noMarks(a[0][0].replace(/[\u0001-\u0004]/g, ''))) && a[1].length > 5 && a[2].length > 1; });
t('reader', 'parseDafRef: ברכות ב. / ב: / שבת קכ ב / Berakhot 2b / דף בלי עמוד', () => { const r = q => { const x = RC.parseDafRef(TX, q); return x && [x.k, x.j, x.explicit]; };
  eq([r('ברכות ב.'), r('ברכות ב:'), r('שבת קכ ב'), r('Berakhot 2b'), r('בבא מציעא נט'), r('מסכת ברכות'), r('ברכות ב ע"ב')], [['Berakhot', 0, true], ['Berakhot', 1, true], ['Shabbat', RC.amudOf(120, 1), false], ['Berakhot', 1, true], ['Bava Metzia', RC.amudOf(59, 0), false], ['Berakhot', 0, true], ['Berakhot', 1, true]]); });
t('reader', 'parseDafRef: דף שלא קיים / טקסט חופשי → null; dafLabel', () => eq([RC.parseDafRef(TX, 'ברכות קא'), RC.parseDafRef(TX, 'ויהי אור'), RC.dafLabel(0), RC.dafLabel(1), RC.dafLabel(237), RC.dafLabel(3, true)], [null, null, 'ב.', 'ב:', 'קכ:', '3b']));

// ---- טור, בית יוסף וב״ח (generated/tur, נבנה ב-scripts/build-tur.py) ----
const RIDX = (() => { const w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '..', 'generated/tur/index.js'), 'utf8'))(w); return w.GIM_TUR_INDEX; })();
const RX = RC.turIndex(RIDX);
t('reader', 'טור: ארבעה טורים בסדר (697/403/178/426 סימנים + הקדמה), וכל קובצי החלקים קיימים ומתחת ל-2.5MB', () => eq(RIDX.map(t => [t.k, t.n]), [['OC', 698], ['YD', 404], ['EH', 179], ['CM', 427]]) || RIDX.every(t => t.parts.every(p => { const f = path.join(__dirname, '..', 'generated/tur', p.f); return fs.existsSync(f) && fs.statSync(f).size < 2.5e6; })));
t('reader', 'טור: או״ח א מתחיל ב"יהודה בן תימא", ולכל דיבור של בית יוסף וב״ח סימן אחד בדיוק בטור', () => {
  const w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '..', 'generated/tur/OC.0.js'), 'utf8'))(w); const P = w.GIM_TUR_P['OC.0'];
  if (!/^יהודה בן תימא/.test(P.s[1][0].replace(/\u0010[yc]\d+\u0011/g, ''))) return false;
  return P.s.every(r => ['y', 'c'].every((x, n) => r[n + 1].every((_, i) => r[0].split('\u0010' + x + i + '\u0011').length === 2)));
});
t('reader', 'parseTurRef: או״ח ס / אורח חיים 60 / בית יוסף יו״ד קצג / חו״מ הקדמה / Orach Chayim 60', () => { const r = q => { const x = RC.parseTurRef(RX, q); return x && [x.k, x.s]; };
  eq([r('טור או״ח ס'), r('או"ח סימן ס'), r('אורח חיים 60'), r('בית יוסף יו״ד קצג'), r('חו״מ הקדמה'), r('Orach Chayim 60'), r('טור אבן העזר')], [['OC', 60], ['OC', 60], ['OC', 60], ['YD', 193], ['CM', 0], ['OC', 60], ['EH', 1]]); });
t('reader', 'parseTurRef: סימן שלא קיים / ספר אחר → null; turToks מפריד סימנים ושורות', () => eq([RC.parseTurRef(RX, 'או״ח תשא'), RC.parseTurRef(RX, 'שמות יב'), RC.parseTurRef(RX, 'ברכות ב.'), RC.turToks('\u0010c0\u0011\u0010y0\u0011אב גד\nהו')], [null, null, null, ['\u0010c0\u0011', '\u0010y0\u0011', 'אב', 'גד', '\n', 'הו']]));

// ---- corpus split (v3.12.0): קובץ לכל ספר + corpus-loader.js ----
{
  const vm = require('vm'), cdir = path.join(__dirname, '..', 'generated', 'corpus');
  const ctx = { window: {}, document: { head: { appendChild() {} }, createElement: () => ({ remove() {} }) } }; ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(cdir, 'index.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'corpus-loader.js'), 'utf8'), ctx);
  const GC = ctx.window.GimCorpus; ctx.GimCorpus = GC;
  const CI = ctx.window.GIM_CORPUS_INDEX;
  CI.books.forEach(b => b.f.forEach(f => vm.runInContext(fs.readFileSync(path.join(cdir, f), 'utf8'), ctx)));
  t('split', 'כל ספר נטען, וכל היחידות זהות לקורפוס המלא (כולל המילון הקומפקטי)', () => {
    let i = 0;
    for (let b = 0; b < CI.books.length; b++) for (const u of GC.units(b)) { const o = B.units[i++]; for (let k = 0; k < 7; k++) if ((u[k] || 0) !== (o[k] || 0)) return false; }
    return i === B.units.length;
  });
  t('split', 'רשימת הספרים זהה, עם מספר היחידות ופסוקים לכל פרק', () => CI.books.length === B.books.length && CI.books.every((b, i) => b.heTitle === B.books[i].heTitle && b.n === B.units.filter(u => u[1] === i).length) && CI.books[0].cv[1] === 31 && CI.books[0].cv.length === 51);
  t('split', 'כל קובץ ספר קטן מ-3.2MB (GitHub Pages קוטע קבצים גדולים)', () => CI.books.every(b => b.f.every(f => fs.statSync(path.join(cdir, f)).size < 3.2e6)));
  t('split', 'reader: ספר שנטען (addBook) זהה לאינדקס מהקורפוס המלא; לפני הטעינה פרקים ופסוקים מהרשימה', () => {
    const IX = RC.buildIndex({ books: CI.books }), g = bkIdx(0, 'בראשית');
    const before = RC.chaptersOf(IX, g).length === 50 && RC.versesOf(IX, g, 1).length === 31 && !!RC.parseRef(IX, 'בראשית ב ג', null);
    RC.addBook(IX, g, GC.each);
    return before && JSON.stringify(IX.data[g]) === JSON.stringify(RIX.data[g]) && RC.versesOf(IX, g, 1).length === 31;
  });
  t('split', 'use(): ספר שאף אחד כבר לא צריך משתחרר; ספר שעוד מוחזק נשאר', () => {
    const r1 = GC.use([0, 1]), r2 = GC.use([1]);
    r1(); const a = !GC.ready(0) && GC.ready(1);
    r2(); r2(); return a && !GC.ready(1) && GC.ready(2);
  });
}

// ---- offline static audit ----
// חריג מכוון יחיד: בלוק "צור קשר" (EmailJS) ב-app.js, בין EMAILJS:START/EMAILJS:END — הדבר היחיד באפליקציה
// שדורש רשת בפועל (וגם זה רק כש-המשתמש בעצמו לוחץ "שליחה" בטופס, ראו הערה שם). נבדק בנפרד למטה שהבלוק
// אכן מבודד (לא "דולף" רשת לשאר הקוד) ושה-script הדינמי היחיד נטען רק דרך ה-CDN המוגדר, לא ממקור אחר.
const root = path.join(__dirname, '..'); const runtime = ['index.html', 'styles.css', 'app.js', 'engine.js', 'reader.js', 'corpus-loader.js'];
const EMAILJS_RE = /\/\/ --- EMAILJS:START ---[\s\S]*?\/\/ --- EMAILJS:END ---/;
const ANALYTICS_RE = /\/\/ --- ANALYTICS:START ---[\s\S]*?\/\/ --- ANALYTICS:END ---/; // חריג שני: Google Analytics, רק כשמוגדר מזהה-מדידה
const stripEmailJs = s => s.replace(EMAILJS_RE, '').replace(ANALYTICS_RE, '');
t('offline', 'אין כתובות חיצוניות / fetch / XHR / CDN / פונטים חיצוניים (מחוץ לבלוק EmailJS המבודד)', () => runtime.every(f => !/https?:\/\/|\bfetch\s*\(|XMLHttpRequest|@import|googleapis|cdn\.|WebSocket|navigator\.sendBeacon/i.test(stripEmailJs(fs.readFileSync(path.join(root, f), 'utf8')))));
t('offline', 'בלוק EmailJS קיים פעם אחת בדיוק, וטוען אך ורק מ-cdn.jsdelivr.net', () => { const s = fs.readFileSync(path.join(root, 'app.js'), 'utf8'); const m = s.match(new RegExp(EMAILJS_RE, 'g')); return m && m.length === 1 && /https:\/\/cdn\.jsdelivr\.net\/npm\/@emailjs\/browser/.test(m[0]) && !/https?:\/\//g.test(m[0].replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@emailjs\/browser[^'"]*/, '')); });
t('offline', 'בלוק Analytics קיים פעם אחת בדיוק, טוען רק מ-www.googletagmanager.com, ולא נטען בלי מזהה-מדידה תקין', () => { const s = fs.readFileSync(path.join(root, 'app.js'), 'utf8'); const m = s.match(new RegExp(ANALYTICS_RE, 'g')); return m && m.length === 1 && !/https?:\/\//.test(m[0].replace(/https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/, '')) && /if \(!\/\^G-\[A-Z0-9\]\+\$\/\.test\(GA_MEASUREMENT_ID\)\) return;/.test(m[0]); });
t('offline', 'כל קובצי ה-runtime קיימים', () => [...runtime, 'generated/corpus.bundle.js'].every(f => fs.existsSync(path.join(root, f))));
t('offline', 'index.html טוען רק קבצים מקומיים (ה-script של EmailJS נטען דינמית מ-app.js, לא כ-tag קבוע ב-HTML)', () => [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)].every(m => !/^[a-z]+:|^\/\//i.test(m[1]) && fs.existsSync(path.join(root, m[1]))));

console.log('\n' + Object.entries(grp).map(([g, v]) => `${g}: ${v.p} passed, ${v.f} failed`).join('\n') + `\n\nTOTAL: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
