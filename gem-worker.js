/* gem-worker.js (v4.7.0) — בונה את אינדקס הגימטריה מחוץ לדף. טעינת קובצי הספרים (כ-63MB של טקסט) והיחידות הביניים
   נשארים בזיכרון של ה-Worker, וכשהוא נסגר הם נעלמים — בדף נשארים רק המערכים הסופיים (שמועברים בלי העתקה) והטקסט הארוז.
   הודעות: {t:'build', ids, stage} → {t:'prog', f} ... {t:'done', stage, ...} או {t:'err', m}. */
'use strict';
self.window = self;
importScripts('generated/corpus/index.js', 'engine.js');
const B = self.GIM_CORPUS_INDEX.books, E = self.GematriaEngine, DIR = 'generated/corpus/';
const parts = B.map(() => null);
self.GimCorpus = { put(b, k, d) { (parts[b] || (parts[b] = new Array(B[b].f.length)))[k] = d; } };
self.onmessage = ev => {
  const { ids, stage } = ev.data;
  try {
    const files = []; ids.forEach(b => B[b].f.forEach((f, k) => { if (!parts[b] || parts[b][k] === undefined) files.push(f); }));
    files.forEach((f, i) => { importScripts(DIR + f); self.postMessage({ t: 'prog', f: 0.4 * (i + 1) / files.length }); });
    const units = [];
    ids.forEach(b => parts[b].forEach(d => {
      const cat = B[b].cat;
      if (Array.isArray(d)) d.forEach(r => units.push({ c: cat, b, ch: r[0], n: r[1], t: r[2], k: r[3], s: r[4] }));
      else { let v = d.from; d.w.split('\n').forEach(w => units.push({ c: cat, b, ch: 0, n: ++v, t: w, k: 0, s: 0 })); }
    }));
    const N = units.length, c = new Uint8Array(N), b = new Int32Array(N), ch = new Int32Array(N), nn = new Int32Array(N), k = new Uint8Array(N), s = new Uint8Array(N);
    units.forEach((u, i) => { c[i] = u.c; b[i] = u.b; ch[i] = u.ch; nn[i] = u.n; k[i] = u.k; s[i] = u.s; });
    const bd = E.indexBuilder(units); let last = 0;
    while (!bd.step(30)) { const f = 0.4 + 0.6 * bd.progress(); if (f - last > 0.02) { last = f; self.postMessage({ t: 'prog', f }); } }
    const ix = bd.finish(), W = ix.W, buf = [];
    const out = { t: 'done', stage, n: N, c, b, ch, nn, k, s, tx: ix.units.map(u => u.t), start: ix.start, W: { regular: W.regular.slice(), milui: W.milui.slice(), atbash: W.atbash.slice(), atbach: W.atbach.slice() }, L: ix.L.slice(), MAQAF: ix.MAQAF.slice() }; // slice: עותק בגודל המדויק (המקור הוא תצוגה על מערך עם עודף קיבולת)
    [c, b, ch, nn, k, s, out.start, out.L, out.MAQAF, ...Object.values(out.W)].forEach(a => { if (!buf.includes(a.buffer)) buf.push(a.buffer); });
    self.postMessage(out, buf);
  } catch (e) { self.postMessage({ t: 'err', m: String(e && e.message || e) }); }
};
