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

let pass = 0, fail = 0;
const check = (cond, msg, extra) => {
  if (cond) { pass++; console.log('✓ ' + msg); }
  else { fail++; console.log('✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

const posts = [];      // 记录所有 POST
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
    window.requestAnimationFrame = () => 0;      // 不真的跑动画循环
    window.cancelAnimationFrame = () => { };
    window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(this); };
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    window.URL.createObjectURL = () => 'blob:stub';
    window.URL.revokeObjectURL = () => { };
    window.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      const key = parseKey(url);
      let body = null;
      try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (_) { }
      posts.push(method === 'POST' ? { url: String(url), method, body } : { url: String(url), method: 'GET' });
      if (method === 'GET') {
        // value 必须是真正的 undefined，才会走 loadData 的 defaultValue 分支（首次打开场景）
        return { ok: true, status: 200, json: async () => (key in serverData ? { value: serverData[key] } : {}) };
      }
      if (body) serverData[key] = body.value;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
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
  const careerPosts = () => posts.filter(p => p.method !== 'GET' && p.url.includes('careerData'));
  const lastCareer = () => { const l = careerPosts(); return l.length ? l[l.length - 1].body.value : null; };
  const kpiText = () => $('careerKpi').textContent;
  const setDailyField = (formId, key, val) => {
    const el = $(formId).querySelector('[data-key="' + key + '"]');
    if (!el) return false;
    el.value = String(val);
    fire(el, 'input');
    return true;
  };

  $('dailyTabOverseas').click();          // 海外表单要先切过去才渲染
  await sleep(40);
  check($('dailyFormOverseas').querySelectorAll('[data-key]').length === 11, '海外日报表单 11 个字段（含新增的 海外CP后台工单/国内工单/（梦幻/繁花/乐缤纷）群维系）',
    $('dailyFormOverseas').querySelectorAll('[data-key]').length);

  // 工单栏：g7=异世界群维系(3+1)、①②⑤群维系(只为只存档层)、sso=SSO国内(5)
  // 海外栏：sdk=海外SSO(12)、email=海外邮件(4)、ios+google=商店回复(14)、mute=禁言(7)、ban=封号(3)
  //        新增三项：mhl_group=6、cp_ticket=2、cn_ticket=3
  const dailySets = [['dailyFormTicket', 'name', '测试员'], ['dailyFormTicket', 'shift', 'F'],
    ['dailyFormTicket', 'g7_wx', 3], ['dailyFormTicket', 'g7_dy', 1],
    ['dailyFormTicket', 'g1_wx', 2], ['dailyFormTicket', 'g2_dy', 1], ['dailyFormTicket', 'sso', 5],
    ['dailyFormOverseas', 'sdk', 12], ['dailyFormOverseas', 'email', 4],
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
  check(rec0 && rec0.total === 65, '折算口径正确：当日工作量 = 65（工单 10 + 海外 55）', rec0 && rec0.total);
  check(rec0 && rec0.items.t_sso === 5 && rec0.items.sj_group === 4 && rec0.items.store_reply === 14
    && rec0.items.ov_sso === 12 && rec0.items.ov_email === 4 && rec0.items.mute === 7 && rec0.items.ban === 3,
    '逐项折算正确（SSO5/异世界4/商店14/海外SSO12/邮件4/禁言7/封号3）', rec0 && rec0.items);
  check(rec0 && rec0.items.mhl_group === 6 && rec0.items.ov_cp === 2 && rec0.items.cn_ticket === 3,
    '海外日报新增的三项已计入海外侧（群维系6/CP后台2/国内工单3）', rec0 && rec0.items);
  const ovReport = $('dailyResultArea').value;
  check(ovReport.includes('（梦幻/繁花/乐缤纷）群维系：6') && ovReport.includes('海外CP后台工单：2') && ovReport.includes('国内工单：3'),
    '海外日报正文已输出这 3 行', ovReport.slice(-110));
  check(rec0 && rec0.status === '已完成记录' && rec0.src === 'daily', '状态与来源标记正确', rec0 && [rec0.status, rec0.src]);
  check(rec0 && rec0.items.t_g6_wx === 5 && rec0.items.t_g1_wx === undefined && rec0.items.t_g2_dy === undefined,
    '③④⑥ 留工单侧（g6_wx5），①②⑤ 不在（避免与海外侧群维系汇总重复）', rec0 && rec0.items);
  check(rec0 && rec0.items.g6_group === undefined && rec0.items.fanhua_group === undefined, '不再有聚合项/只存档项的旧 key', rec0 && rec0.items);
  check(rec0 && rec0.items.t_g5_wx === undefined, '日报里没填的字段不入账（⑤梦幻是 0）', rec0 && rec0.items);
  check(rec0 && rec0.extra === undefined, '不再有脱离统计的 extra 字段');

  doc.querySelector('.tab-btn[data-tab="career"]').click();   // 切到客服生涯
  await sleep(40);
  check(/累计工作量\s*65/.test(kpiText()), 'KPI：累计工作量 65（工单 10 + 海外 55）', kpiText().slice(0, 60));
  check(/完整记录天数\s*1/.test(kpiText()), 'KPI：完整记录 1 天', kpiText().slice(0, 120));
  check(/日均工作量\s*65/.test(kpiText()) && /最高单日\s*65/.test(kpiText()), 'KPI：日均/最高单日 = 65');
  check(/最长连续记录\s*1 天/.test(kpiText()), 'KPI：连续记录天数');
  check(/环比|近 30 记录日日均/.test(kpiText()), 'KPI：趋势类指标已渲染');
  check($('careerTrend').querySelectorAll('span').length === 1, '趋势条 = 1 根', $('careerTrend').querySelectorAll('span').length);
  check(/工单侧\s*10 \+ 海外侧\s*55 = 65/.test($('careerSheetHint').textContent)
    && /登记表 14 项口径.*57/.test($('careerSheetHint').textContent),
    '口径拆分：工单10 + 海外55 = 65；登记表 14 列口径 57（差额 = 不在登记表里的项）', $('careerSheetHint').textContent);
  const sideTicket = $('careerSideTicket').textContent;
  const sideOverseas = $('careerSideOverseas').textContent;
  check(/工单侧累计\s*10/.test(sideTicket), '工单侧单独统计：累计 10', sideTicket.slice(0, 40));
  check(/海外侧累计\s*55/.test(sideOverseas), '海外侧单独统计：累计 55', sideOverseas.slice(0, 40));
  check(/53客服在线/.test(sideTicket) && /支付宝在线/.test(sideTicket) && /爱江山CP后台/.test(sideTicket)
    && /③不差钱·微信/.test(sideTicket) && /⑥伙伴弹途·微信/.test(sideTicket)
    && !/①繁花·微信/.test(sideTicket) && !/⑤梦幻消除战·微信/.test(sideTicket)
    && !/异世界群维系/.test(sideTicket) && !/猫之城/.test(sideTicket),
    '工单侧与工单日报对齐（③④⑥ 在、①②⑤ 不在、异世界归海外）', sideTicket.slice(0, 60));
  check(/异世界群维系/.test(sideOverseas) && /（梦幻\/繁花\/乐缤纷）群维系/.test(sideOverseas)
    && /国内工单/.test(sideOverseas) && /海外CP后台工单/.test(sideOverseas) && /监控禁言/.test(sideOverseas),
    '海外侧含异世界群维系 / （梦幻/繁花/乐缤纷）群维系 / 国内工单 / 海外CP后台工单 / 禁言封号');
  const itemTbl = $('careerItemTable').textContent;
  check(itemTbl.includes('商店回复') && itemTbl.includes('（梦幻/繁花/乐缤纷）群维系') && itemTbl.includes('不计入统计'),
    '登记表 14 列口径表在，只存档的列标了「不计入统计」', itemTbl.slice(0, 50));

  // 粘贴导入：故意打乱表头顺序，验证按列名对齐；日期用 Excel 序列号
  const tsv = [
    '日期\t人员\t班次\t商店回复\t海外SSO工单量（全产品）\t（繁花+乐缤纷+梦幻）群维系\t监控禁言\t监控封号\t总计\t数据状态\t特殊问题',
    '46176\t姚宏杰\tF\t14\t12\t0\t9\t7\t42\t已完成记录\t',
    '2026-06-04\t姚宏杰\tH\t10\t8\t2\t0\t0\t20\t已完成记录\t测试备注',
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
  check(recs['2026-06-04'] && recs['2026-06-04'].note === '测试备注', '特殊问题列已带入');
  check(/累计工作量\s*127/.test(kpiText()), 'KPI 更新：65 + 42 + 20 = 127', kpiText().slice(0, 40));
  check(/登记表 14 项口径.*119/.test($('careerSheetHint').textContent), '登记表口径同步为 119（57+62）', $('careerSheetHint').textContent);
  check(/待确认 1 天/.test($('careerQuality').textContent), '「总计为空/待确认」不入统计，单列提示', $('careerQuality').textContent.slice(0, 60));
  const monthTbl = $('careerMonthlyTable').textContent;
  check(monthTbl.includes('2026-06') && monthTbl.includes(bjToday.slice(0, 7)), '月度汇总含 2026-06 与本月', monthTbl.slice(0, 60));

  // 重复导入同一天：覆盖而不是累加
  $('careerImportBtn').click();
  await sleep(60);
  const recs2 = (lastCareer() || { records: {} }).records;
  check(Object.keys(recs2).length === Object.keys(recs).length, '重复导入不产生重复记录', Object.keys(recs2).length);
  check(/覆盖已有 3 天/.test($('careerImportHint').textContent), '重复导入提示为覆盖', $('careerImportHint').textContent);
  check(/累计工作量\s*127/.test(kpiText()), '重复导入后累计仍是 127（未翻倍）', kpiText().slice(0, 40));

  // 补录 / 修正 / 删除
  $('careerEditDate').value = '2026-06-05';
  $('careerLoadDayBtn').click();
  await sleep(30);
  check(/还没有记录/.test($('careerEditHint').textContent), '补录：空日期给出提示', $('careerEditHint').textContent);
  $('careerEditGrid').querySelector('[data-career-key="store_reply"]').value = '6';
  $('careerSaveDayBtn').click();
  await sleep(30);
  check(/已保存 2026-06-05：工作量 6/.test($('careerEditHint').textContent), '补录保存成功', $('careerEditHint').textContent);
  check(/累计工作量\s*133/.test(kpiText()), '补录后累计 127+6 = 133', kpiText().slice(0, 40));
  $('careerLoadDayBtn').click();
  await sleep(30);
  check(/已载入 2026-06-05/.test($('careerEditHint').textContent)
    && $('careerEditGrid').querySelector('[data-career-key="store_reply"]').value === '6', '能回读已补录的那天');
  $('careerDeleteDayBtn').click();
  await sleep(30);
  check(/累计工作量\s*127/.test(kpiText()), '删除后累计回到 127', kpiText().slice(0, 40));

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
  check(careerPosts().length >= 4, '生涯数据每次都回写服务端（多设备同步）', careerPosts().length);

  console.log('--- 9. 无未捕获异常 ---');
  check(!warns.some(w => w.startsWith('ERROR')), 'console.error 未被调用：' + warns.filter(w => w.startsWith('ERROR')).join(' | '));
  check(jsdomErrors.length === 0, '页面无未捕获异常（jsdomError）', jsdomErrors.slice(0, 3));

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本自身异常:', e); process.exit(2); });
