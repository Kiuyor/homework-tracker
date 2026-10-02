const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db');

const app = express();

// ============ 输入校验常量与辅助 ============
const MAX_CONTENT_LEN = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEADLINE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// 主科优先表（ADR-0006）：墙上的先后是写死的常量，不是可拖出来的顺序，也不是可编辑
// 数据——所以不启用 subjects.sort_order。名单本身在 db.js（它同时是启动时补齐六格的
// 那份清单，也是科目全集——ADR-0011），这里只引用不复制：两份副本一旦漂移，
// 墙上顺序与作业顺序会静默不一致。
// 不在表上的科目一律落在 ELSE 那一档，再按 subjects.id（建立先后）追加在表尾——
// ADR-0011 关掉的是"建"，这条读法留给历史数据。
const SUBJECT_PRIORITY = db.SUBJECT_PRIORITY;

// 科目必选（ADR-0005）：既没给 id 也没给名字 = 拒绝，没有"归到一个无科目分组"这条路。
// POST 与 PUT、"不填" 与 "显式 null" 四条路共用这一句——它们本质是同一个问题。
const SUBJECT_REQUIRED = '作业必须属于一个科目';
// 六科闭集（ADR-0011）：名单取自那唯一的一份，文案不在这里再抄一遍六个名字。
const SUBJECT_CLOSED = '科目只有这六科：' + SUBJECT_PRIORITY.join('、');

// 用占位符而不是把科目名拼进 SQL：常量表将来若从配置读入，不会变成注入面。
function priorityOrderSql(col) {
  return 'CASE ' + col + ' ' +
    SUBJECT_PRIORITY.map((name, i) => 'WHEN ? THEN ' + i).join(' ') +
    ' ELSE ' + SUBJECT_PRIORITY.length + ' END';
}


// 科目闭集（ADR-0011）：弹窗里点到的是一段选择器给出的 id，`subject_name` 退化为
// 纯 API 客户端入口，且**不再建科**——名字不在这六科上就是 400，以前是 INSERT OR IGNORE
// 再回查。表外科目只剩历史数据一种来源，所以按 id 改挂仍然放行（那是数据不是新建）。
// 返回 { id } 或 { error }：两者同时给且矛盾时不静默取其一，报错让人回来改。
function resolveSubject(d, subjectId, subjectName) {
  const hasId = subjectId !== undefined && subjectId !== null && subjectId !== '';
  const raw = typeof subjectName === 'string' ? subjectName.trim() : '';
  const hasName = raw !== '';

  if (hasId && hasName) {
    const row = d.prepare('SELECT id, name FROM subjects WHERE id = ?').get(subjectId);
    if (!row) return { error: '所选科目不存在' };
    if (row.name !== raw) {
      return { error: 'subject_id 与 subject_name 指向不同科目，请只填其一' };
    }
    return { id: row.id };
  }
  if (hasId) {
    const row = d.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId);
    return row ? { id: row.id } : { error: '所选科目不存在' };
  }
  if (hasName) {
    if (!SUBJECT_PRIORITY.includes(raw)) return { error: SUBJECT_CLOSED };
    const row = d.prepare('SELECT id FROM subjects WHERE name = ?').get(raw);
    // 名字在表上但库里没这一行 = 启动时补齐没跑到，不是用户填错了
    return row ? { id: row.id } : { error: '科目「' + raw + '」尚未就绪，请重启服务' };
  }
  return { error: SUBJECT_REQUIRED };
}

// 一科一条撞车：把 SQLite 的唯一约束异常翻成 409 + 一句人话。
// 只认这一种异常——其余约束（外键、非空）与一切未知错误照旧往上抛，
// 一个 catch 全吞成 409 会把"数据库坏了"伪装成"用户填错了"。
function isUniqueConflict(err) {
  return !!err && typeof err.code === 'string' &&
    /^SQLITE_CONSTRAINT(_UNIQUE)?$/.test(err.code);
}

function conflictError(date, subjectName) {
  return {
    status: 409,
    body: {
      success: false,
      error: `${date} 的「${subjectName}」已经有一条作业了；一科一条，请直接改那一条`,
    },
  };
}

// SQLITE_BUSY：库文件被别的进程锁住了（多半是又起了一个服务实例，或正被别的程序打开）。
// busy_timeout 已给过 5 秒（db.js），还忙说明对方长时间占着——500「服务器内部错误」
// 会让人以为服务坏了，给一句能行动的话。返回 true 表示已应答，调用方直接 return。
function replyBusyIfBusy(err, res) {
  if (!err || err.code !== 'SQLITE_BUSY') return false;
  res.status(503).json({ success: false, error: '数据库正被其他程序占用，请稍后重试' });
  return true;
}

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
    // 墙上格子的顺序跟着这份列表走（ui.js 按 state.subjects 分组），所以主科优先表
    // 在这里生效一次，下面那条 homeworks 查询再生效一次——两处共用同一份常量。
    const subjects = db.all(
      'SELECT id, name FROM subjects ORDER BY ' + priorityOrderSql('name') + ', id',
      ...SUBJECT_PRIORITY
    );
    res.json({ success: true, data: subjects });
  } catch (err) {
    if (replyBusyIfBusy(err, res)) return;
    console.error('获取科目失败:', err);
    res.status(500).json({ success: false, error: '获取科目失败' });
  }
});

// GET /api/homeworks
app.get('/api/homeworks', (req, res) => {
  try {
    const { date } = req.query;

    let sql = `
      SELECT h.id, h.content, h.date,
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

    // 一科一条（ADR-0006）：顺序由主科优先表决定，h.sort_order 不再有读者
    // （列保留、统一写 0，见本文件 POST 侧），h.id 做稳定次序。
    sql += ' ORDER BY ' + priorityOrderSql('s.name') + ', h.subject_id ASC, h.id ASC';
    params.push(...SUBJECT_PRIORITY);

    const homeworks = db.all(sql, ...params);
    res.json({ success: true, data: homeworks });
  } catch (err) {
    if (replyBusyIfBusy(err, res)) return;
    console.error('获取作业失败:', err);
    res.status(500).json({ success: false, error: '获取作业失败' });
  }
});

// POST /api/homeworks
app.post('/api/homeworks', (req, res) => {
  try {
    const { subject_id, subject_name, content, date, note, deadline, completed } = req.body;

    // 作业墙只回答「今天有什么」，不回答「哪条已交」「备注是什么」——见 docs/adr/0002
    if (completed !== undefined) {
      return res.status(400).json({ success: false, error: '作业墙不记录完成状态，completed 不接受写入' });
    }
    if (note !== undefined) {
      return res.status(400).json({ success: false, error: '作业墙不记录备注，note 不接受写入' });
    }

    if (!content || !date) {
      return res.status(400).json({ success: false, error: '内容和日期为必填项' });
    }

    // content 必须是字符串：数字 123 会静默变形（库列是 TEXT，落库形态随驱动而异），
    // 对象/数组则会在 .length 或绑定参数处炸成 500——类型问题该在门口用 400 说清。
    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, error: '作业内容必须为文本' });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({ success: false, error: '日期格式必须为 YYYY-MM-DD' });
    }

    if (deadline !== undefined && deadline !== null && deadline !== '' && !isValidDeadline(deadline)) {
      return res.status(400).json({ success: false, error: 'deadline 格式必须为 YYYY-MM-DD HH:MM:SS' });
    }

    // 跨字段：截止时间的日期部分不能早于布置日期。两边都是 YYYY-MM-DD，
    // 字典序就是日历序，直接比较即可。
    if (typeof deadline === 'string' && deadline !== '' && deadline.slice(0, 10) < date) {
      return res.status(400).json({ success: false, error: '截止时间不能早于布置日期' });
    }

    if (content.length > MAX_CONTENT_LEN) {
      return res.status(400).json({ success: false, error: '作业内容不能超过5000字' });
    }

    // 科目在这里定稿。它不再可能新建一行 subject（ADR-0011），但仍与写作业同处一个事务：
    // 校验失败用带标记的异常冒泡，这条写法不需要为"半个科目"负责，只需要为"半条作业"负责。
    const insertHomework = db.transaction((d, subjId, subjName, content, date, deadline) => {
      const subj = resolveSubject(d, subjId, subjName);
      if (subj.error) {
        const e = new Error(subj.error);
        e.subjectError = subj.error;
        throw e;
      }

      // sort_order 列保留但不再有读者：一科一条之后墙上顺序由主科优先表决定。
      let result;
      try {
        result = d.prepare(
          'INSERT INTO homeworks (subject_id, content, date, deadline) VALUES (?, ?, ?, ?)'
        ).run(subj.id, content, date, deadline || null);
      } catch (err) {
        if (isUniqueConflict(err)) {
          // 科目名在事务里读：出事务后作业已回滚，这里点名要用的那一行必须还看得见
          const row = d.prepare('SELECT name FROM subjects WHERE id = ?').get(subj.id);
          err.conflict = { date, subjectName: row ? row.name : '该科目' };
        }
        throw err;
      }

      const newRow = d.prepare(
        'SELECT id, subject_id, content, date, deadline, sort_order, created_at, updated_at FROM homeworks WHERE id = ?'
      ).get(result.lastInsertRowid);

      let subjectName = '';
      if (newRow.subject_id) {
        const subj2 = d.prepare('SELECT name FROM subjects WHERE id = ?').get(newRow.subject_id);
        subjectName = subj2 ? subj2.name : '';
      }

      return { ...newRow, subject_name: subjectName };
    });

    let homework;
    try {
      homework = insertHomework(subject_id, subject_name, content, date, deadline);
    } catch (err) {
      if (err.subjectError) {
        return res.status(400).json({ success: false, error: err.subjectError });
      }
      if (err.conflict) {
        const c = conflictError(err.conflict.date, err.conflict.subjectName);
        return res.status(c.status).json(c.body);
      }
      throw err;
    }
    res.status(201).json({ success: true, data: homework });
  } catch (err) {
    if (replyBusyIfBusy(err, res)) return;
    console.error('添加作业失败:', err);
    res.status(500).json({ success: false, error: '添加作业失败' });
  }
});

// PUT /api/homeworks/:id
app.put('/api/homeworks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { content, date, completed, note, subject_id, subject_name, deadline } = req.body;

    const existing = db.get('SELECT id, date, subject_id FROM homeworks WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '作业不存在' });
    }

    // 撞车时报的是"哪一天哪一科"，所以记下本次要写进去的最终值：未提交的字段沿用原值。
    let effDate = existing.date;
    let effSubjectId = existing.subject_id;

    const updates = [];
    const params = [];

    if (content !== undefined) {
      // 类型/空值与超长是两件事，分开说：前者是"没给内容"，后者是"内容太长"。
      // 空串也拒——PUT 把正文清空等于删掉这条作业的意义，该走 DELETE。
      if (content === null || typeof content !== 'string' || content.trim() === '') {
        return res.status(400).json({ success: false, error: '作业内容不能为空且必须为文本' });
      }
      if (content.length > MAX_CONTENT_LEN) {
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
      effDate = date;
    }
    if (completed !== undefined) {
      // 列仍在库里（ADR-0002：删的是能力不是存储），但不再有写入方
      return res.status(400).json({ success: false, error: '作业墙不记录完成状态，completed 不接受写入' });
    }
    if (note !== undefined) {
      return res.status(400).json({ success: false, error: '作业墙不记录备注，note 不接受写入' });
    }
    if (deadline !== undefined)  {
      // deadline 格式校验：要么 null/空，要么 "YYYY-MM-DD HH:MM:SS"
      if (deadline === null || deadline === '') {
        updates.push('deadline = ?'); params.push(null);
      } else if (isValidDeadline(deadline)) {
        // 跨字段（与 POST 同一条规则）：基准是这条作业的最终所属日——
        // 本请求同时改了 date 时，effDate 已在上面换成新值。
        if (deadline.slice(0, 10) < effDate) {
          return res.status(400).json({ success: false, error: '截止时间不能早于布置日期' });
        }
        updates.push('deadline = ?'); params.push(deadline);
      } else {
        return res.status(400).json({ success: false, error: 'deadline 格式必须为 YYYY-MM-DD HH:MM:SS' });
      }
    }
    if (subject_id !== undefined || subject_name !== undefined) {
      // 与 POST 同一条解析：只认已有科目，敲新名不再建科（ADR-0011）。
      // 包一层事务只为拿到 better-sqlite3 的句柄（resolveSubject 按 id/name 各查一次），
      // 它现在只读不写，回滚与否都一样。
      // 把科目清空又不给名字 → resolveSubject 认成"没填科目"，与 POST 同一条 400。
      const resolveInTx = db.transaction((d) => resolveSubject(d, subject_id, subject_name));
      const r = resolveInTx();
      if (r.error) {
        return res.status(400).json({ success: false, error: r.error });
      }
      updates.push('subject_id = ?'); params.push(r.id);
      effSubjectId = r.id;
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    params.push(id);
    try {
      db.run(`UPDATE homeworks SET ${updates.join(', ')} WHERE id = ?`, ...params);
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
      // 改挂到当天已占用的科目 = 制造第二条。占位者是谁要点名出来，
      // 科代表看到这句才知道该去改那一条，而不是以为自己点错了按钮。
      const subj = db.get('SELECT name FROM subjects WHERE id = ?', effSubjectId);
      const c = conflictError(effDate, subj ? subj.name : '该科目');
      return res.status(c.status).json(c.body);
    }

    const homework = db.get(`
      SELECT h.id, h.subject_id, h.content, h.date, h.deadline, h.sort_order,
             h.created_at, h.updated_at, COALESCE(s.name, '') AS subject_name
      FROM homeworks h
      LEFT JOIN subjects s ON h.subject_id = s.id
      WHERE h.id = ?
    `, id);

    res.json({ success: true, data: homework });
  } catch (err) {
    if (replyBusyIfBusy(err, res)) return;
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
    if (replyBusyIfBusy(err, res)) return;
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
  // 请求体不是合法 JSON：body-parser 在进入路由前就抛了，这是客户端的错不是服务的错，
  // 给 400 与一句人话，而不是让"服务器内部错误"背锅。
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: '请求体不是合法 JSON' });
  }
  console.error('未捕获错误:', err);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

module.exports = app;
