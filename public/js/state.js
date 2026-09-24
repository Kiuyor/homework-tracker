// ============ State ============
window.AppState = {
  currentDate: new Date(),
  homeworks: [],
  subjects: [],
  editingId: null,
  subjectPickId: null, // 科目选择器当前选中的科目（ADR-0011：只有六科，点不出来新名字）
  editingDeadline: null, // 编辑中的作业原始 deadline，用于「只改时间不改日期」
  deadlineOwnerDate: null, // 「当天/次日」的基准日 = 正在编辑条目的所属日（新建时为查看日）
  deadlineDayOffset: 0, // 0=当天 1=次日 null=原始 deadline 落在两档之外
  fontSize: 44,
  viewMode: 'show', // 'edit' | 'show'，默认展示态（ADR-0003：编辑是显式进入的临时态）
  theme: 'whiteboard', // 主题轴当前档（ADR-0012），与 viewMode / dark-mode 两把 class 互不相干
  refreshTimer: null,
  clockTimer: null,
  editIdleTimer: null,   // 编辑态闲置回弹，独立句柄（不与轮询/时钟共用）
  editIdleAt: 0,         // 最近一次「活跃活动」的时间戳
  editIdleWarnedAt: 0,   // 上次弹「即将回到展示」预告的时间，避免每秒重复弹
  clockText: '', // 上次渲染的 HH:MM，避免每秒重复写 DOM
  offlineFailures: 0,  // 连续刷新失败次数（离线角标用）
  offlineShown: false, // 角标当前是否已显示，避免重复写 DOM
  lastRenderSig: null, // 上次渲染时的输入签名，用于「数据没变就跳过重渲染」
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

window.dayWord = function (date) {
  // 「今天 / 明天 / 昨天 / 9月25日」——与顶部日期标签同一套指代，不各写一份。
  // 空墙文案要用它：写死「今天」会让翻到昨天的整屏文案指错日子。
  var label = window.formatDisplay(date);
  var m = label.match(/^(今天|明天|昨天)/);
  return m ? m[1] : label.split(' ')[0];
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