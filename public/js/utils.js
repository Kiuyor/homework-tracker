// ============ DOM Selectors ============
window.$ = function (sel) { return document.querySelector(sel); };
window.$$ = function (sel) { return document.querySelectorAll(sel); };

// ============ DOM References ============
window.AppDom = {
  dateLabel: window.$('#dateLabel'),
  prevDate: window.$('#prevDate'),
  nextDate: window.$('#nextDate'),
  todayBtn: window.$('#todayBtn'),
  subjectGroups: window.$('#subjectGroups'),
  main: window.$('.main'),
  addBtn: window.$('#addBtn'),
  modeToggle: window.$('#modeToggle'),
  modalOverlay: window.$('#modalOverlay'),
  modalEl: window.$('#modalEl'),
  modalTitle: window.$('#modalTitle'),
  modalClose: window.$('#modalClose'),
  modalCancel: window.$('#modalCancel'),
  homeworkForm: window.$('#homeworkForm'),
  editId: window.$('#editId'),
  subjectSeg: window.$('#subjectSeg'),
  contentInput: window.$('#contentInput'),
  toastContainer: window.$('#toastContainer'),
  collapseBtn: document.getElementById('collapseBtn'),
  expandBtn: document.getElementById('expandBtn'),
  darkmodeBtn: document.getElementById('darkmodeBtn'),
};

// ============ 焦点工具（模态用） ============
// 触控一体机上"焦点在哪"看着不重要，但软键盘挂的是焦点：打开模态时把焦点交给模态本身
// （tabindex=-1）而不是某个输入框，软键盘就不会在没打算打字时先弹起来压掉半屏。
// 三件事分开写：可聚焦集合是纯函数（可测），搬焦点、拦住逃逸各是一小段 DOM 操作。
var FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

window.focusablesIn = function (root) {
  if (!root || !root.querySelectorAll) return [];
  return Array.prototype.filter.call(
    root.querySelectorAll(FOCUSABLE_SELECTOR),
    function (el) { return el.offsetParent !== null || el === document.activeElement; }
  );
};

var _focusBeforeModal = null;

window.rememberFocus = function () {
  // 只在"模态本来是关着的"这一次记。模态已经开着时再进来（点已录科目 → 直接切去改那一条，
  // ui.js 的 pickSubject→openEditModal）记下的是弹窗内部的钮，而 renderSubjectSeg 会把它们
  // 整批重建——关闭时那颗钮已不在 DOM 里，焦点就白存了。
  var overlay = window.AppDom && window.AppDom.modalOverlay;
  if (overlay && !overlay.classList.contains('hidden')) return;
  _focusBeforeModal = document.activeElement;
};

// 归还焦点。存下来的那颗钮可能已经不在了（重渲染、或它本来就在弹窗里），
// 所以给一条兜底链：**不许把焦点丢在 body 上**——那样键盘用户要从页首重新走一遍，
// 而且第 44 条那种「焦点在屏上、眼睛在别处」的状态正是模态要防的。
window.restoreFocus = function () {
  var target = _focusBeforeModal;
  _focusBeforeModal = null;
  if (target && target.focus && document.contains(target) && target.offsetParent !== null) {
    target.focus();
    return;
  }
  var fallback = document.getElementById('addBtn') || document.getElementById('modeToggle');
  if (fallback && fallback.focus) fallback.focus();
};

window.focusModal = function () {
  if (window.AppDom && window.AppDom.modalEl) window.AppDom.modalEl.focus();
};

// Tab 循环：焦点不许走出模态。首尾之间双向夹住；模态里一个可聚焦都没有时把焦点留在模态上。
// 注意 `active === modal` 也要夹：打开时焦点正落在模态本身（tabindex=-1），
// 那一刻它既不是首元素也不是末元素，若不认它，一次 Shift+Tab 就退到遮罩背后的顶栏上——
// 实测能一路退到日期导航，并在那里按 Enter 把视图翻走（工单：键盘路径）。
window.trapFocus = function (e, modal) {
  if (!modal) return;
  var items = window.focusablesIn(modal);
  if (!items.length) {
    if (document.activeElement !== modal) { e.preventDefault(); modal.focus(); }
    return;
  }
  var first = items[0];
  var last = items[items.length - 1];
  var active = document.activeElement;
  if (!modal.contains(active)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey) {
    // 模态自身算"在首元素之前"，Shift+Tab 应当绕到末元素
    if (active === first || active === modal) { e.preventDefault(); last.focus(); }
  } else if (active === last) {
    e.preventDefault(); first.focus();
  }
};

// ============ escapeHtml ============
window.escapeHtml = function (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ============ Toast ============
window.showToast = function (message, type) {
  type = type || 'info';
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  window.AppDom.toastContainer.appendChild(toast);
  setTimeout(function () {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = '0.3s ease';
    setTimeout(function () { toast.remove(); }, 300);
  }, 2500);
};