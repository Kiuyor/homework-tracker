// ============ Event Bindings ============
(function () {
  var dom = window.AppDom;
  var state = window.AppState;

  // Date navigation
  dom.prevDate.addEventListener('click', function () { window.changeDate(-1); });
  dom.nextDate.addEventListener('click', function () { window.changeDate(1); });
  dom.todayBtn.addEventListener('click', window.goToday);

  // 自动定位到当天：进入页面时 currentDate 已是 new Date()，无需额外处理

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

  // Subject filter
  dom.subjectFilter.addEventListener('change', function () {
    var val = dom.subjectFilter.value;
    window.AppState.filterSubjectId = val ? parseInt(val) : null;
    window.renderHomeworks();
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

  // 「添加作业」里选到当天已有作业的科目 → 切成改那一条（ADR-0005，故事 14/15）。
  // 挂在 change 而不是 input：实测逐字敲「语文补充练习」会先经过 input="语文" 这个完整匹配。
  dom.subjectInput.addEventListener('focus', window.snapshotSubjectInput);
  dom.subjectInput.addEventListener('change', window.onSubjectBoxChange);

  // 「当天/次日」段式控件（截止时间落在所属日还是它的次日）
  var deadlineDaySeg = document.getElementById('deadlineDaySeg');
  if (deadlineDaySeg) {
    deadlineDaySeg.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('.seg-opt') : null;
      if (!opt) return;
      window.setDeadlineDay(parseInt(opt.dataset.offset, 10));
    });
  }

  // Form submit
  dom.homeworkForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var data = {
      content: dom.contentInput.value.trim(),
      date: window.formatDate(state.currentDate),
    };
    // 科目框现在可输入：与已有科目同名 → 提交 id（不重复建科）；
    // 是个新名字 → 提交 name，后端在同一事务里自动建科。
    // 两者都空 → 挡住。科目必选（后端也会拒：「作业必须属于一个科目」），但别等到网络回来。
    var subjText = dom.subjectInput.value.trim();
    var subj = subjText ? state.subjects.find(function (s) { return s.name === subjText; }) : null;
    if (subj) data.subject_id = subj.id;
    else if (subjText) data.subject_name = subjText;
    else {
      window.showToast('请选择或输入科目', 'error');
      return;
    }
    var deadlineVal = document.getElementById('deadlineInput').value.trim();
    data.deadline = null;
    if (deadlineVal) {
      // 手动输入：只接受时间 "14:30"，宽容提取（带日期也能取到时间）
      // 落哪一天由「当天/次日」决定，基准永远是该条的所属日（新建时为查看日）。
      // offset 为 null 表示这条历史 deadline 两档都不属于——用户没点段控件就原样保留
      // 那一天，改正文不会把死线挪走。
      var offset = state.deadlineDayOffset;
      var baseDate = offset === null
        ? String(state.editingDeadline || '').slice(0, 10)
        : (state.deadlineOwnerDate || window.formatDate(state.currentDate));
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
      // 这次保存可能新建了科目；不重拉一次，renderHomeworks 按 state.subjects 分组时
      // 这一条会因为「找不到所属科目」而整个不上墙。
      await window.refreshSubjects();
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

  // Load subjects
  try {
    await window.loadSubjects();
    window.renderSubjectOptions();
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
