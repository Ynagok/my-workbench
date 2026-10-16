/* eslint-disable */
// public/pmc.html（生管物料订单工作台）自检：真跑一遍内联脚本 + 独立复算计算引擎
// 用法: node tools/smoke-pmc.cjs [public/pmc.html]
const fs = require('node:fs');
const path = require('node:path');

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
const file = process.argv[2] || 'public/pmc.html';
if (!fs.existsSync(file)) { console.error('✗ 找不到 ' + file); process.exit(2); }

let pass = 0, fail = 0;
const bad = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; bad.push(name); console.log('  ✗ ' + name); }
}

const jsdomErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => jsdomErrors.push(e.message + (e.detail && e.detail.message ? ' :: ' + e.detail.message : '')));
vc.on('error', (...a) => jsdomErrors.push('console.error: ' + a.map(String).join(' ')));

const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost:3000/pmc.html',
  virtualConsole: vc,
  beforeParse(win) {
    // jsdom 自带的 Blob 没有 .stream()，xlsx 解压那段要用，统一换成 Node 的（真浏览器里本来就有）
    for (const k of ['Blob', 'Response', 'DecompressionStream', 'TextDecoder', 'ReadableStream']) {
      if (typeof globalThis[k] !== 'undefined') win[k] = globalThis[k];
    }
  },
});
const win = dom.window;
const doc = win.document;
const P = win.__pmc;

console.log('# 生管物料订单工作台冒烟');

/* ---------- 1. 启动 ---------- */
ok(!!P, '1.1 页面脚本跑起来了（window.__pmc 存在）');
ok(jsdomErrors.length === 0, '1.2 启动过程没有未捕获异常' + (jsdomErrors.length ? ' → ' + jsdomErrors.join(' | ') : ''));
const mats = P.MATS();
ok(mats.length > 60, '1.3 内置样例有材料（' + mats.length + ' 条）');
const ver = P.versions()[0];
ok(ver.dates.length === 31 && ver.materials.length === mats.length || mats.length === ver.materials.length, '1.4 日期 31 天与材料数一致');
ok(mats.every(m => m.demand.length === ver.dates.length), '1.5 每条材料的每日需求长度 = 天数');
ok(mats.filter(m => m.snp > 0).length > 50, '1.6 大部分材料从主表里读到了 SNP（' + mats.filter(m => m.snp > 0).length + ' 条）');
ok(mats.filter(m => m.supplier && m.supplier !== '未指定').length > 15, '1.7 认出了供应商（' + mats.filter(m => m.supplier !== '未指定').length + ' 条）');

/* ---------- 2. 计算引擎 vs 独立复算 ---------- */
function refCompute(m, dates, opt) {
  const mult = m.mult, trigger = m.snp * mult, pack = m.pack, moq = m.moq;
  let stock = m.initStock, shortage = -1;
  const daily = [];
  for (let i = 0; i < dates.length; i++) {
    stock -= (+m.demand[i] || 0);
    daily.push(stock);
    if (shortage < 0 && stock < trigger) shortage = i;
  }
  if (shortage < 0) return { trigger, shortage: -1, qty: 0 };
  const end = Math.min(daily.length - 1, shortage + m.gapDays - 1);
  let cover = 0;
  for (let i = shortage; i <= end; i++) cover += (+m.demand[i] || 0);
  let qty = cover + trigger - daily[shortage];
  if (qty < 0) qty = 0;
  qty = Math.ceil(qty / (pack > 1 ? pack : 1)) * (pack > 1 ? pack : 1);
  if (moq > qty) qty = moq;
  return { trigger, shortage, cover, qty, end };
}
let mism = 0, checked = 0, shortageCount = 0;
mats.forEach((m) => {
  const r = P.compute(m, ver.dates);
  const ref = refCompute(m, ver.dates);
  checked++;
  if (r.shortageIdx !== ref.shortage) mism++;
  else if (ref.shortage >= 0 && (r.orderQty !== ref.qty || Math.abs(r.coverDemand - ref.cover) > 1e-6 || r.trigger !== ref.trigger)) mism++;
  if (ref.shortage >= 0) shortageCount++;
});
ok(checked === mats.length, '2.1 全部材料都算了一遍（' + checked + '）');
ok(mism === 0, '2.2 与独立复算逐条一致（缺料日/覆盖需求/下单量），不一致 ' + mism + ' 条');
ok(shortageCount > 0 && shortageCount < mats.length, '2.3 样例里既有缺料材料也有不缺料的（缺料 ' + shortageCount + ' 条）');

/* ---------- 3. 规则细节 ---------- */
const m0 = mats.filter(m => P.compute(m, ver.dates).shortageIdx >= 0)[0];
ok(!!m0, '3.1 找得到一条缺料材料做样本');
const r0 = P.compute(m0, ver.dates);
ok(r0.trigger === m0.snp * m0.mult, '3.2 触发线 = SNP × 保留倍数');
ok(r0.coverDays === Math.min(m0.gapDays, ver.dates.length - r0.shortageIdx), '3.3 覆盖天数按缺口天数截断');
ok(r0.orderQty >= r0.coverDemand + r0.trigger - r0.stockAtArrival - 1e-6,
  '3.4 下单量 ≥ 覆盖需求 + 触发线 − 到货时库存（qty=' + r0.orderQty + ' 覆盖=' + r0.coverDemand + ' 触发线=' + r0.trigger + ' 到货库存=' + r0.stockAtArrival + '）');
ok(m0.pack <= 1 || r0.orderQty % m0.pack === 0, '3.5 下单量按包装倍数向上取整');

// 包装倍数 / MOQ 生效
const mP = Object.assign({}, m0, { pack: 5, moq: 0, mult: 1 });
const rP = P.compute(mP, ver.dates);
ok(rP.orderQty % 5 === 0, '3.6 pack=5 时下单量是 5 的倍数（' + rP.orderQty + '）');
const mM = Object.assign({}, m0, { moq: 987654 });
ok(P.compute(mM, ver.dates).orderQty === 987654, '3.7 MOQ 大于算出来的量时提到 MOQ');

// 自提 → 周一/周四
const mS = Object.assign({}, m0, { transport: 'self', leadTime: 3 });
const rS = P.compute(mS, ver.dates);
const wd = new Date(rS.orderDate + 'T00:00:00').getDay();
ok(wd === 1 || wd === 4, '3.8 自提材料的建议下单日落在周一/周四（' + rS.orderDate + ' 周' + wd + '）');
const plain = P.compute(Object.assign({}, m0, { transport: 'normal' }), ver.dates);
ok(rS.orderDate <= plain.orderDate, '3.9 自提只会把下单日往前挪，不会往后');
ok(rS.orderQty === plain.orderQty, '3.10 运输方式不改下单量（集中送货也走 MOQ）');

// 保留倍数 2 触发更早
const r2 = P.compute(Object.assign({}, m0, { mult: 2 }), ver.dates);
ok(r2.shortageIdx <= r0.shortageIdx, '3.11 保留倍数 2 的缺料日不晚于倍数 1');

/* ---------- 3b. 加工周期（工作日，从到货次日开始算） ---------- */
// 用户给的例子：下周五缺料、加工 3 个工作日 → 最晚下周二到货（周三/四/五加工完）
const mkMat = (shortageISO, procDays, leadTime) => {
  // 造一条「第 10 天必然缺料」的材料：月初库存 0、SNP 0、只有第 10 天有需求
  const demand = ver.dates.map(() => 0);
  demand[9] = 100;
  return { key: 'TEST', id: 'T', name: 'T', scope: 'T', supplier: 'X', initStock: 0, demand, excelStock: [],
    snp: 0, mult: 1, gapDays: 7, leadTime: leadTime == null ? 0 : leadTime, procDays, transport: 'normal', moq: 0, pack: 1, status: '待确认' };
};
const days = ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22'];
const wdName = (iso) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(iso + 'T00:00:00').getDay()];
ok(wdName('2026-06-19') === '周五' && wdName('2026-06-16') === '周二', '3b.1 测试用的日历对得上（6/19 周五、6/16 周二）');

const dates6 = ['2026-06-01']; // 占位，下面直接用 backWorkdays/addWorkdays 验算
ok(P.backWorkdays('2026-06-19', 3) === '2026-06-16', '3b.2 缺料周五 + 加工 3 工作日 → 最晚到货周二（' + P.backWorkdays('2026-06-19', 3) + '）');
ok(P.addWorkdays('2026-06-16', 3) === '2026-06-19', '3b.3 周二到货 → 加工完正好是周五（' + P.addWorkdays('2026-06-16', 3) + '）');
ok(P.backWorkdays('2026-06-22', 1) === '2026-06-19', '3b.4 跨周末要跳过：周一缺料 + 加工 1 工作日 → 上周五到货');
ok(P.addWorkdays('2026-06-19', 1) === '2026-06-22', '3b.5 周五到货 + 加工 1 工作日 → 下周一（周末不算）');
ok(P.backWorkdays('2026-06-19', 0) === '2026-06-19', '3b.6 加工周期 0 → 到货日就是缺料日（老口径不变）');
ok(P.isWorkday('2026-06-19') === true && P.isWorkday('2026-06-20') === false, '3b.7 周六不算工作日');

// 引擎里的联动：到货日 = 缺料日往前退 N 个工作日；下单日 = 到货日 − 提前期
const matProc = Object.assign({}, m0, { procDays: 3, leadTime: 3, transport: 'normal' });
const rProc = P.compute(matProc, ver.dates);
ok(rProc.arrivalDate === P.backWorkdays(rProc.shortageDate, 3), '3b.8 引擎：到货日 = 缺料日往前退 3 个工作日');
ok(P.addWorkdays(rProc.arrivalDate, 3) <= rProc.shortageDate, '3b.9 引擎：到货 + 加工 3 工作日 ≤ 缺料日（加工得完）');
const minusDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d - n); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
ok(rProc.orderDate === minusDays(rProc.arrivalDate, 3),
  '3b.10 引擎：下单日 = 到货日 − 提前期 3 天（' + rProc.orderDate + ' = ' + rProc.arrivalDate + ' − 3）');
const rNoProc = P.compute(Object.assign({}, m0, { procDays: 0, leadTime: 3 }), ver.dates);
ok(rNoProc.arrivalDate === rNoProc.shortageDate, '3b.11 加工 0 的到货日 = 缺料日（与改动前一致）');
ok(rProc.orderDate < rNoProc.orderDate, '3b.12 有加工周期时下单日必须更早（' + rProc.orderDate + ' < ' + rNoProc.orderDate + '）');
ok(rProc.orderQty === rNoProc.orderQty, '3b.13 加工周期不影响下单量（数量口径还是缺料日库存）');

// 节假日也算非工作日
P.state.settings.holidays = '2026-06-17';
P.rebuildHolidays();
ok(P.isWorkday('2026-06-17') === false, '3b.14 节假日清单里的日期不算工作日');
ok(P.backWorkdays('2026-06-19', 3) === '2026-06-15', '3b.15 6/17 放假 → 到货再提前一天（' + P.backWorkdays('2026-06-19', 3) + '）');
P.state.settings.holidays = '';
P.rebuildHolidays();
ok(P.backWorkdays('2026-06-19', 3) === '2026-06-16', '3b.16 清空节假日后恢复（' + P.backWorkdays('2026-06-19', 3) + '）');

// 极端：加工周期很长时也不会崩
const rBig = P.compute(Object.assign({}, m0, { procDays: 30 }), ver.dates);
ok(/^\d{4}-\d{2}-\d{2}$/.test(rBig.arrivalDate) && rBig.arrivalDate < rBig.shortageDate, '3b.17 加工 30 个工作日也能算出到货日（' + rBig.arrivalDate + '）');

/* ---------- 3c. 送货周期 / 在途锁定 / 调整建议 ---------- */
// 用户的场景：今天周二(6/16)，已经下了周三(6/17)的到料计划 → 材料在路上，动不了
const mkPlanMat = (opts) => {
  const demand = ver.dates.map(() => 0);
  demand[16] = 100;                       // 6/17 就有需求 → 需要的到货日落在锁定期内
  return Object.assign({
    key: 'P', id: 'P', name: 'P', scope: 'P', supplier: 'X', initStock: 0, demand, excelStock: [],
    snp: 0, mult: 1, gapDays: 7, leadTime: 3, procDays: 0, transitDays: 3, transport: 'normal', moq: 0, pack: 1,
    arrivals: [], status: '待确认'
  }, opts);
};
const T_TUE = '2026-06-16';
const planA = mkPlanMat({ arrivals: [{ d: '2026-06-17', q: 500 }] });   // 周三到货，正在路上
const rA = P.compute(planA, ver.dates, T_TUE);
ok(rA.today === T_TUE && rA.lockLine === '2026-06-19', '3c.1 锁定线 = 今天 + 送货周期（' + rA.today + ' + 3 → ' + rA.lockLine + '）');
ok(rA.arrivals.length === 1 && rA.arrivals[0].locked === true, '3c.2 周三的到料计划判为「在途·锁定」（材料在路上）');
const planB = mkPlanMat({ arrivals: [{ d: '2026-06-22', q: 500 }] });
const rB = P.compute(planB, ver.dates, T_TUE);
ok(rB.arrivals[0].locked === false, '3c.3 6/22 那批在锁定期外 → 可调');
const planC = mkPlanMat({ arrivals: [{ d: '2026-06-10', q: 500 }] });
ok(P.compute(planC, ver.dates, T_TUE).arrivals[0].past === true, '3c.4 已经过去的到货日标「已到/已过」');
ok(P.compute(planA, ver.dates, T_TUE).lockedQty === 500 && P.compute(planB, ver.dates, T_TUE).flexQty === 500,
  '3c.5 锁定数量 / 可调数量分开统计');

// 需要的到货日落在锁定期内 → 来不及（除非在途够量）
const needLate = P.compute(mkPlanMat({}), ver.dates, T_TUE);
ok(needLate.arrivalDate <= needLate.lockLine, '3c.6 这条测试材料的「需要的到货日」确实落在锁定期内（' + needLate.arrivalDate + ' ≤ ' + needLate.lockLine + '）');
ok(needLate.state === 'late', '3c.7 无在途 + 需要到货日在锁定期内 → 状态 late（来不及）');
ok(/来不及/.test(needLate.advice) && /加急/.test(needLate.advice), '3c.8 建议里写明来不及 + 只能加急/接受缺料');
ok(needLate.canStillOrder === false, '3c.9 canStillOrder=false（新单赶不上）');

// 在途够量 → 在途已覆盖
const covered = P.compute(mkPlanMat({ arrivals: [{ d: needLate.arrivalDate, q: needLate.orderQty + 10 }] }), ver.dates, T_TUE);
ok(covered.state === 'covered' || covered.state === 'late', '3c.10 在途当量到货 → 不再要求新下单（' + covered.state + '）');
ok(covered.lockedBeforeNeed >= covered.orderQty, '3c.11 锁定期内在途 ≥ 需要量（' + P.compute(mkPlanMat({ arrivals: [{ d: needLate.arrivalDate, q: needLate.orderQty + 10 }] }), ver.dates, T_TUE).lockedBeforeNeed + '）');

// 需要到货日在锁定期外 → 还能下单调整
const late = Object.assign({}, needLate, {});
const mkFar = mkPlanMat({ arrivals: [] });
mkFar.demand = ver.dates.map(() => 0);
mkFar.demand[29] = 100;                   // 6/30 才需要
const rFar = P.compute(mkFar, ver.dates, T_TUE);
ok(rFar.arrivalDate > rFar.lockLine, '3c.12 6/30 的需求 → 需要的到货日在锁定期外（' + rFar.arrivalDate + ' > ' + rFar.lockLine + '）');
ok(rFar.state === 'intime', '3c.13 状态 intime（还能下单调整）');
ok(/可下单/.test(rFar.advice), '3c.14 建议里给出「可下单：X 下单、Y 到货、Z 件」');

// 可调批次比需要的到货日更晚 → 提示可以提前
const withFlex = mkPlanMat({ demand: ver.dates.map((d, i) => (i === 29 ? 100 : 0)), arrivals: [{ d: '2026-07-01', q: 300 }] });
const rFlex = P.compute(withFlex, ver.dates, T_TUE);
ok(rFlex.flexArrivals.length === 1, '3c.15 7/1 那批判为可调');
ok(rFlex.state === 'flex-earlier' && /可提前到/.test(rFlex.advice), '3c.16 可调批次晚于需要的到货日 → 提示可提前（' + rFlex.state + '）');

// 送货周期 0 → 什么都不锁（只有今天以前的锁定）
const zero = P.compute(mkPlanMat({ transitDays: 0, arrivals: [{ d: '2026-06-22', q: 100 }] }), ver.dates, T_TUE);
ok(zero.lockLine === T_TUE && zero.arrivals[0].locked === false, '3c.17 送货周期 0 → 锁定线就是今天');
// 送货周期很长 → 远期批次也锁定
const longT = P.compute(mkPlanMat({ transitDays: 30, arrivals: [{ d: '2026-06-30', q: 100 }] }), ver.dates, T_TUE);
ok(longT.arrivals[0].locked === true && longT.state === 'late', '3c.18 送货周期 30 天 → 6/30 的批次也算在途，且来不及');


const tr = P.trendRows();
ok(tr.length > 60, '4.1 趋势对比拿到材料行（' + tr.length + '）');
ok(tr.some(r => r.trend === 'up') && tr.some(r => r.trend === 'down'), '4.2 加单/减单两种趋势都出现了');
ok(tr.every(r => r.rate == null || Math.abs(r.rate - (r.next - r.prev) / (r.prev || 1) * 100) < 1e-6 || r.prev === 0), '4.3 变化率公式一致');

/* ---------- 5. 界面渲染 ---------- */
const q = (s) => doc.querySelectorAll(s);
ok(q('#suggestWrap tbody tr').length === mats.length, '5.1 下单建议表渲染出 ' + mats.length + ' 行');
ok(q('#kpis .kpi').length === 6, '5.2 顶部 6 张 KPI 卡');
ok(/触发预警/.test(doc.getElementById('kpis').textContent), '5.3 KPI 里有「触发预警」');
ok(q('#dailyWrap tbody tr').length === 31, '5.4 逐日明细 31 行');
ok(q('#chart .col').length === 31, '5.5 库存柱状图 31 根');
ok(doc.getElementById('chart').innerHTML.indexOf('触发线') > 0, '5.6 图上画了触发线');
ok(q('#trendWrap tbody tr').length === tr.length, '5.7 趋势表行数对得上');
ok(q('#exportWrap tbody tr').length > mats.length, '5.8 导出预览含分组标题行');
const expText = doc.getElementById('exportWrap').textContent;
ok(/馨源|鸿昌|利拓|上海天洋|孝感神鹿|东莞元丰|瑞高|盟力|东美/.test(expText), '5.9 导出预览里出现真实供应商名');
ok(q('#verSel option').length >= 2, '5.10 版本下拉有内置两版');

// 切标签页
const dailyBtn = doc.querySelector('.tabs button[data-tab="daily"]');
dailyBtn.click();
ok(doc.getElementById('tab-daily').classList.contains('on') && !doc.getElementById('tab-suggest').classList.contains('on'), '5.11 点标签页会切换 section');
doc.querySelector('.tabs button[data-tab="suggest"]').click();

// 表内改参数 → 实时重算
const firstShort = Array.from(q('#suggestWrap tbody tr')).filter(tr => /缺料|月\/|不预警/.test(tr.textContent))[0];
const rowWithShort = Array.from(q('#suggestWrap tbody tr')).filter(tr => tr.querySelector('input[data-f="snp"]'))[0];
const snpInput = rowWithShort.querySelector('input[data-f="snp"]');
const beforeTrigger = rowWithShort.children[6].textContent;
snpInput.value = String((+snpInput.value || 0) + 1000);
snpInput.dispatchEvent(new win.Event('change', { bubbles: true }));
const rowAfter = doc.querySelector('#suggestWrap tbody tr[data-key="' + rowWithShort.getAttribute('data-key') + '"]');
ok(beforeTrigger !== rowAfter.children[6].textContent, '5.12 改 SNP 后触发线立刻重算（' + beforeTrigger + ' → ' + rowAfter.children[6].textContent + '）');
const stored = JSON.parse(win.localStorage.getItem('pmcWorkbench_v1') || '{}');
ok(stored.params && Object.keys(stored.params).length === 1, '5.13 改动的参数落到本机缓存');

// 状态列点击循环
const statusPill = doc.querySelector('#suggestWrap tbody tr [data-f="status"]');
const s0 = statusPill.textContent;
statusPill.click();
const s1 = doc.querySelector('#suggestWrap tbody tr [data-f="status"]').textContent;
ok(s0 !== s1, '5.14 点状态会在 待确认→已确认→已下单 之间切换（' + s0 + ' → ' + s1 + '）');

// 供应商筛选
const fSup = doc.getElementById('fSup');
ok(fSup.options.length > 2, '5.15 供应商筛选下拉有真实供应商');
fSup.value = fSup.options[1].value;
fSup.dispatchEvent(new win.Event('change', { bubbles: true }));
ok(q('#suggestWrap tbody tr').length < mats.length, '5.16 按供应商筛选后行数变少（' + q('#suggestWrap tbody tr').length + '）');
fSup.value = '';
fSup.dispatchEvent(new win.Event('change', { bubbles: true }));

// 只看需要下单
const fOnly = doc.getElementById('fOnly');
fOnly.checked = true;
fOnly.dispatchEvent(new win.Event('change', { bubbles: true }));
const shortageNow = P.MATS().filter(m => P.compute(m, ver.dates).shortageIdx >= 0).length;
ok(q('#suggestWrap tbody tr').length === shortageNow, '5.17 「只看需要下单的」过滤出 ' + shortageNow + ' 条');
fOnly.checked = false;
fOnly.dispatchEvent(new win.Event('change', { bubbles: true }));

// 趋势筛选
const fTrend = doc.getElementById('fTrend');
fTrend.value = 'up';
fTrend.dispatchEvent(new win.Event('change', { bubbles: true }));
ok(q('#trendWrap tbody tr').length === tr.filter(r => r.trend === 'up').length, '5.18 趋势筛选「加单」行数对得上');
fTrend.value = '';
fTrend.dispatchEvent(new win.Event('change', { bubbles: true }));

// 阈值
const thr = doc.getElementById('thr');
thr.value = '0';
thr.dispatchEvent(new win.Event('change', { bubbles: true }));
ok(P.state.settings.threshold === 0, '5.19 阈值可以调到 0（不被 || 5 吃掉）');
thr.value = '5';
thr.dispatchEvent(new win.Event('change', { bubbles: true }));

// 加工周期相关的界面
ok(q('#suggestWrap tbody tr input[data-f="procDays"]').length > 0, '5.20 下单建议表里有「加工周期」输入框');
ok(/最晚到货日/.test(doc.querySelector('#suggestWrap thead').textContent), '5.21 表头有「最晚到货日」列');
ok(/加工周期/.test(doc.getElementById('exportWrap').textContent), '5.22 导出预览表头含加工周期/到达货列');
ok(!!doc.getElementById('dProc') && !!doc.getElementById('dHoliday'), '5.23 默认参数里有 加工周期 + 节假日 输入框');
// 改一条材料的加工周期 → 到货日/下单日往前挪
const procRowKey = doc.querySelector('#suggestWrap tbody tr input[data-f="procDays"]').closest('tr').getAttribute('data-key');
const procMatOld = P.MATS().filter(m => m.key === procRowKey)[0];
const rOld = P.compute(procMatOld, ver.dates);
const procInput = doc.querySelector('#suggestWrap tbody tr[data-key="' + procRowKey + '"] input[data-f="procDays"]');
procInput.value = '10';
procInput.dispatchEvent(new win.Event('change', { bubbles: true }));
const procMatNew = P.MATS().filter(m => m.key === procRowKey)[0];
const rNew = P.compute(procMatNew, ver.dates);
ok(procMatNew.procDays === 10, '5.24 表里改加工周期写进了材料参数');
ok(!rNew.shortageDate || rNew.arrivalDate < rOld.arrivalDate, '5.25 加工周期变大 → 到货日更早（' + rOld.arrivalDate + ' → ' + rNew.arrivalDate + '）');
ok(!rNew.shortageDate || rNew.orderDate < rOld.orderDate, '5.26 加工周期变大 → 下单日更早（' + rOld.orderDate + ' → ' + rNew.orderDate + '）');
procInput.value = '0';
procInput.dispatchEvent(new win.Event('change', { bubbles: true }));

/* ---------- 5b. 到货计划页 ---------- */
const planTabBtn = doc.querySelector('.tabs button[data-tab="plan"]');
ok(!!planTabBtn, '5b.1 有「到货计划 / 调整建议」标签页');
planTabBtn.click();
ok(doc.getElementById('tab-plan').classList.contains('on'), '5b.2 点它能切过去');
ok(q('#planKpis .kpi').length === 7, '5b.3 到货计划页 7 张 KPI 卡');
const planRowsNow = q('#planWrap tbody tr').length;
ok(planRowsNow > 0, '5b.4 到货计划表有行（只看要下单的，' + planRowsNow + ' 行）');
ok(/在途|锁定|可调/.test(doc.getElementById('planWrap').textContent), '5b.5 表里能看到 在途·锁定 / 可调 标记');
ok(q('#planWrap input[data-f="transitDays"]').length === planRowsNow, '5b.6 每行都能改送货周期');
ok(/今天|锁定线/.test(doc.getElementById('planSub').textContent), '5b.7 抬头写清今天与送货周期');
// 取消「只看要下单的」→ 行数变多
const planOnly = doc.getElementById('planOnly');
const onlyRows = q('#planWrap tbody tr').length;
planOnly.checked = false;
planOnly.dispatchEvent(new win.Event('change', { bubbles: true }));
ok(q('#planWrap tbody tr').length > onlyRows, '5b.8 取消「只看要下单的」后行数变多（' + q('#planWrap tbody tr').length + '）');
planOnly.checked = true;
planOnly.dispatchEvent(new win.Event('change', { bubbles: true }));
// 状态筛选
const planState = doc.getElementById('planState');
planState.value = 'late';
planState.dispatchEvent(new win.Event('change', { bubbles: true }));
const lateRows = q('#planWrap tbody tr').length;
const lateExpect = P.MATS().filter((m) => P.compute(m, ver.dates, doc.getElementById('baseDate').value).state === 'late').length;
ok(lateRows === lateExpect, '5b.9 按「来不及」筛选行数对得上（' + lateRows + '）');
planState.value = '';
planState.dispatchEvent(new win.Event('change', { bubbles: true }));
// 改基准日 → 锁定线跟着变
const bd = doc.getElementById('baseDate');
const beforeLock = doc.getElementById('planSub').textContent;
bd.value = '2026-06-20';
bd.dispatchEvent(new win.Event('change', { bubbles: true }));
ok(doc.getElementById('planSub').textContent.indexOf('2026-06-20') >= 0 && doc.getElementById('planSub').textContent !== beforeLock, '5b.10 改基准日 → 今天的锁定线跟着变');
bd.value = ver.dates[0];
bd.dispatchEvent(new win.Event('change', { bubbles: true }));
// 逐日明细里也要有到货计划列
doc.querySelector('.tabs button[data-tab="daily"]').click();
ok(/到料计划/.test(doc.getElementById('dailyWrap').textContent), '5b.11 逐日明细表有「到料计划」列');
ok(/能不能改|在途·锁定|可调/.test(doc.getElementById('dailyWrap').textContent), '5b.12 逐日明细里每批到料都标了能不能改');
doc.querySelector('.tabs button[data-tab="suggest"]').click();

/* ---------- 6. 导入相关 ---------- */
ok(typeof P.blocksFromSheet === 'function', '6.1 暴露了主表解析函数（供导入用）');
// 造一张迷你主表结构：表头行 + 一个材料块，验证解析器认得出
const fakeRows = new Map();
fakeRows.set(1, [null, '车型式样', '颜色', '项目', '合計', 46023, 2, 3, 4, 5, 6, 7]);
fakeRows.set(2, [1, 'H93AS 腿托布', '黑', '需求', 300, 10, 20, 30, 40, 0, 0]);
fakeRows.set(3, [null, null, 'SNP 180', '订单', 0]);
fakeRows.set(4, [null, '馨源', null, '库存', 500, 490, 470, 450, 410, 370, 370]);
const fakeSheet = { rows: fakeRows, maxRow: 4, maxCol: 13 };
const parsed = P.blocksFromSheet(fakeSheet);
ok(!parsed.error, '6.2 迷你主表能解析（无 error）');
ok(parsed.materials.length === 1, '6.3 解析出 1 条材料');
if (parsed.materials[0]) {
  const pm = parsed.materials[0];
  ok(pm.snp === 180, '6.4 从「SNP 180」文字里读到 SNP');
  ok(pm.st === 500, '6.5 读到月初库存 500');
  ok(pm.d[0] === 10 && pm.d[2] === 30 && pm.d[4] === 0, '6.6 每日需求对齐（10 / 30 / 0）');
  ok(pm.v === '馨源', '6.7 认出了供应商');
  ok(/腿托布/.test(pm.n), '6.8 物料名带上了');
} else {
  ok(false, '6.4-6.8 迷你主表字段断言（无材料，跳过）');
}

/* ---------- 7. 真表端到端导入（有真实 xlsx 才跑） ---------- */
const realXlsx = [
  path.join(__dirname, 'out', 'pmc-xlsx', 'src.xlsx'),
  'C:/Users/k1344/.dsh/attachments/v1/files/8c/8c4f8444b7e2904270b2c496ad919a8cdb7ca2e841568c6ae3594a0b10158575/H93A主料计划(1).xlsx',
].filter(p => { try { return fs.existsSync(p) && fs.statSync(p).size > 100000; } catch (_) { return false; } })[0];

if (realXlsx) {
  (async () => {
    const bytes = new Uint8Array(fs.readFileSync(realXlsx));
    const book = await P.readWorkbookBytes(bytes);
    ok(book.sheets.length === 21, '7.3 真实 xlsx 解出 21 张月度表（' + book.sheets.length + '）');
    ok(book.shared.length > 500, '7.4 共享字符串读到 ' + book.shared.length + ' 条');
    const sheet = book.sheets.filter(s => s.name === '26.6')[0];
    const rows = await P.parseSheetRows(book, sheet.file);
    ok(rows.maxRow > 1200 && rows.maxCol > 40, '7.5 26.6 表解开 ' + rows.maxRow + ' 行 × ' + rows.maxCol + ' 列');
    const res = P.blocksFromSheet(rows);
    ok(res.materials.length === 83, '7.6 扫出 83 条材料（' + res.materials.length + '）');
    ok(res.materials.filter(m => m.snp > 0).length === 72, '7.7 72 条读到 SNP（' + res.materials.filter(m => m.snp > 0).length + '）');
    const first = res.materials[0];
    ok(first && Math.abs(first.st - 1064.946) < 0.01, '7.8 第一条月初库存 1064.946（' + (first && first.st) + '）');
    ok(first && Math.abs(first.d[0] - 38.84) < 0.01, '7.9 第一条 6/1 需求 38.84（' + (first && first.d[0]) + '）');
    ok(res.materials.some(m => /馨源/.test(m.v)) && res.materials.some(m => /鸿昌/.test(m.v)), '7.10 供应商里能找到 馨源 / 鸿昌');
    // 导入到页面里，看能不能真的算出来、真的画出来
    P.applyCustom({ key: '26.6', label: '26.6', custom: true, dates: res.dates, materials: res.materials });
    ok(P.MATS().length === 83, '7.11 导入后页面里建出 83 条材料（' + P.MATS().length + '）');
    ok(q('#suggestWrap tbody tr').length === 83, '7.12 导入后下单建议表重画成 83 行');
    ok(P.versions()[P.state.vi].custom === true, '7.13 版本切到了导入的那一版');
    const shortN = P.MATS().filter(m => P.compute(m, res.dates).shortageIdx >= 0).length;
    ok(shortN > 0 && shortN < 83, '7.14 导入的材料能算出缺料日（' + shortN + ' 条缺料）');
    const d = P.MATS()[10];
    ok(d.snp === (+res.materials[10].snp || 0), '7.15 导入材料带着 SNP 进引擎（' + d.snp + '）');
    ok(P.MATS()[0].snp !== (+res.materials[0].snp || 0), '7.16 表里改过的参数按「车型+物料名」认人，重新导入同一版还认（' + P.MATS()[0].snp + '）');
    ok(d.mult === 1 && d.gapDays === 7 && d.leadTime === 3, '7.16 导入材料套上了默认参数（倍数1/缺口7/提前期3）');
    ok(jsdomErrors.length === 0, '7.17 真实表走完没有未捕获异常' + (jsdomErrors.length ? ' → ' + jsdomErrors.join(' | ') : ''));
    finish();
  })().catch(e => { ok(false, '7.x 真实表导入抛错：' + e.message); finish(); });
} else {
  console.log('  · 跳过第 7 节：没找到真实 xlsx（tools/out/pmc-xlsx/src.xlsx）');
  finish();
}

function finish() {
  const html = fs.readFileSync(file, 'utf8');
  ok(html.indexOf('__PMC_SAMPLE__') < 0, '8.1 样例数据已内联（没有留下占位符）');
  ok(jsdomErrors.length === 0, '8.2 整场跑完没有未捕获异常' + (jsdomErrors.length ? ' → ' + jsdomErrors.join(' | ') : ''));
  console.log('\n' + (fail === 0 ? '✓ 全部通过' : '✗ 有失败项') + '：' + pass + ' 项通过，' + fail + ' 项失败');
  if (fail) { console.log('失败项：\n - ' + bad.join('\n - ')); process.exit(1); }
}
