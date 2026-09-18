/* eslint-disable */
// 对照实验：把 fetch 变成永远不 resolve 的 Promise（模拟接口挂起），
// 检查界面是否仍然可用 —— 验证「首屏不再阻塞在 await 网络」。
// 用法: node tools/smoke-nonblocking.cjs index.html
const fs = require('node:fs');
const path = require('node:path');

// ---- jsdom 解析：优先仓库依赖，其次本机 DSH 检出自带的 .pnpm ----
function loadJsdom() {
  try { return require('jsdom'); } catch (_) { }
  const roots = [
    path.join(__dirname, '..', 'node_modules', '.pnpm'),
    'E:/ai/DSH-CyberWorkStation-main/core/node_modules/.pnpm',
    'E:/ai/DSH-CyberWorkStation/core/node_modules/.pnpm',
  ];
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root).filter(d => /^jsdom@/.test(d)); } catch (_) { continue; }
    for (const d of dirs) {
      const p = path.join(root, d, 'node_modules', 'jsdom');
      try { if (fs.existsSync(p)) return require(p); } catch (_) { }
    }
  }
  console.error('✗ 找不到 jsdom。请在仓库根目录执行：npm i -D jsdom');
  process.exit(2);
}

const { JSDOM } = loadJsdom();

const file = process.argv[2] || 'public/index.html';
if (!fs.existsSync(file)) { console.error('✗ 找不到 ' + file + '（请在仓库根目录运行 npm run verify）'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const hang = new Promise(() => { });   // 永不 settle

const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:3080/index.html',
  runScripts: 'dangerously',
  beforeParse(window) {
    window.alert = () => { }; window.confirm = () => true;
    window.requestAnimationFrame = () => 0; window.cancelAnimationFrame = () => { };
    window.HTMLCanvasElement.prototype.getContext = function () { return null; };
    window.fetch = () => hang;
  },
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(400);   // 远超任何"应该"的等待时间；若被阻塞则界面仍未初始化
  const checks = [
    ['开头语下拉已填充', $('openingSelect').options.length === 4, $('openingSelect').options.length],
    ['日报表单已渲染', $('dailyFormTicket').querySelectorAll('input,textarea,select').length > 20],
    ['调试台就绪文案', /工作台就绪/.test($('flowDebugConsole').textContent)],
    ['按钮可点击（解析不抛错）', (() => {
      try {
        $('smartPasteInput').value = '2026-04-20 16:04:00\tx\t体力\t101\t体力\t货币\t-1\t326\t325\t棋盘操作-临时母棋生产\t107';
        $('smartParseBtn').click();
        return $('globalResultArea').value.length > 0;
      } catch (e) { return false; }
    })()],
  ];
  let bad = 0;
  for (const [msg, cond, extra] of checks) {
    console.log((cond ? '✓ ' : '✗ ') + msg + (extra !== undefined ? `  → ${extra}` : ''));
    if (!cond) bad++;
  }
  console.log(bad ? `\n✗ ${bad} 项失败：接口挂起时界面不可用` : '\n✅ 接口挂起时界面依旧可用（首屏未被网络阻塞）');
  process.exit(bad ? 1 : 0);
})();
