/* eslint-disable */
// 打印当前模板实际生成的工单日报，用于肉眼确认排版
// 用法: node tools/print-report.cjs [index.html]
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

const { JSDOM, VirtualConsole } = loadJsdom();

const file = process.argv[2] || 'public/index.html';
if (!fs.existsSync(file)) { console.error('✗ 找不到 ' + file + '（请在仓库根目录运行 npm run verify）'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const mk = (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
const grad = { addColorStop() { } };
const proto = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
  shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
  createLinearGradient: () => grad, createRadialGradient: () => grad,
  getImageData: (x, y, w, h) => mk(w, h), createImageData: (w, h) => mk(w, h),
  putImageData() { }, drawImage() { }, fillRect() { }, clearRect() { }, beginPath() { }, closePath() { },
  moveTo() { }, lineTo() { }, arc() { }, ellipse() { }, quadraticCurveTo() { }, bezierCurveTo() { },
  fill() { }, stroke() { }, save() { }, restore() { }, translate() { }, rotate() { }, scale() { },
  setTransform() { }, clip() { }, fillText() { }, measureText: () => ({ width: 10 }),
};
const vc = new VirtualConsole();
const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:3080/index.html', runScripts: 'dangerously', virtualConsole: vc,
  beforeParse(window) {
    window.alert = () => { }; window.confirm = () => true;
    window.requestAnimationFrame = () => 0; window.cancelAnimationFrame = () => { };
    window.HTMLCanvasElement.prototype.getContext = function () { return Object.create(proto, { canvas: { value: this } }); };
    window.URL.createObjectURL = () => 'blob:'; window.URL.revokeObjectURL = () => { };
    window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  },
});
const { window } = dom; const doc = window.document;
setTimeout(() => {
  doc.getElementById('generateDailyBtn').click();
  console.log(doc.getElementById('dailyResultArea').value);
  process.exit(0);
}, 150);
