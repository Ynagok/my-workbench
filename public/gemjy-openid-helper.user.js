/* eslint-disable */
// ==UserScript==
// @name         Gemjy OpenID 助手
// @namespace    work-bad/gemjy-openid-helper
// @version      0.3.0
// @description  反馈后台：把每条反馈的「昵称 / 问题 / 图片 / openid」提取出来存进右下角悬浮窗，一键复制 openid。不跨工作台、不联网查询。
// @author       work-bad
// @run-at       document-start
// @match        *://mp.weixin.qq.com/*
// @updateURL    https://work-bad.onrender.com/gemjy-openid-helper.user.js
// @downloadURL  https://work-bad.onrender.com/gemjy-openid-helper.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==
//
// 它只做一件事：在反馈后台（mp.weixin.qq.com）把每条反馈的
//   昵称 / 问题 / 图片 / openid
// 提取出来，存进右下角悬浮窗；客服点「复制 openid」拿走，去别处粘贴查询。
//
// 它不做的事（刻意为之）：
//   · 不查 operator、不发任何网络请求（所以不需要 @connect，也不会掉登录/跨域）
//   · 不碰工作台页面（@match 只有 mp.weixin.qq.com 一处）
//   · 数据**不往工作台存**：不碰 /api/data、不碰 data.json、不碰工作台的 localStorage
//     数据键（dailyData / careerData / …），也不写进仓库里任何日志或文件 ——
//     只落在本机浏览器：GM_setValue（没有 GM 环境时退化成本域名 localStorage），
//     键名统一带 gemjyHelper: 前缀，跟反馈页自己的存储不会混。
//
// 数据存在 GM_setValue('gemjyHelper:feedbacks')，
// 关掉页面再开还在，最多留 CONFIG.maxItems 条（最新在前）。
//
// 提取不准时：点悬浮窗的「诊断」，把复制到的 JSON 发我 —— 里面有第一条反馈的原始
// 文本与 HTML 片段，照着调 CONFIG / guessName / pickQuestion / isNoiseLine 的
// 启发式就行（纯函数层，tools/test-openid-helper.cjs 有单测）。
// 安装：Tampermonkey → 新建 → 粘本文件；或直接打开
//   https://work-bad.onrender.com/gemjy-openid-helper.user.js
// （已声明 @updateURL/@downloadURL，改完这个文件并部署，脚本会自动提示更新。）

(function () {
    'use strict';

    // ==================== CONFIG（集中可调；改这里不需要动逻辑代码） ====================
    const CONFIG = {
        // openid 形态：o + 27 位
        openidSource: 'o[A-Za-z0-9_-]{27}',

        // 保存上限（最新在前，超出丢最旧的）
        maxItems: 300,

        // 每条反馈最多保留几张图 / 问题文本最长多少字
        maxImages: 6,
        maxQuestionLen: 400,

        // 小于这个边长的图片当图标/头像丢掉（拿不到尺寸时不丢）
        minImageSize: 40,

        // 兜底猜昵称时的长度上限
        nameMaxLen: 16,

        // 页面变化后重扫的节流间隔
        scanThrottleMs: 1200,

        // 扫到新反馈就自动展开悬浮窗
        autoOpenPanel: true,

        debug: false
    };

    // ==================== 纯函数层（Node 单测对象：不得引用 document / GM_*） ====================

    // 从一个字符串里抽 openid（去重，带左右边界，别把长串的一部分当 openid）
    function openidsIn(text) {
        const s = (text === null || text === undefined) ? '' : String(text);
        const re = new RegExp(CONFIG.openidSource, 'g');
        const out = [];
        const seen = Object.create(null);
        let m;
        while ((m = re.exec(s)) !== null) {
            const id = m[0];
            const before = m.index > 0 ? s.charAt(m.index - 1) : '';
            const after = s.charAt(m.index + id.length);
            if (/[A-Za-z0-9_-]/.test(before) || /[A-Za-z0-9_-]/.test(after)) continue;   // 前后还粘着字符 → 是长串的一部分
            if (seen[id]) continue;
            seen[id] = 1;
            out.push(id);
        }
        return out;
    }

    function hasOpenid(text) { return openidsIn(text).length > 0; }

    // 数一个容器里有几个「不同」的 openid。这里不能用 openidsIn 的边界规则：
    // 容器的 textContent 是拼接出来的，openid 后面紧跟着日期数字（…00012026-06-03）
    // 会被当成「长串的一部分」而漏掉，于是容器一路爬到了 body。数个数用宽松匹配。
    function distinctIdCount(text) {
        const s = (text === null || text === undefined) ? '' : String(text);
        const re = new RegExp(CONFIG.openidSource, 'g');
        const seen = Object.create(null);
        let n = 0, m;
        while ((m = re.exec(s)) !== null) {
            if (seen[m[0]]) continue;
            seen[m[0]] = 1;
            n++;
        }
        return n;
    }

    // 文本 → 行（去空行、压缩空白、去重）
    function linesOf(text) {
        const s = (text === null || text === undefined) ? '' : String(text);
        const out = [];
        s.replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
            const t = raw.replace(/[ \t\u00a0\u3000]+/g, ' ').trim();
            if (!t) return;
            if (out.indexOf(t) !== -1) return;
            out.push(t);
        });
        return out;
    }

    // 「2026-06-03」「6月3日」「12:30」「3 分钟前」这类时间行
    const DATE_RE = /(\d{4}\s*[-/年.]\s*\d{1,2}\s*[-/月.]\s*\d{1,2}|\d{1,2}\s*[-/月.]\s*\d{1,2}\s*日?|\d{1,2}:\d{2}(:\d{2})?|\d+\s*(分钟|小时|天)前|刚刚|昨天|今天)/;
    function looksLikeDate(text) { return DATE_RE.test(String(text === null || text === undefined ? '' : text)); }

    // 昵称标签：带冒号的宽松（「玩家：小明」），不带冒号的只认「以…名/昵称结尾」的（免得「玩家反馈无法登录」被当成昵称）
    const NAME_LABELS_COLON = ['微信昵称', '玩家昵称', '游戏昵称', '昵称', '角色名', '角色', '玩家名', '玩家', '用户名', '用户', '姓名', '游戏名'];
    const NAME_LABELS_TIGHT = ['微信昵称', '玩家昵称', '游戏昵称', '昵称', '角色名', '玩家名', '用户名', '游戏名', '姓名'];
    const NAME_COLON_RE = new RegExp('^(?:' + NAME_LABELS_COLON.join('|') + ')\\s*[:：]\\s*(.*)$');
    const NAME_TIGHT_RE = new RegExp('^(?:' + NAME_LABELS_TIGHT.join('|') + ')\\s+([^\\s:：].*)$');

    // 「只有标签」或纯 UI 的行：这种行不算「问题」内容
    const NOISE_EXACT = ['昵称', '微信昵称', '玩家昵称', '角色名', '角色的名', '玩家名', '用户名', '姓名', 'openid', 'uid', 'id', '账号', '区服', '服务器', '平台', '系统', '渠道', '微信号', '时间', '类型', '状态', '来源', '操作', '反馈内容', '反馈描述', '问题描述', '问题', '描述', '内容', '反馈', '诉求', '备注', '补充', '详情', '图片', '截图', '附件', '全部', '暂无'];
    const NOISE_PART = ['展开', '收起', '查看详情', '查看更多', '点击查看', '更多', '暂无', '加载中', 'loading', '已读', '未读'];

    function isNoiseLine(line, opts) {
        const t = String(line === null || line === undefined ? '' : line).trim();
        if (!t) return true;
        const o = opts || {};
        if (o.openid && t.indexOf(o.openid) !== -1) return true;      // 含 openid 的行不参与
        if (o.name && t === o.name) return true;                      // 昵称行本身不算问题
        if (openidsIn(t).length) return true;
        if (NAME_COLON_RE.test(t) || NAME_TIGHT_RE.test(t)) return true;
        if (/^[\s\d.、)）(（\-—:：]*$/.test(t)) return true;            // 纯数字 / 序号
        if (/[:：]$/.test(t)) return true;                             // 「昵称：」这种只有标签的行
        if (looksLikeDate(t) && t.length <= 24) return true;
        const low = t.toLowerCase();
        if (NOISE_EXACT.some(function (w) { return low === w.toLowerCase(); })) return true;
        if (t.length <= 12 && NOISE_PART.some(function (w) { return low.indexOf(w.toLowerCase()) !== -1; })) return true;
        return false;
    }

    function cleanName(v) {
        let t = String(v === null || v === undefined ? '' : v).trim();
        t = t.replace(/[:：\s]+$/, '').trim();
        if (!t) return '';
        if (openidsIn(t).length) return '';
        if (t.length > 32) t = t.slice(0, 32);
        return t;
    }

    // 昵称：① 找「昵称：xxx」/「昵称 xxx」这种标签行 ② 兜底取靠前的短行（要求卡里还有更长的行当问题）
    function guessName(lines, openid) {
        const ls = Array.isArray(lines) ? lines : [];
        for (let i = 0; i < ls.length; i++) {
            let m = NAME_COLON_RE.exec(ls[i]);
            if (m) { const v = cleanName(m[1]); if (v) return v; }
            m = NAME_TIGHT_RE.exec(ls[i]);
            if (m) { const v = cleanName(m[1]); if (v) return v; }
        }
        const cands = ls.filter(function (t) { return !isNoiseLine(t, { openid: openid }); });
        for (let i = 0; i < cands.length && i < 3; i++) {
            const t = cands[i];
            if (t.length < 2 || t.length > CONFIG.nameMaxLen) continue;
            if (/[\s，。！？；、,.!?;:：]/.test(t)) continue;
            const hasLonger = cands.some(function (x) { return x.length >= t.length + 6; });
            if (hasLonger) return t;
        }
        return '';
    }

    // 问题：把非噪声行按文档顺序接起来（截图里那行「反馈内容：xxx」会被保留，只丢掉标签/时间/按钮文字）
    function pickQuestion(lines, opts) {
        const o = opts || {};
        const cands = (Array.isArray(lines) ? lines : []).filter(function (l) { return !isNoiseLine(l, o); });
        let out = cands.join(' ').replace(/\s+/g, ' ').trim();
        if (out.length > CONFIG.maxQuestionLen) out = out.slice(0, CONFIG.maxQuestionLen) + '…';
        return out;
    }

    // 相对地址 → 绝对地址（data:/javascript: 一律不要，反馈图不可能是内联的）
    function absolutize(url, base) {
        let u = String(url === null || url === undefined ? '' : url).trim();
        if (!u) return '';
        u = u.replace(/^['"]+|['"]+$/g, '').trim();
        if (!u) return '';
        if (/^(data|javascript|about|blob):/i.test(u)) return '';
        if (u.indexOf('//') === 0) return 'https:' + u;
        if (/^https?:\/\//i.test(u)) return u;
        const m = /^(https?:\/\/[^/]+)/i.exec(String(base || ''));
        if (!m) return '';
        if (u.charAt(0) === '/') return m[1] + u;
        return m[1] + '/' + u.replace(/^\.?\//, '');
    }

    const IMG_NOISE_RE = /(avatar|headimg|head_img|headpic|icon|sprite|emoji|logo|qrcode|qr_code|loading|placeholder|blank|transparent|default_|no_img|1x1|pixel)/i;
    function isLikelyImageUrl(url, size) {
        const u = String(url === null || url === undefined ? '' : url).trim();
        if (!u) return false;
        if (!/^https?:\/\//i.test(u)) return false;
        if (/\.svg(\?|#|$)/i.test(u)) return false;
        if (IMG_NOISE_RE.test(u)) return false;
        const s = size || {};
        const w = Number(s.w) || 0;
        const h = Number(s.h) || 0;
        if (w && h && (w < CONFIG.minImageSize || h < CONFIG.minImageSize)) return false;
        return true;
    }

    // [{url, w, h, base}] → [{url, w, h}]：去重、过滤图标/头像、截断到 maxImages
    function normalizeImages(list) {
        const out = [];
        const seen = Object.create(null);
        (Array.isArray(list) ? list : []).forEach(function (it) {
            const src = (typeof it === 'string') ? { url: it } : (it || {});
            const u = absolutize(src.url, src.base);
            if (!u || seen[u]) return;
            const size = { w: src.w, h: src.h };
            if (!isLikelyImageUrl(u, size)) return;
            seen[u] = 1;
            out.push({ url: u, w: Number(src.w) || 0, h: Number(src.h) || 0 });
        });
        return out.slice(0, CONFIG.maxImages);
    }

    // 一条反馈记录：没给名字/问题就用启发式从文本里猜
    function buildRecord(input) {
        const o = input || {};
        const openid = String(o.openid || '');
        const lines = Array.isArray(o.lines) ? linesOf(o.lines.join('\n')) : linesOf(o.text);
        const name = cleanName(o.name) || guessName(lines, openid);
        const question = (o.question === undefined || o.question === null || o.question === '')
            ? pickQuestion(lines, { openid: openid, name: name })
            : String(o.question);
        return {
            openid: openid,
            name: name,
            question: question,
            images: normalizeImages(o.images || []),
            url: String(o.url || ''),
            at: Number(o.at) || Date.now()
        };
    }

    // 按 openid upsert：新的排最前；已有的更新后也提到最前；空值不覆盖旧值
    function mergeRecord(list, rec) {
        const arr = Array.isArray(list) ? list : [];
        if (!rec || !rec.openid) return arr.slice();
        const old = arr.filter(function (r) { return r && r.openid === rec.openid; })[0] || null;
        const rest = arr.filter(function (r) { return r && r.openid !== rec.openid; });
        const merged = {
            openid: rec.openid,
            name: rec.name || (old && old.name) || '',
            question: (rec.question && rec.question.length >= String((old && old.question) || '').length)
                ? rec.question : String((old && old.question) || ''),
            images: (rec.images && rec.images.length) ? rec.images : ((old && old.images) || []),
            url: rec.url || (old && old.url) || '',
            at: rec.at || (old && old.at) || Date.now(),
            firstSeen: old ? (old.firstSeen || old.at || rec.at) : (rec.at || Date.now()),
            hits: old ? (((old.hits) || 1) + 1) : 1
        };
        rest.unshift(merged);
        return rest;
    }

    // 保存上限（最新在前，超出丢尾部）
    function capRecords(list, max) {
        const arr = Array.isArray(list) ? list.filter(function (r) { return r && r.openid; }) : [];
        return arr.slice(0, Number(max) > 0 ? Number(max) : CONFIG.maxItems);
    }

    // 「复制全部 openid」用（一行一个，顺序同面板：最新在前）
    function openidListText(records) {
        return (Array.isArray(records) ? records : [])
            .map(function (r) { return (r && r.openid) || ''; })
            .filter(Boolean)
            .join('\n');
    }

    // 诊断信息（提取不准时复制给开发改启发式）
    function diagnosticText(info) {
        return JSON.stringify(info || {}, null, 2);
    }

    // ==================== 存储 / 状态（Node 下也定义，但不碰 GM_*、不碰 DOM） ====================
    // ⚠️ 只落在本机浏览器（GM 存储，或本域名 localStorage）。
    // 前缀 gemjyHelper: 有两个用处：① 跟反馈页自己的 localStorage 键区分开
    // ② 单测可以直接断言「这一页的 localStorage 里只有本脚本的键」——见 test-openid-helper.cjs。
    // 绝不要把这些数据发去工作台（/api/data ↔ data.json），那是工作台自己的业务数据。
    const KEY = { records: 'gemjyHelper:feedbacks', ui: 'gemjyHelper:panelUi' };

    function gmGet(key) {
        try {
            if (typeof GM_getValue === 'function') {
                const v = GM_getValue(key, '');
                return (v === undefined || v === null) ? '' : v;
            }
            if (typeof localStorage !== 'undefined') {
                const v = localStorage.getItem(key);
                return v === null ? '' : v;
            }
        } catch (_) { }
        return '';
    }
    function gmSet(key, val) {
        try {
            if (typeof GM_setValue === 'function') { GM_setValue(key, val); return; }
            if (typeof localStorage !== 'undefined') localStorage.setItem(key, val);
        } catch (_) { }
    }
    function gmDel(key) {
        try {
            if (typeof GM_deleteValue === 'function') { GM_deleteValue(key); return; }
            if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        } catch (_) { }
    }

    const store = {
        get: function (key, dflt) {
            const raw = gmGet(key);
            if (raw === '' || raw === null || raw === undefined) return dflt;
            try { return JSON.parse(raw); } catch (_) { return dflt; }
        },
        set: function (key, val) { try { gmSet(key, JSON.stringify(val)); } catch (_) { } },
        del: function (key) { gmDel(key); }
    };

    const state = {
        records: [],        // 最新在前
        nodes: {},          // openid → 已提取过的容器元素（同一容器不重复提取）
        scans: 0,
        lastScanAt: 0,
        open: true,
        userClosed: false,
        panel: null,
        launcher: null,
        toast: null,
        toastTimer: null,
        listBox: null,
        countBox: null
    };

    function dbg() {
        if (!CONFIG.debug || typeof console === 'undefined') return;
        const a = Array.prototype.slice.call(arguments);
        console.log.apply(console, ['[gemjy]'].concat(a));
    }

    function getRecords() { return state.records.slice(); }
    function recordOf(openid) {
        return state.records.filter(function (r) { return r && r.openid === openid; })[0] || null;
    }

    function loadRecords() {
        const saved = store.get(KEY.records, null);
        const list = (saved && Array.isArray(saved.records)) ? saved.records : (Array.isArray(saved) ? saved : []);
        state.records = capRecords(list);
        const ui = store.get(KEY.ui, null);
        if (ui && typeof ui.open === 'boolean') { state.open = ui.open; state.userClosed = !ui.open; }
        if (!CONFIG.autoOpenPanel) { state.open = false; state.userClosed = true; }
    }
    function saveRecords() {
        store.set(KEY.records, { t: Date.now(), records: capRecords(state.records) });
    }
    function saveUi() {
        store.set(KEY.ui, { open: !!state.open });
    }
    function clearAll() {
        state.records = [];
        state.nodes = {};
        saveRecords();
        renderPanel();
        updateLauncher();
    }

    // ==================== 剪贴板 / 小工具 ====================
    function copyText(text) {
        const t = String(text === null || text === undefined ? '' : text);
        if (!t) return false;
        try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(t, 'text'); return true; } } catch (_) { }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(t);
                return true;
            }
        } catch (_) { }
        try {
            const ta = document.createElement('textarea');
            ta.value = t;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(ta);
            ta.select();
            const done = document.execCommand && document.execCommand('copy');
            document.body.removeChild(ta);
            return !!done;
        } catch (_) { return false; }
    }

    function toast(msg) {
        try {
            if (!state.toast) {
                state.toast = mkEl('div', 'gj-toast', '');
                document.body.appendChild(state.toast);
            }
            state.toast.textContent = msg;
            state.toast.style.display = '';
            if (state.toastTimer) clearTimeout(state.toastTimer);
            state.toastTimer = setTimeout(function () {
                if (state.toast) state.toast.style.display = 'none';
            }, 1500);
        } catch (_) { }
    }

    function clockOf(ts) {
        try {
            const d = new Date(Number(ts) || Date.now());
            const p = function (n) { return (n < 10 ? '0' : '') + n; };
            return p(d.getHours()) + ':' + p(d.getMinutes());
        } catch (_) { return ''; }
    }

    function addStyle(css) {
        try {
            if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; }
            const el = document.createElement('style');
            el.textContent = css;
            (document.head || document.documentElement).appendChild(el);
        } catch (_) { }
    }

    function mkEl(tag, cls, text) {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined && text !== null) el.textContent = text;
        return el;
    }

    // ==================== DOM 层：从反馈页提取 ====================
    function isFeedbackHost() {
        try { return /(^|\.)mp\.weixin\.qq\.com$/.test(location.hostname); } catch (_) { return false; }
    }

    const BLOCK_TAGS = {
        DIV: 1, P: 1, LI: 1, UL: 1, OL: 1, TR: 1, TD: 1, TH: 1, TABLE: 1, TBODY: 1, THEAD: 1,
        SECTION: 1, ARTICLE: 1, HEADER: 1, FOOTER: 1, ASIDE: 1, MAIN: 1, NAV: 1, BR: 1, HR: 1,
        H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, PRE: 1, FIGURE: 1, DL: 1, DD: 1, DT: 1, IMG: 1
    };

    function textOf(el) {
        if (!el) return '';
        try { if (el.innerText) return String(el.innerText); } catch (_) { }
        try { return String(el.textContent || ''); } catch (_) { return ''; }
    }

    // 容器的可见文本 → 行。真浏览器走 innerText（自带换行）；
    // innerText 不可用（jsdom 等）时按块级元素边界自己插换行。
    function domLinesOf(el) {
        if (!el) return [];
        let t = '';
        try { t = el.innerText || ''; } catch (_) { }
        if (t) return linesOf(t);
        let out = '';
        const walk = function (n) {
            if (!n) return;
            if (n.nodeType === 3) { out += n.nodeValue; return; }
            if (n.nodeType !== 1) return;
            const tag = String(n.tagName || '').toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') return;
            if (tag === 'IMG') { out += '\n'; return; }
            const block = !!BLOCK_TAGS[tag];
            if (block) out += '\n';
            for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
            if (block) out += '\n';
        };
        walk(el);
        return linesOf(out);
    }

    // 显式 display:none 才当不可见（jsdom 没有布局，不能用 offsetParent）
    function isVisible(el) {
        try {
            if (!el || !el.isConnected) return false;
            if (el.hidden) return false;
            if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
            let n = el;
            for (let i = 0; n && n.nodeType === 1 && i < 6; i++) {
                const st = n.getAttribute && n.getAttribute('style');
                if (st && /display\s*:\s*none/i.test(st)) return false;
                n = n.parentElement;
            }
            if (typeof el.checkVisibility === 'function') { try { return el.checkVisibility(); } catch (_) { } }
            return true;
        } catch (_) { return true; }
    }

    // 找 openid 所在的「一条反馈」容器：一路向上，直到这个祖先里出现第二个不同 openid
    // （或文本过长）为止 —— 再往上一层就是整张列表了。
    function findItemContainer(node) {
        let el = node && node.parentElement;
        let best = el;
        for (let i = 0; el && i < 14; i++) {
            const text = textOf(el);
            if (distinctIdCount(text) > 1) break;
            if (text.length > 2000) break;
            best = el;
            el = el.parentElement;
        }
        return best || (node && node.parentElement) || null;
    }

    // 容器里的图片：img 的 src/懒加载属性 + 内联 background-image + 指向图片的链接
    function imagesOf(el, base) {
        const out = [];
        if (!el || !el.querySelectorAll) return out;
        const push = function (url, w, h) { if (url) out.push({ url: url, w: w || 0, h: h || 0, base: base }); };
        try {
            el.querySelectorAll('img').forEach(function (img) {
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (img.currentSrc) push(img.currentSrc, w, h);
                ['src', 'data-src', 'data-original', 'data-url', 'data-lazy-src', 'data-echo'].forEach(function (attr) {
                    const v = img.getAttribute ? img.getAttribute(attr) : '';
                    if (v) push(v, w, h);
                });
            });
        } catch (_) { }
        try {
            el.querySelectorAll('a[href]').forEach(function (a) {
                const href = a.getAttribute('href') || '';
                if (/\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(href)) push(href, 0, 0);
            });
        } catch (_) { }
        try {
            el.querySelectorAll('[style*="url("]').forEach(function (n) {
                const st = n.getAttribute('style') || '';
                const re = /url\((['"]?)([^'")]+)\1\)/gi;
                let m;
                while ((m = re.exec(st)) !== null) push(m[2], 0, 0);
            });
        } catch (_) { }
        return out;
    }

    const REFLECT = ['.gj-panel', '.gj-launcher', '.gj-toast'];

    function insideOwnUi(node) {
        try {
            const el = node && (node.nodeType === 1 ? node : node.parentElement);
            if (!el || !el.closest) return false;
            return !!el.closest(REFLECT.join(','));
        } catch (_) { return false; }
    }

    function scan() {
        state.scans++;
        state.lastScanAt = Date.now();
        let added = 0;
        try {
            if (!document.body) return;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: function (n) {
                    const p = n.parentElement;
                    if (!p) return NodeFilter.FILTER_REJECT;
                    const tag = String(p.tagName || '').toLowerCase();
                    if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
                    if (insideOwnUi(p)) return NodeFilter.FILTER_REJECT;    // 别把自己面板里的 openid 又扫一遍
                    if (!isVisible(p)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let n;
            while ((n = walker.nextNode())) {
                const ids = openidsIn(n.nodeValue);
                if (!ids.length) continue;
                const box = findItemContainer(n);
                if (!box) continue;
                ids.forEach(function (id) {
                    if (state.nodes[id] === box && recordOf(id)) return;    // 同一容器已提取过
                    state.nodes[id] = box;
                    const rec = buildRecord({
                        openid: id,
                        lines: domLinesOf(box),
                        images: imagesOf(box, location.href),
                        url: location.href
                    });
                    state.records = mergeRecord(state.records, rec);
                    added++;
                });
            }
        } catch (e) { dbg('scan 失败', e); }
        if (added) {
            saveRecords();
            if (CONFIG.autoOpenPanel && !state.userClosed) state.open = true;
            renderPanel();
            updateLauncher();
            dbg('新增 ' + added + ' 条');
        } else {
            renderPanel();
        }
    }

    // ==================== DOM 层：悬浮窗 ====================
    const CSS = [
        '.gj-launcher{position:fixed;right:16px;bottom:16px;z-index:2147483000;padding:8px 13px;border-radius:999px;',
        'border:1px solid #1a7f45;background:#1a7f45;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);',
        'font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;white-space:nowrap}',
        '.gj-launcher.gj-off{background:#fff;color:#1a7f45}',
        '.gj-panel{position:fixed;right:16px;bottom:62px;width:382px;max-width:94vw;max-height:72vh;z-index:2147483001;',
        'background:#fff;border:1px solid #dcdcdc;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);',
        'font:13px/1.7 -apple-system,"Microsoft YaHei",sans-serif;color:#222;display:flex;flex-direction:column;overflow:hidden}',
        '.gj-panel .gj-hd{padding:9px 12px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700}',
        '.gj-panel .gj-hd button{border:1px solid #dcdcdc;background:#fafafa;border-radius:6px;cursor:pointer;font-size:12px;padding:2px 8px;font-weight:400}',
        '.gj-panel .gj-count{padding:4px 12px;border-bottom:1px solid #f2f2f2}',
        '.gj-panel .gj-bar{padding:7px 12px;border-bottom:1px solid #f2f2f2;display:flex;flex-wrap:wrap;gap:6px}',
        '.gj-panel .gj-bar button{padding:3px 9px;border:1px solid #d0d0d0;background:#fafafa;border-radius:6px;cursor:pointer;font-size:12px}',
        '.gj-panel .gj-bar button:hover{background:#f0f0f0}',
        '.gj-panel .gj-bar button.gj-pri{background:#1a7f45;border-color:#1a7f45;color:#fff}',
        '.gj-panel .gj-list{overflow:auto;padding:0}',
        '.gj-item{padding:8px 12px;border-bottom:1px solid #f4f4f4}',
        '.gj-item .gj-name{font-weight:700;word-break:break-all}',
        '.gj-item .gj-q{margin:2px 0;color:#333;white-space:pre-wrap;word-break:break-word}',
        '.gj-item .gj-q.gj-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
        '.gj-item .gj-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0}',
        '.gj-item .gj-thumbs img{width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e2e2e2;background:#fafafa;cursor:zoom-in}',
        '.gj-item .gj-id{display:flex;align-items:center;gap:6px;margin-top:4px}',
        '.gj-item .gj-id code{font:12px/1.6 Consolas,monospace;word-break:break-all;color:#1a7f45}',
        '.gj-item .gj-id button{padding:2px 8px;border:1px solid #1a7f45;background:#e8f7ee;color:#1a7f45;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap}',
        '.gj-mute{color:#8a8a8a;font-size:12px}',
        '.gj-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483002;background:rgba(0,0,0,.82);color:#fff;',
        'padding:6px 14px;border-radius:999px;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif}'
    ].join('');

    function copyOpenid(openid, label) {
        if (copyText(openid)) toast('已复制 openid：' + openid.slice(0, 10) + '…');
        else toast('复制失败，请手动选中（' + (label || '') + '）');
    }

    function buildItem(rec) {
        const box = mkEl('div', 'gj-item');
        const name = mkEl('div', 'gj-name', rec.name ? rec.name : '（昵称未识别）');
        if (!rec.name) name.style.color = '#a86a12';
        box.appendChild(name);

        if (rec.question) {
            const q = mkEl('div', 'gj-q', rec.question);
            if (rec.question.length > 90) {
                q.className = 'gj-q gj-clamp';
                q.title = '点击展开 / 收起';
                q.onclick = function () { q.className = (q.className.indexOf('gj-clamp') === -1) ? 'gj-q gj-clamp' : 'gj-q'; };
            }
            box.appendChild(q);
        } else {
            box.appendChild(mkEl('div', 'gj-q gj-mute', '（没提到问题文本）'));
        }

        if (rec.images && rec.images.length) {
            const wrap = mkEl('div', 'gj-thumbs');
            rec.images.forEach(function (im) {
                const img = document.createElement('img');
                img.src = im.url;
                img.loading = 'lazy';
                try { img.referrerPolicy = 'no-referrer'; } catch (_) { }
                img.title = '点击看原图';
                img.onclick = function () { try { window.open(im.url, '_blank'); } catch (_) { } };
                wrap.appendChild(img);
            });
            box.appendChild(wrap);
        }

        const idRow = mkEl('div', 'gj-id');
        idRow.appendChild(mkEl('code', '', rec.openid));
        const btn = mkEl('button', '', '复制 openid');
        btn.onclick = function () { copyOpenid(rec.openid, rec.name); };
        idRow.appendChild(btn);
        const meta = mkEl('span', 'gj-mute', clockOf(rec.at) + (rec.hits > 1 ? ' · 见 ' + rec.hits + ' 次' : ''));
        idRow.appendChild(meta);
        box.appendChild(idRow);
        return box;
    }

    function renderLauncher() {
        if (!state.launcher) {
            const b = mkEl('button', 'gj-launcher', '');
            b.onclick = function () { setOpen(!state.open); };
            document.body.appendChild(b);
            state.launcher = b;
        }
        updateLauncher();
    }

    function updateLauncher() {
        if (!state.launcher) return;
        state.launcher.textContent = '反馈 ' + state.records.length + (state.open ? ' ▾' : ' ▴');
        state.launcher.className = state.open ? 'gj-launcher' : 'gj-launcher gj-off';
        state.launcher.title = state.open ? '收起面板' : '展开面板（已存 ' + state.records.length + ' 条）';
    }

    function setOpen(open) {
        state.open = !!open;
        state.userClosed = !state.open;
        saveUi();
        renderPanel();
        updateLauncher();
    }

    function renderPanel() {
        if (!state.panel) {
            if (!document.body) return;
            const p = mkEl('div', 'gj-panel', '');
            const hd = mkEl('div', 'gj-hd');
            hd.appendChild(mkEl('span', '', '反馈提取 v' + API.version));
            const close = mkEl('button', '', '收起 ✕');
            close.onclick = function () { setOpen(false); };
            hd.appendChild(close);
            p.appendChild(hd);
            state.countBox = mkEl('div', 'gj-count gj-mute', '');
            p.appendChild(state.countBox);
            const bar = mkEl('div', 'gj-bar');
            const add = function (label, fn, pri) {
                const b = mkEl('button', pri ? 'gj-pri' : '', label);
                b.onclick = fn;
                bar.appendChild(b);
                return b;
            };
            add('扫描本页', function () { state.nodes = {}; scan(); }, true);
            add('复制全部 openid', function () {
                const text = openidListText(state.records);
                if (!text) { toast('还没有提取到 openid'); return; }
                if (copyText(text)) toast('已复制 ' + state.records.length + ' 个 openid');
                else toast('复制失败，请手动选中');
            });
            add('诊断', function () {
                if (copyText(buildDiagnosticText())) toast('诊断信息已复制，发我即可');
                else toast('复制失败');
            });
            add('清空', function () {
                if (!state.records.length) { toast('本来就是空的'); return; }
                if (window.confirm('清空已保存的 ' + state.records.length + ' 条反馈？')) { clearAll(); toast('已清空'); }
            });
            p.appendChild(bar);
            state.listBox = mkEl('div', 'gj-list', '');
            p.appendChild(state.listBox);
            document.body.appendChild(p);
            state.panel = p;
        }
        state.panel.style.display = state.open ? 'flex' : 'none';
        state.countBox.textContent = '共 ' + state.records.length + ' 条 · 扫描 ' + state.scans + ' 次' +
            (state.lastScanAt ? ' · 最近 ' + clockOf(state.lastScanAt) : '');
        const list = state.listBox;
        list.textContent = '';
        if (!state.records.length) {
            list.appendChild(mkEl('div', 'gj-mute', '还没提取到反馈。若页面已经加载完，点「扫描本页」。'));
            list.firstChild.style.padding = '10px 12px';
            return;
        }
        state.records.forEach(function (rec) { list.appendChild(buildItem(rec)); });
    }

    function buildDiagnosticText() {
        const first = state.records[0] || null;
        const box = first ? state.nodes[first.openid] : null;
        return diagnosticText({
            version: API.version,
            host: (typeof location !== 'undefined' ? location.hostname : ''),
            url: (typeof location !== 'undefined' ? location.href : ''),
            items: state.records.length,
            scans: state.scans,
            config: CONFIG,
            records: state.records.slice(0, 3),
            sampleBoxText: box ? textOf(box).slice(0, 1200) : '',
            sampleBoxHtml: box ? String(box.outerHTML || '').slice(0, 2000) : ''
        });
    }

    // ==================== 菜单命令 + 启动 ====================
    function registerMenus() {
        try {
            if (typeof GM_registerMenuCommand !== 'function') return;
            GM_registerMenuCommand('扫描本页反馈', function () { state.nodes = {}; scan(); toast('已扫描，共 ' + state.records.length + ' 条'); });
            GM_registerMenuCommand('复制全部 openid', function () {
                const text = openidListText(state.records);
                if (copyText(text)) toast('已复制 ' + state.records.length + ' 个 openid');
            });
            GM_registerMenuCommand('复制诊断信息', function () { copyText(buildDiagnosticText()); toast('诊断信息已复制'); });
            GM_registerMenuCommand('清空已保存的反馈', function () { clearAll(); toast('已清空'); });
        } catch (_) { }
    }

    const API = {
        CONFIG: CONFIG,
        // 纯函数（单测对象）
        openidsIn: openidsIn,
        hasOpenid: hasOpenid,
        distinctIdCount: distinctIdCount,
        linesOf: linesOf,
        looksLikeDate: looksLikeDate,
        isNoiseLine: isNoiseLine,
        cleanName: cleanName,
        guessName: guessName,
        pickQuestion: pickQuestion,
        absolutize: absolutize,
        isLikelyImageUrl: isLikelyImageUrl,
        normalizeImages: normalizeImages,
        buildRecord: buildRecord,
        mergeRecord: mergeRecord,
        capRecords: capRecords,
        openidListText: openidListText,
        diagnosticText: diagnosticText,
        // 运行时（jsdom 端到端测试用）
        runtime: {
            state: state,
            getRecords: getRecords,
            scan: scan,
            clearAll: clearAll,
            setOpen: setOpen,
            buildDiagnosticText: buildDiagnosticText,
            store: store
        },
        version: '0.3.0'
    };

    // ==================== Node 单测守卫：require() 时只导出，不碰 DOM ====================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
        return;
    }
    if (typeof window !== 'undefined') window.__GEMJY_HELPER__ = API;
    if (typeof document === 'undefined') return;

    function boot() {
        if (!isFeedbackHost()) return;                 // 只认反馈后台，别的站点一律不注入
        registerMenus();
        const start = function () {
            try {
                addStyle(CSS);
                renderLauncher();
                loadRecords();
                renderPanel();
                scan();
                setTimeout(scan, 2500);
                setTimeout(scan, 6000);
                let timer = null;
                const mo = new MutationObserver(function () {
                    if (timer) return;
                    timer = setTimeout(function () { timer = null; scan(); }, CONFIG.scanThrottleMs);
                });
                mo.observe(document.body, { childList: true, subtree: true });
            } catch (e) { dbg('启动失败', e); }
        };
        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start);
    }

    boot();
})();
