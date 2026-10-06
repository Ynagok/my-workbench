#!/usr/bin/env node
/* 服务端冒烟：真起一个进程、真发 HTTP 请求，验证
   ① 非法 key（__proto__ / constructor / prototype / 含非法字符）被拒 400
   ② 合法 key 能正常写读
   ③ 拒绝之后没有发生原型污染、落盘文件里也没有脏键
   临时数据文件放在 tools/out/（已 gitignore），绝不碰仓库里的 data.json。

   用法：node tools/smoke-server.cjs
   注意：子进程 stdio 必须用 ignore/inherit —— 沙箱禁止管道，pipe 会 EPERM。 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'out');
const TMP_DATA = path.join(OUT_DIR, '_server-smoke-data.json');
const PORT = 3100 + (process.pid % 900);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
function check(cond, msg, extra) {
  if (cond) {
    pass++;
    console.log(`  ok  ${msg}`);
  } else {
    fail++;
    console.log(`  FAIL ${msg}${extra === undefined ? '' : ' → ' + JSON.stringify(extra)}`);
  }
}

function cleanup() {
  try { fs.rmSync(TMP_DATA, { force: true }); } catch (_) { /* ignore */ }
}

async function req(method, p, body) {
  const opt = { method };
  if (body !== undefined) {
    opt.headers = { 'Content-Type': 'application/json' };
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + p, opt);
  let json = null;
  try { json = await r.json(); } catch (_) { /* ignore */ }
  return { status: r.status, json };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  cleanup();

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_FILE: TMP_DATA },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let exited = null;
  child.on('exit', (code) => { exited = code; });

  let up = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 10000 && exited === null) {
    try {
      const r = await fetch(`${BASE}/api/data/probe`);
      if (r.status) { up = true; break; }
    } catch (_) { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 120));
  }

  try {
    if (!up) {
      check(false, '服务器能起来', { exited });
      return;
    }

    console.log('— 非法 key 必须被拒（400）—');
    for (const bad of ['__proto__', 'constructor', 'prototype', 'bad.key', 'bad%20key']) {
      const r = await req('POST', `/api/data/${bad}`, { value: { polluted: true } });
      check(r.status === 400, `POST /api/data/${bad} → 400`, r.status);
    }
    const g = await req('GET', '/api/data/__proto__');
    check(g.status === 400, 'GET /api/data/__proto__ → 400', g.status);

    console.log('— 原型污染没有发生 —');
    check({}.polluted === undefined, 'Object.prototype 没被污染');
    const raw = fs.existsSync(TMP_DATA) ? JSON.parse(fs.readFileSync(TMP_DATA, 'utf-8')) : {};
    check(!Object.prototype.hasOwnProperty.call(raw, '__proto__'), '落盘文件里没有 __proto__ 键', Object.keys(raw));

    console.log('— 合法 key 照常读写 —');
    const payload = { list: [1, 2, 3], name: '话术', nested: { a: null } };
    const w = await req('POST', '/api/data/work-bad_v2', { value: payload });
    check(w.status === 200 && w.json && w.json.success === true, 'POST 合法 key → 200/success', w.json);
    const rd = await req('GET', '/api/data/work-bad_v2');
    check(rd.status === 200 && JSON.stringify(rd.json.value) === JSON.stringify(payload),
      'GET 读回与写入一致', rd.json && rd.json.value);

    const onDisk = JSON.parse(fs.readFileSync(TMP_DATA, 'utf-8'));
    check(onDisk['work-bad_v2'] && onDisk['work-bad_v2'].name === '话术', '确实落盘到临时文件');
    check(!Object.keys(onDisk).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k)),
      '临时文件里没有任何危险键', Object.keys(onDisk));

    // ---------------- 下午茶投票：/api/vote/:key ----------------
    console.log('— 下午茶投票：原子合并 + 按天作废 —');
    // 北京时间的「今天」（跟服务端同一套算法，免得跨时区跑测试时错位）
    const bj = new Date(Date.now() + 8 * 3600 * 1000);
    const today = bj.toISOString().slice(0, 10);             // YYYY-MM-DD（北京时间）
    const pollKey = 'teaPoll_' + today.replace(/-/g, '');     // teaPoll_YYYYMMDD
    const poll = {
      id: pollKey, date: today, title: '今天下午茶', status: 'open',
      shopIds: ['s1', 's2'], shopNames: { s1: '蜜雪冰城', s2: '古茗' },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), votes: {}
    };
    const mk = await req('POST', `/api/data/${pollKey}`, { value: poll });
    check(mk.status === 200, '发起投票：用普通 /api/data 存下这份投票', mk.status);

    const v1 = await req('POST', `/api/vote/${pollKey}`, { voterId: 'v-dev1', shopIds: ['s1'] });
    check(v1.status === 200 && v1.json && v1.json.success && v1.json.value.votes['v-dev1'],
      '设备 1 投票 → 200，服务端返回合并后的整份', v1.json && Object.keys(v1.json.value.votes));
    const v2 = await req('POST', `/api/vote/${pollKey}`, { voterId: 'v-dev2', shopIds: ['s1', 's2'] });
    check(v2.status === 200 && Object.keys(v2.json.value.votes).length === 2,
      '设备 2 投票 → 设备 1 那一票还在（合并而不是覆盖）', Object.keys(v2.json && v2.json.value.votes));
    const v1again = await req('POST', `/api/vote/${pollKey}`, { voterId: 'v-dev1', shopIds: ['s2'] });
    check(v1again.status === 200 && Object.keys(v1again.json.value.votes).length === 2
      && JSON.stringify(v1again.json.value.votes['v-dev1'].shopIds) === '["s2"]',
      '同一台设备改票 → 只覆盖自己那条、人数不变',
      v1again.json && v1again.json.value.votes['v-dev1']);
    const readBack = await req('GET', `/api/vote/${pollKey}`);
    check(readBack.status === 200 && readBack.json.expired === false
      && Object.keys(readBack.json.value.votes).length === 2,
      'GET /api/vote 读回 2 票、没过期', readBack.json && readBack.json.expired);

    const badVoter = await req('POST', `/api/vote/${pollKey}`, { voterId: 'bad id!', shopIds: [] });
    check(badVoter.status === 400, '非法 voterId → 400', badVoter.status);
    const badShops = await req('POST', `/api/vote/${pollKey}`, { voterId: 'v-dev3', shopIds: 's1' });
    check(badShops.status === 400, 'shopIds 不是数组 → 400', badShops.status);
    const badKey = await req('POST', '/api/vote/__proto__', { voterId: 'v-dev3', shopIds: [] });
    check(badKey.status === 400, '非法投票 key → 400', badKey.status);
    const notPoll = await req('POST', '/api/vote/teaPoll_20200101', { voterId: 'v-dev3', shopIds: [] });
    check(notPoll.status === 404, '还没发起就投票 → 404', notPoll.status);

    // 截止后不能再投
    await req('POST', `/api/data/${pollKey}`, { value: { ...poll, status: 'closed' } });
    const closed = await req('POST', `/api/vote/${pollKey}`, { voterId: 'v-dev3', shopIds: ['s1'] });
    check(closed.status === 409, '已经截止的投票 → 409', closed.status);
    await req('POST', `/api/data/${pollKey}`, { value: { ...poll, status: 'open', votes: JSON.parse(JSON.stringify(v1again.json.value.votes)) } });

    // 过期的投票：读的时候顺手删掉，连数据都不留
    const oldKey = 'teaPoll_20200101';
    await req('POST', `/api/data/${oldKey}`, {
      value: { id: oldKey, date: '2020-01-01', status: 'open', shopIds: ['s1'], votes: { 'v-x': { voterId: 'v-x', shopIds: ['s1'] } } }
    });
    const expGet = await req('GET', `/api/vote/${oldKey}`);
    check(expGet.status === 200 && expGet.json.expired === true && expGet.json.value === null,
      '过期的投票：GET 返回 expired 且不给数据', expGet.json);
    const diskAfter = JSON.parse(fs.readFileSync(TMP_DATA, 'utf-8'));
    check(!Object.prototype.hasOwnProperty.call(diskAfter, oldKey),
      '过期投票被真的从 data.json 删掉了（不保留）', Object.keys(diskAfter));
    const expPost = await req('POST', `/api/vote/${oldKey}`, { voterId: 'v-y', shopIds: ['s1'] });
    check(expPost.status === 404,
      '过期的投票已被清掉，再投就是「还没发起」→ 404', expPost.status);
    // 另起一份「还在文件里但已过期」的投票，验证 POST 自己也会清理并拒写
    const oldKey2 = 'teaPoll_20200102';
    await req('POST', `/api/data/${oldKey2}`, {
      value: { id: oldKey2, date: '2020-01-02', status: 'open', shopIds: ['s1'], votes: {} }
    });
    const expPost2 = await req('POST', `/api/vote/${oldKey2}`, { voterId: 'v-y', shopIds: ['s1'] });
    check(expPost2.status === 410 && expPost2.json && expPost2.json.expired === true,
      '对「已过期但还没被读过」的投票提交 → 410 + expired', expPost2.json);
    const diskAfter2 = JSON.parse(fs.readFileSync(TMP_DATA, 'utf-8'));
    check(!Object.prototype.hasOwnProperty.call(diskAfter2, oldKey2),
      'POST 遇到过期投票也会把它删掉', Object.keys(diskAfter2));

    // 今天的投票（只要没到 23:00）不能被误删
    const stillThere = await req('GET', `/api/vote/${pollKey}`);
    check(stillThere.json.value !== null && stillThere.json.expired === false,
      '当天 23:00 前，投票数据不会被清掉', stillThere.json && stillThere.json.expired);
  } finally {
    try { child.kill(); } catch (_) { /* ignore */ }
    await new Promise((r) => setTimeout(r, 150));
    cleanup();
  }
}

main().then(() => {
  console.log(`\n服务端冒烟：${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}).catch((e) => {
  console.error('服务端冒烟异常：', e && e.message);
  cleanup();
  process.exit(1);
});
