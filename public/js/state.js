// ============ 日期工具（先于 state 定义：state 的 currentDate 就用它建） ============
// 可注入时钟：测试要把"午夜之后"造出来，而 Date.now 不可伪造。全文件只此一处读时间。
window.now = function () { return Date.now(); };

// 本地午夜。**所属日是日期不是时刻**：currentDate 若带着加载时刻（10:23:45），
// 「今天」与「现在这一刻」就是两个概念，跨午夜回位与前后翻页的进位都指着同一件事。
function startOfDay(date) {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

// 日历日相等。全项目的日期比较只有这一处实现——原先 formatDisplay 里连写三段
// 「formatDate(x) === formatDate(y)」，加一处比较就要再抄三段。
window.sameDate = function (a, b) {
  return window.formatDate(a) === window.formatDate(b);
};

// ============ State ============
window.AppState = {
  currentDate: startOfDay(new Date(window.now())),
  homeworks: [],
  subjects: [],
  editingId: null,
  subjectPickId: null, // 科目选择器当前选中的科目（ADR-0011：只有六科，点不出来新名字）
  editingDeadline: null, // 编辑中的作业原始 deadline，用于「只改时间不改日期」
  modalContextDate: null, // 模态打开那一刻的所属日快照：保存一律用它，不现读 currentDate（见 ui.js enterAddMode）
  deadlineOwnerDate: null, // 「当天/次日」的基准日 = 正在编辑条目的所属日（新建时为查看日）
  deadlineDayOffset: 0, // 0=当天 1=次日 null=原始 deadline 落在两档之外
  fontSize: 44,
  viewMode: 'show', // 'edit' | 'show'，默认展示态（ADR-0003：编辑是显式进入的临时态）
  theme: 'whiteboard', // 主题轴当前档（ADR-0012），与 viewMode / dark-mode 两把 class 互不相干
  refreshTimer: null,
  clockTimer: null,
  editIdleTimer: null,   // 编辑态闲置回弹，独立句柄（不与轮询/时钟共用）
  editIdleAt: 0,         // 最近一次「活跃活动」的时间戳
  editIdleWarnedAt: 0,   // 上次弹「即将回到展示」预告的时间，避免每秒重复弹
  clockText: '', // 上次渲染的 HH:MM，避免每秒重复写 DOM
  offlineFailures: 0,  // 连续刷新失败次数（离线角标用）
  offlineShown: false, // 角标当前是否已显示，避免重复写 DOM
  // 上次渲染的输入签名（api.js「数据没变就跳过重渲染」）。保留：它是展示态 5 秒轮询下
  // 唯一挡住「每 5 秒重放动画 + 反复强制同步布局」的机制，去掉即为性能回退。
  // 已知代价：签名必须**逐个枚举**所有影响显示的输入，漏一项就成了"每 5 秒一次的静默不刷新"。
  // 本轮审查把现有输入（date / viewMode / subjects / 每条作业六字段）逐一比对过，未发现漏项，
  // 故不动它；但**新加任何影响渲染的 state 字段时，必须同时把它加进 api.js 的 renderSignature**。
  lastRenderSig: null,
  todayStr: null, // "今天"到底指哪一天（见 syncToday）：null = 还没校过基准
  dateSyncTimer: null, // 「今天」校正器：每分钟一次，跨午夜才真的有动作
  userNavigated: false, // 用户是否主动翻过页（changeDate 置 true，goToday 清回 false）。
  // syncToday 的跟随判据靠它：跨午夜瞬间 currentDate 还停在旧今天，「视图在不在这天」
  // 答不了"用户想不想跟着走"；只有"用户有没有主动离开跟随态"这个事实跨午夜仍然有效。
};

// ============ Date Helpers ============
window.formatDate = function (date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

window.getWeekday = function (date) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return '星期' + days[date.getDay()];
};

window.formatDisplay = function (date) {
  const today = startOfDay(new Date(window.now()));
  const tomorrow = startOfDay(new Date(today.getTime()));
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = startOfDay(new Date(today.getTime()));
  yesterday.setDate(yesterday.getDate() - 1);

  const diff = window.sameDate(date, today) ? '今天' :
    window.sameDate(date, tomorrow) ? '明天' :
    window.sameDate(date, yesterday) ? '昨天' : '';
  const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`;
  return diff ? `${diff} ${dateStr} ${window.getWeekday(date)}` : `${dateStr} ${window.getWeekday(date)}`;
};

window.dayWord = function (date) {
  // 「今天 / 明天 / 昨天 / 9月25日」——与顶部日期标签同一套指代，不各写一份。
  // 空墙文案要用它：写死「今天」会让翻到昨天的整屏文案指错日子。
  var label = window.formatDisplay(date);
  var m = label.match(/^(今天|明天|昨天)/);
  return m ? m[1] : label.split(' ')[0];
};

window.changeDate = function (delta) {
  const newDate = startOfDay(window.AppState.currentDate);
  newDate.setDate(newDate.getDate() + delta);
  window.AppState.currentDate = newDate;
  window.AppState.userNavigated = true; // 主动翻页 = 主动离开跟随态（syncToday 据此不再抢视图）
  window.updateDateDisplay();
  window.loadHomeworks();
};

window.goToday = function () {
  window.AppState.currentDate = startOfDay(new Date(window.now()));
  window.AppState.userNavigated = false; // 点「今天」= 回到跟随态
  window.updateDateDisplay();
  window.loadHomeworks();
};

// 跨午夜回位（挂钟一跳，这面墙就整个换了内容）。
// 教室机常年不关机、刷新（F5 落展示态）也常发生在两节课之间——「今天」若只在加载时算一次，
// 第二天早上这面墙会安静地把**昨天**的作业当作今天讲一整节，而没有任何一处会响。
// 判据是「页面默认跟着今天走」，不是「现在是不是午夜」——所以用状态量记一次读数，
// 每分钟、每次页面重新可见时各校一次，不靠定时器恰好在零点醒来。
// 返回"今天"是否变了（函数名与返回值同义；跨午夜而用户翻走了时也返回 true，只是视图不动）。
window.syncToday = function () {
  const state = window.AppState;
  // 一次调用只读一次钟：跨午夜那一瞬被拆成两次读数的话，"今天"与"是否跟着今天走"
  // 会用到两个不同的日子。
  const today = new Date(window.now());
  const todayStr = window.formatDate(today);
  const baseline = state.todayStr;
  const isFirst = baseline === null || baseline === undefined;

  // 幂等：同一天、且视图的归属已经定过，就没有什么要做的。
  // （首帧必须放行——见下面那条首帧纠偏。）
  if (!isFirst && baseline === todayStr) {
    state.todayStr = todayStr;
    return false;
  }

  // **「是否跟着今天走」= 用户没有主动翻过页**（以及首帧的默认跟随）。
  // 不能判 sameDate(currentDate, today)：跨午夜那一瞬 currentDate 还停在旧"今天"，
  // 同日比较恒为 false——正看着今天的人反而被误判成"翻走了"，视图从此冻在昨天。
  // 「用户有没有主动离开跟随态」（userNavigated）是跨午夜仍然成立的事实，所以判它。
  // 首帧的默认跟随不是想当然：currentDate 在**模块求值**时定下（本文件第 21 行），而第一次
  // syncToday() 要等 init() 跑到（main.js）——两者之间若跨过午夜，视图就是"昨天"而基准还是 null。
  // 那一刻没人翻过页（页面刚打开），所以必须判它"该跟"，否则这面墙会整天挂在昨天：
  // 此后每分钟都被上面那条幂等挡回去，再不修正。verifier 的反例正是这一格。
  const following = isFirst || !state.userNavigated;
  state.todayStr = todayStr;

  if (following) window.goToday();      // 看着今天（或首帧）→ 跟到今天，顺带重拉数据
  else window.updateDateDisplay();      // 用户特意翻到别的日子 → 尊重它，只更正"今天"这个词的指代
  return true;
};

window.updateDateDisplay = function () {
  window.AppDom.dateLabel.textContent = window.formatDisplay(window.AppState.currentDate);
};