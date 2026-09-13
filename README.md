# 📚 班级作业记录本

一个前后端分离的班级作业记录网站，支持按日期和科目查看、添加、编辑、删除、筛选、批量编辑作业。

## 技术栈

- **后端**: Node.js + Express + SQLite（better-sqlite3）
- **前端**: 纯 HTML + CSS + JavaScript（单页应用，模块化）
- **部署**: 本地/轻量服务器直接运行；生产部署见 [阿里云 FC 方案](DEPLOY_ALIYUN_FC.md)

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 启动服务
npm start

# 3. 打开浏览器访问
# http://localhost:3000
```

使用 SQLite 本地数据库，零配置启动。也可以双击 `start.vbs`（Windows）一键启动并自动打开浏览器。

## 科目列表

预设理科班科目：语文、数学、英语、物理、化学、生物

> 科目表仅在数据库为空时写入种子数据，已有数据不会覆盖。可在数据库的 `subjects` 表中自行增删科目。

## 项目结构

```
homework-tracker/
├── package.json          # 项目配置与依赖
├── server.js             # 本地开发启动入口
├── start.vbs             # Windows 双击启动脚本
├── .env.example          # 环境变量模板（DB_PATH / PORT / CORS_ORIGIN）
├── .gitignore
├── api/
│   └── index.js          # Express 应用（含 API 路由、中间件）
├── db.js                 # SQLite 数据库封装（better-sqlite3）
├── public/               # 前端静态文件
│   ├── index.html        # 页面结构
│   ├── style.css         # 样式（现代化设计，响应式）
│   └── js/               # 前端模块（按职责拆分）
│       ├── state.js      # 全局状态 + 日期工具函数
│       ├── utils.js      # DOM 选择器 + escapeHtml + Toast
│       ├── api.js        # API 调用封装
│       ├── drag.js       # 拖拽排序（鼠标 + 触屏）
│       ├── ui.js         # UI 渲染 + 模态框 + 批量导入 + 批量编辑
│       └── main.js       # 初始化 + 事件绑定
├── DEPLOY_ALIYUN_FC.md   # 阿里云函数计算部署方案
├── CLOUDFLARE_SPEED.md   # Cloudflare 加速 Vercel 站点方案
└── README.md             # 本文件
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/subjects` | 获取科目列表 |
| GET | `/api/homeworks?date=2024-01-01` | 获取作业列表（日期可选） |
| POST | `/api/homeworks` | 添加作业 |
| PUT | `/api/homeworks/:id` | 修改作业 |
| PUT | `/api/homeworks/reorder` | 批量更新排序（拖拽后） |
| PUT | `/api/homeworks/batch` | 批量编辑（按 ids 数组改科目/备注/内容） |
| DELETE | `/api/homeworks/:id` | 删除作业 |

### 作业对象字段

```json
{
  "id": 1,
  "subject_id": 2,
  "subject_name": "数学",
  "content": "完成练习册P25-30",
  "date": "2026-06-27",
  "completed": 0,
  "note": "明天检查",
  "deadline": "2026-06-30 08:00:00",
  "sort_order": 0,
  "created_at": "2026-06-27 21:24:56",
  "updated_at": "2026-06-27 21:24:56"
}
```

## 功能特点

- ✅ 按日期查看作业（支持切换日期和"回到今天"）
- ✅ 按科目筛选作业（工具栏下拉框）
- ✅ 添加、编辑、删除作业
- ✅ 拖拽排序（支持鼠标和触屏）
- ✅ 批量导入作业（支持全角/半角冒号）
- ✅ 批量编辑（多选后统一修改科目和备注）
- ✅ 暗色模式（手动切换 + 跟随系统）
- ✅ 全屏展示模式
- ✅ 字号调节
- ✅ 响应式设计，移动端适配
- ✅ 数据持久化存储（SQLite，WAL 模式）

## 数据持久化说明

| 场景 | 数据库 | 持久化方式 |
|----------|--------|-----------|
| **本地开发** | SQLite | 项目根目录 `homework.db` 文件 |
| **阿里云 FC** | SQLite | NAS 文件存储（见 `DEPLOY_ALIYUN_FC.md`） |
| **轻量服务器** | SQLite | 服务器本地硬盘 |

> **注意：** 本项目依赖 better-sqlite3 原生模块，Serverless 平台（如 Vercel）需在目标平台环境重新编译，且文件系统通常只读，不适合直接部署。生产环境推荐阿里云 FC + NAS（有完整方案文档）或自托管轻量服务器。
