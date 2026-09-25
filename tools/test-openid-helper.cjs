/* Gemjy OpenID 助手 单测：只测纯函数层（脚本里 Node 导出守卫会挡住 DOM/GM 相关代码）
   用法：node tools/test-openid-helper.cjs */
const helper = require('../public/gemjy-openid-helper.user.js');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
    if (cond) { pass++; console.log('  ok   ' + msg); }
    else { fail++; console.log('  FAIL ' + msg + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); }
};
const eq = (got, want, msg) => ok(JSON.stringify(got) === JSON.stringify(want), msg, got);

const OID = (n) => 'o' + String(n).padStart(27, '0');          // 28 位：o + 27
const A = OID(1), B = OID(2);

console.log('--- 1. openid 抽取（边界 + 去重）---');
eq(helper.openidsIn(A), [A], '单个 openid');
eq(helper.openidsIn('前缀' + A + '后缀'), [A], '夹在中文里也能抽');
eq(helper.openidsIn(A + ' ' + B + ' ' + A), [A, B], '两个 + 去重');
eq(helper.openidsIn('x' + A), [], '前面粘着字符（长串的一部分）不吃');
eq(helper.openidsIn(A + 'x'), [], '后面粘着字符不吃');
eq(helper.openidsIn('o' + '0'.repeat(26)), [], '只有 27 位（少一位）不吃');
eq(helper.openidsIn('o' + '0'.repeat(28)), [], '29 位长串不吃');
eq(helper.openidsIn(''), [], '空串');
eq(helper.openidsIn(null), [], 'null 不抛错');
eq(helper.openidsIn('{"openid":"' + A + '","name":"x"}'), [A], '从 JSON 文本里抽');
ok(helper.CONFIG.openidSource === 'o[A-Za-z0-9_-]{27}', 'openidSource 在 CONFIG 里（可调）');

console.log('--- 2. B 端输入解析 ---');
eq(helper.parseIds('一段日志 ' + A + ' 中间还有 ' + B), [A, B], '先按正则抽（忽略其它字符）');
eq(helper.parseIds('uid-1\nuid-2\nuid-1\n'), ['uid-1', 'uid-2'], '抽不到 openid → 一行一个 id 兜底 + 去重');
eq(helper.parseIds('  "abc"  \n [def]\n'), ['abc', 'def'], '兜底时去掉包裹的引号/方括号');
eq(helper.parseIds('\n\n'), [], '全空行 → 空数组');

console.log('--- 3. JSON 归一（pickRole）---');
const j1 = helper.parseResponse(JSON.stringify({ code: 0, data: { nickname: '小明', uid: 123456, server: 'S1-龙腾', platform: 'iOS' } }));
eq(j1.kind, 'json', '整段 JSON 被识别');
eq(helper.pickRole(j1.pairs), { nickname: '小明', uid: '123456', server: 'S1-龙腾', platform: 'iOS' }, '嵌套 data 里的字段被摊平并归一');
const j2 = helper.parseResponse('{"result":{"role_name":"阿花","role_id":99}}');
eq(helper.pickRole(j2.pairs), { nickname: '阿花', uid: '99' }, '别名 role_name / role_id 也认');
const j3 = helper.parseResponse('garbage {"data":{"昵称":"小花","区服":"S2"}} trailing');
eq(j3.kind, 'json', '内嵌 JSON（前后有杂字符）也能捞出来');
eq(helper.pickRole(j3.pairs), { nickname: '小花', server: 'S2' }, '中文键名也认');

console.log('--- 4. HTML 三种渲染 ---');
const htmlAdj = '<table><tr><th>昵称</th><td>小明</td></tr><tr><th>UID</th><td>123</td></tr><tr><th>区服</th><td>S1</td></tr></table>';
const r4a = helper.pickRole(helper.extractPairsFromHtml(htmlAdj));
eq([r4a.nickname, r4a.uid, r4a.server], ['小明', '123', 'S1'], '相邻两列 th/td');
const htmlCross = '<table><tr><th>昵称</th><td>小明</td><th>区服</th><td>S1</td></tr><tr><th>UID</th><td>123</td><th>平台</th><td>安卓</td></tr></table>';
const r4b = helper.pickRole(helper.extractPairsFromHtml(htmlCross));
eq([r4b.nickname, r4b.server, r4b.uid, r4b.platform], ['小明', 'S1', '123', '安卓'], '4 列交叉布局');
const r4c = helper.pickRole(helper.extractPairsFromHtml('<div>昵称：小明</div><div>UID：123</div>'));
eq([r4c.nickname, r4c.uid], ['小明', '123'], '「标签：值」渲染');
const r4d = helper.pickRole(helper.extractPairsFromHtml('<div>昵称 小明</div><div>UID 123</div>'));
eq([r4d.nickname, r4d.uid], ['小明', '123'], '「标签 空格 值」渲染');
const r4e = helper.pickRole(helper.extractPairsFromHtml('<table><tr><td>昵称</td><td>小明</td></tr></table>'));
eq(r4e.nickname, '小明', 'td/td 但左列像标签时也成对');
const htmlEsc = helper.pickRole(helper.extractPairsFromHtml('<tr><th>昵称</th><td>&lt;小明&gt; &amp; 阿花</td></tr>'));
eq(htmlEsc.nickname, '<小明> & 阿花', 'HTML 实体被还原');

console.log('--- 5. 登录页识别与 classify ---');
ok(helper.isLoginPage('请先登录后再操作', 'https://operator.gemjy.cn/api/player'), '文案「请先登录」');
ok(helper.isLoginPage('', 'https://operator.gemjy.cn/login?redirect=1'), 'URL 命中 login');
ok(helper.isLoginPage('{"code":401,"msg":"token 失效"}', ''), 'JSON code 401');
ok(!helper.isLoginPage(JSON.stringify({ data: { nickname: '小明' } }), 'https://operator.gemjy.cn/api/player'), '正常响应不算登录页');
eq(helper.classify(JSON.stringify({ data: { nickname: '小明', uid: 1 } }), ''), 'ok', '有角色 → ok');
eq(helper.classify('请先登录', ''), 'login', '登录页 → login');
eq(helper.classify(JSON.stringify({ code: 0, data: null }), ''), 'empty', '合法但没有角色 → empty');
eq(helper.classify('', ''), 'empty', '空响应 → empty');
eq(helper.classify('<html><body>呃…什么都没有</body></html>', ''), 'empty', 'HTML 里没角色 → empty');

console.log('--- 6. buildRequest ---');
const specGet = { method: 'GET', url: 'https://operator.gemjy.cn/api/player?openid={id}' };
const rq1 = helper.buildRequest(specGet, A);
eq(rq1.method, 'GET', 'GET 方法');
eq(rq1.url, 'https://operator.gemjy.cn/api/player?openid=' + A, 'GET 的 {id} 被 URL 编码替换');
ok(rq1.data === undefined, 'GET 不带 body');
const rq2 = helper.buildRequest({ method: 'post', url: 'https://x/api', data: '{"openid":"{id}"}', headers: { 'Content-Type': 'application/json' } }, A);
eq(rq2.method, 'POST', 'method 统一大写');
eq(rq2.data, '{"openid":"' + A + '"}', 'body 里的 {id} 原样替换');
eq(rq2.headers['Content-Type'], 'application/json', 'headers 透传');
const rq3 = helper.buildRequest({ url: 'https://x/api?o={id}' });
eq(rq3.method, 'GET', '不写 method 默认 GET');

console.log('--- 7. toCsv ---');
const csv = helper.toCsv([{ a: 'x,y', b: 'he said "hi"', c: 'line1\nline2' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]);
ok(csv.charCodeAt(0) === 0xFEFF, '带 BOM（Excel 直接开）');
ok(csv.indexOf('"x,y"') !== -1, '逗号被引号包裹');
ok(csv.indexOf('"he said ""hi"""') !== -1, '引号被转义成双写');
ok(csv.indexOf('"line1\nline2"') !== -1, '换行被引号包裹');
ok(csv.indexOf('\r\n') !== -1, 'CRLF 行尾');
const csv2 = helper.toCsv([], ['a', 'b']);
eq(csv2.replace('\ufeff', ''), 'a,b', '空行只出表头');

console.log('--- 8. 导出面（Node 下不该碰 DOM/GM）---');
eq(typeof helper.lookup, 'function', 'lookup 被导出（共享查询函数）');
eq(typeof helper.enqueue, 'function', 'enqueue 被导出（队列）');
eq(typeof helper.calibrationText, 'function', 'calibrationText 被导出（校准）');
eq(helper.CONFIG.concurrency, 2, '并发默认 2');
eq(helper.CONFIG.cacheTtlMs, 10 * 60 * 1000, '缓存 TTL 10 分钟');
ok(Array.isArray(helper.CONFIG.requestCandidates) && helper.CONFIG.requestCandidates.length === 6, '6 种候选请求形态');
ok(helper.STATUS_TEXT.login === '未登录' && helper.STATUS_TEXT.uncalibrated === '待校准', '状态机文案');

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
