/* כדור זכוכית מסתובב ברקע הדסקטופ: פרשת בראשית בכתב סת״ם אשכנזי, אותיות זהב (v4.19.0)
   חסכוני: מרקם 4096×2048 (כ־43MB בכרטיס המסך עם mipmaps), עד 30 פריימים בשנייה,
   עוצר כשהחלון מוסתר, כשחלון מוגדל מכסה את השולחן, אחרי 5 דקות בלי פעילות, וב־prefers-reduced-motion. */
(async () => {
  'use strict';
  const wp = document.querySelector('#dkDesk .wpL');
  if (!wp) return;
  const cv = document.createElement('canvas');
  cv.className = 'wpSphere';
  const gl = cv.getContext('webgl', { antialias: true, premultipliedAlpha: true, alpha: true, powerPreference: 'low-power' });
  if (!gl) return;
  wp.appendChild(cv);

  /* ---------- טקסט: בראשית א:א – ו:ח, אותיות בלבד כמו בספר תורה ---------- */
  let raw;
  try { raw = (await (await fetch('data/Tanakh/Genesis.json')).json()).text; } catch (e) { cv.remove(); return; }
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

  /* ---------- מרקם equirectangular: האותיות בלבן, הזהב נצבע בשיידר ---------- */
  const FAM = '"GimStamA",serif', FONT = fs => '400 ' + fs + 'px ' + FAM;
  await document.fonts.load(FONT(40), 'אבג').catch(() => {});
  const TW = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE)), TH = TW / 2;
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
  cx.direction = 'rtl'; cx.textAlign = 'right'; cx.textBaseline = 'middle'; cx.fillStyle = '#fff'; cx.font = FONT(fs);
  for (const r of L.rows) {
    const extra = (!r.last && r.row.length > 1) ? (r.cap - r.w) / (r.row.length - 1) : 0;
    cx.setTransform(1 / r.cosl, 0, 0, 1, 0, 0);
    let x = TW * r.cosl - fs * 0.45;
    for (const t of r.row) { if (t.k === 'w') cx.fillText(t.s, x, r.y + fs * 0.06); x -= t.w * fs + L.sp + extra; }
  }

  /* ---------- WebGL ---------- */
  const VS = 'attribute vec3 p;attribute vec2 uv;uniform mat4 mvp;uniform mat3 rot;varying vec2 vUv;varying vec3 vN;' +
    'void main(){vUv=uv;vN=rot*p;gl_Position=mvp*vec4(p,1.0);}';
  const FS = `precision mediump float;varying vec2 vUv;varying vec3 vN;uniform sampler2D tex;uniform float back;uniform vec3 tint;uniform float dark;
void main(){
  vec3 n=normalize(vN), e=vec3(0.0,0.0,1.0);
  vec4 t=texture2D(tex,vUv);
  float ndv=n.z, fr=pow(1.0-abs(ndv),2.6);
  vec3 L=normalize(vec3(-0.45,0.6,0.75));
  float spec=pow(max(dot(reflect(-L,n),e),0.0),70.0);
  float spec2=pow(max(dot(reflect(-normalize(vec3(0.6,-0.5,0.6)),n),e),0.0),30.0)*0.25;
  if(t.a>0.0){
    float k=clamp(abs(ndv),0.0,1.0);
    vec3 g=mix(vec3(0.50,0.33,0.07),vec3(0.95,0.76,0.30),k)*mix(0.66,1.12,dark);
    g+=vec3(1.0,0.93,0.70)*(pow(max(dot(reflect(-L,n),e),0.0),18.0)*0.9+spec*0.6)*mix(0.35,1.0,dark);
    t=vec4(min(g,vec3(1.0))*t.a,t.a);
  }
  if(back>0.5){
    float a=mix(0.20,0.16,dark);
    vec4 g=vec4(tint*0.05,0.05)*(0.4+fr);
    gl_FragColor=t*a+g*(1.0-t.a*a);
  }else{
    vec4 g=vec4(tint,1.0)*(0.035+0.42*fr);
    float edge=smoothstep(0.0,0.18,ndv);
    vec4 c=t*edge+g*(1.0-t.a*edge);
    gl_FragColor=c+vec4(1.0)*(spec*mix(0.75,0.35,dark)+spec2*mix(1.0,0.5,dark));
  }
}`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  const U = n => gl.getUniformLocation(prog, n);

  const SLON = 128, SLAT = 64, pos = [], uvs = [], idx = [];
  for (let j = 0; j <= SLAT; j++) {
    const v = j / SLAT, lat = (0.5 - v) * Math.PI;
    for (let i = 0; i <= SLON; i++) { const u = i / SLON, lon = (u - 0.5) * 2 * Math.PI; pos.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)); uvs.push(u - 0.5, v); }
  }
  for (let j = 0; j < SLAT; j++) for (let i = 0; i < SLON; i++) { const a = j * (SLON + 1) + i, b = a + SLON + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const buf = (data, name, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
  buf(pos, 'p', 3); buf(uvs, 'uv', 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);   // 129×65 קודקודים: נכנס ב־16 ביט

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  tc.width = tc.height = 1;   // משחררים את עותק ה־CPU של המרקם (32MB)

  /* ---------- ציור ---------- */
  const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qAx = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
  const qN = q => { const l = Math.hypot(...q); return q.map(v => v / l); };
  const qMat = ([x, y, z, w]) => [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  const persp = (fovy, n, f) => { const t = 1 / Math.tan(fovy / 2); return [t, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; };
  const mul4 = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const DIST = 3.3, FOV = 2 * Math.atan(Math.tan(Math.asin(1 / DIST)) / 0.96), P = persp(FOV, 0.1, 20);
  let q = qN(qMul(qAx(1, 0, 0, 0.36), qAx(0, 1, 0, 0.32))), vel = [0, 0], dragging = false, lastDrag = -1e9;
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const IDLE = 5 * 60e3;
  let lastAct = performance.now(), tPrev = 0, raf = 0, frames = 0, dirty = true;
  const stats = { frames: 0, fps: 0, running: false, textureMB: +(TW * TH * 4 * 4 / 3 / 1048576).toFixed(1) };
  window.__deskSphere = stats;

  function resize() {
    const d = Math.min(1.5, devicePixelRatio || 1), s = Math.round(cv.clientWidth * d);
    if (s && cv.width !== s) { cv.width = cv.height = s; dirty = true; }
  }
  function draw() {
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const m = qMat(q);
    gl.uniformMatrix4fv(U('mvp'), false, mul4(P, [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, -DIST, 1]));
    gl.uniformMatrix3fv(U('rot'), false, m);
    const dk = isDark();
    gl.uniform3fv(U('tint'), dk ? [0.62, 0.75, 1.0] : [0.55, 0.62, 0.72]); gl.uniform1f(U('dark'), dk ? 1 : 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW);
    gl.cullFace(gl.FRONT); gl.uniform1f(U('back'), 1); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    gl.cullFace(gl.BACK); gl.uniform1f(U('back'), 0); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    stats.frames++; frames++; dirty = false;
  }
  // מסתובב רק כשרואים אותו ויש פעילות; כשהוא עומד אין שום ציור
  const coast = () => Math.hypot(vel[0], vel[1]) > 1e-5;
  const shouldRun = () => !document.hidden && !document.body.classList.contains('dkMax') && (coast() || (!reduce.matches && performance.now() - lastAct < IDLE));
  const turn = (ax, ay, ang) => { q = qN(qMul(qAx(ax, ay, 0, ang), q)); };
  function frame(t) {
    raf = 0;
    if (!shouldRun()) { stats.running = false; if (dirty) { resize(); draw(); } return; }
    raf = requestAnimationFrame(frame);
    if (tPrev && t - tPrev < 31) return;          // עד ~30 פריימים בשנייה
    const dt = tPrev ? Math.min(100, t - tPrev) : 16; tPrev = t;
    stats.running = true;
    const sp = Math.hypot(vel[0], vel[1]);
    if (dragging) { /* הגרירה עצמה מסובבת */ }
    else if (sp > 1e-5) { const k = dt / 16; turn(vel[0] / sp, vel[1] / sp, sp * k); vel = vel.map(v => v * Math.pow(0.95, k)); if (Math.hypot(...vel) < 1e-5) vel = [0, 0]; }
    else if (!reduce.matches && t - lastDrag > 2500) turn(0, 1, -0.00010 * dt);
    resize(); draw();
  }
  /* ---------- סיבוב בגרירה עם העכבר (v4.19.1): תנופה אחרי שעוזבים, וחזרה לסיבוב העצמי אחרי 2.5 שניות ---------- */
  let px = 0, py = 0, pt = 0;
  cv.addEventListener('pointerdown', e => {
    if (e.button) return;
    dragging = true; vel = [0, 0]; px = e.clientX; py = e.clientY; pt = performance.now();
    cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); e.preventDefault(); wake();
  });
  cv.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py, d = Math.hypot(dx, dy), now = performance.now();
    if (!d) return;
    const ang = d * 2.6 / cv.clientHeight, ax = dy / d, ay = dx / d;
    turn(ax, ay, ang);
    const dt = Math.max(8, now - pt); vel = [ax * ang / dt * 16, ay * ang / dt * 16];
    px = e.clientX; py = e.clientY; pt = now; lastDrag = now; dirty = true;
    if (!raf) { tPrev = 0; raf = requestAnimationFrame(frame); }
    if (!shouldRun()) { resize(); draw(); }
  });
  const release = () => { if (!dragging) return; dragging = false; cv.classList.remove('drag'); if (performance.now() - pt > 80) vel = [0, 0]; lastDrag = performance.now(); };
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
