const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
// 落盘位置可用 DATA_FILE 覆盖：自检脚本据此写到临时文件，避免污染真实 data.json
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, 'data.json');

app.use(cors());
// 截图识别会上传 base64 图片，所以放宽到 10MB（普通 /api/data 的写入仍有 key 白名单挡着）
app.use(express.json({ limit: '10mb' }));

// 静态文件：把前端 HTML 放在 public 目录
app.use(express.static(path.join(__dirname, 'public')));

// 数据 key 白名单：只放行字母/数字/下划线/连字符，1..64 位。
// 必须显式挡住 __proto__ / constructor / prototype —— 因为 `data[key] = value`
// 遇到 __proto__ 会去改写对象原型（原型污染），而不是存一个普通键。
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isValidKey(key) {
  return typeof key === 'string' && KEY_RE.test(key) && !FORBIDDEN_KEYS.has(key);
}

// 读取数据文件
function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('读取数据文件失败:', e.message);
  }
  return {};
}

// 写入数据文件
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ==================== SOP 数据（sopBundle / sop*）的口令保护 ====================
// ⚠️ SOP 里全是内部规范（有「严禁告知玩家」的红线内容、判定阈值、升级顺序），
//    不能像日报模板那样任何人拿到地址就能读。所以**只对 sop 开头的 key**要口令：
//    - 环境变量 SOP_TOKEN 没配 → sop 数据一律 403（宁可不可用，也不裸奔）
//    - 请求头 `x-sop-token`（或 query `?token=`）必须与 SOP_TOKEN 一致
//    - 其它 key（work-bad_v2 / teaShops / teaPoll_* …）行为完全不变
const SOP_TOKEN = process.env.SOP_TOKEN || '';
const SOP_KEY_RE = /^sop/i;
function isSopKey(key) {
  return SOP_KEY_RE.test(String(key));
}
function tokenEq(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function denySop(req, res) {
  const given = req.get('x-sop-token') || req.query.token || '';
  if (!SOP_TOKEN) {
    res.status(403).json({ error: '服务端未配置 SOP_TOKEN，SOP 数据已关闭' });
    return true;
  }
  if (!tokenEq(given, SOP_TOKEN)) {
    res.status(403).json({ error: 'SOP 口令不对' });
    return true;
  }
  return false;
}

// API：获取某个 key 的数据
app.get('/api/data/:key', (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) return res.status(400).json({ error: '非法的数据 key' });
  if (isSopKey(key) && denySop(req, res)) return;
  const data = readData();
  res.json({ value: data[key] });
});

// API：保存某个 key 的数据
app.post('/api/data/:key', (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) return res.status(400).json({ error: '非法的数据 key' });
  if (isSopKey(key) && denySop(req, res)) return;
  const data = readData();
  data[key] = req.body.value;
  writeData(data);
  res.json({ success: true });
});

// ==================== 下午茶投票（teaPoll_YYYYMMDD） ====================
// 为什么单独开两个端点、而不复用 /api/data：
//   1) 投票是「很多台设备各写自己那一票」→ 必须由服务端做**原子合并**，否则后 POST 的会覆盖先 POST 的（丢票）。
//      readData/writeData 都是同步的、Node 单线程，读改写之间没有 await，所以这里天然不会互相覆盖。
//   2) 投票按天作废：**北京时间当天 23:00 之后连数据一起删掉、不留档**（用户要求），
//      用「谁访问谁触发」的惰性清理实现 —— Render 免费实例会休眠，常驻定时器不可靠。
const VOTE_KEY_RE = /^teaPoll_\d{8}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const VOTE_MAX_SHOPS = 50;
// 北京时间（服务器时区可能是 UTC，所以显式 +8；用 getUTC* 读出来）
function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000);
}
function isVoteExpired(poll) {
  const date = poll && typeof poll.date === 'string' ? poll.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;   // 没有日期就不判过期，别误删
  const d = beijingNow();
  const today = d.toISOString().slice(0, 10);
  if (date < today) return true;                          // 早于今天 → 已作废
  if (date > today) return false;                         // 将来的投票（理论上不会有）
  return d.getUTCHours() >= 23;                           // 北京时间过了 23:00 → 作废
}
// 截止时间：poll.deadline 是「HH:MM」（北京时间、当天）。
// 到点之后**只读不写**（还能看结果），数据本身留到当天 23:00 才由 isVoteExpired 连数据清掉。
// poll.status === 'closed' 是发起人手动截止，跟「到点」等价。
const DEADLINE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function beijingHM() {
  const d = beijingNow();
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
// 返回 '' = 还能投；'manual' = 手动截止；'deadline' = 到截止时间了
function voteClosedReason(poll) {
  if (!poll || typeof poll !== 'object') return '';
  if (poll.status === 'closed') return 'manual';
  const dl = typeof poll.deadline === 'string' ? poll.deadline : '';
  if (!DEADLINE_RE.test(dl)) return '';                 // 没设 / 格式不对 → 不按时间截止
  const date = typeof poll.date === 'string' ? poll.date : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const today = beijingNow().toISOString().slice(0, 10);
    if (date < today) return 'deadline';                // 以前的投票（理论上这时已经过期了）
    if (date > today) return '';                        // 将来的投票（理论上不会有）
  }
  return beijingHM() >= dl ? 'deadline' : '';           // 'HH:MM' 的字典序 == 时刻序
}
function isValidVoteKey(key) {
  return typeof key === 'string' && VOTE_KEY_RE.test(key) && !FORBIDDEN_KEYS.has(key);
}
function normalizeShopIds(v) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const s of v) {
    if (typeof s !== 'string' || !ID_RE.test(s)) return null;
    if (out.indexOf(s) === -1) out.push(s);               // 同一家重复选只算一次
    if (out.length > VOTE_MAX_SHOPS) return null;
  }
  return out;
}

// API：读某天的投票（顺手清理过期的）
app.get('/api/vote/:key', (req, res) => {
  const key = req.params.key;
  if (!isValidVoteKey(key)) return res.status(400).json({ error: '非法的投票 key' });
  const data = readData();
  const poll = data[key];
  if (poll && isVoteExpired(poll)) {
    delete data[key];                                     // 23:00 之后：连数据一起清掉，不保留
    writeData(data);
    return res.json({ value: null, expired: true, closed: false, closedReason: '' });
  }
  const reason = voteClosedReason(poll);
  res.json({
    value: poll === undefined ? null : poll,
    expired: false,
    closed: !!reason,                                     // 到点后前端只展示结果，不能再投
    closedReason: reason                                  // '' | 'manual' | 'deadline'
  });
});

// API：投自己那一票（服务端合并，只动这个 voterId 那一条）
app.post('/api/vote/:key', (req, res) => {
  const key = req.params.key;
  if (!isValidVoteKey(key)) return res.status(400).json({ error: '非法的投票 key' });
  const body = req.body || {};
  const voterId = body.voterId;
  if (typeof voterId !== 'string' || !ID_RE.test(voterId)) return res.status(400).json({ error: '非法的 voterId' });
  const shopIds = normalizeShopIds(body.shopIds);
  if (shopIds === null) return res.status(400).json({ error: 'shopIds 必须是店家 id 数组（最多 50 个）' });

  const data = readData();
  const poll = data[key];
  if (poll && isVoteExpired(poll)) {
    delete data[key];
    writeData(data);
    return res.status(410).json({ error: '投票已过期（当天 23:00 后清除）', expired: true });
  }
  if (!poll || typeof poll !== 'object') return res.status(404).json({ error: '投票不存在或还没发起' });
  const reason = voteClosedReason(poll);
  if (reason) {
    return res.status(409).json({
      error: reason === 'deadline'
        ? ('投票已在 ' + poll.deadline + ' 截止（只能看结果，当天 23:00 自动清除）')
        : '投票已截止',
      closed: true, closedReason: reason
    });
  }
  if (!poll.votes || typeof poll.votes !== 'object') poll.votes = {};
  const nowIso = new Date().toISOString();
  const old = poll.votes[voterId];
  poll.votes[voterId] = {
    voterId: voterId,
    shopIds: shopIds,
    at: old && typeof old.at === 'string' ? old.at : nowIso,
    updatedAt: nowIso
  };
  poll.updatedAt = nowIso;
  data[key] = poll;
  writeData(data);
  res.json({ success: true, value: poll });
});

// ==================== 截图识别（排班日历）：POST /api/ocr ====================
// 浏览器里没有可靠的离线 OCR，所以放在服务端做：
//   1) Windows 10/11：直接用系统自带的 Windows.Media.Ocr（tools/ocr-win.ps1，**不用装任何东西**，
//      系统里装了中文语言包就能认中文）；先把图放大 3 倍再认 —— 日历里「12:00 F班」那种小字放大后识别率差很多。
//   2) 其它平台（或系统没 OCR 引擎）：退回本机装的 tesseract（PATH 里或常见安装路径，可用 OCR_TESSERACT 指定）。
//   3) 都没有 → 501 + 提示，前端会告诉用户怎么办（功能降级，粘文本那条路照旧可用）。
// 图片以 dataURL（base64）POST 上来，落一个临时文件，用完就删。
const OCR_MAX_BYTES = 8 * 1024 * 1024;
const OCR_PS1 = path.join(__dirname, 'tools', 'ocr-win.ps1');
const IMG_DATAURL_RE = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,([A-Za-z0-9+/=\s]+)$/i;

function runCmd(cmd, args, timeout) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(cmd, args, { timeout: timeout || 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => resolve({ err: err || null, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    } catch (e) {
      return resolve({ err: e, stdout: '', stderr: String((e && e.message) || e) });   // 沙箱里可能直接 EPERM
    }
    if (child && child.on) child.on('error', () => { });
  });
}

let ocrTesseractPath = null;   // null = 还没探测；'' = 探测过但没有；其它 = 可执行文件路径
async function findTesseract() {
  if (ocrTesseractPath !== null) return ocrTesseractPath;
  const cands = [];
  if (process.env.OCR_TESSERACT) cands.push(process.env.OCR_TESSERACT);
  cands.push('tesseract');
  if (process.platform === 'win32') {
    cands.push('C:\\Program Files\\Tesseract-OCR\\tesseract.exe');
    cands.push('C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe');
    if (process.env.LOCALAPPDATA) cands.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Tesseract-OCR', 'tesseract.exe'));
  } else {
    cands.push('/usr/bin/tesseract', '/usr/local/bin/tesseract');
  }
  for (const c of cands) {
    const r = await runCmd(c, ['--version'], 15000);
    if (!r.err) { ocrTesseractPath = c; return c; }
  }
  ocrTesseractPath = '';
  return '';
}

// 返回 { text, engine } 或 { error, hint }
async function ocrImage(tmpFile) {
  if (process.platform === 'win32' && fs.existsSync(OCR_PS1)) {
    const r = await runCmd('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', OCR_PS1, '-Path', tmpFile, '-Scale', '3'], 90000);
    if (!r.err) return { text: r.stdout, engine: 'windows' };
    // 退出码 2 = 系统没装 OCR 引擎；其它错误也继续试 tesseract
  }
  const tess = await findTesseract();
  if (tess) {
    let r = await runCmd(tess, [tmpFile, 'stdout', '-l', 'chi_sim+eng', '--psm', '6'], 90000);
    if (r.err) r = await runCmd(tess, [tmpFile, 'stdout', '-l', 'eng', '--psm', '6'], 90000);   // 没装中文包
    if (!r.err) return { text: r.stdout, engine: 'tesseract' };
  }
  return {
    error: 'no-ocr',
    hint: '这台机器没有可用的 OCR：Windows 10/11 直接可用（系统自带）；其它系统请装 tesseract（如 apt-get install tesseract-ocr tesseract-ocr-chi-sim），或用 OCR_TESSERACT 指定路径'
  };
}

app.post('/api/ocr', async (req, res) => {
  const body = req.body || {};
  const m = IMG_DATAURL_RE.exec(String(body.image || ''));
  if (!m) return res.status(400).json({ ok: false, error: 'bad-image', hint: '传一张图片的 dataURL（png / jpg / webp / bmp）' });
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > OCR_MAX_BYTES) {
    return res.status(400).json({ ok: false, error: 'bad-image', hint: '图片是空的或太大（上限 8MB）' });
  }
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const tmpFile = path.join(os.tmpdir(), 'workbad-ocr-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.' + ext);
  try {
    fs.writeFileSync(tmpFile, buf);
    const out = await ocrImage(tmpFile);
    if (out.error) return res.status(501).json({ ok: false, error: out.error, hint: out.hint });
    res.json({ ok: true, engine: out.engine, text: out.text });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'ocr-failed', hint: String((e && e.message) || e) });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) { /* 临时文件清不掉不影响结果 */ }
  }
});

// 启动
app.listen(PORT, () => {
  console.log(`✅ 同步服务器启动：http://localhost:${PORT}`);
});
