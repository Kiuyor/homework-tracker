// ============ API Calls ============
let _apiReqId = 0;

window.api = async function (method, path, body) {
  const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    let errMsg = '请求失败 (' + res.status + ')';
    try { const json = await res.json(); errMsg = json.error || errMsg; } catch (e) {}
    // status 挂在异常上：调用方据此区分"后端说了这句话"与"请求根本没回来"，
    // 前者原样上屏（409 要点名该去改哪一条），后者才自己造一句。
    const err = new Error(errMsg); err.status = res.status; throw err;
  }
  const json = await res.json();
  if (!json.success) { const err = new Error(json.error || '请求失败'); err.status = res.status; throw err; }
  return json.data;
};

// 渲染签名：只有「影响显示的输入」全部相同，才允许跳过重渲染。
// 必须包含 date / viewMode —— 切换日期、切换展示模式都会经过 loadHomeworks，
// 漏掉任何一项都会造成「该重渲染却跳过」。
// （原先还有第三段 filterSubjectId，随科目筛选一起删掉了。）
function renderSignature(date, state, list) {
  var parts = [date, state.viewMode];
  var subs = state.subjects || [];
  for (var i = 0; i < subs.length; i++) parts.push(subs[i].id + ':' + subs[i].name);
  parts.push('|');
  for (var j = 0; j < list.length; j++) {
    var h = list[j];
    parts.push([h.id, h.subject_id, h.content, h.date, h.deadline, h.sort_order].join('\u0001'));
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
