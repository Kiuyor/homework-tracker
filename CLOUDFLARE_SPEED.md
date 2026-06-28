# 🌐 使用 Cloudflare 优化 Vercel 网站国内访问速度

> 适用场景：Vercel 部署 + Cloudflare 域名管理，优化国内用户访问体验

---

## 核心问题

```
Vercel 默认域名 *.vercel.app → 国内 DNS 污染 → ❌ 无法访问

Cloudflare 自定义域名 + Proxy → 绕过 DNS 污染 → ✅ 可以访问
                                  但服务器在海外 → ⚠️ 延迟 200-400ms
```

---

## 一、基础配置（必做 — 解决无法访问）

### 1.1 在 Cloudflare 添加域名

假设你的域名是 `example.com`，在 Cloudflare 控制台添加后，将 DNS 服务器改为 Cloudflare 的。

### 1.2 添加 DNS 记录

| 类型 | 名称 | 目标 | 代理状态 |
|------|------|------|----------|
| `CNAME` | `@` | `cname.vercel-dns.com` | **☁️ 橙色云（Proxied）** |
| `CNAME` | `www` | `cname.vercel-dns.com` | **☁️ 橙色云（Proxied）** |

> ⚠️ **关键：必须开启橙色云（Proxied）**，否则 Vercel 源站 IP 直接暴露，依然会被 DNS 污染。

### 1.3 在 Vercel 绑定域名

```bash
Vercel 项目 → Settings → Domains → 输入 example.com
Vercel 会自动检测 Cloudflare 配置并签发 SSL 证书 ✅
```

### 1.4 验证

```bash
# 确认国内能访问（在浏览器打开）
curl -I https://example.com
# 查看响应头应有 cloudflare 相关字段
```

---

## 二、速度优化（免费版可用）

### 2.1 Speed 面板优化

在 Cloudflare 控制台 → **Speed → Optimization**：

```
✅ Auto Minify: JavaScript, CSS, HTML     # 自动压缩前端文件
✅ Brotli: On                              # 更好的压缩算法（比 gzip 小 20%）
✅ Polish: Lossless                        # 图片无损压缩（如果有图片资源）
✅ Early Hints: On                         # 预加载提示，加速页面渲染
✅ HTTP/2: On (默认开启)
✅ HTTP/3 (with QUIC): On (默认开启)
```

### 2.2 缓存静态资源

**Cloudflare → Caching → Cache Rules → Create Rule：**

```
Rule name: 静态资源长期缓存
When: Hostname contains "example.com" AND
      URL path extension is IN {js, css, png, jpg, svg, ico, json, woff2}
Then: Cache level: Standard
      Edge TTL: 7 days
      Browser TTL: 1 day
```

> 对于本项目（纯 HTML + CSS + JS），静态文件缓存后，
> 大多数访问只需加载 API 数据，速度会大幅提升。

### 2.3 自定义页面规则（Page Rules）

在 Cloudflare → **Rules → Page Rules** 添加：

**规则 1：API 不缓存**
```
URL: example.com/api/*
Setting: Cache Level: Bypass
         （API 请求需要实时数据）
```

**规则 2：静态资源缓存**
```
URL: example.com/*.js
Setting: Cache Level: Standard
         Edge Cache TTL: a month
```
```
URL: example.com/*.css
Setting: Cache Level: Standard
         Edge Cache TTL: a month
```

### 2.4 启用 Argo Smart Routing（付费）

Cloudflare Argo Smart Routing（$5/月）可以智能路由请求到最快的源站路径，对国内访问有一定改善。

---

## 三、进阶优化

### 3.1 在 Vercel 侧选择离中国更近的地区

默认 Vercel 的函数运行在 `us-east-1`（美国东部），可以在 Vercel 项目设置中更改：

**免费版：** 默认只能选 `iad1`（美国东部）

**Pro 版（$20/月）：** 可选 `hkg1`（香港），延迟从 ~300ms 降至 ~50ms

```
Vercel 项目 → Settings → Functions → Function Region
├─ Free:   iad1 (US East)              ← 国内延迟 ~300ms
├─ Pro:    hkg1 (Hong Kong)            ← 国内延迟 ~50ms ✅ 强烈推荐
└─ Pro:    sin1 (Singapore)            ← 国内延迟 ~100ms
```

> **如果切换到香港区域**，配合 Cloudflare，国内用户延迟可降至 50-100ms，体验很好。

### 3.2 数据库就近部署

本项目使用 Vercel Postgres，创建数据库时选择区域：

```
Vercel → Storage → Create Postgres → Region:
├─ US East (us-east-1)    ← 默认，国内延迟高
├─ Hong Kong (hkg1)       ← 国内最快 ✅
└─ Singapore (sin1)       ← 也不错
```

> 数据库和函数选择同一区域，可以减少跨区域网络延迟。

### 3.3 启用 Cloudflare Workers 缓存 API（可选）

如果不想升级 Vercel Pro，可以用 Cloudflare Workers 做 API 缓存层：

```javascript
// Cloudflare Worker — 在边缘缓存 API 响应
const API_BASE = 'https://homework-tracker.vercel.app';

async function handleRequest(request) {
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;

  // 静态资源走 Cloudflare 默认缓存
  if (/\.(js|css|png|jpg|svg|ico)$/.test(url.pathname)) {
    return fetch(request);
  }

  // API 请求从缓存读取
  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(`${API_BASE}${url.pathname}${url.search}`);
    // 对 GET 类 API 缓存 60 秒
    if (request.method === 'GET' && url.pathname.startsWith('/api/')) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'public, s-maxage=60');
      response = new Response(response.body, { ...response, headers });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
  }
  return response;
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
```

> Workers 免费版每天 10 万次请求，本项目绰绰有余。

---

## 四、各方案效果对比

| 方案 | 月费 | 国内延迟 | 改造难度 | 说明 |
|------|------|----------|----------|------|
| **Cloudflare DNS + Proxy（免费）** | ¥0 | ~300ms | ⭐ 简单 | 解决不可访问问题 |
| + 静态资源缓存 | ¥0 | 页面加载快 | ⭐ 简单 | 首次慢，后续快 |
| + 切换到 Vercel Pro 香港区 | $20 | **~50ms** ✅ | ⭐ 简单 | **效果最好** |
| + Cloudflare Workers 缓存 | ¥0 | ~200ms | 中等 | 不升级 Vercel 的替代方案 |
| **终极方案：换成 Zeabur** | ¥0 | ~50ms | ⭐ 简单 | 国内原生优化，免折腾 |

---

## 五、推荐路线

```
你的预算？
│
├─ ¥0（免费）→ Cloudflare DNS Proxy + 静态缓存 + Workers API 缓存
│              效果：可访问，首次 300ms，后续页面加载快
│
├─ $20/月（Vercel Pro）→ 切香港区域 + Cloudflare
│              效果：延迟 50ms，体验流畅 ✅ 推荐
│
└─ ¥0（换平台）→ 改用 Zeabur（国内友好）
              效果：延迟低，无需折腾 Cloudflare，部署更简单
```

> **个人建议：** 先做免费的 Cloudflare Proxy + 缓存配置，看看效果能不能接受。
> 如果延迟太高，再考虑升级 Vercel Pro 切香港区域，或者直接换 Zeabur。
