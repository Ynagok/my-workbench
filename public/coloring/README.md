# public/coloring —— 涂色页的内置图库

页面「🎨 涂色」子页里的 **📚 内置图库** 就读这里的 `manifest.json`。

## 现在里面有什么

**三本涂色书各抽 12 页，共 36 张**（900px 灰度线稿 PNG）：

| 前缀 | 书（`coloring-sources.json` 里记了页码） | 作者 |
|---|---|---|
| `dream-*` | 《梦境花园 · 一本让心灵回归宁静的手绘涂色书》 | 蜜桃老师 |
| `fashion-*` | 《时尚的诞生 · 一本收集时尚灵感的服饰名品穿搭涂色书》 | (韩) 姜旻枝 |
| `child-*` | 《童色年华 · 幻想卷 · 一本充满童年回忆的涂色书》 | 名绘堂 |

⚠️ **版权**：这些是买来的电子书内页，**只在这台机器 / 内部涂着玩，别外发、别放到公开仓库或线上演示**。出处（书名 + 页码 + 「书内页（内部使用，勿外发）」）都记在 `coloring-sources.json`。

## 加图 / 换图

1. 把图片丢进这个目录（`png` / `jpg` / `svg` / `webp` 都行），**文件名就是显示名**。
2. 跑一下：

   ```powershell
   npm run coloring:manifest
   ```

3. 刷新页面 → 「📚 内置图库 · N 张」里就有，点一张铺到位图画布，**点哪儿填哪儿**（黑线当边界）。

> 图是同源文件（`coloring/xxx.png`），canvas 不会被 taint，所以能取像素、能下载。

出处写在 `coloring-sources.json`（`{ "文件名.png": { name, title, license, author, page } }`），跑脚本时会并进 manifest。

## 自己加别的图，能不能用？

- **能**：任何「白底 + 黑线」的线稿 / 涂色页（自己画的、买的书、公有领域的）。
- **别放**只授权「自己打印」的素材（HP Printables、Anycolor、Dover 样张…）——那些不能内置进仓库再分发；想涂就用页面上的「📥 导入图片」，图留本机。

## 这些书页是怎么抽出来的

```powershell
# 1) 从 PDF 里把每页的 JPEG 抽出来（这几本 PDF 每页就是一张 DCTDecode 图，不需要 poppler / ghostscript）
node tools/extract-pdf-images.mjs "书.pdf" --out=tools/out/pdfpages

# 2) 挑页 + 缩图（临时脚本，会用到 sharp：npm i sharp --no-save）
#    指标：墨迹 3–50%、彩色 ≤10%、4×4 格子墨迹离散度 ≤1.05（甩掉文字页）、跳过前 6 页
node tools/out/build-coloring-from-pdf.mjs --per-book=12

# 3) 生成清单
npm run coloring:manifest
```
