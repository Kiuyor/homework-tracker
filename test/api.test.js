/**
 * test/api.test.js — 后端 API 输入校验回归测试
 *
 * 零第三方依赖：Node 内置 node:test + node:assert + global fetch。
 * 使用独立临时数据库（DB_PATH 指向临时目录），绝不触碰真实 homework.db。
 *
 * 运行：npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// —— 关键：在 require 数据库模块之前把 DB_PATH 指向临时文件 ——
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-api-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const app = require('../api/index');
const db = require('../db');
db.ensureInit(); // 建表 + 种子科目（空库时写入 6 个科目，id 1..6）

let server;
let base;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  if (server) server.close();
  db.close(); // 释放 sqlite 文件句柄，Windows 上否则无法删除临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function req(method, url, body) {
  return fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createHomework(extra) {
  const res = await req('POST', '/api/homeworks', Object.assign({
    content: '基础作业', date: '2026-01-01', subject_id: 1,
  }, extra));
  assert.equal(res.status, 201, '前置条件：应能创建一条合法作业');
  return (await res.json()).data;
}

// ============ 正例：确保新校验不误伤合法请求 ============

test('POST 合法作业 → 201', async () => {
  const res = await req('POST', '/api/homeworks', { content: 'x', date: '2026-01-01', subject_id: 1 });
  assert.equal(res.status, 201);
});

test('POST date 合法(YYYY-MM-DD) → 201', async () => {
  const res = await req('POST', '/api/homeworks', { content: 'x', date: '2026-02-28' });
  assert.equal(res.status, 201);
});

test('POST deadline 合法(YYYY-MM-DD HH:MM:SS) → 201', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x', date: '2026-01-01', deadline: '2026-01-02 14:30:00',
  });
  assert.equal(res.status, 201);
});

test('POST deadline 为空(null/省略) → 201', async () => {
  const res = await req('POST', '/api/homeworks', { content: 'x', date: '2026-01-01' });
  assert.equal(res.status, 201);
});

test('PUT subject_id 改为存在的科目 → 200', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { subject_id: 2 });
  assert.equal(res.status, 200);
});

test('PUT deadline=null → 200', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { deadline: null });
  assert.equal(res.status, 200);
});

test('batch 合法 note 更新 → 200', async () => {
  const hw = await createHomework();
  const res = await req('PUT', '/api/homeworks/batch', { ids: [hw.id], data: { note: 'ok' } });
  assert.equal(res.status, 200);
});

test('reorder 合法 orders → 200', async () => {
  const hw = await createHomework();
  const res = await req('PUT', '/api/homeworks/reorder', { orders: [{ id: hw.id, sort_order: 5 }] });
  assert.equal(res.status, 200);
});

// ============ 反例：修复前应失败（RED 目标） ============

test('PUT subject_id 指向不存在的科目 → 400（而非 500）', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { subject_id: 999 });
  assert.equal(res.status, 400);
});

test('PUT content 超长(>5000) → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { content: 'x'.repeat(6000) });
  assert.equal(res.status, 400);
});

test('PUT note 超长(>2000) → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { note: 'n'.repeat(2500) });
  assert.equal(res.status, 400);
});

test('POST date 非法格式 → 400', async () => {
  const res = await req('POST', '/api/homeworks', { content: 'x', date: 'not-a-date' });
  assert.equal(res.status, 400);
});

test('POST date 缺省 → 400', async () => {
  const res = await req('POST', '/api/homeworks', { content: 'x' });
  assert.equal(res.status, 400);
});

test('POST deadline 非法格式 → 400', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x', date: '2026-01-01', deadline: 'NOT-A-DATE',
  });
  assert.equal(res.status, 400);
});

test('POST content 超长(>5000) → 400', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x'.repeat(6000), date: '2026-01-01',
  });
  assert.equal(res.status, 400);
});

test('batch content 超长(>5000) → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', '/api/homeworks/batch', {
    ids: [hw.id], data: { content: 'x'.repeat(6000) },
  });
  assert.equal(res.status, 400);
});

test('batch ids 含非数字元素 → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', '/api/homeworks/batch', {
    ids: [hw.id, 'abc'], data: { note: 'n' },
  });
  assert.equal(res.status, 400);
});

test('batch ids 含非整数(1.5) → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', '/api/homeworks/batch', {
    ids: [hw.id, 1.5], data: { note: 'n' },
  });
  assert.equal(res.status, 400);
});

test('PUT :id 不存在 → 404', async () => {
  const res = await req('PUT', '/api/homeworks/999999', { content: 'x' });
  assert.equal(res.status, 404);
});

// ============ 已知缺陷回归（fix/known-defects） ============

// H1：PUT 必须校验 date —— 修复前非法日期返回 200 并落库，
// 后果是该作业因前端只按合法 YYYY-MM-DD 查询而永久不可见、无法编辑删除。

test('H1 PUT date 非法格式 → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { date: 'not-a-date' });
  assert.equal(res.status, 400);
});

test('H1 PUT date 不存在的日期(2026-13-45) → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { date: '2026-13-45' });
  assert.equal(res.status, 400);
});

test('H1 PUT date 合法 → 200 且真的改了（不误伤）', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { date: '2026-03-05' });
  assert.equal(res.status, 200);
  assert.equal(db.get('SELECT date FROM homeworks WHERE id = ?', hw.id).date, '2026-03-05');
});

// M1：reorder 必须限定在同一日期内 —— 修复前无 date 条件，
// 拖拽今天的作业会打乱其它日期中同序号作业的相对顺序。

test('M1 reorder 跨日期 id → 400', async () => {
  const a = await createHomework({ date: '2026-04-01' });
  const b = await createHomework({ date: '2026-04-02' });
  const res = await req('PUT', '/api/homeworks/reorder', {
    orders: [{ id: a.id, sort_order: 0 }, { id: b.id, sort_order: 0 }],
  });
  assert.equal(res.status, 400);
});

test('M1 reorder 同一日期 → 200（不误伤）', async () => {
  const a = await createHomework({ date: '2026-04-03' });
  const b = await createHomework({ date: '2026-04-03' });
  const res = await req('PUT', '/api/homeworks/reorder', {
    orders: [{ id: a.id, sort_order: 0 }, { id: b.id, sort_order: 1 }],
  });
  assert.equal(res.status, 200);
});

// M4：reorder 元素必须是正整数且真实存在 —— 修复前 id:1.5 或不存在的 id
// 都返回 200「排序已更新」，前端把失败当成功。

test('M4 reorder id 非整数(1.5) → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', '/api/homeworks/reorder', {
    orders: [{ id: hw.id, sort_order: 0 }, { id: 1.5, sort_order: 1 }],
  });
  assert.equal(res.status, 400);
});

test('M4 reorder 含不存在的 id → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', '/api/homeworks/reorder', {
    orders: [{ id: hw.id, sort_order: 0 }, { id: 999999, sort_order: 1 }],
  });
  assert.equal(res.status, 400);
});

// M3：batch 应能把科目清空为 null，与单个 PUT 行为对齐 —— 修复前返回 400。

test('M3 batch subject_id=null → 200 且科目被清空', async () => {
  const hw = await createHomework({ subject_id: 1 });
  const res = await req('PUT', '/api/homeworks/batch', { ids: [hw.id], data: { subject_id: null } });
  assert.equal(res.status, 200);
  assert.equal(db.get('SELECT subject_id FROM homeworks WHERE id = ?', hw.id).subject_id, null);
});

// L3：/api 下任意层级都应返回 JSON 404 —— 修复前 /api/* 只匹配一层，
// 更深路径落到 SPA 兜底返回 index.html，前端 res.json() 解析报错。

test('L3 GET /api/不存在/更深 → 404 且为 JSON', async () => {
  const res = await req('GET', '/api/nope/deeper');
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
});

// L4：deadline 时分秒必须合法 —— 修复前只校验位数，99:99:99 能落库。

test('L4 POST deadline 99:99:99 → 400', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x', date: '2026-01-01', deadline: '2026-01-01 99:99:99',
  });
  assert.equal(res.status, 400);
});

test('L4 PUT deadline 99:99:99 → 400', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { deadline: '2026-01-01 99:99:99' });
  assert.equal(res.status, 400);
});

test('L4 POST deadline 合法边界(23:59:59) → 201（不误伤）', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x', date: '2026-01-01', deadline: '2026-01-01 23:59:59',
  });
  assert.equal(res.status, 201);
});
