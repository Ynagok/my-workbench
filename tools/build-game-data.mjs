#!/usr/bin/env node
/**
 * tools/build-game-data.mjs —— 从 GM 玩家页快照里提取权威映射表，并与 public/index.html 里
 * 硬编码的常量做差异比对。
 *
 * 用法：
 *   npm run build:data                 # 读 tools/fixtures/player-page.html
 *   node tools/build-game-data.mjs <快照路径>
 *
 * 产出（都写到 tools/out/，已 gitignore）：
 *   game-data.json    4 张表：source / activityType / pack / goods(+category)
 *   diff-report.md    与 index.html 硬编码常量的差异（缺 / 多 / 名称不一致）
 *   stdout            摘要 + 载荷体积（给「装载方式」决策用）
 *
 * 注意：快照含真实玩家信息（playerId/openId/昵称等），fixtures/player-page.html 已 gitignore，
 *       请勿提交。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE = process.argv[2] || path.join(ROOT, 'tools', 'fixtures', 'player-page.html');
const OUT_DIR = path.join(ROOT, 'tools', 'out');

if (!fs.existsSync(FIXTURE)) {
  console.error(`✗ 找不到快照文件：${FIXTURE}`);
  console.error('  把 GM 玩家页（右键「另存为」或 Ctrl+S 保存完整 HTML）放到 tools/fixtures/player-page.html');
  process.exit(2);
}
const html = fs.readFileSync(FIXTURE, 'utf8');
console.log(`读取快照：${path.relative(ROOT, FIXTURE)}（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`);

// ---------- 工具：从 HTML 里取 <select name="X"> 的 option id→name ----------
function extractOptions(src, names) {
  const map = {};
  let hit = 0;
  for (const n of names) {
    const re = new RegExp(`<select[^>]*name="${n}"[^>]*>([\\s\\S]*?)</select>`, 'g');
    let m;
    while ((m = re.exec(src))) {
      hit++;
      const ore = /<option\s+value="(\d+)"[^>]*>([^<]*)<\/option>/g;
      let om;
      while ((om = ore.exec(m[1]))) {
        const id = om[1];
        const name = om[2].trim();
        if (name && map[id] === undefined) map[id] = name;
      }
    }
  }
  return { map, hit };
}

// ---------- 工具：从源码里切出「标记之后第一个配对的大括号块」 ----------
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

// ---------- 1. 来源 / 操作来源映射（opFrom 与各日志页的 from 是同一套 id） ----------
const source = extractOptions(html, ['opFrom', 'from']);
console.log(`① 来源映射: ${Object.keys(source.map).length} 条（命中 ${source.hit} 个 select）`);

// ---------- 2. 活动类型映射（活动下拉里 /query/activity/<pid>/type/<N>） ----------
const activityType = {};
{
  const re = /query\/activity\/\d+\/type\/(\d+)"[\s\S]*?>([^<]{1,60}?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1], name = m[2].replace(/\s+/g, ' ').trim();
    if (name && activityType[id] === undefined) activityType[id] = name;
  }
}
console.log(`② 活动类型映射: ${Object.keys(activityType).length} 条`);

// ---------- 3+4. allPresentGoods：卡包表 + 分类表 + 物品名表 ----------
let all = null;
{
  const raw = sliceBraced(html, 'allPresentGoods');
  if (raw) {
    try { all = JSON.parse(raw); }
    catch (e) { console.error(`✗ allPresentGoods JSON 解析失败：${e.message}`); }
  }
}
const pack = {};        // 卡包 id -> { name, star, type, royal }
const category = {};    // presentGoodsType id -> 分类名
const goods = {};       // 物品 id -> 名称（棋子/卡包/道具…）
if (all) {
  for (const [catId, cat] of Object.entries(all)) {
    category[catId] = (cat && cat.name) || '';
    for (const [gid, g] of Object.entries((cat && cat.goods) || {})) {
      if (g && g.name) goods[gid] = g.name;
      if (catId === '150') {
        pack[gid] = {
          name: (g && g.name) || '',
          star: g && g.star !== undefined ? g.star : null,
          type: g && g.type !== undefined ? g.type : null,
          royal: (g && g.royal && Object.keys(g.royal).length) ? g.royal : null,
        };
      }
    }
  }
  console.log(`③ 卡包映射: ${Object.keys(pack).length} 条`);
  console.log(`④ 物品名映射: ${Object.keys(goods).length} 条（${Object.keys(category).length} 个分类）`);
} else {
  console.error('⚠ 没能从快照里解析出 allPresentGoods —— ③④ 两张表会是空的');
}

// ---------- 与 index.html 硬编码常量做差异 ----------
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const parsePairs = (src) => {
  const out = {};
  if (!src) return out;
  const re = /"?(\d+)"?\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) out[m[1]] = m[2];
  return out;
};
const hard = {
  item: parsePairs(sliceBraced(indexHtml, 'const DEFAULT_ITEM_NAME_MAP = {')),
  source: parsePairs(sliceBraced(indexHtml, 'const DEFAULT_SOURCE_ID_MAP = {')),
  activityType: parsePairs(sliceBraced(indexHtml, 'const DEFAULT_ACTIVITY_TYPE_MAP = {')),
  pack: parsePairs(sliceBraced(indexHtml, 'const PACK_NAME_MAP = {')),
};

function diffTable(label, fromGame, fromIndex) {
  const gk = Object.keys(fromGame), ik = Object.keys(fromIndex);
  const missing = gk.filter(k => fromIndex[k] === undefined);
  const extra = ik.filter(k => fromGame[k] === undefined);
  const renamed = gk.filter(k => fromIndex[k] !== undefined && String(fromIndex[k]) !== String(fromGame[k]));
  missing.sort((a, b) => a - b); extra.sort((a, b) => a - b); renamed.sort((a, b) => a - b);
  console.log(`  ${label}: 游戏 ${gk.length} / 硬编码 ${ik.length} → 缺 ${missing.length}、多 ${extra.length}、名称不一致 ${renamed.length}`);
  return { missing, extra, renamed };
}

console.log('\n=== 与 index.html 硬编码常量的差异 ===');
const diffs = {
  source: diffTable('来源映射 DEFAULT_SOURCE_ID_MAP', source.map, hard.source),
  activityType: diffTable('活动类型 DEFAULT_ACTIVITY_TYPE_MAP', activityType, hard.activityType),
  pack: diffTable('卡包名 PACK_NAME_MAP', Object.fromEntries(Object.entries(pack).map(([k, v]) => [k, v.name])), hard.pack),
  goods: diffTable('物品名 DEFAULT_ITEM_NAME_MAP', goods, hard.item),
};

// ---------- 落盘 ----------
fs.mkdirSync(OUT_DIR, { recursive: true });
const payload = { generatedFrom: path.basename(FIXTURE), source: source.map, activityType, category, pack, goods };
const json = JSON.stringify(payload, null, 2);
fs.writeFileSync(path.join(OUT_DIR, 'game-data.json'), json, 'utf8');

const md = [];
md.push('# 游戏数据差异报告', '');
md.push(`来源快照：\`${path.basename(FIXTURE)}\``, '');
md.push('| 表 | 游戏 | index.html 硬编码 | 缺 | 多 | 名称不一致 |', '|---|---|---|---|---|---|');
for (const [k, label] of [['source', '来源映射'], ['activityType', '活动类型'], ['pack', '卡包名'], ['goods', '物品名']]) {
  const d = diffs[k];
  md.push(`| ${label} | - | - | ${d.missing.length} | ${d.extra.length} | ${d.renamed.length} |`);
}
md.push('', '## 明细', '');
for (const [k, label] of [['source', '来源映射 DEFAULT_SOURCE_ID_MAP'], ['activityType', '活动类型 DEFAULT_ACTIVITY_TYPE_MAP'], ['pack', '卡包名 PACK_NAME_MAP'], ['goods', '物品名 DEFAULT_ITEM_NAME_MAP']]) {
  const d = diffs[k];
  const src = k === 'goods' ? goods : k === 'pack' ? Object.fromEntries(Object.entries(pack).map(([i, v]) => [i, v.name])) : k === 'source' ? source.map : activityType;
  md.push(`### ${label}`, '');
  if (d.missing.length) {
    md.push(`**游戏里有、index.html 缺（${d.missing.length}）**：`, '', '```');
    for (const id of d.missing.slice(0, 200)) md.push(`${id}\t${src[id]}`);
    if (d.missing.length > 200) md.push(`…（其余 ${d.missing.length - 200} 条省略）`);
    md.push('```', '');
  }
  if (d.renamed.length) {
    md.push(`**名称不一致（${d.renamed.length}）**：`, '', '| id | index.html | 游戏 |', '|---|---|---|');
    const idx = k === 'goods' ? hard.item : k === 'pack' ? hard.pack : k === 'source' ? hard.source : hard.activityType;
    for (const id of d.renamed.slice(0, 100)) md.push(`| ${id} | ${idx[id]} | ${src[id]} |`);
    md.push('');
  }
  if (d.extra.length) {
    md.push(`**index.html 有、游戏里没有（${d.extra.length}）**：${d.extra.slice(0, 60).join('、')}${d.extra.length > 60 ? ' …' : ''}`, '');
  }
}
// 卡包星级/royal 码，单独列一节（集卡分析的星级标签就靠它）
const royal = Object.entries(pack).filter(([, v]) => v.royal);
if (royal.length) {
  md.push('## 卡包星级码（royal，集卡分析星级标签用）', '', '| 卡包ID | 名称 | star | royal 码 |', '|---|---|---|---|');
  for (const [id, v] of royal) md.push(`| ${id} | ${v.name} | ${v.star} | ${Object.entries(v.royal).map(([c, n]) => `${c}×${n}`).join(', ')} |`);
  md.push('');
}
fs.writeFileSync(path.join(OUT_DIR, 'diff-report.md'), md.join('\n'), 'utf8');

console.log('\n=== 产出 ===');
console.log(`  tools/out/game-data.json     ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB${Buffer.byteLength(json) <= 150 * 1024 ? '（≤150KB，可走 C3 复用 /api/data）' : '（>150KB，C3 超限，需评估 C1 新接口）'}`);
console.log(`  tools/out/diff-report.md     ${(Buffer.byteLength(md.join('\n')) / 1024).toFixed(1)} KB`);
