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
  const itemsBlk = (s.match(/const CAREER_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const hiddenBlk = (s.match(/const CAREER_HIDDEN_ITEMS = \[[\s\S]*?\r?\n\s*\];/) || [''])[0];
  const itemKeys = itemsBlk.match(/\{ key: '/g) || [];
  ok(itemKeys.length === 17, `客服生涯计入统计的项 = 17 项（当前 ${itemKeys.length}）`);
  const ticketN = (itemsBlk.match(/side: 'ticket'/g) || []).length;
  const overseasN = (itemsBlk.match(/side: 'overseas'/g) || []).length;
  ok(ticketN === 7 && overseasN === 10, `两侧分开统计（工单 ${ticketN} 项 / 海外 ${overseasN} 项）`);
  ok(/key: 'sj_group', label: '异世界群维系', side: 'overseas'/.test(itemsBlk) && /'ticket\.g7_wx'/.test(itemsBlk),
    '异世界群维系归到海外侧（数据仍取工单日报的⑦）');
  // 海外日报新增的 3 个字段 → 海外侧 3 个统计项
  ok(/key: 'cp_ticket', label: '海外CP后台工单'/.test(s) && /key: 'cn_ticket', label: '国内工单'/.test(s)
    && /key: 'mhl_group', label: '（梦幻\/繁花\/乐缤纷）群维系'/.test(s),
    '海外日报表单新增 3 个字段（海外CP后台工单 / 国内工单 / （梦幻/繁花/乐缤纷）群维系）');
  ok(/from: \['overseas\.cp_ticket'\]/.test(itemsBlk) && /from: \['overseas\.cn_ticket'\]/.test(itemsBlk)
    && /from: \['overseas\.mhl_group'\]/.test(itemsBlk),
    '这 3 个字段已接到海外侧统计（海外CP后台工单不再是「需补录」）');
  ok(/海外CP后台工单：\$\{d\.cp_ticket/.test(s) && /国内工单：\$\{d\.cn_ticket/.test(s)
    && /（梦幻\/繁花\/乐缤纷）群维系：\$\{d\.mhl_group/.test(s),
    '海外日报正文已同步加这 3 行');
  ok(!/group_ajs/.test(s), '旧标签「（爱江山/繁花/乐缤纷）群维系」已彻底改掉');
  // 登记表那列「（繁花+乐缤纷+梦幻）群维系」= 海外侧的（梦幻/繁花/乐缤纷）群维系，导入时按别名对齐
  ok(/const CAREER_IMPORT_ALIASES = \{[\s\S]{0,80}'（繁花\+乐缤纷\+梦幻）群维系': 'mhl_group'/.test(s)
    && /CAREER_IMPORT_ALIASES\[label\]/.test(s),
    '登记表「（繁花+乐缤纷+梦幻）群维系」列别名接到海外侧群维系项（历史数据也进统计）');
  // 14 项必须与登记表列名一一对应（计入统计的 + 只存档的 + 别名）
  const aliasBlk = "（繁花+乐缤纷+梦幻）群维系";
  const labels = ['异世界群维系', '猫之城ios&B站评论回复', '国内动物领主VIP', aliasBlk, '邮件+SDK（猫旅馆物语）',
    '海外SSO工单量（全产品）', '海外CP后台工单（全产品）', '塔防FB', '海外邮件（全产品）', '海外FB（全产品）',
    '商店回复', 'SSO国内工单', '监控禁言', '监控封号'];
  const missing = labels.filter(l => !(itemsBlk + hiddenBlk).includes(l) && !s.includes("'" + l + "': '"));
  ok(!missing.length, '14 项列名与登记表一致' + (missing.length ? '，缺：' + missing.join('/') : ''));
  // 只存档的 4 项（登记表里恒为 0 的那几列）：仍然可导入，但不进统计
  const hiddenKeys = hiddenBlk.match(/\{ key: '/g) || [];
  ok(hiddenKeys.length === 4, `只存档、不计入统计的登记表列 = 4 项（当前 ${hiddenKeys.length}）`);
  ok(['catcity', 'dwlz_vip', 'catinn_sdk', 'td_fb'].every(k => hiddenBlk.includes("key: '" + k + "'")),
    '只存档的 4 列正确（猫之城/国内动物领主VIP/邮件+SDK/塔防FB）');
  ok(!/key: 'g3_group'|key: 'g4_group'|key: 'g6_group'/.test(s), '③④⑤⑥群维系字段已按用户要求彻底移除');
  ok(!/careerExtraFields/.test(s) && /const careerAllItems = \(\) =>/.test(s), 'extra 已移除，改为「计入统计 / 只存档」两层');
  // 口径断言：计入统计的项覆盖日报 20 个字段；未覆盖的应恰好是①②③④⑤⑥群维系那 19 个字段
  const numFields = new Set();
  for (const m of s.matchAll(/\{ key: '([a-zA-Z0-9_]+)', label: '[^']*', type: 'number' \}/g)) numFields.add(m[1]);
  const covered = new Set();
  for (const m of itemsBlk.matchAll(/'((?:ticket|overseas)\.[a-zA-Z0-9_]+)'/g)) covered.add(m[1].split('.')[1]);
  const uncovered = [...numFields].filter(k => !covered.has(k));
  const expectUncovered = ['g1_wx', 'g1_dy', 'g1_dyol', 'g1_qq', 'g2_wx', 'g2_dy', 'g2_dyol', 'g5_wx', 'g5_dy', 'g5_alipay',
    'g3_wx', 'g3_dy', 'g3_dyol', 'g4_wx', 'g4_dy', 'g4_dyol', 'g6_wx', 'g6_dy', 'g6_dyol'];
  ok(numFields.size === 39 && covered.size === 20, `日报 ${numFields.size} 个数值字段里 20 个计入统计`);
  ok(uncovered.length === expectUncovered.length && expectUncovered.every(k => uncovered.indexOf(k) !== -1),
    '未计入两侧统计的恰好是①②③④⑤⑥群维系那 19 个字段（其余没有算漏）', uncovered);
  // ①~⑥ 群维系（19 个字段）现在完全不采集：群维系只分「异世界」和「（梦幻/繁花/乐缤纷）」两项
  const allCovered = new Set();
  for (const m of (itemsBlk + hiddenBlk).matchAll(/'((?:ticket|overseas)\.[a-zA-Z0-9_]+)'/g)) allCovered.add(m[1].split('.')[1]);
  const notCollected = [...numFields].filter(k => !allCovered.has(k));
  ok(notCollected.length === 19 && expectUncovered.every(k => notCollected.indexOf(k) !== -1),
    '①~⑥群维系 19 个日报字段完全不采集（群维系只留异世界 + 梦幻/繁花/乐缤纷两项）', notCollected);
  ok(/const CAREER_SHEET_ITEMS = \['sj_group', 'catcity', 'dwlz_vip', 'mhl_group'/.test(s) && (s.match(/CAREER_SHEET_ITEMS/g) || []).length >= 3,
    '登记表 14 列口径单列（导入/对账用，群维系那列已归入海外侧统计）');
}
ok(/careerArchiveToday\(\)/.test(s) && /const CAREER_KEY = 'careerData'/.test(s), '客服生涯自动归档已挂 + 存储 key');
ok(/loadData\(CAREER_KEY, null\)/.test(s) && /careerData = normalizeCareer\(b\.careerData\)/.test(s), '客服生涯走服务端持久化（多设备同步）');
ok(/function careerStats\(\)/.test(s) && /function careerImport\(\)/.test(s) && /function careerCsvText\(\)/.test(s), '统计 / 粘贴导入 / CSV 导出 已注入');
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
