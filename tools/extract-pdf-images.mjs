// 从 PDF 里直接抽出 DCTDecode（JPEG）图片：涂色书每页基本就是一张扫描图
// 用法：node tools/extract-pdf-images.mjs <a.pdf> [<b.pdf> ...] --out=tools/out/pdfpages
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='));
const OUT = outArg ? outArg.split('=')[1] : path.join('tools', 'out', 'pdfpages');
const files = args.filter(a => !a.startsWith('--out='));
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function objNum(s, at) {
    // 从某个位置往前找最近的 "N 0 obj"
    const before = s.slice(Math.max(0, at - 4000), at);
    const m = [...before.matchAll(/(\d+)\s+0\s+obj\b/g)];
    return m.length ? Number(m[m.length - 1][1]) : 0;
}

let total = 0;
for (const f of files) {
    const buf = fs.readFileSync(f);
    const s = buf.toString('latin1');
    const base = path.basename(f, path.extname(f)).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const dir = path.join(OUT, base);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let n = 0;
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(s))) {
        const dictStart = Math.max(0, s.lastIndexOf('<<', m.index));
        const dict = s.slice(dictStart, m.index);
        if (!/\/Subtype\s*\/Image/.test(dict)) continue;
        if (!/DCTDecode/.test(dict)) continue;
        const start = m.index + m[0].length;
        const endIdx = s.indexOf('endstream', start);
        if (endIdx < 0) continue;
        let bytes = buf.subarray(start, endIdx);
        // 去掉尾部换行，并按 JPEG 结束符截断
        while (bytes.length && (bytes[bytes.length - 1] === 0x0a || bytes[bytes.length - 1] === 0x0d)) bytes = bytes.subarray(0, bytes.length - 1);
        if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) continue;
        const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
        if (eoi > 0) bytes = bytes.subarray(0, eoi + 2);
        n++;
        const name = 'p' + String(n).padStart(3, '0') + '.jpg';
        fs.writeFileSync(path.join(dir, name), bytes);
    }
    console.log(base + ' → ' + n + ' 张 JPEG（' + (buf.length / 1048576).toFixed(1) + 'MB）');
    total += n;
}
console.log('共抽出 ' + total + ' 张 → ' + OUT);
