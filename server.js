/**
 * server.js — 本地开发启动入口
 * Vercel 部署时使用 api/index.js，此文件仅用于本地 npm start
 */
const app = require('./api/index');
const PORT = process.env.PORT || 3000;

// 确保数据库在本地开发时也能初始化
const db = require('./db');
db.ensureInit().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`📚 作业记录本运行在 http://localhost:${PORT}`);
    console.log(`ℹ️  本地开发模式 — 确保已设置 POSTGRES_URL 环境变量`);
    console.log(`📖 参考 .env.example 配置数据库连接`);
  });
}).catch(err => {
  console.error('❌ 启动失败:', err.message);
  process.exit(1);
});
