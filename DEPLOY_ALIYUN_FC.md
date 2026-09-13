# 🚀 部署到阿里云函数计算 (FC) 完整方案

> 本文档提供将 homework-tracker 部署到阿里云函数计算（FC）的完整方案。
> 项目地址：`C:\Users\75017\Desktop\schoolwork\homework-tracker`

---

## 目录

1. [方案选型](#1-方案选型)
2. [方案一：FC Web函数 + NAS 持久化（推荐）](#2-方案一fc-web函数--nas-持久化推荐)
3. [方案二：FC Web函数 + sql.js（纯JS，无需原生编译）](#3-方案二fc-web函数--sqljs纯js无需原生编译)
4. [方案三：FC + 云数据库 RDS（生产级）](#4-方案三fc--云数据库-rds生产级)
5. [常见问题](#5-常见问题)

---

## 1. 方案选型

| 方案 | 持久化 | 改造量 | 成本 | 推荐场景 |
|------|--------|--------|------|----------|
| **① FC Web函数 + NAS** | ✅ 数据持久化 | 小（加 NAS 挂载配置） | NAS 按量计费 | **推荐**，适合大多数场景 |
| **② FC + sql.js** | ❌ 数据易失 | 中（替换 better-sqlite3） | 无额外费用 | 临时演示/测试 |
| **③ FC + RDS** | ✅ 高可靠 | 大（改用 MySQL 查询） | RDS 按量计费 | 生产环境、多并发 |

> **本项目推荐方案①**，因为它改造成本最低、数据持久化有保障，且能保留 better-sqlite3 的全部性能优势。

---

## 2. 方案一：FC Web函数 + NAS 持久化（推荐）

### 2.1 架构说明

```
用户请求 → 阿里云 FC Web函数（运行 Express）
                ↕
          NAS 文件系统（/mnt/auto）
                ↕
          homework.db（SQLite 数据库文件）
```

- FC 的 **Web 函数**可以直接运行 Express.js 应用，无需改造代码
- **NAS** 挂载到 `/mnt/auto`，SQLite 数据库文件存放在 NAS 上，函数实例重启/扩缩容时数据不丢失

### 2.2 前置条件

1. 拥有阿里云账号并开通 [函数计算 FC](https://www.aliyun.com/product/fc)
2. 开通 [NAS 文件存储](https://www.aliyun.com/product/nas)
3. 安装 [Serverless Devs](https://www.serverless-devs.com/) CLI 工具：

```bash
# 安装 Serverless Devs
npm install -g @serverless-devs/s

# 配置阿里云 AK/SK（需要 RAM 账号的 AccessKey）
s config add
```

### 2.3 改造步骤

#### 步骤 1：修改 db.js — 数据库路径指向 NAS

编辑 `db.js`，将数据库路径改为使用环境变量（FC 中可通过环境变量指定 NAS 路径）：

```javascript
const Database = require('better-sqlite3');
const path = require('path');

// 优先使用环境变量 DB_PATH（NAS 挂载路径），否则用本地路径（开发环境）
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'homework.db');
```

> 在 FC 中设置环境变量：`DB_PATH = /mnt/auto/homework.db`

#### 步骤 2：修改 server.js — 监听 0.0.0.0:9000

FC Web 函数要求应用监听 `0.0.0.0:9000`。修改最后一行：

```javascript
const PORT = process.env.PORT || 9000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📚 作业记录本运行在 http://0.0.0.0:${PORT}`);
});
```

> FC 内置的 `process.env.PORT` 就是 9000，所以实际上无需修改也能工作（`process.env.PORT || 3000` 会取到 9000）。确认即可。

#### 步骤 3：准备部署文件（在 Linux 环境下编译 native 模块）

**关键：** better-sqlite3 是 C++ 原生模块，必须在 **Linux x86_64** 环境下编译才能运行在 FC 上。

**方法 A：使用 Docker 编译（推荐）**

```bash
# 在项目根目录执行
docker run --rm -v "$PWD":/app -w /app node:18-alpine sh -c "
  npm install
  # 删除 node_modules 中的 .bin 缓存（可选）
  rm -rf node_modules/.cache
"
```

**方法 B：使用阿里云 FC 提供的 Node.js 18 运行时包**

阿里云 FC 提供了 [Node.js 运行时 SDK 包](https://help.aliyun.com/document_detail/58011.html)，可以在 Linux 环境下 `npm install` 后直接上传。

#### 步骤 4：创建 s.yaml 部署配置

在项目根目录创建 `s.yaml`：

```yaml
edition: 1.0.0
name: homework-tracker
access: 'default'

services:
  homework-tracker:
    component: devsapp/fc
    props:
      region: cn-hangzhou          # 可选：cn-shanghai / cn-beijing / cn-shenzhen
      service:
        name: homework-tracker
        description: '班级作业记录本'
        internetAccess: true
        nasConfig:                  # NAS 配置
          userId: 10003
          groupId: 10003
          mountPoints:
            - serverAddr: '<your-nas-address>:/'
              mountDir: /mnt/auto
      function:
        name: homework-tracker-func
        description: '作业记录本 Web 函数'
        runtime: nodejs18
        codeUri: ./
        handler: index.handler      # Web 函数忽略 handler
        memorySize: 512             # 512MB 内存
        timeout: 30
        instanceConcurrency: 10
        environmentVariables:
          DB_PATH: /mnt/auto/homework.db
          TZ: Asia/Shanghai
      triggers:
        - name: httpTrigger
          type: HTTP
          config:
            authType: anonymous
            methods:
              - GET
              - POST
              - PUT
              - DELETE
              - OPTIONS
      customDomains:
        - domainName: auto          # 自动分配测试域名
          protocol: HTTP
          routeConfigs:
            - path: /*
              serviceName: homework-tracker
              functionName: homework-tracker-func
```

> 💡 **如何获取 NAS 地址？**
> 1. 登录[阿里云 NAS 控制台](https://nas.console.aliyun.com/)
> 2. 创建文件系统（推荐通用型 NAS，容量型即可）
> 3. 挂载点中查看挂载地址，格式如：`01234abcde-xxxxx.cn-hangzhou.nas.aliyuncs.com`
> 4. 将 `serverAddr` 替换为你的 NAS 挂载地址

#### 步骤 5：排除不需要上传的文件

创建 `.signore`（Serverless Devs 的忽略文件）：

```
.git
.gitignore
node_modules/.cache
homework.db
homework.db-shm
homework.db-wal
README.md
```

#### 步骤 6：首次部署（需要先初始化 NAS 目录）

```bash
# 首次初始化 NAS 目录
s nas init
s nas upload -l ./nas_init/ /mnt/auto/

# 部署函数
s deploy

# 如果部署失败，可能是 NAS 未初始化，先执行：
s nas init
s nas upload -l ./ /mnt/auto/ --force
```

> 首次部署时，FC 不会自动创建 `/mnt/auto/homework.db`。你需要手动初始化一次：
> ```bash
> # 在本地创建一个空的占位文件并上传
> echo "" > /tmp/placeholder
> s nas upload -l /tmp/placeholder /mnt/auto/
> ```

#### 步骤 7：配置自定义域名（可选）

部署完成后，FC 会自动分配测试域名（格式如 `https://<service>-<function>-<region>.fc.aliyuncs.com`）。

如需绑定自己的域名：
1. 在 FC 控制台的 **域名管理** 中添加自定义域名
2. 在 DNS 服务商处配置 CNAME 解析到 FC 的终端域名

### 2.4 更新部署

当代码有更新时：

```bash
# 重新编译 native 模块（在 Linux 环境下）
# 然后执行：
s deploy
```

---

## 3. 方案二：FC Web函数 + sql.js（纯JS，无需原生编译）

如果不想处理 native 模块编译问题，可以使用 **sql.js**（基于 WebAssembly 的纯 JS SQLite 实现）。

### 3.1 改造步骤

#### 步骤 1：安装 sql.js

```bash
npm uninstall better-sqlite3
npm install sql.js
```

#### 步骤 2：重写 db.js

```javascript
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// NAS 路径（通过环境变量配置）
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'homework.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // 如果数据库文件已存在，加载它；否则创建新数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 开启 WAL 模式（sql.js 不支持 WAL，但可以设置其他 pragma）
  db.run('PRAGMA journal_mode = MEMORY');

  initTables();
  seedSubjects();

  return db;
}

function saveDb() {
  // 将数据库写入磁盘（NAS）
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS homeworks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER,
      content TEXT NOT NULL,
      date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );
  `);

  // 迁移：给旧表增加 sort_order 列
  try {
    db.run('ALTER TABLE homeworks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // 忽略列已存在错误
  }
}

function seedSubjects() {
  const count = db.exec('SELECT COUNT(*) as cnt FROM subjects');
  if (!count.length || count[0].values[0][0] === 0) {
    const subjects = [
      '语文', '数学', '英语', '物理', '化学',
      '生物', '历史', '政治', '地理', '其他'
    ];
    subjects.forEach((name, i) => {
      db.run('INSERT INTO subjects (name, sort_order) VALUES (?, ?)', [name, i]);
    });
    saveDb();
  }
}

// 封装查询方法，保持与 better-sqlite3 API 兼容
class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    this.db.run(this.sql, params);
    saveDb();
    return { lastInsertRowid: this.db.exec('SELECT last_insert_rowid()')[0].values[0][0] };
  }

  all(...params) {
    const result = this.db.exec(this.sql, params);
    if (!result.length) return [];
    const cols = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  get(...params) {
    const result = this.db.exec(this.sql, params);
    if (!result.length || !result[0].values.length) return undefined;
    const cols = result[0].columns;
    const row = result[0].values[0];
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  }
}

function prepare(sql) {
  return new Statement(db, sql);
}

// 包装 db 对象，提供与 better-sqlite3 兼容的接口
const wrappedDb = {
  prepare,
  run: (sql, params) => { db.run(sql, params); saveDb(); },
  exec: (sql) => { db.run(sql); saveDb(); },
  transaction: (fn) => {
    return (...args) => {
      db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        db.run('COMMIT');
        saveDb();
        return result;
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    };
  }
};

module.exports = { getDb: async () => wrappedDb };
```

> ⚠️ **注意：** 上述代码是一个简化封装，实际使用时需要在 **每次查询后** 调用 `saveDb()` 来持久化数据。这会影响写入性能，但对于低并发场景完全够用。

#### 步骤 3：修改 server.js — 适应异步 getDb

server.js 中的 `getDb()` 变为异步函数，但上面的封装直接返回了同步接口（内部通过 async 初始化），所以可以直接使用。

如果更严谨，可以在 server.js 启动时初始化：

```javascript
const { getDb } = require('./db');

// 启动时初始化数据库
let initialized = false;

async function initDb() {
  if (!initialized) {
    await getDb();
    initialized = true;
  }
}

// 在 app.listen 之前调用
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`📚 作业记录本运行在 http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
```

### 3.2 部署

由于 sql.js 是纯 JS（WASM），无需 Linux 编译，部署更简单：

```bash
# 在 Windows 上直接安装即可
npm install

# 使用 s.yaml 部署（与方案一相同的 s.yaml，无需 Docker 编译）
s deploy
```

---

## 4. 方案三：FC + 云数据库 RDS（生产级）

对于生产环境，建议改用阿里云 RDS MySQL，并使用 `mysql2` 驱动。

### 4.1 改造方向

1. 创建阿里云 RDS MySQL 实例（选择按量计费，最低配置即可）
2. 在 RDS 中创建数据库和表
3. 将 `db.js` 改为使用 `mysql2` 连接池
4. 将 `server.js` 中的 SQL 查询改为 MySQL 语法

### 4.2 安装依赖

```bash
npm uninstall better-sqlite3
npm install mysql2
```

### 4.3 重写 db.js

```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.RDS_HOST || 'localhost',
  port: parseInt(process.env.RDS_PORT || '3306'),
  user: process.env.RDS_USER || 'root',
  password: process.env.RDS_PASSWORD || '',
  database: process.env.RDS_DB || 'homework_tracker',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+08:00'
});

async function initTables() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        sort_order INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS homeworks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT,
        content TEXT NOT NULL,
        date DATE NOT NULL,
        completed TINYINT NOT NULL DEFAULT 0,
        note TEXT DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } finally {
    conn.release();
  }
}

async function seedSubjects() {
  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM subjects');
  if (rows[0].cnt === 0) {
    const subjects = [
      '语文', '数学', '英语', '物理', '化学',
      '生物', '历史', '政治', '地理', '其他'
    ];
    for (let i = 0; i < subjects.length; i++) {
      await pool.execute(
        'INSERT INTO subjects (name, sort_order) VALUES (?, ?)',
        [subjects[i], i]
      );
    }
  }
}

module.exports = { pool, initTables, seedSubjects };
```

### 4.4 部署

与方案一类似，使用 s.yaml 部署，但无需 NAS 配置（因为数据存储在 RDS 中）。

---

## 5. 常见问题

### Q1: 为什么 better-sqlite3 在 FC 上运行报错？

```
Error: The module '.../better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version
```

**原因：** better-sqlite3 是 C++ 原生模块，你在 Windows 上 `npm install` 编译出的 `.node` 文件是 Windows 平台的，而 FC 运行在 Linux 上。

**解决：** 使用 Docker 在 Linux 环境下重新编译（见 2.3 步骤 3）。

### Q2: SQLite 数据库文件能保存在 FC 的 /tmp 目录吗？

可以保存，但 **不推荐**。`/tmp` 是临时存储：
- 函数实例缩容到 0 后数据丢失
- 实例更新/迁移时数据丢失
- 多个实例间数据不共享

必须使用 **NAS** 挂载才能持久化。

### Q3: 如何调试部署问题？

```bash
# 查看 FC 函数日志
s logs -t

# 进入函数实例查看
s fc invoke --event '{}'

# 查看 NAS 文件
s nas ls /mnt/auto/
```

### Q4: 部署后访问报 502/504？

- **502**: 检查应用是否监听 `0.0.0.0:9000`
- **504**: 检查函数超时时间是否太短（`timeout: 30`）

### Q5: 费用估算

| 资源 | 费用 |
|------|------|
| FC 函数计算 (512MB) | 约 ¥0.00011033/次调用 |
| NAS (容量型) | 约 ¥0.35/GB/月 |
| RDS MySQL (最低配) | 约 ¥20-30/月 |
| **合计（方案一，低流量）** | **约 ¥5-10/月** |

---

## 6. 其他国内适用的部署方案

除了阿里云函数计算，国内还有很多优秀的平台可以部署本项目，以下是精选方案：

### 6.1 Zeabur（⭐ 强烈推荐 — 国内用户友好）

[Zeabur](https://zeabur.com) 是一个非常受国内开发者欢迎的部署平台，支持一键部署 Node.js 应用，有**免费额度**且国内访问速度快。

**优点：**
- 🆓 有免费额度（每月赠送 $5 额度，足够跑本项目）
- 🚀 一键部署，自动检测 Node.js 项目
- 🐳 支持 Docker 部署（可以解决 better-sqlite3 编译问题）
- 🌐 国内访问速度快（有中国节点加速）
- 🔗 自动分配 HTTPS 域名
- 💳 支持支付宝付款

**部署步骤：**

```bash
# 1. 将代码推送到 GitHub
git init
git add .
git commit -m "init"
git remote add origin https://github.com/<你的用户名>/homework-tracker.git
git push -u origin main

# 2. 登录 Zeabur → 创建项目 → 关联 GitHub 仓库
# 3. Zeabur 自动检测 Node.js → 自动 npm install → 自动 npm start
# 4. 部署完成 ✅
```

**处理 better-sqlite3 原生模块：**
Zeabul 构建环境是 Linux x86_64，所以 `npm install` 会自动编译出正确的 `.node` 文件，**不需要任何额外配置**。

**数据持久化方案：**
Zeabur 支持挂载持久化存储卷（Zeabur Storage），每月 1GB 免费：

1. 在 Zeabur 控制台 → **Storage** → 创建存储卷（如 `homework-data`）
2. 挂载到 `/app/data`
3. 设置环境变量 `DB_PATH=/app/data/homework.db`
4. 无需修改代码（db.js 已使用 `DB_PATH` 环境变量）

> Zeabur 是国内用户**最简单**的部署方案，零配置、零改造，推荐首选！

---

### 6.2 Railway（已在 README 中提及）

[Railway](https://railway.app) 在 README 中已有说明，补充一些国内用户关心的事项：

- ⚠️ **国内访问速度一般**，因为服务器在海外
- 🆓 每月 $5 免费额度，本项目绰绰有余
- ✅ 自动检测 Node.js，`npm install` 运行在 Linux 环境，better-sqlite3 可正常编译
- ✅ 支持持久化卷（Railway Volume），可挂载 SQLite 数据库文件
- 💳 支持 Visa/Mastercard，不支持支付宝

**数据持久化配置：**

```bash
# Railway 控制台操作：
# 1. 进入项目 → Volumes → Create Volume
# 2. 挂载路径填写: /data
# 3. 设置环境变量 DB_PATH=/data/homework.db
```

---

### 6.3 腾讯云云函数（SCF）

腾讯云 SCF（Serverless Cloud Function）与阿里云 FC 类似，也是国内主流的 Serverless 平台。

**与阿里云 FC 的区别：**

| 特性 | 阿里云 FC | 腾讯云 SCF |
|------|-----------|------------|
| Web 函数 | ✅ 原生支持 | ✅ 事件函数 + API 网关 |
| 部署工具 | Serverless Devs | Serverless Framework / SCF CLI |
| NAS 挂载 | ✅ 支持 | ✅ 支持（CFS） |
| 冷启动 | 较快 | 略慢 |
| 免费额度 | 每月 100 万次调用 | 每月 40 万次调用 |

**腾讯云 SCF 部署要点：**

```yaml
# serverless.yml
service: homework-tracker

provider:
  name: tencent
  runtime: Nodejs18
  region: ap-guangzhou   # 广州，或 ap-shanghai / ap-beijing

plugins:
  - serverless-tencent-scf

custom:
  scf:
    handler: index.handler
    memorySize: 512
    timeout: 30
    environment:
      Variables:
        DB_PATH: /mnt/cfs/homework.db
    vpcConfig:
      subnetId: subnet-xxxxx
      vpcId: vpc-xxxxx
    cfsConfig:            # 挂载 CFS（类似 NAS）
      - cfsId: cfs-xxxxx
        mountSubnetId: subnet-xxxxx
        localMountDir: /mnt/cfs
```

> 腾讯云 SCF 部署流程与阿里云 FC 高度相似：
> 1. 需要使用 **CFS（文件存储）** 挂载 SQLite 数据库
> 2. better-sqlite3 需要在 Linux 下编译（与阿里云相同）
> 3. 通过 **API 网关** 暴露 HTTP 访问

---

### 6.4 腾讯云轻量应用服务器（Lighthouse）

如果你想要**最可控**的方案，可以考虑买一台腾讯云轻量服务器（Lighthouse），价格便宜且性能稳定。

| 配置 | 价格 | 适合 |
|------|------|------|
| 2核1G + 40GB SSD | **¥24/月** | ✅ 本项目绰绰有余 |
| 2核2G + 60GB SSD | **¥34/月** | 更宽裕 |
| 2核4G + 80GB SSD | **¥44/月** | 跑多个应用 |

**部署步骤：**

```bash
# 1. 购买腾讯云 Lighthouse → 选择 Node.js 镜像（或 Ubuntu 镜像）

# 2. SSH 登录服务器
ssh root@<服务器IP>

# 3. 安装 Node.js（如果用 Ubuntu 镜像）
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# 4. 克隆代码并安装
git clone https://github.com/<你的用户名>/homework-tracker.git
cd homework-tracker
npm install

# 5. 使用 pm2 持久运行
npm install -g pm2
pm2 start server.js --name homework-tracker
pm2 save
pm2 startup

# 6. 配置防火墙
# 腾讯云控制台 → 防火墙 → 放行 3000 端口

# 7. 配置 Nginx 反向代理 + 域名（可选）
cat > /etc/nginx/sites-available/homework << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
ln -s /etc/nginx/sites-available/homework /etc/nginx/sites-enabled/
nginx -s reload
```

**优点：** 完全可控，SQLite 数据就在服务器硬盘上，无需任何改造、无需 NAS。
**缺点：** 需要自己管理服务器（但这点流量几乎不需要维护）。

---

### ✅ 6.5 Vercel（已适配！改造已完成）

本项目现已完全适配 **Vercel + Vercel Postgres**。改造内容包括：

- `better-sqlite3` → `@vercel/postgres`（Serverless PostgreSQL）
- SQLite 同步 API → PostgreSQL 异步 API（async/await）
- 新增 `api/index.js` 作为 Vercel Serverless Function 入口
- 新增 `vercel.json` 路由配置
- 所有 SQL 语法已适配 PostgreSQL

#### 一键部署步骤

```bash
# 1. 推送到 GitHub
git init && git add . && git commit -m "init"
git remote add origin https://github.com/<你的用户名>/homework-tracker.git
git push -u origin main

# 2. 登录 Vercel → Import 仓库 → 部署
# 3. Vercel 控制台 → Storage → Create Database → Postgres
#    选择区域（推荐 us-east-1）
# 4. 项目 Settings → Environment Variables 确认 POSTGRES_* 已注入
# 5. 重新部署一次
```

**部署后访问**：`https://homework-tracker.vercel.app`

#### 本地开发

```bash
npm install
# 从 Vercel Postgres 面板复制连接信息到 .env 文件
npm start
# 访问 http://localhost:3000
```

#### 技术变更对照

| 组件 | 改造前 | 改造后 |
|------|--------|--------|
| 数据库 | SQLite (better-sqlite3) | PostgreSQL (Vercel Postgres) |
| 占位符 | `?` | `$1, $2` |
| API 风格 | 同步 `.all()` / `.get()` / `.run()` | 异步 `await all()` / `await get()` / `await run()` |
| 自增 ID | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| 时间戳 | `datetime('now','localtime')` | `CURRENT_TIMESTAMP` + 触发器 |
| 部署入口 | `server.js` (app.listen) | `api/index.js` (Vercel 函数导出) |
| 依赖 | `better-sqlite3` | `@vercel/postgres` |

> ⚠️ **国内访问注意**：Vercel 默认域名 `*.vercel.app` 在国内被 DNS 污染。可绑定自定义域名 + Cloudflare 代理改善。如在国内使用，建议优先选择 **Zeabur** 或 **阿里云 FC**。

---

### 6.6 Sealos（云原生平台）

[Sealos](https://sealos.io) 是一个以 Kubernetes 为基础的云原生平台，国内访问快，支持一键部署。

**部署方式：** 通过 Dockerfile 部署。

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

然后在 Sealos 控制台：**应用管理** → **创建应用** → 上传代码或关联 GitHub → 部署。

---

### 6.7 方案对比总表

| 平台 | 国内访问 | 免费额度 | native 模块 | 数据持久化 | 改造成本 | 上手难度 |
|------|----------|----------|-------------|-----------|----------|----------|
| **Zeabur** ⭐ | ✅ 快 | $5/月 | ✅ 自动编译 | ✅ 挂载卷 | **零改造** | ⭐ 最简单 |
| **阿里云 FC** | ✅ 快 | 100万次/月 | ⚠️ 需 Linux 编译 | ✅ NAS | 小 | 中等 |
| **腾讯云 SCF** | ✅ 快 | 40万次/月 | ⚠️ 需 Linux 编译 | ✅ CFS | 小 | 中等 |
| **Railway** | ⚠️ 一般慢 | $5/月 | ✅ 自动编译 | ✅ Volume | 零改造 | 简单 |
| **Vercel** | ⚠️ 被污染 | 有免费额度 | ❌ 不支持 native | ❌ 无持久化 | **大幅改造** | 复杂 |
| **轻量服务器** | ✅ 快 | ❌ ¥24/月起 | ✅ 直接运行 | ✅ 本机硬盘 | **零改造** | 需运维 |
| **Sealos** | ✅ 快 | 有免费额度 | ✅ Docker 编译 | ✅ 持久卷 | 小 | 简单 |

---

## 快速决策指南（完整版）

```
你的需求是什么？
│
├─ 🎯 国内用户想最简单部署 → Zeabur（零改造，一键部署，有免费额度）
│
├─ 想用 Vercel 部署全栈 → ❌ 不适合！better-sqlite3 不支持 + 数据无法持久化
│   ├─ 非要上 Vercel？→ 前端放 Vercel，后端部署到 Zeabur/轻量服务器（前后端分离）
│   └─ 或者改用 Vercel Postgres + 重写 SQL 查询（改造成本大）
│
├─ 国内免费 Serverless → 阿里云 FC / 腾讯云 SCF
│   ├─ 愿意处理 native 模块编译 → 用 better-sqlite3 + NAS/CFS
│   └─ 不想碰编译问题 → sql.js + NAS/CFS（持久化）或 sql.js + 内存（演示）
│
├─ 想要完全可控 → 腾讯云轻量服务器（¥24/月起，零改造，直接跑）
│
├─ 演示/测试，数据丢了也无所谓 → sql.js（内存模式）+ 任意平台
│
├─ 生产环境，高并发，高可靠 → FC/SCF + RDS（MySQL/PostgreSQL）
│
└─ 不在乎国内速度 → Railway（零改造，$5免费额度）
```

---

## 7. 最终推荐路线

### 🥇 首选：Zeabur（国内最快最省心）

```
代码推 GitHub → Zeabur 关联仓库 → 自动部署 ✅
                              ↓
                    挂载 Storage 持久化 SQLite ✅
                              ↓
                    绑定自定义域名 ✅
```

**耗时：15 分钟，改造量：0 行代码**

### 🥈 备选：阿里云 FC + NAS（如果你已在使用阿里云生态）

```
Docker 编译 native 模块 → 配置 s.yaml → s deploy ✅
```

### 🥉 最可控：腾讯云轻量服务器（适合喜欢自己掌控的人）

```
买服务器 → ssh 登录 → git clone → npm install → pm2 start ✅
```
