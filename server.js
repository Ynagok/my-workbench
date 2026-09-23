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

// 启动
app.listen(PORT, () => {
  console.log(`✅ 同步服务器启动：http://localhost:${PORT}`);
});
