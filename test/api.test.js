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
