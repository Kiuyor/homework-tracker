/**
 * test/frontend-state.test.js — 前端「日期语义」与「所属日快照」的行为测试
 *
 * 为什么要有这个文件：本轮审查发现前端四个缺陷（跨午夜视图冻结、编辑上下文日期漂移、
 * 模态缺无障碍语义、一条自我抵消的浮层规则）全部**一次性**通过了 106 条门禁。
 * 根因不是"漏写了一条断言"，是分母太小：`test/style-invariants.test.js` 有 51.8KB、
 * 逐字钉住 CSS 取值，而 `public/js/` 合计 46KB、只管着一条 deadline 纯函数链——
 * 逻辑最密的那几个文件（state.js / api.js / ui.js）一条行为断言都没有。
 *
 * 接缝沿用 test/deadline.test.js 已经验证过的那条：这些脚本是零构建的浏览器脚本，
 * 顶层只有 var/const 与函数声明、不在加载期触碰 DOM，所以给一个空 window 就能 require，
 * 不为它引入 jsdom。ui.js 里真正碰到 DOM 的入口（openAddModal）在测试里喂给它一副
 * 最小假 DOM —— 被测的是"快照了什么值"，不是"DOM 长什么样"。
 *
 * 运行：npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
require('../public/js/state.js');
require('../public/js/api.js');
require('../public/js/ui.js');

const state = window.AppState;

// 本地时区安全的日期构造：绝不用 "YYYY-MM-DD" 字符串走 Date 解析（那是 UTC 语义）。
function localDate(y, m, d, hh, mm, ss) {
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0);
}
function iso(d) { return window.formatDate(d); }

/** 把可注入时钟拨到某一天（见 state.js 顶层 window.now 的注释）。 */
function clockAt(date) {
  window.now = function () { return date.getTime(); };
}

/** syncToday 会经 goToday 落到 DOM 上；这两个出口在纯状态测试里换成分母。 */
function stubRenderSideEffects() {
  const calls = { display: 0, reload: 0 };
  window.updateDateDisplay = function () { calls.display++; };
  window.loadHomeworks = function () { calls.reload++; };
  return calls;
}

// ============ 日期工具 ============

test('formatDisplay 的今天/明天/昨天三个词按日历日给，不看时刻', () => {
  clockAt(localDate(2026, 9, 30, 23, 59));
  assert.match(window.formatDisplay(localDate(2026, 9, 30, 0, 1)), /^今天 /);
  assert.match(window.formatDisplay(localDate(2026, 10, 1, 0, 0)), /^明天 /);
  assert.match(window.formatDisplay(localDate(2026, 9, 29, 23, 59)), /^昨天 /);
  assert.match(window.formatDisplay(localDate(2026, 9, 28, 12, 0)), /^9月28日 /);
});

test('dayWord 与 formatDisplay 同源：翻到昨天时空墙文案不会仍说「今天」', () => {
  clockAt(localDate(2026, 9, 30, 10, 0));
  state.currentDate = localDate(2026, 9, 29);
  assert.equal(window.dayWord(state.currentDate), '昨天');
  // 上了墙的文案就长这样（ui.js 的整墙级空态）
  assert.equal(window.dayWord(state.currentDate) + '未布置作业', '昨天未布置作业');
});

test('changeDate 跨月进位，且落点是本地午夜而不是此刻', () => {
  clockAt(localDate(2026, 9, 30, 10, 23, 45));
  state.currentDate = localDate(2026, 9, 30, 10, 23, 45);
  const calls = stubRenderSideEffects();
  window.changeDate(1);
  assert.equal(iso(state.currentDate), '2026-10-01');
  assert.equal(state.currentDate.getHours(), 0, '翻页后的日期不该带着上一刻的时:分:秒');
  assert.equal(state.currentDate.getMinutes(), 0);
  assert.equal(calls.display, 1);
  assert.equal(calls.reload, 1);
});

test('goToday 落到「今天」的本地午夜，不管拨的是几点', () => {
  clockAt(localDate(2026, 10, 1, 23, 30));
  stubRenderSideEffects();
  window.goToday();
  assert.equal(iso(state.currentDate), '2026-10-01');
  assert.equal(state.currentDate.getHours(), 0);
});

// ============ 跨午夜回位（syncToday） ============

test('syncToday 第一次调用：基准落定，视图跟着今天走（多出的一拉被签名去重吃掉）', () => {
  // 首帧不是空转：它必须把"今天"这个基准记下来，并确认视图就在今天。
  // 视图本来就在今天时 goToday() 只是把 currentDate 重设成同一个午夜，
  // 顺带的那次 loadHomeworks 会被 api.js 的 renderSignature 判为"输入没变"直接跳过，
  // 所以 5 秒轮询之外的这次多余请求没有可观察代价。
  const calls = stubRenderSideEffects();
  clockAt(localDate(2026, 9, 30, 9, 0));
  state.todayStr = null;
  state.currentDate = localDate(2026, 9, 30);
  assert.equal(window.syncToday(), true, '首帧要确立基准并确认跟随');
  assert.equal(state.todayStr, '2026-09-30');
  assert.equal(iso(state.currentDate), '2026-09-30', '本来就在今天，视图不产生位移');
  assert.equal(calls.reload, 1, 'goToday 会拉一次；同数据的重复渲染由签名挡掉');
});

test('同一天重复调用是幂等的，不产生第二次重拉', () => {
  const calls = stubRenderSideEffects();
  clockAt(localDate(2026, 9, 30, 9, 0));
  state.todayStr = '2026-09-30';
  state.currentDate = localDate(2026, 9, 30);
  assert.equal(window.syncToday(), false);
  assert.equal(calls.reload, 0);
});

// （"视图停在别的日子、跨午夜后不被抢走"由上一条用例覆盖：
//   syncToday 判的是"视图是不是今天"，所以停在昨天与停在前天走的是同一条分支。）

test('跨午夜：用户特意翻到别的日子时不动视图，只更正「今天」的指代', () => {
  const calls = stubRenderSideEffects();
  state.todayStr = '2026-09-30';
  state.currentDate = localDate(2026, 9, 28); // 科代表把视图翻到了后天
  clockAt(localDate(2026, 10, 1, 0, 5));
  assert.equal(window.syncToday(), true);
  assert.equal(iso(state.currentDate), '2026-09-28', '别把正在看的这一天抢走');
  assert.equal(calls.display, 1, '"今天"这个词的指代变了，日期标签要重画');
  assert.equal(calls.reload, 0, '视图没动，不需要重拉');
});

test('首帧就跨了午夜（模块求值 → init 之间）：第一次校正必须把视图带回今天', () => {
  // verifier 的反例：currentDate 在 state.js 求值时定下（23:59:59 的 09-30），
  // 而第一次 syncToday() 要等 init() 跑到（已是 10-01）。若首帧无条件早退，
  // 这面墙会整天挂在昨天——此后每分钟都被"今天没变"的幂等判断挡住，再不修正。
  const calls = stubRenderSideEffects();
  state.todayStr = null;                       // 还没校过基准
  state.currentDate = localDate(2026, 9, 30);  // 模块求值时的"今天"
  clockAt(localDate(2026, 10, 1, 0, 0, 30));   // 第一次校正时已经跨过午夜
  assert.equal(window.syncToday(), true, '这一次必须真正校正，而不是只记基准');
  assert.equal(state.todayStr, '2026-10-01');
  assert.equal(iso(state.currentDate), '2026-10-01', '首帧跨午夜也要归位，否则整天挂在昨天');
  assert.equal(calls.reload, 1);
});

test('同一天重复调用不会把用户翻走的视图拽回来', () => {
  const calls = stubRenderSideEffects();
  state.todayStr = '2026-09-30';
  state.currentDate = localDate(2026, 9, 28); // 用户翻到后天
  clockAt(localDate(2026, 9, 30, 10, 0));     // 今天没变
  assert.equal(window.syncToday(), false);
  assert.equal(iso(state.currentDate), '2026-09-28', '每分钟一次的校正器不许把视图拽回');
  assert.equal(calls.reload, 0);
  assert.equal(calls.display, 0, '什么都没变，不该重画');
});

test('跨午夜：日期标签由「今天」改口径为具体日期（同一根日期上的相对词会漂）', () => {
  clockAt(localDate(2026, 9, 30, 23, 0));
  const pinned = localDate(2026, 9, 30);
  assert.match(window.formatDisplay(pinned), /^今天 /);
  clockAt(localDate(2026, 10, 1, 0, 1));
  assert.match(window.formatDisplay(pinned), /^昨天 /);
});

// ============ 模态的所属日快照（编辑上下文不许漂） ============

/** openAddModal 会碰这几处 DOM；被测的是它"快照了什么值"，所以只喂最小假 DOM。 */
function minimalDom() {
  return {
    modalOverlay: { classList: { remove() {}, add() {} } },
    modalTitle: { textContent: '' },
    editId: { value: '' },
    contentInput: { value: '', focus() {} },
    subjectSeg: null,
  };
}

/** 焦点三件套住在 utils.js（那个文件加载期就碰 document，Node 里 require 不动）。
 *  这里只把被测入口依赖它的两处换成空实现——被测的是所属日快照，不是焦点搬没搬。 */
function stubFocusAndRender() {
  window.rememberFocus = function () {};
  window.restoreFocus = function () {};
  window.focusModal = function () {};
  window.renderSubjectSeg = function () {};
}

test.beforeEach(() => {
  global.document = { getElementById: function () { return null; }, activeElement: null };
  window.AppDom = minimalDom();
  stubFocusAndRender();
});

test('新建作业：所属日取打开弹窗那一刻的日期，之后翻页不再影响这一条', () => {
  state.currentDate = localDate(2026, 9, 30);
  state.deadlineOwnerDate = null;
  state.deadlineDayOffset = 0;

  window.openAddModal();
  assert.equal(state.modalContextDate, '2026-09-30', '打开时就该把所属日快照下来');

  // 顶栏那条日期导航在模态开着时依然可点——这正是缺陷被造出来的路径
  state.currentDate = localDate(2026, 10, 5);
  assert.equal(state.modalContextDate, '2026-09-30', '翻页不许改写已经打开的这条的所属日');
});

test('编辑已有作业：所属日是这条作业自己那一天，与当前翻到哪天无关', () => {
  state.currentDate = localDate(2026, 10, 5); // 界面翻到了 10-05
  const hw = {
    id: 7, subject_id: 2, subject_name: '数学', content: '练习册 P25',
    date: '2026-09-28', deadline: null,
  };
  window.openEditModal(hw);

  assert.equal(state.deadlineOwnerDate, '2026-09-28');
  assert.equal(state.modalContextDate, '2026-09-28', '改一条 9-28 的作业不许把它算成 10-05 的');
  assert.equal(state.editingId, 7);
});

// 这一条是**源码级**的，理由要写清楚：main.js 的 submit 监听器绑在一个顶层 IIFE 里，
// 而那个 IIFE 先 `window.AppDom.prevDate.addEventListener(...)`，在 Node 里 require 就抛
// （utils.js 同理，加载期 `document.querySelector` 直接 ReferenceError）。
// 也就是说"提交载荷"这一段代码目前**没有可 require 的接缝**——它是本轮审查量出的
// 最大一块测试盲区（见交付报告 §5）。在把 payload 组装提成纯函数之前，这里只能盯写法。
test('提交时读的是所属日快照，不是 currentDate（退而求其次的写法级断言）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
  // 两个分支各认一次：编辑态 → deadlineOwnerDate；新建态 → modalContextDate
  assert.match(src, /state\.editingId[\s\S]{0,60}state\.deadlineOwnerDate/,
    '编辑态必须优先用这条作业自身的所属日（否则改正文会连带把作业挪到今天）');
  assert.match(src, /state\.modalContextDate\s*\|\|/, '新建态必须用打开弹窗那天的快照');
  // 反向：不许出现"直接拿 currentDate 当 payload 日期"的写法
  assert.doesNotMatch(src, /date:\s*window\.formatDate\(state\.currentDate\)/,
    'payload 的日期不许现读 currentDate——模态开着时日期导航依然可点');
});

// ============ 无障碍：这三处此前是"看得见、听不见" ============

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const UTILS_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'utils.js'), 'utf8');
const MAIN_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');

test('toast 是活的播报区：容器在初始 HTML 里就带 role=status + aria-live', () => {
  const el = HTML.match(/<div class="toast-container"[^>]*>/);
  assert.ok(el, '找不到 toast 容器');
  assert.match(el[0], /role="status"/, 'toast 是操作反馈，必须进辅助技术的播报区');
  assert.match(el[0], /aria-live="polite"/);
  // 只在插入时才补 aria-live 是无效写法：live region 必须先存在，才开始观察它内部的变化。
  assert.match(HTML, /id="toastContainer"/);
});

test('模态有对话框语义：role=dialog + aria-modal + 指向会变的那颗标题', () => {
  const el = HTML.match(/<div class="modal"[^>]*>/);
  assert.ok(el, '找不到模态元素');
  assert.match(el[0], /role="dialog"/, '模态元素缺 role="dialog"');
  assert.match(el[0], /aria-modal="true"/, '模态元素缺 aria-modal="true"');
  assert.match(el[0], /aria-labelledby="modalTitle"/, '模态要用那颗会变的标题当标签');
  assert.match(el[0], /tabindex="-1"/, '缺 tabindex=-1：打开时没有可承接焦点的落点');
});

test('模态的键盘出路：Tab 被夹住、Esc 关闭、关闭后焦点归还', () => {
  assert.match(UTILS_SRC, /window\.focusablesIn\s*=/, '可聚焦集合是一条可测的纯函数接缝');
  assert.match(UTILS_SRC, /window\.trapFocus\s*=/, 'Tab 循环必须有实现');
  assert.match(MAIN_SRC, /window\.trapFocus\(e,\s*window\.AppDom\.modalEl\)/, 'Tab 键要接到 trapFocus 上');
  assert.match(MAIN_SRC, /key === 'Escape'[\s\S]{0,60}window\.closeModal\(\)/, 'Esc 应当等同取消');
  assert.match(UTILS_SRC, /window\.restoreFocus\s*=/, '关闭后焦点要还给打开它的那颗钮');
});

test('打开模态不再抢焦点到输入框：软键盘不请自来会压掉半屏', () => {
  const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui.js'), 'utf8');
  assert.doesNotMatch(uiSrc, /dom\.contentInput\.focus\(\)/,
    'openAddModal/openEditModal 不许把焦点塞进 textarea——要打字时点一下即可');
  assert.match(uiSrc, /window\.focusModal\(\)/, '焦点应落在模态本身');
});
