# 📚 班级作业记录本

一个前后端分离的班级作业记录网站，支持按日期和科目查看、添加、编辑、删除作业。

## 技术栈

- **后端**: Node.js + Express + SQLite（better-sqlite3）
- **前端**: 纯 HTML + CSS + JavaScript（单页应用）
- **部署**: 支持一键部署到 Railway / Render

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 启动服务
npm start

# 3. 打开浏览器访问
# http://localhost:3000
```

## 科目列表

预设理科班科目：语文、数学、英语、物理、化学、生物、历史、政治、地理、其他

## 部署指南

### 部署到 Railway（推荐）

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

1. 将本项目推送到 GitHub 仓库
2. 登录 [Railway](https://railway.app) → 点击 "New Project"
3. 选择 "Deploy from GitHub repo" → 关联你的仓库
4. Railway 会自动检测 Node.js 项目并部署
5. 部署完成后，Railway 会生成一个公开 URL（如 `https://your-app.up.railway.app`）

**无需任何配置**，项目已自带 `start` 脚本和 `PORT` 环境变量支持。

### 部署到 Render

1. 将本项目推送到 GitHub 仓库
2. 登录 [Render](https://render.com) → 点击 "New +" → "Web Service"
3. 关联你的 GitHub 仓库
4. 配置：
   - **Name**: `homework-tracker`（或你喜欢的名字）
   - **Region**: 选择离你最近的区域
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. 点击 "Create Web Service"
6. 部署完成后，Render 会生成一个公开 URL（如 `https://homework-tracker.onrender.com`）

## 项目结构

```
homework-tracker/
├── package.json          # 项目配置与依赖
├── server.js             # Express 服务端入口 + API 路由
├── db.js                 # SQLite 数据库初始化与种子数据
├── homework.db           # SQLite 数据库文件（自动生成）
├── public/               # 前端静态文件
│   ├── index.html        # 页面结构
│   ├── style.css         # 样式（现代化设计，响应式）
│   └── app.js            # 前端逻辑（状态管理、API 调用）
└── README.md             # 本文件
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subjects` | 获取科目列表 |
| GET | `/api/homeworks?date=2024-01-01&subject=数学` | 获取作业列表（日期必填，科目可选） |
| POST | `/api/homeworks` | 添加作业 |
| PUT | `/api/homeworks/:id` | 修改作业 |
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
  "created_at": "2026-06-27 21:24:56",
  "updated_at": "2026-06-27 21:24:56"
}
```

## 功能特点

- ✅ 按日期查看作业（支持切换日期和"回到今天"）
- ✅ 按科目筛选作业
- ✅ 添加、编辑、删除作业
- ✅ 标记完成/未完成
- ✅ 添加备注信息
- ✅ 现代化 UI，移动端适配
- ✅ 数据持久化存储（SQLite）
