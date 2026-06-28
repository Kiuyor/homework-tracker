const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============ API Routes ============

// GET /api/subjects - 获取科目列表
app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await db.all('SELECT id, name FROM subjects ORDER BY sort_order');
    res.json({ success: true, data: subjects });
  } catch (err) {
    console.error('获取科目失败:', err);
    res.status(500).json({ success: false, error: '获取科目失败' });
  }
});

// GET /api/homeworks - 获取作业列表
app.get('/api/homeworks', async (req, res) => {
  try {
    const { date } = req.query;

    let sql = `
      SELECT h.id, h.content, h.date, h.completed, h.note,
             h.sort_order, h.subject_id, h.created_at, h.updated_at,
             COALESCE(s.name, '') AS subject_name
      FROM homeworks h
      LEFT JOIN subjects s ON h.subject_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      sql += ' AND h.date = $' + (params.length + 1);
      params.push(date);
    }

    sql += ' ORDER BY h.sort_order ASC, h.created_at ASC';

    const homeworks = await db.all(sql, ...params);
    res.json({ success: true, data: homeworks });
  } catch (err) {
    console.error('获取作业失败:', err);
    res.status(500).json({ success: false, error: '获取作业失败' });
  }
});

// POST /api/homeworks - 添加作业
app.post('/api/homeworks', async (req, res) => {
  try {
    const { subject_id, content, date, note } = req.body;

    if (!content || !date) {
      return res.status(400).json({ success: false, error: '内容和日期为必填项' });
    }

    const insertHomework = db.transaction(async () => {
      // 获取该日期的最大 sort_order
      const maxSortRow = await db.get(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM homeworks WHERE date = $1',
        date
      );
      const nextSort = parseInt(maxSortRow.next) || 0;

      // 插入并返回新记录
      const result = await db.run(
        `INSERT INTO homeworks (subject_id, content, date, note, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, subject_id, content, date, completed, note, sort_order, created_at, updated_at`,
        subject_id || null, content, date, note || '', nextSort
      );

      const newRow = result.rows[0];

      // 补充 subject_name
      let subjectName = '';
      if (newRow.subject_id) {
        const subj = await db.get('SELECT name FROM subjects WHERE id = $1', newRow.subject_id);
        subjectName = subj ? subj.name : '';
      }

      return { ...newRow, subject_name: subjectName };
    });

    const homework = await insertHomework();
    res.status(201).json({ success: true, data: homework });
  } catch (err) {
    console.error('添加作业失败:', err);
    res.status(500).json({ success: false, error: '添加作业失败' });
  }
});

// PUT /api/homeworks/reorder - 批量重排序（必须在 /:id 之前）
app.put('/api/homeworks/reorder', async (req, res) => {
  try {
    const { orders } = req.body; // [{id: 1, sort_order: 0}, ...]

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders 必须为数组' });
    }

    const batch = db.transaction(async (items) => {
      for (const item of items) {
        await db.run('UPDATE homeworks SET sort_order = $1 WHERE id = $2', item.sort_order, item.id);
      }
    });
    await batch(orders);

    res.json({ success: true, message: '排序已更新' });
  } catch (err) {
    console.error('重排序失败:', err);
    res.status(500).json({ success: false, error: '重排序失败' });
  }
});

// PUT /api/homeworks/:id - 修改作业
app.put('/api/homeworks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, date, completed, note, sort_order, subject_id } = req.body;

    const existing = await db.get('SELECT id FROM homeworks WHERE id = $1', id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '作业不存在' });
    }

    const updates = [];
    const params = [];
    let paramIndex = 0;

    if (content !== undefined) { updates.push(`content = $${++paramIndex}`); params.push(content); }
    if (date !== undefined) { updates.push(`date = $${++paramIndex}`); params.push(date); }
    if (completed !== undefined) { updates.push(`completed = $${++paramIndex}`); params.push(completed); }
    if (note !== undefined) { updates.push(`note = $${++paramIndex}`); params.push(note); }
    if (subject_id !== undefined) { updates.push(`subject_id = $${++paramIndex}`); params.push(subject_id); }
    if (sort_order !== undefined) { updates.push(`sort_order = $${++paramIndex}`); params.push(sort_order); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    // updated_at 由 PostgreSQL 触发器自动更新
    params.push(id);
    await db.run(
      `UPDATE homeworks SET ${updates.join(', ')} WHERE id = $${++paramIndex}`,
      ...params
    );

    const homework = await db.get(`
      SELECT h.*, COALESCE(s.name, '') AS subject_name
      FROM homeworks h
      LEFT JOIN subjects s ON h.subject_id = s.id
      WHERE h.id = $1
    `, id);

    res.json({ success: true, data: homework });
  } catch (err) {
    console.error('修改作业失败:', err);
    res.status(500).json({ success: false, error: '修改作业失败' });
  }
});

// DELETE /api/homeworks/:id - 删除作业
app.delete('/api/homeworks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.get('SELECT id FROM homeworks WHERE id = $1', id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '作业不存在' });
    }

    await db.run('DELETE FROM homeworks WHERE id = $1', id);
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

// Fallback: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 全局错误处理中间件 — 确保所有错误返回 JSON
app.use((err, req, res, next) => {
  console.error('未捕获错误:', err);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

module.exports = app;
