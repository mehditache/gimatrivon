# מדריך למפתח: הקמת סביבה, Git והרצה לוקלית

המסמך מסביר איך מתחילים לעבוד על גימטריבון: מה צריך להתקין, איך משכפלים את הריפו, איך מריצים את האפליקציה במחשב, איך עובדים עם ענפים ו-PR, איך מעדכנים גרסה, איך בונים מחדש נתונים ואיך מריצים בדיקות.
על מבנה הקוד עצמו ראו [ארכיטקטורה](architecture.md).

> המסמך נכון לגרסה v4.17.3 (2026-11-02). כל הפקודות כאן נבדקו מול הקבצים בריפו.

---

## 1. מה זה הפרויקט, בקצרה

- אתר סטטי לגמרי: HTML, CSS ו-JavaScript רגיל (Vanilla JS), בלי framework, בלי `package.json`, בלי npm ובלי שלב build לקוד.
- כל הטקסטים (תנ״ך, משנה, רמב״ם, ש״ס, טור, שולחן ערוך, זוהר ועוד) כבר מעובדים ושמורים בריפו בתיקייה `generated/` (כ-1.1GB). מפתח רגיל לא צריך לבנות אותם מחדש.
- האתר מתפרסם ב-GitHub Pages ישירות מהענף שנבחר בהגדרות (אין GitHub Actions משלנו, יש `.nojekyll`).
- קוד האפליקציה קנייני (ראו `LICENSE`), והטקסטים ברישיונות נפרדים (ראו `ATTRIBUTION.md`). לפני הוספת מקור חדש חובה לבדוק את הרישיון שלו ולתעד אותו שם.

---

## 2. דרישות

| כלי | גרסה | למה צריך |
|---|---|---|
| Git | כל גרסה עדכנית | שכפול, ענפים, PR |
| Node.js | **22.5 ומעלה** (נבדק על 22.23) | `serve.js`, בדיקות, `scripts/build-sqlite.js`. הבדיקות והבנייה של SQLite משתמשות ב-`node:sqlite`, שקיים רק מ-22.5 |
| דפדפן Chromium (Chrome / Edge) | עדכני | הרצה ובדיקה ידנית. האפליקציה משתמשת ב-SharedWorker, OPFS ו-DecompressionStream |
| Playwright (לא חובה) | כל גרסה עדכנית | רק לבדיקות הדפדפן (`*.e2e.js`). בלעדיו הן מדפיסות "לא מותקן — מדלג" ויוצאות בהצלחה |
| Python 3 (לא חובה) | גרסה 3 עדכנית | רק לסקריפטים שבונים נתונים מיצוא ספריא (`scripts/build-*.py`) |

התקנת Playwright (פעם אחת, מחוץ לריפו או בתוכו; `node_modules` לא נכנס ל-Git כי אין `package.json`):

```bash
npm i -D playwright        # או: npm i -g playwright
npx playwright install chromium
```

הבדיקות מחפשות את Playwright גם בנתיבים `/opt/node-tools/node_modules/playwright` ו-`/opt/node22/lib/node_modules/playwright` (סביבות הענן).

---

## 3. שכפול הריפו

```bash
git clone https://github.com/mehditache/gimatrivon.git
cd gimatrivon
```

שימו לב לגודל: היסטוריית Git שוקלת כ-540MB, ותיקיית העבודה כ-1.1GB (רובה `generated/`). השכפול הראשון לוקח זמן. אם צריך רק את המצב הנוכחי:

```bash
git clone --depth 1 https://github.com/mehditache/gimatrivon.git
```

אין Git LFS. קבצים גדולים מחולקים לחלקים של עד 32MB (GitHub מגביל קובץ בודד ל-100MB, ו-GitHub Pages חותך בשקט קבצים גדולים מדי).

בווינדוס: אפשר לעבוד מכל תיקייה (למשל `C:\projs\gimatrivon-git`). כדאי `git config core.autocrlf false` כדי ש-Git לא ישנה סופי שורות בקבצים הענקיים שב-`generated/`.

---

## 4. הרצה מקומית

### 4.1 הדרך המומלצת: `node serve.js`

החיפוש (SQLite) קורא את מסדי הנתונים בטווחים (HTTP Range), וחלונות שולחן העבודה צריכים מוצא (origin) אמיתי של http. לכן מריצים שרת מקומי שתומך ב-Range.

הקובץ `serve.js` **לא נמצא בריפו**: הוא ברשימת `.gitignore`. עותק שלו נמצא בקבצי הפרויקט (`local-dev/serve.js`). אם אין לכם אותו, צרו `serve.js` בשורש הריפו עם התוכן הזה:

```js
// שרת מקומי לגימטריבון עם תמיכה ב-Range (נדרש לחיפוש SQLite). הרצה מתיקיית הפרויקט: node serve.js [פורט]
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.cwd(), PORT = +(process.argv[2] || 8000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
http.createServer((q, s) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const size = fs.statSync(f).size, ty = TYPES[path.extname(f)] || 'application/octet-stream', m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
  if (m) { const a = +m[1], b = Math.min(m[2] ? +m[2] : size - 1, size - 1);
    s.writeHead(206, { 'Content-Type': ty, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(f, { start: a, end: b }).pipe(s); }
  s.writeHead(200, { 'Content-Type': ty, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(s);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
```

הרצה מתוך תיקיית הריפו:

```bash
node serve.js          # פורט 8000
node serve.js 8080     # פורט אחר
```

ואז פותחים בדפדפן:

| כתובת | מה נפתח |
|---|---|
| `http://localhost:8000/` | `index.html`. במחשב (מסך רחב מ-1000px ובלי מסך מגע) מפנה מיד ל-`desktop.html` |
| `http://localhost:8000/desktop.html` | שולחן העבודה עם החלונות (הממשק הראשי) |
| `http://localhost:8000/desktop.html#read/TN/Gen/1/5` | שולחן העבודה עם חלון קריאה בבראשית א ה |
| `http://localhost:8000/index.html#phone` | ממשק הטלפון במחשב (לבדיקה) |
| `http://localhost:8000/index.html?embed=read#read/TB/Ber/2b` | תוכן של חלון קריאה בודד, בלי שולחן העבודה (כך הבדיקות האוטומטיות טוענות אותו) |
| `http://localhost:8000/index.html?embed=gem` | תוכן חלון הגימטריה בלבד |

`python -m http.server` עובד לתצוגה, אבל **לא** תומך ב-Range, ולכן החיפוש ב-SQLite ייפול לחיפוש הישן (או לא יעבוד בתחומים שאין להם חיפוש ישן). לעבודה על החיפוש השתמשו ב-`serve.js`.

### 4.2 פתיחה ישירה של הקובץ (`file://`)

לחיצה כפולה על `index.html` עדיין טוענת את המסכים, כי כל קובצי הנתונים הם `<script>` ולא `fetch`. אבל ב-`file://` אין חיפוש SQLite, אין Service Worker ואין SharedWorker/OPFS, ושולחן העבודה (iframes שפונים ל-`parent`) לא נתמך באופן מלא. זה טוב לבדיקה מהירה של מסך, לא לפיתוח.

### 4.3 מה שמור בדפדפן (ואיך מאפסים)

האפליקציה שומרת מצב ב-`localStorage`. כשמשהו "נתקע" אחרי שינוי, מנקים את מה שרלוונטי (DevTools → Application → Local Storage) או מריצים בקונסול `localStorage.clear()`.

| מפתח | תוכן |
|---|---|
| `gimatrivonDesk` | מצב שולחן העבודה: חלונות, מיקומים, היסטוריה לכל חלון |
| `gimatrivonMarks` | סימניות |
| `gimatrivonReader` | הגדרות מסך הקריאה (תצוגה, מפרשים, גודל אותיות) |
| `gimatrivonMode` | גימטריה / קריאה (במסך הישן ובטלפון) |
| `gimatrivonTheme`, `gimatrivonLang` | מראה כהה, עברית/אנגלית |
| `gimatrivonDev` | `'1'` = מצב פיתוח פעיל |
| `gimSqMem` | `'0'` = לבטל את מסד החיפוש בזיכרון (sqmem) ולעבוד רק בקריאת טווחים |
| `gimSqRcs` | כמה עמודי מסד לכל בקשת Range (ברירת מחדל 4) |

בנוסף, מסדי החיפוש נשמרים ב-OPFS (Application → Storage), וה-Service Worker שומר את קובצי הספרים ב-Cache Storage. ה-Service Worker **לא נרשם ב-localhost**, כך שבפיתוח מקומי אין בעיית מטמון ישן ממנו.

### 4.4 מצב פיתוח ושם הענף בבנר

- 5 לחיצות רצופות (תוך 3 שניות) על מספר הגרסה בבנר מפעילות או מכבות מצב פיתוח (`gimatrivonDev`).
- במצב פיתוח מוצג ליד הגרסה שם הענף: "מקומי" ב-localhost או `file://`, ובאתר `*.github.io` שם הענף שממנו GitHub Pages פורס כרגע (נשאל מ-`api.github.com`, נשמר ל-10 דקות). הקוד נמצא בבלוק `BUILDINFO` ב-`app.js`.
- במצב פיתוח מופיעה גם טבלה קטנה בפינה (מ-`desktop.js`) שמראה לכל תחום חיפוש אם הוא עונה מהזיכרון, בהורדה או מהשרת, וכמה בקשות Range נשלחו.
- 5 לחיצות מהירות על הלוגו בבנר עוברות לממשק הטלפון (`index.html#phone`). חוזרים עם `#desktop`.

---

## 5. Git: ענפים, PR ומיזוג

### 5.1 הענפים

- `main` הוא הענף הראשי. כל העבודה מתמזגת אליו.
- כל שינוי נעשה בענף נפרד ונכנס ל-`main` דרך Pull Request. ענפים של סשנים של Claude נקראים `claude/project-thread-<מזהה>`; מפתח אנושי יכול לקרוא לענף בכל שם תיאורי (למשל `fix/search-dropdown`).
- ענפים היסטוריים כמו `windows` ו-`search-sqlite` כבר מוזגו. לא ממשיכים לעבוד עליהם.

### 5.2 זרימת עבודה לשינוי

```bash
git checkout main
git pull origin main
git checkout -b fix/my-change

# ... עריכה ...
# עדכון גרסה (סעיף 6) + רשומה ב-CHANGELOG.md

node tests/run-tests.js          # הבדיקות המהירות; ועוד בדיקות רלוונטיות בלבד (סעיף 8)
git add -A
git commit -m "תיקון: ... (v4.17.4)"
git push -u origin fix/my-change
```

ואז פותחים PR ל-`main` ב-GitHub.

### 5.3 כללי המיזוג

- **מיזוג ל-`main` נעשה רק כשבעל הפרויקט (M) כותב "מזג".** לא ממזגים לבד, גם אם הבדיקות עוברות.
- שינויים בממשק מציגים קודם בצילומי מסך (או mockup) ומחכים לאישור, ושינוי גדול שואלים לפני שמתחילים. צילומי מסך מצלמים בשולחן העבודה (`desktop.html`), לא בממשק הישן.
- אם הענף כבר מוזג ב-PR, עבודה נוספת מתחילה מחדש מ-`main` העדכני ב-PR חדש, ולא נערמת על הענף הממוזג.
- כמה אנשים או סשנים עשויים לדחוף ל-`main` במקביל, והתנגשויות נפוצות ב-`app.js`, `desktop.html` ו-`CHANGELOG.md` (בגלל מספר הגרסה). לפני PR: `git fetch origin main && git rebase origin/main`, ולתקן את מספר הגרסה אם מישהו אחר כבר תפס אותו.
- הודעות commit כתובות בעברית ומסתיימות במספר הגרסה בסוגריים, למשל `תיקון: אין סרגל גלילה בתוך הספר (v4.17.3)`.

### 5.4 פריסה ל-GitHub Pages

- האתר נבנה אוטומטית ע״י GitHub ("pages-build-deployment") מהענף שנבחר ב-**Settings → Pages → Build and deployment → Branch**, מתיקיית השורש (`/`).
- בדרך כלל זה `main`. לפעמים מעבירים זמנית ל-Pages ענף אחר כדי לבדוק אותו באתר אמיתי; אחרי המיזוג צריך להחזיר ידנית ל-`main` באותו מסך. מצב פיתוח (סעיף 4.4) מראה מאיזה ענף האתר מוגש כרגע, כך שקל לוודא.
- הפריסה לוקחת כמה דקות אחרי ה-push. אם האתר נראה ישן: רענון קשיח (Ctrl+Shift+R), כי ה-Service Worker מגיש קבצים מהמטמון כשאין רשת, ומסדי החיפוש ב-OPFS מתחלפים רק כשה-hash שלהם משתנה.

---

## 6. מספר גרסה (חובה בכל שינוי)

כל שינוי, גם קטן, מקבל גרסה חדשה. המספר נמצא בכמה מקומות, וצריך לעדכן את כולם יחד:

1. `app.js`, שורה 3: `const VERSION = '4.17.3';`
2. `desktop.html`: כל ה-`?v=4.17.3` (בשני ה-`<link>` ובשלושת ה-`<script>` של `where-fit.js`, `sqpool.js`, `desktop.js`). הבנר קורא את הגרסה מה-`?v=` של `desktop.js`, וה-`?v=` גם עוקף את מטמון הדפדפן.
3. `CHANGELOG.md`: רשומה חדשה למעלה, `## v4.17.4 — YYYY-MM-DD` ומתחתיה מה השתנה.

הבדיקה `offline` ב-`tests/run-tests.js` נכשלת אם ה-`?v=` ב-`desktop.html` שונים מ-`VERSION`. דרך מהירה לעדכן את שניהם:

```bash
OLD=4.17.3; NEW=4.17.4
sed -i "s/const VERSION = '$OLD'/const VERSION = '$NEW'/" app.js
sed -i "s/?v=$OLD/?v=$NEW/g" desktop.html
```

מוסכמה: תיקון = הספרה האחרונה (4.17.3 → 4.17.4); תכונה חדשה = הספרה האמצעית (4.16.x → 4.17.0); שינוי גדול במבנה = הראשונה (שולחן העבודה היה 4.0.0).

שם הענף **לא** נכתב בקוד כקבוע (גם זו בדיקה ב-`run-tests.js`); הוא נקבע בזמן ריצה.

---

## 7. נתונים: מה נבנה, מאיפה ובאיזה גודל

כל התוצרים כבר בריפו. בונים מחדש רק כשמוסיפים מקור או משנים את מבנה הנתונים או את הנרמול של החיפוש.

### 7.1 מה יש ב-`generated/`

| נתיב | גודל (בערך) | תוכן | נבנה ע״י |
|---|---|---|---|
| `generated/corpus.bundle.js` | 68MB | כל הקורפוס בקובץ אחד (תנ״ך, משנה, רש״י, תרגומים, ברטנורא, מילון, רמב״ם ומפרשיו). משמש את הבדיקות ואת סקריפטי הבנייה | `scripts/build.js` (ראו אזהרה למטה), `build-sources.py`, `build-rambam.py` |
| `generated/corpus/` | 62MB | אותו קורפוס, קובץ לכל ספר עם hash בשם, ו-`index.js` עם רשימת הספרים. זה מה שהאתר טוען בפועל | `node scripts/split-corpus.js` |
| `generated/talmud/` | 58MB | ש״ס: גמרא, רש״י, תוספות, רשב״ם, חלקים לכל מסכת | `build-talmud.py` |
| `generated/talmud-stz/` | 55MB | ביאור שטיינזלץ לש״ס (CC BY-NC) | `build-steinsaltz.py` |
| `generated/aramaic-gloss.js`, `generated/arukh.js` | 0.5MB, 2MB | מילון ארמי-עברי, ספר הערוך | `build-steinsaltz.py` |
| `generated/tur/` | 57MB | טור, בית יוסף, ב״ח | `build-tur.py` |
| `generated/sa/` | 114MB | שולחן ערוך (4 חלקים), משנה ברורה, ביאור הלכה, כף החיים ומפרשים | `build-sa.py` |
| `generated/zohar/` | 43MB | זוהר (ארמית מנוקדת), תרגום, הסולם | `build-zohar.py` |
| `generated/perek-names.js` | 36KB | שמות פרקי הש״ס ← מסכת ודף | `build-perek.py` |
| `generated/sqlite/` | 631MB | מסדי החיפוש, אחד לכל תחום | `node scripts/build-sqlite.js` |
| `generated/corpus-manifest.json`, `corpus-validation-report.json` | קטן | דוחות תקינות | `node scripts/validate-corpus.js` |

מקור האמת לתנ״ך ולמשנה הוא `data/Tanakh` ו-`data/Mishnah` (102 קובצי JSON מספריא). שאר המקורות מגיעים מיצוא הנתונים של ספריא (Sefaria-Export) שמורידים בנפרד.

### 7.2 מסדי החיפוש (SQLite)

לכל תחום שני סוגי קבצים: `<תחום>.sqlite3.000…` (המסד הגולמי בחלקים של 32MB, לקריאת טווחים) ו-`<תחום>.sqlite3.gz.000…` (אותו מסד דחוס, להורדה מלאה לזיכרון ול-OPFS), ועוד `<תחום>.js` עם הגודל וה-hash.

| תחום | גולמי | דחוס |
|---|---|---|
| tanakh | 30MB | 11MB |
| mishnah | 16MB | 6MB |
| rambam | 61MB | 23MB |
| talmud | 140MB | 57MB |
| tur | 132MB | 52MB |
| sa | (אין) | 67MB |
| zohar | (אין) | 30MB |

ל-`sa` ול-`zohar` יש רק קבצים דחוסים (`noRange`), כדי לחסוך מקום באתר. לכן החיפוש בהם עובד רק דרך המסד בזיכרון (sqmem). לבדיקה מקומית של הזוהר בלי OPFS אפשר לבנות גם עותק לטווחים: `SQ_RANGE=1 node scripts/build-sqlite.js zohar`.

```bash
node scripts/build-sqlite.js              # כל התחומים (לוקח זמן ודורש זיכרון)
node scripts/build-sqlite.js talmud tur   # רק תחומים מסוימים
node scripts/build-sqlite.js --gz tanakh  # רק הקבצים הדחוסים, ממסד שכבר בנוי
```

גודל עמוד המסד: 16KB (אפשר לשנות לניסוי עם `SQ_PAGE`). בכל בנייה ה-hash משתנה, וכך הדפדפנים מורידים את המסד החדש.

### 7.3 בניית המקורות (Python)

כל סקריפט מקבל תיקייה עם קובצי JSON מיצוא ספריא, ובראשו כתוב בדיוק אילו קבצים ומאיזו מהדורה. דוגמאות:

```bash
python3 scripts/build-talmud.py   <תיקיית יצוא>
python3 scripts/build-steinsaltz.py <תיקיית יצוא>
python3 scripts/build-tur.py      <תיקיית יצוא>
python3 scripts/build-sa.py       <תיקיית יצוא>
python3 scripts/build-zohar.py    <תיקיית יצוא>
python3 scripts/build-perek.py
python3 scripts/build-sources.py  <go/data> <Onkelos>     # רש״י, אונקלוס, יונתן אל corpus.bundle.js
python3 scripts/build-rambam.py   [תיקיית מטמון]          # מוריד בעצמו; ואחריו:
node scripts/split-corpus.js
```

אחרי שינוי במקור שיש לו חיפוש, בונים מחדש גם את התחום ב-`build-sqlite.js`.

> **אזהרה:** `scripts/build.js` בונה את `corpus.bundle.js` מ-`data/` **בלבד** ולכן מוחק את כל המקורות שנוספו אחר כך (רש״י, תרגומים, רמב״ם…). לא מריצים אותו בלי גיבוי של `generated/corpus.bundle.js`.

---

## 8. בדיקות

אין test runner. כל בדיקה היא קובץ Node שמריצים ישירות, והוא מדפיס ✓ / FAIL ויוצא בקוד שגיאה כשיש כישלון. בדיקות הדפדפן מרימות שרת מקומי משלהן (עם Range) על פורט פנוי, כך שלא צריך להריץ `serve.js` לפניהן.

| פקודה | סוג | מה בודק | זמן / דרישות |
|---|---|---|---|
| `node tests/run-tests.js` | Node | מנוע הגימטריה (נרמול, כל השיטות, השוואה, נוטריקון), חיפוש וגבולות, הקורפוס, ליבת הקורא (ניתוח מראה-מקום), ובדיקת offline: אין כתובות רשת מחוץ לבלוקים המותרים, `?v=` תואם ל-`VERSION`, אין שם ענף קבוע | מהיר. **להריץ לפני כל PR** |
| `node tests/sqlite-search.test.js` | Node + `node:sqlite` | מנוע החיפוש מול מסד התנ״ך: תחביר, ביטוי, תחילית, NOT/OR, NEAR, אותיות שימוש, כתיב חסר ומלא, דירוג | Node 22.5+. כותב עותק מאוחד של המסד לתיקיית ה-temp |
| `node tests/sqlite-books.test.js [תחום…]` | Node + `node:sqlite` | חיפוש בכל התחומים ובכל המקורות; שכל תוצאה מכילה את המילים | Node 22.5+. אפשר להגביל, למשל `node tests/sqlite-books.test.js zohar` |
| `node tests/tour.e2e.js` | Playwright | שני הסיורים המודרכים (גימטריה וקריאה) רצים עד הסוף | |
| `node tests/reader-ui.e2e.js` | Playwright | כל אפשרות בחלון "תצוגה" בכל סוגי הספרים, בדסקטופ ובטלפון | ארוך |
| `node tests/search-sqlite.e2e.js [השהיה ms]` | Playwright | חיפוש SQLite בדפדפן עם השהיית רשת מדומה (ברירת מחדל 40ms), ונפילה לחיפוש הישן כשאין Range | ארוך |
| `node tests/desktop-search-dropdown.e2e.js` | Playwright | הרשימה הנפתחת של החיפוש בבנר (רגרסיה v4.17.2) | |
| `node tests/no-scrollbar.e2e.js` | Playwright | אין סרגל גלילה בתוך הספר, ועמוד השולחן ערוך לא עולה על גדותיו (רגרסיה v4.17.3) | |

כללים:

- **מריצים רק את הבדיקות שקשורות לשינוי.** הסוויטה המלאה ארוכה וצורכת משאבים, ובעל הפרויקט ביקש לחסוך בהרצות. שינוי במסמכים בלבד לא דורש בדיקות. `run-tests.js` מהיר ותמיד כדאי.
- תיקון באג חשוב מלווה בבדיקת רגרסיה קטנה משלו (בסגנון `desktop-search-dropdown.e2e.js` ו-`no-scrollbar.e2e.js`), עם הערה בראש הקובץ שמסבירה מה היא שומרת ובאיזו גרסה.
- **כישלונות ידועים:** ב-`reader-ui.e2e.js` נמדדו בעבר (2026-10-25, במחשב Windows) 78 כישלונות שקיימים גם ב-`main`, כלומר לא נגרמו משינוי מסוים. כשהבדיקה נכשלת, משווים מול `main` לפני שמסיקים שהשינוי שבר משהו.
- הבדיקות מנקות `localStorage` בעצמן ופותחות את החלונות כ-`index.html?embed=…` בדסקטופ, או בהקשר טלפון (`isMobile` + `hasTouch`).

---

## 9. סדר עבודה מומלץ לשינוי ראשון

1. `git pull` ל-`main`, ענף חדש.
2. `node serve.js`, לפתוח `http://localhost:8000/desktop.html`, להפעיל מצב פיתוח (5 לחיצות על הגרסה) ולוודא שכתוב "מקומי".
3. לקרוא את [ארכיטקטורה](architecture.md) ואת ההערה שבראש הקובץ שעומדים לשנות. בפרויקט הזה ההסברים נמצאים בהערות בעברית בתוך הקוד, ליד הקוד עצמו.
4. לשנות, לרענן את הדפדפן (אין build). כשמשנים קובץ שנטען מ-`desktop.html`, לזכור שה-`?v=` שם הוא שמונע מטמון.
5. לעדכן גרסה ו-`CHANGELOG.md` (סעיף 6), להריץ `node tests/run-tests.js` ואת הבדיקות הרלוונטיות.
6. commit, push, PR, צילום מסך אם זה שינוי בממשק, ולחכות ל"מזג".

---

## 10. תקלות נפוצות

| תקלה | סיבה ופתרון |
|---|---|
| החיפוש לא מוצא כלום / "לא נטען" בתחומים | השרת לא תומך ב-Range (למשל `python -m http.server`). להריץ `node serve.js` |
| `node tests/sqlite-*.test.js` נכשל ב-`Cannot find module 'node:sqlite'` | Node ישן מ-22.5. לשדרג |
| בדיקות e2e מדפיסות "Playwright לא מותקן — מדלג" | להתקין Playwright (סעיף 2) |
| בנר מראה גרסה ישנה לרגע | ה-`?v=` ב-`desktop.html` לא עודכן (גם הבדיקה ב-`run-tests.js` תיכשל) |
| שולחן העבודה נפתח במצב מוזר אחרי שינוי | `localStorage.removeItem('gimatrivonDesk')` ורענון |
| החיפוש בשולחן ערוך / זוהר לא עובד מקומית | אין להם קבצים לקריאת טווחים; הם דורשים OPFS ו-SharedWorker (Chrome רגיל, לא חלון גלישה בסתר עם הגבלות) |
| באתר הציבורי רואים גרסה ישנה | לבדוק במצב פיתוח מאיזה ענף Pages מגיש, ולהחליף ב-Settings → Pages |
