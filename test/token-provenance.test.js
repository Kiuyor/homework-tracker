// 版本戳纪律的门禁版。
//
// 立论：注释会说谎，而且说谎时没人拦（底账 §8）。ADR-0012 决定 6 说"品牌 hex 逐值照抄官方"，
// 而决定 6 的〔001 回写〕记下这件事在没有包名+版本+token 名时根本不可执行——同一个 token 名
// 在两个版本里是两个值，本项目已经在两处把记忆里的值当成官方值写进了结论（暗档链接蓝
// 记成 #58a6ff、canvas.subtle 记成 #161b22，v11.10.0 实为 #4493f8 / #151b23）。
//
// 003 对底账 §8 那三条去处的裁决 = ①：把门禁要读的三份官方 css 提交进
// docs/vendor/primer-11.10.0/（实付 243KB，仓库原本 459KB；绿色版打包只收
// api/ public/ node_modules，见 tools/build-portable.sh:49-54，所以不进产物）。
// 为什么不是 ②（探针留在 .scratch 手动跑）：它不进 CI，下一轮一定忘。
// 为什么不是 ③（把官方值内联进测试表）：§7(a)-5c 那张表**已经**是 ③ 的形态，
// 它管得住"CSS 被人改了"，管不住"表里这一行的出处是编的"——被改的若是出处本身，
// 唯一能反驳它的只有上游文件本体。所以下面 T1 先验副本自身，T2 拿它去对 hex，T3 去对圆角那四行的
// rem→px 换算（radius.css 提交进仓库却一行都不读，等于把"标注可查"只兑了一半）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
// NEG_* 是变异检查的注入点（.scratch/negcheck/run.mjs）：真文件永不用它，
// 但它让"这条断言会不会判红"变成可跑的问题，而不是可信不可信的信念问题。
const VENDOR = process.env.NEG_VENDOR_DIR || path.join(ROOT, 'docs', 'vendor', 'primer-11.10.0');
const CSS_FILE = process.env.NEG_CSS || path.join(ROOT, 'public', 'style.css');

// 主题块 → 它照抄的那份官方文件。玻璃两档不在册：它不是某个品牌 token 包的下游，
// 取值是自选的（spec 故事 8/9 的窗口与 α 阶梯），那块里本就不该出现"官方 token 名"标注。
// T2 的反向断言盯的正是这一点：标了官方 token 却没在册的块当场判红。
const SOURCES = {
  'body.theme-github': 'light.css',
  'body.theme-github.dark-mode': 'dark.css',
};
// 圆角不跟着主题档走：GitHub 的半径阶梯只有一份 size/radius.css，亮暗共用（两块里那四行标注读它）。
const RADIUS_FILE = 'radius.css';

const readCss = () => fs.readFileSync(CSS_FILE, 'utf8');

/** 上游文件里的 token → 值。同名取第一次出现（上游把 :root 与主题块叠着写，先出现的才算数）。 */
function parseTokens(css) {
  const map = {};
  for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const v = m[2].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v) && !(m[1] in map)) map[m[1]] = v.toLowerCase();
    else if (!(m[1] in map)) map[m[1]] = v;
  }
  return map;
}

/** 沿 var() 链找到最终 hex；链上有名字不在这份文件里就返回 null（不许拿"差不多"顶替）。 */
function resolveHex(map, name, depth = 0) {
  if (depth > 8) return null;
  const v = map[name];
  if (v === undefined) return null;
  if (/^#/.test(v)) return v;
  const inner = /var\((--[\w-]+)\)/.exec(v);
  return inner ? resolveHex(map, inner[1], depth + 1) : null;
}

/** 摘出一个块的正文（含注释——标注就在注释里，这一份不能 stripComments）。
 *  按大括号配对找结尾，不用 indexOf('\n}')：后者对**单行块**（`body.theme-x { --bg: #fff; }`）
 *  要么返回 null（反向断言于是静默跳过这块），要么越过它自己读到**下一个**块的 } 并把别人的标注算在它头上。
 *  这两种都正是本文件要防的形态——反向断言恒绿比没有断言更糟。 */
function blockBody(src, selector) {
  const at = src.indexOf(selector + ' {');
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i);
  }
  return null;
}

const ANNOTATED = /^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;[^\n]*?\/\*\s*(--[\w-]+)/gm;

// 块内每一条 hex 声明（不区分几位）——比 ANNOTATED 宽，因为"省掉标注"和"把值写成 #FFF"
// 都是同一种逃法：逃出处，不逃语法。
const ANY_HEX = /^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gm;
// 十二色是本档自己钉死的科目色，出处在 :root 与 §7(a)-5c 那张表，不在官方包里。
// 给它们标一个官方 token 名才是造假出处。
const OURS_ONLY = /^--c-s\d+$/;

// 圆角那一族：官方给的是 rem，本档写的是 px，所以比对要把官方值换算过再对。
// 1rem = 16px 这个前提不是假设出来的：style.css 里 `html` 只定了 `height: 100%`，全站没有任何
// 作用在 html/:root 上的 font-size 覆盖，所以默认 16px 仍然成立。
const REM = 16;
const PX_DECL = /^\s*(--[\w-]+)\s*:\s*([\d.]+)px\s*;/gm;
const PX_ANNOTATED = /^\s*(--[\w-]+)\s*:\s*([\d.]+)px\s*;[^\n]*?\/\*\s*(--[\w-]+)/gm;

/** 沿 var() 链找到最终长度并换算成 px；链断在百分比/calc 上就返回 null（不许拿"差不多"顶替）。 */
function resolvePx(map, name, depth = 0) {
  if (depth > 8) return null;
  const v = map[name];
  if (v === undefined) return null;
  const rem = /^([\d.]+)rem$/.exec(v);
  if (rem) return Number(rem[1]) * REM;
  const px = /^([\d.]+)px$/.exec(v);
  if (px) return Number(px[1]);
  const inner = /var\((--[\w-]+)\)/.exec(v);
  return inner ? resolvePx(map, inner[1], depth + 1) : null;
}

test('T1 提交进仓库的官方副本自身可信：在册、内容哈希相符（按 LF 计）', () => {
  assert.ok(fs.existsSync(path.join(VENDOR, 'PROVENANCE.json')), `缺 ${VENDOR}/PROVENANCE.json`);
  const manifest = JSON.parse(fs.readFileSync(path.join(VENDOR, 'PROVENANCE.json'), 'utf8'));
  assert.equal(manifest.package, '@primer/primitives', '这份目录不是 @primer/primitives 的留档');
  assert.equal(manifest.version, '11.10.0', '版本与结论里写的不再是同一份——决定 6 的整个理由就是"版本决定值"');

  const listed = new Map(manifest.files_detail.map(e => [e.file, e.sha256]));
  const present = fs.readdirSync(VENDOR).filter(n => n.endsWith('.css'));
  assert.ok(present.length > 0, `${VENDOR} 里一份 css 都没有，T2 的比对无从谈起`);
  // 取哈希前把 CRLF 归一回 LF。本仓库 core.autocrlf=true 且没有 .gitattributes，
  // 换一份 clone 出来这三份 css 就是 CRLF，而 PROVENANCE.json 里记的是上游那份 LF 文件的哈希——
  // 不归一，这条断言就写成了一条「clone 之后必红」，那正是底账 §8 当初否掉"探针不进 CI"的理由。
  // 归一不削弱它要防的东西：防的是**内容**被改（一个 hex 位就翻哈希），行尾不是内容。
  const sha256 = (p) => crypto.createHash('sha256')
    .update(fs.readFileSync(p).toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
  for (const f of present) {
    const want = listed.get(f);
    assert.ok(want, `${f} 出现在 vendor 目录里却没写进 PROVENANCE.json 的 files_detail——加文件不走登记，等于给 T2 换了个源`);
    assert.equal(sha256(path.join(VENDOR, f)), want,
      `${f} 的 sha256 与 PROVENANCE.json 不符（按 LF 计）：这份副本被改过，T2 拿它当官方就是在拿改动当官方`);
  }
  for (const file of [RADIUS_FILE, ...Object.values(SOURCES)]) {
    assert.ok(present.includes(file), `SOURCES/RADIUS_FILE 引用了 ${file}，目录里却没有`);
  }
});

test('T2 在册块里每条 hex 都有官方 token 标注，且逐值与那份官方文件相等', () => {
  const src = readCss();
  for (const [block, file] of Object.entries(SOURCES)) {
    const body = blockBody(src, block);
    assert.ok(body, `style.css 里找不到 ${block} 块——它被删了还是改名了？这张表跟着 §7(a)-7d 一起在册`);
    const map = parseTokens(fs.readFileSync(path.join(VENDOR, file), 'utf8'));
    const rows = [...body.matchAll(ANNOTATED)];

    // 完整性：块内每一条 hex 声明都必须带官方 token 标注（十二色除外）。
    // 原来这里是一条「标注数 ≥ 8」的地板，只挡住"全删光"——删掉 13 条里的 5 条照样绿，
    // 而那 5 个值从此不再对着官方文件比一次。决定 6 的整个理由是"每个值都能按 token 名找到出处"，
    // 缺一条标注就是缺一次可查，不是缺一种风格。
    // 判据拿 ANNOTATED 已经查过的那批属性名做集合差，而不是另写一套"行里有 /*"的猜测：
    // 两者口径若不一致，就会有一条值绕过逐值比对却在本条判绿（注释写在声明前面的形状）。
    const checked = new Set(rows.map(([, tok]) => tok));
    const naked = [];
    for (const m of body.matchAll(ANY_HEX)) {
      if (OURS_ONLY.test(m[1])) continue;
      if (!checked.has(m[1])) naked.push(`${m[1]}: ${m[2]}`);
    }
    assert.deepEqual(naked, [],
      `${block} 里有 ${naked.length} 个 hex 没有官方 token 标注：${naked.join(' / ')}——照抄的标出处，自算的另写一条 ADR，别拿空白冒充其中任何一种`);

    const bad = [];
    for (const [, tok, hex, name] of rows) {
      const up = resolveHex(map, name);
      if (up !== hex.toLowerCase()) bad.push(`${tok}=${hex} 标注写的是 ${name}，官方值是 ${up ?? '（这份文件里没有这个 token）'}`);
    }
    assert.deepEqual(bad, [], `${block} 对着 ${file}：${bad.length}/${rows.length} 个标注对不上（版本戳在说谎）`);
  }

  // 反向：别的块不许带"官方 token 名"标注。加了新品牌档却忘了进 SOURCES，
  // 正断言一行都不会替它检查——这跟 §7(a)-7a 给 TOKEN_BLOCKS 配反向断言是同一个道理。
  // 字符类里带上点：玻璃/ Discord 的暗档是 body.theme-X.dark-mode 这种复合名，
  // 只写 [a-z0-9-] 会一条都扫不到，反向断言就成了只管亮档的半条。
  const strays = [];
  for (const m of src.matchAll(/(?:^|\n)(body\.theme-[a-z0-9.-]+)\s*\{/g)) {
    const sel = m[1];
    if (SOURCES[sel]) continue;
    const body = blockBody(src, sel);
    // 摘不出正文不当"没问题"：那一格恰恰是静默漏检的位置。
    if (body === null) { strays.push(`${sel}（正文摘不出来——块没闭合，还是被上一处的同名选择器挡住了？）`); continue; }
    // 两类标注都算"声称照抄"：只扫 hex 的话，一块全是自算颜色、圆角抄官方的新主题能溜过反向断言。
    if ([...body.matchAll(ANNOTATED)].length || [...body.matchAll(PX_ANNOTATED)].length) strays.push(sel);
  }
  assert.deepEqual(strays, [], `这些块带官方 token 标注却不在 SOURCES 里：${strays.join(', ')}——要么登记进来，要么把标注删掉（自算的值不许冒充照抄）`);
});

test('T3 圆角行的 rem→px 换算与 size/radius.css 对得上，一行都不许缺标注', () => {
  // 为什么要这一条：radius.css 被 T1 的哈希钉住了，却没有任何一条断言读它——
  // 那意味着 `/* --borderRadius-medium (0.375rem) */` 这行标注说谎是免费的，
  // 而决定 6 的整个理由就是"标注必须可查"。四行圆角在亮暗两块里各标一份，全空网才闭上。
  const src = readCss();
  const map = parseTokens(fs.readFileSync(path.join(VENDOR, RADIUS_FILE), 'utf8'));
  for (const block of Object.keys(SOURCES)) {
    const body = blockBody(src, block);
    assert.ok(body, `style.css 里找不到 ${block} 块`);
    // 本表只管圆角那一族（`--r-*`）：radius.css 是半径阶梯的源，别的 px 行不归它证。
    // 收窄在这一行，不在"要不要标注"那一行——下面那条 borrowed 反向断言盯着反面：
    // 谁把非圆角族的 px 行标上官方 token 名，就是拿一份没在册的上游给自己作保，当场判红。
    const isRadius = tok => /^--r-/.test(tok);
    const decls = [...body.matchAll(PX_DECL)].filter(([_, tok]) => isRadius(tok));
    const others = [...body.matchAll(PX_ANNOTATED)].filter(([_, tok]) => !isRadius(tok))
      .map(([_, tok, , name]) => `${tok}（标了 ${name}）`);
    assert.deepEqual(others, [],
      `${block} 里有非 --r-* 的 px 行标了官方 token 名：${others.join(' / ')}——` +
      `radius.css 只给半径作保；要给别的字段找出处，先加进 SOURCES，别借现成的文件冒充`);
    // 地板按"声明"数而不是"标注"数算：完整性判据是相对声明而言的，声明被删光时它自己看不见自己。
    // （§7(a)-5c 的逐字钉死也会响，但那一响在另一个文件里，这支测试不该只在它缺席时才工作。）
    assert.ok(decls.length >= 4, `${block} 只有 ${decls.length} 条 px 圆角声明——亮档那块 sm/md/lg/pill 是四条，删声明是关网的办法之一`);
    const rows = new Map([...body.matchAll(PX_ANNOTATED)].filter(([_, tok]) => isRadius(tok))
      .map(([, tok, px, name]) => [tok, { px, name }]));
    const naked = decls.filter(([, tok]) => !rows.has(tok)).map(([, tok, px]) => `${tok}: ${px}px`);
    assert.deepEqual(naked, [],
      `${block} 里有 ${naked.length} 条 px 圆角没有官方 token 标注：${naked.join(' / ')}——本档的圆角是照抄官方阶梯的，缺一行标注就少一次可查`);
    const bad = [];
    for (const [tok, { px, name }] of rows) {
      const up = resolvePx(map, name);
      if (up === null) bad.push(`${tok}=${px}px 标注写的是 ${name}，${RADIUS_FILE} 里解析不出长度`);
      else if (Math.abs(up - Number(px)) > 0.01) bad.push(`${tok}=${px}px，官方 ${name} 换算是 ${up}px`);
    }
    assert.deepEqual(bad, [], `${block} 对着 ${RADIUS_FILE}：${bad.length} 行换算对不上（版本戳在说谎）${bad.length ? '：' + bad.join(' / ') : ''}`);
  }
});
