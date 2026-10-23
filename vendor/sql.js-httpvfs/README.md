# sql.js-httpvfs 0.8.12

מקור: https://github.com/phiresky/sql.js-httpvfs (חבילת npm `sql.js-httpvfs@0.8.12`, תיקיית `dist/`), רישיון Apache-2.0 (ראו `LICENSE`).
משמש את חיפוש SQLite בתנ״ך (reader.js, sqlite-search.js): קריאת מסד SQLite מהשרת בטווחים (HTTP Range), בתוך Worker.

שינויים מהמקור:
- `sqlite.worker.js`: ההגדרה `maxReadSpeed` מועברת מה-config אל הקובץ העצל (`maxReadSpeed:e.maxReadSpeed`). במקור היא תמיד 5MB, ואז קריאה רציפה מנפחת כל בקשה עד 5MB.
- הוסרו שורות `sourceMappingURL` (קובצי ה-map לא נכללו).
- `index.js`: `createDbWorker` מחזיר גם את ה-Worker עצמו (`raw`), כדי שאפשר יהיה לסגור אותו (`terminate`) ולשחרר את הזיכרון שלו.
