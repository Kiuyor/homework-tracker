/**
 * test/backup.test.js — 备份工具（tools/backup.js）的行为测试
 *
 * 用与 api.test.js 相同的 DB_PATH 隔离模式：临时目录里建一个源库，
 * 以子进程跑 `node tools/backup.js <目标路径>`（正是用户会敲的那条命令行），
 * 然后验证备份文件存在、能被 sqlite 打开、结构完整（表 + 六科种子都在）。
 *
 * node --test 每个测试文件独立进程，DB_PATH 不会与别的测试文件串味。
 *
 * 运行：npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

// —— 在任何 db 相关模块被加载前把 DB_PATH 指向临时文件 ——
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-backup-test-'));
const dbFile = path.join(tmpDir, 'source.db');
const destFile = path.join(tmpDir, 'backup.db');

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('backup 工具：目标文件存在、可被 sqlite 打开、表与六科种子完整', () => {
  const root = path.join(__dirname, '..');
  // 子进程跑真命令行：exit code 非 0 会直接让本测试红，不必再手写断言包一层
  execFileSync(process.execPath, [path.join(root, 'tools', 'backup.js'), destFile], {
    env: { ...process.env, DB_PATH: dbFile },
    stdio: 'pipe',
  });

  assert.ok(fs.existsSync(destFile), '备份文件必须存在');
  assert.ok(fs.statSync(destFile).size > 0, '备份文件不能是空的');

  const Database = require('better-sqlite3');
  const raw = new Database(destFile, { readonly: true });
  try {
    const tables = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('homeworks','subjects')"
    ).all().map((r) => r.name);
    assert.deepEqual(tables.sort(), ['homeworks', 'subjects'], '两张业务表都要在备份里');

    const names = raw.prepare('SELECT name FROM subjects').all().map((r) => r.name);
    for (const n of ['语文', '数学', '英语', '物理', '化学', '生物']) {
      assert.ok(names.includes(n), '六科种子必须在备份里: ' + n);
    }
  } finally {
    raw.close();
  }
});
