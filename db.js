const { Pool } = require('pg');

let pool = null;
let initialized = false;

function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('未设置 POSTGRES_URL 环境变量');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/**
 * 查询多行
 */
async function all(queryText, ...params) {
  await ensureInit();
  const result = await getPool().query(queryText, params);
  return result.rows;
}

/**
 * 查询第一行
 */
async function get(queryText, ...params) {
  await ensureInit();
  const result = await getPool().query(queryText, params);
  return result.rows[0] || undefined;
}

/**
 * 执行写入
 */
async function run(queryText, ...params) {
  await ensureInit();
  const result = await getPool().query(queryText, params);
  if (/RETURNING\s/i.test(queryText) && result.rows.length > 0) {
    return { lastInsertRowid: result.rows[0].id, rows: result.rows };
  }
  return { lastInsertRowid: undefined, changes: result.rowCount };
}

/**
 * 事务包装
 */
function transaction(fn) {
  return async (...args) => {
    await ensureInit();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // 传递事务 client，使回调内的查询在同一连接上执行
      const result = await fn(client, ...args);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
}

async function initTables() {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);

    await client.query(`
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

    // updated_at 自动更新触发器
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    await client.query(`
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
  } finally {
    client.release();
  }
}

async function seedSubjects() {
  const { rows } = await getPool().query('SELECT COUNT(*)::int as cnt FROM subjects');
  if (rows[0].cnt === 0) {
    const subjects = [
      '语文', '数学', '英语', '物理', '化学',
      '生物', '历史', '政治', '地理', '其他'
    ];
    for (let i = 0; i < subjects.length; i++) {
      await getPool().query(
        'INSERT INTO subjects (name, sort_order) VALUES ($1, $2)',
        [subjects[i], i]
      );
    }
  }
}

async function ensureInit() {
  if (initialized) return;
  initialized = true; // 先标记，防止并发重复执行
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

// 暴露一个 sql.query 兼容接口（方便未来迁移）
const sql = {
  query: (text, params) => getPool().query(text, params),
};

module.exports = {
  sql,
  all,
  get,
  run,
  transaction,
  ensureInit,
};
