/* 可插拔課程（M6）：教育級近似物理與插拔狀態（純函式，無 DOM，可在 Node 測試）。公式、係數、等級見 docs/PHYSICS_MODELS.md §3.15。
   範圍：本課 800G OSFP 代表案例中「主機 ASIC → 系統 PCB 走線 → OSFP 連接器 → 模組內走線 → 模組 DSP」這一段主機端電氣通道。
   這不是電磁模擬；係數為 C 級教學假設，只說明趨勢，非產品規格、非 IEEE / OSFP MSA 規範值、非實測。
   本檔係數為可插拔 PCB 通道專用，不使用 CPO 封裝內或 NPO 載板的係數。 */
(function (G) {
  var K = G.OptiKit = G.OptiKit || {};
  var C = {
    Lmin: 50, Lmax: 350, Ldef: 200,          /* 主機 PCB 走線長度 L（mm），ASIC 封裝邊緣 → OSFP 連接器（C：教學範圍） */
    presets: [80, 200, 320],                 /* 路徑示例：靠近 ASIC 的埠／一般埠／面板邊緣的埠（C） */
    fN: 26.5625,                             /* Nyquist 頻率 GHz：800G OSFP 主機端 8 × 106.25 Gb/s PAM4 → 53.125 GBd → 26.5625 GHz（B，由 A 級速率推得） */
    fRef: 53.125,                            /* 對照頻率：200G/通道（NPO、CPO 課使用的教學案例） */
    a1: .005, a2: .000634,                   /* 低損耗 PCB α(f) = a1·√f + a2·f（dB/mm）→ 26.56 GHz ≈ 0.043、53 GHz ≈ 0.070 dB/mm（C） */
    IF: { pkgA: 1.2, bga: .5, conn: 1.5, mod: 1.0 }, /* 固定段（dB，C）：ASIC 封裝扇出、ASIC 焊球、OSFP 連接器＋金手指、模組內走線 */
    v: 6.5,                                  /* 傳播延遲 ps/mm（B：帶狀線 εr ≈ 3.8 近似；物理常數，非損耗係數） */
    lv: [9, 14],                             /* 主機通道負擔分級門檻 dB（C）：≤9 輕、9–14 中、>14 較重 */
    contact: .03,                            /* 插拔行程比例 < 0.03 視為金手指仍與連接器接觸（C：示意） */
    initS: 2.2                               /* 插入鎖定後到資料鏈路建立的示意時間 s（C：動畫用，非實際初始化時間） */
  };
  var num = function (x, d) { x = +x; return isFinite(x) ? x : d; };
  var cl = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var alpha = function (f) { f = Math.max(0, num(f, C.fN)); return C.a1 * Math.sqrt(f) + C.a2 * f; };

  /* 主機端電氣通道：L（mm）、f（GHz，可省略＝本課 26.5625） */
  function plugElec(L, f) {
    L = cl(num(L, C.Ldef), C.Lmin, C.Lmax); f = cl(num(f, C.fN), 1, 100);
    var a = alpha(f), tr = a * L, I = C.IF,
        parts = [['pkgA', I.pkgA], ['bga', I.bga], ['trace', tr], ['conn', I.conn], ['mod', I.mod]],
        il = parts.reduce(function (s, p) { return s + p[1]; }, 0),
        il0 = I.pkgA + I.bga + I.conn + I.mod + a * C.Lmin,
        amp = Math.pow(10, -il / 20), amp0 = Math.pow(10, -il0 / 20);
    return { L: L, f: f, alpha: a, parts: parts, ilTr: tr, ilFix: il - tr, il: il, dIL: Math.max(0, il - il0),
             amp: amp, ampRel: Math.min(1, amp / amp0), lat: C.v * L,
             lvl: il <= C.lv[0] ? 'low' : il <= C.lv[1] ? 'mid' : 'high' };
  }

  /* 插拔狀態（純函式）：p = 行程比例 0（完全插入）… 1（完全拔出）；moving = 是否正在動作（解除卡扣／滑動／卡扣）；
     sinceLock = 最近一次「插到底鎖定」後經過的秒數；金手指離開接點後由程式設為 null（必須重新插入鎖定才會再建立鏈路）。
     三種狀態分開：機械 mech、電氣 elec、資料鏈路 link（down 中斷／wait 已接觸但未鎖定／init 初始化中／up 已建立）。 */
  function plugState(p, moving, sinceLock) {
    p = cl(num(p, 0), 0, 1);
    var elec = p < C.contact,
        mech = moving ? 'moving' : p <= 0 ? 'locked' : p >= 1 ? 'out' : 'moving',
        t = sinceLock == null ? null : Math.max(0, num(sinceLock, 0)),
        link = !elec ? 'down' : t == null ? 'wait' : t >= C.initS ? 'up' : 'init';
    return { p: p, mech: mech, elec: elec, link: link, init: link === 'init' ? Math.min(1, t / C.initS) : link === 'up' ? 1 : 0 };
  }

  /* 3D 佈局（場景單位，壓縮示意比例）：L 50–350 mm → ASIC 封裝邊緣到 OSFP 連接器後緣的間距 g = 2.5–9。
     連接器後緣 x = −3.0；ASIC 封裝半寬 1.6；PCB 後緣 −16.4 → ASIC 外緣最遠 −15.2，永遠在 PCB 上。
     travel = 模組完全拔出的位移（模組尾端 −2.6 + 9.6 = 7.0 > 前面板 6.4，已完全離開籠子）。 */
  function plugLayout(L) {
    L = cl(num(L, C.Ldef), C.Lmin, C.Lmax);
    var g = 2.5 + (L - C.Lmin) / (C.Lmax - C.Lmin) * 6.5, connX = -3.0;
    return { L: L, g: g, connX: connX, asicX: connX - g - 1.6, asicHalf: 1.6, pcbBack: -16.4, travel: 9.6 };
  }
  /* 插拔動畫的位移曲線（平滑起停） */
  function ease(u) { u = cl(num(u, 0), 0, 1); return u * u * (3 - 2 * u); }

  plugElec.K = C; plugElec.alpha = alpha;
  K.plugElec = plugElec; K.plugState = plugState; K.plugLayout = plugLayout; K.plugEase = ease;
})(typeof window !== 'undefined' ? window : globalThis);
