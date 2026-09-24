/**
 * test/style-invariants.test.js — 视觉体系的代码不变量（spec §7(a)）
 *
 * 为什么要有这个文件：本轮把几十处散落的取值收进了 token。收进去之后，最可能的
 * 退化方式不是"有人写了 bug"，而是"有人图省事又写回一个裸数字 / 借一门科目色
 * 当错误色"。这类退化肉眼看不出来、diff 里也不起眼，所以用断言钉住。
 *
 * 解析器只有几十行：style.css 是手写的、没有预处理器嵌套，只需要规则块 + @media。
 * 不为此引入 postcss。
 *
 * 运行：npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const FONT_DIR = path.join(__dirname, '..', 'public', 'fonts');
const THEME_ROSTER_FILE = path.join(__dirname, '..', 'public', 'js', 'ui.js');
const INDEX_HTML_FILE = path.join(__dirname, '..', 'public', 'index.html');

/** 注释里的十六进制（"暗色下 #a0a0a0"）不是声明，先整片摘掉。 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

const SRC = stripComments(CSS);

/**
 * 把 CSS 拍平成 [{ selector, decls: [{prop, value}] }]。
 * @media / @supports 是分组规则，不产出条目，只把内部的块按原选择器继续收集——
 * 断言关心"哪条选择器用了什么值"，不关心它在哪条媒体查询里。
 */
function parseRules(src) {
  const rules = [];
  let buf = '';
  const stack = [];
  for (const ch of src) {
    if (ch === '{') {
      stack.push({ selector: buf.trim().replace(/\s+/g, ' '), body: '' });
      buf = '';
      continue;
    }
    if (ch === '}') {
      const top = stack.pop();
      buf = '';
      if (!top) continue;
      if (/^@(media|supports)\b/.test(top.selector)) {
        for (const inner of parseRules(top.body)) rules.push(inner);
      } else {
        rules.push({ selector: top.selector, decls: parseDecls(top.body) });
      }
      continue;
    }
    buf += ch;
    if (stack.length) stack[stack.length - 1].body += ch;
  }
  return rules;
}

function parseDecls(body) {
  return body.split(';')
    .map(d => d.trim())
    .filter(Boolean)
    .map(d => {
      const i = d.indexOf(':');
      return i < 0 ? { prop: '', value: '' } : { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
    });
}

const RULES = parseRules(SRC);
const declOf = (rule, prop) => rule.decls.find(d => d.prop === prop);
const blockOf = sel => RULES.find(r => r.selector === sel);
const blockAt = sel => SRC.indexOf(sel + ' {');

/* ---------- 主题轴（ADR-0012 / spec §2）：名单与字段的单一来源 ---------- */

// token 块 = 只写变量定义的块。§7(a)-2 靠它豁免，§7(a)-7 靠它认主题。
// 每加一档就要在这里在册一次——反过来，漏在册的块会被 :7(a)-7a 那条反向断言当场判红。
const TOKEN_BLOCKS = new Set([':root', 'body.dark-mode', 'body.theme-github', 'body.theme-github.dark-mode']);

// 外观族名单（"成套完整声明"的范围，spec §2 与 ADR-0012 决定 3 指的是同一份）。
// 刻意不含 --sp-*（跨主题唯一）与 --show-*（承重层，只许改名不许改值）。
// 材质族 --glass-blur/--glass-alpha/--floor-alpha 由工单 004 随 token 一起加进来：
// 现在加等于要求 GitHub 声明一个还不存在的字段。
const APPEARANCE_TOKENS = [
  '--bg', '--surface', '--ink', '--ink-dim', '--ink-faint', '--line',
  '--accent', '--accent-strong', '--on-accent', '--on-ink',
  '--success', '--danger', '--warn',
  '--c-s1', '--c-s2', '--c-s3', '--c-s4', '--c-s5', '--c-s6',
  '--c-s7', '--c-s8', '--c-s9', '--c-s10', '--c-s11', '--c-s12',
  '--r-sm', '--r-md', '--r-lg', '--r-pill', '--r-full',
];

// 主题名单只有一份，写在 ui.js 的 THEME_NAMES 里。HTML 里出现任何一档名字都是复制。
const UIJS = fs.readFileSync(THEME_ROSTER_FILE, 'utf8');
const THEME_NAMES = ((UIJS.match(/THEME_NAMES\s*=\s*\[([^\]]*)\]/) || [, ''])[1])
  .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
const THEME_BLOCKS = [...TOKEN_BLOCKS].filter(s => /^body\.theme-/.test(s));

test('解析器本身可信：认不出这几条已知选择器就说明解析坏了', () => {
  // 'body.theme-github' 是主题化的探针：解析器读不到新块，003-005 的所有读数都是瞎的。
  // 带 .dark-mode 的那一条读的是**复合选择器**——解析器只测过单类名的块，
  // 而 004/005 的玻璃两档全靠这一层，读不到它就会把"块不存在"当成"值不达标"报出去。
  for (const need of [':root', 'body.dark-mode', 'body.theme-github', 'body.theme-github.dark-mode',
    '.add-btn', '.exit-show-btn', '@font-face']) {
    assert.ok(blockOf(need), `解析器没找到 ${need}`);
  }
});

/* ---------- §7(a)-1 动作色只归动作（ADR-0009） ---------- */

// 墙上给学生看的选择器。动作色出现在这里 = 学生开始看到一个没有含义的蓝。
const CONTENT = /(^|[\s,>+~])(\.subject-name|\.content|\.deadline|\.hw-empty|\.empty-line|\.subject-head|\.subject-group|\.hw-row|\.hw-list|\.bar|body)\b/;
// 本轮实施后 --accent 家族实际落在这些地方，逐条列死：新增一处就要在这里显式认账。
const ACCENT_ALLOWED = new Set([
  ':where(a, button, input, select, textarea, [tabindex]):focus-visible',
  '.add-btn', '.add-btn:hover',
  '.btn-cancel:hover', '.btn-submit', '.btn-submit:hover',
  '.collapse-btn:hover', '.date-btn:hover',
  '.exit-show-btn', '.expand-bar', '.expand-bar:hover',
  '.form-group select:focus, .form-group textarea:focus, .form-group input:focus',
  '.modal-close:hover', '.mode-toggle', '.mode-toggle:hover, .mode-toggle.active',
  '.row-action-btn:hover', '.row-action-btn.del:hover',
  '.seg-opt.active',
  '.tool-btn:hover', '.tool-btn.active', '.today-btn:hover',
  '#fontSizeSlider::-webkit-slider-thumb',
]);

test('§7(a)-1 动作色只出现在控件上，内容区一次都不用', () => {
  const ACCENT = /var\(\s*--(accent|accent-strong|on-accent)\s*\)/;
  let used = 0;
  const offenders = [];
  for (const rule of RULES) {
    const hits = rule.decls.filter(d => ACCENT.test(d.value));
    if (!hits.length) continue;
    used += hits.length;
    for (const part of rule.selector.split(',')) {
      const p = part.trim();
      if (CONTENT.test(p)) offenders.push(`${rule.selector} → ${p} 是内容区`);
      else if (!ACCENT_ALLOWED.has(rule.selector) && !/:is|:where/.test(rule.selector)) {
        offenders.push(`${rule.selector} 不在已认账清单里`);
      }
    }
  }
  assert.ok(used > 0, '--accent 一次都没被用到（它又变回上一轮那个死 token 了）');
  assert.deepEqual(offenders, [], '动作色泄漏到非控件选择器');
});

/* ---------- §7(a)-1b 语义色不借科目色 ---------- */

test('§7(a)-1b 错误/成功/警示走语义 token，不再借某一科的颜色', () => {
  assert.doesNotMatch(SRC, /\.toast\.error\s*\{[^}]*--c-s/, '.toast.error 又去借科目色了');
  assert.match(SRC, /\.toast\.error\s*\{[^}]*var\(--danger\)/);
  assert.match(SRC, /\.toast\.success\s*\{[^}]*var\(--success\)/);
  assert.match(SRC, /\.offline-dot\s*\{[^}]*var\(--warn\)/, '.offline-dot 应使用 --warn');
  assert.match(SRC, /\.row-action-btn\.del:hover\s*\{[^}]*var\(--danger\)/, '删除的警示色不该是语文红');
});

/* ---------- §7(a)-2 token 块之外没有游离硬编码色 ---------- */

test('§7(a)-2 token 块之外没有游离硬编码色', () => {
  const stray = [];
  for (const rule of RULES) {
    if (TOKEN_BLOCKS.has(rule.selector)) continue;
    for (const d of rule.decls) {
      // rgba() 那几处是"压在白板上的半透明雾"，不是色板成员，允许留字面量
      if (/^rgba?\(/.test(d.value)) continue;
      if (/^--/.test(d.prop)) continue;
      if (/#[0-9a-fA-F]{3,8}\b/.test(d.value)) stray.push(`${rule.selector} { ${d.prop}: ${d.value} }`);
    }
  }
  assert.deepEqual(stray, [], '这些颜色应当来自 token 而不是写死');
});

/* ---------- §7(a)-3 间距/圆角/定位不写裸 px ---------- */

const SPACING = /^(padding|padding-\S+|margin|margin-\S+|gap|row-gap|column-gap|border-radius|top|right|bottom|left)$/;
// 允许的原生值：零、auto、相对单位、函数式。承重层变量与滑块算式各有一条具名豁免。
const OK_VALUE = /^(0|auto|inherit|initial|unset|var\(|calc\(|clamp\(|\d*\.?\d+(%|em|rem|vw|vh)|-?\d*\.?\d+$)/;

test('§7(a)-3 间距/圆角/定位不写裸 px（承重层与滑块算式除外）', () => {
  const offenders = [];
  for (const rule of RULES) {
    // 滑块 thumb 的垂直居中是算式结果：(3px 轨道 − 15px 滑块) / 2 = -6px。它不是间距选择。
    if (rule.selector === '#fontSizeSlider::-webkit-slider-thumb') continue;
    for (const d of rule.decls) {
      // 承重层变量的定义行必须写死数字（spec §4）：--show-* 一律放行
      if (/^--show-/.test(d.prop)) continue;
      if (!SPACING.test(d.prop)) continue;
      for (const v of d.value.split(/\s+/)) {
        if (OK_VALUE.test(v)) continue;
        offenders.push(`${rule.selector} { ${d.prop}: ${d.value} }`);
      }
    }
  }
  assert.deepEqual(offenders, [], '这些声明还在用裸 px，应收进 --sp-*/--r-* 阶梯');
});

/* ---------- §7(a)-4 焦点环全站一条 ---------- */

const GLOBAL_RING = ':where(a, button, input, select, textarea, [tabindex]):focus-visible';

test('§7(a)-4 焦点环全站统一，且没有任何地方把它抹掉', () => {
  assert.doesNotMatch(SRC, /outline\s*:\s*none/, '出现了 outline: none');
  assert.doesNotMatch(SRC, /outline\s*:\s*0\b/, '出现了 outline: 0');
  const rule = blockOf(GLOBAL_RING);
  assert.ok(rule, '全站 :focus-visible 规则不见了');
  assert.equal(declOf(rule, 'outline').value, '2px solid var(--accent)', '焦点环统一为动作色 2px');
  // 组件里不再各写一份：多写的每一份，都是下一个"忘了跟全站一致"的地方
  const dupes = RULES.filter(r => r.selector !== GLOBAL_RING && declOf(r, 'outline')).map(r => r.selector);
  assert.deepEqual(dupes, [], '这些规则自带 outline，绕开了全站焦点环');
});

/* ---------- §7(a)-5 承重层逐字未动 ---------- */

test('§7(a)-5 六主科色与展示态承重层逐字未动', () => {
  const FROZEN = {
    ':root': {
      '--c-s1': '#cf3227', '--c-s2': '#2f6fd0', '--c-s3': '#c23a8b',
      '--c-s4': '#0d8574', '--c-s5': '#c2410c', '--c-s6': '#2f8a2e',
    },
    'body.view-show': {
      '--show-gap-v': '32px', '--show-gap-h': '56px', '--show-row-pad': '12px',
      '--show-head-gap': '16px', '--show-deadline-gap': '20px', '--show-line-h': '1.35',
      '--show-head-pad': '6px', '--show-main-pad-v': '40px', '--show-main-pad-h': '48px',
    },
    'body.dark-mode': {
      '--c-s1': '#ff7a6e', '--c-s2': '#7fb0ff', '--c-s3': '#ff8fc8',
      '--c-s4': '#3fd6c2', '--c-s5': '#ffab5c', '--c-s6': '#7fdc78',
    },
    'body.view-show.show-dense': {
      '--show-gap-v': '12px', '--show-gap-h': '26px', '--show-row-pad': '4px',
      '--show-head-gap': '6px', '--show-deadline-gap': '4px', '--show-line-h': '1.12',
    },
  };
  for (const [sel, props] of Object.entries(FROZEN)) {
    const rule = blockOf(sel);
    assert.ok(rule, `找不到 ${sel} 块`);
    for (const [p, want] of Object.entries(props)) {
      const got = declOf(rule, p);
      assert.ok(got, `${sel} 里 ${p} 不见了`);
      assert.equal(got.value, want, `${sel} 的 ${p} 被改动——承重层只许改名，不许改值`);
    }
  }
});

test('§7(a)-5b 大屏档墙外边距仍由变量给，值一字未改', () => {
  const block = SRC.match(/@media \(min-width: 1600px\)\s*\{([\s\S]*?)\}\s*\}/);
  assert.ok(block, '1600px 媒体查询不见了');
  assert.match(block[1], /--show-main-pad-v:\s*56px/);
  assert.match(block[1], /--show-main-pad-h:\s*72px/);
});

test('§7(a)-5c 主题档整块逐字钉死：官方值不漂移，科目色不另算', () => {
  // 与 §7(a)-5 分开的理由：那一节钉的是白板承重层（"只许改名不许改值"），
  // 这一节钉的是品牌档——判据是"与官方 token 源逐字相等"（ADR-0012 决定 6）。
  // vendor/ 那份官方副本在 .scratch 下、被 gitignore，不能当测试依赖，
  // 于是"照抄官方"能落成的唯一可复核形态就是这张表：值改动必须同时改这里，改这里必须带出处。
  const PINNED = {
    'body.theme-github': {
      '--bg': '#ffffff', '--surface': '#f6f8fa',
      '--ink': '#1f2328', '--ink-dim': '#59636e', '--ink-faint': '#818b98', '--line': '#d1d9e0',
      '--accent': '#0969da', '--accent-strong': '#0550ae',
      '--on-accent': '#ffffff', '--on-ink': '#ffffff',
      '--success': '#1f883d', '--danger': '#cf222e', '--warn': '#9a6700',
      // s1~s6 与 :root 那组逐字相同 = spec 故事 7 的"复用不重算"
      '--c-s1': '#cf3227', '--c-s2': '#2f6fd0', '--c-s3': '#c23a8b',
      '--c-s4': '#0d8574', '--c-s5': '#c2410c', '--c-s6': '#2f8a2e',
      '--c-s7': '#9a7913', '--c-s8': '#4d8811', '--c-s9': '#129147',
      '--c-s10': '#1484a3', '--c-s11': '#6b18bf', '--c-s12': '#b618bf',
      '--r-sm': '3px', '--r-md': '6px', '--r-lg': '12px', '--r-pill': '6px', '--r-full': '50%',
    },
    // 暗档与亮档同族不同梯：底色/文字/边框走 --bgColor-* 与 --fgColor-* 的暗档值，
    // 动作与语义却走 **foreground** 梯而不是 emphasis 梯（理由与读数记在 style.css 那块的头注释、
    // 底账 §4 的 Class C 表，以及 ADR-0012 决定 6 的〔003 回写〕）。
    // 六色与 body.dark-mode 逐字相同 = spec 故事 7 的"复用不重算"，这张表就是它的判据。
    'body.theme-github.dark-mode': {
      '--bg': '#0d1117', '--surface': '#151b23',
      '--ink': '#f0f6fc', '--ink-dim': '#9198a1', '--ink-faint': '#656c76', '--line': '#3d444d',
      '--accent': '#388bfd', '--accent-strong': '#4493f8',
      '--on-accent': '#0d1117', '--on-ink': '#0d1117',
      '--success': '#3fb950', '--danger': '#f85149', '--warn': '#d29922',
      '--c-s1': '#ff7a6e', '--c-s2': '#7fb0ff', '--c-s3': '#ff8fc8',
      '--c-s4': '#3fd6c2', '--c-s5': '#ffab5c', '--c-s6': '#7fdc78',
      '--c-s7': '#ffe699', '--c-s8': '#ccff99', '--c-s9': '#99ffc3',
      '--c-s10': '#99e9ff', '--c-s11': '#cc99ff', '--c-s12': '#fa99ff',
      '--r-sm': '3px', '--r-md': '6px', '--r-lg': '12px', '--r-pill': '6px', '--r-full': '50%',
    },
  };
  for (const [sel, props] of Object.entries(PINNED)) {
    const rule = blockOf(sel);
    assert.ok(rule, `找不到 ${sel} 块`);
    assert.deepEqual(Object.keys(props).sort(), APPEARANCE_TOKENS.slice().sort(),
      `${sel} 的钉死表与外观族名单不同步——成套完整的值表漏了字段，漂移就没人管了`);
    for (const [p, want] of Object.entries(props)) {
      const got = declOf(rule, p);
      assert.ok(got, `${sel} 里 ${p} 不见了`);
      assert.equal(got.value, want, `${sel} 的 ${p} 与官方源/锁死组不再相等（出处见 style.css 该块的行尾标注）`);
    }
  }
});

/* ---------- §7(a)-7 主题轴：八档各自成套，且默认档逐字未动 ---------- */

test('§7(a)-7a 每条以 body.theme-* 为头的**纯 token 块**都在册', () => {
  // 扩表若不配这条反向断言，就是一张永久漏检的口子：块写了却没人当它是 token 块，
  // §7(a)-2 会把它里面的硬编码色当"游离色"判红——或者更糟，写它的人绕过了豁免。
  // 判"是不是 token 块"看形状：声明全是自定义属性才算。`body.theme-github .modal`
  // 那种组件覆写同前缀却不是 token 块，不该塞进白名单充数。
  const seen = new Set();
  for (const rule of RULES) {
    const custom = rule.decls.filter(d => /^--/.test(d.prop));
    if (!custom.length || custom.length !== rule.decls.length) continue;
    for (const part of rule.selector.split(',')) {
      const p = part.trim();
      if (/^body\.theme-/.test(p)) seen.add(p);
    }
  }
  const off = [...seen].filter(s => !TOKEN_BLOCKS.has(s));
  assert.deepEqual(off, [], `这些主题 token 块没进 TOKEN_BLOCKS：${off.join(', ')}`);
  assert.ok(seen.size >= 1, '一条 body.theme-* token 块都没有——主题轴整条没了');
});

test('§7(a)-7b 主题块一律排在 body.dark-mode 之后（同特异性靠源码顺序决胜）', () => {
  // body.dark-mode 与 body.theme-github 特异性同为 (0,1,1)，谁在后谁赢。
  // 主题块若写在暗色块之前，"选了主题暗色就丢了"只在两轴同开时出现，肉眼极易漏过。
  const darkAt = blockAt('body.dark-mode');
  assert.ok(darkAt >= 0, '找不到 body.dark-mode 块的位置');
  for (const sel of THEME_BLOCKS) {
    const at = blockAt(sel);
    assert.ok(at >= 0, `找不到 ${sel} 块的声明位置`);
    assert.ok(at > darkAt, `${sel} 写在 body.dark-mode 之前——同特异性下它会吃掉暗色档`);
  }
});

test('§7(a)-7c 主题名单只有一份：JS 数组 = CSS 块 = 非 HTML', () => {
  const cssThemes = new Set();
  for (const rule of RULES) {
    for (const part of rule.selector.split(',')) {
      const m = part.trim().match(/^body\.theme-([a-z]+)/);
      if (m) cssThemes.add(m[1]);
    }
  }
  const jsThemes = new Set(THEME_NAMES.filter(n => n !== 'whiteboard'));
  // 两边都空时下面那条 deepEqual 会假绿——名单还没填进任何东西时它不该算过。
  assert.ok(jsThemes.size >= 1, 'THEME_NAMES 里除 whiteboard 外什么都没有，这条断言无从对齐');
  assert.deepEqual([...cssThemes].sort(), [...jsThemes].sort(),
    'CSS 里的 body.theme-* 块与 ui.js 的 THEME_NAMES 不一致——名单被复制成了两份');
  const html = fs.readFileSync(INDEX_HTML_FILE, 'utf8');
  const leaked = [...jsThemes].filter(n => html.includes(`theme-${n}`));
  assert.deepEqual(leaked, [], '主题名单被抄进了 index.html，改一处漏一处');
});

test('§7(a)-7d 每个主题块把外观族 token 说满，不靠级联回落', () => {
  for (const sel of THEME_BLOCKS) {
    const rule = blockOf(sel);
    assert.ok(rule, `找不到 ${sel} 块`);
    const missing = APPEARANCE_TOKENS.filter(p => !declOf(rule, p));
    assert.deepEqual(missing, [],
      `${sel} 缺 ${missing.join(', ')}——回落会拼出「玻璃的圆角 + 白板的墨色」这种哪套都不像的混合态`);
  }
});

test('§7(a)-7e 科目色别名不许回潮', () => {
  // --c-yu..--c-sheng 只在 html 上声明，var(--c-s1) 在 html 的 computed-value time 就代完了；
  // 挂在 body 上的主题块覆写 --c-sN 追不动它们。谁写一句 color: var(--c-yu)，
  // 它在暗档、GitHub 档、玻璃档都渲染成白板风亮档红——一个不报错的错颜色。
  // 只删不钉等于没删：ADR-0011 旧措辞读起来像它们还在。SRC 已摘注释，这条量的是代码。
  assert.doesNotMatch(SRC, /--c-(yu|shu|ying|wu|hua|sheng)\b/,
    '科目色别名回潮了：主题块追不到它们，见 §7(a)-7e 注释');
});

test('§7(a)-7f 主题入口是一颗按钮，选项在默认收起的弹层里', () => {
  // ADR-0013 把 ADR-0012「主题切换入口」那条四选一常驻段钮换成"按钮 + 弹层"。
  // 换的理由是宽度账（故事 16）不是观感，所以这条断言守的正是那个理由成立的前提：
  // 入口只占一颗钮的宽度，选项在收起时**不占任何布局空间**。
  // 入口若不是 <button>（比如挂 div 的 click），读屏软件进不去；
  // 弹层若没有默认收起，工具行就比换之前更宽，这条改动白做。
  const html = fs.readFileSync(INDEX_HTML_FILE, 'utf8');
  const btn = html.match(/<button[^>]*id="themeBtn"[^>]*>/);
  assert.ok(btn, '主题入口按钮 #themeBtn 不见了');
  assert.match(btn[0], /aria-expanded="false"/, '#themeBtn 没有 aria-expanded=false——开合状态得有地方读');
  assert.match(btn[0], /aria-controls="themePop"/, '#themeBtn 没指向它控制的那个弹层');
  const pop = html.match(/<div[^>]*id="themePop"[^>]*>/);
  assert.ok(pop, '#themePop 弹层容器不见了');
  assert.match(pop[0], /class="[^"]*\bhidden\b/, '弹层默认没收起：刷新就是一条常驻选项条');
  const hide = blockOf('.theme-pop.hidden');
  assert.ok(hide && declOf(hide, 'display') && declOf(hide, 'display').value === 'none',
    '本站没有全局 .hidden——.theme-pop.hidden { display: none } 少了这条，弹层收起不了');
});

/* ---------- §7(a)-8 --bg 窗口（spec 2026-09-25 故事 8 钉在门禁上的那条实算） ---------- */

// 与 .scratch/contrast_matrix_theme_audit.mjs 同一套 WCAG 2.x 数学。抄一份而不是 import：
// .scratch 被 gitignore，门禁依赖它等于写一条 clone 之后必红的断言。
// 抄来的数学必须自证——公式敲错一位不会让窗口表变严，只会让它恒绿。
const lin = (v) => (v / 255 <= 0.04045 ? (v / 255) / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const lumOf = (hex) => {
  const h = hex.slice(1);
  return 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
};
const ratioOf = (a, b) => {
  const x = lumOf(a), y = lumOf(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('§7(a)-8a 门禁里的对比度数学自证：四个已知读数对得上', () => {
  // 前三对来自矩阵脚本的 --selftest（那里跑绿过），不是本轮现算的——
  // 现算的期望值会把抄错的公式一起洗白。
  // 第四对是**专门挑来走线性段的**：`#010409` 的三个通道 1/4/9 全在阈值那一侧（0.04045×255≈10.3，
  // 即 v ≤ 10 走 `/12.92`），`#ff7a6e` 的 255/122/110 走幂函数那一侧。
  // 前三对里 `#000000` 名义上也落线性段，但 0 怎么算都是 0——把除数 12.92 改成别的数它不响。
  // 于是线性段这条分支在只有前三对时等于没被守着。
  // 出处：底账 §2 那行"暗档六色在 #010409 上 8.08~12.14"的最小值（实算复核：8.08 是 --c-s1，最大 12.14 是 --c-s6）。
  for (const [fg, bg, want] of [['#000000', '#ffffff', 21.00], ['#767676', '#ffffff', 4.54],
    ['#263cba', '#ffffff', 8.61], ['#ff7a6e', '#010409', 8.08]]) {
    const got = ratioOf(fg, bg);
    assert.ok(Math.abs(got - want) <= 0.02, `${fg} on ${bg} 这里读到 ${got.toFixed(2)}，矩阵脚本给 ${want}——两份数学分叉了`);
  }
});

test('§7(a)-8b 每一块的 --bg 相对自己那组六色最坏读数 ≥4:1', () => {
  // 判据出处：spec 故事 8「任一 body.theme-* 块的 --bg 相对该块自己那组的六色最坏读数 ≥4:1，由门禁钉住」。
  // 白板那两块（:root / body.dark-mode）一并纳进来：故事 8 只点名主题块，但这条断言管的是
  // "有人把页底改暗一档"，这个错误对默认档同样成立，而默认档现在最坏 4.38、暗档 7.25，本来就过。
  // 地板取 4:1 不是 4.5：白板 s6 在白底只有 4.38，写 4.5 会把上一轮锁死的承重值当场判红，
  // 那是要单独裁决的改动，不是这条断言顺手能带进来的。后排能不能认出来归 008 人工裁。
  const FLOOR = 4.0;
  const SIX = ['--c-s1', '--c-s2', '--c-s3', '--c-s4', '--c-s5', '--c-s6'];
  const HEX6 = /^#[0-9a-fA-F]{6}$/;
  for (const sel of [':root', 'body.dark-mode', ...THEME_BLOCKS]) {
    const rule = blockOf(sel);
    assert.ok(rule, `找不到 ${sel} 块`);
    const bg = declOf(rule, '--bg');
    assert.ok(bg, `${sel} 里没有 --bg，窗口无从算起`);
    // 不静默跳过：读不出来就是判红。透明底算不出确定读数（Class B 死锁），
    // 而故事 9 正要求科目色所落的底是实底——这里跳过等于把那条要求丢掉。
    assert.ok(HEX6.test(bg.value), `${sel} 的 --bg 不是六位实色 hex（读到 ${bg.value}）：窗口断言要的是实底`);
    const rows = [];
    const out = [];
    for (const p of SIX) {
      const d = declOf(rule, p);
      assert.ok(d, `${sel} 里 ${p} 不见了`);
      assert.ok(HEX6.test(d.value), `${sel} 的 ${p} 不是六位实色 hex（读到 ${d.value}）`);
      const r = ratioOf(d.value, bg.value);
      rows.push(`${p} ${d.value}→${r.toFixed(2)}`);
      if (r < FLOOR) out.push(`${p} ${d.value} 只有 ${r.toFixed(2)}`);
    }
    assert.deepEqual(out, [],
      `${sel} 的 --bg=${bg.value} 不在窗内：${out.join('、')}。六格读数 ${rows.join('  ')}`);
  }
});

/* ---------- §7(a)-6 命中区不低于 44px（源码侧闸门） ---------- */

test('§7(a)-6 命中区清单里每一处的 CSS 值都不低于 44px', () => {
  const NEED = {
    '.date-btn': ['width', 'height'],
    '.today-btn': ['min-height'],
    '#fontSizeSlider': ['height'],
    '.tool-btn': ['min-height'],
    '.tool-btn.icon-only': ['min-width'],
    '.row-action-btn': ['width', 'height'],
    '.modal-close': ['width', 'height'],
    '.show-font button': ['width', 'height'],
    '.exit-show-btn': ['min-height'],
    // 主题选择器（spec 故事 15）：触控下四选一每档都要按得到。
    // min-height 写死 48px 而不是 var(--sp-8)：这条断言读 parseFloat，函数式值读不出数。
    '.theme-seg .seg-opt': ['min-height', 'min-width'],
  };
  for (const [sel, props] of Object.entries(NEED)) {
    const rule = blockOf(sel);
    assert.ok(rule, `找不到 ${sel} 块`);
    for (const p of props) {
      const d = declOf(rule, p);
      assert.ok(d, `${sel} 没有声明 ${p}`);
      assert.ok(parseFloat(d.value) >= 44, `${sel} { ${p}: ${d.value} } 低于 44px 触控下限`);
    }
  }
});

test('§7(a)-6b 触屏媒体查询不得把命中区改小', () => {
  // 原来 @media (hover:none) 里有一条 .row-action-btn { 40×40 }——触屏上反而比默认档小，
  // 正好违反"命中区只增不减"。这条断言挡住同类回潮。
  const media = SRC.match(/@media \(hover: none\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(media, 'hover:none 媒体查询不见了');
  for (const rule of parseRules(media[1])) {
    for (const p of ['width', 'height', 'min-height', 'min-width']) {
      const d = declOf(rule, p);
      if (d) assert.ok(parseFloat(d.value) >= 44, `${rule.selector} { ${p}: ${d.value} } 在触屏档被改小了`);
    }
  }
});

/* ---------- 拉丁字体资产 ---------- */

test('拉丁字体在位、许可随行，且 @font-face 与实际文件一致', () => {
  const woff2 = path.join(FONT_DIR, 'ibm-plex-sans-600-latin.woff2');
  const license = path.join(FONT_DIR, 'LICENSE-IBM-Plex-Sans.txt');
  assert.ok(fs.existsSync(woff2), 'woff2 缺失——绿色版离线时拉丁语境就没字了');
  assert.ok(fs.statSync(woff2).size > 1000, 'woff2 小得不像一份字体');
  assert.ok(fs.existsSync(license), 'SIL OFL 要求许可随字体一起分发');
  assert.match(fs.readFileSync(license, 'utf8'), /SIL OPEN FONT LICENSE/i);

  const face = blockOf('@font-face');
  assert.match(declOf(face, 'src').value, /fonts\/ibm-plex-sans-600-latin\.woff2/, 'src 路径与实际文件不一致');
  assert.equal(declOf(face, 'font-weight').value, '600');
});

test('吃了拉丁字体的规则不自造粗体（只打包了 600 一档）', () => {
  // 要的字重比在档的 600 更粗时，浏览器只能拿 600 合成假粗，笔画会糊成一团。
  // 比它轻（500/400）不会合成——那只是就近取 600，可以接受。
  const bad = [];
  for (const rule of RULES) {
    const fam = declOf(rule, 'font-family');
    if (!fam || !/var\(--font-latin\)/.test(fam.value)) continue;
    const w = declOf(rule, 'font-weight');
    if (w && parseFloat(w.value) > 600) bad.push(`${rule.selector} { font-weight: ${w.value} }`);
  }
  assert.deepEqual(bad, [], '这些规则会触发合成粗体，字形发糊');
});
