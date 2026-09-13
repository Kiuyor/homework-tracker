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

  // 展示模式退出按钮
  var exitShowBtn = document.getElementById('exitShowBtn');
  if (exitShowBtn) {
    exitShowBtn.addEventListener('click', function () {
      if (window.AppState.viewMode === 'show') window.toggleViewMode();
    });
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

  // Batch edit mode
  dom.batchEditBtn.addEventListener('click', function () {
    if (window.AppState.batchMode) {
      window.closeBatchMode();
    } else {
      window.openBatchMode();
    }
  });
  dom.batchCancelBtn.addEventListener('click', window.closeBatchMode);
  dom.batchApplyBtn.addEventListener('click', window.applyBatchEdit);

  // Dark mode
  dom.darkmodeBtn.addEventListener('click', window.toggleDarkMode);

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
  dom.modalOverlay.addEventListener('click', function (e) {
    if (e.target === dom.modalOverlay) window.closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      // 依次关闭：批量导入弹窗 > 添加/编辑弹窗 > 批量编辑栏
      if (dom.batchModalOverlay && !dom.batchModalOverlay.classList.contains('hidden')) {
        window.closeBatchImport();
      } else if (!dom.modalOverlay.classList.contains('hidden')) {
        window.closeModal();
      } else if (window.AppState.batchMode) {
        window.closeBatchMode();
      }
    }
  });

  // Form submit
  dom.homeworkForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var data = {
      subject_id: parseInt(dom.subjectSelect.value) || null,
      content: dom.contentInput.value.trim(),
      date: window.formatDate(state.currentDate),
    };
    // 备注字段 UI 已移除：编辑时不传（保留原值），新建时后端默认 ''
    if (!state.editingId) data.note = '';
    var deadlineVal = document.getElementById('deadlineInput').value.trim();
    data.deadline = null;
    if (deadlineVal) {
      // 手动输入：只接受时间 "14:30"，宽容提取（带日期也能取到时间）
      data.deadline = window.parseDeadlineInput(deadlineVal);
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
      window.loadHomeworks();
    } catch (err) {
      window.showToast('操作失败: ' + err.message, 'error');
    }
  });

  // Batch import
  if (dom.batchImportBtn) {
    dom.batchImportBtn.addEventListener('click', window.openBatchImport);
    dom.batchSubmit.addEventListener('click', window.parseAndImport);
    dom.batchCancel.addEventListener('click', window.closeBatchImport);
    dom.batchModalClose.addEventListener('click', window.closeBatchImport);
    dom.batchModalOverlay.addEventListener('click', function (e) {
      if (e.target === dom.batchModalOverlay) window.closeBatchImport();
    });
  }

})();

// ============ Init ============
window.init = async function () {
  var state = window.AppState;
  var dom = window.AppDom;

  // 默认编辑模式：行内操作按钮可见
  document.body.classList.add('manage-on');

  // URL ?show=1 直接进入展示模式（学生只读地址）
  if (new URLSearchParams(window.location.search).get('show') === '1') {
    window.toggleViewMode();
  }
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
    while (dom.subjectSelect.options.length > 1) {
      dom.subjectSelect.remove(1);
    }
    state.subjects.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      dom.subjectSelect.appendChild(opt);
    });
    // Populate filter + batch subject dropdowns
    state.subjects.forEach(function (s) {
      var optF = document.createElement('option');
      optF.value = s.id;
      optF.textContent = s.name;
      dom.subjectFilter.appendChild(optF);

      var optB = document.createElement('option');
      optB.value = s.id;
      optB.textContent = s.name;
      dom.batchSubjectSelect.appendChild(optB);
    });
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

// ============ 全屏工具（展示模式自动进入 / 退出展示自动还原） ============
// 注意：必须在 init() 调用之前定义，因为 ?show=1 时 init 会同步调用 enterFullscreen
function enterFullscreen() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(function () {});
  }
}
function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(function () {});
  }
}
window.enterFullscreen = enterFullscreen;
window.exitFullscreen = exitFullscreen;

window.init();
