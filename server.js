const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 静态文件：把前端 HTML 放在 public 目录
app.use(express.static(path.join(__dirname, 'public')));

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
  const data = readData();
  res.json({ value: data[req.params.key] });
});

// API：保存某个 key 的数据
app.post('/api/data/:key', (req, res) => {
  const data = readData();
  data[req.params.key] = req.body.value;
  writeData(data);
  res.json({ success: true });
});

// 启动
app.listen(PORT, () => {
  console.log(`✅ 同步服务器启动：http://localhost:${PORT}`);
});