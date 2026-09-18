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

  console.log('--- 9. 无未捕获异常 ---');
  check(!warns.some(w => w.startsWith('ERROR')), 'console.error 未被调用：' + warns.filter(w => w.startsWith('ERROR')).join(' | '));
  check(jsdomErrors.length === 0, '页面无未捕获异常（jsdomError）', jsdomErrors.slice(0, 3));

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本自身异常:', e); process.exit(2); });
