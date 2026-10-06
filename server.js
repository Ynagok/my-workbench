const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// 落盘位置可用 DATA_FILE 覆盖：自检脚本据此写到临时文件，避免污染真实 data.json
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

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

// API：获取某个 key 的数据
app.get('/api/data/:key', (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) return res.status(400).json({ error: '非法的数据 key' });
  const data = readData();
  res.json({ value: data[key] });
});

// API：保存某个 key 的数据
app.post('/api/data/:key', (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) return res.status(400).json({ error: '非法的数据 key' });
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

// 启动
app.listen(PORT, () => {
  console.log(`✅ 同步服务器启动：http://localhost:${PORT}`);
});
