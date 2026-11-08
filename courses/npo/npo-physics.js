/* NPO 課程：教育級近似物理（純函式，無 DOM，可在 Node 測試）。公式、係數、等級見 docs/PHYSICS_MODELS.md §3.14。
   範圍：本課 NPO 代表案例中「ASIC 封裝邊緣 → 共同高效能載板走線 → 光學引擎封裝邊緣」的電氣互連。
   這不是電磁模擬；係數為 C 級教學假設，只用來說明趨勢，非產品規格、非 OIF 標準、非實測。 */
(function (G) {
  var K = G.OptiKit = G.OptiKit || {};
  var C = {
    Lmin: 10, Lmax: 50, Ldef: 25,          /* 載板走線長度 L（mm）：滑桿範圍＝本課代表布局可容納的範圍（C） */
    fN: 53,                                 /* Nyquist 頻率 GHz：200G/通道 PAM4 ≈ 106 GBd → 53 GHz（與 CPO 課同一個教學案例） */
    a1: .006, a2: .0009,                    /* 載板走線 α(f) = a1·√f + a2·f（dB/mm）→ 53 GHz 時 ≈ 0.091 dB/mm（C：介於細線封裝走線與低損 PCB 之間） */
    IF: { pkgA: 1.2, bga: .5, pkgE: .4,     /* 固定段（dB，C）：ASIC 封裝內扇出、ASIC 封裝焊球→載板、引擎封裝內走線 */
          att: { solder: .4, socket: .9 } }, /* 光學引擎接到載板的方式（C）：焊接 vs 插座（插座多一個接觸介面，阻抗不連續較大） */
    v: 6.5,                                 /* 傳播延遲 ps/mm（B：εr ≈ 3.8 帶狀線近似，與 CPO 課同一物理常數） */
    lv: [4, 6.5],                           /* 訊號完整性負擔分級門檻 dB（C）：≤4 輕、4–6.5 中、>6.5 較重 */
    /* 三種架構的對照（每種用自己的係數，不共用；全部 C 級教學對照值，同為 53 GHz） */
    ref: { cpo: { L: 5, IF: 1.0, a: .199 },  /* 取自 CPO 課 M2 模型的預設：封裝內 ASIC→EIC 走線 5 mm */
           plug: { L: 200, a: .07, pkgA: 1.2, bga: .5, conn: 1.5, mod: 1.0 } } /* 可插拔示意：主機板走線 200 mm＋前面板連接器/cage＋模組內走線；M6 建模時可能調整 */
  };
  var num = function (x, d) { x = +x; return isFinite(x) ? x : d; };
  var cl = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var alpha = function (f) { return C.a1 * Math.sqrt(f) + C.a2 * f; };

  /* 電氣互連：L（mm）、att（'solder' | 'socket'） */
  function npoElec(L, att) {
    L = cl(num(L, C.Ldef), C.Lmin, C.Lmax);
    att = att === 'socket' ? 'socket' : 'solder';
    var a = alpha(C.fN), tr = a * L,
        parts = [['pkgA', C.IF.pkgA], ['bga', C.IF.bga], ['trace', tr], ['att', C.IF.att[att]], ['pkgE', C.IF.pkgE]],
        il = parts.reduce(function (s, p) { return s + p[1]; }, 0),
        il0 = C.IF.pkgA + C.IF.bga + C.IF.att.solder + C.IF.pkgE + a * C.Lmin,   /* 參考：L = 10 mm、焊接 */
        amp = Math.pow(10, -il / 20), amp0 = Math.pow(10, -il0 / 20);
    return { L: L, att: att, fN: C.fN, alpha: a, parts: parts, ilTr: tr, ilFix: il - tr, il: il,
             dIL: Math.max(0, il - il0), amp: amp, ampRel: Math.min(1, amp / amp0),   /* 夾限只去除浮點誤差（L ≥ 10 mm 時理論上 ≥ 0 / ≤ 1） */ lat: C.v * L,
             lvl: il <= C.lv[0] ? 'low' : il <= C.lv[1] ? 'mid' : 'high' };
  }
  /* 三種架構電氣路徑對照（C 級；各自的係數） */
  function npoRef() {
    var c = C.ref.cpo, p = C.ref.plug;
    return { cpo: { L: c.L, il: c.IF + c.a * c.L },
             plug: { L: p.L, il: p.pkgA + p.bga + p.a * p.L + p.conn + p.mod } };
  }
  /* 3D 佈局（場景單位，壓縮示意比例，非等比例）：L 10–50 mm → ASIC 封裝邊緣到引擎封裝邊緣間距 g 0.5–2.5。
     ASIC 封裝半寬 2.3；引擎封裝寬 2.0；耦合器外凸 0.45 → 引擎外緣 ≤ 7.25 < 載板半寬 7.5（不會穿出載板） */
  function npoLayout(L) {
    L = cl(num(L, C.Ldef), C.Lmin, C.Lmax);
    var g = .5 + (L - C.Lmin) / (C.Lmax - C.Lmin) * 2.0, inner = 2.3 + g;
    return { L: L, g: g, inner: inner, xc: inner + 1.0, outer: inner + 2.0 + .45, pkgHalf: 2.3, carrierHalf: 7.5 };
  }
  npoElec.K = C; npoElec.alpha = alpha;
  K.npoElec = npoElec; K.npoRef = npoRef; K.npoLayout = npoLayout;
})(typeof window !== 'undefined' ? window : globalThis);
