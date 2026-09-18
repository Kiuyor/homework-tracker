// ============ API Calls ============
let _apiReqId = 0;

window.api = async function (method, path, body) {
  const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    let errMsg = '请求失败 (' + res.status + ')';
    try { const json = await res.json(); errMsg = json.error || errMsg; } catch (e) {}
    throw new Error(errMsg);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '请求失败');
  return json.data;
};

// 渲染签名：只有「影响显示的输入」全部相同，才允许跳过重渲染。
// 必须包含 date / viewMode / filterSubjectId —— 切换日期、切换展示模式、
// 切换科目筛选都会经过 loadHomeworks，漏掉任何一项都会造成「该重渲染却跳过」。
function renderSignature(date, state, list) {
  var parts = [date, state.viewMode, String(state.filterSubjectId == null ? '' : state.filterSubjectId)];
  var subs = state.subjects || [];
  for (var i = 0; i < subs.length; i++) parts.push(subs[i].id + ':' + subs[i].name);
  parts.push('|');
  for (var j = 0; j < list.length; j++) {
    var h = list[j];
    parts.push([h.id, h.subject_id, h.content, h.date, h.completed, h.note, h.deadline, h.sort_order].join('\u0001'));
  }
  return parts.join('\u0002');
}

window.loadHomeworks = async function () {
  const date = window.formatDate(window.AppState.currentDate);
  const reqId = ++_apiReqId;
  try {
    const homeworks = await window.api('GET', '/api/homeworks?date=' + date);
    if (reqId !== _apiReqId) return;
    const state = window.AppState;
    const sig = renderSignature(date, state, homeworks);
    // 输入与上次渲染完全一致 → 整段跳过：不写 DOM、不跑 fitShowDisplay。
    // 展示模式 5 秒轮询下，这一步把绝大多数轮询变成零 DOM 操作：不再丢滚动
    // 位置与文本选择，不再每 5 秒重放一次 CSS 动画，也不再反复触发强制同步布局。
    if (sig === state.lastRenderSig) {
      if (window.markRefreshResult) window.markRefreshResult(true);
      return;
    }
    state.lastRenderSig = sig;
    state.homeworks = homeworks;
    window.renderHomeworks();
    // 任何一次成功都熄灭离线角标（ui.js 提供，加载顺序上晚于本文件，故做存在性判断）
    if (window.markRefreshResult) window.markRefreshResult(true);
  } catch (err) {
    // 失败累计到阈值才亮角标；异常仍向上抛，调用方原有提示逻辑不变
    if (window.markRefreshResult) window.markRefreshResult(false);
    throw err;
  }
};

window.loadSubjects = async function () {
  window.AppState.subjects = await window.api('GET', '/api/subjects');
};

window.addHomework = async function (data) {
  return await window.api('POST', '/api/homeworks', data);
};

window.updateHomework = async function (id, data) {
  return await window.api('PUT', '/api/homeworks/' + id, data);
};

window.deleteHomework = async function (id) {
  return await window.api('DELETE', '/api/homeworks/' + id);
};

window.toggleHomeworkDone = async function (id) {
  // 先取当前状态再翻转
  var hw = window.AppState.homeworks.find(function (h) { return h.id === id; });
  var next = hw ? (hw.completed ? 0 : 1) : 1;
  return await window.api('PUT', '/api/homeworks/' + id, { completed: next });
};

window.reorderHomeworks = async function (orders) {
  return await window.api('PUT', '/api/homeworks/reorder', { orders: orders });
};

window.batchUpdateHomeworks = async function (ids, data) {
  return await window.api('PUT', '/api/homeworks/batch', { ids: ids, data: data });
};
