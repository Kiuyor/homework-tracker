const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// ============ API Routes ============

// GET /api/subjects - 获取科目列表
app.get('/api/subjects', (req, res) => {
  try {
    const db = getDb();
    const subjects = db.prepare('SELECT id, name FROM subjects ORDER BY sort_order').all();
    res.json({ success: true, data: subjects });
  } catch (err) {
    console.error('获取科目失败:', err);
    res.status(500).json({ success: false, error: '获取科目失败' });
  }
});

// GET /api/homeworks - 获取作业列表（按日期筛选，按 sort_order 排序）
app.get('/api/homeworks', (req, res) => {
  try {
    const db = getDb();
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
      sql += ' AND h.date = ?';
      params.push(date);
    }

    sql += ' ORDER BY h.sort_order ASC, h.created_at ASC';

    const homeworks = db.prepare(sql).all(...params);
    res.json({ success: true, data: homeworks });
  } catch (err) {
    console.error('获取作业失败:', err);
    res.status(500).json({ success: false, error: '获取作业失败' });
  }
});

// POST /api/homeworks - 添加作业
app.post('/api/homeworks', (req, res) => {
  try {
    const db = getDb();
    const { subject_id, content, date, note } = req.body;

    if (!content || !date) {
      return res.status(400).json({ success: false, error: '内容和日期为必填项' });
    }

    const insertHomework = db.transaction(() => {
      // 在事务内获取最大 sort_order，防止并发竞态
      const maxSort = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM homeworks WHERE date = ?'
      ).get(date);

      const result = db.prepare(
        'INSERT INTO homeworks (subject_id, content, date, note, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).run(subject_id || null, content, date, note || '', maxSort.next);

      return db.prepare(`
        SELECT h.*, COALESCE(s.name, '') AS subject_name
        FROM homeworks h
        LEFT JOIN subjects s ON h.subject_id = s.id
        WHERE h.id = ?
      `).get(result.lastInsertRowid);
    });

    const homework = insertHomework();

    res.status(201).json({ success: true, data: homework });
  } catch (err) {
    console.error('添加作业失败:', err);
    res.status(500).json({ success: false, error: '添加作业失败' });
  }
});

// PUT /api/homeworks/reorder - 批量重排序（必须在 /:id 之前）
app.put('/api/homeworks/reorder', (req, res) => {
  try {
    const db = getDb();
    const { orders } = req.body;  // [{id: 1, sort_order: 0}, ...]

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders 必须为数组' });
    }

    const update = db.prepare('UPDATE homeworks SET sort_order = ? WHERE id = ?');
    const batch = db.transaction((items) => {
      for (const item of items) {
        update.run(item.sort_order, item.id);
      }
    });
    batch(orders);

    res.json({ success: true, message: '排序已更新' });
  } catch (err) {
    console.error('重排序失败:', err);
    res.status(500).json({ success: false, error: '重排序失败' });
  }
});

// PUT /api/homeworks/:id - 修改作业
app.put('/api/homeworks/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { content, date, completed, note, sort_order, subject_id } = req.body;

    const existing = db.prepare('SELECT id FROM homeworks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '作业不存在' });
    }

    const updates = [];
    const params = [];

    if (content !== undefined) { updates.push('content = ?'); params.push(content); }
    if (date !== undefined) { updates.push('date = ?'); params.push(date); }
    if (completed !== undefined) { updates.push('completed = ?'); params.push(completed); }
    if (note !== undefined) { updates.push('note = ?'); params.push(note); }
    if (subject_id !== undefined) { updates.push('subject_id = ?'); params.push(subject_id); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    params.push(id);

    db.prepare(`UPDATE homeworks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const homework = db.prepare(`
      SELECT h.*, COALESCE(s.name, '') AS subject_name
      FROM homeworks h
      LEFT JOIN subjects s ON h.subject_id = s.id
      WHERE h.id = ?
    `).get(id);

    res.json({ success: true, data: homework });
  } catch (err) {
    console.error('修改作业失败:', err);
    res.status(500).json({ success: false, error: '修改作业失败' });
  }
});

// DELETE /api/homeworks/:id - 删除作业
app.delete('/api/homeworks/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM homeworks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '作业不存在' });
    }

    db.prepare('DELETE FROM homeworks WHERE id = ?').run(id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除作业失败:', err);
    res.status(500).json({ success: false, error: '删除作业失败' });
  }
});

// API 404 - 不在 catch-all 之前被吞掉
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

// Fallback: serve index.html for any non-API route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📚 作业记录本运行在 http://localhost:${PORT}`);
});
