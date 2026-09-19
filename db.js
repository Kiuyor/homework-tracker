/**
 * db.js — SQLite 数据库封装（better-sqlite3）
 * 接口兼容原有 all/get/run/transaction，纯本地零配置
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'homework.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // 刻意不用 WAL：本项目是「单写入者（科代表录入）+ 非技术用户」场景，
    // WAL 会把已提交数据留在 homework.db-wal 里，导致「备份=复制 homework.db」
    // 这一说法失效（实测只复制单文件会丢数据）。DELETE 模式下事务提交后主库
    // 即最新，备份模型对老师才真正成立。详见 tools/build-portable.sh 的 README。
    db.pragma('journal_mode = DELETE');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
  }
  return db;
}

/**
 * 查询多行
 */
function all(queryText, ...params) {
  return getDb().prepare(queryText).all(...params);
}

/**
 * 查询第一行
 */
function get(queryText, ...params) {
  return getDb().prepare(queryText).get(...params);
}

/**
 * 执行写入，返回 { lastInsertRowid, changes }
 */
function run(queryText, ...params) {
  const stmt = getDb().prepare(queryText);
  const result = stmt.run(...params);
  return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
}

/**
 * 读 PRAGMA（迁移分支与测试要检查索引是否真的建上了）
 */
function pragma(what) {
  return getDb().pragma(what);
}

/**
 * 事务包装 — 传入回调 fn(db) 在同一事务内执行
 */
function transaction(fn) {
  const db = getDb();
  return (...args) => {
    const tx = db.transaction(() => fn(db, ...args));
    return tx();
  };
}

function initTables() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS homeworks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER REFERENCES subjects(id),
      content TEXT NOT NULL,
      date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, -- 列保留但已无读写方，见 docs/adr/0002
      note TEXT DEFAULT '', -- 列保留但已无读写方，见 docs/adr/0002
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // updated_at 自动更新触发器
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_homeworks_updated_at
    AFTER UPDATE ON homeworks
    FOR EACH ROW
    BEGIN
      UPDATE homeworks SET updated_at = datetime('now', 'localtime') WHERE id = OLD.id;
    END
  `);

  // 排序索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_homeworks_date_sort ON homeworks(date, sort_order)`);

  // 一科一条（ADR-0005）：把「同一天同一科目至多一条」从既成事实升级成真约束。
  // 先探一次重复再决定建不建——CREATE UNIQUE INDEX 在有重复的表上是抛错的，
  // 而"部署到一个历史脏库"不该让服务起不来。这里不合并不删除（迁移不猜意图），
  // 只把冲突点到哪一天哪一科打印出来，让运维能直接处理。
  // WHERE subject_id IS NOT NULL：SQLite 的唯一索引不把 NULL 视为相等，
  // 探测范围必须和索引真正拦的东西一致，否则历史「其他」条目会无故挡住建索引。
  const conflicts = db.prepare(`
    SELECT date, subject_id, COUNT(*) AS n FROM homeworks
    WHERE subject_id IS NOT NULL
    GROUP BY date, subject_id HAVING COUNT(*) > 1
    ORDER BY date, subject_id
  `).all();

  if (conflicts.length) {
    const nameOf = db.prepare('SELECT name FROM subjects WHERE id = ?');
    console.log(`⚠️ 唯一索引 idx_homeworks_date_subject 未建立：库里有 ${conflicts.length} 组「同日同科多条」`);
    for (const c of conflicts) {
      const row = nameOf.get(c.subject_id);
      console.log(`   ${c.date} · ${row ? row.name : '科目#' + c.subject_id} · ${c.n} 条`);
    }
  } else {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_homeworks_date_subject
      ON homeworks(date, subject_id)
    `);
  }

  // 迁移：添加 deadline 列
  try {
    db.exec(`ALTER TABLE homeworks ADD COLUMN deadline TEXT DEFAULT NULL`);
  } catch (e) {
    // 列已存在，忽略
  }
}

// 主科优先表（ADR-0006）：展示态那六个格子就是这份名单。它同时是
// 「db.js 要保证存在的行」与「api/index.js 排序的依据」——两份会漂移的副本
// 正是这张票点名最大的设计风险，所以清单只在这里写一次。
const SUBJECT_PRIORITY = ['语文', '数学', '英语', '物理', '化学', '生物'];

// 每次启动都补齐，而不是只在空表时种一次：库里恰好缺「语文」那一行，墙上就永远少一格，
// 而"格子=科目、左上永远是语文"是展示态的既定形状（工单 024）。
// INSERT OR IGNORE 只可能新增、绝不碰已有行——用户自建的科目与改过的名字不受影响。
function seedSubjects() {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO subjects (name) VALUES (?)');
  db.transaction(() => {
    for (const name of SUBJECT_PRIORITY) insert.run(name);
  })();
}

function ensureInit() {
  if (db) return;
  try {
    initTables();
    seedSubjects();
    console.log('✅ SQLite 数据库初始化完成 →', DB_PATH);
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    throw err;
  }
}

/**
 * 关闭数据库连接并释放文件句柄
 * （测试清理 / 优雅关闭时使用；Windows 上不关闭会导致临时文件无法删除）
 */
function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { all, get, run, pragma, transaction, ensureInit, close, SUBJECT_PRIORITY };
