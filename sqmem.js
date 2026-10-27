/* sqmem.js — מסד חיפוש שלם בזיכרון, אחד לכל תחום, משותף לכל החלונות והטאבים (v4.6.0).
   SharedWorker בשם "gimsq-<תחום>": הדפדפן מחזיק מופע אחד לכל שם, וכל דף / iframe באותו מוצא מתחבר אליו (sqpool.js).
   בפעם הראשונה המסד יורד דחוס (<תחום>.sqlite3.gz.000…, נבנה ב-scripts/build-sqlite.js), נפרס ישר לזיכרון של SQLite WASM ונשמר
   ב-OPFS לפי ה-hash שלו; בביקור הבא הוא נקרא מ-OPFS בלי רשת. עד שהוא מוכן, ובכל כשל, sqpool.js ממשיך בקריאת טווחים (Range).
   הורדה אחת בכל פעם (Web Lock), לפי סדר הבקשות: התחומים הקטנים מתבקשים ראשונים.
   הודעות: {t:'open', meta} → {t:'state', state: 'cached'|'fetch'|'ready'|'fail'|'gone', err}; {t:'q', id, sql, args, pack} → {id, r} / {id, p} (pack) או {id, e}; בזמן טעינה {t:'prog', k, n}.
   אחרי IDLE (5 דקות, v4.6.39) בלי שאילתות ה-Worker נסגר (זיכרון WASM לא מתכווץ, ורק סגירה משחררת אותו), אחרי הודעת 'gone' ללקוחות. */
'use strict';
const NAME = self.name.replace(/^gimsq-/, ''), IDLE = 5 * 60000, ports = new Set();
let meta = null, db = null, S3 = null, loading = null, state = '', err = '', last = Date.now();
const abs = p => new URL(p, self.location.href).href;
const send = (m, p) => (p ? [p] : ports).forEach(x => { try { x.postMessage(m); } catch (e) {} });
const setState = (s, e) => { state = s; if (e) err = String(e && e.message || e).slice(0, 160); send({ t: 'state', state, err }); };

self.onconnect = ev => {
  const port = ev.ports[0]; ports.add(port);
  port.onmessage = e => {
    const m = e.data || {}; last = Date.now();
    if (m.t === 'open') {
      if (!meta) meta = m.meta;
      if (state) send({ t: 'state', state, err }, port);
      if (!loading) loading = load().then(() => setState('ready'), e => { setState('fail', e); try { console.warn('[sqmem] ' + NAME + ':', e); } catch (x) {} });
    } else if (m.t === 'q') {
      if (!db) return port.postMessage({ id: m.id, e: 'not ready' });
      try {
        if (m.pack) { const o = pack(m.sql, m.args); port.postMessage({ id: m.id, p: o }, [o.doc.buffer, o.col.buffer, o.off.buffer]); }
        else port.postMessage({ id: m.id, r: db.exec({ sql: m.sql, bind: m.args && m.args.length ? m.args : undefined, rowMode: 'array', returnValue: 'resultRows' }) });
      }
      catch (x) { port.postMessage({ id: m.id, e: String(x && x.message || x) }); }
    } else if (m.t === 'close') ports.delete(port);
  };
  port.start();
};

/* רשימת מופעים של מילה (SELECT doc, col, offset …) כמערכים טיפוסיים, ממוינת לפי doc ואז offset — הצורה ש-toOcc ב-sqlite-search.js מחזיר.
   כך היא עוברת לדף בלי העתקה (transfer), במקום מאות אלפי מערכים קטנים במילה נפוצה כמו ״אמר״ בגמרא */
function pack(sql, args) {
  const st = db.prepare(sql); let n = 0, cap = 4096, d = new Float64Array(cap), c = new Uint8Array(cap), f = new Uint16Array(cap);
  try {
    if (args && args.length) st.bind(args);
    while (st.step()) {
      if (n === cap) { cap *= 2; const d2 = new Float64Array(cap), c2 = new Uint8Array(cap), f2 = new Uint16Array(cap); d2.set(d); c2.set(c); f2.set(f); d = d2; c = c2; f = f2; }
      d[n] = st.get(0); c[n] = st.get(1); f[n] = st.get(2); n++;
    }
  } finally { st.finalize(); }
  let sorted = true; for (let i = 1; i < n; i++) if (d[i - 1] > d[i] || (d[i - 1] === d[i] && f[i - 1] > f[i])) { sorted = false; break; }
  if (sorted) return { doc: d.slice(0, n), col: c.slice(0, n), off: f.slice(0, n), n };
  const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i;
  ix.sort((x, y) => d[x] - d[y] || f[x] - f[y]);
  const doc = new Float64Array(n), col = new Uint8Array(n), off = new Uint16Array(n);
  for (let i = 0; i < n; i++) { const k = ix[i]; doc[i] = d[k]; col[i] = c[k]; off[i] = f[k]; }
  return { doc, col, off, n };
}

async function load() {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('gimsq', { create: true });
  const fname = NAME + '.' + meta.hash + '.sqlite3';
  let file = null;
  try { file = await (await dir.getFileHandle(fname)).getFile(); if (file.size !== meta.bytes) file = null; } catch (e) {}
  setState(file ? 'cached' : 'fetch'); // קודם המצב (sqpool.js מחליט לפיו אם לפתוח מאגר טווחים), ורק אז SQLite
  importScripts(abs('vendor/sqlite-wasm/sqlite3.js'));
  self.sqlite3InitModuleState.sqlite3Dir = abs('vendor/sqlite-wasm/'); // sqlite3.js מחפש את ה-wasm ליד הסקריפט של הדף, ובתוך Worker זה השורש
  S3 = await self.sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const n = meta.bytes, p = S3.wasm.alloc(n); // המסד נכתב ישר לזיכרון של SQLite: בלי עותק נוסף בזמן הטעינה
  let ok = false;
  try {
    const put = async rs => { // זרם → הזיכרון (את heap8u קוראים שוב בכל חתיכה: ה-heap יכול לגדול ולהתחלף)
      const rd = rs.getReader(); let k = 0;
      let pk = 0; // התקדמות (לתצוגת מצב פיתוח): כל 4MB
      for (;;) { const { done, value } = await rd.read(); if (done) break; if (k + value.length > n) throw new Error('size'); S3.wasm.heap8u().set(value, p + k); k += value.length; if (k - pk >= 4 << 20) { pk = k; send({ t: 'prog', k, n }); } }
      if (k !== n) throw new Error('size ' + k + '/' + n);
    };
    if (file) await put(file.stream());
    else {
      if (!('createWritable' in FileSystemFileHandle.prototype)) throw new Error('no OPFS write');
      const est = await navigator.storage.estimate(); if (est.quota && est.quota - est.usage < n * 1.2) throw new Error('no space');
      const dl = async () => {
        const gz = meta.gz, parts = gz ? gz.parts : meta.parts, url = i => abs(meta.file + (gz ? '.gz.' : '.') + String(i).padStart(3, '0') + '?v=' + meta.hash);
        let i = 0; // כל החלקים ברצף אחד (ה-gzip נחתך באמצע), ואז פריסה
        const all = new ReadableStream({ async pull(c) {
          if (i >= parts) return c.close();
          const r = await fetch(url(i++)); if (!r.ok) throw new Error('HTTP ' + r.status);
          const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; c.enqueue(value); }
        } });
        await put(gz ? all.pipeThrough(new DecompressionStream('gzip')) : all);
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-1', S3.wasm.heap8u().subarray(p, p + n)))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
        if (h !== meta.hash) throw new Error('hash');
        const w = await (await dir.getFileHandle(fname, { create: true })).createWritable();
        await w.write(S3.wasm.heap8u().subarray(p, p + n)); await w.close();
        for await (const k of dir.keys()) if (k.startsWith(NAME + '.') && k !== fname) dir.removeEntry(k).catch(() => {}); // גרסאות קודמות
      };
      if (navigator.locks) await navigator.locks.request('gimsq-dl', dl); else await dl();
    }
    const D = new S3.oo1.DB(), C = S3.capi;
    D.checkRc(C.sqlite3_deserialize(D.pointer, 'main', p, n, n, C.SQLITE_DESERIALIZE_FREEONCLOSE | C.SQLITE_DESERIALIZE_READONLY));
    ok = true; db = D;
  } finally { if (!ok) S3.wasm.dealloc(p); }
}

setInterval(() => {
  if (db && Date.now() - last > IDLE) { setState('gone'); try { db.close(); } catch (e) {} db = null; self.close(); }
}, 60000);
