/* 把一份 SOP bundle JSON 推到服务端（要 SOP_TOKEN）：
   SOP_TOKEN=xxx BASE_URL=https://work-bad.onrender.com npm run sop:seed
   - bundle 默认读 tools/out/sop/bundle.json（含内部口径，已 gitignore；不要入库）
   - 服务端 key = sopBundle（以 sop 开头 → 受口令保护） */
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.SOP_TOKEN || '';
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const FILE = process.argv[2] || path.join(__dirname, 'out', 'sop', 'bundle.json');
const KEY = process.env.SOP_KEY || 'sopBundle';

if (!TOKEN) {
  console.error('✗ 没设 SOP_TOKEN（要和 server.js 的环境变量一致）');
  process.exit(2);
}
if (!fs.existsSync(FILE)) {
  console.error('✗ 找不到 bundle：' + FILE);
  process.exit(2);
}

const bundle = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (!bundle || !Array.isArray(bundle.scenes) || !bundle.scenes.length) {
  console.error('✗ bundle 里没有 scenes');
  process.exit(2);
}

(async () => {
  const url = BASE + '/api/data/' + encodeURIComponent(KEY);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sop-token': TOKEN },
    body: JSON.stringify({ value: bundle })
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error('✗ ' + resp.status + ' ' + text);
    process.exit(1);
  }
  console.log(`✓ 已推送 ${bundle.scenes.length} 个场景（v${bundle.version}，更新于 ${bundle.updatedAt}）→ ${url}`);
})();
