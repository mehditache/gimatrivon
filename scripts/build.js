#!/usr/bin/env node
/* build.js — preprocessing: data/ → generated/corpus.bundle.js (+ manifest, report) → dist/ → gimatrivon-<גרסה>.zip (ללא תלות ב-Node אצל המשתמש הסופי).
   ⚠️ אזהרה (2026-10-11): סקריפט זה בונה bundle מ-data/Tanakh + data/Mishnah **בלבד** — הוא אינו מכיר את רש״י/
   אונקלוס/תרגום יונתן/ברטנורא/מילון עברי שנוספו מאז בנפרד (דרך build-sources.py / עריכה ידנית של generated/
   corpus.bundle.js). הרצתו תדרוס ותאבד את כל התוכן הנוסף הזה מה-bundle הקיים! לפני הרצה — יש לוודא גיבוי של
   generated/corpus.bundle.js הנוכחי, או לעדכן את הסקריפט שישלב את המקורות הנוספים לפני השימוש בו. */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process'), { loadCorpus } = require('./validate-corpus');
const root = path.join(__dirname, '..'), { books, units, checks } = loadCorpus(root);
const VERSION = (fs.readFileSync(path.join(root, 'app.js'), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1] || '0.0.0';
const PKG_NAME = 'gimatrivon-' + VERSION;
if (!checks.every(c => c.ok)) { console.error('validation failed'); process.exit(1); }
const stats = { tanakh: units.filter(u => u.c === 'tanakh').length, mishnah: units.filter(u => u.c === 'mishnah').length };
const report = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'corpus-validation-report.json')));
const bundle = { books: books.map(b => ({ heTitle: b.heTitle, title: b.title, seder: b.seder, category: b.category, chapters: b.chapters, segments: b.segments, hebrewLetters: b.hebrewLetters, status: b.status })), units: units.map(u => [u.c === 'mishnah' ? 1 : 0, u.b, u.ch, u.n, u.t]), stats, report: { checks: report.checks, flagged: report.flagged } };
fs.writeFileSync(path.join(root, 'generated', 'corpus.bundle.js'), 'window.CORPUS_BUNDLE=' + JSON.stringify(bundle) + ';');
const dist = path.join(root, 'dist', PKG_NAME); fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true }); fs.mkdirSync(path.join(dist, 'generated'), { recursive: true });
for (const f of ['index.html', 'styles.css', 'app.js', 'engine.js', 'README.md']) fs.copyFileSync(path.join(root, f), path.join(dist, f));
for (const f of ['corpus.bundle.js', 'corpus-manifest.json', 'corpus-validation-report.json']) fs.copyFileSync(path.join(root, 'generated', f), path.join(dist, 'generated', f));
fs.cpSync(path.join(root, 'tests'), path.join(dist, 'tests'), { recursive: true });
const zip = path.join(root, PKG_NAME + '.zip'); fs.rmSync(zip, { force: true }); execSync('zip -qr "' + zip + '" ' + PKG_NAME, { cwd: path.join(root, 'dist') });
console.log('bundle KB:', Math.round(fs.statSync(path.join(dist, 'generated', 'corpus.bundle.js')).size / 1024), '| zip KB:', Math.round(fs.statSync(zip).size / 1024));
