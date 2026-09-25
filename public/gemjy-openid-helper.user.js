/* eslint-disable */
// ==UserScript==
// @name         Gemjy OpenID 助手
// @namespace    work-bad/gemjy-openid-helper
// @version      0.2.0
// @description  反馈后台：自动把 openid 查成角色信息（卡片内联徽标，零点击）；工作台：批量查询面板。A/B 共用一个查询函数 + GM 本地缓存。
// @author       work-bad
// @run-at       document-start
// @match        *://mp.weixin.qq.com/*
// @match        *://localhost:3000/*
// @match        *://127.0.0.1:3000/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      operator.gemjy.cn
// ==/UserScript==
//
// ⚠️ 待补参数（改这里就行，不用动逻辑）：
//   1) 工作台域名：把上面第二条/第三条 @match 换成你的真实地址，例如
//      // @match        *://your-workbench.example.com/*
//      若用 file:// 打开工作台，需在 Tampermonkey 里打开「允许访问文件网址」。
//   2) operator 查询接口：见下面 CONFIG.requestCandidates。首次查询会依次试探 6 种常见形态，
//      命中即锁定并写进 GM 存储（requestSpec），之后不再试探。拿到一次成功的
//      「F12 → Copy as fetch」后，把 CONFIG.requestCandidates 换成那一条最省事。
//   3) 若反馈列表在跨域 iframe 里，把那个域名再加一条 @match。

(function () {
    'use strict';

    // ==================== CONFIG（集中可调；改这里不需要动逻辑代码） ====================
    const CONFIG = {
        // operator 站点
        endpoint: 'https://operator.gemjy.cn',
        loginUrl: 'https://operator.gemjy.cn/login',

        // 候选请求形态：按顺序试探，命中（能解析出角色）即锁定。
        // 占位符：url 里用 {id}（会 URL 编码）、data 里用 {id}（原样替换）。
        requestCandidates: [
            { name: 'GET /api/player?openid=', method: 'GET', url: 'https://operator.gemjy.cn/api/player?openid={id}' },
            { name: 'GET /api/role?openid=', method: 'GET', url: 'https://operator.gemjy.cn/api/role?openid={id}' },
            { name: 'GET /player?openid=', method: 'GET', url: 'https://operator.gemjy.cn/player?openid={id}' },
            { name: 'POST /api/player (json)', method: 'POST', url: 'https://operator.gemjy.cn/api/player', data: '{"openid":"{id}"}', headers: { 'Content-Type': 'application/json' } },
            { name: 'POST /api/role (json)', method: 'POST', url: 'https://operator.gemjy.cn/api/role', data: '{"openid":"{id}"}', headers: { 'Content-Type': 'application/json' } },
            { name: 'POST /api/player (form)', method: 'POST', url: 'https://operator.gemjy.cn/api/player', data: 'openid={id}', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        ],

        // 并发与缓存（别把 operator 打挂）
        concurrency: 2,
        cacheTtlMs: 10 * 60 * 1000,
        requestTimeoutMs: 15000,

        // 行为开关
        autoQuery: true,          // A 端扫到就自动查
        autoExpand: true,         // A 端自动点开「展开」小按钮
        debug: false,

        // A 端自动展开：命中选择器、或文本恰为这些符号的小元素
        autoExpandSelectors: ['[class*="expand"]', '[class*="toggle"]', '[class*="arrow"]', '[class*="more"]', '[class*="detail"]'],
        autoExpandSymbols: ['+', '＋', '▸', '▶', '›', '»'],

        // 卡片徽标显示哪些字段（顺序即拼接顺序）
        badgeFields: ['nickname', 'uid', 'server', 'platform'],

        // openid 形态：o + 27 位
        openidSource: 'o[A-Za-z0-9_-]{27}',

        // A 端重扫节流（翻页后 MutationObserver 的抖动间隔）
        scanThrottleMs: 1200,
        maxTriesKept: 12
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

    // B 端输入解析：先按 openid 正则抽；抽不到就按「一行一个 id」兜底
    function parseIds(text) {
        const s = (text === null || text === undefined) ? '' : String(text);
        const found = openidsIn(s);
        if (found.length) return found;
        const out = [];
        const seen = Object.create(null);
        s.split(/\r?\n/).forEach(function (line) {
            let t = line.trim();
            if (!t) return;
            t = t.replace(/^[\s"'`[\](){}<>]+/, '').replace(/[\s"'`[\](){}<>]+$/, '');
            if (!t || seen[t]) return;
            seen[t] = 1;
            out.push(t);
        });
        return out;
    }

    function tryJson(text) {
        const s = (text === null || text === undefined) ? '' : String(text);
        if (!s) return null;
        const t = s.trim();
        if (!/^[\[{]/.test(t)) return null;
        try { return JSON.parse(t); } catch (_) { return null; }
    }

    // 把任意 JSON 结构摊平成「标签 → 值」对（键名就是标签）
    function pairsFromJson(obj, out, depth) {
        out = out || [];
        depth = depth || 0;
        if (depth > 4 || out.length > 400) return out;
        if (obj === null || obj === undefined) return out;
        if (Array.isArray(obj)) {
            obj.slice(0, 20).forEach(function (v) { pairsFromJson(v, out, depth + 1); });
            return out;
        }
        if (typeof obj === 'object') {
            Object.keys(obj).forEach(function (k) {
                const v = obj[k];
                if (v !== null && typeof v === 'object') pairsFromJson(v, out, depth + 1);
                else if (v !== null && v !== undefined && String(v) !== '') out.push({ label: k, value: String(v) });
            });
            return out;
        }
        return out;
    }

    function decodeEntities(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
    }

    function stripTags(html) {
        return decodeEntities(String(html === null || html === undefined ? '' : html)
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(tr|div|p|li|h[1-6])>/gi, '\n')
            .replace(/<[^>]*>/g, ' '))
            .replace(/[ \t\u00a0]+/g, ' ');
    }

    const KNOWN_LABELS = ['nickname', 'openid', 'uid', 'server', 'platform', 'nick', 'role', '角色', '昵称', '玩家', '区服', '服务器', '平台', '系统', '渠道', '账号'];

    function looksLikeLabel(text) {
        const t = String(text === null || text === undefined ? '' : text).trim().toLowerCase();
        if (!t || t.length > 16) return false;
        return KNOWN_LABELS.some(function (k) { return t.indexOf(k.toLowerCase()) !== -1; });
    }

    // 三种渲染都要兼容：① <tr> 成对 th/td（含 4 列交叉）② 标签：值 ③ 标签 空格 值
    function extractPairsFromHtml(html) {
        const s = String(html === null || html === undefined ? '' : html);
        const out = [];
        const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
        let tr;
        while ((tr = trRe.exec(s)) !== null) {
            const cells = [];
            const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
            let c;
            while ((c = cellRe.exec(tr[1])) !== null) {
                cells.push({ tag: c[1].toLowerCase(), text: stripTags(c[2]).trim().replace(/\s+/g, ' ') });
            }
            for (let i = 0; i < cells.length - 1; i++) {
                const a = cells[i], b = cells[i + 1];
                if (a.tag === 'th' && b.tag === 'td') out.push({ label: a.text, value: b.text });
                else if (a.tag === 'td' && b.tag === 'td' && looksLikeLabel(a.text)) out.push({ label: a.text, value: b.text });
            }
        }
        const text = stripTags(s);
        let m;
        const colonRe = /([A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]{0,15})\s*[：:]\s*([^\s：:，,]{1,64})/g;
        while ((m = colonRe.exec(text)) !== null) out.push({ label: m[1], value: m[2] });
        const spaceRe = /(nickname|openid|uid|server|platform|nick|昵称|角色|玩家名|区服|服务器|平台|系统|渠道)\s+([A-Za-z0-9_\-\u4e00-\u9fa5]{1,64})/gi;
        while ((m = spaceRe.exec(text)) !== null) out.push({ label: m[1], value: m[2] });
        return out;
    }

    // 先整段 JSON → 再找内嵌 JSON → 最后当 HTML 解析
    function parseResponse(text) {
        const s = (text === null || text === undefined) ? '' : String(text);
        const direct = tryJson(s);
        if (direct !== null) return { kind: 'json', json: direct, pairs: pairsFromJson(direct) };
        const pairs2 = [['{', '}'], ['[', ']']];
        for (let i = 0; i < pairs2.length; i++) {
            const a = s.indexOf(pairs2[i][0]);
            const b = s.lastIndexOf(pairs2[i][1]);
            if (a >= 0 && b > a) {
                const inner = tryJson(s.slice(a, b + 1));
                if (inner !== null) return { kind: 'json', json: inner, pairs: pairsFromJson(inner) };
            }
        }
        return { kind: 'html', json: null, pairs: extractPairsFromHtml(s) };
    }

    const ROLE_KEYS = {
        nickname: ['nickname', 'nick', 'name', 'rolename', 'playername', '昵称', '角色名', '玩家昵称', '玩家名', '玩家'],
        uid: ['uid', 'roleid', 'userid', 'playerid', 'accountid', 'id', '玩家id', '角色id', '账号id', '角色编号'],
        server: ['server', 'servername', 'zone', 'zonename', 'area', '区服', '服务器', '大区', '所在服', '所在区'],
        platform: ['platform', 'os', 'channel', 'client', '平台', '系统', '渠道', '客户端']
    };

    function normKey(x) {
        return String(x === null || x === undefined ? '' : x).trim().toLowerCase().replace(/[\s_\-:：]/g, '');
    }

    // 按优先级归一成 { nickname, uid, server, platform }
    function pickRole(pairs) {
        const list = (pairs || []).filter(function (p) { return p && p.label !== undefined && p.value !== undefined && String(p.value).trim() !== ''; });
        const role = {};
        Object.keys(ROLE_KEYS).forEach(function (want) {
            const alts = ROLE_KEYS[want].map(normKey).filter(Boolean);
            let hit = null;
            for (let i = 0; i < alts.length && !hit; i++) {
                for (let j = 0; j < list.length; j++) {
                    if (normKey(list[j].label) === alts[i]) { hit = list[j]; break; }
                }
            }
            if (!hit) {
                for (let i = 0; i < alts.length && !hit; i++) {
                    for (let j = 0; j < list.length; j++) {
                        if (normKey(list[j].label).indexOf(alts[i]) !== -1) { hit = list[j]; break; }
                    }
                }
            }
            if (hit) role[want] = String(hit.value).trim();
        });
        // nickname 兜底：有些接口只有 name，上面已含；这里再兜一层「昵称」类中文键
        return role;
    }

    // 登录页 / 无权访问识别
    function isLoginPage(text, finalUrl) {
        const u = String(finalUrl === null || finalUrl === undefined ? '' : finalUrl);
        if (/login|signin|sign_in|passport|sso|auth/i.test(u)) return true;
        const s = String(text === null || text === undefined ? '' : text);
        if (!s) return false;
        if (/请先登录|请登录后|您尚未登录|您还未登录|尚未登录|未登录|登录已过期|登录状态已失效|重新登录|无权访问|没有权限|无权限|请先认证/i.test(s)) return true;
        if (/"code"\s*:\s*(401|403|10001|10002)\b/.test(s)) return true;
        if (/\b40[13]\b/.test(s) && /(token|未授权|unauthor)/i.test(s)) return true;
        return false;
    }

    // 汇总成 ok / login / empty（网络错误由调用方标 error）
    function classify(text, finalUrl) {
        const s = String(text === null || text === undefined ? '' : text).trim();
        if (!s) return 'empty';
        if (isLoginPage(s, finalUrl)) return 'login';
        const parsed = parseResponse(s);
        const role = pickRole(parsed.pairs);
        if (!role.nickname && !role.uid) return 'empty';
        return 'ok';
    }

    // 生成 GM_xmlhttpRequest 需要的 {url, method, data, headers}
    function buildRequest(spec, openid) {
        const s = spec || {};
        const id = (openid === null || openid === undefined) ? '' : String(openid);
        const enc = encodeURIComponent(id);
        const url = String(s.url || '').split('{id}').join(enc);
        let data = s.data;
        if (typeof data === 'string') {
            data = data.split('{id}').join(id);
        } else if (data && typeof data === 'object') {
            try { data = JSON.parse(JSON.stringify(data).split('{id}').join(id)); } catch (_) { /* 原样传 */ }
        }
        return {
            url: url,
            method: String(s.method || 'GET').toUpperCase(),
            data: data,
            headers: Object.assign({}, s.headers || {})
        };
    }

    // CSV 转义（导出用；带 BOM，Excel 直接能开）
    function toCsv(rows, cols) {
        const columns = (cols || []).map(function (c) {
            return (typeof c === 'string') ? { key: c, label: c } : { key: c.key, label: c.label || c.key };
        });
        const esc = function (v) {
            const t = (v === null || v === undefined) ? '' : String(v);
            return /[",\r\n]/.test(t) ? '"' + t.split('"').join('""') + '"' : t;
        };
        const lines = [columns.map(function (c) { return esc(c.label); }).join(',')];
        (rows || []).forEach(function (r) {
            lines.push(columns.map(function (c) { return esc(r ? r[c.key] : ''); }).join(','));
        });
        return '\ufeff' + lines.join('\r\n');
    }

    // ==================== 状态机 ====================
    // pending / loading / ok / empty / error / login / uncalibrated
    const STATUS_TEXT = {
        pending: '待查询', loading: '查询中', ok: '成功', empty: '未查到',
        error: '失败', login: '未登录', uncalibrated: '待校准'
    };

    // ==================== 共享运行时（A/B 复用；碰 GM / 网络的都在这层） ====================
    const hasGM = (typeof GM_xmlhttpRequest === 'function');

    function gmGet(key) {
        try {
            if (typeof GM_getValue === 'function') return GM_getValue(key, '');
            if (typeof localStorage !== 'undefined') return localStorage.getItem(key) || '';
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
    function gmKeys() {
        try {
            if (typeof GM_listValues === 'function') return GM_listValues() || [];
            if (typeof localStorage !== 'undefined') {
                const out = [];
                for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
                return out;
            }
        } catch (_) { }
        return [];
    }

    const store = {
        get: function (key, dflt) {
            const raw = gmGet(key);
            if (raw === '' || raw === null || raw === undefined) return dflt;
            try { return JSON.parse(raw); } catch (_) { return dflt; }
        },
        set: function (key, val) { try { gmSet(key, JSON.stringify(val)); } catch (_) { } },
        del: function (key) { gmDel(key); },
        keys: function () { return gmKeys(); }
    };

    // ---- 缓存：键 oid:<openid>，值 {t, status, role}，10 分钟 TTL，只缓存成功结果 ----
    const KEY = {
        spec: 'requestSpec',
        recent: 'recentBatch',
        lastRaw: 'lastRaw',
        oid: function (openid) { return 'oid:' + openid; }
    };

    function cacheGet(openid) {
        const v = store.get(KEY.oid(openid), null);
        if (!v || !v.t || Date.now() - v.t > CONFIG.cacheTtlMs) return null;
        return v;
    }
    function cacheSet(openid, status, role) {
        if (status !== 'ok') return;                       // 只缓存成功结果
        store.set(KEY.oid(openid), { t: Date.now(), status: status, role: role || null });
    }
    function clearCache() {
        let n = 0;
        store.keys().forEach(function (k) { if (k.indexOf('oid:') === 0) { store.del(k); n++; } });
        return n;
    }

    // ---- 已锁定 / 待锁定的请求形态 ----
    function getSpec() { const s = store.get(KEY.spec, null); return (s && s.url) ? s : null; }
    function setSpec(spec) { store.set(KEY.spec, spec); }
    function clearSpec() { store.del(KEY.spec); }

    function recordTry(name, openid, status, text) {
        const tries = store.get('tries', []) || [];
        tries.push({ t: Date.now(), name: name, openid: String(openid).slice(-8), status: status });
        while (tries.length > CONFIG.maxTriesKept) tries.shift();
        store.set('tries', tries);
        const head = String(text || '').slice(0, 1500);
        store.set(KEY.lastRaw, head);
        if (CONFIG.debug && typeof console !== 'undefined') console.log('[gemjy] try', name, status, head.slice(0, 200));
    }

    function dbg() {
        if (!CONFIG.debug || typeof console === 'undefined') return;
        const a = Array.prototype.slice.call(arguments);
        console.log.apply(console, ['[gemjy]'].concat(a));
    }

    function gmRequest(req) {
        return new Promise(function (resolve, reject) {
            if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('GM_xmlhttpRequest 不可用（检查 @grant）')); return; }
            GM_xmlhttpRequest({
                method: req.method,
                url: req.url,
                headers: req.headers,
                data: req.data,
                timeout: CONFIG.requestTimeoutMs,
                withCredentials: true,                      // 带上 cookie（这就是用 GM 请求而不用 fetch 的原因）
                onload: function (r) { resolve({ status: r.status, text: r.responseText || '', finalUrl: r.finalUrl || req.url }); },
                onerror: function (e) { reject(new Error('网络错误 ' + ((e && e.error) || 'unknown'))); },
                ontimeout: function () { reject(new Error('请求超时')); }
            });
        });
    }

    // ---- 共享状态 ----
    const state = {
        results: {},          // openid → { status, role, note }
        known: [],            // 出现过的 openid（有序）
        queue: [],
        inflight: {},
        running: 0,
        stopped: null,        // 'login' | 'uncalibrated' | null
        scanned: 0
    };

    let renderHook = function () { };
    let updateStatus = function () { };
    function setHooks(h) {
        if (h && typeof h.render === 'function') renderHook = h.render;
        if (h && typeof h.status === 'function') updateStatus = h.status;
    }

    function getResult(openid) { return state.results[openid] || null; }
    function remember(id) { if (state.known.indexOf(id) === -1) state.known.push(id); }

    function setResult(openid, status, role, note) {
        state.results[openid] = { status: status, role: role || null, note: note || '' };
        try { updateStatus(openid, state.results[openid]); } catch (e) { dbg('updateStatus 抛错', e); }
        try { renderHook(); } catch (e) { dbg('renderHook 抛错', e); }
    }

    function stats() {
        const s = { pending: 0, loading: 0, ok: 0, empty: 0, error: 0, login: 0, uncalibrated: 0, total: state.known.length };
        state.known.forEach(function (id) {
            const r = state.results[id];
            const k = r ? r.status : 'pending';
            if (s[k] === undefined) s[k] = 0;
            s[k]++;
        });
        return s;
    }

    // ---- 查询：缓存 → 已锁定形态 → 依次试候选 ----
    async function trySpec(spec, openid) {
        const req = buildRequest(spec, openid);
        const raw = await gmRequest(req);
        const text = String(raw.text || '');
        const status = classify(text, raw.finalUrl);
        let role = null;
        if (status === 'ok') role = pickRole(parseResponse(text).pairs);
        recordTry(spec.name || spec.url, openid, status, text);
        return { status: status, role: role };
    }

    async function lookup(openid) {
        const c = cacheGet(openid);
        if (c) return { status: c.status, role: c.role, cached: true };
        const locked = getSpec();
        if (locked) {
            const r1 = await trySpec(locked, openid);
            if (r1.status === 'ok') { cacheSet(openid, 'ok', r1.role); return r1; }
            if (r1.status === 'login') return { status: 'login', role: null };
            clearSpec();                                   // 锁定的形态失效了 → 重新校准
        }
        for (let i = 0; i < CONFIG.requestCandidates.length; i++) {
            const cand = CONFIG.requestCandidates[i];
            const r = await trySpec(cand, openid);
            if (r.status === 'ok') { setSpec(cand); cacheSet(openid, 'ok', r.role); return r; }
            if (r.status === 'login') return { status: 'login', role: null };
        }
        return { status: 'uncalibrated', role: null };
    }

    // ---- 队列：并发 2、inflight 去重、掉登录/待校准立刻停 ----
    function stopQueue(reason) {
        if (state.stopped) return;
        state.stopped = reason;
        state.queue.length = 0;
        Object.keys(state.results).forEach(function (id) {
            if (state.results[id].status === 'loading') setResult(id, reason === 'login' ? 'login' : 'uncalibrated', null);
        });
        try { renderHook(); } catch (_) { }
    }
    function resumeQueue() { state.stopped = null; }

    function pump() {
        if (state.stopped) return;
        while (state.running < CONFIG.concurrency && state.queue.length) {
            const id = state.queue.shift();
            if (state.inflight[id]) continue;
            state.running++;
            state.inflight[id] = true;
            setResult(id, 'loading');
            lookup(id).then(function (res) {
                setResult(id, res.status, res.role, res.cached ? '缓存命中' : '');
                if (res.status === 'login') stopQueue('login');
                else if (res.status === 'uncalibrated') stopQueue('uncalibrated');
            }).catch(function (e) {
                setResult(id, 'error', null, String((e && e.message) || e));
            }).then(function () {
                state.running--;
                delete state.inflight[id];
                pump();
            });
        }
    }

    function enqueue(ids) {
        if (state.stopped) return 0;
        let n = 0;
        (ids || []).forEach(function (id) {
            if (!id) return;
            remember(id);
            if (state.inflight[id]) return;
            if (state.queue.indexOf(id) !== -1) return;
            const cur = state.results[id];
            if (cur && cur.status === 'ok') return;         // 已有成功结果
            state.queue.push(id);
            n++;
        });
        if (n) pump();
        return n;
    }

    // 失败/未登录/待校准的重新排队
    function retryFailed() {
        resumeQueue();
        const again = state.known.filter(function (id) {
            const r = state.results[id];
            return !r || r.status === 'error' || r.status === 'empty' || r.status === 'uncalibrated' || r.status === 'login';
        });
        return enqueue(again);
    }

    function roleText(role) {
        if (!role) return '';
        return CONFIG.badgeFields.map(function (k) { return role[k] ? role[k] : ''; }).filter(Boolean).join(' · ');
    }

    function copyText(text, label) {
        if (!text) return false;
        try {
            if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return true; }
            if (typeof navigator !== 'undefined' && navigator.clipboard) { navigator.clipboard.writeText(text); return true; }
        } catch (_) { }
        return false;
    }

    // 上次反馈页会话（A 端写、B 端读）
    function saveRecentBatch(ids) {
        store.set(KEY.recent, { t: Date.now(), url: (typeof location !== 'undefined' ? location.href : ''), ids: (ids || []).slice(0, 500) });
    }
    function loadRecentBatch() {
        const v = store.get(KEY.recent, null);
        return (v && Array.isArray(v.ids)) ? v : null;
    }

    // 校准信息（复制给开发/给 AI 换成硬编码用）
    function calibrationText() {
        return JSON.stringify({
            endpoint: CONFIG.endpoint,
            lockedSpec: getSpec(),
            tries: store.get('tries', []),
            lastRawHead: String(store.get(KEY.lastRaw, '')).slice(0, 800)
        }, null, 2);
    }

    const API = {
        CONFIG: CONFIG,
        STATUS_TEXT: STATUS_TEXT,
        // 纯函数
        openidsIn: openidsIn,
        parseIds: parseIds,
        tryJson: tryJson,
        pairsFromJson: pairsFromJson,
        extractPairsFromHtml: extractPairsFromHtml,
        pickRole: pickRole,
        isLoginPage: isLoginPage,
        parseResponse: parseResponse,
        classify: classify,
        buildRequest: buildRequest,
        toCsv: toCsv,
        // 运行时
        lookup: lookup,
        enqueue: enqueue,
        retryFailed: retryFailed,
        stats: stats,
        getResult: getResult,
        clearCache: clearCache,
        calibrationText: calibrationText,
        getSpec: getSpec,
        setSpec: setSpec,
        clearSpec: clearSpec,
        loadRecentBatch: loadRecentBatch,
        saveRecentBatch: saveRecentBatch,
        setHooks: setHooks,
        store: store,
        state: state,
        version: '0.2.0'
    };

    // ==================== Node 单测守卫：require() 时只导出纯函数与运行时，不碰 DOM ====================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
        return;
    }
    if (typeof window !== 'undefined') window.__GEMJY_HELPER__ = API;
    if (typeof document === 'undefined') return;

    // ==================== 样式 ====================
    const CSS = [
        '.gj-badge{display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;padding:1px 7px;border-radius:10px;',
        'font:12px/1.6 -apple-system,"Microsoft YaHei",sans-serif;border:1px solid #d9d9d9;background:#fafafa;color:#666;cursor:pointer;vertical-align:middle;white-space:nowrap}',
        '.gj-badge.ok{background:#e8f7ee;border-color:#a8dcbd;color:#1a7f45}',
        '.gj-badge.loading{background:#eef4ff;border-color:#b7cdf5;color:#2a5db0}',
        '.gj-badge.login{background:#fff5e6;border-color:#f0cf9a;color:#a86a12}',
        '.gj-badge.uncalibrated{background:#f6f0ff;border-color:#d0bdf0;color:#6b3fbf}',
        '.gj-badge.empty{background:#f5f5f5;border-color:#dddddd;color:#999}',
        '.gj-badge.error{background:#fdecec;border-color:#f2b8b5;color:#b3261e}',
        '.gj-panel{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#fff;border:1px solid #dcdcdc;border-radius:10px;',
        'box-shadow:0 8px 28px rgba(0,0,0,.16);font:13px/1.7 -apple-system,"Microsoft YaHei",sans-serif;color:#333;padding:10px 12px;max-width:340px}',
        '.gj-panel .gj-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
        '.gj-panel button{margin:2px 0;padding:3px 9px;border:1px solid #d0d0d0;background:#fafafa;border-radius:6px;cursor:pointer;font-size:12px}',
        '.gj-panel button:hover{background:#f0f0f0}',
        '.gj-panel .gj-title{font-weight:700;margin-bottom:4px}',
        '.gj-panel .gj-mute{color:#8a8a8a;font-size:12px}',
        '.gj-drawer{position:fixed;right:0;top:0;bottom:0;width:660px;max-width:96vw;z-index:2147483001;background:#fff;border-left:1px solid #dcdcdc;',
        'box-shadow:-8px 0 28px rgba(0,0,0,.14);font:13px/1.7 -apple-system,"Microsoft YaHei",sans-serif;color:#222;display:flex;flex-direction:column}',
        '.gj-drawer header{padding:10px 14px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;font-weight:700}',
        '.gj-drawer .gj-body{padding:10px 14px;overflow:auto;flex:1}',
        '.gj-drawer textarea{width:100%;min-height:88px;box-sizing:border-box;font:12px/1.6 Consolas,monospace;border:1px solid #dcdcdc;border-radius:6px;padding:6px}',
        '.gj-drawer button{margin:2px 4px 2px 0;padding:4px 10px;border:1px solid #d0d0d0;background:#fafafa;border-radius:6px;cursor:pointer;font-size:12px}',
        '.gj-drawer button.primary{background:#1a7f45;border-color:#1a7f45;color:#fff}',
        '.gj-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}',
        '.gj-table th,.gj-table td{border-bottom:1px solid #eee;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-all}',
        '.gj-table th{background:#fafafa;position:sticky;top:0}',
        '.gj-banner{margin:8px 0;padding:6px 10px;border-radius:6px;background:#fff5e6;border:1px solid #f0cf9a;color:#a86a12}',
        '.gj-st{font-weight:700}.gj-st.ok{color:#1a7f45}.gj-st.loading{color:#2a5db0}.gj-st.login{color:#a86a12}',
        '.gj-st.uncalibrated{color:#6b3fbf}.gj-st.empty{color:#999}.gj-st.error{color:#b3261e}'
    ].join('');

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

    // ==================== A 端：反馈后台 ====================
    const FEEDBACK = {
        nodes: {},            // openid → 容器元素
        badges: {},           // openid → 徽标元素
        clicked: [],          // 已点过的展开元素（用 indexOf 代替 WeakSet，方便查）
        rounds: 0,
        panel: null,
        lastScanAt: 0
    };

    function isFeedbackHost() { return /(^|\.)mp\.weixin\.qq\.com$/.test(location.hostname); }

    // 从任意响应里嗅 openid（跳过我们自己发往 operator 的请求）
    function hookNetwork() {
        try {
            const of = window.fetch;
            if (typeof of === 'function') {
                window.fetch = function () {
                    const args = arguments;
                    const url = String((args[0] && args[0].url) || args[0] || '');
                    return of.apply(this, args).then(function (resp) {
                        if (url.indexOf(CONFIG.endpoint) === -1) {
                            try {
                                resp.clone().text().then(function (t) {
                                    const ids = openidsIn(t);
                                    if (ids.length) { saveRecentBatch(ids); if (CONFIG.autoQuery) enqueue(ids); }
                                }).catch(function () { });
                            } catch (_) { }
                        }
                        return resp;
                    });
                };
            }
            const OX = window.XMLHttpRequest;
            if (typeof OX === 'function') {
                const open = OX.prototype.open;
                const send = OX.prototype.send;
                OX.prototype.open = function (method, url) {
                    this.__gjUrl = String(url || '');
                    return open.apply(this, arguments);
                };
                OX.prototype.send = function () {
                    const xhr = this;
                    if (String(xhr.__gjUrl || '').indexOf(CONFIG.endpoint) === -1) {
                        xhr.addEventListener('load', function () {
                            try {
                                const t = xhr.responseText || '';
                                const ids = openidsIn(t);
                                if (ids.length) { saveRecentBatch(ids); if (CONFIG.autoQuery) enqueue(ids); }
                            } catch (_) { }
                        });
                    }
                    return send.apply(this, arguments);
                };
            }
        } catch (e) { dbg('hookNetwork 失败', e); }
    }

    // 找 openid 所在的「卡片」容器：向上最多 12 层，取含日期且高度 60–800 的祖先，兜底第 6 层
    function findItemContainer(node) {
        let el = node && node.parentElement;
        let fallback = null;
        for (let i = 0; el && i < 12; i++) {
            if (i === 5) fallback = el;
            let rect = null;
            try { rect = el.getBoundingClientRect(); } catch (_) { }
            const h = rect ? rect.height : 0;
            const text = (el.innerText || el.textContent || '');
            const hasDate = /\d{1,4}[-/月.]\d{1,2}([-/日.]\d{1,2})?/.test(text);
            if (hasDate && h >= 60 && h <= 800) return el;
            el = el.parentElement;
        }
        return fallback || (node && node.parentElement) || null;
    }

    function scan() {
        FEEDBACK.lastScanAt = Date.now();
        const ids = [];
        try {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: function (n) {
                    const p = n.parentElement;
                    if (!p) return NodeFilter.FILTER_REJECT;
                    const tag = (p.tagName || '').toLowerCase();
                    if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
                    if (p.closest && p.closest('.gj-panel,.gj-drawer')) return NodeFilter.FILTER_REJECT;
                    if (p.offsetParent === null) return NodeFilter.FILTER_REJECT;      // 只看可见的
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let n;
            while ((n = walker.nextNode())) {
                const found = openidsIn(n.nodeValue);
                if (!found.length) continue;
                const box = findItemContainer(n);
                found.forEach(function (id) {
                    if (!box) return;
                    if (!FEEDBACK.nodes[id]) { FEEDBACK.nodes[id] = box; ids.push(id); }
                    else if (!FEEDBACK.badges[id]) ids.push(id);
                });
            }
        } catch (e) { dbg('scan 失败', e); }
        if (ids.length) {
            ids.forEach(remember);
            saveRecentBatch(state.known);
            renderBadges();
            if (CONFIG.autoQuery) enqueue(ids);
        }
        FEEDBACK.scanned = state.known.length;
        renderPanel();
    }

    function renderBadges() {
        Object.keys(FEEDBACK.nodes).forEach(function (id) {
            const box = FEEDBACK.nodes[id];
            if (!box || !box.isConnected) return;
            let b = FEEDBACK.badges[id];
            if (!b) {
                b = mkEl('span', 'gj-badge', '');
                b.__gjId = id;
                b.onclick = function (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    const r = getResult(id);
                    if (r && r.status === 'login') { window.open(CONFIG.loginUrl, '_blank'); return; }
                    copyText(id + (r && r.role && r.role.uid ? ' ' + r.role.uid : ''), '徽标');
                    b.title = '已复制：' + id;
                    if (!r || r.status === 'pending' || r.status === 'error') { resumeQueue(); enqueue([id]); }
                };
                try { box.insertBefore(b, box.firstChild); } catch (_) { box.appendChild(b); }
                FEEDBACK.badges[id] = b;
            }
            updateBadge(id);
        });
    }

    function updateBadge(id) {
        const b = FEEDBACK.badges[id];
        if (!b) return;
        const r = getResult(id);
        const st = r ? r.status : 'pending';
        b.className = 'gj-badge ' + st;
        const role = r && r.role ? roleText(r.role) : '';
        b.textContent = (STATUS_TEXT[st] || st) + (role ? '：' + role : (r && r.note ? '：' + r.note : ''));
        b.title = st === 'login' ? '点我打开 operator 登录页' : (id + (role ? '\n' + role : ''));
    }

    // 自动展开（限流）：命中选择器的小元素，或文本恰为 + ＋ ▸ ▶
    function autoExpandOnce() {
        let clicked = 0;
        const max = 8;
        const all = document.querySelectorAll(CONFIG.autoExpandSelectors.join(',') + ',button,span,a,i,div');
        for (let i = 0; i < all.length && clicked < max; i++) {
            const el = all[i];
            if (el.closest && el.closest('.gj-panel,.gj-drawer')) continue;
            if (FEEDBACK.clicked.indexOf(el) !== -1) continue;
            const text = (el.textContent || '').trim();
            let hit = false;
            if (CONFIG.autoExpandSymbols.indexOf(text) !== -1) hit = true;
            else if (CONFIG.autoExpandSelectors.some(function (sel) { try { return el.matches(sel); } catch (_) { return false; } })) {
                if (text.length <= 8 && el.offsetParent !== null) hit = true;
            }
            if (!hit) continue;
            FEEDBACK.clicked.push(el);
            try { el.click(); clicked++; } catch (_) { }
        }
        if (clicked && FEEDBACK.rounds < 3) {
            FEEDBACK.rounds++;
            setTimeout(scan, 900);
        }
        return clicked;
    }

    function renderPanel() {
        if (!FEEDBACK.panel) {
            const p = mkEl('div', 'gj-panel');
            document.body.appendChild(p);
            FEEDBACK.panel = p;
        }
        const s = stats();
        const p = FEEDBACK.panel;
        p.innerHTML = '';
        p.appendChild(mkEl('div', 'gj-title', 'Gemjy OpenID 助手 v' + API.version));
        p.appendChild(mkEl('div', 'gj-mute',
            '共 ' + s.total + ' 条 · 成功 ' + s.ok + ' · 查询中 ' + s.loading + ' · 待查 ' + s.pending +
            ' · 未查到 ' + s.empty + ' · 失败 ' + s.error + (s.login ? ' · 未登录 ' + s.login : '') +
            (s.uncalibrated ? ' · 待校准 ' + s.uncalibrated : '')));
        if (state.stopped === 'login') p.appendChild(mkEl('div', 'gj-mute', '⚠️ operator 未登录：先登录再点「重试失败」'));
        if (state.stopped === 'uncalibrated') p.appendChild(mkEl('div', 'gj-mute', '⚠️ 接口形态不符：点「校准」把信息发我，或改 CONFIG.requestCandidates'));
        const row1 = mkEl('div', 'gj-row');
        const row2 = mkEl('div', 'gj-row');
        const btn = function (parent, label, fn) { const b = mkEl('button', '', label); b.onclick = fn; parent.appendChild(b); return b; };
        btn(row1, '查询本页', function () { resumeQueue(); enqueue(state.known); scan(); });
        btn(row1, '重试失败', function () { retryFailed(); });
        btn(row1, '打开登录页', function () { window.open(CONFIG.loginUrl, '_blank'); });
        btn(row2, '清空缓存', function () { const n = clearCache(); retryFailed(); alert('已清空 ' + n + ' 条缓存'); });
        btn(row2, '校准', function () { copyText(calibrationText(), '校准信息'); alert('校准信息已复制（含 lockedSpec / tries / lastRaw 片段）'); });
        btn(row2, '收起', function () { p.style.display = 'none'; });
        if (CONFIG.autoExpand) btn(row2, '展开更多', function () { autoExpandOnce(); });
        p.appendChild(row1);
        p.appendChild(row2);
    }

    function bootFeedback() {
        addStyle(CSS);
        hookNetwork();
        const start = function () {
            scan();
            setTimeout(scan, 2500);
            setTimeout(scan, 6000);
            if (CONFIG.autoExpand) setTimeout(autoExpandOnce, 1200);
            try {
                let timer = null;
                const mo = new MutationObserver(function () {
                    if (timer) return;
                    timer = setTimeout(function () { timer = null; scan(); }, CONFIG.scanThrottleMs);
                });
                mo.observe(document.body, { childList: true, subtree: true });
            } catch (e) { dbg('MutationObserver 失败', e); }
        };
        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start);
    }

    // ==================== B 端：工作台批量查询面板 ====================
    const WORKBENCH = { drawer: null, rows: [], btn: null };

    function isWorkbenchPage() {
        return !!(document.getElementById('tabsContainer') || document.getElementById('smartPasteInput'));
    }

    const COLS = [
        { key: 'openid', label: 'openid' },
        { key: 'nickname', label: '昵称' },
        { key: 'uid', label: 'UID' },
        { key: 'server', label: '区服' },
        { key: 'platform', label: '平台' },
        { key: 'status', label: '状态' }
    ];

    function rowsFromState() {
        return state.known.map(function (id) {
            const r = getResult(id) || { status: 'pending', role: null };
            const role = r.role || {};
            return {
                openid: id,
                nickname: role.nickname || '',
                uid: role.uid || '',
                server: role.server || '',
                platform: role.platform || '',
                status: (STATUS_TEXT[r.status] || r.status) + (r.note ? '（' + r.note + '）' : ''),
                _status: r.status
            };
        });
    }

    function renderTable() {
        const d = WORKBENCH.drawer;
        if (!d) return;
        const s = stats();
        const box = d.querySelector('.gj-stat');
        if (box) {
            box.textContent = '共 ' + s.total + ' 条 · 成功 ' + s.ok + ' · 查询中 ' + s.loading + ' · 待查 ' + s.pending +
                ' · 未查到 ' + s.empty + ' · 失败 ' + s.error + (s.login ? ' · 未登录 ' + s.login : '') +
                (s.uncalibrated ? ' · 待校准 ' + s.uncalibrated : '');
        }
        const banner = d.querySelector('.gj-banner');
        if (banner) {
            if (state.stopped === 'login') {
                banner.style.display = '';
                banner.innerHTML = '⚠️ operator 未登录。<button class="gj-open-login">打开登录页</button><button class="gj-retry">重试失败</button>';
            } else if (state.stopped === 'uncalibrated') {
                banner.style.display = '';
                banner.innerHTML = '⚠️ 接口形态不符（候选都试过了）。<button class="gj-cal">复制校准信息</button>';
            } else banner.style.display = 'none';
        }
        const tb = d.querySelector('tbody');
        if (!tb) return;
        tb.innerHTML = '';
        rowsFromState().forEach(function (r) {
            const tr = document.createElement('tr');
            const td = function (text, cls) { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = text === undefined ? '' : text; tr.appendChild(c); return c; };
            const idTd = td(r.openid);
            const cp = mkEl('button', '', '复制');
            cp.onclick = function () { copyText(r.openid); };
            idTd.appendChild(document.createTextNode(' '));
            idTd.appendChild(cp);
            td(r.nickname); td(r.uid); td(r.server); td(r.platform);
            td(r.status, 'gj-st ' + r._status);
        });
        // 事件（重渲染后要重挂）
        const q = function (sel) { return d.querySelector(sel); };
        const on = function (sel, fn) { const el = q(sel); if (el) el.onclick = fn; };
        on('.gj-open-login', function () { window.open(CONFIG.loginUrl, '_blank'); });
        on('.gj-retry', function () { retryFailed(); });
        on('.gj-cal', function () { copyText(calibrationText(), '校准信息'); });
    }

    function openDrawer() {
        if (WORKBENCH.drawer) { WORKBENCH.drawer.style.display = 'flex'; renderTable(); return; }
        const d = mkEl('div', 'gj-drawer');
        d.innerHTML = [
            '<header><span>Gemjy OpenID 批量查询</span><span>',
            '<button class="gj-close">关闭 ✕</button></span></header>',
            '<div class="gj-body">',
            '<div>粘贴包含 openid 的任意文本（或一行一个 id）：</div>',
            '<textarea class="gj-input" placeholder="oXXXXXXXXXXXXXXXXXXXXXXXXXXX&#10;也支持直接粘反馈页/日志里的一大段文本"></textarea>',
            '<div><button class="primary gj-run">查询全部</button>',
            '<button class="gj-import">导入上次反馈页会话</button>',
            '<button class="gj-retry2">重试失败</button>',
            '<button class="gj-csv">导出 CSV</button>',
            '<button class="gj-copyall">复制全部结果</button>',
            '<button class="gj-clear">清空</button>',
            '<button class="gj-clearall">清空缓存</button></div>',
            '<div class="gj-stat"></div>',
            '<div class="gj-banner" style="display:none"></div>',
            '<table class="gj-table"><thead><tr>',
            COLS.map(function (c) { return '<th>' + c.label + '</th>'; }).join(''),
            '</tr></thead><tbody></tbody></table>',
            '<div class="gj-mute" style="margin-top:8px">同一 openid 10 分钟内不重复请求（GM 缓存，A/B 端共用）；并发 2 条。</div>',
            '</div>'
        ].join('');
        document.body.appendChild(d);
        WORKBENCH.drawer = d;
        const input = d.querySelector('.gj-input');
        d.querySelector('.gj-close').onclick = function () { d.style.display = 'none'; };
        d.querySelector('.gj-run').onclick = function () {
            const ids = parseIds(input.value);
            if (!ids.length) { alert('没识别到内容'); return; }
            resumeQueue();
            enqueue(ids);
            renderTable();
        };
        d.querySelector('.gj-import').onclick = function () {
            const b = loadRecentBatch();
            if (!b || !b.ids.length) { alert('没有上次会话记录（先去反馈页扫一次）'); return; }
            input.value = b.ids.join('\n');
            resumeQueue();
            enqueue(b.ids);
            renderTable();
        };
        d.querySelector('.gj-retry2').onclick = function () { retryFailed(); renderTable(); };
        d.querySelector('.gj-csv').onclick = function () {
            const rows = rowsFromState();
            if (!rows.length) { alert('还没有结果'); return; }
            const csv = toCsv(rows, COLS);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'gemjy-openid-' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (_) { } }, 0);
        };
        d.querySelector('.gj-copyall').onclick = function () {
            const rows = rowsFromState();
            const text = rows.map(function (r) { return [r.openid, r.nickname, r.uid, r.server, r.platform].join('\t'); }).join('\n');
            copyText(text, '全部结果');
        };
        d.querySelector('.gj-clear').onclick = function () {
            input.value = '';
            state.known = [];
            state.results = {};
            renderTable();
        };
        d.querySelector('.gj-clearall').onclick = function () {
            const n = clearCache();
            resumeQueue();
            alert('已清空 ' + n + ' 条缓存');
        };
    }

    function bootWorkbench() {
        addStyle(CSS);
        const start = function () {
            const b = mkEl('button', '', 'OpenID 批量查询');
            b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;padding:8px 12px;border-radius:8px;border:1px solid #1a7f45;background:#1a7f45;color:#fff;cursor:pointer;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif';
            b.onclick = openDrawer;
            document.body.appendChild(b);
            WORKBENCH.btn = b;
        };
        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start);
    }

    // ==================== 菜单命令 + 启动 ====================
    function registerMenus() {
        try {
            if (typeof GM_registerMenuCommand !== 'function') return;
            GM_registerMenuCommand('清空 OpenID 缓存', function () { alert('已清空 ' + clearCache() + ' 条'); });
            GM_registerMenuCommand('复制校准信息（接口形态）', function () { copyText(calibrationText(), '校准'); });
            GM_registerMenuCommand('清除已锁定的请求形态', function () { clearSpec(); alert('已清除 requestSpec，下次查询会重新试探'); });
        } catch (_) { }
    }

    function boot() {
        // 两端各自挂钩子
        if (isFeedbackHost()) {
            setHooks({ status: updateBadge, render: function () { renderPanel(); } });
            bootFeedback();
        } else {
            setHooks({ status: function () { }, render: function () { renderTable(); } });
            bootWorkbench();
        }
        registerMenus();
    }

    boot();
})();
