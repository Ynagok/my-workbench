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
  // 海外日报的数值字段必须被海外侧项一一覆盖
  const ovCovered = new Set();
  for (const m of ovBlk.matchAll(/'overseas\.([a-zA-Z0-9_]+)'/g)) ovCovered.add(m[1]);
  const ovMissed = ovFields.filter(k => !ovCovered.has(k));
  ok(ovFields.length === 11 && !ovMissed.length,
    `海外侧覆盖海外日报全部 ${ovFields.length} 个数值字段` + (ovMissed.length ? '，漏：' + ovMissed.join('/') : ''));
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
ok(/loadData\(CAREER_KEY, null\)/.test(s) && /careerData = normalizeCareer\(b\.careerData\)/.test(s), '客服生涯走服务端持久化（多设备同步）');
ok(/function careerStats\(\)/.test(s) && /function careerImport\(\)/.test(s) && /function careerCsvText\(\)/.test(s), '统计 / 粘贴导入 / CSV 导出 已注入');
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
