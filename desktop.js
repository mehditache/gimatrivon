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
  const SV = d => '<svg class="gi" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const GI = { gem: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>', read: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 19v2H6.5"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', arr: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    min: '<path d="M5 12h14"/>', max: '<path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4"/>', res: '<path d="M9 5v4H5M15 5v4h4M9 19v-4H5M15 19v-4h4"/>', x: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="m9 5 7 7-7 7"/>', fwd: '<path d="m15 5-7 7 7 7"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', dn: '<path d="m6 9 6 6 6-6"/>', kb: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', stage: '<rect x="7" y="5" width="13" height="14" rx="2"/><path d="M4 8v8"/>' };
  const ICON = { gem: SV(GI.gem), read: SV(GI.read), search: SV(GI.search) }, MAXS = 3;
  const curHash = w => w.k === 'gem' ? '#gim' : w.k === 'search' ? '#find' : (w.hist[w.hi] || '#read');
  const srcOf = w => w.k === 'search' ? 'index.html?embed=results&wid=' + w.id + '&q=' + encodeURIComponent(w.q) + '&f=' + encodeURIComponent(JSON.stringify(w.fs || {})) : 'index.html?embed=' + w.k + curHash(w);
  // מפתח "פרק" של כתובת: מעבר בתוך אותו פרק/דף מחליף את הרשומה הנוכחית בהיסטוריה, מעבר לפרק אחר מוסיף רשומה
  const chKey = h => String(h).split('/').slice(0, 4).join('/'); // #read/TN/Gen/2, #read/TB/<מסכת>/<דף>, #read/TUR/<חלק>/<סימן>

  // מצב "במה" (ברירת מחדל): רק החלון הפעיל מוצג במרכז, האחרים אריחים בפס הצדדי; סידור אחר מכבה אותו
  const stageOn = () => D.stage !== false;

  function build(w) {
    const el = document.createElement('section');
    el.className = 'dw'; el.dataset.id = w.id;
    el.innerHTML = '<div class="dwBar">' +
      '<span class="dwCtl">' + (w.k !== 'gem' ? '<button type="button" class="x" data-a="close" title="' + T('סגירה', 'Close') + '">' + SV(GI.x) + '</button>' : '<span class="dwNoX"></span>') +
      '<button type="button" class="m" data-a="min" title="' + T('מזעור', 'Minimize') + '">' + SV(GI.min) + '</button><button type="button" class="z" data-a="max" title="' + T('הגדלה / שחזור', 'Maximize / restore') + '">' + SV(GI.max) + '</button></span>' +
      '<b class="dwT"></b>' +
      (w.k === 'read' ? '<span class="dwNav"><button type="button" data-a="back" title="' + T('אחורה', 'Back') + '">' + SV(GI.back) + '</button><button type="button" data-a="fwd" title="' + T('קדימה', 'Forward') + '">' + SV(GI.fwd) + '</button></span>' : '<span class="dwNav"></span>') + '</div>' +
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
    const st = stageOn();
    el.hidden = !!w.min || (stageOn() && D.act !== w.id);
    el.classList.toggle('max', !!w.max);
    el.classList.toggle('stage', st && !w.max);
    el.classList.toggle('act', D.act === w.id);
    if (st) { const W0 = desk.clientWidth, H0 = desk.clientHeight, sw = Math.min(1100, W0 - 60), sh = H0 - 36; Object.assign(el.style, { left: Math.round((W0 - sw) / 2) + 'px', top: '18px', width: sw + 'px', height: sh + 'px' }); }
    else if (!w.max) Object.assign(el.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' });
    el.style.zIndex = w.z;
    el.querySelector('.dwT').textContent = w.k === 'gem' ? T('גימטריבון', 'Gimatrivon') : (w.t || T('קריאה', 'Reader'));
    // מחליפים את האייקון רק כשהמצב השתנה: החלפה בכל paint מנתקת את ה-svg בין לחיצת העכבר לשחרור, והקליק אובד
    const mb = el.querySelector('[data-a="max"]'), ms = w.max ? 'res' : 'max';
    if (mb.dataset.st !== ms) { mb.dataset.st = ms; mb.innerHTML = SV(w.max ? GI.res : GI.max); }
    if (w.k === 'read') { el.querySelector('[data-a="back"]').disabled = w.hi <= 0; el.querySelector('[data-a="fwd"]').disabled = w.hi >= w.hist.length - 1; }
    wgrp();
  }

  // חלון מוגדל: פס החלון מוסתר, וכפתורי החלון וחיצי ההיסטוריה שלו עוברים לקבוצה בבנר (הבנר נשאר בגובה 56)
  function wgrp() {
    const wg = $('#dkWg');
    const w = W(D.act), on = !!w && !!w.max && !w.min, key = on ? w.id + '|' + w.k + '|' + w.hi + '|' + (w.hist ? w.hist.length : 0) : '';
    document.body.classList.toggle('dkMax', on);
    if (wg.dataset.k === key) return; wg.dataset.k = key; wg.hidden = !on;
    if (!on) { wg.textContent = ''; return; }
    wg.innerHTML = '<span class="dwCtl">' + (w.k !== 'gem' ? '<button type="button" class="x" data-a="close" title="' + T('סגירה', 'Close') + '">' + SV(GI.x) + '</button>' : '<span class="dwNoX"></span>') +
      '<button type="button" class="m" data-a="min" title="' + T('מזעור', 'Minimize') + '">' + SV(GI.min) + '</button><button type="button" class="z" data-a="max" title="' + T('שחזור גודל', 'Restore') + '">' + SV(GI.res) + '</button></span>' +
      (w.k === 'read' ? '<i class="dv"></i><span class="dwNav"><button type="button" data-a="back" title="' + T('אחורה', 'Back') + '"' + (w.hi <= 0 ? ' disabled' : '') + '>' + SV(GI.back) + '</button><button type="button" data-a="fwd" title="' + T('קדימה', 'Forward') + '"' + (w.hi >= w.hist.length - 1 ? ' disabled' : '') + '>' + SV(GI.fwd) + '</button></span>' : '');
  }
  $('#dkWg').addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'), w = W(D.act); if (!b || !w) return;
    const a = b.dataset.a;
    if (a === 'min') minimize(w.id); else if (a === 'max') toggleMax(w.id); else if (a === 'close') closeWin(w.id);
    else if (a === 'back') go(w.id, -1); else if (a === 'fwd') go(w.id, 1);
  });
  // לחיצה כפולה על שטח ריק בבנר מחזירה חלון מוגדל לגודלו
  $('#dkBan').addEventListener('dblclick', e => { const w = W(D.act); if (w && w.max && !e.target.closest('button,input,label,a,.dkOmni,.dkNav,.dkTools')) toggleMax(w.id); });

  // טעינת ה-iframe של חלון (רק כשהוא גלוי ופעיל, או כשלוחצים עליו)
  function wake(w) {
    const f = F.get(w.id); if (!f || f.fr || w.min) return;
    w.at = Date.now();
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
    if (f.menuEl) { f.menuEl.remove(); f.menuEl = null; }
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
  /* ---------- שינה אוטומטית ---------- */
  // חלון שלא היה פעיל D.sl דקות (ולא נוגעים בו) משחרר את ה-iframe ונשאר במקומו עם "לחיצה להמשך"; המצב נשמר כמו במזעור. חלון הגימטריה לבדו
  // תופס כ-400MB (אינדקס האותיות), וכל חלון קריאה כ-90MB. החלון הפעיל וחלון הקריאה שהבנר משקף אף פעם לא ישנים.
  // חלון גלוי שלא פעיל: הגימטריה ישנה אחרי slMin דקות, חלונות קריאה ותוצאות אחרי פי שניים (ברירת מחדל 10 ו-20). חלון ממוזער (כל סוג): אחרי slMin דקות
  // מרגע המזעור או מהשימוש האחרון בו, לא קודם (v4.6.4). מזעור לא משחרר את החלון: הוא ממשיך להחזיק את מצבו ונפתח מיד, עד שהזמן נגמר.
  const SL_OPTS = [0, 5, 10, 30], slMin = () => D.sl == null ? 10 : D.sl, slFor = w => slMin() * (w.min || w.k === 'gem' ? 1 : 2);
  // כמה מילישניות נשארו לחלון עד השינה; null = לא ישן (כבוי, או החלון הפעיל / הקורא שהבנר משקף / עם פוקוס); undefined = כבר ישן
  const sleepLeft = w => {
    const f = F.get(w.id); if (!f || !f.fr) return undefined;
    if (!slMin() || w.id === D.act || (w.id === D.last && !w.min) || (!w.min && document.activeElement === f.fr)) return null;
    return slFor(w) * 60000 - (Date.now() - (w.at || Date.now()));
  };
  const slLabel = () => slMin() ? T('שינה אוטומטית: גימטריה ' + slMin() + ' · קריאה ' + slMin() * 2 + ' דק׳', 'Auto-sleep: gematria ' + slMin() + ' · reader ' + slMin() * 2 + ' min') : T('שינה אוטומטית: כבויה', 'Auto-sleep: off');
  function autoSleep() {
    if (!slMin()) return; const now = Date.now();
    D.wins.forEach(w => {
      const f = F.get(w.id); if (!f || !f.fr) return;
      if (!w.min && document.activeElement === f.fr) w.at = now;
      if (!w.at) w.at = now;
      const left = sleepLeft(w);
      if (left != null && left <= 0) { sleepFrame(w); taskbar(); }
    });
  }
  setInterval(autoSleep, 5000);
  // מצב פיתוח: ספירה לאחור לשינה על כל ריבוע בפס (מתעדכנת כל שנייה; בלי מצב פיתוח הריבועים נקיים)
  const devOn = () => { try { return localStorage.getItem('gimatrivonDev') === '1'; } catch (e) { return false; } };
  function sleepTick() {
    const dev = devOn();
    task.querySelectorAll('.dkChip[data-w]').forEach(c => {
      const w = W(c.dataset.w), l = w ? sleepLeft(w) : undefined;
      // הירח: רק כשהחלון ישן (ה-iframe שוחרר, המקום והמצב נשמרו). חלון ממוזער שעוד לא נרדם מסומן רק בשבב המקווקו
      let mz = c.querySelector('.z'); if (l === undefined && !mz) { mz = document.createElement('span'); mz.className = 'z'; mz.innerHTML = SV(GI.moon); c.appendChild(mz); } else if (l !== undefined && mz) mz.remove();
      let el = c.querySelector('.cd'); if (!dev) { if (el) el.remove(); return; }
      if (!el) { el = document.createElement('span'); el.className = 'cd'; c.appendChild(el); }
      el.className = 'cd' + (l === undefined ? ' sl' : l == null ? ' a' : l < 60000 ? ' s' : '');
      el.textContent = l === undefined ? T('ישן', 'asleep') : l == null ? (slMin() ? T('פעיל', 'active') : T('ללא שינה', 'no sleep')) : Math.floor(Math.max(0, l) / 60000) + ':' + String(Math.floor(Math.max(0, l) / 1000) % 60).padStart(2, '0');
      el.title = T('זמן עד שחרור מהזיכרון', 'Time until released from memory');
    });
  }
  setInterval(sleepTick, 1000); addEventListener('gimDevSync', sleepTick); addEventListener('storage', e => { if (e.key === 'gimatrivonDev') sleepTick(); });
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
    fw.addEventListener('focus', () => { if (Date.now() >= noFocus) focusWin(w.id); });
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
    const mp = d.getElementById('mMenuPanel'); // תפריט ה-⋮ של כל סוג חלון (גם גימטריה)
    if (mp) { const o4 = new fw.MutationObserver(() => syncMenu(w, f)); o4.observe(mp, { attributes: true, attributeFilter: ['class'] }); f.obs.push(o4); }
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
  // בלי חלון פעיל — בלי כתובת (אחרת טעינה מחדש פותחת את החלון האחרון)
  const syncUrl = () => { const w = W(D.act); if (!w) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} return; } try { history.replaceState(null, '', curHash(w)); } catch (e) {} };

  /* ---------- פעולות על חלונות ---------- */
  function focusWin(id) {
    const w = W(id); if (!w) return;
    if (w.min) { w.min = false; }
    const changed = D.act !== id;
    if (changed && stageOn()) { const o = W(D.act); if (o) { o.max = false; } w.max = false; }
    if (changed || w.z < D.z) w.z = ++D.z;
    D.act = id; if (w.k === 'read') D.last = id; w.at = Date.now();
    D.wins.forEach(paint); wake(w);
    if (changed) { banner(); syncUrl(); }
    taskbar(); saveSoon();
  }
  function topVisible(except) { return D.wins.filter(w => !w.min && w.id !== except).sort((a, b) => b.z - a.z)[0]; }
  function minimize(id) {
    const w = W(id); if (!w) return;
    w.min = true; w.at = Date.now(); paint(w);
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
  // ההיקף שנבחר ברשימה הנפתחת (מארח החיפוש): חלון התוצאות נפתח לפיו
  function hostScope() { try { const gr = H && H.doc && H.doc.defaultView.GimReader; return (gr && gr.dropScope && gr.dropScope()) || null; } catch (e) { return null; } }
  // חלון תוצאות מחומם מראש: נבנה מוסתר (ממוזער, לא ברשימת החלונות) כשמתחילים לחפש, כדי שה-Enter יציג תוצאות בלי להמתין לטעינת iframe
  let spare = null;
  function prewarm() {
    if (spare || searches().length >= MAXS || !/^https?:$/.test(location.protocol)) return;
    const w0 = { id: 's' + (D.seq++), k: 'search', x: 0, y: 0, w: 900, h: 600, max: false, min: true, z: 0, q: '', fs: {} };
    build(w0); const f = F.get(w0.id), fr = document.createElement('iframe');
    fr.title = T('תוצאות חיפוש', 'Search results'); fr.src = 'index.html?embed=results&spare=1&wid=' + w0.id;
    fr.addEventListener('load', () => { if (spare && spare.w === w0) spare.ready = true; });
    f.el.querySelector('.dwBody').appendChild(fr); f.fr = fr; spare = { w: w0, fr, ready: false };
  }
  function killSpare() { if (!spare) return; const f = F.get(spare.w.id); if (f) { f.el.remove(); F.delete(spare.w.id); } spare = null; }
  // הקשר החיפוש של הפקד (היקף + מקורות) כמצב ההתחלתי של חלון התוצאות
  const scFs = sc => sc ? { sel: sc.sel, scope: sc, srcOff: sc.srcOff || [] } : {};
  function openResults(qv, sc) {
    let w = searches().find(x => x.q === qv);
    if (w) { // אותה מילה כבר פתוחה: החלון מקבל את ההקשר הנוכחי של הפקד
      w.fs = scFs(sc); const f = F.get(w.id);
      try { if (f && f.fr && f.fr.contentWindow) f.fr.contentWindow.postMessage({ gtDesk: 'go', wid: w.id, q: qv, f: w.fs }, location.origin); } catch (e) {}
    }
    if (!w) {
      if (searches().length >= MAXS) closeWin(searches().sort((a, b) => a.z - b.z)[0].id);
      w = { id: 's' + (D.seq++), k: 'search', x: 80 + searches().length * 30, y: 30 + searches().length * 30, w: Math.min(1100, desk.clientWidth - 120), h: Math.min(720, desk.clientHeight - 50), max: false, min: false, z: ++D.z, q: qv, fs: scFs(sc), t: T('תוצאות: "', 'Results: "') + qv + '"', count: null };
      if (spare && spare.ready) { // מאמצים את החלון המחומם
        const s = spare; spare = null;
        Object.assign(s.w, { x: w.x, y: w.y, w: w.w, h: w.h, min: false, z: w.z, q: qv, fs: w.fs, t: w.t, count: null, at: Date.now() });
        w = s.w; D.wins.push(w); paint(w); attach(w, s.fr);
        try { s.fr.contentWindow.postMessage({ gtDesk: 'go', wid: w.id, q: qv, f: w.fs }, location.origin); } catch (e) {}
      } else { D.wins.push(w); build(w); }
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
  // גרירה או שינוי גודל במצב "במה" יוצאים ממנו לסידור חופשי: החלון הפעיל נשאר בדיוק איפה שהוא, והשאר חוזרים למקומם השמור
  function leaveStage(w) {
    if (!stageOn()) return;
    const el = F.get(w.id).el, r = desk.getBoundingClientRect(), b = el.getBoundingClientRect();
    Object.assign(w, { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height), max: false });
    D.stage = false; D.wins.forEach(paint); taskbar(); saveSoon();
  }
  function startDrag(e, id) {
    const w = W(id); if (!w || e.button !== 0) return;
    focusWin(id);
    const r = desk.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    if (w.max) { w.max = false; w.x = Math.max(0, Math.min(r.width - w.w, x0 - r.left - w.w / 2)); w.y = 0; paint(w); }
    let sx = w.x, sy = w.y, snap = null, ghost = null, moved = false;
    desk.classList.add('drag');
    const mv = ev => {
      if (stageOn()) { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return; leaveStage(w); sx = w.x; sy = w.y; }
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
      if (stageOn()) { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return; leaveStage(w); s.x = w.x; s.w = w.w; s.h = w.h; }
      const dx = ev.clientX - x0;
      w.h = Math.max(240, s.h + ev.clientY - y0);
      if (left) { w.w = Math.max(minW(w), s.w - dx); w.x = s.x + s.w - w.w; } else w.w = Math.max(minW(w), s.w + dx);
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
    if (kind === 'minall') { // כל החלונות מזוערים לשורת המשימות (המצב נשמר; פתיחה מחדש מהשבב)
      D.wins.forEach(w => { if (!w.min) { w.min = true; w.at = Date.now(); } }); D.act = '';
      D.wins.forEach(paint); banner(); syncUrl(); taskbar(); saveSoon(); return;
    }
    if (kind === 'stage') { D.stage = true; D.wins.forEach(w => { w.max = false; paint(w); }); taskbar(); saveSoon(); return; }
    D.stage = false;
    vis.forEach((w, i) => {
      w.max = false;
      if (kind === 'cascade') { w.w = Math.round(W0 * .62); w.h = Math.round(H0 * .78); w.x = W0 - w.w - 24 - i * 34; w.y = 16 + i * 30; }
      else if (kind === 'side') { const n = vis.length, cw = Math.floor((W0 - 6) / n); const g = vis.find(v => v.k === 'gem'), oth = g && n > 1 ? Math.max(360, Math.floor((W0 - 6 - minW(g)) / (n - 1)) - 6) : cw - 6; w.w = w.k === 'gem' ? Math.max(cw - 6, minW(w)) : oth; w.h = H0 - 12; w.y = 6; w.x = W0 - (i + 1) * cw; }
      else { const n = vis.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), cw = Math.floor((W0 - 6) / cols), ch = Math.floor((H0 - 6) / rows); w.w = cw - 6; w.h = ch - 6; w.x = W0 - ((i % cols) + 1) * cw; w.y = 6 + Math.floor(i / cols) * ch; }
      if (w.w < minW(w)) w.w = minW(w);
      paint(w);
    });
    // כשהחלונות לא נכנסים זה לצד זה (חלון הגימטריה דורש רוחב מינימלי) — הם חופפים חלקית במקום להיחתך
    if (kind === 'side' && vis.length > 1) {
      const n = vis.length, last = vis[n - 1], step = Math.max(40, Math.min(...vis.map((w, i) => w.w + 6), Math.floor((W0 - 12 - last.w) / (n - 1))));
      const fit = vis.reduce((a, w) => a + w.w + 6, 0) <= W0 - 6;
      vis.forEach((w, i) => { if (fit) { w.x = W0 - 6 - w.w - vis.slice(0, i).reduce((a, v) => a + v.w + 6, 0); } else w.x = Math.max(6, W0 - 6 - w.w - i * step); paint(w); });
    }
    D.wins.forEach(paint); taskbar(); saveSoon();
  }
  // רוחב מינימלי: מתחת ל-860px חלון הגימטריה עובר לפריסת טלפון וחלק מהעמודות לא נראה
  function minW(w) { return w.k === 'gem' ? Math.min(900, desk.clientWidth - 12) : 360; }

  /* ---------- שורת משימות ---------- */
  function taskbar() {
    const n = reads().length;
    task.innerHTML = '';
    const st = stageOn();
    D.wins.slice().sort((a, b) => (a.k === 'gem' ? -1 : b.k === 'gem' ? 1 : 0)).forEach(w => {
      if (st && D.act === w.id && w.k !== 'gem') return; // במה: החלון הפעיל במרכז, לא בפס; הגימטריה תמיד בפס
      const c = document.createElement('button'); c.type = 'button'; c.dataset.w = w.id;
      c.className = 'dkChip' + (st ? ' th' : '') + (w.min ? ' min' : '') + ((!st || w.k === 'gem') && D.act === w.id && !w.min ? ' on' : '');
      const t = w.k === 'gem' ? T('גימטריה', 'Gematria') : (w.t || T('קריאה', 'Reader'));
      const mini = w.k === 'gem' ? '<i class="mg"><u></u><u></u><u></u><u></u></i>' : w.k === 'search' ? '<i class="ml"><s></s><s></s><s></s><s></s></i>' : '<i class="mp"><em></em><s></s><s></s><s></s></i>';
      c.innerHTML = (st ? '<span class="thC">' + mini + '</span>' : '<span class="ic">' + ICON[w.k] + '</span>') + '<span class="t"></span>';
      c.querySelector('.t').textContent = t;
      c.title = t + (w.min ? ' — ' + T('ממוזער', 'minimized') : '') + (F.get(w.id) && !F.get(w.id).fr ? ' — ' + T('ישן: המקום נשמר, הזיכרון שוחרר', 'asleep: place kept, memory released') : '');
      c.onclick = () => { if (!st && D.act === w.id && !w.min) minimize(w.id); else focusWin(w.id); };
      task.appendChild(c);
    });
    task.insertAdjacentHTML('beforeend', '<span class="dkSp"></span><span class="dkCnt" title="' + T('חלונות קריאה', 'Reader windows') + '">' + n + '/' + MAXR + '</span>' +
      '<button type="button" class="dkChip dkTool" id="dkAdd" title="' + T('חלון קריאה חדש', 'New reader window') + '"><span class="ic">' + SV(GI.plus) + '</span><span class="t">' + T('קריאה', 'Reader') + '</span></button>' +
      '<button type="button" class="dkChip dkTool" id="dkArrBtn" title="' + T('סידור חלונות', 'Arrange windows') + '"><span class="ic">' + SV(GI.arr) + '</span><span class="t">' + T('סידור', 'Arrange') + '</span></button>');
    $('#dkArr [data-arr="stage"]').classList.toggle('cur', stageOn()); ['cascade', 'side', 'grid'].forEach(k => $('#dkArr [data-arr="' + k + '"]').classList.remove('cur'));
    sleepTick();
    $('#dkAdd').onclick = () => { const l = W(D.last); openRead(l ? curHash(l) : '#read', true); };
    $('#dkArrBtn').onclick = e => { e.stopPropagation(); const sl = $('#dkArr [data-sl]'); if (sl) sl.lastChild.textContent = slLabel(); $('#dkArr').hidden = !$('#dkArr').hidden; };
  }
  $('#dkArr').addEventListener('click', e => {
    const s = e.target.closest('[data-sl]'); if (s) { D.sl = SL_OPTS[(SL_OPTS.indexOf(slMin()) + 1) % SL_OPTS.length]; s.lastChild.textContent = slLabel(); saveSoon(); return; }
    const b = e.target.closest('[data-arr]'); if (b) { $('#dkArr').hidden = true; arrange(b.dataset.arr); }
  });
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
  // בורר הספר כשאין חלון: נפתח לפני שנפתח חלון. הבורר של מארח החיפוש (עותק נסתר של הקורא) מורם לשכבת הבורר של השולחן, ובבחירה המארח "מנווט"
  // ו-hostChanged פותח את המקום בחלון קריאה חדש. אם נסגר בלי בחירה — לא נפתח שום חלון
  function pickBook(tb) {
    host(); H.quiet = Date.now() + 1500; let n = 0;
    const tick = () => {
      const o = H && H.doc && H.doc.getElementById('rdWhere'), rd = H && H.doc && H.doc.getElementById('reader');
      if (!o || !rd) { if (++n < 50) setTimeout(tick, 150); return; }
      H.quiet = 0;
      const pw = { id: '__host', k: 'read', hist: [hostHash()], hi: 0, t: '' }, f = { doc: H.doc, win: H.win, fr: H.fr, obs: [], pops: {}, home: {} };
      F.set(pw.id, f); lastBtn = tb; lastR = tb.getBoundingClientRect().right; lastRc = rectOf(tb);
      const mo = new H.win.MutationObserver(() => {
        syncPops(pw, f);
        if (!Object.keys(f.pops).length) { mo.disconnect(); setTimeout(() => { F.delete(pw.id); if (!q.value) killHost(); }, 900); }
      });
      mo.observe(rd, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      o.click(); setTimeout(() => syncPops(pw, f), 60);
    };
    setTimeout(tick, 200);
  }
  const NAV_STUB = () => '<button type="button" class="rdIco" disabled aria-label="' + T('פרק קודם', 'Previous chapter') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button>' +
    '<button type="button" class="rdWhere" title="' + T('בחר ספר לקריאה', 'Choose a book to read') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"></path><path d="M4 19V5"></path></svg><span>' + T('בחר ספר לקריאה', 'Choose a book to read') + '</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>' +
    '<button type="button" class="rdIco" disabled aria-label="' + T('פרק הבא', 'Next chapter') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg></button>';
  // כפתור הסיור מהבהב 10 שניות בפעם הראשונה שחלון הגימטריה פעיל (כמו ב-index.html); לחיצה עוצרת מיד
  let attracted = false;
  function attractTour() {
    if (attracted) return; attracted = true;
    const b = $('#dkGemTools .tourBtn'); if (!b) return;
    b.classList.add('attract');
    const stop = () => b.classList.remove('attract');
    setTimeout(stop, 10000); b.addEventListener('pointerdown', stop, { once: true });
  }
  function banner() {
    const w = W(D.act), gem = !!w && w.k === 'gem', other = !!w && w.k !== 'read';
    document.body.classList.toggle('dkGem', gem); document.body.classList.toggle('dkOther', other);
    try { ctxSync(); } catch (e) {} // לפני אתחול המשתנים (טעינה ראשונה) — מדלגים
    $('#dkGemTools').hidden = !gem;
    if (gem) attractTour();
    const f = readerF(), d = f && f.doc;
    // בלי חלון פעיל (או בלי אף חלון קריאה): הפקד לא נעלם אלא מאופס — "בחר ספר לקריאה"; לחיצה פותחת חלון קריאה חדש
    const stub = !w || (w.k !== 'read' && !(D.last && W(D.last)));
    if (stub) { nav.dataset.stub = '1'; nav.innerHTML = NAV_STUB(); }
    else { delete nav.dataset.stub; cloneInto(nav, d && d.querySelector('#rdTop .rdNav')); }
    cloneInto(tools, d && w && !other && d.querySelector('#rdTop .rdTools')); // בלי חלון פעיל (הכול ממוזער) אין פקדי קריאה
    nav.classList.toggle('dim', other && !stub);
    nav.title = other && !stub ? T('חלון הקריאה האחרון', 'Last reader window') : '';
    scopeLabel();
  }
  let lastR = 0; // הקצה הימני של הכפתור בזמן הלחיצה (הכפתור עצמו נבנה מחדש עם הבנר)
  let lastRc = null; // המלבן המלא של הכפתור שנלחץ — מיקום הפופאפ נגזר ממנו
  let lastBtn = null; // כפתור הבנר שנלחץ אחרון — החלון הקופץ ייפתח מתחתיו
  function fwdClick(slot, srcSel, e) {
    const t = e.target.closest('button,label,input'); if (!t || !slot.contains(t)) return;
    if (slot === nav && nav.dataset.stub) { // פתיחת חלון קריאה חדש ובו בורר הספר
      if (!t.classList.contains('rdWhere')) return;
      if (reads().length >= MAXR) { const l = W(D.last) || reads()[0]; if (l) focusWin(l.id); return; }
      pickBook(t); return;
    }
    const f = readerF(); if (!f || !f.doc) return;
    if (slot === nav && document.body.classList.contains('dkOther')) { if (D.last && W(D.last)) focusWin(D.last); return; }
    const p = pathOf(t, slot), src = f.doc.querySelector(srcSel), o = p && src && byPath(src, p);
    if (o) { e.preventDefault(); lastBtn = t; lastR = t.getBoundingClientRect().right; lastRc = rectOf(t); o.click(); setTimeout(banner, 60); setTimeout(() => placePops(f), 30); }
  }
  nav.addEventListener('click', e => fwdClick(nav, '#rdTop .rdNav', e));
  tools.addEventListener('click', e => fwdClick(tools, '#rdTop .rdTools', e));
  $('#dkGemTools').addEventListener('click', e => {
    const b = e.target.closest('[data-fwd]'), f = F.get(gemW().id);
    if (b && f && f.doc) { const o = f.doc.querySelector(b.dataset.fwd); if (o) o.click(); }
  });
  // תפריט ⋯: עם חלון פעיל — התפריט של החלון; בלי חלון פעיל (הכול ממוזער) — תפריט של השולחן עצמו, בלי להחזיר חלון.
  // מראה ושפה פועלים ישר; סיור / שיטות / אודות / צור קשר הם דיאלוגים בתוך חלון, ולכן הלחיצה עליהם מחזירה את החלון האחרון
  const kb = document.createElement('div'); kb.className = 'dkScMenu dkKb'; kb.hidden = true; document.body.appendChild(kb);
  function kbMenu() {
    const row = (id, l, ic) => '<button type="button" data-kb="' + id + '"><i class="ic">' + ic + '</i><span>' + l + '</span></button>';
    kb.innerHTML = row('theme', dark() ? T('מראה גוויל', 'Parchment look') : T('מראה לילה', 'Night look'), '☾') + row('lang', EN ? 'עברית' : 'English', 'EN') +
      '<hr>' + row('methods', T('שיטות גימטריה', 'Gematria methods'), 'Σ') + row('about', T('אודות', 'About'), 'ⓘ') + row('contact', T('צור קשר', 'Contact'), '✉') +
      '<hr><div class="kbV">' + ($('#dkVer').textContent || '') + '</div>';
  }
  // דיאלוג (אודות / צור קשר / שיטות) שחי בתוך חלון נפתח כאן, בשולחן עצמו, בלי להחזיר חלון: הפריט נפתח ב-iframe נסתר (כך הוא מתרנדר ומתאפס),
  // ואז האלמנט עובר (adoptNode) למסמך השולחן ונפתח כמודאלי, וחוזר למקומו כשנסגר
  const DLG = { methods: ['openMethods', 'dlgMethods'], about: ['openAbout', 'dlgAbout'], contact: ['openContact', 'dlgContact'] };
  let noFocus = 0; // פתיחת הדיאלוג ב-iframe הנסתר מעבירה אליו פוקוס — זה לא צריך להחזיר את החלון
  function shellDialog(k) {
    const [btn, id] = DLG[k], f = [...F.values()].find(x => x.doc && x.doc.getElementById(id));
    if (!f) { toast(T('אין חלון פעיל לפתיחת הדיאלוג — פתחו חלון', 'No window available for this dialog — open a window')); return; }
    const o = f.doc.getElementById(btn), dlg = f.doc.getElementById(id), home = dlg.parentNode, next = dlg.nextSibling;
    noFocus = Date.now() + 1000; o.click();
    let gone = false;
    const go = () => {
      if (gone) return; gone = true;
      const el = document.adoptNode(dlg); document.body.appendChild(el);
      const back = () => { el.removeEventListener('close', back); el.removeEventListener('click', clk); try { home.insertBefore(f.doc.adoptNode(el), next); } catch (e) {} };
      const clk = e => { if (e.target === el || e.target.closest('[data-close]')) el.close(); };
      el.addEventListener('close', back); el.addEventListener('click', clk); el.showModal();
    };
    dlg.addEventListener('close', go, { once: true }); try { dlg.close(); } catch (e) {} setTimeout(go, 150); // 'close' נשלח אסינכרונית — מעבירים רק אחריו
  }
  const KB_IDS = { tour: 'startTour', methods: 'openMethods', about: 'openAbout', contact: 'openContact' };
  kb.addEventListener('click', e => {
    const b = e.target.closest('[data-kb]'); if (!b) return; const k = b.dataset.kb; kb.hidden = true;
    if (k === 'theme') { $('#dkTheme').click(); return; }
    if (k === 'lang') { $('#dkLang').click(); return; }
    if (k === 'tour') return; // הסיור מדגים חלון; בלי חלון פעיל אין מה להדגים (הפריט לא מוצג)
    shellDialog(k);
  });
  document.addEventListener('pointerdown', e => { if (!kb.hidden && !e.target.closest('.dkKb,#dkKebab')) kb.hidden = true; }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') kb.hidden = true; });
  $('#dkKebab').onclick = function () {
    if (!W(D.act)) {
      if (!kb.hidden) { kb.hidden = true; return; }
      kbMenu(); kb.hidden = false; const r = $('#dkKebab').getBoundingClientRect();
      kb.style.top = Math.round(r.bottom + 6) + 'px'; kb.style.left = Math.max(8, Math.round(r.left)) + 'px'; return;
    }
    lastBtn = $('#dkKebab'); lastR = lastBtn.getBoundingClientRect().right; lastRc = rectOf(lastBtn); const f = F.get(D.act); const o = f && f.doc && f.doc.getElementById('mKebab'); if (o) o.click();
  };

  // תיבת החיפוש: ההקלדה מועברת ל-#rdQ של "מארח חיפוש" — iframe שקוף (index.html?embed=search) שמציג רק את הרשימה
  // הנפתחת, מתחת לתיבה כמו במסך הרגיל. המארח נוצר רק כשמתחילים לחפש ולא פותח שום חלון; בחירת תוצאה פותחת אותה
  // בחלון הקריאה הפעיל, ואם אין כזה — בחלון חדש. אחרי דקה בלי חיפוש המארח נמחק (שחרור זיכרון).
  let H = null, hostBase = '', hostT = 0;
  const hostHash = () => { const w = W(D.act); if (w && w.k === 'gem') return '#read/TN/Gen/1'; const r = w && w.k === 'read' ? w : (W(D.last) || reads()[0]); return r ? curHash(r) : '#read'; };
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
      // הרשימה נפתחת רק כשתיבת החיפוש (או הרשימה עצמה) בפוקוס: מעבר בין חלונות מחליף את ההקשר של המארח, והקורא מרנדר אותה מחדש (v4.6.3)
      if (drop) new fw.MutationObserver(() => { const ae = document.activeElement; if (!drop.hidden && ae !== fr && !(ae && ae.closest && ae.closest('.dkOmni,#dkScMenu'))) drop.hidden = true; fr.hidden = drop.hidden; if (!drop.hidden) placeHost(); scopeLabel(); if (drop.hidden) idleHost(); }).observe(drop, { childList: true, attributes: true, attributeFilter: ['hidden'] });
      themeTo(H); ctxApply(); scopeLabel();
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
  function idleHost() { clearTimeout(hostT); hostT = setTimeout(() => { if (H && !(H.doc && !H.doc.getElementById('rdDrop').hidden) && document.activeElement !== q) { killHost(); killSpare(); } }, 20000); }
  // המארח (עותק מלא של האפליקציה עם Workers משלו) משוחרר מיד כשנפתח חלון תוצאות, ואחרי 20 שניות סרק
  function killHost() { clearTimeout(hostT); if (H) { H.fr.src = 'about:blank'; H.fr.remove(); H = null; } }
  function syncHost() { const h = hostHash(); if (H && H.win && dec(H.win.location.hash) !== h) { hostBase = h; H.quiet = Date.now() + 1000; H.win.location.hash = h; setTimeout(() => { ctxApply(); scopeLabel(); }, 350); } }
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
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#dkSearch,.dkHost,#dkScMenu')) closeSearch(); }, true);
  q.addEventListener('focus', () => { host(); syncHost(); ctxApply(); fire('focus'); setTimeout(prewarm, 1200); });
  q.addEventListener('input', () => { host(); syncHost(); if (!H.doc) return; H.doc.getElementById('rdQ').value = q.value; fire('input'); });
  let arrowed = false; q.addEventListener('input', () => { arrowed = false; });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') arrowed = true;
    // Enter אחרי מילות חיפוש (בלי לבחור תוצאה בחצים) פותח חלון "תוצאות חיפוש"; עם בחירה בחצים — פותח את התוצאה
    if (e.key === 'Enter' && !arrowed && q.value.trim().length >= 2) { e.preventDefault(); const sc = hostScope(); closeSearch(); killHost(); openResults(q.value.trim(), sc); q.blur(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key) || !H || !H.doc) return;
    e.preventDefault(); H.doc.getElementById('rdQ').value = q.value; fire('keydown', { key: e.key });
    if (e.key === 'Enter') setTimeout(() => q.blur(), 80);
  });
  // טווח החיפוש (אפשרות א בקנבס): הכפתור שבתיבה מראה את ההיקף הנוכחי ופותח תפריט — איפה לחפש (בחירה אחת) ומה לכלול (סימון).
  // המודל והפעולות של הקורא (GimReader) נשארים המקור היחיד; הבועות של הרשימה הנפתחת מוסתרות במארח.
  const gr = () => H && H.win && H.win.GimReader && H.win.GimReader.scopeModel ? H.win.GimReader : null;
  const model = () => { try { const g = gr(); return g && g.scopeModel(); } catch (e) { return null; } };
  let lastLbl = null;
  function scopeLabel() {
    const m = model(), l = m && (m.glob ? { label: T('בכל הספרים', 'All books') } : m.levels.find(x => x.on));
    const a = W(D.act);
    $('#dkScope').textContent = l ? (lastLbl = { id: a && a.id, t: l.label }).t : lastLbl && a && lastLbl.id === a.id ? lastLbl.t : document.body.classList.contains('dkGem') ? T('בכל התנ״ך', 'All Tanakh') : T('בספר', 'In book');
    if (!$('#dkScMenu').hidden) scMenu();
  }
  // ברירת מחדל לפי החלון הפעיל: קריאה = כל הספר בלי מפרשים; גימטריה = כל התנ״ך עם מפרשים. נקבעת פעם אחת כשהחלון הפעיל מתחלף; בחירה ידנית נשארת עד המעבר הבא
  let ctxKey = '';
  // החלון הפעיל התחלף (הבנר מתעדכן): ההקשר והתווית מתעדכנים מיד; בלי מארח חי — התווית של ברירת המחדל, וההקשר נקבע כשהמארח נוצר
  function ctxSync() {
    const a = W(D.act); if (!a || (a.k !== 'gem' && a.k !== 'read')) return;
    if (H && H.win) {
      syncHost();
      if (ctxApply()) $('#dkScope').textContent = a.k === 'gem' ? T('בכל התנ״ך', 'All Tanakh') : T('בספר', 'In book'); // מיד; התווית המדויקת (לפי תחום הספר) אחרי שהמארח עבר לספר
      setTimeout(scopeLabel, 450);
    } else scopeLabel();
  }
  function ctxApply() {
    const a = W(D.act), g = gr(); if (!a || !g || (a.k !== 'gem' && a.k !== 'read') || ctxKey === a.id) return;
    ctxKey = a.id; g.applyDefault(a.k); return true;
  }
  const scm = $('#dkScMenu'); document.body.appendChild(scm);
  function scMenu() {
    const m = model(); if (!m) return;
    const row = (cls, k, ic, l, n) => '<button type="button" class="' + cls + '" data-' + k + '>' + ic + '<span>' + l + '</span>' + (n ? '<small>' + n + '</small>' : '') + '</button>';
    const ck = '<i class="ck"></i>', bx = '<i class="bx"></i>';
    scm.innerHTML = '<h5>' + T('איפה לחפש', 'Search in') + '</h5>' + m.levels.map(l => row(l.on ? 'on' : '', 'sc="' + l.k + '"', ck, l.label, l.name)).join('') +
      row(m.glob ? 'on' : '', 'sc="glob"', ck, T('בכל הספרים', 'All books'), '') + '<hr><h5>' + T('מה לכלול', 'Include') + '</h5>' +
      m.srcs.map(x => row('cb' + (x.on ? ' on' : ''), 'tg="' + x.k + '"', bx, x.label, '')).join('');
  }
  function openScMenu() {
    host(); syncHost();
    if (!gr()) { H.fr.addEventListener('load', () => setTimeout(openScMenu, 200), { once: true }); return; }
    ctxApply(); scMenu(); setTimeout(() => { if (!scm.hidden) scMenu(); }, 400);
    const r = $('#dkScope').getBoundingClientRect(); scm.hidden = false;
    scm.style.top = Math.round(r.bottom + 6) + 'px'; scm.style.left = Math.max(8, Math.min(Math.round(r.left), innerWidth - scm.offsetWidth - 8)) + 'px';
  }
  scm.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !gr()) return; const g = gr();
    if (b.dataset.sc) { g.setScope(b.dataset.sc); scm.hidden = true; } else if (b.dataset.tg) g.toggleSrc(b.dataset.tg);
    scopeLabel(); if (b.dataset.tg) scMenu();
  });
  // תיבת החיפוש מכווצת כשאין בה פוקוס: לחיצה על הכפתור קודם מרחיבה אותה (בלי להעביר אליו פוקוס, כדי שהכפתור לא יזוז בין הלחיצה לשחרור) ורק אז נפתח התפריט
  $('#dkScope').addEventListener('mousedown', e => e.preventDefault());
  $('#dkScope').addEventListener('click', e => {
    e.preventDefault(); if (!scm.hidden) { scm.hidden = true; return; }
    if ($('.dkOmni').matches(':focus-within')) return openScMenu();
    q.focus(); setTimeout(openScMenu, 280);
  });
  document.addEventListener('pointerdown', e => { if (!scm.hidden && !e.target.closest('#dkScMenu,#dkScope')) scm.hidden = true; }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') scm.hidden = true; });
  addEventListener('resize', placeHost);
  $('#dkSearch').parentNode.addEventListener('transitionend', placeHost);
  // מחממים את הגמרא והטור (המסדים הגדולים) זמן קצר אחרי שהשולחן נטען; שאר התחומים — כשמתמקדים בתיבת החיפוש
  setTimeout(() => { const P = window.GimSqPool; if (P && /^https?:$/.test(location.protocol)) ['talmud', 'tur'].forEach((n, i) => setTimeout(() => P.engine(n).catch(() => {}), 1500 * i)); }, 6000);
  // חימום מטמון ה-HTTP: מנוע ה-SQLite (wasm ו-Worker) יורדים כבר כשהמשתמש מתחיל לחפש, כך שחלון התוצאות לא מחכה להם (בלי להפעיל Workers — זיכרון)
  let warmed = false;
  q.addEventListener('focus', () => { if (warmed) return; warmed = true; ['vendor/sql.js-httpvfs/sql-wasm.wasm', 'vendor/sql.js-httpvfs/sqlite.worker.js'].forEach(u => fetch(u).catch(() => {})); });

  // חלונות קופצים שנפתחים מהבנר (מעבר לפרק, הגדרות תצוגה, הדפסה…) "נופלים" מתחת לכפתור שהפעיל אותם:
  // אותו קצה אופקי של הכפתור, בתוך גבולות החלון, עם אנימציית ירידה (styles.css: gtEmbed .rdPop)
  // חלונות הבחירה של הקורא (מעבר לפרק, הגדרות, הדפסה) נפתחים תמיד מתחת לבנר, מימין — בלי קשר למיקום או לגודל החלון.
  // האלמנט מועבר מה-iframe לשכבה קבועה בשולחן (adoptNode) וחוזר למקומו כשהוא נסגר; G.GT_POPS גורם לקוד הקורא למצוא אותו.
  const popLayer = document.createElement('div'); popLayer.className = 'dkPopLayer reader'; document.body.appendChild(popLayer);
  const POPS = ['rdJump', 'rdSet', 'rdPrintPop'];
  const rectOf = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  // חלון קופץ נצמד מתחת לכפתור שפתח אותו: כפתור בחצי הימני — הקצה הימני שלו בקו הקצה הימני של הכפתור, בחצי השמאלי — הקצה השמאלי;
  // הנקודה (--ax) במרכז הכפתור. בלי כפתור ידוע (קיצור מקלדת) — כפתור בחירת המקום בבנר.
  function anchorRc() {
    if (lastRc && lastBtn && lastBtn.isConnected !== false) { const b = lastBtn.isConnected ? rectOf(lastBtn) : lastRc; if (b.right > b.left) return b; }
    const q = $('#dkNav button:not(:first-child):not(:last-child)') || $('#dkNav'); return rectOf(q);
  }
  function popX(el, rc, lay) {
    const wd = el.offsetWidth, c = (rc.left + rc.right) / 2, left = c < innerWidth / 2 ? rc.left : rc.right - wd;
    const x = Math.max(8, Math.min(innerWidth - 106 - wd, left));
    el.style.right = 'auto'; el.style.left = (x - (lay ? lay.left : 0)) + 'px';
    el.style.setProperty('--ax', Math.max(18, Math.min(wd - 18, c - x)) + 'px');
  }
  function syncPops(w, f) {
    if (!f || !f.doc || !f.win) return;
    f.pops = f.pops || {}; f.home = f.home || {};
    POPS.forEach(id => {
      const lifted = f.pops[id], el = lifted || f.doc.getElementById(id); if (!el) return;
      if (!lifted && !el.hidden) {
        f.home[id] = { p: el.parentNode, n: el.nextSibling };
        popLayer.style.top = ($('#dkBan').getBoundingClientRect().bottom + 6) + 'px';
        popLayer.appendChild(document.adoptNode(el)); popLayer.dataset.w = w.id;
        popX(el, anchorRc(), popLayer.getBoundingClientRect());
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
  // תפריט ה-⋮ (#mMenuPanel): נפתח מתחת לכפתור בבנר (מצב fixed של דף השולחן), לא בתוך החלון
  function syncMenu(w, f) {
    if (!f || !f.doc) return;
    const mp = f.menuEl || f.doc.getElementById('mMenuPanel'); if (!mp) return;
    const shown = mp.classList.contains('show');
    if (shown && !f.menuEl) {
      f.menuHome = { p: mp.parentNode, n: mp.nextSibling };
      document.body.appendChild(document.adoptNode(mp)); mp.classList.add('show'); mp.dataset.w = w.id; f.menuEl = mp;
      mp.style.zIndex = 160; mp.style.top = ($('#dkBan').getBoundingClientRect().bottom + 6) + 'px'; popX(mp, anchorRc(), null);
      new MutationObserver(() => syncMenu(w, f)).observe(mp, { attributes: true, attributeFilter: ['class'] });
    } else if (!shown && f.menuEl) {
      const home = f.menuHome; f.menuEl = null; // אחרי אנימציית הסגירה חוזר למקומו
      setTimeout(() => { if (home && home.p && home.p.isConnected) home.p.insertBefore(f.doc.adoptNode(mp), home.n && home.n.parentNode === home.p ? home.n : null); mp.style.zIndex = ''; mp.style.top = ''; if (f.win) { const o = new f.win.MutationObserver(() => syncMenu(w, f)); o.observe(mp, { attributes: true, attributeFilter: ['class'] }); (f.obs = f.obs || []).push(o); } }, 300);
    }
  }
  // לחיצה בשולחן מחוץ לחלון הבחירה (ולא על הבנר, שמחליף אותו בעצמו) סוגרת אותו; כך גם Esc
  const closeLifted = () => {
    const f = F.get(popLayer.dataset.w); if (f && f.pops && Object.keys(f.pops).length) { const sc = f.doc.getElementById('rdScrim'); if (sc) sc.click(); }
    F.forEach(g => { if (g.menuEl && g.doc) { const sc = g.doc.getElementById('mMenuScrim'); if (sc) sc.click(); } });
  };
  document.addEventListener('pointerdown', e => { if (!popLayer.contains(e.target) && !e.target.closest('#dkBan,#mMenuPanel')) closeLifted(); }, true);
  // לחיצה בתוך iframe של חלון אחר לא מגיעה לדף השולחן, אבל המיקוד עובר אליו — זה סוגר את החלון הקופץ
  addEventListener('blur', () => setTimeout(() => { if (document.activeElement && document.activeElement.tagName === 'IFRAME') closeLifted(); }, 0));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (popLayer.querySelector('.rdPop:not([hidden])') || document.querySelector('body > #mMenuPanel.show'))) closeLifted(); }, true);
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
    const gsv = (d, fill) => '<svg viewBox="0 0 24 24" width="14" height="14" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true">' + d + '</svg>';
    const STAR = 'm12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9-4.3-4.1 5.9-.8z';
    const hint = foot.querySelector('span'); if (hint) hint.innerHTML = '<b>← →</b> ' + T('דפדוף', 'page') + ' · <b>Ctrl G</b>';
    const g = f.doc.createElement('div'); g.className = 'dkJ';
    const cur = () => curHash(w), isMarked = () => marks().some(m => m.h === cur());
    g.innerHTML = '<button type="button" class="dkJB" data-j="mark"><span class="s"></span> ' + T('סימניה', 'Bookmark') + '</button>' +
      '<button type="button" class="dkJB" data-j="new" title="' + T('פתיחת המקום הנבחר בחלון קריאה חדש', 'Open the chosen place in a new reader window') + '">' + gsv('<rect x="8" y="3" width="13" height="13" rx="2"/><path d="M16 20H5a2 2 0 0 1-2-2V8"/>') + ' ' + T('בחלון חדש', 'New window') + '</button>';
    const star = () => { const s = g.querySelector('.s'); s.innerHTML = gsv('<path d="' + STAR + '"/>', isMarked()); s.parentNode.title = isMarked() ? T('הסרת הסימניה', 'Remove bookmark') : T('סימניה למקום הנוכחי', 'Bookmark this place'); };
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
      m.forEach(x => { const b = f.doc.createElement('button'); b.type = 'button'; b.innerHTML = gsv('<path d="' + STAR + '"/>', true) + ' '; b.append(x.t); b.title = x.h; b.onclick = () => { close(); navPush(w, x.h); }; list.appendChild(b); });
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
  // מראה שהוחלף מתוך חלון (תפריט ⋯ של החלון) נשמר שם ב-localStorage: מעדכנים לפיו את השולחן ואת שאר החלונות
  addEventListener('storage', e => {
    if (e.key !== 'gimatrivonTheme') return;
    const on = e.newValue === 'dark', c = $('#dkTheme');
    if (c.checked !== on) { c.checked = on; c.dispatchEvent(new Event('change')); }
  });
  $('#dkLang').textContent = EN ? 'עב' : 'EN';
  $('#dkLang').onclick = () => { D.wins.forEach(snapshot); save(); try { localStorage.setItem('gimatrivonLang', EN ? 'he' : 'en'); } catch (e) {} location.reload(); };
  if (EN) { document.documentElement.lang = 'en'; q.placeholder = 'Search, or jump: "Exodus 12 2"'; const tb = $('#dkGemTools').firstElementChild; tb.textContent = '? Guided tour'; tb.title = 'Start a short guided tour of the app'; }

  // הודעות מהחלונות (reader.js): תוצאת גימטריה → חלון קריאה; ניסיון לעבור לגימטריה מחלון קריאה → חלון הגימטריה
  addEventListener('message', e => {
    const m = e.data; if (!m || !m.gtDesk || e.origin !== location.origin) return;
    if (m.gtDesk === 'res') return fromResults(m);
    if (m.gtDesk === 'open') openRead(m.hash);
    else if (m.gtDesk === 'gem') openGem();
  });
  addEventListener('hashchange', () => fromUrl());
  addEventListener('pagehide', () => { D.wins.forEach(snapshot); save(); });
  addEventListener('resize', () => D.wins.forEach(w => { if (stageOn()) paint(w); else if (!w.max) { w.x = Math.min(w.x, Math.max(0, desk.clientWidth - 120)); w.y = Math.min(w.y, Math.max(0, desk.clientHeight - 40)); paint(w); } }));

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
      const f = [...F.values()].find(x => x.doc && x.doc.getElementById('ver'));
      if (f) { const v = f.doc.getElementById('ver'); for (let i = 0; i < 5; i++) v.click(); $('#dkVer').textContent = v.textContent; }
      else { try { localStorage.setItem('gimatrivonDev', localStorage.getItem('gimatrivonDev') === '1' ? '0' : '1'); } catch (e) {} } // אין חלון פתוח (או כולם ישנים): ישירות
      dispatchEvent(new Event('gimDevSync')); // תג SQLite (למטה)
      toast(T('מצב פיתוח הוחלף. פרטי הבנייה בחלון "אודות"', 'Dev mode toggled. Build details are in About'));
    });
    // 5 לחיצות מהירות על "גימטריבון": מצב טלפון — עוברים למסך הרגיל במצב טלפון (וחוזרים עם #desktop)
    let n = 0, t = 0;
    document.querySelector('.brand h1').addEventListener('click', () => { const now = Date.now(); n = now - t < 700 ? n + 1 : 1; t = now; if (n >= 5) { n = 0; D.wins.forEach(snapshot); save(); location.href = 'index.html?classic=1#phone'; } });
  }
  if (location.hash === '#phone') location.replace('index.html?classic=1#phone');

  /* ---------- מצב פיתוח: מאיפה SQLite עונה (v4.6.1) ----------
     תג בפינה (שמאל למטה): לכל תחום — זיכרון (sqmem.js, ירוק), בטעינה לזיכרון (כתום, עם אחוזים) או טווחים מהשרת (אפור); מספר השאילתות מכל מקור,
     והבקשות והבתים שנשלחו לשרת. שורה מהבהבת כששאילתה יוצאת לשרת. מצב הפיתוח נדלק ב-5 לחיצות על הגרסה (app.js, בתוך החלונות). */
  {
    const DL = { tanakh: 'תנ״ך', mishnah: 'משנה', rambam: 'רמב״ם', talmud: 'גמרא', tur: 'טור' };
    let el = null, tm = 0, NET = {}; const prev = {};
    const on = devOn;
    const paint = () => {
      if (!el || !window.GimSqPool) return;
      const by = {}; window.GimSqPool.stats().forEach(x => { by[x[0]] = x; });
      let h = '<table><tr><th colspan="2">SQLite</th><th>מצב</th><th>Workers</th><th title="שאילתות שנענו מהזיכרון">זיכרון</th><th title="שאילתות שנשלחו לשרת (Range)">שרת</th><th title="בקשות HTTP Range ובתים שירדו">בקשות</th><th>MB</th></tr>';
      Object.keys(DL).forEach(k => {
        const [, nw, mem, cm, cr, prog] = by[k] || [k, 0, 'none', 0, 0, null], nt = NET[k] || [0, 0];
        const c = mem === 'none' ? 'x' : mem === 'ready' ? 'm' : mem === 'cached' || mem === 'fetch' ? 'l' : mem === 'fail' ? 'f' : 'r';
        const lbl = c === 'x' ? 'לא נפתח' : c === 'm' ? 'בזיכרון' : c === 'l' ? (mem === 'cached' ? 'נטען מהדפדפן' : 'יורד לזיכרון') + (prog ? ' ' + Math.round(100 * prog[0] / prog[1]) + '%' : '') :
          c === 'f' ? 'מהשרת · הזיכרון נכשל' : mem === 'off' ? 'מהשרת · זיכרון כבוי' : mem === 'gone' ? 'מהשרת · הזיכרון שוחרר' : 'מהשרת';
        const hit = prev[k] != null && cr > prev[k]; prev[k] = cr;
        h += '<tr class="' + c + (hit ? ' hit' : '') + '"><td><i></i></td><td class="n">' + DL[k] + '</td><td>' + lbl + '</td><td>' + (nw || '') + '</td><td>' + cm + '</td><td>' + cr + '</td><td>' + nt[0] + '</td><td>' + (nt[1] / 1048576).toFixed(1) + '</td></tr>';
      });
      el.innerHTML = h + '</table>';
    };
    const sync = () => {
      const v = on();
      if (v && !el) {
        el = document.createElement('div'); el.id = 'dkSqDev'; el.dir = 'rtl'; document.body.appendChild(el);
        addEventListener('gimsq', paint);
        tm = setInterval(() => { if (window.GimSqPool) window.GimSqPool.net().then(n => { NET = n; paint(); }, () => {}); }, 1000);
        paint();
      } else if (!v && el) { el.remove(); el = null; clearInterval(tm); removeEventListener('gimsq', paint); }
    };
    addEventListener('storage', e => { if (e.key === 'gimatrivonDev') sync(); });
    addEventListener('gimDevSync', sync);
    sync();
  }

  /* ---------- התחלה ---------- */
  D.wins.forEach(w => { if (w.k === 'read' && (!Array.isArray(w.hist) || !w.hist.length)) { w.hist = ['#read']; w.hi = 0; } w.navTo = null; });
  D.wins.forEach(build);
  D.wins.forEach(w => { if (!w.min && w.id !== D.act) sleepFrame(w); });
  if (!W(D.act) || W(D.act).min) { const n = topVisible(); D.act = n ? n.id : ''; }
  if (D.act) focusWin(D.act);
  if (location.hash) fromUrl(); else syncUrl();
  taskbar(); banner();
})();
