#!/usr/bin/env bash
# ============================================================
# tools/build-portable.sh
# 构建「班级作业墙」Windows x64 绿色版（免安装 / 解压即用）
#
# 产物:
#   release/homework-tracker-portable/               解压即用的目录
#   release/homework-tracker-portable/BUILD.txt      包内产物戳（版本标识/日期/门禁读数）
#   release/homework-tracker-portable-<YYYYMMDD>.zip 分发包（名字带出包当天，见 ADR-0014）
#
# 用法: bash tools/build-portable.sh
# 依赖: 本机已安装 Node（用于提供 node.exe 运行时）+ 已 npm install
#       + 仓库根有 git（取版本标识；取不到时 BUILD.txt 记 unknown，不影响出包）
#
# 两个闸门，动这个脚本前先读一遍：
#   ① 出包前跑 node --test，红则中止——顺序是故意的：门禁放在任何 rm 之前，
#      否则一个坏包会顺手把上一代包一起毁掉（见下面「0. 出包前门禁」那段）。
#   ② 本脚本会 rm -rf 上面那个固定名的目录、并 rm -f 当天同名的 zip。
#      release/ 不被 git 跟踪，删了取不回来 —— 出包前先把上一代产物改名移进
#      release/archive/ 留档（ADR-0014 后果 3）。
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/release"
DIST="$OUT_DIR/homework-tracker-portable"
NODE_EXE_SRC="${NODE_EXE_SRC:-$(command -v node || true)}"

echo "==> 源目录   : $ROOT"
echo "==> 产物目录 : $DIST"
echo "==> 运行时   : $NODE_EXE_SRC"

# ---------- 前置检查 ----------
if [ -z "$NODE_EXE_SRC" ] || [ ! -f "$NODE_EXE_SRC" ]; then
  echo "错误：找不到 node 可执行文件（可用 NODE_EXE_SRC 环境变量指定）" >&2
  exit 1
fi

NATIVE_BIN="$ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [ ! -f "$NATIVE_BIN" ]; then
  echo "错误：better-sqlite3 原生模块未编译，请先在项目根目录执行 npm install" >&2
  exit 1
fi

# ---------- 0. 出包前门禁 ----------
# 为什么排在删任何东西之前：release/ 不在版本控制里（.gitignore），旧产物一旦
# 被 rm -rf 掉就取不回来。门禁红的时刻，上一代包必须还原样躺在那儿。
echo "==> 出包前跑自动检查（node --test，在删任何产物之前）"
GATE_OUT="$(cd "$ROOT" && node --test --test-reporter=tap 2>&1 | grep -E '^# (tests|suites|pass|fail|cancelled|skipped|todo)' || true)"
gate_num() { printf '%s\n' "$GATE_OUT" | sed -n "s/^# $1 \([0-9]*\)\$/\1/p"; }
GATE_TESTS="$(gate_num tests)"; GATE_PASS="$(gate_num pass)"; GATE_FAIL="$(gate_num fail)"
GATE_CANCELLED="$(gate_num cancelled)"; GATE_SKIPPED="$(gate_num skipped)"; GATE_TODO="$(gate_num todo)"
# 「一条测试都没跑」不是绿灯：测试目录被挪走时读数是 tests 0 / pass 0 / fail 0，
# 只判 fail==0 就放行了一个什么都没验的包。所以要条数 > 0，且各账相加要平。
if [ "${GATE_TESTS:-0}" -lt 1 ] || [ "${GATE_FAIL:-x}" != "0" ] || [ "${GATE_CANCELLED:-x}" != "0" ] \
   || [ $(( ${GATE_PASS:-0} + ${GATE_SKIPPED:-0} + ${GATE_TODO:-0} )) -ne "${GATE_TESTS:-0}" ]; then
  echo "错误：自动检查没过或读数不平（tests=${GATE_TESTS:-?} pass=${GATE_PASS:-?} fail=${GATE_FAIL:-?} cancelled=${GATE_CANCELLED:-?}）。" >&2
  echo "      已中止，未删任何旧产物。" >&2
  exit 1
fi
echo "    门禁: tests $GATE_TESTS / pass $GATE_PASS / fail 0 / skipped $GATE_SKIPPED / todo $GATE_TODO"

# ---------- 1. 清理并建目录 ----------
rm -rf "$DIST"
mkdir -p "$DIST"

# ---------- 2. Node 运行时 ----------
echo "==> 拷贝 Node 运行时"
cp "$NODE_EXE_SRC" "$DIST/node.exe"

# ---------- 3. 应用代码 ----------
echo "==> 拷贝应用代码"
for f in server.js db.js package.json; do
  cp "$ROOT/$f" "$DIST/$f"
done
cp -r "$ROOT/api" "$DIST/api"
cp -r "$ROOT/public" "$DIST/public"

# ---------- 4. 生产依赖 ----------
echo "==> 拷贝生产依赖"
cp -r "$ROOT/node_modules" "$DIST/node_modules"

# ---------- 5. 精简 better-sqlite3 ----------
# 运行时只需 lib/ 与 build/Release/better_sqlite3.node；
# deps/（C 源码）、src/、build 下的编译中间产物（.obj/.pdb/.lib 等）均可删。
echo "==> 精简原生模块（移除编译中间产物）"
BS="$DIST/node_modules/better-sqlite3"
rm -rf "$BS/deps" "$BS/src" "$BS/binding.gyp" "$BS/build/deps"
find "$BS/build" -type f ! -path '*/Release/better_sqlite3.node' -delete
find "$BS/build" -type d -empty -delete

# ---------- 6. 启动脚本 ----------
echo "==> 生成启动脚本"
# 正文一律 ASCII：cmd 按控制台代码页读 .bat 的字节，正文里写中文，
# 代码页不对的机器上会整片乱码（路径里的中文反而没事——cmd 本身走 UTF-16）。
# 所以启动窗口里的提示是英文，中文说明交给 README.txt（UTF-8 带 BOM，记事本认）。
cat > "$DIST/start.bat" <<'BATEOF'
@echo off
cd /d "%~dp0"
title Homework Wall

echo.
echo   ============================================
echo      Homework Wall
echo   ============================================
echo.
echo   Starting the local server... your browser will open
echo   at  http://localhost:3000
echo   If it does not open, type  http://localhost:3000
echo   into the browser address bar yourself.
echo.
echo   Keep this window open while you teach.
echo   Closing this window stops the server.
echo   Chinese guide: README.txt in this folder.
echo.

rem open the browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

"%~dp0node.exe" server.js

echo.
echo   Server stopped. Press any key to close this window...
pause >nul
BATEOF

# bat 需 CRLF 换行（正文已全 ASCII，不再需要转码）
sed -i 's/\r$//; s/$/\r/' "$DIST/start.bat"

# ---------- 7. 使用说明 ----------
echo "==> 生成使用说明"
cat > "$DIST/README.txt" <<'DOCEOF'
班级作业墙 · 绿色版（Windows 64 位）
================================================

【手上这份是哪个版本】
  想知道这个包是哪一天做的、对应哪一次改动，看同目录的 BUILD.txt。
  它写着版本标识、构建日期时间，以及出包那一刻全部自动检查的通过数。

【怎么用】
  1. 把整个文件夹解压到任意位置（如 D:\作业墙）。
  2. 双击 start.bat
  3. 浏览器会自动打开 http://localhost:3000
     若没自动打开，手动在浏览器地址栏输入 http://localhost:3000
  4. 关闭那个黑色命令行窗口，就是停止服务。
  那个黑窗口里有三类内容，都不用读：开头几行英文是启动脚本打的，接着几行带符号的中文是
  服务自己报的进度（✅ 那几行），之后页面每 5 秒自动刷新一次就滚两行访问记录，所以它会一直动。
  只认一条就够：窗口一直开着 = 服务在跑；关掉这个窗口 = 停止服务。
  第一次开机时 Windows 可能弹防火墙提示，选"允许访问"即可；不弹也照常能用。

【不需要安装任何东西】
  本包已内含 Node 运行时（node.exe），无需安装 Node.js、无需联网、
  无需 npm install。解压即可用。

【投影/一体机展示】
  http://localhost:3000 打开就是展示态：整屏科目网格、每 5 秒自动刷新一次、不显示任何编辑按钮。
  右上角那一簇只有两样东西：当前的时间，和「退出展示」那颗钮。
  刷新页面、重开机、上课中途按 F5，都会落回展示态——它是这台机器的常驻态。
  要录入作业点右上角「退出展示」进编辑态。
  闲置 5 分钟会自动弹回展示态；第 4 分钟起屏上会先提示一句「即将回到展示，继续编辑请点一下屏幕」，
  这期间碰一下屏幕或按任意键就重新计时。录入弹窗开着的时候不倒计时——
  写到一半的内容不会因为人走开被吞掉。
  可通过地址参数预设字号：http://localhost:3000/?scale=1.3
  （?show=1 现在只是上面这个地址的等价别名，老书签照常能用。）
  注意：展示态的「只读」只是界面隐藏，不是权限控制 —— 局域网内任何设备仍可直接调用
  接口增删改作业。请只在可信的教室局域网内使用。

【墙上挂的是哪一天】
  打开时墙上挂今天。编辑态顶栏第二行有左右箭头（前一天 / 后一天）和一颗「今天」。
  有一件事要留意：回到展示态不会自动带回今天，而展示态的墙面上根本不写日期。
  也就是说，若翻了昨天再收工，大屏幕上会一直挂着昨天那面墙，看着却像今天的。
  养成一个习惯就没事：录完先点「今天」，再点顶栏上那颗「展示」收工。
  整面墙空着时的句子会跟着你正在看的那一天变（见下面「墙上是怎么排的」）。

【界面可以换样子（主题与暗色）】
  主题一共 3 套：白板（默认）、GitHub、玻璃；每套各有明亮、昏暗两档。
  换的只是长相——字还是那些字，六个格子还在老位置，一科一条的规则一点没动。
  入口只有两处，都在编辑态顶栏第二行（工具行）上：
    · 「主题 · 白板」这颗按钮：点一下在它下面展开选项，点中一档就切过去并自动收起。
      按钮上一直写着当前用的哪套，不打开也读得出来。
    · 它旁边那颗月亮图标的是「暗色模式」：只管明亮 / 昏暗这一档，不是第四套主题。
  展示态拿不到这两颗（整条顶栏是隐藏的），投影时换不了脸；要改先「退出展示」。
  第一次打开时，如果这台机器本身的系统是深色，界面会跟着暗下来——这是正常现象，
  按那颗「暗色模式」就切回亮档。主题则永远不跟系统走，没手动选过就是白板。
  玻璃档改的是浮层的质感（弹窗、主题选项那一层会有一点透和模糊）。
  特别说明：它透的是本页自己的内容，换桌面壁纸不会有任何变化。
  这些选择存在浏览器的本地记录里，不在 homework.db 里。所以换一台机器、换一个浏览器、
  或清过一次浏览器记录，主题与字号都会回到默认——数据不会丢，只是长相要重新调一遍。

【墙上是怎么排的】
  一科一条：每个科目每一天在墙上只有一条作业。一门课今天要留两件事，就在这条作业里
  换行写（回车），墙上照原样分行显示。想给同一科再存第二条会被直接挡回来并提示
  「……已经有一条作业了；一科一条，请直接改那一条」——去改那条已有的就行。
  六格常驻：语文、数学、英语、物理、化学、生物这六格天天都在，位置固定，
  左上第一格永远是语文。后排可以靠位置记住哪一科在哪。
  未布置：某个格子当天没有作业时，格子里就写「未布置」两个字。它是陈述不是报错，
  意思是「这一科今天没留」。整面墙一条都没有时是另一句话，且跟着看的那一天换措辞：
  今天「今日作业待公布」、明天「明日作业待公布」、昨天「昨天未布置作业」。
  科目就是这六科：录入时点六个科目按钮之一，没有输入框可打新名字。想加一门（如「政治」）
  加不了——保存会被挡回来并提示「科目只有这六科」。老数据里若有表外科目，仍照常上墙，
  排在六个主科后面。
  科目多于六个、或某条作业特别长，装不下时屏幕会先压间距、再缩字号；缩到可读下限
  仍装不下，整面墙才会出现上下滚动（不会自动翻页，也不会把作业藏起来）。

【怎么加一条、改一条】
  加：编辑态点顶栏上那颗「+ 添加作业」，弹窗里先点六个科目按钮之一，再写正文，保存。
  改：编辑态下点墙上那一行的任意位置就能改它——不必去对准一个小按钮。
      触屏上点正文任意处即可；没有长按菜单，也没有拖拽排序（顺序由科目本身决定）。
  行内只有一个删除钮，删除会先问一次（「确定要删除这条作业吗？」），
  删掉后该科格子变成「未布置」，不是从墙上消失。
  如果新建窗口里已经写了字，再去点一门当天已有作业的科目，写着的字不会丢；
  这时保存会提示那一科已经有一条了，让你去改那一条，而不是存出第二条。
  顶栏右上角还有一颗向上的箭头是「收起顶栏」：点下去整条工具行会藏起来，
  屏幕上只留一条写着「显示顶栏」的横条，按它就回来——没有"只藏一半控件"的中间态。

【数据存在哪】
  文件夹里的 homework.db 就是全部数据（SQLite 单文件，非 WAL 模式）。
  备份 = 复制这个文件；换电脑 = 把它拷到新文件夹根目录即可。
  （建议在没人正在录入作业时复制：正在写入的那一瞬间复制可能拿到不完整的一份。）
  这个包不含 homework.db：第一次运行会自动创建一个含预设科目
  （语文/数学/…/生物）、0 条作业的空库，所以上课第一次打开是满墙「未布置」，不是坏了。
  六个主科每次启动都会被补齐回来（只补没有的，表外科目和改过的名字都不动），
  所以「墙上这六格一定在」这件事不依赖数据库里现在有几行。

【局域网让其它设备访问（可选）】
  服务默认监听 0.0.0.0，同一局域网内可用本机 IP 访问：
      http://<本机IP>:3000
  首次启动时 Windows 可能弹出防火墙提示，选择"允许访问"。
  查看本机 IP：命令行执行 ipconfig

【常见问题】
  · 双击后浏览器打不开 / 页面无法访问
      - 看命令行窗口有没有报错；确认 3000 端口未被其它程序占用。
  · 打开就是深色界面
      - 那是跟随了系统的深色设置，点编辑态顶栏那颗月亮图标即可切回亮档。
  · 墙上一片「未布置」，可明明今天留了作业
      - 多半是日期还停在昨天或明天：进编辑态点「今天」（这颗钮只在编辑态出现）。
  · 想换端口
      - 编辑 start.bat，在最后一行前加一行：set PORT=8080
      - 注意：这一行写在 start.bat 里。以后用新包覆盖旧目录时 start.bat 会被换掉，
        端口要重新加一次。
  · 杀毒软件报警
      - node.exe 是官方 Node 运行时，被误报时请加白名单。
  · 提示缺少 VCRUNTIME140.dll
      - 安装微软「Visual C++ 2015-2022 运行库 (x64)」后重试。
        （Windows 10/11 通常已自带，无需处理。）

【文件说明】
  node.exe        Node 运行时（约 92MB）
  start.bat       双击启动
  server.js       服务入口
  api/  public/   后端接口与前端页面
  db.js           数据库封装
  node_modules/   依赖库（含 better-sqlite3 原生模块）
  BUILD.txt       这个包是哪个版本、什么时候做的
  README.txt      本说明
  homework.db     数据库文件（首次运行后出现）

技术栈：Node.js + Express + SQLite
DOCEOF

# README.txt 的 BOM 与行尾归一并交给下面的 8b：BUILD.txt 和它是同一类文件（都是给人
# 不能只给一份打 BOM、另一份裸着发出去（实测本轮 BUILD.txt 就是裸的）。

# ---------- 8. 产物戳 BUILD.txt ----------
# 存在的理由：package.json 的 version 自基线起没动过，两代包会字节同标签，
# 而界面上不显示版本（ADR-0014 决定 2）。node -v 取的是**包内那个 node.exe**，
# 不是打包机的 node——别人问「教室里跑的哪个运行时」，答的是前者。
echo "==> 生成 BUILD.txt"
BUILD_DATE="$(date '+%Y-%m-%d %H:%M:%S %z')"
BUILD_COMMIT="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [ -n "$(cd "$ROOT" && git status --porcelain 2>/dev/null)" ]; then
  BUILD_TREE="不干净（含未提交改动）"
else
  BUILD_TREE="干净"
fi
BUILD_NODE="$("$DIST/node.exe" -v 2>/dev/null || echo unknown)"
cat > "$DIST/BUILD.txt" <<BUILDEOF
班级作业墙 · 绿色版 — 产物戳
================================================
本包是谁      : 班级作业墙（Node.js + Express + SQLite），用法见同目录 README.txt
版本标识      : $BUILD_COMMIT
构建时工作区  : $BUILD_TREE
构建日期      : $BUILD_DATE
包内 Node     : $BUILD_NODE
出包前自动检查: tests $GATE_TESTS / pass $GATE_PASS / fail 0 / skipped $GATE_SKIPPED（node --test，一条都没跑不算通过）
数据          : 本包不含 homework.db，首次运行自建含六科、0 条作业的空库
================================================
这一份只在本机生成，不进版本控制（release/ 被 .gitignore 排除）。
BUILDEOF

# ---------- 8b. 两份 .txt 归一：UTF-8 BOM + CRLF ----------
# 这两份文件的读者只有记事本，而它有两个雷：缺 BOM 时中文按 ANSI 代码页解码就是乱码，
# 纯 LF 时 Win7 那版记事本会把整份说明画成整整一行。实测：上一代包的 README.txt 是
# 「有 BOM、76 行全裸 LF」，本轮新加的 BUILD.txt 更是连 BOM 都没有——两处一起在这里收。
# 为什么用 node 而不是 sed/grep：MSYS 的 grep 与 gawk 读文件时把 \r 当行尾吞掉，
# 拿它们判行尾会把已经是 CRLF 的 start.bat 也误判成"全是裸 LF"（实测 27/27 行误判）。
echo "==> 归一 README.txt / BUILD.txt 的 BOM 与行尾"
node -e "
const fs=require('fs');
for(const p of process.argv.slice(1)){
  let s=fs.readFileSync(p).toString('utf8');
  if(s.charCodeAt(0)===0xFEFF) s=s.slice(1);
  s=s.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n');
  fs.writeFileSync(p,Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]),Buffer.from(s,'utf8')]));
}
" "$DIST/README.txt" "$DIST/BUILD.txt"

# ---------- 9. 自检 ----------
echo "==> 产物自检"
test -f "$DIST/node.exe"                                  || { echo "缺少 node.exe" >&2; exit 1; }
test -f "$DIST/server.js"                                 || { echo "缺少 server.js" >&2; exit 1; }
test -f "$DIST/start.bat"                                 || { echo "缺少 start.bat" >&2; exit 1; }
test -f "$DIST/node_modules/better-sqlite3/build/Release/better_sqlite3.node" || { echo "缺少原生模块" >&2; exit 1; }
# 下面这几条是 2026-09-25 补的：原来那四条只看 node.exe/server.js/start.bat/原生模块，
# 恰好不含本轮唯一实质改动的两处——前端文件与 README.txt。
test -f "$DIST/README.txt"  || { echo "缺少 README.txt" >&2; exit 1; }
test -f "$DIST/BUILD.txt"   || { echo "缺少 BUILD.txt" >&2; exit 1; }
# 归一那步的回判：按字节数 BOM / CRLF / 裸 LF，不看上一步有没有报错——自报成功不是读数。
node -e "
const fs=require('fs');
for(const p of process.argv.slice(1)){
  const b=fs.readFileSync(p), s=b.toString('latin1');
  const crlf=(s.match(/\r\n/g)||[]).length;
  const bare=(s.replace(/\r\n/g,'').match(/\n/g)||[]).length;
  const bom=b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF;
  if(!bom||bare!==0||crlf===0){console.error('    BOM/CRLF 形态不对: '+p+' BOM='+bom+' CRLF='+crlf+' 裸LF='+bare);process.exit(1);}
}
" "$DIST/README.txt" "$DIST/BUILD.txt" || exit 1
for f in public/index.html public/style.css public/js/ui.js public/js/main.js public/js/state.js; do
  cmp -s "$ROOT/$f" "$DIST/$f" || { echo "产物与源不一致: $f" >&2; exit 1; }
done
# 说明书里没提主题 = 这一族又漏了（上一代包正是这么发出去的）。
grep -q "主题" "$DIST/README.txt" || { echo "README.txt 里一次都没提主题" >&2; exit 1; }
# 段数下限：2026-09-25 逐条校完那份说明书是 12 段（每个【小标题】一段）。
# 只判下限——以后加段落不必改这里，heredoc 被截断/整段丢掉才会响。
test "$(LC_ALL=C grep -c '^【' "$DIST/README.txt")" -ge 12 \
  || { echo "README.txt 段落数不足 12，说明书疑似被截断" >&2; exit 1; }

# 说明书里的主题数与档名，必须和弹层那份名单同源。名单只有一份，写在 ui.js 的
# THEME_NAMES / THEME_LABELS 里（门禁 §7(a)-7c 双向钉着它），而说明书用中文又数了一遍。
# 上一代包发出去时说明书对主题一个字都没提（ADR-0014 后果 1），那是这一族唯一能机检的读数。
# 对不上就停下改说明书，不要在这里改名单——改名单是另一条票的事。
node -e "
const fs=require('fs');
const ui=fs.readFileSync(process.argv[1],'utf8');
const rd=fs.readFileSync(process.argv[2],'utf8');
const nm=(ui.match(/var THEME_NAMES = \[([^\]]*)\]/)||[,''])[1];
const names=nm.split(',').map(s=>s.trim()).filter(Boolean);
const lb=(ui.match(/var THEME_LABELS = \{([^}]*)\}/)||[,''])[1];
const labels=[...lb.matchAll(/:\s*'([^']+)'/g)].map(m=>m[1]);
if(names.length!==labels.length){console.error('    ui.js 自己就不对齐：名单 '+names.length+' 个、标签 '+labels.length+' 个');process.exit(1);}
const said=(rd.match(/主题一共 ([0-9]+) 套/)||[,''])[1];
if(said===''){console.error('    README.txt 里找不到「主题一共 N 套」这句话');process.exit(1);}
if(+said!==names.length){console.error('    说明书说「主题一共 '+said+' 套」，名单里却是 '+names.length+' 个（'+labels.join('/')+'）→ 改 README.txt 那一族');process.exit(1);}
const miss=labels.filter(l=>!rd.includes(l));
if(miss.length){console.error('    名单里的档名说明书没提：'+miss.join('、')+' → 改 README.txt 那一族');process.exit(1);}
console.log('    主题档数与档名同源: '+names.length+' 套 · '+labels.join('/'));
" "$DIST/public/js/ui.js" "$DIST/README.txt" || exit 1
grep -q "BUILD_COMMIT=\|版本标识" "$DIST/BUILD.txt" || { echo "BUILD.txt 缺版本标识" >&2; exit 1; }
# start.bat 正文必须全 ASCII：cmd 按控制台代码页读它，非 ASCII 字节在代码页不对的机器上就是乱码。
if sed 's/\r$//' "$DIST/start.bat" | LC_ALL=C grep -q '[^ -~]'; then
  echo "start.bat 正文含非 ASCII 字节 —— 会在非中文代码页的机器上乱码" >&2; exit 1
fi
echo "    OK"

# ---------- 10. 打包 ----------
# 注意：不能用 PowerShell 5.1 的 Compress-Archive —— 它生成的 zip 用反斜杠作
# 路径分隔符（违反 ZIP 规范），标准解压工具（unzip / macOS 归档工具）会路径错乱。
# 改用 bsdtar（libarchive）或 pwsh（.NET Core），二者都按规范写正斜杠。
echo "==> 打包 zip"
ZIP="$OUT_DIR/homework-tracker-portable-$(date +%Y%m%d).zip"   # 带日期：ADR-0014 决定 2
rm -f "$ZIP"

packed=""
LIST=""      # 列 zip 清单用的命令，跟着上面选中的打包器走
if [ -x /c/Windows/System32/tar.exe ]; then
  /c/Windows/System32/tar.exe -a -cf "$ZIP" -C "$OUT_DIR" "homework-tracker-portable" \
    && { packed="bsdtar"; LIST="/c/Windows/System32/tar.exe -tf"; }
elif command -v bsdtar >/dev/null 2>&1; then
  bsdtar -a -cf "$ZIP" -C "$OUT_DIR" "homework-tracker-portable" \
    && { packed="bsdtar"; LIST="bsdtar -tf"; }
elif command -v pwsh >/dev/null 2>&1; then
  ZIP_WIN="$(cygpath -w "$ZIP")"
  DIST_WIN="$(cygpath -w "$DIST")"
  pwsh -NoProfile -Command "Compress-Archive -Path '$DIST_WIN' -DestinationPath '$ZIP_WIN' -Force" >/dev/null && packed="pwsh"
fi

if [ -z "$packed" ]; then
  echo "错误：找不到符合 ZIP 规范的打包工具（需要 bsdtar 或 pwsh）" >&2
  exit 1
fi
echo "    打包器: $packed"

# 产物级自证：不看打包器的返回码，看 zip 本体里到底有没有这几样。脚本上一轮自检全绿、
# 压缩包却是空壳或少了入口，这种「工具自报成功而产物没有」的账只能这样平。
if [ -n "$LIST" ]; then
  for f in homework-tracker-portable/README.txt \
           homework-tracker-portable/BUILD.txt \
           homework-tracker-portable/start.bat \
           homework-tracker-portable/node.exe \
           homework-tracker-portable/node_modules/better-sqlite3/build/Release/better_sqlite3.node; do
    $LIST "$ZIP" 2>/dev/null | grep -qxF "$f" || { echo "压缩包里缺少 $f" >&2; exit 1; }
  done
  test -z "$($LIST "$ZIP" 2>/dev/null | grep '/homework\.db' || true)" \
    || { echo "压缩包里出现了 homework.db——本包必须不含数据（ADR-0014）" >&2; exit 1; }
  echo "    zip 清单: $($LIST "$ZIP" | wc -l | tr -d ' ') 条，入口与两份说明书逐条在位，且不含 homework.db"
else
  echo "    注意：打包器是 pwsh，本机不走这条分支，zip 清单判据未执行" >&2
fi

echo ""
echo "==> 完成"
echo "    目录 : $DIST"
echo "    压缩包: $ZIP"
du -sh "$DIST" "$ZIP" 2>/dev/null || true
