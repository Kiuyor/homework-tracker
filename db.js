const { sql } = require('@vercel/postgres');

let initialized = false;

// 将 SQLite 的 ? 占位符转换为 PostgreSQL 的 $1, $2 格式
function convertParams(queryText, params) {
  let index = 0;
  const text = queryText.replace(/\?/g, () => `$${++index}`);
  return { text, params: params || [] };
}

/**
 * 查询多行（兼容 better-sqlite3 的 .all() 语义）
 */
async function all(queryText, ...params) {
  await ensureInit();
  const { text, params: values } = convertParams(queryText, params);
  const { rows } = await sql.query(text, values);
  return rows;
}

/**
 * 查询第一行（兼容 better-sqlite3 的 .get() 语义）
 */
async function get(queryText, ...params) {
  await ensureInit();
  const { text, params: values } = convertParams(queryText, params);
  const { rows } = await sql.query(text, values);
  return rows[0] || undefined;
}

/**
 * 执行写入（兼容 better-sqlite3 的 .run() 语义）
 */
async function run(queryText, ...params) {
  await ensureInit();
  const { text, params: values } = convertParams(queryText, params);
  const result = await sql.query(text, values);
  // 如果有 RETURNING 子句，返回插入的行
  if (/RETURNING\s/i.test(text) && result.rows.length > 0) {
    return { lastInsertRowid: result.rows[0].id, rows: result.rows };
  }
  return { lastInsertRowid: undefined, changes: result.rowCount };
}

/**
 * 事务包装（兼容 better-sqlite3 的 .transaction() 语义）
 */
function transaction(fn) {
  return async (...args) => {
    await ensureInit();
    await sql.query('BEGIN');
    try {
      const result = await fn(...args);
      await sql.query('COMMIT');
      return result;
    } catch (err) {
      await sql.query('ROLLBACK');
      throw err;
    }
  };
}

async function initTables() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS homeworks (
      id SERIAL PRIMARY KEY,
      subject_id INTEGER REFERENCES subjects(id),
      content TEXT NOT NULL,
      date DATE NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建触发器函数和触发器，使得 updated_at 自动更新
  try {
    await sql.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    await sql.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'update_homeworks_updated_at'
        ) THEN
          CREATE TRIGGER update_homeworks_updated_at
            BEFORE UPDATE ON homeworks
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END;
      $$
    `);
  } catch (e) {
    // 触发器已存在则忽略
  }
}

async function seedSubjects() {
  const { rows } = await sql.query('SELECT COUNT(*)::int as cnt FROM subjects');
  if (rows[0].cnt === 0) {
    const subjects = [
      '语文', '数学', '英语', '物理', '化学',
      '生物', '历史', '政治', '地理', '其他'
    ];
    for (let i = 0; i < subjects.length; i++) {
      await sql.query(
        'INSERT INTO subjects (name, sort_order) VALUES ($1, $2)',
        [subjects[i], i]
      );
    }
  }
}

async function ensureInit() {
  if (initialized) return;
  initialized = true; // 先标记已初始化，防止并发重复执行
  try {
    await initTables();
    await seedSubjects();
    console.log('✅ 数据库表初始化完成');
  } catch (err) {
    initialized = false; // 失败时重置，允许重试
    console.error('❌ 数据库初始化失败:', err.message);
    throw err;
  }
}

module.exports = {
  sql,         // 底层 @vercel/postgres sql 标签函数
  all,         // 查询多行 → Promise<rows[]>
  get,         // 查询单行 → Promise<row|undefined>
  run,         // 写入操作 → Promise<{lastInsertRowid, changes}>
  transaction, // 事务包装 → (fn) => async (...args) => result
  ensureInit,  // 手动触发初始化
};
