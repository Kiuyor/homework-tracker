/**
 * test/frontend-focus.test.js — 模态焦点陷阱与展示态可见性的**行为**断言
 *
 * 为什么另起一个文件：verifier 的对抗变异证明，原先那几条"源码里有 window.trapFocus 就行"
 * 的写法级断言拦不住行为退化——把首尾两条夹取分支改成永不触发、把 restoreFocus 整段空转，
 * 全量 122 条照样全绿。这里改为**喂一副假 DOM、直接调用真函数、断言焦点落在谁身上**。
 *
 * utils.js 是唯一在加载期就碰 document 的前端脚本（`window.AppDom = { ... window.$('#dateLabel') }`），
 * 所以必须先把假 document 摆好再 require 它。假 DOM 只实现被用到的那几个方法，不引入 jsdom。
 *
 * 运行：npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ---------- 假 DOM ----------
const doc = {
  activeElement: null,
  querySelector() { return null; },
  getElementById() { return null; },
  contains() { return true; },
};
global.document = doc;
global.window = {};

function fakeButton(name) {
  const el = {
    name,
    offsetParent: {},          // 非 null = 视为可见
    focus() { doc.activeElement = el; },
    querySelectorAll() { return []; },
  };
  return el;
}

const overlay = {
  classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
  contains() { return true; },
};
global.window.AppDom = null; // utils.js 会覆盖它；先占位以免 require 顺序上的歧义

require('../public/js/utils.js');

// require 之后 AppDom 已被 utils.js 用假 document 建好（各字段为 null），按测试需要补上
const modal = {
  name: 'modal',
  offsetParent: {},
  focus() { doc.activeElement = modal; },
  contains(el) { return items.indexOf(el) !== -1 || el === modal; },
  querySelectorAll() { return items; },
};
let items = [];
function resetFocusDom() {
  doc.activeElement = null;
  items = [fakeButton('close'), fakeButton('content'), fakeButton('cancel'), fakeButton('submit')];
  window.AppDom = { modalEl: modal, modalOverlay: overlay };
  window.setThemePop = function () {};
  return items;
}

test('焦点陷阱：模态打开时焦点在模态自身，Shift+Tab 必须绕到末元素（不许退到遮罩背后）', () => {
  resetFocusDom();
  doc.activeElement = modal;
  let prevented = false;
  window.trapFocus({ shiftKey: true, preventDefault() { prevented = true; } }, modal);
  assert.equal(prevented, true, 'Shift+Tab 必须被拦住');
  assert.equal(doc.activeElement, items[3], '焦点应绕到末元素（保存），而不是逃到背后的顶栏');
});

test('焦点陷阱：Tab 在末元素上绕回首元素（正向也不许逃）', () => {
  resetFocusDom();
  doc.activeElement = items[3];
  let prevented = false;
  window.trapFocus({ shiftKey: false, preventDefault() { prevented = true; } }, modal);
  assert.equal(prevented, true);
  assert.equal(doc.activeElement, items[0]);
});

test('焦点陷阱：Shift+Tab 在首元素上绕回末元素', () => {
  resetFocusDom();
  doc.activeElement = items[0];
  window.trapFocus({ shiftKey: true, preventDefault() {} }, modal);
  assert.equal(doc.activeElement, items[3]);
});

test('焦点陷阱：焦点若已在模态之外，拉回首元素', () => {
  resetFocusDom();
  const outside = fakeButton('themeBtn');
  doc.activeElement = outside;
  modal.contains = function () { return false; }; // 模拟 active 不在模态内
  window.trapFocus({ shiftKey: false, preventDefault() {} }, modal);
  assert.equal(doc.activeElement, items[0], '模态开着时焦点不许留在背后');
});

test('焦点陷阱：模态内一个可聚焦都没有时，焦点留在模态上而不是漏出去', () => {
  resetFocusDom();
  items = [];
  doc.activeElement = fakeButton('outside');
  let prevented = false;
  window.trapFocus({ shiftKey: false, preventDefault() { prevented = true; } }, modal);
  assert.equal(prevented, true);
  assert.equal(doc.activeElement, modal);
});

test('焦点归还：存下来的钮还在就还给它', () => {
  resetFocusDom();
  const opener = fakeButton('addBtn');
  window.AppDom.modalOverlay.classList.add('hidden'); // 模态关着 → 这一次才记
  doc.activeElement = opener;
  window.rememberFocus();
  window.AppDom.modalOverlay.classList.remove('hidden'); // 模态开着（此时再进来不覆盖）
  assert.equal(window.rememberFocus === undefined, false);
  window.restoreFocus();
  assert.equal(doc.activeElement, opener, '关闭后焦点应回到打开它的那颗钮');
});

test('焦点归还：模态已经开着时再进来，不覆盖原记录（避免存到会被重建的钮）', () => {
  resetFocusDom();
  const opener = fakeButton('addBtn');
  window.AppDom.modalOverlay.classList.add('hidden');
  doc.activeElement = opener;
  window.rememberFocus();
  window.AppDom.modalOverlay.classList.remove('hidden');
  doc.activeElement = fakeButton('segOpt会被重建');
  window.rememberFocus(); // 这一次不该覆盖
  window.restoreFocus();
  assert.equal(doc.activeElement, opener, '第二次记住的钮在弹窗里，不该被当成归还目标');
});

test('焦点归还：原钮已不在 DOM 里时走兜底，绝不把焦点丢在 body 上', () => {
  resetFocusDom();
  const gone = { focus() { doc.activeElement = gone; }, offsetParent: {} };
  global.document.contains = function () { return false; }; // 已从 DOM 移除
  const fallback = fakeButton('addBtn');
  global.document.getElementById = function (id) { return id === 'addBtn' ? fallback : null; };
  window.AppDom.modalOverlay.classList.add('hidden');
  doc.activeElement = gone;
  window.rememberFocus();
  window.restoreFocus();
  assert.equal(doc.activeElement, fallback, '焦点要有去处，不能落在 body 上');
  global.document.contains = function () { return true; };
  global.document.getElementById = function () { return null; };
});

// ---------- 展示态专属件不许漏进编辑态（verifier 实测到的那处新回归） ----------
// 断言的是**可见性是否被正面表达**，不是"某个 class 挂没挂"——原先那对
// `.show-ctrl.hidden{display:none}` + `body.view-show .show-ctrl.hidden{display:flex}`
// 看着像一对开关，实际只说了"展示态要显示"，编辑态那半句从来没写过。
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const HTML_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const CSS_NO_COMMENT = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(source, selector) {
  const i = source.indexOf(selector);
  if (i === -1) return null;
  const open = source.indexOf('{', i);
  const close = source.indexOf('}', open);
  return open === -1 || close === -1 ? null : source.slice(open + 1, close);
}

test('.show-ctrl 在非展示态必须被正面关掉（否则编辑态漏出 A− 100% A+）', () => {
  const base = ruleBody(CSS_NO_COMMENT, '.show-ctrl {');
  assert.ok(base, '找不到 .show-ctrl 基础规则');
  assert.match(base, /display:\s*flex/, '.show-ctrl 基础可见（展示态直接用它）');
  const closed = ruleBody(CSS_NO_COMMENT, 'body:not(.view-show) .show-ctrl');
  assert.ok(closed,
    '缺 body:not(.view-show) .show-ctrl 规则：编辑态会漏出展示态专用控件');
  assert.match(closed, /display:\s*none/, '非展示态必须 display:none');
});

test('展示态专属件的开/关都写在样式表里（不依赖 HTML 上挂一个无效 class）', () => {
  // 正例两条：.show-hud 基础 display:none + body.view-show 打开；.expand-bar 基础可见 + view-show 里关
  const hudBase = ruleBody(CSS_NO_COMMENT, '.show-hud {');
  assert.match(hudBase, /display:\s*none/, '.show-hud 基础应当是收起的');
  assert.match(ruleBody(CSS_NO_COMMENT, 'body.view-show .show-hud'), /display:\s*flex/,
    '展示态要把 HUD 打开');
  const barBase = ruleBody(CSS_NO_COMMENT, '.expand-bar {');
  assert.match(barBase, /display:\s*flex/, '.expand-bar 基础可见');
  assert.match(ruleBody(CSS_NO_COMMENT, 'body.view-show .expand-bar'), /display:\s*none/,
    '展示态要把"显示顶栏"浮条收起');
});

test('index.html 不再把无效的 hidden 类挂在展示态控件上', () => {
  assert.doesNotMatch(HTML_SRC, /class="show-ctrl[^"]*hidden"/,
    '这个 hidden 从来没有生效过（被 body.view-show 那条规则盖掉），留着只会误导');
});
