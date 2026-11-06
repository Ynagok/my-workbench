# public/coloring —— 涂色页的内置图库

页面「🎨 涂色」子页里的 **📚 内置图库** 就是读这里的 `manifest.json`。

## 加图（最常用）

1. 把图片丢进这个目录（`png` / `jpg` / `svg` / `webp` 都行），**文件名就是显示名**（`小狐狸.png` → 显示「小狐狸」）。
2. 跑一下：

   ```powershell
   npm run coloring:manifest
   ```

3. 刷新页面，涂色子页最下面会出现「📚 内置图库 · N 张」，点一张就铺到位图画布上，**点哪儿填哪儿**（黑线自动当边界）。

> 图是同源文件（`coloring/xxx.png`），canvas 不会被 taint，所以能正常取像素、能下载。

## 记录出处（建议）

同目录放一个 `coloring-sources.json`，按文件名写清来源，跑 `npm run coloring:manifest` 时会自动并进 manifest：

```json
{
  "小狐狸.png": { "license": "CC0", "author": "xxx", "page": "https://..." }
}
```

## 能放什么图

- 自己画的、公司内部素材。
- **公有领域 / CC0 / CC BY** 的线稿（Wikimedia Commons、openclipart、NIH BioArt 之类）。
- ⚠️ **不要**放只授权「自己打印」的素材（HP Printables、Anycolor、Dover 样张、各种 free coloring pages 站）——那些不能内置进仓库再分发。

## 自动抓取（可选）

```powershell
npm run coloring:fetch -- --per-topic=2
```

从 Wikimedia Commons 抓「公有领域 / CC0 / CC BY」的 **SVG 线稿**，用像素指标筛掉地图 / logo / 剪影 / 彩色图，只留下「白底 + 黑线」的。

⚠️ 实测可用率很低：Commons 里搜 `filetype:drawing` 出来的大多是地图、徽章、示意图；一首一尾两个主题之间还会被限流。所以**别指望它自动凑满一屏**，通常是「先批量放图 → 跑 manifest」更实在。
