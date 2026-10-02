/**
 * server.js — 本地开发启动入口
 * npm start 即可运行，无需任何环境变量
 */
const app = require('./api/index');
const db = require('./db');
const PORT = process.env.PORT || 3000;

// 初始化数据库表
db.ensureInit();

// Ctrl+C（SIGINT）：先把 SQLite 连接关干净再退出。Windows 上不关会留下文件句柄，
// 紧随其后的备份/复制/移动可能拿到被锁或写了一半的库。
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📚 作业记录本运行在 http://localhost:${PORT}`);
  console.log(`💾 SQLite 数据库 → homework.db（项目根目录）`);
});
