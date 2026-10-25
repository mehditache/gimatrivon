/* results.js — חלון "תוצאות חיפוש" של שולחן העבודה (v4.1.0): index.html?embed=results&q=…&wid=…&f=…
   חיפוש בכל הספרים, סינון לפי ספר / תת-ספר / מקור, חיפוש בתוך התוצאות ומיון. המנוע הוא של reader.js (G.GimResults);
   כאן רק הממשק: עץ סינון עם מונים, רשימה וירטואלית (טקסט נטען רק לשורות שנראות), ותגיות של הסינון הפעיל.
   לחיצה על תוצאה נשלחת לשולחן העבודה (desktop.js) שפותח אותה בחלון קריאה. מצב הסינון נשמר שם (postMessage 'res-state'). */
(() => {
  'use strict';
  if (!window.GT_RESULTS) return;
  const P = new URLSearchParams(location.search);
  const WID = P.get('wid') || '', Q0 = P.get('q') || '';
  let FS = {}; try { FS = JSON.parse(P.get('f') || '{}') || {}; } catch (e) {}
  const CAP = 150000, RH = 82, GH = 32;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const post = m => { try { parent.postMessage(Object.assign({ gtDesk: 'res', wid: WID }, m), '*'); } catch (e) {} };

  // ---- State ----
  let R = null, me = null, idx = null, q = Q0, extra = FS.extra || '';
  const sel = new Set(FS.sel || []), srcOff = new Set(FS.srcOff || []);
  let sort = FS.sort === 'rel' ? 'rel' : 'books', exp = new Set(FS.exp || []);
  let rows = [], off = null, order = null, shown = 0;

  document.documentElement.classList.add('gtResults');
  const app = document.createElement('div'); app.id = 'rsApp'; app.dir = 'rtl';
  app.innerHTML = '<aside class="rsSide" id="rsSide"></aside><div class="rsMain"><div class="rsTools"><label class="rsIn">⌕ <input type="search" id="rsIn" placeholder="חיפוש בתוך התוצאות…" autocomplete="off" spellcheck="false"></label><span class="rsSort" id="rsSort"><button data-s="books">לפי סדר הספרים</button><button data-s="rel">לפי רלוונטיות</button></span></div><div class="rsSel" id="rsSel"></div><div class="rsList" id="rsList"><div class="rsSp" id="rsSp"></div></div><div class="rsFoot" id="rsFoot"></div></div>';
  document.body.appendChild(app);
  const $ = s => app.querySelector(s), list = $('#rsList'), sp = $('#rsSp');
  $('#rsIn').value = extra;

  const state = () => post({ type: 'state', state: { sel: [...sel], srcOff: [...srcOff], sort, exp: [...exp], extra }, total: idx ? shown : 0, q });

  // ---- התחלה ----
  const boot = setInterval(() => {
    R = window.GimResults; if (!R || !R.ready()) return; clearInterval(boot); run();
  }, 150);
  let runTok = 0, idxTok = 0;
  function run() {
    const full = (q + ' ' + extra).trim();
    $('#rsFoot').textContent = 'מחפש בכל הספרים…'; sp.style.height = '0'; list.querySelectorAll('.rsRow,.rsGh').forEach(e => e.remove());
    const tok = ++runTok;
    // אם אחרי 15 שניות עדיין אין שום תוצאה (תחום שנתקע בטעינה) — מציעים לנסות שוב במקום להשאיר "מחפש…" לנצח
    setTimeout(() => {
      if (tok !== runTok || idx) return;
      const ft = $('#rsFoot'); ft.textContent = 'החיפוש מתעכב… '; const a = document.createElement('a'); a.href = '#'; a.textContent = 'לנסות שוב';
      a.onclick = e => { e.preventDefault(); run(); }; ft.appendChild(a);
    }, 15000);
    R.start(full, (m, partial) => {
      if (tok !== runTok) return;
      if (!m) { $('#rsFoot').textContent = 'אין תוצאות'; idx = null; side(); return; }
      // תוצאות חלקיות (תחומים שכבר סיימו) מוצגות מיד; הסכום והסדר מתעדכנים כשהאטיים מסיימים
      const t = ++idxTok;
      R.index(m, CAP, (i, n) => { if (!idx) $('#rsFoot').textContent = 'מסדר את התוצאות… ' + i.toLocaleString('he') + ' / ' + n.toLocaleString('he'); }, ix => {
        if (t !== idxTok || tok !== runTok) return;
        const st = idx ? list.scrollTop : 0; // עדכון חלקי לא מקפיץ את הרשימה לראש
        me = m; me.onLoad = () => paint(true); idx = ix; side(); refilter();
        if (partial) { list.scrollTop = st; paint(true); $('#rsFoot').textContent += ' · תוצאות חלקיות — עדיין מחפש (' + (m.pend || 0) + ' תחומים נותרו)'; }
      });
    });
  }

  // ---- סינון ----
  const key = (d, bi) => d + ':' + bi;
  const groupOf = (d, bi) => R.book(RES_D[d], bi).group;
  let RES_D = null;
  function passes(i) {
    if (srcOff.has(idx.dom[i] + ':' + idx.src[i])) return false;
    if (!sel.size) return true;
    const d = idx.dom[i], bi = idx.bk[i];
    return sel.has('d:' + d) || sel.has('b:' + d + ':' + bi) || (sel.size > 0 && sel.has('g:' + d + ':' + gOf(d, bi)));
  }
  const gc = new Map(); const gOf = (d, bi) => { const k = d * 10000 + bi; let g = gc.get(k); if (g == null) { g = R.book(RES_D[d], bi).group; gc.set(k, g); } return g; };

  function refilter() {
    if (!idx) return;
    RES_D = R.DOMS;
    const arr = []; for (let i = 0; i < idx.n; i++) if (passes(i)) arr.push(i);
    if (sort === 'books') arr.sort((a, b) => idx.dom[a] - idx.dom[b] || idx.bk[a] - idx.bk[b] || idx.ord[a] - idx.ord[b] || a - b);
    order = arr; shown = arr.length;
    // שורות: כותרת לכל ספר (בסדר הספרים) + תוצאה
    rows = []; let last = -1;
    const cnt = new Map(); if (sort === 'books') arr.forEach(i => { const k = idx.dom[i] * 10000 + idx.bk[i]; cnt.set(k, (cnt.get(k) || 0) + 1); });
    arr.forEach(i => {
      if (sort === 'books') { const k = idx.dom[i] * 10000 + idx.bk[i]; if (k !== last) { last = k; rows.push({ gh: 1, d: idx.dom[i], bi: idx.bk[i], n: cnt.get(k) }); } }
      rows.push({ i });
    });
    off = new Int32Array(rows.length + 1); rows.forEach((r, k) => { off[k + 1] = off[k] + (r.gh ? GH : RH); });
    sp.style.height = off[rows.length] + 'px'; list.scrollTop = 0; rt = 0;
    $('#rsFoot').textContent = (shown.toLocaleString('he')) + ' תוצאות' + (shown < idx.total && !sel.size && !srcOff.size && idx.total > idx.n ? ' (מוצגות ' + idx.n.toLocaleString('he') + ' הראשונות)' : '') + (idx.total !== shown ? ' מתוך ' + idx.total.toLocaleString('he') : '') + ' · לחיצה פותחת בחלון קריאה (Ctrl+לחיצה: בחלון חדש)';
    chips(); side(); paint(true); state();
  }

  // ---- עץ סינון עם מונים ----
  function side() {
    const S = $('#rsSide'); if (!idx) { S.innerHTML = '<h4><span>סינון לפי ספר</span></h4>'; return; }
    RES_D = R.DOMS;
    // מונים (לפי המקורות הפעילים, בלי קשר לבחירת הספרים)
    const dc = {}, gcn = {}, bc = {};
    for (let i = 0; i < idx.n; i++) {
      if (srcOff.has(idx.dom[i] + ':' + idx.src[i])) continue;
      const d = idx.dom[i], bi = idx.bk[i], g = gOf(d, bi);
      dc[d] = (dc[d] || 0) + 1; const gk = d + ':' + g; gcn[gk] = (gcn[gk] || 0) + 1; const bk = d + ':' + bi; bc[bk] = (bc[bk] || 0) + 1;
    }
    const tree = {}; // d → g → [bi]
    Object.keys(bc).forEach(k => { const [d, bi] = k.split(':').map(Number), g = gOf(d, bi); ((tree[d] = tree[d] || {})[g] = tree[d][g] || []).push(bi); });
    const mark = (on, half) => '<span class="rsCb' + (on ? ' on' : half ? ' half' : '') + '">' + (on ? '✓' : half ? '–' : '') + '</span>';
    let h = '<h4><span>סינון לפי ספר</span>' + (sel.size ? '<a data-clr="sel">נקה</a>' : '') + '</h4>';
    Object.keys(tree).map(Number).sort((a, b) => a - b).forEach(d => {
      const dk = 'd:' + d, dOn = sel.has(dk), dOpen = exp.has(dk), childSel = [...sel].some(x => x.startsWith('g:' + d + ':') || x.startsWith('b:' + d + ':'));
      h += '<div class="rsFi l1' + (dOn ? ' on' : '') + '" data-k="' + dk + '"><span class="rsTg" data-t="' + dk + '">' + (dOpen ? '▾' : '◂') + '</span>' + mark(dOn, childSel) + '<span class="rsNm">' + esc(R.DL[R.DOMS[d]]) + '</span><span class="rsN">' + dc[d].toLocaleString('he') + '</span></div>';
      if (!dOpen) return;
      const groups = Object.keys(tree[d]);
      groups.forEach(g => {
        const gk = 'g:' + d + ':' + g, grp = !!g, gOn = sel.has(gk), gOpen = !grp || exp.has(gk), gChild = [...sel].some(x => tree[d][g].some(bi => x === 'b:' + d + ':' + bi));
        if (grp) h += '<div class="rsFi l2' + (gOn ? ' on' : '') + '" data-k="' + gk + '"><span class="rsTg" data-t="' + gk + '">' + (gOpen ? '▾' : '◂') + '</span>' + mark(gOn, gChild) + '<span class="rsNm">' + esc(g) + '</span><span class="rsN">' + gcn[d + ':' + g].toLocaleString('he') + '</span></div>';
        if (!gOpen) return;
        tree[d][g].sort((a, b) => a - b).forEach(bi => {
          const bk = 'b:' + d + ':' + bi, on = sel.has(bk);
          h += '<div class="rsFi ' + (grp ? 'l3' : 'l2') + (on ? ' on' : '') + '" data-k="' + bk + '">' + mark(on, false) + '<span class="rsNm">' + esc(R.book(R.DOMS[d], bi).name) + '</span><span class="rsN">' + bc[d + ':' + bi].toLocaleString('he') + '</span></div>';
        });
      });
    });
    // מקורות (נוסח / מפרשים / תרגום)
    const sc = {}; for (let i = 0; i < idx.n; i++) { const k = idx.dom[i] + ':' + idx.src[i]; sc[k] = (sc[k] || 0) + 1; }
    const byName = {}; Object.keys(sc).forEach(k => { const [d, s] = k.split(':').map(Number), nm = R.SRC[R.DOMS[d]][s]; (byName[nm] = byName[nm] || []).push(k); });
    h += '<h4 style="margin-top:14px"><span>מקורות</span>' + (srcOff.size ? '<a data-clr="src">הכול</a>' : '') + '</h4>';
    Object.keys(byName).forEach(nm => {
      const ks = byName[nm], off0 = ks.every(k => srcOff.has(k)), total = ks.reduce((a, k) => a + sc[k], 0);
      h += '<div class="rsFi l2' + (off0 ? '' : ' on') + '" data-s="' + ks.join(',') + '">' + mark(!off0, false) + '<span class="rsNm">' + esc(nm) + '</span><span class="rsN">' + total.toLocaleString('he') + '</span></div>';
    });
    S.innerHTML = h;
  }
  $('#rsSide').addEventListener('click', e => {
    const clr = e.target.closest('[data-clr]'); if (clr) { if (clr.dataset.clr === 'sel') sel.clear(); else srcOff.clear(); return refilter(); }
    const t = e.target.closest('[data-t]'); if (t) { const k = t.dataset.t; exp.has(k) ? exp.delete(k) : exp.add(k); return side(), state(); }
    const f = e.target.closest('.rsFi'); if (!f) return;
    if (f.dataset.s) { const ks = f.dataset.s.split(','), off0 = ks.every(k => srcOff.has(k)); ks.forEach(k => off0 ? srcOff.delete(k) : srcOff.add(k)); return refilter(); }
    const k = f.dataset.k; sel.has(k) ? sel.delete(k) : sel.add(k); refilter();
  });
  function chips() {
    const c = [];
    sel.forEach(k => { const [t, d, rest] = k.split(':'); const dn = R.DL[R.DOMS[+d]]; c.push([k, t === 'd' ? dn : t === 'g' ? dn + ' · ' + rest : R.book(R.DOMS[+d], +rest).name]); });
    if (extra) c.push(['extra', 'בתוך התוצאות: ' + extra]);
    $('#rsSel').innerHTML = c.length ? 'מסונן: ' + c.map(([k, n]) => '<span class="rsChip" data-x="' + esc(k) + '">' + esc(n) + ' ✕</span>').join('') : '';
  }
  $('#rsSel').addEventListener('click', e => {
    const c = e.target.closest('[data-x]'); if (!c) return; const k = c.dataset.x;
    if (k === 'extra') { extra = ''; $('#rsIn').value = ''; post({ type: 'title', q: q }); run(); return; }
    sel.delete(k); refilter();
  });
  $('#rsSort').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b || b.dataset.s === sort) return; sort = b.dataset.s; $('#rsSort').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.s === sort)); refilter(); });
  $('#rsSort').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.s === sort));
  // חיפוש בתוך התוצאות: מצמצם את החיפוש (המילה הנוספת חייבת להופיע גם היא) ומריץ אותו מחדש; הסינון נשמר
  let it = 0;
  $('#rsIn').addEventListener('input', () => { clearTimeout(it); it = setTimeout(() => { extra = $('#rsIn').value.trim(); run(); }, 450); });

  // ---- רשימה וירטואלית ----
  function firstAt(y) { let lo = 0, hi = rows.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (off[m] <= y) lo = m; else hi = m - 1; } return lo; }
  let rf = 0; list.addEventListener('scroll', () => { rt = 0; cancelAnimationFrame(rf); rf = requestAnimationFrame(() => paint(false)); });
  let pf = null;
  let rt = 0; // ניסיונות טעינה חוזרים לשורות שלד
  function paint(force) {
    if (!idx || !rows.length) { if (idx && !rows.length) list.querySelectorAll('.rsRow,.rsGh').forEach(e => e.remove()); return; }
    const top = list.scrollTop, hgt = list.clientHeight || 500, a = Math.max(0, firstAt(top) - 6), z = Math.min(rows.length, firstAt(top + hgt) + 8);
    const need = []; for (let k = a; k < z; k++) { const r = rows[k]; if (r.i != null && me.hits[r.i] && me.hits[r.i].ph) need.push(r.i); }
    if (need.length) {
      // טעינה שנפלה (למשל הוחלפה בגרסה חדשה) משאירה שלד — מנסים שוב בהשהיה גוברת, עד 6 פעמים
      const m0 = me, t = rt;
      R.load(m0, need, 1).catch(() => {}).then(() => { if (m0 === me && t === rt && ++rt <= 6) setTimeout(() => { if (m0 === me && list.querySelector('.rsRow.ph')) paint(true); }, 250 * rt); });
    }
    const sig = a + ':' + z + ':' + need.length;
    if (!force && sig === pf) return; pf = sig;
    let h = '';
    for (let k = a; k < z; k++) {
      const r = rows[k], y = off[k];
      if (r.gh) { const b = R.book(R.DOMS[r.d], r.bi); h += '<div class="rsGh" style="top:' + y + 'px"><span>' + esc(R.DL[R.DOMS[r.d]] + ' · ' + b.name) + '</span><span class="rsN">' + r.n.toLocaleString('he') + ' תוצאות</span></div>'; continue; }
      const x = me.hits[r.i];
      if (!x || x.ph) { h += '<div class="rsRow ph" style="top:' + y + 'px"><i></i><i></i></div>'; continue; }
      const o = R.row(x);
      h += '<button type="button" class="rsRow" style="top:' + y + 'px" data-i="' + r.i + '"><span class="rsRf">' + (o.tag ? '<i>' + esc(o.tag) + '</i> ' : '') + esc(o.ref) + '</span><span class="rsSn">' + (o.html || '') + '</span></button>';
    }
    list.querySelectorAll('.rsRow,.rsGh').forEach(e => e.remove());
    list.insertAdjacentHTML('beforeend', h);
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('.rsRow[data-i]'); if (!b) return;
    const x = me.hits[+b.dataset.i]; if (!x || x.ph) return;
    post({ type: 'open', hash: R.hashOf(x), q: (q + ' ' + extra).trim(), fresh: e.ctrlKey || e.metaKey || e.shiftKey });
  });
  // רשת ביטחון: שורות שלד שנשארו (בקשה שנפלה או נתקעה) נדרשות שוב כל שנייה וחצי עד שהן נטענות
  setInterval(() => { if (idx && me && list.querySelector('.rsRow.ph')) paint(true); }, 1500);
  addEventListener('resize', () => paint(true));
})();
