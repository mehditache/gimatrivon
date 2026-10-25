/* desktop.js — שולחן העבודה (v4.0.0).
   - חלון גימטריה אחד וחלונות קריאה (עד 5). כל חלון הוא index.html?embed=gem|read בתוך iframe, כך שמסכי
     הגימטריה והקריאה נשארים בדיוק כמו שהם; reader.js יודע (GT_EMBED) לא לעבור בין המסכים בתוך חלון.
   - הבנר העליון קבוע מחוץ לחלונות ומשקף את החלון הפעיל: בחירת הספר והכלים משוכפלים מהחלון (importNode)
     וכל לחיצה עליהם מועברת לאלמנט המקורי; ההקלדה בתיבת החיפוש מועברת ל-#rdQ של החלון.
   - מזעור: ה-iframe נמחק (כל הזיכרון של החלון משתחרר) ונשאר רק State קטן — המקום (#read/…), ההיסטוריה
     (אחורה/קדימה) ושדות הגימטריה. הכול נשמר ב-localStorage (gimatrivonDesk), וגם ביקור חוזר משחזר את השולחן;
     רק החלון הפעיל נטען מיד, השאר נטענים בלחיצה.
   - חלון "מעבר לפרק ופסוק" של כל חלון קריאה מקבל ☆ סימניה, ⧉ בחלון חדש ו-🔢 גימטריבון. */
(() => {
  'use strict';
  const KEY = 'gimatrivonDesk', MARKS = 'gimatrivonMarks', MAXR = 5, HMAX = 50;
  const $ = s => document.querySelector(s);
  const desk = $('#dkDesk'), task = $('#dkTask'), nav = $('#dkNav'), tools = $('#dkTools'), q = $('#dkQ');
  const EN = (() => { try { return localStorage.getItem('gimatrivonLang') === 'en'; } catch (e) { return false; } })();
  const T = (he, en) => EN ? en : he;

  /* ---------- State ---------- */
  // D = { v, seq, act, z, last (חלון הקריאה האחרון שהיה פעיל), wins: [{ id, k:'gem'|'read', x, y, w, h, max, min, z, t, hist, hi, form }] }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} };
  let saveT = 0; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 300); };
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.v === 1 && Array.isArray(d.wins) && d.wins.some(w => w.k === 'gem') ? d : null; } catch (e) { return null; } };
  const fresh = () => {
    const d = { v: 1, seq: 1, act: 'g', z: 1, last: '', wins: [{ id: 'g', k: 'gem', x: 0, y: 0, w: 900, h: 600, max: true, min: false, z: 1, t: '', form: null }] };
    return d;
  };
  function newRead(d, hash) {
    const n = d.wins.filter(w => w.k === 'read').length, id = 'r' + (d.seq++);
    return { id, k: 'read', x: 40 + n * 36, y: 24 + n * 30, w: Math.min(980, desk.clientWidth - 80), h: Math.min(680, desk.clientHeight - 60), max: false, min: false, z: ++d.z, t: '', hist: [hash], hi: 0 };
  }
  let D = load() || fresh();
  const W = id => D.wins.find(w => w.id === id);
  const reads = () => D.wins.filter(w => w.k === 'read');
  const gemW = () => D.wins.find(w => w.k === 'gem');
  const F = new Map(); // id → { el, fr (iframe או null), doc, win }

  /* ---------- חלונות ---------- */
  const ICON = { gem: '🔢', read: '📖', search: '🔍' }, MAXS = 3;
  const curHash = w => w.k === 'gem' ? '#gim' : w.k === 'search' ? '#find' : (w.hist[w.hi] || '#read');
  const srcOf = w => w.k === 'search' ? 'index.html?embed=results&wid=' + w.id + '&q=' + encodeURIComponent(w.q) + '&f=' + encodeURIComponent(JSON.stringify(w.fs || {})) : 'index.html?embed=' + w.k + curHash(w);
  // מפתח "פרק" של כתובת: מעבר בתוך אותו פרק/דף מחליף את הרשומה הנוכחית בהיסטוריה, מעבר לפרק אחר מוסיף רשומה
  const chKey = h => String(h).split('/').slice(0, 4).join('/'); // #read/TN/Gen/2, #read/TB/<מסכת>/<דף>, #read/TUR/<חלק>/<סימן>

  function build(w) {
    const el = document.createElement('section');
    el.className = 'dw'; el.dataset.id = w.id;
    el.innerHTML = '<div class="dwBar">' +
      (w.k === 'read' ? '<span class="dwNav"><button type="button" data-a="back" title="' + T('אחורה', 'Back') + '">→</button><button type="button" data-a="fwd" title="' + T('קדימה', 'Forward') + '">←</button></span>' : '') +
      '<span>' + ICON[w.k] + '</span><b class="dwT"></b><span class="dwTag">' + (w.k === 'gem' ? T('גימטריה', 'Gematria') : w.k === 'search' ? T('תוצאות חיפוש', 'Search results') : T('קריאה', 'Reader')) + '</span>' +
      '<span class="dwCtl"><button type="button" data-a="min" title="' + T('מזעור', 'Minimize') + '">–</button><button type="button" data-a="max" title="' + T('הגדלה / שחזור', 'Maximize / restore') + '">□</button>' +
      (w.k !== 'gem' ? '<button type="button" class="x" data-a="close" title="' + T('סגירה', 'Close') + '">✕</button>' : '') + '</span></div>' +
      '<div class="dwBody"></div><div class="dwRs l"></div><div class="dwRs r"></div>';
    desk.appendChild(el);
    F.set(w.id, { el, fr: null, doc: null, win: null });
    const bar = el.querySelector('.dwBar');
    bar.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'min') minimize(w.id); else if (a === 'max') toggleMax(w.id); else if (a === 'close') closeWin(w.id);
      else if (a === 'back') go(w.id, -1); else if (a === 'fwd') go(w.id, 1);
    });
    bar.addEventListener('dblclick', e => { if (!e.target.closest('button')) toggleMax(w.id); });
    bar.addEventListener('pointerdown', e => { if (!e.target.closest('button')) startDrag(e, w.id); });
    el.querySelectorAll('.dwRs').forEach(h => h.addEventListener('pointerdown', e => startResize(e, w.id, h.classList.contains('l'))));
    el.addEventListener('pointerdown', () => focusWin(w.id), true);
    paint(w);
  }

  function paint(w) {
    const f = F.get(w.id); if (!f) return;
    const el = f.el;
    el.hidden = !!w.min;
    el.classList.toggle('max', !!w.max);
    el.classList.toggle('act', D.act === w.id);
    if (!w.max) Object.assign(el.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' });
    el.style.zIndex = w.z;
    el.querySelector('.dwT').textContent = w.k === 'gem' ? T('גימטריבון', 'Gimatrivon') : (w.t || T('קריאה', 'Reader'));
    el.querySelector('[data-a="max"]').textContent = w.max ? '❐' : '□';
    if (w.k === 'read') { el.querySelector('[data-a="back"]').disabled = w.hi <= 0; el.querySelector('[data-a="fwd"]').disabled = w.hi >= w.hist.length - 1; }
  }

  // טעינת ה-iframe של חלון (רק כשהוא גלוי ופעיל, או כשלוחצים עליו)
  function wake(w) {
    const f = F.get(w.id); if (!f || f.fr || w.min) return;
    const body = f.el.querySelector('.dwBody'); body.textContent = '';
    const fr = document.createElement('iframe');
    fr.title = w.k === 'gem' ? T('גימטריה', 'Gematria') : (w.t || T('קריאה', 'Reader'));
    fr.src = srcOf(w);
    fr.addEventListener('load', () => attach(w, fr));
    body.appendChild(fr); f.fr = fr;
  }
  function sleepFrame(w) { // שמירת State ושחרור ה-iframe
    const f = F.get(w.id); if (!f) return;
    snapshot(w);
    try { // קטע-טקסט קצר לתצוגה המקדימה בריחוף על השבב (בלי להחזיק DOM)
      if (f.doc) {
        if (w.k === 'read') { const t = f.doc.querySelector('.rdTxt'); w.snip = t ? t.textContent.replace(/\s+/g, ' ').trim().slice(0, 220) : ''; }
        else if (w.k === 'search') { w.snip = (w.q || '') + (w.count != null ? ' · ' + w.count.toLocaleString('he') + ' ' + T('תוצאות', 'results') : ''); }
        else { const a = f.doc.getElementById('tA'), b = f.doc.getElementById('tB'); w.snip = [a && a.value, b && b.value].filter(Boolean).join('  ·  '); }
      }
    } catch (e) {}
    if (f.obs) f.obs.forEach(o => o.disconnect());
    if (f.fr) { try { f.fr.src = 'about:blank'; } catch (e) {} f.fr.remove(); }
    f.fr = f.doc = f.win = null; f.obs = null;
    const body = f.el.querySelector('.dwBody'); body.textContent = '';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'dwWake';
    b.innerHTML = '<b></b><span>' + T('לחיצה להמשך', 'Click to continue') + '</span>';
    b.querySelector('b').textContent = (w.k === 'gem' ? T('גימטריבון', 'Gimatrivon') : (w.t || T('קריאה', 'Reader')));
    b.onclick = () => { focusWin(w.id); wake(w); };
    body.appendChild(b);
  }
  // שדות הגימטריה (שני הצדדים, שיטות, מסננים): כל input/textarea/select עם id, ערך ומצב סימון
  function snapshot(w) {
    const f = F.get(w.id); if (!f || !f.doc || w.k !== 'gem') return;
    const form = {};
    f.doc.querySelectorAll('#stage input[id],#stage textarea[id],#stage select[id]').forEach(x => {
      if (x.closest('header.top') || x.type === 'file') return;
      form[x.id] = x.type === 'checkbox' || x.type === 'radio' ? (x.checked ? 1 : 0) : x.value;
    });
    w.form = form; saveSoon();
  }
  function restoreForm(w, f) {
    if (!w.form) return;
    const fw = f.win, d = f.doc;
    const apply = () => Object.entries(w.form).forEach(([id, v]) => {
      const x = d.getElementById(id); if (!x) return;
      if (x.type === 'checkbox' || x.type === 'radio') { if (!!v !== x.checked) x.click(); }
      else if (x.value !== v) { x.value = v; x.dispatchEvent(new fw.Event('input', { bubbles: true })); x.dispatchEvent(new fw.Event('change', { bubbles: true })); }
    });
    setTimeout(apply, 400);
  }

  function attach(w, fr) {
    const f = F.get(w.id); if (!f || f.fr !== fr) return;
    let fw, d; try { fw = fr.contentWindow; d = fr.contentDocument; } catch (e) { return; }
    if (!d || !fw || fw.location.href === 'about:blank') return;
    f.win = fw; f.doc = d; f.obs = []; f.first = true;
    fw.addEventListener('pointerdown', () => { closeSearch(); focusWin(w.id); }, true);
    fw.addEventListener('focus', () => focusWin(w.id));
    fw.addEventListener('keydown', e => keys(e, w.id), true);
    if (w.k === 'read') {
      // reader.js מעדכן את הכתובת ב-history.replaceState (בלי hashchange) — עוטפים אותו כדי לשמוע כל מעבר
      const hs = fw.history, rep = hs.replaceState.bind(hs), push = hs.pushState.bind(hs);
      hs.replaceState = (...a) => { rep(...a); onHash(w.id); };
      hs.pushState = (...a) => { push(...a); onHash(w.id); };
      fw.addEventListener('hashchange', () => onHash(w.id));
      setTimeout(() => onHash(w.id), 50);
      watchReader(w, f);
    } else restoreForm(w, f);
    themeTo(f);
    if (!$('#dkVer').textContent) { const v = d.getElementById('ver'); if (v) $('#dkVer').textContent = v.textContent; }
    if (D.act === w.id) banner();
  }

  /* ---------- מיקום בספר והיסטוריה (אחורה / קדימה) ---------- */
  function onHash(id) {
    const w = W(id), f = F.get(id); if (!w || !f || !f.win) return;
    const h = decodeURI(f.win.location.hash || '');
    if (!/^#read/i.test(h)) return;
    if (f.first) { f.first = false; w.hist[w.hi] = h; w.navTo = null; } // הכתובת הראשונה אחרי טעינה (מנורמלת) מחליפה את הרשומה
    else if (w.navTo != null) { if (chKey(h) === chKey(w.navTo)) { w.hist[w.hi] = h; w.navTo = null; } }
    else if (h !== w.hist[w.hi]) {
      if (chKey(h) === chKey(w.hist[w.hi] || '')) w.hist[w.hi] = h;
      else { w.hist = w.hist.slice(0, w.hi + 1); w.hist.push(h); if (w.hist.length > HMAX) w.hist.shift(); w.hi = w.hist.length - 1; }
    }
    setTimeout(() => { const t = f.doc && f.doc.getElementById('rdWhereTxt'); if (t && t.textContent.trim()) { w.t = t.textContent.trim(); paint(w); taskbar(); } }, 30);
    paint(w); if (D.act === id) syncUrl(); saveSoon();
  }
  function go(id, dir) {
    const w = W(id); if (!w || w.k !== 'read') return;
    const i = w.hi + dir; if (i < 0 || i >= w.hist.length) return;
    w.hi = i; navTo(w, w.hist[i]); paint(w); saveSoon();
  }
  function navTo(w, h) { // מעבר של חלון קריאה למקום בלי להוסיף להיסטוריה
    const f = F.get(w.id); w.navTo = h;
    if (f && f.win) f.win.location.hash = h; else { w.navTo = null; if (!w.min) wake(w); }
    if (D.act === w.id) syncUrl();
  }
  function navPush(w, h) { // מעבר עם רשומה חדשה בהיסטוריה
    w.hist = w.hist.slice(0, w.hi + 1); w.hist.push(h); if (w.hist.length > HMAX) w.hist.shift(); w.hi = w.hist.length - 1;
    navTo(w, h); paint(w); saveSoon();
  }
  const syncUrl = () => { const w = W(D.act); if (!w) return; try { history.replaceState(null, '', curHash(w)); } catch (e) {} };

  /* ---------- פעולות על חלונות ---------- */
  function focusWin(id) {
    const w = W(id); if (!w) return;
    if (w.min) { w.min = false; }
    const changed = D.act !== id;
    if (changed || w.z < D.z) w.z = ++D.z;
    D.act = id; if (w.k === 'read') D.last = id;
    D.wins.forEach(paint); wake(w);
    if (changed) { banner(); syncUrl(); }
    taskbar(); saveSoon();
  }
  function topVisible(except) { return D.wins.filter(w => !w.min && w.id !== except).sort((a, b) => b.z - a.z)[0]; }
  function minimize(id) {
    const w = W(id); if (!w) return;
    sleepFrame(w); w.min = true; paint(w);
    if (D.act === id) { const n = topVisible(id); D.act = n ? n.id : ''; if (n) { n.z = ++D.z; wake(n); } D.wins.forEach(paint); banner(); syncUrl(); }
    taskbar(); saveSoon();
  }
  function toggleMax(id) { const w = W(id); if (!w) return; w.max = !w.max; paint(w); saveSoon(); }
  function closeWin(id) {
    const w = W(id); if (!w || w.k === 'gem') return;
    const f = F.get(id); if (f) { if (f.fr) f.fr.src = 'about:blank'; f.el.remove(); F.delete(id); }
    D.wins = D.wins.filter(x => x !== w); if (D.last === id) D.last = '';
    if (D.act === id) { const n = topVisible(); D.act = n ? n.id : ''; if (n) wake(n); D.wins.forEach(paint); banner(); syncUrl(); }
    taskbar(); saveSoon();
  }
  // פתיחת מקום: בחלון קריאה חדש (fresh) או בחלון הקריאה האחרון. ב-5 חלונות — מחליפים את זה שלא היה פעיל הכי הרבה זמן
  function openRead(hash, fresh) {
    hash = hash || '#read';
    let w = !fresh && (W(D.last) || reads().sort((a, b) => b.z - a.z)[0]);
    if (!w && reads().length >= MAXR) { w = reads().sort((a, b) => a.z - b.z)[0]; toast(T('הגעת ל-5 חלונות קריאה — המקום נפתח בחלון הישן ביותר', 'Five reader windows open — opened in the oldest one')); }
    if (w) { focusWin(w.id); navPush(w, hash); return w; }
    w = newRead(D, hash); D.wins.push(w); build(w); focusWin(w.id); return w;
  }
  function openGem() { focusWin(gemW().id); }
  const searches = () => D.wins.filter(w => w.k === 'search');
  function openResults(qv) {
    let w = searches().find(x => x.q === qv);
    if (!w) {
      if (searches().length >= MAXS) closeWin(searches().sort((a, b) => a.z - b.z)[0].id);
      w = { id: 's' + (D.seq++), k: 'search', x: 80 + searches().length * 30, y: 30 + searches().length * 30, w: Math.min(1100, desk.clientWidth - 120), h: Math.min(720, desk.clientHeight - 50), max: false, min: false, z: ++D.z, q: qv, fs: {}, t: T('תוצאות: "', 'Results: "') + qv + '"', count: null };
      D.wins.push(w); build(w);
    }
    focusWin(w.id); return w;
  }
  // הודעות מחלון תוצאות החיפוש: פתיחת תוצאה בחלון קריאה, ושמירת מצב הסינון
  function fromResults(m) {
    const w = W(m.wid); if (!w) return;
    if (m.type === 'state') { w.fs = m.state; w.count = m.total; saveSoon(); }
    else if (m.type === 'open') {
      const l = W(D.last), t = !m.fresh && l && !l.min ? l : null;
      let r; if (t) { focusWin(t.id); navPush(t, m.hash); r = t; } else r = openRead(m.hash, true);
      let n = 0; const tick = () => { const f = F.get(r.id), gr = f && f.win && f.win.GimReader; if (gr && gr.highlight) setTimeout(() => gr.highlight(m.q), 400); else if (++n < 30) setTimeout(tick, 300); }; tick();
    }
  }

  /* ---------- גרירה, שינוי גודל, הצמדה ---------- */
  function startDrag(e, id) {
    const w = W(id); if (!w || e.button !== 0) return;
    focusWin(id);
    const r = desk.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    if (w.max) { w.max = false; w.x = Math.max(0, Math.min(r.width - w.w, x0 - r.left - w.w / 2)); w.y = 0; paint(w); }
    const sx = w.x, sy = w.y; let snap = null, ghost = null, moved = false;
    desk.classList.add('drag');
    const mv = ev => {
      moved = true;
      w.x = Math.round(sx + ev.clientX - x0); w.y = Math.max(0, Math.round(sy + ev.clientY - y0)); paint(w);
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      snap = px < 12 ? 'l' : px > r.width - 12 ? 'r' : py < 6 ? 'max' : null;
      if (snap && !ghost) { ghost = document.createElement('div'); ghost.className = 'dkSnap'; desk.appendChild(ghost); }
      if (!snap && ghost) { ghost.remove(); ghost = null; }
      if (ghost) Object.assign(ghost.style, snap === 'max' ? { inset: '6px' } : { top: '6px', bottom: '6px', width: 'calc(50% - 9px)', left: snap === 'l' ? '6px' : 'auto', right: snap === 'r' ? '6px' : 'auto' });
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); desk.classList.remove('drag');
      if (ghost) ghost.remove();
      if (snap === 'max') w.max = true;
      else if (snap) { w.y = 6; w.h = r.height - 12; w.w = Math.round(r.width / 2 - 9); w.x = snap === 'l' ? 6 : Math.round(r.width / 2 + 3); }
      else w.y = Math.min(w.y, r.height - 40);
      paint(w); if (moved) saveSoon();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function startResize(e, id, left) {
    const w = W(id); if (!w || w.max) return;
    e.preventDefault(); e.stopPropagation(); focusWin(id);
    const x0 = e.clientX, y0 = e.clientY, s = { x: w.x, w: w.w, h: w.h };
    desk.classList.add('drag');
    const mv = ev => {
      const dx = ev.clientX - x0;
      w.h = Math.max(240, s.h + ev.clientY - y0);
      if (left) { w.w = Math.max(360, s.w - dx); w.x = s.x + s.w - w.w; } else w.w = Math.max(360, s.w + dx);
      paint(w);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); desk.classList.remove('drag'); saveSoon(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  // חלון אישור בעיצוב האפליקציה (במקום confirm של הדפדפן): מחזיר Promise<boolean>; Esc / לחיצה על הרקע = ביטול, Enter = אישור
  function ask(title, msg, okLbl, noLbl) {
    return new Promise(res => {
      const el = document.createElement('div'); el.className = 'dkAsk'; el.dir = EN ? 'ltr' : 'rtl';
      el.innerHTML = '<div class="dkAskBox" role="alertdialog" aria-modal="true"><h3></h3><p></p><div class="dkAskBtns"><button type="button" class="ok"></button><button type="button" class="no"></button></div></div>';
      el.querySelector('h3').textContent = title; el.querySelector('p').textContent = msg;
      el.querySelector('.ok').textContent = okLbl; el.querySelector('.no').textContent = noLbl;
      const done = v => { document.removeEventListener('keydown', kd, true); el.remove(); res(v); };
      const kd = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } };
      el.addEventListener('mousedown', e => { if (e.target === el) done(false); });
      el.querySelector('.ok').onclick = () => done(true); el.querySelector('.no').onclick = () => done(false);
      document.addEventListener('keydown', kd, true); document.body.appendChild(el); el.querySelector('.no').focus();
    });
  }
  function arrange(kind) {
    const vis = D.wins.filter(w => !w.min).sort((a, b) => a.z - b.z), W0 = desk.clientWidth, H0 = desk.clientHeight;
    if (kind === 'clean') {
      ask(T('שולחן נקי', 'Clean desktop'), T('לסגור את כל חלונות הקריאה והתוצאות ולהתחיל שולחן נקי? חלון הגימטריה יישאר.', 'Close all reader and results windows and start a clean desktop? The gematria window stays.'), T('סגירה', 'Close all'), T('ביטול', 'Cancel'))
        .then(ok => { if (!ok) return; D.wins.filter(w => w.k !== 'gem').forEach(w => closeWin(w.id)); const g = gemW(); g.max = true; focusWin(g.id); });
      return;
    }
    vis.forEach((w, i) => {
      w.max = false;
      if (kind === 'cascade') { w.w = Math.round(W0 * .62); w.h = Math.round(H0 * .78); w.x = W0 - w.w - 24 - i * 34; w.y = 16 + i * 30; }
      else if (kind === 'side') { const n = vis.length, cw = Math.floor((W0 - 6) / n); w.w = cw - 6; w.h = H0 - 12; w.y = 6; w.x = W0 - (i + 1) * cw; }
      else { const n = vis.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), cw = Math.floor((W0 - 6) / cols), ch = Math.floor((H0 - 6) / rows); w.w = cw - 6; w.h = ch - 6; w.x = W0 - ((i % cols) + 1) * cw; w.y = 6 + Math.floor(i / cols) * ch; }
      paint(w);
    });
    saveSoon();
  }

  /* ---------- שורת משימות ---------- */
  function taskbar() {
    const n = reads().length;
    task.innerHTML = '';
    D.wins.slice().sort((a, b) => (a.k === 'gem' ? -1 : b.k === 'gem' ? 1 : 0)).forEach(w => {
      const c = document.createElement('button'); c.type = 'button';
      c.className = 'dkChip' + (w.min ? ' min' : '') + (D.act === w.id && !w.min ? ' on' : '');
      const t = w.k === 'gem' ? T('גימטריה', 'Gematria') : (w.t || T('קריאה', 'Reader'));
      c.innerHTML = '<span class="ic">' + ICON[w.k] + '</span><span class="t"></span>' + (w.min ? '<span class="z">💤</span>' : '');
      c.querySelector('.t').textContent = t;
      c.title = t + (w.min ? ' — ' + T('ממוזער, המקום נשמר', 'minimized, place kept') : '');
      c.onclick = () => { if (D.act === w.id && !w.min) minimize(w.id); else focusWin(w.id); };
      if (w.min) {
      }
      task.appendChild(c);
    });
    task.insertAdjacentHTML('beforeend', '<span class="dkSp"></span><span class="dkCnt" title="' + T('חלונות קריאה', 'Reader windows') + '">' + n + '/' + MAXR + '</span>' +
      '<button type="button" class="dkChip dkTool" id="dkAdd" title="' + T('חלון קריאה חדש', 'New reader window') + '"><span class="ic">＋</span><span class="t">' + T('קריאה', 'Reader') + '</span></button>' +
      '<button type="button" class="dkChip dkTool" id="dkArrBtn" title="' + T('סידור חלונות', 'Arrange windows') + '"><span class="ic">⊞</span><span class="t">' + T('סידור', 'Arrange') + '</span></button>');
    $('#dkAdd').onclick = () => { const l = W(D.last); openRead(l ? curHash(l) : '#read', true); };
    $('#dkArrBtn').onclick = e => { e.stopPropagation(); $('#dkArr').hidden = !$('#dkArr').hidden; };
  }
  $('#dkArr').addEventListener('click', e => { const b = e.target.closest('[data-arr]'); if (b) { $('#dkArr').hidden = true; arrange(b.dataset.arr); } });
  document.addEventListener('click', e => { if (!e.target.closest('#dkArr,#dkArrBtn')) $('#dkArr').hidden = true; });
  // תצוגה מקדימה בריחוף על חלון ממוזער: הכותרת והקטע ששמרנו ב-State, בלי לטעון את החלון
  let toastT = 0;
  function toast(s) { const t = $('#dkToast'); t.textContent = s; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500); }

  /* ---------- בנר קבוע ---------- */
  // הבנר משקף את החלון הפעיל: בחירת הספר והכלים הם עותק של האלמנטים בחלון (בלי ה-scripts), ולחיצה על עותק
  // מפעילה את המקור לפי אותו מסלול (אינדקסים של ילדים). כשהמקור משתנה — משכפלים שוב.
  const readerF = () => { const w = W(D.act); if (w && w.k === 'read') return F.get(w.id); const l = W(D.last); return l && F.get(l.id); };
  function pathOf(el, root) { const p = []; while (el && el !== root) { p.unshift([...el.parentNode.children].indexOf(el)); el = el.parentNode; } return el === root ? p : null; }
  const byPath = (root, p) => p.reduce((n, i) => n && n.children[i], root);
  function cloneInto(slot, src) { slot.textContent = ''; if (src) [...src.childNodes].forEach(n => slot.appendChild(document.importNode(n, true))); slot.querySelectorAll('[id]').forEach(x => { x.dataset.srcId = x.id; x.removeAttribute('id'); }); }
  function banner() {
    const w = W(D.act), gem = !!w && w.k === 'gem', other = !!w && w.k !== 'read';
    document.body.classList.toggle('dkGem', gem); document.body.classList.toggle('dkOther', other);
    $('#dkGemTools').hidden = !gem;
    const f = readerF(), d = f && f.doc;
    cloneInto(nav, d && d.querySelector('#rdTop .rdNav'));
    cloneInto(tools, d && !other && d.querySelector('#rdTop .rdTools'));
    nav.classList.toggle('dim', other);
    nav.title = other ? T('חלון הקריאה האחרון', 'Last reader window') : '';
    scopeLabel();
  }
  let lastR = 0; // הקצה הימני של הכפתור בזמן הלחיצה (הכפתור עצמו נבנה מחדש עם הבנר)
  let lastBtn = null; // כפתור הבנר שנלחץ אחרון — החלון הקופץ ייפתח מתחתיו
  function fwdClick(slot, srcSel, e) {
    const t = e.target.closest('button,label,input'); if (!t || !slot.contains(t)) return;
    const f = readerF(); if (!f || !f.doc) return;
    if (slot === nav && document.body.classList.contains('dkOther')) { if (D.last && W(D.last)) focusWin(D.last); return; }
    const p = pathOf(t, slot), src = f.doc.querySelector(srcSel), o = p && src && byPath(src, p);
    if (o) { e.preventDefault(); lastBtn = t; lastR = t.getBoundingClientRect().right; o.click(); setTimeout(banner, 60); setTimeout(() => placePops(f), 30); }
  }
  nav.addEventListener('click', e => fwdClick(nav, '#rdTop .rdNav', e));
  tools.addEventListener('click', e => fwdClick(tools, '#rdTop .rdTools', e));
  $('#dkGemTools').addEventListener('click', e => {
    const b = e.target.closest('[data-fwd]'), f = F.get(gemW().id);
    if (b && f && f.doc) { const o = f.doc.querySelector(b.dataset.fwd); if (o) o.click(); }
  });
  $('#dkKebab').onclick = () => { lastBtn = $('#dkKebab'); lastR = lastBtn.getBoundingClientRect().right; const f = F.get(D.act); const o = f && f.doc && f.doc.getElementById('mKebab'); if (o) o.click(); };

  // תיבת החיפוש: ההקלדה מועברת ל-#rdQ של "מארח חיפוש" — iframe שקוף (index.html?embed=search) שמציג רק את הרשימה
  // הנפתחת, מתחת לתיבה כמו במסך הרגיל. המארח נוצר רק כשמתחילים לחפש ולא פותח שום חלון; בחירת תוצאה פותחת אותה
  // בחלון הקריאה הפעיל, ואם אין כזה — בחלון חדש. אחרי דקה בלי חיפוש המארח נמחק (שחרור זיכרון).
  let H = null, hostBase = '', hostT = 0;
  const hostHash = () => { const w = W(D.act); const r = w && w.k === 'read' ? w : (W(D.last) || reads()[0]); return r ? curHash(r) : '#read'; };
  const dec = h => { try { return decodeURI(h || ''); } catch (e) { return h || ''; } };
  function host() {
    if (H) { clearTimeout(hostT); return H; }
    const fr = document.createElement('iframe'); fr.className = 'dkHost'; fr.title = T('תוצאות חיפוש', 'Search results'); fr.hidden = true;
    hostBase = hostHash(); H = { fr, doc: null, win: null, quiet: 0 };
    fr.addEventListener('load', () => {
      let fw, d; try { fw = fr.contentWindow; d = fr.contentDocument; } catch (e) { return; }
      if (!fw || !d || fw.location.href === 'about:blank') return;
      H.win = fw; H.doc = d; H.quiet = Date.now() + 2000;
      const hs = fw.history, rep = hs.replaceState.bind(hs);
      hs.replaceState = (...a) => { rep(...a); hostChanged(); };
      fw.addEventListener('hashchange', hostChanged);
      const drop = d.getElementById('rdDrop');
      if (drop) new fw.MutationObserver(() => { fr.hidden = drop.hidden; if (!drop.hidden) placeHost(); scopeLabel(); if (drop.hidden) idleHost(); }).observe(drop, { childList: true, attributes: true, attributeFilter: ['hidden'] });
      themeTo(H);
      if (q.value) { d.getElementById('rdQ').value = q.value; fire('input'); }
    });
    fr.src = 'index.html?embed=search' + hostBase;
    document.body.appendChild(fr);
    return H;
  }
  function placeHost() {
    if (!H) return; const r = $('#dkSearch').getBoundingClientRect(), wd = Math.max(r.width, 480);
    Object.assign(H.fr.style, { top: Math.round(r.bottom + 6) + 'px', right: Math.round(innerWidth - r.right) + 'px', width: Math.round(wd) + 'px', height: Math.round(Math.min(innerHeight * .74, 720)) + 'px' });
  }
  function idleHost() { clearTimeout(hostT); hostT = setTimeout(() => { if (H && !(H.doc && !H.doc.getElementById('rdDrop').hidden) && document.activeElement !== q) killHost(); }, 20000); }
  // המארח (עותק מלא של האפליקציה עם Workers משלו) משוחרר מיד כשנפתח חלון תוצאות, ואחרי 20 שניות סרק
  function killHost() { clearTimeout(hostT); if (H) { H.fr.src = 'about:blank'; H.fr.remove(); H = null; } }
  function syncHost() { const h = hostHash(); if (H && H.win && dec(H.win.location.hash) !== h) { hostBase = h; H.quiet = Date.now() + 1000; H.win.location.hash = h; } }
  const fire = (type, init) => { if (!H || !H.doc) return; const rq = H.doc.getElementById('rdQ'), fw = H.win; const C = type === 'keydown' ? fw.KeyboardEvent : type === 'focus' ? fw.FocusEvent : fw.Event; rq.dispatchEvent(new C(type, Object.assign({ bubbles: type !== 'focus', cancelable: true }, init))); };
  // המארח "ניווט" לתוצאה שנבחרה → פותחים אותה בחלון (מה שלא שונה מאז הטעינה/הסנכרון הוא לא בחירה)
  function hostChanged() {
    if (!H || !H.win) return; const h = dec(H.win.location.hash);
    if (!/^#read/i.test(h) || h === hostBase) return;
    hostBase = h; if (Date.now() < H.quiet) return;
    const qv = H.doc.getElementById('rdQ').value, a = W(D.act), l = W(D.last);
    let t = a && !a.min && a.k === 'read' ? a : a && a.k === 'gem' && l && !l.min ? l : null;
    if (t) { focusWin(t.id); navPush(t, h); } else t = openRead(h, true);
    let n = 0; const tick = () => { const f = F.get(t.id); const gr = f && f.win && f.win.GimReader; if (gr && gr.highlight) setTimeout(() => gr.highlight(qv), 400); else if (++n < 30) setTimeout(tick, 300); }; tick();
  }
  function closeSearch() { if (H && H.doc && !H.doc.getElementById('rdDrop').hidden) fire('keydown', { key: 'Escape' }); }
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#dkSearch,.dkHost')) closeSearch(); }, true);
  q.addEventListener('focus', () => { host(); syncHost(); fire('focus'); });
  q.addEventListener('input', () => { host(); syncHost(); if (!H.doc) return; H.doc.getElementById('rdQ').value = q.value; fire('input'); });
  let arrowed = false; q.addEventListener('input', () => { arrowed = false; });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') arrowed = true;
    // Enter אחרי מילות חיפוש (בלי לבחור תוצאה בחצים) פותח חלון "תוצאות חיפוש"; עם בחירה בחצים — פותח את התוצאה
    if (e.key === 'Enter' && !arrowed && q.value.trim().length >= 2) { e.preventDefault(); closeSearch(); killHost(); openResults(q.value.trim()); q.blur(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key) || !H || !H.doc) return;
    e.preventDefault(); H.doc.getElementById('rdQ').value = q.value; fire('keydown', { key: e.key });
    if (e.key === 'Enter') setTimeout(() => q.blur(), 80);
  });
  // טווח החיפוש: התווית לפי הכפתור הפעיל ברשימה של המארח; לחיצה עוברת לטווח הבא
  function scopeLabel() {
    const b = H && H.doc && H.doc.querySelector('#rdDrop .rdDScope button.on');
    $('#dkScope').textContent = (b ? b.textContent.trim() : T('חיפוש בספר', 'In this book')) + ' ▾';
  }
  $('#dkScope').addEventListener('click', e => {
    e.preventDefault(); host(); syncHost();
    const bs = H.doc ? [...H.doc.querySelectorAll('#rdDrop .rdDScope button')] : [];
    if (!bs.length || H.doc.getElementById('rdDrop').hidden) { q.focus(); return; }
    const i = bs.findIndex(b => b.classList.contains('on')); bs[(i + 1) % bs.length].click(); setTimeout(scopeLabel, 80);
  });
  addEventListener('resize', placeHost);
  // חימום מטמון ה-HTTP: מנוע ה-SQLite (wasm ו-Worker) יורדים כבר כשהמשתמש מתחיל לחפש, כך שחלון התוצאות לא מחכה להם (בלי להפעיל Workers — זיכרון)
  let warmed = false;
  q.addEventListener('focus', () => { if (warmed) return; warmed = true; ['vendor/sql.js-httpvfs/sql-wasm.wasm', 'vendor/sql.js-httpvfs/sqlite.worker.js'].forEach(u => fetch(u).catch(() => {})); });

  // חלונות קופצים שנפתחים מהבנר (מעבר לפרק, הגדרות תצוגה, הדפסה…) "נופלים" מתחת לכפתור שהפעיל אותם:
  // אותו קצה אופקי של הכפתור, בתוך גבולות החלון, עם אנימציית ירידה (styles.css: gtEmbed .rdPop)
  // חלונות הבחירה של הקורא (מעבר לפרק, הגדרות, הדפסה) נפתחים תמיד מתחת לבנר, מימין — בלי קשר למיקום או לגודל החלון.
  // האלמנט מועבר מה-iframe לשכבה קבועה בשולחן (adoptNode) וחוזר למקומו כשהוא נסגר; G.GT_POPS גורם לקוד הקורא למצוא אותו.
  const popLayer = document.createElement('div'); popLayer.className = 'dkPopLayer reader'; document.body.appendChild(popLayer);
  const POPS = ['rdJump', 'rdSet', 'rdPrintPop'];
  function syncPops(w, f) {
    if (!f || !f.doc || !f.win) return;
    f.pops = f.pops || {}; f.home = f.home || {};
    POPS.forEach(id => {
      const lifted = f.pops[id], el = lifted || f.doc.getElementById(id); if (!el) return;
      if (!lifted && !el.hidden) {
        f.home[id] = { p: el.parentNode, n: el.nextSibling };
        popLayer.style.top = ($('#dkBan').getBoundingClientRect().bottom + 4) + 'px';
        popLayer.appendChild(document.adoptNode(el)); popLayer.dataset.w = w.id;
        f.pops[id] = el; f.win.GT_POPS = Object.fromEntries(Object.keys(f.pops).map(k => ['#' + k, f.pops[k]]));
        if (!el._dk) { el._dk = new MutationObserver(() => syncPops(w, f)); el._dk.observe(el, { attributes: true, attributeFilter: ['hidden'], childList: true }); }
        if (id === 'rdJump') jumpExtras(w, f);
      } else if (lifted && lifted.hidden) {
        const h = f.home[id]; delete f.pops[id];
        f.win.GT_POPS = Object.fromEntries(Object.keys(f.pops).map(k => ['#' + k, f.pops[k]]));
        if (h && h.p && h.p.isConnected) h.p.insertBefore(f.doc.adoptNode(lifted), h.n && h.n.parentNode === h.p ? h.n : null);
      } else if (lifted && id === 'rdJump') jumpExtras(w, f);
    });
  }
  // לחיצה בשולחן מחוץ לחלון הבחירה (ולא על הבנר, שמחליף אותו בעצמו) סוגרת אותו; כך גם Esc
  const closeLifted = () => { const f = F.get(popLayer.dataset.w); if (f && f.pops && Object.keys(f.pops).length) { const sc = f.doc.getElementById('rdScrim'); if (sc) sc.click(); } };
  document.addEventListener('pointerdown', e => { if (!popLayer.contains(e.target) && !e.target.closest('#dkBan')) closeLifted(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && popLayer.querySelector('.rdPop:not([hidden])')) closeLifted(); }, true);
  function placePops(f) {
    if (!f || !f.doc || !f.fr) return;
    if (!lastBtn) return;
    const fr = f.fr.getBoundingClientRect(), br = { right: lastR };
    f.doc.querySelectorAll('.rdPop:not([hidden])').forEach(p => {
      const w = p.offsetWidth, W0 = fr.width;
      const right = Math.max(8, Math.min(W0 - w - 8, W0 - (br.right - fr.left)));
      if (p.dataset.dkR !== right + ':' + W0) { p.dataset.dkR = right + ':' + W0; p.style.insetInlineStart = 'auto'; p.style.insetInlineEnd = 'auto'; p.style.left = 'auto'; p.style.right = right + 'px'; p.style.top = '8px'; }
    });
  }
  function watchReader(w, f) {
    const d = f.doc, top = d.getElementById('rdTop'); if (!top) return;
    let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => { const a = W(D.act); if (a && (a.id === w.id || (a.k === 'gem' && D.last === w.id))) banner(); }, 40); };
    const o1 = new f.win.MutationObserver(later);
    [top.querySelector('.rdNav'), top.querySelector('.rdTools')].forEach(n => n && o1.observe(n, { subtree: true, childList: true, attributes: true, characterData: true }));
    const drop = d.getElementById('rdDrop');
    const o2 = { disconnect() {} };
    // חלון "מעבר לפרק ופסוק": ☆ / ⧉ / 🔢
    const rd = d.getElementById('reader');
    const o3 = new f.win.MutationObserver(() => { syncPops(w, f); placePops(f); });
    if (rd) o3.observe(rd, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    f.obs.push(o1, o2, o3);
  }

  /* ---------- ☆ סימניות / ⧉ בחלון חדש / 🔢 גימטריבון בחלון "מעבר לפרק ופסוק" ---------- */
  const marks = () => { try { return JSON.parse(localStorage.getItem(MARKS)) || []; } catch (e) { return []; } };
  const setMarks = m => { try { localStorage.setItem(MARKS, JSON.stringify(m)); } catch (e) {} };
  function jumpExtras(w, f) {
    const j = (f.pops && f.pops.rdJump) || f.doc.getElementById('rdJump'); if (!j) return;
    const foot = j.querySelector('.rdJFoot'), hd = j.querySelector('.rdPopHd'), go = foot && foot.querySelector('.rdGo');
    if (!foot || !hd || !go || foot.querySelector('.dkJ')) return;
    if (!document.getElementById('dkJStyle')) {
      const st = document.createElement('style'); st.id = 'dkJStyle';
      st.textContent = '.rdJFoot .dkJ{display:flex;gap:8px;align-items:center;margin-inline-start:auto}' +
        '.rdJFoot .dkJB{height:34px;padding:0 12px;border:1px solid var(--ln);border-radius:10px;background:var(--pn);color:var(--tx);font:600 13px var(--ui);white-space:nowrap;display:inline-flex;align-items:center;gap:6px;cursor:pointer}' +
        '.rdJFoot .dkJB .s{color:var(--gold);font-size:15px}' +
        '.rdPopHd .dkJGem{height:30px;padding:0 12px;border:1px solid var(--gold);border-radius:999px;background:transparent;color:var(--gold);font:600 13px var(--ui);white-space:nowrap;margin-inline-start:auto;margin-inline-end:8px;cursor:pointer}' +
        '.dkJMarks{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:0 2px 8px;font:12px var(--ui);color:var(--mu)}' +
        '.dkJMarks button{height:26px;padding:0 10px;border:1px solid var(--ln);border-radius:999px;background:var(--pn2);color:var(--tx);font:12px var(--ui);cursor:pointer}';
      document.head.appendChild(st);
    }
    const hint = foot.querySelector('span'); if (hint) hint.innerHTML = '<b>← →</b> ' + T('דפדוף', 'page') + ' · <b>Ctrl G</b>';
    const g = f.doc.createElement('div'); g.className = 'dkJ';
    const cur = () => curHash(w), isMarked = () => marks().some(m => m.h === cur());
    g.innerHTML = '<button type="button" class="dkJB" data-j="mark"><span class="s"></span> ' + T('סימניה', 'Bookmark') + '</button>' +
      '<button type="button" class="dkJB" data-j="new" title="' + T('פתיחת המקום הנבחר בחלון קריאה חדש', 'Open the chosen place in a new reader window') + '">⧉ ' + T('בחלון חדש', 'New window') + '</button>';
    const star = () => { const s = g.querySelector('.s'); s.textContent = isMarked() ? '★' : '☆'; s.parentNode.title = isMarked() ? T('הסרת הסימניה', 'Remove bookmark') : T('סימניה למקום הנוכחי', 'Bookmark this place'); };
    star();
    foot.insertBefore(g, go); g.appendChild(go);
    const close = () => { const x = hd.querySelector('[data-close],.rdX,button:last-child'); if (x) x.click(); };
    g.addEventListener('click', e => {
      const b = e.target.closest('[data-j]'); if (!b) return;
      if (b.dataset.j === 'mark') {
        const m = marks(), h = cur(), i = m.findIndex(x => x.h === h);
        if (i >= 0) m.splice(i, 1); else m.unshift({ h, t: w.t || h });
        setMarks(m.slice(0, 30)); star(); listMarks();
      } else {
        const h0 = cur(); go.click();
        setTimeout(() => { const h1 = decodeURI(f.win.location.hash); if (chKey(h1) !== chKey(h0)) { if (w.hi > 0 && w.hist[w.hi] === h1) { w.hist.splice(w.hi, 1); w.hi--; } navTo(w, h0); paint(w); } openRead(h1, true); }, 60);
      }
    });
    // רשימת הסימניות מתחת לכותרת
    const list = f.doc.createElement('div'); list.className = 'dkJMarks'; hd.after(list);
    function listMarks() {
      const m = marks(); list.hidden = !m.length; list.textContent = '';
      if (!m.length) return;
      list.append(T('סימניות:', 'Bookmarks:'));
      m.forEach(x => { const b = f.doc.createElement('button'); b.type = 'button'; b.textContent = '★ ' + x.t; b.title = x.h; b.onclick = () => { close(); navPush(w, x.h); }; list.appendChild(b); });
    }
    listMarks();
  }

  /* ---------- מקלדת, מראה, שפה ---------- */
  function keys(e, id) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopImmediatePropagation(); q.focus(); q.select(); }
    else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const w = W(id || D.act); if (w && w.k === 'read') { e.preventDefault(); e.stopImmediatePropagation(); go(w.id, e.key === 'ArrowRight' ? -1 : 1); } }
  }
  document.addEventListener('keydown', e => keys(e));
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  function themeTo(f) { const c = f.doc && f.doc.getElementById('themeChk'); if (c && c.checked !== dark()) c.click(); }
  $('#dkTheme').checked = dark();
  $('#dkTheme').addEventListener('change', () => {
    const on = $('#dkTheme').checked;
    if (on) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('gimatrivonTheme', on ? 'dark' : 'light'); } catch (e) {}
    F.forEach(themeTo); if (H) themeTo(H);
  });
  $('#dkLang').textContent = EN ? 'עב' : 'EN';
  $('#dkLang').onclick = () => { D.wins.forEach(snapshot); save(); try { localStorage.setItem('gimatrivonLang', EN ? 'he' : 'en'); } catch (e) {} location.reload(); };
  if (EN) { document.documentElement.lang = 'en'; q.placeholder = 'Search, or jump: "Exodus 12 2"'; $('#dkGemTools').firstElementChild.textContent = 'Gematria methods'; }

  // הודעות מהחלונות (reader.js): תוצאת גימטריה → חלון קריאה; ניסיון לעבור לגימטריה מחלון קריאה → חלון הגימטריה
  addEventListener('message', e => {
    const m = e.data; if (!m || !m.gtDesk || e.origin !== location.origin) return;
    if (m.gtDesk === 'res') return fromResults(m);
    if (m.gtDesk === 'open') openRead(m.hash);
    else if (m.gtDesk === 'gem') openGem();
  });
  addEventListener('hashchange', () => fromUrl());
  addEventListener('pagehide', () => { D.wins.forEach(snapshot); save(); });
  addEventListener('resize', () => D.wins.forEach(w => { if (!w.max) { w.x = Math.min(w.x, Math.max(0, desk.clientWidth - 120)); w.y = Math.min(w.y, Math.max(0, desk.clientHeight - 40)); paint(w); } }));

  // כתובת: #read/… פותח את המקום (בחלון שכבר מציג אותו, או בחלון חדש); #gim — חלון הגימטריה
  function fromUrl() {
    const h = decodeURI(location.hash || '');
    if (/^#gim$/i.test(h)) openGem();
    else if (/^#read/i.test(h)) { const w = reads().find(x => chKey(curHash(x)) === chKey(h)); if (w) focusWin(w.id); else if (!W(D.act) || curHash(W(D.act)) !== h) openRead(h, true); }
  }

  /* ---------- מצב פיתוח ומצב טלפון ---------- */
  // 5 לחיצות על מספר הגרסה: מצב פיתוח (ענף ופרטי בנייה) — מועבר לספר הגרסה של אחד החלונות (app.js), והטקסט מועתק לבנר
  { let taps = 0, tt = 0;
    $('#dkVer').addEventListener('click', () => {
      taps++; clearTimeout(tt); tt = setTimeout(() => { taps = 0; }, 3000); if (taps < 5) return; taps = 0;
      const f = [...F.values()].find(x => x.doc && x.doc.getElementById('ver')); if (!f) return;
      const v = f.doc.getElementById('ver'); for (let i = 0; i < 5; i++) v.click();
      $('#dkVer').textContent = v.textContent;
      toast(T('מצב פיתוח הוחלף. פרטי הבנייה בחלון "אודות"', 'Dev mode toggled. Build details are in About'));
    });
    // 5 לחיצות מהירות על "גימטריבון": מצב טלפון — עוברים למסך הרגיל במצב טלפון (וחוזרים עם #desktop)
    let n = 0, t = 0;
    document.querySelector('.brand h1').addEventListener('click', () => { const now = Date.now(); n = now - t < 700 ? n + 1 : 1; t = now; if (n >= 5) { n = 0; D.wins.forEach(snapshot); save(); location.href = 'index.html?classic=1#phone'; } });
  }
  if (location.hash === '#phone') location.replace('index.html?classic=1#phone');

  /* ---------- התחלה ---------- */
  D.wins.forEach(w => { if (w.k === 'read' && (!Array.isArray(w.hist) || !w.hist.length)) { w.hist = ['#read']; w.hi = 0; } w.navTo = null; });
  D.wins.forEach(build);
  D.wins.forEach(w => { if (!w.min && w.id !== D.act) sleepFrame(w); });
  if (!W(D.act) || W(D.act).min) { const n = topVisible(); D.act = n ? n.id : ''; }
  if (D.act) focusWin(D.act);
  if (location.hash) fromUrl(); else syncUrl();
  taskbar(); banner();
})();
