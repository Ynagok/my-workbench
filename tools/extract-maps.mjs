#!/usr/bin/env node
/**
 * tools/extract-maps.mjs —— 从 GM 玩家页快照里抽出 4 张映射表，写成 tools/out/page-*.json
 * 精简表（只有 id → 名称，不带玩家信息），再交给 tools/audit-maps.mjs 对账。
 *
 * 为什么不直接用 build-game-data.mjs：那个要整份快照才能跑；这里可以先在含隐私的快照上
 * 抽成精简表，之后对账只读精简表（也方便把精简表单独贴出来复核）。
 *
 * 用法：
 *   node tools/extract-maps.mjs                        # 读 tools/fixtures/player-page.html
 *   node tools/extract-maps.mjs <快照.html> [输出目录]   # 输出目录默认 tools/out
 *
 * 产出：
 *   page-source.json         { "1": "默认", … }                  → DEFAULT_SOURCE_ID_MAP
 *   page-activity-type.json  { "2": "PASS卡", … }                 → DEFAULT_ACTIVITY_TYPE_MAP
 *   page-pack.json           { "151": {name,star,type,royal}, … } → PACK_NAME_MAP
 *   page-goods-1.json        棋子（10000）
 *   page-goods-2.json        家具（500000）+ 自宅家具（600）
 *   page-goods-3.json        其余分类（活动道具 / 换装 / 房型 / 好感度 …）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const INPUT = process.argv[2] || path.join(ROOT, 'tools', 'fixtures', 'player-page.html');
const OUT = process.argv[3] ? path.resolve(ROOT, process.argv[3]) : path.join(ROOT, 'tools', 'out');

if (!fs.existsSync(INPUT)) {
  console.error(`✗ 找不到快照：${INPUT}`);
  console.error('  把 GM 玩家页 Ctrl+S 存成 tools/fixtures/player-page.html（该文件已 gitignore，含隐私，别入库）。');
  process.exit(2);
}
const html = fs.readFileSync(INPUT, 'utf8');
console.log(`读取快照：${path.relative(ROOT, INPUT)}（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`);
fs.mkdirSync(OUT, { recursive: true });

const write = (name, obj) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`  ${name}\t${Object.keys(obj).length} 条`);
};

// ---------- ① 来源映射（opFrom / from 下拉）----------
{
  const seen = new Map();
  const re = /<select[^>]*name="(?:opFrom|from)"[^>]*>([\s\S]*?)<\/select>/g;
  let m;
  while ((m = re.exec(html))) {
    const one = {};
    const ore = /<option\s+value="(\d+)"[^>]*>([^<]*)<\/option>/g;
    let om;
    while ((om = ore.exec(m[1]))) {
      const name = om[2].trim();
      if (name) one[om[1]] = name;
    }
    const key = JSON.stringify(one);
    if (!seen.has(key)) seen.set(key, { map: one, n: 0 });
    seen.get(key).n++;
  }
  if (!seen.size) {
    console.error('⚠ 没找到 name="opFrom"/"from" 的下拉，来源表为空');
  }
  const best = [...seen.values()].sort((a, b) => Object.keys(b.map).length - Object.keys(a.map).length)[0];
  if (seen.size > 1) {
    console.warn(`⚠ 发现 ${seen.size} 种不同的来源下拉，取条目最多的那份（${Object.keys(best.map).length} 条，出现 ${best.n} 次）`);
  }
  write('page-source.json', best.map);
}

// ---------- ② 活动类型映射 ----------
{
  const map = {};
  const re = /query\/activity\/\d+\/type\/(\d+)"[\s\S]*?>([^<]{1,60}?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const name = m[2].replace(/\s+/g, ' ').trim();
    if (name && map[m[1]] === undefined) map[m[1]] = name;
  }
  write('page-activity-type.json', map);
}

// ---------- ③④ allPresentGoods：卡包 / 物品名 ----------
function sliceBraced(src, marker) {
  const at = src.indexOf(marker);
  if (at === -1) return null;
  const start = src.indexOf('{', at);
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

const raw = sliceBraced(html, 'allPresentGoods');
if (!raw) {
  console.error('⚠ 没找到 allPresentGoods，③④ 两张表跳过');
  process.exit(1);
}
const all = JSON.parse(raw);
const names = (catId) => {
  const out = {};
  const goods = (all[catId] && all[catId].goods) || {};
  for (const [id, g] of Object.entries(goods)) {
    const n = g && g.name;
    if (n) out[id] = String(n);
  }
  return out;
};

// ③ 卡包表（151–179）
const pack = {};
for (const [id, g] of Object.entries((all['150'] && all['150'].goods) || {})) {
  if (+id < 151 || +id > 179) continue;
  pack[id] = {
    name: (g && g.name) || '',
    star: g && g.star !== undefined ? g.star : null,
    type: g && g.type !== undefined ? g.type : null,
    royal: g && g.royal && Object.keys(g.royal).length ? g.royal : null,
  };
}
write('page-pack.json', pack);

// ④ 物品名（按页面的分类拆三份，方便分块复核）
write('page-goods-1.json', names('10000'));
write('page-goods-2.json', { ...names('500000'), ...names('600') });
const rest = {};
for (const cat of ['100', '200', '150', '1000000', '2000000', '900', '9000', '610', '130', '840', '4100000', '4209000']) {
  Object.assign(rest, names(cat));
}
write('page-goods-3.json', rest);

console.log(`\n完成。下一步：node tools/audit-maps.mjs（对照 public/index.html 的硬编码常量）`);
