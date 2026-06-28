// ============ State ============
const state = {
  currentDate: new Date(),
  homeworks: [],
  subjects: [],
  editingId: null,
  fontSize: 22,
  layout: 3,
  dragSrcId: null,
  selected: new Set(),
};

// ============ DOM References ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const dom = {
  datePicker: $('#datePicker'),
  dateLabel: $('#dateLabel'),
  prevDate: $('#prevDate'),
  nextDate: $('#nextDate'),
  todayBtn: $('#todayBtn'),
  cardWall: $('#cardWall'),
  emptyState: $('#emptyState'),
  homeworkCount: $('#homeworkCount'),
  addBtn: $('#addBtn'),
  fontSizeSlider: $('#fontSizeSlider'),
  fontSizeLabel: $('#fontSizeLabel'),
  layoutBtns: $$('.layout-btn'),
  modalOverlay: $('#modalOverlay'),
  modalTitle: $('#modalTitle'),
  modalClose: $('#modalClose'),
  modalCancel: $('#modalCancel'),
  homeworkForm: $('#homeworkForm'),
  editId: $('#editId'),
  subjectSelect: $('#subjectSelect'),
  contentInput: $('#contentInput'),
  noteInput: $('#noteInput'),
  toastContainer: $('#toastContainer'),
  darkmodeBtn: $('#darkmodeBtn'),
};

// ============ Date Helpers ============
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekday(date) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return '星期' + days[date.getDay()];
}

function formatDisplay(date) {
  const today = new Date();
  const todayStr = formatDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const diff = formatDate(date) === todayStr ? '今天' :
    formatDate(date) === formatDate(tomorrow) ? '明天' :
    formatDate(date) === formatDate(yesterday) ? '昨天' : '';
  const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`;
  return diff ? `${diff} ${dateStr} ${getWeekday(date)}` : `${dateStr} ${getWeekday(date)}`;
}

function changeDate(delta) {
  const newDate = new Date(state.currentDate);
  newDate.setDate(newDate.getDate() + delta);
  state.currentDate = newDate;
  updateDateDisplay();
  loadHomeworks();
}

function goToday() {
  state.currentDate = new Date();
  updateDateDisplay();
  loadHomeworks();
}

function updateDateDisplay() {
  dom.datePicker.value = formatDate(state.currentDate);
  dom.dateLabel.textContent = formatDisplay(state.currentDate);
}

// ============ API Calls ============
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '请求失败');
  return json.data;
}

async function loadHomeworks() {
  const date = formatDate(state.currentDate);
  const homeworks = await api('GET', `/api/homeworks?date=${date}`);
  state.homeworks = homeworks;
  renderHomeworks();
}

async function loadSubjects() {
  state.subjects = await api('GET', '/api/subjects');
}

async function addHomework(data) {
  return await api('POST', '/api/homeworks', data);
}

async function updateHomework(id, data) {
  return await api('PUT', `/api/homeworks/${id}`, data);
}

async function deleteHomework(id) {
  return await api('DELETE', `/api/homeworks/${id}`);
}

async function reorderHomeworks(orders) {
  return await api('PUT', '/api/homeworks/reorder', { orders });
}

// ============ Toast ============
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ============ Render Homeworks ============
function renderHomeworks() {
  dom.cardWall.innerHTML = '';

  if (state.homeworks.length === 0) {
    dom.cardWall.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><span class="material-symbols-outlined">dashboard_customize</span></div>
        <p class="empty-text">今天还没有作业<br>点击右上角添加吧！</p>
      </div>`;
    dom.homeworkCount.textContent = '0 条作业';
    return;
  }

  dom.homeworkCount.textContent = `${state.homeworks.length} 条作业`;

  state.homeworks.forEach((hw, i) => {
    const card = document.createElement('div');
    card.className = 'homework-card';
    card.draggable = true;
    card.dataset.id = hw.id;

    card.innerHTML = `
      <div class="card-select" data-id="${hw.id}">
        <span class="material-symbols-outlined select-icon">check_circle</span>
      </div>
      <div class="card-top">
        <div class="card-actions">
          <button class="card-action-btn edit" data-id="${hw.id}" title="编辑"><span class="material-symbols-outlined">edit</span></button>
          <button class="card-action-btn delete" data-id="${hw.id}" title="删除"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      ${hw.subject_name ? `<span class="card-subject">${escapeHtml(hw.subject_name)}</span>` : ''}
      <div class="card-content">${escapeHtml(hw.content)}</div>
      ${hw.note ? `<div class="card-note">${escapeHtml(hw.note)}</div>` : ''}
      <div class="card-drag-handle" title="拖动排序"><span class="material-symbols-outlined">drag_indicator</span></div>
    `;

    // 选中状态
    if (state.selected.has(hw.id)) {
      card.classList.add('selected');
    }

    // 选择复选框
    card.querySelector('.card-select').addEventListener('click', () => toggleSelect(hw.id));

    // === 事件绑定 ===
    // 编辑
    card.querySelector('.edit').addEventListener('click', () => openEditModal(hw));

    // 删除
    card.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm('确定要删除这条作业吗？')) return;
      try {
        await deleteHomework(hw.id);
        showToast('已删除', 'info');
        loadHomeworks();
      } catch (err) {
        showToast('删除失败: ' + err.message, 'error');
      }
    });

    // === 拖动事件 ===
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    setupTouchDrag(card); // 触屏拖动支持

    dom.cardWall.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ Drag & Drop ============
let dragSrcEl = null;

function handleDragStart(e) {
  dragSrcEl = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  state.dragSrcId = this.dataset.id;
}

function handleDragEnd() {
  this.classList.remove('dragging');
  dom.cardWall.classList.remove('drag-over');
  document.querySelectorAll('.homework-card').forEach(c => c.classList.remove('drag-target'));
  dragSrcEl = null;
  state.dragSrcId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dom.cardWall.classList.add('drag-over');
}

function handleDragEnter(e) {
  e.preventDefault();
  if (this !== dragSrcEl) {
    this.classList.add('drag-target');
  }
}

function handleDragLeave() {
  this.classList.remove('drag-target');
}

async function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-target');
  dom.cardWall.classList.remove('drag-over');

  if (this === dragSrcEl) return;

  const targetId = parseInt(this.dataset.id);
  const sourceId = parseInt(dragSrcEl.dataset.id);

  // 获取当前排序
  const cards = [...dom.cardWall.querySelectorAll('.homework-card')];
  const ids = cards.map(c => parseInt(c.dataset.id));

  // 重新排列：把 sourceId 移到 targetId 的位置
  const srcIdx = ids.indexOf(sourceId);
  const tgtIdx = ids.indexOf(targetId);
  ids.splice(srcIdx, 1);
  ids.splice(tgtIdx, 0, sourceId);

  // 构建排序数据
  const orders = ids.map((id, i) => ({ id, sort_order: i }));

  try {
    await reorderHomeworks(orders);
    // 更新本地状态
    state.homeworks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    renderHomeworks();
    showToast('排序已更新', 'info');
  } catch (err) {
    showToast('排序失败: ' + err.message, 'error');
    loadHomeworks();
  }
}

// ============ Touch Drag (触屏拖动) ============
let touchState = null;

function setupTouchDrag(card) {
  const handle = card.querySelector('.card-drag-handle');
  if (!handle) return;
  handle.addEventListener('touchstart', onTouchStart, { passive: false });
}

function onTouchStart(e) {
  const card = e.currentTarget.closest('.homework-card');
  if (!card) return;
  e.preventDefault(); // 防止滚动

  touchState = { el: card };
  card.classList.add('dragging');
  card.style.opacity = '0.5';

  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);
}

function onTouchMove(e) {
  e.preventDefault();
  if (!touchState) return;

  const touchY = e.touches[0].clientY;
  const cards = [...dom.cardWall.querySelectorAll('.homework-card:not(.dragging)')];

  let closest = null, closestDist = Infinity;
  cards.forEach(c => {
    const rect = c.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(touchY - mid);
    if (dist < closestDist) { closestDist = dist; closest = c; }
  });

  cards.forEach(c => c.classList.remove('drag-target'));
  if (closest) closest.classList.add('drag-target');
}

async function onTouchEnd() {
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend', onTouchEnd);
  if (!touchState) return;

  const src = touchState.el;
  src.classList.remove('dragging');
  src.style.opacity = '';

  const tgt = dom.cardWall.querySelector('.drag-target');
  dom.cardWall.querySelectorAll('.homework-card').forEach(c => c.classList.remove('drag-target'));

  if (tgt && tgt !== src) {
    const cards = [...dom.cardWall.querySelectorAll('.homework-card')];
    const ids = cards.map(c => parseInt(c.dataset.id));
    const si = ids.indexOf(parseInt(src.dataset.id));
    const ti = ids.indexOf(parseInt(tgt.dataset.id));
    ids.splice(si, 1);
    ids.splice(ti, 0, parseInt(src.dataset.id));
    const orders = ids.map((id, i) => ({ id, sort_order: i }));
    try {
      await reorderHomeworks(orders);
      state.homeworks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      renderHomeworks();
    } catch { loadHomeworks(); }
  }
  touchState = null;
}

// ============ Modal ============
function openAddModal() {
  state.editingId = null;
  dom.modalTitle.textContent = '添加作业';
  dom.editId.value = '';
  dom.subjectSelect.value = state.subjects[0]?.id || '';
  dom.contentInput.value = '';
  dom.noteInput.value = '';
  dom.modalOverlay.classList.remove('hidden');
  dom.contentInput.focus();
}

function openEditModal(hw) {
  state.editingId = hw.id;
  dom.modalTitle.textContent = '编辑作业';
  dom.editId.value = hw.id;
  dom.subjectSelect.value = hw.subject_id ?? state.subjects[0]?.id ?? '';
  dom.contentInput.value = hw.content;
  dom.noteInput.value = hw.note || '';
  dom.modalOverlay.classList.remove('hidden');
  dom.contentInput.focus();
}

function closeModal() {
  dom.modalOverlay.classList.add('hidden');
}

// ============ Font Size Control ============
function applyFontSize(size) {
  state.fontSize = size;
  document.documentElement.style.setProperty('--card-font-size', size + 'px');
  dom.fontSizeLabel.textContent = size;
}

// ============ Layout Control ============
function setLayout(cols) {
  state.layout = cols;
  dom.cardWall.dataset.layout = cols;
  dom.layoutBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.layout) === cols);
  });
}

// ============ Event Listeners ============
// Date
dom.prevDate.addEventListener('click', () => changeDate(-1));
dom.nextDate.addEventListener('click', () => changeDate(1));
dom.todayBtn.addEventListener('click', goToday);

dom.datePicker.addEventListener('change', () => {
  const parts = dom.datePicker.value.split('-');
  if (parts.length === 3) {
    state.currentDate = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    updateDateDisplay();
    loadHomeworks();
  }
});

// ============ Batch Import ============
dom.batchImportBtn = $('#batchImportBtn');
dom.batchModalOverlay = $('#batchModalOverlay');
dom.batchInput = $('#batchInput');
dom.batchSubmit = $('#batchSubmit');
dom.batchCancel = $('#batchCancel');
dom.batchModalClose = $('#batchModalClose');

function openBatchImport() {
  dom.batchInput.value = '';
  dom.batchModalOverlay.classList.remove('hidden');
  dom.batchInput.focus();
}

function closeBatchImport() {
  dom.batchModalOverlay.classList.add('hidden');
}

async function parseAndImport() {
  const text = dom.batchInput.value.trim();
  if (!text) {
    showToast('请输入作业内容', 'error');
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let success = 0;
  let errors = [];

  for (const line of lines) {
    const colonIdx = line.indexOf('：');
    if (colonIdx === -1) {
      errors.push(`「${line.slice(0, 20)}...」缺少科目分隔符`);
      continue;
    }
    const subjectName = line.slice(0, colonIdx).trim();
    let rest = line.slice(colonIdx + 1).trim();
    let content = rest;
    let note = '';

    // 支持用 | 分隔备注
    const pipeIdx = rest.lastIndexOf('|');
    if (pipeIdx > 0) {
      content = rest.slice(0, pipeIdx).trim();
      note = rest.slice(pipeIdx + 1).trim();
    }

    if (!content) {
      errors.push(`「${subjectName}」作业内容为空`);
      continue;
    }

    const subj = state.subjects.find(s => s.name === subjectName);
    try {
      await addHomework({
        subject_id: subj ? subj.id : null,
        content: content,
        date: formatDate(state.currentDate),
        note: note,
      });
      success++;
    } catch (err) {
      errors.push(`「${subjectName}」导入失败: ${err.message}`);
    }
  }

  closeBatchImport();
  const msg = errors.length === 0
    ? `✅ 成功导入 ${success} 条作业`
    : `✅ 导入 ${success} 条，${errors.length} 条失败`;
  showToast(msg, errors.length ? 'error' : 'success');
  loadHomeworks();
}

dom.batchImportBtn.addEventListener('click', openBatchImport);
dom.batchSubmit.addEventListener('click', parseAndImport);
dom.batchCancel.addEventListener('click', closeBatchImport);
dom.batchModalClose.addEventListener('click', closeBatchImport);
dom.batchModalOverlay.addEventListener('click', (e) => {
  if (e.target === dom.batchModalOverlay) closeBatchImport();
});

// Select mode
dom.selectModeBtn = $('#selectModeBtn');
dom.selectModeBtn.addEventListener('click', () => {
  dom.selectModeBtn.classList.toggle('active');
  dom.cardWall.classList.toggle('select-mode');
  if (dom.selectModeBtn.classList.contains('active')) {
    dom.selectionBar.classList.remove('hidden');
  } else {
    state.selected.clear();
    dom.selectionBar.classList.add('hidden');
    loadHomeworks();
  }
  updateSelectionUI();
});

// ============ Batch Edit ============
dom.batchEditBtn = $('#batchEditBtn');
dom.selectionBar = $('#selectionBar');
dom.selectionCount = $('#selectionCount');
dom.selectAllBtn = $('#selectAllBtn');
dom.clearSelection = $('#clearSelection');
dom.batchEditOverlay = $('#batchEditOverlay');
dom.batchEditClose = $('#batchEditClose');
dom.batchEditCancel = $('#batchEditCancel');
dom.batchEditSave = $('#batchEditSave');
dom.batchEditNote = $('#batchEditNote');
dom.batchEditSubject = $('#batchEditSubject');
dom.batchEditCount = $('#batchEditCount');
dom.batchEditSaveCount = $('#batchEditSaveCount');

function updateSelectionUI() {
  const count = state.selected.size;
  dom.selectionBar.classList.toggle('hidden', count === 0);
  dom.batchEditBtn.classList.toggle('hidden', count === 0);
  dom.selectionCount.textContent = `已选 ${count} 项`;
  // 更新按钮文字，保留图标
  const txt = dom.batchEditBtn.querySelector('.batch-edit-label');
  if (txt) txt.textContent = `批量编辑 (${count})`;
}

function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  updateSelectionUI();
  loadHomeworks();
}

dom.selectAllBtn.addEventListener('click', () => {
  const allIds = state.homeworks.map(h => h.id);
  const allSelected = allIds.every(id => state.selected.has(id));
  if (allSelected) {
    state.selected.clear();
    dom.selectAllBtn.textContent = '全选';
  } else {
    allIds.forEach(id => state.selected.add(id));
    dom.selectAllBtn.textContent = '取消全选';
  }
  updateSelectionUI();
  loadHomeworks();
});

dom.clearSelection.addEventListener('click', () => {
  state.selected.clear();
  updateSelectionUI();
  loadHomeworks();
});

dom.batchEditBtn.addEventListener('click', () => {
  dom.batchEditNote.value = '';
  dom.batchEditSubject.value = '';
  dom.batchEditCount.textContent = state.selected.size;
  dom.batchEditSaveCount.textContent = state.selected.size;
  // 填充科目下拉
  dom.batchEditSubject.innerHTML = '<option value="">— 不修改科目 —</option>' +
    state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  dom.batchEditOverlay.classList.remove('hidden');
});

dom.batchEditClose.addEventListener('click', () => dom.batchEditOverlay.classList.add('hidden'));
dom.batchEditCancel.addEventListener('click', () => dom.batchEditOverlay.classList.add('hidden'));
dom.batchEditOverlay.addEventListener('click', (e) => {
  if (e.target === dom.batchEditOverlay) dom.batchEditOverlay.classList.add('hidden');
});

dom.batchEditSave.addEventListener('click', async () => {
  const note = dom.batchEditNote.value.trim();
  const subjectId = parseInt(dom.batchEditSubject.value);
  const ids = [...state.selected];
  let success = 0;

  for (const id of ids) {
    const updates = {};
    if (note) updates.note = note;
    if (subjectId) updates.subject_id = subjectId;
    if (Object.keys(updates).length === 0) continue;
    try {
      await updateHomework(id, updates);
      success++;
    } catch { /* skip failed */ }
  }

  dom.batchEditOverlay.classList.add('hidden');
  state.selected.clear();
  updateSelectionUI();
  showToast(`已更新 ${success} 项`, 'success');
  loadHomeworks();
});

// Add
dom.addBtn.addEventListener('click', openAddModal);

// Fullscreen
dom.fullscreenBtn = $('#fullscreenBtn');
dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', onFullscreenChange);

// Dark mode toggle
dom.darkmodeBtn.addEventListener('click', toggleDarkMode);

// Modal
dom.modalClose.addEventListener('click', closeModal);
dom.modalCancel.addEventListener('click', closeModal);
dom.modalOverlay.addEventListener('click', (e) => {
  if (e.target === dom.modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Form submit
dom.homeworkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    subject_id: parseInt(dom.subjectSelect.value) || null,
    content: dom.contentInput.value.trim(),
    date: formatDate(state.currentDate),
    note: dom.noteInput.value.trim(),
  };
  if (!data.content) {
    showToast('请输入作业内容', 'error');
    return;
  }
  try {
    if (state.editingId) {
      await updateHomework(state.editingId, data);
      showToast('已更新', 'success');
    } else {
      await addHomework(data);
      showToast('已添加', 'success');
    }
    closeModal();
    loadHomeworks();
  } catch (err) {
    showToast('操作失败: ' + err.message, 'error');
  }
});

// Font size
dom.fontSizeSlider.addEventListener('input', () => {
  applyFontSize(parseInt(dom.fontSizeSlider.value));
});

// Layout buttons
dom.layoutBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setLayout(parseInt(btn.dataset.layout));
  });
});

// ============ Dark Mode ============
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  document.body.classList.toggle('light-mode', !isDark);
  dom.darkmodeBtn.querySelector('.material-symbols-outlined').textContent =
    isDark ? 'light_mode' : 'dark_mode';
  localStorage.setItem('hw_darkmode', isDark ? '1' : '0');
}

// ============ Fullscreen Display Mode ============
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.body.requestFullscreen().catch(() => {});
    enterDisplayMode();
  } else {
    document.exitFullscreen().catch(() => {});
    exitDisplayMode();
  }
}

function onFullscreenChange() {
  if (!document.fullscreenElement) {
    exitDisplayMode();
  }
}

function enterDisplayMode() {
  document.body.classList.add('display-mode');
  setLayout(3);
  fitCardsToScreen();
  dom.fullscreenBtn.innerHTML = '<span class="material-symbols-outlined">fullscreen_exit</span>';
  dom.fullscreenBtn.title = '退出全屏';
}

function fitCardsToScreen() {
  const cards = document.querySelectorAll('.homework-card');
  if (cards.length === 0) return;

  const vh = window.innerHeight;
  const rows = Math.ceil(cards.length / 3);
  const cardH = (vh - 80) / rows - 14;
  const fontSize = Math.max(16, Math.min(38, Math.floor(cardH / 4)));

  applyFontSize(fontSize);
}

function exitDisplayMode() {
  document.body.classList.remove('display-mode');
  const saved = JSON.parse(localStorage.getItem('hw_prefs') || '{}');
  applyFontSize(saved.fontSize || 22);
  dom.fontSizeSlider.value = state.fontSize;
  dom.fontSizeLabel.textContent = state.fontSize;
  dom.fullscreenBtn.innerHTML = '<span class="material-symbols-outlined">fullscreen</span>';
  dom.fullscreenBtn.title = '全屏显示';
}

// 全屏时窗口缩放重新适配
window.addEventListener('resize', () => {
  if (document.body.classList.contains('display-mode')) {
    fitCardsToScreen();
  }
});

// ============ Init ============
async function init() {
  // 读取保存的偏好
  try {
    const saved = JSON.parse(localStorage.getItem('hw_prefs') || '{}');
    if (saved.fontSize) applyFontSize(saved.fontSize);
    setLayout(saved.layout || state.layout);
  } catch (e) {
    setLayout(state.layout);
  }

  dom.fontSizeSlider.value = state.fontSize;
  dom.fontSizeLabel.textContent = state.fontSize;

  // 暗色模式
  const darkPref = localStorage.getItem('hw_darkmode');
  if (darkPref === '1') {
    document.body.classList.add('dark-mode');
    dom.darkmodeBtn.querySelector('.material-symbols-outlined').textContent = 'light_mode';
  } else if (darkPref === '0') {
    document.body.classList.add('light-mode');
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    // 系统暗色，同步图标
    dom.darkmodeBtn.querySelector('.material-symbols-outlined').textContent = 'light_mode';
  }
  // 未设置时跟随系统 (prefers-color-scheme: dark CSS 自动处理)

  // 加载科目
  try {
    await loadSubjects();
    dom.subjectSelect.innerHTML = state.subjects
      .map(s => `<option value="${s.id}">${s.name}</option>`)
      .join('');
  } catch (e) {
    /* 科目加载失败也可用 */
  }

  updateDateDisplay();
  await loadHomeworks();
}

// 保存偏好
window.addEventListener('beforeunload', () => {
  localStorage.setItem('hw_prefs', JSON.stringify({
    fontSize: state.fontSize,
    layout: state.layout,
  }));
});

init();
