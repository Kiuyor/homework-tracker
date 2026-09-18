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

window.loadHomeworks = async function () {
  const date = window.formatDate(window.AppState.currentDate);
  const reqId = ++_apiReqId;
  try {
    const homeworks = await window.api('GET', '/api/homeworks?date=' + date);
    if (reqId !== _apiReqId) return;
    window.AppState.homeworks = homeworks;
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
