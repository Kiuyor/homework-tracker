#!/usr/bin/env bash
# ============================================================
# tools/build-portable.sh
# 构建「班级作业墙」Windows x64 绿色版（免安装 / 解压即用）
#
# 产物:
#   release/homework-tracker-portable/      解压即用的目录
#   release/homework-tracker-portable.zip   分发包
#
# 用法: bash tools/build-portable.sh
# 依赖: 本机已安装 Node（用于提供 node.exe 运行时）+ 已 npm install
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
BAT_UTF8="$DIST/start.bat.utf8"
cat > "$BAT_UTF8" <<'BATEOF'
@echo off
cd /d "%~dp0"
title 班级作业墙

echo.
echo   ============================================
echo      班级作业墙 · 绿色版
echo   ============================================
echo.
echo   正在启动本地服务，浏览器将自动打开...
echo   关闭本窗口即可停止服务。
echo.

rem 等 2 秒后自动打开浏览器
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

"%~dp0node.exe" server.js

echo.
echo   服务已停止。按任意键关闭窗口...
pause >nul
BATEOF

# bat 需 CRLF 换行；中文需转 GBK 以在 cmd 默认代码页正确显示
sed -i 's/\r$//; s/$/\r/' "$BAT_UTF8"
if command -v iconv >/dev/null 2>&1 && iconv -f UTF-8 -t GBK "$BAT_UTF8" > "$DIST/start.bat" 2>/dev/null; then
  rm -f "$BAT_UTF8"
else
  mv "$BAT_UTF8" "$DIST/start.bat"   # 无 iconv 时退化为 UTF-8
fi

# ---------- 7. 使用说明 ----------
echo "==> 生成使用说明"
cat > "$DIST/README.txt" <<'DOCEOF'
班级作业墙 · 绿色版（Windows 64 位）
================================================

【怎么用】
  1. 把整个文件夹解压到任意位置（如 D:\作业墙）。
  2. 双击 start.bat
  3. 浏览器会自动打开 http://localhost:3000
     若没自动打开，手动在浏览器地址栏输入 http://localhost:3000
  4. 关闭那个黑色命令行窗口，就是停止服务。

【不需要安装任何东西】
  本包已内含 Node 运行时（node.exe），无需安装 Node.js、无需联网、
  无需 npm install。解压即可用。

【投影/一体机展示】
  http://localhost:3000 打开就是展示态：整屏科目网格、自动刷新、不显示任何编辑按钮。
  刷新页面、重开机、上课中途按 F5，都会落回展示态——它是这台机器的常驻态。
  要录入作业点右上角「退出展示」进编辑态；闲置 5 分钟会自动弹回展示态。
  可通过地址参数预设字号：http://localhost:3000/?scale=1.3
  （?show=1 现在只是上面这个地址的等价别名，老书签照常能用。）
  注意：展示态的「只读」只是界面隐藏，不是权限控制 —— 局域网内任何设备仍可直接调用
  接口增删改作业。请只在可信的教室局域网内使用。

【墙上是怎么排的】
  一科一条：每个科目每一天在墙上只有一条作业。一门课今天要留两件事，就在这条作业里
  换行写（回车），墙上照原样分行显示。想给同一科再存第二条会被直接挡回来并提示
  「……已经有一条作业了；一科一条，请直接改那一条」——去改那条已有的就行。
  六格常驻：语文、数学、英语、物理、化学、生物这六格天天都在，位置固定，
  左上第一格永远是语文。后排可以靠位置记住哪一科在哪。
  未布置：某个格子当天没有作业时，格子里就写「未布置」两个字。它是陈述不是报错，
  意思是「这一科今天没留」。整面墙一条都没有时是另一句话「今日作业待公布」。
  科目就是这六科：录入时点六个科目按钮之一，没有输入框可打新名字。想加一门（如「政治」）
  加不了——保存会被挡回来并提示「科目只有这六科」。老数据里若有表外科目，仍照常上墙，
  排在六个主科后面。
  科目多于六个、或某条作业特别长，装不下时屏幕会先压间距、再缩字号；缩到可读下限
  仍装不下，整面墙才会出现上下滚动（不会自动翻页，也不会把作业藏起来）。

【怎么改一条作业】
  编辑态下点那一行的任意位置就能改它——不必去对准一个小按钮。行内只有一个删除钮，
  删除会先问一次，删掉后该科格子变成「未布置」，不是从墙上消失。

【数据存在哪】
  文件夹里的 homework.db 就是全部数据（SQLite 单文件，非 WAL 模式）。
  备份 = 复制这个文件；换电脑 = 把它拷到新文件夹根目录即可。
  （建议在没人正在录入作业时复制：正在写入的那一瞬间复制可能拿到不完整的一份。）
  首次运行会自动创建一个含预设科目（语文/数学/…/生物）、0 条作业的空库。
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
  · 想换端口
      - 编辑 start.bat，在最后一行前加一行：set PORT=8080
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
  homework.db     数据库文件（首次运行后出现）

技术栈：Node.js + Express + SQLite
DOCEOF

# 说明文件用 UTF-8 BOM，保证记事本正确识别中文
if command -v node >/dev/null 2>&1; then
  node -e "
    const fs=require('fs');
    const p=process.argv[1];
    const buf=fs.readFileSync(p);
    if(!(buf[0]===0xEF&&buf[1]===0xBB&&buf[2]===0xBF)) fs.writeFileSync(p,Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]),buf]));
  " "$DIST/README.txt"
fi

# ---------- 8. 自检 ----------
echo "==> 产物自检"
test -f "$DIST/node.exe"                                  || { echo "缺少 node.exe" >&2; exit 1; }
test -f "$DIST/server.js"                                 || { echo "缺少 server.js" >&2; exit 1; }
test -f "$DIST/start.bat"                                 || { echo "缺少 start.bat" >&2; exit 1; }
test -f "$DIST/node_modules/better-sqlite3/build/Release/better_sqlite3.node" || { echo "缺少原生模块" >&2; exit 1; }
echo "    OK"

# ---------- 9. 打包 ----------
# 注意：不能用 PowerShell 5.1 的 Compress-Archive —— 它生成的 zip 用反斜杠作
# 路径分隔符（违反 ZIP 规范），标准解压工具（unzip / macOS 归档工具）会路径错乱。
# 改用 bsdtar（libarchive）或 pwsh（.NET Core），二者都按规范写正斜杠。
echo "==> 打包 zip"
ZIP="$OUT_DIR/homework-tracker-portable.zip"
rm -f "$ZIP"

packed=""
if [ -x /c/Windows/System32/tar.exe ]; then
  /c/Windows/System32/tar.exe -a -cf "$ZIP" -C "$OUT_DIR" "homework-tracker-portable" && packed="bsdtar"
elif command -v bsdtar >/dev/null 2>&1; then
  bsdtar -a -cf "$ZIP" -C "$OUT_DIR" "homework-tracker-portable" && packed="bsdtar"
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

echo ""
echo "==> 完成"
echo "    目录 : $DIST"
echo "    压缩包: $ZIP"
du -sh "$DIST" "$ZIP" 2>/dev/null || true
