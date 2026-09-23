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
