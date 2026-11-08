/* NPO 課程主程式：3D 模型（NPO 代表案例，獨立建模，不是 CPO 的複製）、互動、面板、原理圖、運行動畫。
   資料流：state（單一來源）→ OptiKit.npoElec / npoLayout（純函式）→ 3D 位置與走線、面板數字、原理圖標籤同步。
   依賴：three.js r128、core/ui.js、core/viewer.js、npo-physics.js、npo-content.js（皆為一般 <script>）。 */
(function () {
  var K = window.OptiKit, N = K.NPO, P = N.P, D = N.D, T = THREE, $ = function (s) { return document.querySelector(s); };
  var PM = {}; P.forEach(function (p) { PM[p.i] = p; });
  var state = { L: K.npoElec.K.Ldef, att: 'solder', running: false, stage: -1, schem: false, focus: null };
  var EL = K.npoElec(state.L, state.att), LAY = K.npoLayout(state.L);
  var lang = K.getLang ? K.getLang() : 'zh', TAB = 0, SUB = 0, RT0 = 0, NST = 6, DUR = 1.8;
  var bits = [1, 0, 1, 1, 0, 1, 0, 0];
  var OPEN = {};

  /* ---------- 3D 檢視器（共用核心 core/viewer.js） ---------- */
  var V = K.viewer({ canvas: $('#cv'), vp: $('#vp'), labs: $('#labs'), sel: 'oepkg',
    cam: { th: .6, ph: 1.0, rd: 30, ty: 1.0, tk: 1.6, min: 11, max: 48 }, onPick: function (id) { sel(id); } });
  var g, AMB = { transparent: true, opacity: .35, roughness: .9 };
  /* 4 個光學引擎（示意）：s = 左右側（+1 右、−1 左），z = 前後位置 */
  var ENG = [[1, 1.9], [1, -1.9], [-1, 1.9], [-1, -1.9]];
  /* 每個引擎群組 x = s × 引擎中心 xc（由 npoLayout(L) 決定）；其他群組 x = 0 */
  V.xOf = function (e) { return e.sx ? e.sx * LAY.xc : 0; };
  var dashed = function (w, h, d, x, y, z, col) { var ls = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, d)), new T.LineDashedMaterial({ color: col, dashSize: .14, gapSize: .09 })); ls.position.set(x, y, z); ls.computeLineDistances(); return ls; };

  /* 系統 PCB（最下方） */
  g = V.grp('pcb', 0); V.box(g, 'pcb', 22, .3, 13, 0, .15, 0, 0x2a5a45, { roughness: .75 });
  /* 共同高效能載板＋載板下方焊球 */
  g = V.grp('carrier', .5); V.inst(g, 'carrier', .085, 0xc9c9cf, V.grid(18, 11, .8, 0, .39, 0));
  g = V.grp('carrier', 1); V.box(g, 'carrier', 15, .4, 9, 0, .68, 0, 0x2d4f63, { roughness: .6 });
  [.6, .74].forEach(function (y) { V.box(g, 'carrier', 14.4, .025, 8.4, 0, y, 0, 0xc9803f, { metalness: .6 }); });
  /* ASIC 封裝焊球、ASIC 封裝（基板＋加強框＋封裝邊界虛線）、ASIC 晶片 */
  g = V.grp('asicbga', 2); V.inst(g, 'asicbga', .075, 0xd0d2d6, V.grid(11, 11, .4, 0, .97, 0));
  g = V.grp('asicpkg', 3); V.box(g, 'asicpkg', 4.6, .28, 4.6, 0, 1.19, 0, 0x6b4f2f, { roughness: .7 });
  [[0, 2.15, 4.6, .3], [0, -2.15, 4.6, .3], [2.15, 0, .3, 4.0], [-2.15, 0, .3, 4.0]].forEach(function (b) { V.box(g, 'asicpkg', b[2], .12, b[3], b[0], 1.39, b[1], 0xa9adb3, { metalness: .7, roughness: .3 }); });
  g.add(dashed(4.9, 1.0, 4.9, 0, 1.42, 0, 0xE8833A));
  g = V.grp('asic', 4); V.box(g, 'asic', 2.6, .3, 2.6, 0, 1.48, 0, 0x17181c, { roughness: .35, metalness: .3 });
  (function () { var cn = document.createElement('canvas'); cn.width = cn.height = 128; var cx = cn.getContext('2d'); cx.fillStyle = '#1a1b20'; cx.fillRect(0, 0, 128, 128); cx.strokeStyle = '#3a3d46'; cx.lineWidth = 2; for (var i = 0; i <= 128; i += 16) { cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i, 128); cx.moveTo(0, i); cx.lineTo(128, i); cx.stroke(); }
    var pl = new T.Mesh(new T.PlaneGeometry(2.5, 2.5), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cn) })); pl.rotation.x = -Math.PI / 2; pl.position.y = 1.632; pl.userData.pid = 'asic'; g.add(pl); V.PICK.push(pl); })();

  /* 載板上的高速電氣互連走線（每個引擎 3 條，長度隨 L 縮放）＋距離標尺（右前方） */
  var ICG = V.grp('ic', 1), TR = [], RUL = {};
  ENG.forEach(function (E) { [-.3, 0, .3].forEach(function (dz) { var m = V.box(ICG, 'ic', 1, .02, .06, 0, .9, E[1] + dz, 0xE8833A, { emissive: 0x5a2a08, metalness: .5 }); TR.push({ m: m, s: E[0] }); }); });
  RUL.line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: 0xE8833A }));
  ICG.add(RUL.line); RUL.mid = new T.Object3D(); ICG.add(RUL.mid);
  /* 引擎內部（以 u 表示沿「離開 ASIC」方向的位置：u = −1 內緣、+1 外緣；實際 x = s·u） */
  var SOCK = [], BALL = [];
  ENG.forEach(function (E) { var s = E[0], z = E[1], X = function (u) { return s * u; };
    g = V.grp('oeattach', 2, s);
    BALL.push(V.inst(g, 'oeattach', .055, 0xd0d2d6, V.grid(6, 5, .3, 0, .95, z)));
    var sk = new T.Group(); g.add(sk); SOCK.push(sk);
    [[0, z - .87, 2.2, .14], [0, z + .87, 2.2, .14], [1.07, z, .14, 1.6], [-1.07, z, .14, 1.6]].forEach(function (b) { var m = V.box(sk, 'oeattach', b[2], .12, b[3], b[0], .95, b[1], 0x34343a, { roughness: .6 }); });
    V.box(sk, 'oeattach', 1.9, .05, 1.5, 0, .91, z, 0x55555c, { roughness: .6 });
    g = V.grp('oepkg', 3, s); V.box(g, 'oepkg', 2.0, .2, 1.6, 0, 1.12, z, 0x7a5c38, { roughness: .7 });
    g.add(dashed(2.24, .78, 1.84, X(.06), 1.36, z, 0x2A7A6B));
    g = V.grp('pic', 4, s); V.box(g, 'pic', 1.6, .1, 1.24, X(-.05), 1.27, z, 0x1c6b5e);
    /* MZM：分光 → 兩臂 → 合光（波導發光線條） */
    var wg = { emissive: 0x1d7c6c };
    V.box(g, 'pic', .5, .02, .03, X(.3), 1.33, z + .1, 0x55d6c2, wg); V.box(g, 'pic', .5, .02, .03, X(.3), 1.33, z - .1, 0x55d6c2, wg);
    V.box(g, 'pic', .03, .02, .23, X(.05), 1.33, z, 0x55d6c2, wg); V.box(g, 'pic', .03, .02, .23, X(.55), 1.33, z, 0x55d6c2, wg);
    V.box(g, 'pic', .2, .03, .06, X(.35), 1.345, z + .1, 0xc9a24a, { metalness: .7 });/* 電極（驅動電壓加在此臂） */
    V.box(g, 'pic', .2, .02, .03, X(.7), 1.33, z, 0x55d6c2, wg); V.box(g, 'pic', .03, .02, .42, X(.0), 1.33, z - .21, 0x55d6c2, wg);
    g = V.grp('eic', 5, s); V.box(g, 'eic', .5, .12, .6, X(-.4), 1.38, z, 0x202226, { metalness: .4 });
    g = V.grp('laser', 5, s); V.box(g, 'laser', .24, .1, .22, X(.0), 1.37, z - .44, 0x9a3b30, { roughness: .4 });
    g = V.grp('coupler', 5, s); V.box(g, 'coupler', .5, .18, .5, X(1.15), 1.33, z, 0xcfc8ba);
  });
  ENG.forEach(function (E) { E.push(SOCK.shift(), BALL.shift()); });
  /* 板邊多芯光纖連接器（PCB 上，固定位置）＋光纖跳線（每幀依引擎位置與分離圖層重建） */
  g = V.grp('fiber', 0); ENG.forEach(function (E) { V.box(g, 'fiber', .7, .45, .7, E[0] * 10.3, .52, E[1], 0xb9b3a6); });
  var FG = new T.Group(), FM = V.mk('fiber', 0xf0e4bd, { roughness: .4 }), CV = []; V.S.add(FG); FG.userData.pid = 'fiber';
  V.extraPick = function () { return FG.children; };
  var vis0 = V.setVis; V.setVis = function (id, b) { vis0(id, b); if (id === 'fiber') FG.visible = b; };

  /* 3D 位置計算（與 V.place 相同規則）：引擎元件 x = s·xc + s·u；y = 幾何 y + 分離/抬升位移 */
  var o = function (pid) { return V.offOf(pid); };
  function ePath(s, z) { var v = function (a, b, c) { return new T.Vector3(a, b, c); }, I = LAY.inner, xc = LAY.xc;
    return [v(s * 1.25, 1.5 + o('asic'), z * .45), v(s * 1.7, 1.26 + o('asicpkg'), z * .6), v(s * 2.05, .97 + o('asicbga'), z * .8), v(s * 2.35, .91 + o('ic'), z),
      v(s * (I - .05), .91 + o('ic'), z), v(s * (I + .25), .97 + o('oeattach'), z), v(s * (I + .45), 1.16 + o('oepkg'), z), v(s * (xc - .4), 1.42 + o('eic'), z)]; }
  function oPath(s, z) { var v = function (a, b, c) { return new T.Vector3(a, b, c); }, xc = LAY.xc, y = 1.35 + o('pic');
    return [v(s * (xc + .05), y, z), v(s * (xc + .55), y, z + .1), v(s * (xc + .8), y, z), v(s * (xc + 1.4), 1.33 + o('coupler'), z)]; }
  function cwPath(s, z) { var v = function (a, b, c) { return new T.Vector3(a, b, c); }, xc = LAY.xc, y = 1.35 + o('pic');
    return [v(s * xc, 1.37 + o('laser'), z - .44), v(s * xc, y, z - .1), v(s * (xc + .05), y, z)]; }
  var FK = '';
  function fibers() { while (FG.children.length) { var c = FG.children[0]; FG.remove(c); c.geometry.dispose(); } CV.length = 0;
    ENG.forEach(function (E) { var s = E[0], z = E[1], y0 = 1.33 + o('coupler'), x0 = s * (LAY.xc + 1.4), y1 = .55 + o('fiber'), x1 = s * 9.95;
      var cu = new T.CubicBezierCurve3(new T.Vector3(x0, y0, z), new T.Vector3(x0 + s * 1.4, y0 + .15, z), new T.Vector3(x1 - s * 1.6, y1 + .5, z), new T.Vector3(x1, y1, z));
      CV.push(cu); var m = new T.Mesh(new T.TubeGeometry(cu, 32, .05, 6, false), FM); m.userData.pid = 'fiber'; FG.add(m); }); }
  /* L 改變 → 走線長度、標尺、焊接/插座外觀 */
  var LD = null, AD = null;
  function applyLayout() { LAY = K.npoLayout(state.L); LD = state.L;
    TR.forEach(function (t) { t.m.scale.x = LAY.g; t.m.position.x = t.s * (2.3 + LAY.g / 2); });
    var a = RUL.line.geometry.attributes.position, x0 = 2.3, x1 = LAY.inner, y = .905, zz = 3.35;
    [[x0, y, zz - .15], [x0, y, zz + .15], [x0, y, zz], [x1, y, zz], [x1, y, zz + .15], [x1, y, zz - .15]].forEach(function (p, i) { a.setXYZ(i, p[0], p[1], p[2]); }); a.needsUpdate = true; RUL.line.geometry.computeBoundingSphere();
    RUL.mid.position.set((x0 + x1) / 2 - .3, .95, zz + .2); }
  function applyAtt() { AD = state.att; ENG.forEach(function (E) { E[2].visible = state.att === 'socket'; E[3].visible = state.att === 'solder'; }); }

  /* 粒子：電訊號＝橘色方塊（ASIC → 走線 → EIC）；CW＝青色（雷射 → MZM）；調變光＝紫色亮/暗（MZM → 耦合器 → 光纖） */
  var EM1 = new T.MeshBasicMaterial({ color: 0xff8a2a }), EM0 = new T.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: .3 }), EG = new T.BoxGeometry(.11, .11, .11);
  var CWM = new T.MeshBasicMaterial({ color: 0x3ee0c0 }), MM1 = new T.MeshBasicMaterial({ color: 0xa27bff }), MM0 = new T.MeshBasicMaterial({ color: 0xa27bff, transparent: true, opacity: .28 }), SG = new T.SphereGeometry(.07, 8, 6);
  var EP = [], CP = [], OP = [], FP = [];
  ENG.forEach(function (E, ei) { for (var k = 0; k < 8; k++) { var m = new T.Mesh(EG, EM1); m.visible = false; V.S.add(m); EP.push({ m: m, e: ei, k: k }); }
    for (k = 0; k < 3; k++) { m = new T.Mesh(SG, CWM); m.scale.setScalar(.7); m.visible = false; V.S.add(m); CP.push({ m: m, e: ei, k: k }); }
    for (k = 0; k < 3; k++) { m = new T.Mesh(SG, MM1); m.visible = false; V.S.add(m); OP.push({ m: m, e: ei, k: k }); }
    for (k = 0; k < 8; k++) { m = new T.Mesh(SG, MM1); m.visible = false; V.S.add(m); FP.push({ m: m, e: ei, k: k }); } });
  function along(pts, u, out) { var tot = 0, d = []; for (var i = 1; i < pts.length; i++) { d.push(pts[i].distanceTo(pts[i - 1])); tot += d[i - 1]; } var r = u * tot; for (i = 0; i < d.length; i++) { if (r <= d[i] || i === d.length - 1) return out.copy(pts[i]).lerp(pts[i + 1], d[i] ? Math.min(1, r / d[i]) : 0); r -= d[i]; } }
  /* 電氣路徑高亮線（運行中顯示；與粒子同一條折線） */
  var PL = ENG.map(function () { var ln = new T.Line(new T.BufferGeometry().setFromPoints(ePath(1, 0)), new T.LineBasicMaterial({ color: 0xff8a2a })); ln.visible = false; V.S.add(ln); return ln; });

  /* ---------- 標籤 ---------- */
  var Lb = function (pid, zh, en, idx, x, y, z) { return V.lab(pid, zh, en, idx, x, y, z); };
  Lb('pcb', 'PCB 系統主機板', 'System PCB', 0, -9, .3, 5.5); Lb('carrier', '共同高效能載板', 'Common HP Carrier', 1, -6.8, .88, 3.9);
  Lb('asicbga', 'BGA ASIC 封裝焊球', 'ASIC BGA', 0, -2.1, .97, 2.1); Lb('asicpkg', 'ASIC 封裝（邊界）', 'ASIC Package', 0, -2.3, 1.45, -2.3); Lb('asic', 'ASIC 晶片', 'ASIC Die', 0, -.4, 1.66, .5);
  Lb('ic', '高速電氣互連', 'HS Interconnect', 0, 3.0, .92, 1.6);
  var RL = V.lab('ic', function () { return D.zh.ruler(EL.L); }, function () { return D.en.ruler(EL.L); }, 0, 0, 0, 0); RUL.mid.add(RL.o);
  Lb('oeattach', '引擎連接（焊接／插座）', 'Engine Attach', 1, 1.1, .97, -1.9); Lb('oepkg', 'OE 光學引擎封裝', 'Optical-Engine Pkg', 0, .9, 1.4, 2.8);
  Lb('eic', 'EIC 驅動晶片', 'EIC Driver', 0, -.4, 1.44, 1.9); Lb('pic', 'PIC 矽光子（MZM）', 'Si PIC (MZM)', 1, .3, 1.33, -1.8);
  Lb('laser', 'CW 雷射晶片', 'CW Laser Die', 2, 0, 1.42, 1.46); Lb('coupler', '光纖耦合器', 'Fiber Coupler', 1, 1.15, 1.42, -1.9);
  Lb('fiber', '光纖連接器', 'Fiber Connector', 0, 10.3, .75, 1.9);

  /* ---------- 狀態入口（唯一修改處） ---------- */
  function setL(p) { if ('L' in p) state.L = p.L; if ('att' in p) state.att = p.att; EL = K.npoElec(state.L, state.att); state.L = EL.L; state.att = EL.att; if (state.L !== LD) applyLayout(); if (state.att !== AD) applyAtt(); V.place(); labUpd(); schVals(); V.labelText(lang); }
  function sel(id) { V.SEL = id; V.LIFT = 0; if (TAB > 1) TAB = 0; V.hl(); render(); }
  function setRun(b) { state.running = b; state.stage = b ? 0 : -1; state.focus = null; RT0 = performance.now(); if (b) TAB = 2; else V.hl(); panel(); stageUI(); }
  function togSch(b) { state.schem = b; tb[5].classList.toggle('on', b); schem(); }
  function jump(i) { if (state.running) { RT0 = performance.now() - i * DUR * 1000; state.stage = i; } else state.focus = state.focus === i ? null : i; stageUI(); }
  function glow(t) { var a = N.STP[state.stage] || [], k = .45 + .35 * Math.sin(t * 7), col = [0xff7a1a, 0xff7a1a, 0xff7a1a, 0x2fe0c0, 0x8f5cff, 0][state.stage];
    for (var id in V.MAT) V.MAT[id].forEach(function (m) { if (a.indexOf(id) >= 0) m.emissive.setHex(col).multiplyScalar(k); else m.emissive.setHex(id === V.SEL ? 0x6b3a12 : m.userData.e); }); }

  /* ---------- 介面：工具列 ---------- */
  var tb = document.querySelectorAll('#tb button');
  tb[0].onclick = function () { V.reset(); }; tb[1].onclick = function () { V.zoomBy(.85); }; tb[2].onclick = function () { V.zoomBy(1.18); };
  tb[3].onclick = function () { V.AUTO = !V.AUTO; tb[3].classList.toggle('on', V.AUTO); tb[3].textContent = V.AUTO ? '❚❚' : '▶'; };
  tb[4].onclick = function () { V.LAB = !V.LAB; tb[4].classList.toggle('on', V.LAB); };
  tb[5].onclick = function () { togSch(!state.schem); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.schem) togSch(false); });
  $('#exr').oninput = function (e) { V.EX = e.target.value / 100; $('#exv').textContent = e.target.value + '%'; };
  $('#tg').onclick = function () { $('#side').classList.toggle('c'); };
  if (K.bindLang) K.bindLang(function (l) { lang = l; render(); });

  /* ---------- 介面：元件清單 ---------- */
  var eye = function (off) { return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>' + (off ? '<path d="M2 14L14 2"/>' : '<circle cx="8" cy="8" r="2"/>') + '</svg>'; };
  function side() { var d = D[lang], h = ''; [0, 1].forEach(function (k) { var a = P.filter(function (p) { return p.g === k; }); h += '<div class="gh">' + d.g[k] + ' · ' + a.length + '</div>';
    a.forEach(function (p) { h += '<div class="it' + (p.i === V.SEL ? ' on' : '') + '" data-p="' + p.i + '"><div class="n"><b>' + (lang === 'zh' ? p.z : p.e) + '</b><small>' + (lang === 'zh' ? p.e : p.z) + '</small></div><button class="eye" data-e="' + p.i + '">' + eye(!V.shown(p.i)) + '</button></div>'; }); }); $('#sl').innerHTML = h; }
  $('#sl').onclick = function (e) { var b = e.target.closest('[data-e]'); if (b) { var id = b.dataset.e; V.setVis(id, !V.shown(id)); side(); return; } var it = e.target.closest('[data-p]'); if (it) sel(it.dataset.p); };

  /* ---------- 剖面結構 SVG（可點選，與 3D 選取同步） ---------- */
  function xsec() { var d = D[lang], t = function (id) { return '<title>' + (lang === 'zh' ? PM[id].z : PM[id].e) + '</title>'; }, q = function (id, b) { return '<g data-p="' + id + '"' + (V.SEL === id ? ' class="sel"' : '') + '>' + t(id) + b + '</g>'; },
      r = function (n, x0, dx, y, rr, f) { var s = ''; for (var i = 0; i < n; i++) s += '<circle cx="' + (x0 + i * dx) + '" cy="' + y + '" r="' + rr + '" fill="' + f + '"/>'; return s; };
    var eg = function (x) { return q('oeattach', state.att === 'socket' ? '<rect x="' + x + '" y="84" width="74" height="7" fill="#34343a"/>' : r(6, x + 7, 12, 88, 2.6, '#d0d2d6')) + q('oepkg', '<rect x="' + x + '" y="74" width="74" height="10" fill="#7a5c38"/>') + q('pic', '<rect x="' + (x + 6) + '" y="66" width="62" height="8" fill="#1c6b5e"/>'); };
    return '<svg class="xs" viewBox="0 0 320 170">'
      + q('asicbga', r(9, 120, 10, 88, 3, '#d0d2d6')) + q('asicpkg', '<rect x="110" y="70" width="100" height="14" fill="#6b4f2f"/><rect x="110" y="62" width="10" height="8" fill="#a9adb3"/><rect x="200" y="62" width="10" height="8" fill="#a9adb3"/>')
      + q('asic', '<rect x="130" y="52" width="60" height="18" fill="#17181c"/><text x="160" y="65">ASIC</text>')
      + eg(18) + eg(228)
      + q('eic', '<rect x="72" y="57" width="20" height="9" fill="#202226"/><rect x="228" y="57" width="20" height="9" fill="#202226"/>')
      + q('laser', '<rect x="56" y="59" width="10" height="7" fill="#9a3b30"/><rect x="254" y="59" width="10" height="7" fill="#9a3b30"/>')
      + q('coupler', '<rect x="4" y="64" width="16" height="10" fill="#cfc8ba"/><rect x="300" y="64" width="16" height="10" fill="#cfc8ba"/>')
      + q('carrier', '<rect x="8" y="92" width="304" height="16" fill="#2d4f63"/>' + r(15, 20, 20, 112, 3.4, '#c9c9cf'))
      + q('ic', '<path d="M92 92.5H110M210 92.5H228" stroke="#E8833A" stroke-width="3"/>')
      + q('pcb', '<rect x="2" y="116" width="316" height="14" fill="#2a5a45"/><text x="160" y="127">PCB</text>')
      + q('fiber', '<path d="M4 69C-2 69 -2 80 2 84M316 69C322 69 322 80 318 84" stroke="#f0e4bd" stroke-width="2" fill="none"/>')
      + '<rect x="104" y="46" width="112" height="44" rx="3" fill="none" stroke="#E8833A" stroke-width="1.4" stroke-dasharray="4 3"/>'
      + '<rect x="14" y="52" width="82" height="38" rx="3" fill="none" stroke="#2A7A6B" stroke-width="1.4" stroke-dasharray="4 3"/><rect x="224" y="52" width="82" height="38" rx="3" fill="none" stroke="#2A7A6B" stroke-width="1.4" stroke-dasharray="4 3"/>'
      + '<g style="pointer-events:none"><rect x="12" y="140" width="10" height="7" fill="none" stroke="#E8833A" stroke-dasharray="3 2"/><text x="26" y="147" style="fill:var(--ink);text-anchor:start;font-weight:700;font-size:9px">' + d.xsB + '</text>'
      + '<rect x="170" y="140" width="10" height="7" fill="none" stroke="#2A7A6B" stroke-dasharray="3 2"/><text x="184" y="147" style="fill:var(--ink);text-anchor:start;font-weight:700;font-size:9px">' + d.xsE + '</text>'
      + '<text x="101" y="161" style="fill:#E8833A;font-size:9px">L</text></g></svg>'; }
  /* 三種架構封裝邊界概念圖（無數值） */
  function cmpSVG() { var d = D[lang], row = function (y, k) { return '<text x="4" y="' + (y + 13) + '" style="fill:var(--ink2);text-anchor:start;font-weight:900;font-size:9.5px">' + d.cmp[k][0] + '</text>'; },
      bx = function (x, y, w, f, t) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="16" rx="3" fill="' + f + '"/><text x="' + (x + w / 2) + '" y="' + (y + 11) + '" style="font-size:8px">' + t + '</text>'; },
      bd = function (x, y, w, h, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="none" stroke="' + c + '" stroke-width="1.3" stroke-dasharray="4 3"/>'; },
      ln = function (x1, x2, y) { return '<path d="M' + x1 + ' ' + y + 'H' + x2 + '" stroke="#E8833A" stroke-width="2.2"/>'; };
    return '<svg class="xs" viewBox="0 0 320 170" style="cursor:default">'
      + row(0, 0) + bx(150, 4, 40, '#17181c', 'ASIC') + bd(144, 0, 52, 24, '#E8833A') + ln(196, 270, 12) + '<rect x="270" y="2" width="8" height="20" fill="#8a7a68"/>' + bx(280, 4, 36, '#1c6b5e', 'OM') + bd(276, 0, 42, 24, '#2A7A6B')
      + row(56, 1) + '<rect x="140" y="80" width="176" height="8" fill="#2d4f63"/>' + bx(150, 60, 40, '#17181c', 'ASIC') + bd(144, 56, 52, 24, '#E8833A') + ln(196, 226, 68) + bx(232, 60, 40, '#1c6b5e', 'OE') + bd(226, 56, 52, 24, '#2A7A6B')
      + row(112, 2) + bx(150, 116, 40, '#17181c', 'ASIC') + ln(190, 200, 124) + bx(200, 116, 40, '#1c6b5e', 'OE') + bd(144, 112, 102, 24, '#E8833A')
      + '<text x="160" y="160" style="fill:var(--mut);font-size:8.5px;font-weight:700">' + (lang === 'zh' ? '虛線框＝封裝邊界 · 橘線＝高速電氣路徑（長度不按比例）' : 'Dashed = package boundary · orange = high-speed path (not to scale)') + '</text></svg>'; }

  /* ---------- 電氣互連實驗面板（結構只在 panel() 產生；拖曳滑桿只改數字，不重繪） ---------- */
  var f1 = function (v, n) { return (+v).toFixed(n == null ? 1 : n); };
  function labHTML(d) { var K0 = K.npoElec.K, mt = function (lb, id) { return '<div class="met"><span>' + lb + '</span><b id="' + id + '"></b></div>'; };
    return '<div class="h2">' + d.xh + '</div>'
      + '<svg class="xv" viewBox="0 0 300 54" id="lsv"><rect x="6" y="18" width="288" height="10" rx="3" fill="#2d4f63"/><rect x="10" y="6" width="56" height="12" rx="2" fill="#6b4f2f"/><rect x="22" y="2" width="32" height="8" rx="1" fill="#17181c"/>'
      + '<rect x="6" y="0" width="64" height="20" rx="3" fill="none" stroke="#E8833A" stroke-dasharray="3 2"/><path id="lsl" d="M66 17H120" stroke="#E8833A" stroke-width="3"/><g id="lse"><rect x="0" y="8" width="44" height="10" rx="2" fill="#7a5c38"/><rect x="4" y="4" width="34" height="5" fill="#1c6b5e"/><rect x="-3" y="-2" width="50" height="22" rx="3" fill="none" stroke="#2A7A6B" stroke-dasharray="3 2"/></g>'
      + '<text x="36" y="44" class="tk">ASIC</text><text id="lst" x="93" y="44" class="tk"></text><text id="lsx" x="140" y="44" class="tk">OE</text></svg>'
      + '<label class="rw" for="ls">' + d.xL + ' <b id="lsv2"></b></label><input type="range" id="ls" min="' + K0.Lmin + '" max="' + K0.Lmax + '" step="1" value="' + state.L + '">'
      + '<div class="rw">' + d.att + '</div><div class="cps" style="grid-template-columns:1fr 1fr">' + ['solder', 'socket'].map(function (k) { return '<button data-att="' + k + '"' + (state.att === k ? ' class="on"' : '') + '><b>' + d.attO[k][0] + '</b><small>' + d.attO[k][1] + '</small></button>'; }).join('') + '</div>'
      + '<div class="chip" style="position:static;display:inline-block;margin:6px 0 2px">' + d.edu + '</div>'
      + mt(d.mIL, 'lil') + mt(d.mDI, 'ldi') + mt(d.mA, 'lam') + mt(d.mAR, 'lar') + mt(d.mLv, 'llv') + mt(d.mT, 'llt')
      + '<p class="xmsg" id="lwhy" style="margin:8px 2px 0"></p><p class="xs2" id="lws"></p>'
      + '<details class="xp" data-o="bk"' + (OPEN.bk ? ' open' : '') + '><summary><span class="sp">' + d.bk + '</span><em id="lbt"></em></summary><div class="wf" id="lbk"></div></details>'
      + '<details class="xp" data-o="cp" open><summary><span class="sp">' + d.cpH + '</span></summary><div class="wf" id="lcp"></div><p class="xs2">' + d.cpN + '</p></details>'
      + '<p class="note" style="font-size:11.5px;color:var(--mut)">' + d.asm + '</p>'; }
  function labUpd() { var d = D[lang], t = function (id, v) { var e = $('#' + id); if (e) e.textContent = v; }, r = EL; if (!$('#lil')) return;
    t('lsv2', r.L + ' mm'); t('lil', f1(r.il, 2) + ' dB'); t('ldi', '+' + f1(r.dIL, 2) + ' dB'); t('lam', f1(r.amp * 100, 0) + ' %'); t('lar', f1(r.ampRel * 100, 0) + ' %'); t('llt', f1(r.lat, 0) + ' ps');
    var lv = $('#llv'); lv.textContent = d.lvN[r.lvl]; lv.className = r.lvl === 'low' ? 'q-good' : r.lvl === 'mid' ? 'q-warn' : 'q-bad';
    $('#lwhy').textContent = d.why[r.lvl]; $('#lws').textContent = r.att === 'socket' ? d.whyS : '';
    var k = (r.L - 10) / 40, x = 70 + k * 150; $('#lsl').setAttribute('d', 'M70 17H' + x); $('#lse').setAttribute('transform', 'translate(' + (x + 3) + ',4)'); t('lst', r.L + ' mm'); $('#lst').setAttribute('x', 70 + (x - 70) / 2); $('#lsx').setAttribute('x', x + 25);
    var mx = Math.max.apply(null, r.parts.map(function (p) { return p[1]; }));
    $('#lbk').innerHTML = r.parts.map(function (p) { return '<div><span>' + d.bkN[p[0]] + '</span><i style="width:' + Math.max(3, p[1] / mx * 100) + '%"' + (p[0] === 'trace' ? ' class="hot"' : '') + '></i><b>' + f1(p[1], 2) + '</b></div>'; }).join('') + '<div class="wft"><span>' + d.tot + '</span><b>' + f1(r.il, 2) + ' dB</b></div>';
    t('lbt', f1(r.il, 1) + ' dB');
    var R = K.npoRef(), rows = [['cpo', R.cpo.il], ['npo', r.il], ['plug', R.plug.il]], top = R.plug.il;
    $('#lcp').innerHTML = rows.map(function (w) { var c = d.cp[w[0]]; return '<div style="grid-template-columns:minmax(0,1fr) 70px 46px"><span><b style="font:700 11.5px inherit;color:var(--ink2);text-align:left">' + c[0] + '</b><br><small>' + c[1].replace('{L}', r.L).replace('{a}', d.attO[r.att][0]) + '</small></span><i style="width:' + Math.max(3, w[1] / top * 100) + '%;' + (w[0] === 'npo' ? 'background:var(--acc)' : w[0] === 'cpo' ? 'background:var(--teal)' : '') + '"></i><b>' + f1(w[1], 1) + ' dB</b></div>'; }).join(''); }

  /* ---------- 面板 ---------- */
  function panel() { var d = D[lang], p = PM[V.SEL], zh = lang === 'zh', h = '';
    $('#tabs').innerHTML = d.tabs.map(function (n, i) { return '<button data-t="' + i + '"' + (i === TAB ? ' class="on"' : '') + '>' + n + '</button>'; }).join('');
    if (TAB === 0) h = '<div class="card"><div class="ch"><b>' + (zh ? p.z : p.e) + '</b><i>' + (zh ? p.e : p.z) + '</i></div><p>' + (zh ? p.dz : p.de) + '</p>' + p.m.map(function (x) { return '<div class="met"><span>' + (zh ? x[0] + ' ' + x[1] : x[1]) + '</span><b>' + x[2] + '</b></div>'; }).join('')
      + '<div class="met lf"><span>' + d.lift + '</span><b id="lv">' + V.LIFT.toFixed(2) + '</b></div><input type="range" id="lf" min="0" max="100" value="' + V.LIFT * 100 + '"></div><p class="note">' + d.note + '</p>'
      + '<div class="sg">' + d.keyH + '</div>' + d.key.map(function (k, i) { return '<details class="xp" data-o="k' + i + '"' + (OPEN['k' + i] ? ' open' : '') + '><summary><span class="sp">' + k[0] + '</span></summary><p class="xs2" style="color:var(--ink)">' + k[1] + '</p></details>'; }).join('');
    else if (TAB === 1) h = '<div class="sg">' + d.xsH + '</div>' + xsec() + '<p class="note" style="font-size:11.5px">' + d.xsN + '</p><div class="sg">' + d.cmpH + '</div>' + cmpSVG()
      + d.cmp.map(function (c, i) { return '<div class="met"' + (i === 1 ? ' style="box-shadow:inset 3px 0 0 var(--br)"' : '') + '><span>' + c[0] + '</span><b style="font:500 11.5px inherit;max-width:62%;text-align:left">' + c[1] + '</b></div>'; }).join('') + '<p class="note" style="font-size:11.5px;color:var(--mut)">' + d.cmpN + '</p>';
    else if (TAB === 2) { var PW = state.running, c = function (k, f) { return '<div class="bits ' + k + '">' + bits.map(f).join('') + '</div>'; };
      h = '<div class="h2">' + d.h1 + '</div><div class="rr"><button class="pwb' + (PW ? ' on' : '') + '" data-pw>' + (PW ? d.stop : d.run) + '</button><span class="rs" id="rst"></span></div>' + lgd(d)
        + '<div class="seg">' + [0, 1].map(function (i) { return '<button data-sub="' + i + '"' + (i === SUB ? ' class="on"' : '') + '>' + d.seg[i] + '</button>'; }).join('') + '</div>';
      if (SUB === 0) h += labHTML(d);
      else h += '<div class="stl" id="stl">' + d.st.map(function (s, i) { return '<div class="st" data-s="' + i + '"><em>' + (i + 1) + '</em><div><b>' + s[0] + '</b>' + (i > 4 ? '<u>' + d.rx + '</u>' : '') + '<small>' + s[1] + '</small></div></div>'; }).join('') + '</div>'
        + '<span class="rw">' + (zh ? '① 電訊號 · ASIC 資料（點擊切換 0 / 1）' : '① Electrical · ASIC data (click to flip 0 / 1)') + '</span>' + c('in', function (b, i) { return '<i data-b="' + i + '" class="' + (b ? 'h' : '') + '">' + b + '</i>'; })
        + '<span class="rw">' + (zh ? '② 調變光 · MZM 把資料寫進光（亮 ● / 暗 ○）' : '② Modulated light · MZM writes data onto light (bright ● / dim ○)') + '</span>' + c('lt', function (b) { return '<i class="' + (PW ? b ? 'h' : 'l' : '') + '">' + (PW ? b ? '●' : '○' : '–') + '</i>'; })
        + '<p class="note" style="font-size:11.5px;color:var(--mut)">' + d.cav + '</p>'; }
    else h = d.spH.map(function (hh, k) { return '<div class="sg">' + hh + '</div><div class="tbl">' + d.sp[k].map(function (r) { return '<div><span>' + r[0] + '</span><b style="max-width:62%">' + r[1] + '</b></div>'; }).join('') + '</div>'; }).join('') + '<p class="note" style="font-size:11.5px;color:var(--mut)">' + d.src + '</p>';
    $('#pb').innerHTML = h; labUpd(); stageUI(); }
  var lgd = function (d) { return '<div class="lgd"><span><i class="ke"></i>' + d.lg[0] + '</span><span><i class="kc"></i>' + d.lg[1] + '</span><span><i class="km"></i>' + d.lg[2] + '</span></div>'; };
  $('#pb').onclick = function (e) { var b = e.target.closest('[data-b]'); if (b) { bits[+b.dataset.b] ^= 1; panel(); schem(); return; }
    if (e.target.closest('[data-pw]')) { setRun(!state.running); return; }
    var a = e.target.closest('[data-att]'); if (a) { setL({ att: a.dataset.att }); document.querySelectorAll('[data-att]').forEach(function (x) { x.classList.toggle('on', x.dataset.att === state.att); }); return; }
    var sb = e.target.closest('[data-sub]'); if (sb) { SUB = +sb.dataset.sub; panel(); return; }
    var s = e.target.closest('#stl [data-s]'); if (s) { jump(+s.dataset.s); return; }
    var q = e.target.closest('[data-p]'); if (q) sel(q.dataset.p); };
  $('#pb').addEventListener('toggle', function (e) { var x = e.target; if (x.dataset && x.dataset.o) OPEN[x.dataset.o] = x.open; }, true);
  $('#pb').oninput = function (e) { if (e.target.id === 'lf') { V.LIFT = e.target.value / 100; $('#lv').textContent = V.LIFT.toFixed(2); } if (e.target.id === 'ls') setL({ L: +e.target.value }); };
  $('#tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { TAB = +b.dataset.t; panel(); } };

  /* ---------- 運行狀態同步（只改 class 與文字） ---------- */
  function stageUI() { var r = state.running, s = state.stage, d = D[lang], f = state.focus;
    document.querySelectorAll('#sch [data-s],#stl [data-s]').forEach(function (e) { var i = +e.dataset.s; e.classList.toggle('act', r && i === s); e.classList.toggle('done', r && i < s); e.classList.toggle('pv', !r && i === f); });
    $('#sch').classList.toggle('run', r);
    var tx = r ? d.running + ' · ' + d.step + ' ' + (s + 1) + '/' + NST + (lang === 'zh' ? '：' : ': ') + d.st[s][0] : d.stopped;
    ['#scs', '#rst'].forEach(function (q) { var e = $(q); if (e) { e.textContent = tx; e.classList.toggle('on', r); } });
    var b = $('#sch [data-run]'); if (b) { b.textContent = r ? d.stop : d.run; b.classList.toggle('on', r); }
    var c = $('#sct'); if (c) c.textContent = r ? d.st[s][1] : f != null ? d.st[f][1] : d.s0;
    var rb = $('#runb'); rb.hidden = !r; rb.textContent = ''; if (r) rb.textContent = d.running + ' · ' + (s + 1) + ' ' + d.st[s][0] + (s > 4 ? (lang === 'zh' ? '（' + d.rx3 + '）' : ' (' + d.rx3 + ')') : ''); }

  /* ---------- 原理圖（SVG；封裝邊界以虛線框表示） ---------- */
  function schem() { var el = $('#sch'); el.hidden = !state.schem; if (!state.schem) return; var d = D[lang], c = d.sc, n = c.n, l = c.l;
    var Nd = function (k, s, x, y, w, cl) { return '<g class="sn ' + cl + '" data-s="' + s + '" data-k="' + k + '"><title>' + n[k][0] + ' · ' + n[k][1] + '</title><rect x="' + x + '" y="' + y + '" width="' + w + '" height="40" rx="8"/><text class="t1" x="' + (x + w / 2) + '" y="' + (y + 17) + '">' + n[k][0] + '</text><text class="t2" x="' + (x + w / 2) + '" y="' + (y + 31) + '">' + n[k][1] + '</text></g>'; },
      Kk = function (s, cl, p) { return '<path class="lk ' + cl + '" data-s="' + s + '" d="' + p + '" marker-end="url(#nh-' + cl.charAt(0) + ')"/>'; },
      X = function (x, y, t, cl, id) { return '<text class="' + (cl || 'lt') + '" x="' + x + '" y="' + y + '"' + (id ? ' id="' + id + '"' : '') + '>' + t + '</text>'; },
      sq = function (s, x, y, w, h) { var sw = w / 8, Y = function (b) { return (y + h * (1 - b)).toFixed(1); }, p = 'M' + x + ',' + Y(bits[0]); bits.forEach(function (b, i) { p += 'V' + Y(b) + 'H' + (x + (i + 1) * sw).toFixed(1); }); return '<path class="wv e" data-s="' + s + '" d="' + p + '"/>'; },
      bars = function (s, x, y, w, h) { return '<g class="wv m" data-s="' + s + '">' + bits.map(function (b, i) { return '<rect x="' + (x + i * w / 8 + 1).toFixed(1) + '" y="' + (b ? y : y + h * .65).toFixed(1) + '" width="' + (w / 8 - 2).toFixed(1) + '" height="' + (b ? h : h * .35).toFixed(1) + '" opacity="' + (b ? 1 : .35) + '"/>'; }).join('') + '</g>'; },
      mk = function (k) { return '<marker id="nh-' + k + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="ah-' + k + '" d="M0,0L8,4L0,8z"/></marker>'; };
    var svg = '<svg class="sv" viewBox="0 0 900 222"><defs>' + mk('e') + mk('c') + mk('m') + '</defs>'
      + '<rect class="bd" style="stroke:var(--mut)" x="6" y="6" width="638" height="210" rx="10"/>' + X(16, 21, c.car, 'bl')
      + '<rect class="bd p" x="16" y="28" width="132" height="64" rx="8"/>' + X(82, 104, c.pa, 'lt')
      + '<rect class="bd r" x="304" y="28" width="332" height="180" rx="8"/>' + X(470, 202, c.pe, 'lt')
      + '<rect class="bd r" x="664" y="6" width="230" height="210" rx="10"/>' + X(674, 21, c.rx, 'bl') + X(779, 202, c.rx2)
      /* 電氣：ASIC → 載板走線 → EIC → MZM */
      + Kk(1, 'e', 'M134,58H166') + Kk(1, 'e', 'M282,58H418') + X(350, 50, '', 'lv', 'scL') + X(350, 76, '', 'lv', 'scI') + sq(0, 34, 112, 64, 10) + X(66, 136, l.e)
      + Kk(2, 'e', 'M470,78V144') + sq(2, 478, 102, 60, 12)
      /* 光：CW 雷射 → MZM → 耦合器 → 光纖 → PD */
      + Kk(3, 'c always', 'M408,166H418') + X(362, 196, l.cw)
      + Kk(3, 'm', 'M520,166H530') + Kk(4, 'm', 'M624,166H702') + X(663, 158, l.fb) + bars(4, 630, 176, 66, 14) + X(568, 196, l.md)
      /* 遠端接收 */
      + Kk(5, 'e', 'M745,144V80') + Kk(5, 'e', 'M790,58H884') + sq(5, 800, 72, 64, 10)
      + Nd('asic', 0, 28, 38, 106, 'e') + Nd('ic', 1, 168, 38, 112, 'e') + Nd('eic', 2, 420, 38, 100, 'e') + Nd('las', 3, 312, 146, 96, 'o always') + Nd('mzm', 3, 420, 146, 100, 'x') + Nd('cp', 4, 532, 146, 92, 'o') + Nd('pd', 5, 704, 146, 84, 'x') + Nd('tia', 5, 704, 38, 84, 'e') + '</svg>';
    el.innerHTML = '<div class="shd"><b>' + c.t + '</b><span class="tag">' + c.tag + '</span><span class="sp"></span><button class="pwb" data-run></button><button class="x" data-close title="Esc">✕</button></div>' + svg
      + '<div class="sci"><span class="rs" id="scs"></span><span id="sct"></span></div>' + lgd(d) + '<p class="scv">' + d.cav + '<br>' + c.hint + '</p>';
    stageUI(); schVals(); }
  function schVals() { var a = $('#scL'), b = $('#scI'); if (!a) return; a.textContent = 'L = ' + EL.L + ' mm · ' + D[lang].attO[EL.att][0]; b.textContent = 'IL ≈ ' + f1(EL.il) + ' dB · ' + D[lang].lvN[EL.lvl]; b.setAttribute('class', 'lv ' + (EL.lvl === 'low' ? 'q-good' : EL.lvl === 'mid' ? 'q-warn' : 'q-bad')); }
  $('#sch').onclick = function (e) { if (e.target.closest('[data-close]')) { togSch(false); return; } if (e.target.closest('[data-run]')) { setRun(!state.running); return; } var gg = e.target.closest('[data-s]'); if (gg) jump(+gg.dataset.s); };

  /* ---------- 整頁文字 ---------- */
  function render() { var d = D[lang], p = PM[V.SEL]; if (K.markLang) K.markLang(lang); document.title = d.title;
    $('#sb').textContent = d.sub; $('#bd').textContent = d.bd; $('#st1').textContent = d.list + ' ' + P.length + d.u; $('#exl').textContent = d.ex; $('#hint').textContent = d.hint;
    tb.forEach(function (b, i) { b.title = d.tb[i]; }); $('#scb .tx').textContent = d.scB;
    $('#pill').innerHTML = d.crs + '<small style="display:block;font-size:10.5px;font-weight:700;color:var(--mut)">' + d.rep + '</small>'; $('#chip').textContent = d.sel + ' ' + (lang === 'zh' ? p.z : p.e);
    if (K.courseNav) K.courseNav($('#course'), 'npo', lang, '../'); side(); panel(); schem(); V.labelText(lang); }

  /* ---------- 動畫迴圈 ---------- */
  var t0 = performance.now(), tmp = new T.Vector3();
  function loop(now) { requestAnimationFrame(loop); var t = (now - t0) / 1000;
    if (V.AUTO) { V.th += .004; V.EX = .5 + .45 * Math.sin(t * .6); $('#exr').value = V.EX * 100; $('#exv').textContent = Math.round(V.EX * 100) + '%'; }
    if (state.L !== LD) applyLayout(); if (state.att !== AD) applyAtt();
    V.place(); var k = V.EX + '|' + V.LIFT + '|' + V.SEL + '|' + state.L; if (k !== FK) { FK = k; fibers(); }
    V.cam(); V.hideBelow = state.schem ? $('#sch').offsetTop - 10 : null; V.viewOffset(state.schem ? $('#sch').offsetHeight : 0);
    var PW = state.running; if (PW) { var s = Math.max(0, Math.floor((now - RT0) / 1000 / DUR) % NST); /* M7-A：同一幀 now 可能略早於 RT0，避免步驟 −1（待決 #31） */ if (s !== state.stage) { state.stage = s; stageUI(); } glow(t); }
    var ev = PW && V.shown('ic'), ov = PW && V.shown('pic'), fv = PW && V.shown('fiber'), EPs = {}, OPs = {}, CPs = {};
    ENG.forEach(function (E, i) { EPs[i] = ePath(E[0], E[1]); OPs[i] = oPath(E[0], E[1]); CPs[i] = cwPath(E[0], E[1]);
      var ln = PL[i]; ln.visible = ev; if (ev) { var a = ln.geometry.attributes.position; EPs[i].forEach(function (p, j) { a.setXYZ(j, p.x, p.y, p.z); }); a.needsUpdate = true; ln.geometry.computeBoundingSphere(); } });
    EP.forEach(function (p) { p.m.visible = ev; if (ev) { var b = bits[p.k]; along(EPs[p.e], (t * .14 + p.k / 8) % 1, p.m.position); p.m.material = b ? EM1 : EM0; p.m.scale.setScalar(b ? 1 : .6); } });
    CP.forEach(function (p) { p.m.visible = ov && V.shown('laser'); if (p.m.visible) along(CPs[p.e], (t * .5 + p.k / 3) % 1, p.m.position); });
    OP.forEach(function (p) { p.m.visible = ov; if (ov) { var b = bits[(p.k + 3) % 8]; along(OPs[p.e], (t * .4 + p.k / 3) % 1, p.m.position); p.m.material = b ? MM1 : MM0; p.m.scale.setScalar(b ? 1 : .6); } });
    FP.forEach(function (p) { p.m.visible = fv && !!CV[p.e]; if (p.m.visible) { var b = bits[p.k]; p.m.position.copy(CV[p.e].getPoint((t * .12 + p.k / 8) % 1)); p.m.material = b ? MM1 : MM0; p.m.scale.setScalar(b ? 1.1 : .6); } });
    V.render(); }

  /* ---------- 初始畫面：分離 45%、選取光學引擎封裝、概覽分頁、未運行 ---------- */
  V.EX = .45; $('#exr').value = 45; $('#exv').textContent = '45%';
  applyLayout(); applyAtt(); V.hl(); render(); requestAnimationFrame(loop);
  /* 測試與除錯用（只讀為主；不影響正常操作） */
  window.NPOAPP = { state: state, V: V, get EL() { return EL; }, get LAY() { return LAY; }, ENG: ENG, setL: setL, setRun: setRun, togSch: togSch, sel: sel, jump: jump, FG: FG, EP: EP, FP: FP, OP: OP, TR: TR, setTab: function (i, s) { TAB = i; if (s != null) SUB = s; panel(); } };
})();
