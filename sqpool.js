/* sqpool.js — מאגר Workers משותף של SQLite לכל חלונות שולחן העבודה (v4.2.2).
   עד כה כל חלון (מארח החיפוש, חלון תוצאות, כל חלון קריאה) הרים לעצמו מאגר Workers של sql.js-httpvfs, כל אחד עם עותק WASM ועמודי מסד
   בזיכרון. עכשיו המאגר חי בדף השולחן (desktop.html), והחלונות (iframe באותו מוצא) פונים אליו דרך parent.GimSqPool.engine(). מנוע אחד לכל תחום —
   Workers אחד-אחד לכל התחומים, בלי כפילות; חיפוש שכבר חימם את המנוע (הרשימה הנפתחת) מזרז את חלון התוצאות.
   מנוע שלא היה בשימוש IDLE שניות משחרר את ה-Workers, והם נפתחים שוב לבד בבקשה הבאה (ה-engine עצמו נשאר תקף). */
(() => {
  'use strict';
  const G = window, SQ_MAX = 8 << 20, IDLE = 90000, ST = {};
  const abs = p => new URL(p, location.href).href;
  const script = src => new Promise((ok, no) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); });

  function engine(name, books) {
    const st = ST[name] || (ST[name] = { P: null, E: null, pool: [], Q: [], starting: null, last: Date.now(), n: 0 });
    st.last = Date.now();
    if (st.P) return st.P;
    const DM = G.GimSq.DOMAINS[name], TB = DM.tabs;
    let D = null;
    const cfg = i => [{ from: 'inline', config: { serverMode: 'chunked', urlPrefix: abs(D.file) + '.', suffixLength: 3, serverChunkSize: D.chunk, databaseLengthBytes: D.bytes, cacheBust: D.hash + '&w=' + i, requestChunkSize: D.page, maxReadSpeed: D.page * 8 } }];
    const open = async (i, first) => {
      const w = await G.createDbWorker(cfg(i), abs('vendor/sql.js-httpvfs/sqlite.worker.js'), abs('vendor/sql.js-httpvfs/sql-wasm.wasm'));
      const NW = D.bytes > 40 << 20 ? 2 : 3;
      if (first) for (let k = 1; k < NW; k++) open(k).then(x => { st.pool.push(x); pump(); }, () => {});
      const wq = k => 'SELECT count(*) FROM f' + k + '_idx; SELECT max(id) FROM f' + k + '_data; SELECT count(*) FROM v' + k + " WHERE term = 'אאא';", TR = TB.map((_, n) => TB[(n + i) % TB.length]);
      await w.db.exec(wq(TR[0]) + ' SELECT min(id) FROM d; SELECT max(id) FROM d;');
      const s = await w.worker.getStats(); if (s && s.totalFetchedBytes > 6 << 20) throw new Error('no range support'); // שרת בלי Range מחזיר את כל הקובץ
      const x = { w, i, busy: 0, jobs: 0 };
      if (TR.length > 1) { x.busy = 1; w.db.exec(TR.slice(1).map(wq).join(' ')).catch(() => {}).then(() => { x.busy = 0; pump(); }); }
      return x;
    };
    const pump = () => {
      for (const x of st.pool) {
        if (x.busy) continue;
        let j = null;
        while (st.Q.length) { st.Q.sort((a, b) => a.pri - b.pri || a.n - b.n); j = st.Q.shift(); if (!j.alive || j.alive()) break; j.no(new Error('stale')); j = null; }
        if (!j) return;
        x.busy = 1; st.last = Date.now();
        x.w.db.exec(j.sql, j.args).then(r => { x.busy = 0; j.ok(r.length ? r[0].values : []); done(x); }, e => { x.busy = 0; j.no(e); done(x); });
      }
    };
    // כל Worker שומר בזיכרון כל עמוד שקרא. אחרי SQ_MAX בתים הוא מוחלף ב-Worker חדש, כדי שהזיכרון לא יגדל בלי סוף
    const done = x => {
      if (++x.jobs % 16 === 0) x.w.worker.getStats().then(s => {
        if (!s || s.totalFetchedBytes < SQ_MAX || x.old || st.pool.length < 2) return;
        x.old = true; st.pool.splice(st.pool.indexOf(x), 1);
        open(x.i).then(y => { st.pool.push(y); pump(); }, () => {});
        const end = () => x.busy ? setTimeout(end, 200) : x.w.raw && x.w.raw.terminate(); end();
      }, () => {});
      pump();
    };
    // פתיחת המאגר (גם אחרי שחרור סרק): הראשון קודם, כדי שה-WASM יירד פעם אחת ושאר ה-Workers יקבלו אותו מהמטמון
    const start = () => st.starting || (st.starting = open(0, true).then(x => { st.pool.push(x); pump(); }, e => { st.starting = null; throw e; }));
    st.stop = () => { st.pool.splice(0).forEach(x => { x.old = true; x.w.raw && x.w.raw.terminate(); }); st.starting = null; };
    const backend = { all: (sql, args, o) => new Promise((ok, no) => {
      st.last = Date.now(); st.Q.push({ sql, args, ok, no, n: st.n++, pri: o && o.pri != null ? o.pri : 0, alive: o && o.alive });
      if (!st.pool.length) start().then(pump, e => { st.Q.splice(0).forEach(j => j.no(e)); }); else pump();
    }) };
    return st.P = Promise.all([G.createDbWorker || script('vendor/sql.js-httpvfs/index.js'), (G.GIM_SQ_DBS && G.GIM_SQ_DBS[name]) || script('generated/sqlite/' + name + '.js')]).then(async () => {
      D = G.GIM_SQ_DBS[name];
      await start();
      return st.E = G.GimSq.create(backend, D.bk ? D.bk.map(x => ({ cat: DM.cat, cv: x.cv })) : books, name);
    });
  }
  setInterval(() => { const t = Date.now(); Object.keys(ST).forEach(k => { const s = ST[k]; if (s.pool && s.pool.length && t - s.last > IDLE && !s.Q.length && !s.pool.some(x => x.busy)) s.stop(); }); }, 15000);
  G.GimSqPool = { engine, stats: () => Object.keys(ST).map(k => [k, ST[k].pool.length]) };
})();
