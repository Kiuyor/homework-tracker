// ============ State ============
window.AppState = {
  currentDate: new Date(),
  homeworks: [],
  subjects: [],
  editingId: null,
  editingDeadline: null, // 编辑中的作业原始 deadline，用于「只改时间不改日期」
  dragSrcId: null,
  fontSize: 44,
  filterSubjectId: null,
  batchMode: false,
  selectedIds: [],
  viewMode: 'edit', // 'edit' | 'show'
  refreshTimer: null,
  clockTimer: null,
  clockText: '', // 上次渲染的 HH:MM，避免每秒重复写 DOM
  offlineFailures: 0,  // 连续刷新失败次数（离线角标用）
  offlineShown: false, // 角标当前是否已显示，避免重复写 DOM
};

// ============ Date Helpers ============
window.formatDate = function (date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

window.getWeekday = function (date) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return '星期' + days[date.getDay()];
};

window.formatDisplay = function (date) {
  const today = new Date();
  const todayStr = window.formatDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const diff = window.formatDate(date) === todayStr ? '今天' :
    window.formatDate(date) === window.formatDate(tomorrow) ? '明天' :
    window.formatDate(date) === window.formatDate(yesterday) ? '昨天' : '';
  const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`;
  return diff ? `${diff} ${dateStr} ${window.getWeekday(date)}` : `${dateStr} ${window.getWeekday(date)}`;
};

window.changeDate = function (delta) {
  const newDate = new Date(window.AppState.currentDate);
  newDate.setDate(newDate.getDate() + delta);
  window.AppState.currentDate = newDate;
  window.updateDateDisplay();
  window.loadHomeworks();
};

window.goToday = function () {
  window.AppState.currentDate = new Date();
  window.updateDateDisplay();
  window.loadHomeworks();
};

window.updateDateDisplay = function () {
  window.AppDom.dateLabel.textContent = window.formatDisplay(window.AppState.currentDate);
};