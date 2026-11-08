/* 可插拔課程主程式（M6）：800G OSFP 代表案例 3D 模型（獨立建模，不是 CPO / NPO 的複製）、插拔動畫、面板、原理圖、運行動畫。
   資料流：state（L、running…）＋插拔動畫 PLG → OptiKit.plugElec / plugState / plugLayout（純函式）→ 3D、狀態看板、原理圖、面板同步。
   依賴：three.js r128、core/ui.js、core/viewer.js、plug-physics.js、plug-content.js（皆為一般 <script>）。 */
(function () {
  var K = window.OptiKit, N = K.PLUG, P = N.P, D = N.D, T = THREE, $ = function (s) { return document.querySelector(s); };
  var PM = {}; P.forEach(function (p) { PM[p.i] = p; });
  var C0 = K.plugElec.K;
  var state = { L: C0.Ldef, running: false, stage: -1, schem: false, focus: null };
  var EL = K.plugElec(state.L), LAY = K.plugLayout(state.L);
  var lang = K.getLang ? K.getLang() : 'zh', TAB = 0, RT0 = 0, DUR = 1.6, NALL = 9;
  var bits = [1, 0, 1, 1, 0, 1, 0, 0], OPEN = {};
  /* 插拔動畫：p 行程比例（0 插入、1 拔出）、mv 進行中的動作、lockT 最近一次鎖定的時間（秒；金手指離開接點後設為 null） */
  var PLG = { p: 0, mv: null, lockT: -100, tab: 0 }, ST = K.plugState(0, false, 100), EVT = '';
  var MX = 0;                                  /* 模組群組的 x 位移 = p × travel */
  var nowS = function () { return performance.now() / 1000; };

  /* ---------- 3D 檢視器（共用核心 core/viewer.js） ---------- */
  var V = K.viewer({ canvas: $('#cv'), vp: $('#vp'), labs: $('#labs'), sel: 'shell',
    cam: { th: .32, ph: 1.02, rd: 29, ty: .8, tk: 2.4, min: 8, max: 52 }, onPick: function (id) { sel(id); } });
  /* x 位移：m = 模組元件（隨插拔移動，拉環另加 tab 位移）；a = ASIC（隨 PCB 走線長度 L 移動） */
  V.xOf = function (e) { return e.m ? MX + (e.tab ? PLG.tab : 0) : e.a ? LAY.asicX : 0; };
  var g, CLR = { transparent: true, opacity: .22, depthWrite: false, metalness: .7, roughness: .3 };
  var unpick = function (m) { var i = V.PICK.indexOf(m); if (i >= 0) V.PICK.splice(i, 1); return m; };

  /* 系統 PCB（x −16.4 … 6.2；前面板在 +x 端） */
  g = V.grp('pcb', 0); V.box(g, 'pcb', 22.6, .3, 10, -5.1, .15, 0, 0x2a5a45, { roughness: .75 });
  /* 交換器 ASIC 封裝：焊球、封裝基板、金屬上蓋（群組 x = LAY.asicX） */
  g = V.grp('asic', 1, 0, { a: 1 }); V.inst(g, 'asic', .07, 0xd0d2d6, V.grid(12, 12, .25, 0, .37, 0));
  V.box(g, 'asic', 3.2, .2, 3.2, 0, .54, 0, 0x6b4f2f, { roughness: .7 }); V.box(g, 'asic', 2.6, .24, 2.6, 0, .76, 0, 0xa9adb3, { metalness: .75, roughness: .3 });
  /* PCB 高速走線：上方 4 條＝發射（z > 0）、下方 4 條＝接收（z < 0）；長度隨 L（applyLayout） */
  var TRG = V.grp('trace', 0), TR = [], LZ = [.75, .55, .35, .15, -.15, -.35, -.55, -.75];
  LZ.forEach(function (z) { TR.push(V.box(TRG, 'trace', 1, .02, .07, 0, .315, z, 0xE8833A, { emissive: 0x5a2a08, metalness: .5 })); });
  var RUL = { line: new T.Line(new T.BufferGeometry().setFromPoints([0, 1, 2, 3, 4, 5].map(function () { return new T.Vector3(); })), new T.LineBasicMaterial({ color: 0xE8833A })), mid: new T.Object3D() };
  TRG.add(RUL.line); TRG.add(RUL.mid);
  /* OSFP 主機連接器（籠子最後方，x −3.0 … −2.0）＋接點狀態條（綠＝接觸、紅＝未接觸；不登記 MAT，避免被高亮覆蓋） */
  g = V.grp('conn', 1.5); V.box(g, 'conn', 1.0, .9, 2.0, -2.5, .75, 0, 0x26272c, { roughness: .6 });
  V.box(g, 'conn', .06, .05, 1.7, -2.02, .67, 0, 0x101114); V.box(g, 'conn', .06, .05, 1.7, -2.02, .57, 0, 0x101114);
  var CSM = new T.MeshBasicMaterial({ color: 0x2e9d6a }), CS = new T.Mesh(new T.BoxGeometry(.05, .05, 1.6), CSM); CS.position.set(-1.98, .62, 0); g.add(CS);
  /* 拔出時的紅色 ✕（連接中斷位置） */
  var XM = new T.MeshBasicMaterial({ color: 0xd9534f }), XG = new T.Group(); [1, -1].forEach(function (s) { var b = new T.Mesh(new T.BoxGeometry(.06, .9, .12), XM); b.rotation.x = s * .78; XG.add(b); });
  XG.rotation.y = Math.PI / 2; XG.position.set(-1.9, .75, 0); g.add(XG); XG.visible = false;
  /* OSFP 籠子（半透明金屬，不可點選；前方套環與卡扣可點選）＋前面板（含開口） */
  g = V.grp('cage', 6);
  [[8.4, .04, 2.16, 2.0, 1.66, 0], [8.4, 1.36, .04, 2.0, .98, 1.08], [8.4, 1.36, .04, 2.0, .98, -1.08]].forEach(function (b) { unpick(V.box(g, 'cage', b[0], b[1], b[2], b[3], b[4], b[5], 0xb8bcc4, CLR)); });
  [[.3, .08, 2.24, 6.05, 1.68, 0], [.3, 1.36, .08, 6.05, .98, 1.1], [.3, 1.36, .08, 6.05, .98, -1.1], [.6, .14, .06, 4.9, 1.0, 1.12], [.6, .14, .06, 4.9, 1.0, -1.12]].forEach(function (b) { V.box(g, 'cage', b[0], b[1], b[2], b[3], b[4], b[5], 0x9aa0a8, { metalness: .8, roughness: .3 }); });
  g = V.grp('cage', 0);
  [[.2, 2.6, 3.8, 6.3, 1.3, -3.1], [.2, 2.6, 3.8, 6.3, 1.3, 3.1], [.2, .9, 2.4, 6.3, 2.15, 0]].forEach(function (b) { V.box(g, 'cage', b[0], b[1], b[2], b[3], b[4], b[5], 0x3a3d44, { transparent: true, opacity: .55, roughness: .6 }); });

  /* ---------- 可拔出的 OSFP 模組（全部群組帶 m:1 → x = MX） ---------- */
  var M = function (pid, lv, ex) { return V.grp(pid, lv, 0, Object.assign({ m: 1 }, ex || {})); };
  /* 外殼：底殼（含側牆）、頂蓋；拉環另成一組（解除卡扣時先移動） */
  g = M('shell', .5); V.box(g, 'shell', 8.4, .1, 1.88, 2.2, .45, 0, 0x8d939c, { metalness: .7, roughness: .35 });
  [.91, -.91].forEach(function (z) { V.box(g, 'shell', 8.4, .55, .06, 2.2, .78, z, 0x8d939c, { metalness: .7, roughness: .35 }); });
  V.box(g, 'shell', .1, .62, 1.88, 6.36, .78, 0, 0x7d838c, { metalness: .7, roughness: .35 });
  g = M('shell', 4.5); V.box(g, 'shell', 8.4, .08, 1.88, 2.2, 1.1, 0, 0x9aa1aa, { metalness: .7, roughness: .3 });
  g = M('shell', 4.5, { tab: 1 }); V.box(g, 'shell', .9, .04, .7, 6.85, 1.14, 0, 0x3b6fd6, { roughness: .5 }); V.box(g, 'shell', .1, .3, .7, 7.3, 1.0, 0, 0x3b6fd6, { roughness: .5 });
  /* 整合式散熱鰭片 */
  g = M('hs', 5); for (var f = 0; f < 9; f++) V.box(g, 'hs', 7.6, .3, .05, 2.1, 1.3, -.8 + f * .2, 0xc7ccd3, { metalness: .8, roughness: .25 });
  /* 模組 PCB＋金手指＋板上短走線 */
  g = M('mpcb', 1.5); V.box(g, 'mpcb', 7.8, .06, 1.7, 1.3, .62, 0, 0x1f6a4a, { roughness: .6 });
  for (f = 0; f < 12; f++) V.box(g, 'mpcb', .4, .012, .08, -2.38, .656, -.77 + f * .14, 0xd4a93a, { metalness: .9, roughness: .25 });
  [[.25, 1], [.65, 1], [-.25, -1], [-.65, -1]].forEach(function (q) { V.box(g, 'mpcb', 1.7, .01, .04, -1.2, .656, q[0] * .9, 0xE8833A, { emissive: 0x5a2a08 }); V.box(g, 'mpcb', .9, .01, .04, 1.2, .656, q[0], 0xE8833A, { emissive: 0x5a2a08 }); });
  g = M('mcu', 2.5); V.box(g, 'mcu', .42, .08, .42, -1.3, .69, -.58, 0x2b2d33);
  g = M('dsp', 2.5); V.box(g, 'dsp', 1.1, .1, 1.1, .2, .7, 0, 0x17181c, { roughness: .35 }); V.box(g, 'dsp', .8, .04, .8, .2, .77, 0, 0xa9adb3, { metalness: .8, roughness: .3 });
  /* 兩組 400G-DR4（zc = ±0.45）：發射列 zc+0.2（驅動器→EML），接收列 zc−0.2（PD→TIA） */
  var PORT = [.45, -.45];
  g = M('drv', 2.5); PORT.forEach(function (zc) { V.box(g, 'drv', .5, .08, .3, 1.85, .69, zc + .2, 0x33363d); });
  g = M('tia', 2.5); PORT.forEach(function (zc) { V.box(g, 'tia', .5, .08, .3, 1.85, .69, zc - .2, 0x4a3f5c); });
  g = M('eml', 3); PORT.forEach(function (zc) { V.box(g, 'eml', .36, .1, .32, 2.8, .7, zc + .2, 0x9a3b30, { roughness: .4 }); for (var k = 0; k < 4; k++) V.box(g, 'eml', .04, .04, .04, 2.99, .73, zc + .08 + k * .08, 0xff6b4a, { emissive: 0x8a1e10 }); });
  g = M('pd', 3); PORT.forEach(function (zc) { V.box(g, 'pd', .36, .1, .32, 2.8, .7, zc - .2, 0x2f4f7a, { roughness: .4 }); });
  g = M('lens', 3.5); PORT.forEach(function (zc) { V.box(g, 'lens', .22, .26, .74, 3.6, .8, zc, 0xbfe6ff, { transparent: true, opacity: .55, roughness: .1 });
    [.2, -.2].forEach(function (dz) { V.box(g, 'lens', 1.7, .03, .05, 4.6, .8, zc + dz * .6, 0xdff3ff, { transparent: true, opacity: .7 }); }); });
  g = M('mpo', 2); PORT.forEach(function (zc) { V.box(g, 'mpo', .9, .42, .62, 5.9, .82, zc, 0x2d3036, { roughness: .6 }); });
  /* 光纖：MPO 插頭（隨模組移動）＋跳線（每幀依位置重建） */
  g = M('fiber', 2); PORT.forEach(function (zc) { V.box(g, 'fiber', .6, .32, .5, 6.66, .82, zc, 0x55b8e8, { roughness: .5 }); });
  var FG = new T.Group(), FM = V.mk('fiber', 0xf2d36b, { roughness: .4 }), CV = []; V.S.add(FG);
  V.extraPick = function () { return FG.children; };
  var vis0 = V.setVis; V.setVis = function (id, b) { vis0(id, b); if (id === 'fiber') FG.visible = b; };

  /* ---------- 位置計算（與 V.place 相同規則：y = 幾何 y + 分離／抬升；模組 x + MX） ---------- */
  var o = function (pid) { return V.offOf(pid); }, v3 = function (a, b, c) { return new T.Vector3(a, b, c); };
  function hostTx(z) { var ax = LAY.asicX; return [v3(ax + 1.1, .9 + o('asic'), z * .7), v3(ax + 1.65, .33 + o('trace'), z), v3(LAY.connX, .33 + o('trace'), z), v3(-2.3, .62 + o('conn'), z * .9)]; }
  function modTx(zc) { var x = MX; return [v3(x - 2.3, .67 + o('mpcb'), zc * 1.4), v3(x + .2, .8 + o('dsp'), zc * .5), v3(x + 1.85, .76 + o('drv'), zc + .2), v3(x + 2.8, .78 + o('eml'), zc + .2)]; }
  function optTx(zc) { var x = MX; return [v3(x + 3.0, .74 + o('eml'), zc + .2), v3(x + 3.6, .8 + o('lens'), zc + .12), v3(x + 5.45, .8 + o('lens'), zc + .12), v3(x + 6.36, .82 + o('mpo'), zc + .1)]; }
  function optRx(zc) { var x = MX; return [v3(x + 6.36, .82 + o('mpo'), zc - .1), v3(x + 5.45, .8 + o('lens'), zc - .12), v3(x + 3.6, .8 + o('lens'), zc - .12), v3(x + 3.0, .74 + o('pd'), zc - .2)]; }
  function modRx(zc) { var x = MX; return [v3(x + 2.8, .78 + o('pd'), zc - .2), v3(x + 1.85, .76 + o('tia'), zc - .2), v3(x + .2, .8 + o('dsp'), zc * .5), v3(x - 2.3, .67 + o('mpcb'), zc * 1.4)]; }
  var FK = '';
  function fibers() { while (FG.children.length) { var c = FG.children[0]; FG.remove(c); c.geometry.dispose(); } CV.length = 0;
    PORT.forEach(function (zc, i) { var x0 = MX + 6.96, y0 = .82 + o('fiber'), s = i ? -1 : 1;
      var cu = new T.CubicBezierCurve3(v3(x0, y0, zc), v3(x0 + 1.6, y0, zc), v3(x0 + 2.4, y0 - .1, zc + s * .9), v3(x0 + 3.6, y0 - .25, zc + s * 1.9));
      CV.push(cu); var m = new T.Mesh(new T.TubeGeometry(cu, 30, .07, 6, false), FM); m.userData.pid = 'fiber'; m.visible = true; FG.add(m); }); }
  var LD = null;
  function applyLayout() { LAY = K.plugLayout(state.L); LD = state.L; var x0 = LAY.asicX + 1.6, x1 = LAY.connX;
    TR.forEach(function (m) { m.scale.x = x1 - x0; m.position.x = (x0 + x1) / 2; });
    var a = RUL.line.geometry.attributes.position, y = .32, zz = 1.9;
    [[x0, y, zz - .15], [x0, y, zz + .15], [x0, y, zz], [x1, y, zz], [x1, y, zz + .15], [x1, y, zz - .15]].forEach(function (p, i) { a.setXYZ(i, p[0], p[1], p[2]); }); a.needsUpdate = true; RUL.line.geometry.computeBoundingSphere();
    RUL.mid.position.set((x0 + x1) / 2 - 1.2, .35, zz + .25); }

  /* ---------- 粒子：電＝橘方塊；調變光＝紫亮/暗 ---------- */
  var EM1 = new T.MeshBasicMaterial({ color: 0xff8a2a }), EM0 = new T.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: .3 }), EG = new T.BoxGeometry(.11, .11, .11);
  var MM1 = new T.MeshBasicMaterial({ color: 0xa27bff }), MM0 = new T.MeshBasicMaterial({ color: 0xa27bff, transparent: true, opacity: .28 }), SG = new T.SphereGeometry(.07, 8, 6);
  var PS = { hTx: [], hRx: [], mTx: [], mRx: [], oTx: [], oRx: [], fTx: [], fRx: [] };
  var mkP = function (arr, n, geo, mat, lane) { for (var k = 0; k < n; k++) { var m = new T.Mesh(geo, mat); m.visible = false; V.S.add(m); arr.push({ m: m, l: lane, k: k, n: n }); } };
  [0, 1, 2, 3].forEach(function (i) { mkP(PS.hTx, 4, EG, EM1, i); mkP(PS.hRx, 4, EG, EM1, i + 4); });
  [0, 1].forEach(function (i) { mkP(PS.mTx, 4, EG, EM1, i); mkP(PS.mRx, 4, EG, EM1, i); mkP(PS.oTx, 3, SG, MM1, i); mkP(PS.oRx, 3, SG, MM1, i); mkP(PS.fTx, 6, SG, MM1, i); mkP(PS.fRx, 6, SG, MM1, i); });
  function along(pts, u, out) { var tot = 0, d = []; for (var i = 1; i < pts.length; i++) { d.push(pts[i].distanceTo(pts[i - 1])); tot += d[i - 1]; } var r = u * tot; for (i = 0; i < d.length; i++) { if (r <= d[i] || i === d.length - 1) return out.copy(pts[i]).lerp(pts[i + 1], d[i] ? Math.min(1, r / d[i]) : 0); r -= d[i]; } }

  /* ---------- 標籤 ---------- */
  var Lb = function (pid, zh, en, idx, x, y, z) { return V.lab(pid, zh, en, idx, x, y, z); };
  Lb('pcb', '系統 PCB', 'System PCB', 0, -15, .3, 4.4); Lb('asic', '交換器 ASIC', 'Switch ASIC', 0, -.6, .9, 1.2);
  Lb('trace', 'PCB 高速走線', 'PCB HS Traces', 0, -4.6, .33, -.9);
  var RL = V.lab('trace', function () { return D.zh.ruler(EL.L); }, function () { return D.en.ruler(EL.L); }, 0, 0, 0, 0); RUL.mid.add(RL.o);
  V.lab('conn', function () { return 'OSFP 連接器 · ' + (ST.elec ? '● 已連接' : '✕ 未連接'); }, function () { return 'OSFP connector · ' + (ST.elec ? '● connected' : '✕ not connected'); }, 0, -2.7, 1.25, -1.0);
  Lb('cage', 'OSFP 籠子', 'OSFP Cage', 0, 0, 1.7, 1.1); Lb('cage', '前面板', 'Front Panel', 1, 6.3, 2.6, -2.2);
  Lb('shell', '模組外殼', 'Module Housing', 1, .4, 1.15, .9); Lb('shell', '拉環', 'Pull Tab', 2, 7.3, 1.2, 0);
  Lb('hs', '散熱鰭片', 'Heat-Sink Fins', 0, 3.8, 1.46, -.9);
  Lb('mpcb', '模組 PCB · 金手指', 'Module PCB · Fingers', 0, -2.4, .66, .9); Lb('mcu', '管理 MCU', 'Mgmt MCU', 0, -1.3, .74, -.6);
  Lb('dsp', 'PAM4 DSP', 'PAM4 DSP', 0, .2, .8, 0); Lb('drv', 'EML 驅動器', 'EML Driver', 0, 1.85, .74, .65); Lb('tia', 'TIA', 'TIA', 0, 1.85, .74, -.65);
  Lb('eml', 'EML 雷射', 'EML Laser', 0, 2.8, .76, .25); Lb('pd', 'PIN PD', 'PIN PD', 0, 2.8, .76, -.25);
  Lb('lens', '透鏡', 'Lenses', 0, 3.6, .94, .45); Lb('mpo', 'MPO-12 插座', 'MPO-12', 0, 5.9, 1.04, -.45); Lb('fiber', '光纖跳線', 'Fiber Cords', 0, 6.66, .98, .45);

  /* ---------- 狀態入口 ---------- */
  function setL(p) { if ('L' in p) state.L = p.L; EL = K.plugElec(state.L); state.L = EL.L; if (state.L !== LD) applyLayout(); V.place(); pcbUpd(); schVals(); dash(); V.labelText(lang); }
  function sel(id) { V.SEL = id; V.LIFT = 0; TAB = 0; V.hl(); render(); }
  function nsteps() { return ST.link === 'up' ? NALL : N.HOST; }
  function setRun(b) { state.running = b; state.stage = b ? 0 : -1; state.focus = null; RT0 = performance.now(); if (!b) V.hl(); panel(); stageUI(); }
  function togSch(b) { state.schem = b; tb[5].classList.toggle('on', b); schem(); }
  function jump(i) { if (state.running && i < nsteps()) { RT0 = performance.now() - i * DUR * 1000; state.stage = i; } else state.focus = state.focus === i ? null : i; stageUI(); }
  /* 插拔：拔除＝解除卡扣 0.45 s → 滑出 2.0 s；插入＝滑入 2.0 s → 卡扣 0.35 s → 鎖定（開始初始化計時） */
  function plug(dir) { if (PLG.mv) return; if (dir === 'out' && PLG.p > 0) return; if (dir === 'in' && PLG.p < 1) return; PLG.mv = { dir: dir, ph: dir === 'out' ? 'unlatch' : 'slide', t0: nowS() }; plugTick(); plugUI(); }
  function plugTick() { var m = PLG.mv, t = nowS(); if (m) { var u = t - m.t0;
      if (m.dir === 'out') { if (m.ph === 'unlatch') { PLG.tab = .3 * K.plugEase(u / .45); if (u >= .45) { m.ph = 'slide'; m.t0 = t; } }
        else { PLG.p = K.plugEase(u / 2.0); if (u >= 2.0) { PLG.p = 1; PLG.tab = 0; PLG.mv = null; } } }
      else { if (m.ph === 'slide') { PLG.p = 1 - K.plugEase(u / 2.0); PLG.tab = .3; if (u >= 2.0) { PLG.p = 0; m.ph = 'latch'; m.t0 = t; } }
        else { PLG.tab = .3 * (1 - K.plugEase(u / .35)); if (u >= .35) { PLG.tab = 0; PLG.mv = null; PLG.lockT = t; } } } }
    if (PLG.p >= C0.contact) PLG.lockT = null;                 /* 金手指離開接點：鏈路必須在重新插入鎖定後才會再建立 */
    MX = PLG.p * LAY.travel;
    var s = K.plugState(PLG.p, !!PLG.mv, PLG.lockT == null ? null : t - PLG.lockT), ch = s.mech !== ST.mech || s.elec !== ST.elec || s.link !== ST.link;
    if (ch) { var wasUp = ST.link === 'up'; ST = s;
      EVT = !s.elec ? D[lang].evO : s.link === 'wait' ? '' : s.link === 'init' ? D[lang].evI : s.link === 'up' && !wasUp ? D[lang].evU : EVT;
      if (state.running && (s.link === 'up') !== wasUp) { RT0 = performance.now(); state.stage = 0; }
      plugUI(); stageUI(); V.labelText(lang); } else ST = s; }

  function glow(t) { var a = N.STP[state.stage] || [], k = .45 + .35 * Math.sin(t * 7), col = [0xff7a1a, 0xff7a1a, 0xff7a1a, 0xff7a1a, 0xff7a1a, 0x8f5cff, 0x8f5cff, 0xff7a1a, 0xff7a1a][state.stage] || 0;
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
  $('#plugc').onclick = function (e) { if (e.target.closest('[data-plug]')) plugBtn(); };
  function plugBtn() { plug(PLG.p > 0 ? 'in' : 'out'); }
  if (K.bindLang) K.bindLang(function (l) { lang = l; render(); });

  /* ---------- 元件清單 ---------- */
  var eye = function (off) { return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>' + (off ? '<path d="M2 14L14 2"/>' : '<circle cx="8" cy="8" r="2"/>') + '</svg>'; };
  function side() { var d = D[lang], h = ''; [0, 1, 2].forEach(function (k) { var a = P.filter(function (p) { return p.g === k; }); h += '<div class="gh">' + d.g[k] + ' · ' + a.length + '</div>';
    a.forEach(function (p) { h += '<div class="it' + (p.i === V.SEL ? ' on' : '') + '" data-p="' + p.i + '"><div class="n"><b>' + (lang === 'zh' ? p.z : p.e) + '</b><small>' + (lang === 'zh' ? p.e : p.z) + '</small></div><button class="eye" data-e="' + p.i + '">' + eye(!V.shown(p.i)) + '</button></div>'; }); }); $('#sl').innerHTML = h; }
  $('#sl').onclick = function (e) { var b = e.target.closest('[data-e]'); if (b) { var id = b.dataset.e; V.setVis(id, !V.shown(id)); side(); return; } var it = e.target.closest('[data-p]'); if (it) sel(it.dataset.p); };

  /* ---------- 狀態看板（面板頂端固定）與 3D 插拔卡 ---------- */
  var f1 = function (v, n) { return (+v).toFixed(n == null ? 1 : n); };
  var qc = function (k) { return k === 'good' ? 'q-good' : k === 'warn' ? 'q-warn' : 'q-bad'; };
  function stTxt() { var d = D[lang]; return {
      mech: [d.mechN[ST.mech], ST.mech === 'locked' ? 'good' : ST.mech === 'out' ? 'bad' : 'warn'],
      elec: [d.elecN[ST.elec ? 'on' : 'off'], ST.elec ? 'good' : 'bad'],
      link: [d.linkN[ST.link], ST.link === 'up' ? 'good' : ST.link === 'down' ? 'bad' : 'warn'] }; }
  function btnTxt() { var d = D[lang]; return PLG.mv ? (PLG.mv.dir === 'out' ? d.busyO : d.busyI) : PLG.p > 0 ? d.in : d.out; }
  function dash() { var d = D[lang], s = stTxt(), c = function (lb, v, cl, sub) { return '<div class="dc"><small>' + lb + '</small><b class="' + qc(cl) + '">' + v + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>'; };
    $('#dash').innerHTML = '<div class="dg">' + c(d.mech, s.mech[0], s.mech[1]) + c(d.elec, s.elec[0], s.elec[1]) + c(d.link, s.link[0], s.link[1])
      + c(d.ilS, f1(EL.il) + ' dB', EL.lvl === 'low' ? 'good' : EL.lvl === 'mid' ? 'warn' : 'bad', 'L = ' + EL.L + ' mm · ' + d.lvN[EL.lvl] + ' 〔C〕') + '</div>'
      + '<div class="dr"><button class="pwb' + (PLG.p > 0 ? ' on' : '') + '" data-plug' + (PLG.mv ? ' disabled' : '') + '>' + btnTxt() + '</button><span class="ev">' + (EVT || '&nbsp;') + '</span></div>'; }
  function card() { var d = D[lang], s = stTxt(), r = function (lb, x) { return '<div><i class="dot ' + qc(x[1]) + '"></i><small>' + lb + '</small><b class="' + qc(x[1]) + '">' + x[0] + '</b></div>'; };
    $('#plugc').innerHTML = '<button class="pwb' + (PLG.p > 0 ? ' on' : '') + '" data-plug' + (PLG.mv ? ' disabled' : '') + '>' + btnTxt() + '</button>' + r(d.mech, s.mech) + r(d.elec, s.elec) + r(d.link, s.link); }
  function plugUI() { dash(); card(); var pr = $('#prow'); if (pr) pr.innerHTML = plugRows(); schPlug();
    document.querySelectorAll('#pb [data-plug]').forEach(function (b) { b.textContent = btnTxt(); b.classList.toggle('on', PLG.p > 0); b.disabled = !!PLG.mv; }); }
  $('#dash').onclick = function (e) { if (e.target.closest('[data-plug]')) plugBtn(); };
  function plugRows() { var s = stTxt(), d = D[lang]; return [['mech', d.mech], ['elec', d.elec], ['link', d.link]].map(function (k) { return '<div class="met"><span>' + k[1] + '</span><b class="' + qc(s[k[0]][1]) + '">' + s[k[0]][0] + '</b></div>'; }).join(''); }

  /* ---------- PCB 通道（結構只在 panel() 產生；拖曳滑桿只改數字，不重繪） ---------- */
  function pcbHTML(d) { var mt = function (lb, id) { return '<div class="met"><span>' + lb + '</span><b id="' + id + '"></b></div>'; };
    return '<div class="h2">' + d.xh + '</div>'
      + '<label class="rw" for="ls">' + d.xL + ' <b id="lsv2"></b></label><input type="range" id="ls" min="' + C0.Lmin + '" max="' + C0.Lmax + '" step="5" value="' + state.L + '">'
      + '<div class="rw">' + d.pre + '</div><div class="cps" style="grid-template-columns:1fr 1fr 1fr">' + C0.presets.map(function (L, i) { return '<button data-pre="' + L + '"' + (state.L === L ? ' class="on"' : '') + '><b>' + L + ' mm</b><small>' + d.preN[i] + '</small></button>'; }).join('') + '</div>'
      + '<div class="chip" style="position:static;display:inline-block;margin:6px 0 2px">' + d.edu + '</div>'
      + mt(d.mIL, 'lil') + mt(d.mDI, 'ldi') + mt(d.mA, 'lam') + mt(d.mAR, 'lar') + mt(d.mLv, 'llv') + mt(d.mT, 'llt')
      + '<p class="xmsg" id="lwhy" style="margin:8px 2px 0"></p><p class="xs2">' + d.dspN + '</p>'
      + '<details class="xp" data-o="bk"' + (OPEN.bk !== false ? ' open' : '') + '><summary><span class="sp">' + d.bk + '</span><em id="lbt"></em></summary><div class="wf" id="lbk"></div></details>'
      + '<details class="xp" data-o="cp"' + (OPEN.cp ? ' open' : '') + '><summary><span class="sp">' + d.cpH + '</span></summary><p class="xs2" id="lcp" style="font-weight:700;color:var(--ink2)"></p><p class="xs2">' + d.cpN + '</p></details>'
      + '<p class="note" style="font-size:11.5px;color:var(--mut)">' + d.asm + '</p>'; }
  function pcbUpd() { var d = D[lang], t = function (id, v) { var e = $('#' + id); if (e) e.textContent = v; }, r = EL; if (!$('#lil')) return;
    t('lsv2', r.L + ' mm'); t('lil', f1(r.il, 2) + ' dB'); t('ldi', '+' + f1(r.dIL, 2) + ' dB'); t('lam', f1(r.amp * 100, 0) + ' %'); t('lar', f1(r.ampRel * 100, 0) + ' %'); t('llt', f1(r.lat / 1000, 2) + ' ns');
    var lv = $('#llv'); lv.textContent = d.lvN[r.lvl]; lv.className = r.lvl === 'low' ? 'q-good' : r.lvl === 'mid' ? 'q-warn' : 'q-bad';
    $('#lwhy').textContent = d.why[r.lvl];
    document.querySelectorAll('[data-pre]').forEach(function (b) { b.classList.toggle('on', +b.dataset.pre === r.L); });
    var mx = Math.max.apply(null, r.parts.map(function (p) { return p[1]; }));
    $('#lbk').innerHTML = r.parts.map(function (p) { return '<div><span>' + d.bkN[p[0]] + '</span><i style="width:' + Math.max(3, p[1] / mx * 100) + '%"' + (p[0] === 'trace' ? ' class="hot"' : '') + '></i><b>' + f1(p[1], 2) + '</b></div>'; }).join('') + '<div class="wft"><span>' + d.tot + '</span><b>' + f1(r.il, 2) + ' dB</b></div>';
    t('lbt', f1(r.il, 1) + ' dB'); t('lcp', d.cpR(f1(K.plugElec(200).il), f1(K.plugElec(200, C0.fRef).il))); }

  /* ---------- 面板 ---------- */
  function panel() { var d = D[lang], p = PM[V.SEL], zh = lang === 'zh', h = '';
    $('#tabs').innerHTML = d.tabs.map(function (n, i) { return '<button data-t="' + i + '"' + (i === TAB ? ' class="on"' : '') + '>' + n + '</button>'; }).join('');
    if (TAB === 0) h = '<div class="card"><div class="ch"><b>' + (zh ? p.z : p.e) + '</b><i>' + (zh ? p.e : p.z) + '</i></div><p>' + (zh ? p.dz : p.de) + '</p>' + p.m.map(function (x) { return '<div class="met"><span>' + (zh ? x[0] + ' ' + x[1] : x[1]) + '</span><b>' + x[2] + '</b></div>'; }).join('')
      + '<div class="met lf"><span>' + d.lift + '</span><b id="lv">' + V.LIFT.toFixed(2) + '</b></div><input type="range" id="lf" min="0" max="100" value="' + V.LIFT * 100 + '"></div><p class="note">' + d.note + '</p>'
      + '<div class="sg">' + d.keyH + '</div>' + d.key.map(function (k, i) { return '<details class="xp" data-o="k' + i + '"' + (OPEN['k' + i] ? ' open' : '') + '><summary><span class="sp">' + k[0] + '</span></summary><p class="xs2" style="color:var(--ink)">' + k[1] + '</p></details>'; }).join('');
    else if (TAB === 1) h = '<div class="h2">' + d.plugH + '</div><div class="rr"><button class="pwb' + (PLG.p > 0 ? ' on' : '') + '" data-plug>' + btnTxt() + '</button></div><div id="prow">' + plugRows() + '</div>'
      + '<p class="note">' + d.plugP + '</p>' + d.plugSeq.map(function (s) { return '<div class="met" style="display:block"><span style="display:block;margin-bottom:2px">' + s[0] + '</span><span style="font-weight:500;color:var(--ink)">' + s[1] + '</span></div>'; }).join('')
      + '<p class="note" style="font-size:11.5px;color:#d08a1a;font-weight:700">' + d.plugW + '</p>'
      + '<details class="xp" data-o="hot"' + (OPEN.hot ? ' open' : '') + '><summary><span class="sp">' + d.hotH + '</span></summary><p class="xs2" style="color:var(--ink)">' + d.hot + '</p></details>';
    else if (TAB === 2) h = '<div class="h2">' + d.h1 + '</div><div class="rr"><button class="pwb' + (state.running ? ' on' : '') + '" data-pw>' + (state.running ? d.stop : d.run) + '</button><span class="rs" id="rst"></span></div>' + lgd(d)
      + '<p class="xs2" id="rcut" style="color:#d9534f;font-weight:700"></p>'
      + '<div class="stl" id="stl">' + d.st.map(function (s, i) { return '<div class="st" data-s="' + i + '"><em>' + (i + 1) + '</em><div><b>' + s[0] + '</b><small>' + s[1] + '</small></div></div>'; }).join('') + '</div>'
      + '<p class="note" style="font-size:11.5px;color:var(--mut)">' + d.cav + '</p>';
    else if (TAB === 3) h = pcbHTML(d);
    else h = d.spH.map(function (hh, k) { return '<div class="sg">' + hh + '</div><div class="tbl">' + d.sp[k].map(function (r) { return '<div><span>' + r[0] + '</span><b style="max-width:62%">' + r[1] + '</b></div>'; }).join('') + '</div>'; }).join('') + '<p class="note" style="font-size:11.5px;color:var(--mut)">' + d.src + '</p>';
    $('#pb').innerHTML = h; pcbUpd(); stageUI(); }
  var lgd = function (d) { return '<div class="lgd"><span><i class="ke"></i>' + d.lg[0] + '</span><span><i class="km"></i>' + d.lg[1] + '</span><span><i class="kx">✕</i>' + d.lg[2] + '</span></div>'; };
  $('#pb').onclick = function (e) { if (e.target.closest('[data-pw]')) { setRun(!state.running); return; }
    if (e.target.closest('[data-plug]')) { plugBtn(); return; }
    var pr = e.target.closest('[data-pre]'); if (pr) { setL({ L: +pr.dataset.pre }); $('#ls').value = state.L; return; }
    var s = e.target.closest('#stl [data-s]'); if (s) { jump(+s.dataset.s); return; } };
  $('#pb').addEventListener('toggle', function (e) { var x = e.target; if (x.dataset && x.dataset.o) OPEN[x.dataset.o] = x.open; }, true);
  $('#pb').oninput = function (e) { if (e.target.id === 'lf') { V.LIFT = e.target.value / 100; $('#lv').textContent = V.LIFT.toFixed(2); } if (e.target.id === 'ls') setL({ L: +e.target.value }); };
  $('#tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { TAB = +b.dataset.t; panel(); } };

  /* ---------- 運行狀態同步（只改 class 與文字）。data-s 可為多個步驟（例如 DSP 同時屬於發射與接收） ---------- */
  var sl = function (e) { return String(e.dataset.s).split(',').map(Number); };
  function stageUI() { var r = state.running, s = state.stage, d = D[lang], f = state.focus, up = ST.link === 'up';
    document.querySelectorAll('#sch [data-s],#stl [data-s]').forEach(function (e) { var a = sl(e); e.classList.toggle('act', r && a.indexOf(s) >= 0); e.classList.toggle('done', r && a.indexOf(s) < 0 && Math.min.apply(null, a) < s); e.classList.toggle('pv', !r && a.indexOf(f) >= 0);
      if (e.closest('#stl')) e.classList.toggle('cut', !up && a[0] >= N.HOST); });
    $('#sch').classList.toggle('run', r);
    var tx = r ? d.running + ' · ' + d.step + ' ' + (s + 1) + '/' + NALL + (lang === 'zh' ? '：' : ': ') + d.st[s][0] : d.stopped;
    ['#scs', '#rst'].forEach(function (q) { var e = $(q); if (e) { e.textContent = tx; e.classList.toggle('on', r); } });
    var b = $('#sch [data-run]'); if (b) { b.textContent = r ? d.stop : d.run; b.classList.toggle('on', r); }
    var c = $('#sct'); if (c) c.textContent = r ? d.st[s][1] : f != null ? d.st[f][1] : d.s0;
    var cutT = up ? '' : ST.link === 'init' ? d.cutI : d.cut, rc = $('#rcut'); if (rc) rc.textContent = cutT;
    var rb = $('#runb'); rb.hidden = !r; rb.textContent = ''; if (r) rb.textContent = d.running + ' · ' + (s + 1) + ' ' + d.st[s][0] + (up ? '' : (lang === 'zh' ? '（' : ' (') + d.linkN[ST.link] + (lang === 'zh' ? '）' : ')')); }

  /* ---------- 原理圖：上排發射（左→右）、下排接收（右→左）；虛線框＝主機端、模組 ---------- */
  function schem() { var el = $('#sch'); el.hidden = !state.schem; if (!state.schem) return; var d = D[lang], c = d.sc, n = c.n, l = c.l;
    var Nd = function (k, s, x, y, w, h, cl) { return '<g class="sn ' + cl + '" data-s="' + s + '" data-k="' + k + '"><title>' + n[k][0] + ' · ' + n[k][1] + '</title><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"/><text class="t1" x="' + (x + w / 2) + '" y="' + (y + h / 2 - 2) + '">' + n[k][0] + '</text><text class="t2" x="' + (x + w / 2) + '" y="' + (y + h / 2 + 11) + '">' + n[k][1] + '</text></g>'; },
      Kk = function (s, cl, x1, x2, y) { return '<path class="lk ' + cl + '" data-s="' + s + '" d="M' + x1 + ',' + y + 'H' + x2 + '" marker-end="url(#ph-' + cl.charAt(0) + ')"/>'; },
      X = function (x, y, t, cl, id) { return '<text class="' + (cl || 'lt') + '" x="' + x + '" y="' + y + '"' + (id ? ' id="' + id + '"' : '') + '>' + t + '</text>'; },
      mk = function (k) { return '<marker id="ph-' + k + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="ah-' + k + '" d="M0,0L8,4L0,8z"/></marker>'; },
      TY = 78, RY = 182;
    var svg = '<svg class="sv" viewBox="0 0 900 238"><defs>' + mk('e') + mk('m') + '</defs>'
      + '<rect class="bd p" x="6" y="26" width="300" height="204" rx="10"/>' + X(14, 19, c.host, 'bl')
      + '<g class="mz"><rect class="bd r" x="318" y="26" width="448" height="204" rx="10"/>' + X(326, 19, c.mod, 'bl') + '</g>' + X(832, 19, c.far, 'bl')
      + X(503, 44, c.tx) + X(503, 226, c.rx)
      /* 發射 */
      + Kk(1, 'e', 88, 110, TY) + Kk(2, 'e', 196, 268, TY) + X(232, 66, '', 'lv', 'scL') + X(232, 104, '', 'lv', 'scI')
      + '<g class="mz">' + Kk(3, 'e', 340, 358, TY) + Kk(4, 'e', 440, 464, TY) + Kk(4, 'e', 536, 558, TY) + Kk(5, 'm', 630, 654, TY) + '</g>'
      + '<g class="mz">' + Kk(5, 'm', 740, 888, TY) + X(814, TY - 8, l.fb) + '</g>'
      /* 接收 */
      + '<g class="mz">' + Kk(6, 'm', 888, 742, RY) + Kk(6, 'm', 656, 632, RY) + Kk(7, 'e', 560, 538, RY) + Kk(7, 'e', 466, 442, RY) + Kk(8, 'e', 360, 342, RY) + '</g>'
      + Kk(8, 'e', 270, 198, RY) + Kk(8, 'e', 112, 90, RY)
      + Nd('asic', '0,8', 14, 50, 74, 156, 'e') + Nd('pcb', '1,8', 112, 50, 84, 156, 'e') + Nd('conn', '2,8', 270, 50, 70, 156, 'e')
      + '<g class="mz">' + Nd('dsp', '3,7', 360, 50, 80, 156, 'e') + Nd('drv', '4', 466, 50, 70, 56, 'e') + Nd('eml', '4', 560, 50, 70, 56, 'x') + Nd('tia', '7', 466, 150, 70, 56, 'e') + Nd('pd', '6', 560, 150, 70, 56, 'x') + Nd('opt', '5,6', 656, 50, 84, 156, 'o') + '</g>'
      + '<g class="xx"><path d="M292,112L318,144M318,112L292,144"/></g>' + X(541, 132, '', 'cutt', 'scX') + '</svg>';
    el.innerHTML = '<div class="shd"><b>' + c.t + '</b><span class="tag">' + c.tag + '</span><span class="sp"></span><button class="pwb" data-run></button><button class="x" data-close title="Esc">✕</button></div>' + svg
      + '<div class="sci"><span class="rs" id="scs"></span><span id="sct"></span></div>' + lgd(d) + '<p class="scv">' + d.cav + '<br>' + c.hint + '</p>';
    stageUI(); schVals(); schPlug(); }
  function schVals() { var a = $('#scL'), b = $('#scI'); if (!a) return; a.textContent = 'L = ' + EL.L + ' mm'; b.textContent = 'IL ≈ ' + f1(EL.il) + ' dB'; b.setAttribute('class', 'lv ' + (EL.lvl === 'low' ? 'q-good' : EL.lvl === 'mid' ? 'q-warn' : 'q-bad')); }
  function schPlug() { var el = $('#sch'), x = $('#scX'); if (!x) return; var c = D[lang].sc, up = ST.link === 'up';
    el.classList.toggle('cut', !up); el.classList.toggle('ini', !up && ST.elec); x.textContent = up ? '' : ST.elec ? c.ini : c.cut;
    var cn = $('#sch [data-k="conn"]'); if (cn) cn.classList.toggle('bad', !ST.elec); }
  $('#sch').onclick = function (e) { if (e.target.closest('[data-close]')) { togSch(false); return; } if (e.target.closest('[data-run]')) { setRun(!state.running); return; } var gg = e.target.closest('[data-s]'); if (gg) jump(sl(gg)[0]); };

  /* ---------- 整頁文字 ---------- */
  function render() { var d = D[lang], p = PM[V.SEL]; if (K.markLang) K.markLang(lang); document.title = d.title;
    $('#sb').textContent = d.sub; $('#bd').textContent = d.bd; $('#st1').textContent = d.list + ' ' + P.length + d.u; $('#exl').textContent = d.ex; $('#hint').textContent = d.hint;
    tb.forEach(function (b, i) { b.title = d.tb[i]; }); $('#scb .tx').textContent = d.scB;
    $('#pill').innerHTML = d.crs + '<small style="display:block;font-size:10.5px;font-weight:700;color:var(--mut)">' + d.rep + '</small>'; $('#chip').textContent = d.sel + ' ' + (lang === 'zh' ? p.z : p.e);
    if (EVT) EVT = !ST.elec ? d.evO : ST.link === 'wait' ? '' : ST.link === 'init' ? d.evI : d.evU;
    if (K.courseNav) K.courseNav($('#course'), 'pluggable', lang, '../'); side(); dash(); card(); panel(); schem(); V.labelText(lang); }

  /* ---------- 動畫迴圈 ---------- */
  var t0 = performance.now(), wasInit = false;
  function loop(now) { requestAnimationFrame(loop); var t = (now - t0) / 1000;
    if (V.AUTO) { V.th += .004; V.EX = .5 + .45 * Math.sin(t * .6); $('#exr').value = V.EX * 100; $('#exv').textContent = Math.round(V.EX * 100) + '%'; }
    var mv0 = !!PLG.mv; plugTick(); if (mv0 !== !!PLG.mv) plugUI();
    if (state.L !== LD) applyLayout();
    V.place(); var k = V.EX + '|' + V.LIFT + '|' + V.SEL + '|' + MX.toFixed(4); if (k !== FK) { FK = k; fibers(); }
    V.tg.x = -3 + 9 * PLG.p;   /* 拔出時視角目標跟著往前面板外移，讓整個模組留在畫面內 */ V.cam(); V.hideBelow = state.schem ? $('#sch').offsetTop - 10 : null; V.viewOffset(state.schem ? $('#sch').offsetHeight : 0);
    var R = state.running, up = ST.link === 'up';
    if (R) { var s = Math.floor(Math.max(0, now - RT0) / 1000 / DUR) % nsteps();   /* rAF 時間戳可能略早於 RT0 → 夾到 0，避免步驟 −1 */ if (s !== state.stage) { state.stage = s; stageUI(); } glow(t); }
    if (ST.link === 'init') { var kk = .5 + .5 * Math.sin(t * 9); (V.MAT.mcu || []).forEach(function (m) { m.emissive.setHex(0xd08a1a).multiplyScalar(kk); }); wasInit = true; }
    else if (wasInit) { wasInit = false; if (!R) V.hl(); }
    /* 接點狀態條與紅 ✕ */
    CSM.color.setHex(ST.elec ? (up ? 0x2e9d6a : 0xd08a1a) : 0x5a5d64); XG.visible = !ST.elec && V.shown('conn');
    var hv = R && V.shown('trace'), mv = R && up, P0 = {};
    PS.hTx.forEach(function (p) { p.m.visible = hv; if (hv) { var z = LZ[p.l], b = bits[(p.k + p.l) % 8], u = (t * .16 + p.k / p.n + p.l * .07) % 1; along(P0['t' + p.l] || (P0['t' + p.l] = hostTx(z)), u, p.m.position); p.m.material = b ? EM1 : EM0; p.m.scale.setScalar(up ? (b ? 1 : .6) : .8 * (1 - u * .6)); } });
    PS.hRx.forEach(function (p) { p.m.visible = mv && V.shown('trace'); if (p.m.visible) { var z = LZ[p.l], b = bits[(p.k + p.l) % 8]; along(P0['r' + p.l] || (P0['r' + p.l] = hostTx(z).reverse()), (t * .16 + p.k / p.n + p.l * .05) % 1, p.m.position); p.m.material = b ? EM1 : EM0; p.m.scale.setScalar(b ? 1 : .6); } });
    var run = function (arr, fn, pid, sp) { arr.forEach(function (p) { p.m.visible = mv && V.shown(pid); if (p.m.visible) { var key = fn.name + p.l, b = bits[(p.k * 3 + p.l) % 8]; along(P0[key] || (P0[key] = fn(PORT[p.l])), (t * sp + p.k / p.n) % 1, p.m.position); p.m.material = p.m.geometry === EG ? (b ? EM1 : EM0) : (b ? MM1 : MM0); p.m.scale.setScalar(b ? 1 : .6); } }); };
    run(PS.mTx, modTx, 'dsp', .3); run(PS.mRx, modRx, 'dsp', .3); run(PS.oTx, optTx, 'lens', .45); run(PS.oRx, optRx, 'lens', .45);
    PS.fTx.forEach(function (p) { p.m.visible = mv && V.shown('fiber') && !!CV[p.l]; if (p.m.visible) { var b = bits[p.k % 8]; p.m.position.copy(CV[p.l].getPoint((t * .2 + p.k / p.n) % 1)); p.m.material = b ? MM1 : MM0; p.m.scale.setScalar(b ? 1.1 : .6); } });
    PS.fRx.forEach(function (p) { p.m.visible = mv && V.shown('fiber') && !!CV[p.l]; if (p.m.visible) { var b = bits[(p.k + 3) % 8]; p.m.position.copy(CV[p.l].getPoint(1 - (t * .2 + p.k / p.n + .08) % 1)); p.m.position.z += p.l ? .12 : -.12; p.m.material = b ? MM1 : MM0; p.m.scale.setScalar(b ? 1.1 : .6); } });
    V.render(); }

  /* ---------- 初始畫面：分離 40 %、選取模組外殼、模組已插入、未運行 ---------- */
  V.EX = .4; $('#exr').value = 40; $('#exv').textContent = '40%';
  applyLayout(); V.hl(); plugTick(); render(); requestAnimationFrame(loop);
  /* 測試與除錯用（只讀為主；不影響正常操作） */
  window.PLUGAPP = { state: state, V: V, PLG: PLG, PS: PS, CV: CV, TR: TR, XG: XG, get ST() { return ST; }, get EL() { return EL; }, get LAY() { return LAY; }, get MX() { return MX; },
    setL: setL, setRun: setRun, togSch: togSch, sel: sel, jump: jump, plug: plug, setTab: function (i) { TAB = i; panel(); } };
})();
