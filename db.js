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
    db.pragma('journal_mode = WAL');
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
      completed INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
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

  // 迁移：添加 deadline 列
  try {
    db.exec(`ALTER TABLE homeworks ADD COLUMN deadline TEXT DEFAULT NULL`);
  } catch (e) {
    // 列已存在，忽略
  }
}

function seedSubjects() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM subjects').get();
  if (existing.cnt > 0) return; // 已有科目数据，跳过种子写入，避免覆盖用户自定义

  const subjects = ['语文', '数学', '英语', '物理', '化学', '生物'];
  const insert = db.prepare('INSERT OR REPLACE INTO subjects (id, name) VALUES (?, ?)');

  db.transaction(() => {
    subjects.forEach((name, i) => insert.run(i + 1, name));
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

module.exports = { all, get, run, transaction, ensureInit, close };
