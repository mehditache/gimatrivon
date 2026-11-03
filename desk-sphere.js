/* כדור זכוכית מסתובב ברקע הדסקטופ (v4.21.0, three.js)
   פרשת בראשית בכתב סת״ם אשכנזי: אותיות זהב מתכתיות מוטבעות על זכוכית, שם הפרשה בתלת־ממד בתוך הכדור,
   טבעות זהב, אבק זהב וניצוצות. three.js נטען רק כשהשולחן נפתח (vendor/three.min.js, רישיון MIT).
   חסכוני: עד 30 פריימים בשנייה, עצירה כשהלשונית מוסתרת / כשחלון מוגדל מכסה את השולחן / אחרי 5 דקות בלי פעילות. */
(async () => {
  'use strict';
  const wp = document.querySelector('#dkDesk .wpL');
  if (!wp) return;
  const SRC = document.currentScript && document.currentScript.src;
  if (!window.THREE) {
    try {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = SRC ? SRC.replace(/desk-sphere\.js.*$/, 'vendor/three.min.js') : 'vendor/three.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    } catch (e) { return; }
  }
  const THREE = window.THREE;
  const cv = document.createElement('canvas');
  cv.className = 'wpSphere';
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch (e) { return; }
  wp.appendChild(cv);

  /* ---------- טקסט: בראשית א:א – ו:ח, אותיות בלבד כמו בספר תורה ---------- */
  let raw;
  try { raw = window.DESK_SPHERE_RAW || (await (await fetch('data/Tanakh/Genesis.json')).json()).text; } catch (e) { cv.remove(); return; }   // DESK_SPHERE_RAW: לקובץ הדגמה עצמאי
  const toks = [];
  for (let c = 0; c < 6; c++) {
    const n = c < 5 ? raw[c].length : 8;
    for (let v = 0; v < n; v++) {
      const s = raw[c][v].replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<i class="footnote">.*?<\/i>/g, '')
        .replace(/<span class="mam-spi-(pe|samekh)">[^<]*<\/span>/g, (m, k) => ' \u0001' + (k === 'pe' ? 'פ' : 'ס') + ' ')
        .replace(/<[^>]+>/g, '').replace(/&nbsp;|&thinsp;/g, ' ').replace(/&[a-z]+;/g, '').replace(/\*/g, '')
        .replace(/[֑-ׇ]/g, m => m === '־' ? ' ' : '');
      for (const w of s.split(/\s+/)) if (w) toks.push(w[0] === '\u0001' ? { k: 'gap', s: w[1] } : { k: 'w', s: w });
    }
  }

  /* ---------- מרקם equirectangular בגווני אפור: אות בלבן על שחור ---------- */
  const FAM = '"GimStamA",serif', FONT = fs => '400 ' + fs + 'px ' + FAM;
  await document.fonts.load(FONT(40), 'אבג').catch(() => {});
  const TW = 4096, TH = TW / 2;
  const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
  const cx = tc.getContext('2d');
  const LAT_TOP = 70 * Math.PI / 180, LAT_BOT = -74 * Math.PI / 180;
  const yOf = lat => (0.5 - lat / Math.PI) * TH, latOf = y => (0.5 - y / TH) * Math.PI;
  cx.font = FONT(100);
  for (const t of toks) t.w = t.k === 'w' ? cx.measureText(t.s).width / 100 : (t.s === 'פ' ? 2.2 : 1.2);
  function layout(fs) {
    const lh = fs * 1.42, sp = fs * 0.42, seam = fs * 0.9, rows = [];
    let y = yOf(LAT_TOP) + lh * 0.5, i = 0;
    while (i < toks.length) {
      if (y > yOf(LAT_BOT)) return null;
      const cosl = Math.cos(latOf(y)), cap = TW * cosl - seam; let w = 0; const row = [];
      while (i < toks.length) {
        const t = toks[i], add = (row.length ? sp : 0) + t.w * fs;
        if (row.length && w + add > cap) break;
        if (!row.length && t.k === 'gap') { i++; continue; }
        row.push(t); w += add; i++;
      }
      rows.push({ y, cosl, cap, w, row, last: i >= toks.length }); y += lh;
    }
    return { rows, sp };
  }
  let lo = 6, hi = 120;
  for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; layout(m) ? lo = m : hi = m; }
  const fs = lo, L = layout(fs);
  cx.fillStyle = '#000'; cx.fillRect(0, 0, TW, TH);
  cx.direction = 'rtl'; cx.textAlign = 'right'; cx.textBaseline = 'middle'; cx.fillStyle = '#fff'; cx.font = FONT(fs);
  for (const r of L.rows) {
    const extra = (!r.last && r.row.length > 1) ? (r.cap - r.w) / (r.row.length - 1) : 0;
    cx.setTransform(1 / r.cosl, 0, 0, 1, 0, 0);
    let x = TW * r.cosl - fs * 0.45;
    for (const t of r.row) { if (t.k === 'w') cx.fillText(t.s, x, r.y + fs * 0.06); x -= t.w * fs + L.sp + extra; }
  }

  /* ---------- מרקם הטקסט הוא תמונה בגווני אפור: לבן = אות. משמש גם כמסכת שקיפות וגם כמפת בליטה ---------- */
  const anis = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = new THREE.CanvasTexture(tc);
  tex.wrapS = THREE.RepeatWrapping; tex.offset.x = 0.25;      // במעטפת של three החזית היא ב־u=0.25, ובמרקם שלנו באמצע
  tex.anisotropy = anis; tex.needsUpdate = true;

  /* ---------- סביבה: כיפת סטודיו עם תיבות אור, למראה זהב וזכוכית אמיתיים ---------- */
  const scene = new THREE.Scene();
  {
    const es = new THREE.Scene(), dome = new THREE.SphereGeometry(10, 48, 24), pa = dome.attributes.position, col = [];
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i) / 10, top = [1.15, 1.12, 1.05], hor = [1.0, 0.86, 0.66], bot = [0.10, 0.08, 0.06];
      const a = y > 0 ? top : bot, b = hor, k = Math.pow(Math.abs(y), 0.6);
      col.push(b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k, b[2] + (a[2] - b[2]) * k);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    es.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const box = (w, h, x, y, z, v) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v * 0.96, v * 0.88), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    box(7, 3.5, -6, 5, 6, 9); box(10, 2, 0, 9, 0, 7); box(1.6, 8, 9, 1, -3, 8); box(1.2, 9, -9.5, 0, 1, 5); box(8, 1.2, 2, -4, 8, 3);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.02).texture; pm.dispose();
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.setClearColor(0x000000, 0);
  const DIST = 3.3, FOV = 2 * Math.atan(Math.tan(Math.asin(1 / DIST)) / 0.8) * 180 / Math.PI;     // הכדור תופס 80% מהקנבס, והטבעות בשוליים
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 30); camera.position.set(0, 0, DIST);
  scene.add(new THREE.DirectionalLight(0xffffff, 2.2).translateX(-2).translateY(3).translateZ(4));
  scene.add(new THREE.PointLight(0xffe0a0, 1.6, 0, 2).translateX(2.8).translateY(-1.2).translateZ(3));

  const goldProps = { color: 0xe6a53a, metalness: 1, roughness: 0.26, envMapIntensity: 1.1 };
  const group = new THREE.Group(); scene.add(group);          // מה שמסתובב בגרירה: הכדור, האותיות והניצוצות
  group.quaternion.setFromEuler(new THREE.Euler(0.36, 0.32, 0, 'XYZ'));
  const sph = (r, mat, order) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 128, 64), mat); m.renderOrder = order; group.add(m); return m; };

  // זכוכית: מעטפת שקופה עם החזרה לפי פרנל, ברק של תיבות אור, וגוון קשת דק בשוליים
  const glassMat = back => new THREE.ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthWrite: false, side: back ? THREE.BackSide : THREE.FrontSide,
    uniforms: { back: { value: back ? 1 : 0 }, dark: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}',
    fragmentShader: `uniform float back;uniform float dark;uniform float uTime;varying vec3 vN;varying vec3 vV;
void main(){
  vec3 n=normalize(vN), e=normalize(vV);
  if(back>0.5) n=-n;
  float ndv=clamp(dot(n,e),0.0,1.0), rim=pow(1.0-ndv,3.0), fr=0.04+0.96*pow(1.0-ndv,5.0);
  vec3 r=reflect(-e,n);
  float s1=pow(max(dot(r,normalize(vec3(-0.5,0.55,0.65))),0.0),48.0), s2=pow(max(dot(r,normalize(vec3(0.8,0.1,0.55))),0.0),50.0), s3=pow(max(dot(r,normalize(vec3(-0.2,-0.7,0.6))),0.0),30.0)*0.3;
  vec3 irid=0.5+0.5*cos(6.2831*(vec3(0.0,0.33,0.67)+ndv*1.3+0.05*sin(uTime*0.25)));
  vec3 tint=mix(vec3(0.55,0.62,0.72),vec3(0.62,0.75,1.0),dark);
  float a=0.035+0.42*fr+0.10*rim;
  vec3 c=tint*a+irid*rim*0.16+vec3(1.0)*(s1*0.7+s2*0.9+s3)*(0.6+fr);
  float al=clamp(a+max(max(s1,s2),s3)*0.5,0.0,1.0);
  if(back>0.5){ c*=0.3; al*=0.35; }
  gl_FragColor=vec4(c,al);
}`
  });
  const glassBack = sph(1.0, glassMat(true), 1), glassFront = sph(1.0, glassMat(false), 6);

  // האותיות: זהב מתכתי מוטבע (מפת בליטה), בחזית; ומאחור עמום. מול השם התלת־ממדי הן מתעמעמות כדי שהשם יקרא.
  const textFront = sph(0.996, new THREE.MeshStandardMaterial(Object.assign({ alphaMap: tex, bumpMap: tex, bumpScale: 3, transparent: true, depthWrite: false }, goldProps)), 4);
  textFront.material.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= mix(0.25, 1.0, smoothstep(0.55, 1.0, length(vec2(vViewPosition.x / 0.88, vViewPosition.y / 0.30))));');
  };
  const textBack = sph(0.996, new THREE.MeshStandardMaterial(Object.assign({}, goldProps, { alphaMap: tex, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.BackSide })), 2);

  /* ---------- השם בתלת־ממד: מעקב אחרי קו המתאר של האותיות (marching squares) והבלטה עם שיפוע ---------- */
  const NAME = 'בראשית', MW = 2048, MH = 512;
  await document.fonts.load('900 100px "GimFrank"', NAME).catch(() => {});
  const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH;
  const mx = mc.getContext('2d', { willReadFrequently: true });
  mx.fillStyle = '#000'; mx.fillRect(0, 0, MW, MH);
  mx.direction = 'rtl'; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.fillStyle = '#fff';
  let fpx = 400; mx.font = '900 ' + fpx + 'px "GimFrank",serif';
  fpx = Math.min(430, fpx * 1860 / mx.measureText(NAME).width); mx.font = '900 ' + fpx + 'px "GimFrank",serif';
  mx.fillText(NAME, MW / 2, MH / 2 + fpx * 0.06);
  const md = mx.getImageData(0, 0, MW, MH).data, val = new Float32Array(MW * MH);
  for (let i = 0; i < MW * MH; i++) val[i] = md[i * 4];
  const ISO = 127.5, pt = (a, b, va, vb) => (ISO - va) / (vb - va);
  const edgeXY = id => {            // מזהה קשת → נקודה בקו המתאר (עם אינטרפולציה, כך שהקו חלק)
    const k = id >> 1, x = k % MW, y = (k / MW) | 0;
    if (!(id & 1)) { const va = val[k], vb = val[k + 1]; return [x + pt(0, 1, va, vb), y]; }
    const va = val[k], vb = val[k + MW]; return [x, y + pt(0, 1, va, vb)];
  };
  const adj = new Map(), link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let y = 0; y < MH - 1; y++) for (let x = 0; x < MW - 1; x++) {
    const i = y * MW + x, tl = val[i] > ISO, tr = val[i + 1] > ISO, br = val[i + MW + 1] > ISO, bl = val[i + MW] > ISO;
    const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = i * 2, B = (i + MW) * 2, Lf = i * 2 + 1, R = (i + 1) * 2 + 1;
    switch (c) {
      case 1: link(Lf, B); break; case 2: link(B, R); break; case 3: link(Lf, R); break; case 4: link(T, R); break;
      case 5: { const mid = (val[i] + val[i + 1] + val[i + MW] + val[i + MW + 1]) / 4 > ISO; if (mid) { link(T, Lf); link(B, R); } else { link(T, R); link(Lf, B); } break; }
      case 6: link(T, B); break; case 7: link(T, Lf); break; case 8: link(T, Lf); break; case 9: link(T, B); break;
      case 10: { const mid = (val[i] + val[i + 1] + val[i + MW] + val[i + MW + 1]) / 4 > ISO; if (mid) { link(T, R); link(Lf, B); } else { link(T, Lf); link(B, R); } break; }
      case 11: link(T, R); break; case 12: link(Lf, R); break; case 13: link(B, R); break; case 14: link(Lf, B); break;
    }
  }
  const loops = [], seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const ids = []; let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur); ids.push(cur);
      const nb = adj.get(cur), nx = nb.find(n => n !== prev && !seen.has(n)); prev = cur; cur = nx;
    }
    if (ids.length > 12) loops.push(ids.map(edgeXY));
  }
  const simplify = pts => {         // Douglas–Peucker על מצולע סגור (מפצלים בשתי נקודות רחוקות)
    const n = pts.length, eps = 0.45; let far = 0, fd = 0;
    for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
    const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
    const stack = [[0, far], [far, n]];
    while (stack.length) {
      const [a, b] = stack.pop(), pa = pts[a], pb = pts[b % n];
      let md2 = 0, mi = -1; const dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - pa[0]) * dy - (pts[i][1] - pa[1]) * dx) / len; if (d > md2) { md2 = d; mi = i; } }
      if (mi >= 0 && md2 > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const polys = loops.map(simplify).filter(p => p.length > 3);
  const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const depth = polys.map((p, i) => polys.reduce((n, q, j) => n + (i !== j && inside(p[0], q) ? 1 : 0), 0));
  const HW = 0.8, K = HW * 2 / MW, shapes = [];
  const toV = p => new THREE.Vector2((p[0] - MW / 2) * K, -(p[1] - MH / 2) * K);
  polys.forEach((p, i) => {
    if (depth[i] % 2) return;
    const sh = new THREE.Shape(p.map(toV));
    polys.forEach((h, j) => { if (depth[j] === depth[i] + 1 && inside(h[0], p)) sh.holes.push(new THREE.Path(h.map(toV))); });
    shapes.push(sh);
  });
  const BS = 0.013, BT = 0.02, DEPTH = 0.07;
  const nameGeo = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelOffset: -BS, bevelSegments: 5, curveSegments: 1, steps: 1 });
  nameGeo.translate(0, 0, -DEPTH / 2);
  const nameMat = new THREE.MeshPhysicalMaterial(Object.assign({}, goldProps, { roughness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.12 }));
  const nameMesh = new THREE.Mesh(nameGeo, nameMat), nameGroup = new THREE.Group(); nameGroup.add(nameMesh); scene.add(nameGroup);
  mc.width = mc.height = 1;

  /* ---------- טבעות זהב (כמו אסטרולבּ), אבק זהב בתוך הכדור, וניצוצות על האותיות ---------- */
  const rings = [];
  for (const [rx, rz, spd] of [[1.2, 0.35, 0.00021], [-0.55, -0.5, -0.00014]]) {
    const g = new THREE.Group(), ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.011, 20, 220), new THREE.MeshPhysicalMaterial(Object.assign({}, goldProps, { roughness: 0.18 })));
    g.add(ring);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), ring.material); bead.position.set(1.15, 0, 0); g.add(bead);
    g.rotation.set(rx, 0, rz); const spin = new THREE.Group(); spin.add(g); scene.add(spin); rings.push([spin, spd]);
  }
  const pxr = () => renderer.getPixelRatio();
  const ptsMat = (vs, fs) => new THREE.ShaderMaterial({ transparent: true, premultipliedAlpha: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uPx: { value: 1 } }, vertexShader: vs, fragmentShader: fs });
  const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const dust = (() => {   // אבק זהב
    const N = 220, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { let x, y, z; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 0.8); pos.set([x * 0.95, y * 0.95, z * 0.95], i * 3); seed[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = ptsMat('attribute float aSeed;uniform float uTime;uniform float uPx;varying float vA;void main(){vec3 p=position+0.05*vec3(sin(uTime*0.4+aSeed*17.0),cos(uTime*0.33+aSeed*29.0),sin(uTime*0.27+aSeed*41.0));vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=uPx*(2.0+3.5*fract(aSeed*7.0))*(3.3/-mv.z);vA=(0.3+0.5*fract(aSeed*13.0))*(0.65+0.35*sin(uTime*1.3+aSeed*50.0));}',
      'varying float vA;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=smoothstep(1.0,0.0,d)*vA;gl_FragColor=vec4(vec3(1.0,0.80,0.34)*a,a);}');
    const p = new THREE.Points(g, m); p.renderOrder = 3; p.frustumCulled = false; scene.add(p); return p;
  })();
  const stars = (() => {  // ניצוצות על האותיות: נבחרים באקראי מתוך מקומות שיש בהם אות, מהבהבים כל אחד בקצב שלו
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512;
    const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(tc, 0, 0, 1024, 512);
    const d = sx.getImageData(0, 0, 1024, 512).data, N = 150, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      let x, y, tries = 0; do { x = (rnd() * 1024) | 0; y = (rnd() * 512) | 0; tries++; } while (d[(y * 1024 + x) * 4] < 200 && tries < 400);
      const u = x / 1024 - 0.25, th = Math.PI * y / 512, ph = 2 * Math.PI * u, r = 1.004;     // אותה נוסחה כמו ב־SphereGeometry
      pos.set([-r * Math.cos(ph) * Math.sin(th), r * Math.cos(th), r * Math.sin(ph) * Math.sin(th)], n * 3); seed[n] = rnd();
    }
    sc.width = sc.height = 1;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = ptsMat('attribute float aSeed;uniform float uTime;uniform float uPx;varying float vT;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vec3 nr=normalize(normalMatrix*position);float f=dot(nr,normalize(-mv.xyz));float ph=fract(uTime*(0.05+0.10*fract(aSeed*5.0))+aSeed*3.0);float tw=pow(max(sin(ph*3.14159),0.0),18.0);gl_PointSize=uPx*(8.0+40.0*tw)*(3.3/-mv.z);vT=tw*smoothstep(0.12,0.45,f);}',
      'varying float vT;void main(){vec2 u=gl_PointCoord*2.0-1.0;float r=length(u);float ray=pow(max(1.0-abs(u.x*u.y)*10.0,0.0),5.0)*smoothstep(1.0,0.15,r);float core=exp(-r*6.0);float a=clamp(ray*0.9+core*1.2,0.0,1.0)*vT;vec3 c=mix(vec3(1.0,0.80,0.30),vec3(1.0,0.97,0.86),core);gl_FragColor=vec4(c*a,a);}');
    const p = new THREE.Points(g, m); p.renderOrder = 5; p.frustumCulled = false; group.add(p); return p;
  })();
  const uniformsOf = [glassBack.material, glassFront.material, dust.material, stars.material].map(m => m.uniforms);

  /* ---------- ציור, סיבוב בגרירה, וחיסכון ---------- */
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const IDLE = 5 * 60e3;
  let q = group.quaternion, vel = [0, 0], dragging = false, lastDrag = -1e9;
  let lastAct = performance.now(), tPrev = 0, raf = 0, frames = 0, dirty = true;
  const stats = { frames: 0, fps: 0, running: false, engine: 'three r' + THREE.REVISION, textureMB: +(TW * TH * 4 * 4 / 3 / 1048576).toFixed(1) };
  window.__deskSphere = stats;
  const dq = new THREE.Quaternion(), axv = new THREE.Vector3();
  const turn = (ax, ay, ang) => { dq.setFromAxisAngle(axv.set(ax, ay, 0), ang); q.premultiply(dq); };

  function resize() {
    const d = Math.min(1.5, devicePixelRatio || 1), s = cv.clientWidth;
    if (s && (renderer.getPixelRatio() !== d || renderer.domElement.width !== Math.round(s * d))) { renderer.setPixelRatio(d); renderer.setSize(s, s, false); dirty = true; }
  }
  function draw(now) {
    const sec = now / 1000, dk = isDark() ? 1 : 0;
    nameGroup.rotation.set((reduce.matches ? 0 : 0.07 * Math.sin(sec * 2 * Math.PI / 11 + 1)) + 0.05, reduce.matches ? 0.3 : 0.36 * Math.sin(sec * 2 * Math.PI / 16), 0);
    for (const [r, spd] of rings) r.rotation.y = (now * spd) % (Math.PI * 2);
    for (const u of uniformsOf) { if (u.uTime) u.uTime.value = sec % 600; if (u.dark) u.dark.value = dk; if (u.uPx) u.uPx.value = pxr(); }
    renderer.render(scene, camera);
    if (stats.frames === 0 && tc.width > 1) tc.width = tc.height = 1;      // אחרי ההעלאה הראשונה לכרטיס המסך משחררים את עותק ה־CPU של המרקם
    stats.frames++; frames++; dirty = false;
  }
  const coast = () => Math.hypot(vel[0], vel[1]) > 1e-5;
  const shouldRun = () => !document.hidden && !document.body.classList.contains('dkMax') && (coast() || (!reduce.matches && performance.now() - lastAct < IDLE));
  function frame(t) {
    raf = 0;
    if (!shouldRun()) { stats.running = false; if (dirty) { resize(); draw(t); } return; }
    raf = requestAnimationFrame(frame);
    if (tPrev && t - tPrev < 31) return;          // עד ~30 פריימים בשנייה
    const dt = tPrev ? Math.min(100, t - tPrev) : 16; tPrev = t;
    stats.running = true;
    const sp = Math.hypot(vel[0], vel[1]);
    if (dragging) { /* הגרירה עצמה מסובבת */ }
    else if (sp > 1e-5) { const k = dt / 16; turn(vel[0] / sp, vel[1] / sp, sp * k); vel = vel.map(v => v * Math.pow(0.95, k)); if (Math.hypot(...vel) < 1e-5) vel = [0, 0]; }
    else if (!reduce.matches && t - lastDrag > 2500) turn(0, 1, -0.00010 * dt);
    resize(); draw(t);
  }
  /* סיבוב בגרירה עם העכבר: תנופה אחרי שעוזבים, וחזרה לסיבוב העצמי אחרי 2.5 שניות */
  let px = 0, py = 0, pt0 = 0;
  cv.addEventListener('pointerdown', e => {
    if (e.button) return;
    dragging = true; vel = [0, 0]; px = e.clientX; py = e.clientY; pt0 = performance.now();
    cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); e.preventDefault(); wake();
  });
  cv.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py, d = Math.hypot(dx, dy), now = performance.now();
    if (!d) return;
    const ang = d * 2.6 / (cv.clientHeight * 0.8), ax = dy / d, ay = dx / d;
    turn(ax, ay, ang);
    const dt = Math.max(8, now - pt0); vel = [ax * ang / dt * 16, ay * ang / dt * 16];
    px = e.clientX; py = e.clientY; pt0 = now; lastDrag = now; dirty = true;
    if (!raf) { tPrev = 0; raf = requestAnimationFrame(frame); }
    if (!shouldRun()) { resize(); draw(now); }
  });
  const release = () => { if (!dragging) return; dragging = false; cv.classList.remove('drag'); if (performance.now() - pt0 > 80) vel = [0, 0]; lastDrag = performance.now(); };
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);

  const wake = () => { lastAct = performance.now(); if (!raf) { tPrev = 0; raf = requestAnimationFrame(frame); } };
  ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach(ev => addEventListener(ev, wake, { passive: true, capture: true }));
  // לחיצה בתוך חלון (iframe) מעבירה אליו את המיקוד: גם זו פעילות
  addEventListener('blur', wake);
  document.addEventListener('visibilitychange', wake);
  reduce.addEventListener && reduce.addEventListener('change', () => { dirty = true; wake(); });
  new MutationObserver(() => { dirty = true; wake(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  addEventListener('resize', () => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); });
  setInterval(() => { stats.fps = frames; frames = 0; }, 1000);
  raf = requestAnimationFrame(frame);
})();
