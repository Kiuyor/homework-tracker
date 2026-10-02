// ============ Event Bindings ============
(function () {
  var dom = window.AppDom;
  var state = window.AppState;

  // Date navigation
  dom.prevDate.addEventListener('click', function () { window.changeDate(-1); });
  dom.nextDate.addEventListener('click', function () { window.changeDate(1); });
  dom.todayBtn.addEventListener('click', window.goToday);

  // 自动定位到当天：state.js 里 currentDate 初值就是"今天"的本地午夜，这里无需额外处理。
  // 跨午夜由 state.js 的 syncToday() 负责（分钟定时器 + 页面重新可见时各校一次）。

  // Add homework
  dom.addBtn.addEventListener('click', window.openAddModal);

  // View mode toggle（编辑/展示）
  dom.modeToggle.addEventListener('click', window.toggleViewMode);

  // 展示态出口：右上角「退出展示」文字胶囊
  var exitShowBtn = document.getElementById('exitShowBtn');
  if (exitShowBtn) {
    exitShowBtn.addEventListener('click', function () { window.setViewMode('edit'); });
  }

  // 展示模式字号调节
  var showFontPlus = document.getElementById('showFontPlus');
  var showFontMinus = document.getElementById('showFontMinus');
  var showFontVal = document.getElementById('showFontVal');
  if (showFontPlus && showFontMinus) {
    showFontPlus.addEventListener('click', function () { window.adjustShowScale(0.1); });
    showFontMinus.addEventListener('click', function () { window.adjustShowScale(-0.1); });
  }
  // 恢复保存的字号
  var savedScale = parseFloat(localStorage.getItem('hw_show_scale'));
  if (savedScale && savedScale >= 0.5 && savedScale <= 2) {
    window.applyShowScale(savedScale);
  }

  // Topbar collapse / expand
  var expandTimer = null;

  function showExpandBtn() {
    dom.expandBtn.classList.remove('hidden');
    clearTimeout(expandTimer);
    expandTimer = setTimeout(function () {
      dom.expandBtn.classList.add('hidden');
    }, 5000);
  }

  dom.collapseBtn.addEventListener('click', function () {
    document.body.classList.add('topbar-hidden');
    // 顶栏收起 = 那条工具行连同弹层的宿主一起消失。开着的弹层留在 DOM 里，
    // 展开顶栏时会以"上次没关"的状态回来——入口的 aria-expanded 也跟着说不清。
    window.setThemePop(false);
    showExpandBtn();
  });
  dom.expandBtn.addEventListener('click', function () {
    clearTimeout(expandTimer);
    document.body.classList.remove('topbar-hidden');
    dom.expandBtn.classList.add('hidden');
  });

  // 鼠标移近顶部边缘（120px 内）唤出展开按钮
  document.addEventListener('mousemove', function (e) {
    if (!document.body.classList.contains('topbar-hidden')) return;
    if (e.clientY < 120) {
      showExpandBtn();
    } else if (!dom.expandBtn.classList.contains('hidden')) {
      clearTimeout(expandTimer);
      expandTimer = setTimeout(function () {
        dom.expandBtn.classList.add('hidden');
      }, 3000);
    }
  });

  // 触屏：点击顶部边缘区域唤出
  document.addEventListener('touchstart', function (e) {
    if (!document.body.classList.contains('topbar-hidden')) return;
    if (e.touches[0].clientY < 120) showExpandBtn();
  });

  // Dark mode
  dom.darkmodeBtn.addEventListener('click', window.toggleDarkMode);

  // 展示模式：视口尺寸变化（投影切换分辨率/横竖屏）时重算字号自适应
  window.addEventListener('resize', function () {
    if (window.AppState.viewMode === 'show') window.fitShowDisplay();
  });

  // 全屏得失（Esc / F11 / 系统手势）：只重算布局，不改展示态。
  // 网页无法取消浏览器层的「Esc 退全屏」，所以按 ADR-0003 解耦而非拦截：
  // 退全屏后仍是一面带地址栏的展示墙，不是被悄悄弹回编辑态。
  document.addEventListener('fullscreenchange', function () {
    if (window.AppState.viewMode === 'show') window.fitShowDisplay();
  });

  // 编辑态闲置回弹的「活跃信号」：任何一次触摸或按键都重新计时。
  // 用捕获阶段监听，个别控件 stopPropagation 也不会饿死计时；
  // 展示态下 resetEditIdle 自己会 no-op，不留记账。
  document.addEventListener('pointerdown', window.resetEditIdle, true);
  document.addEventListener('keydown', window.resetEditIdle, true);

  // Font size slider
  var fontSizeSlider = document.getElementById('fontSizeSlider');
  var fontSizeLabel = document.getElementById('fontSizeLabel');
  if (fontSizeSlider) {
    fontSizeSlider.addEventListener('input', function () {
      var size = parseInt(fontSizeSlider.value);
      state.fontSize = size;
      fontSizeLabel.textContent = size + 'px';
      localStorage.setItem('hw_fontSize', size);
      window.applyFontSize(size);
    });
  }

  // Modal close
  dom.modalClose.addEventListener('click', window.closeModal);
  dom.modalCancel.addEventListener('click', window.closeModal);
  // 刻意不监听遮罩点击：纯触控下打字时手掌就会压到遮罩，
  // 「点空白处 = 静默清空已输入内容」是实测到的日常事故（故事 15）。
  // 离开模态只剩三条显式路：保存、取消、右上角 ×。
  // 键盘再加两条同义的：Esc = 取消，Tab 在模态内循环（不许跑到背后的顶栏上——
  // 那样"焦点在屏上、眼睛在弹窗里"，退全屏/切日期都会被误触发）。
  // 监听挂在 overlay 上：模态开着时焦点一定在它内部，事件必然冒泡到这里。
  dom.modalOverlay.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); window.closeModal(); return; }
    if (e.key === 'Tab') window.trapFocus(e, window.AppDom.modalEl);
  });

  // 科目选择器：六个按钮，名单来自 state.subjects（ADR-0011）。委托在容器上——
  // 按钮会被 renderSubjectSeg 整批重建，逐个绑 listener 会在重绘后静默失灵。
  if (dom.subjectSeg) {
    dom.subjectSeg.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('.seg-opt') : null;
      if (!opt) return;
      window.pickSubject(parseInt(opt.dataset.subjectId, 10));
    });
  }

  // 「当天/次日」段式控件（截止时间落在所属日还是它的次日）
  var deadlineDaySeg = document.getElementById('deadlineDaySeg');
  if (deadlineDaySeg) {
    deadlineDaySeg.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('.seg-opt') : null;
      if (!opt) return;
      window.setDeadlineDay(parseInt(opt.dataset.offset, 10));
    });
  }

  // 主题入口（ADR-0013）：一颗常驻按钮，选项在它自己的弹层里。宽度账也在那张 ADR——
  // 常驻四选一横排约 300px 挤在工具行里，换成按钮约 90px，弹层只在点开时占地方。
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var pop = document.getElementById('themePop');
      window.setThemePop(pop.classList.contains('hidden'));
    });
  }
  // 段钮会被 renderThemeSeg 整批重建，委托绑在容器上；选完顺手收弹层，
  // 点空白与 Esc 也收——一个开着的浮层没有第二条出路，触控下就是关不掉。
  var themeSeg = document.getElementById('themeSeg');
  if (themeSeg) {
    themeSeg.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('.seg-opt') : null;
      if (!opt) return;
      window.setTheme(opt.dataset.theme);
      window.setThemePop(false);
    });
  }
  document.addEventListener('click', function (e) {
    var pop = document.getElementById('themePop');
    if (!pop || pop.classList.contains('hidden')) return;
    var entry = document.getElementById('themeBtn');
    // contains() 含自身，所以入口那颗钮不必另判
    if ((entry && entry.contains(e.target)) || pop.contains(e.target)) return;
    window.setThemePop(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var pop = document.getElementById('themePop');
    if (pop && !pop.classList.contains('hidden')) window.setThemePop(false);
  });

  // Form submit
  dom.homeworkForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    // 所属日取模态打开那一刻的快照（ui.js 里写进 state.modalContextDate），
    // **不**现读 state.currentDate。模态虽然盖住了顶栏（overlay 是 fixed inset:0、z-index 1000，
    // 指针点不到背后的日期导航），但键盘曾经能从 Tab 循环的缺口退到顶栏、在日期钮上按 Enter
    // 把视图翻走——所以"打开弹窗后所属日会变"这条路是真实存在的，现读就等于顺手改期。
    // 编辑态更严一层：一条已存在的作业，所属日永远是它自己那一天，
    // 改正文/死线不许连带改期（改期是另一件事，要走"这条属于哪天"的显式动作）。
    var data = { content: dom.contentInput.value.trim() };
    var subj = state.subjects.find(function (s) { return String(s.id) === String(state.subjectPickId); });
    if (!subj) {
      window.showToast('请选择科目', 'error');
      return;
    }
    data.subject_id = subj.id;
    data.date = state.editingId
      ? (state.deadlineOwnerDate || window.formatDate(state.currentDate))
      : (state.modalContextDate || window.formatDate(state.currentDate));
    var deadlineVal = document.getElementById('deadlineInput').value.trim();
    data.deadline = null;
    if (deadlineVal) {
      // 手动输入：只接受时间 "14:30"，宽容提取（带日期也能取到时间）
      // 落哪一天由「当天/次日」决定，基准永远是该条的所属日（新建时为打开弹窗那天）。
      // offset 为 null 表示这条历史 deadline 两档都不属于——用户没点段控件就原样保留
      // 那一天，改正文不会把死线挪走。
      var offset = state.deadlineDayOffset;
      var baseDate = offset === null
        ? String(state.editingDeadline || '').slice(0, 10)
        : (state.deadlineOwnerDate || data.date);
      data.deadline = window.parseDeadlineInput(deadlineVal, baseDate, offset === null ? 0 : offset);
      if (!data.deadline) {
        window.showToast('截止时间格式无效，请填如 14:30', 'error');
        return;
      }
    }
    if (!data.content) {
      window.showToast('请输入作业内容', 'error');
      return;
    }
    try {
      if (state.editingId) {
        await window.updateHomework(state.editingId, data);
        window.showToast('已更新', 'success');
      } else {
        await window.addHomework(data);
        window.showToast('已添加', 'success');
      }
      window.closeModal();
      // 不再重拉科目列表：六科闭集之后保存不可能造出新科目，
      // 而 renderHomeworks 分组的依据（state.subjects）自始至终没变过。
      window.loadHomeworks();
    } catch (err) {
      // 后端给出的话原样搬上屏（409 那句要点名"该去改哪一条"），不套「操作失败」的壳。
      // 只有请求根本没回来时才自己造一句——那种时候没有任何后端文案可用。
      window.showToast(err.status ? err.message : '保存失败，请检查服务是否在跑', 'error');
    }
  });

})();

// ============ Init ============
window.init = async function () {
  var state = window.AppState;
  var dom = window.AppDom;

  // 展示态是默认态（ADR-0003）：/ 与 ?show=1 落到同一个态，?show=1 只是旧地址的兼容别名。
  // DOM class 与计时器统一由 applyViewMode 摆好——不再无条件 add('manage-on')，
  // 那等于绕过单一入口把编辑控件带到展示态上。
  window.applyViewMode();
  // 「今天」校正器：先记下基准日（这一下不动视图），再每分钟校一次。
  // 教室机常年不关机，跨午夜后 currentDate 还停在昨天的话，这面墙会安静地
  // 把昨天的作业当今天讲一整节（见 state.js 的 syncToday）。
  window.syncToday();
  if (state.dateSyncTimer) clearInterval(state.dateSyncTimer);
  state.dateSyncTimer = setInterval(window.syncToday, 60 * 1000);
  // 标签页在后台时定时器会被节流（一体机上还会被系统挂起），所以每次重新可见再校一次——
  // 上课前点亮屏幕那一刻才是真正要准的时候。
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) window.syncToday();
  });
  // URL ?scale=1.3 预设展示字号（部署时可通过地址固定字号）
  var urlScale = parseFloat(new URLSearchParams(window.location.search).get('scale'));
  if (urlScale && urlScale >= 0.5 && urlScale <= 2) {
    window.applyShowScale(urlScale);
  }

  // Dark mode
  var darkPref = localStorage.getItem('hw_darkmode');
  if (darkPref === '1') {
    document.body.classList.add('dark-mode');
  } else if (darkPref === '0') {
    document.body.classList.remove('dark-mode');
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('dark-mode');
  }

  // 主题轴（ADR-0012 决定 1）：读盘只在这条正交轴上做一次，上面那八行一字未改。
  // 没有 hw_theme 就落在 whiteboard——**主题不跟随系统**，系统只给明暗信号，没有主题信号。
  window.applyTheme(localStorage.getItem('hw_theme'));

  // Restore font size
  var savedFontSize = localStorage.getItem('hw_fontSize');
  if (savedFontSize) {
    state.fontSize = parseInt(savedFontSize);
    var fs = document.getElementById('fontSizeSlider');
    var fl = document.getElementById('fontSizeLabel');
    if (fs) fs.value = state.fontSize;
    if (fl) fl.textContent = state.fontSize + 'px';
    window.applyFontSize(state.fontSize);
  } else {
    window.applyFontSize(44);
  }

  // Load subjects：这份列表同时是墙上的格子与弹窗里的六个按钮（ADR-0011）
  try {
    await window.loadSubjects();
  } catch (e) {
    console.warn('科目加载失败，请检查数据库连接:', e.message);
    window.showToast('科目加载失败，请检查数据库连接', 'error');
  }

  window.updateDateDisplay();
  try {
    await window.loadHomeworks();
  } catch (e) {
    console.warn('作业加载失败:', e.message);
    window.showToast('作业加载失败: ' + e.message, 'error');
  }
};

// ============ 全屏工具（展示态自动进入 / 退出展示自动还原） ============
// 注意：必须在 init() 调用之前定义，因为 init 的 applyViewMode 会同步调用 enterFullscreen

// 冷启动（直接打开 / 或 ?show=1）时页面里没有任何用户手势，requestFullscreen
// 必被浏览器拒绝——这是预期路径，不是故障。不弹「请点击进入全屏」遮罩打扰上课，
// 改为让第一次触摸顺手把全屏补上。
var _fsRetry = null;

function disarmFullscreenRetry() {
  if (!_fsRetry) return;
  document.removeEventListener('pointerdown', _fsRetry);
  _fsRetry = null;
}

function armFullscreenRetry() {
  if (_fsRetry) return; // 同一时刻最多一颗监听，反复进出展示态不累积
  _fsRetry = function () {
    disarmFullscreenRetry();
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    Promise.resolve(document.documentElement.requestFullscreen()).catch(function (err) {
      console.warn('[作业墙] 首次触摸补全全屏仍未成功，下次触摸再试：', err && err.message);
      if (window.AppState.viewMode === 'show') armFullscreenRetry();
    });
  };
  document.addEventListener('pointerdown', _fsRetry, { once: true });
}

function enterFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  Promise.resolve(document.documentElement.requestFullscreen()).catch(function (err) {
    console.warn('[作业墙] 无用户手势，全屏被浏览器拒绝（冷启动预期行为），将在首次触摸时补全：', err && err.message);
    armFullscreenRetry();
  });
}
function exitFullscreen() {
  disarmFullscreenRetry(); // 离开展示态后不该再有「点一下就全屏」的副作用
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(function (err) {
      console.warn('[作业墙] 退出全屏失败：', err && err.message);
    });
  }
}
window.enterFullscreen = enterFullscreen;
window.exitFullscreen = exitFullscreen;

window.init();
