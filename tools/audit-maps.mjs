#!/usr/bin/env node
/**
 * tools/audit-maps.mjs —— 用「从 GM 玩家页抽出来的精简映射 JSON」对账 public/index.html 里的
 * 4 张硬编码常量表：来源映射 / 活动类型 / 卡包名 / 物品名。
 *
 * 为什么不用 build-game-data.mjs：那个要整份玩家页快照（含真实玩家信息、体积大）。
 * 这里只吃精简表（id → 名称），可以只从页面里把映射抄下来，不落隐私。
 *
 * 用法：
 *   node tools/audit-maps.mjs                       # 读 tools/out/page-*.json
 *   node tools/audit-maps.mjs --dir tools/out       # 指定目录
 *
 * 输入（都在 tools/out/，已 gitignore）：
 *   page-source.json         { "1": "默认", … }             → DEFAULT_SOURCE_ID_MAP
 *   page-activity-type.json  { "2": "PASS卡", … }            → DEFAULT_ACTIVITY_TYPE_MAP
 *   page-pack.json           { "151": {name,star,royal}, … } → PACK_NAME_MAP
 *   page-goods-*.json        { "10101": "竹子", … }（可多个，自动合并）→ DEFAULT_ITEM_NAME_MAP
 *
 * 产出：tools/out/map-audit.md + stdout 摘要。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const dirArg = argv.indexOf('--dir');
const DIR = dirArg === -1 ? path.join(ROOT, 'tools', 'out') : path.resolve(ROOT, argv[dirArg + 1] || 'tools/out');

const readJson = (file) => {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error(`✗ ${file} 不是合法 JSON：${e.message}`); return null; }
};

// ---------- 从 index.html 里切常量 ----------
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

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

const parsePairs = (src) => {
  const out = {};
  if (!src) return out;
  const re = /"?(\d+)"?\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) {
    out[m[1]] = m[2].replace(/\\(.)/g, '$1');
  }
  return out;
};

const hard = {
  source: parsePairs(sliceBraced(html, 'const DEFAULT_SOURCE_ID_MAP = {')),
  activityType: parsePairs(sliceBraced(html, 'const DEFAULT_ACTIVITY_TYPE_MAP = {')),
  pack: parsePairs(sliceBraced(html, 'const PACK_NAME_MAP = {')),
  item: parsePairs(sliceBraced(html, 'const DEFAULT_ITEM_NAME_MAP = {')),
};

// ---------- 读精简表 ----------
const pageSource = readJson('page-source.json') || {};
const pageActivity = readJson('page-activity-type.json') || {};
const pagePackRaw = readJson('page-pack.json') || {};
const pagePack = Object.fromEntries(Object.entries(pagePackRaw).map(([id, v]) => [id, typeof v === 'string' ? v : (v && v.name) || '']));

let pageGoods = {};
for (const f of fs.readdirSync(DIR).filter(n => /^page-goods.*\.json$/.test(n)).sort()) {
  const obj = readJson(f);
  if (!obj) continue;
  const n = Object.keys(obj).length;
  pageGoods = { ...pageGoods, ...obj };
  console.log(`  合并 ${f}（${n} 条）`);
}

// ---------- 差异 ----------
const idSort = (a, b) => Number(a) - Number(b);
function diff(label, page, hardMap) {
  const pk = Object.keys(page), hk = Object.keys(hardMap);
  const missing = pk.filter(k => hardMap[k] === undefined).sort(idSort);
  const extra = hk.filter(k => page[k] === undefined).sort(idSort);
  const renamed = pk.filter(k => hardMap[k] !== undefined && String(hardMap[k]) !== String(page[k])).sort(idSort);
  console.log(`  ${label}：页面 ${pk.length} / 硬编码 ${hk.length} → 缺 ${missing.length}、多 ${extra.length}、名称不一致 ${renamed.length}`);
  return { label, page, hardMap, missing, extra, renamed };
}

const tables = [
  diff('来源映射 DEFAULT_SOURCE_ID_MAP', pageSource, hard.source),
  diff('活动类型 DEFAULT_ACTIVITY_TYPE_MAP', pageActivity, hard.activityType),
  diff('卡包名 PACK_NAME_MAP', pagePack, hard.pack),
  diff('物品名 DEFAULT_ITEM_NAME_MAP', pageGoods, hard.item),
];

// ---------- 报告 ----------
const md = ['# 映射对账（精简表 vs index.html 硬编码）', '', `输入目录：\`${path.relative(ROOT, DIR)}\``, '',
  '| 表 | 页面 | 硬编码 | 缺 | 多 | 名称不一致 |', '|---|---|---|---|---|---|'];
for (const t of tables) {
  md.push(`| ${t.label} | ${Object.keys(t.page).length} | ${Object.keys(t.hardMap).length} | ${t.missing.length} | ${t.extra.length} | ${t.renamed.length} |`);
}

for (const t of tables) {
  md.push('', `## ${t.label}`, '');
  if (t.missing.length) {
    md.push(`**页面有、硬编码缺（${t.missing.length}）**：`, '', '| id | 页面名称 |', '|---|---|');
    for (const id of t.missing.slice(0, 300)) md.push(`| ${id} | ${t.page[id]} |`);
    if (t.missing.length > 300) md.push(`| … | 其余 ${t.missing.length - 300} 条省略 |`);
    md.push('');
  }
  if (t.renamed.length) {
    md.push(`**名称不一致（${t.renamed.length}）**：`, '', '| id | index.html | 页面 |', '|---|---|---|');
    for (const id of t.renamed.slice(0, 300)) md.push(`| ${id} | ${t.hardMap[id]} | ${t.page[id]} |`);
    if (t.renamed.length > 300) md.push(`| … | 其余 ${t.renamed.length - 300} 条省略 |`);
    md.push('');
  }
  if (t.extra.length) {
    md.push(`**硬编码有、页面没有（${t.extra.length}）**：${t.extra.slice(0, 120).join('、')}${t.extra.length > 120 ? ' …' : ''}`, '');
  }
}

const outFile = path.join(DIR, 'map-audit.md');
fs.writeFileSync(outFile, md.join('\n'), 'utf8');
console.log(`\n报告：${path.relative(ROOT, outFile)}`);
