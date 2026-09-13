// ============ Drag & Drop ============
var dragSrcEl = null;

window.handleDragStart = function (e) {
  dragSrcEl = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  window.AppState.dragSrcId = this.dataset.id;
};

window.handleDragEnd = function () {
  this.classList.remove('dragging');
  window.AppDom.subjectGroups.classList.remove('drag-over');
  document.querySelectorAll('.hw-row').forEach(function (c) { c.classList.remove('drag-target'); });
  dragSrcEl = null;
  window.AppState.dragSrcId = null;
};

window.handleDragOver = function (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  window.AppDom.subjectGroups.classList.add('drag-over');
};

window.handleDragEnter = function (e) {
  e.preventDefault();
  if (this !== dragSrcEl) {
    this.classList.add('drag-target');
  }
};

window.handleDragLeave = function () {
  this.classList.remove('drag-target');
};

window.handleDrop = async function (e) {
  e.preventDefault();
  this.classList.remove('drag-target');
  window.AppDom.subjectGroups.classList.remove('drag-over');

  if (this === dragSrcEl) return;

  var targetId = parseInt(this.dataset.id);
  var sourceId = parseInt(dragSrcEl.dataset.id);

  var cards = Array.from(window.AppDom.subjectGroups.querySelectorAll('.hw-row'));
  var ids = cards.map(function (c) { return parseInt(c.dataset.id); });

  var srcIdx = ids.indexOf(sourceId);
  var tgtIdx = ids.indexOf(targetId);
  ids.splice(srcIdx, 1);
  if (srcIdx < tgtIdx) tgtIdx--;
  ids.splice(tgtIdx, 0, sourceId);

  var orders = ids.map(function (id, i) { return { id: id, sort_order: i }; });

  try {
    await window.reorderHomeworks(orders);
    window.AppState.homeworks.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
    window.renderHomeworks();
    window.showToast('排序已更新', 'info');
  } catch (err) {
    window.showToast('排序失败: ' + err.message, 'error');
    window.loadHomeworks();
  }
};

// ============ Touch Drag ============
var touchState = null;

window.setupTouchDrag = function (card) {
  var handle = card.querySelector('.drag-handle');
  if (!handle) return;
  handle.addEventListener('touchstart', window.onTouchStart, { passive: false });
};

window.onTouchStart = function (e) {
  var card = e.currentTarget.closest('.hw-row');
  if (!card) return;
  e.preventDefault();

  touchState = { el: card };
  card.classList.add('dragging');
  card.style.opacity = '0.5';

  document.addEventListener('touchmove', window.onTouchMove, { passive: false });
  document.addEventListener('touchend', window.onTouchEnd);
};

window.onTouchMove = function (e) {
  e.preventDefault();
  if (!touchState) return;

  var touchY = e.touches[0].clientY;
  var cards = Array.from(window.AppDom.subjectGroups.querySelectorAll('.hw-row:not(.dragging)'));

  var closest = null, closestDist = Infinity;
  cards.forEach(function (c) {
    var rect = c.getBoundingClientRect();
    var mid = rect.top + rect.height / 2;
    var dist = Math.abs(touchY - mid);
    if (dist < closestDist) { closestDist = dist; closest = c; }
  });

  cards.forEach(function (c) { c.classList.remove('drag-target'); });
  if (closest) closest.classList.add('drag-target');
};

window.onTouchEnd = async function () {
  document.removeEventListener('touchmove', window.onTouchMove);
  document.removeEventListener('touchend', window.onTouchEnd);
  if (!touchState) return;

  var src = touchState.el;
  src.classList.remove('dragging');
  src.style.opacity = '';

  var tgt = window.AppDom.subjectGroups.querySelector('.drag-target');
  window.AppDom.subjectGroups.querySelectorAll('.hw-row').forEach(function (c) { c.classList.remove('drag-target'); });

  if (tgt && tgt !== src) {
    var cards = Array.from(window.AppDom.subjectGroups.querySelectorAll('.hw-row'));
    var ids = cards.map(function (c) { return parseInt(c.dataset.id); });
    var si = ids.indexOf(parseInt(src.dataset.id));
    var ti = ids.indexOf(parseInt(tgt.dataset.id));
    ids.splice(si, 1);
    if (si < ti) ti--;
    ids.splice(ti, 0, parseInt(src.dataset.id));
    var orders = ids.map(function (id, i) { return { id: id, sort_order: i }; });
    try {
      await window.reorderHomeworks(orders);
      window.AppState.homeworks.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
      window.renderHomeworks();
    } catch (err) { console.error('触屏排序失败:', err); window.loadHomeworks(); }
  }
  touchState = null;
};
