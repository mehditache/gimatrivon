#!/usr/bin/env node
/* validate-corpus.js — סורק את 102 קובצי ה-JSON ב-data/, מנקה סימון (HTML) לצורך גימטריה בלבד, ומפיק corpus-manifest.json ו-corpus-validation-report.json.
   קובצי המקור אינם משתנים. שימוש: node scripts/validate-corpus.js */
const fs = require('fs'), path = require('path');
const TANAKH = 'Genesis,Exodus,Leviticus,Numbers,Deuteronomy,Joshua,Judges,I Samuel,II Samuel,I Kings,II Kings,Isaiah,Jeremiah,Ezekiel,Hosea,Joel,Amos,Obadiah,Jonah,Micah,Nahum,Habakkuk,Zephaniah,Haggai,Zechariah,Malachi,Psalms,Proverbs,Job,Song of Songs,Ruth,Lamentations,Ecclesiastes,Esther,Daniel,Ezra,Nehemiah,I Chronicles,II Chronicles'.split(',');
const SEDERS = ['Seder Zeraim','Seder Moed','Seder Nashim','Seder Nezikin','Seder Kodashim','Seder Tahorot'];
const HE_FALLBACK = { 'Pirkei Avot': 'פרקי אבות' }; // heTitle חסר בקובץ המקור — מטא-דאטה בלבד, לא טקסט הקורפוס
const ENT = { nbsp: ' ', thinsp: ' ', ensp: ' ', emsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"' };

function cleanMarkup(s) { // מסיר הערות שוליים, סימני פרשיות {פ}{ס}׆, קרי (נשאר כתיב), תגיות ו-entities. אינו נוגע בטקסט המקור בדיסק.
  return s.replace(/<sup class="footnote-marker">.*?<\/sup>/g, '').replace(/<i class="footnote">.*?<\/i>/g, '')
    .replace(/<span class="mam-spi-[a-z]+">.*?<\/span>/g, ' ').replace(/<span class="mam-kq-q">.*?<\/span>/g, '')
    .replace(/<[^>]*>/g, '').replace(/&#?(\w+);/g, (m, n) => ENT[n] !== undefined ? ENT[n] : ' ').replace(/\s+/g, ' ').trim();
}
const heb = s => (s.match(/[א-ת]/g) || []).length;
const readJson = f => JSON.parse(fs.readFileSync(f).toString('utf8').replace(/^﻿/, ''));
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }

function loadCorpus(root) {
  const files = walk(path.join(root, 'data')).filter(f => /\.json$/i.test(f)), books = [], raw = [], checks = [];
  const chk = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/'), cat = rel.split('/')[1];
    const e = { file: rel, category: cat === 'Tanakh' ? 'תנ״ך' : 'משנה', status: 'ok', warnings: [], hebrewLetters: 0, latinAfterClean: 0 };
    let d; try { d = readJson(f); } catch (x) { e.status = 'error'; e.warnings.push('JSON לא תקין: ' + x.message); e.jsonBad = true; books.push(e); raw.push([]); continue; }
    e.bom = fs.readFileSync(f).slice(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])); if (e.bom) e.warnings.push('קובץ עם BOM (נקרא כהלכה, המקור לא שונה)');
    e.title = d.title; e.heTitle = d.heTitle || HE_FALLBACK[d.title] || d.title; if (!d.heTitle) e.warnings.push('heTitle חסר בקובץ המקור');
    e.seder = cat === 'Mishnah' ? d.categories[1] : (d.categories[1] || ''); e.categories = d.categories; e.sectionNames = d.sectionNames;
    e.order = cat === 'Tanakh' ? TANAKH.indexOf(d.title) : SEDERS.indexOf(e.seder) * 100;
    const t = d.text; e.textStructure = 'text[chapter][' + (cat === 'Tanakh' ? 'verse' : 'mishnah') + '] (מערך דו-ממדי של מחרוזות)';
    if (d.error) { e.status = 'error'; e.warnings.push('שדה error: ' + d.error); }
    const u = [];
    if (!Array.isArray(t) || !t.every(Array.isArray)) { e.status = 'error'; e.warnings.push('text אינו מערך דו-ממדי'); books.push(e); raw.push(u); continue; }
    e.chapters = t.length; e.segments = 0; e.characters = 0; e.noHebrewUnits = []; e.coarseUnits = [];
    t.forEach((ch, ci) => ch.forEach((rw, vi) => {
      const c = cleanMarkup(rw); e.segments++; e.characters += rw.length; const h = heb(c); e.hebrewLetters += h;
      if (/[A-Za-z]/.test(c)) e.latinAfterClean++;
      if (!h) e.noHebrewUnits.push(`${ci + 1}:${vi + 1}`); else u.push({ c: cat === 'Tanakh' ? 'tanakh' : 'mishnah', ch: ci + 1, n: vi + 1, t: c });
      if (cat === 'Mishnah' && (h > 2500 || (ch.length === 1 && h > 600))) e.coarseUnits.push(`${ci + 1}:${vi + 1}`);
    }));
    if (e.noHebrewUnits.length) e.warnings.push('יחידות ללא אותיות עבריות (לא נכללות בחיפוש): ' + e.noHebrewUnits.join(', '));
    if (e.coarseUnits.length) e.warnings.push('יחידות גדולות שחשודות כמאוחדות מכמה משניות בקובץ המקור: ' + e.coarseUnits.join(', '));
    if (!e.hebrewLetters) { e.status = 'error'; e.warnings.push('אין טקסט עברי'); }
    if (e.latinAfterClean) { e.status = 'error'; e.warnings.push('אותיות לטיניות (תרגום?) לאחר ניקוי'); }
    if (d.categories[0] !== (cat === 'Tanakh' ? 'Tanakh' : 'Mishnah')) { e.status = 'error'; e.warnings.push('קטגוריה לא צפויה: ' + d.categories.join('/')); }
    if (e.status === 'ok' && e.warnings.some(w => !/BOM|heTitle/.test(w))) e.status = 'warning';
    books.push(e); raw.push(u);
  }
  const order = books.map((b, i) => i).sort((x, y) => { const a = books[x], b = books[y]; return (a.category === b.category ? 0 : a.category === 'תנ״ך' ? -1 : 1) || (a.order - b.order) || String(a.file).localeCompare(b.file); });
  const sorted = order.map(i => books[i]), units = [];
  order.forEach((oi, bi) => raw[oi].forEach(u => { u.b = bi; units.push(u); }));
  const tan = sorted.filter(b => b.category === 'תנ״ך'), mis = sorted.filter(b => b.category === 'משנה');
  chk('39 ספרי תנ״ך', tan.length === 39, tan.length); chk('63 מסכתות משנה', mis.length === 63, mis.length); chk('102 קבצים', files.length === 102, files.length);
  chk('כל ה-JSON תקין', !sorted.some(b => b.jsonBad)); chk('אין שדה error', !sorted.some(b => b.warnings.some(w => w.startsWith('שדה error'))));
  chk('text קיים ועברי בכל קובץ', sorted.every(b => b.hebrewLetters > 0)); chk('אין תרגום/טקסט לטיני (לאחר ניקוי סימון)', sorted.every(b => !b.latinAfterClean));
  chk('קטגוריות: רק Tanakh ו-Mishnah', sorted.every(b => b.categories && /^(Tanakh|Mishnah)$/.test(b.categories[0])));
  chk('אין קבצי תלמוד/מדרש/פירוש/תרגום', !sorted.some(b => /Talmud|Bavli|Yerushalmi|Midrash|Commentary|Targum/i.test((b.categories || []).join('/'))));
  chk('39 שמות התנ״ך תואמים לרשימה הקנונית', TANAKH.every(t => tan.some(b => b.title === t)));
  chk('מבנה text[פרק][יחידה] נשמר — יחידה = פסוק/משנה', sorted.every(b => b.chapters > 0), 'חלונות החיפוש מוגבלים ליחידה');
  return { books: sorted, units, checks };
}
if (require.main === module) {
  const root = path.join(__dirname, '..'), { books, units, checks } = loadCorpus(root), out = path.join(root, 'generated'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'corpus-manifest.json'), JSON.stringify(books.map(b => ({ file: b.file, title: b.title, heTitle: b.heTitle, category: b.category, seder: b.seder, order: b.order, chapters: b.chapters, segments: b.segments, characters: b.characters, hebrewLetters: b.hebrewLetters, textStructure: b.textStructure, status: b.status })), null, 1));
  const report = { totals: { tanakhBooks: books.filter(b => b.category === 'תנ״ך').length, mishnahTractates: books.filter(b => b.category === 'משנה').length, files: books.length, searchableUnits: units.length, tanakhVerseUnits: units.filter(u => u.c === 'tanakh').length, mishnahUnits: units.filter(u => u.c === 'mishnah').length }, checks, allPassed: checks.every(c => c.ok) && !books.some(b => b.status === 'error'), flagged: books.filter(b => b.warnings.length).map(b => ({ file: b.file, status: b.status, warnings: b.warnings })) };
  fs.writeFileSync(path.join(out, 'corpus-validation-report.json'), JSON.stringify(report, null, 1));
  checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.detail !== undefined ? ' — ' + c.detail : '')));
  console.log('\n' + JSON.stringify(report.totals) + ' | קבצים עם הערות: ' + report.flagged.length + ' | allPassed=' + report.allPassed);
  report.flagged.forEach(f => console.log(' *', f.file.split('/').pop(), f.status, '::', f.warnings.join(' | ').slice(0, 170)));
  process.exit(report.allPassed ? 0 : 1);
}
module.exports = { loadCorpus, cleanMarkup };
