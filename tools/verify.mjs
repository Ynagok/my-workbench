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
ok((s.match(/"25[3-7]":\s*"/g) || []).length === 10, '253–257 在两张表里各一份（共 10 处）');
{
  const actBlk = (s.match(/const DEFAULT_ACTIVITY_TYPE_MAP = \{[\s\S]*?\r?\n\s*\};/) || [''])[0];
  ok(/"75": "95打怪棋盘"/.test(actBlk), '活动类型映射已补 75（95打怪棋盘）');
  ok((actBlk.match(/"\d+":/g) || []).length === 39, `活动类型映射键数 = ${(actBlk.match(/"\d+":/g) || []).length}（应为 39）`);
}

// ---- 3b. 客服生涯 ----
ok(/data-tab="career"/.test(s) && /id="tab-career"/.test(s), '客服生涯标签页已注入');
{
  const hiddenBlk = (s.match(/const CAREER_HIDDEN_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ovBlk = (s.match(/const CAREER_OVERSEAS_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ticketBlk = (s.match(/const DAILY_TICKET_FIELDS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ovDailyBlk = (s.match(/const DAILY_OVERSEAS_FIELDS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const numKeys = (blk) => [...blk.matchAll(/\{ key: '([a-zA-Z0-9_]+)', label: '[^']*', type: 'number' \}/g)].map(m => m[1]);
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
  // 海外日报的数值字段必须被海外侧项一一覆盖（SDk 三项明细也算覆盖）
  const sdkBlk = (s.match(/const CAREER_SDK_BREAKDOWN = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const ovCovered = new Set();
  for (const m of (ovBlk + sdkBlk).matchAll(/'overseas\.([a-zA-Z0-9_]+)'/g)) ovCovered.add(m[1]);
  const ovMissed = ovFields.filter(k => !ovCovered.has(k));
  ok(ovFields.length === 13 && !ovMissed.length,
    `海外侧覆盖海外日报全部 ${ovFields.length} 个数值字段（含 SDk 三项）` + (ovMissed.length ? '，漏：' + ovMissed.join('/') : ''));
  const ovN = (ovBlk.match(/side: 'overseas'/g) || []).length;
  ok(ovN === 10, `海外侧 = ${ovN} 项（含异世界群维系 + （梦幻/繁花/乐缤纷）群维系）`);
  ok(/const CAREER_ITEMS = CAREER_TICKET_ITEMS\.concat\(CAREER_OVERSEAS_ITEMS\)/.test(s),
    '合计 29 + 10 = 39 项计入统计');
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
  && /\+ \(parseFloat\(d\.email\) \|\| 0\) \+ careerSdkTotal\(d\)/.test(s),
  '生成日报时三项合并成一个「SDk工单」（来访总计也跟着合并）');
ok(/const CAREER_SDK_BREAKDOWN = \[/.test(s) && ((s.match(/const CAREER_SDK_BREAKDOWN = \[[\s\S]*?\r?\n\s*\];/) || [''])[0].match(/side: 'overseas'/g) || []).length === 3,
  '生涯里 SDk 三项明细可单独查看（CAREER_SDK_BREAKDOWN 3 项）');
ok(/const careerAllItems = \(\) => CAREER_ITEMS\.concat\(CAREER_SDK_BREAKDOWN\)\.concat\(CAREER_HIDDEN_ITEMS\)/.test(s)
  && /const careerSum = \(items\) => CAREER_ITEMS\.reduce/.test(s)
  && /const careerEditableItems = \(\) => CAREER_ITEMS\.concat\(CAREER_SDK_BREAKDOWN\)/.test(s),
  'SDk 三项明细只做展示（careerAllItems 里，但不进 CAREER_ITEMS → 合计不重复计）');
// 身份筛选：全部 / 工单 / 海外（整页统计只算选中那一侧）
ok(/id="careerScopeBar"/.test(s) && /data-scope="overseas"/.test(s) && /function careerSetScope\(scope\)/.test(s)
  && /function careerSideTotal\(rec, scope\)/.test(s) && /careerStats\(scope\)/.test(s),
  '身份筛选已注入（全部 / 工单 / 海外 驱动整页统计）');
ok(/id="careerCardTicket"/.test(s) && /id="careerCardOverseas"/.test(s)
  && /cardTicket\.style\.display = \(!scoped \|\| scope === 'ticket'\)/.test(s),
  '选某一侧时另一侧统计卡隐藏');
// 指标详情：选范围（某一侧 / 某一项）+ 按日·按月 + 总量 / 平均值
ok(/function careerDetailValue\(rec, sel\)/.test(s) && /function renderCareerDetail\(\)/.test(s)
  && /id="careerDetailItem"/.test(s) && /id="careerDetailGrain"/.test(s) && /id="careerDetailSummary"/.test(s),
  '指标详情面板已注入（选某一侧或某一项，按日/按月看总量与平均值）');
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
ok(!/--surface: #0e1216;/.test(s) && !/--bg-0: #090b0d;/.test(s) && !/--accent: #ffd60a;/.test(s)
  && !/color-scheme: dark;/.test(s),
  '暗色令牌已彻底移除（不会回退成炭黑底）');
ok(/color-scheme: light;/.test(s) && /--clip-card: polygon\(/.test(s) && /--hazard: repeating-linear-gradient/.test(s)
  && /\.career-kpi::after/.test(s) && /浅色收口层 · 柔和白/.test(s),
  '浅色基底：原生控件浅色 + 卡片切角 + 警示条纹 + KPI 角落刻度 + 浅色收口层');
ok(!/rgba\(255,255,255,0\.0[0-9]\)/.test(s.slice(s.indexOf('浅色收口层'), s.lastIndexOf('</style>'))),
  '浅色收口层里不再残留「白底上的白色 hover / 白线」');
ok(/counter\(career-card, decimal-leading-zero\)/.test(s) && /counter\(nav-item, decimal-leading-zero\)/.test(s),
  '编号体系：侧边栏 01… + 客服生涯分节 01…（报表感）');
ok(/id="careerReportSub"/.test(s) && /id="careerReportMeta"/.test(s) && /getElementById\('careerReportMeta'\)/.test(s)
  && /WORKLOAD REPORT \/ 工作量统计报表/.test(s),
  '客服生涯报表抬头（英文 kicker + 标题 + 数据范围 + 右上元数据格）已注入并在渲染时填充');
// ---- 3d. 海外业务统计（岗位周报整表粘贴）----
ok(/data-tab="overseas"/.test(s) && /id="tab-overseas"/.test(s) && /海外业务统计/.test(s),
  '「海外业务统计」标签页已注入（侧边栏 + 页面）');
{
  const ovbizBlk = (s.match(/const OVBIZ_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  ok(/const OVBIZ_KEY = 'overseasBizData';/.test(s) && (ovbizBlk.match(/\{ key: '/g) || []).length === 11,
    '海外业务：11 个统计项已定义（异世界群维系…监控封号）');
}
ok(/function ovbizSplitLine\(line\)/.test(s) && /indexOf\('\\t'\) !== -1/.test(s) && /careerParseDate\(raw\)/.test(s)
  && /'22'\] = '@date'/.test(s),
  '海外业务：解析支持 CSV / TSV、日期 2026/1/1 与 Excel 序列号，并认得周报表头第一格的「22」');
ok(/function ovbizSaveCache\(\)/.test(s) && /function ovbizPushServer\(\) \{ return saveData\(OVBIZ_KEY, ovbizData\); \}/.test(s)
  && /fetchWithTimeout\(API_BASE \+ encodeURIComponent\(OVBIZ_KEY\)\)/.test(s),
  '海外业务：岗位共享 —— 服务端 /api/data/overseasBizData 为准，本机只做离线缓存（saveData 推 + GET 同步）');
ok(/function ovbizMergeData\(srv, loc\)/.test(s) && /if \(clearedAt && r\.at && r\.at < clearedAt\) continue;/.test(s)
  && /ovbizRowSig\(merged\) !== ovbizRowSig\(srv\)/.test(s),
  '海外业务：服务端与本机按行并集合并（并发导入不互相冲掉），清空用 clearedAt 挡住别的设备的旧行');
ok(/function ovbizEnsureLoaded\(\)/.test(s) && /ovbizEnsureLoaded\(\);/.test(s) && /let ovbizLoaded = false;/.test(s),
  '海外业务：本机数据懒加载（避开 applyState 早于 const 初始化的 TDZ 坑）');
ok(/function ovbizStats\(\)/.test(s) && /d\.total \+= r\.total;/.test(s) && /function ovbizWeekStart\(d\)/.test(s)
  && /anomalyLine = n > 1 && sd > 0/.test(s),
  '海外业务：统计按天合计（同日多人）+ 周维度 + μ+2σ 异常线');
ok(['ovbizKpi', 'ovbizItemTable', 'ovbizMonthlyTable', 'ovbizWeeklyTable', 'ovbizPeopleTable', 'ovbizDailyTable', 'ovbizAnomalyBox', 'ovbizReportMeta', 'ovbizSyncHint']
  .every(id => s.includes('id="' + id + '"')),
  '海外业务：总览 / 逐项 / 月度 / 周 / 按人员 / 每日明细 / 异常 / 报表抬头 / 共享状态行 容器齐全');
ok(/setClick\('ovbizImportBtn', ovbizImport\)/.test(s) && /setClick\('ovbizExportBtn'/.test(s)
  && /setClick\('ovbizClearBtn', ovbizClearAll\)/.test(s) && /setClick\('ovbizSyncBtn', ovbizManualSync\)/.test(s)
  && /this\.dataset\.tab === 'overseas'\) \{ ovbizRender\(\); ovbizSyncFromServer\(\); \}/.test(s)
  && /renderCareer\(\);\s*\n\s*ovbizRender\(\);/.test(s),
  '海外业务：导入 / 导出 / 重同步 / 清空按钮与标签页刷新、启动刷新都已挂上');
// ---- 3e. 反馈模板（工单信息提取器）----
ok(/data-tab="feedback"/.test(s) && /id="tab-feedback"/.test(s) && /反馈模板/.test(s),
  '「反馈模板」标签页已注入（侧边栏 + 页面）');
{
  const srcBlk = (s.match(/const FB_SOURCES = \[(.*?)\];/) || ['', ''])[1];
  ok((srcBlk.match(/'/g) || []).length === 22 && /'企微'/.test(srcBlk) && /'爱江山CP后台'/.test(srcBlk),
    '反馈来源 11 个且含「企微」（抖音在线…繁花CP后台 / 企微）');
  const tplBlk = (s.match(/const FB_TEMPLATES = \[([\s\S]*?)\];/) || ['', ''])[1];
  ok((tplBlk.match(/\{ key: '/g) || []).length === 3 && /'menghuan'/.test(tplBlk) && /'changwu'/.test(tplBlk) && /'gongdan'/.test(tplBlk),
    '反馈模板 3 种（梦幻消除战 / 常规游戏 / 内部工单）');
}
ok(/【梦幻消除战问题反馈】/.test(s) && /【喜扑UID】/.test(s) && /问题：玩家反馈，麻烦看看/.test(s),
  '反馈模板正文与原工具一致（梦幻版 + 常规版两套）');
ok(/includes\('异世界勇者'\)/.test(s) && /'联盟契约'/.test(s) && /'taptap'/.test(s) && /'001'/.test(s) && /'000'/.test(s),
  '异世界勇者区服固定 001、联盟契约 / taptap 固定 000（用户给的规则）');
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
ok(/function careerItemsFromDaily\(t, o\)/.test(s) && (s.match(/careerItemsFromDaily\(/g) || []).length >= 3,
  '折算逻辑抽成 careerItemsFromDaily，自动归档与日报文本导入共用同一套口径');
ok(/①繁花微信【2】|\[\u2460\u2461\u2462\u2463\u2464\u2465\u2466\]/.test(s) && /支付宝后台/.test(s) && /dy在线/.test(s),
  '日报解析覆盖 ①~⑦ 组行（含 手Q / 支付宝后台 这两个写法）');
ok(/CAREER_STATUS_PENDING = '总计为空\/待确认'/.test(s), '口径注明「总计为空/待确认」不计入完整记录天数');

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
