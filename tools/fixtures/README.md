# tools/fixtures

`npm run build:data` 的输入目录。

| 文件 | 入库 | 说明 |
|---|---|---|
| `player-page.html` | ❌ **已 gitignore** | 真实 GM 玩家页快照。**含真实玩家信息（playerId / openId / 昵称 / 背包等），严禁提交或外发。** |
| `player-page.sample.html` | ✅ | 合成样例：结构与真实页一致，玩家 ID 全为假值。用于离线自测提取器。 |

## 怎么拿真实快照

1. 在浏览器里打开 GM 玩家查询页（`.../index.php/query/player/<玩家ID>`）。
2. `Ctrl+S` → 保存类型选 **「网页，全部」** 或 **「网页，仅 HTML」**，覆盖到本目录并命名为 `player-page.html`。
   - 必须保存**保存后的源码**（包含 `var allPresentGoods = {...}` 与各 `<select>` 的 option 列表）。
   - 只复制渲染后的可见文本没用：卡包 / 物品名 / 星级码全在那段 JSON 里。
3. 跑 `npm run build:data`。

## 自测（不碰真实数据）

```powershell
node tools/build-game-data.mjs tools/fixtures/player-page.sample.html
```
