#!/usr/bin/env node
/**
 * tools/backup.js — 手动备份作业数据库
 *
 * 用法:
 *   node tools/backup.js [目标路径]
 *   不给目标路径时，输出到项目根目录 homework-backup-YYYYMMDD-HHmmss.db
 *
 * 用 better-sqlite3 的在线备份 API（db.js 的 backup()，底层 db.backup）：
 * 服务正在运行、正在写入时执行也安全，不会拿到半份损坏数据——
 * 这与「直接复制 homework.db 文件」有本质区别（那个只在没人写入的瞬间才可靠）。
 */
const path = require('path');
const fs = require('fs');
const db = require('../db');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const dest = process.argv[2]
  || path.join(__dirname, '..', `homework-backup-${stamp()}.db`);

// 库还没初始化过（库文件不存在）时先走一遍建表：备份出来的永远是结构完整的一份。
db.ensureInit();

db.backup(dest).then(() => {
  const size = fs.statSync(dest).size;
  console.log('✅ 备份完成 →', dest, `(${size} bytes)`);
}).catch((err) => {
  console.error('❌ 备份失败:', err.message);
  process.exit(1);
});
