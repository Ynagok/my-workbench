// 校验：提取 <script> 内容做语法检查 + 关键结构自检
import fs from 'node:fs';

const file = process.argv[2] || 'public/index.html';
if (!fs.existsSync(file)) { console.error('✗ 找不到 ' + file + '（请在仓库根目录运行 npm run verify）'); process.exit(2); }
const s = fs.readFileSync(file, 'utf8');
let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

// ---- 1. 提取内联脚本 ----
const scripts = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok(scripts.length === 1, `内联 <script> 数量 = ${scripts.length}`);
const js = scripts[0];
fs.writeFileSync('tools/_extracted.js', js, 'utf8');
console.log(`  换行符: ${s.includes('\r\n') ? 'CRLF' : 'LF'}；提取脚本 ${js.split('\n').length} 行 -> tools/_extracted.js`);

// ---- 3. 结构自检 ----
ok(/const API_BASE = 'api\/data\/';/.test(s), 'API_BASE 相对路径');
ok(!/SERVER_URL/.test(s), 'SERVER_URL 已彻底移除');
ok(/const __reCache = new Map\(\)/.test(s) && /getCachedRegExp/.test(s), '正则缓存已注入');
ok(/function resetDebug\(text = ''\)/.test(s), 'resetDebug 已注入');
ok(!/debugConsole\.textContent = ['"`]/.test(s), 'debugConsole 直接赋值已全部改为 resetDebug');
ok(/const __saveChain = new Map\(\)/.test(s), 'saveData 串行队列');
ok(/if \(!resp\.ok\) throw new Error/.test(s), 'saveData 检查 resp.ok');
ok(/applyState\(null\)/.test(s) && /function applyState\(bundle\)/.test(s), 'applyState 已注入并在启动时调用');
ok(/cloneDefault\(DAILY_DEFAULT_DATA\)/.test(s), '默认值深拷贝');
ok(/bootstrapData/.test(s), '后台加载数据');
ok(!/await Promise\.all\(\[\s*\n\s*loadData\('dailyData', DAILY_DEFAULT_DATA\)/.test(s), '启动时不再 await 网络');
ok(/if \(pixelCanvas\) \{ try \{/.test(s), 'pixel 模块 try 包裹');
ok(/if \(fryCanvas\) \{ try \{/.test(s), 'fry 模块 try 包裹');
ok(/reportFatal/.test(s), 'reportFatal 兜底');
ok(/fryStartLoop|fryStopLoop/.test(s), 'fry rAF 可暂停');
ok(/fryOut = c\.createImageData/.test(s), 'fryBake 复用 ImageData');
ok(/plateFoods\.length >= 30/.test(s), '落盘数量上限');
ok(/debouncedSaveDaily\(\);/.test(s) && !/custom-value[\s\S]{0,200}?saveData\('dailyData'/.test(s), '自定义项已改防抖');
ok(/searchInput\.onkeydown/.test(s), 'keypress -> keydown');
ok((s.match(/role="dialog"/g) || []).length === 8, '模态框 aria 数量 = 8');
ok((s.match(/defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/sortablejs@1\.15\.6/g) || []).length === 1, 'Sortable 锁版本 + defer');
ok(!/@import url\('https:\/\/fonts\.googleapis/.test(s), '@import 字体已移除');
ok((s.match(/#sub-panel-fry #fryLemonBtn,\r?\n\s*#sub-panel-fry #fryLettuceBtn \{/g) || []).length === 1, 'fry 按钮 CSS 重复块已去重');
ok(!/function cleanText|resolveActivityType/.test(s), '死代码已删除');
ok(/<option value="活动奖励">/.test(s) && /resourceType === '活动奖励'/.test(s), '资源类型「活动奖励（集合）」已注入');
ok(/176: "幻狐2星锦囊"/.test(s) && /rawStar === 35\) starLabel = "幻狐5星"/.test(s), '集卡分析已识别幻狐（卡包 176-179 / 星级码 32-35）');
ok(/"253": "联动分享活动-首次赠送"/.test(s) && /"257": "打怪棋盘-消耗步数"/.test(s), '来源/物品映射已补 253–257');
ok((s.match(/"25[3-7]":\s*"/g) || []).length === 5, '253–257 只在来源映射里各一份（物品名表里 5 条非物品 id 已清掉）');
{
  const actBlk = (s.match(/const DEFAULT_ACTIVITY_TYPE_MAP = \{[\s\S]*?\r?\n\s*\};/) || [''])[0];
  ok(/"75": "95打怪棋盘"/.test(actBlk), '活动类型映射已补 75（95打怪棋盘）');
  ok((actBlk.match(/"\d+":/g) || []).length === 39, `活动类型映射键数 = ${(actBlk.match(/"\d+":/g) || []).length}（应为 39）`);
}
{
  // 2026-10 按 GM 玩家页核对：活动类型 39 条逐条一致、来源 256 条（页面本就缺 52）一致、
  // 卡包 151–179 名称一致（173–179 沿用「霞光/幻狐 N 星锦囊」手写风格，见已定语义 3），
  // 物品名表补了页面有、代码缺的 96 条（新活动道具 / 桃花酿酒具 / 一周年·烟桃换装 / 枫染与永安家具尾部）。
  const itemBlk = (s.match(/const DEFAULT_ITEM_NAME_MAP = \{[\s\S]*?\r?\n\s*\};/) || [''])[0];
  const itemN = (itemBlk.match(/"\d+":\s*"/g) || []).length;
  ok(itemN >= 1710, `物品名映射 ${itemN} 条（2026-10 整页对账后应 ≥ 1710）`);
  ok(/^\s*"34905": "中秋月饼·五",$/m.test(itemBlk)
    && /^\s*"40708": "桃花大酒坛",$/m.test(itemBlk)
    && /^\s*"60712": "活动棋盘五星霞光百戏锦囊",$/m.test(itemBlk)
    && /^\s*"61009": "霞光百戏票券叁",$/m.test(itemBlk),
    '新活动道具 / 桃花酿酒具 / 霞光票券 已补进物品名表');
  ok(/^\s*"4100037": "烟桃·浅绯裙",$/m.test(itemBlk) && /^\s*"6101004": "清宁小楼",?$/m.test(itemBlk)
    && /^\s*"6006136": "星月锦盒",$/m.test(itemBlk) && /^\s*"6013004": "枫染·雪顶",$/m.test(itemBlk),
    '换装尾巴（一周年/烟桃）、房型、家具尾部（百味套 / 枫染·雪顶）已补进物品名表');
  const pkg = fs.readFileSync('package.json', 'utf8');
  ok(fs.existsSync('tools/extract-maps.mjs') && fs.existsSync('tools/audit-maps.mjs')
    && /"extract:maps": "node tools\/extract-maps\.mjs"/.test(pkg)
    && /"audit:maps": "node tools\/audit-maps\.mjs"/.test(pkg),
    '映射对账工具：extract:maps（快照 → 精简表）+ audit:maps（精简表 vs 硬编码常量）');
}


// ---- 3b. 客服生涯 ----
ok(/data-tab="career"/.test(s) && /id="tab-career"/.test(s), '客服生涯标签页已注入');
{
  const hiddenBlk = (s.match(/const CAREER_HIDDEN_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ovBlk = (s.match(/const CAREER_OVERSEAS_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ticketBlk = (s.match(/const DAILY_TICKET_FIELDS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ovDailyBlk = (s.match(/const DAILY_OVERSEAS_FIELDS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const numKeys = (blk) => [...blk.matchAll(/\{ key: '([a-zA-Z0-9_]+)', label: '[^']*', type: 'number'[^{}]*\}/g)].map(m => m[1]);
  const ticketFields = numKeys(ticketBlk);
  const ovFields = numKeys(ovDailyBlk);

  // 工单侧 = 工单日报的全部数值字段（除姓名/班次），由 DAILY_TICKET_FIELDS 自动生成，不排除任何字段
  ok(/const CAREER_TICKET_ITEMS = DAILY_TICKET_FIELDS[\s\S]{0,260}?\.filter\(f => f\.type === 'number' && !CAREER_TICKET_EXCLUDE_PREFIX\.some/.test(s),
    '工单侧统计项由「工单日报」字段自动生成（加日报字段就会自动进统计，不会漏）');
  ok(/const CAREER_TICKET_EXCLUDE_PREFIX = \[\]/.test(s),
    '工单侧不排除任何字段（用户清单：SSO工单…⑦异世界勇者 全要）');
  const genTicket = ticketFields.slice();
  ok(ticketFields.length === 29 && genTicket.length === 29, `工单侧 = 工单日报全部 ${genTicket.length} 个数值字段`);
  ok(genTicket.indexOf('g1_wx') !== -1 && genTicket.indexOf('g7_wx') !== -1 && genTicket.indexOf('g6_wx') !== -1,
    '①②⑤⑦ 都在工单侧（按用户清单）');
  // 两处的「异世界」是不同数据：工单侧 ⑦ = 各平台工单来访；海外侧 = 群维系来访（读海外日报自己的字段）
  ok(/key: 'sj_group', label: '异世界群维系', side: 'overseas'[\s\S]{0,80}?from: \['overseas\.sj_group'\]/.test(ovBlk),
    '海外侧的异世界群维系读「海外日报」的 sj_group 字段（群维系来访），不读工单日报的 ⑦');
  ok(ovBlk.indexOf("'ticket.g7_") === -1, '海外侧不读 ticket.g7_*（那是各平台的工单来访，属工单侧）');
  ok(/key: 'sj_group', label: '异世界群维系', type: 'number'/.test(ovDailyBlk),
    '海外日报表单新增「异世界群维系」字段');
  ok(/异世界群维系：\$\{d\.sj_group/.test(s), '海外日报正文已加「异世界群维系」行');
  // 海外日报的数值字段必须被海外侧项一一覆盖（SDk / 邮箱 三项明细也算覆盖）
  const sdkBlk = (s.match(/const CAREER_SDK_BREAKDOWN = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const emailBlk = (s.match(/const CAREER_EMAIL_BREAKDOWN = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ovCovered = new Set();
  for (const m of (ovBlk + sdkBlk + emailBlk).matchAll(/'overseas\.([a-zA-Z0-9_]+)'/g)) ovCovered.add(m[1]);
  const ovMissed = ovFields.filter(k => !ovCovered.has(k));
  ok(ovFields.length === 16 && !ovMissed.length,
    `海外侧覆盖海外日报全部 ${ovFields.length} 个数值字段（含 SDk 三项 + 梦幻/月光两个 FB + 梦幻/爱江山/月光三个邮箱）` + (ovMissed.length ? '，漏：' + ovMissed.join('/') : ''));
  const ovN = (ovBlk.match(/side: 'overseas'/g) || []).length;
  ok(ovN === 11, `海外侧 = ${ovN} 项（含异世界群维系 + （梦幻/繁花/乐缤纷）群维系 + 梦幻/月光两个 FB）`);
  ok(/const CAREER_ITEMS = CAREER_TICKET_ITEMS\.concat\(CAREER_OVERSEAS_ITEMS\)/.test(s),
    '合计 29 + 11 = 40 项计入统计');
  ok(/key: 'mhl_group', label: '（梦幻\/繁花\/乐缤纷）群维系', side: 'overseas'/.test(ovBlk),
    '海外侧含异世界群维系与（梦幻/繁花/乐缤纷）群维系（都来自海外日报的手填字段）');
  // 海外日报新增的 3 个字段 → 海外侧 3 个统计项
  ok(/key: 'cp_ticket', label: '海外CP后台工单'/.test(s) && /key: 'cn_ticket', label: '国内工单'/.test(s)
    && /key: 'mhl_group', label: '（梦幻\/繁花\/乐缤纷）群维系'/.test(s),
    '海外日报表单新增 3 个字段（海外CP后台工单 / 国内工单 / （梦幻/繁花/乐缤纷）群维系）');
  ok(/from: \['overseas\.cp_ticket'\]/.test(ovBlk) && /from: \['overseas\.cn_ticket'\]/.test(ovBlk)
    && /from: \['overseas\.mhl_group'\]/.test(ovBlk),
    '这 3 个字段已接到海外侧统计（海外CP后台工单不再是「需补录」）');
  ok(/海外CP后台工单：\$\{d\.cp_ticket/.test(s) && /国内工单：\$\{d\.cn_ticket/.test(s)
    && /（梦幻\/繁花\/乐缤纷）群维系：\$\{d\.mhl_group/.test(s),
    '海外日报正文已同步加这 3 行');
  ok(!/group_ajs/.test(s), '旧标签「（爱江山/繁花/乐缤纷）群维系」已彻底改掉');
  // 登记表里的列名跟本系统标签不同的，导入时按别名对齐
  ok(/'（繁花\+乐缤纷\+梦幻）群维系': 'mhl_group'/.test(s) && /'SSO国内工单': 't_sso'/.test(s)
    && /CAREER_IMPORT_ALIASES\[label\]/.test(s),
    '登记表列名别名已接（群维系那列 → 海外侧群维系项；SSO国内工单 → 工单侧 SSO工单）');
  // 14 列必须都能对上（统计项 / 只存档项 / 别名）
  const aliasKeys = [...s.matchAll(/'(（[^']+）|[^':]+)': '(t_[a-z0-9_]+|mhl_group|[a-z0-9_]+)'/g)].map(m => m[1]);
  const allLabels = ovBlk + hiddenBlk + ticketBlk + aliasKeys.join('|');
  const labels = ['异世界群维系', '猫之城ios&B站评论回复', '国内动物领主VIP', '（繁花+乐缤纷+梦幻）群维系', '邮件+SDK（猫旅馆物语）',
    '海外SSO工单量（全产品）', '海外CP后台工单（全产品）', '塔防FB', '海外邮件（全产品）', '海外FB（全产品）',
    '商店回复', 'SSO国内工单', '监控禁言', '监控封号'];
  const missing = labels.filter(l => !allLabels.includes(l));
  ok(!missing.length, '14 列列名都能对上（统计项 / 只存档 / 别名）' + (missing.length ? '，缺：' + missing.join('/') : ''));
  // 只存档的 4 项：仍然可导入，但不进统计
  const hiddenKeys = hiddenBlk.match(/\{ key: '/g) || [];
  ok(hiddenKeys.length === 4, `只存档、不计入统计的项 = 4 项（当前 ${hiddenKeys.length}）`);
  ok(['catcity', 'dwlz_vip', 'catinn_sdk', 'td_fb'].every(k => hiddenBlk.includes("key: '" + k + "'")),
    '只存档的 4 项正确（猫之城/动物领主VIP/邮件+SDK/塔防FB）');
  ok(!/careerExtraFields/.test(s) && /const careerAllItems = \(\) =>/.test(s), 'extra 已移除，改为「计入统计 / 只存档」两层');
  ok(/const CAREER_SHEET_ITEMS = \[[^\]]*'mhl_group'[^\]]*'t_sso'/.test(s) && (s.match(/CAREER_SHEET_ITEMS/g) || []).length >= 3,
    '登记表 14 列口径单列（导入/对账用）');
}
// ---- 3b-2. 日报表单分组（2026-10：一组一片，找项不用满屏扫）----
{
  const tGroupsBlk = (s.match(/const DAILY_TICKET_GROUPS = \[[\s\S]*?\n\s*\];/) || [''])[0];
  const oGroupsBlk = (s.match(/const DAILY_OVERSEAS_GROUPS = \[[\s\S]*?\n\s*\];/) || [''])[0];
  const tN = (tGroupsBlk.match(/\{ id: '/g) || []).length;
  const oN = (oGroupsBlk.match(/\{ id: '/g) || []).length;
  ok(tN === 10, `工单日报分 ${tN} 组（基础 / 工单后台 / ①~⑦ / 待跟进）`);
  ok(oN === 7 && /id: 'email', title: '📮 邮箱（来访）'/.test(oGroupsBlk),
  `海外日报分 ${oN} 组（基础 / 评价来访 / 邮箱 / SDk / 工单 / 监控 / 群维系）—— 邮箱三项自己一片`);
  const tFieldsBlk = (s.match(/const DAILY_TICKET_FIELDS = \[[\s\S]*?\n\s*\];/) || [''])[0];
  const oFieldsBlk = (s.match(/const DAILY_OVERSEAS_FIELDS = \[[\s\S]*?\n\s*\];/) || [''])[0];
  const idsOf = (blk) => new Set([...blk.matchAll(/id: '([^']+)'/g)].map(m => m[1]));
  const fieldGroups = (blk) => [...blk.matchAll(/\{ key: '([a-zA-Z0-9_]+)',[^\n]*?group: '([^']+)'/g)].map(m => [m[1], m[2]]);
  const tPair = fieldGroups(tFieldsBlk);
  const oPair = fieldGroups(oFieldsBlk);
  const tAll = (tFieldsBlk.match(/\{ key: '/g) || []).length;
  const oAll = (oFieldsBlk.match(/\{ key: '/g) || []).length;
  ok(tPair.length === tAll && oPair.length === oAll,
    `每个日报字段都归了组（工单 ${tPair.length}/${tAll}，海外 ${oPair.length}/${oAll}）`);
  const tIds = idsOf(tGroupsBlk);
  const oIds = idsOf(oGroupsBlk);
  const badT = tPair.filter(([k, g]) => !tIds.has(g)).map(([k]) => k);
  const badO = oPair.filter(([k, g]) => !oIds.has(g)).map(([k]) => k);
  ok(!badT.length && !badO.length, '字段引用的分组都存在' + (badT.length || badO.length ? '，越界：' + badT.concat(badO).join('/') : ''));
  ok(/const groups = def\.groups\(\);/.test(s) && /const DAILY_TABS = \{/.test(s)
    && /<section class="daily-group" data-group=/.test(s) && /class="daily-group-grid"/.test(s),
    'renderDailyForm 按分组渲染（组 = 一片 section + 组内网格；三栏共用一张 DAILY_TABS 表）');
  ok(/data-group="misc"[\s\S]{0,900}?looseFields\.map\(fieldHtml\)/.test(s),
    '没归组的字段有兜底（misc 组照旧渲染，不会把新字段吞掉）');
  ok(/function updateDailyGroupFill\(container, tab\)/.test(s)
    && (s.match(/updateDailyGroupFill\(container, tab\);/g) || []).length >= 2,
    '每组右上「已填 n/m」：渲染后算一次 + 输入时同步刷新');
  ok(/const label = escapeHtml\(f\.label\);/.test(s)
    && (s.match(/<label>\$\{label\}<\/label>/g) || []).length === 3
    && !/f\.short/.test(s),
    '字段名照旧用原 label（不合并、不改名、不加短名）');
  ok(/\.daily-group \{/.test(s) && /\.daily-group-grid \{/.test(s) && /\.dg-fill\.is-full/.test(s)
    && !/\.daily-form \{\s*display: grid;/.test(s),
    '分组样式已注入（外层不再是 auto-fit 网格，改由每组自己排）');
}
ok(/careerArchiveToday\(\)/.test(s) && /const CAREER_KEY = 'careerData'/.test(s), '客服生涯自动归档已挂 + 存储 key');
// 客服生涯只存本机：helper 在，且不再出现 loadData/saveData(CAREER_KEY…)（那两个会读写 /api/data）
ok(/function careerLoadLocal\(\)/.test(s) && /function careerSaveLocal\(\)/.test(s)
  && !/loadData\(CAREER_KEY/.test(s) && !/saveData\(CAREER_KEY/.test(s),
  '客服生涯只读写本机 localStorage（不走服务端，各设备数据互不串）');
ok(/careerData = normalizeCareer\(careerLoadLocal\(\)\)/.test(s)
  && !/careerData = normalizeCareer\(b\.careerData\)/.test(s)
  && !/careerData: vCareer/.test(s),
  'applyState / 启动加载都不从服务端取 careerData（永远读本机）');
ok((s.match(/careerSaveLocal\(\);/g) || []).length >= 3,
  '归档 / 补录 / 删除 / 导入 都写本机（≥3 处调用）');
ok(/function careerImportJsonFile\(/.test(s) && /function careerClearLocal\(/.test(s)
  && /careerImportJsonBtn/.test(s) && /careerClearLocalBtn/.test(s) && /careerImportJsonInput/.test(s),
  '客服生涯：导入 JSON（按日期合并）+ 清空本机数据 已注入');
ok(/function careerStats\(scope\)/.test(s) && /function careerImport\(\)/.test(s) && /function careerCsvText\(\)/.test(s), '统计 / 粘贴导入 / CSV 导出 已注入');
// SDk 工单：日报表单拆三项（梦幻/爱江山/月光），日报正文与统计总量合并成一个「SDk工单」
ok(/key: 'sdk_mh', label: 'SDk工单·梦幻'/.test(s) && /key: 'sdk_ajs', label: 'SDk工单·爱江山'/.test(s)
  && /key: 'sdk_yl', label: 'SDk工单·月光'/.test(s),
  '海外日报表单：SDk工单拆成三项（梦幻 / 爱江山 / 月光）');
ok(/function careerSdkTotal\(o\)/.test(s) && /SDk工单：\$\{careerSdkTotal\(d\)\}例/.test(s)
  && /function careerEmailTotal\(o\)/.test(s) && /careerEmailTotal\(d\) \+ careerSdkTotal\(d\)/.test(s),
  '生成日报时 SDk / 邮箱 三项各自合并成一个总量（来访总计也跟着合并）');
ok(/const CAREER_SDK_BREAKDOWN = \[/.test(s) && ((s.match(/const CAREER_SDK_BREAKDOWN = \[[\s\S]*?\r?\n\s*\];/) || [''])[0].match(/side: 'overseas'/g) || []).length === 3
  && /const CAREER_EMAIL_BREAKDOWN = \[/.test(s) && ((s.match(/const CAREER_EMAIL_BREAKDOWN = \[[\s\S]*?\r?\n\s*\];/) || [''])[0].match(/side: 'overseas'/g) || []).length === 3
  && /const CAREER_BREAKDOWN = CAREER_SDK_BREAKDOWN\.concat\(CAREER_EMAIL_BREAKDOWN\);/.test(s),
  '生涯里 SDk 三项 / 邮箱三项明细都可单独查看（CAREER_SDK_BREAKDOWN + CAREER_EMAIL_BREAKDOWN 各 3 项）');
ok(/const careerAllItems = \(\) => CAREER_ITEMS\.concat\(CAREER_BREAKDOWN\)\.concat\(CAREER_HIDDEN_ITEMS\)/.test(s)
  && /const careerSum = \(items\) => CAREER_ITEMS\.reduce/.test(s)
  && /const careerEditableItems = \(\) => CAREER_ITEMS\.concat\(CAREER_BREAKDOWN\)/.test(s),
  'SDk / 邮箱 明细只做展示（careerAllItems 里，但不进 CAREER_ITEMS → 合计不重复计）');
// 身份筛选：全部 / 工单 / 海外（整页统计只算选中那一侧）
ok(/id="careerScopeBar"/.test(s) && /data-scope="overseas"/.test(s) && /function careerSetScope\(scope\)/.test(s)
  && /function careerSideTotal\(rec, scope\)/.test(s) && /careerStats\(scope\)/.test(s),
  '身份筛选已注入（全部 / 工单 / 海外 驱动整页统计）');
ok(/id="careerCardTicket"/.test(s) && /id="careerCardOverseas"/.test(s) && /id="careerCardOnline"/.test(s)
  && /const card = document\.getElementById\('careerCard' \+ sd\.key\.charAt\(0\)\.toUpperCase\(\) \+ sd\.key\.slice\(1\)\);/
  && /if \(card\) card\.style\.display = \(!scoped \|\| scope === sd\.key\) \? '' : 'none';/.test(s),
  '选某一侧时另一侧统计卡隐藏（三侧统一走 CAREER_SIDES 循环）');
// 指标详情：选范围（某一侧 / 某一项）+ 按日·按月 + 总量 / 平均值
ok(/function careerDetailValue\(rec, sel\)/.test(s) && /function renderCareerDetail\(\)/.test(s)
  && /id="careerDetailItem"/.test(s) && /id="careerDetailGrain"/.test(s) && /id="careerDetailSummary"/.test(s),
  '指标详情面板已注入（选某一侧或某一项，按日/按月看总量与平均值）');
// ---- 3b-3. 在线客服日报（第三栏）+ 生涯在线客服侧（2026-10 用户）----
ok(/const DAILY_ONLINE_FIELDS = \[/.test(s) && /'53会话量'/.test(s) && /'支付宝在线'/.test(s)
  && /'邀评数'/.test(s) && /'评价数'/.test(s) && /'好评数'/.test(s) && /'差评数'/.test(s)
  && /'特殊问题'/.test(s) && /'差评分析'/.test(s)
  && /id="dailyTabOnline"/.test(s) && /id="dailyFormOnline"/.test(s)
  && /const DAILY_TABS = \{/.test(s) && /const DAILY_TAB_KEYS = \['ticket', 'overseas', 'online'\];/.test(s),
  '在线客服日报：按用户给的模板建了第三栏（53会话量 / 支付宝在线 / 邀评 / 评价 / 好评 / 差评 / 特殊问题 / 差评分析），三栏共用 DAILY_TABS');
ok(/text \+= `\$\{date\.month\}月\$\{date\.day\}日工作日报（\$\{shift\}班）：\\n`;/.test(s)
  && /text \+= `53会话量：\$\{d\.kf53_session \|\| 0\}\\n`;/.test(s)
  && /text \+= `差评分析：\$\{d\.bad_analysis \|\| ''\}\\n`;/.test(s),
  '在线客服日报正文就是用户给的模板（抬头带班次 + 客服 + 8 行「标签：值」）');
ok(/const careerOnlineKind = \(key\) =>/.test(s) && /const CAREER_ONLINE_ITEMS = DAILY_ONLINE_FIELDS/.test(s)
  && /\.filter\(f => f\.type === 'number'\)/.test(s)
  && /from: \['online\.' \+ f\.key\]/.test(s)
  && /CAREER_TICKET_ITEMS\.concat\(CAREER_OVERSEAS_ITEMS\)\.concat\(CAREER_ONLINE_ITEMS\)/.test(s)
  && /\{ key: 'online', label: '在线客服', icon: '💬' \}/.test(s)
  && /data-scope="online"/.test(s) && /id="careerSideOnline"/.test(s),
  '生涯多了「在线客服」侧：统计项从日报字段自动生成（6 项数值），并进 CAREER_ITEMS / 身份筛选 / 统计卡');
ok(/function careerItemsFromDaily\(t, o, n\)/.test(s) && /const src = tab === 'ticket' \? tt : \(tab === 'online' \? nn : oo\);/.test(s)
  && /const CAREER_ONLINE_LABEL_TO_KEY = \(function \(\) \{/.test(s)
  && /hasOnline: false, t: \{\}, o: \{\}, n: \{\}/.test(s)
  && /if \(r\.hasOnline\) for \(const it of CAREER_ONLINE_ITEMS\) delete items\[it\.key\];/.test(s),
  '在线客服的数能折算进生涯、也能从「在线客服日报文本」粘贴导入（hasOnline 只清自己那一侧）');
// ---- 3b-4. 排班日历识别（自动匹配日报 / 生涯的班次）----
ok(s.includes('class="ic"') && /\.ic \{[\s\S]{0,200}stroke: currentColor/.test(s)
  && ['careerArchiveBtn', 'careerRestBtn', 'careerExportCsvBtn', 'careerExportJsonBtn', 'careerImportJsonBtn', 'careerClearLocalBtn']
    .every(id => new RegExp('id="' + id + '"[^>]*><svg class="ic"').test(s)),
  '客服生涯工具条 6 个按钮换成内联 SVG 线性图标（.ic：15px、stroke=currentColor、粗细统一），不再堆 emoji');
ok(/const CAREER_REST_MODE_KEY = 'careerRestMode';/.test(s) && /function careerRestModeSet\(mode\)/.test(s)
  && /id="careerRestModeBar"/.test(s) && /id="careerRestModeRest"/.test(s) && /id="careerRestModeShift"/.test(s)
  && /careerRestModeState === 'shift'/.test(s),
  '「点日期」可以切两种模式：标休息（默认）/ 改班次（.rest-mode 两个按钮，模式只存本机）');
ok(/function careerShiftEditOpen\(date\)/.test(s) && /function careerShiftEditPick\(code\)/.test(s)
  && /function careerShiftEditClose\(\)/.test(s)
  && /id="careerShiftEditBox"/.test(s) && /id="careerShiftEditCodes"/.test(s)
  && /id="careerShiftEditClear"/.test(s) && /id="careerShiftEditClose"/.test(s)
  && /CAREER_SHIFT_CODES\.map\(code =>/.test(s) && /data-code="' \+ code \+ '"/.test(s)
  && /if \(c\) map\[date\] = c; else delete map\[date\];/.test(s)
  && /if \(c === 'O'\) restList\.push\(date\);/.test(s),
  '日历上手改班次：点日期弹面板（11 个班次 + 不排班）、挑完写进本机并按卡片自己的模式重画；挑 O 顺带标休息');
ok(!/careerParseShiftText|careerApplyShift|careerOcrNormalize|careerShiftParseApply|careerShiftDefs|careerShiftDefText|careerShiftStats/.test(s)
  && !/id="careerShiftInput"/.test(s) && !/id="careerShiftParseBtn"/.test(s) && !/id="careerShiftLegend"/.test(s)
  && !/识别排班/.test(s) && !/shift-import/.test(s)
  && s.includes('const CAREER_SHIFT_KEY = \'careerShiftDays\';')
  && /function careerShiftOfDate\(date\)/.test(s) && /function careerShiftCount\(ym\)/.test(s),
  '「粘排班日历 / 截图识别」那一整块已按用户要求删掉（没有 careerParseShiftText / 粘贴框 / 图例），班次只剩日历上手改，仍然只存本机 careerShiftDays');
ok(/val = \(f\.key === 'shift' \? careerShiftOfDate\(careerToday\(\)\) : ''\) \|\| f\.default/.test(s)
  && /const shift = d\.shift \|\| careerShiftOfDate\(careerToday\(\)\) \|\| '';/.test(s)
  && /const shift = String\(t\.shift \|\| o\.shift \|\| n\.shift \|\| ''\)\.trim\(\) \|\| careerShiftOfDate\(careerToday\(\)\);/.test(s),
  '班次自动匹配：日报表单按当天排班带出、在线客服日报抬头用排班、归档进生涯时也补上班次');
ok(/const shift = String\(shiftMap\[date\] \|\| ''\)\.trim\(\);/.test(s) && /class="career-rest-day'/.test(s)
  && /has-shift/.test(s) && /data-shift="' \+ escapeHtml\(shift\) \+ '"/.test(s),
  '排班日历上每一天都标出排好的班次（格子里的 data-shift + has-shift 样式）');
// 「日历 → 日报」这一步留着（用户：「日历同步到日报的功能还是要的」）
ok(/id="careerShiftTodayBtn"/.test(s) && /setClick\('careerShiftTodayBtn', \(\) => \{/.test(s)
  && /dailyData\.ticket\.shift = code;/.test(s) && /dailyData\.overseas\.shift = code;/.test(s)
  && /dailyData\.online\.shift = code;/.test(s)
  && /DAILY_TAB_KEYS\.forEach\(k => renderDailyForm\(k\)\);/.test(s)
  && /还没排班：先在「点日期：改班次」模式下点今天挑一个班次/.test(s),
  '排班卡上的「同步到日报」还在：把今天的班次写进日报三栏的「班次」并重画表单；今天没排班时给提示不瞎写');
// 补录 / 粘贴导入：默认收起，点标题才展开
ok(/id="careerEditToggleBtn"/.test(s) && /id="careerEditBody"/.test(s)
  && /id="careerImportToggleBtn"/.test(s) && /id="careerImportBody"/.test(s)
  && /bindCollapse\('careerEditToggleBtn', 'careerEditBody'\)/.test(s)
  && /bindCollapse\('careerImportToggleBtn', 'careerImportBody'\)/.test(s)
  && /id="careerEditBody" style="display: none;"/.test(s) && /id="careerImportBody" style="display: none;"/.test(s),
  '补录 / 粘贴导入已改成「点击展开」（默认收起）');
// 周维度 / 来源结构 / 异常日 & 峰值标注（2026-09 加的运营口径）
ok(/const weekStartOf = \(d\) =>/.test(s) && /weeks, anomalies, peaks/.test(s) && /环比上周/.test(s) && /同比（4 周前）/.test(s)
  && /id="careerWeeklyTable"/.test(s),
  '周维度：按周（周一为一周第一天）汇总，含周环比与「4 周前」同比代理');
ok(/id="careerStructureBox"/.test(s) && /const CAREER_KIND_COLORS = \[/.test(s) && /Top3 集中度：/.test(s),
  '来源结构：各来源大类占比条 + Top3 单项集中度');
ok(/const anomalyLine = days > 1 && sd > 0 \? avg \+ 2 \* sd : null;/.test(s)
  && /const PEAK_RE = \/活动\|版本\|开服\|更新\|维护\|上线\|联动\|新服\/;/.test(s)
  && /const an = s\.anomalyDates\[r\.date\], pk = s\.peakDates\[r\.date\];/.test(s)
  && /const cls = an \? ' class="anomaly"' : \(pk \? ' class="peak"' : ''\);/.test(s),
  '异常日（μ+2σ）与活动/版本峰值标注都已接进趋势条与说明块');
// ---- 3c. 柔和白主题（浅色 · 明日方舟 / 终末地 视觉语言）----
ok(/--bg-0: #eef1f4;/.test(s) && /--surface: #fbfcfd;/.test(s) && /--ink-0: #1b2228;/.test(s)
  && /--accent: #c89500;/.test(s),
  '柔和白令牌已生效（冷灰白底 + 压深一档的方舟黄 + 深色文字）');
ok(/:root \{[\s\S]{0,1400}?--bg-0: #eef1f4;/.test(s) && !/:root \{[\s\S]{0,1400}?--bg-0: #090b0d;/.test(s)
  && !/:root \{[\s\S]{0,1400}?--accent: #ffd60a;/.test(s),
  ':root 里只有浅色令牌（暗色那套已经不在 :root，只在用户选深色背景时由 JS 挂上）');
ok(/color-scheme: light;/.test(s) && /html\[data-theme="dark"\] \{[\s\S]{0,40}color-scheme: dark;/.test(s)
  && /--clip-card: none;/.test(s) && /--clip-btn: none;/.test(s) && /--hazard: repeating-linear-gradient/.test(s)
  && /\.career-kpi::after/.test(s) && /浅色收口层 · 柔和白/.test(s),
  '浅色基底：原生控件浅色（深色底时切暗色）+ 卡片不再切角（改成大圆角）+ 警示条纹 + KPI 角落刻度 + 浅色收口层');
ok(!/rgba\(255,255,255,0\.0[0-9]\)/.test(s.slice(s.indexOf('浅色收口层'), s.indexOf('自定义背景色的「暗色收口」'))),
  '浅色收口层里不再残留「白底上的白色 hover / 白线」（白线只允许出现在 data-theme=dark 的暗色收口里）');
ok(/counter\(career-card, decimal-leading-zero\)/.test(s) && /counter\(nav-item, decimal-leading-zero\)/.test(s),
  '编号体系：侧边栏 01… + 客服生涯分节 01…（报表感）');
ok(/id="careerReportSub"/.test(s) && /id="careerReportMeta"/.test(s) && /getElementById\('careerReportMeta'\)/.test(s)
  && /WORKLOAD REPORT \/ 工作量统计报表/.test(s),
  '客服生涯报表抬头（英文 kicker + 标题 + 数据范围 + 右上元数据格）已注入并在渲染时填充');
// ---- 3c-2. 圆润层（大圆角 / 间距收紧 / iOS 开关）----
ok(s.includes('--r-sm: 6px;') && s.includes('--r-md: 10px;')
  && s.includes('--r-lg: 14px;') && s.includes('--r-pill: 999px;')
  && s.includes('圆润层（2026-10 用户：整体圆润一点 / 上下间距别太大 / 开关参考 iOS）'),
  '圆角令牌换成大圆角（6 / 10 / 14 / 999），并单独一层「圆润层」把各层写死的直角盖回来');
ok(s.includes('.tab-content { padding: 16px 22px 10px; max-height: 94vh; }')
  && s.includes('body { padding: 10px 14px 8px; }')
  && s.includes('.card { margin-top: 12px; }')
  && s.includes('.career-report-head { padding-bottom: 10px; margin-bottom: 10px; gap: 12px; }')
  && s.includes('.seg-bar { margin: 0 0 10px; }'),
  '上下间距瘦身：功能页 padding、卡片间距、报表抬头、分段条都收了一层');
ok(s.includes('.sw .sw-track') && s.includes('.sw[aria-pressed="true"] .sw-track { background: var(--accent); }')
  && s.includes('translateX(18px)')
  && /id="fbBulkBtn" class="sw" role="switch" aria-pressed="false"/.test(s)
  && s.includes('id="fbBulkLabel"')
  && s.includes('.fb-all input:checked + .sw-track'),
  '开关改成 iOS 那种滑钮：顶不住鸟是 .sw + aria-pressed 的 switch，「全选」是 checkbox + .sw-track（含半勾）');
ok(s.includes('⑤ 顶不住鸟 · 卡片模式') && s.includes('顶不住鸟：关')
  && /label\.textContent = fbBulkOn \? '顶不住鸟：开' : '顶不住鸟：关';/.test(s)
  && !/巨多：开|巨多：关/.test(s),
  '卡片模式那一块在界面上叫「顶不住鸟」（内部仍是 fbBulk / fbBulkOn，题头与开关文案都是新名字）');

// ---- 3d. 海外业务统计（岗位周报整表粘贴）----
ok(/data-tab="overseas"/.test(s) && /id="tab-overseas"/.test(s) && /海外业务统计/.test(s),
  '「海外业务统计」标签页已注入（侧边栏 + 页面）');
{
  const ovbizBlk = (s.match(/const OVBIZ_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  ok(/const OVBIZ_KEY = 'overseasBizData';/.test(s) && (ovbizBlk.match(/\{ key: '/g) || []).length === 10,
    '海外业务：10 个统计项已定义（异世界群维系…监控封号，已删「邮件+SDK（猫旅馆物语）」）');
  ok(!/邮件\+SDK（猫旅馆物语）/.test(ovbizBlk) && !/catinn_sdk/.test(ovbizBlk),
    '海外业务：统计项里不含「邮件+SDK（猫旅馆物语）」');
}
ok(/function ovbizSplitLine\(line\)/.test(s) && /indexOf\('\\t'\) !== -1/.test(s) && /careerParseDate\(raw\)/.test(s)
  && /'22'\] = '@date'/.test(s),
  '海外业务：解析支持 CSV / TSV、日期 2026/1/1 与 Excel 序列号，并认得周报表头第一格的「22」');
ok(/function ovbizSaveCache\(\)/.test(s) && !/ovbizPushServer/.test(s) && !/saveData\(OVBIZ_KEY/.test(s)
  && !/fetchWithTimeout\(API_BASE \+ encodeURIComponent\(OVBIZ_KEY\)\)/.test(s)
  && !/ovbizSyncFromServer|ovbizManualSync|ovbizRowSig|ovbizMergeData/.test(s),
  '海外业务：只存本机 —— 已彻底去掉服务端同步（没有 saveData / GET / 并集合并那一套）');
ok(/function ovbizEnsureLoaded\(\)/.test(s) && /ovbizEnsureLoaded\(\);/.test(s) && /let ovbizLoaded = false;/.test(s),
  '海外业务：本机数据懒加载（避开 applyState 早于 const 初始化的 TDZ 坑）');
ok(/function ovbizStats\(\)/.test(s) && /d\.total \+= r\.total;/.test(s) && /function ovbizWeekStart\(d\)/.test(s)
  && /anomalyLine = n > 1 && sd > 0/.test(s),
  '海外业务：统计按天合计（同日多人）+ 周维度 + μ+2σ 异常线');
ok(['ovbizKpi', 'ovbizItemTable', 'ovbizMonthlyTable', 'ovbizWeeklyTable', 'ovbizPeopleTable', 'ovbizDailyTable', 'ovbizAnomalyBox', 'ovbizReportMeta', 'ovbizSyncHint',
  'ovbizTrend', 'ovbizDetailItem', 'ovbizDetailGrain', 'ovbizDetailSummary', 'ovbizDetailChart', 'ovbizDetailTable']
  .every(id => s.includes('id="' + id + '"')),
  '海外业务：总览 / 逐项 / 月度 / 周 / 按人员 / 每日明细 / 异常 / 报表抬头 / 本机状态行 + 走势条 + 详情图表容器齐全');
ok(/function ovbizDetailOptions\(\)/.test(s) && /function renderOvbizDetail\(\)/.test(s)
  && /function ovbizDetailValue\(day, sel\)/.test(s)
  && /careerKpiCard\('总量', careerNum\(total\), scopeName, true\)/.test(s)
  && /const bars = grain === 'day' \? periods\.slice\(-90\) : periods;/.test(s),
  '海外业务：详情图表（范围 × 按日/按月 → 汇总卡 + 柱子 + 逐期表）已实现');
ok(/const OVBIZ_PEAK_RE = \/活动\|版本\|开服\|更新\|维护\|上线\|联动\|新服\//.test(s)
  && /const cls = \(s\.anomalyLine && d\.total > s\.anomalyLine\) \? 'anomaly'/.test(s),
  '海外业务：走势条把异常日涂红、备注带活动字样的日子涂橙');
ok(/setClick\('ovbizImportBtn', ovbizImport\)/.test(s) && /setClick\('ovbizExportBtn'/.test(s)
  && /setClick\('ovbizClearBtn', ovbizClearAll\)/.test(s) && !/ovbizSyncBtn/.test(s)
  && /addEvent\('ovbizDetailItem', 'change', renderOvbizDetail\)/.test(s)
  && /addEvent\('ovbizDetailGrain', 'change', renderOvbizDetail\)/.test(s)
  && /this\.dataset\.tab === 'overseas'\) \{ ovbizRender\(\); renderOvbizDetail\(\); \}/.test(s)
  && /renderCareer\(\);\s*\n\s*ovbizRender\(\);/.test(s),
  '海外业务：导入 / 导出 / 清空按钮 + 详情图表的下拉刷新 + 标签页刷新、启动刷新都已挂上（同步按钮已删）');
// ---- 3e. 反馈模板（工单信息提取器）----
ok(/data-tab="feedback"/.test(s) && /id="tab-feedback"/.test(s) && /反馈模板/.test(s),
  '「反馈模板」标签页已注入（侧边栏 + 页面）');
{
  const srcBlk = (s.match(/const FB_SOURCES = \[(.*?)\];/) || ['', ''])[1];
  ok((srcBlk.match(/'/g) || []).length === 22 && /'企微'/.test(srcBlk) && /'爱江山CP后台'/.test(srcBlk)
    && /'乐缤纷CP后台'/.test(srcBlk) && /'抖音小店'/.test(srcBlk) && !/抖音在线/.test(srcBlk) && !/'电话'/.test(srcBlk),
    '反馈来源 11 个（抖音小店…繁花CP后台 / 乐缤纷CP后台 / 企微），无「电话」，旧的「抖音在线」已改名');
  const tplBlk = (s.match(/const FB_TEMPLATES = \[([\s\S]*?)\];/) || ['', ''])[1];
  ok((tplBlk.match(/\{ key: '/g) || []).length === 4 && /'menghuan'/.test(tplBlk) && /'changwu'/.test(tplBlk)
    && /'lebifen'/.test(tplBlk) && /'gongdan'/.test(tplBlk) && !/'ticket'/.test(tplBlk),
    '反馈模板 4 种（梦幻消除战 / 常规游戏 / 乐缤纷CP后台 / 内部工单）—— 工单反馈不再单独占模板，改由「来源＝工单」触发');
  const tsBlk = (s.match(/const FB_TEMPLATE_SOURCES = \{[\s\S]*?\n\s*\};/) || [''])[0];
  ok(/menghuan: \['抖音小店', '抖音后台', '53', '工单', '支付宝在线', '支付宝后台', '微信后台', '企微'\]/.test(tsBlk)
    && /lebifen: \['乐缤纷CP后台'\]/.test(tsBlk) && !/ticket/.test(tsBlk) && !/电话/.test(tsBlk)
    && /function fbAllowedSources\(\)/.test(s) && /b\.style\.display = fbAllowedSource\(b\.dataset\.fbSource\) \? '' : 'none';/.test(s),
    '每个模板的来源各不相同：梦幻消除战不要爱江山/繁花/乐缤纷CP后台，乐缤纷CP后台只留它自己，谁都不含电话');
}
ok(/【梦幻消除战问题反馈】/.test(s) && /【喜扑UID】/.test(s) && /问题：玩家反馈，麻烦看看/.test(s),
  '反馈模板正文与原工具一致（梦幻版 + 常规版两套）');
ok(/includes\('异世界勇者'\)/.test(s) && /'联盟契约'/.test(s) && /'taptap'/.test(s) && /'001'/.test(s) && /'000'/.test(s),
  '异世界勇者区服固定 001、联盟契约 / taptap 固定 000（用户给的规则）');
ok(/'乐缤纷'\s*\n?\s*\+ '\\n渠道：'/.test(s) && /\\n角色ID：/.test(s) && /fbTemplate === 'lebifen'/.test(s),
  '乐缤纷CP后台格式：乐缤纷 / 渠道： / 问题： / 角色ID： / 来源：（用户给的格式）');
ok(/function fbLebifenRows\(raw\)/.test(s) && /line\.indexOf\('\\t'\) !== -1\) return line\.split\('\\t'\)/.test(s)
  && /question: cells\[4\] \|\| ''/.test(s) && /cells\[0\] === '账号'/.test(s)
  && /rows\.map\(fbLebifenText\)\.join\('\\n\\n'\)/.test(s),
  '乐缤纷CP后台按后台表格行解析（制表符分列 / 第 5 列是问题 / 跳过表头行 / 多行拼成多段）');
ok(/const FB_LB_NOISE_RE =/.test(s) && /FB_LB_CHANNEL_RE/.test(s) && /FB_LB_ROLE_ID_RE/.test(s),
  '乐缤纷CP后台只复制少数几列时按内容认（数字账号 / 渠道关键词 / 其余那句当问题）');
ok(/if \(!fbAllowedSource\(fbSource\)\) fbSource = fbAllowedSources\(\)\[0\];/.test(s)
  && /function fbSetSource\(s\) \{[\s\S]{0,120}!fbAllowedSource\(s\)\) return;/.test(s),
  '切模板时来源跟着落到该模板允许的第一个（乐缤纷CP后台只有一个来源，所以自动切过去）+ 手点不合法的来源会被忽略');
ok(/const FB_ORDER_FIELDS = \{[\s\S]*?'工单号': 'orderId'[\s\S]*?'手机号码': 'phoneNumber'[\s\S]*?\};/.test(s),
  '内部工单字段表齐全（工单号 / 提交人 / 游戏 / 账号 / UID / 角色 / 区服 / 问题 / 联系方式）');
ok(/localStorage\.getItem\(FB_STATE_KEY\)/.test(s) && /localStorage\.setItem\(FB_STATE_KEY/.test(s)
  && !/loadData\('feedbackTplState'/.test(s) && !/saveData\('feedbackTplState'/.test(s),
  '反馈模板的模板/来源选择只存本机（不走 /api/data）');
ok(['fbTemplateGroup', 'fbSourceGroup', 'fbRawInput', 'fbOutput', 'fbHint', 'fbReportSub', 'fbReportMeta']
  .every(id => s.includes('id="' + id + '"')),
  '反馈模板：模板 / 来源选择片 + 输入 / 结果 / 提示 / 抬头 容器齐全');
ok(/setClick\('fbGenerateBtn', fbGenerate\)/.test(s) && /setClick\('fbCopyBtn', fbCopy\)/.test(s)
  && /setClick\('fbClearBtn', fbClear\)/.test(s) && /dataset\.tab === 'feedback'\) fbRenderChips\(\)/.test(s),
  '反馈模板：生成 / 复制 / 清空按钮与标签页刷新都已挂上');
// ---- 3f. 界面设置（齿轮面板：背景色 / 强调色 / 渐变） ----
ok(/id="themeGear"/.test(s) && /class="tabs-head"/.test(s) && /class="tabs-brand"/.test(s) && /id="themePanel"/.test(s)
  && /id="themeSwatches"/.test(s) && /id="accentSwatches"/.test(s) && /id="themeEffects"/.test(s)
  && /id="themeBgPicker"/.test(s) && /id="themeAccentPicker"/.test(s) && /id="themeReset"/.test(s),
  '界面设置：侧边栏抬头（站名 + 齿轮）与设置面板（背景色 / 强调色 / 渐变 / 恢复默认）已注入');
ok(!/class="theme-bar"/.test(s) && !/id="themeBar"/.test(s),
  '界面设置：旧的侧边栏底部调色条已移除（改到齿轮面板里）');
{
  const bgBlk = (s.match(/const THEME_BG_PRESETS = \[([\s\S]*?)\];/) || ['', ''])[1];
  const acBlk = (s.match(/const THEME_ACCENT_PRESETS = \[([\s\S]*?)\];/) || ['', ''])[1];
  const efBlk = (s.match(/const THEME_EFFECTS = \[([\s\S]*?)\];/) || ['', ''])[1];
  ok((bgBlk.match(/\{ color: '/g) || []).length === 8 && (acBlk.match(/\{ color: '/g) || []).length === 8
    && (efBlk.match(/\{ key: '/g) || []).length === 6 && /'mesh'/.test(efBlk) && /'vignette'/.test(efBlk),
    '界面设置：背景 8 色 + 强调 8 色 + 渐变 6 种（纯色 / 光晕 / 网格 / 斜向渐变 / 边缘压暗）');
}
ok(/function themeApplyBg\(bg\)/.test(s) && /function themeApplyAccent\(accent\)/.test(s)
  && /function themeApplyEffect\(effect\)/.test(s) && /function themeToLum\(c, target\)/.test(s),
  '界面设置：背景色 → 整套令牌、强调色 → 按亮度压深/提亮、渐变 → data-bg-effect');
// ⚠️ themeMix 曾经把 {r,g,b} 当数字用 → 算出 #aNaNaN（非法色 → CSS 整条失效 → 强调色像是被取消）。
//    这里锁死「逐通道混」的写法，别再写回 c.r + (target - c.r) * ratio。
ok(/function themeMix\(c, target, ratio\) \{[\s\S]{0,220}?c\.r \+ \(target\.r - c\.r\) \* ratio[\s\S]{0,120}?c\.g \+ \(target\.g - c\.g\) \* ratio/.test(s),
  '界面设置：themeMix 逐通道混色（不会再把 {r,g,b} 当数字算出 NaN）');
ok(/function themeClampLum\(c, lo, hi\)/.test(s) && /themeClampLum\(base, themeDark \? 0\.50 : 0\.14, themeDark \? 0\.72 : 0\.32\)/.test(s),
  '界面设置：强调色按区间钳制（区间内保持原色鲜艳，越界才往白/黑拉）');
ok(/THEME_TOKEN_KEYS\.forEach\(k => st\.removeProperty\(k\)\)/.test(s)
  && /root\.setAttribute\('data-theme', themeDark \? 'dark' : 'light'\)/.test(s)
  && /root\.setAttribute\('data-bg-effect', themeSettings\.effect\)/.test(s),
  '界面设置：按选的颜色算令牌写在 html 行内、按亮度自动切浅/暗、渐变挂属性');
ok(/html\[data-bg-effect="none"\] body/.test(s) && /html\[data-bg-effect="mesh"\] body/.test(s)
  && /html\[data-bg-effect="vignette"\] body/.test(s) && /html\[data-theme="dark"\] \.theme-effect/.test(s),
  '界面设置：6 种渐变都有 CSS（含默认那套不动），深色底同样收口');
ok(/localStorage\.getItem\(THEME_KEY\)/.test(s) && /localStorage\.setItem\(THEME_KEY/.test(s)
  && /localStorage\.removeItem\(THEME_KEY\)/.test(s) && /THEME_OLD_BG_KEY/.test(s)
  && !/loadData\('themeSettings'/.test(s) && !/saveData\('themeSettings'/.test(s),
  '界面设置：只存本机 themeSettings（并兼容迁移旧键 themeBgColor，不走 /api/data）');
ok(/themeInit\(\);/.test(s) && /setClick\('themeGear'/.test(s) && /setClick\('themePanelClose'/.test(s)
  && /setClick\('themeReset', themeReset\)/.test(s) && /themeTogglePanel\(false\)/.test(s)
  && /getElementById\('themePanel'\);\s*\n\s*if \(themed\) tabsEl\.appendChild\(themed\);/.test(s)
  && /contains\('tabs-head'\)/.test(s),
  '界面设置：启动即应用、齿轮开合（含点外面 / Esc 收起）、拖拽排序不会把它挤到中间');
// 工单侧分组：CP后台 与 ①~⑦群维系 都并进「工单/后台」
ok(/function careerTicketKind\(key\) \{[\s\S]{0,320}?if \(key === 'sso' \|\| \/_cp\$\/\.test\(key\) \|\| \/\^g\\d\/\.test\(key\)\) return '工单\/后台';/.test(s)
  && !/return 'CP后台'/.test(s) && !/return '群维系'/.test(s.slice(s.indexOf('function careerTicketKind'), s.indexOf('function careerTicketKind') + 400)),
  '工单统计：CP后台 + 群维系 已合并进「工单/后台」分组');
// 重置模板不清姓名（用户需求）：只有当旧数据里真有 name 键时才把值带过去
ok(/const keepName = \(prevTab && Object\.prototype\.hasOwnProperty\.call\(prevTab, 'name'\)\) \? prevTab\.name : undefined;/.test(s)
  && /if \(keepName !== undefined\) dailyData\[tab\]\.name = keepName;/.test(s)
  && /姓名保留/.test(s),
  '重置模板保留姓名（其余字段照旧回默认）');
// 粘贴导入要能认「工作台自己生成的日报文本」（工单日报 / 海外日报）
ok(/function careerParseReportPaste\(text\)/.test(s) && /const reports = careerParseReportPaste\(text\)/.test(s)
  && /识别为日报格式/.test(s),
  '粘贴导入会先按「日报文本」识别（工单日报 / 海外日报，可两段一起粘）');
ok(/const CAREER_TICKET_LABEL_TO_KEY = \(function \(\) \{[\s\S]{0,300}?for \(const f of DAILY_TICKET_FIELDS\)/.test(s)
  && /const CAREER_OVERSEAS_LABEL_TO_KEY = \(function \(\) \{[\s\S]{0,300}?for \(const f of DAILY_OVERSEAS_FIELDS\)/.test(s),
  '日报正文的「标签 → 字段 key」映射直接从日报字段定义推导（日报加字段不用手改）');
ok(/function careerItemsFromDaily\(t, o, n\)/.test(s) && (s.match(/careerItemsFromDaily\(/g) || []).length >= 3
  && /const src = tab === 'ticket' \? tt : \(tab === 'online' \? nn : oo\);/.test(s),
  '折算逻辑抽成 careerItemsFromDaily（工单 / 海外 / 在线客服三栏），自动归档与日报文本导入共用同一套口径');
ok(/①繁花微信【2】|\[\u2460\u2461\u2462\u2463\u2464\u2465\u2466\]/.test(s) && /支付宝后台/.test(s) && /dy在线/.test(s),
  '日报解析覆盖 ①~⑦ 组行（含 手Q / 支付宝后台 这两个写法）');
ok(/CAREER_STATUS_PENDING = '总计为空\/待确认'/.test(s), '口径注明「总计为空/待确认」不计入完整记录天数');

// ---- 3g. 下午茶投票（按天 · ⚠️ 走服务端，跟「只存本机」的那几份数据相反）----
const sv = fs.existsSync('server.js') ? fs.readFileSync('server.js', 'utf8') : '';
ok(/data-tab="tea"/.test(s) && /id="tab-tea"/.test(s) && /下午茶投票/.test(s),
  '「下午茶」标签页已注入（侧边栏 + 页面 + 报表抬头）');
ok(/const TEA_SHOPS_KEY = 'teaShops';/.test(s) && /const TEA_POLL_PREFIX = 'teaPoll_';/.test(s)
  && /const TEA_VOTE_BASE = 'api\/vote\/';/.test(s) && /function teaTodayKey\(\)/.test(s)
  && /TEA_POLL_PREFIX \+ teaTodayStr\(\)\.replace\(\/-\/g, ''\)/.test(s),
  '下午茶：服务端键名 —— 店家 teaShops、当天投票 teaPoll_YYYYMMDD、投票走 api/vote');
ok(/function teaAfter23\(\) \{ return teaBJNow\(\)\.getHours\(\) >= 23; \}/.test(s)
  && /json\.expired/.test(s) && /23:00 后清除|23:00 自动清除|23:00/.test(s),
  '下午茶：按北京时间判断当天 23:00 作废，并认服务端返回的 expired');
ok(/function teaSubmitVote\(\)/.test(s) && /TEA_VOTE_BASE \+ encodeURIComponent\(teaPollKey\)/.test(s)
  && /voterId: teaVoterId\(\)/.test(s) && /shopIds: teaPickVote/.test(s)
  && /localStorage\.setItem\(TEA_VOTER_KEY/.test(s),
  '下午茶：投票 POST /api/vote（服务端合并），带本机 voterId（一台设备一票）');
ok(/function teaResult\(\)/.test(s) && /Array\.isArray\(v\.shopIds\) && v\.shopIds\.length/.test(s)
  && /devices: list\.length/.test(s) && !/voterName/.test(s) && !/teaVoterName/.test(s),
  '下午茶：结果只按店家票数统计（没有投票人名字这回事）');
ok(/const TEA_VOTE_ONLY = \(function \(\) \{/.test(s) && /URLSearchParams\(location\.search\)\.get\('vote'\)/.test(s)
  && /setAttribute\('data-vote-only', '1'\)/.test(s)
  && /html\[data-vote-only="1"\] \.tabs \{ display: none; \}/.test(s)
  && /html\[data-vote-only="1"\] #teaShopCard/.test(s)
  && /if \(!TEA_VOTE_ONLY\) \(async function bootstrapData\(\)/.test(s)
  && /el\.classList\.toggle\('active', el\.id === 'tab-tea'\)/.test(s),
  '只投票页：?vote=… → 藏侧边栏/店家管理/发起区，只留投票页，并跳过启动的 9 个请求');
ok(/function teaShareLink\(\)/.test(s) && /'\?vote=' \+ key/.test(s)
  && /setClick\('teaCopyLinkBtn', teaCopyLink\)/.test(s) && /setClick\('teaCopyShareTextBtn', teaCopyShareText\)/.test(s),
  '下午茶：分享链接 ?vote=teaPoll_YYYYMMDD + 复制链接 / 复制分享文案');
ok(['teaShopTable', 'teaPollShopBox', 'teaPollShareInput', 'teaVoteShopBox', 'teaResultBox',
  'teaResultMeta', 'teaPollStatus', 'teaReportSub', 'teaReportMeta', 'teaShopHint', 'teaVoteHint']
  .every(id => s.includes('id="' + id + '"')),
  '下午茶：店家 / 发起 / 分享 / 投票 / 结果 容器齐全');
ok(/setClick\('teaPollStartBtn', teaStartPoll\)/.test(s) && /setClick\('teaVoteSubmitBtn', teaSubmitVote\)/.test(s)
  && /setClick\('teaPollCloseBtn', teaClosePoll\)/.test(s) && /setClick\('teaPollClearBtn', teaClearPoll\)/.test(s)
  && /setClick\('teaShopSaveBtn', teaShopSave\)/.test(s) && /dataset\.tab === 'tea'\) teaInit\(\)/.test(s),
  '下午茶：店家保存 / 发起 / 截止 / 清空 / 投票 / 刷新按钮与标签页刷新都已挂上');
ok(/app\.get\('\/api\/vote\/:key'/.test(sv) && /app\.post\('\/api\/vote\/:key'/.test(sv)
  && /function isVoteExpired\(poll\)/.test(sv) && /d\.getUTCHours\(\) >= 23/.test(sv)
  && /delete data\[key\]/.test(sv) && /poll\.votes\[voterId\] = \{/.test(sv)
  && /const VOTE_KEY_RE = \/\^teaPoll_\\d\{8\}\$\/;/.test(sv),
  '服务端：/api/vote 读写 —— 原子合并到 votes[voterId]、当天 23:00 过期连数据一起删');
ok(/type="time" id="teaPollDeadline"/.test(s) && /id="teaVoteOpenBox"/.test(s) && /id="teaVoteClosed"/.test(s)
  && /const TEA_DEADLINE_RE/.test(s) && /function teaNowHM\(\)/.test(s)
  && /function teaClosedReason\(poll\)/.test(s) && /teaNowHM\(\) >= dl/.test(s)
  && /function teaDeadlineNote\(poll\)/.test(s) && /function teaDeadlineLeftText\(poll\)/.test(s),
  '下午茶：截止时间是 type=time 的 HH:MM —— 按北京时间当前时刻判定「手动截止 / 到点截止」');
ok(/const closed = teaIsClosed\(teaPollData\)/.test(s) && /openBox\.style\.display = closed \? 'none' : ''/.test(s)
  && /closedBox\.style\.display = closed \? '' : 'none'/.test(s) && /现在只能看下面的「📊 实时结果」/.test(s)
  && /if \(teaIsClosed\(teaPollData\)\) \{/.test(s) && /只能看结果/.test(s)
  && /dl && dl <= teaNowHM\(\)/.test(s) && /deadline: dl,/.test(s),
  '下午茶：到点（或手动截止）后收起投票区、只展示结果；发起时填已过去的时间会被拦下');
ok(/const DEADLINE_RE/.test(sv) && /function beijingHM\(\)/.test(sv) && /function voteClosedReason\(poll\)/.test(sv)
  && /beijingHM\(\) >= dl/.test(sv) && /closed: !!reason/.test(sv) && /closedReason: reason/.test(sv)
  && /投票已在 ' \+ poll\.deadline \+ ' 截止/.test(sv) && /投票已过期（当天 23:00 后清除）/.test(sv),
  '服务端：到截止时间后只读 —— GET 带 closed/closedReason、POST 409，数据仍留到 23:00 才清');
ok(/<details class="card tea-shop-card" id="teaShopCard">/.test(s) && /details\.tea-shop-card > summary/.test(s)
  && /id="teaShopCount"/.test(s) && /tea-sep/.test(s)
  && !/id="teaShopNote"/.test(s) && !/teaShopNote/.test(s)
  && /teaShops\.push\(\{ id: teaNewShopId\(\), name: name\.slice\(0, 40\) \}\)/.test(s),
  '下午茶：店家管理收进折叠面板（只有店名、备注整段拿掉）—— 界面只剩「投票 / 结果」两块');
ok(/const TEA_SHOPS_CACHE_KEY = 'teaShopsCache';/.test(s) && /function teaSaveShopsCache\(\)/.test(s)
  && /function teaLoadShopsCache\(\)/.test(s) && /已用本机备份恢复/.test(s)
  && /const o = \(typeof s === 'string'\) \? \{ name: s \} : s;/.test(s),
  '下午茶：店家只存店名 + 本机另存备份，服务端那份没了就自动恢复（永不随投票一起清）');
// ---- 3g-2. 下午茶信息 → 话术（反推 GM「玩家下午茶信息」那块，游戏里叫「吉运节节高」）----
ok(/<div id="genTeaInfoPane" data-seg-card="teainfo">[\s\S]{0,200}?<div class="card" id="teaInfoCard">/.test(s)
  && /id="teaInfoInput"/.test(s) && /id="teaInfoOut"/.test(s)
  && /id="teaInfoParseBtn"/.test(s) && /id="teaInfoCopyBtn"/.test(s) && /id="teaInfoClearBtn"/.test(s)
  && /id="teaInfoSummary"/.test(s) && /id="teaLayerBox"/.test(s)
  && /setClick\('teaInfoParseBtn', teaInfoRun\)/.test(s) && /setClick\('teaInfoCopyBtn', teaInfoCopy\)/.test(s)
  && /setClick\('teaInfoClearBtn', teaInfoClear\)/.test(s)
  && !/#teaInfoCard/.test((s.match(/<div id="tab-tea"[\s\S]*?<!-- ==================== 小游戏/) || [''])[0]),
  '「吉运节节高 → 话术」卡挂在「话术生成」页的第三段（#genTeaInfoPane · data-seg-card="teainfo"），**不在下午茶投票页**（那是另一个东西）');
{
  const teaPane = (s.match(/<div id="tab-tea"[\s\S]*?<!-- ==================== 小游戏/) || [''])[0];
  ok(!!teaPane && !/teaInfoCard|吉运节节高/.test(teaPane),
    '下午茶投票页里不出现这一块（用户要求：这两个「下午茶」不是一回事）',
    teaPane ? '' : '没切出下午茶那个 tab-contents 段');
}
ok(/const TEA_INFO_MAX = 200000;/.test(s) && /function teaInfoPrep\(raw\)/.test(s)
  && /function teaInfoParse\(raw\)/.test(s) && /function teaInfoScript\(info\)/.test(s)
  && /function teaInfoRender\(info\)/.test(s) && /function teaInfoRun\(\)/.test(s)
  && /afternoon-tea-reward is-drawn/.test(s),
  '下午茶信息解析：贴纯文本或网页源码都认（源码里绿色 is-drawn 的奖励会标成「已抽取」）');
ok(/const parts = src\.split\(\/第\\s\*\(\\d\+\)\\s\*层\/\);/.test(s)
  && /商品\\s\*\(\\d\+\)\\s\*\\\/\\s\*价格\\s\*\(\\d\+\)\\s\*\\\/\\s\*已抽\\s\*\(\\d\+\)\\s\*\\\/\\s\*\(\\d\+\)/.test(s)
  && /奖励位\\s\*\(\\d\+\)/.test(s) && /升层奖励/.test(s) && /已抽取/.test(s)
  && /当前层\\s\*\[:：\]\?\\s\*\(-\|\\d\+\)/.test(s) && /大奖\\s\*\[:：\]\?\\s\*\(已抽取\|未抽取\|已抽到\|未抽到\)/.test(s),
  '能认出 GM 那块的结构：档位 configId/groupId、当前层、抽奖次数、大奖、每层「商品 / 价格 / 已抽 x/y」与每条奖励（ID / 奖励位 / 升层奖励 / 已抽取）');
ok(/【下午茶 · 吉运节节高】/.test(s) && /没查到您有下午茶（吉运节节高）的抽取记录/.test(s)
  && /核实该活动目前您共获得了 ' \+ u\.earned \+ ' 次抽奖次数，已使用了 ' \+ u\.used \+ ' 次抽奖。/.test(s)
  && /抽到了第 ' \+ \(cur \|\| '—'\) \+ ' 层/.test(s)
  && /层还未解锁。/.test(s) && /层的最终大奖。/.test(s)
  && /function teaInfoUsage\(info\)/.test(s) && /function teaInfoLabel\(rw\)/.test(s) && /itemNameMap\[key\]/.test(s),
  '生成的话术就按用户给的模板：核实该活动目前您共获得了 X 次抽奖次数，已使用了 X 次抽奖 → 抽到了第 X 层的…，第 X 层还未解锁 / 已获得第 N 层的最终大奖；没有进度时改成「没查到记录，麻烦发角色ID/区服」');
ok(/const TEA_ITEM_ALIAS = \{ '2000049': '随机奖励宝箱' \};/.test(s) && /TEA_ITEM_ALIAS\[key\]/.test(s)
  && !/价格/.test((s.match(/function teaInfoScript\(info\) \{[\s\S]*?\n {36}\}/) || [''])[0]),
  '奖励名按映射换人话（2000049 先写「随机奖励宝箱」）；话术里不出现价格（内部价）；数量一律用粘进来的数据');

// ---- 3g-3. 🧩 棋盘镜像（粘镜像 JSON → 主棋盘 / 背包 / 仓库 + 「在哪几个」话术）----
ok(/class="tab-btn tab-btn-sub" data-tab="gamedata"> 玩家游戏数据</.test(s) && /id="tab-gamedata"/.test(s)
  && !/data-tab="board"/.test(s) && !/id="tab-board"/.test(s)
  && /id="boardInput"/.test(s) && /id="boardParseBtn"/.test(s) && /id="boardClearBtn"/.test(s)
  && /id="boardSummary"/.test(s) && /id="boardMainGrid"/.test(s) && /id="boardOtherGrids"/.test(s)
  && /id="boardBagList"/.test(s) && /id="boardWareList"/.test(s)
  && /id="boardAskInput"/.test(s) && /id="boardAskBtn"/.test(s) && /id="boardAskCopyBtn"/.test(s) && /id="boardAskOut"/.test(s)
  && /setClick\('boardParseBtn', boardRun\)/.test(s) && /setClick\('boardAskBtn', boardAskRun\)/.test(s)
  && /setClick\('boardAskCopyBtn', boardAskCopy\)/.test(s) && /setClick\('boardClearBtn', boardClear\)/.test(s),
  '「玩家游戏数据」是「梦幻消除站」那组的子项（跟话术生成 / 集卡分析 同级、不带图标）：MergeState 粘贴 + 资源核对 / 活动进度 / 棋盘镜像 三段 + 主棋盘、背包仓库、道具查询都在，按钮都挂上了');
ok(/data-tab="gen"> 话术生成<\/button>\s*<button class="tab-btn tab-btn-sub" data-tab="card"> 集卡分析<\/button>\s*<button class="tab-btn tab-btn-sub" data-tab="gamedata"> 玩家游戏数据<\/button>/.test(s)
  && !/data-tab="\w+">🧩/.test(s) && !/data-tab="board"/.test(s),
  '「梦幻消除站」那一组现在是三张：话术生成 / 集卡分析 / 玩家游戏数据（都不带图标）');
ok(/const BOARD_JSON_MAX = 4000000;/.test(s) && /function boardJsonText\(raw\)/.test(s)
  && /function boardParse\(raw\)/.test(s) && /function boardRender\(model\)/.test(s)
  && /function boardGridHtml\(board\)/.test(s) && /function boardCellHtml\(c\)/.test(s)
  && /chessboardDataList/.test(s) && /warehouseData\.pieceDataList/.test(s)
  && /activityChessBoardData\.warehouse/.test(s) && /data\.backpack/.test(s) && /data\.currencies/.test(s),
  '镜像解析：chessboardDataList（棋盘）/ warehouseData.pieceDataList + activityChessBoardData.warehouse（仓库）/ backpack（临时背包）/ currencies（货币）；贴「镜像数据：」这种前缀也认');
ok(/model\.main = model\.boards\.filter\(x => String\(x\.id\) === '1'\)\[0\] \|\| model\.boards\[0\]/.test(s)
  && /grid-template-columns: repeat\(var\(--bw, 7\)/.test(s) && /board-cell is-piece/.test(s)
  && /\.board-cell\.t-producer/.test(s) && /\.board-cell\.is-locked/.test(s),
  '主棋盘按 cellNumW×cellNumH 画格子（棋子 / 空位 / 未解锁三种样子，产出棋标黄），其它棋盘另起一块');
ok(/model\.counts\[k\] = \{ onBoard: 0, inBackpack: 0, inWarehouse: 0 \}/.test(s)
  && /slot\(id\)\.onBoard \+= 1/.test(s) && /slot\(x\.id\)\.inWarehouse \+= 1/.test(s)
  && /slot\(x\.id\)\.inBackpack = x\.n/.test(s)
  && /function boardIdsOfQuery\(q\)/.test(s) && /nm\.indexOf\(t\) !== -1/.test(s) && /itemNameMap/.test(s),
  '三处数量分开数：棋盘上（每格 1 个）/ 仓库（每件 1 个）/ 临时背包（数量）；查询支持 id，也支持用物品名表反查名字（只认「真名包含查询」，避免误命中）');
ok(/棋盘上有 ' \+ onBoard \+ ' 个，临时背包有 ' \+ inBag \+ ' 个，仓库有 ' \+ inWare \+ ' 个。/.test(s)
  && /镜像里没找到「'/.test(s) && /【棋盘镜像 · '/.test(s),
  '确认话术就是用户要的三段式：棋盘上有 X 个，临时背包有 Y 个，仓库有 Z 个；查不到时直说没找到');
ok(/class="seg-bar" data-for="tab-gamedata"/.test(s) && /data-seg="resource" data-n="01">资源核对</.test(s)
  && /data-seg="activity" data-n="02">活动进度</.test(s) && /data-seg="mirror" data-n="03">棋盘镜像</.test(s)
  && /<div data-seg-card="mirror">/.test(s) && /statsSetSeg\('tab-gamedata', 'resource'\)/.test(s)
  && /id="mergeInput"/.test(s) && /id="mergeParseBtn"/.test(s) && /id="mergeClearBtn"/.test(s)
  && /id="mergeSummary"/.test(s) && /id="mergeDiff"/.test(s)
  && /id="gdResTable"/.test(s) && /id="gdItemInput"/.test(s) && /id="gdItemBtn"/.test(s) && /id="gdItemOut"/.test(s)
  && /id="gdActChips"/.test(s) && /id="gdActInput"/.test(s) && /id="gdActBtn"/.test(s) && /id="gdActOut"/.test(s),
  '「玩家游戏数据」页：MergeState 粘贴 + 三段（01 资源核对 / 02 活动进度 / 03 棋盘镜像），棋盘镜像原来的卡整块挪进第三段');
ok(/function mergeParse\(raw\)/.test(s) && /function mergeJson\(v, dflt\)/.test(s) && /function mergeDailyUsage\(model\)/.test(s)
  && /function mergeRenderDiff\(\)/.test(s) && /function mergeItemScript\(model, q\)/.test(s) && /function mergeActivityScript\(model, q\)/.test(s)
  && /data\.others/.test(s) && /others\.resource/.test(s) && /others\.activities/.test(s) && /others\.meta/.test(s),
  'MergeState 解析：diamond/gold/hp + others（resource 资源 / activities 活动 / meta 元数据）两层字符串都剥开；带当日体力·钻石消耗与「资源 → 最后变动时间」');
ok(/当前数量：/.test(s) && /最后变动：/.test(s) && /今日体力消耗：/.test(s) && /今日钻石消耗：/.test(s)
  && /棋盘镜像：棋盘上 /.test(s) && /玩家数据里没找到「/.test(s),
  '资源核对话术：当前数量 / 最后变动时间 / （查体力·钻石时）当日消耗 / 棋盘镜像里的三处数量；查不到直说');
ok(/【玩家游戏数据 · ' \+ mergeActivityLabel\(a\.name\)/.test(s) && /关键进度：/.test(s)
  && /活动任务（/.test(s) && /已完成（status=2）/.test(s) && /没找到「' \+ t \+ '」这个活动/.test(s)
  && /const MERGE_ACTIVITY_LABELS = \{/.test(s) && /seven_task: '七日任务'/.test(s),
  '活动进度话术：活动中文别名 + id + 关键进度；活动任务进度（status=2 算已完成）也能查；查不到直说');
ok(/function mergeRenderDiff\(\)/.test(s) && /跟棋盘镜像核对/.test(s) && /不一致：玩家数据 /.test(s)
  && /一致 /.test(s) && /红宝石', '103'/.test(s) && /铜钱', '102'/.test(s) && /体力', '101'/.test(s),
  '粘贴 MergeState 后自动跟棋盘镜像核对红宝石 / 铜钱 / 体力：一致标黄、不一致标橙（提示镜像不是最新）');
ok(!/saveData\('board/.test(s) && !/localStorage\.setItem\('boardMirror/.test(s),
  '玩家游戏数据 / 棋盘镜像都只在本机内存里解析（不写 /api/data、也不塞 localStorage）');

// ---- 3h. SOP 助手已整块删除（2026-10，用户要求）；服务端的 sop 口令关与 seed 工具保留 ----
ok(!/sop/i.test(s),
  'SOP 助手已从页面上整块删除（侧边栏 / 页面 / 样式 / 脚本 / 绑定里都不再出现 sop）');
ok(!/\bsop[A-Z_$]/i.test(s) && !/\.sop-/.test(s) && !/#sop/.test(s) && !/data-sop/.test(s),
  'SOP 的样式类 / id / data 属性也清干净了，没留死代码');
ok(/const SOP_TOKEN = process\.env\.SOP_TOKEN \|\| '';/.test(sv) && /const SOP_KEY_RE = \/\^sop\/i;/.test(sv)
  && /function denySop\(req, res\)/.test(sv) && /res\.status\(403\)\.json\(\{ error: 'SOP 口令不对' \}\)/.test(sv)
  && /x-sop-token/.test(sv) && /function tokenEq/.test(sv),
  '服务端：sop* 开头的 key 仍要 SOP_TOKEN（页面删了、数据保护守着），普通 key 行为不变');
ok(fs.existsSync('tools/sop-seed.cjs') && /sop:seed/.test(fs.readFileSync('package.json', 'utf8')),
  'SOP：seed 工具留着（以后要恢复页面，数据还能灌回去）');

// ---- 3i. 三个小功能（高频回复 / 归档体检 / 增量导入）+ 油猴脚本已删除 ----
ok(/const REPLY_TOP_KEY = 'replyTopUsage';/.test(s) && /const REPLY_TOP_MAX = 10;/.test(s)
  && /function replyTopTrack\(/.test(s) && /function renderReplyTopList\(/.test(s)
  && /id="replyTopList"/.test(s) && /id="replyTopClearBtn"/.test(s)
  && /replyTopTrack\(text, 'gen'\)/.test(s) && /replyTopTrack\(text, 'cop'\)/.test(s),
  '高频回复：本机统计「生成 / 复制」次数，最多 10 条（不认玩家、不存 openid）');
ok(/localStorage\.setItem\(REPLY_TOP_KEY/.test(s) && !/saveData\('replyTopUsage'/.test(s),
  '高频回复：只写本机 localStorage，不走 /api/data');
ok(/id="careerAuditBox"/.test(s) && /function renderCareerAudit\(/.test(s)
  && /function careerRecentDays\(/.test(s) && /renderCareerAudit\(\);/.test(s)
  && /漏登记 /.test(s),
  '归档体检：最近 7 天哪天没记录就点名提醒（漏登记）');
ok(/id="ovbizImportNewBtn"/.test(s) && /function ovbizImportNew\(/.test(s)
  && /function ovbizLastDate\(/.test(s) && /setClick\('ovbizImportNewBtn', ovbizImportNew\)/.test(s)
  && /没有新日期可导入/.test(s),
  '海外业务：增量导入只补本机没导过的日期 + 状态行显示「最新数据到」');
ok(!fs.existsSync('public/gemjy-openid-helper.user.js') && !fs.existsSync('tools/test-openid-helper.cjs')
  && !/test:helper/.test(fs.readFileSync('package.json', 'utf8'))
  && !/gemjy-openid-helper/.test(fs.readFileSync('package.json', 'utf8')),
  '油猴「反馈提取助手」已删干净（脚本 + 测试 + npm 脚本 + verify 链）');

// ---- 3j. 排班休息（当月哪天休息、休息日不进统计）----
ok(/const CAREER_REST_KEY = 'careerRestDays';/.test(s) && /function careerRestToggle\(/.test(s)
  && /id="careerRestBtn"/.test(s) && /id="careerRestCard"/.test(s) && /id="careerRestGrid"/.test(s)
  && /id="careerRestMonth"/.test(s) && /id="careerRestWeekendBtn"/.test(s)
  && /id="careerRestClearMonthBtn"/.test(s) && /setClick\('careerRestBtn'/.test(s),
  '排班休息：按钮 + 月份面板 + 点日期切换 + 周末全休 / 清空本月');
ok(/const restSet = careerRestSet\(\);/.test(s) && /const gapWorkDays = /.test(s)
  && /const dutyDays = Math\.max\(0, spanDays - restDays\);/.test(s)
  && /中间全是休息日 → 连续不断/.test(s),
  '休息日不进统计：断档只数工作日、休息不打断连续、另出「在岗 / 休息」天数');
ok(/localStorage\.setItem\(CAREER_REST_KEY/.test(s) && !/saveData\('careerRestDays'/.test(s)
  && /rest\.has\(d\)/.test(s),
  '排班休息只存本机 localStorage（不走 /api/data），归档体检也跳过休息日');
ok(/const CAREER_WEEK_LABELS = \['日', '一', '二', '三', '四', '五', '六'\];/.test(s)
  && /class="rest-cal-week"/.test(s) && /class="rest-cal-blank"/.test(s)
  && /const firstDow = new Date\(Date\.UTC\(y, m - 1, 1\)\)\.getUTCDay\(\);/.test(s),
  '排班休息改月历：星期表头（日一二三四五六）+ 月初留空让每天落在自己那一列');
ok(/id="careerRestTitle"/.test(s) && /id="careerRestPrev"/.test(s) && /id="careerRestNext"/.test(s)
  && /function careerStepRestMonth\(delta\)/.test(s)
  && /setClick\('careerRestPrev', \(\) => careerStepRestMonth\(-1\)\)/.test(s)
  && /setClick\('careerRestNext', \(\) => careerStepRestMonth\(1\)\)/.test(s),
  '月历带「‹ 月份 ›」切换（跨年也对）+ 抬头「YYYY 年 M 月」');
ok(/class="career-rest-day'[\s\S]{0,420}?is-today/.test(s) && /\.career-rest-day\.is-today b \{/.test(s)
  && /\.rest-cal-week \.wd\.is-weekend \{/.test(s) && /\.career-rest-day\.rest i \{ visibility: visible; \}/.test(s),
  '月历样式：今天高亮 / 周末列标色 / 休息格才显示「休」小片');


// ---- 3k. 统计页分段导航 / 一句话摘要 / 工具条收拢 ----
ok(/class="seg-bar" data-for="tab-career"/.test(s) && /class="seg-bar" data-for="tab-overseas"/.test(s)
  && (s.match(/data-seg-card=/g) || []).length >= 17
  && /function statsSetSeg\(tabId, seg\)/.test(s) && /statsSetSeg\('tab-career', 'overview'\)/.test(s)
  && !/jump-bar/.test(s) && !/jump-chip/.test(s),
  '统计页改「分段导航」（客服生涯 4 段 / 海外 3 段），旧的页内跳转条已整段移除');
ok(/id="careerHeadline"/.test(s) && /id="ovbizHeadline"/.test(s) && /\.stat-headline\b/.test(s)
  && /statsSetSeg\('tab-overseas', 'overview'\)/.test(s),
  '两个统计页顶部都有一句话摘要（累计 / 日均 / 最高单日 / 在岗）');
ok(/details class="card-more"/.test(s) && /details\.card-more > summary/.test(s),
  '客服生涯工具条收拢：导出 / 导入 / 清空折进「⋯ 更多」，主按钮只留归档 + 排班休息');
ok(/details\.card-more > div \{[\s\S]{0,320}?position: absolute; top: calc\(100% \+ 6px\); right: 0;/
  .test(s)
  && /details\.card-more > div \{[\s\S]{0,420}?grid-template-columns: 1fr;/.test(s)
  && /details\.card-more > div > button \{[\s\S]{0,260}?width: 100%;/.test(s)
  && /document\.querySelectorAll\('details\.card-more\[open\]'\)\.forEach/.test(s),
  '「⋯ 更多」展开是一块**浮层**（绝对定位、一列等宽按钮、图标对齐），点里面按钮 / 点外面都会收起（不再把工具条撑歪）');
ok(/\.career-rest-day \{[\s\S]{0,420}?overflow: hidden; box-sizing: border-box;/.test(s)
  && /\.career-rest-day b \{[\s\S]{0,220}?padding: 0 3px; margin-left: 0;/.test(s)
  && /\.career-rest-day i \{[\s\S]{0,320}?max-width: 100%; overflow: hidden; text-overflow: ellipsis;/.test(s),
  '日历格子里的「日期 / 休·班次」小片都收在边框里（格子上 overflow:hidden、去掉负 margin、长班次名省略号）');
ok(/\.card:has\(details\.card-more\[open\]\)[\s\S]{0,120}?overflow: visible;/.test(s)
  && /\.card > \.flex-row:has\(details\.card-more\[open\]\) \{ z-index: 40; \}/.test(s),
  '「⋯ 更多」浮层真能盖在卡片外面：展开时用 :has() 放开 .card 的 overflow:hidden 并把那一行提到 z-index 40（否则会被卡片裁掉 / 被后面的行压住）');

// ---- 3l. 七日任务（并进「话术生成」页的一段：进度日志 → 按内置任务表判定的进度话术，只在本机处理）----
ok(/class="seg-bar" data-for="tab-gen"/.test(s) && /data-seg="reply" data-n="01">话术生成</.test(s)
  && /data-seg="sevenday" data-n="02">七日任务进度</.test(s) && /id="genSevendayPane"/.test(s)
  && /data-seg="teainfo" data-n="03">吉运节节高（下午茶）</.test(s) && /id="genTeaInfoPane"/.test(s)
  && /data-seg-card="reply"/.test(s) && !/data-tab="sevenday"/.test(s) && !/id="tab-sevenday"/.test(s)
  && /statsSetSeg\('tab-gen', 'reply'\)/.test(s)
  && /#tab-gen > \.seg-bar \{ position: static; \}/.test(s),
  '七日任务并进「话术生成」页：页内分段导航（话术生成 / 七日任务进度 / 吉运节节高（下午茶）），侧边栏不再单独占一个标签；那一页的分段条不吸顶（避免滚动时把下面的文本框切成两半）');
ok(/id="sdLogInput"/.test(s) && /id="sdOutput"/.test(s) && /id="sdGenerateBtn"/.test(s)
  && /id="sdCopyBtn"/.test(s) && /id="sdClearBtn"/.test(s) && /id="sdReportSub"/.test(s),
  '七日任务那一段：粘进度日志 + 生成 / 复制 / 清空 + 结果框');
ok(!/id="sdTaskFold"/.test(s) && !/id="sdTaskInput"/.test(s) && !/id="sdTaskSub"/.test(s)
  && !/sdInitTaskTable/.test(s) && !/sdTaskResetBtn/.test(s) && !/sdClearTask/.test(s),
  '任务表完全不上界面：页面上没有折叠区 / 只读框 / 条数副标（也没有「清掉任务表」按钮）');
ok(/const SD_TASK_DEFAULT = \[/.test(s)
  && /'2521\\t第1天\\t登录1天\\t1\\t7\\t-\\t-\\t已领取/.test(s)
  && /'2555\\t第7天\\t服务250个顾客/.test(s)
  && /'2416\\t第1天\\t登录1天/.test(s)
  && /'2450\\t第7天\\t服务110个顾客/.test(s)
  && /'2486\\t第1天\\t登录1天/.test(s) && /'2520\\t第7天\\t服务200个顾客/.test(s)
  && (s.match(/'\d{4}\\t第[1-7]天\\t/g) || []).length === 105
  && /task: sdParseRows\(SD_TASK_DEFAULT, SD_TASK_ALIASES, SD_TASK_ORDER\)/.test(s),
  '内置固定任务表 SD_TASK_DEFAULT（三期共 105 条：最新 2521–2555 + 2416–2450 + 2486–2520）+ 解析时直接用这份常量');
ok(/const SD_TASK_ALIASES = \{/.test(s) && /const SD_LOG_ALIASES = \{/.test(s)
  && /const SD_TASK_ORDER = \[/.test(s) && /const SD_LOG_ORDER = \[/.test(s)
  && /function sdParseRows\(text, aliases, order\)/.test(s) && /const useHeader = hit >= 3;/.test(s)
  && /function sdSplitRow\(line\)/.test(s) && /text\.indexOf\('\\t'\) !== -1/.test(s)
  && /'客户端进度': 'custProgress'/.test(s) && /'客户端状态': 'custStatus'/.test(s),
  '七日任务：表头按中文列名对齐（命中 ≥3 个就当带表头，否则按页面列序）+ 制表符/逗号/空白三种分隔；「客户端进度」也认');
ok(/function sdBuildLog\(logs, tasks\)/.test(s) && /const byId = \{\};/.test(s)
  && /rows = seq\[id\]\.slice\(\)\.sort/.test(s)
  && /const done = newS === '2' \|\| \(hasP && hasT && np >= tg\);/.test(s)
  && /segs\.push\('还差 ' \+ \(tg - np\)\)/.test(s) && /segs\.push\('已完成'\)/.test(s)
  && /segs\.push\('可领取 ' \+ rw\.join\(' \+ '\)\)/.test(s)
  && /const d = sdDayText\(it\.t\.day\) \|\| '未标天数';/.test(s),
  '进度话术口径：按任务ID 查任务表 → 第几天分组 + 到了多少/目标 + 还差多少 / 已完成时能领什么（同任务多条日志合成一条）');
ok(/const SD_PERIOD_MAX = [1-9]\d*;/.test(s)
  && /function sdPeriodInfo\(tasks\)/.test(s) && /function sdTaskById\(id, byId, tasks\)/.test(s)
  && /if \(byId\[key\]\) return byId\[key\];/.test(s)
  && /if \(Math\.abs\(delta\) % info\.len !== 0\) return;/.test(s)
  && /const periods = Math\.abs\(delta\) \/ info\.len;/.test(s)
  && /t: sdTaskById\(id, byId, tasks\) \|\| \{\}/.test(s)
  && !/SD_PERIOD_STEP/.test(s),
  '期次换算是算出来的：从表里量出「一期多少条」，任何 ID 只要跟某一期同位置对齐（±35 / ±70 / ±140… 全认）就照抄那一行的天数 / 描述 / 目标 / 奖励（不再写死偏移量）');
ok(/function sdCell\(v\)/.test(s) && /return \(s === '-' \|\| s === '—' \|\| s === '无' \|\| s === '\/'\) \? '' : s;/.test(s)
  && /const num = sdCell\(t\.custProgress\) \|\| sdCell\(t\.progress\);/.test(s)
  && /const target = sdCell\(it\.t\.target\);/.test(s),
  '表格里的「-」当空值：新一期表客户端进度 / 客户端状态那两列是「-」，既不会算成进度也不会算成目标');
ok(/function sdClock\(v\)/.test(s) && /function sdProgressVerb\(desc\)/.test(s)
  && /const SD_VERBS = \['收集', '获取', '获得', '使用', '合成', '登录', '服务', '进行', '完成'\];/.test(s)
  && /const verb = sdProgressVerb\(name\) \|\| '进行';/.test(s)
  && /const segs = \['已' \+ verb \+ ' ' \+ \(prog \|\| '—'\) \+ \(hasT \? '\/' \+ target : ''\)\];/.test(s)
  && /const prog = sdCell\(it\.newP\) \|\| sdCell\(it\.t\.progress\);/.test(s)
  && /else if \(!it\.t\.desc\) segs\.push\('可领取活动奖励'\);/.test(s)
  && /lines\.push\(\(i \+ 1\) \+ '\. ' \+ \(clock \? clock \+ ' ' : ''\) \+ name \+ '：' \+ segs\.join\('，'\)\);/.test(s)
  && !/label = name === \('任务' \+ it\.id\)/.test(s),
  '话术文字：时间点 + 任务描述（不带任务ID）+「已收集 11417/16000，还差 4583」/「…，已完成，可领取 …」；任务表里认不出的ID 也统一成「已进行 N」+「可领取活动奖励」句式');
ok(/function sdItemLabel\(id, num\)/.test(s) && /const map = \(typeof itemNameMap !== 'undefined' && itemNameMap\) \? itemNameMap : \{\};/.test(s)
  && /map\[String\(id\)\]/.test(s) && /function sdRewardText\(reward\)/.test(s)
  && /\\d\+\)\\s\*\[\+\*x×\/\]/.test(s) && /function sdStatusText\(v\)/.test(s),
  '七日任务：奖励写成「道具名×数量」（102+15 / 50101*1 都认）、状态按 1 未完成 / 2 可领取');
ok(/const SD_STATE_KEY = 'sevendayTaskState';/.test(s)
  && /localStorage\.setItem\(SD_STATE_KEY/.test(s) && /localStorage\.getItem\(SD_STATE_KEY/.test(s)
  && /已清空日志与结果'/.test(s) && !/saveData\('sevenday/.test(s),
  '七日任务只存本机 localStorage（sevendayTaskState，只记日志；任务表在代码里），不走 /api/data');
ok(/setClick\('sdGenerateBtn', sdGenerate\)/.test(s) && /setClick\('sdCopyBtn', sdCopy\)/.test(s)
  && /setClick\('sdClearBtn', sdClear\)/.test(s) && /function bindSdLogInput\(\)/.test(s)
  && /sdSaveStateLater\(\); sdRenderHead\(\);/.test(s),
  '七日任务：生成 / 复制 / 清空 + 日志输入框的防抖存档都已挂上');

// ---- 3m. 反馈模板「巨多」卡片墙（一张卡 = 一条消息）----
ok(/id="fbBulkCard"/.test(s) && /id="fbBulkBtn"/.test(s) && /id="fbBulkPane"/.test(s)
  && /id="fbCards"/.test(s) && /id="fbCardAllBox"/.test(s)
  && /function fbBindCardAllBox\(\)/.test(s) && /all\.indeterminate = picked > 0 && picked < fbCards\.length;/.test(s)
  && !/fbCardAllBtn|fbCardNoneBtn/.test(s)
  && /id="fbCardCopyBtn"/.test(s) && /id="fbCardCopyAllBtn"/.test(s)
  && /id="fbCardAddBtn"/.test(s) && /id="fbCardClearBtn"/.test(s)
  && /id="fbBulkPane" style="display:none/.test(s),
  '反馈模板多一块「⑤ 巨多 · 卡片模式」：开关 + 卡片墙 + 「全选」勾选项（半勾状态）+ 复制选中/合并复制/空白卡/清空（默认收起）');
ok(/function fbSplitCards\(text\)/.test(s) && /\.split\(\/\\r\?\\n\[ \\t\]\*\\r\?\\n\/\)/.test(s)
  && /function fbBulkRender\(\)/.test(s) && /pane\.style\.display = fbBulkOn \? '' : 'none';/.test(s),
  '巨多：生成结果按「空行」拆成一段一张卡（乐缤纷那种一行一段正好一卡一条），开关只切显示');
ok(/function fbCardRender\(\)/.test(s) && /contenteditable="true"/.test(s)
  && /class="fb-card-body" contenteditable="true" spellcheck="false"/.test(s),
  '每张卡正文是 contenteditable（可直接改字），还带编号 / 单独的「复制这张」「删」');
ok(/function fbCardText\(html\)/.test(s) && /img\.replaceWith\(document\.createTextNode\('\[图片\]'\)\)/.test(s)
  && /function fbCopyRich\(html\)/.test(s) && /typeof window\.ClipboardItem === 'function'/.test(s)
  && /'text\/html': new Blob\(\[String\(html == null \? '' : html\)\], \{ type: 'text\/html' \}\)/.test(s)
  && /'text\/plain': new Blob\(\[text\], \{ type: 'text\/plain' \}\)/.test(s)
  && /navigator\.clipboard\.write\(\[item\]\)\.catch\(\(\) => safeCopy\(text\)\)/.test(s),
  '复制卡片：优先富文本（ClipboardItem 的 text/html + text/plain，截图一起过去），不支持就退回 safeCopy 纯文本');
ok(/async function fbCardPaste\(el, e\)/.test(s) && /it\.kind === 'file' && it\.getAsFile/.test(s)
  && /const f = it\.getAsFile\(\);/.test(s) && /f\.size > FB_CARD_IMG_MAX/.test(s)
  && /function fbFileToDataURL\(file\)/.test(s) && /r\.readAsDataURL\(file\);/.test(s)
  && /function fbInsertAtCursor\(el, node\)/.test(s),
  '卡片里粘截图：只拦图片、转 dataURL 塞到光标处（>1.6MB 不贴），纯文字仍走浏览器默认粘贴');
ok(/function fbCardCopySelected\(\)/.test(s) && /let fbCardQueue = \[\];/.test(s)
  && /if \(fbCardQueuePos >= fbCardQueue\.length\) \{/.test(s)
  && /left > 0 \? \('📋 复制下一条（还剩 ' \+ left \+ ' 条）'\)/.test(s)
  && /—— 一张卡就是一条消息/.test(s) && /function fbCardCopyAll\(\)/.test(s),
  '勾选后「复制选中」是**一条一条**复制：点一次复制一张、按钮变「复制下一条（还剩 N 条）」，另有「合并复制成一条」');
ok(/function fbCardDel\(i\)/.test(s) && /function fbCardAddBlank\(\)/.test(s)
  && /function fbCardClearAll\(\)/.test(s) && /const FB_CARD_MAX = \d+;/.test(s)
  && /function fbCardsSyncFromDom\(\)/.test(s) && /el\.addEventListener\('input', \(\) => \{ fbCardsSyncFromDom\(\); fbBulkSaveLater\(\); \}\)/.test(s),
  '卡片可增（空白卡）/ 删 / 清空（带 confirm），上限 FB_CARD_MAX，编辑后回写 DOM 快照');
ok(/const FB_BULK_KEY = 'feedbackBulk';/.test(s) && /localStorage\.setItem\(FB_BULK_KEY/.test(s)
  && /localStorage\.getItem\(FB_BULK_KEY/.test(s) && !/saveData\('feedbackBulk/.test(s),
  '巨多只存本机 localStorage（feedbackBulk：开关 + 卡片 HTML），不进 /api/data');
ok((s.match(/if \(fbBulkOn\) fbPushCards\(/g) || []).length === 3
  && /function fbPushCards\(text\)/.test(s) && /setClick\('fbBulkBtn', fbBulkToggle\)/.test(s)
  && /setClick\('fbCardCopyBtn', fbCardCopySelected\)/.test(s) && /fbBulkLoad\(\);/.test(s),
  '巨多接到生成流程上：常规模板 / 乐缤纷 / 工单三处生成都调 fbPushCards（追加，不覆盖已有卡片）');
ok(/\.fb-cards\b/.test(s) && /\.fb-card-body\b/.test(s) && /white-space: pre-wrap/.test(s)
  && /\.fb-cards-empty\b/.test(s),
  '卡片墙样式（卡片 / 正文保留换行 / 空状态）');

// ---- 3n. 反馈模板「工单（反馈）」（喜扑工单整块粘 → 九行反馈格式，可再用玩家数据补 UID/渠道）----
ok(!/data-fb-template="ticket"/.test(s) && !s.includes('工单（反馈）')
  && s.includes("if (fbSource === '工单') {") && s.includes('const tkBlocks = fbTicketBlocks(raw);'),
  '工单反馈不再单开模板：模板还是原来那 4 个，**来源选「工单」就按喜扑工单那套生成**');
ok(s.includes('function fbTicketBlocks(raw)')
  && s.includes('if (/^玩家数据[:：]/.test(t)) { cur = null; return; }')
  && s.includes('if (/^(工单[:：]\\s*)?工单号([\\t ]|[:：])/.test(t)) { cur = [line]; out.push(cur); return; }')
  && s.includes('return out.filter(lines => lines.some(l => /^(主体|游戏名称)[\\t ]/.test(l.trim())));'),
  '工单块按「工单：工单号 …」起头切（多块 = 多段），并且只认带 主体 / 游戏名称 的喜扑工单（内部工单不会被误吃）');
ok(s.includes('const FB_TK_LABELS = [') && s.includes('function fbTicketFields(lines)')
  && s.includes('function fbTicketDescParts(desc)')
  && s.includes('const m = /^【(.+?)】\\s*(.*)$/.exec(line.trim());')
  && s.includes("if (key) w[key] = (w[key] ? w[key] + '\\n' : '') + t;"),
  '工单字段按「字段名⇥值」提取（问题描述那种多行字段整段收进来），再从里面拆【详细描述】等小字段');
ok(/function fbTicketPlayer\(raw\)/.test(s) && /replace\(\/\^玩家数据\[:：\]\/, ''\)/.test(s)
  && /const r = \{ uid: '', channel: '', roleId: '' \};/.test(s),
  '「玩家数据：…」那一坨能补出 喜扑UID / 渠道（角色ID 也留了兜底）');
ok(s.includes('function fbTicketText(r)') && s.includes('function fbTicketRec(w, player)')
  && s.includes("'【' + (r.game || '梦幻消除战') + '问题反馈】'")
  && s.includes("'\\n【喜扑UID】：' + r.uid") && s.includes("'\\n【角色ID】：' + r.roleId")
  && s.includes("'\\n【渠道】：' + r.channel") && s.includes("'\\n【设备信息】：'")
  && s.includes("'\\n【发生时间】：' + r.occur") && s.includes("'\\n【具体描述】：' + r.desc"),
  '梦幻模板＝用户给的九行格式（【设备信息】留空；字段来自工单记录）');
ok(/来源＝工单 → 按「' \+ fbTemplateLabel\(\) \+ '」原来的格式生成/.test(s)
  && /（还没粘「玩家数据」→ 喜扑UID \/ 渠道 先空着，粘上再点一次就补上）/.test(s)
  && /if \(tkBlocks\.length \|\| tkRows\.length\) \{/.test(s),
  '生成时按来源分叉：来源＝工单且认得出工单 → 走喜扑那套，提示里写段数与补充方式');
ok(/const looksTicket = \/主体\/\.test\(String\(raw \|\| ''\)\) && \/游戏名称\//.test(s)
  && /请把来源切成「工单」/.test(s),
  '粘的是喜扑工单但来源没选「工单」时，提示把来源切成工单');

// ---- 3o. 工单列表整段 → 快速开卡；缺的信息在卡片上再粘一次补 ----
ok(s.includes('function fbTicketTableRows(raw)') && s.includes('function fbTicketRowRec(r, player)')
  && s.includes("if (line.indexOf('\\t') === -1) return;")
  && s.includes('if (cells.length < 6) return;')
  && s.includes('if (cells.some(c => FB_TK_LABELS.indexOf(c.replace(/[:：]\\s*$/, \'\')) !== -1)) return;')
  && s.includes('const i = cells.findIndex(c => /^\\d{4,}$/.test(c));'),
  '工单列表整段（制表符分隔、第一格可能是空勾选框）→ 一行一张单，找工单号那一格起算 12 列；「字段名⇥值」那种两列的行不会被当成列表行');
ok(s.includes('function fbTicketRowRec(r, player)')
  && s.includes('function fbTicketPasteRec(raw)')
  && s.includes('return fbTicketRec({}, fbTicketPlayer(raw));')
  && s.includes('function fbCardKind(text)'),
  '每行 → 一条工单记录（fbTicketRowRec）+ 补卡片时取第一段（fbTicketPasteRec）；卡片格式靠 fbCardKind 区分（九行 / 常规）');
ok(s.includes('function fbFeedbackParse(text)') && s.includes('function fbFeedbackText(f)')
  && s.includes("if (/问题反馈$/.test(k)) { f.title = k; return; }")
  && s.includes("if (k === '具体描述') { f.body = v; return; }"),
  '卡片正文（九行格式）能被读回字段表、再写回九行（补信息前后格式不跑偏）');
ok(s.includes('function fbTicketMerge(cardText, pasteText)') && s.includes("if (!n) return '';")
  && s.includes('if (!kind) return \'\';')
  && s.includes('if (!f.uid && r.uid) { f.uid = r.uid; n++; }')
  && s.includes('if (!f.channel && r.channel) { f.channel = r.channel; n++; }')
  && s.includes('if (!f.roleId && r.roleId) { f.roleId = r.roleId; n++; }')
  && s.includes('if (!f.occur && r.occur) { f.occur = r.occur; n++; }')
  && s.includes('if (!g.uid && r.uid) { g.uid = r.uid; n++; }'),
  '补信息只填空着的格子：粘玩家数据补 喜扑UID/渠道，粘工单整块补 角色ID/发生时间/具体描述/编号（已有的不覆盖）');
ok(s.includes('function fbLooksTicketPaste(t)') && s.includes("if (txt && fbLooksTicketPaste(txt)) {")
  && s.includes("if (/^\\s*工单号[\\t ]/.test(v) && !/主体|游戏名称/.test(v)) return false;")
  && s.includes('if (fbTicketBlocks(v).length) return true;')
  && s.includes('return !!fbTicketPlayer(v).uid;')
  && s.includes('const merged = fbTicketMerge(fbCardText(el.innerHTML), txt);')
  && s.includes('el.textContent = merged;')
  && s.includes("if (!merged) { fbCardHintSet('这张卡里这些信息已经有了（没补新东西）'); return; }"),
  '在卡片上粘贴时先判断是不是喜扑工单/玩家数据 → 是就补进这张卡（内部工单文本不拦，免得吞掉；否则走原来的图片 / 普通粘贴）');
ok(s.includes('const tkRows = tkBlocks.length ? [] : fbTicketTableRows(raw);')
  && s.includes('? tkBlocks.map(b => fbTicketRec(fbTicketFields(b), tkPlayer))')
  && s.includes(': tkRows.map(r => fbTicketRowRec(r, tkPlayer));'),
  '「生成反馈格式」两条路：工单整块 / 工单列表行（后者直接开多张卡）');

// ---- 3p. 只粘玩家数据：没前缀也认；补进选中的那张卡，不新开卡 ----
ok(s.includes('const labelled = /玩家数据[:：]/.test(text);')
  && s.includes('const plat = /(小程序|安卓|android|ios|app|官网|应用宝|oppo|vivo|华为|小米|taptap|b站|4399|九游)/i.test(t);')
  && s.includes('if (labelled || plat) { r.channel = t.slice(t.lastIndexOf(\'-\') + 1).trim(); ok = true; }'),
  '玩家数据没写「玩家数据：」前缀也认（靠平台词认渠道，避免把工单号当 UID）');
ok(s.includes("先勾选一张卡（只勾一张），再点生成就会补进那张卡")
  && s.includes("const merged0 = fbTicketMerge(fbCardText(body.innerHTML), raw);")
  && s.includes("已把玩家数据补进第 ' + (idx + 1) + ' 张卡'"),
  '只粘玩家数据点生成时补进选中/唯一那张卡，不再多开一张空卡');

// ---- 4. 花括号/圆括号平衡（粗查，排除字符串内的干扰仅作参考） ----
const count = (str, ch) => (str.split(ch).length - 1);
const braces = count(js, '{') - count(js, '}');
const parens = count(js, '(') - count(js, ')');
console.log(`  花括号差 ${braces}，圆括号差 ${parens}（字符串里含括号会有误差，仅供参考）`);

// ---- 5. CSS 块内花括号平衡 ----
const style = /<style>([\s\S]*?)<\/style>/.exec(s)?.[1] || '';
ok(count(style, '{') === count(style, '}'), `CSS 花括号平衡 (${count(style, '{')}/${count(style, '}')})`);

console.log(bad ? `\n✗ ${bad} 项未通过` : '\n✅ 全部校验通过');
process.exit(bad ? 1 : 0);
