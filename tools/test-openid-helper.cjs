/* Gemjy OpenID 助手 单测（当前测的是 0.4.0 那份：public/gemjy-openid-helper-0.4.user.js）
   1) 纯函数层：脚本里的 Node 导出守卫会挡住 DOM / GM 相关代码，require() 直接测
      —— 含 0.4 新增的 isAvatarish / pickAvatar，以及 buildRecord / mergeRecord 的头像语义
   2) 端到端：用 jsdom 造一张假的反馈列表页，把脚本注入进去，断言「头像/昵称/图片/openid」
      真的被提取、卡片式面板真的建出来、而且面板里的 openid 不会被自己再扫一遍
   用法：node tools/test-openid-helper.cjs */
const fs = require('fs');
const path = require('path');
// ⚠️ 0.4.0 走的是**新链接**（文件名带 -0.4），旧链接那份 0.3.0 不动；这里跟着测新那份
const USERSCRIPT_NAME = 'gemjy-openid-helper-0.4.user.js';
const USERSCRIPT = path.join(__dirname, '..', 'public', USERSCRIPT_NAME);
const helper = require(USERSCRIPT);
const SRC = fs.readFileSync(USERSCRIPT, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
    if (cond) { pass++; console.log('  ok   ' + msg); }
    else { fail++; console.log('  FAIL ' + msg + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); }
};
const eq = (got, want, msg) => ok(JSON.stringify(got) === JSON.stringify(want), msg, got);

const OID = (n) => 'o' + String(n).padStart(27, '0');          // 28 位：o + 27
const A = OID(1), B = OID(2), C = OID(3);

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
eq(helper.hasOpenid('abc'), false, 'hasOpenid：没有 → false');
{
    // 容器的 textContent 是拼接的：openid 后面紧跟日期数字时，边界规则会漏掉它。
    // 所以「这个容器里有几个 openid」必须用宽松匹配（distinctIdCount）——这是踩过的坑。
    const blob = 'openid：' + A + '2026-06-03 12:30 openid：' + B;
    eq(helper.openidsIn(blob), [B], '边界规则下 A 后面粘着数字 → 漏掉（这是坑）');
    eq(helper.distinctIdCount(blob), 2, 'distinctIdCount 宽松匹配 → 数出 2 个（找卡片容器用它）');
    eq(helper.distinctIdCount(A + ' ' + A + ' ' + B), 2, 'distinctIdCount 只数不同的');
    eq(helper.distinctIdCount(''), 0, 'distinctIdCount 空串 → 0');
}
ok(helper.CONFIG.openidSource === 'o[A-Za-z0-9_-]{27}', 'openidSource 在 CONFIG 里（可调）');

console.log('--- 2. 行切分 / 时间行 / 噪声行 ---');
eq(helper.linesOf('a\n\n  a  \nb'), ['a', 'b'], '去空行 + 压缩空白 + 去重');
eq(helper.linesOf('x\r\ny'), ['x', 'y'], 'CRLF 也切');
eq(helper.linesOf(null), [], 'null → 空数组');
ok(helper.looksLikeDate('2026-06-03 12:30'), true, '2026-06-03 12:30 是时间行');
ok(helper.looksLikeDate('3 分钟前'), true, '「3 分钟前」是时间行');
ok(!helper.looksLikeDate('登录不了'), '登录不了不是时间行');
ok(helper.isNoiseLine('', {}), true, '空行 = 噪声');
ok(helper.isNoiseLine('12', {}), true, '纯数字 = 噪声');
ok(helper.isNoiseLine('昵称：小明', { openid: A }), true, '昵称行不算问题内容');
ok(helper.isNoiseLine('昵称 小明', { openid: A }), true, '「昵称 空格 值」也不算');
ok(helper.isNoiseLine('openid：' + A, { openid: A }), true, '含 openid 的行不算');
ok(helper.isNoiseLine('2026-06-03 12:30', {}), true, '时间行不算');
ok(helper.isNoiseLine('反馈内容：', {}), true, '只有标签（以冒号结尾）不算');
ok(helper.isNoiseLine('展开', {}), true, '「展开」按钮文字不算');
ok(!helper.isNoiseLine('登录不了，一直转圈', { openid: A }), '正常问题文本要留下');
ok(!helper.isNoiseLine('玩家反馈无法登录', {}), '「玩家反馈…」不能被当成昵称标签行');

console.log('--- 3. 猜昵称 ---');
eq(helper.guessName(['昵称：小明', '登录不了'], A), '小明', '「昵称：值」');
eq(helper.guessName(['微信昵称 阿花', '充值没到账'], A), '阿花', '「微信昵称 空格 值」');
eq(helper.guessName(['openid：' + A, '小明', '登录不了，一直转圈，客服快看看'], A), '小明', '兜底：靠前的短行（且卡里有更长的行）');
eq(helper.guessName(['玩家反馈无法登录，一直转圈'], A), '', '长句子不当昵称');
eq(helper.guessName(['登录不了，一直转圈，客服快看看'], A), '', '只有一行问题时 → 认不出昵称');
eq(helper.guessName([], A), '', '没有行 → 空');
eq(helper.guessName(['openid：' + A, '小明', '登录不了，一直转圈，客服快看看'], A), '小明', '昵称值本身是 openid 时跳过，继续往下找');
eq(helper.cleanName('  阿花： '), '阿花', 'cleanName 去掉首尾空白与结尾冒号');

console.log('--- 4. 取问题 ---');
eq(helper.pickQuestion(['昵称：小明', '登录不了，一直转圈', '2026-06-03 12:30'], { openid: A, name: '小明' }),
    '登录不了，一直转圈', '多条里只剩问题那一行');
eq(helper.pickQuestion(['充值没到账', '订单号 123456'], {}), '充值没到账 订单号 123456', '多行问题按顺序接起来');
eq(helper.pickQuestion(['展开', '收起'], {}), '', '全是噪声 → 空');
{
    const long = '啊'.repeat(500);
    const q = helper.pickQuestion([long], {});
    eq(q.length, helper.CONFIG.maxQuestionLen + 1, '超长问题按 maxQuestionLen 截断（多一个省略号）');
    ok(q.slice(-1) === '…', '截断处补省略号');
}

console.log('--- 5. 图片：绝对化 / 过滤 / 归一 ---');
eq(helper.absolutize('https://mmbiz.qpic.cn/a.png', 'https://mp.weixin.qq.com/x'), 'https://mmbiz.qpic.cn/a.png', '绝对地址原样');
eq(helper.absolutize('//mmbiz.qpic.cn/a.png', 'https://mp.weixin.qq.com/x'), 'https://mmbiz.qpic.cn/a.png', '协议相对地址补 https');
eq(helper.absolutize('/img/a.png', 'https://mp.weixin.qq.com/x'), 'https://mp.weixin.qq.com/img/a.png', '站内绝对路径');
eq(helper.absolutize('img/a.png', 'https://mp.weixin.qq.com/x'), 'https://mp.weixin.qq.com/img/a.png', '相对路径');
eq(helper.absolutize('data:image/png;base64,AAA', 'https://mp.weixin.qq.com/x'), '', 'data URI 丢掉');
eq(helper.absolutize('javascript:void(0)', 'https://mp.weixin.qq.com/x'), '', 'javascript: 丢掉');
eq(helper.absolutize('', 'https://mp.weixin.qq.com/x'), '', '空地址丢掉');
ok(helper.isLikelyImageUrl('https://mmbiz.qpic.cn/feedback/aaa.png'), true, '正常反馈图保留');
ok(!helper.isLikelyImageUrl('https://mp.weixin.qq.com/avatar/default.png'), '头像丢掉');
ok(!helper.isLikelyImageUrl('https://mp.weixin.qq.com/static/icon.png'), '图标丢掉');
ok(!helper.isLikelyImageUrl('https://mmbiz.qpic.cn/a.svg'), 'svg 丢掉');
ok(!helper.isLikelyImageUrl('https://mmbiz.qpic.cn/a.png', { w: 20, h: 20 }), '20×20 小图丢掉');
ok(helper.isLikelyImageUrl('https://mmbiz.qpic.cn/a.png', { w: 120, h: 80 }), true, '带尺寸的正常图保留');
ok(!helper.isLikelyImageUrl('a.png'), '没绝对化过的相对地址不算图片');
{
    const list = [
        { url: 'https://mmbiz.qpic.cn/f/1.png' },
        { url: 'https://mmbiz.qpic.cn/f/1.png' },
        { url: 'https://mp.weixin.qq.com/avatar/x.png' },
        { url: '/f/2.png', base: 'https://mp.weixin.qq.com/x' }
    ];
    const imgs = helper.normalizeImages(list);
    eq(imgs.length, 2, '去重 + 过滤头像（剩 2 张）');
    eq(imgs[1].url, 'https://mp.weixin.qq.com/f/2.png', '归一后是绝对地址');
}
{
    const many = [];
    for (let i = 0; i < 9; i++) many.push({ url: 'https://mmbiz.qpic.cn/f/' + i + '.png' });
    eq(helper.normalizeImages(many).length, helper.CONFIG.maxImages, '超过 maxImages 截断');
}

console.log('--- 5b. 头像：isAvatarish / pickAvatar（0.4 新增）---');
const AVA = 'https://mmbiz.qpic.cn/mmhead/abc/132';          // URL 里带 mmhead → 头像线索；又不撞图片噪声表
{
    ok(helper.isAvatarish({ url: AVA }), true, 'URL 带 mmhead 线索 = 头像');
    ok(helper.isAvatarish({ url: 'https://wx.qlogo.cn/mmopen/vi_32/abc' }), true, 'qlogo 链接 = 头像');
    ok(helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png', hint: 'class="avatar"' }), true, 'class/alt 带 avatar = 头像');
    ok(helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png', hint: '头像' }), true, '中文「头像」也算线索');
    ok(helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png', w: 40, h: 40 }), true, '40×40 方形小图 = 头像（没线索时）');
    ok(helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png', w: 16, h: 16 }), true, '16×16 也在 minAvatarSize 允许范围内');
    ok(!helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png', w: 120, h: 120 }), '120×120 大图不算头像');
    ok(!helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png', w: 8, h: 8 }), '8×8 太小不算头像');
    ok(!helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png', w: 40, h: 120 }), '40×120 不是方形，不算头像');
    ok(!helper.isAvatarish({ url: 'https://mmbiz.qpic.cn/x/a.png' }), '既没线索又没尺寸 → 不算头像');
    ok(!helper.isAvatarish(null), 'null 不抛错');
}
{
    const shot = 'https://mmbiz.qpic.cn/feedback/shot.png';
    eq(helper.pickAvatar([{ url: shot, w: 600, h: 800 }, { url: AVA, w: 40, h: 40 }]), AVA, '多张里挑出头像（大截图不要）');
    eq(helper.pickAvatar([{ url: AVA, w: 40, h: 40 }, { url: 'https://mmbiz.qpic.cn/mmhead/small/132', w: 20, h: 20 }]),
        'https://mmbiz.qpic.cn/mmhead/small/132', '多个头像取面积最小的那个');
    eq(helper.pickAvatar([{ url: shot, w: 600, h: 800 }]), '', '只有截图 → 挑不到头像（空串）');
    eq(helper.pickAvatar([]), '', '空候选 → 空串');
    eq(helper.pickAvatar(null), '', 'null 不抛错');
    eq(helper.pickAvatar([{ url: '/ava/1.png', base: 'https://mp.weixin.qq.com/x', hint: 'avatar' }]),
        'https://mp.weixin.qq.com/ava/1.png', '相对地址先绝对化再挑');
    eq(helper.pickAvatar([{ url: AVA }, { url: AVA }]), AVA, '同一头像重复出现只算一个');
    eq(helper.pickAvatar([{ url: 'data:image/png;base64,AAA', hint: 'avatar' }]), '', 'data URI 不要');
    eq(helper.pickAvatar(['https://mmbiz.qpic.cn/mmhead/str/132']), 'https://mmbiz.qpic.cn/mmhead/str/132', '候选是纯字符串也认');
}

console.log('--- 6. 记录组装 / upsert / 上限 ---');
{
    const r = helper.buildRecord({ openid: A, text: '昵称：小明\n登录不了\n2026-06-03 12:30' });
    eq([r.openid, r.name, r.question, r.images.length], [A, '小明', '登录不了', 0], 'buildRecord 从文本里猜名字与问题');
    ok(r.at > 0 && r.url === '', '带时间戳、url 默认空');
}
{
    const r = helper.buildRecord({ openid: A, name: '  阿花  ', question: '', lines: ['充值没到账'] });
    eq(r.name, '阿花', '显式给的昵称会被 trim');
    eq(r.question, '充值没到账', 'question 为空时用行文本兜底');
}
{
    const img = helper.buildRecord({ openid: A, text: '', images: [{ url: '/f/1.png', base: 'https://mp.weixin.qq.com/x', w: 200, h: 200 }] });
    eq(img.images.length, 1, 'buildRecord 里图片也会归一');
}
{
    // 0.4：头像单独挑，并且不会重复留在截图列表里（截图列表和头像候选是两套输入）
    const r = helper.buildRecord({
        openid: A, text: '昵称：小明',
        images: [{ url: 'https://mmbiz.qpic.cn/feedback/shot.png', w: 600, h: 600 }, { url: AVA, w: 40, h: 40 }],
        avatarCandidates: [{ url: AVA, w: 40, h: 40 }]
    });
    eq(r.avatar, AVA, 'buildRecord 把头像挑进 avatar 字段');
    eq(r.images.map(i => i.url), ['https://mmbiz.qpic.cn/feedback/shot.png'], '头像不会重复出现在截图列表里');
    eq(r.name, '小明', '头像不影响昵称解析');
    eq(helper.buildRecord({ openid: A, text: '', avatarCandidates: [] }).avatar, '', '没给头像候选 → avatar 空串');
    eq(helper.buildRecord({ openid: A, text: '' }).avatar, '', '连 avatarCandidates 都没给 → avatar 空串');
    eq(helper.buildRecord({ openid: A, text: '', avatarCandidates: [{ url: '/ava/1.png', base: 'https://mp.weixin.qq.com/x', hint: 'avatar' }] }).avatar,
        'https://mp.weixin.qq.com/ava/1.png', 'buildRecord 里的头像也会先绝对化');
}
{
    const r1 = { openid: A, name: '小明', question: '登录不了', images: [], at: 1000, url: '' };
    const r2 = { openid: B, name: '阿花', question: '充值没到账', images: [], at: 2000, url: '' };
    const one = helper.mergeRecord([], r1);
    eq(one.length, 1, '空列表插入 → 1 条');
    eq(one[0].hits, 1, '新记录 hits = 1（不是 2）');
    eq(one[0].firstSeen, 1000, '新记录 firstSeen = 自己出现的时间');
    const two = helper.mergeRecord(one, r2);
    eq(two.map(x => x.openid), [B, A], '最新的排最前');
    const again = helper.mergeRecord(two, { openid: A, name: '', question: '登录不了，转圈', images: [], at: 3000, url: '' });
    eq(again.map(x => x.openid), [A, B], '同 openid 更新后提到最前（不新增）');
    const rec = again[0];
    eq(rec.name, '小明', '新记录没名字 → 不覆盖旧名字');
    eq(rec.question, '登录不了，转圈', '更长的（更完整）问题会覆盖旧的');
    eq(rec.hits, 2, 'hits 累加');
    eq(helper.mergeRecord(again, { openid: A, name: '', question: '短', images: [], at: 4000, url: '' })[0].question, '登录不了，转圈', '更短的问题不覆盖旧的');
    eq(helper.mergeRecord([], null).length, 0, 'rec 为空 → 原样返回');
}
{
    // 0.4：mergeRecord 的头像语义（同名字/同问题那套「空值不覆盖旧值」）
    const A2 = 'https://mmbiz.qpic.cn/mmhead/bbb/132';
    const base = { openid: A, name: '小明', avatar: AVA, question: 'q', images: [], at: 1000, url: '' };
    const one = helper.mergeRecord([], base);
    eq(one[0].avatar, AVA, '新记录带头像 → 存下来');
    const noAva = helper.mergeRecord(one, { openid: A, name: '', avatar: '', question: '', images: [], at: 2000, url: '' });
    eq(noAva[0].avatar, AVA, '新记录没头像 → 不覆盖旧头像');
    eq(noAva[0].name, '小明', '（顺带）名字也照旧不被空值覆盖');
    const newAva = helper.mergeRecord(noAva, { openid: A, name: '', avatar: A2, question: '', images: [], at: 3000, url: '' });
    eq(newAva[0].avatar, A2, '新记录换了头像 → 覆盖成新的');
    eq(newAva[0].hits, 3, 'hits 照旧累加');
    eq(helper.mergeRecord([], { openid: B, name: 'b', avatar: '', images: [], at: 1, url: '' })[0].avatar, '', '从没头像就是空串');
    eq(helper.mergeRecord([], { openid: B, images: [], at: 1 })[0].avatar, '', '旧记录没这个字段也不炸（补空串）');
}
{
    const list = [1, 2, 3, 4, 5].map(n => ({ openid: OID(n), name: '', question: '', images: [], at: n, url: '' }));
    eq(helper.capRecords(list, 3).length, 3, 'capRecords 按上限截断（保留最新）');
    eq(helper.capRecords(null, 3), [], 'null → 空数组');
    eq(helper.capRecords(list).length, 5, '不传上限时用 CONFIG.maxItems（这里没超）');
    eq(helper.capRecords([{ openid: '' }, ...list]).length, 5, '没有 openid 的记录被丢掉');
}
eq(helper.openidListText([{ openid: A }, { openid: B }]), A + '\n' + B, '复制全部：一行一个 openid');
eq(helper.openidListText([]), '', '没记录 → 空串');
{
    const d = JSON.parse(helper.diagnosticText({ version: helper.version, items: 2 }));
    eq([d.version, d.items], [helper.version, 2], 'diagnosticText 是合法 JSON 且带版本');
}

console.log('--- 7. 脚本头 / 依赖面（不跨工作台、不联网）---');
{
    const hv = (SRC.match(/\/\/\s*@version\s+([0-9][0-9.]*)/) || [])[1];
    eq(hv, helper.version, `@version(${hv}) 与内部 API.version 一致（否则 Tampermonkey 不提示更新）`);
    eq(hv, '0.4.0', '版本号就是 0.4.0');
    ok(/^\/\/ @match\s+\*:\/\/mp\.weixin\.qq\.com\/\*$/m.test(SRC), '@match 覆盖反馈后台');
    eq((SRC.match(/^\/\/ @match/gm) || []).length, 1, '@match 只有一处（不再进工作台）');
    const meta = (SRC.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/) || [''])[0];
    ok(!!meta, 'UserScript 元数据块在');
    ok(!/@connect/.test(meta), '元数据里没有 @connect（脚本不发任何跨域请求）');
    ok(!/GM_xmlhttpRequest/.test(SRC), '没有 GM_xmlhttpRequest');
    ok(!/[^.\w]fetch\s*\(/.test(SRC), '没有 fetch(');
    ok(!/new XMLHttpRequest|XMLHttpRequest\.prototype/.test(SRC), '没有 XMLHttpRequest');
    // 0.4 走新链接：@updateURL/@downloadURL 都指向 -0.4 那个文件名，且必须跟实际文件名一致
    ok(/@updateURL\s+https:\/\/work-bad\.onrender\.com\/gemjy-openid-helper-0\.4\.user\.js/.test(SRC), '@updateURL 指向 0.4 新链接');
    ok(/@downloadURL\s+https:\/\/work-bad\.onrender\.com\/gemjy-openid-helper-0\.4\.user\.js/.test(SRC), '@downloadURL 也指向同一条新链接');
    eq((SRC.match(/@updateURL\s+\S+\/([^\s/]+)/) || [])[1], USERSCRIPT_NAME, '@updateURL 的文件名 = 实际文件名（新链接别写错）');
    eq((SRC.match(/@downloadURL\s+\S+\/([^\s/]+)/) || [])[1], USERSCRIPT_NAME, '@downloadURL 的文件名 = 实际文件名');
    ok(/@grant\s+GM_setClipboard/.test(SRC), '@grant 里声明了 GM_setClipboard（复制靠它）');
    ok(/@grant\s+GM_setValue/.test(SRC) && /@grant\s+GM_getValue/.test(SRC), '@grant 里声明了 GM 存储（保存靠它）');
    ok(/if \(!isFeedbackHost\(\)\) return;/.test(SRC), '只在反馈后台注入（别的站点直接 return）');
    ok(!/tabsContainer|smartPasteInput|isWorkbenchPage/.test(SRC), '已经没有任何工作台相关代码');
    // 数据不许往工作台存：接口、落盘文件、工作台自己的数据键，一个都不能出现。
    // 只在「去掉整行注释」的代码上看——注释里本来就要说明这些词是刻意不碰的。
    const CODE = SRC.replace(/^[ \t]*\/\/.*$/gm, '');
    ok(!/api\/data/.test(CODE), '不引用工作台接口 /api/data');
    ok(!/data\.json/.test(CODE), '不引用服务端 data.json');
    ok(!/dailyData|careerData|itemNameMap|sourceIdMap|activityTypeMap|work-bad_v2/.test(CODE), '不碰工作台的任何数据键');
    ok(!/localStorage\.(setItem|getItem|removeItem)\(\s*['"]/.test(SRC), 'localStorage 只用变量键（都是 gemjyHelper: 前缀），没有写死别的键');
    eq(typeof helper.runtime.getRecords, 'function', 'runtime 面导出（jsdom 端到端测试用）');
}

console.log('--- 8. 端到端：jsdom 假反馈页 → 头像/昵称/图片/openid 真的提取出来了 ---');
{
    const { JSDOM } = require('jsdom');
    const IMG_OK = 'https://mmbiz.qpic.cn/feedback/aaa.png';
    const page = '<!doctype html><html><body><div class="list">'
        + '<div class="card"><div class="ava"><img class="avatar" src="' + AVA + '" width="40" height="40"></div>'
        + '<div class="who">昵称：小明</div>'
        + '<div class="q">登录不了，一直转圈</div>'
        + '<div class="imgs"><img src="' + IMG_OK + '" width="120" height="120">'
        // 14×14 的小图标：既被图片噪声表（icon）挡在截图外，也不满足 minAvatarSize，不会跟真头像抢
        + '<img src="https://mp.weixin.qq.com/static/icon.png" width="14" height="14"></div>'
        + '<div class="oid">openid：' + A + '</div>'
        + '<div class="t">2026-06-03 12:30</div></div>'
        + '<div class="card"><div class="who">昵称 阿花</div>'
        + '<div class="q">充值没到账</div>'
        + '<div class="oid">openid：' + B + '</div></div>'
        + '</div></body></html>';
    const dom = new JSDOM(page, { url: 'https://mp.weixin.qq.com/mp/feedback', runScripts: 'dangerously' });
    const win = dom.window;
    try {
        win.eval(SRC);
        const H = win.__GEMJY_HELPER__;
        ok(!!H, '脚本在页面里跑起来了（window.__GEMJY_HELPER__ 存在）');
        const recs = H.runtime.getRecords();
        eq(recs.length, 2, '提取到 2 条反馈');
        const byId = {};
        recs.forEach(r => { byId[r.openid] = r; });
        eq(byId[A].name, '小明', 'A：昵称「昵称：小明」认出来了');
        eq(byId[B].name, '阿花', 'B：昵称「昵称 阿花」认出来了');
        eq(byId[A].question, '登录不了，一直转圈', 'A：问题文本干净（没有昵称/时间/openid）');
        eq(byId[B].question, '充值没到账', 'B：问题文本');
        eq(byId[A].images.map(i => i.url), [IMG_OK], 'A：只留下真图，头像被过滤');
        eq(byId[B].images.length, 0, 'B：没图就是 0 张');
        eq(byId[A].avatar, AVA, 'A：头像被单独挑进 avatar');
        eq(byId[B].avatar, '', 'B：没头像 → 空串');
        ok(!byId[A].images.some(i => i.url === AVA), 'A：头像没有重复出现在截图列表里（0.4 的头像/截图分流）');

        const panel = win.document.querySelector('.gj-panel');
        ok(!!panel, '悬浮窗面板建出来了');
        ok(!!win.document.querySelector('.gj-launcher'), '悬浮窗启动按钮建出来了');
        ok(/反馈 2/.test(win.document.querySelector('.gj-launcher').textContent), '启动按钮上显示条数');
        eq(win.document.querySelectorAll('.gj-item').length, 2, '面板里两条记录（卡片式）');
        eq(win.document.querySelectorAll('.gj-item .gj-idrow button').length, 2, '每条一个「复制 openid」按钮');
        eq(win.document.querySelectorAll('.gj-item .gj-ava img').length, 1, '有头像那条渲染了头像图');
        eq(win.document.querySelectorAll('.gj-item .gj-ava.gj-ph').length, 1, '没头像那条退化成昵称首字圆底');
        eq(win.document.querySelector('.gj-item .gj-ava.gj-ph').textContent, '阿', '圆底里是昵称首字');
        eq(win.document.querySelectorAll('.gj-item .gj-q').length, 0, '0.4 面板不再渲染问题文本（问题仍留在记录里）');
        ok(win.document.querySelector('.gj-panel').textContent.indexOf(A) !== -1, '面板里能看到 openid 原文（方便手动选）');

        const saved = JSON.parse(win.localStorage.getItem('gemjyHelper:feedbacks') || 'null');
        eq(saved && saved.records.length, 2, '已存进本地（无 GM 环境时走 localStorage）');
        {
            // 「不往工作台存」的运行时证据：这一页的 localStorage 里只有本脚本带前缀的键
            const keys = [];
            for (let i = 0; i < win.localStorage.length; i++) keys.push(win.localStorage.key(i));
            ok(keys.length > 0 && keys.every(k => k.indexOf('gemjyHelper:') === 0),
                'localStorage 里只写 gemjyHelper: 前缀的键（没碰页面/工作台别的键）', keys);
        }

        // 面板自己显示着 openid —— 把真实卡片删掉后重扫，绝不能把面板里的 openid 又收一遍
        win.document.querySelectorAll('.card').forEach(function (c) { c.parentNode.removeChild(c); });
        H.runtime.state.nodes = {};
        const before = JSON.stringify(H.runtime.getRecords());
        H.runtime.scan();
        eq(JSON.stringify(H.runtime.getRecords()), before, '重扫不会把面板里的 openid 当成新反馈（记录没变）');

        H.runtime.clearAll();
        eq(H.runtime.getRecords().length, 0, '清空后 0 条');
        eq(JSON.parse(win.localStorage.getItem('gemjyHelper:feedbacks')).records.length, 0, '清空也落盘了');
    } finally {
        win.close();
    }

    const dom2 = new JSDOM('<!doctype html><html><body><p>openid ' + C + '</p></body></html>',
        { url: 'https://example.com/x', runScripts: 'dangerously' });
    try {
        dom2.window.eval(SRC);
        eq(dom2.window.document.querySelector('.gj-launcher'), null, '别的站点：不注入启动按钮');
        eq(dom2.window.document.querySelector('.gj-panel'), null, '别的站点：不注入面板');
        eq(dom2.window.__GEMJY_HELPER__.runtime.state.scans, 0, '别的站点：一次都没扫');
    } finally {
        dom2.window.close();
    }
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
