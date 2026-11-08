/* OptiKit 共用介面（M3）：語系記憶、底部三課程選單、頁面文字填入。
   一般 <script> 載入、掛在全域 window.OptiKit（不用 ES modules，雙擊 HTML 即可開啟）。
   這裡不放任何 CPO / NPO / 可插拔的模型或物理細節。 */
window.OptiKit = window.OptiKit || {};
(function (K) {
  var KEY = 'optikit.lang';

  /* 三門課程：path 皆相對於專案根目錄；CPO 目前就是根目錄的 index.html（M3 決策：不搬檔） */
  K.COURSES = [
    { id: 'pluggable', n: 1, path: 'courses/pluggable.html',
      zh: '傳統可插拔光模組', en: 'Pluggable Optics',
      szh: '3D 互動課程', sen: 'Interactive 3D course' },
    { id: 'npo', n: 2, path: 'courses/npo.html',
      zh: 'NPO 近封裝光學', en: 'NPO · Near-Packaged Optics',
      szh: '3D 互動課程', sen: 'Interactive 3D course' },
    { id: 'cpo', n: 3, path: 'index.html',
      zh: 'CPO 共同封裝光學', en: 'CPO · Co-Packaged Optics',
      szh: '3D 互動課程', sen: 'Interactive 3D course' }
  ];

  /* M7-A：跨架構比較頁（根目錄 compare.html）；不屬於 COURSES，三課程選單不變 */
  K.COMPARE = { path: 'compare.html', zh: '架構比較', en: 'Compare', szh: '三架構並排', sen: 'All three side by side' };

  /* 語系：網址 ?lang= 優先，其次瀏覽器記憶，預設中文。存取失敗（私密視窗等）時安靜略過。 */
  K.getLang = function () {
    var m = /[?&]lang=(zh|en)\b/.exec(location.search);
    if (m) return m[1];
    try { var v = localStorage.getItem(KEY); if (v === 'zh' || v === 'en') return v; } catch (e) {}
    return 'zh';
  };
  K.setLang = function (l) {
    try { localStorage.setItem(KEY, l); } catch (e) {}
    try { if (/[?&]lang=/.test(location.search)) history.replaceState(null, '', location.pathname + '?lang=' + l + location.hash); } catch (e) {}
  };

  K.course = function (id) { for (var i = 0; i < K.COURSES.length; i++) if (K.COURSES[i].id === id) return K.COURSES[i]; return null; };

  /* 底部課程選單。el：容器；current：目前課程 id；lang：'zh'/'en'；root：本頁到專案根目錄的相對前綴（'' 或 '../'） */
  K.courseNav = function (el, current, lang, root) {
    if (!el) return;
    var zh = lang === 'zh', h = '';
    K.COURSES.forEach(function (c) {
      var on = c.id === current,
          href = on ? '' : ' href="' + (root || '') + c.path + '?lang=' + lang + '"';
      h += '<a' + href + (on ? ' class="on" aria-current="page"' : '') + ' data-course="' + c.id + '">' +
        '<em>' + c.n + '</em><div><b>' + (zh ? c.zh : c.en) + '</b><small>' + (zh ? c.szh : c.sen) + '</small></div></a>';
    });
    /* M7-A：三課程之後的獨立「架構比較」入口（不是第四門課：無編號、虛線框、不帶 data-course） */
    var cm = current === 'compare';
    h += '<a class="okcmp' + (cm ? ' on" aria-current="page"' : '" href="' + (root || '') + K.COMPARE.path + '?lang=' + lang + '"') + ' data-cmp="1">' +
      '<i aria-hidden="true">⇄</i><div><b>' + (zh ? K.COMPARE.zh : K.COMPARE.en) + '</b><small>' + (zh ? K.COMPARE.szh : K.COMPARE.sen) + '</small></div></a>';
    el.innerHTML = h;
    el.setAttribute('aria-label', zh ? '課程選單' : 'Courses');
  };

  /* 把 dict 中的字串填入有 data-t="鍵" 的元素（供簡易課程頁使用） */
  K.applyText = function (root, dict) {
    (root || document).querySelectorAll('[data-t]').forEach(function (e) {
      var v = dict[e.getAttribute('data-t')];
      if (v != null) e.innerHTML = v;
    });
  };

  /* 中 / EN 切換按鈕：.lang button[data-l]；onChange(l) 由各頁負責重繪 */
  K.bindLang = function (onChange) {
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.onclick = function () { K.setLang(b.dataset.l); onChange(b.dataset.l); };
    });
  };
  K.markLang = function (l) {
    document.querySelectorAll('.lang button').forEach(function (b) { b.classList.toggle('on', b.dataset.l === l); });
    document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en';
  };
})(window.OptiKit);
