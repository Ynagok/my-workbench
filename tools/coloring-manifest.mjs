// 把 public/coloring/ 里的图片扫成 manifest.json（不联网）
// 用法：node tools/coloring-manifest.mjs
// 图片直接丢进 public/coloring/（png / jpg / svg 都行），跑一下这个脚本，页面「📚 内置图库」就会列出来。
// 文件名就是显示名（去掉扩展名，-_ 换空格）；如果同目录有 coloring-sources.json，会按文件名把 license/author/page 补进去。
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join('public', 'coloring');
const MANIFEST = path.join(DIR, 'manifest.json');
const SOURCES = path.join(DIR, 'coloring-sources.json');
const EXT = /\.(png|jpe?g|svg|webp)$/i;

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

let sources = {};
if (fs.existsSync(SOURCES)) {
    try { sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8')) || {}; } catch (e) { console.log('! coloring-sources.json 读不了，忽略：' + e.message); }
}

let old = { items: [] };
if (fs.existsSync(MANIFEST)) {
    try { old = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) || old; } catch (e) { /* 坏文件就重建 */ }
}
const oldBySlug = {};
(old.items || []).forEach(it => { if (it && it.slug) oldBySlug[it.slug] = it; });

const files = fs.readdirSync(DIR).filter(f => EXT.test(f)).sort();
const items = files.map(f => {
    const base = f.replace(EXT, '');
    const prev = oldBySlug[base] || {};
    const src = sources[f] || sources[base] || {};
    return {
        slug: base,
        file: 'coloring/' + f,
        name: src.name || prev.name || base.replace(/[-_]+/g, ' '),
        title: src.title || prev.title || f,
        license: src.license || prev.license || '',
        author: src.author || prev.author || '',
        page: src.page || prev.page || '',
    };
});

fs.writeFileSync(MANIFEST, JSON.stringify({
    note: '这个文件由 tools/coloring-manifest.mjs 生成：把图片丢进 public/coloring/ 再跑一遍就行；license / author / page 从 coloring-sources.json 或旧 manifest 继承',
    updatedAt: new Date().toISOString().slice(0, 10),
    items,
}, null, 2) + '\n');
console.log('public/coloring 里 ' + files.length + ' 张图 → 写进 ' + MANIFEST);
items.forEach(it => console.log('  · ' + it.slug + '  →  ' + it.name + (it.license ? '  [' + it.license + ']' : '')));
