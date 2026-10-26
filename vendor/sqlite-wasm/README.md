# SQLite WASM 3.50.4

מקור: https://sqlite.org/wasm (חבילת npm `@sqlite.org/sqlite-wasm@3.50.4-build1`, הקבצים `sqlite-wasm/jswasm/sqlite3.js` ו-`sqlite3.wasm`, בלי שינוי). רישיון: נחלת הכלל (Public Domain).
משמש את `sqmem.js`: SharedWorker שמחזיק מסד חיפוש שלם בזיכרון (`sqlite3_deserialize`). נבחר במקום sql.js כי sql.js הרגיל נבנה בלי FTS5, ו-sql.js-httpvfs יודע לקרוא רק ברשת.
