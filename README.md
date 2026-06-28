# 📚 班级作业记录本

一个前后端分离的班级作业记录网站，支持按日期和科目查看、添加、编辑、删除作业。

## 技术栈

- **后端**: Node.js + Express + PostgreSQL（@vercel/postgres）
- **前端**: 纯 HTML + CSS + JavaScript（单页应用）
- **部署**: 支持一键部署到 **Vercel** / Railway / Zeabur / 阿里云 FC

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

### 部署到 Vercel（推荐）

本项目已适配 **Vercel + Vercel Postgres**（Serverless PostgreSQL）。

#### 一键部署步骤

```bash
# 1. 将代码推送到 GitHub
git init
git add .
git commit -m "init"
git remote add origin https://github.com/<你的用户名>/homework-tracker.git
git push -u origin main

# 2. 登录 Vercel → Import 你的 GitHub 仓库
# 3. 创建 Postgres 数据库：
#    Vercel 控制台 → Storage → Create Database → Postgres
#    选择区域（建议选最接近你的区域）
# 4. Vercel 自动检测项目的 vercel.json 并部署
# 5. 在项目 Settings → Environment Variables 中确认
#    Vercel 已自动注入 POSTGRES_* 系列变量
# 6. 重新部署一次以应用环境变量
```

**部署成功后：** Vercel 分配 `https://homework-tracker.vercel.app` 域名，可直接访问。

#### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 从 Vercel Postgres 面板复制连接信息到 .env 文件
#    （参考 .env.example）

# 3. 启动开发服务器
npm start

# 4. 浏览器访问
# http://localhost:3000
```

> 💡 **注意：** 数据库已从 SQLite 迁移到 PostgreSQL（Vercel Postgres），本地开发需要可用的 PostgreSQL 实例或使用 Vercel 提供的远程连接。

### 其他平台

更多部署方案（Zeabur / 阿里云 FC / 腾讯云 SCF / 轻量服务器等）请参考 `DEPLOY_ALIYUN_FC.md`。

### 数据持久化说明

| 部署平台 | 数据库 | 持久化方式 |
|----------|--------|-----------|
| **Vercel** ✅ | PostgreSQL | Vercel Postgres（免费额度 256MB） |
| **Zeabur** | SQLite | Zeabur Storage 挂载卷 |
| **阿里云 FC** | SQLite | NAS 文件存储 |
| **轻量服务器** | SQLite | 服务器本地硬盘 |

## 项目结构

```
homework-tracker/
├── package.json          # 项目配置与依赖
├── server.js             # 本地开发启动入口
├── api/
│   └── index.js          # Vercel Serverless Function（Express 应用）
├── db.js                 # PostgreSQL 数据库封装（@vercel/postgres）
├── vercel.json           # Vercel 部署配置
├── public/               # 前端静态文件
│   ├── index.html        # 页面结构
│   ├── style.css         # 样式（现代化设计，响应式）
│   └── app.js            # 前端逻辑（状态管理、API 调用）
├── .env.example          # 环境变量模板
├── .vercelignore         # Vercel 部署忽略列表
├── DEPLOY_ALIYUN_FC.md   # 阿里云函数计算部署方案
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
