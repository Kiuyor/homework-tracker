// ============ Subject Color Map ============
// 科目色由 CSS 变量池供给（--c-s1..--c-s12），随亮/暗模式自动切换，并保证白底对比度
var SUBJECT_COLOR_COUNT = 12;
var _colorCache = {};
function subjectColor(name) {
  if (_colorCache[name]) return _colorCache[name];
  // 按科目在 state.subjects 中的序号取色 → 同一科目跨编辑/展示模式配色稳定
  var subs = (window.AppState && window.AppState.subjects) || [];
  var idx = subs.findIndex(function (s) { return s.name === name; });
  if (idx === -1) idx = Object.keys(_colorCache).length; // 未知科目（如「其他」）兜底
  _colorCache[name] = 'var(--c-s' + (idx % SUBJECT_COLOR_COUNT + 1) + ')';
  return _colorCache[name];
}

// ============ SVG 图标（统一尺寸，stroke 继承 currentColor） ============
var ICON = {
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
};

// ============ Render Homeworks（按科目分组，一屏铺满） ============
window.renderHomeworks = function () {
  var dom = window.AppDom;
  var state = window.AppState;
  var groupsEl = dom.subjectGroups;
  groupsEl.innerHTML = '';

  // 应用科目筛选
  var list = state.homeworks;
  if (state.filterSubjectId) {
    list = list.filter(function (h) { return h.subject_id === state.filterSubjectId; });
  }

  if (list.length === 0) {
    var emptyText = state.homeworks.length === 0
      ? '今天还没有作业'
      : '该科目今天没有作业';
    groupsEl.innerHTML = '<div class="empty-line">' + emptyText + '</div>';
    if (state.viewMode === 'show') window.fitShowDisplay();
    return;
  }

  // 按科目分组（保持 subjects 顺序）
  var groups = [];
  if (state.viewMode === 'show') {
    // 展示模式：所有科目占位，无作业显示「暂无作业」
    state.subjects.forEach(function (s) {
      var items = list.filter(function (h) { return h.subject_id === s.id; });
      groups.push({ name: s.name, items: items, empty: items.length === 0 });
    });
  } else {
    state.subjects.forEach(function (s) {
      var items = list.filter(function (h) { return h.subject_id === s.id; });
      if (items.length) groups.push({ name: s.name, items: items });
    });
  }
  // 未分配科目的放最后（编辑模式才显示）
  if (state.viewMode !== 'show') {
    var noSubj = list.filter(function (h) { return !h.subject_id; });
    if (noSubj.length) groups.push({ name: '其他', items: noSubj });
  }

  groups.forEach(function (group) {
    var color = subjectColor(group.name);
    var sec = document.createElement('section');
    sec.className = 'subject-group';
    sec.setAttribute('data-subject', group.name);
    sec.style.setProperty('--subject-color', color);

    var head = document.createElement('div');
    head.className = 'subject-head';
    head.innerHTML =
      '<span class="subject-name">' + window.escapeHtml(group.name) + '</span>' +
      '<span class="subject-count">' + group.items.length + ' 条</span>';
    sec.appendChild(head);

    var ul = document.createElement('ul');
    ul.className = 'hw-list';

    // 展示模式空科目：占位提示
    if (group.empty) {
      var emptyLi = document.createElement('li');
      emptyLi.className = 'hw-empty';
      var emptySpan = document.createElement('span');
      emptySpan.className = 'empty-text';
      emptySpan.textContent = '暂无作业';
      emptyLi.appendChild(emptySpan);
      ul.appendChild(emptyLi);
      sec.appendChild(ul);
      groupsEl.appendChild(sec);
      return;
    }

    group.items.forEach(function (hw) {
      var li = document.createElement('li');
      li.className = 'hw-row';
      li.dataset.id = hw.id;
      li.setAttribute('data-subject', group.name);
      li.style.setProperty('--subject-color', color);
      li.draggable = !state.batchMode && state.viewMode === 'edit';

      var actionsHtml = '';
      if (state.batchMode) {
        li.classList.add('selectable');
        var isSelected = state.selectedIds.indexOf(hw.id) !== -1;
        if (isSelected) li.classList.add('selected');
        actionsHtml = '<span class="checkbox">' + ICON.check + '</span>';
        li.addEventListener('click', function () { window.toggleSelectHomework(hw.id); });
      } else if (state.viewMode === 'edit') {
        actionsHtml =
          '<div class="row-actions">' +
            '<button class="row-action-btn done-btn" data-id="' + hw.id + '" title="标记完成">' + ICON.check + '</button>' +
            '<button class="row-action-btn edit" data-id="' + hw.id + '" title="编辑">' + ICON.pencil + '</button>' +
            '<button class="row-action-btn del" data-id="' + hw.id + '" title="删除">' + ICON.trash + '</button>' +
          '</div>' +
          '<div class="drag-handle" title="拖动排序">' + ICON.grip + '</div>';
      }

      var metaHtml = '';
      if (hw.deadline) {
        metaHtml = '<div class="meta">' +
          '<span class="deadline">' + ICON.clock + '<span>' + formatDeadline(hw.deadline) + '</span></span>' +
        '</div>';
      }

      li.innerHTML =
        '<span class="bar"></span>' +
        '<div class="body">' +
          '<div class="content">' + window.escapeHtml(hw.content) + '</div>' +
          metaHtml +
        '</div>' +
        actionsHtml;

      if (state.viewMode === 'edit' && !state.batchMode) {
        li.querySelector('.done-btn').addEventListener('click', async function () {
          try {
            var updated = await window.toggleHomeworkDone(hw.id);
            window.showToast(updated && updated.completed ? '已标记完成' : '已取消完成', 'success');
            window.loadHomeworks();
          } catch (err) {
            window.showToast('操作失败: ' + err.message, 'error');
          }
        });
        li.querySelector('.edit').addEventListener('click', function () {
          window.openEditModal(hw);
        });
        li.querySelector('.del').addEventListener('click', async function () {
          if (!confirm('确定要删除这条作业吗？')) return;
          try {
            await window.deleteHomework(hw.id);
            window.showToast('已删除', 'info');
            window.loadHomeworks();
          } catch (err) {
            window.showToast('删除失败: ' + err.message, 'error');
          }
        });

        li.addEventListener('dragstart', window.handleDragStart);
        li.addEventListener('dragend', window.handleDragEnd);
        li.addEventListener('dragenter', window.handleDragEnter);
        li.addEventListener('dragleave', window.handleDragLeave);
        li.addEventListener('dragover', window.handleDragOver);
        li.addEventListener('drop', window.handleDrop);
        window.setupTouchDrag(li);
      }

      ul.appendChild(li);
    });

    sec.appendChild(ul);
    groupsEl.appendChild(sec);
  });

  // 展示模式：渲染后按实际内容量自适应字号，确保内容完整不裁切
  if (state.viewMode === 'show') {
    window.fitShowDisplay();
    // 网络字体加载完成后字宽变化，需重算一次
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { window.fitShowDisplay(); });
    }
  }
};

// ============ Font Size ============
window.applyFontSize = function (size) {
  document.documentElement.style.setProperty('--card-font-size', size + 'px');
};

// ============ Deadline Formatting ============
// 展示：只显示 "14:30"（无需年份日期）
// 安全：解析失败一律返回空串，绝不把原始字符串插入 innerHTML（防存储型 XSS）
function formatDeadline(raw) {
  if (!raw) return '';
  var d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) {
    var parts = raw.split(/[\s-:]/);
    if (parts.length >= 5) {
      d = new Date(+parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4]);
    }
  }
  if (isNaN(d.getTime())) return '';
  var hours = d.getHours().toString().padStart(2, '0');
  var mins = d.getMinutes().toString().padStart(2, '0');
  return hours + ':' + mins;
}

// 编辑回显：数据库 "2026-07-10 14:30:00" → 输入框 "14:30"
function formatDeadlineInput(raw) {
  if (!raw) return '';
  var d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  var hours = d.getHours().toString().padStart(2, '0');
  var mins = d.getMinutes().toString().padStart(2, '0');
  return hours + ':' + mins;
}

// 手动输入解析：只接受时间 "14:30" / "8:00" / "18:05"
// 用今天日期拼成 "YYYY-MM-DD HH:MM:00" 存储（DB 兼容），解析失败返回 null
window.parseDeadlineInput = function (text) {
  if (!text) return null;
  var m = text.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
  if (!m) return null;
  var hour = +m[1], min = +m[2];
  if (hour > 23 || min > 59) return null; // 非法时间
  var now = new Date();
  var year = now.getFullYear();
  var month = String(now.getMonth() + 1).padStart(2, '0');
  var day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day +
    ' ' + String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':00';
};

// ============ Modal ============
window.openAddModal = function () {
  var dom = window.AppDom;
  window.AppState.editingId = null;
  dom.modalTitle.textContent = '添加作业';
  dom.editId.value = '';
  dom.subjectSelect.value = '';
  dom.contentInput.value = '';
  var deadlineInput = document.getElementById('deadlineInput');
  if (deadlineInput) deadlineInput.value = '';
  dom.modalOverlay.classList.remove('hidden');
  dom.contentInput.focus();
};

window.openEditModal = function (hw) {
  var dom = window.AppDom;
  window.AppState.editingId = hw.id;
  dom.modalTitle.textContent = '编辑作业';
  dom.editId.value = hw.id;
  dom.subjectSelect.value = hw.subject_id != null ? hw.subject_id : '';
  dom.contentInput.value = hw.content;
  var deadlineInput = document.getElementById('deadlineInput');
  if (deadlineInput) deadlineInput.value = hw.deadline ? formatDeadlineInput(hw.deadline) : '';
  dom.modalOverlay.classList.remove('hidden');
  dom.contentInput.focus();
};

window.closeModal = function () {
  window.AppDom.modalOverlay.classList.add('hidden');
};

// ============ Dark Mode ============
window.toggleDarkMode = function () {
  var isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('hw_darkmode', isDark ? '1' : '0');
};

// ============ View Mode Toggle（编辑/展示） ============
window.toggleViewMode = function () {
  var state = window.AppState;
  var dom = window.AppDom;

  if (state.viewMode === 'edit') {
    // 切到展示模式（学生只读）
    state.viewMode = 'show';
    dom.modeToggle.textContent = '编辑';
    dom.modeToggle.classList.add('active');
    document.body.classList.add('view-show');
    document.body.classList.remove('manage-on');
    window.closeBatchMode();
    window.loadHomeworks();
    window.startAutoRefresh();
    window.enterFullscreen();
  } else {
    // 切回编辑模式（科代表录入）
    state.viewMode = 'edit';
    dom.modeToggle.textContent = '展示';
    dom.modeToggle.classList.remove('active');
    document.body.classList.remove('view-show');
    document.body.classList.add('manage-on');
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    window.loadHomeworks();
    window.exitFullscreen();
  }
};

// ============ Auto-refresh（展示模式 5 秒轮询） ============
window.startAutoRefresh = function () {
  var state = window.AppState;
  if (state.refreshTimer) return;
  state.refreshTimer = setInterval(function () {
    window.loadHomeworks();
  }, 5000);
};

// ============ 展示模式字号缩放 ============
window.applyShowScale = function (scale) {
  scale = Math.min(2, Math.max(0.5, Math.round(scale * 10) / 10));
  document.documentElement.style.setProperty('--show-scale', scale);
  var val = document.getElementById('showFontVal');
  if (val) val.textContent = Math.round(scale * 100) + '%';
  localStorage.setItem('hw_show_scale', String(scale));
  if (window.AppState && window.AppState.viewMode === 'show') window.fitShowDisplay();
};

window.adjustShowScale = function (delta) {
  var cur = parseFloat(document.documentElement.style.getPropertyValue('--show-scale')) || 1;
  window.applyShowScale(cur + delta);
};

// ============ 展示模式自适应 ============
// 目标：内容一条不漏（完全性）+ 字号尽量大（后排可视性）。
// 仅调整 --fit-scale（与用户选择的 --show-scale 相乘），二分搜索出「内容完整显示」的最大字号。
// 若缩到可读下限仍放不下 → 退化为自然布局 + 纵向滚动（见 .show-overflow）。
window.fitShowDisplay = function () {
  if (!document.body.classList.contains('view-show')) return;
  var root = document.documentElement;
  var body = document.body;
  var FLOOR = 0.55; // 下限：再小就不可读

  body.classList.remove('show-overflow'); // 先按「固定网格」评估

  function overflows() {
    var groups = document.querySelectorAll('body.view-show .subject-group');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var list = g.querySelector('.hw-list');
      if (list && list.scrollHeight > list.clientHeight + 1) return true;
      if (g.scrollHeight > g.clientHeight + 1) return true;
    }
    return false;
  }
  function setScale(s) { root.style.setProperty('--fit-scale', String(s)); }

  setScale(1);
  if (!overflows()) return;   // 基准字号即完整显示

  setScale(FLOOR);
  if (overflows()) {
    // 可读下限仍放不下：切换滚动兜底，并用回较大字号（滚动下后排仍要看得清）
    body.classList.add('show-overflow');
    setScale(1);
    return;
  }

  var lo = FLOOR, hi = 1;     // lo=可完整显示, hi=溢出
  for (var k = 0; k < 8; k++) {
    var mid = (lo + hi) / 2;
    setScale(mid);
    if (overflows()) hi = mid; else lo = mid;
  }
  setScale(lo);
};

// ============ Manage Mode（管理扩展条） ============
// 管理扩展条常驻显示（无独立开关按钮），此函数保留供批量模式复位用
window.toggleManageMode = function () {
  var dom = window.AppDom;
  document.body.classList.remove('manage-on');
};

// ============ Batch Edit Mode ============
window.openBatchMode = function () {
  var dom = window.AppDom;
  var state = window.AppState;
  state.batchMode = true;
  state.selectedIds = [];
  dom.batchBar.classList.remove('hidden');
  dom.batchNoteInput.value = '';
  dom.batchSubjectSelect.value = '';
  dom.batchEditBtn.classList.add('active');
  window.updateBatchCount();
  window.renderHomeworks();
  window.showToast('点击作业多选', 'info');
};

window.closeBatchMode = function () {
  var dom = window.AppDom;
  var state = window.AppState;
  state.batchMode = false;
  state.selectedIds = [];
  dom.batchBar.classList.add('hidden');
  dom.batchEditBtn.classList.remove('active');
  window.renderHomeworks();
};

window.toggleSelectHomework = function (id) {
  var state = window.AppState;
  var idx = state.selectedIds.indexOf(id);
  if (idx === -1) {
    state.selectedIds.push(id);
  } else {
    state.selectedIds.splice(idx, 1);
  }
  window.updateBatchCount();
  window.renderHomeworks();
};

window.updateBatchCount = function () {
  var dom = window.AppDom;
  var state = window.AppState;
  dom.batchCount.textContent = '已选 ' + state.selectedIds.length + ' 条';
  dom.batchApplyBtn.disabled = state.selectedIds.length === 0;
};

window.applyBatchEdit = async function () {
  var dom = window.AppDom;
  var state = window.AppState;
  if (state.selectedIds.length === 0) {
    window.showToast('请先选择作业', 'error');
    return;
  }
  var data = {};
  var subjVal = dom.batchSubjectSelect.value;
  if (subjVal) data.subject_id = parseInt(subjVal);
  var noteVal = dom.batchNoteInput.value.trim();
  if (noteVal) data.note = noteVal;
  if (Object.keys(data).length === 0) {
    window.showToast('请选择科目或填写备注', 'error');
    return;
  }
  try {
    await window.batchUpdateHomeworks(state.selectedIds, data);
    window.showToast('已更新 ' + state.selectedIds.length + ' 条作业', 'success');
    window.closeBatchMode();
    window.loadHomeworks();
  } catch (err) {
    window.showToast('批量更新失败: ' + err.message, 'error');
  }
};

// ============ Batch Import ============
window.openBatchImport = function () {
  var dom = window.AppDom;
  dom.batchInput.value = '';
  dom.batchModalOverlay.classList.remove('hidden');
  dom.batchInput.focus();
};
window.closeBatchImport = function () {
  window.AppDom.batchModalOverlay.classList.add('hidden');
};
window.parseAndImport = async function () {
  var dom = window.AppDom;
  var state = window.AppState;
  var text = dom.batchInput.value.trim();
  if (!text) { window.showToast('请输入作业内容', 'error'); return; }
  var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l; });
  var success = 0, errors = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var colonIdx = line.indexOf('：'), semiIdx = line.indexOf(':');
    var effectiveIdx = colonIdx === -1 ? semiIdx : (semiIdx === -1 ? colonIdx : Math.min(colonIdx, semiIdx));
    if (effectiveIdx === -1) { errors.push('「' + line.slice(0, 20) + '...」缺少科目分隔符'); continue; }
    var subjectName = line.slice(0, effectiveIdx).trim();
    var content = line.slice(effectiveIdx + 1).trim();
    if (!content) { errors.push('「' + subjectName + '」作业内容为空'); continue; }
    var subj = state.subjects.find(function (s) { return s.name === subjectName; });
    try {
      await window.addHomework({ subject_id: subj ? subj.id : null, content: content, date: window.formatDate(state.currentDate), note: '' });
      success++;
    } catch (err) { errors.push('「' + subjectName + '」导入失败: ' + err.message); }
  }
  window.closeBatchImport();
  var msg = errors.length === 0 ? '成功导入 ' + success + ' 条作业' : '导入 ' + success + ' 条，' + errors.length + ' 条失败';
  window.showToast(msg, errors.length ? 'error' : 'success');
  window.loadHomeworks();
};
