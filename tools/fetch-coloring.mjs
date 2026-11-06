// 抓 Commons 的 SVG 线稿（SVG 缩略图是 PNG，能直接用像素指标筛）→ public/coloring/ + manifest.json
// 用法：node tools/fetch-coloring.mjs [--per-topic=2] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.join('public', 'coloring');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const UA = { 'User-Agent': 'work-bad-coloring/1.0 (internal workbench; local use)' };

const TOPICS = [
    ['cat', '小猫'], ['kitten', '小猫'], ['dog', '小狗'], ['butterfly', '蝴蝶'],
    ['flower', '花'], ['fish', '小鱼'], ['house', '小房子'], ['car', '小汽车'],
    ['dinosaur', '恐龙'], ['rocket', '火箭'], ['elephant', '大象'], ['horse', '马'],
    ['bird', '小鸟'], ['tree', '树'], ['train', '火车'], ['boat', '船'],
    ['apple', '苹果'], ['mushroom', '蘑菇'], ['snowman', '雪人'], ['clown', '小丑'],
];
const BAD_TITLE = /(map|diagram|graph|chart|logo|flag|coat of arms|plan|scheme|atlas|seal|signature|formula|screenshot|icon set|photo|heraldry|barnstar|wikimania|wikipedi)/i;
const OK_LICENSE = /(public domain|pd|cc0|cc[ -]?by)/i;
const args = process.argv.slice(2);
const PER_TOPIC = Number((args.find(a => a.startsWith('--per-topic=')) || '--per-topic=2').split('=')[1]);
const DRY = args.includes('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
    let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
    const idat = [];
    let palette = null;
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
        else if (type === 'PLTE') palette = data;
        else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        off += 12 + len;
    }
    if (bitDepth !== 8 || interlace !== 0) throw new Error('depth/interlace');
    const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (!ch) throw new Error('colorType ' + colorType);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const out = Buffer.alloc(h * stride);
    let pos = 0;
    for (let y = 0; y < h; y++) {
        const ft = raw[pos++];
        const line = raw.subarray(pos, pos + stride); pos += stride;
        const cur = out.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const a = x >= ch ? cur[x - ch] : 0;
            const b = prev ? prev[x] : 0;
            const c = (prev && x >= ch) ? prev[x - ch] : 0;
            let v = line[x];
            if (ft === 1) v += a; else if (ft === 2) v += b;
            else if (ft === 3) v += (a + b) >> 1;
            else if (ft === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            cur[x] = v & 0xff;
        }
    }
    return { w, h, ch, colorType, data: out, palette };
}

function scorePng(buf) {
    const img = decodePng(buf);
    const { w, h, ch, data, colorType, palette } = img;
    let white = 0, dark = 0, mid = 0, colored = 0, total = 0;
    const seen = new Set();
    const step = Math.max(1, Math.floor(Math.sqrt(w * h / 40000)));
    for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
            const o = (y * w + x) * ch;
            let r, g, b, a = 255;
            if (colorType === 3) { const i = data[o]; r = palette[i * 3]; g = palette[i * 3 + 1]; b = palette[i * 3 + 2]; }
            else if (colorType === 0 || colorType === 4) { r = g = b = data[o]; if (colorType === 4) a = data[o + 1]; }
            else { r = data[o]; g = data[o + 1]; b = data[o + 2]; if (colorType === 6) a = data[o + 3]; }
            if (a < 32) continue;
            total++;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            if (lum > 235) white++; else if (lum < 90) dark++; else mid++;
            if (sat > 40) colored++;
            seen.add((r >> 4) + ',' + (g >> 4) + ',' + (b >> 4));
        }
    }
    const pct = n => total ? 100 * n / total : 0;
    const s = { white: pct(white), dark: pct(dark), mid: pct(mid), colored: pct(colored), colors: seen.size, w, h };
    s.ok = s.white >= 40 && s.dark >= 1.2 && s.dark <= 45 && s.colored <= 12 && s.colors <= 100
        && s.w >= 400 && s.h >= 400 && (s.w / s.h) < 2.4 && (s.h / s.w) < 2.4;
    return s;
}

async function search(topic) {
    const q = new URLSearchParams({
        format: 'json', action: 'query', generator: 'search',
        gsrsearch: topic + ' filetype:drawing line drawing', gsrnamespace: '6', gsrlimit: '12',
        prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '900',
    }).toString();
    const r = await fetch('https://commons.wikimedia.org/w/api.php?' + q, { headers: UA });
    const txt = await r.text();
    if (!txt.trim().startsWith('{')) throw new Error('限流：' + txt.slice(0, 30));
    const j = JSON.parse(txt);
    const pages = (j.query && j.query.pages) || {};
    return Object.keys(pages).map(k => pages[k]).filter(p => p.imageinfo && p.imageinfo[0]);
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const kept = [];
fetch: for (const [topic, cnName] of TOPICS) {
    let list = [];
    try { list = await search(topic); } catch (e) { console.log('! ' + topic + ' ' + e.message); await sleep(1500); continue; }
    let got = 0;
    for (const p of list) {
        if (got >= PER_TOPIC) break;
        const ii = p.imageinfo[0];
        const meta = ii.extmetadata || {};
        const info = {
            title: String(p.title).replace(/^File:/, ''),
            thumb: ii.thumburl || ii.url,
            license: ((meta.LicenseShortName && meta.LicenseShortName.value) || ''),
            author: (((meta.Artist && meta.Artist.value) || '').replace(/<[^>]+>/g, '')).trim(),
            page: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title),
        };
        if (!/\.svg$/i.test(info.title)) continue;          // 只收 SVG（缩略图是 PNG，能筛）
        if (BAD_TITLE.test(info.title) || !OK_LICENSE.test(info.license)) continue;
        if (!/\.png$/i.test(info.thumb)) continue;
        try {
            const r = await fetch(info.thumb, { headers: UA });
            if (!r.ok) { await sleep(150); continue; }
            const buf = Buffer.from(await r.arrayBuffer());
            const s = scorePng(buf);
            await sleep(150);
            if (!s.ok) continue;
            const slug = 'cb-' + p.pageid;
            fs.writeFileSync(path.join(OUT_DIR, slug + '.png'), buf);
            kept.push({
                slug, file: 'coloring/' + slug + '.png', name: cnName + ' · ' + info.title.replace(/\.svg$/i, '').slice(0, 26),
                title: info.title, license: info.license, author: info.author, page: info.page,
                w: s.w, h: s.h,
            });
            got++;
            console.log('✓ ' + slug + '  白' + s.white.toFixed(0) + '% 深' + s.dark.toFixed(0) + '% 彩' + s.colored.toFixed(0) + '%  ' + info.title.slice(0, 58));
        } catch (e) {
            await sleep(150);
        }
    }
    if (kept.length >= 24) break fetch;
    console.log(topic + ' → ' + got + ' 张（累计 ' + kept.length + '）');
}
console.log('留下 ' + kept.length + ' 张');
if (DRY) process.exit(0);
fs.writeFileSync(MANIFEST, JSON.stringify({
    source: 'Wikimedia Commons（公有领域 / CC0 / CC BY）',
    note: '只收「白底 + 黑线」的 SVG 线稿；license / author / page 都留着，便于溯源',
    fetchedAt: new Date().toISOString().slice(0, 10),
    items: kept,
}, null, 2) + '\n');
console.log('写好了 ' + MANIFEST);
