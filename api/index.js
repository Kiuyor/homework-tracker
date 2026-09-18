const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db');

const app = express();

// ============ 输入校验常量与辅助 ============
const MAX_CONTENT_LEN = 5000;
const MAX_NOTE_LEN = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEADLINE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// 校验 "YYYY-MM-DD"：格式合法且日期真实存在（拒绝 2026-13-45 之类）
function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// 校验 "YYYY-MM-DD HH:MM:SS"：日期真实存在，且时分秒在合法范围内
// （修复前只校验位数，导致 "2026-01-01 99:99:99" 能落库）
function isValidDeadline(s) {
  if (typeof s !== 'string' || !DEADLINE_RE.test(s)) return false;
  if (!isValidDate(s.slice(0, 10))) return false;
  const [h, m, sec] = s.slice(11).split(':').map(Number);
  return h <= 23 && m <= 59 && sec <= 59;
}

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// CORS — 生产环境限制 origin
const corsOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : true);
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============ API Routes ============

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/subjects
app.get('/api/subjects', (req, res) => {
  try {
    const subjects = db.all('SELECT id, name FROM subjects ORDER BY sort_order');
    res.json({ success: true, data: subjects });
  } catch (err) {
    console.error('获取科目失败:', err);
    res.status(500).json({ success: false, error: '获取科目失败' });
  }
});

// GET /api/homeworks
app.get('/api/homeworks', (req, res) => {
  try {
    const { date } = req.query;

    let sql = `
      SELECT h.id, h.content, h.date, h.completed, h.note,
             h.deadline, h.sort_order, h.subject_id, h.created_at, h.updated_at,
             COALESCE(s.name, '') AS subject_name
      FROM homeworks h
      LEFT JOIN subjects s ON h.subject_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      sql += ' AND h.date = ?';
      params.push(date);
    }

    sql += ' ORDER BY h.sort_order ASC, h.created_at ASC';

    const homeworks = db.all(sql, ...params);
    res.json({ success: true, data: homeworks });
  } catch (err) {
    console.error('获取作业失败:', err);
    res.status(500).json({ success: false, error: '获取作业失败' });
  }
});

// POST /api/homeworks
app.post('/api/homeworks', (req, res) => {
  try {
    const { subject_id, content, date, note, deadline } = req.body;

    if (!content || !date) {
      return res.status(400).json({ success: false, error: '内容和日期为必填项' });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({ success: false, error: '日期格式必须为 YYYY-MM-DD' });
    }

    if (deadline !== undefined && deadline !== null && deadline !== '' && !isValidDeadline(deadline)) {
      return res.status(400).json({ success: false, error: 'deadline 格式必须为 YYYY-MM-DD HH:MM:SS' });
    }

    if (subject_id) {
      const subjExists = db.get('SELECT id FROM subjects WHERE id = ?', subject_id);
      if (!subjExists) {
        return res.status(400).json({ success: false, error: '所选科目不存在' });
      }
    }

    if (content.length > MAX_CONTENT_LEN) {
      return res.status(400).json({ success: false, error: '作业内容不能超过5000字' });
    }
    if (note && note.length > MAX_NOTE_LEN) {
      return res.status(400).json({ success: false, error: '备注不能超过2000字' });
    }

    const insertHomework = db.transaction((d, subjId, content, date, note, deadline) => {
      const maxRow = d.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM homeworks WHERE date = ?'
      ).get(date);
      const nextSort = parseInt(maxRow.next) || 0;

      const result = d.prepare(
        'INSERT INTO homeworks (subject_id, content, date, note, deadline, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(subjId || null, content, date, note || '', deadline || null, nextSort);

      const newRow = d.prepare(
        'SELECT id, subject_id, content, date, completed, note, deadline, sort_order, created_at, updated_at FROM homeworks WHERE id = ?'
      ).get(result.lastInsertRowid);

      let subjectName = '';
      if (newRow.subject_id) {
        const subj = d.prepare('SELECT name FROM subjects WHERE id = ?').get(newRow.subject_id);
        subjectName = subj ? subj.name : '';
      }

      return { ...newRow, subject_name: subjectName };
    });

    const homework = insertHomework(subject_id, content, date, note, deadline);
    res.status(201).json({ success: true, data: homework });
  } catch (err) {
    console.error('添加作业失败:', err);
    res.status(500).json({ success: false, error: '添加作业失败' });
  }
});

// PUT /api/homeworks/reorder
app.put('/api/homeworks/reorder', (req, res) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders 必须为数组' });
    }
    // 空数组：保持原有的幂等无操作语义
    if (orders.length === 0) {
      return res.json({ success: true, message: '排序已更新' });
    }
    // 元素校验：每个必须是 {id: 正整数, sort_order: 整数}
    for (const item of orders) {
      if (!item || !Number.isInteger(item.id) || item.id <= 0 || !Number.isInteger(item.sort_order)) {
        return res.status(400).json({ success: false, error: 'orders 元素必须为 {id: 正整数, sort_order: 整数}' });
      }
    }

    // id 必须真实存在 —— 否则会返回 200「排序已更新」，让前端把失败当成功
    const ids = orders.map((item) => item.id);
    const placeholders = ids.map(() => '?').join(', ');
    const found = db.all(`SELECT id, date FROM homeworks WHERE id IN (${placeholders})`, ...ids);
    if (found.length !== ids.length) {
      return res.status(400).json({ success: false, error: 'orders 中存在不存在的作业 id' });
    }

    // 排序只在同一日期内有意义：跨日期会打乱其它日期中同序号作业的相对顺序
    if (new Set(found.map((row) => row.date)).size > 1) {
      return res.status(400).json({ success: false, error: 'orders 只能包含同一日期的作业' });
    }

    const batch = db.transaction((d, items) => {
      const stmt = d.prepare('UPDATE homeworks SET sort_order = ? WHERE id = ?');
      for (const item of items) {
        stmt.run(item.sort_order, item.id);
      }
    });
    batch(orders);

    res.json({ success: true, message: '排序已更新' });
  } catch (err) {
    console.error('重排序失败:', err);
    res.status(500).json({ success: false, error: '重排序失败' });
  }
});

// PUT /api/homeworks/batch
app.put('/api/homeworks/batch', (req, res) => {
  try {
    const { ids, data } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids 必须为非空数组' });
    }
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, error: 'data 必须为对象' });
    }

    // ids 元素必须为正整数
    if (ids.some((id) => typeof id !== 'number' || !Number.isInteger(id) || id <= 0)) {
      return res.status(400).json({ success: false, error: 'ids 元素必须为正整数' });
    }

    const updates = [];
    const params = [];

    if (data.subject_id !== undefined) {
      // null = 显式清空科目（与单个 PUT 的语义对齐）；只有非 null 才校验存在性
      if (data.subject_id !== null) {
        const subjExists = db.get('SELECT id FROM subjects WHERE id = ?', data.subject_id);
        if (!subjExists) {
          return res.status(400).json({ success: false, error: '所选科目不存在' });
        }
      }
      updates.push('subject_id = ?'); params.push(data.subject_id);
    }
    if (data.note !== undefined) {
      if (typeof data.note !== 'string' || data.note.length > MAX_NOTE_LEN) {
        return res.status(400).json({ success: false, error: '备注不能超过2000字' });
      }
      updates.push('note = ?'); params.push(data.note);
    }
    if (data.content !== undefined) {
      if (typeof data.content !== 'string' || data.content.length > MAX_CONTENT_LEN) {
        return res.status(400).json({ success: false, error: '作业内容不能超过5000字' });
      }
      updates.push('content = ?'); params.push(data.content);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    const placeholders = ids.map(() => '?').join(', ');
    params.push(...ids);
    const result = db.run(
      `UPDATE homeworks SET ${updates.join(', ')} WHERE id IN (${placeholders})`,
      ...params
    );

    res.json({ success: true, message: `已更新 ${result.changes} 条作业` });
  } catch (err) {
    console.error('批量更新失败:', err);
    res.status(500).json({ success: false, error: '批量更新失败' });
  }
});

// PUT /api/homeworks/:id
app.put('/api/homeworks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { content, date, completed, note, sort_order, subject_id, deadline } = req.body;

    const existing = db.get('SELECT id FROM homeworks WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '作业不存在' });
    }

    const updates = [];
    const params = [];

    if (content !== undefined) {
      if (typeof content !== 'string' || content.length > MAX_CONTENT_LEN) {
        return res.status(400).json({ success: false, error: '作业内容不能超过5000字' });
      }
      updates.push('content = ?'); params.push(content);
    }
    if (date !== undefined) {
      // 修复前这里不校验，非法日期会落库 → 该作业因前端只按合法 YYYY-MM-DD
      // 查询而永久不可见、无法编辑或删除
      if (!isValidDate(date)) {
        return res.status(400).json({ success: false, error: '日期格式必须为 YYYY-MM-DD' });
      }
      updates.push('date = ?'); params.push(date);
    }
    if (completed !== undefined) {
      // completed 必须为 0 或 1（布尔/数字）
      const c = completed === true || completed === 1 ? 1 : (completed === false || completed === 0 ? 0 : null);
      if (c === null) {
        return res.status(400).json({ success: false, error: 'completed 必须为 0 或 1' });
      }
      updates.push('completed = ?'); params.push(c);
    }
    if (note !== undefined) {
      if (typeof note !== 'string' || note.length > MAX_NOTE_LEN) {
        return res.status(400).json({ success: false, error: '备注不能超过2000字' });
      }
      updates.push('note = ?'); params.push(note);
    }
    if (deadline !== undefined)  {
      // deadline 格式校验：要么 null/空，要么 "YYYY-MM-DD HH:MM:SS"
      if (deadline === null || deadline === '') {
        updates.push('deadline = ?'); params.push(null);
      } else if (isValidDeadline(deadline)) {
        updates.push('deadline = ?'); params.push(deadline);
      } else {
        return res.status(400).json({ success: false, error: 'deadline 格式必须为 YYYY-MM-DD HH:MM:SS' });
      }
    }
    if (subject_id !== undefined) {
      if (subject_id !== null) {
        const subjExists = db.get('SELECT id FROM subjects WHERE id = ?', subject_id);
        if (!subjExists) {
          return res.status(400).json({ success: false, error: '所选科目不存在' });
        }
      }
      updates.push('subject_id = ?'); params.push(subject_id);
    }
    if (sort_order !== undefined){
      if (typeof sort_order !== 'number' || !Number.isInteger(sort_order)) {
        return res.status(400).json({ success: false, error: 'sort_order 必须为整数' });
      }
      updates.push('sort_order = ?'); params.push(sort_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    params.push(id);
    db.run(`UPDATE homeworks SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const homework = db.get(`
      SELECT h.*, COALESCE(s.name, '') AS subject_name
      FROM homeworks h
      LEFT JOIN subjects s ON h.subject_id = s.id
      WHERE h.id = ?
    `, id);

    res.json({ success: true, data: homework });
  } catch (err) {
    console.error('修改作业失败:', err);
    res.status(500).json({ success: false, error: '修改作业失败' });
  }
});

// DELETE /api/homeworks/:id
app.delete('/api/homeworks/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.get('SELECT id FROM homeworks WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '作业不存在' });
    }

    db.run('DELETE FROM homeworks WHERE id = ?', id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除作业失败:', err);
    res.status(500).json({ success: false, error: '删除作业失败' });
  }
});

// API 404
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

// Fallback: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('未捕获错误:', err);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

module.exports = app;
