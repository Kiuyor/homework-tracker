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
  addBtn: window.$('#addBtn'),
  modeToggle: window.$('#modeToggle'),
  manageBar: window.$('#manageBar'),
  modalOverlay: window.$('#modalOverlay'),
  modalTitle: window.$('#modalTitle'),
  modalClose: window.$('#modalClose'),
  modalCancel: window.$('#modalCancel'),
  homeworkForm: window.$('#homeworkForm'),
  editId: window.$('#editId'),
  subjectSelect: window.$('#subjectSelect'),
  contentInput: window.$('#contentInput'),
  toastContainer: window.$('#toastContainer'),
  batchImportBtn: document.getElementById('batchImportBtn'),
  batchModalOverlay: document.getElementById('batchModalOverlay'),
  batchInput: document.getElementById('batchInput'),
  batchSubmit: document.getElementById('batchSubmit'),
  batchCancel: document.getElementById('batchCancel'),
  batchModalClose: document.getElementById('batchModalClose'),
  subjectFilter: document.getElementById('subjectFilter'),
  batchEditBtn: document.getElementById('batchEditBtn'),
  batchBar: document.getElementById('batchBar'),
  batchCount: document.getElementById('batchCount'),
  batchSubjectSelect: document.getElementById('batchSubjectSelect'),
  batchNoteInput: document.getElementById('batchNoteInput'),
  batchCancelBtn: document.getElementById('batchCancelBtn'),
  batchApplyBtn: document.getElementById('batchApplyBtn'),
  collapseBtn: document.getElementById('collapseBtn'),
  expandBtn: document.getElementById('expandBtn'),
  darkmodeBtn: document.getElementById('darkmodeBtn'),
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