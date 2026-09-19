/**
 * test/deadline.test.js — 截止时间「当天/次日」解析的纯函数接缝
 *
 * ui.js 是零构建的浏览器脚本，但它顶层只有 var 与函数声明、不在加载期触碰 DOM，
 * 所以给它一个空 window 就能在 Node 里 require。这正是 spec 第 5 节点名的第二条接缝，
 * 不为此引入 jsdom。
 *
 * 运行：npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../public/js/ui.js');

const parse = window.parseDeadlineInput;
const show = window.formatDeadline;
const offsetOf = window.deadlineDayOffsetOf;

function today() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

test('当天（显式 0 与缺省等价）', () => {
  assert.equal(parse('14:30', '2026-09-18'), '2026-09-18 14:30:00');
  assert.equal(parse('14:30', '2026-09-18', 0), '2026-09-18 14:30:00');
});

test('次日落在所属日 +1（故事 19：周一录、周二早交）', () => {
  assert.equal(parse('7:30', '2026-09-18', 1), '2026-09-19 07:30:00');
});

test('次日以该条目自身的所属日为基准，不是以今天为基准（故事 20）', () => {
  // 今天的真实日期由 new Date() 决定；若解析器偷用今天，结果里绝不会是 09-11
  assert.equal(parse('7:30', '2026-09-10', 1), '2026-09-11 07:30:00');
  assert.equal(parse('7:30', '2026-12-24', 1), '2026-12-25 07:30:00');
});

test('次日跨月/跨年由 Date 进位，不产出 2026-09-31 这种日子', () => {
  assert.equal(parse('23:59', '2026-09-30', 1), '2026-10-01 23:59:00');
  assert.equal(parse('0:05', '2026-12-31', 1), '2027-01-01 00:05:00');
  assert.equal(parse('8:00', '2028-02-28', 1), '2028-02-29 08:00:00'); // 闰年
});

test('时刻零填充到 HH:MM:SS（后端 DEADLINE_RE 要求两位）', () => {
  assert.equal(parse('8:5', '2026-09-18', 1), '2026-09-19 08:05:00');
});

test('全角冒号与混排日期同样接受', () => {
  assert.equal(parse('14：30', '2026-09-18'), '2026-09-18 14:30:00');
  assert.equal(parse('2026-09-20 14:30', '2026-09-18', 1), '2026-09-19 14:30:00');
});

test('非法时刻返回 null，不产出可落库的假日期', () => {
  assert.equal(parse('', '2026-09-18', 1), null);
  assert.equal(parse('abc', '2026-09-18', 1), null);
  assert.equal(parse('25:00', '2026-09-18', 1), null);
  assert.equal(parse('10:90', '2026-09-18', 1), null);
});

test('基准日缺失或非法时退回今天，不抛异常', () => {
  assert.equal(parse('14:30', '', 0), today() + ' 14:30:00');
  assert.equal(parse('14:30', null, 0), today() + ' 14:30:00');
  assert.equal(parse('14:30', 'not-a-date', 0), today() + ' 14:30:00');
});

test('基准日缺失 + 次日 = 今天 +1，仍与所属日次日同一条路径', () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  assert.equal(parse('14:30', 'not-a-date', 1), tomorrow + ' 14:30:00');
});

// ============ 展示层：墙上这一小段到底写成什么 ============

test('当天截止只写时刻，不加任何日期前缀', () => {
  assert.equal(show('2026-09-18 14:30:00', '2026-09-18'), '14:30');
});

test('次日截止写成明确的次日语义，不是一个已经过去的时刻（故事 18）', () => {
  assert.equal(show('2026-09-19 07:30:00', '2026-09-18'), '次日 07:30');
  assert.equal(show('2027-01-01 07:30:00', '2026-12-31'), '次日 07:30'); // 跨年也算次日
});

test('再往后的日期退化成 MM-DD，两档表达不了就如实标出来', () => {
  assert.equal(show('2026-09-20 07:30:00', '2026-09-18'), '09-20 07:30');
  assert.equal(show('2026-09-17 07:30:00', '2026-09-18'), '09-17 07:30'); // 早于所属日
});

test('没有死线就是空串，行内不显示时间那一小段', () => {
  assert.equal(show('', '2026-09-18'), '');
  assert.equal(show(null, '2026-09-18'), '');
  assert.equal(show('乱码不是日期', '2026-09-18'), ''); // 绝不把原文插进 innerHTML
});

// ============ 编辑回显：重开模态时「当天/次日」还原到哪一档 ============

test('回显以条目自身的所属日为基准，昨天/明天的条目都不受影响（故事 20）', () => {
  assert.equal(offsetOf('2026-09-10 14:30:00', '2026-09-10'), 0);
  assert.equal(offsetOf('2026-09-11 07:30:00', '2026-09-10'), 1);
  assert.equal(offsetOf('2026-07-01 07:30:00', '2026-09-10'), null); // 两档都装不下
  assert.equal(offsetOf(null, '2026-09-10'), 0); // 没有死线 → 缺省落在「当天」
});

test('解析 → 回显是一条闭环：次日录进去，重开还是次日（不回归"只改正文挪日期"）', () => {
  for (const owner of ['2026-09-18', '2026-12-31', '2028-02-28']) {
    for (const off of [0, 1]) {
      const stored = parse('7:30', owner, off);
      assert.equal(offsetOf(stored, owner), off, `owner=${owner} off=${off} 存的是 ${stored}`);
      assert.equal(show(stored, owner), off ? '次日 07:30' : '07:30');
    }
  }
});
