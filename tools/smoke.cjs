/* eslint-disable */
// 用 jsdom 真实跑一遍 index.html 的内联脚本，验证重构后的初始化/解析/保存流程。
// 用法: node tools/smoke.cjs index.html
const fs = require('node:fs');
const path = require('node:path');


// ---- jsdom 解析：优先仓库依赖，其次本机 DSH 检出自带的 .pnpm ----
function loadJsdom() {
  try { return require('jsdom'); } catch (_) { }
  const roots = [
    path.join(__dirname, '..', 'node_modules', '.pnpm'),
    'E:/ai/DSH-CyberWorkStation-main/core/node_modules/.pnpm',
    'E:/ai/DSH-CyberWorkStation/core/node_modules/.pnpm',
  ];
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root).filter(d => /^jsdom@/.test(d)); } catch (_) { continue; }
    for (const d of dirs) {
      const p = path.join(root, d, 'node_modules', 'jsdom');
      try { if (fs.existsSync(p)) return require(p); } catch (_) { }
    }
  }
  console.error('✗ 找不到 jsdom。请在仓库根目录执行：npm i -D jsdom');
  process.exit(2);
}

const { JSDOM, VirtualConsole } = loadJsdom();

const file = process.argv[2] || 'public/index.html';
if (!fs.existsSync(file)) { console.error('✗ 找不到 ' + file + '（请在仓库根目录运行 npm run verify）'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');

// 捕获页面里未处理的异常（事件监听器内抛错不会冒泡到 .click()，只能从这里看到）
const jsdomErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => jsdomErrors.push(e.message + (e.detail && e.detail.message ? ' :: ' + e.detail.message : '')));
vc.on('error', (...a) => jsdomErrors.push('console.error: ' + a.map(String).join(' ')));

// ---- 模拟服务端的 fetch（两个 jsdom 实例共用同一份 serverData，模拟「不同设备连同一个服务端」）----
// /api/vote/:key 要照着真服务端的语义来：原子合并（只动自己那条）+ 当天 23:00 过期连数据一起删
// + 截止时间（deadline 'HH:MM' 到点后 409，只能看结果；数据留到 23:00）
function makeFetchMock(store, log, nowFn) {
  const beijing = nowFn || (() => new Date(Date.now() + 8 * 3600 * 1000));
  const expired = (p) => {
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ''))) return false;
    const d = beijing(), today = d.toISOString().slice(0, 10);
    if (p.date < today) return true;
    if (p.date > today) return false;
    return d.getUTCHours() >= 23;
  };
  // '' = 还能投；'manual' = 手动截止；'deadline' = 到截止时间了
  const closedReason = (p) => {
    if (!p || typeof p !== 'object') return '';
    if (p.status === 'closed') return 'manual';
    const dl = typeof p.deadline === 'string' ? p.deadline : '';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dl)) return '';
    const d = beijing(), today = d.toISOString().slice(0, 10);
    if (typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
      if (p.date < today) return 'deadline';
      if (p.date > today) return '';
    }
    const hm = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    return hm >= dl ? 'deadline' : '';
  };
  return async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    const key = parseKey(url);
    let body = null;
    try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (_) { }
    log.push(method === 'POST' ? { url: String(url), method, body } : { url: String(url), method: 'GET' });
    if (String(url).indexOf('api/vote/') !== -1) {
      const poll = store[key];
      if (method === 'GET') {
        if (poll && expired(poll)) {
          delete store[key];                                     // 服务端会连数据一起删掉
          return { ok: true, status: 200, json: async () => ({ value: null, expired: true, closed: false, closedReason: '' }) };
        }
        const reason = closedReason(poll);
        return {
          ok: true, status: 200,
          json: async () => ({
            value: poll === undefined ? null : poll, expired: false,
            closed: !!reason, closedReason: reason,
          }),
        };
      }
      const b = body || {};
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(b.voterId || ''))) {
        return { ok: false, status: 400, json: async () => ({ error: '非法的 voterId' }) };
      }
      if (!Array.isArray(b.shopIds)) {
        return { ok: false, status: 400, json: async () => ({ error: 'shopIds 必须是店家 id 数组' }) };
      }
      if (poll && expired(poll)) {
        delete store[key];
        return { ok: false, status: 410, json: async () => ({ error: '投票已过期', expired: true }) };
      }
      if (!poll) return { ok: false, status: 404, json: async () => ({ error: '投票不存在或还没发起' }) };
      const reason = closedReason(poll);
      if (reason) {
        return {
          ok: false, status: 409,
          json: async () => ({
            error: reason === 'deadline' ? ('投票已在 ' + poll.deadline + ' 截止（只能看结果，当天 23:00 自动清除）') : '投票已截止',
            closed: true, closedReason: reason,
          }),
        };
      }
      poll.votes = poll.votes || {};
      const old = poll.votes[b.voterId];
      poll.votes[b.voterId] = {
        voterId: b.voterId, shopIds: b.shopIds.slice(),
        at: (old && old.at) || new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      return { ok: true, status: 200, json: async () => ({ success: true, value: JSON.parse(JSON.stringify(poll)) }) };
    }
    if (method === 'GET') {
      // value 必须是真正的 undefined，才会走 loadData 的 defaultValue 分支（首次打开场景）
      return { ok: true, status: 200, json: async () => (key in store ? { value: store[key] } : {}) };
    }
    if (body) store[key] = body.value;
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
}

let pass = 0, fail = 0;
const check = (cond, msg, extra) => {
  if (cond) { pass++; console.log('✓ ' + msg); }
  else { fail++; console.log('✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

const posts = [];      // 记录所有 POST
let promptAnswer = null;   // window.prompt 的返回值（SOP 导入等场景按需改）
const warns = [];
const serverData = {}; // 模拟服务器端持久化：初始为空（首次打开，无缓存无服务端数据）

function parseKey(url) { return String(url).split('/').pop(); }

function makeCtx(canvas) {
  const grad = { addColorStop() { } };
  const mk = (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h });
  const target = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1,
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    getImageData: (x, y, w, h) => mk(w, h),
    createImageData: (w, h) => mk(w, h),
    putImageData() { }, drawImage() { }, fillRect() { }, clearRect() { },
    beginPath() { }, closePath() { }, moveTo() { }, lineTo() { }, arc() { }, ellipse() { },
    quadraticCurveTo() { }, bezierCurveTo() { }, rect() { }, fill() { }, stroke() { },
    save() { }, restore() { }, translate() { }, rotate() { }, scale() { }, transform() { },
    setTransform() { }, clip() { }, fillText() { }, strokeText() { }, setLineDash() { },
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => { }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:3080/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: false,
  virtualConsole: vc,
  beforeParse(window) {
    window.alert = () => { };
    window.confirm = () => true;
    window.prompt = () => promptAnswer;   // SOP 导入用（默认 null = 取消）
    window.requestAnimationFrame = () => 0;      // 不真的跑动画循环
    window.cancelAnimationFrame = () => { };
    window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(this); };
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    window.URL.createObjectURL = () => 'blob:stub';
    window.URL.revokeObjectURL = () => { };
    window.fetch = makeFetchMock(serverData, posts);
    const origWarn = window.console.warn;
    window.console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    window.console.error = (...a) => { warns.push('ERROR ' + a.map(String).join(' ')); };
  },
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

(async () => {
  await sleep(120);   // 等异步 bootstrapData 完成

  console.log('--- 1. 初始化 ---');
  check(!doc.querySelector('div[style*="e53935"]'), '没有初始化失败横幅（reportFatal 未触发）');
  check(!warns.some(w => w.includes('动画')), '无异常警告：' + warns.slice(0, 2).join(' | '));
  check(/工作台就绪/.test($('flowDebugConsole').textContent), '调试台就绪文案（resetDebug 生效）', $('flowDebugConsole').textContent.slice(0, 40));
  check($('openingSelect').options.length === 4, '开台语下拉回填 4 条默认', $('openingSelect').options.length);
  check($('closingSelect').options.length === 4, '结束语下拉回填 4 条默认', $('closingSelect').options.length);
  check($('dailyFormTicket').querySelectorAll('input,textarea,select').length > 20, '日报表单已渲染', $('dailyFormTicket').querySelectorAll('input,textarea,select').length);
  check(doc.querySelectorAll('.modal[role="dialog"]').length === 8, '模态框 aria 已加', doc.querySelectorAll('.modal[role="dialog"]').length);

  console.log('--- 2. 智能解析（资源流水） ---');
  const log = '2026-04-20 16:04:00\t51b2bb98971c8d2323c225edd44a5512\t体力\t101\t体力\t货币\t-1\t326\t325\t棋盘操作-临时母棋生产\t107';
  $('smartPasteInput').value = log;
  $('smartParseBtn').click();
  await sleep(60);
  const out = $('globalResultArea').value;
  check(out.length > 0, '资源流水解析出结果', out.slice(0, 90));
  check(/体力/.test(out), '结果含资源名');
  check($('globalResultCount').textContent.includes('1'), '计数已更新', $('globalResultCount').textContent);
  check(/资源流水解析/.test($('flowDebugConsole').textContent), '调试日志累积正常');

  console.log('--- 2b. 资源流水格式兼容（短格式回归防护） ---');
  // 背景：b6141ff 给 isNewFormat 加了 `|| looksLikeResource`，使「col3 是资源名但列数 < 10」的短格式
  // 日志被误判成新格式 → 变化量取到来源文字 → parseInt 得 NaN → 整条被丢弃。
  // 后果：输入框占位符里的那个范例格式（8 列）连同 6 列简格式全部解析不出来（5 种资源类型全中招）。
  const flowCases = [
    ['短格式8列(输入框占位符范例)', '2026-04-20 16:04:00\tx\t体力\t-1\t326\t325\t棋盘操作-临时母棋生产\t0-货币', '体力', /消耗1点体力，从326变为325/],
    ['短格式6列', '2026-04-20 16:04:00\tx\t体力\t-1\t326\t325', '体力', /消耗1点体力，从326变为325/],
    ['短格式8列(金币)', '2026-04-20 16:05:00\tx\t金币\t-20\t500\t480\t棋盘操作-使用消耗棋子\t0-货币', '金币', /消耗20点金币，从500变为480/],
    ['新格式9列(只靠 looksLikeResource 才能识别)', '2026-04-20 16:04:00\tx\t体力\t101\t体力\t货币\t-1\t326\t325', '体力', /消耗1点体力，从326变为325/],
  ];
  for (const [label, sample, type, expect] of flowCases) {
    $('flowResourceSelect').value = type;
    $('smartPasteInput').value = sample;
    $('globalResultArea').value = '';
    $('smartParseBtn').click();
    await sleep(30);
    const got = $('globalResultArea').value;
    check(expect.test(got), `资源流水 ${label} 可生成话术`, got ? got.slice(0, 80) : '(空)');
  }
  $('flowResourceSelect').value = '体力';

  console.log('--- 2c. 好评奖励：合法输入应真的生成话术（原来只验证「不抛错」） ---');
  doc.querySelector('input[name="parseMode"][value="review"]').checked = true;
  $('smartPasteInput').value = '当前轮次: 普通\n2026-04-20 16:04:00\n竹子\n竹片\n竹子';
  $('globalResultArea').value = '';
  $('smartParseBtn').click();
  await sleep(30);
  const reviewOut = $('globalResultArea').value;
  check(/获得好评奖励/.test(reviewOut), '好评奖励生成话术', reviewOut.slice(0, 90));
  check(/竹子\*2/.test(reviewOut) && /竹片\*1/.test(reviewOut), '好评奖励数量统计正确', reviewOut.slice(0, 90));
  doc.querySelector('input[name="parseMode"][value="resource"]').checked = true;

  console.log('--- 2d. 资源类型「选什么就出什么」（已定语义，锁定防漂移） ---');
  // 用户已确认：下拉框选了什么类型，日志里所有行就都按那个类型出话术，
  // 不再按日志里的真实类型（体力/金币）分别筛选。以下两条钉住这个行为。
  const MIXED = '2026-04-20 16:04:00\tx\t体力\t-1\t326\t325\t棋盘操作-临时母棋生产\t0-货币'
    + '\n' + '2026-04-20 16:05:00\tx\t金币\t-20\t500\t480\t棋盘操作-使用消耗棋子\t0-货币';
  for (const [type, expect, forbid, label] of [
    ['体力', [/消耗20点体力/, /消耗1点体力/], /金币/, '选「体力」→ 连金币行也按体力出'],
    ['金币', [/消耗20点金币/, /消耗1点金币/], /体力/, '选「金币」→ 连体力行也按金币出'],
  ]) {
    $('flowResourceSelect').value = type;
    $('includeSourcesInput').value = '';
    $('itemKeywordInput').value = '';
    $('smartPasteInput').value = MIXED;
    $('globalResultArea').value = '';
    $('smartParseBtn').click();
    await sleep(30);
    const got = $('globalResultArea').value;
    check(expect.every(r => r.test(got)) && !forbid.test(got), label, got ? got.replace(/\n+/g, ' ⏎ ').slice(0, 100) : '(空)');
  }
  $('flowResourceSelect').value = '体力';

  console.log('--- 2e. 活动奖励（集合）：同时间+同来源合并成一句 ---');
  const runAct = async (log) => {
    $('flowResourceSelect').value = '活动奖励';
    $('includeSourcesInput').value = '';
    $('itemKeywordInput').value = '';
    $('smartPasteInput').value = log;
    $('globalResultArea').value = '';
    $('smartParseBtn').click();
    await sleep(30);
    return $('globalResultArea').value;
  };
  const T2 = (a) => a.join('\t');
  const actGain = await runAct(
    T2(['2026-04-20 16:04:00', 'x', '体力', '1', '326', '327', '春生雅艺会奖励', '0-货币'])
    + '\n' + T2(['2026-04-20 16:04:00', 'x', '金币', '20', '500', '520', '春生雅艺会奖励', '0-货币']));
  check(actGain === '在2026/04/20 16：04：00，通过【春生雅艺会奖励】获得体力*1，金币*20', '同为获得 → 合并成一句且资源列表正确', actGain);
  const actMix = await runAct(
    T2(['2026-04-20 16:04:00', 'x', '体力', '-1', '326', '325', '春生雅艺会奖励', '0-货币'])
    + '\n' + T2(['2026-04-20 16:04:00', 'x', '金币', '20', '500', '520', '春生雅艺会奖励', '0-货币']));
  check(actMix.split('\n\n').length === 1 && /消耗体力\*1/.test(actMix) && /获得金币\*20/.test(actMix), '一消耗一获得 → 仍是一句，各自带动词', actMix);
  const actTwo = await runAct(
    T2(['2026-04-20 16:04:00', 'x', '体力', '1', '326', '327', '棋盘操作-临时母棋生产', '0-货币'])
    + '\n' + T2(['2026-04-20 16:05:00', 'x', '金币', '20', '500', '520', '棋盘操作-使用消耗棋子', '0-货币']));
  check(actTwo.split('\n\n').length === 2, '不同时间/来源 → 不合并', actTwo.replace(/\n+/g, ' ⏎ '));
  $('flowResourceSelect').value = '体力';

  console.log('--- 3. 其他三种解析模式 ---');
  for (const [mode, sample, label] of [
    ['order', '创建\t完成\t2026-04-20 16:04:00\t普通订单\t是\t2026-04-20 16:04:00\t10101\t竹子\t10', '订单日志'],
    ['review', '当前轮次: 普通\n2026-04-20 16:04:00\t竹子\n2026-04-20 16:04:00\t竹片', '好评奖励'],
    ['chess', '2026-04-20 16:04:00\tx\t10101/竹子\t1\t0\t1\t棋盘操作-常规母棋生产', '棋子流水'],
  ]) {
    const radio = doc.querySelector(`input[name="parseMode"][value="${mode}"]`);
    radio.checked = true;
    $('smartPasteInput').value = sample;
    let threw = null;
    try { $('smartParseBtn').click(); } catch (e) { threw = e; }
    await sleep(30);
    check(!threw, `${label} 解析未抛异常`, threw && threw.message);
  }

  console.log('--- 4. 排序切换 ---');
  $('sortOrderSelect').value = 'asc';
  let threwSort = null;
  try { fire($('sortOrderSelect'), 'change'); } catch (e) { threwSort = e; }
  check(!threwSort, '排序切换未抛异常', threwSort && threwSort.message);

  console.log('--- 5. 保存链路（saveData 串行队列 + 相对 API_BASE） ---');
  posts.length = 0;
  $('manageIgnoreRulesBtn').click();
  $('newIgnoreKeyword').value = '测试忽略词';
  $('addIgnoreKeywordBtn').click();
  await sleep(60);
  const ignorePosts = posts.filter(p => p.url.includes('ignoreKeywords') && p.method !== 'GET');
  check(ignorePosts.length >= 1, '忽略词保存发出了 POST', ignorePosts.length);
  check(ignorePosts.every(p => /^api\/data\/ignoreKeywords$/.test(p.url)), 'URL 为相对路径 api/data/<key>', ignorePosts[0] && ignorePosts[0].url);
  check((window.localStorage.getItem('ignoreKeywords') || '').includes('测试忽略词'), 'localStorage 已写入');
  check($('ignoreRuleListContainer').textContent.includes('测试忽略词'), '列表已刷新');

  console.log('--- 6. 映射：新增后「重置默认」应清掉新增项（默认常量深拷贝） ---');
  $('manageIgnoreRulesModalCloseNoop') === null;
  $('closeIgnoreRuleModal').click();
  $('manageMappingBtn').click();
  $('newMappingId').value = '999999';
  $('newMappingName').value = 'ZZ测试映射项';
  $('addMappingBtn').click();
  await sleep(40);
  check($('mappingListContainer').textContent.includes('ZZ测试映射项'), '新增映射出现在列表中');
  $('resetMappingBtn').click();
  await sleep(40);
  check(!$('mappingListContainer').textContent.includes('ZZ测试映射项'), '重置默认后新增项已消失（修复生效）');
  check($('mappingListContainer').textContent.includes('1星百戏锦囊'), '重置后仍含内置默认项');
  $('closeMappingModal').click();

  // 锁定 resolveItemName 的既有语义（AGENTS.md「已定语义」①：日志名优先，映射表被绕过）。
  // 这两条断言是防漂移用的：若要改成「映射优先」，必须先确认预期并同步改这里。
  console.log('--- 6b. resolveItemName 语义：日志带名字时绕过映射表；只有纯数字 ID 才查映射 ---');
  $('manageMappingBtn').click();
  $('newMappingId').value = '888888';
  $('newMappingName').value = 'ZZ映射名乙';
  $('addMappingBtn').click();
  await sleep(40);
  check($('mappingListContainer').textContent.includes('ZZ映射名乙'), '测试映射 888888 已加入映射表');
  $('closeMappingModal').click();

  doc.querySelector('input[name="parseMode"][value="chess"]').checked = true;
  // A：日志里已带非数字名字 → 直接用日志名，不查映射表
  $('smartPasteInput').value = '2026-04-20 16:04:00\tx\t888888/ZZ日志名甲\t1\t0\t1\t棋盘操作-常规母棋生产';
  $('smartParseBtn').click();
  await sleep(40);
  const outA = $('globalResultArea').value;
  check(outA.includes('ZZ日志名甲'), 'A 日志自带名字时用日志名', outA.slice(0, 80));
  check(!outA.includes('ZZ映射名乙'), 'A 日志自带名字时不查映射表（映射管理改名对它不生效）', outA.slice(0, 80));
  // B：日志只有纯数字 ID → 查映射表
  $('smartPasteInput').value = '2026-04-20 16:04:00\tx\t888888\t1\t0\t1\t棋盘操作-常规母棋生产';
  $('smartParseBtn').click();
  await sleep(40);
  const outB = $('globalResultArea').value;
  check(outB.includes('ZZ映射名乙'), 'B 日志只有纯数字 ID 时查映射表', outB.slice(0, 80));
  check(!outB.includes('888888'), 'B 输出中的 ID 已被映射名替换', outB.slice(0, 80));

  console.log('--- 6c. 来源映射补齐 253–257 ---');
  // 快照（GM 玩家页）里 opFrom/from 有 1..257，而 index.html 的 DEFAULT_SOURCE_ID_MAP
  // 原来只到 252。以下断言锁住新补的 5 条能被 resolveSource 查到。
  const parseSources = async (ids) => {
    doc.querySelector('input[name="parseMode"][value="resource"]').checked = true;
    $('flowResourceSelect').value = '体力';
    $('includeSourcesInput').value = '';
    $('itemKeywordInput').value = '';
    $('smartPasteInput').value = ids.map((sid, i) =>
      T2(['2026-04-20 16:0' + (4 + i) + ':00', 'x', '体力', '101', '体力', '货币', '-1', '326', '325', '', String(sid)])
    ).join('\n');
    $('globalResultArea').value = '';
    $('smartParseBtn').click();
    await sleep(30);
    return $('globalResultArea').value;
  };
  const g253 = await parseSources([253]);
  check(/联动分享活动-首次赠送/.test(g253), '来源 253 → 联动分享活动-首次赠送', g253.slice(0, 90));
  const g2545 = await parseSources([254, 255]);
  check(/联动分享活动-每日分享/.test(g2545) && /联动分享活动-最终奖励/.test(g2545), '来源 254/255 → 每日分享 / 最终奖励', g2545.replace(/\n+/g, ' ⏎ ').slice(0, 130));
  const g256 = await parseSources([256]);
  check(/打脸信活动奖励/.test(g256), '来源 256 → 打脸信活动奖励', g256.slice(0, 90));
  const g257 = await parseSources([257]);
  check(/打怪棋盘-消耗步数/.test(g257), '来源 257 → 打怪棋盘-消耗步数', g257.slice(0, 90));
  $('flowResourceSelect').value = '体力';

  console.log('--- 6d. 活动类型映射补齐 75（95打怪棋盘）---');
  // 快照里「活动」下拉共 39 个类型，映射表原来只有 38 个、缺 75。
  // 注意：该表只服务「映射管理」的展示/导入导出，**不参与解析与话术生成**。
  $('manageMappingBtn').click();
  $('mappingTypeSelect').value = 'activity';
  fire($('mappingTypeSelect'), 'change');
  await sleep(40);
  const actList = $('mappingListContainer').textContent;
  check(actList.includes('95打怪棋盘'), '活动类型映射 75 → 95打怪棋盘（列表可见）', actList.slice(0, 90));
  $('mappingTypeSelect').value = 'item';
  $('closeMappingModal').click();

  console.log('--- 7. 日报自定义项：输入应防抖（5 次输入只发 1 次 POST） ---');
  $('dailyTabTicket').click();
  $('ticketAddCustomBtn').click();
  await sleep(80);
  posts.length = 0;
  const customValue = $('dailyFormTicket').querySelector('.daily-custom-item .custom-value');
  check(!!customValue, '自定义项输入框存在');
  if (customValue) {
    for (const ch of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      customValue.value = ch;
      fire(customValue, 'input');
    }
    await sleep(650);
    const dailyPosts = posts.filter(p => p.url.includes('dailyData') && p.method !== 'GET');
    check(dailyPosts.length === 1, '5 次输入只产生 1 次 POST（防抖生效）', dailyPosts.length);
  }

  console.log('--- 7b. 日报模板 ⑥⑦（伙伴弹途 / 异世界勇者） ---');
  const newKeys = $('dailyFormTicket').querySelectorAll('[data-key^="g6_"], [data-key^="g7_"]');
  check(newKeys.length === 6, '⑥⑦ 共 6 个输入项已渲染', newKeys.length);
  const g6wx = $('dailyFormTicket').querySelector('[data-key="g6_wx"]');
  if (g6wx) { g6wx.value = '5'; fire(g6wx, 'input'); }
  $('generateDailyBtn').click();
  const report = $('dailyResultArea').value;
  check(report.includes('⑥伙伴弹途微信【5】，抖音【0】，dy在线【0】'), '⑥ 行数值正确带入', (report.match(/⑥.*/) || [''])[0]);
  check(report.includes('⑦异世界勇者微信【0】，抖音【0】，dy在线【0】'), '⑦ 行已生成', (report.match(/⑦.*/) || [''])[0]);
  check(/①繁花微信【0】/.test(report) && /⑤梦幻消除战微信【0】/.test(report), '原有 ①~⑤ 行未被破坏');
  check(report.indexOf('⑤梦幻消除战') < report.indexOf('⑥伙伴弹途') && report.indexOf('⑥伙伴弹途') < report.indexOf('⑦异世界勇者'), '⑥⑦ 排在 ⑤ 之后，顺序正确');

  console.log('--- 8. 模态框 Esc 关闭 ---');
  $('manageSourceRulesBtn').click();
  check($('sourceRuleModal').style.display === 'block', '模态框已打开');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check($('sourceRuleModal').style.display === 'none', 'Esc 关闭模态框');

  console.log('--- 8b. 集卡分析：幻狐（卡包 176-179 / 星级码 32-35） ---');
  const cardCsv = [
    '卡包ID,卡包星级,after,创建时间',
    '176,[32],{1003201:1},2026-04-20 16:04:00',
    '177,[33],{1003301:0},2026-04-20 16:05:00',
    '179,[35],{1003501:1},2026-04-20 16:07:00',
    '173,[23],{1002301:1},2026-04-20 16:08:00',
    '175,[25],{1002501:1},2026-04-20 16:09:00',
  ].join('\n');
  Object.defineProperty($('csvFileInput'), 'files', { value: [new window.File([cardCsv], 'cards.csv', { type: 'text/csv' })], configurable: true });
  $('uploadCsvBtn').click();
  await sleep(200);
  const cardAll = $('cardResultArea').value;
  check(/【幻狐2星锦囊】/.test(cardAll) && /【幻狐5星锦囊】/.test(cardAll), '幻狐锦囊 176/179 → 包名识别', cardAll.slice(0, 80));
  check(/（幻狐2星，新卡）/.test(cardAll) && /（幻狐5星，新卡）/.test(cardAll), '星级码 32/35 → 「幻狐N星」', (cardAll.match(/（幻狐\d星[^）]*）/g) || []).join(' '));
  check(/【霞光3星锦囊】/.test(cardAll) && /（霞光3星，新卡）/.test(cardAll), '霞光原有识别未受影响');
  const filterByStar = async (s) => { $('starFilterSelect').value = s; $('applyFilterBtn').click(); await sleep(120); return $('cardResultArea').value; };
  const f2 = await filterByStar('2');
  check(/幻狐2星/.test(f2) && !/霞光/.test(f2), '筛选 2星 → 命中幻狐2星(32)，不牵连霞光');
  const f3 = await filterByStar('3');
  check(/幻狐3星/.test(f3) && /霞光3星/.test(f3), '筛选 3星 → 同时命中幻狐3星(33) 与 霞光3星(23)');
  const f5 = await filterByStar('5');
  check(/幻狐5星/.test(f5) && /霞光5星/.test(f5), '筛选 5星 → 同时命中幻狐5星(35) 与 霞光5星(25)');
  $('starFilterSelect').value = 'all';
  $('applyFilterBtn').click();
  await sleep(100);

  console.log('--- 8c. 客服生涯：日报自动归档 / 粘贴导入 / 统计口径 ---');
  // 北京时间今天，与页面 getBeijingDate() 同口径
  const bjToday = (() => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const d = new Date(utc + 8 * 3600000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();
  // 客服生涯**只存本机**：断言里既不读服务端，也要能证明服务端一次都没被碰
  const careerRequests = () => posts.filter(p => p.url.includes('careerData'));
  const lastCareer = () => {
    try { return JSON.parse(window.localStorage.getItem('careerData') || 'null'); } catch (_) { return null; }
  };
  const kpiText = () => $('careerKpi').textContent;
  const setDailyField = (formId, key, val) => {
    const el = $(formId).querySelector('[data-key="' + key + '"]');
    if (!el) return false;
    el.value = String(val);
    // select 的监听是 change，input/textarea 是 input（跟 renderDailyForm 里一致）
    fire(el, el.tagName === 'SELECT' ? 'change' : 'input');
    return true;
  };

  $('dailyTabOverseas').click();          // 海外表单要先切过去才渲染
  await sleep(40);
  check($('dailyFormOverseas').querySelectorAll('[data-key]').length === 17
    && !!$('dailyFormOverseas').querySelector('[data-key="fb_yl"]')
    && !!$('dailyFormOverseas').querySelector('[data-key="email_mh"]')
    && !!$('dailyFormOverseas').querySelector('[data-key="email_ajs"]')
    && !!$('dailyFormOverseas').querySelector('[data-key="email_yl"]')
    && !$('dailyFormOverseas').querySelector('[data-key="email"]'),
    '海外日报表单 17 个字段（SDk 三项 + FB 梦幻/月光分开 + 邮箱梦幻/爱江山/月光分开）',
    $('dailyFormOverseas').querySelectorAll('[data-key]').length);

  // 工单栏：g7=异世界群维系(3+1)、①②⑤群维系(只为只存档层)、sso=SSO国内(5)
  // 海外栏：SDk 三项合计 12（梦幻5+爱江山4+月光3）、email=海外邮件(4)、ios+google=商店回复(14)、mute=禁言(7)、ban=封号(3)
  //        新增三项：mhl_group=6、cp_ticket=2、cn_ticket=3；月光FB=2（单独统计，不并进梦幻FB）
  const dailySets = [['dailyFormTicket', 'name', '测试员'], ['dailyFormTicket', 'shift', 'F'],
    ['dailyFormTicket', 'g7_wx', 3], ['dailyFormTicket', 'g7_dy', 1],
    ['dailyFormTicket', 'g1_wx', 2], ['dailyFormTicket', 'g2_dy', 1], ['dailyFormTicket', 'sso', 5],
    ['dailyFormOverseas', 'sdk_mh', 5], ['dailyFormOverseas', 'sdk_ajs', 4], ['dailyFormOverseas', 'sdk_yl', 3],
    ['dailyFormOverseas', 'email_mh', 2], ['dailyFormOverseas', 'email_ajs', 1], ['dailyFormOverseas', 'email_yl', 1],
    ['dailyFormOverseas', 'fb_yl', 2],
    ['dailyFormOverseas', 'ios', 9], ['dailyFormOverseas', 'google', 5],
    ['dailyFormOverseas', 'mute', 7], ['dailyFormOverseas', 'ban', 3],
    ['dailyFormOverseas', 'mhl_group', 6], ['dailyFormOverseas', 'cp_ticket', 2], ['dailyFormOverseas', 'cn_ticket', 3]];
  let setOk = 0;
  for (const [form, key, val] of dailySets) if (setDailyField(form, key, val)) setOk++;
  check(setOk === dailySets.length, `日报 ${dailySets.length} 个字段已填入`, setOk);

  $('generateDailyBtn').click();          // 生成日报 = 自动归档
  await sleep(60);
  const rec0 = (lastCareer() || { records: {} }).records[bjToday];
  check(!!rec0, '点「生成日报」后当天已自动归档', Object.keys((lastCareer() || { records: {} }).records).slice(0, 3));
  check(rec0 && rec0.total === 70, '折算口径正确：当日工作量 = 70（工单 17 + 海外 53）', rec0 && rec0.total);
  check(rec0 && rec0.items.ov_fb_yl === 2 && rec0.items.ov_fb === undefined,
    '月光FB 单独入账（2），没并进梦幻FB', rec0 && [rec0.items.ov_fb_yl, rec0.items.ov_fb]);
  check(rec0 && rec0.items.t_sso === 5 && rec0.items.t_g7_wx === 3 && rec0.items.store_reply === 14
    && rec0.items.ov_sso === 12 && rec0.items.ov_email === 4 && rec0.items.mute === 7 && rec0.items.ban === 3,
    '逐项折算正确（工单侧 SSO5/⑦工单来访3+1、海外侧 商店14/海外SSO12/邮件4/禁言7/封号3）', rec0 && rec0.items);
  check(rec0 && rec0.items.mhl_group === 6 && rec0.items.ov_cp === 2 && rec0.items.cn_ticket === 3,
    '海外日报新增的三项已计入海外侧（群维系6/CP后台2/国内工单3）', rec0 && rec0.items);
  check(rec0 && rec0.items.sdk_mh === 5 && rec0.items.sdk_ajs === 4 && rec0.items.sdk_yl === 3,
    'SDk 三项明细各自留存（梦幻5/爱江山4/月光3）', rec0 && rec0.items);
  const ovReport = $('dailyResultArea').value;
  check(ovReport.includes('SDk工单：12例'), '日报正文里 SDk 三项已合并成一个「SDk工单」数', ovReport.slice(-160));
  check(ovReport.includes('FB·月光：2例') && ovReport.includes('FB·梦幻：0例'),
    '海外日报正文把 FB 拆成「梦幻 / 月光」两行', ovReport.slice(-200));
  check(ovReport.includes('邮箱：4例') && !ovReport.includes('邮箱·梦幻：'),
    '日报正文里邮箱三项合并成一个「邮箱：4例」（表单仍是三项分开填）', ovReport.slice(-200));
  check(ovReport.includes('（梦幻/繁花/乐缤纷）群维系：6') && ovReport.includes('海外CP后台工单：2') && ovReport.includes('国内工单：3'),
    '海外日报正文已输出这 3 行', ovReport.slice(-110));
  check(rec0 && rec0.status === '已完成记录' && rec0.src === 'daily', '状态与来源标记正确', rec0 && [rec0.status, rec0.src]);
  check(rec0 && rec0.items.t_g1_wx === 2 && rec0.items.t_g2_dy === 1 && rec0.items.t_g6_wx === 5
    && rec0.items.t_g7_wx === 3 && rec0.items.t_g7_dy === 1,
    '工单日报全部字段都在工单侧（含 ①②⑤⑦ 逐平台）', rec0 && rec0.items);
  check(rec0 && rec0.items.sj_group === undefined, '海外侧「异世界群维系」读海外日报那个字段（smoke 没填 → 不入账）', rec0 && rec0.items.sj_group);
  check(rec0 && rec0.items.g6_group === undefined && rec0.items.fanhua_group === undefined, '不再有聚合项/只存档项的旧 key', rec0 && rec0.items);
  check(rec0 && rec0.items.t_g5_wx === undefined, '日报里没填的字段不入账（⑤梦幻是 0）', rec0 && rec0.items);
  check(rec0 && rec0.extra === undefined, '不再有脱离统计的 extra 字段');

  doc.querySelector('.tab-btn[data-tab="career"]').click();   // 切到客服生涯
  await sleep(40);
  check(/累计工作量\s*70/.test(kpiText()), 'KPI：累计工作量 70（工单 17 + 海外 53）', kpiText().slice(0, 60));
  check(/完整记录天数\s*1/.test(kpiText()), 'KPI：完整记录 1 天', kpiText().slice(0, 120));
  check(/日均工作量\s*70/.test(kpiText()) && /最高单日\s*70/.test(kpiText()), 'KPI：日均/最高单日 = 70');
  check(/最长连续记录\s*1 天/.test(kpiText()), 'KPI：连续记录天数');
  check(/环比|近 30 记录日日均/.test(kpiText()), 'KPI：趋势类指标已渲染');
  check($('careerTrend').querySelectorAll('span').length === 1, '趋势条 = 1 根', $('careerTrend').querySelectorAll('span').length);
  check(/工单侧\s*17 \+ 海外侧\s*53 = 累计\s*70/.test($('careerSheetHint').textContent)
    && !/登记表/.test($('careerSheetHint').textContent),
    '汇总行：工单17 + 海外53 = 累计 70（不再提「登记表 14 项口径」）', $('careerSheetHint').textContent);
  check(!!$('careerSplitBar') && doc.querySelectorAll('#careerSplitBar > i').length === 2
    && /工单侧\s*17/.test($('careerSplitLegend').textContent) && /海外侧\s*53/.test($('careerSplitLegend').textContent),
    '两侧占比堆叠条：两段 + 图例（工单17 / 海外53）', $('careerSplitLegend').textContent);
  const sideTicket = $('careerSideTicket').textContent;
  const sideOverseas = $('careerSideOverseas').textContent;
  check(/工单侧累计\s*17/.test(sideTicket), '工单侧单独统计：累计 17', sideTicket.slice(0, 40));
  check(/海外侧累计\s*53/.test(sideOverseas), '海外侧单独统计：累计 53', sideOverseas.slice(0, 40));
  check(/53客服在线/.test(sideTicket) && /支付宝在线/.test(sideTicket) && /爱江山CP后台/.test(sideTicket)
    && /①繁花·微信/.test(sideTicket) && /⑤梦幻消除战·微信/.test(sideTicket) && /⑦异世界勇者·微信/.test(sideTicket)
    && !/异世界群维系/.test(sideTicket) && !/猫之城/.test(sideTicket),
    '工单侧 = 工单日报全部字段（①②⑤⑦ 都在），且不含只存档项', sideTicket.slice(0, 60));
  check(/异世界群维系/.test(sideOverseas) && /（梦幻\/繁花\/乐缤纷）群维系/.test(sideOverseas)
    && /国内工单/.test(sideOverseas) && /海外CP后台工单/.test(sideOverseas) && /海外FB·月光/.test(sideOverseas) && /监控禁言/.test(sideOverseas),
    '海外侧含 异世界群维系 /（梦幻/繁花/乐缤纷）群维系 / 国内工单 / 海外CP后台工单 / 海外FB·月光 / 禁言封号');
  check($('careerItemTable') === null && !/对外报表口径/.test(doc.body.textContent)
    && !/登记表 14 项/.test(doc.body.textContent),
    '对外报表口径那一块已从页面上移除');
  check(/在线客服/.test(sideTicket) && /工单\/后台/.test(sideTicket) && !/CP后台（|群维系（/.test(sideTicket),
    '工单表格按「类别」分组：CP后台 + 群维系 已并进「工单/后台」', sideTicket.slice(0, 80));
  check(doc.querySelectorAll('#careerSideTicket td.career-group-cell[colspan]').length === 2,
    '工单侧只剩 2 个分组标题行（工单/后台〔含 CP后台 + 群维系〕· 在线客服）',
    doc.querySelectorAll('#careerSideTicket td.career-group-cell[colspan]').length);
  check(/SDk 明细/.test(sideOverseas) && /SDk工单·梦幻/.test(sideOverseas) && /SDk工单·爱江山/.test(sideOverseas)
    && /SDk工单·月光/.test(sideOverseas),
    '海外侧多出一组 SDk 三项明细（可分别查看）', sideOverseas.slice(-90));
  check(doc.querySelectorAll('#careerSideOverseas tr.career-sub-row').length === 6,
    'SDk 三项 + 邮箱三项明细各占一行（都是「其中项」，不重复计入合计）',
    doc.querySelectorAll('#careerSideOverseas tr.career-sub-row').length);
  check(/邮箱明细/.test(sideOverseas) && /邮箱·梦幻/.test(sideOverseas) && /邮箱·爱江山/.test(sideOverseas)
    && /邮箱·月光/.test(sideOverseas),
    '海外侧多出一组邮箱三项明细（梦幻 / 爱江山 / 月光 可分别查看）', sideOverseas.slice(-90));
  // 周维度 / 来源结构 / 异常日 / 峰值标注
  {
    const weekRows = $('careerWeeklyTable').querySelectorAll('tbody tr');
    const weekTxt = $('careerWeeklyTable').textContent;
    check(weekRows.length === 1 && /周（周一～周日）/.test(weekTxt) && /记录天数/.test(weekTxt)
      && /环比上周/.test(weekTxt) && /同比（4 周前）/.test(weekTxt) && /～/.test(weekRows[0].textContent),
      '周维度表：所在周（周一～周日）+ 环比/同比列', weekTxt.slice(0, 80));
    check(/合计/.test(weekTxt), '周维度表有合计行');
    const struct = $('careerStructureBox').textContent;
    check(/工单\/后台/.test(struct) && /评价回复/.test(struct) && /监控/.test(struct) && /群维系/.test(struct) && /Top3 集中度/.test(struct)
      && doc.querySelectorAll('#careerStructureBox .career-split-bar > i').length === 5,
      '来源结构：5 个来源大类占比 + Top3 集中度', struct.slice(0, 110));
    const anom = $('careerAnomalyBox').textContent;
    check(/异常线 μ\+2σ/.test(anom) && /活动 \/ 版本峰值标注/.test(anom),
      '异常日 & 峰值标注两块都在（1 天数据算不出异常线，也给说明）', anom.slice(0, 90));
    // 报表抬头（暗色主题 · 报表版式）
    check(/WORKLOAD REPORT/.test(doc.body.textContent) && /数据范围 \d{4}-\d\d-\d\d/.test($('careerReportSub').textContent)
      && /口径/.test($('careerReportSub').textContent),
      '报表抬头：英文 kicker + 数据范围 + 口径', $('careerReportSub').textContent.slice(0, 90));
    check(doc.querySelectorAll('#careerReportMeta > div').length === 5
      && /身份/.test($('careerReportMeta').textContent) && /记录天数/.test($('careerReportMeta').textContent)
      && /出具日期/.test($('careerReportMeta').textContent),
      '报表抬头右上 5 格元数据（身份 / 记录天数 / 累计 / 日均 / 出具日期）',
      $('careerReportMeta').textContent.slice(0, 90));
  }
  // 身份筛选：只看海外时，工单卡藏起来、总览只算海外那 53
  const scopeBtn = (scope) => doc.querySelector('#careerScopeBar button[data-scope="' + scope + '"]');
  scopeBtn('overseas').click();
  await sleep(40);
  check(/海外侧累计\s*53/.test(kpiText()) && /完整记录天数\s*1/.test(kpiText()),
    '身份=海外：总览只算海外侧（累计 53）', kpiText().slice(0, 60));
  check($('careerCardTicket').style.display === 'none' && $('careerCardOverseas').style.display !== 'none',
    '身份=海外：工单统计卡隐藏、海外统计卡显示');
  check($('careerSplitWrap').style.display === 'none', '身份=海外：两侧占比条隐藏（只剩一侧没意义）');
  check(/海外侧累计\s*53/.test($('careerSheetHint').textContent) && /只统计「海外日报」里的项/.test($('careerSheetHint').textContent),
    '身份=海外：汇总行只讲海外侧', $('careerSheetHint').textContent);
  check(window.localStorage.getItem('careerScope') === 'overseas', '身份选择记在本机（刷新后保持）');
  scopeBtn('ticket').click();
  await sleep(40);
  check(/工单侧累计\s*17/.test(kpiText()) && $('careerCardOverseas').style.display === 'none',
    '身份=工单：总览只算工单侧（累计 17）+ 海外卡隐藏', kpiText().slice(0, 60));
  scopeBtn('all').click();
  await sleep(40);
  check(/累计工作量\s*70/.test(kpiText()) && $('careerCardTicket').style.display !== 'none'
    && $('careerCardOverseas').style.display !== 'none',
    '身份=全部：回到两侧合计 70');
  // 指标详情：默认全部 / 按日；换成某一项时应能算出那一项的总量与平均
  check(!!$('careerDetailItem') && !!$('careerDetailGrain') && /全部工作量/.test($('careerDetailItem').textContent),
    '指标详情：范围下拉有「全部工作量」等选项');
  check(/总量\s*70/.test($('careerDetailSummary').textContent) && /日均\s*70/.test($('careerDetailSummary').textContent),
    '指标详情：全部 / 按日 → 总量 70、日均 70', $('careerDetailSummary').textContent.slice(0, 60));
  $('careerDetailItem').value = 'ov_sso';
  fire($('careerDetailItem'), 'change');
  await sleep(30);
  $('careerDetailGrain').value = 'month';
  fire($('careerDetailGrain'), 'change');
  await sleep(30);
  check(/总量\s*12/.test($('careerDetailSummary').textContent) && /月均\s*12/.test($('careerDetailSummary').textContent),
    '指标详情：单项（海外SSO工单量）+ 按月 → 总量 12 / 月均 12', $('careerDetailSummary').textContent.slice(0, 80));
  check(/海外SSO工单量/.test($('careerDetailTable').textContent) === false
    && /2026-\d\d/.test($('careerDetailTable').textContent),
    '指标详情：按月表格列出月份', $('careerDetailTable').textContent.slice(0, 60));
  $('careerDetailItem').value = 'sdk_mh';
  fire($('careerDetailItem'), 'change');
  await sleep(30);
  $('careerDetailGrain').value = 'day';
  fire($('careerDetailGrain'), 'change');
  await sleep(30);
  check(/总量\s*5/.test($('careerDetailSummary').textContent),
    '指标详情：SDk 明细也能单独看（梦幻 = 5）', $('careerDetailSummary').textContent.slice(0, 60));
  $('careerDetailItem').value = 'all';
  fire($('careerDetailItem'), 'change');
  await sleep(20);
  // 补录 / 粘贴导入：默认收起，点标题展开
  check($('careerEditBody').style.display === 'none' && $('careerImportBody').style.display === 'none',
    '补录 / 粘贴导入默认收起');
  $('careerImportToggleBtn').click();
  await sleep(20);
  check($('careerImportBody').style.display !== 'none' && $('careerImportToggleBtn').getAttribute('aria-expanded') === 'true',
    '点「粘贴导入」标题后展开');
  $('careerEditToggleBtn').click();
  await sleep(20);
  check($('careerEditBody').style.display !== 'none', '点「补录 / 修正」标题后展开');
  check(!!$('careerEditGrid').querySelector('[data-career-key="t_sso"]')
    && !!$('careerEditGrid').querySelector('[data-career-key="ov_sso"]')
    && !!$('careerEditGrid').querySelector('[data-career-key="sdk_mh"]'),
    '补录表单里有全部项（工单 SSO / 海外 SSO / SDk 梦幻明细）');

  // 粘贴导入：故意打乱表头顺序，验证按列名对齐；日期用 Excel 序列号
  const tsv = [
    '日期\t人员\t班次\t商店回复\t海外SSO工单量（全产品）\t（繁花+乐缤纷+梦幻）群维系\t监控禁言\t监控封号\t总计\t数据状态\t特殊问题',
    '46176\t姚宏杰\tF\t14\t12\t0\t9\t7\t42\t已完成记录\t',
    '2026-06-04\t姚宏杰\tH\t10\t8\t2\t0\t0\t20\t已完成记录\t开服活动',
    '2026-07-15\t姚宏杰\tH\t0\t0\t0\t0\t0\t\t总计为空/待确认\t',
  ].join('\n');
  $('careerImportArea').value = tsv;
  $('careerImportBtn').click();
  await sleep(60);
  const recs = (lastCareer() || { records: {} }).records;
  check(/导入 3 天/.test($('careerImportHint').textContent), '导入提示条数正确', $('careerImportHint').textContent);
  check(!!recs['2026-06-03'], 'Excel 序列号 46176 → 2026-06-03', Object.keys(recs).sort());
  check(recs['2026-06-03'] && recs['2026-06-03'].items.store_reply === 14 && recs['2026-06-03'].items.ov_sso === 12,
    '打乱列顺序仍按表头正确落位', recs['2026-06-03'] && recs['2026-06-03'].items);
  check(recs['2026-06-03'] && recs['2026-06-03'].total === 42, '导入行总计 = 各列之和 42', recs['2026-06-03'] && recs['2026-06-03'].total);
  check(recs['2026-06-04'] && recs['2026-06-04'].note === '开服活动', '特殊问题列已带入');
  check(/累计工作量\s*132/.test(kpiText()), 'KPI 更新：70 + 42 + 20 = 132', kpiText().slice(0, 40));
  check(/=\s*累计\s*132/.test($('careerSheetHint').textContent), '汇总行同步为累计 132（70+42+20）', $('careerSheetHint').textContent);
  check(/待确认 1 天/.test($('careerQuality').textContent), '「总计为空/待确认」不入统计，单列提示', $('careerQuality').textContent.slice(0, 60));
  const monthTbl = $('careerMonthlyTable').textContent;
  check(monthTbl.includes('2026-06') && monthTbl.includes(bjToday.slice(0, 7)), '月度汇总含 2026-06 与本月', monthTbl.slice(0, 60));
  // 周维度 / 来源结构 / 异常日 & 峰值标注（多条数据后）
  {
    const peakBox = $('careerAnomalyBox').textContent;
    check(/开服活动/.test(peakBox) && /2026-06-04/.test(peakBox), '备注里含「活动」的日子被标成峰值', peakBox.slice(0, 130));
    check(/异常线 μ\+2σ = /.test(peakBox), '异常线 μ+2σ 已算出', peakBox.slice(0, 60));
    check(doc.querySelectorAll('#careerTrend span.peak').length === 1,
      '趋势条上那根被标成峰值色（橙）', doc.querySelectorAll('#careerTrend span.peak').length);
    const wkTxt = $('careerWeeklyTable').textContent;
    check(/2026-06-01 ～ 06-07/.test(wkTxt) && /合计/.test(wkTxt) && /\+|—/.test(wkTxt),
      '周维度表：6/3、6/4 归到同一周（2026-06-01 ～ 06-07）且算了环比', wkTxt.slice(0, 100));
    const stTxt = $('careerStructureBox').textContent;
    check(doc.querySelectorAll('#careerStructureBox .career-split-bar > i').length >= 3 && /Top3 集中度：/.test(stTxt)
      && /合计占/.test(stTxt), '来源结构：按来源大类分段 + Top3 集中度', stTxt.slice(0, 120));
  }

  // 重复导入同一天：覆盖而不是累加
  $('careerImportBtn').click();
  await sleep(60);
  const recs2 = (lastCareer() || { records: {} }).records;
  check(Object.keys(recs2).length === Object.keys(recs).length, '重复导入不产生重复记录', Object.keys(recs2).length);
  check(/覆盖已有 3 天/.test($('careerImportHint').textContent), '重复导入提示为覆盖', $('careerImportHint').textContent);
  check(/累计工作量\s*132/.test(kpiText()), '重复导入后累计仍是 132（未翻倍）', kpiText().slice(0, 40));

  // 补录 / 修正 / 删除
  $('careerEditDate').value = '2026-06-05';
  $('careerLoadDayBtn').click();
  await sleep(30);
  check(/还没有记录/.test($('careerEditHint').textContent), '补录：空日期给出提示', $('careerEditHint').textContent);
  $('careerEditGrid').querySelector('[data-career-key="store_reply"]').value = '6';
  $('careerSaveDayBtn').click();
  await sleep(30);
  check(/已保存 2026-06-05：工作量 6/.test($('careerEditHint').textContent), '补录保存成功', $('careerEditHint').textContent);
  check(/累计工作量\s*138/.test(kpiText()), '补录后累计 132+6 = 138', kpiText().slice(0, 40));
  $('careerLoadDayBtn').click();
  await sleep(30);
  check(/已载入 2026-06-05/.test($('careerEditHint').textContent)
    && $('careerEditGrid').querySelector('[data-career-key="store_reply"]').value === '6', '能回读已补录的那天');
  $('careerDeleteDayBtn').click();
  await sleep(30);
  check(/累计工作量\s*132/.test(kpiText()), '删除后累计回到 132', kpiText().slice(0, 40));

  // 导出：jsdom 里 <a>.click() 会触发 "navigation not implemented"，这里换成桩并把 Blob 内容抓出来验
  const origBlob = window.Blob;
  const origAnchorClick = window.HTMLAnchorElement.prototype.click;
  const capturedBlobs = [];
  window.Blob = function (parts, opts) {
    try { capturedBlobs.push(String((parts || [])[0])); } catch (_) { }
    return new origBlob(parts, opts);
  };
  window.HTMLAnchorElement.prototype.click = function () { };
  $('careerExportCsvBtn').click();
  $('careerExportJsonBtn').click();
  await sleep(30);
  window.Blob = origBlob;
  window.HTMLAnchorElement.prototype.click = origAnchorClick;
  const csvOut = capturedBlobs[0] || '';
  const jsonOut = capturedBlobs[1] || '';
  check(csvOut.charCodeAt(0) === 0xFEFF && /日期,人员,班次/.test(csvOut) && csvOut.includes('商店回复') && csvOut.includes('监控封号'),
    'CSV 导出：带 BOM + 14 项表头齐全', csvOut.slice(0, 46));
  check(csvOut.split('\r\n').length === Object.keys(recs2).length + 1, 'CSV 行数 = 记录数 + 表头', csvOut.split('\r\n').length);
  check(/"?records"?/.test(jsonOut) && jsonOut.includes('2026-06-03') && jsonOut.includes('2026-07-15'),
    'JSON 导出：含全部记录（含待确认那天）', jsonOut.slice(0, 30));
  check(careerRequests().length === 0, '客服生涯一次都没碰服务端（不再 /api/data，各设备只用自己的数据）', careerRequests().map(p => p.method + ' ' + p.url));
  check(!!window.localStorage.getItem('careerData'), '客服生涯数据落在本机 localStorage');
  {
    const saved = JSON.parse(window.localStorage.getItem('careerData') || 'null');
    check(!!saved && Object.keys(saved.records || {}).length === Object.keys(recs2).length,
      'localStorage 里的记录数与界面一致', saved && Object.keys(saved.records || {}).length);
  }

  console.log('--- 8d. 粘贴导入：识别工作台自己生成的日报文本 ---');
  // 先补上海外侧「异世界群维系」（群维系来访），凑齐 4 个海外日报新字段
  setDailyField('dailyFormOverseas', 'sj_group', 4);
  await sleep(20);
  $('dailyTabOverseas').click();                 // 当前在海外栏 → 生成海外日报文本
  await sleep(20);
  $('generateDailyBtn').click();
  await sleep(40);
  const ovReportText = $('dailyResultArea').value;
  check(/异世界群维系：4/.test(ovReportText) && /（梦幻\/繁花\/乐缤纷）群维系：6/.test(ovReportText)
    && /海外CP后台工单：2/.test(ovReportText) && /国内工单：3/.test(ovReportText),
    '海外日报正文含 4 个新字段的值', ovReportText.slice(-100));
  $('dailyTabTicket').click();                    // 切到工单栏 → 生成工单日报文本
  await sleep(20);
  $('generateDailyBtn').click();
  await sleep(40);
  const tkReportText = $('dailyResultArea').value;
  check(/①繁花微信【2】/.test(tkReportText) && /⑦异世界勇者微信【3】，抖音【1】/.test(tkReportText) && /SSO工单5/.test(tkReportText),
    '工单日报正文含各字段的值', tkReportText.slice(0, 90));
  const totalWithSj = 74;                         // 工单 17 + 海外 53 + 异世界群维系 4

  // 先把当天记录删掉，证明接下来的数字确实是导入出来的
  $('careerEditDate').value = bjToday;
  $('careerLoadDayBtn').click();
  await sleep(30);
  $('careerDeleteDayBtn').click();
  await sleep(30);
  check(/累计工作量\s*62/.test(kpiText()), '删掉当天后累计 = 62（只剩导入的两天）', kpiText().slice(0, 30));

  // 把「工单日报 + 海外日报」两段一起粘进去
  $('careerImportArea').value = tkReportText + '\n\n' + ovReportText;
  $('careerImportBtn').click();
  await sleep(60);
  check(/识别为日报格式：1 天/.test($('careerImportHint').textContent)
    && $('careerImportHint').textContent.includes('工单+海外=' + totalWithSj),
    '识别为日报格式并算出当天合计', $('careerImportHint').textContent);
  const recR = (lastCareer() || { records: {} }).records[bjToday];
  check(!!recR && recR.total === totalWithSj, '日报文本导入后的当天工作量 = ' + totalWithSj, recR && recR.total);
  check(recR && recR.items.t_sso === 5 && recR.items.t_g1_wx === 2 && recR.items.t_g7_wx === 3 && recR.items.t_g7_dy === 1,
    '工单日报那段的各平台数字都还原了', recR && recR.items);
  check(recR && recR.items.sj_group === 4 && recR.items.mhl_group === 6 && recR.items.ov_cp === 2
    && recR.items.cn_ticket === 3 && recR.items.store_reply === 14 && recR.items.mute === 7 && recR.items.ban === 3,
    '海外日报那段也还原了（含异世界群维系4 / 商店回复14=ios9+google5）', recR && recR.items);
  check(/累计工作量\s*136/.test(kpiText()), '导入后累计 = 62 + 74 = 136（与归档口径一致）', kpiText().slice(0, 30));
  check(recR && recR.name === '测试员' && recR.shift === 'F', '姓名/班次也从日报文本里带出来了', recR && [recR.name, recR.shift]);
  // 只粘工单日报那一段时，海外侧旧值不应被清掉
  $('careerImportArea').value = tkReportText;
  $('careerImportBtn').click();
  await sleep(60);
  const recT = (lastCareer() || {}).records[bjToday];
  check(recT && recT.items.sj_group === 4 && recT.items.store_reply === 14 && recT.total === totalWithSj,
    '只粘工单日报时，海外侧数字保留（按侧覆盖，不整条清空）', recT && recT.total);

  console.log('--- 8e. 重置模板：姓名保留，其它字段回默认 ---');
  const fieldVal = (formId, key) => {
    const el = $(formId).querySelector('[data-key="' + key + '"]');
    return el ? el.value : null;
  };
  $('dailyTabTicket').click();
  await sleep(30);
  setDailyField('dailyFormTicket', 'name', '重置测试员');
  setDailyField('dailyFormTicket', 'g1_wx', 9);
  await sleep(30);
  $('resetDailyBtn').click();
  await sleep(40);
  check(fieldVal('dailyFormTicket', 'name') === '重置测试员', '工单栏重置后姓名保留', fieldVal('dailyFormTicket', 'name'));
  check(String(fieldVal('dailyFormTicket', 'g1_wx')) === '0', '工单栏重置后其它字段回默认', fieldVal('dailyFormTicket', 'g1_wx'));
  $('dailyTabOverseas').click();
  await sleep(30);
  setDailyField('dailyFormOverseas', 'name', '海外小李');
  await sleep(30);
  $('resetDailyBtn').click();
  await sleep(40);
  check(fieldVal('dailyFormOverseas', 'name') === '海外小李', '海外栏重置后姓名也保留', fieldVal('dailyFormOverseas', 'name'));
  check(String(fieldVal('dailyFormOverseas', 'mhl_group')) === '0', '海外栏重置后其它字段回默认', fieldVal('dailyFormOverseas', 'mhl_group'));
  check(fieldVal('dailyFormTicket', 'name') === '重置测试员', '重置海外栏不会动工单栏的姓名', fieldVal('dailyFormTicket', 'name'));
  $('dailyTabTicket').click();
  await sleep(20);

  console.log('--- 8f. 客服生涯：JSON 导入 / 清空本机（都不碰服务端）---');
  {
    const recsNow = () => (lastCareer() || { records: {} }).records;
    const daysBefore = Object.keys(recsNow()).length;
    const existingDate = Object.keys(recsNow()).sort()[0];
    const freshDate = '2026-12-31';
    const payload = { records: {}, updatedAt: null };
    payload.records[existingDate] = { date: existingDate, shift: 'A', status: '已完成记录', items: { t_sso: 7 }, total: 7, src: 'manual' };
    payload.records[freshDate] = { date: freshDate, shift: 'A', status: '已完成记录', items: { t_sso: 9 }, total: 9, src: 'manual' };
    const fin = $('careerImportJsonInput');
    check(!!fin, '导入 JSON 的 file 输入已注入');
    Object.defineProperty(fin, 'files', {
      value: [new window.File([JSON.stringify(payload)], 'career.json', { type: 'application/json' })],
      configurable: true
    });
    fire(fin, 'change');
    await sleep(80);
    check(Object.keys(recsNow()).length === daysBefore + 1, 'JSON 导入：新日期加进来', Object.keys(recsNow()).length);
    check(recsNow()[existingDate] && recsNow()[existingDate].total === 7, 'JSON 导入：同一天以文件为准（覆盖）', recsNow()[existingDate] && recsNow()[existingDate].total);
    check(/已从 JSON 导入 2 天/.test($('careerArchiveHint').textContent), 'JSON 导入有提示', $('careerArchiveHint').textContent);
    check(careerRequests().length === 0, 'JSON 导入不碰服务端', careerRequests().length);

    const daysNow = Object.keys(recsNow()).length;
    $('careerClearLocalBtn').click();
    await sleep(40);
    check(Object.keys(recsNow()).length === 0, '清空本机：记录归零（清掉 ' + daysNow + ' 天）', Object.keys(recsNow()).length);
    check(window.localStorage.getItem('careerData') === null, '清空本机：localStorage 键也被删掉');
    check(/已清空本机的 \d+ 天/.test($('careerArchiveHint').textContent), '清空本机有提示', $('careerArchiveHint').textContent);
    check(careerRequests().length === 0, '清空本机也不碰服务端（生涯根本没有服务端副本）', careerRequests().length);
    // 清空后再点一次：应提示本来就是空的，不弹 confirm
    $('careerClearLocalBtn').click();
    await sleep(20);
    check(/本来就没有/.test($('careerArchiveHint').textContent), '空数据时再点清空 → 提示本来就是空的', $('careerArchiveHint').textContent);
  }

  console.log('--- 8g. 海外业务统计：整表粘贴导入 + 只存本机 + 详情图表 ---');
  {
    const ovbizSaved = () => {
      try { return JSON.parse(window.localStorage.getItem('overseasBizData') || 'null'); } catch (_) { return null; }
    };
    const ovbizReqs = () => posts.filter(p => p.url.includes('overseasBizData'));
    // 表头故意打乱顺序 + 用真实周报的表头写法；同一天两行（两个人同班）
    const csv = [
      '人员,22,班次,（繁花+乐缤纷+梦幻）群维系,异世界群维系,海外SSO工单量（全产品）,海外CP后台工单（全产品）,海外邮件（全产品）,海外FB（全产品）,商店回复,SSO国内工单,监控禁言,监控封号,邮件+SDK（猫旅馆物语）,总计,特殊问题',
      '陈智锋,2026/1/1,,35,0,11,5,1,1,,,13,19,,85,',
      '温泽鸿,2026/1/1,,20,1,9,3,2,0,,,7,25,,68,春节活动值班',
      '陈智锋,2026/2/3,,23,0,18,4,3,4,,,11,62,,139,',
      ',,,,,,,,,,,,,,0,'
    ].join('\n');
    $('ovbizPasteArea').value = csv;
    $('ovbizImportBtn').click();
    await sleep(60);
    check(/已导入 3 行/.test($('ovbizHint').textContent) && /覆盖 2 天/.test($('ovbizHint').textContent),
      '海外业务：粘贴整表导入 3 行 / 2 天（空白行自动跳过）', $('ovbizHint').textContent);
    const saved0 = ovbizSaved();
    check(!!saved0 && Object.keys(saved0.rows || {}).length === 3, '海外业务：落进本机 localStorage（键 overseasBizData）',
      saved0 && Object.keys(saved0.rows || {}).length);
    check(ovbizReqs().length === 0, '海外业务：导入完全不碰服务端（不再 /api/data/overseasBizData）',
      ovbizReqs().map(p => p.method + ' ' + p.url));
    check(!serverData.overseasBizData, '海外业务：服务端自始至终没有这份数据');
    check(!$('ovbizSyncBtn'), '海外业务：「同步服务端」按钮已删除');
    check(ovbizSaved().rows['2026-01-01|陈智锋'].total === 85 && ovbizSaved().rows['2026-01-01|温泽鸿'].total === 67,
      '海外业务：每行按各项之和入账（陈 85 / 温 67，「邮件+SDK」那列已不算）',
      ovbizSaved().rows['2026-01-01|陈智锋'].total + '/' + ovbizSaved().rows['2026-01-01|温泽鸿'].total);
    // 1/1 两个人同班 → 按天合计 152
    check(/累计工作量\s*277/.test($('ovbizKpi').textContent), '海外业务：累计 = 85+67+125 = 277（1/1 两人合计 152）', $('ovbizKpi').textContent.slice(0, 60));
    check(/完整记录天数\s*2/.test($('ovbizKpi').textContent) && /最高单日\s*152/.test($('ovbizKpi').textContent),
      '海外业务：记录天数 2、最高单日 152（1/1 两人合计）', $('ovbizKpi').textContent.slice(0, 120));
    check(doc.querySelectorAll('#ovbizDailyTable tbody tr').length === 2
      && /温泽鸿、陈智锋|陈智锋、温泽鸿/.test($('ovbizDailyTable').textContent)
      && /春节活动值班/.test($('ovbizDailyTable').textContent),
      '海外业务：每日表按天合计并列出当天人员与备注', $('ovbizDailyTable').textContent.slice(0, 90));
    check(doc.querySelectorAll('#ovbizPeopleTable tbody tr').length === 2
      && /陈智锋/.test($('ovbizPeopleTable').textContent) && /占岗位/.test($('ovbizPeopleTable').textContent),
      '海外业务：按人员统计 2 人', $('ovbizPeopleTable').textContent.slice(0, 80));
    check(doc.querySelectorAll('#ovbizItemTable tbody tr').length === 10
      && /合计\s*277/.test($('ovbizItemTable').textContent.replace(/\s+/g, ' '))
      && !/邮件\+SDK/.test($('ovbizItemTable').textContent),
      '海外业务：逐项统计 10 项（已无「邮件+SDK（猫旅馆物语）」）+ 合计 277',
      $('ovbizItemTable').textContent.replace(/\s+/g, ' ').slice(-60));
    check(doc.querySelectorAll('#ovbizMonthlyTable tbody tr').length === 2
      && /2026-01/.test($('ovbizMonthlyTable').textContent) && /2026-02/.test($('ovbizMonthlyTable').textContent),
      '海外业务：月度表按月汇总（1 月 / 2 月各一行）');
    check(doc.querySelectorAll('#ovbizReportMeta > div').length === 5
      && /覆盖人员/.test($('ovbizReportMeta').textContent) && /累计工作量/.test($('ovbizReportMeta').textContent),
      '海外业务：报表抬头 5 格元数据（覆盖人员/记录天数/累计/日均/出具日期）', $('ovbizReportMeta').textContent.slice(0, 80));
    check(/只存在这台设备的浏览器里/.test($('ovbizSyncHint').textContent)
      && /不上传服务端/.test($('ovbizSyncHint').textContent),
      '海外业务：状态行写明「只存在这台设备、不上传服务端」', $('ovbizSyncHint').textContent.slice(0, 70));
    check(/只存在这台设备的浏览器里/.test($('ovbizSheetHint').textContent)
      && !/三个人共用一份/.test($('ovbizSheetHint').textContent),
      '海外业务：汇总行改成「只存在这台设备」', $('ovbizSheetHint').textContent.slice(0, 80));
    // 切到「海外业务统计」标签页：重画一遍，但一次服务端都不碰
    const reqsBeforeTab = ovbizReqs().length;
    doc.querySelector('.tab-btn[data-tab="overseas"]').click();
    await sleep(60);
    check(ovbizReqs().length === reqsBeforeTab && doc.querySelectorAll('#ovbizDailyTable tbody tr').length === 2,
      '海外业务：切标签页只重画（不发任何请求）', ovbizReqs().length - reqsBeforeTab);
    // ---- 走势条 ----
    check(doc.querySelectorAll('#ovbizTrend > span').length === 2, '海外业务：走势条画了 2 个记录日',
      doc.querySelectorAll('#ovbizTrend > span').length);
    check(doc.querySelectorAll('#ovbizTrend > span.peak').length === 1,
      '海外业务：备注里带「活动」的日子在走势条上标橙', doc.querySelectorAll('#ovbizTrend > span.peak').length);
    // ---- 详情图表 ----
    const dtItem = $('ovbizDetailItem');
    check(dtItem.options.length === 11 && /全部工作量/.test(dtItem.textContent)
      && !/邮件\+SDK/.test(dtItem.textContent),
      '海外业务：详情图表可选「全部 + 10 项」', dtItem.options.length);
    check(doc.querySelectorAll('#ovbizDetailSummary .career-kpi').length === 5
      && /总量/.test($('ovbizDetailSummary').textContent) && /277/.test($('ovbizDetailSummary').textContent),
      '海外业务：详情图表默认「全部工作量」→ 5 张汇总卡（总量 277）',
      $('ovbizDetailSummary').textContent.replace(/\s+/g, ' ').slice(0, 70));
    check(doc.querySelectorAll('#ovbizDetailChart > span').length === 2
      && doc.querySelectorAll('#ovbizDetailTable tbody tr').length === 2
      && /合计/.test($('ovbizDetailTable').textContent),
      '海外业务：详情柱子按日 2 根 + 逐期表 2 行 + 合计行',
      doc.querySelectorAll('#ovbizDetailChart > span').length + '/' + doc.querySelectorAll('#ovbizDetailTable tbody tr').length);
    // 换粒度：按月
    $('ovbizDetailGrain').value = 'month';
    fire($('ovbizDetailGrain'), 'change');
    await sleep(30);
    check(doc.querySelectorAll('#ovbizDetailTable tbody tr').length === 2
      && /2026-01/.test($('ovbizDetailTable').textContent) && /月均/.test($('ovbizDetailSummary').textContent),
      '海外业务：详情图表切「按月」→ 1 月 / 2 月两行 + 汇总卡换成月均',
      $('ovbizDetailTable').textContent.replace(/\s+/g, ' ').slice(0, 60));
    // 换范围：监控禁言（1/1 两人合计 20 + 2/3 的 11 = 31）
    $('ovbizDetailGrain').value = 'day';
    fire($('ovbizDetailGrain'), 'change');
    dtItem.value = 'mute';
    fire(dtItem, 'change');
    await sleep(30);
    check(/监控禁言/.test($('ovbizDetailSummary').textContent) && /总量\s*31/.test($('ovbizDetailSummary').textContent)
      && doc.querySelectorAll('#ovbizDetailTable tbody tr').length === 2,
      '海外业务：详情图表切到「监控禁言」→ 总量 31（20 + 11）',
      $('ovbizDetailSummary').textContent.replace(/\s+/g, ' ').slice(0, 80));
    dtItem.value = 'all';
    fire(dtItem, 'change');
    await sleep(20);
    // 重复导入：覆盖而不是累加
    $('ovbizImportBtn').click();
    await sleep(60);
    check(/覆盖同人同日 3/.test($('ovbizHint').textContent) && Object.keys(ovbizSaved().rows).length === 3,
      '海外业务：重复导入覆盖同人同日、不产生重复行', $('ovbizHint').textContent);
    check(/累计工作量\s*277/.test($('ovbizKpi').textContent), '海外业务：重复导入后累计仍是 277');
    // 总计对不上：提示并按各项之和入账（陈智锋 2026/3/1 表里写 999）
    $('ovbizPasteArea').value = '日期,人员,班次,异世界群维系,（繁花+乐缤纷+梦幻）群维系,海外SSO工单量（全产品）,海外CP后台工单（全产品）,海外邮件（全产品）,海外FB（全产品）,商店回复,SSO国内工单,监控禁言,监控封号,总计,特殊问题\n2026/3/1,陈智锋,,0,10,,,,,,,,,999,';
    $('ovbizImportBtn').click();
    await sleep(60);
    check(/总计」与各项之和对不上/.test($('ovbizHint').textContent)
      && ovbizSaved().rows['2026-03-01|陈智锋'].total === 10,
      '海外业务：「总计」对不上时提示并按各项之和入账', $('ovbizHint').textContent);
    // 清空：只清本机（别人的设备本来也看不到）
    $('ovbizClearBtn').click();
    await sleep(60);
    check(Object.keys((ovbizSaved() || { rows: {} }).rows).length === 0, '海外业务：清空 → 本机缓存归零');
    check(ovbizReqs().length === 0, '海外业务：清空也不发请求（服务端从头到尾没被碰过）', ovbizReqs().length);
    check(!serverData.overseasBizData, '海外业务：服务端仍然没有这份数据');
    check(/已清空本机的 4 行/.test($('ovbizHint').textContent), '海外业务：清空有提示（只讲本机）', $('ovbizHint').textContent);
  }

  console.log('--- 8h. 反馈模板（选模板 / 选来源 → 反馈格式）---');
  {
    const fbOut = () => $('fbOutput').value;
    const fbLine = () => fbOut().replace(/\n/g, ' | ');
    const fbChips = (id) => doc.querySelectorAll('#' + id + ' .fb-chip');
    const fbPick = (group, i) => fbChips(group)[i].click();
    check(!!doc.querySelector('.tab-btn[data-tab="feedback"]') && !!$('tab-feedback'), '反馈模板：侧边栏标签页与页面都在');
    check(fbChips('fbTemplateGroup').length === 5, '反馈模板：五种模板（梦幻消除战 / 常规游戏 / 乐缤纷CP后台 / 内部工单 / 工单（反馈））', fbChips('fbTemplateGroup').length);
    check(fbChips('fbSourceGroup').length === 11 && /企微/.test($('fbSourceGroup').textContent)
      && /乐缤纷CP后台/.test($('fbSourceGroup').textContent) && !/电话/.test($('fbSourceGroup').textContent),
      '反馈模板：来源片共 11 个（已无「电话」）', $('fbSourceGroup').textContent.trim().slice(-20));
    const fbVisible = (i) => fbChips('fbSourceGroup')[i].style.display !== 'none';
    // 来源片下标：0 抖音小店 / 1 抖音后台 / 2 53 / 3 工单 / 4 支付宝在线 / 5 支付宝后台 / 6 微信后台 / 7 爱江山CP后台 / 8 繁花CP后台 / 9 乐缤纷CP后台 / 10 企微
    check(fbVisible(6) && !fbVisible(7) && !fbVisible(8) && !fbVisible(9) && fbVisible(0),
      '反馈模板：默认「梦幻消除战」的来源不含 爱江山/繁花/乐缤纷CP后台',
      [6, 7, 8, 9, 0].map(i => i + ':' + fbVisible(i)).join(' '));
    check(fbChips('fbTemplateGroup')[0].classList.contains('active') && fbChips('fbSourceGroup')[0].classList.contains('active'),
      '反馈模板：默认选中「梦幻消除战 + 抖音小店」');
    check(doc.querySelectorAll('#fbReportMeta > div').length === 3 && /来源总数/.test($('fbReportMeta').textContent),
      '反馈模板：抬头 3 格（模板 / 来源 / 来源总数）', $('fbReportMeta').textContent);

    // 常规游戏：异世界勇者 → 区服固定 001
    fbPick('fbTemplateGroup', 1);
    check(fbChips('fbTemplateGroup')[1].classList.contains('active') && !fbChips('fbTemplateGroup')[0].classList.contains('active'),
      '反馈模板：点模板片会切换选中（单选）');
    $('fbRawInput').value = '12345678 异世界勇者-微信 安卓 77 服务器 87654321 角色名 2026-01-02';
    $('fbGenerateBtn').click();
    check(/游戏：异世界勇者-微信/.test(fbOut()) && /UID：12345678/.test(fbOut()) && /角色ID：87654321/.test(fbOut())
      && /区服：001/.test(fbOut()) && /问题：玩家反馈，麻烦看看/.test(fbOut()) && /来源：抖音小店/.test(fbOut())
      && /编号：$/.test(fbOut()),
      '反馈模板：常规游戏 + 异世界勇者 → 区服固定 001', fbLine());
    // 联盟契约 → 000
    $('fbRawInput').value = '12345678 异世界勇者-联盟契约 安卓 77 服务器 87654321 角色名 2026-01-02';
    $('fbGenerateBtn').click();
    check(/区服：000/.test(fbOut()), '反馈模板：异世界勇者 + 联盟契约 → 区服固定 000', fbLine());
    // 唱舞星计划：区服名是数字时改用「平台列」那个数字区服（原工具的 isFinite 特例）
    $('fbRawInput').value = '12345678 唱舞星计划-抖音 安卓 1001 999 87654321 老王 2026-01-02';
    $('fbGenerateBtn').click();
    check(/区服：1001/.test(fbOut()), '反馈模板：唱舞星计划 + 数字区服名 → 改用平台列的数字区服', fbLine());
    // 普通游戏 → 区服用服务器名、角色名照抄
    $('fbRawInput').value = '12345678 猫旅馆物语-微信 安卓 77 双线一服 87654321 老王 2026-01-02';
    $('fbGenerateBtn').click();
    check(/区服：双线一服/.test(fbOut()) && /角色名：老王/.test(fbOut()), '反馈模板：普通游戏 → 区服取服务器名、角色名对上', fbLine());
    // 切来源 → 已有结果跟着重刷
    fbPick('fbSourceGroup', 10);
    await sleep(20);
    check(/来源：企微/.test(fbOut()) && fbChips('fbSourceGroup')[10].classList.contains('active'),
      '反馈模板：来源切到「企微」后结果跟着变', fbLine());
    check((JSON.parse(window.localStorage.getItem('feedbackTplState') || '{}') || {}).source === '企微',
      '反馈模板：选中的来源记在本机 localStorage（feedbackTplState）',
      window.localStorage.getItem('feedbackTplState'));
    // 换回梦幻消除战：企微在它的允许列表里 → 来源保持企微
    fbPick('fbTemplateGroup', 0);
    await sleep(20);
    check(/企微/.test($('fbReportMeta').textContent) && /8 个/.test($('fbReportMeta').textContent)
      && fbVisible(10) && !fbVisible(7),
      '反馈模板：换模板后来源没变（企微在梦幻消除战的允许列表里），来源总数按模板算 = 8', $('fbReportMeta').textContent);
    // 梦幻消除战：渠道去掉括号内容
    fbPick('fbTemplateGroup', 0);
    $('fbRawInput').value = '12345678 梦幻消除战-微信(安卓) 安卓 77 服务器 87654321 老王 2026-01-02';
    $('fbGenerateBtn').click();
    check(/【梦幻消除战问题反馈】/.test(fbOut()) && /【喜扑UID】：12345678/.test(fbOut()) && /【渠道】：微信/.test(fbOut()),
      '反馈模板：梦幻消除战模板（渠道去掉中英文括号内容）', fbLine());
    // 乐缤纷CP后台：粘的是后台表格里复制出来的行（用户给的原文就是制表符分隔的一行）
    // 列序：账号 / 渠道 / 版本号 / 类型 / 问题 / 提交时间 / 状态 / 回复 / 回复人 / 回复时间 / 编辑
    fbPick('fbTemplateGroup', 2);
    const lb1 = '92930999\tweChat (wechat)\t2.1.7.62\t问题反馈\t没有显示也没有发掘币\t2026-10-02 10:05:53\t未查看\t\t\t2026-10-02 10:05:53\t回复 删除';
    const lb2 = '91819911\tweChat (wechat)\t2.1.7.62\t问题反馈\t9月27号13点40分左右逃跑\t2026-10-01 23:03:49\t未查看\t\t\t2026-10-01 23:03:49\t回复 删除';
    const lbSeg1 = '乐缤纷\n渠道：weChat (wechat)\n问题：没有显示也没有发掘币\n角色ID：92930999\n来源：乐缤纷CP后台';
    const lbSeg2 = '乐缤纷\n渠道：weChat (wechat)\n问题：9月27号13点40分左右逃跑\n角色ID：91819911\n来源：乐缤纷CP后台';
    $('fbRawInput').value = lb1;
    $('fbGenerateBtn').click();
    check(fbOut() === lbSeg1,
      '反馈模板：乐缤纷CP后台按后台表格行出五行格式（乐缤纷 / 渠道 / 问题 / 角色ID / 来源）', fbLine());
    check(fbChips('fbSourceGroup')[9].classList.contains('active') && fbVisible(9)
      && fbChips('fbSourceGroup').length === 11
      && !fbVisible(0) && !fbVisible(10)
      && (JSON.parse(window.localStorage.getItem('feedbackTplState') || '{}') || {}).source === '乐缤纷CP后台',
      '反馈模板：选「乐缤纷CP后台」模板 → 来源只剩它自己、并自动切过去',
      [0, 9, 10].map(i => i + ':' + fbVisible(i)).join(' '));
    // 一次复制多行 → 多段，段与段之间空一行
    $('fbRawInput').value = lb1 + '\n' + lb2;
    $('fbGenerateBtn').click();
    check(fbOut() === lbSeg1 + '\n\n' + lbSeg2 && /生成 2 段/.test($('fbHint').textContent),
      '反馈模板：乐缤纷CP后台一次粘多行 → 生成多段（段间空一行）', fbLine());
    // 复制时把表头也带上了 → 跳过表头行
    $('fbRawInput').value = '账号\t渠道\t版本号\t类型\t问题\t提交时间\t状态\t回复\t回复人\t回复时间\t编辑\n' + lb1;
    $('fbGenerateBtn').click();
    check(fbOut() === lbSeg1, '反馈模板：乐缤纷CP后台复制时带上表头 → 表头行被跳过', fbLine());
    // 只复制了「账号 / 渠道 / 问题」三列 → 按内容认
    $('fbRawInput').value = '92930999\tweChat (wechat)\t没有显示也没有发掘币';
    $('fbGenerateBtn').click();
    check(fbOut() === lbSeg1, '反馈模板：乐缤纷CP后台只复制三列也能认出账号/渠道/问题', fbLine());
    // 认不出来就不给格式（免得发错）
    $('fbRawInput').value = '这行不是后台表格';
    $('fbGenerateBtn').click();
    check(fbOut() === '' && /没认出/.test($('fbHint').textContent),
      '反馈模板：乐缤纷CP后台认不出内容 → 不生成并提示粘整行', $('fbHint').textContent);
    $('fbRawInput').value = '工单号 XXX-1\n游戏 猫旅馆物语\nUID 123';
    $('fbGenerateBtn').click();
    check(fbOut() === '' && /模板选错了/.test($('fbHint').textContent),
      '反馈模板：乐缤纷CP后台模板遇到内部工单 → 不生成并提示换模板', $('fbHint').textContent);
    // 模板选错 → 不生成 + 提示
    fbPick('fbTemplateGroup', 1);
    $('fbRawInput').value = '工单号 XXX-1\n游戏 猫旅馆物语\nUID 123';
    $('fbGenerateBtn').click();
    check(fbOut() === '' && /模板选错了/.test($('fbHint').textContent),
      '反馈模板：模板选错 → 不生成错格式并提示换哪个模板', $('fbHint').textContent);
    // 内部工单：按「字段名 值」提取，手机号优先
    // （先切回「企微」：上面选乐缤纷模板时来源被自动切走了，这里顺便验证来源片还能手动切）
    fbPick('fbTemplateGroup', 3);
    fbPick('fbSourceGroup', 10);
    $('fbRawInput').value = '工单号 XXX-123\n来源 企微\n游戏 异世界勇者\n区服 77服\nUID 12345678\n账号 abc\n角色ID 87654321\n角色名 张三\n问题描述 玩家反馈，麻烦看看\n提交人 李四\n联系人 王五\n手机号码 13800000000';
    $('fbGenerateBtn').click();
    check(/工单号：XXX-123/.test(fbOut()) && /提交者：李四/.test(fbOut()) && /账号：abc/.test(fbOut())
      && /角色id：87654321/.test(fbOut()) && /区服：77服/.test(fbOut()) && /问题：玩家反馈，麻烦看看/.test(fbOut())
      && /来源：企微/.test(fbOut()) && /联系方式：13800000000/.test(fbOut()),
      '反馈模板：内部工单按行提取字段（手机号优先于联系人）', fbLine());
    $('fbRawInput').value = '工单号 XXX-124\n提交人 李四\n联系人 王五';
    $('fbGenerateBtn').click();
    check(/联系方式：王五/.test(fbOut()), '反馈模板：没填手机号时联系方式用联系人');
    // 清空 + 空输入
    $('fbClearBtn').click();
    check($('fbRawInput').value === '' && fbOut() === '' && /已清空/.test($('fbHint').textContent), '反馈模板：清空输入与结果');
    $('fbGenerateBtn').click();
    check(/先粘贴/.test($('fbHint').textContent), '反馈模板：空输入时提示先粘贴', $('fbHint').textContent);
    $('fbCopyBtn').click();
    check(/还没有生成结果/.test($('fbHint').textContent), '反馈模板：没有结果时复制按钮只给提示（不抛错）', $('fbHint').textContent);
    check(posts.filter(p => p.url.includes('feedbackTplState')).length === 0, '反馈模板：整场没有把它存到服务端');
  }

  console.log('--- 8i. 界面设置（齿轮面板：背景色 / 强调色 / 渐变）---');
  {
    const root = doc.documentElement;
    const varOf = (k) => root.style.getPropertyValue(k).trim();
    const bgSwatches = () => doc.querySelectorAll('#themeSwatches .theme-swatch');
    const acSwatches = () => doc.querySelectorAll('#accentSwatches .theme-swatch');
    const effects = () => doc.querySelectorAll('#themeEffects .theme-effect');
    const themeOf = () => root.getAttribute('data-theme');
    const stored = () => { try { return JSON.parse(window.localStorage.getItem('themeSettings') || 'null'); } catch (_) { return null; } };
    const pickEffect = (key) => [...effects()].find(b => (b.dataset.effect || '') === key).click();
    // ⚠️ 只判「以 # 开头」不够：算出 NaN 时会得到 #aNaNaN 这种非法值（曾经真的踩过），
    //    所以这里逐条校验「是真的颜色」。
    const HEX_RE = /^#[0-9a-f]{6}$/i;
    const RGBA_RE = /^rgba?\(\d+,\s*\d+,\s*\d+(,\s*[\d.]+)?\)$/;
    const isColor = (v) => HEX_RE.test(v) || RGBA_RE.test(v);
    const COLOR_KEYS = ['--bg-0', '--bg-1', '--surface', '--surface-2', '--surface-3', '--sidebar',
      '--ink-0', '--ink-1', '--ink-2', '--ink-3', '--line-0', '--line-1', '--line-2',
      '--accent', '--accent-hi', '--accent-ink', '--accent-dim', '--accent-line', '--accent-glow',
      '--grid-line', '--warn', '--danger'];
    const badTokens = () => COLOR_KEYS.filter(k => !isColor(varOf(k)));
    check(!!$('themeGear') && !!$('themePanel') && !!doc.querySelector('.tabs-head .tabs-brand'),
      '界面设置：侧边栏抬头有站名 + 齿轮');
    check($('themePanel').hidden === true, '界面设置：面板默认收起');
    $('themeGear').click();
    await sleep(20);
    check($('themePanel').hidden === false && /open/.test($('themeGear').className) && $('themeGear').getAttribute('aria-expanded') === 'true',
      '界面设置：点齿轮展开面板（齿轮高亮 + aria-expanded）', $('themeGear').className);
    check(bgSwatches().length === 8 && acSwatches().length === 8 && effects().length === 6,
      '界面设置：8 个背景色块 + 8 个强调色块 + 6 种渐变', bgSwatches().length + '/' + acSwatches().length + '/' + effects().length);
    check(varOf('--bg-0') === '' && themeOf() === null && !root.getAttribute('data-bg-effect') && stored() === null,
      '界面设置：默认不动令牌、不挂渐变属性、本机无记录');
    check(bgSwatches()[0].classList.contains('active') && acSwatches()[0].classList.contains('active') && effects()[0].classList.contains('active'),
      '界面设置：三组默认项都是选中态');
    // 背景色
    bgSwatches()[2].click();
    await sleep(20);
    check(varOf('--bg-0') === '#f6f1e7' && themeOf() === 'light' && (stored() || {}).bg === '#f6f1e7',
      '界面设置：选「暖米」→ --bg-0 生效 + data-theme=light + 记住本机', varOf('--bg-0') + '/' + themeOf() + '/' + JSON.stringify(stored()));
    check(/^#/.test(varOf('--surface')) && varOf('--surface') !== '#f6f1e7' && varOf('--ink-0') === '#1b2228',
      '界面设置：卡片面由背景色推导，浅底仍是深色文字', varOf('--surface') + '/' + varOf('--ink-0'));
    check(badTokens().length === 0, '界面设置：背景色派生出的令牌全是合法颜色（不会算出 #aNaNaN）', badTokens().join(','));
    // 强调色：浅底上要压到能读
    const accentDefaultLight = varOf('--accent');
    acSwatches()[4].click();
    await sleep(20);
    check(isColor(varOf('--accent')) && varOf('--accent') !== accentDefaultLight && (stored() || {}).accent === '#2f7de1',
      '界面设置：选「蓝」强调色 → --accent 变成蓝色（合法值、不同于默认黄）', varOf('--accent') + ' ← ' + accentDefaultLight);
    check(isColor(varOf('--accent-dim')) && isColor(varOf('--accent-glow')) && isColor(varOf('--accent-ink'))
      && isColor(varOf('--accent-hi')) && isColor(varOf('--accent-line')) && badTokens().length === 0,
      '界面设置：强调色的淡底 / 光圈 / 文字色 / 描边都跟着换且都是合法颜色', badTokens().join(',') || varOf('--accent-dim'));
    const accentBlue = varOf('--accent');
    acSwatches()[6].click();
    await sleep(20);
    check(isColor(varOf('--accent')) && varOf('--accent') !== accentBlue && varOf('--accent') !== accentDefaultLight,
      '界面设置：换「绿」强调色 → --accent 跟着换（不是取消、也不是回到默认）',
      varOf('--accent') + ' ← ' + accentBlue + ' ← ' + accentDefaultLight);
    acSwatches()[4].click();
    await sleep(20);
    // 渐变
    pickEffect('none');
    await sleep(20);
    check(root.getAttribute('data-bg-effect') === 'none' && (stored() || {}).effect === 'none',
      '界面设置：渐变选「纯色」→ html 挂 data-bg-effect=none', String(root.getAttribute('data-bg-effect')));
    pickEffect('mesh');
    await sleep(20);
    check(root.getAttribute('data-bg-effect') === 'mesh' && (stored() || {}).effect === 'mesh',
      '界面设置：渐变换「斜向渐变」→ 属性跟着换', String(root.getAttribute('data-bg-effect')));
    // 深色背景：强调色改用提亮后的版本 + 自动暗色
    bgSwatches()[7].click();
    await sleep(20);
    check(varOf('--bg-0') === '#12161a' && themeOf() === 'dark'
      && varOf('--ink-0') === '#e9eef3'
      && isColor(varOf('--accent')) && varOf('--accent') !== '#2f7de1' && badTokens().length === 0,
      '界面设置：选「炭黑」→ 自动暗色（浅字 + 强调色改用暗底那版）',
      varOf('--bg-0') + '/' + themeOf() + '/' + varOf('--ink-0') + '/' + varOf('--accent'));
    check(varOf('--accent') !== accentDefaultLight && varOf('--accent') !== accentBlue,
      '界面设置：深底下的强调色跟浅底不是同一个值（暗底提亮）', varOf('--accent'));
    // 取色器
    $('themeBgPicker').value = '#d9e6d2';
    fire($('themeBgPicker'), 'input');
    await sleep(20);
    check(varOf('--bg-0') === '#d9e6d2' && themeOf() === 'light', '界面设置：取色器选背景色也生效', varOf('--bg-0'));
    $('themeAccentPicker').value = '#0f9d58';
    fire($('themeAccentPicker'), 'input');
    await sleep(20);
    check(isColor(varOf('--accent')) && varOf('--accent') !== '#2f7de1' && badTokens().length === 0,
      '界面设置：取色器选强调色也生效（换成这支绿）', varOf('--accent') + '/' + badTokens().join(','));
    check((stored() || {}).accent === '#0f9d58',
      '界面设置：取色器选的强调色记在本机', JSON.stringify(stored()));
    // 点外面 / 收起
    doc.body.click();
    await sleep(10);
    check($('themePanel').hidden === true, '界面设置：点面板外面会收起');
    // 恢复默认
    $('themeGear').click();
    await sleep(10);
    $('themeReset').click();
    await sleep(20);
    check(varOf('--bg-0') === '' && varOf('--accent') === '' && themeOf() === null
      && !root.getAttribute('data-bg-effect') && stored() === null
      && bgSwatches()[0].classList.contains('active'),
      '界面设置：恢复默认 → 清掉行内令牌 / 渐变属性 / 本机记录',
      varOf('--bg-0') + '/' + varOf('--accent') + '/' + String(root.getAttribute('data-bg-effect')) + '/' + JSON.stringify(stored()));
    check(posts.filter(p => p.url.includes('themeSettings') || p.url.includes('themeBgColor')).length === 0,
      '界面设置：整场没有把它存到服务端');
  }

  console.log('--- 8j. 下午茶投票（走服务端：店家 / 发起 / 多选投票 / 合并统计 / 按天作废）---');
  {
    // 北京时间的今天（跟页面同一套算法）
    const bjD = new Date(Date.now() + 8 * 3600 * 1000);
    const teaToday = bjD.toISOString().slice(0, 10);
    const teaKey = 'teaPoll_' + teaToday.replace(/-/g, '');
    const votePosts = () => posts.filter(p => p.url.includes('api/vote/') && p.method === 'POST');
    const voteGets = () => posts.filter(p => p.url.includes('api/vote/') && p.method === 'GET');
    const poll = () => serverData[teaKey];

    doc.querySelector('.tab-btn[data-tab="tea"]').click();
    await sleep(120);
    check(!!$('tab-tea') && !!$('teaShopTable') && !!$('teaResultBox'),
      '下午茶：标签页与店家 / 投票 / 结果容器都在');
    check(/还没有店家/.test($('teaShopTable').textContent), '下午茶：一开始没有店家（服务端也没有）',
      $('teaShopTable').textContent.slice(0, 40));
    check(/今天还没有发起投票|今天还没有/.test($('teaPollStatus').textContent),
      '下午茶：没发起时状态行说明「今天还没有发起」', $('teaPollStatus').textContent);
    check($('teaShopCard').tagName === 'DETAILS' && !$('teaShopCard').open
      && /预设店家/.test($('teaShopCard').querySelector('summary').textContent),
      '下午茶：店家管理收在折叠面板里（默认收起，界面干净）',
      $('teaShopCard').tagName + ' / open=' + $('teaShopCard').open);
    check(!$('teaShopNote'), '下午茶：店家不再有「备注」输入框（用户说备注不用了）');
    check(doc.querySelectorAll('#teaShopTable thead th').length === 2
      && !/备注/.test($('teaShopTable').textContent),
      '下午茶：店家表只有「店家 / 操作」两列',
      [...doc.querySelectorAll('#teaShopTable thead th')].map(t => t.textContent));

    // 加两家店（只有店名）
    $('teaShopName').value = '蜜雪冰城';
    $('teaShopSaveBtn').click();
    await sleep(60);
    $('teaShopName').value = '古茗';
    $('teaShopSaveBtn').click();
    await sleep(60);
    check(!!serverData.teaShops && serverData.teaShops.shops.length === 2
      && serverData.teaShops.shops[0].name === '蜜雪冰城' && !('note' in serverData.teaShops.shops[0]),
      '下午茶：店家存到服务端 teaShops（只有店名、不再写备注）',
      serverData.teaShops && serverData.teaShops.shops);
    const shopsCache = JSON.parse(window.localStorage.getItem('teaShopsCache') || 'null');
    check(shopsCache && shopsCache.shops.length === 2
      && shopsCache.shops.map(s => s.name).join(',') === '蜜雪冰城,古茗',
      '下午茶：店家在本机另存一份备份 teaShopsCache', shopsCache && shopsCache.shops.map(s => s.name));
    check(doc.querySelectorAll('#teaShopTable tbody tr').length === 2
      && /蜜雪冰城/.test($('teaShopTable').textContent),
      '下午茶：店家表渲染出 2 行', $('teaShopTable').textContent.replace(/\s+/g, ' ').slice(0, 60));
    check(/（2 家）/.test($('teaShopCount').textContent),
      '下午茶：折叠标题上写着店家数', $('teaShopCount').textContent);
    const shopIds = serverData.teaShops.shops.map(s => s.id);

    // ⚠️ 店家不能被「清投票 / 23:00 过期清理」连累：服务端那份被清掉时，用本机备份自动恢复
    delete serverData.teaShops;
    $('teaRefreshBtn').click();
    await sleep(160);
    check(!!serverData.teaShops && serverData.teaShops.shops.length === 2
      && doc.querySelectorAll('#teaShopTable tbody tr').length === 2,
      '下午茶：服务端店家没了 → 用本机备份自动恢复（并推回服务端）',
      serverData.teaShops && serverData.teaShops.shops.map(s => s.name));
    check(/恢复 2 家/.test($('teaShopHint').textContent),
      '下午茶：恢复时给一句说明', $('teaShopHint').textContent.slice(0, 50));

    // 发起投票：勾两家 → 发起
    const startChips = () => [...doc.querySelectorAll('#teaPollShopBox .fb-chip')];
    check(startChips().length === 2, '下午茶：发起区列出 2 家店可选（多选片）', startChips().length);
    check(doc.querySelectorAll('#teaVoteShopBox .fb-chip').length === 2,
      '下午茶：投票区也列出 2 家店', doc.querySelectorAll('#teaVoteShopBox .fb-chip').length);
    startChips()[0].click();
    startChips()[1].click();
    await sleep(20);
    check(startChips().filter(b => b.classList.contains('active')).length === 2,
      '下午茶：发起区可以多选（两家都选中）');
    $('teaPollTitle').value = '';
    check($('teaPollDeadline').type === 'time', '下午茶：截止时间是时间选择器（type=time）', $('teaPollDeadline').type);
    $('teaPollDeadline').value = '23:59';
    $('teaPollStartBtn').click();
    await sleep(80);
    check(!!poll() && poll().status === 'open' && poll().shopIds.length === 2
      && poll().date === teaToday && Object.keys(poll().votes).length === 0,
      '下午茶：发起今天的投票 → 服务端 teaPoll_YYYYMMDD（开放 2 家、还没有票）',
      poll() && { date: poll().date, shops: poll().shopIds.length, votes: Object.keys(poll().votes).length });
    check(poll().shopNames[shopIds[0]] === '蜜雪冰城' && /月\d+日 下午茶/.test(poll().title),
      '下午茶：投票里存了店名快照 + 默认标题', poll() && [poll().title, poll().shopNames]);
    check(poll().deadline === '23:59', '下午茶：设的截止时间存进投票（deadline = HH:MM）', poll().deadline);
    $('teaRefreshBtn').click();
    await sleep(150);
    check(/23:59 截止/.test($('teaPollStatus').textContent) && !/已截止/.test($('teaPollStatus').textContent),
      '下午茶：状态行写「23:59 截止」（还没到点 = 进行中）', $('teaPollStatus').textContent.slice(0, 70));
    check(doc.getElementById('teaVoteOpenBox').style.display !== 'none',
      '下午茶：还没到截止时间 → 投票区照常开着');

    // 已经过去的时间不让发起（否则一发就是「已截止」）
    $('teaPollDeadline').value = '00:00';
    $('teaPollStartBtn').click();
    await sleep(80);
    check(/已经过了/.test($('teaPollStatus').textContent) && poll().deadline === '23:59',
      '下午茶：截止时间填成已经过去的点 → 拦下不发（截止时间没被改掉）',
      $('teaPollStatus').textContent.slice(0, 70));
    $('teaPollDeadline').value = '23:59';

    // 分享链接
    const wantLink = window.location.origin + window.location.pathname + '?vote=' + teaKey;
    check($('teaPollShareInput').value === wantLink && /\?vote=teaPoll_\d{8}$/.test(wantLink),
      '下午茶：分享链接是 ?vote=teaPoll_YYYYMMDD', $('teaPollShareInput').value);
    $('teaCopyShareTextBtn').click();
    check(/已复制分享文案/.test($('teaPollStatus').textContent),
      '下午茶：复制分享文案（一句话 + 链接）', $('teaPollStatus').textContent.slice(0, 50));

    // 本机投票（多选一家）
    const voteChips = () => [...doc.querySelectorAll('#teaVoteShopBox .fb-chip')];
    voteChips()[0].click();
    await sleep(20);
    $('teaVoteSubmitBtn').click();
    await sleep(80);
    const myId = String(window.localStorage.getItem('teaVoterId') || '');
    check(/^v-/.test(myId), '下午茶：第一次投票时生成并记住本机的 voterId（一台设备一票）', myId);
    check(votePosts().length === 1 && poll().votes[myId] && poll().votes[myId].shopIds.length === 1
      && poll().votes[myId].shopIds[0] === shopIds[0],
      '下午茶：投票走 /api/vote/:key（服务端合并），票里只有这家店',
      poll() && poll().votes[myId]);
    check(/已投：蜜雪冰城/.test($('teaVoteHint').textContent), '下午茶：投完提示「已投：蜜雪冰城」',
      $('teaVoteHint').textContent);
    check(doc.querySelectorAll('#teaResultBox tbody tr').length === 2
      && /蜜雪冰城/.test($('teaResultBox').textContent) && /参与 1 台设备/.test($('teaResultMeta').textContent),
      '下午茶：结果表按店家列出 + 参与 1 台设备', $('teaResultMeta').textContent);
    check(!/谁|名字|小明/.test($('teaResultBox').textContent.replace(/最热/g, '')),
      '下午茶：结果里不显示谁投了什么（只有票数）', $('teaResultBox').textContent.replace(/\s+/g, ' ').slice(0, 60));

    // 另一台设备也投（直接写服务端那份数据，再点刷新）
    poll().votes['v-other-device'] = { voterId: 'v-other-device', shopIds: [shopIds[1]], at: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const getsBefore = voteGets().length;
    $('teaRefreshBtn').click();
    await sleep(120);
    check(voteGets().length > getsBefore, '下午茶：点「刷新」会重新 GET /api/vote', voteGets().length - getsBefore);
    check(/参与 2 台设备/.test($('teaResultMeta').textContent) && /共 2 票/.test($('teaResultMeta').textContent),
      '下午茶：另一台设备的票合并进来了（2 台 / 2 票）', $('teaResultMeta').textContent);
    check(/古茗/.test($('teaResultBox').textContent), '下午茶：结果里出现另一台设备选的古茗');

    // 改票：再点一家（多选）→ 覆盖自己那条，人数不变
    voteChips()[1].click();
    await sleep(20);
    $('teaVoteSubmitBtn').click();
    await sleep(80);
    check(poll().votes[myId].shopIds.length === 2 && Object.keys(poll().votes).length === 2,
      '下午茶：同一台设备改票 = 覆盖自己那条（人数不变、可多选）', poll() && poll().votes[myId].shopIds);

    // 撤销我这票
    $('teaClearMineBtn').click();
    await sleep(80);
    check(poll().votes[myId].shopIds.length === 0 && /参与 1 台设备/.test($('teaResultMeta').textContent),
      '下午茶：撤销 → 自己那条清空、统计里只算另一台设备', $('teaResultMeta').textContent);
    $('teaCopyResultBtn').click();
    check(/已复制结果/.test($('teaPollStatus').textContent), '下午茶：复制结果不抛错并给提示',
      $('teaPollStatus').textContent.slice(0, 30));

    // ---------------- 到截止时间：只展示结果、不能再投（数据留到 23:00） ----------------
    serverData[teaKey].deadline = '00:00';            // 00:00 永远 <= 现在 → 视为已到点
    $('teaRefreshBtn').click();
    await sleep(150);
    check(window.getComputedStyle($('teaVoteOpenBox')).display === 'none'
      && window.getComputedStyle($('teaVoteClosed')).display !== 'none'
      && /已在 00:00 截止/.test($('teaVoteClosed').textContent),
      '下午茶：到截止时间 → 投票区收起、只留一条「已在 00:00 截止」说明',
      $('teaVoteClosed').textContent.slice(0, 60));
    check(!!poll() && /参与 1 台设备/.test($('teaResultMeta').textContent)
      && /已在 00:00 截止/.test($('teaResultMeta').textContent),
      '下午茶：到点后数据还在、结果照常展示（要留到 23:00 才清）', $('teaResultMeta').textContent);
    const postsBeforeLate = votePosts().length;
    voteChips()[0].click();
    await sleep(20);
    $('teaVoteSubmitBtn').click();
    await sleep(80);
    check(votePosts().length === postsBeforeLate && /只能看结果/.test($('teaVoteHint').textContent),
      '下午茶：到点后再投 → 前端直接挡下、不发请求，提示「只能看结果」',
      $('teaVoteHint').textContent.slice(0, 60));
    const lateResp = await window.fetch('api/vote/' + teaKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId: 'v-late', shopIds: [shopIds[0]] }),
    });
    const lateJson = await lateResp.json();
    check(lateResp.status === 409 && lateJson.closed === true && lateJson.closedReason === 'deadline'
      && /00:00 截止/.test(String(lateJson.error)) && !poll().votes['v-late'],
      '下午茶：绕开前端直接 POST → 服务端 409（closedReason=deadline）挡住',
      lateResp.status + ' / ' + JSON.stringify(lateJson));
    // 把截止时间改回未到点 → 又能投（数据从没被删过）
    serverData[teaKey].deadline = '23:59';
    $('teaRefreshBtn').click();
    await sleep(150);
    check(window.getComputedStyle($('teaVoteOpenBox')).display !== 'none'
      && window.getComputedStyle($('teaVoteClosed')).display === 'none',
      '下午茶：把截止时间改回未到点 → 投票区又出来（数据没被删）');

    // 截止后不能再投
    $('teaPollCloseBtn').click();
    await sleep(80);
    check(poll().status === 'closed' && /已截止/.test($('teaPollStatus').textContent),
      '下午茶：截止投票 → status=closed + 状态行提示', $('teaPollStatus').textContent.slice(0, 40));
    voteChips()[0].click();
    await sleep(20);
    $('teaVoteSubmitBtn').click();
    await sleep(80);
    check(/已截止/.test($('teaVoteHint').textContent) && /只能看结果/.test($('teaVoteHint').textContent)
      && /手动截止/.test($('teaVoteClosed').textContent),
      '下午茶：手动截止后再投被挡下（前端提示 + 服务端 409）',
      $('teaVoteHint').textContent.slice(0, 60));

    // 过期：把 key 换成一份「昨天」的投票 → 服务端 GET 会连数据删掉
    const oldKey = 'teaPoll_20200101';
    serverData[oldKey] = { id: oldKey, date: '2020-01-01', status: 'open', shopIds: shopIds.slice(), shopNames: { }, votes: {} };
    doc.querySelector('.tab-btn[data-tab="tea"]').click();
    await sleep(60);
    // 页面只认「今天」的 key，所以这里直接验证服务端行为 + 客户端的过期提示文案
    const expResp = await window.fetch('api/vote/' + oldKey);
    const expJson = await expResp.json();
    check(expJson.expired === true && expJson.value === null && !(oldKey in serverData),
      '下午茶：过期投票 GET → expired 且服务端把数据删了（不留档）', expJson);
    check(!!serverData.teaShops && serverData.teaShops.shops.length === 2,
      '下午茶：投票被 23:00 清掉不影响预设店家（teaShops 原样还在）',
      serverData.teaShops && serverData.teaShops.shops.map(s => s.name));
    check(/23:00/.test($('teaPollStatus').textContent), '下午茶：状态行写明「当天 23:00 自动清除」',
      $('teaPollStatus').textContent.slice(0, 60));

    // ---------------- 分享链接打开的「只投票页」：另起一个 jsdom（= 另一台设备） ----------------
    // 先把今天那份投票重置成一份干净的，再让「另一台设备」通过 ?vote= 链接投一票
    serverData[teaKey] = {
      id: teaKey, date: teaToday, title: '分享链接测试', status: 'open',
      shopIds: shopIds.slice(), shopNames: { }, votes: {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    serverData[teaKey].shopNames[shopIds[0]] = '蜜雪冰城';
    serverData[teaKey].shopNames[shopIds[1]] = '古茗';
    const posts2 = [];
    const jsdomErrors2 = [];
    const vc2 = new VirtualConsole();
    vc2.on('jsdomError', (e) => jsdomErrors2.push(e.message));
    vc2.on('error', (...a) => jsdomErrors2.push('console.error: ' + a.map(String).join(' ')));
    const dom2 = new JSDOM(html, {
      url: 'http://127.0.0.1:3080/index.html?vote=' + teaKey,
      runScripts: 'dangerously',
      pretendToBeVisual: false,
      virtualConsole: vc2,
      beforeParse(window2) {
        window2.alert = () => { };
        window2.confirm = () => true;
        window2.prompt = () => null;
        window2.requestAnimationFrame = () => 0;
        window2.cancelAnimationFrame = () => { };
        window2.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(this); };
        window2.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
        window2.URL.createObjectURL = () => 'blob:stub';
        window2.URL.revokeObjectURL = () => { };
        window2.fetch = makeFetchMock(serverData, posts2);
        window2.console.warn = () => { };
        window2.console.error = () => { };
      },
    });
    await new Promise(r => setTimeout(r, 250));
    const w2 = dom2.window, d2 = w2.document, $2 = (id) => d2.getElementById(id);
    check(d2.documentElement.getAttribute('data-vote-only') === '1',
      '只投票页：?vote=… 打开时打上 data-vote-only');
    check($2('tab-tea').classList.contains('active') && !$2('tab-gen').classList.contains('active'),
      '只投票页：只把下午茶这一页设为可见');
    check(w2.getComputedStyle(d2.querySelector('.tabs')).display === 'none'
      && w2.getComputedStyle($2('teaShopCard')).display === 'none'
      && w2.getComputedStyle($2('teaPollAdminBox')).display === 'none',
      '只投票页：侧边栏 / 店家管理 / 发起投票都被藏掉（只剩选择 + 结果）',
      w2.getComputedStyle(d2.querySelector('.tabs')).display);
    check(posts2.filter(p => p.url.includes('dailyData') || p.url.includes('itemNameMap')).length === 0,
      '只投票页：跳过了启动时那 9 个数据请求（手机上打开更快）',
      posts2.map(p => p.url).slice(0, 4));
    check(d2.querySelectorAll('#teaVoteShopBox .fb-chip').length === 2,
      '只投票页：能选出今天开放的 2 家店（店家从服务端拉）',
      d2.querySelectorAll('#teaVoteShopBox .fb-chip').length);
    d2.querySelectorAll('#teaVoteShopBox .fb-chip')[1].click();
    await new Promise(r => setTimeout(r, 30));
    $2('teaVoteSubmitBtn').click();
    await new Promise(r => setTimeout(r, 120));
    const otherId = String(w2.localStorage.getItem('teaVoterId') || '');
    check(/^v-/.test(otherId) && otherId !== myId && poll().votes[otherId]
      && poll().votes[otherId].shopIds[0] === shopIds[1],
      '只投票页：另一台设备投的票进到同一份服务端数据里（voterId 与本机不同）',
      otherId + ' / ' + JSON.stringify(poll().votes));
    check(Object.keys(poll().votes).length === 1 && /参与 1 台设备/.test($2('teaResultMeta').textContent)
      && /古茗/.test($2('teaResultBox').textContent),
      '只投票页：投完立刻看到结果（古茗 1 票）', $2('teaResultMeta').textContent);
    // 本机也投一票 → 两台设备的结果合在一起（这就是「不同设备统计在一起」的端到端证明）
    doc.querySelector('.tab-btn[data-tab="tea"]').click();
    await sleep(100);
    doc.querySelectorAll('#teaVoteShopBox .fb-chip')[0].click();
    await sleep(20);
    $('teaVoteSubmitBtn').click();
    await sleep(120);
    check(/参与 2 台设备/.test($('teaResultMeta').textContent) && /共 2 票/.test($('teaResultMeta').textContent)
      && /蜜雪冰城/.test($('teaResultBox').textContent) && /古茗/.test($('teaResultBox').textContent)
      && Object.keys(poll().votes).length === 2,
      '下午茶：两台设备的结果统计在一起（2 台 / 2 票、两家店各 1 票）',
      $('teaResultMeta').textContent + ' / ' + Object.keys(poll().votes).length);
    // 只投票页也会在到点后收起投票区（手机上打开就是「只看结果」）
    serverData[teaKey].deadline = '00:00';
    $2('teaRefreshBtn').click();
    await new Promise(r => setTimeout(r, 200));
    const postsBefore2 = posts2.filter(p => p.url.includes('api/vote/') && p.method === 'POST').length;
    check(w2.getComputedStyle($2('teaVoteOpenBox')).display === 'none'
      && /已在 00:00 截止/.test($2('teaVoteClosed').textContent)
      && /古茗/.test($2('teaResultBox').textContent),
      '只投票页：到截止时间 → 只展示结果、投票区收起', $2('teaVoteClosed').textContent.slice(0, 50));
    d2.querySelectorAll('#teaVoteShopBox .fb-chip')[0].click();
    await new Promise(r => setTimeout(r, 30));
    $2('teaVoteSubmitBtn').click();
    await new Promise(r => setTimeout(r, 150));
    check(posts2.filter(p => p.url.includes('api/vote/') && p.method === 'POST').length === postsBefore2
      && /只能看结果/.test($2('teaVoteHint').textContent),
      '只投票页：到点后就算点了提交也不发请求（提示「只能看结果」）',
      $2('teaVoteHint').textContent.slice(0, 50));
    check(jsdomErrors2.length === 0, '只投票页：没有未捕获异常', jsdomErrors2.slice(0, 2));
    dom2.window.close();
  }

  console.log('--- 8k. SOP 助手已整块删除（用户要求）---');
  {
    check(!doc.querySelector('.tab-btn[data-tab="sop"]') && !$('tab-sop'),
      'SOP 助手已从页面移除：侧边栏没有入口，#tab-sop 也不存在');
    check(!/sop/i.test(doc.body.textContent),
      'SOP 助手已从页面移除：整页（含内联脚本）不再出现 sop 字样，没留死代码');
  }

  console.log('--- 8l. 高频回复 / 归档体检 / 增量导入 ---');
  {
    // ① 高频回复：生成 + 复制各算一次，只存本机
    const postsBefore = posts.length;
    $('openingInput').value = '亲爱的玩家您好，';
    $('replyContentInput').value = '已经为您核对并处理，请重新登录查看。';
    $('closingInput').value = '有任何问题随时联系我们。';
    $('generateReplyBtn').click();
    await sleep(30);
    check(/已经为您核对并处理/.test($('replyResultArea').value), '生成回复正常', $('replyResultArea').value.slice(0, 40));
    let top = JSON.parse(window.localStorage.getItem('replyTopUsage') || '[]');
    check(top.length === 1 && top[0].count === 1 && top[0].gen === 1,
      '第一次生成就记进高频统计（gen=1）', top);
    check(/用 1 次/.test($('replyTopList').textContent), '高频列表显示「用 N 次」', $('replyTopList').textContent.slice(0, 60));
    $('generateReplyBtn').click(); await sleep(20);
    $('generateReplyBtn').click(); await sleep(20);
    $('copyReplyBtn').click(); await sleep(20);
    top = JSON.parse(window.localStorage.getItem('replyTopUsage') || '[]');
    check(top[0].count === 4 && top[0].cop === 1,
      '生成 3 次 + 复制 1 次 = 4 次（复制也算一次）', top[0]);
    $('replyContentInput').value = '这条用得少一些的第二句。';
    $('generateReplyBtn').click(); await sleep(20);
    top = JSON.parse(window.localStorage.getItem('replyTopUsage') || '[]');
    check(top.length === 2 && top[0].count === 4,
      '用得少的那句排在后面（按次数降序）', top.map(x => x.count));
    const delBtn = doc.querySelector('#replyTopList [data-replytop-del="1"]');
    check(!!delBtn, '每条高频回复都有删除按钮');
    if (delBtn) delBtn.click();
    await sleep(20);
    check(JSON.parse(window.localStorage.getItem('replyTopUsage') || '[]').length === 1,
      '删掉一条后统计里只剩 1 条');
    $('replyTopClearBtn').click();
    await sleep(20);
    check(JSON.parse(window.localStorage.getItem('replyTopUsage') || '[]').length === 0
      && /还没有记录/.test($('replyTopList').textContent), '清空统计后回到空态');
    check(posts.length === postsBefore, '高频回复全程不发请求（只存本机 localStorage）');

    // ② 归档体检 / 漏登记提醒
    const audit = $('careerAuditBox');
    check(!!audit && /漏登记|都归档了/.test(audit.textContent),
      '客服生涯有归档体检提示（漏登记 / 最近 7 天都归档了）', audit && audit.textContent.slice(0, 80));

    // ③ 海外业务：增量导入只补没导过的日期
    const before = Object.keys(JSON.parse(window.localStorage.getItem('overseasBizData') || '{"rows":{}}').rows || {}).length;
    $('ovbizPasteArea').value = '2026-12-01,新同事,,1,2,3,,,,,,4,5,6';
    $('ovbizImportNewBtn').click();
    await sleep(30);
    let after = Object.keys(JSON.parse(window.localStorage.getItem('overseasBizData') || '{"rows":{}}').rows || {}).length;
    check(after === before + 1 && /增量导入 1 行/.test($('ovbizHint').textContent),
      '增量导入：新日期才进来（+1 行）', $('ovbizHint').textContent.slice(0, 60));
    $('ovbizImportNewBtn').click();
    await sleep(30);
    after = Object.keys(JSON.parse(window.localStorage.getItem('overseasBizData') || '{"rows":{}}').rows || {}).length;
    check(after === before + 1 && /没有新日期可导入/.test($('ovbizHint').textContent),
      '增量导入：同一天再点一次不重复进来', $('ovbizHint').textContent.slice(0, 60));
    check(/最新数据到 2026-12-01/.test($('ovbizSyncHint').textContent),
      '状态行显示「最新数据到 YYYY-MM-DD」', $('ovbizSyncHint').textContent.slice(0, 80));
  }

  console.log('--- 8m. 排班休息（标了休息的日子不进统计） ---');
  {
    // 先造两条 6 月记录：6/3、6/5 —— 中间 6/4 本来算 1 天断档
    $('careerImportArea').value = [
      '日期\t人员\t班次\t商店回复\t海外SSO工单量（全产品）\t总计\t数据状态',
      '2026-06-03\t姚宏杰\tF\t14\t12\t26\t已完成记录',
      '2026-06-05\t姚宏杰\tH\t10\t8\t18\t已完成记录'
    ].join('\n');
    $('careerImportBtn').click();
    await sleep(80);
    const gapOf = () => {
      const m = /断档 (\d+) 天/.exec($('careerQuality').textContent || '');
      return m ? +m[1] : -1;
    };
    const restOf = (ym) => {
      const arr = JSON.parse(window.localStorage.getItem('careerRestDays') || '[]');
      return arr.filter(d => d.slice(0, 7) === ym);
    };
    check(gapOf() === 1, '6/3 与 6/5 之间先有 1 天断档', gapOf());

    check($('careerRestCard').style.display === 'none', '排班休息面板默认收起');
    $('careerRestBtn').click();
    await sleep(30);
    check($('careerRestCard').style.display !== 'none', '点「🗓️ 排班休息」展开面板');
    check($('careerRestMonth').value === bjToday.slice(0, 7), '月份默认当月', $('careerRestMonth').value);
    check(doc.querySelectorAll('#careerRestGrid .career-rest-day').length >= 28,
      '整月日期都列出来（点日期 = 切换休息）', doc.querySelectorAll('#careerRestGrid .career-rest-day').length);

    $('careerRestMonth').value = '2026-06';
    $('careerRestMonth').dispatchEvent(new window.Event('change'));
    await sleep(30);
    const pick = (d) => doc.querySelector('#careerRestGrid .career-rest-day[data-rest="' + d + '"]');
    check(!!pick('2026-06-04'), '切月份后能拿到 6/4 那一格');
    pick('2026-06-04').click();
    await sleep(30);
    check(restOf('2026-06').length === 1 && restOf('2026-06')[0] === '2026-06-04',
      '点一下就把 6/4 记成休息（只存本机 localStorage careerRestDays）', restOf('2026-06'));
    check(!!doc.querySelector('#careerRestGrid .career-rest-day.rest[data-rest="2026-06-04"]'),
      '休息的那一格带 .rest 高亮');
    check(/休息 1 天/.test($('careerQuality').textContent), '数据质量里出现「休息 1 天」', $('careerQuality').textContent.slice(0, 90));
    check(gapOf() === 0, '断档天数从 1 变 0（休息日不算断档）', gapOf());
    check(/在岗 2 天/.test($('careerQuality').textContent), '在岗天数 = 区间 3 − 休息 1 = 2', $('careerQuality').textContent.slice(0, 90));

    // 再点一次取消（⚠️ 重画后要重新取节点）
    pick('2026-06-04').click();
    await sleep(30);
    check(restOf('2026-06').length === 0 && gapOf() === 1,
      '再点一次取消休息，断档回到 1 天', { rest: restOf('2026-06').length, gap: gapOf() });

    $('careerRestWeekendBtn').click();
    await sleep(30);
    check(restOf('2026-06').length === 8, '「周末全休」把 2026-06 的 8 个周末都标成休息', restOf('2026-06').length);
    $('careerRestClearMonthBtn').click();
    await sleep(30);
    check(restOf('2026-06').length === 0, '「清空本月」只清这个月');
    check(doc.querySelectorAll('#careerRestGrid .career-rest-day.rest').length === 0,
      '清空后没有任何格子还是休息态');
  }

  console.log('--- 8n. 统计页分段导航 / 一句话摘要 / 工具条收拢 ---');
  {
    doc.querySelector('.tab-btn[data-tab="career"]').click();
    await sleep(60);
    check(doc.querySelectorAll('#tab-career .seg-btn').length === 4,
      '客服生涯分成 4 段（总览 / 逐项明细 / 趋势与分析 / 数据与补录）', doc.querySelectorAll('#tab-career .seg-btn').length);
    const onSeg = (tab) => Array.from(doc.querySelectorAll('#' + tab + ' [data-seg-card]'))
      .filter(el => el.classList.contains('seg-on')).map(el => el.id);
    let ids = onSeg('tab-career');
    check(ids.includes('careerCardOverview') && !ids.includes('careerCardTicket') && !ids.includes('careerCardImport'),
      '默认停在「总览」段（明细 / 数据段都没挂上）', ids);
    doc.querySelector('#tab-career .seg-btn[data-seg="detail"]').click();
    await sleep(30);
    ids = onSeg('tab-career');
    check(ids.includes('careerCardTicket') && ids.includes('careerCardOverseas') && !ids.includes('careerCardOverview'),
      '点「逐项明细」→ 只显示工单 / 海外两张明细卡', ids);
    doc.querySelector('#tab-career .seg-btn[data-seg="data"]').click();
    await sleep(30);
    ids = onSeg('tab-career');
    check(ids.includes('careerCardQuality') && ids.includes('careerCardImport') && ids.includes('careerCardEdit'),
      '点「数据与补录」→ 质量 / 补录 / 导入都在这一段', ids);
    doc.querySelector('#tab-career .seg-btn[data-seg="overview"]').click();
    await sleep(30);
    check(/累计/.test($('careerHeadline').textContent) && /日均/.test($('careerHeadline').textContent),
      '总览最上面有一句话摘要（累计 / 日均 / 最高单日）', $('careerHeadline').textContent.slice(0, 70));
    check(!!doc.querySelector('#careerCardOverview details.card-more')
      && doc.querySelectorAll('#careerCardOverview details.card-more button').length === 4
      && !!doc.querySelector('#careerCardOverview #careerArchiveBtn'),
      '导出 / 导入 / 清空收进「⋯ 更多」，主按钮只留归档 + 排班休息');
    doc.querySelector('.tab-btn[data-tab="overseas"]').click();
    await sleep(60);
    check(doc.querySelectorAll('#tab-overseas .seg-btn').length === 3,
      '海外业务分成 3 段（总览 / 逐项明细 / 导入与导出）', doc.querySelectorAll('#tab-overseas .seg-btn').length);
    ids = onSeg('tab-overseas');
    check(ids.includes('ovbizCardOverview') && !ids.includes('ovbizCardItems'), '海外默认停在总览段', ids);
    doc.querySelector('#tab-overseas .seg-btn[data-seg="data"]').click();
    await sleep(30);
    check(onSeg('tab-overseas').join(',') === 'ovbizCardPaste', '海外「导入与导出」段只有那张粘贴卡', onSeg('tab-overseas'));
    check(/累计|还没有数据/.test($('ovbizHeadline').textContent), '海外总览也有一句话摘要', $('ovbizHeadline').textContent.slice(0, 70));
  }

  console.log('--- 8o. 日报表单分组（一组一片，找项不用满屏扫） ---');
  {
    doc.querySelector('.tab-btn[data-tab="daily"]').click();
    await sleep(60);
    const ticketForm = $('dailyFormTicket');
    check(ticketForm.querySelectorAll('.daily-group').length === 10,
      '工单日报表单分成 10 组（一片一组）', ticketForm.querySelectorAll('.daily-group').length);
    const titles = Array.from(ticketForm.querySelectorAll('.dg-title')).map(el => el.textContent);
    check(titles.indexOf('① 繁花') !== -1 && titles.indexOf('⑦ 异世界勇者') !== -1
      && titles.some(t => t.indexOf('工单与后台') !== -1),
      '组标题写的是业务名（① 繁花 / ⑦ 异世界勇者 / 工单与后台）', titles.join(' | '));
    const nums = Array.from(ticketForm.querySelectorAll('.dg-n')).map(el => el.textContent);
    check(nums[0] === '01' && nums[nums.length - 1] === '10',
      '每组带两位数编号（01…10）', nums.join(','));
    check(ticketForm.querySelectorAll('[data-key]').length === 32,
      '32 个字段一个都没少（分组只是排版，不动字段）', ticketForm.querySelectorAll('[data-key]').length);
    const g1 = ticketForm.querySelector('[data-group="g1"]');
    const g1Keys = Array.from(g1.querySelectorAll('[data-key]')).map(el => el.dataset.key);
    check(g1Keys.join(',') === 'g1_wx,g1_dy,g1_dyol,g1_qq',
      '① 繁花那一片只装它自己的 4 个平台（微信/抖音/dy在线/手Q）', g1Keys.join(','));
    const g1Label = Array.from(g1.querySelectorAll('label')).map(el => el.textContent).join(',');
    check(g1Label === '①繁花·微信,①繁花·抖音,①繁花·dy在线,①繁花·手Q',
      '字段名照旧（还是「①繁花·微信」这种全称，只是换了位置）', g1Label);
    check(!ticketForm.querySelector('[data-group="misc"]'),
      '所有字段都归了组，没有落进「其他」兜底片');
    const noteChip = ticketForm.querySelector('[data-group="note"] [data-fill]');
    check(noteChip.textContent === '0/1', '「待跟进」那一片初始 0/1', noteChip.textContent);
    setDailyField('dailyFormTicket', 'pending', '分组测试');
    await sleep(20);
    const noteChip2 = ticketForm.querySelector('[data-group="note"] [data-fill]');
    check(noteChip2.textContent === '1/1' && noteChip2.classList.contains('is-full'),
      '填一项就变 1/1 并高亮（一眼看出哪组还没填完）', noteChip2.textContent + ' · ' + noteChip2.className);
    setDailyField('dailyFormTicket', 'g1_wx', 2);
    await sleep(20);
    check(ticketForm.querySelector('[data-group="g1"] [data-fill]').textContent === '1/4',
      '① 繁花填了微信 → 1/4', ticketForm.querySelector('[data-group="g1"] [data-fill]').textContent);
    $('dailyTabOverseas').click();
    await sleep(40);
    const ovForm = $('dailyFormOverseas');
    check(ovForm.querySelectorAll('.daily-group').length === 7,
      '海外日报分成 7 组（基础 / 评价来访 / 邮箱 / SDk / 工单 / 监控 / 群维系）', ovForm.querySelectorAll('.daily-group').length);
    const sdkKeys = Array.from(ovForm.querySelectorAll('[data-group="sdk"] [data-key]')).map(el => el.dataset.key);
    check(sdkKeys.join(',') === 'sdk_mh,sdk_ajs,sdk_yl',
      'SDk 工单三项在同一片里（梦幻 / 爱江山 / 月光）', sdkKeys.join(','));
    check(ovForm.querySelectorAll('[data-key]').length === 17,
      '海外 17 个字段都在（分组没吞字段）', ovForm.querySelectorAll('[data-key]').length);
    const reviewKeys = Array.from(ovForm.querySelectorAll('[data-group="review"] [data-key]')).map(el => el.dataset.key);
    check(reviewKeys.join(',') === 'ios,google,fb,fb_yl',
      '「评价与来访」只留 商店评价 + 两个 FB', reviewKeys.join(','));
    const emailKeys = Array.from(ovForm.querySelectorAll('[data-group="email"] [data-key]')).map(el => el.dataset.key);
    check(emailKeys.join(',') === 'email_mh,email_ajs,email_yl',
      '邮箱三项（梦幻 / 爱江山 / 月光）单独占一片、各一个输入框', emailKeys.join(','));
    $('dailyTabTicket').click();
    await sleep(40);
    check($('dailyFormTicket').querySelectorAll('.daily-group').length === 10
      && $('dailyFormTicket').querySelectorAll('[data-key]').length === 32,
      '切回工单栏重新渲染，分组与字段数都还原');
  }

  console.log('--- 8p. 排班休息月历（微软日历样式：星期表头 / 7 列 / 今天 / 上个月·下个月） ---');
  {
    doc.querySelector('.tab-btn[data-tab="career"]').click();
    await sleep(60);
    if ($('careerRestCard').style.display === 'none') $('careerRestBtn').click();
    await sleep(30);
    $('careerRestMonth').value = '2026-06';
    $('careerRestMonth').dispatchEvent(new window.Event('change'));
    await sleep(30);
    const wd = Array.from(doc.querySelectorAll('#careerRestGrid .rest-cal-week .wd')).map(el => el.textContent);
    check(wd.join('') === '日一二三四五六',
      '月历第一行是星期表头（日一二三四五六，周日排最前，跟微软日历一致）', wd.join(''));
    check(doc.querySelectorAll('#careerRestGrid .rest-cal-week .wd.is-weekend').length === 2,
      '只有「日」和「六」标成周末色', doc.querySelectorAll('#careerRestGrid .rest-cal-week .wd.is-weekend').length);
    const cells = doc.querySelectorAll('#careerRestGrid .rest-cal-grid > *').length;
    const blanks = doc.querySelectorAll('#careerRestGrid .rest-cal-blank').length;
    const days = doc.querySelectorAll('#careerRestGrid .career-rest-day').length;
    check(days === 30 && cells % 7 === 0 && blanks === 5,
      '2026-06 共 30 天，前后用空格子补齐成整周（6/1 是周一 → 月初空 1 格，月末补 4 格）',
      { days, blanks, cells });
    const firstCell = doc.querySelector('#careerRestGrid .rest-cal-grid > *');
    check(firstCell && firstCell.classList.contains('rest-cal-blank'),
      '6/1 落在「一」下面（最左边是空的周日位）', firstCell && firstCell.className);
    check(doc.querySelectorAll('#careerRestGrid .career-rest-day.weekend').length === 8,
      '周末那 8 天带 .weekend 底色', doc.querySelectorAll('#careerRestGrid .career-rest-day.weekend').length);
    check(($('careerRestTitle').textContent || '').trim() === '2026 年 6 月',
      '抬头写着「2026 年 6 月」', $('careerRestTitle').textContent);
    check(doc.querySelectorAll('#careerRestGrid .career-rest-day.is-today').length === 0,
      '不是当月时没有「今天」标记');
    $('careerRestNext').click();
    await sleep(30);
    check($('careerRestMonth').value === '2026-07' && /2026 年 7 月/.test($('careerRestTitle').textContent),
      '点 › 到 2026 年 7 月（月份输入框跟着变）', $('careerRestMonth').value + ' / ' + $('careerRestTitle').textContent);
    $('careerRestPrev').click();
    $('careerRestPrev').click();
    await sleep(30);
    check($('careerRestMonth').value === '2026-05' && /2026 年 5 月/.test($('careerRestTitle').textContent),
      '点 ‹‹ 会跨月回退（6 月 → 5 月）', $('careerRestMonth').value);
    // 回到本月：今天那格要有标记
    $('careerRestMonth').value = bjToday.slice(0, 7);
    $('careerRestMonth').dispatchEvent(new window.Event('change'));
    await sleep(30);
    const todayCell = doc.querySelector('#careerRestGrid .career-rest-day.is-today');
    check(!!todayCell && todayCell.dataset.rest === bjToday && todayCell.querySelector('b').textContent === String(+bjToday.slice(8, 10)),
      '当月里「今天」那格带 .is-today（数字高亮）', todayCell && todayCell.dataset.rest);
    // 休息标记：带 .rest + 「休」+ aria-pressed
    todayCell.click();
    await sleep(40);
    const restCell = doc.querySelector('#careerRestGrid .career-rest-day.rest[data-rest="' + bjToday + '"]');
    check(!!restCell && restCell.querySelector('i').textContent === '休'
      && restCell.getAttribute('aria-pressed') === 'true',
      '标了休息的格子显示「休」小片并 aria-pressed=true', restCell && restCell.querySelector('i').textContent);
    check(/休息 1 天/.test($('careerRestHint').textContent),
      '标题行右边写「休息 1 天」（不再重复月份）', $('careerRestHint').textContent);
    doc.querySelector('#careerRestGrid .career-rest-day.is-today').click();   // ⚠️ 重画后要重新取节点
    await sleep(40);
    check(doc.querySelectorAll('#careerRestGrid .career-rest-day.rest').length === 0,
      '再点一次取消，月历里没有休息格了');
  }

  console.log('--- 8q. 七日任务（进度日志 → 用内置固定任务表判定） ---');
  {
    const postsBefore = posts.length;
    // 用户给的真实进度日志（2509/2514/2519 都是 1→1 没变状态，2504 是 1→2 达成）
    const sdLog = [
      '创建时间\t活动排期ID\t事件UUID\t任务ID\t老进度\t新进度\t老状态\t新状态',
      '2026-10-22 09:56:20\t34\t640eddc780ec6f7f432516746715fa04\t2509\t10797\t11417\t1\t1',
      '2026-10-22 09:56:20\t34\t640eddc780ec6f7f432516746715fa04\t2514\t10797\t11417\t1\t1',
      '2026-10-22 09:56:20\t34\t640eddc780ec6f7f432516746715fa04\t2519\t10797\t11417\t1\t1',
      '2026-10-22 09:55:55\t34\ta520c425ce76a1c7c728149f8e25cff9\t2504\t91\t100\t1\t2',
    ].join('\n');

    doc.querySelector('.tab-btn[data-tab="gen"]').click();
    await sleep(60);
    doc.querySelector('#tab-gen .seg-btn[data-seg="sevenday"]').click();
    await sleep(40);
    check(!doc.querySelector('.tab-btn[data-tab="sevenday"]') && !!$('genSevendayPane'),
      '七日任务已经并进「话术生成」页（侧边栏不再单独占一个标签）');
    check($('tab-gen').dataset.seg === 'sevenday'
      && $('genSevendayPane').classList.contains('seg-on')
      && !doc.querySelector('#tab-gen .inline-card').classList.contains('seg-on'),
      '话术生成页里切到「七日任务进度」这一段（话术生成那两块同时收起）');
    check($('sdReportMeta').children.length === 3,
      '抬头右上 3 格元数据（任务表 / 进度日志 / 活动排期）', $('sdReportMeta').children.length);
    check(!$('sdTaskFold') && !$('sdTaskInput') && !$('sdTaskSub'),
      '页面上不再展示任务表那一块（内置在代码里，界面上看不见也改不了）');
    check(/任务表70 条（内置）/.test($('sdReportMeta').textContent),
      '抬头右上写「任务表 70 条（内置）」—— 两期任务表（2416–2450 + 2486–2520）', $('sdReportMeta').textContent);

    // 粘用户给的真实日志 → 按内置任务表判定
    $('sdLogInput').value = sdLog;
    fire($('sdLogInput'), 'input');
    check(/进度日志 4 条/.test($('sdReportSub').textContent) && /34/.test($('sdReportMeta').textContent),
      '抬头认得出 4 条日志 + 活动排期 34', $('sdReportSub').textContent);
    $('sdGenerateBtn').click();
    await sleep(40);
    const out = $('sdOutput').value;
    check(/^七日任务进度（活动排期 34） · 共 4 个任务/.test(out),
      '首行写活动排期 + 一共几个任务', out.split('\n')[0]);
    check(/^第4天$/m.test(out) && /^第5天$/m.test(out) && /^第6天$/m.test(out) && /^第7天$/m.test(out)
      && out.indexOf('第4天') < out.indexOf('第5天'),
      '按任务表的天数分组并排序（第4天 → 第7天）');
    check(/1\. 10-22 09:55 使用100个道具：已使用 100\/100，已完成，可领取 积分 50 \+ 竹丝匣×1/.test(out),
      '完成的那条：时间点 + 已使用多少/目标 + 已完成 + 能领什么（30701×1 → 竹丝匣×1），不带任务ID', out);
    check(!/\(2504\)|\(2509\)|\(2514\)|\(2519\)/.test(out),
      '话术里不再出现任务ID（不写「（2504）」这种）', out.split('\n').slice(0, 4));
    check(/10-22 09:56 收集16000个道具：已收集 11417\/16000，还差 4583/.test(out),
      '没完成的写「已收集多少/目标，还差 N」（16000 − 11417 = 4583）', out);
    check(/收集20000个道具：已收集 11417\/20000，还差 8583/.test(out)
      && /收集24000个道具：已收集 11417\/24000，还差 12583/.test(out),
      '第6天 / 第7天两条也各算各的差多少');

    // 第二期任务表（2416–2450）：用户截图里那批 2423 / 2428 / 2429… 现在也能认出来
    $('sdLogInput').value = [
      '创建时间\t活动排期ID\t事件UUID\t任务ID\t老进度\t新进度\t老状态\t新状态',
      '2026-10-23 08:24:05\t34\t5ff8c69cd2560490818cd32495bb54\t2423\t3079\t3101\t1\t1',
      '2026-10-23 08:24:05\t34\t5ff8c69cd2560490818cd32495bb54\t2428\t34\t35\t1\t1',
      '2026-10-23 08:24:05\t34\t5ff8c69cd2560490818cd32495bb54\t2433\t1740\t1760\t1\t1',
      '2026-10-23 08:24:05\t34\t5ff8c69cd2560490818cd32495bb54\t2424\t0\t20\t1\t2',
    ].join('\n');
    fire($('sdLogInput'), 'input');
    $('sdGenerateBtn').click();
    await sleep(40);
    const out2 = $('sdOutput').value;
    check(/^第2天$/m.test(out2) && /^第3天$/m.test(out2) && /^第4天$/m.test(out2) && !/未标天数/.test(out2),
      '第二期任务表（2416–2450）也认：2423 / 2428 / 2433 有了「第几天」，不再落「未标天数」', out2);
    check(/10-23 08:24 收集3200个道具：已收集 3101\/3200，还差 99/.test(out2),
      '2423 按新表写成「已收集 3101/3200，还差 99」（截图里原来只有「进度 3101」）', out2);
    check(/获取65个猫猫头：已获取 35\/65，还差 30/.test(out2)
      && /获得2650活动代币：已获得 1760\/2650，还差 890/.test(out2),
      '2428 / 2433 的目标和「还差」也对上了');
    check(/使用20个道具：已使用 20\/20，已完成，可领取 积分 30/.test(out2),
      '2424 已完成 → 写「已完成，可领取 积分 30 + …」', out2);
    check(/2423|2428|2433|2424/.test(out2) === false,
      '新表的条目同样不带任务ID');

    // 状态还是 1、但进度已经够目标 → 也算达成（后台状态常慢一拍）
    $('sdLogInput').value = [
      '创建时间\t活动排期ID\t事件UUID\t任务ID\t老进度\t新进度\t老状态\t新状态',
      '2026-10-22 10:00:00\t34\tccc\t2487\t19\t20\t1\t1',
    ].join('\n');
    fire($('sdLogInput'), 'input');
    $('sdGenerateBtn').click();
    await sleep(40);
    check(/10-22 10:00 服务20个顾客：已服务 20\/20，已完成，可领取 积分 20 \+ 体力×35/.test($('sdOutput').value),
      '新状态还是 1、但进度够目标 → 也判「已完成」并写奖励', $('sdOutput').value);

    // 同一个任务粘多条日志 → 合成一句（老进度取最早、新进度取最新）
    $('sdLogInput').value = [
      '创建时间\t活动排期ID\t事件UUID\t任务ID\t老进度\t新进度\t老状态\t新状态',
      '2026-10-22 09:50:00\t34\taaa\t2504\t50\t91\t1\t1',
      '2026-10-22 09:55:55\t34\tbbb\t2504\t91\t100\t1\t2',
    ].join('\n');
    fire($('sdLogInput'), 'input');
    $('sdGenerateBtn').click();
    await sleep(40);
    check(/共 1 个任务/.test($('sdOutput').value)
      && /使用100个道具：已使用 100\/100，已完成/.test($('sdOutput').value),
      '同一任务的多条日志合成一条（50 → 100，不是 91 → 100 两条）', $('sdOutput').value);

    // 任务表里没有的 ID → 回落成「任务NNNN」，但句式跟别的行一致（已进行 N，未完成）
    $('sdLogInput').value = '2026-10-22 10:01:00\t34\tddd\t9999\t1\t2\t1\t1';
    fire($('sdLogInput'), 'input');
    $('sdGenerateBtn').click();
    await sleep(40);
    check(/^未标天数$/m.test($('sdOutput').value) && /10-22 10:01 任务9999：已进行 2，未完成/.test($('sdOutput').value),
      '任务表里没有的 ID 落「未标天数」、回落成「任务9999」，但句式仍是「已… N，未完成」', $('sdOutput').value);
    $('sdLogInput').value = '2026-10-22 10:02:00\t34\tddd\t9998\t1\t2\t1\t2';
    fire($('sdLogInput'), 'input');
    $('sdGenerateBtn').click();
    await sleep(40);
    check(/10-22 10:02 任务9998：已进行 2，已完成，可领取活动奖励/.test($('sdOutput').value),
      '认不出的 ID 就算完成了也补「可领取活动奖励」，句子不会缺一截', $('sdOutput').value);

    // 清空只清日志与结果（任务表是内置的，动不了）
    $('sdLogInput').value = sdLog;
    fire($('sdLogInput'), 'input');
    $('sdGenerateBtn').click();
    await sleep(30);
    $('sdClearBtn').click();
    await sleep(400);
    let sdState = null;
    try { sdState = JSON.parse(window.localStorage.getItem('sevendayTaskState') || 'null'); } catch (_) { }
    check($('sdLogInput').value === '' && $('sdOutput').value === '',
      '🧹 清空只清日志与结果');
    check(!!sdState && sdState.log === '' && sdState.task === undefined,
      '本机只记日志（sevendayTaskState.log），不再存任务表', sdState);
    check(posts.length === postsBefore,
      '全程没往服务端发过一个请求（只在本机处理）', posts.length - postsBefore);

    // 切走再切回来内容还在 + 空结果复制只提示
    $('sdLogInput').value = '2026-10-22 09:55:55\t34\tbbb\t2504\t91\t100\t1\t2';
    fire($('sdLogInput'), 'input');
    doc.querySelector('.tab-btn[data-tab="daily"]').click();
    await sleep(30);
    doc.querySelector('.tab-btn[data-tab="gen"]').click();
    await sleep(30);
    check($('sdLogInput').value.indexOf('2504') !== -1 && $('tab-gen').dataset.seg === 'sevenday',
      '切到别的标签页再回来，日志还在、还停在七日任务这一段');
    $('sdOutput').value = '';
    $('sdCopyBtn').click();
    await sleep(20);
    check(/还没有生成结果/.test($('sdHint').textContent), '没结果时点复制只提示', $('sdHint').textContent);
  }

  console.log('--- 8r. 反馈模板 · 巨多（卡片墙：一张卡 = 一条消息） ---');
  {
    const posts8r = posts.length;
    doc.querySelector('.tab-btn[data-tab="feedback"]').click();
    await sleep(40);
    check(!!$('fbBulkBtn') && $('fbBulkPane').style.display === 'none',
      '「巨多」开关默认关着（卡片区不显示）');
    $('fbBulkBtn').click();
    await sleep(30);
    check($('fbBulkBtn').getAttribute('aria-pressed') === 'true' && $('fbBulkPane').style.display !== 'none',
      '点开关 → aria-pressed=true，卡片区露出来', $('fbBulkBtn').textContent);

    // 乐缤纷：一次粘两行 → 两张卡（一段一张）
    doc.querySelector('#fbTemplateGroup .fb-chip[data-fb-template="lebifen"]').click();
    await sleep(20);
    $('fbRawInput').value = '92930999\tweChat (wechat)\t2.1.7.62\t问题反馈\t没有显示也没有发掘币\t2026-10-02 10:05:53\t未查看\t\t\t2026-10-02 10:05:53\t回复 删除\n'
      + '92930001\tweChat (wechat)\t2.1.7.62\t问题反馈\t充值没到账\t2026-10-02 11:05:53\t未查看\t\t\t2026-10-02 11:05:53\t回复 删除';
    $('fbGenerateBtn').click();
    await sleep(40);
    const cardN = doc.querySelectorAll('#fbCards .fb-card').length;
    check(cardN === 2, '「巨多」打开时生成结果变成两张卡片（一段一张，不再是一坨长文）', cardN);
    check(/没有显示也没有发掘币/.test($('fbCards').textContent) && /充值没到账/.test($('fbCards').textContent),
      '两张卡片内容各自独立（一条反馈一张卡）');

    // 卡片正文可编辑
    const body0 = doc.querySelector('#fbCards .fb-card-body');
    body0.innerHTML = body0.innerHTML + '<br>已核实，补偿已发';
    fire(body0, 'input');
    await sleep(30);
    check(/已核实，补偿已发/.test(doc.querySelector('#fbCards .fb-card-body').textContent),
      '卡片正文可以直接编辑（contenteditable）');

    // 粘图：剪贴板里是图片 → 自己插 <img>（dataURL 存本机）
    const pv = new window.Event('paste', { bubbles: true });
    Object.defineProperty(pv, 'clipboardData', {
      value: { files: [new window.File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })], items: [] }
    });
    body0.dispatchEvent(pv);
    await sleep(80);
    const img = doc.querySelector('#fbCards .fb-card-body img');
    check(!!img && /^data:image\/png;base64,/.test(img.getAttribute('src') || ''),
      '卡片里 Ctrl+V 贴截图 → 转成 dataURL 的 <img> 塞进卡片', img && (img.getAttribute('src') || '').slice(0, 22));

    // 多选 + 一条一条复制
    doc.querySelectorAll('#fbCards .fb-card-check').forEach(cb => { cb.checked = true; fire(cb, 'change'); });
    await sleep(20);
    check(/已勾选 2 张/.test($('fbCardHint').textContent), '卡片可以多选（勾选）', $('fbCardHint').textContent);
    $('fbCardCopyBtn').click();
    await sleep(20);
    check(/已复制第 1 张/.test($('fbCardHint').textContent) && /还剩 1 条/.test($('fbCardCopyBtn').textContent),
      '「复制选中」第一次**只复制第 1 张**（一张卡 = 一条消息），按钮变成「复制下一条」',
      $('fbCardHint').textContent + ' / ' + $('fbCardCopyBtn').textContent);
    $('fbCardCopyBtn').click();
    await sleep(20);
    check(/已复制第 2 张/.test($('fbCardHint').textContent) && /全部复制完了/.test($('fbCardHint').textContent),
      '再点一次复制第 2 张 → 全部复制完（不会把两张并成一条）', $('fbCardHint').textContent);

    // 合并复制兜底
    $('fbCardCopyAllBtn').click();
    await sleep(20);
    check(/合并复制成一条/.test($('fbCardHint').textContent), '另有「合并复制成一条」（要合并时才用）', $('fbCardHint').textContent);

    // 加空白卡 / 删单卡
    $('fbCardAddBtn').click();
    await sleep(30);
    check(doc.querySelectorAll('#fbCards .fb-card').length === 3, '「＋ 空白卡片」能加一张手写的卡',
      doc.querySelectorAll('#fbCards .fb-card').length);
    doc.querySelector('#fbCards .fb-card [data-fb-del]').click();
    await sleep(30);
    check(doc.querySelectorAll('#fbCards .fb-card').length === 2 && /删掉了第 1 张/.test($('fbCardHint').textContent),
      '每张卡可以单独删', $('fbCardHint').textContent);

    // 只存本机 + 关掉后收起但卡片还在
    await sleep(480);
    let bulkState = null;
    try { bulkState = JSON.parse(window.localStorage.getItem('feedbackBulk') || 'null'); } catch (_) { }
    const bulkN = (bulkState && Array.isArray(bulkState.items)) ? bulkState.items.length : -1;
    check(!!bulkState && bulkState.on === true && bulkN === 2,
      '开关状态 + 卡片内容只存本机 localStorage（feedbackBulk）', bulkState && bulkN);
    $('fbBulkBtn').click();
    await sleep(30);
    check($('fbBulkPane').style.display === 'none' && $('fbBulkBtn').getAttribute('aria-pressed') === 'false',
      '关掉「巨多」→ 卡片区收起（卡片没删，再打开还在）');
    $('fbBulkBtn').click();
    await sleep(30);
    check(doc.querySelectorAll('#fbCards .fb-card').length === 2, '再打开还是那两张卡');
    $('fbCardClearBtn').click();
    await sleep(40);
    check(doc.querySelectorAll('#fbCards .fb-card').length === 0
      && !!doc.querySelector('#fbCards .fb-cards-empty'),
      '「🧹 清空卡片」清空（并显示空状态说明）');
    check(posts.length === posts8r, '卡片墙全程不发请求（只在本机处理）', posts.length - posts8r);
  }

  console.log('--- 8s. 反馈模板 · 工单（喜扑工单整块 → 九行反馈，玩家数据补 UID / 渠道） ---');
  {
    const posts8s = posts.length;
    doc.querySelector('.tab-btn[data-tab="feedback"]').click();
    await sleep(40);
    // 工单模板：来源只有「工单」，切过去自动选中
    doc.querySelector('#fbTemplateGroup .fb-chip[data-fb-template="ticket"]').click();
    await sleep(30);
    const tpls = Array.from(doc.querySelectorAll('#fbTemplateGroup .fb-chip'));
    const tplIdx = tpls.findIndex(x => x.dataset.fbTemplate === 'ticket');
    check(tplIdx === 4 && tpls[4].classList.contains('active'),
      '模板里多了「工单（反馈）」，点一下就是当前模板', tplIdx);
    const shownSrc = Array.from(doc.querySelectorAll('#fbSourceGroup .fb-chip')).filter(x => x.style.display !== 'none');
    check(shownSrc.length === 1 && shownSrc[0].dataset.fbSource === '工单',
      '工单模板的来源只留「工单」一个（其它来源片都藏起来）',
      shownSrc.map(x => x.dataset.fbSource));

    // 用户给的原文：后台「工单：工单号 …」那一整块（制表符分隔，问题描述是多行）
    const tk = [
      '工单：工单号\t1536243 (近一个月来单：1)',
      '主体\t喜扑',
      '类型\t游戏问题',
      '游戏名称\t微信-梦幻消除战',
      '区服名称\t微信-梦幻消除战',
      '角色ID\t76929541',
      '绑定的手机\t18083197970',
      '问题描述\t【问题类型】道具丢失',
      '【问题描述】棋子丢失',
      '【棋子名称+等级】13级糕点',
      '【详细描述】10.20号晚上七点左右，不小心删除了顶级糕点，帮我找回一下',
      '工单状态\t待接管',
      '接管人\t未接管',
      '创建时间\t2026-10-23 13:24:01',
      '发生时间\t2026-10-20 18:55:00',
      '联系人电话\t18083197970',
    ].join('\n');
    $('fbRawInput').value = tk;
    $('fbGenerateBtn').click();
    await sleep(40);
    const got = $('fbOutput').value;
    check(/^【梦幻消除战问题反馈】/.test(got), '标题按「游戏名称」生成（微信-梦幻消除战 → 【梦幻消除战问题反馈】）', got.split('\n')[0]);
    check(/【角色ID】：76929541/.test(got) && /【具体描述】：10\.20号晚上七点左右，不小心删除了顶级糕点，帮我找回一下/.test(got),
      '角色ID 与【具体描述】（取【详细描述】那句）都对上', got);
    check(/【发生时间】：2026-10-20 18:55:00/.test(got), '【发生时间】用 工单 里的那行', got);
    check(/【设备信息】：\n/.test(got), '【设备信息】留空（工单和玩家数据里都没有）');
    check(/【喜扑UID】：\n/.test(got) && /【渠道】：\n/.test(got),
      '没粘玩家数据时【喜扑UID】【渠道】先空着', got);
    check(/\n来源：工单\n编号：1536243$/.test(got) && !/近一个月来单/.test(got),
      '结尾是「来源：工单 / 编号：1536243」（工单号后面的「近一个月来单」不要）', got);

    // 再把「玩家数据：…」那一坨粘在后面 → 补喜扑UID / 渠道
    const player = [
      '',
      '玩家数据：176674940\t番糖-梦幻消除战-支付宝小程序\tandroid\t',
      '0',
      '',
      '梦幻消除战',
      '',
      '53141283',
      '',
      'player53141283',
      '',
      '2026-02-09 09:33:22',
    ].join('\n');
    $('fbRawInput').value = tk + player;
    $('fbGenerateBtn').click();
    await sleep(40);
    const got2 = $('fbOutput').value;
    check(/【喜扑UID】：176674940/.test(got2) && /【渠道】：支付宝小程序/.test(got2),
      '粘上「玩家数据」后，喜扑UID = 176674940、渠道 = 支付宝小程序 都补上了', got2);
    check(/【角色ID】：76929541/.test(got2), '角色ID 仍用工单里的（玩家数据里那个数字不当真）', got2);

    // 一次粘两块工单 → 两段（段间空一行），巨多模式下就是两张卡
    const tk2 = tk.replace('1536243', '1536244').replace('76929541', '76929542');
    $('fbRawInput').value = tk + '\n' + tk2;
    $('fbGenerateBtn').click();
    await sleep(40);
    const got3 = $('fbOutput').value;
    const segN = got3.split(/\n\n/).filter(x => x.trim()).length;
    check(segN === 2 && /编号：1536243/.test(got3) && /编号：1536244/.test(got3),
      '一次粘两块工单 → 两段（各自一个编号），段间空一行', segN);

    // 认不出工单时不瞎生成
    $('fbRawInput').value = '工单号\tXXX-123\n来源\t企微\n游戏\t异世界勇者';
    $('fbGenerateBtn').click();
    await sleep(40);
    check(/没认出工单/.test($('fbHint').textContent) && $('fbOutput').value === '',
      '内部工单那种内容不会被当成喜扑工单（提示没认出工单，不生成）', $('fbHint').textContent);

    // 别的模板粘工单 → 提示切到「工单（反馈）」
    doc.querySelector('#fbTemplateGroup .fb-chip[data-fb-template="menghuan"]').click();
    await sleep(30);
    $('fbRawInput').value = tk;
    $('fbGenerateBtn').click();
    await sleep(40);
    check(/请把模板切成「工单（反馈）」/.test($('fbHint').textContent),
      '模板选错（梦幻）粘工单 → 提示切到「工单（反馈）」', $('fbHint').textContent);
    check(posts.length === posts8s, '工单模板全程不发请求（只在本机处理）', posts.length - posts8s);
  }
  console.log('--- 8t. 工单列表整段粘贴 → 快速开卡；缺的信息在卡片上再粘一次补 ---');
  {
    const posts8t = posts.length;
    doc.querySelector('.tab-btn[data-tab="feedback"]').click();
    await sleep(40);
    doc.querySelector('#fbTemplateGroup .fb-chip[data-fb-template="ticket"]').click();
    await sleep(30);
    if ($('fbBulkBtn').getAttribute('aria-pressed') !== 'true') { $('fbBulkBtn').click(); await sleep(30); }
    $('fbCardClearBtn').click();
    await sleep(40);

    // 用户给的原文：后台工单列表整段复制（制表符分隔，第 2 行起第一格是勾选框空的）
    const rowsText = [
      '1536284\t一线工单\t微信\t游戏问题\t喜扑\t【问题类型】道具丢失 【问题描...\t微信-梦幻消除战\tV1\t待接管\t未接管\t18932927094\t2026-10-23 14:21:58\t\t\t ',
      '\t1536283\t一线工单\t微信\t充值问题\t喜扑\t【问题类型】充值问题 【问题描...\t微信-梦幻消除战\tV2\t待接管\t未接管\t13018896865\t2026-10-23 14:20:40\t\t\t ',
      '\t1536282\t一线工单\t微信\t游戏问题\t喜扑\t【问题类型】道具丢失 【问题描...\t微信-梦幻消除战\tV0\t待接管\t未接管\t17604811801\t2026-10-23 14:20:33\t\t\t ',
      '\t1536281\t一线工单\t普通\t找回账号\t喜扑\t\t唱舞全明星\tV3\t待接管\t未接管\t15578871156\t2026-10-23 14:17:41',
    ].join('\n');
    $('fbRawInput').value = rowsText;
    $('fbGenerateBtn').click();
    await sleep(50);
    const cards = () => doc.querySelectorAll('#fbCards .fb-card');
    check(cards().length === 4, '工单列表整段粘 + 巨多开着 → 一行开一张卡（4 行 = 4 张）', cards().length);
    check(/工单列表行/.test($('fbHint').textContent), '提示里说明是按「工单列表行」开的卡', $('fbHint').textContent);
    const c1 = $('fbCards').textContent;
    check(/【梦幻消除战问题反馈】/.test(c1) && /编号：1536284/.test(c1),
      '第 1 张：标题按「微信-梦幻消除战」生成、编号 1536284', c1.slice(0, 60));
    check(/【唱舞全明星问题反馈】/.test($('fbCards').textContent) && /编号：1536281/.test($('fbCards').textContent),
      '第 4 张（唱舞全明星）：标题也跟着换', $('fbCards').textContent.slice(-120));
    check(/【喜扑UID】：\n/.test(c1) && /【角色ID】：\n/.test(c1),
      '列表里拿不到的信息先空着（喜扑UID / 角色ID / 渠道）', c1);
    check($('fbOutput').value.split(/\n\n/).filter(x => x.trim()).length === 4,
      '文本框里也是 4 段（关掉巨多时照样能用）', $('fbOutput').value.split(/\n\n/).length);

    // 在卡片上再粘一次「玩家数据」→ 只补这张卡
    const pasteInto = (body, text) => {
      const ev = new window.Event('paste', { bubbles: true });
      Object.defineProperty(ev, 'clipboardData', { value: { files: [], items: [], getData: () => text } });
      body.dispatchEvent(ev);
    };
    const bodyOf = i => doc.querySelectorAll('#fbCards .fb-card-body')[i];
    const playerBlob = '玩家数据：176674940\t番糖-梦幻消除战-支付宝小程序\tandroid\t';
    pasteInto(bodyOf(0), playerBlob);
    await sleep(60);
    check(/【喜扑UID】：176674940/.test(bodyOf(0).textContent) && /【渠道】：支付宝小程序/.test(bodyOf(0).textContent),
      '选中第 1 张再粘「玩家数据」→ 这张卡补上 喜扑UID / 渠道', bodyOf(0).textContent);
    check(!/176674940/.test(bodyOf(1).textContent), '只补这一张，别的卡不受影响', bodyOf(1).textContent);
    check(/已把粘到的信息补进这张卡/.test($('fbCardHint').textContent), '提示写「已把粘到的信息补进这张卡」', $('fbCardHint').textContent);

    // 再往第 2 张粘「工单整块」→ 补 角色ID / 发生时间 / 具体描述，编号还是这张自己的
    const tkBlock = [
      '工单：工单号\t1536243 (近一个月来单：1)',
      '主体\t喜扑',
      '游戏名称\t微信-梦幻消除战',
      '角色ID\t76929541',
      '问题描述\t【问题类型】道具丢失',
      '【详细描述】10.20号晚上七点左右，不小心删除了顶级糕点，帮我找回一下',
      '发生时间\t2026-10-20 18:55:00',
    ].join('\n');
    pasteInto(bodyOf(1), tkBlock);
    await sleep(60);
    check(/【角色ID】：76929541/.test(bodyOf(1).textContent), '第 2 张补上角色ID', bodyOf(1).textContent);
    check(/【发生时间】：2026-10-20 18:55:00/.test(bodyOf(1).textContent) && /【具体描述】：10\.20号晚上七点左右/.test(bodyOf(1).textContent),
      '发生时间 / 具体描述 也补上了', bodyOf(1).textContent);
    check(/编号：1536283/.test(bodyOf(1).textContent) && !/1536243/.test(bodyOf(1).textContent),
      '编号还是这张卡自己的（粘来的 1536243 不会覆盖）', bodyOf(1).textContent);

    // 已经补过的再粘一次 → 不重复贴、只提示
    pasteInto(bodyOf(1), tkBlock);
    await sleep(60);
    check(/已经有了/.test($('fbCardHint').textContent), '同一份信息再粘一次 → 提示已经有了（不会把原文糊进卡片）', $('fbCardHint').textContent);
    check(posts.length === posts8t, '列表开卡 / 补信息全程不发请求', posts.length - posts8t);

    // 用户截图那种：第一行直接是「工单号⇥1536284 (近一个月来单：4)」（没有「工单：」前缀）
    const tkPlain = [
      '工单号\t1536284 (近一个月来单：4)',
      '主体\t喜扑',
      '类型\t游戏问题',
      '游戏名称\t微信-梦幻消除战',
      '区服名称\t微信-梦幻消除战',
      '角色ID\t138145608',
      '绑定的手机\t18932927094',
      '问题描述\t【问题类型】道具丢失',
      '【问题描述】棋子丢失',
      '【棋子名称+等级】茶+13级',
      '【详细描述】多次删除也是我的东西啊，而且我看权益增加是有找回一次丢失物品的机会的',
      '工单状态\t待接管',
      '接管人\t未接管',
      '创建时间\t2026-10-23 14:21:58',
      '发生时间\t2026-10-19 11:00:00',
      '联系人电话\t18932927094',
    ].join('\n');
    if ($('fbBulkBtn').getAttribute('aria-pressed') === 'true') { $('fbBulkBtn').click(); await sleep(30); }
    $('fbCardClearBtn').click();
    await sleep(30);
    $('fbRawInput').value = tkPlain;
    $('fbGenerateBtn').click();
    await sleep(50);
    const plain = $('fbOutput').value;
    check(plain.split(/\n\n/).filter(x => x.trim()).length === 1,
      '「工单号⇥…」开头的整块按一整块解析（不再被当成 3 行列表开出空卡）', plain.split(/\n\n/).length);
    check(/【角色ID】：138145608/.test(plain) && /【发生时间】：2026-10-19 11:00:00/.test(plain)
      && /【具体描述】：多次删除也是我的东西啊/.test(plain),
      '字段都填上了：角色ID / 发生时间 / 具体描述（不是一堆空行）', plain);
    check(/编号：1536284$/.test(plain.trim()) && !/编号：18932927094/.test(plain),
      '编号 = 工单号 1536284（不是手机号）', plain.trim().split('\n').slice(-2).join(' / '));
    check(doc.querySelectorAll('#fbCards .fb-card').length === 0,
      '巨多关着时不往卡片墙里塞东西（就走文本框）', doc.querySelectorAll('#fbCards .fb-card').length);
    // 巨多开着也是同一份格式：一整块 = 一张卡（字段是满的，不是空模板）
    $('fbBulkBtn').click();
    await sleep(30);
    $('fbCardClearBtn').click();
    await sleep(30);
    $('fbRawInput').value = tkPlain;
    $('fbGenerateBtn').click();
    await sleep(50);
    check(doc.querySelectorAll('#fbCards .fb-card').length === 1,
      '巨多开着：一整块只开 1 张卡（不是 3 张空模板）', doc.querySelectorAll('#fbCards .fb-card').length);
    check(/【角色ID】：138145608/.test($('fbCards').textContent) && /编号：1536284/.test($('fbCards').textContent),
      '这张卡里的字段也是填满的', $('fbCards').textContent.slice(0, 80));
    $('fbBulkBtn').click();
    await sleep(30);

    // 只有「字段名⇥值」几行、开头不是工单号 → 仍然认不出（别把角色ID/手机号当列表行）
    $('fbRawInput').value = '角色ID\t138145608\n绑定的手机\t18932927094\n联系人电话\t18932927094';
    $('fbGenerateBtn').click();
    await sleep(40);
    check(/没认出工单/.test($('fbHint').textContent) && $('fbOutput').value === '',
      '只有字段名⇥值、没有工单号那种，不会误开卡（提示没认出工单）', $('fbHint').textContent);

  }
  console.log('--- 9. 无未捕获异常 ---');
  check(!warns.some(w => w.startsWith('ERROR')), 'console.error 未被调用：' + warns.filter(w => w.startsWith('ERROR')).join(' | '));
  check(jsdomErrors.length === 0, '页面无未捕获异常（jsdomError）', jsdomErrors.slice(0, 3));

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本自身异常:', e); process.exit(2); });
