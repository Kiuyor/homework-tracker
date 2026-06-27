const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'homework.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables();
    seedSubjects();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS homeworks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER,
      content TEXT NOT NULL,
      date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );
  `);

  // 迁移：给旧表增加 sort_order 列（如果不存在）
  try {
    db.exec('ALTER TABLE homeworks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // 只忽略"列已存在"错误，其他错误仍需抛出
    if (!e.message.includes('duplicate column')) {
      throw e;
    }
  }
}

function seedSubjects() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM subjects').get();
  if (count.cnt === 0) {
    const subjects = [
      '语文', '数学', '英语', '物理', '化学',
      '生物', '历史', '政治', '地理', '其他'
    ];
    const insert = db.prepare('INSERT INTO subjects (name, sort_order) VALUES (?, ?)');
    subjects.forEach((name, i) => insert.run(name, i));
  }
}

module.exports = { getDb };
