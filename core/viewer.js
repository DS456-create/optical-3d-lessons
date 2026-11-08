/* OptiKit 3D 檢視器（M5 新增）：場景、燈光、軌道相機、滾輪縮放、點選、高亮、分離圖層、抬升、眼睛顯隱、3D 標籤避讓、工具列。
   做法與 CPO（index.html）相同，但寫成可重複使用的函式，供 NPO（M5）與可插拔（M6）使用。
   CPO 已驗收，M5 不改動 index.html，CPO 仍使用自己內嵌的版本（見 ARCHITECTURE §12）。
   這裡不放任何課程的模型或物理細節；需要 Three.js r128（一般 <script> 載入，全域 THREE）。 */
window.OptiKit = window.OptiKit || {};
(function (K) {
  K.viewer = function (o) {
    var T = THREE, $ = function (s) { return document.querySelector(s); };
    var cv = o.canvas, vp = o.vp, labsEl = o.labs;
    var R = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }), S = new T.Scene(), C = new T.PerspectiveCamera(35, 1.4, .1, 200);
    R.setPixelRatio(Math.min(devicePixelRatio, 2));
    S.add(new T.HemisphereLight(0xffffff, 0xc9b99f, .9));
    var dl = new T.DirectionalLight(0xffffff, .8); dl.position.set(6, 12, 8); S.add(dl);
    var cam0 = o.cam || { th: .55, ph: 1.05, rd: 29, ty: 1.3, tk: 1.6, min: 10, max: 45 };
    var V = { T: T, S: S, C: C, R: R, MAT: {}, REG: {}, PICK: [], LB: [], VIS: {}, SEL: o.sel || null, EX: .35, LIFT: 0, LAB: true, AUTO: false,
      th: cam0.th, ph: cam0.ph, rd: cam0.rd, tg: new T.Vector3(0, cam0.ty, 0), lang: 'zh', hideBelow: null, onPick: o.onPick || function () {} };

    /* 材質登記到 MAT[pid]（高亮用）；userData.e 為原本的自發光色 */
    V.mk = function (pid, col, op) { var m = new T.MeshStandardMaterial(Object.assign({ color: col, roughness: .5, metalness: .15 }, op || {})); m.userData.e = (op && op.emissive) || 0; (V.MAT[pid] = V.MAT[pid] || []).push(m); return m; };
    /* Group 登記到 REG[pid]；lv = 分離圖層高度層級；sx = 左右側（-1/1，供課程程式做 x 位移）；extra 任意資料 */
    V.grp = function (pid, lv, sx, extra) { var g = new T.Group(); S.add(g); (V.REG[pid] = V.REG[pid] || []).push(Object.assign({ g: g, lv: lv, sx: sx || 0 }, extra || {})); return g; };
    V.box = function (g, pid, w, h, d, x, y, z, col, op) { var m = new T.Mesh(new T.BoxGeometry(w, h, d), V.mk(pid, col, op)); m.position.set(x, y, z); m.userData.pid = pid; g.add(m); V.PICK.push(m); return m; };
    V.grid = function (nx, nz, px, x0, y, z0, pz) { var a = []; pz = pz || px; for (var i = 0; i < nx; i++) for (var j = 0; j < nz; j++) a.push([x0 + (i - (nx - 1) / 2) * px, y, z0 + (j - (nz - 1) / 2) * pz]); return a; };
    V.inst = function (g, pid, r, col, pts) { var im = new T.InstancedMesh(new T.SphereGeometry(r, 10, 8), V.mk(pid, col, { metalness: .5, roughness: .35 }), pts.length), d = new T.Object3D(); pts.forEach(function (p, i) { d.position.set(p[0], p[1], p[2]); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); im.userData.pid = pid; g.add(im); V.PICK.push(im); return im; };
    /* 分離圖層 y 位移：層級 × 分離比例；被選取者再加抬升 */
    V.off = function (lv, pid) { return lv * V.EX * .6 + (pid === V.SEL ? V.LIFT * 3 : 0); };
    V.offOf = function (pid) { var e = (V.REG[pid] || [])[0]; return e ? V.off(e.lv, pid) : 0; };
    V.hl = function () { for (var k in V.MAT) V.MAT[k].forEach(function (m) { m.emissive.setHex(k === V.SEL ? 0x6b3a12 : m.userData.e); }); };
    V.setVis = function (id, b) { V.VIS[id] = b; (V.REG[id] || []).forEach(function (e) { e.g.visible = b; }); if (o.onVis) o.onVis(id, b); };
    V.shown = function (id) { return V.VIS[id] !== false; };

    /* 標籤：錨點綁在 REG[pid][idx] 群組內，隨分離/抬升/位移移動；txt 可為函式（動態文字） */
    V.lab = function (pid, zh, en, idx, x, y, z) { var ob = new T.Object3D(); ob.position.set(x, y, z); V.REG[pid][idx || 0].g.add(ob); var e = document.createElement('div'); e.className = 'lb'; e.onclick = function () { V.onPick(pid); }; labsEl.appendChild(e); var l = { pid: pid, zh: zh, en: en, o: ob, e: e }; V.LB.push(l); return l; };
    V.labelText = function (lang) { V.lang = lang; V.LB.forEach(function (l) { var t = typeof l.zh === 'function' ? (lang === 'zh' ? l.zh() : l.en()) : (lang === 'zh' ? l.zh : l.en); if (l.t !== t) { l.t = t; l.e.textContent = t; } l.w = Array.from(t).reduce(function (s, c) { return s + (c.charCodeAt(0) > 255 ? 10 : 5.6); }, 18); }); };
    var V3 = new T.Vector3();
    V.labels = function () { var W = cv.clientWidth, H = cv.clientHeight, a = [], done = [], top = V.hideBelow == null ? 1e9 : V.hideBelow;
      V.LB.forEach(function (l) { var on = V.LAB && V.shown(l.pid) && l.o.parent && l.o.parent.visible; if (on) { l.o.getWorldPosition(V3); V3.project(C); l.x = (V3.x + 1) / 2 * W + 6; l.y = (1 - V3.y) / 2 * H - 7; if (l.y > top || V3.z > 1) on = false; } l.e.style.display = on ? '' : 'none'; if (on) { l.e.classList.toggle('on', l.pid === V.SEL); a.push(l); } });
      a.sort(function (p, q) { return p.y - q.y; });
      a.forEach(function (l) { var y = l.y, hit = true, n = 0; while (hit && n++ < 14) { hit = false; for (var i = 0; i < done.length; i++) { var q = done[i]; if (l.x < q.x + q.w && q.x < l.x + l.w && Math.abs(y - q.yy) < 15) { y = q.yy + 15; hit = true; } } } l.yy = y; l.e.style.transform = 'translate(' + l.x + 'px,' + y + 'px)'; done.push(l); }); };

    /* 相機：球座標軌道；目標高度隨分離比例上移（與 CPO 相同手感） */
    V.cam = function () { V.tg.y = cam0.ty + V.EX * cam0.tk; var r = V.rd * Math.max(1, 1.25 / C.aspect); C.position.set(V.tg.x + r * Math.sin(V.ph) * Math.sin(V.th), V.tg.y + r * Math.cos(V.ph), V.tg.z + r * Math.sin(V.ph) * Math.cos(V.th)); C.lookAt(V.tg); };
    V.reset = function () { V.th = cam0.th; V.ph = cam0.ph; V.rd = cam0.rd; };
    V.zoomBy = function (k) { V.rd = Math.min(cam0.max, Math.max(cam0.min, V.rd * k)); };
    var dn = null;
    cv.addEventListener('pointerdown', function (e) { dn = { x: e.clientX, y: e.clientY, m: 0 }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) { if (!dn) return; var dx = e.clientX - dn.x, dy = e.clientY - dn.y; dn.m += Math.abs(dx) + Math.abs(dy); V.th -= dx * .006; V.ph = Math.min(1.5, Math.max(.2, V.ph - dy * .006)); dn.x = e.clientX; dn.y = e.clientY; });
    cv.addEventListener('pointerup', function (e) { if (dn && dn.m < 5) V.pick(e); dn = null; });
    var zoom = function (e) { e.preventDefault(); V.zoomBy(1 + e.deltaY * .001); };
    cv.addEventListener('wheel', zoom, { passive: false }); labsEl.addEventListener('wheel', zoom, { passive: false });
    var RC = new T.Raycaster(), mv = new T.Vector2();
    V.extraPick = function () { return []; };
    V.pick = function (e) { var r = cv.getBoundingClientRect(); mv.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); RC.setFromCamera(mv, C);
      var objs = V.PICK.concat(V.extraPick()).filter(function (ob) { var p = ob.parent; while (p) { if (!p.visible) return false; p = p.parent; } return ob.visible && V.shown(ob.userData.pid); });
      var h = RC.intersectObjects(objs, false)[0]; if (h) V.onPick(h.object.userData.pid); };
    /* 原理圖浮層開啟時把畫面上移（view offset），標籤投影與點選射線使用同一相機，仍然對齊 */
    var VO = '';
    V.viewOffset = function (sh) { var w = cv.clientWidth, h = cv.clientHeight, k = w + '|' + h + '|' + sh; if (k === VO || !w || !h) return; VO = k; var of = sh ? Math.min(h * .42, (sh + 72) / 2) : 0; if (of) C.setViewOffset(w, h, 0, of, w, h); else C.clearViewOffset(); };
    new ResizeObserver(function () { var w = cv.clientWidth, h = cv.clientHeight; if (w && h) { R.setSize(w, h, false); C.aspect = w / h; C.updateProjectionMatrix(); VO = ''; } }).observe(vp);
    /* 每幀：群組 y = 分離/抬升；x 由課程提供 xOf(entry, pid)（例如距離滑桿） */
    V.xOf = function () { return 0; };
    V.place = function () { for (var k in V.REG) V.REG[k].forEach(function (e) { e.g.position.y = V.off(e.lv, k); e.g.position.x = V.xOf(e, k); }); };
    V.render = function () { R.render(S, C); V.labels(); };
    return V;
  };
})(window.OptiKit);
