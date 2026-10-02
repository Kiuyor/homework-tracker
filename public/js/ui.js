// ============ Subject Color Map ============
// 科目色由 CSS 变量池供给（--c-s1..--c-s12），随亮/暗模式自动切换，并保证白底对比度
var SUBJECT_COLOR_COUNT = 12;
var _colorCache = {};
function subjectColor(name) {
  if (_colorCache[name]) return _colorCache[name];
  // 按科目在 state.subjects 中的序号取色 → 同一科目跨编辑/展示模式配色稳定
  var subs = (window.AppState && window.AppState.subjects) || [];
  var idx = subs.findIndex(function (s) { return s.name === name; });
  if (idx === -1) idx = Object.keys(_colorCache).length; // 不在 state.subjects 里（首轮未到位）→ 顺延取色
  _colorCache[name] = 'var(--c-s' + (idx % SUBJECT_COLOR_COUNT + 1) + ')';
  return _colorCache[name];
}

// ============ SVG 图标（统一尺寸，stroke 继承 currentColor） ============
var ICON = {
  trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
};

// ============ Render Homeworks（按科目分组，一屏铺满） ============
window.renderHomeworks = function () {
  var dom = window.AppDom;
  var state = window.AppState;
  var groupsEl = dom.subjectGroups;
  // 重渲染会销毁整棵子树，滚动位置随之丢失——编辑态下列表长到屏幕外时，
  // 滚到一半被 5 秒轮询弹回顶部是最刺眼的退化。渲染后原样还原。
  // （展示态平时确实没有滚动这回事：装不下先压间距、再缩字号。只有压到字号下限
  //   仍装不下的兜底档才让整面墙可滚，见 fitShowDisplay 与 ADR-0007。）
  var prevScrollWin = window.scrollY || document.documentElement.scrollTop || 0;
  function restoreScroll() {
    if (prevScrollWin > 0) window.scrollTo(0, prevScrollWin);
  }
  groupsEl.innerHTML = '';

  var list = state.homeworks;

  if (list.length === 0) {
    var word = window.dayWord(state.currentDate);
    var emptyText;
    if (state.viewMode === 'show') {
      // 展示态整日为空是给全班看的一句话，不借用编辑态那句口吻
      emptyText = { 今天: '今日作业待公布', 明天: '明日作业待公布', 昨天: '昨天未布置作业' }[word]
        || (word + '未布置作业');
    } else {
      emptyText = word + '还没有作业'; // 编辑态维持现状：不加「去添加」之类的 CTA
    }
    var emptyEl = document.createElement('div');
    emptyEl.className = 'empty-line';
    emptyEl.textContent = emptyText; // 走 textContent 而不是拼 innerHTML
    groupsEl.appendChild(emptyEl);
    if (state.viewMode === 'show') window.fitShowDisplay();
    restoreScroll();
    return;
  }

  // 按科目分组（保持 subjects 顺序）。两套口径是刻意的，别"统一"掉（工单 024 故事 37）：
  // 展示态给全班看，格子=科目且六格常驻，没布置的格子也要占位，位置天天一样才靠得住；
  // 编辑态只列真有作业的行，科代表面对的是"今天哪几科留了东西"，六行空格子是噪声。
  var groups = [];
  if (state.viewMode === 'show') {
    state.subjects.forEach(function (s) {
      var items = list.filter(function (h) { return h.subject_id === s.id; });
      groups.push({ name: s.name, items: items, empty: items.length === 0 });
    });
  } else {
    state.subjects.forEach(function (s) {
      var items = list.filter(function (h) { return h.subject_id === s.id; });
      if (items.length) groups.push({ name: s.name, items: items });
    });
  }

  groups.forEach(function (group) {
    var color = subjectColor(group.name);
    var sec = document.createElement('section');
    sec.className = 'subject-group';
    sec.setAttribute('data-subject', group.name);
    sec.style.setProperty('--subject-color', color);

    var head = document.createElement('div');
    head.className = 'subject-head';
    // 格子里恒为一条（ADR-0005），「N 条」失去信息量，格子头只剩科目名（故事 26）
    head.innerHTML = '<span class="subject-name">' + window.escapeHtml(group.name) + '</span>';
    sec.appendChild(head);

    var ul = document.createElement('ul');
    ul.className = 'hw-list';

    // 格子级空态：说这一科没留作业，不是说今天没人录（整墙级那句在上面的 list.length===0 分支）
    if (group.empty) {
      var emptyLi = document.createElement('li');
      emptyLi.className = 'hw-empty';
      var emptySpan = document.createElement('span');
      emptySpan.className = 'empty-text';
      emptySpan.textContent = '未布置';
      emptyLi.appendChild(emptySpan);
      ul.appendChild(emptyLi);
      sec.appendChild(ul);
      groupsEl.appendChild(sec);
      return;
    }

    group.items.forEach(function (hw) {
      var li = document.createElement('li');
      li.className = 'hw-row';
      li.dataset.id = hw.id;
      li.setAttribute('data-subject', group.name);
      li.style.setProperty('--subject-color', color);

      var actionsHtml = '';
      if (state.viewMode === 'edit') {
        // 一科一条之后点整行就是改那一科，编辑钮没有存在理由；
        // 删除钮留着——它是危险动作，不给「整行即触发」的便利性。
        actionsHtml =
          '<div class="row-actions">' +
            '<button class="row-action-btn del" data-id="' + hw.id + '" title="删除">' + ICON.trash + '</button>' +
          '</div>';
      }

      var metaHtml = '';
      if (hw.deadline) {
        metaHtml = '<div class="meta">' +
          '<span class="deadline">' + ICON.clock + '<span>' + formatDeadline(hw.deadline, hw.date) + '</span></span>' +
        '</div>';
      }

      li.innerHTML =
        '<span class="bar"></span>' +
        '<div class="body">' +
          '<div class="content">' + window.escapeHtml(hw.content) + '</div>' +
          metaHtml +
        '</div>' +
        actionsHtml;

      if (state.viewMode === 'edit') {
        // 点整行即改。删除钮内部是 button>svg，e.target 往往是图标而不是按钮本身，
        // 所以用 closest 判"这一下落在删除钮上吗"，不能用 ===。
        li.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('.row-action-btn.del')) return;
          window.openEditModal(hw);
        });
        li.querySelector('.del').addEventListener('click', async function () {
          if (!confirm('确定要删除这条作业吗？')) return;
          try {
            await window.deleteHomework(hw.id);
            window.showToast('已删除', 'info');
            window.loadHomeworks();
          } catch (err) {
            window.showToast('删除失败: ' + err.message, 'error');
          }
        });
      }

      ul.appendChild(li);
    });

    sec.appendChild(ul);
    groupsEl.appendChild(sec);
  });

  // 展示模式：渲染后按实际内容量自适应字号，确保内容完整不裁切
  if (state.viewMode === 'show') {
    window.fitShowDisplay();
  }
  // 放在 fitShowDisplay 之后：兜底档会把墙高放开、行轨重新分配，
  // 滚动位置要在最终布局定下来后才对得上
  restoreScroll();
};

// ============ Font Size ============
window.applyFontSize = function (size) {
  document.documentElement.style.setProperty('--card-font-size', size + 'px');
};

// ============ Deadline Formatting ============
// 所属日的次日，返回 "YYYY-MM-DD"；跨月/跨年交给 Date 进位
function nextDayStr(dateStr) {
  var p = String(dateStr || '').split('-');
  if (p.length !== 3) return '';
  var d = new Date(+p[0], +p[1] - 1, +p[2] + 1);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// 展示：当天截止只显示 "14:30"；次日显示 "次日 07:30"（周一录周二交的 mainstream 场景）；
// 再往后的日期（历史数据/API 直写）才退化成 "MM-DD"，否则用户看不出这条其实是哪天。
// 安全：解析失败一律返回空串，绝不把原始字符串插入 innerHTML（防存储型 XSS）
window.formatDeadline = function (raw, hwDate) {
  if (!raw) return '';
  var d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) {
    var parts = raw.split(/[\s-:]/);
    if (parts.length >= 5) {
      d = new Date(+parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4]);
    }
  }
  if (isNaN(d.getTime())) return '';
  var hours = d.getHours().toString().padStart(2, '0');
  var mins = d.getMinutes().toString().padStart(2, '0');
  var hhmm = hours + ':' + mins;
  var mm = (d.getMonth() + 1).toString().padStart(2, '0');
  var dd = d.getDate().toString().padStart(2, '0');
  var dlDate = d.getFullYear() + '-' + mm + '-' + dd;
  if (!hwDate || dlDate === hwDate) return hhmm;
  if (dlDate === nextDayStr(hwDate)) return '次日 ' + hhmm;
  return mm + '-' + dd + ' ' + hhmm;
};

// 编辑回显：数据库 "2026-07-10 14:30:00" → 输入框 "14:30"
function formatDeadlineInput(raw) {
  if (!raw) return '';
  var d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  var hours = d.getHours().toString().padStart(2, '0');
  var mins = d.getMinutes().toString().padStart(2, '0');
  return hours + ':' + mins;
}

// 手动输入解析：只接受时间 "14:30" / "8:00" / "18:05"
// baseDateStr 为 "YYYY-MM-DD"，是「当天/次日」的基准日 = 该条作业的所属日：
//   · 新建时传「当前查看的日期」—— 在「明天」新建作业时截止时间才落在明天
//   · 编辑时传「该条作业自身的所属日」—— 在昨天的条目下选「次日」，
//     基准是昨天而不是今天，否则改一条历史作业会把死线挪到今天
// dayOffset：0=当天（缺省），1=次日。周一录「次日 7:30」必须落在周二，
//   否则墙上显示的是一个已经过去的时刻（故事 19/20）。
// 解析失败返回 null
window.parseDeadlineInput = function (text, baseDateStr, dayOffset) {
  if (!text) return null;
  var m = text.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
  if (!m) return null;
  var hour = +m[1], min = +m[2];
  if (hour > 23 || min > 59) return null; // 非法时间
  var p = /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr || '') ? baseDateStr.split('-') : null;
  var d = p ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date();
  if (!p) d.setHours(0, 0, 0, 0);
  if (dayOffset === 1) d.setDate(d.getDate() + 1); // 跨月/跨年进位交给 Date
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':00';
};

// 编辑回显用：这条 deadline 相对「所属日」落在哪一档？0=当天，1=次日，null=两档都装不下。
// 基准必须是这条作业自身的所属日，不能是今天——否则编辑昨天的条目，
// 「当天」会把死线悄悄挪到今天（这就是 ui 早年修过的那个 bug）。
window.deadlineDayOffsetOf = function (deadline, ownerDate) {
  var dlDate = deadline ? String(deadline).slice(0, 10) : '';
  if (!dlDate || dlDate === ownerDate) return 0;
  if (dlDate === nextDayStr(ownerDate)) return 1;
  return null;
};

// ============ Modal ============
// 「当天/次日」段式控件。offset：0=当天，1=次日，null=两个都不亮——
// 后者只在编辑历史数据时出现（deadline 既不属于所属日也不属于其次日），
// 不亮就是一种诚实的「这一天我们无法用两档表达」，此时提交会原样保留那一天。
window.setDeadlineDay = function (offset) {
  window.AppState.deadlineDayOffset = offset;
  var seg = document.getElementById('deadlineDaySeg');
  if (!seg) return;
  var opts = seg.querySelectorAll('.seg-opt');
  for (var i = 0; i < opts.length; i++) {
    var on = String(offset) === opts[i].dataset.offset;
    opts[i].classList.toggle('active', on);
    opts[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
};

function enterAddMode() {
  var dom = window.AppDom;
  var state = window.AppState;
  state.editingId = null;
  state.editingDeadline = null;
  state.subjectPickId = null; // 新建时不预选：默认"没选科目"，保存时挡住
  state.deadlineOwnerDate = window.formatDate(state.currentDate); // 「当天」= 正在查看的这一天
  // 模态的所属日：打开那一刻从 currentDate 快照下来的日期，保存时一律用它。
  // 为什么不能现读：顶栏那条日期导航在模态开着时针指点不到（overlay 盖在上面），
  // 但键盘能——Tab 循环若有缺口，焦点可以退到顶栏、在日期钮上按 Enter 把视图翻走。
  // 实测过这条路径（真浏览器），所以快照不是防御性冗余，是"所见即所存"的唯一保证。
  state.modalContextDate = window.formatDate(state.currentDate);
  window.setDeadlineDay(0);
  dom.modalTitle.textContent = '添加作业';
  dom.editId.value = '';
}

window.openAddModal = function () {
  var dom = window.AppDom;
  window.rememberFocus();
  enterAddMode();
  window.renderSubjectSeg();
  dom.contentInput.value = '';
  var deadlineInput = document.getElementById('deadlineInput');
  if (deadlineInput) deadlineInput.value = '';
  dom.modalOverlay.classList.remove('hidden');
  // 焦点交给模态本身（tabindex=-1），不落到"作业内容"上：软键盘不请自来的话，
  // 半屏立刻被压掉，而人可能只是想看看。要打字时点一下那块最大的输入区即可。
  window.focusModal();
};

window.openEditModal = function (hw) {
  var dom = window.AppDom;
  var state = window.AppState;
  window.rememberFocus();
  state.editingId = hw.id;
  state.editingDeadline = hw.deadline || null; // 保留原日期，只允许改时间
  state.deadlineOwnerDate = hw.date;
  state.modalContextDate = hw.date; // 改一条已存在的作业：所属日就是它自己那一天
  window.setDeadlineDay(window.deadlineDayOffsetOf(hw.deadline, hw.date));
  dom.modalTitle.textContent = hw.subject_name ? '编辑〈' + hw.subject_name + '〉' : '编辑作业';
  dom.editId.value = hw.id;
  state.subjectPickId = hw.subject_id;
  window.renderSubjectSeg();
  dom.contentInput.value = hw.content;
  var deadlineInput = document.getElementById('deadlineInput');
  if (deadlineInput) deadlineInput.value = hw.deadline ? formatDeadlineInput(hw.deadline) : '';
  dom.modalOverlay.classList.remove('hidden');
  window.focusModal();
};

window.closeModal = function () {
  window.AppDom.modalOverlay.classList.add('hidden');
  // 焦点归还给打开模态的那颗钮，键盘用户不必从页首重新走一遍
  window.restoreFocus();
};

// ============ 科目选择器（六科闭集，ADR-0011） ============
// 名单取自 state.subjects（GET /api/subjects），前端不再另写一份：墙上有几格，这里就有
// 几个按钮。带圆点 = 当天这一科已经录过，点它直接去改那一条，不弹确认——按钮自己已经
// 说出这格不是空的。原先那个能逐字敲的框必须弹：实测敲「语文补充练习」会先经过
// input="语文" 这个完整匹配，不弹就把人半路劫走了；按钮没有中间态，这笔账随之消失。
window.renderSubjectSeg = function () {
  var dom = window.AppDom;
  var state = window.AppState;
  if (!dom.subjectSeg) return;
  dom.subjectSeg.textContent = '';
  state.subjects.forEach(function (s) {
    var on = String(s.id) === String(state.subjectPickId);
    var recorded = state.homeworks.some(function (h) { return h.subject_id === s.id; });
    var note = s.name + (recorded ? '（今天已录，点这里是改那一条）' : '（今天还没录）');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-opt' + (on ? ' active' : '') + (recorded ? ' recorded' : '');
    b.dataset.subjectId = s.id;
    b.textContent = s.name;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', note);
    b.title = note; // 圆点只是标记，形状不能独自承担含义
    dom.subjectSeg.appendChild(b);
  });
};

window.pickSubject = function (id) {
  var dom = window.AppDom;
  var state = window.AppState;
  var hw = null;
  for (var i = 0; i < state.homeworks.length; i++) {
    if (state.homeworks[i].subject_id === id) { hw = state.homeworks[i]; break; }
  }
  // 添加态点到已录的科目 = 去改那一条（ADR-0005 的入口口径，触发方式由"敲完名字"
  // 变成"点按钮"）。已经在改这条了就是空点，落回下面的普通选中。
  // 例外：框里已经写了正文就别半路劫走——只换成"目标是这科"，保存时由 409 那句话指路。
  // 规格故事 15 要"已输入的正文不许丢"，ADR-0011 第 5 条要"不弹确认"，不切换正好两条都守。
  if (hw && !state.editingId && !dom.contentInput.value.trim()) {
    window.openEditModal(hw);
    return;
  }
  state.subjectPickId = id;
  window.renderSubjectSeg();
};

// ============ Dark Mode ============
window.toggleDarkMode = function () {
  var isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('hw_darkmode', isDark ? '1' : '0');
};

// ============ 主题轴（ADR-0012 决定 1） ============
// 与上面那条明暗轴**正交**：dark-mode 管档位，theme-* 管骨相，两把 class 各自独立。
// 名单只有一份，就写在这条数组里——CSS 里的 body.theme-* 块由门禁 §7(a)-7c 与它双向
// 对齐，抄进 index.html 的那一份迟早会和块不同名。whiteboard 是默认档且不加 class，
// 所以「没选主题」时页面与本机制之前逐像素一致（spec 故事 2）。
var THEME_NAMES = ['whiteboard', 'github', 'discord', 'glass'];
var THEME_LABELS = { whiteboard: '白板', github: 'GitHub', discord: 'Discord', glass: '玻璃' };
window.THEME_NAMES = THEME_NAMES;

function validTheme(name) {
  return THEME_NAMES.indexOf(name) >= 0 ? name : 'whiteboard';
}

// applyTheme：只摆 DOM 与 state，不写盘——init 读盘时走这条，避免启动即写一次 localStorage。
window.applyTheme = function (name) {
  var theme = validTheme(name);
  var body = document.body;
  for (var i = 0; i < THEME_NAMES.length; i++) {
    if (THEME_NAMES[i] !== 'whiteboard') body.classList.remove('theme-' + THEME_NAMES[i]);
  }
  if (theme !== 'whiteboard') body.classList.add('theme-' + theme);
  window.AppState.theme = theme;
  window.renderThemeSeg();
  return theme;
};

// setTheme：用户在控件上点出来的那一次才落盘。切主题只改 class，不重载页面——
// 弹窗里已录入未保存的正文不许被刷掉（spec 故事 24）。
window.setTheme = function (name) {
  var theme = window.applyTheme(name);
  localStorage.setItem('hw_theme', theme);
};

window.renderThemeSeg = function () {
  var seg = document.getElementById('themeSeg');
  var active = window.AppState.theme || 'whiteboard';
  // 入口的文案与选项同源：都读这一份名单，不在 HTML 里另抄一份"主题：白板"。
  var btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = '主题 · ' + (THEME_LABELS[active] || active);
  if (!seg) return;
  seg.textContent = '';
  THEME_NAMES.forEach(function (name) {
    var on = name === active;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-opt' + (on ? ' active' : '');
    b.dataset.theme = name;
    b.textContent = THEME_LABELS[name] || name;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    seg.appendChild(b);
  });
};

// 弹层开合（ADR-0013）：只摆 class 与 aria-expanded，不写盘——开着不选等于没改主意。
// 开合状态只有这一处作者：重绘（renderThemeSeg）与切档（applyTheme）都不碰它。
window.setThemePop = function (open) {
  var pop = document.getElementById('themePop');
  var btn = document.getElementById('themeBtn');
  if (!pop || !btn) return;
  pop.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
};

// ============ View Mode（编辑/展示）单一入口 ============
// applyViewMode：把 state.viewMode 落到 DOM（class、按钮文案）与运行时（轮询、时钟、全屏）。
// setViewMode：切换入口，对同一目标模式幂等。
// 两者分开是因为展示态是默认态（ADR-0003）——init() 需要在「没有发生切换」的情况下
// 把页面摆成展示态并启动计时器，此时若只调 setViewMode 会被幂等判断直接挡掉。
window.applyViewMode = function () {
  var state = window.AppState;
  var dom = window.AppDom;
  var show = state.viewMode === 'show';

  dom.modeToggle.textContent = show ? '编辑' : '展示';
  dom.modeToggle.classList.toggle('active', show);
  document.body.classList.toggle('view-show', show);
  document.body.classList.toggle('manage-on', !show);
  // 弹层跟着顶栏一起收尾：展示态不泄漏可操作控件（verify-47a 故事 9 的判据），
  // 而编辑态闲置回弹也走这条路——人走开时开着的那层若留在 DOM 里，
  // 下一次退出展示就会以"上次没关"的状态回来。
  window.setThemePop(false);

  if (show) {
    window.stopEditIdle();
    window.startAutoRefresh();
    window.startClock();
    window.enterFullscreen();
  } else {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    window.stopClock();
    window.exitFullscreen();
    window.startEditIdle();
  }
};

window.setViewMode = function (mode) {
  var state = window.AppState;
  if (mode !== 'edit' && mode !== 'show') return;
  if (state.viewMode === mode) return; // 幂等：重复切同一目标不重放渲染与全屏
  state.viewMode = mode;
  window.applyViewMode();
  window.loadHomeworks();
};

window.toggleViewMode = function () {
  window.setViewMode(window.AppState.viewMode === 'edit' ? 'show' : 'edit');
};

// ============ 编辑态闲置回弹（故事 24/25） ============
// 封的是反向风险：科代表改完一走了之，全班挂一整天带删除钮的编辑界面。
// 这条计时器只管「离开编辑态」，展示态下它整个不存在。
// 句柄必须独立于 5 秒轮询和 1 秒时钟——复用会变成「轮询顺带把编辑态踢回去」
// 这种最难查的竞态，所以 state 里单独一位 editIdleTimer。
var EDIT_IDLE_LIMIT = 300; // 5 分钟无活动 → 回展示态
var EDIT_IDLE_WARN = 240;  // 第 4 分钟起给预告
var EDIT_IDLE_REPEAT = 15; // toast 只活 2.5 秒，回弹前再提醒几次才算「一条预告」
var EDIT_IDLE_TICK = 1000;

window.resetEditIdle = function () {
  var state = window.AppState;
  if (!state.editIdleTimer) return; // 展示态下本计时器不存在，不替它记账
  state.editIdleAt = Date.now();
  state.editIdleWarnedAt = 0;
};

function isEditIdleFrozen() {
  // 模态开着就冻结：哪怕人走神五分钟，正在打的一半内容不能被吞掉
  var overlay = window.AppDom.modalOverlay;
  return !!overlay && !overlay.classList.contains('hidden');
}

window.startEditIdle = function () {
  var state = window.AppState;
  window.stopEditIdle();
  state.editIdleAt = Date.now();
  state.editIdleWarnedAt = 0;
  state.editIdleTimer = setInterval(function () {
    if (isEditIdleFrozen()) {
      state.editIdleAt = Date.now(); // 冻结期间不累计，解冻后从第 0 秒重新数
      return;
    }
    var idle = (Date.now() - state.editIdleAt) / 1000;
    if (idle >= EDIT_IDLE_LIMIT) {
      window.stopEditIdle();
      window.setViewMode('show');
    } else if (idle >= EDIT_IDLE_WARN && Date.now() - state.editIdleWarnedAt >= EDIT_IDLE_REPEAT * 1000) {
      state.editIdleWarnedAt = Date.now();
      window.showToast('即将回到展示，继续编辑请点一下屏幕', 'info');
    }
  }, EDIT_IDLE_TICK);
};

window.stopEditIdle = function () {
  var state = window.AppState;
  if (state.editIdleTimer) {
    clearInterval(state.editIdleTimer);
    state.editIdleTimer = null;
  }
};

// ============ 离线角标（不打扰） ============
// 连续失败 OFFLINE_THRESHOLD 次才亮起（5 秒轮询 → 约 10 秒），
// 避免单次网络抖动就闪一下；任何一次成功立即熄灭。
// 角标固定在左下、position:fixed 不参与布局、pointer-events:none，
// 因此既不会干扰 fitShowDisplay 的字号测量，也不会挡住任何点击。
var OFFLINE_THRESHOLD = 2;
window.markRefreshResult = function (ok) {
  var state = window.AppState;
  state.offlineFailures = ok ? 0 : (state.offlineFailures || 0) + 1;
  var shouldShow = state.offlineFailures >= OFFLINE_THRESHOLD;
  if (shouldShow === state.offlineShown) return; // 状态未变，不写 DOM
  state.offlineShown = shouldShow;
  var badge = document.getElementById('offlineBadge');
  if (badge) badge.classList.toggle('hidden', !shouldShow);
};

// ============ Auto-refresh（展示模式 5 秒轮询） ============
window.startAutoRefresh = function () {
  var state = window.AppState;
  if (state.refreshTimer) return;
  state.refreshTimer = setInterval(function () {
    // 展示模式是长时间无人值守的投影：轮询失败既不能抛未捕获异常，
    // 也不能弹 toast 打扰。静默重试，下个周期自然恢复。
    Promise.resolve(window.loadHomeworks()).catch(function (err) {
      console.warn('[作业墙] 自动刷新失败，将在下个周期重试：', err && err.message);
    });
  }, 5000);
};

// ============ 展示模式时钟（右上角，精确到分） ============
window.updateClock = function () {
  var el = document.getElementById('showClock');
  if (!el) return;
  var now = new Date();
  var text = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  if (text === window.AppState.clockText) return; // 分钟未变，不写 DOM
  window.AppState.clockText = text;
  el.textContent = text;
};

window.startClock = function () {
  var state = window.AppState;
  if (state.clockTimer) return;
  window.updateClock();
  // 每秒校时一次：兼顾「恰好分钟边界更新」与标签页后台节流后自动追齐
  state.clockTimer = setInterval(window.updateClock, 1000);
};

window.stopClock = function () {
  var state = window.AppState;
  if (state.clockTimer) {
    clearInterval(state.clockTimer);
    state.clockTimer = null;
  }
};

// ============ 展示模式字号缩放 ============
window.applyShowScale = function (scale) {
  scale = Math.min(2, Math.max(0.5, Math.round(scale * 10) / 10));
  document.documentElement.style.setProperty('--show-scale', scale);
  var val = document.getElementById('showFontVal');
  if (val) val.textContent = Math.round(scale * 100) + '%';
  localStorage.setItem('hw_show_scale', String(scale));
  if (window.AppState && window.AppState.viewMode === 'show') window.fitShowDisplay();
};

window.adjustShowScale = function (delta) {
  var cur = parseFloat(document.documentElement.style.getPropertyValue('--show-scale')) || 1;
  window.applyShowScale(cur + delta);
};

// ============ 展示模式自适应 ============
// 目标不变：内容一条不漏（完全性）+ 后排看得清（字号尽量大）。
// 降级两档：先压间距与行高（拿密度换空间，字号不动），仍不够才二分缩字号。
// 压到可读下限还装不下 → 整面墙交给纵向滚动（ADR-0007，推翻 ADR-0004 的后果 2）。
// 但滚动是**兜底档才挂上的条件几何**，不是默认状态：阶梯唯一的传感器就是 1fr 行轨配
// overflow:hidden 造出的 scroll>client（工单 018 实测），默认放开等于让阶梯第一档就测到「装得下」。
var SHOW_COLS = 3;      // 列数固定，行数随科目数走
var FIT_FLOOR = 0.55;   // 字号下限：再小就不可读

function showGroups() {
  return Array.prototype.slice.call(
    document.querySelectorAll('body.view-show .subject-group'));
}

function setRows(n) {
  document.documentElement.style.setProperty('--show-rows', String(Math.max(1, n)));
}

function setFitScale(s) {
  document.documentElement.style.setProperty('--fit-scale', String(s));
}

// 裁切 = 阶梯的眼睛：只看当前几何下有没有哪一格的列表溢出自己的行轨
function anyGroupOverflows(groups) {
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    var list = g.querySelector('.hw-list');
    if (list && list.scrollHeight > list.clientHeight + 1) return true;
    if (g.scrollHeight > g.clientHeight + 1) return true;
  }
  return false;
}

function wallFits(groups) {
  return !anyGroupOverflows(groups);
}

// 二分出「整墙都不溢出」的最大 fit-scale；连下限都放不下返回 null
function bestFitScale(groups) {
  setFitScale(FIT_FLOOR);
  if (!wallFits(groups)) return null;
  setFitScale(1);
  if (wallFits(groups)) return 1;
  var lo = FIT_FLOOR, hi = 1;
  for (var k = 0; k < 8; k++) {
    var mid = (lo + hi) / 2;
    setFitScale(mid);
    if (wallFits(groups)) lo = mid; else hi = mid;
  }
  return lo;
}

window.fitShowDisplay = function () {
  if (!document.body.classList.contains('view-show')) return;
  // 每次重算都从「不密、不滚」的几何起步：少了摘兜底类这一步，视口从小变大之后
  // 墙会永远停在可滚动态——那是替换语义不是等价删除。
  document.body.classList.remove('show-dense');
  document.body.classList.remove('show-scroll-fallback');
  var groups = showGroups();
  if (!groups.length) { setRows(1); return; }

  // 先按「列固定 3、行数 = ⌈科目数/3⌉」自然铺开再开始测量：
  // 8 个科目就该是 3 列 × 3 行，而不是被塞进两行里挤扁
  setRows(Math.ceil(groups.length / SHOW_COLS));

  setFitScale(1);
  if (wallFits(groups)) return;                     // 基准：疏朗间距 + 原字号

  document.body.classList.add('show-dense');        // 第一档：压间距与行高
  if (wallFits(groups)) return;

  var scale = bestFitScale(groups);                 // 第二档：二分缩字号
  if (scale !== null) { setFitScale(scale); return; }

  // 兜底档：压到可读下限仍装不下，让整面墙可上下滚（ADR-0007）。
  // 行轨与 overflow:hidden 都不动——它们还在替下一轮测量看住裁切，
  // 放开的是 .main 那一屏高的钉（工单 018 实测：那一条就是墙级不能滚的唯一作者）。
  setRows(1);
  setFitScale(FIT_FLOOR);
  document.body.classList.add('show-scroll-fallback');
};
