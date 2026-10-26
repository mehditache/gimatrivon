/* sqpool.js — מאגר Workers משותף של SQLite לכל חלונות שולחן העבודה (v4.2.2).
   עד כה כל חלון (מארח החיפוש, חלון תוצאות, כל חלון קריאה) הרים לעצמו מאגר Workers של sql.js-httpvfs, כל אחד עם עותק WASM ועמודי מסד
   בזיכרון. עכשיו המאגר חי בדף השולחן (desktop.html), והחלונות (iframe באותו מוצא) פונים אליו דרך parent.GimSqPool.engine(). מנוע אחד לכל תחום —
   Workers אחד-אחד לכל התחומים, בלי כפילות; חיפוש שכבר חימם את המנוע (הרשימה הנפתחת) מזרז את חלון התוצאות.
   מנוע שלא היה בשימוש IDLE שניות משחרר את ה-Workers, והם נפתחים שוב לבד בבקשה הבאה (ה-engine עצמו נשאר תקף).
   v4.6.0: כשאפשר (SharedWorker + OPFS, מחשב עם 4GB ומעלה), כל תחום מחזיק את המסד כולו בזיכרון ב-sqmem.js — אחד לכל הטאבים והחלונות.
   עד שהוא מוכן (הורדה ראשונה), ובכל כשל, השאילתות עוברות במאגר הטווחים שכאן; כשהוא מוכן, ה-Workers של הטווחים נסגרים.
   localStorage gimSqMem = '0' מבטל. */
(() => {
  'use strict';
  const G = window, SQ_MAX = 8 << 20, IDLE = 180000, ST = {};
  let RCS = 4; try { RCS = Math.max(1, Math.min(32, +localStorage.getItem('gimSqRcs') || 4)); } catch (e) {} // כפולה של עמוד מסד לכל בקשת Range: 4 (64KB) חוסכת כרבע מהזמן ברשת איטית (מדידה: 80ms השהיה, 413→273 בקשות); 16 כבר מוריד פי שלושה בתים בלי להאיץ
  const MEM = (() => { try { if (localStorage.getItem('gimSqMem') === '0') return false; } catch (e) {}
    return typeof SharedWorker === 'function' && /^https?:$/.test(location.protocol) && !!(navigator.storage && navigator.storage.getDirectory) &&
      typeof DecompressionStream === 'function' && !(navigator.deviceMemory && navigator.deviceMemory < 4); })();
  const abs = p => new URL(p, location.href).href;
  const script = src => new Promise((ok, no) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); });

  function engine(name, books) {
    const st = ST[name] || (ST[name] = { P: null, E: null, pool: [], Q: [], starting: null, last: Date.now(), n: 0 });
    st.last = Date.now();
    if (st.P) return st.P;
    const DM = G.GimSq.DOMAINS[name], TB = DM.tabs;
    let D = null;
    const cfg = i => [{ from: 'inline', config: { serverMode: 'chunked', urlPrefix: abs(D.file) + '.', suffixLength: 3, serverChunkSize: D.chunk, databaseLengthBytes: D.bytes, cacheBust: D.hash + '&w=' + i, requestChunkSize: D.page * RCS, maxReadSpeed: D.page * 8 * Math.max(1, RCS / 2) } }];
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
    /* המסד בזיכרון (sqmem.js). first: Promise של המצב הראשון ('cached' = כבר ב-OPFS, נטען בלי רשת → לא פותחים מאגר טווחים) */
    const memOpen = () => {
      if (!MEM || st.m || st.memOff || !D) return null;
      let w; try { w = new SharedWorker(abs('sqmem.js?v=4.6.0'), { name: 'gimsq-' + name }); } catch (e) { st.memOff = true; return null; }
      let first; const m = st.m = { port: w.port, ready: false, n: 0, wait: new Map(), first: new Promise(r => { first = r; setTimeout(() => r('slow'), 1500); }) };
      m.port.onmessage = e => {
        const d = e.data || {};
        if (d.t === 'state') {
          first(d.state); st.mem = d.state;
          if (d.state === 'ready') { m.ready = true; if (m.onReady) m.onReady(); st.stop(); } // Workers הטווחים כבר לא נחוצים
          else if (d.state === 'fail' || d.state === 'gone') {
            if (d.state === 'fail') { st.memOff = true; try { console.warn('[GimSqPool] ' + name + ' in memory:', d.err); } catch (x) {} }
            if (st.m === m) st.m = null; m.ready = false; if (m.onReady) m.onReady();
            const js = [...m.wait.values()]; m.wait.clear(); js.forEach(viaRange); // מה שחיכה עובר לטווחים
          }
          return;
        }
        const j = m.wait.get(d.id); if (!j) return; m.wait.delete(d.id);
        if (d.e) { if (d.e === 'not ready') viaRange(j); else j.no(new Error(d.e)); } else j.ok(d.p || d.r);
      };
      m.port.start(); m.port.postMessage({ t: 'open', meta: D });
      return m;
    };
    const viaRange = j => { st.Q.push(j); if (!st.pool.length) start().then(pump, e => { st.Q.splice(0).forEach(x => x.no(e)); }); else pump(); };
    // פתיחת המאגר (גם אחרי שחרור סרק): הראשון קודם, כדי שה-WASM יירד פעם אחת ושאר ה-Workers יקבלו אותו מהמטמון
    const start = () => st.starting || (st.starting = open(0, true).then(x => { st.pool.push(x); pump(); }, e => { st.starting = null; throw e; }));
    st.stop = () => { st.pool.splice(0).forEach(x => { x.old = true; x.w.raw && x.w.raw.terminate(); }); st.starting = null; };
    const backend = { all: (sql, args, o) => new Promise((ok, no) => {
      st.last = Date.now();
      const j = { sql, args, ok, no, n: st.n++, pri: o && o.pri != null ? o.pri : 0, alive: o && o.alive }, m = st.m || memOpen();
      if (m && m.ready) { const id = ++m.n; m.wait.set(id, j); m.port.postMessage({ t: 'q', id, sql, args, pack: /^SELECT doc, /.test(sql) }); } // רשימת מופעים: מערכים טיפוסיים (ראו pack ב-sqmem.js)
      else viaRange(j);
    }) };
    const P = st.P = Promise.all([G.createDbWorker || script('vendor/sql.js-httpvfs/index.js'), (G.GIM_SQ_DBS && G.GIM_SQ_DBS[name]) || script('generated/sqlite/' + name + '.js')]).then(async () => {
      D = G.GIM_SQ_DBS[name];
      // המסד כבר ב-OPFS (ביקור חוזר): מחכים לו (עד 10 שניות) במקום לפתוח מאגר טווחים; אחרת מאגר הטווחים עובד בזמן ההורדה
      const m = memOpen(), s0 = m ? await m.first : '';
      if (m && (s0 === 'cached' || s0 === 'ready') && !m.ready) await new Promise(r => { m.onReady = r; setTimeout(r, 10000); });
      if (!st.m || !st.m.ready) await start();
      const E = G.GimSq.create(backend, D.bk ? D.bk.map(x => ({ cat: DM.cat, cv: x.cv })) : books, name);
      // מטמון חיפושים אחרונים (8 לכל תחום): חזרה לאותה שאילתה, או חלון תוצאות שנפתח אחרי רשימה נפתחת שחיפשה אותה, מיידיים
      const raw = E.search, memo = new Map();
      E.search = (q, opt) => {
        const k = q + '|' + JSON.stringify(opt || {});
        if (memo.has(k)) { const v = memo.get(k); memo.delete(k); memo.set(k, v); return v; }
        const p = raw(q, opt); memo.set(k, p); p.catch(() => memo.delete(k));
        while (memo.size > 8) memo.delete(memo.keys().next().value);
        return p;
      };
      return st.E = E;
    });
    P.catch(() => { if (st.P === P) st.P = null; }); // כשל (רשת, שרת בלי Range): הבקשה הבאה מנסה שוב
    return P;
  }
  setInterval(() => { const t = Date.now(); Object.keys(ST).forEach(k => { const s = ST[k]; if (s.pool && s.pool.length && t - s.last > IDLE && !s.Q.length && !s.pool.some(x => x.busy)) s.stop(); }); }, 15000);
  G.GimSqPool = { engine, stats: () => Object.keys(ST).map(k => [k, ST[k].pool.length, ST[k].mem || '']) };
})();
