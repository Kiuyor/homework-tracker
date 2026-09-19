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
db.ensureInit(); // 建表 + 补齐六个主科行（工单 024：常驻格子的保证在数据层，每次启动都补）

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

// 「给我一条合法作业」这个前置不能固定用同一个 (date, subject)：一科一条（019）之后
// 第二次调用就是 409，而调用方关心的是别的字段。每次往后挪一天，用 2032 这段
// 与其余用例都无关的日期空间。调用方显式给了 date 时尊重它——那时撞车就是要测撞车。
let draftSeq = 0;
function freshDraftDate() {
  return new Date(Date.UTC(2032, 0, 1 + (++draftSeq))).toISOString().slice(0, 10);
}

async function createHomework(extra) {
  const res = await req('POST', '/api/homeworks', Object.assign({
    content: '基础作业', date: freshDraftDate(), subject_id: 1,
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
  const res = await req('POST', '/api/homeworks', { content: 'x', date: '2026-02-28', subject_id: 1 });
  assert.equal(res.status, 201);
});

test('POST deadline 合法(YYYY-MM-DD HH:MM:SS) → 201', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x', date: '2026-01-02', subject_id: 1, deadline: '2026-01-02 14:30:00',
  });
  assert.equal(res.status, 201);
});

test('POST deadline 为空(null/省略) → 201', async () => {
  const res = await req('POST', '/api/homeworks', { content: 'x', date: '2026-01-03', subject_id: 1 });
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

// 一科一条（ADR-0005/0006）：拖拽排序与 reorder 路由整体废除。
// M1/M4 两组 reorder 校验测试随之删除——它们守的是一台已经不存在的机器。
// 这里换成一条 404：路由必须真的没了，而不是"还在但没人调用"。

test('reorder 路由已删除 → 404', async () => {
  const res = await req('PUT', '/api/homeworks/reorder', { orders: [] });
  assert.equal(res.status, 404);
});

// 墙上顺序 = 写死的主科优先表，与录入顺序、与 sort_order 都无关（故事 8、27）。
// 自证方式：故意按「乱序」录入，期望值按主科优先表写死。
// 若把常量表里英语和物理对调，这两条断言应当失败——它们是有效断言而不是永真。

const MAIN_SIX = ['语文', '数学', '英语', '物理', '化学', '生物']; // 与 api 侧常量同一顺序

async function namesOn(date) {
  const res = await req('GET', `/api/homeworks?date=${date}`);
  const body = await res.json();
  return body.data.map((h) => h.subject_name);
}

test('故事8 GET 顺序 = 主科优先表，与录入顺序解耦', async () => {
  const D = '2026-07-01';
  // 录入顺序：生物 → 数学 → 语文 → 化学 → 英语 → 物理
  for (const id of [6, 2, 1, 5, 3, 4]) {
    assert.equal((await req('POST', '/api/homeworks', {
      content: '顺序测试', date: D, subject_id: id,
    })).status, 201);
  }
  assert.deepEqual(await namesOn(D), MAIN_SIX);
});

test('故事27 表外科目追加在六主科之后，按建立先后排', async () => {
  const D = '2026-07-02';
  // 表外科目先建：历史（先）→ 政治（后）；主科故意最后才录
  for (const name of ['历史', '政治']) {
    assert.equal((await req('POST', '/api/homeworks', {
      content: '表外测试', date: D, subject_name: name,
    })).status, 201);
  }
  for (const id of [3, 1]) {
    assert.equal((await req('POST', '/api/homeworks', {
      content: '主科测试', date: D, subject_id: id,
    })).status, 201);
  }
  assert.deepEqual(await namesOn(D), ['语文', '英语', '历史', '政治']);
});

test('故事8 sort_order 不再参与排序（字段保留、无读者）', async () => {
  const D = '2026-07-03';
  for (const id of [2, 1]) {
    await req('POST', '/api/homeworks', { content: 'sort_order 测试', date: D, subject_id: id });
  }
  const before = await namesOn(D);
  assert.deepEqual(before, ['语文', '数学']);
  // 把数学的 sort_order 压到语文之前：若查询仍读它，顺序会翻转
  db.run('UPDATE homeworks SET sort_order = -100 WHERE subject_id = 2 AND date = ?', D);
  assert.deepEqual(await namesOn(D), ['语文', '数学']);
});

// 墙上格子的顺序其实来自 GET /api/subjects（ui.js 按 state.subjects 分组），
// 所以主科优先表必须在这条接缝上同样成立——只改 homeworks 那条查询墙不会动。

test('故事8/24 GET /api/subjects 也按主科优先表排，表外科目在表尾', async () => {
  const res = await req('GET', '/api/subjects');
  const names = (await res.json()).data.map((s) => s.name);
  const mainIdx = names.map((n) => MAIN_SIX.indexOf(n)).filter((i) => i >= 0);
  assert.deepEqual(names.filter((n) => MAIN_SIX.includes(n)), MAIN_SIX);
  // 主科必须占据列表开头，且它们的相对位置严格等于优先表
  assert.deepEqual(mainIdx, mainIdx.map((_, i) => i));
  // 表外科目（历史/政治由上面的用例建立）按 id 递增排在表尾
  const extras = names.filter((n) => !MAIN_SIX.includes(n));
  assert.deepEqual(extras, ['历史', '政治']);
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
    content: 'x', date: '2026-01-04', subject_id: 1, deadline: '2026-01-04 23:59:59',
  });
  assert.equal(res.status, 201);
});

// ============ 减法：作业墙不回答「哪条已交」（docs/adr/0002） ============
// completed 列原地保留，但两条写入口都必须拒绝它——不兼容、不静默丢弃。

test('02 POST 带 completed → 400 且文案指明原因', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x', date: '2026-01-01', completed: 1,
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /completed/);
});

test('02 PUT 带 completed → 400，整条请求不做部分写入', async () => {
  const hw = await createHomework();
  db.run('UPDATE homeworks SET completed = 1 WHERE id = ?', hw.id);
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { content: '被拒的改动', completed: 0 });
  assert.equal(res.status, 400);
  const row = db.get('SELECT content, completed FROM homeworks WHERE id = ?', hw.id);
  assert.equal(row.content, '基础作业');
  assert.equal(row.completed, 1);
});

test('02 GET /api/homeworks 响应里不再有 completed', async () => {
  const hw = await createHomework({ date: '2026-05-05' });
  const res = await req('GET', '/api/homeworks?date=2026-05-05');
  const row = (await res.json()).data.find((h) => h.id === hw.id);
  assert.equal(row.completed, undefined);
});

// 03：备注与批量入口一并移除。批量路由整个不存在（落到 /api/homeworks/:id，
// 因 id='batch' 查无此作业而 404）——测试盯住的是「不再有 2xx」这件事。

test('03 PUT /api/homeworks/batch → 404（路由已移除）', async () => {
  const res = await req('PUT', '/api/homeworks/batch', { ids: [1], data: { content: 'x' } });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).success, false);
});

test('03 POST 带 note → 400 且文案指明原因', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: 'x', date: '2026-01-01', note: '想写备注',
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /note/);
});

test('03 PUT 带 note → 400，整条请求不做部分写入', async () => {
  const hw = await createHomework();
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { content: '被拒的改动', note: 'n' });
  assert.equal(res.status, 400);
  assert.equal(db.get('SELECT content FROM homeworks WHERE id = ?', hw.id).content, '基础作业');
});

test('03 GET /api/homeworks 响应里不再有 note', async () => {
  const hw = await createHomework({ date: '2026-05-06' });
  const res = await req('GET', '/api/homeworks?date=2026-05-06');
  const row = (await res.json()).data.find((h) => h.id === hw.id);
  assert.equal(row.note, undefined);
});

// ============ 09：「次日」只是一层日期语义，库里仍是完整 datetime ============
// deadline 列本就存 "YYYY-MM-DD HH:MM:SS"（db.js 的幂等 ALTER），次日不落在这位的
// 日期部分上就没有任何跨日能力。这里把 ui.js 的解析器接进来，验的是整条链路：
// 解析器产出的字符串能过 API 校验、原样落库、且不会回头挪动所属日。

test('09 次日死线落库后日期部分是所属日 +1，所属日自身不变', async () => {
  global.window = {};
  require('../public/js/ui.js');
  const deadline = window.parseDeadlineInput('7:30', '2026-09-18', 1);
  assert.equal(deadline, '2026-09-19 07:30:00');

  const res = await req('POST', '/api/homeworks', {
    content: '周一布置的数学作业', date: '2026-09-18', subject_id: 1, deadline,
  });
  assert.equal(res.status, 201);
  const hw = (await res.json()).data;
  assert.equal(hw.date, '2026-09-18');
  assert.equal(hw.deadline, '2026-09-19 07:30:00');
  assert.equal(db.get('SELECT deadline FROM homeworks WHERE id = ?', hw.id).deadline,
    '2026-09-19 07:30:00');
});

test('09 死线留空落库为 null，PUT 传 null 能把已有死线清掉', async () => {
  const hw = await createHomework({ date: '2026-09-16', deadline: '2026-09-17 07:30:00' });
  assert.equal(hw.deadline, '2026-09-17 07:30:00');

  const res = await req('PUT', `/api/homeworks/${hw.id}`, { deadline: null });
  assert.equal(res.status, 200);
  assert.equal(db.get('SELECT deadline FROM homeworks WHERE id = ?', hw.id).deadline, null);
});

// ============ 10：科目是开放集，敲新名自动建科 ============
// 六科种子只是起点，不是上限。全站没有科目管理页，所以「建科」这件事
// 只能寄生在录作业这一步上——同一条 HTTP 接缝，同临时库，无需新基座。

async function subjectRows(name) {
  return db.all('SELECT id, name FROM subjects WHERE name = ?', name);
}

test('10 POST 只给 subject_name → 自动建科并挂到该科目下', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: '第一课课后练习', date: '2026-06-01', subject_name: '政治',
  });
  assert.equal(res.status, 201);
  const hw = (await res.json()).data;
  assert.equal(hw.subject_name, '政治');
  assert.ok(hw.subject_id > 0);
  assert.equal((await subjectRows('政治')).length, 1);
});

test('10 再录一条同名科目 → 不多出科目；换日期可再录，同日期已被 019 拦住', async () => {
  const first = (await subjectRows('政治'))[0];

  // 换一天：同名必须复用同一行科目，而不是又建一个「政治」分组。
  const another = await req('POST', '/api/homeworks', {
    content: '第二课课后练习', date: '2026-06-07', subject_name: '政治',
  });
  assert.equal(another.status, 201);
  const hw = (await another.json()).data;
  assert.equal(hw.subject_id, first.id, '同名科目必须复用同一行');
  assert.equal((await subjectRows('政治')).length, 1);

  // 同一天再来一条同名的：019 的唯一索引拦下，且拦的时候也不会顺手多建一行科目。
  const dup = await req('POST', '/api/homeworks', {
    content: '同日第二条', date: '2026-06-01', subject_name: '政治',
  });
  assert.equal(dup.status, 409);
  assert.equal((await subjectRows('政治')).length, 1, '409 之后也不该多出一行科目');

  const list = (await (await req('GET', '/api/homeworks?date=2026-06-01')).json()).data;
  assert.equal(list.filter((h) => h.subject_id === first.id).length, 1,
    '一科一条之后「两条同组」这个形状不再存在');
});

test('10 新科目出现在 GET /api/subjects 里（下拉不用刷新页面就能看到）', async () => {
  const list = (await (await req('GET', '/api/subjects')).json()).data;
  assert.ok(list.some((s) => s.name === '政治'));
});

test('10 科目名两端空白被吃掉，" 政治 " 不另起一个科目', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: '带空白的同名', date: '2026-06-02', subject_name: '  政治  ',
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.subject_name, '政治');
  assert.equal((await subjectRows('政治')).length, 1);
});

test('10 subject_id 与 subject_name 两者皆缺 → 400', async () => {
  const res = await req('POST', '/api/homeworks', { content: '没科目', date: '2026-06-03' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /必须属于一个科目/);
});

test('21 POST 显式 subject_id:null 且无名字 → 400（与 PUT 同一条路，不再归入「其他」）', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: '想挂到「其他」下', date: '2026-06-08', subject_id: null,
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /必须属于一个科目/);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM homeworks WHERE date = '2026-06-08'").n, 0,
    '被拒的写入不能留下任何一行，包括 subject_id 为 NULL 的');
});

test('10 两者同时给且矛盾 → 400，不静默取其一', async () => {
  const zg = (await subjectRows('政治'))[0];
  const res = await req('POST', '/api/homeworks', {
    content: '矛盾', date: '2026-06-03', subject_id: 1, subject_name: '政治',
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /subject_id|subject_name/);
  // 矛盾请求被整条拒掉：既没写作业，也没顺手把「政治」改名或再建一行
  assert.equal((await subjectRows('政治')).length, 1);
  assert.equal((await subjectRows('政治'))[0].id, zg.id);
});

test('10 两者同时给且指向同一科目 → 放行', async () => {
  const zg = (await subjectRows('政治'))[0];
  const res = await req('POST', '/api/homeworks', {
    content: '一致', date: '2026-06-03', subject_id: zg.id, subject_name: '政治',
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.subject_id, zg.id);
});

test('10 科目名超长 → 400', async () => {
  const res = await req('POST', '/api/homeworks', {
    content: '长名', date: '2026-06-04', subject_name: '科'.repeat(51),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /科目/);
});

test('10 PUT 改成新科目名 → 同样自动建科并改挂', async () => {
  const hw = await createHomework({ date: '2026-06-05' });
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { subject_name: '地理' });
  assert.equal(res.status, 200);
  const data = (await res.json()).data;
  assert.equal(data.subject_name, '地理');
  assert.equal((await subjectRows('地理')).length, 1);
});

test('21 PUT 显式清空科目 → 400（「其他」这条路连同分组一起废除）', async () => {
  const created = await req('POST', '/api/homeworks', {
    content: '不许改成没科目', date: '2026-06-06', subject_name: '历史',
  });
  const hw = (await created.json()).data;
  assert.equal(hw.subject_name, '历史');

  const res = await req('PUT', `/api/homeworks/${hw.id}`, { subject_id: null });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /必须属于一个科目/);
  // 被拒之后不许留下"半改"的条目：科目与正文都得还是原样（同 02 的不做部分写入）
  const row = db.get('SELECT subject_id, content FROM homeworks WHERE id = ?', hw.id);
  assert.equal(row.subject_id, hw.subject_id);
  assert.equal(row.content, '不许改成没科目');
});

// ============ 19：(date, subject_id) 唯一索引 —— 一科一条是数据库级真约束（ADR-0005） ============
// 本段全部用 2031-xx 的日期，与前面各段的日期空间隔开：唯一索引一旦建上，
// 复用同一 (date, subject) 就不再是"多插一条"而是 409，测试之间必须先互相避让。

test('故事1 同 (date, subject) 第二次 POST → 409，且原来那条逐字节未变', async () => {
  const first = await req('POST', '/api/homeworks', {
    content: '第一条原文，标点是，全角的；换行\n还在', date: '2031-01-01', subject_id: 1,
  });
  assert.equal(first.status, 201);
  const created = (await first.json()).data;

  const second = await req('POST', '/api/homeworks', {
    content: '第二条想挤进来', date: '2031-01-01', subject_id: 1,
  });
  assert.equal(second.status, 409, '同日同科第二条必须被数据库拦住，不是静默多出一条');
  assert.match((await second.json()).error, /语文/, '报错要点名是哪一科');

  const rows = await db.all(
    'SELECT id, content FROM homeworks WHERE date = ? AND subject_id = ? ORDER BY id', '2031-01-01', 1);
  assert.equal(rows.length, 1, '防"409 但其实覆盖了"：库里仍然只有一条');
  assert.equal(rows[0].id, created.id);
  assert.equal(rows[0].content, '第一条原文，标点是，全角的；换行\n还在');
});

test('故事2 同一天 6 个不同科目各一条 → 全部成功（粒度不是 date）', async () => {
  for (let i = 1; i <= 6; i++) {
    const res = await req('POST', '/api/homeworks', {
      content: '科目' + i, date: '2031-01-02', subject_id: i,
    });
    assert.equal(res.status, 201, 'subject_id=' + i + ' 应能建，同日不同科不冲突');
  }
  assert.equal((await db.all('SELECT id FROM homeworks WHERE date = ?', '2031-01-02')).length, 6);
});

test('故事3 相邻两天同一科目各一条 → 都成功（粒度不是 subject_id）', async () => {
  for (const d of ['2031-01-03', '2031-01-04']) {
    const res = await req('POST', '/api/homeworks', { content: '语文', date: d, subject_id: 1 });
    assert.equal(res.status, 201, d + ' 应能建');
  }
});

test('故事4 PUT 把某条改成"当天已有作业的另一科" → 409', async () => {
  await req('POST', '/api/homeworks', { content: '数学那条', date: '2031-01-05', subject_id: 2 });
  const hw = (await (await req('POST', '/api/homeworks', {
    content: '语文那条', date: '2031-01-05', subject_id: 1,
  })).json()).data;

  const res = await req('PUT', `/api/homeworks/${hw.id}`, { subject_id: 2 });
  assert.equal(res.status, 409, '改挂到当天已占用的科目 = 制造第二条，必须拦');
  const after = await db.all('SELECT subject_id FROM homeworks WHERE date = ? ORDER BY subject_id', '2031-01-05');
  assert.deepEqual(after.map(r => r.subject_id), [1, 2], '两条还在，谁也没被改走');
});

test('故事5 PUT 只改正文/死线不提交 subject_id → 200', async () => {
  const hw = (await (await req('POST', '/api/homeworks', {
    content: '只改内容', date: '2031-01-06', subject_id: 3,
  })).json()).data;
  const res = await req('PUT', `/api/homeworks/${hw.id}`, {
    content: '改过了', deadline: '2031-01-07 07:30:00',
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.content, '改过了');
});

test('故事5 PUT 把 subject_id 显式改回它自己原本的科目 → 200（SQLite 不排除自身，这条最容易写成假失败）', async () => {
  const hw = (await (await req('POST', '/api/homeworks', {
    content: '原地改回本科', date: '2031-01-08', subject_id: 4,
  })).json()).data;
  const res = await req('PUT', `/api/homeworks/${hw.id}`, { subject_id: 4, content: '正文也顺手改了' });
  assert.equal(res.status, 200, '同 id 更新回原科目不是冲突');
  assert.equal((await res.json()).data.content, '正文也顺手改了');
});

test('19 索引真的建上了：PRAGMA index_list 里那条 unique = 1', () => {
  const list = db.pragma ? db.pragma('index_list(\'homeworks\')') : null;
  assert.ok(list, 'db.js 要导出 pragma（迁移分支与这条断言都要读索引清单）');
  const hit = list.find(r => r.name === 'idx_homeworks_date_subject');
  assert.ok(hit, '唯一索引 idx_homeworks_date_subject 应存在');
  assert.equal(hit.unique, 1);
  assert.equal(hit.origin, 'c'); // CREATE UNIQUE INDEX 而非主键/外键附带
});

test('故事9 ensureInit 连调两次不抛（幂等：close 后重跑建表与建索引）', () => {
  db.close();
  assert.doesNotThrow(() => db.ensureInit());
  assert.doesNotThrow(() => { db.close(); db.ensureInit(); });
});

test('故事10 库里真有历史重复时：日志点名冲突、索引建不上、ensureInit 不抛', () => {
  const dbKey = require.resolve('../db');
  const savedEntry = require.cache[dbKey];
  const savedPath = process.env.DB_PATH;
  const conflictDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-dup-db-'));
  const conflictFile = path.join(conflictDir, 'dup.db');
  const logs = [];
  const realLog = console.log;

  try {
    // 先让真实代码路径把 schema 建全（含唯一索引），再手动拆掉索引塞进重复——
    // 不在测试里抄一份 DDL，避免 schema 漂移把这条测试变成假绿。
    process.env.DB_PATH = conflictFile;
    delete require.cache[dbKey];
    const db2 = require(dbKey);
    db2.ensureInit();
    assert.equal(db2.get(
      "SELECT COUNT(*) AS c FROM pragma_index_list('homeworks') WHERE name = 'idx_homeworks_date_subject'"
    ).c, 1, '前置：干净库上索引应已建成');
    db2.close();

    const raw = new (require('better-sqlite3'))(conflictFile);
    raw.prepare('DROP INDEX idx_homeworks_date_subject').run();
    raw.prepare('DELETE FROM homeworks WHERE date = ?').run('2031-02-01');
    raw.prepare('INSERT INTO homeworks (subject_id, content, date) VALUES (?, ?, ?)')
      .run(1, '重复甲', '2031-02-01');
    raw.prepare('INSERT INTO homeworks (subject_id, content, date) VALUES (?, ?, ?)')
      .run(1, '重复乙', '2031-02-01');
    raw.close();

    delete require.cache[dbKey];
    const db3 = require(dbKey);
    console.log = (...a) => logs.push(a.join(' '));
    assert.doesNotThrow(() => db3.ensureInit(), '发现重复不能崩——服务要照常起');
    console.log = realLog;

    const text = logs.join('\n');
    assert.match(text, /2031-02-01/, '日志要说清是哪一天');
    assert.match(text, /语文/, '日志要说清是哪一科');
    assert.equal(db3.get(
      "SELECT COUNT(*) AS c FROM pragma_index_list('homeworks') WHERE name = 'idx_homeworks_date_subject'"
    ).c, 0, '有重复时索引建不上（而不是硬建失败）');
    assert.equal(db3.get(
      "SELECT COUNT(*) AS c FROM homeworks WHERE date = '2031-02-01'").c, 2, '不合并不删除');
    db3.close();
  } finally {
    console.log = realLog;
    process.env.DB_PATH = savedPath;
    if (savedEntry) require.cache[dbKey] = savedEntry;
    else delete require.cache[dbKey];
    fs.rmSync(conflictDir, { recursive: true, force: true });
  }
});

// ============ 24：六格常驻的保证在数据层（ADR-0006） ============
// 墙上格子的形状 = 主科优先表。它过去只靠"空库时恰好种过一次"成立——
// 库里缺哪一行，那格就永久消失。现在每次启动补齐，所以这条测的是"补齐"而不是"种子"。
// 排在最后：它会改动共享测试库里的科目行。

test('24 缺的主科行下次启动被补回，且表外科目仍追加在六科之后', async () => {
  const yuwen = db.get("SELECT id FROM subjects WHERE name = '语文'");
  assert.ok(yuwen, '前置：启动时六个主科应已备齐');

  db.run('DELETE FROM homeworks WHERE subject_id = ?', yuwen.id); // 外键开着，先清引用
  db.run('DELETE FROM subjects WHERE id = ?', yuwen.id);
  db.run('INSERT INTO subjects (name) VALUES (?)', '天文');
  assert.equal(db.get("SELECT COUNT(*) AS c FROM subjects WHERE name = '语文'").c, 0, '人为做出"缺语文"的库');

  db.close();
  db.ensureInit(); // 模拟下一次启动

  assert.equal(db.get("SELECT COUNT(*) AS c FROM subjects WHERE name = '语文'").c, 1, '缺的那格要长回来，且只一行');

  const res = await req('GET', '/api/subjects');
  assert.equal(res.status, 200);
  const names = (await res.json()).data.map(s => s.name);
  assert.deepEqual(names.slice(0, 6), ['语文', '数学', '英语', '物理', '化学', '生物'],
    '墙上顺序由主科优先表决定，与 id/建立先后无关');
  // 这份共享库里已有别的用例建出来的表外科目，所以只断言"主科不外流、表外科目都在六科之后"
  assert.ok(names.slice(6).includes('天文'), '表外科目追加在表尾');
  assert.deepEqual(names.slice(6).filter(n => names.slice(0, 6).includes(n)), [], '主科不许散落到表尾');

  // 再启动一次不应长出第二份（INSERT OR IGNORE 而非 INSERT OR REPLACE：不碰已有行）。
  // 用前后相等而不是固定值：这份共享库里还有别的用例建的科目，具体几条不是本断言关心的。
  const countBefore = db.get('SELECT COUNT(*) AS c FROM subjects').c;
  db.close();
  db.ensureInit();
  assert.equal(db.get('SELECT COUNT(*) AS c FROM subjects').c, countBefore, '重复启动不增行');
  assert.equal(db.get("SELECT COUNT(*) AS c FROM subjects WHERE name = '语文'").c, 1, '补齐不重复');
  assert.ok(db.get("SELECT id FROM subjects WHERE name = '天文'"), '用户自建科目不受补齐影响');
});
