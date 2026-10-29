# work-bad · 客服冷静演绎工作台

单文件前端（`public/index.html`）+ 极简同步后端（`server.js` / express）。
数据走 `/api/data/<key>`（GET 读、POST 写，key 有白名单校验），落盘到 `data.json`；前端 **localStorage 优先、服务端兜底**。
⚠️ **例外：「客服生涯」的 `careerData` 和「海外业务统计」的 `overseasBizData` 都只存本机浏览器，完全不碰服务端**（不同人、不同设备的数据不互相串），见下「客服生涯」「海外业务统计」两节。
⚠️ **反过来「下午茶投票」必须走服务端**（`teaShops` / `teaPoll_YYYYMMDD` + `/api/vote/:key`）—— 它要的就是「不同设备投的票统计在一起」，见下「下午茶投票」一节。

> 给 AI 助手：接手本仓库前先读这个文件，末尾「已定语义 / 待确认」**不要擅自改**。

## 协作工作流（用户与 AI 的约定）

用户说「改一下 xxx」→ **直接改，不要先问确认、不要先出方案**。改完按硬约定 3 跑 `npm run verify` 并 `git add` + `git commit`，然后**简短**汇报（改了什么 / 验证结果），不要长篇铺陈。

**推送由用户自己执行**（`git push`），AI 不要代推。注意本机直连 `github.com:443` 被阻断，用户推送需要 Clash 代理（见下方「已知环境问题」）。

📌 **每次汇报都必须在结尾贴出下面这段、提醒用户复制执行**（用户明确要求，别省）：

```powershell
cd G:\work-bad
git push
```

仍然**必须先问**的只有两种情况：

1. 缺了只有用户才有的信息（例如「你的日志长什么样」这类 AI 无法自行判定的输入）。
2. 要改动下面「已定语义 / 待确认」里的条目——那些会改变已有话术输出，必须先确认预期。

## 已知环境问题

- 本机直连 `github.com:443` 不通（DNS 能解析但 TCP 超时），本机 Clash 监听 `127.0.0.1:2080`，但 **Windows 系统代理开关是关的**（`ProxyEnable=0`）。推送要么让用户开 Clash 的「系统代理」，要么命令行带参数：
  `git -c http.proxy=http://127.0.0.1:2080 -c https.proxy=http://127.0.0.1:2080 push origin main`
- AI 若在沙箱内执行推送，会先因 `schannel SEC_E_NO_CREDENTIALS` / `couldn't create signal pipe` 失败，需放宽沙箱；且**按约定不代推**。
- **用户在 VS 里保存 `public/index.html` 会重排缩进**：实测工作区版本比 HEAD **整体多缩进 8 个空格**（约 6500 行、+52KB），且行尾被写成 CRLF（`.gitattributes` 要求 `eol=lf`）。这正是硬约定 2 的坑。**改这个文件前先 `git diff --numstat` 确认是纯新增**，若发现大范围 delete/add，先 `git checkout -- public/index.html` 回到干净版再改。

## 运行

```powershell
npm start          # http://localhost:3000（静态托管 public/ + /api/data 接口）
npm run verify     # 改完代码、push 前的完整自检
```

线上部署：**https://work-bad.onrender.com/**（Render，push 后自动部署；托管同一份 `public/`）。日报模板、映射表、短语、**下午茶投票**走 `/api/data` ↔ `data.json`，注意 Render 的磁盘是**临时的**，重启/重新部署会丢 `data.json`；**「客服生涯」和「海外业务统计」不走服务端**（只在本机 localStorage，见下两节），所以换设备/换浏览器看不到别人的统计，也丢不了别人的（要搬数据就用页面上的 JSON / CSV 导出导入）；**下午茶投票反过来走服务端**（跨设备统计，见「下午茶投票」一节）。
（油猴脚本「反馈提取助手」已按用户要求删除，安装链接不再提供。）

⚠️ 不要用双击 `public/index.html` 的方式打开：`file://` 下 `/api/data` 请求会失败，数据只留在本机浏览器，换设备不共享。

## 自检工具链（tools/）

| 命令 | 内容 |
|---|---|
| `npm run verify` | 静态结构校验 + `node --check` 语法 + jsdom 集成冒烟 610 项 + 「接口挂起时界面仍可用」+ 服务端冒烟 42 项 |
| `npm run verify:static` | 只要静态校验 + 语法检查（最快） |
| `npm run report` | 打印一份真实生成的日报，肉眼确认排版（含 ⑥伙伴弹途 / ⑦异世界勇者） |
| `npm run build:data` | 从 GM 玩家页快照提取 4 张权威映射表 + 与硬编码常量的**差异报告**（见下「游戏数据管线」） |
| `npm run extract:maps` | 把玩家页快照抽成 `tools/out/page-*.json` **精简映射表**（只有 id→名称，不带玩家信息），见下「游戏数据管线」 |
| `npm run audit:maps` | 用 `tools/out/page-*.json` 对账 4 张硬编码常量表，出 `tools/out/map-audit.md`（缺 / 多 / 名称不一致） |
| `npm run smoke:server` | 单独跑服务端冒烟（真起进程 + 真发 HTTP，42 项，含 SOP 口令 7 项） |
| `npm run smoke:pmc` | **生管物料订单工作台**（`public/pmc.html`）自检，123 项（含加工周期工作日推算 + 在途锁定/调整建议 + 真实 8.5MB xlsx 端到端导入）；**不在 verify 里**，见下「生管物料订单工作台」一节 |
| `npm test` | = `npm run verify` |

`npm run verify` 失败就不要提交。它一共 5 段：静态结构 → 语法 → jsdom 集成冒烟 **610 项** → 接口挂起时界面仍可用 → 服务端冒烟 **42 项**。

- jsdom 未安装时前端冒烟会自动回落到本机 DSH 自带的那份。
- `tools/smoke-server.cjs` 用 `PORT` + `DATA_FILE` 环境变量把服务端指到随机端口和 `tools/out/` 里的临时文件，**不会碰真实 `data.json`**；子进程 stdio 必须用 `ignore`/`inherit`（沙箱禁管道，`pipe` 会 EPERM）。
- 沙箱内跑 npm 需要把缓存指到工作区内：`npm_config_cache=<仓库>/tools/out/npm-cache`（默认的 `C:\Users\...\npm-cache` 会被拒），验证完记得删掉那个目录。

## 游戏数据管线（`npm run build:data`）

把 GM 玩家页快照里的权威数据提取出来，跟 `public/index.html` 里的硬编码常量做差异比对。

- **输入**：`tools/fixtures/player-page.html` —— ⚠️ **已 gitignore，含真实玩家信息（playerId/openId/昵称/背包），禁止入库或外发**；获取方式见 `tools/fixtures/README.md`。
- **自测输入**：`tools/fixtures/player-page.sample.html`（合成、无隐私、已入库）：
  `node tools/build-game-data.mjs tools/fixtures/player-page.sample.html`
- **产出**（写到 `tools/out/`，已 gitignore）：`game-data.json`（4 张表）+ `diff-report.md`（缺 / 多 / 名称不一致，另附卡包 royal 星级码表）。
- **4 张表**：① 来源映射（`opFrom`/`from` → `DEFAULT_SOURCE_ID_MAP`）② 活动类型映射（→ `DEFAULT_ACTIVITY_TYPE_MAP`）③ 卡包表（→ `PACK_NAME_MAP`，含 `star`/`royal` 星级码）④ 物品名表（→ `DEFAULT_ITEM_NAME_MAP`，含分类）。
- **尚未做**：C 装载方式（payload ≤150KB 时首选 C3 复用 `/api/data`）→ D 逐个消费点接入（**改话术的点先问用户**）→ E `verify.mjs` 断言 + `smoke.cjs` 第 10 节端到端 → F 拆 4 个提交。
- **2026-10 手工核对（用户贴了一整页 GM 玩家查询页 HTML）**：**来源映射**（`opFrom`/`from` 1–257，页面本就缺 52）与 `DEFAULT_SOURCE_ID_MAP` **256 条逐条一致**；**活动类型映射**页面 39 个板块（2 PASS卡 … 81 体力排行榜）与 `DEFAULT_ACTIVITY_TYPE_MAP` **39 条一致**；**卡包表** `PACK_NAME_MAP` 的 152/154/156/158/160/161 已按页面官方词序改成「百戏大锦囊 / 百戏超大锦囊」（原来写成「大百戏」），并补了 170–172「卡牌必得卡包展示」；**物品名表**补 419 / 783 / 804 / 997 / 4105004 / 4105005 六条、修正 769（松鼠精地块积分）/ 782（装饰松鼠精）/ 784（装饰配套喜羊羊）/ 799·800（瑶池觅宝「奖励分数 / 竞速积分」原来对调了）。**霞光 / 幻狐 的手写风格保持不动**（见「已定语义 3」）。
  - ✅ **物品名表现在已经做过「整页 vs 整表」的全量对账**（见下「第二轮」）：1697 条页面物品 + 15 条分类占位，缺/多/名称不一致都为 0。
  - ✅ 两处存疑已按页面定案（2026-10 第二轮复核）：`774` 页面原文就是「珍蚌」（`\u73cd\u868c`，不是珍虾），`997` 页面就是「茶楼经营**簿**茶壶」—— 表里现在这两条都对，别再改。
- **2026-10 第三轮核对（用户又给了一整页新快照，问「检查是否有新加的道具或者活动或者来源」）—— 全量对账后补齐 21 条**：
  - **来源映射 +4**：`264` 活动pass卡领取 / `265` 活动pass卡购买 / `266` 1+4礼包购买 / `267` 1+4礼包免费领取（页面 260 / 硬编码 260，缺 0、多 0、名称不一致 0）。
  - **活动类型 +1**：`84` 新拼图活动（页面 40 / 硬编码 40）。⚠️ 活动进度删掉后这张表已经没有界面消费点，但 `映射管理 → 恢复默认` 和 `audit:maps` 还留着，所以照样补齐。
  - **物品名 +16**：`840027`–`840042` 勋章…补发道具整族（页面 1713 / 硬编码 1728 = 1713 + 15 条 `--分类` 占位）。
  - **卡包名：无变化**（页面 21 / 硬编码 21）。
  - ⚠️ 要让新增名字在**已有设备**上生效，仍需「映射管理 → 恢复默认」或重新导入（见下一条 `itemNameMap` 覆盖问题）。
- **2026-10 第二轮核对（用户先贴了正文、后又给了整页 `Summer.html` 附件）—— 这次做到了「整页 vs 整表」全量对账**：
  - **来源映射 `DEFAULT_SOURCE_ID_MAP`：256 / 256，缺 0、多 0、名称不一致 0**（页面本就缺 52）。
  - **活动类型 `DEFAULT_ACTIVITY_TYPE_MAP`：39 / 39，缺 0、多 0、名称不一致 0**。
  - **卡包名 `PACK_NAME_MAP`：151–179 全在，缺 0、多 0**；`173`–`179` 那 7 条「名称不一致」是**已定语义 3 的已知例外**（页面官方「3星霞光锦囊 / 2星幻狐锦囊」，这里保留「霞光3星锦囊 / 幻狐2星锦囊」手写风格）—— `tools/audit-maps.mjs` 的 `KNOWN_EXCEPTIONS` 把它们当例外，以后对账不会再算成待修。
  - **物品名 `DEFAULT_ITEM_NAME_MAP`：页面 1697 条 → 表里 1697 + 15 条 `--分类` 占位 = 1712，缺 0、多 0、名称不一致 0**。这一轮做了三件事：
    1. **补 34 条**：`600601`–`600622`（红枫山 … 橡果花丛，整族之前漏了）、`6001004`（枫染·揽月床）、`6004041`–`6004043`（萌狐/懒猫/软兔双人座椅）、`6005138`–`6005140`（青松云海屏风 / 紫璃落地灯 / 花烛落地灯）、`32206`（甘棠的回礼）、`50801`（棋子挑选箱）、`60202`·`60203`（八卦镜）、`60607`（桃花酿）。
    2. **修 2 条错位**：`6004005` / `6004011` 原来把「瑞兽衔环座椅 / 瑞兽衔环软垫椅」对调了，按页面改回（6004005=瑞兽衔环**软垫**椅、6004011=瑞兽衔环座椅）。
    3. **清掉 192 条「不是物品的 id」**：历史上有一次把 **活动 id / 来源 id / 棋盘 id / 集卡排期 id** 误并进了物品名表（例如 `12`=基础棋盘、`41`=探险棋盘、`132`=棋盘操作-冰冻棋子出现、`90002`–`90013`=集卡排期字符串）。它们各自在 `DEFAULT_ACTIVITY_TYPE_MAP` / `DEFAULT_SOURCE_ID_MAP` 里都还在，**没丢信息**。⚠️ 清完以后 `verify` 里「253–257 在两张表里各一份」那条断言改成了「**只在来源映射里各一份（5 处）**」。
    - **`--分类` 占位条目保留**（`100=--货币` / `150=--卡包` / `200=--头像` / `600=--自宅家具道具` / `9000=--好感度道具` / `500000=--家具` …共 15 条）：它们不是物品但能说明「这个 id 属于哪一类」，`audit-maps` 把它们单独算成「分类占位」，不计入「多」。
  - ✅ **上一轮（凭粘贴正文）补的 96 条全部核验通过**：都在页面里、没有错位；上轮只能抽核的 `774` 珍蚌、`997` 茶楼经营簿茶壶也再次确认。
  - ⚠️⚠️ **本轮的修正要「生效」需注意运行时来源**：`itemNameMap` 启动时是 `asObject(b.itemNameMap) || cloneDefault(DEFAULT_ITEM_NAME_MAP)`（`public/index.html` 里 `itemNameMap = ...` 那一行）——**服务端 `data.json` 里若已存过旧的一份 `itemNameMap`，它会盖住这份默认表**。要让修正真正生效：页面「映射管理 → 恢复默认」或重新导入一次，否则只对新设备 / 清过本机的情况生效（下次跑数据时留意一下）。
  - ⚠️ **聊天里直接粘贴的整页 HTML 仍然没法当文件用**（子会话看不到父会话的粘贴，`tools/out/` 里也不会有）。整页对账的正确姿势：**把附件/网页存成 `tools/fixtures/player-page.html`（或直接传附件，工具支持传路径）→ `npm run extract:maps -- <path>` → `npm run audit:maps`**，看 `tools/out/map-audit.md` 的「缺 / 多 / 名称不一致(不含已知例外) / 分类占位」四列。

## 反馈提取助手（油猴脚本）—— **已删除**（2026-10，用户要求「油猴助手要删了」）

`public/gemjy-openid-helper.user.js` 与 `tools/test-openid-helper.cjs` **已从仓库删除**，`package.json` 里的 `test:helper` 脚本和 `verify` 链里的那两段也一起去掉了（verify 现在 5 段）。
线上那条安装链接 `https://work-bad.onrender.com/gemjy-openid-helper.user.js` **部署后会 404**；已经装过 0.3.0 / 0.4.0 的人，脚本还在他们浏览器里，只是再也收不到更新。
要恢复就 `git show a6d2833:public/gemjy-openid-helper.user.js`（测试文件同理）。

## 界面主题（柔和白 · 明日方舟 / 终末地 视觉语言）

**整个工作台是浅色「柔和白」的**（用户要求：背景不刺眼，所以底不用纯白，用带一点冷灰的白）。只靠 `:root` 令牌驱动，改观感先改令牌、再动两层「收口层」。

- **令牌**（`public/index.html` 顶部 `<style>` 里的 `:root`）：`--bg-0 #eef1f4`（页面底，冷灰白）/ `--bg-1 #f7f9fb` / `--surface #fbfcfd`（卡片）/ `--surface-2 #f1f4f7` / `--surface-3 #e6eaee`（次级面、斑马、分组标题）/ `--sidebar #f4f6f9`；文字 `--ink-0 #1b2228`（主）/ `--ink-1 #2c353d` / `--ink-2 #5b6672`（次要）/ `--ink-3 #8b959f`（三级、placeholder）；线 `--line-0 #e3e8ed` / `--line-1 #d3dae1` / `--line-2 #b7c0c9`。
  - **强调色仍是「方舟黄」，但浅底上压深了一档：`--accent #c89500`**（当文字/描边看得清，当填充配黑字也够）；配套 `--accent-hi #a97c00` / `--accent-ink #8a6200`（浅底上的强调文字）/ `--accent-dim`(12%) / `--accent-line`(42%) / `--accent-glow`(20%)。`--dark #0a0c0e` 仍是**黄底/亮底上的文字色**，也是「小游戏那几个故意做黑的按钮」的底色 —— **别改它**。
  - `--warn #bd7300` / `--danger #cf3b30`（浅底上压深一档）；阴影改成柔和黑低透明（`--shadow-1/2/3`）。
  - 圆角令牌：**2026-10 用户要求「整体圆润一点」后改成大圆角** —— `--r-sm 6px` / `--r-md 10px` / `--r-lg 14px` / `--r-pill 999px`；切角令牌 `--clip-card` / `--clip-btn` **都改成 `none`**，圆角靠 `border-radius`（别再改回 polygon：那会把圆角切掉）。
  - `--ak-primary` / `--primary` / `--bg` / `--border` / `--text` / `--shadow` 这些旧别名**已改成引用上面那套令牌**，别再写死颜色。
  - 新增：`--grid-line`（页面网格线，浅底上是 `rgba(28,40,52,0.035)`）/ `--hazard`（45° 警示条纹）/ `--clip-card` / `--clip-btn`（**现在都是 `none`**，圆角由 `border-radius` 负责）。
- **两层收口层**（都在 `<style>` 末尾，**后置覆盖前面的规则**，同特异性后者胜）：
  1. **「暗色主题收口层 · 明日方舟 / 终末地 视觉语言」**（含「客服生涯 · 报表版式」）—— 形状/版式层：切角、编号、表头、按钮形状、报表抬头等。⚠️ **它是上一版暗色主题留下的，名字也没改；里面的 `rgba(255,255,255,…)`、`rgba(4,6,8,…)` 这类颜色全是暗色专用值，靠下面第 2 层覆盖**。改版式（不是颜色）就动这一层。
  2. **「浅色收口层 · 柔和白」**（最后一段）—— 颜色收口：把上面那层的暗色硬编码改回浅色（`.tab-btn:hover` 的淡黑、`button` 的浅底、表单白底、`.card::after` 斜纹、`tbody` 斑马、`.modal` 遮罩、`.career-kpi.accent` / `.career-trend` 的底纹），外加 `.fb-chip`（反馈模板的选择片）。**再加浅色样式就写这一段**，并且**不要用 `rgba(255,255,255,…)`**（verify 有断言锁死这一段里不出现白底白线）。
  3. **「圆润层（2026-10 用户：整体圆润一点 / 上下间距别太大 / 开关参考 iOS）」**（`<style>` 最后一段，**后置覆盖前两层**）—— 几何收口：把 `.container` / `.card` / `.inline-card` / `.modal-content` / `.theme-panel` / `.daily-group` / `.fb-card` / `.career-report-head` / `.seg-bar` / `.debug-console` 里写死的 `border-radius: 0` 盖成 `var(--r-md)`，`button` / `.stat-chip` / `.career-scope-bar > button` / `.daily-tab` 拍成 `--r-pill`，`.fb-chip` / `.seg-btn` / `.tab-btn` / `input` / `select` / `textarea` 用 `--r-sm`；`.card::after` 给 `border-radius: inherit`（斜纹不溢出圆角）。**间距**：`body { padding: 10px 14px 8px }`、`.tab-content { padding: 16px 22px 10px; max-height: 94vh }`（**底部收到 10px**：2026-10 用户又指了一次卡片下面那片空档「这里的间距再小点」）、`.card { margin-top: 12px }`、`.career-report-head { padding-bottom: 10px; margin-bottom: 10px }`、`.seg-bar { margin: 0 0 10px }`、`.crh-title 20px`、`.flex-row gap 8px`、`.daily-group { margin-bottom: 10px; padding: 10px 12px }`。⚠️ 改这三处（圆角 / 间距 / 开关）都写在这一层，别回头去改第 1、2 层的写死值。
  - ~~直角/切角~~（2026-10 起圆润层把切角关掉了，`--clip-card/btn` 都是 `none`，只保留 `.container` 的警示条纹顶条与圆角）：`.card` / `.modal-content` / `button` 现在是 `border-radius`，不再用 `--clip-card` / `--clip-btn` 切角。
  - 侧边栏：编号 `01…`（`.tab-btn::before` + `counter(nav-item, decimal-leading-zero)`）；hover 淡黑、active 黄字+左侧黄条+菱形点（旋转 45°）。
  - 按钮：默认浅底面板+细边+深字；hover 变**黄底黑字**。`.secondary` 更弱、`.reset-btn` 红字、`.paste-btn` 黄淡底。⚠️ **`.career-collapse-btn` 单独豁免**（`:hover` 也是透明底），否则折叠卡标题一 hover 就变黄块。
  - 表单：输入框白底细边、focus 才出现黄边+黄淡光圈；`color-scheme: light` 让原生日期/下拉/滚动条也是浅色。
  - 表格：`th` 浅灰表头带+字距，`tbody tr:nth-child(even) td` 极淡斑马，`.career-table` 另加分组标题行（`--surface-3` 底+黄字）与合计行（黄淡底+顶部黄线+等宽字）。
  - ⚠️ **黄底上的文字要用 `#0a0c0e` / `var(--dark)`**，别用 `--ink-0`—— `.career-split-bar > i.ticket`、`.career-scope-bar > button.active` 这两处是深色字，保持就行。
  - ⚠️ `clip-path` 会**吃掉 box-shadow**，所以按钮的 hover 光圈基本看不到（只有换色）；想要光圈就别用 clip-path。
  - ⚠️ 有几处**故意做黑**的元素（`.debug-console`、`#tab-script` 的拼豆/油炸按钮、`.badge` 的基础色）—— 它们在浅底上是「反色小块」，是有意的，别顺手改白。
- **界面设置（侧边栏抬头齿轮）**：抬头是 `.tabs-head`（`.tabs-brand` 站名 + `#themeGear` 齿轮），点齿轮开 `#themePanel`。三组可调：
  - **背景色** 8 个色块（`THEME_BG_PRESETS`：默认柔和白 / 纯白 / 暖米 / 豆沙绿 / 浅蓝 / 淡粉 / 深灰 / 炭黑）+ 取色器。
  - **强调色** 8 个色块（`THEME_ACCENT_PRESETS`：方舟黄 / 橙红 / 品红 / 紫 / 蓝 / 青 / 绿 / 灰）+ 取色器。任意颜色先按**区间**钳制（`themeClampLum(base, 浅底 0.14~0.32 / 深底 0.50~0.72)`：**区间内原样保留**，所以 8 个预设色都不会被洗白；越界才用 `themeToLum` 二分混到边界），再派生 `--accent` / `--accent-hi` / `--accent-ink` / `--accent-dim` / `--accent-line` / `--accent-glow`，所以「当文字」和「当填充配黑字」都看得清。
    - ⚠️⚠️ **`themeMix(c, target, ratio)` 的 `target` 是 `{r,g,b}` 对象，必须逐通道混**（`c.r + (target.r - c.r) * ratio`）。曾经写成 `c.r + (target - c.r) * ratio`（把对象当数字）→ 全部算出 `#aNaNaN` / `rgba(NaN,NaN,NaN,…)` → **非法颜色值让整条 CSS 声明失效**，表现就是「选了强调色但界面没变、强调色像被取消了」（背景派生的卡片面/分割线也一起坏，卡片变透明）。`verify.mjs` 有断言锁死这个写法，`smoke.cjs` 还会用 `isColor()` 逐条校验派生令牌，别再写回去。
  - **渐变 / 底纹** 6 种（`THEME_EFFECTS`：默认网格+光晕 / 纯色 / 光晕 / 网格 / 斜向渐变 / 边缘压暗）→ 挂在 `<html data-bg-effect="…">`，具体背景图写在 CSS 的 `html[data-bg-effect="…"] body` 里（默认那个不挂属性，就用 body 的基础背景）。
  - 面板：点齿轮开合、`#themePanelClose` / 点面板外面 / Esc 收起（`themeTogglePanel`），齿轮带 `.open` 与 `aria-expanded`。
  - **令牌计算**：`themeApplyBg` 按背景色算出整套令牌写在 `<html>` 行内（`THEME_TOKEN_KEYS`，行内优先级最高，覆盖 `:root`），卡片面/次级面/分割线都是「背景色往白或往黑混一点」；`themeLum < 0.32` 判为深色 → 换浅色文字（`THEME_DARK_INK`）并挂 `data-theme="dark"`；`themeApplyAccent` 再覆盖强调色那 6 个令牌（**背景与强调色都是默认时会把 accent 令牌也清掉，交回 `:root`**）。
  - ⚠️ **`data-theme="dark"` 的那段 CSS「暗色收口」必须留着**：浅色收口层里有十几处写死的浅色（按钮浅底、白底输入框、淡黑 hover/斑马、白遮罩、`.theme-effect` 白底…），深色底时全靠这一段按更高特异性盖回去。加浅色样式时别往这一段里写，也别删。
  - ⚠️ 抬头从原来的 `.tabs::before`（伪元素写的 'work-bad'）换成了真元素 `.tabs-head`，`.tabs::after` 那道黄条没动；`restoreTabOrder()` 里 `appendChild` 会把 tab 按钮挪到末尾，所以**那之后要把 `#themePanel` 再 append 一次**，Sortable 的 `onMove` 也要挡 `.tabs-head` / `.theme-panel`（都有断言锁）。
  - 只存本机 `localStorage['themeSettings']`（`{bg, accent, effect}`，全默认就删键），**不进 `/api/data`**；启动时 `themeInit()` 立刻应用（避免闪一下默认色），并**兼容迁移旧键 `themeBgColor`**（读到就并进 themeSettings 再删旧键）。
  - **测试**：`tools/smoke.cjs` 第 **8i** 节 **22 条**（抬头齿轮 + 面板默认收起 / 点齿轮展开（`.open` + aria）/ 8+8+6 个选项 / 默认不动令牌也没本机记录 / 选暖米 → `--bg-0` + 浅色令牌 / 卡片面由底色推导 / **派生令牌逐条校验是合法颜色（`isColor`，防 `#aNaNaN`）** / 选蓝 → `--accent` 变蓝（合法值、≠默认黄）/ 六个 accent 令牌一起换 / **换绿再换回蓝都不是「取消」** / 渐变挂 `data-bg-effect` / 选炭黑 → 自动暗色且强调色提亮 / 两个取色器 / 点外面收起 / 恢复默认清令牌+属性+记录 / 不往服务端存）；`tools/verify.mjs` 另有 10 条静态断言（抬头+面板注入、旧调色条已移除、8+8+6 选项、三个 apply 函数、**`themeMix` 必须逐通道混**、区间钳制、令牌派生与属性、6 种渐变的 CSS、只存本机+迁移旧键、齿轮开合与排序守护）。
- **客服生涯 · 报表版式**：`.career-report-head`（英文 kicker `WORKLOAD REPORT / 工作量统计报表` + 标题 + `#careerReportSub` 数据范围/口径 + 右上 `#careerReportMeta` 5 格元数据：身份/记录天数/累计/日均/出具日期，由 `renderCareer()` 填；**「反馈模板」标签页也复用了这套抬头**）；卡片自动编号 `01…`（`#tab-career` 上 `counter-reset: career-card`，编号画在 `.card > label::before` / `.flex-row > label::before` / `.career-collapse-btn::before`）；KPI 卡改成等宽大数字 + 右上角刻度线（`.career-kpi::after`）；报表页**关掉了卡片的斜纹底**（`#tab-career .card::after { display:none }`）。
- **统计页的「紧凑信息条」（2026-10 加，用来替代成段说明文字）**：
  - `.stat-chips` + `.stat-chip`（含 `k-accent` / `k-warn` / `k-danger` / `k-plain` / `k-op` 变体）=「**一片一件事**」，数字用 `b` 强调；JS 里用 `statChip(text, cls, title)` / `statChips([...])` 两个 helper 生成（**它们内部会 `escapeHtml`，别再手动转义**；要放 HTML 就传 `{ html: "…" }`）。
  - `details.stat-fold` = 默认收起的格式说明 / 口径说明（原来的长段落都折进去了）。
  - `.card-sub` = 卡片标题右边那截极小的副标（替代原来一整句 `hint-text`）。
  - **统计页「分段导航」（2026-10 重构，替代原来的页内跳转条）**：两个统计页顶部都是 `.seg-bar` + `.seg-btn`（`data-for="tab-career|tab-overseas"`、`data-seg`、`data-n` 编号）——
  - **客服生涯 4 段**：`overview` 总览（总览卡 + 排班休息面板）/ `detail` 逐项明细（工单统计 + 海外统计）/ `trend` 趋势与分析（指标详情 + 趋势·月度 + 周维度）/ `data` 数据与补录（数据质量 + 补录 + 粘贴导入）；**海外 3 段**：`overview`（岗位总览 + 详情图表）/ `detail`（逐项 + 月度 + 周 + 人员 + 每日）/ `data`（粘贴导入那张卡）。
  - **开关机制**：卡片上挂 `data-seg-card="overview|detail|trend|data"`，`statsSetSeg(tabId, seg)` 只给当前段的卡片加 `.seg-on`；CSS `[data-seg-card]{display:none}` / `[data-seg-card].seg-on{display:block}`。⚠️ **内联 `style.display` 仍然优先**（排班休息面板靠这个收起，`renderCareer` 按身份隐藏两侧卡片也靠它），所以别把显示逻辑全搬进 CSS。
  - **切标签页回第一段**：`.tab-btn` 的 onclick 里对 `career` / `overseas` 调 `statsSetSeg(…, 'overview')`，免得停在上次的明细段。
  - **「话术生成」页也用了这套**（2026-10）：`.seg-bar[data-for="tab-gen"]` **三段** —— `01 话术生成`（原来的两块 `data-seg-card="reply"`）/ `02 七日任务进度`（`#genSevendayPane` + `data-seg-card="sevenday"`）/ `03 吉运节节高（下午茶）`（`#genTeaInfoPane` + `data-seg-card="teainfo"`，见下一节）；`bindSegBar` 末尾 `statsSetSeg('tab-gen', 'reply')` 初始化。⚠️ 这几段**不在**「回第一段」名单里（切回话术生成时停在用户上次看的那段）。⚠️ **这一页的分段条不吸顶**（`#tab-gen > .seg-bar { position: static; }`）：`.seg-bar` 默认 `position: sticky; top: 0`，而这条夹在卡片中间，吸顶时滚动会把下面的文本框 / 卡片切成两半（2026-10 用户截图「网页的这个条感觉有点奇怪」）；统计页那两条**仍然吸顶**（长页面用得上）。
  - ⚠️ **旧的 `.jump-bar` / `.jump-chip` / `bindJumpBar()` 已整段删除**（冒烟/静态断言锁着「不该再出现」），别再捡回来。

  - `.career-scroll table.career-table` 现在**表头吸顶 + 首列吸左**（宽表横向拖动时不跟丢）。
  - ⚠️ 冒烟对这些块用的是 `textContent` 精确/正则断言（如 `工单侧 17 + 海外侧 53 = 累计 70`、`Top3 集中度：`、`合计占`、`待确认 1 天`、`异常线 μ+2σ`、`活动 / 版本峰值标注`、`只存在这台设备的浏览器里`、`不上传服务端`）—— 改芯片文案要同步改断言。
- **报告式「一句话摘要」+ 工具条收拢（2026-10）**：两个统计页顶部 `.stat-headline`（`#careerHeadline` / `#ovbizHeadline`）由 `renderCareer()` / `ovbizRender()` 填 —— 「累计 X · 日均 Y · 最高单日 Z（日期）· 在岗 N 天 / 区间 M 天（休 K）」一行读完；没数据时回落成一片提示芯片。KPI 卡左侧加了一根 2px 强调条（主指标黄、次指标灰），表格首列加粗、行高收到 1.6。
  - **工具条**：客服生涯总览卡只留「🗂️ 归档今日日报」+「🗓️ 排班休息」两个主按钮，导出CSV / 导出JSON / 导入JSON / 清空本机 折进 `details.card-more`（点「⋯ 更多」展开）——**按钮 id 没变**，测试照旧能点。
    - ⚠️ **「⋯ 更多」展开的是一块浮层，不是把工具条撑高**（2026-10 用户：「点击更多出来的这几个选项有点乱」）：`details.card-more > div` 改成 `position: absolute; top: calc(100% + 6px); right: 0; z-index: 30`（父级 `details.card-more` 要 `position: relative`）+ `display: grid; grid-template-columns: 1fr; gap: 6px; min-width: 176px`，卡片面 + 细边 + `--shadow-2`；里面每个按钮 `display: flex; width: 100%; text-align: left; font-size: 12.5px; padding: 6px 10px !important`，`.ic` 图标 `margin-right: 7px`。**别再改回默认的 `details` 竖排展开**，那样 4 个按钮会把工具条往下顶歪。
    - 浮层会**自动收起**：`bindAll` 里挂了一条 `document` 级 `click` 监听 —— 点浮层外面收起，点浮层里任意 `button`（导出/导入/清空）也收起；`themePanel` 那套开合逻辑不受影响。
    - ⚠️ **浮层必须真的盖在卡片外面**（2026-10 用户截图：「这一块被盖住了」——4 个按钮被下面的统计行压住 / 被卡片裁掉，点不到）：`.card` 默认 `overflow: hidden`，而且「暗色收口层」里有 `.card > * { position: relative; z-index: 1 }`，所以浮层会被裁 + 被后面的行压住。修法是展开时用 `:has()` 放开那两条：
      ```css
      .card:has(details.card-more[open]),
      .inline-card:has(details.card-more[open]) { overflow: visible; }
      .card > .flex-row:has(details.card-more[open]) { z-index: 40; }
      ```
      **别删这两条**（`verify.mjs` 3j-2 有断言）；也别为了这个把 `.card` 的 `overflow: hidden` 全局改掉（卡片圆角 / 斜纹靠它收口）。
    - **日历小片不再出框**（2026-10 用户：「日历的小图标出框了」）：`.career-rest-day` 改 `padding: 5px 8px 7px !important` + `overflow: hidden; box-sizing: border-box`；`.career-rest-day b`（日期数字）去掉负 margin、改 `padding: 0 3px; max-width: 100%`；`.career-rest-day i`（「休」/ 班次小片）加 `max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`。**这三条一起锁着「小片不能溢出格子边框」**，`verify.mjs` 有断言。
- **🗓️ 排班休息（2026-10 用户要求，后改成微软日历样式）**：客服生涯工具条上的「🗓️ 排班休息」按钮（`#careerRestBtn`）展开 `#careerRestCard` 面板。
  - **月历版式（2026-10 用户要求：「按微软日历的样式排布，要有星期」）**：`#careerRestGrid` 里先画一行星期表头 `.rest-cal-week`（`CAREER_WEEK_LABELS` = 日 / 一 / 二 / 三 / 四 / 五 / 六，**周日排最前，跟 Windows / Outlook 中文日历一致**；周末两列 `.wd.is-weekend` 标红），下面 `.rest-cal-grid` 是 **7 列网格**，每天一格 `.career-rest-day`（数字在左上）。
    - **对齐**：月初按 `firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()` 补 `.rest-cal-blank` 空格子，月末再补到整周，所以 1 号永远落在它自己那一列、格子不会塌。
    - **标记**：周末格带 `.weekend`（`--surface-2` 底）；今天带 `.is-today`（数字反色成黄底黑字）；休息格带 `.rest`（黄淡底 + 黄边）并露出「休」小片 `.career-rest-day i`（平时 `visibility:hidden` 占位，尺寸不跳）。
    - **切月份**：`‹` `#careerRestPrev` / `›` `#careerRestNext` 走 `careerStepRestMonth(±1)`（跨年也对），中间抬头 `#careerRestTitle` 写「YYYY 年 M 月」；右边的 `#careerRestMonth`（`type="month"`）留作**跳到某个月**，改它也会重画（冒烟就是直接改它的 value）。
    - **口径那套没动**：`careerRestLoad/Save/Toggle`、`careerRestSet`、`.rest` 类名、`data-rest` 属性全都保留（冒烟 8m 靠它们），只是外观换了；「周末全休」(`#careerRestWeekendBtn`) /「清空本月」(`#careerRestClearMonthBtn`) 照旧。
  - **测试**：`tools/smoke.cjs` 第 **8p** 节 **13 条**（星期表头「日一二三四五六」/ 只有日与六标周末色 / 2026-06 共 30 天且前后补齐成整周（月初空 1 + 月末补 4）/ 6/1 落在「一」下面 / 周末 8 天带 `.weekend` / 抬头「2026 年 6 月」/ 非当月没有「今天」/ `›` 到 7 月 / `‹‹` 退到 5 月 / 当月「今天」那格带 `.is-today` / 休息格显「休」且 `aria-pressed` / 提示「休息 1 天」/ 再点取消）；上面 8m 那 15 条（休息日不进统计）也照旧跑。
  - ⚠️ 全局 `button` 在「收口层」里带 `clip-path: var(--clip-btn)` 和 `letter-spacing: .14em`，日历格子与 `‹ ›` 按钮都显式 `clip-path: none; letter-spacing: 0` 盖掉了 —— 改这块别把这两条删了，否则格子会变成切角 + 字距散开。
  - **存哪儿**：只写本机 `localStorage['careerRestDays']`（`YYYY-MM-DD` 数组，`careerRestLoad` / `careerRestSave` / `careerRestToggle`），**不进 `/api/data`** —— 跟 `careerData` 一个规矩。
  - **统计口径（`careerStats` 里只有这一处）**：`const restSet = careerRestSet()` 之后 —— ① **断档只数工作日**（`gapWorkDays()` 跳过休息日）；② **连续记录不休息日打断**（中间全是休息日就继续连续）；③ 新增 `restDays`（记录区间内的休息天数）与 `dutyDays = spanDays - restDays`（**在岗天数**），KPI「记录区间」副标与「数据质量」芯片都会显示「在岗 / 休息」。
  - **归档体检也跳过休息日**：休息日不报「漏登记」，另起一片「休息 N 天（不算漏登记）」。
- **🕒 排班（2026-10：只靠日历上手改 + 同步到日报）**：排班休息卡里原来那块 `.shift-import`（粘排班日历 + `🔍 识别并应用` / `👀 先看认出什么` / `🧹 清空排班` + 班次图例 `#careerShiftLegend` + 生涯班次芯片 `#careerShiftStats`）和 **截图 OCR**（`POST /api/ocr` + `tools/ocr-win.ps1` + tesseract 兜底）**已按用户要求整块删掉**（2026-10 用户：「去掉识别排班的部分」）；**唯独「📋 同步到日报」这个动作按用户要求留了下来**（「日历同步到日报的功能还是要的」），挪到排班卡工具条上，见下。
  - **删掉的东西**：`careerParseShiftText` / `careerApplyShift` / `careerShiftParseApply` / `careerOcrNormalize` / `careerShiftCode` / `careerShiftDefs*` / `careerShiftDefText` / `careerShiftStats` / `careerRenderShiftLegend` / `careerOcrSay` / `careerOcrReadFile` / `careerOcrImage` / `CAREER_OCR_MAX`；`server.js` 的 `/api/ocr`、`OCR_PS1`、`findTesseract`、`ocrImage`、`require('os')`、`require('child_process')` 一起没了，`express.json` **收回 `2mb`**；`tools/ocr-win.ps1` 已删。⚠️ **别再捡回来**（`verify.mjs` 3b-4 有反向断言：这些名字 / `id="careerShiftInput"` / `shift-import` / 「识别排班」都不该再出现）。
  - **剩下的口径**：班次只存本机 `localStorage['careerShiftDays']`（`{ 'YYYY-MM-DD': 'H' }`，休息 = `'O'`），**不进 `/api/data`**；读写入口是 `careerShiftLoad` / `careerShiftSave` / `careerShiftOfDate(date)` / `careerShiftCount(ym)`；合法班次代码 `CAREER_SHIFT_CODES`（A / A1–A4 / B / D / F / H / W / O）。
  - **日历格**：`.career-rest-day` 多挂 `data-shift` 与 `.has-shift`，`<i>` 里显示班次代码（休息仍显示「休」；`.has-shift i` 让平时藏着的那个小片显形）；提示写「休息 N 天 · 排班 M 天」。
  - **📋 同步到日报（2026-10 用户：「日历同步到日报的功能还是要的」）**：排班卡工具条的 `#careerShiftTodayBtn`（「同步到日报」，在「周末全休」前面）把**今天**的班次写进 `dailyData.ticket.shift` / `.overseas.shift` / `.online.shift`，`saveData` 后 `DAILY_TAB_KEYS.forEach(k => renderDailyForm(k))` 重画三栏；今天没排班时只在 `#careerRestHint` 里提示「先在「点日期：改班次」模式下点今天挑一个班次」，不瞎写。⚠️ 海外栏本来就没有「班次」输入框，写 `.overseas.shift` 是给生涯归档（`careerFoldDaily`）用的。
  - **自动匹配班次**：① 日报表单的「班次」下拉在空值时按**当天排班**带出（`val = (f.key === 'shift' ? careerShiftOfDate(careerToday()) : '') || f.default || …`）；② 在线客服日报抬头写 `（H班）` 时也读当天排班；③ 归档进生涯时 `careerFoldDaily()` 在日报没填班次时用当天排班补 `rec.shift`。
  - **✏️ 日历上手改班次（2026-10 用户：「日历的班次也要可以手动修改」）**：排班卡工具条多了 `.rest-mode` 两个切换按钮 `#careerRestModeRest`（点日期：标休息，**默认**）/ `#careerRestModeShift`（点日期：改班次），模式存本机 `localStorage['careerRestMode']`（`careerRestModeSet` / `careerRestModePaint`）。改班次模式下点某天 → 弹出 `#careerShiftEditBox` 面板：抬头 `#careerShiftEditDate` = 那天、`#careerShiftEditCodes` 里 `CAREER_SHIFT_CODES` 每个班次一个按钮（`O` 标「休息」）+ 一个「不排班」，当前班次是 `.is-on` 选中态。挑完 → `careerShiftEditPick(code)` 写 `careerShiftDays[date]`（空 = 删掉这天），**挑 `O` 会顺带进 `careerRestDays`**，然后重画日历 / 生涯并刷新面板；`#careerShiftEditClear` 清空这天、`#careerShiftEditClose` 收起，操作结果写在排班卡的 `#careerRestHint` 上。⚠️ **默认模式必须是标休息**（`smoke` 8m/8p 都是按「点日期 = 切休息」写的）；`.rest-mode-btn` 样式在圆润层里，按钮用 `!important` 盖掉全局按钮样式。
  - **测试**：`tools/smoke.cjs` 第 **8v** 节 **7 条**（识别那块整个不在了 / 排班卡上没有「识别排班 · 截图识别」字样 / 「同步到日报」按钮还在 / 手排的班次换月再回来还在 / 全程 0 请求，只写本机 / 「同步到日报」把今天 H 班写进日报「班次」/ 同步后给一句提示）；第 **8x** 节 **14 条**（6 个工具条按钮都是内联 `svg.ic` 且没有 emoji / 两种点日期模式与默认值 / 点日期弹 12 个班次面板 / 挑 H 写进本机且格子显示 / 挑 O 顺带标休息 / 清空这天 / `#careerRestHint` 提示 / 「⋯ 更多」浮层开合与自动收起）；`tools/verify.mjs` 3b-4 有静态断言（含反向断言）。
- **归档体检 / 漏登记提醒（2026-10）**：客服生涯总览卡里的 `#careerAuditBox` 由 `renderCareerAudit()` 填 —— 看**最近 7 天（不含今天）**有哪些日子 `careerData.records` 里没有，有就出 `k-warn` 芯片点名（「漏登记 N 天」+ 每个日期一片 + 指路「去每日日报归档或下面补录」），齐了就一片「最近 7 天都归档了」。日期用 `careerRecentDays(7)` 按 UTC 递减算，不依赖时区。
- ⚠️ 想再换回暗色：把 `:root` 的 `--bg-0/--surface*/--ink*/--line*/--accent*` 换回深色值即可，但**要同时删掉/改掉「浅色收口层 · 柔和白」这一段 + `color-scheme: light` + select 箭头 SVG 的 `%23c89500`**，否则会有浅底白线。

## 每日日报（`data-tab="daily"` · 表单分组）

**三栏**：📋 工单日报（32 字段）/ 🌐 海外日报（17 字段）/ 💬 在线客服日报（10 字段，2026-10 新增）。三栏的字段 / 分组 / 自定义项 / 渲染都挂在同一张 `DAILY_TABS` 表上（`{ formId, btnId, fields, groups, customKey, label }`），**加第四栏只要改这张表 + 一个 form div**。

- **在线客服日报（用户给的模板）**：`DAILY_ONLINE_FIELDS` = 客服 / 班次 / **53会话量** / **支付宝在线** / **邀评数** / **评价数** / **好评数** / **差评数** / 特殊问题 / 差评分析；分组 `DAILY_ONLINE_GROUPS` = 基础信息 / 💬 会话量 / ⭐ 邀评与评价 / 📝 问题与差评。
  - ⚠️ 它的「支付宝在线」与工单日报的「支付宝在线」**同名但两个字段**（`online.alipay_session` vs `ticket.alipay`，前者是会话量、后者是在线量），统计时各算各的，别合并。
  - 正文（`generateDailyReport` 的 `online` 分支）逐行就是用户的模板：`M月D日工作日报（H班）：` / `客服` / `53会话量：N` / `支付宝在线：N` / `邀评数：N` / `评价数：N` / `好评数：N` / `差评数：N` / `特殊问题：…` / `差评分析：…`；**有评价数时额外补一行「好评率：xx%」**（模板里没有，是顺手算的备注）。
  - `careerItemsFromDaily(t, o, n)` 多了第三栏参数；`CAREER_ONLINE_LABEL_TO_KEY` 让「粘贴在线客服日报文本」也能导入（`hasOnline` 只清在线侧，工单/海外两边不动）。
- **工单日报 32 个字段 / 海外日报 17 个字段原来是平铺的一个 auto-fit 网格**，用户反馈「每次填的时候都要找一下对应项在哪」（2026-10），现在按业务**分组**渲染 —— **只改排版，字段一个不合并、不删、不改名**（用户后来又强调过一遍「每个要填的项不合并删改，只是希望可以更方便查看填写」）：

- **分组定义**：`DAILY_TICKET_GROUPS`（10 组：基础信息 / 工单与后台 / ① 繁花 / ② 乐缤纷 / ③ 不差钱 / ④ 你的江湖 / ⑤ 梦幻消除战 / ⑥ 伙伴弹途 / ⑦ 异世界勇者 / 待跟进）与 `DAILY_OVERSEAS_GROUPS`（**7 组**：基础信息 / 评价与来访 / **📮 邮箱（来访）** / SDk 工单 / 工单 / 监控 / 群维系）。**数组顺序 = 表单里从上到下的顺序**；字段靠自身的 `group` 归组（`DAILY_TICKET_FIELDS` / `DAILY_OVERSEAS_FIELDS` 里每个字段都带 `group`，**除此之外一个字都没动**）。
- **渲染**：`renderDailyForm()` 按组出 `<section class="daily-group" data-group="…">` —— 组头 = 两位数编号 `.dg-n` + 标题 `.dg-title` + 副标 `.dg-sub` + 右上「已填 n/m」`.dg-fill`；组内 `.daily-group-grid` 自己一套 `repeat(auto-fit, minmax(150px,1fr))`。`.daily-form` 外层改成 flex 竖排，不再是全局网格。
- **字段本身不动**（用户 2026-10 明确：不合并、不删、不改名，只是更方便查看填写）：组内照旧显示原来的完整 `label`（`①繁花·微信` / `SDk工单·梦幻`…），字段顺序、数量、key、日报正文、统计标签全都没变；`CAREER_TICKET_ITEMS` 与 `CAREER_TICKET_LABEL_TO_KEY` 读的还是同一份 `label`。
- **已填片**：`updateDailyGroupFill(container, tab)` 在渲染后 + 每次输入时刷新：`0/4`（灰）/ `1/4`（部分，`.is-part` 橙）/ `4/4`（齐，`.is-full` 黄底）。数值字段按「> 0」算、文本按「非空」算，所以带默认值的「班次」一开始就算已填。
- **兜底**：以后新增字段忘了写 `group`，会落进 `data-group="misc"` 的「其他」片照旧渲染（`verify.mjs` 3b-2 同时断言「每个字段都归了组」和「misc 兜底存在」）。
- **测试**：`tools/smoke.cjs` 第 **8o** 节 **16 条**（工单 10 组 / 组标题是业务名 / 01…10 编号 / 32 个字段一个不少 / ① 繁花只装 4 个平台 / 组内标签仍是全称 / 没有 misc / 待跟进 0/1 → 填了 1/1 并高亮 / ① 繁花 1/4 / 海外 7 组 / SDk 三项同一片 / **邮箱三项（梦幻 / 爱江山 / 月光）单独占「📮 邮箱（来访）」一片、「评价与来访」只剩 商店评价 + 两个 FB** / 海外 17 字段 / 切回工单仍是 10 组 32 字段）；`tools/verify.mjs` 3b-2 有 9 条静态断言。
- ⚠️ **邮箱三项自己占一片**（2026-10 用户：「海外日报的邮箱三个单独列一列」）：这三个字段的 `group` 是 **`email`**，对应分组 `{ id: 'email', title: '📮 邮箱（来访）' }`（紧跟「评价与来访」后面），**别再塞回 `review`** —— `smoke` 8o 有断言锁着（`[data-group="review"]` = `ios,google,fb,fb_yl`，`[data-group="email"]` = `email_mh,email_ajs,email_yl`），`verify` 断言海外 **7 组**且第 3 组是 `📮 邮箱（来访）`。
- **海外日报的「邮箱」拆三项（2026-10，用户要求「增加月光的邮箱，可以和梦幻、爱江山分开来」）**：`DAILY_OVERSEAS_FIELDS` 里原来那格 `email`（邮箱（来访））换成 **`email_mh` 邮箱·梦幻 / `email_ajs` 邮箱·爱江山 / `email_yl` 邮箱·月光** 三个输入框（表单里不再有合并的「邮箱」那一格，海外日报 15 → **17 字段**）。
  - ⚠️ **日报正文仍然只写一行**（用户紧接着要求「邮箱和 sdk 的各自三项都合并成邮箱和 sdk 计算」）：正文是 `邮箱：4例` / `SDk工单：12例` 这个粒度 —— **表单分开填，正文合并成「邮箱」「SDk工单」各一个数**，不新增三行。改这块别把 `邮箱：${careerEmailTotal(d)}例` 又拆回三行。
  - **合计**：`careerEmailParts(o)` / `careerEmailTotal(o)` 把三项加起来，正文那行和「来访总计」都用合并后的数；`overseas.email`（旧总量）保留做兜底 —— **三项都空时按 `email` 算、记在梦幻那项**，所以历史日报 / 老数据不丢。
  - **统计**：海外侧「海外邮件（全产品）」`ov_email` 读三项之和（**不新增统计项、总量口径不变**）；三项明细走 `CAREER_EMAIL_BREAKDOWN`（跟 `CAREER_SDK_BREAKDOWN` 一样属于「其中项，不重复计入合计」），在海外侧明细表里以子行展示、补录里也能单独填。两者合起来是 `CAREER_BREAKDOWN`，`CAREER_SUB_KINDS` 让两组明细都按子行渲染（虚线、不计百分比）。
  - **老日报导入**：`CAREER_OVERSEAS_LABEL_TO_KEY` 里 `邮箱` → `email`（合计）、`邮箱·梦幻` / `邮箱·爱江山` / `邮箱·月光` → 三个新 key（万一有人贴的是三行写法也认）。
- ⚠️ 字段数组只新增了一个键（`group`），不影响统计：`CAREER_TICKET_ITEMS` 仍按 `f.type === 'number'` 过滤；但 `verify.mjs` 里那个 `numKeys()` 的正则已放宽成 `type: 'number'[^{}]*}`，否则认不出带 `group` 的字段。

## 工单回复（`data-tab="reply"` · ⭐ 高频回复自动统计）

选开头 / 正文 / 结束语 → 「✨ 生成回复」→ 「📋 复制」，另有标签预设。**2026-10 用户要求加了「高频回复」**：

- **口径**：不存玩家 openid、不认人，只统计「**这台设备生成 / 复制过的话术**」哪几句最多；生成算一次、复制也算一次（含从高频列表里点复制）。只写本机 `localStorage['replyTopUsage']` = `[{ text, count, gen, cop, last }]`，**不进 `/api/data`**，上限 `REPLY_TOP_KEEP = 60` 条原始统计。
- **展示**：卡片 `#replyTopList` 按 `count` 降序、同次数按 `last` 新的在前，**只显示 `REPLY_TOP_MAX = 10` 条**（用户要求「至多十条」）；新的句子用得多了自然会挤进前 10。每行有「用 N 次 / 生成 N / 复制 N / 最近 日期」芯片 + 📋 复制 + 🗑 删；右上「🧹 清空统计」(`#replyTopClearBtn`)，清空/删除都带 confirm。
- ⚠️ 不到 4 个字的回复不记（`replyTopTrack` 里 `t.length < 4` 直接 return），免得分隔符/一句话灌满统计。
- ⚠️ 它是**纯本机统计**：换设备就没了，也不该同步（跟 `careerData` / `ovbizData` 是一个规矩）。

## 反馈模板（工单信息提取器）

**「📮 反馈模板」标签页**（`data-tab="feedback"` / `#tab-feedback`，侧边栏在「工单回复」下面）—— 口径**照搬用户给的《反馈模板生成器》单页工具**（文件名 `test - 多选生成(🆕) - 修改异世界区服无法正常显示的问题.html`）：选模板 + 选来源 + 粘原始字符串 → 出反馈格式文本。

- **四种模板**（`FB_TEMPLATES`，单选片 `.fb-chip`）：`menghuan` 梦幻消除战 / `changwu` 常规游戏 / `lebifen` 乐缤纷CP后台 / `gongdan` 内部工单。⚠️ **没有单独的「工单」模板** —— 喜扑工单反馈是**来源＝工单**触发的行为（见下），用户 2026-10 明确纠正过「不是单独开个模板」。
- **来源 11 个**（`FB_SOURCES`，**已按用户要求删掉「电话」**）：抖音小店 / 抖音后台 / 53 / 工单 / 支付宝在线 / 支付宝后台 / 微信后台 / 爱江山CP后台 / 繁花CP后台 / 乐缤纷CP后台 / 企微。
  - ⚠️ **每个模板能选的来源不一样**（`FB_TEMPLATE_SOURCES` + `fbAllowedSources()`，用户明确要求）：
    - `menghuan` 梦幻消除战 → **8 个**：抖音小店 / 抖音后台 / 53 / 工单 / 支付宝在线 / 支付宝后台 / 微信后台 / 企微（**不要爱江山 / 繁花 / 乐缤纷CP后台**）。
    - `changwu` 常规游戏、`gongdan` 内部工单 → 全部 11 个。
    - `lebifen` 乐缤纷CP后台 → **只有「乐缤纷CP后台」**这一个。
    - 谁的列表里都没有「电话」。
  - 实现：11 个来源片都在 DOM 里，`fbRenderChips()` 按当前模板把不该有的 **`style.display='none'`** 掉（**别用 `hidden` 属性**：`.fb-chip` 有 `display` 样式，`hidden` 会被盖掉）；换模板时若当前来源不在新模板的列表里，**自动落到该模板的第一个来源**（乐缤纷只有一个，所以自动就切过去了）；`fbSetSource` 会拒绝不在列表里的来源；`fbLoadState` 读本机记录时也按这套校验（老记录里的来源可能已经不合法）。抬头「来源总数」= **当前模板**的可选数。
- **四种解析**（`fbBuildOrderText` / `fbBuildGameText` / `fbLebifenRows` / `fbTicketBlocks`）：
  - **内部工单**：按行 `字段名 值` 提取，字段表 `FB_ORDER_FIELDS`（工单号 / 来源 / 游戏 / 区服 / UID / 账号 / 角色ID / 角色名 / 类型 / 问题描述 / 当前组 / 提交人 / 提交时间 / 工单状态 / 联系人 / 手机号码）；输出 `工单号：… 提交者：… 游戏：… 账号：… uid：… 角色名：… 角色id：… 区服：… 问题：… 来源：<选的来源> 编号： 联系方式：<手机号优先，没填才用联系人>`。
  - **梦幻 / 常规**：把整行按空格拆（`\s+`），`parts[0]=UID`、`parts[1]=游戏名`、`parts[3]=平台区服`；找 `YYYY-MM-DD` 当发生时间、找第 4 位起第一个「4 位以上纯数字」当角色ID；角色ID 之前那段拼成区服名、之后到日期之前拼成角色名。渠道 = 游戏名里最后一个 `-` 之后、去掉中英文括号内容。
  - **乐缤纷CP后台**（`fbLebifenRows` / `fbLebifenText`，**输入跟其它模板不一样**）：
    - **输入是后台表格里复制出来的一行**（用户给的原文，制表符分隔）。列序固定：**账号 / 渠道 / 版本号 / 类型 / 问题 / 提交时间 / 状态 / 回复 / 回复人 / 回复时间 / 编辑**。原文样例：
      `92930999⇥weChat (wechat)⇥2.1.7.62⇥问题反馈⇥没有显示也没有发掘币⇥2026-10-02 10:05:53⇥未查看⇥⇥⇥2026-10-02 10:05:53⇥回复 删除`
    - 取 **第 1 列当角色ID**（要匹配 `/^\d{4,}$/`）、**第 2 列当渠道**（照抄，不转换写法，所以是 `weChat (wechat)`）、**第 5 列当问题**。
    - ⚠️ **可以一次复制多行**（用户就是这么用的）：**每行出一段**，段与段之间**空一行**（`join('\n\n')`），提示里写「生成 N 段」。
    - ⚠️ 复制时**带上表头行也认**（首列是「账号」、或同时出现「账号」「渠道」→ 跳过那行）。
    - ⚠️ **只复制了少数几列**（不足 5 列）时按内容认：第一个「4 位以上纯数字」当角色ID、命中 `FB_LB_CHANNEL_RE`（wechat/微信/抖音/手q/taptap/支付宝/ios/安卓/b站…）的当渠道、剩下的最长那句当问题；`FB_LB_NOISE_RE` 用来排除表头词与状态词（未查看/已回复/回复/删除…）。
    - 输出固定五行（`来源：` 仍是选中的来源，默认「乐缤纷CP后台」）：
      ```
      乐缤纷
      渠道：
      问题：
      角色ID：
      来源：乐缤纷CP后台
      ```
    - ⚠️ 它**不走 `fbBuildGameText`**（那套是空格分隔的游戏日志）：`fbGenerate` 里对 `lebifen` 单独分支，**一行都认不出来时不生成**，提示「没认出乐缤纷后台的行：请把后台表格里复制出来的整行…」。
    - 选这个模板时来源只剩「乐缤纷CP后台」一个，所以 `fbSetTemplate` 会把它**自动切成乐缤纷CP后台**（换模板时来源跟着落到新列表的第一项）；`fbMismatch` 对乐缤纷只拦一种：内容是内部工单（首词是「工单号」）。
  - **区服特例（用户给的规则，照搬）**：`唱舞星计划` 且区服名是数字（`isFinite`）→ 用 `parts[3]` 那个数字区服；`异世界勇者` → 固定 `001`，其中 `联盟契约` / `taptap` → 固定 `000`。**这就是原文件名里说的「异世界区服无法正常显示的问题」的修法**。
  - **来源＝工单 → 喜扑工单反馈格式**（2026-10 用户要求：「反馈模板增加工单模板，来源仅有工单，没有模板对应的部分的信息的话，可以后续粘贴玩家信息数据填充进去。【设备信息】和【发生时间】可以空着」；**随后用户纠正**：「不是单独开个模板，而是选择原有的模板，加上来源是工单的话，就按这个逻辑生成反馈」→ 现在**模板还是原来 4 个**，只看 `fbSource === '工单'`）：
    - **触发**：`fbGenerate` 里先判断 `if (fbSource === '工单')` —— 能认出喜扑工单（工单整块 / 工单列表行）就按**当前模板**渲染并 `return`；**认不出就照旧落到原模板**（比如粘的是内部工单、或普通游戏日志，行为跟以前一样）。
    - ⚠️ **跟原有「内部工单」互不干扰**（2026-10 用户：「不要和原有的内部工单冲突了」）：⑧ 喜扑工单靠 `主体` / `游戏名称` 两列认，内部工单没有这两列 → 不会被抢；⑨ 卡片上粘文本时 `fbLooksTicketPaste` 只认「**真能解析出东西**」的（`fbTicketBlocks` / `fbTicketTableRows` / `fbTicketPlayer(v).uid` 三者之一），并且**首行是「工单号⇥…」但没有 主体/游戏名称 的直接 return false**（内部工单文本照旧按普通文字粘，不会被吞掉）；⑩ 内部工单模板 + 来源「工单」粘内部工单 → 还是内部工单格式。
    - **粘工单但来源没选工单**：`fbMismatch` 里 `looksTicket`（有 `主体` + `游戏名称`）会提示「请把来源切成「工单」」。
    - **输入** = 喜扑后台复制的「工单：工单号⇥1536243 (近一个月来单：1)」那一整块（制表符分隔，字段：主体 / 类型 / 游戏名称 / 区服名称 / 角色ID / 绑定的手机 / 问题描述 / 工单状态 / 接管人 / 创建时间 / 发生时间 / 联系人电话）。
    - **块切分（`fbTicketBlocks`）**：从「工单：工单号」那行起（**也认直接以「工单号⇥…」开头的那种**，正则 `/^(工单[:：]\s*)?工单号([\t ]|[:：])/`），到下一个工单块或「玩家数据：」之前；**只认带 `主体` / `游戏名称` 的喜扑工单**（内部工单没有这两列，所以不会被误吃）。**一次粘多块 = 多段**（段间空一行，巨多模式下正好一卡一条）。
    - **字段（`fbTicketFields`）**：按「字段名⇥值」提取，`问题描述` 那种**多行字段**把后面的行整段收进来；再从里面用 `fbTicketDescParts` 拆 `【问题类型】/【问题描述】/【棋子名称+等级】/【详细描述】`，**具体描述取【详细描述】**（没有就【问题描述】，再没有就整段第一行）。
    - **玩家数据补齐（`fbTicketPlayer`）**：把 `玩家数据：176674940⇥番糖-梦幻消除战-支付宝小程序⇥android …` 那一坨一起粘进来 → **喜扑UID** = 渠道之前最近的那个 6 位以上数字、**渠道** = 带「-」那串的最后一段（`支付宝小程序`），**角色ID 兜底**用渠道之后最近的 6 位以上数字（工单里有角色ID 时以工单为准）。
      - ⚠️ **没写「玩家数据：」前缀、直接粘后台那一坨也认**（2026-10 用户：「选中卡片再粘贴玩家数据不会填充」）：靠「渠道那串含平台词（小程序 / 安卓 / android / ios / app / 官网 / 应用宝 / taptap …）」来认，**认不出平台词就不认 UID**，免得把工单号当成喜扑UID。
      - ⚠️ **只粘玩家数据时点「生成」不会新开卡**：`fbGenerate` 在 `fbBulkOn` 下如果只解析出玩家数据（没有工单块 / 列表行），就 `fbTicketMerge` 进**唯一那张卡或唯一勾选的那张卡**；没勾选也没唯一卡时提示「先勾选一张卡（只勾一张）」。
    - **输出格式跟模板走**（2026-10 又一轮纠正：「反馈结果发格式不对…**按照原来的反馈模板**」）：工单只是**数据来源**，`fbTicketText(rec)` 按当前模板回原来那套 ——
      - `menghuan` 梦幻 → 用户给的九行：`【<游戏名>问题反馈】`（游戏名取「游戏名称」最后一个「-」之后）/ `【喜扑UID】` / `【角色ID】` / `【渠道】` / `【设备信息】：`（留空） / `【发生时间】` / `【具体描述】` / `来源：工单` / `编号`。
      - `changwu` 常规 → 常规那套：`游戏：` / `UID：` / `角色名：` / `角色ID：` / `区服：` / `问题：` / `来源：` / `编号：`。
      - `gongdan` 内部工单 → 内部那套：`工单号：` / `提交者：` / `游戏：` / `账号：` / `uid：` / `角色名：` / `角色id：` / `区服：` / `问题：` / `来源：` / `编号：` / `联系方式：`。
      - 字段来源：`fbTicketRec`（整块）/ `fbTicketRowRec`（列表行）→ 归一成一条记录（工单号 / 游戏名 / 区服 / 账号 / 角色ID（空则用账号）/ 角色名 / 喜扑UID（玩家数据优先，其次账号）/ 渠道（只认玩家数据，列表里那列「微信/普通」不用）/ 发生时间 / 具体描述（`【详细描述】` > `【问题描述】` > 首行）/ 电话）。
    - ⚠️ 没粘玩家数据时 `【喜扑UID】`/`【渠道】` 空着，提示会写「粘上再点一次就补上」；认不出工单时**不生成**，提示「没认出工单…」；粘的是工单但来源没选「工单」，`fbMismatch` 会提示把来源切成「工单」。
    - **工单列表整段 → 快速开卡（2026-10 用户要求：「开着巨多，工单如果粘贴这种格式的话可以快速开卡，不够的信息可以选中对应的卡片后再在上面粘贴补充」）**：
      - 列表整段（制表符分隔）用 `fbTicketTableRows` 解析：**第一格可能是空勾选框**，所以先 `findIndex` 找 `/^\d{4,}$/` 那格当**工单号**，再按 12 列往下排（工单类型 / 渠道 / 问题类型 / 主体 / 问题描述截断 / 游戏名称 / 区服 / 工单状态 / 接管人 / 电话 / 创建时间）。
      - 每行 → `fbTicketRowRec` 归一成一条记录（编号 = 工单号、游戏名、区服、电话；**角色ID / 角色名 / 账号 / 具体描述 先空着**，等粘详情补），再按当前模板渲染；`fbGenerate` 的两条路：`blocks`（整块）优先，没整块才走 `rows`（列表行）。
      - ⚠️ **列表里那格「问题描述」是被截断的（`…`），别往卡片里塞** —— 留着空白，等用户粘详情。
      - **卡片格式也跟着模板**：`fbTicketText` 渲染出来的卡片，梦幻模板是九行、常规模板是「游戏/UID/…」，`fbCardKind` 认这个。
      - **在卡片上粘一次就补（`fbCardPaste` + `fbTicketMerge`）**：按卡片自己的格式写回（九行走 `fbFeedbackParse`、常规走 `fbGameParse`），只填空着的格子。卡片 `paste` 里先用 `fbLooksTicketPaste` 判断这段文本能不能**真的解析**成喜扑工单 / 玩家数据（`fbTicketBlocks` / `fbTicketTableRows` / `fbTicketPlayer().uid` 三者之一；首行是「工单号⇥…」但没有 主体/游戏名称 的直接放行）——是才 `preventDefault`，把**这张卡**的九行读成字段表（`fbFeedbackParse`），**只填空着的格子**（粘玩家数据补 喜扑UID / 渠道；粘工单整块补 角色ID / 发生时间 / 具体描述 / 编号；标题只在还是默认「梦幻消除战问题反馈」且真的会变时才改），再 `fbFeedbackText` 写回；**一个都没补上就提示「这张卡里这些信息已经有了」**，不会把原文糊进卡片。原有的「粘图片」逻辑在它后面，不受影响。
      - 测试：`tools/smoke.cjs` 第 **8t** 节 **29 条**（列表 4 行 → 4 张卡 + 提示「工单列表行」/ 第 1 张标题与编号 / 第 4 张唱舞全明星标题 / 拿不到的字段先空着 / 文本框也是 4 段 / 往第 1 张粘玩家数据 → 只有这张补上 喜扑UID + 渠道 / 往第 2 张粘工单整块 → 角色ID + 发生时间 + 具体描述 / 编号不被覆盖 / 同一份再粘提示「已经有了」/ **第一行直接是「工单号⇥…」的整块按一整块解析（只 1 段，不再被当成 3 行列表开空卡；编号 = 工单号不是手机号；巨多开/关都填满字段）** / **只有「字段名⇥值」几行、没有工单号的那种不会误开卡** / **卡片上粘内部工单文本不会被拦下（不误吞）** / **常规模板 + 工单：卡片是常规格式、粘工单整块也能补（区服/编号不覆盖）** / **卡片上粘「没有玩家数据：前缀」的那一坨也能补** / **只勾一张卡时粘玩家数据点生成 → 补进那张卡、不多开卡** / 全程 0 请求）；`tools/verify.mjs` 3o 另有 6 条静态断言。

- **模板对不上时不生成**（`fbMismatch`）：内容像内部工单却选了常规/梦幻/乐缤纷、或选了内部工单但没「工单号」行，都会清空结果 + 在 `#fbHint` 里说明该换成哪个模板（原工具是 `confirm` 弹窗 + `return`，这里换成不打断的提示，**行为仍是「不给错格式」**）。乐缤纷模板只拦一种：内容是内部工单（后台表格行不会被误判）。
- **只存本机**：选中的模板/来源存 `localStorage['feedbackTplState']`（`fbLoadState`/`fbSaveState`），**不进 `/api/data`**；页面启动（`bindAll`）和切到该标签页时都会 `fbRenderChips()` 把选中态画回来。
- **抬头**：复用 `.career-report-head`，`#fbReportSub` = 当前模板/来源/可选来源数，`#fbReportMeta` 三格 = 模板 / 来源 / 来源总数。
- **按钮**：`⚡ 生成反馈格式`（`fbGenerate`）/ `📋 复制结果`（`fbCopy`，走 `safeCopy`，空结果只提示不抛错）/ `🧹 清空`（`fbClear`）。
- **测试**：`tools/smoke.cjs` 第 **8h** 节 **29 条**（标签页 + 4 模板 + **来源片 11 个且不含「电话」** + **梦幻消除战默认藏掉爱江山/繁花/乐缤纷CP后台** + 默认选中 + 抬头 3 格 / 常规游戏各区服特例（001 / 000 / 唱舞数字 / 普通取服务器名）/ 切来源后结果跟着变 + 记住 `feedbackTplState` + **换回梦幻消除战时来源没变（企微在它的列表里）且「来源总数」= 8** / 梦幻正文与渠道去括号 / **乐缤纷CP后台：用户原文那行逐字比对 + 来源只剩它自己且自动切过去 + 一次多行出两段（段间空一行）+ 带表头跳过 + 只复制三列也能认 + 认不出来不生成 + 内部工单会被拦** / 模板选错不生成并提示 / 内部工单字段提取（手机号优先、没手机号用联系人）/ 清空 / 空输入提示 / 复制按钮不抛错 / 整场不往服务端存）；`tools/verify.mjs` 另有静态断言（标签页、来源 11 个含乐缤纷CP后台且**已无「电话」**、**工单（反馈）模板：来源只有「工单」+ 块切分 + 字段/小字段解析 + 玩家数据补 UID 渠道 + 九行格式 + 缺玩家数据提示 + 选错模板提示**、旧名「抖音在线」已不存在、模板 4 种、**每个模板的来源表（梦幻 8 个 / 乐缤纷只有它自己）+ 按模板隐藏来源片**、两套正文、**乐缤纷五行格式 + 后台表格行解析（制表符分列/第 5 列是问题/跳表头/多行拼多段）+ 少数几列按内容认**、切模板时来源落到列表第一项、区服特例、字段表、只存本机、容器、按钮与标签页刷新）。

- **开关是 iOS 那种滑钮**（2026-10 用户：「切换类的选项可以参考 iOS 系统的开关样式」）：`.sw` + `.sw-track`（44×26 轨道、22px 白色圆钮、`aria-pressed="true"` 时轨道变 `--accent` 且钮 `translateX(18px)`）。
  - 「顶不住鸟」（内部代码 / id 仍叫 `fbBulk*`、doc 里仍写作「巨多」）：`<button id="fbBulkBtn" class="sw" role="switch" aria-pressed>` 里放 `.sw-track` + `#fbBulkLabel`，**JS 只改 `#fbBulkLabel` 的文字**（别再用 `btn.textContent = …`，那会把滑钮 span 冲掉）。⚠️ **界面上叫「顶不住鸟」（2026-10 用户改名：「把巨多改成顶不住鸟」）**：标题写 `⑤ 顶不住鸟 · 卡片模式`、滑钮写「顶不住鸟：关 / 开」、提示写「顶不住鸟已打开 / 已关闭」，`verify` 3c-2 有断言锁着（`巨多：开|巨多：关` 不该再出现）。
  - 「全选」：`<label class="fb-all"><input type="checkbox" id="fbCardAllBox"><span class="sw-track"></span><span class="sw-label">全选</span></label>`，靠 `input:checked + .sw-track` 换色 / 挪钮；**半勾**由 `fbBulkPaneTail` 给 label 加 `.is-half`（钮挪到中间）。原生 input 被 `.fb-all input[type="checkbox"] { position:absolute; opacity:0 }` 藏掉，但**仍是真的 checkbox**（测试照旧读写 `.checked`）。

- **📚 「顶不住鸟」（原名「巨多」）卡片模式（2026-10，用户要求：「来访很多会来不及反馈 → 增加一个「巨多」开关，打开后生成的反馈会变成卡片在下面显示，卡片内容支持编辑粘贴图片，可以勾选多选一键复制在钉钉飞书等应用内一键发送，发送时按一个卡片是一条信息」）**：反馈模板页多一块 `#fbBulkCard`（`⑤ 顶不住鸟 · 卡片模式`，`#fbBulkBtn` 是 iOS 滑钮（`.sw` + `aria-pressed`，`#fbBulkLabel` 写「顶不住鸟：开/关」），**默认关**）。
  - **开关**：`fbBulkOn` + `#fbBulkPane`（`style.display` 收放）。关着就是原来的 `#fbOutput` 文本框；打开后 `fbGenerate` 除了照旧写文本框，还调 `fbPushCards(text)` **追加**成卡片（不覆盖，已有卡片留着）。
  - **一段一张卡**：`fbSplitCards()` 按**空行**拆（乐缤纷模板本来就「一行一段、段间空行」→ 一卡一条正好）。
  - **卡片**：`#fbCards` 里每张 `.fb-card` = 勾选框 + 编号 `#N` + 「📋 复制这张」+「🗑 删」+ `.fb-card-body`（`contenteditable`、`white-space: pre-wrap`）。正文直接改，input / blur 回写 `fbCards` 快照（`fbCardsSyncFromDom`）并防抖存本机。
  - **粘图**：`fbCardPaste` 只拦剪贴板里的图片（`clipboardData.files` 或 `items[].getAsFile()`），转 dataURL 用 `fbInsertAtCursor` 插到光标处；超过 `FB_CARD_IMG_MAX`（1.6MB）拒绝并提示；纯文字 / HTML 仍交给浏览器默认粘贴。
  - **复制口径（⚠️ 关键，别改成「一次全复制」）**：浏览器**没法**替用户往钉钉 / 飞书发 N 条消息，只能控制剪贴板。所以「复制选中」= **一条一条**：`fbCardCopySelected` 用 `fbCardQueue` / `fbCardQueuePos`，**点一次只复制一张**，按钮变成「📋 复制下一条（还剩 N 条）」，粘出去发完再点下一次 → **一张卡 = 一条消息**；「📋 合并复制成一条」是另一颗按钮（真要合并时才用）。没勾选时默认按顺序全发。
  - **复制内容**：`fbCopyRich` 优先 `ClipboardItem` 富文本（`text/html` + `text/plain`，截图能跟着过去），环境不支持或没有 `navigator.clipboard` 时退回 `safeCopy(纯文本)`（`fbCardText` 把 `<img>` 变 `[图片]`、`<br>` 变换行）。
  - **增删清**：`＋ 空白卡片`（手写一条，最多 `FB_CARD_MAX = 40` 张）/ 每张单独删 / `🧹 清空卡片`（带 confirm）。
  - **「全选」是一个可勾选的切换项**（2026-10 用户：「这里合并成一个可勾选切换的项」）：`<label class="fb-all"><input type="checkbox" id="fbCardAllBox"><span class="sw-track"></span>… 全选</label>`（iOS 滑钮），勾上 = 全部选中、取消 = 全部取消；**只选了几张时是半勾状态**（`all.indeterminate` → label 的 `.is-half`），单张勾选后由 `fbBulkPaneTail()` 回写。⚠️ 原来的 `#fbCardAllBtn` / `#fbCardNoneBtn` 两颗按钮已删，别加回来（`verify` 断言 `!/fbCardAllBtn|fbCardNoneBtn/`）。
  - **只存本机**：`localStorage['feedbackBulk'] = { on, items: [html…] }`（`fbBulkLoad` / `fbBulkSaveNow` / `fbBulkSaveLater`，超配额 try/catch 提示「存不下了」），**不进 `/api/data`**。
  - **测试**：`tools/smoke.cjs` 第 **8r** 节 **21 条**（默认关 → 点开 `aria-pressed` + 卡片区 / 乐缤纷粘两行 → 2 张卡且内容各是各的 / 正文可编辑 / Ctrl+V 贴图变 dataURL `<img>` / **「全选」一个勾选项就能全选 / 取消（只选一张时半勾）** / 勾选 → 「复制选中」**第一次只复制第 1 张**、按钮变「复制下一条（还剩 1 条）」→ 再点复制第 2 张「全部复制完了」/ 「合并复制成一条」/ ＋空白卡 3 张 → 删第 1 张回 2 张 / `feedbackBulk` 只在本机（on + 2 张）/ 关掉收起、再打开还在 / 清空 → 空状态 / 全程 0 个请求）；`tools/verify.mjs` 3m 另有 **10 条**静态断言（容器与按钮 id + 默认收起 / 空行拆卡 / `contenteditable` / `ClipboardItem` 富文本 + `safeCopy` 兜底 / 粘图 `getAsFile` + 1.6MB 上限 + `readAsDataURL` / 逐条复制队列与「复制下一条（还剩 N 条）」/ 增删清 + `FB_CARD_MAX` / 只存本机 / 生成流程两处 `fbPushCards` / 卡片墙样式）。

## 🗓️ 七日任务（并进「话术生成」页 · 任务进度话术）

**「🗓️ 七日任务」并进了「话术生成」页**（`#tab-gen` 里的**第二段**；2026-10 用户问「七日任务进度的功能可以合并到话术生成页吗」→ 合并）。页内 `.seg-bar[data-for="tab-gen"]` 两个 `.seg-btn`：`01 话术生成`（原来的两块 `data-seg-card="reply"`）/ `02 七日任务进度`（`<div id="genSevendayPane" data-seg-card="sevenday">` 包住那几张卡）。⚠️ **侧边栏没有单独的「七日任务」标签了**（`data-tab="sevenday"` / `#tab-sevenday` 已删，`verify` 3l 锁着「不该再出现」）；开关走同一套 `statsSetSeg('tab-gen', 'reply' | 'sevenday')`，`bindSegBar` 末尾初始化成 `reply`，**切回「话术生成」时停在用户上次看的那段**（不在「回第一段」名单里）。

**任务表是固定的**：用户 2026-10 先给了整张表（35 个任务 `2486`–`2520`）、又给了**当期**那张（35 个任务 `2416`–`2450`）、后来又给了最新的 `2521`–`2555`（客户端进度 / 客户端状态两列是「-」），三张都并进了 `SD_TASK_DEFAULT`（**三期 ID 不重复，共 105 条，三期的日志都认**；最新的那期放在前面）。**界面上完全不出现这张表**（用户看图说「这一块也不要」），所以平时只需要粘 **进度日志**。按**任务ID** 去内置任务表判定：这个任务是第几天、干什么、现在到多少、**还差多少完成**、**完成了能领什么奖励**。**只在本机处理，一个请求都不发。**

- **主区（平时只用这个）**：① `#sdLogInput` 进度日志（列序 `创建时间 · 活动排期ID · 事件UUID · 任务ID · 老进度 · 新进度 · 老状态 · 新状态`）→ ② `⚡ 生成话术`（`#sdGenerateBtn`）/ `📋 复制结果`（走 `safeCopy`，空结果只提示）/ `🧹 清空` → ③ `#sdOutput` 结果。
- **内置任务表 `SD_TASK_DEFAULT`**（TSV 字符串数组 `.join('\n')`，列序 `任务ID · 天数 · 任务描述 · 目标 · 进度 · 客户端进度 · 客户端状态 · 状态 · 积分 · 奖励`）：
  - `sdInputs()` 直接 `sdParseRows(SD_TASK_DEFAULT, SD_TASK_ALIASES, SD_TASK_ORDER)` —— **页面上没有任何任务表 UI**（`#sdTaskFold` / `#sdTaskInput` / `#sdTaskSub` / `sdInitTaskTable` / `#sdTaskResetBtn` / `sdClearTask` 全删，`verify` 3l 锁着「都不存在」）。
  - ⚠️ **要改任务就改 `SD_TASK_DEFAULT`**（只能改代码，界面上没有入口）。
  - ⚠️ 表头写的是 **`客户端进度` / `客户端状态`**（不是「客户进度」），`SD_TASK_ALIASES` 两个写法都认。
- **期次换算（2026-10 优化：偏移量不写死，从表里算）**
  - 用户最早给的说法是「每个任务代码加 140 就是下一期的对应任务，减 140 就是上一期」；后来又贴了 `2521`–`2555` 这一期才发现**相邻两期其实只差 35**（`2486+35=2521`、`2416+105=2521`），±140 只是「隔 4 期」的特例。所以原来是写死的 `SD_PERIOD_STEP = 140`，现在改成**算出来的**。
  - `sdPeriodInfo(tasks)`：按 ID 升序扫一遍，**「天数往回走」= 下一期开始**（第7天之后又出现第1天），于是量出「一期多少条」（现在是 35；表里只有一期时就用总条数；整表没写天数时兜底用最长连号）。结果带 `sig` 缓存，表没变就不重算。
  - `sdTaskById(id, byId, tasks)`：先精确查 ID；查不到就在表里找**同位置的另一期** —— 候选 = 跟某个已知 ID 的**差值是一期的整数倍**（`Math.abs(delta) % info.len === 0`，最多 `SD_PERIOD_MAX = 20` 期），取差值最小的那一行（一样近取**较新**那期，目标值只会往上走）；命中就照抄那一行的「天数 / 描述 / 目标 / 积分 / 奖励」，**进度与状态仍用日志里的**。`sdBuildLog` 里取任务那行是 `sdTaskById(id, byId, tasks) || {}`。
  - 所以 **±35 / ±70 / ±105 / ±140… 全都自动成立**；表里那三期留着是为了「目标值取对哪一期」，新期照旧整张贴进来最准（不贴也能按最近的期估着答）。
  - 全都换不到（比如 `9999`）才照旧回落成「任务NNNN」+「未标天数」+「已进行 N」+「可领取活动奖励」。
  - **「-」当空值**（`sdCell`）：新一期表的「客户端进度 / 客户端状态」两列是 `-`，既不算进度也不算目标；日志里「新进度」是 `-` / 空时，用任务表「进度」列兜底（`const prog = sdCell(it.newP) || sdCell(it.t.progress)`）。
  - 测试：`tools/smoke.cjs` 8q 用 `2556`（2521+35）、`2276`（2416−140）、`2528`（新表本期）、`2560`（2525+35）四条日志锁着；另有两条锁「日志进度是 `-` → 用表里的进度兜底」；`tools/verify.mjs` 3l 有 2 条静态断言（算出来的期次长度 + `sdCell`）。
- **判定（`sdBuildLog`）**：
  - 先按任务ID **合并日志**（同一任务粘了多行：老进度取**最早**那条、新进度与状态取**最新**那条），再**按任务表的天数分组**（`第1天` … `第7天` 按天数排；任务表里没有的落 `未标天数`）。
  - 一行一条（**不带任务ID**）：`1. 10-22 09:56 收集16000个道具：已收集 11417/16000，还差 4583`
  - 完成的那条：`1. 10-22 09:55 使用100个道具：已使用 100/100，已完成，可领取 积分 50 + 竹丝匣×1`
  - **时间点** = 这个任务日志里最新那条的「创建时间」，`sdClock()` 规整成 `MM-DD HH:MM`（认不出就原样）；**说法** = 一律「已{动词} 进度」（**句式只有这一种，别混写「进度 11417」**）：动词取任务描述开头（`SD_VERBS`：收集/获取/获得/使用/合成/登录/服务/进行/完成）→「已收集 11417」/「已使用 100」；认不出动词（任务表里没这套ID、或描述不是动词开头）一律回落成「**已进行** 11417」。**老进度不写进话术**（只留当前进度，避免「10797 → 11417」这种噪音）。
  - **完成判定** = `新状态 === '2'` **或** `新进度 >= 目标`（后台状态还没翻成 2、但进度已经满了，实际很常见，所以按「够目标」也算完成）。
  - **没完成** → `，还差 N`（`目标 - 新进度`，用**客户端进度**那个目标值）；没目标也没状态就说 `未完成` / `进行中`（按新状态）。
  - **奖励只在完成时写**（客服最常被问「能领什么」）：`可领取 积分 X + 道具×N`，道具ID 走 `itemNameMap`（`30701×1` → `竹丝匣×1`、`101×35` → `体力×35`）；表里 `×` / `+` / `*` 三种写法都认。
  - 任务表里没有的任务ID：名字回落成 `任务9999`（**不重复带括号 ID**），落「未标天数」，没有目标 / 奖励，但**句式照样统一**——`任务9999：已进行 2，未完成`；已完成时补一句 `可领取活动奖励`（具体奖励不知道，但这半句不缺）。
  - ⚠️ **两种写法的根因（2026-10 用户问「不同设备话术格式不一样」）**：不是版本/设备差异，而是**日志里的任务ID 在内置表里有没有**。紫色那页是 `2498 / 2508 / 2509…`（上一期 2486–2520 里有），另一页是 `2423 / 2428 / 2429…`（当期 2416–2450 里有）。用户当时说「先不加表，统一句式」，所以先把认不出的 ID 也统一成 `已进行 N，未完成` / `…，已完成，可领取活动奖励`；**随后（同一天）用户把 `2416`–`2450` 整张表贴了过来，已经并进 `SD_TASK_DEFAULT`**，于是那批 ID 现在也有「第几天 / 描述 / 目标 / 还差多少 / 可领取什么」。**两期都留着**（ID 不重复）：删掉旧的那期，之前存下的 `2498 / 2509…` 日志又会回落成「任务2498」。
  - 只粘任务表、没粘日志 → 退化成 `七日任务表 · 共 N 个任务` 清单（`sdBuildOverview`，只列不判；界面已只读，正常用不到）。
- **解析（`sdParseRows` + `sdSplitRow`）**：制表符优先；否则按逗号（吃全角 `，`、支持 `"…"` 引号）；再不然按空白拆。首行命中 ≥3 个中文表头词就当带表头（`SD_TASK_ALIASES` / `SD_LOG_ALIASES`，键是「去空白 + 小写」），否则按页面原列序（`SD_TASK_ORDER` / `SD_LOG_ORDER`）；**没有任务ID 的行跳过**。
- **抬头**：`#sdReportSub` = 口径 + 任务表/日志条数；`#sdReportMeta` 三格 = 任务表（**105 条**）/ 进度日志 / **活动排期**（取日志里的 `活动排期ID`）。
- **只存本机**：`localStorage['sevendayTaskState'] = { log }`（`sdSaveStateLater` 300ms 防抖）—— **只记日志，不记任务表**（表在代码里），老记录里的 `task` 字段读的时候直接忽略。**不进 `/api/data`**，跟 `careerData` / `feedbackTplState` 一个规矩。
- **测试**：`tools/smoke.cjs` 第 **8q** 节 **30 条**（**侧边栏已没有「七日任务」标签 + 页内分段能切到「七日任务进度」（话术生成那两块同时收起）** / 抬头 3 格 / **页面上已经没有任务表那一块**（`sdTaskFold` / `sdTaskInput` / `sdTaskSub` 全删）+ 抬头写「任务表 105 条（内置）」/ 粘用户给的真实 4 行日志 → 首行 `（活动排期 34） · 共 4 个任务` + 按天分组并排序（第4天 → 第7天）+ **`1. 10-22 09:55 使用100个道具：已使用 100/100，已完成，可领取 积分 50 + 竹丝匣×1`（且整段不含任务ID）** + **`10-22 09:56 收集16000个道具：已收集 11417/16000，还差 4583`** + 2514/2519 各算各的差多少 / **新状态还是 1 但够目标也算完成（2487 → 体力×35）** / 同一任务两条日志合成一句（只留最新进度 `100/100`） / 任务表没有的 `9999` 落「未标天数」、回落成 `任务9999` 但句式仍是 `已进行 2，未完成` / 认不出的 `9998` 完成时补 `可领取活动奖励` / 🧹 清空只清日志与结果、内置表照旧 / 本机只记 `log`、不再存 `task` / **全程 0 个请求** / 切走切回内容还在且仍停在七日任务那段 / 空结果复制只提示）；`tools/verify.mjs` 3l 另有 **10 条**静态断言（**并进话术生成页：`.seg-bar[data-for="tab-gen"]` 两段 + `#genSevendayPane` + 已无独立标签 + `statsSetSeg('tab-gen','reply')` 初始化**、那一段的容器按钮、主区只有日志、**页面上没有任务表那一块（`sdTaskFold` / `sdTaskInput` / `sdTaskSub` / `sdInitTaskTable` / `sdTaskResetBtn` / `sdClearTask` 都不存在）**、`SD_TASK_DEFAULT` 首尾行 + 解析直接用常量、解析三件套且「客户端进度」也认、**判定口径（合并日志 / 天数分组 / 还差 / 达成 / 可领取）**、奖励换道具名、只存本机且只记 log、三个按钮 + 日志防抖存档）。

## 海外业务统计（岗位周报整表粘贴）

**「🌏 海外业务统计」标签页**（`data-tab="overseas"` / `#tab-overseas`）——海外岗的岗位级统计：把《群维系+监控+海外工单+FB塔防周报》**整张表粘进来**，按天 / 按月算总量与逐项，并带详情图表。

- **数据模型**：`overseasBizData`（**只存本机 localStorage，键同名**）`= { rows: { '日期|人员': {date,name,shift,items,total,note,at} }, updatedAt, clearedAt }` —— **一行 = 某天某人**。
  - ⚠️⚠️ **这份数据只存在这台设备的浏览器里**（用户明确要求，2026-10 改的）：**不碰 `/api/data`、不碰服务端**，规矩跟 `careerData` 一样。原来走 `/api/data/overseasBizData` 三个人共用一份，**那一整套（`ovbizPushServer` / `ovbizSyncFromServer` / `ovbizManualSync` / `ovbizMergeData` / `ovbizRowSig` / `clearedAt` 挡旧行 / 「🔄 同步服务端」按钮）已整段删掉，别再捡回来** —— `verify.mjs` 3d 有断言锁死「代码里不出现这些名字」。换设备用「📊 导出CSV」再粘回来。
  - 服务端 `data.json` 里可能还留着历史的 `overseasBizData` 键，**已经没人读它**。
- **10 个统计项** `OVBIZ_ITEMS`（周报的列，**已按用户要求删掉「邮件+SDK（猫旅馆物语）」**）：异世界群维系 / （繁花+乐缤纷+梦幻）群维系 / 海外SSO工单量（全产品）/ 海外CP后台工单（全产品）/ 海外邮件（全产品）/ 海外FB（全产品）/ 商店回复 / SSO国内工单 / 监控禁言 / 监控封号。**独立于客服生涯的项表**（自己一套 key，两边互不影响）。
  - ⚠️ 「邮件+SDK（猫旅馆物语）」在**客服生涯**里还有一个同名项，那是 `CAREER_HIDDEN_ITEMS` 里**只存档、不计入统计**的列（登记表口径），跟这里的删除无关，**别一起删**。
  - ⚠️ 这里的「海外FB（全产品）」是**周报表里那一列**（一个数）；**日报侧（海外日报 → 客服生涯）2026-10 起已把 FB 拆成 `FB·梦幻` / `FB·月光` 两个字段、两项统计各自独立**，两个 tab 数据源不同，别互相套用。
  - ⚠️ 老表头里若还留着这一列，列名对不上就**整列忽略**（那几行的「总计」可能因此对不上 → 走下面的提示逻辑）。
- **解析**（`ovbizParse` + `ovbizSplitLine`）：**CSV 和 TSV 都吃**（含制表符按 TSV，否则按 CSV，支持 `"…"` 引号与 `""` 转义）；**表头按列名对齐、顺序随意**；比对前用 `careerNormHeader` 归一（去空白、全角括号→半角），并**去掉括号内容再匹配一次**（「海外SSO工单量（全产品）」和「海外SSO工单量」都认）。
  - ⚠️ **这份周报表头第一格写的是 `22` 而不是「日期」**，所以 `OVBIZ_COLUMNS['22'] = '@date'` 是必须的；日期复用 `careerParseDate`（`2026/1/1`、`2026-01-01`、Excel 序列号都行）；不带表头时按原列序（日期,人员,班次,10 项,总计,特殊问题）。
  - ⚠️ **懒加载**：`applyState()` 在初始化早期就会跑（那时本模块的 `const` 还在 TDZ），所以由 `ovbizEnsureLoaded()` 在首次用到时读一次**本机缓存**。**别把 `ovbizData = ovbizNormalize(ovbizLoadCache())` 塞回 `applyState`**（会 `ReferenceError: Cannot access 'OVBIZ_KEY' before initialization`，整个工作台初始化失败、冒烟直接红）。
- **合并规则**：key = `日期 + '|' + 人员` → 同一天同一个人**覆盖**、不同人保留（**同一天两个人同班是常态**，文件里 111 天都是两行）；**空白行自动跳过**（不计入「跳过」数）；「总计」与各项之和对不上时**提示一句并仍按各项之和入账**。
- **统计口径**（`ovbizStats`）：**先按天合计**（同日多人的项与总量相加，`names` 记当天都有谁）再算指标，跟客服生涯同一套公式 —— 累计 / 日均 / 中位数 / 最高单日+日期 / 最低单日 / 标准差+变异系数 / 最长连续+当前连续 / 记录区间+断档 / 近 7·30 记录日日均 / **μ+2σ 异常日**；另有**月度**（含逐项）、**周维度**（周一为起点，周环比 +「4 周前」同比代理）、**按人员**（记录天数/总量/日均/最高单日/占岗位比/结构条）、**逐项**（累计/占比/结构条 + Top3 集中度）、**每日明细**（日期/人员/总量/10 项/特殊问题，最新在上）。
- **图表**（2026-10 用户要求「海外业务也需要有详情的图表展示」）：
  - 岗位总览卡里的 **`#ovbizTrend`** 走势条：最近 30 个记录日的单日柱，**异常日涂红**（`.anomaly`）、备注命中 `OVBIZ_PEAK_RE`（`活动|版本|开服|更新|维护|上线|联动|新服`）的**涂橙**（`.peak`），图例跟客服生涯那张一样（`.career-legend`）。
  - 新增 **「🔎 详情图表」卡**（跟客服生涯的指标详情同构）：`#ovbizDetailItem`（全部工作量 + 10 项，`ovbizDetailOptions` 只建一次）+ `#ovbizDetailGrain`（按日 / 按月）→ `#ovbizDetailSummary` 5 张汇总卡（总量 / 日均 / 按日时中位数、按月时月均 / 最高 / 记录天数·月数）+ `#ovbizDetailChart` 柱状（按日只画最近 90 个记录日）+ `#ovbizDetailTable`（期间 / 合计 / 日均 / 占总量 + 合计行）。取值走 `ovbizDetailValue(day, sel)`（`all` = 当天总量，其余 = `day.items[key]`）。
  - ⚠️ 图表与表格都建立在**按天合计**后的 `s.days` 上（跟卡片口径一致）；某一期该项是 0 就跳过。
  - ⚠️ **`ovbizRender()` 末尾会调 `renderOvbizDetail()`**（导入 / 清空 / 切标签页都会一起刷新），两个下拉各自绑了 `change`。
  - ⚠️ 备注判橙用的是新加的 **`OVBIZ_PEAK_RE`**（客服生涯那个 `PEAK_RE` 是 `renderCareer` 里的局部 const，拿不到，别混用）。
- **📌 只导入新日期（增量导入，2026-10 用户要求）**：`ovbizImportNew()` —— 同样吃粘贴框里的整表，但**本机已经有那个日期的行就整段跳过**（不覆盖、不重复），提示写「增量导入 N 行（新增 M 天）· 跳过 K 行」；一天都没有新的时提示「没有新日期可导入（最新数据到 YYYY-MM-DD）」。状态行 `#ovbizSyncHint` 多一片「最新数据到 YYYY-MM-DD」（`ovbizLastDate()`）。
- **落盘/导出**：`📥 解析导入`（`ovbizImport`，**只写本机缓存 `ovbizSaveCache()`**）、`📊 导出CSV`（`ovbizCsvText`，带 BOM + 表头，导出的文件能再粘回来）、`🧹 清空本机数据`（`ovbizClearAll`，只清本机，confirm 文案已改成「只影响本机」）。报表抬头 `#ovbizReportSub` / `#ovbizReportMeta`；状态行 `#ovbizSyncHint`（文案：只存在这台设备的浏览器里 / 不上传服务端 / 换设备用导出CSV）。
- **真实数据对账**（用户给的这份周报，402 行原始数据）：解析出 **392 行 / 271 天**（10 行空白跳过），**1 行总计对不上**（2026/8/14 陈智锋，表里 92、各项之和 91）→ 提示并按 91 入账；**累计 40,685**、日均 150.1、中位数 143、最高单日 623@2026-04-11、异常 8 天（最高 2026-04-11 的 8.2σ）；三人 温泽鸿 156 天/17,444（42.9%）、陈智锋 152 天/17,436（42.9%）、姚宏杰 84 天/5,805（14.3%）；月度 9 个月、周 40 周。⚠️ 这是**删「邮件+SDK」之前**的数字（那一列原本全是 0，所以口径不变）。
- **测试**：`tools/smoke.cjs` 第 **8g** 节 **30 条**（乱序表头 + 同一天两行 → 3 行入账 / 2 天 / 单行 85+67 按各项之和 / 累计 277 / 最高单日 152 / 每日表带人员与备注 / 人员表 2 人 / **逐项 10 行合计 277 且不含「邮件+SDK」** / 月度 2 行 / 抬头 5 格 / **导入与清空全程一次请求都不发、服务端自始至终没有这份数据、同步按钮已删** / 状态行与汇总行都讲「只存在这台设备」/ 切标签页只重画 / 走势条 2 根且带「活动」的备注涂橙 / **详情图表：可选 11 个范围、默认全部 5 张汇总卡 277、柱 2 根、切按月 → 月均、切「监控禁言」→ 总量 31** / 重复导入覆盖不翻倍 / 总计对不上提示 / 清空 → 本机归零且不发请求）；`tools/verify.mjs` 另有 11 条静态断言（标签页、10 项、**没有「邮件+SDK」**、CSV+TSV+「22」表头、**只存本机**（断言里不存在 saveData / GET / 并集那一套）、懒加载、按天合计+周+异常线、15 个容器、**详情图表实现**、走势条上色、按钮与刷新挂载）。

## 下午茶投票（跨设备 · ⚠️ 走服务端）

**「🧋 下午茶」标签页**（`data-tab="tea"` / `#tab-tea`，侧边栏在「海外业务统计」下面）—— 统计「今天点哪家奶茶」，**每台设备自己投一票、结果合在一起**，还能把**只投票的链接**发群里让手机直接点开投。

- ⚠️⚠️ **这是唯一一份「必须走服务端」的业务数据**（跟 `careerData` / `overseasBizData` 只存本机**相反**）：要的就是跨设备统计。别把它改成只存本机。
- **数据（服务端 `data.json`）**：
  - **`teaShops`** = `{ shops: [{ id, name }], updatedAt }` —— 预设店家（**用户明确说：只存店家、不做菜单/单品；后来又说「备注不用了」**，所以现在**只有店名**，界面上没有备注输入框/列）。谁都能增删改，带「复制店家 JSON / 粘贴导入」兜底（导入也吃 `["蜜雪冰城", …]` 这种纯店名数组）。
    - ⚠️⚠️ **店家永远不随投票一起清**（用户明确要求）：23:00 清的只是 `teaPoll_*`，`teaShops` 原样保留；「🧹 清空票」也只动当天那份投票。
    - 除了服务端那份，**本机另存一份备份 `localStorage['teaShopsCache']`**（`teaSaveShopsCache` / `teaLoadShopsCache`）：`teaLoadShops` 发现**服务端一家店家都没有**而本机备份还在时，**自动用备份恢复并推回服务端**（Render 重新部署会丢 `data.json`），提示「已用本机备份恢复 N 家」。⚠️ 只有「服务端空 + 备份非空」才恢复 —— 用户主动删光店家（保存时缓存也一起清空）不会被复活。
  - **`teaPoll_YYYYMMDD`** = `{ id, date:'YYYY-MM-DD', title, status:'open'|'closed', deadline:'HH:MM'|'', shopIds, shopNames:{id,name}, createdAt, updatedAt, closedAt, votes:{ voterId: { voterId, shopIds, at, updatedAt } } }` —— **一天一份**（key 里带日期）。⚠️ **投票里存 `shopNames` 名字快照**，所以以后改名/删店不影响历史票的显示（`teaShopName()` 找不到就回落到快照）。⚠️ `deadline` 是**北京时间的「HH:MM」**（前端 `type="time"` 输入，可空 = 不按时间截止、到 23:00 才结束）。
  - **本机（localStorage，不上服务端）**：`teaVoterId`（`v-xxxx`，**一台设备一票**，再投=覆盖自己那条）；`teaPollCache`（结果离线兜底展示）。⚠️ **不存投票人姓名**（用户要求「只看数量」）。
- **服务端两个端点**（`server.js`，都是新增的，没动 `/api/data` 的语义）：
  - `GET /api/vote/:key` → `{ value, expired, closed, closedReason }`，**顺手清理过期的**（删除 `data[key]`）；`closedReason` = `''`（还能投）/ `'manual'`（发起人手动截止）/ `'deadline'`（到截止时间了）。
  - `POST /api/vote/:key`（body `{ voterId, shopIds }`）→ **原子合并**：只写 `votes[voterId]` 那一条，返回合并后的整份。
    - ⚠️ **为什么不能让前端直接 POST `/api/data/teaPoll_…`**：两台设备同时提交时后写的会整份覆盖前一份 → **丢票**。`readData/writeData` 是同步的、Node 单线程，所以这个端点里读改写不会互相覆盖。
    - 校验：key 必须 `^teaPoll_\d{8}$`、`voterId` 必须 `^[A-Za-z0-9_-]{1,64}$`、`shopIds` 必须是数组（≤50、去重）；投票不存在 → 404、已截止/已到截止时间 → 409、已过期 → 410。
  - 发起 / 截止 / 清空 / 改店家仍是发起人**用普通 `/api/data/:key` 整份写**（`saveData`，低并发）。
- ⏰ **可设截止时间（用户要求：截止后只展示结果、不能继续投，直到 23:00 才清除）**：`poll.deadline` = **北京时间的 `'HH:MM'`**（前端 `type="time"` 输入，可空 = 不按时间截止）。
  - 判定函数：服务端 `voteClosedReason(poll)` / 前端 `teaClosedReason(poll)` —— `status==='closed'` → `'manual'`；`deadline` 合法且「北京时间当前 `HH:MM` ≥ deadline」→ `'deadline'`（`'HH:MM'` 的字典序就是时刻序，所以直接字符串比较）；格式不对的 deadline **当没设**（不误锁）。
  - 到点后：**服务端 409 拒写**（`closedReason:'deadline'`，错误文案带 `HH:MM 截止`），**数据一条不动**；前端把 **`#teaVoteOpenBox`（多选片 + 提交/撤销）整块收起来**，露出 `#teaVoteClosed` 的说明「🔒 已在 HH:MM 截止 —— 现在只能看下面的「📊 实时结果」…」，`#teaResultMeta` 也补一句「结果保留到 23:00」。**只投票页（`?vote=`）同样会收起**，手机上打开就是「只看结果」。
  - 发起时**填了已经过去的时间会被拦下**（提示「已经过了，换个晚点的时间或留空」），否则一发就是「已截止」。**把截止时间改回未到点就能继续投**（数据从没被删，`发起 / 更新` 按钮可以直接改 deadline）。
  - ⚠️ 别把「到点」写成删数据：**23:00 才由 `isVoteExpired` 惰性删除**，到点只是「只读」。
- ⚠️ **按天作废（用户要求：到当天 23 点就清除、不保留）**：`isVoteExpired(poll)` = 北京时间的 `poll.date` 那天过了 **23:00**（或日期早于今天）→ 真；GET/POST 命中时**把 `data[key]` 删掉**再返回 `expired`/410。「谁访问谁触发」的**惰性清理**（Render 免费实例会休眠，常驻定时器不可靠）。前端同一口径：`teaAfter23()` 提示「今天已过 23:00」，状态行也写明「当天 23:00 自动清除」。
- **页面**（现在只有两块 + 一个折叠的店家管理，用户说「界面有点乱」后收干净了）：
  1. **🧋 今天的下午茶**（主卡）：上面是 **我要投**（多选店家片 + 提交 / 撤销 / `#teaVoteHint`）→ 到点或手动截止就整块收起、换成 `#teaVoteClosed` 的说明；下面是虚线分隔的 **`#teaPollAdminBox`「发起 / 管理」**（勾今天开哪几家 → `teaStartPoll()` 写 `teaPoll_<今天>`；标题 + 截止时间 `#teaPollDeadline`（`type="time"`）；「🚀 发起 / 更新」「⏹️ 截止」「🧹 清空票」；分享行 `#teaPollShareInput` + 复制链接 / 复制分享文案）；末尾 `#teaPollStatus` 状态行写「进行中（15:30 截止，还有 42 分钟）」或「已在 15:30 截止（只展示结果）」。⚠️ **只投票页藏的是 `#teaPollAdminBox`（这一块），我要投那块照常留着**。
  2. **📊 实时结果**：只按店家统计票数 + 占比（分母是投票设备数）+ 结构条 + 「最热」标记；`teaResultText()` 可复制成纯文本贴群。**不显示谁投了什么**。
  3. **🍵 预设店家**（`<details class="card tea-shop-card" id="teaShopCard">`，**默认收起**，标题上带「（N 家）」）：表格（店家 / 操作；**没有备注列**）+ 店名输入框 + 「＋ 添加」+ 复制店家 JSON / 粘贴导入；编辑时把店名读进输入框，再点添加 = 原地更新（`teaShopEditId`）。店名重复不再有备注可区分，删店仍有 confirm。
- **分享链接 → 只投票页**：链接形如 `https://work-bad.onrender.com/?vote=teaPoll_20261002`（用 **query 参数**，不用给 server 加路由，`express.static` 直接托管）。
  - 启动最早期算 `TEA_VOTE_ONLY`（`URLSearchParams(location.search).get('vote')` 匹配 `^teaPoll_\d{8}$`）→ 给 `<html>` 打 **`data-vote-only="1"`**，CSS 把 `.tabs`（侧边栏）/`#teaShopCard`/`#teaPollAdminBox`/`#teaReportHead` 都 `display:none`，只留投票页（单列、大按钮，手机友好）。
  - 同时**跳过** `bootstrapData()` 那 9 个请求（`if (!TEA_VOTE_ONLY) (async function bootstrapData() { … })();`）—— 手机上打开更快；并把 `teaPollKey` 设成链接里那一天（不是「今天」）。
  - ⚠️ 只投票页里 `teaPollKey` 用链接里的 key，别的设备打开旧链接会拿到 `expired` → 页面显示「这次投票已经作废并清除了」。
- **测试**：`tools/smoke.cjs` 第 **8j** 节（**47 条**）：店家存服务端（**只有店名、不再写备注**）+ **店家管理是默认收起的 `<details>`、标题带家数** + **本机备份 `teaShopsCache`** + **服务端店家被清空时用备份自动恢复并推回去** + **投票被 23:00 清掉后店家原样还在** / 发起 today 的投票 + 名字快照与默认标题 / 分享链接格式 / 复制分享文案 / 第一次投票生成 voterId / **投票走 `/api/vote` 服务端合并** / 结果按店家计数且**不出现人名** / 另一台设备投票合并进同一份 / 改票覆盖不翻倍 / 撤销 / 复制结果 / 手动截止后 409 挡住 / 过期 GET 连数据删掉 / 状态行讲 23:00 清除；**截止时间 12 条**（`type=time` / 存进 `deadline` / 状态行写「HH:MM 截止」/ 过了的时间不让发起 / **到点后投票区收起 + 只留说明 + 数据还在 + 结果照常** / 到点后前端挡下不发请求 / 绕开前端直接 POST → 服务端 409 `closedReason:'deadline'` / 改回未到点又能投 / 手动截止也是「只能看结果」）；**另起一个 jsdom**（URL 带 `?vote=`）验 `data-vote-only` / 侧边栏与店家管理被藏 / **没发那 9 个启动请求** / 能选店能投 / 与自己 voterId 不同 / 两台设备统计在一起 / **到点后只投票页也收起投票区且点提交不发请求**。`tools/smoke-server.cjs` 另有 **23 条**（合并语义、改票、非法 voterId/shopIds/key、404/409/410、**过期投票被真的从 data.json 删掉**、当天 23:00 前不误删、**deadline 到点前后各一遍 + `closed/closedReason` + 格式不对的 deadline 忽略**）。`tools/verify.mjs` 3g 有 15 条静态断言（含「备注整段拿掉 + 店家折叠 + 本机备份/自动恢复」两条）。
  - ⚠️ 冒烟里的 fetch mock（`makeFetchMock(store, log)`）**照着真服务端实现了 `/api/vote` 的合并与过期清理**，两个 jsdom 共用同一个 `serverData` 来模拟「两台设备连同一个服务端」—— 改服务端语义时这里要一起改。

## 🎊 吉运节节高 → 话术（`#teaInfoCard` · 反推 GM 玩家页，2026-10）

⚠️⚠️ **这里的「下午茶」是游戏内活动「吉运节节高」在 GM 后台的显示名，跟「🧋 下午茶投票」那一页毫无关系**（用户明确纠正过：「这个下午茶和原来的下午茶投票不是一个东西」）。所以这块**挂在「话术生成」页的第三段**（`.seg-bar[data-for="tab-gen"]` 的 `03 吉运节节高（下午茶）`，`#genTeaInfoPane` + `data-seg-card="teainfo"`，紧跟在 `02 七日任务进度` 后面），**不在 `#tab-tea` 里**（`verify.mjs` 3g-2 有反向断言：下午茶投票那一段里不该出现 `teaInfoCard` / 「吉运节节高」）。

用户给的 GM 玩家页快照（`Summer.html`）里，「礼品」下拉下有一个 **`gift/afternoonTeaInfo/<playerId>`「下午茶信息展示」** 页，正文就是一块 **「玩家下午茶信息」**（游戏内活动名是 **「吉运节节高」**，来源映射里对应 `245 下午茶礼包购买` / `246 下午茶礼包免费领取`）。用户要求：**照着这块反推，加一个话术生成功能**。

- **GM 那块长什么样**（原样摘下来，别臆造字段）：
  - 抬头 `玩家下午茶信息（固定 6 层，绿色奖励表示已抽取）`；Redis 里没有进度时会多一句 `Redis 中没有该玩家的下午茶抽取进度，以下仅展示反查到的 6 层奖励配置。`
  - 摘要表 4 组：**下午茶档位** `configId=15 / groupId=3803`（最近一条下午茶触发记录）· **当前层**（数字或 `-`）· **是否有抽奖次数** `是（2 次）` / `否（0 次）` · **大奖** `已抽取` / `未抽取`。
  - 6 个层块（DOM 顺序是 **第 6 → 第 1 层**）：`第 N 层` + 状态（`未解锁` / `已解锁`）+ `商品 380306 / 价格 0 / 已抽 0/1` + 若干奖励盒：`<strong>名字</strong> × 数量` + `ID xxx / 奖励位 n`（可能带 `升层奖励`），**已抽取的盒子挂 `.is-drawn`（绿色）**。
- **界面**：卡 `#teaInfoCard`「🎊 吉运节节高 → 话术」——粘贴框 `#teaInfoInput` + 「🔍 解析并生成话术」`#teaInfoParseBtn` / 「📋 复制话术」`#teaInfoCopyBtn` / 「🧹 清空」`#teaInfoClearBtn` + 提示 `#teaInfoHint` + 汇总芯片 `#teaInfoSummary` + 分层展示 `#teaLayerBox` + 话术框 `#teaInfoOut`（只读）。整块包在 `#genTeaInfoPane`（`data-seg-card="teainfo"`）里，靠分段条切；**只投票页不用管它**（它根本不在那页）。
- **解析**（`teaInfoPrep` / `teaInfoParse` / `teaInfoLabel`，`public/index.html` 里的 `TEA_INFO_MAX = 200000`）：
  - **纯文本、网页源码都能贴**：源码里先把 `.afternoon-tea-reward.is-drawn` 的盒子标成「已抽取」再剥标签（`teaInfoPrep`），所以「哪些奖励已经抽到」认得出来。
  - 归一化后压成一行，按 `第 N 层` 切开（`src.split(/第\s*(\d+)\s*层/)`，**层号排序成 1→6**）；每层用 `商品 x / 价格 y / 已抽 a/b` 与 **`× 数量 ID id / 奖励位 n [已抽取][升层奖励]`** 抓奖励（奖励名 = 上一段尾巴，剥掉「未解锁/已解锁」「商品…」前缀）。
  - ⚠️ **源码版的「已抽取」标在整条奖励盒后面**（在下一个奖励名前面）→ 解析时把它算回**上一条**（`trailDrawn`），否则「已抽到」会整体错位一条。
  - 奖励名：GM 页有时只写 `道具 2000029`，`teaInfoLabel()` 会拿 `itemNameMap[id]` 换成真名（认识就换，不认识照原样）；**`2000049` 用户指定先写作「随机奖励宝箱」**（`TEA_ITEM_ALIAS`，加进物品名表后可以删这条别名）。
- **话术**（`teaInfoScript`）—— **用户给的模板，别自己改句式**：
  ```
  【下午茶 · 吉运节节高】
  核实该活动目前您共获得了 X 次抽奖次数，已使用了 X 次抽奖。
  抽到了第 X 层的…，第 X 层还未解锁 / 已获得第 6 层的最终大奖。
  ```
  - **次数怎么来**（`teaInfoUsage`）：**已使用 = 各层「已抽 a」加起来**；**剩余 = GM 的「是否有抽奖次数 N 次」**；**共获得 = 已使用 + 剩余**（GM 没显示剩余时才退回「当前层及以前各层上限之和」兜底）。面板上那一片芯片也写「抽奖 已用 X / 共 Y 次（剩 Z）」。
  - 「抽到了第 X 层的…」= **本层已经抽到的奖励**（按 `.is-drawn` 列，`名字 ×数量` 用顿号连）；**本层还没抽到就退成「（目前已抽到：…）」**（全文已抽到的），一条都没有就写「（本层还没抽到奖励）」。
  - 结尾二选一：**大奖已抽取**（GM 的「大奖 = 已抽取」）→ `，已获得第 <最大层> 层的最终大奖。`；否则 → `，第 <下一个未解锁层> 层还未解锁。`（后面没有层了就写「本层奖励还能继续抽」）。
  - ⚠️ **不写价格**（内部价，`价格` 只在解析时读、面板和话术都不展示）；**奖励数量一律按粘进来的数据走**，不同玩家可能不一样，别写死。
  - ⚠️ **`当前层 = -` 或 Redis 里没进度时走另一条分支**：`这边没查到您有下午茶（吉运节节高）的抽取记录～` + `麻烦发一下角色ID + 区服（有截图更好）…`，**别瞎报层数**。
- **只在本机**：纯前端解析，**不写 `/api/data`、也不改 `teaShops` / `teaPoll_*`**（跟别的粘贴解析一个规矩）；页面上不持久化，清空就没了。
- **测试**：`tools/smoke.cjs` 第 **8y** 节 **14 条**（第三段按钮在、切过去只有这段亮 / **下午茶投票页里没有这块** / 卡片与按钮齐全 / 粘一整块认出档位·当前层·次数·大奖·层数 / 当前层那格高亮 / 升层奖励单独标 / **道具代码按映射换人话（2000049 → 随机奖励宝箱）+ 数量照数据走** / **话术就是用户模板那两句、且不含价格** / 纯文本里的「已抽取」标灰并写进「抽到了第 X 层的…」 / **大奖已抽取 → 换成「已获得最终大奖」** / **贴源码认 is-drawn 不串到下一条** / 没进度时改「没查到记录」/ 空输入只提示 / 清空全清 / 全程 0 请求）；`tools/verify.mjs` 3g-2（6 条）+ 3l（分段条现在三段）有静态断言。

## 🎮 游戏数据（`data-tab="gamedata"` · 粘 MergeState，2026-10）

用户：「1 和 2 弄成游戏数据功能，将棋盘镜像作为独立的标签页加在这个功能里，粘贴后同步核对镜像」——把 MergeState 的刚需（**资源核对**）做成一个页面，棋盘镜像当它的第 02 段放进来；**活动进度（原 02 段）2026-10 按用户要求整块删掉**。

- **位置**：侧边栏 **「梦幻消除站」组**里的第三个子项 **「游戏数据」**（`data-tab="gamedata"` / `#tab-gamedata`，`tab-btn-sub`，**不带图标**），排在 `话术生成` / `集卡分析` 后面。页内两段：`01 资源核对`（默认）/ `02 棋盘镜像`（`.seg-bar[data-for="tab-gamedata"]` + `data-seg-card="resource|mirror"`；活动进度 2026-10 按用户要求删了；`bindSegBar` 末尾 `statsSetSeg('tab-gamedata', 'resource')` 初始化）。
- **🔁 万能粘贴 · 一个框就够（2026-10 用户：「操作过于复杂繁琐了，实际会影响工作效率」）**：原来要分别找三个框贴三种数据（页头 MergeState / 03 段的镜像 / 资源核对里的操作记录），现在**任一框贴任何一份都认** —— `gdJsonOf()` 先认 JSON（带前缀 / 只截了 `{…}` 或 `[…] ` 也认），`gdDetectKind()` 判是哪份（有 `others|hpData|diamond|gold` = MergeState；有 `chessboardDataList|warehouseData|backpack|currencies` = 棋盘镜像；数组里带 `op|sTime` = 操作记录），然后 `mergeRun` / `boardRun` / `mergeOpRun` **互相转交**（贴错框会自己跳到对的地方，并在提示里说一句「认出来是…→ 已解析到…」）。
  - **粘完自动解析**：三个框都挂了 `input` 监听，停手 400ms 就 `gdAutoFrom()` 跑一遍（认不出就安静不动），**不用点按钮**；按钮留着是给「想立刻跑一次」和测试用的。
  - ⚠️ 三个 `Run` 的签名是 `(rawArg)`，**只认字符串参数**：`setClick` 会把 click 事件当第一个参数传进来，写成 `String(rawArg)` 会把事件对象变成 `[object MouseEvent]` 导致整页解析全挂（踩过一次）。
- **① 粘贴数据（一个框就够）**（`#mergeInput` + `#mergeParseBtn` / `#mergeClearBtn`，提示 `#mergeHint`）：就是 GM 玩家页那块**存档快照**，整段贴。汇总芯片 `#mergeSummary`（红宝石 / 铜钱 / 体力 / **今日体力 −N / 今日钻石 −N** / **资源 N · 活动 M**）+ 对账行 `#mergeDiff`；抬头 `#gdReportSub` / `#gdReportMeta` 也跟着填。⚠️ 2026-10 用户说「数据展示的有点乱，优化一下」之后：存档 ID 从芯片挪进抬头副标、芯片从 8 片精简到 6 片、粘贴框从 6 行收到 4 行。
  - **解析**（`mergeParse`）：`diamond|recordDiamond` / `gold|recordGold` / `hpData|recordHp` / `recordID` / `syncTime` / `others`。⚠️ **`others` 是「字符串套字符串」，个别还三层**（`resource` / `meta` / `activities[].extra` / `activity_task_progress[].tasks` / `completeGuides` / `gifts`），统一用 `mergeJson(v, dflt)` 一层层剥。
  - **`resource[]`**（`id / num / timestamp`）= **每个道具的当前数量 + 最后一次变动时间**，按数量降序，`mergeTsText()` 把时间戳格式化成 `YYYY-MM-DD HH:MM`（**北京时间 UTC+8**，见下「时间口径」）。
  - **`meta[]`**（`name / value / extra`）里取两条做「当日消耗」：`daily_board_energy_stat.extra` = **今日体力消耗**、`daily_diamond_consume_stat.extra` = **今日钻石消耗**（`mergeDailyUsage`）。
  - **`activities[]`**（`name` + `extra` 里套 JSON）= 60+ 个活动的 `id` / `State_Recorded_*` / 进度值；**`MERGE_ACTIVITY_LABELS`** 把英文名换成中文（七日任务 / 通行证（本期）/ 签到奖励 / 限购补给 / 体力排行榜 / 茶楼竞速 / 大亨赛 / 集卡 / 怪棋挑战 / 风筝 / 花园… 认不出显示原名）。
  - `activity_task_progress[]` = 活动任务进度（`taskId / status / progress`，**status=2 算已完成**，跟七日任务那套口径一致）。
- **② 资源核对**（`.card[data-seg-card="resource"]`）：**查询区在最上面**（`#gdItemInput` 道具名或 id、回车也行 + `#gdItemBtn` / `#gdItemCopyBtn` + `#gdItemOut`），**明细表收进 `<details class="stat-fold">` 里默认收起**（`#gdResTable`，三列「道具 / 数量 / 最后变动」）。⚠️ **表里只列「数量 > 0」的**，0 的记录折成一行说明放在 `#gdResCount`（「有数量 4 项 · 其余 1 项是 0」）—— 真实存档里一半资源都是 0，全列出来很乱。
  - 话术（`mergeItemScript`）：
    ```
    【游戏数据 · 红宝石（103）】
    当前数量：911
    最后变动：2026-10-29 10:50
    今日钻石消耗：10
    棋盘镜像：棋盘上 0 个、临时背包 0 个、仓库 0 个。
    ```
    查 `101` 时写「今日体力消耗」（298），查 `103` 时写「今日钻石消耗」；棋盘镜像那行只在镜像已解析时才有；查不到直说 `玩家数据里没找到「…」这个道具`。
  - **🧠 思维导图（2026-10 用户：「资源核对也不够直观，有类似思维导图一样的会好点」）**：查完道具后 `#gdItemMap` 画一张导图 —— 左边根节点 =「道具名 / id / 存档数量」，右边一条竖干线（`.gd-map-branches::before`）挂 **5 个分支**：**存档**（当前数量 + 最后变动）/ **棋盘镜像**（棋盘上 · 临时背包 · 仓库）/ **订单**（当前订单收走 · 最近一次操作收走 · 操作记录里的订单快照）/ **操作记录**（N 条 · 被消耗或获得多少）/ **结论**（一句话：有消耗记录 → 不是被吞 / 玩家说的时间之后没再变过 / 那个时段确实变过 / 资料不足要研发拉流水）。
    - 连接线全是 `::before` 画的，**不用 SVG**；≤760px 自动竖排；配色 `is-ok` 黄淡底（有明确答案）/ `is-warn` 橙边（要人看）/ `is-mute` 灰（还没数据）。
    - 没查道具 / 清空 / 查不到名字时整块收起（`display:none`），不占版面；**导图只给「看一眼的结论」**，下面那排判定芯片 + 话术文本框照旧（复制仍走话术，别让客服照着图手抄）。
    - 函数：`mergeItemMap(id, rec)` 出 HTML、`mergeItemMapRender(id, rec)` 管显隐、`mergeItemConclusion(id, rec)` 出那句结论、`gdMapNodeHtml(cls, title, text)` 一个分支。⚠️ 样式写在 `<style>` 里「圆润层」**前面**（圆润层必须仍是最后一段）。
  - **🔎 异常自查（「道具被系统吞了？」· 2026-10 融进这一张卡，不单开页面）**：话术末尾固定追加一段 `—— 异常自查 ——`（`mergeSelfCheckLines`），并且判定结果同时画成芯片 `#gdItemVerdict`（`mergeItemVerdict`）。四条证据链：
    1. **时间点**：输入框 `#gdItemTime`（`type="datetime-local"`，可选，改了就自动重算）—— `mergeTimeToEpoch()` 按**北京时间**解释（`Date.UTC(...) - 8*3600`）后跟 `resource[id].timestamp` 比：**最后变动早于玩家说的时间 → 「那之后它没再变过，不是那时候被吞的」**（芯片 `k-accent`）；**不早于 → 「那个时段确实变过，继续看下面」**（`k-warn`）。
    2. **订单消耗**：`mergeConsumeHits(id)` 查**棋盘镜像那份 JSON** 里的 `orderData.orderDojoMap[].consume` 和 `lastInstruction.orderDojosStr[].consume` —— 命中就写「在 N 个当前订单的消耗里（订单 id 收 M 个）」，`lastInstruction` 里命中还会带上**时间 + 消耗量 + 对方给了什么奖励**（`rewards`，名字查物品名表）。
    3. **记录值 vs 当前值**：货币（101 体力 / 102 铜钱 / 103 红宝石）比对 `recordGold|recordHp|recordDiamond` 与当前值，**不一致就写「直接提研发查存档落库」**。
    4. **能力边界**：没贴操作记录时写「存档里只有最后变动时间、没有变动量和操作来源 —— 被吞要定责得让研发查服务端流水」；**贴了操作记录就改成「覆盖不到的时段仍要研发拉全量流水」**（见下「🔎 操作记录」）。**无论哪种，都别在话术里替玩家下「系统吞了」的结论**。
    - ⚠️ 镜像没解析时第 2 条退化成「切到「03 棋盘镜像」粘一份就能对」；道具在镜像里还有（棋盘/背包/仓库）时芯片会多一片「镜像里还在 N 个」。
    - ⚠️ **时间口径：一律北京时间（UTC+8）**。数据里的 `sTime` / `timestamp` / `syncTime` 是**秒级 unix 时间戳**，但游戏服务器写出来的时间串（订单 `createTime`、GM 玩家页上看到的）是 **UTC+8** —— 2026-10 用真实数据核过：`sTime=1793241739` 那条记录，对应订单的 `createTime` 正好是「2026-10-29 10:42:19」。所以 `mergeTsText()` 显示时 **+8 小时**，`#gdItemTime` 用 `Date.UTC(...)-8*3600` 还原成时间戳后再比。**原来按 UTC 显示会整体早 8 小时**（2026-10 已修，`verify.mjs` 锁着 `(n + 8 * 3600) * 1000` 与 `- 8 * 3600` 两处，别再改回去）。
- **🔎 操作记录（opRecord → 「那次变动到底干了什么」，2026-10 用户贴了一份真实数组：「如果加上这个数据呢」）**：
  - **它补的是另一半**：MergeState 的 `resource[].timestamp` 只说「最后一次变动是什么时候」，操作记录说「那次变动是**合并 / 交订单 / 母体产出 / 解锁格子**」—— 这是把「被吞」定责往前提一步的**唯一本机证据**。
  - **入口**：仍挂在 `01 资源核对` 这张卡里，明细表下面一块 `<details class="stat-fold">操作记录`（`#gdOpInput` + `#gdOpBtn` / `#gdOpClearBtn` + `#gdOpHint` / `#gdOpSummary` / `#gdOpTable`）；**用户贴的是纯数组，也接受「某个对象里套着这个数组」**（`mergeOpRowsOf()` 递归找带 `op`/`sTime` 的那组）。
  - **字段口径（照真实数据认的，不是官方文档）**：`op` 操作码 / `opId` 序号 / `sTime` **秒级 unix 时间戳** / `cbId` 棋盘 / `cellIdx` `cellIdies[]` 格子 / `goodsId` `momGoodsId` `childNum` 棋子 / `consume[]` `rewards[]`（`{goodsId, num}`）/ `orderDojosStr` 订单快照（`from: "ChessboardInitialize"`）。
  - **op 码 → 中文（`MERGE_OP_LABELS`，按「这条记录带了哪些字段」推断，别当官方定义写进对外话术）**：`30` 棋盘操作 / `201` 母体产出（`momGoodsId` + `childNum`）/ `281` 棋子合并（`cellIdies` 两格 → 一个结果）/ `701` 格子解锁（`cellIdx` + `isByBuy` + `diamondAdd`）/ `1030` 订单初始化（带 `orderDojosStr`）。认不出的写「操作 N」，**绝不猜**。
  - **命中分四类**：`mergeOpHits(id)` 管行内（① 被消耗 = `consume` 里有它 ② 被获得 = `rewards` 里有它 ③ 作为棋子出现 = `goodsId`/`momGoodsId`），`mergeOpOrderHits(id)` 管订单里（④ 订单收走 / 订单奖励给过，带订单号 + `createTime`）。
  - **话术里那一段**（`mergeOpLines`，接在 `—— 异常自查 ——` 后面）：
    ```
      —— 操作记录（5 条）——
      · 覆盖时间：2026-10-29 10:42 ~ 2026-10-29 10:42
      · 被消耗 1 次、共 1 个：2026-10-29 10:42 订单初始化（op 1030） 收 1 个
      · 订单收走 1 单、共 1 个：订单 5126362062 收 1 个（2026-10-26 10:37:09）
    ```
    另有三条按需出现：`获得 N 次、共 X 个` / `作为棋子参与合成 / 被产出 N 次（格 a/b）` / `订单奖励里给过`；填了 `#gdItemTime` 还会写「玩家说的时间之后动过它 N 次 / 一条都没动过它」。
  - **判定芯片**多两片：「操作记录里被消耗 X 个：不是被吞」（行内没有但订单有 → 「操作记录里被订单收走 X 个：不是被吞」）、「记录里订单奖励给过 X 个」。**有流水就能直接答「不是被吞，是交订单 / 合成吃了」**，不用让玩家等研发。
  - **表格**（`#gdOpTable`）：时间 / 操作 / 消耗 / 获得 / 格子；订单里的数量也并进「消耗 / 获得」两列（前缀「订单」）；**有查询词时只列跟那个道具有关的行**，否则按时间倒序列最近 100 条；类型芯片按 op 归类（前 5 种，带 `op` 号）。
  - ⚠️ **只在本机内存**（`opModel`），不写 `/api/data`、不落 localStorage；`#mergeClearBtn` 的「清空」会把操作记录一起复位。
  - **💧 资源流水对账（2026-10 同事反馈「查询对比的流程很难懂，数据太晕了」→ 直接按他们实际用的口径判）**：块是 `#gdFlowBox`（提示 + `#gdFlowChips` 结论芯片 + `#gdFlowTable` 流水表）。
    - **口径（用户原话，写进「已定语义 4」）**：看**获得某个东西的 +数量**之后，有没有一条**棋盘上传**把**相同数量**扣掉 —— `+100 体力` 后面跟着 `-100 棋盘上传`（**或者 -99**，差 1 也算）就是「被吞」的样子；来源不是「棋盘上传」的扣除**不算**。
    - **数据从哪来**：还是页头那个万能粘贴框 —— 贴的是**资源流水文本**（制表符分隔，跟「智能解析」那份一样：`时间⇥流水号⇥道具⇥+100⇥之前⇥之后⇥来源⇥分类`），`gdLooksFlow()` 认出来后走 `gdFlowRun()`。不用另找地方贴。
    - **解析**（`gdFlowParse`）：变化量那列**不写死位置**，从第 3 列起找「带正负号的整数 且 后面紧跟两个数字（之前 / 之后）」，所以老格式（变化量在第 4 列）和新格式（第 7 列）都认；来源取「变化量 +3」那列（id 形式就查 `DEFAULT_SOURCE_ID_MAP`，`16` = 棋盘上传）。时间**原样字符串**，不换算时区。
    - **配对**（`gdFlowPairs`）：按时间正序，每条「获得」往后找**最近的**一条未用过的棋盘上传扣除，`|扣除| === N` 或 `N - 1` 就算对上；一条扣除只配一次。
    - **展示**：表格只列这个道具的流水（时间 / 变动 / 余额 / 来源 / 对账），**配对的两行高亮**（获得 `is-pair` 黄、扣除 `is-loss` 红并写「被吞的扣除」）；芯片写「对上 N 组「+N → 棋盘上传 −N」」或「获得 N 次，后面都没有棋盘上传扣除」。
    - **话术**末尾多一段 `—— 资源流水对账（体力）——`：`· 2026-10-29 10:00 获得 +100（每日任务奖励） → 2026-10-29 10:01 「棋盘上传」扣了 -100 ← 数量对得上，这就是被吞的特征`，再给「共 N 组，建议按这几条提研发核对服务端流水」。
    - **🔗 跟「资源 & 活动奖励流水」解析联动（2026-10 用户：「点击解析或者上传解析，可以将日志数据同步更新给游戏数据这里」+「不是解析完自动把记录灌进游戏数据，而是把原始数据同步给游戏数据那边判断」）**：`smartParseAndFill()`（资源流水模式）把**原始日志文本**原样交给 `gdFlowImport(raw, '智能解析')`；`processFlowCsv()` 上传 CSV 时先 `gdCsvToTabs(text)`（只把分隔符换成制表符、引号里的不动，内容一个字不改）再交过去。**游戏数据用自己那套严格解析 `gdFlowParse` 判断**（不套话术那边的忽略关键词 / 资源类型覆盖 / 来源转换 / 关键词筛选），所以同一份日志在话术里被筛成 1 条、游戏数据这边照样是全部行；解析日志写「🎮 已把原始流水（N 行）同步给「游戏数据 → 01 资源核对」」，认不出格式时提示手动贴。
      - ⚠️ 别再改成「灌 `parseSmartLog` 的 records」：那套会忽略「棋盘上传」（判「被吞」靠的就是它）、按下拉框覆盖道具名、做来源转换，拿来排查会失真（`verify` 有反向断言 `!/parseSmartLog\(raw, \{ keepIgnored/`）。
    - **全量体检**（2026-10 用户反问「后台日志都能看到棋盘上传了，那为何还要在工作台粘贴」→ 这就是工作台比人眼多的那一截）：`gdFlowScan()` **一次扫完贴进来的整份流水**，按道具分组跑同一套配对，芯片先给「扫了 N 个道具 · M 条流水 + 疑似被吞 X 组」（没有就「没有可疑配对」），`<details>` 里列出每个可疑组的「道具 / 获得时间 +N / 棋盘上传扣除时间 −M / 相差多少」。**贴一次 = 整份日志体检**，不用为每个道具单独查。
    - **只贴流水就够**（2026-10 用户：「原本的粘贴游戏数据就没有意义了对吧，除了棋盘镜像」）：`mergeItemRun` 不再强制要求 MergeState —— 没贴存档时当前值用**流水最后那条的余额**顶上（`gdFlowLast`），话术走 `gdFlowOnlyScript`（写明「只依据资源流水」），导图的「存档」那片也改成「没贴存档 · 流水最后余额 X」。**MergeState 现在只为三件事存在**：活动进度（02 段整段靠它）、存档记录值 vs 当前值、今日体力 / 钻石消耗；棋盘 / 背包 / 仓库还是棋盘镜像那份。
    - **导图**多一片「流水对账」（对上 N 组 / 后面都没有扣除 → 不是被吞 / 还没贴流水），**结论**优先用这条口径（有流水时不再看「最后变动时间」）。
  - **🀄 中文化（2026-10 用户：「解析出来的代码或者英文是否可以转化成对应的中文名称」）**：活动进度删掉以后，**活动名 / 关键进度那套中文化（`MERGE_ACTIVITY_LABELS` / `mergeActivityLabel` / `MERGE_PROGRESS_WORDS` / `mergeProgressLabel`）跟着一起删了**，别再捡回来（`verify.mjs` 3g-3 有反向断言）。
    - 物品不走这套：`boardNameOf` 把 `itemNameMap` 里 `--货币` 这种「分类占位」显示成「货币类」，查不到名字的统一用 `mergeNameOf` 显示「道具 N」/「棋子 N」（**操作记录表、棋盘镜像列表都别再直接吐一串 id**）；棋盘格里认不出的棋子仍显示 `#id`（格子窄），但 `title` 写「道具 N（映射表里没这个名字）」。
- **🔁 粘贴后同步核对镜像**（`mergeRenderDiff`）：MergeState 解析完、或棋盘镜像解析完，都会重算 `#mergeDiff`：拿玩家数据的红宝石/铜钱/体力跟镜像的 `currencies`（103/102/101）比 —— **一致标黄（`k-accent`）写「一致 86130」，不一致标橙（`k-warn`）写「不一致：玩家数据 X / 镜像 Y」**（说明镜像不是同一时刻抓的）；镜像还没解析时提示「去第 02 段粘一份」。⚠️ 两边的 `syncTime` 一致时才是同一份快照（实测都是 1793248480）。
- **只在本机**：`mergeModel` 只在内存里，不写 `/api/data`、不落 localStorage（刷新就没了）。`stats`（客户端网关测速，含内部域名）解析出来但**没上界面**，别外发；`energy_rank.robotStates` / `teahouse_race.playerDatas` 里有其他玩家昵称，也只在数据里、不上界面。
- **测试**：`tools/smoke.cjs` 第 **8z-2** 节 **19 条**（默认空表 / MergeState 解析出货币·体力·存档 ID·当日消耗·资源数 / 资源表三列 / 镜像没解析时对账行提示 / **解析镜像后对账「一致」** / **改数后「不一致」** / 资源话术（含当日钻石消耗 + 镜像三处）/ 体力话术带当日消耗 / 输 id 查 / 查不到直说  / **异常自查四段（订单消耗 · 最近一次操作带奖励 · 记录值对账 · 能力边界）** / **时间点两个方向（晚于最后变动 → 不是被吞；早于 → 那个时段变过）** / 判定芯片 / 坏 JSON 只提示 / 清空（连时间点与判定芯片一起清） / 清空后再查会提示先解析 / 全程 0 请求）；第 **8z-3** 节 **11 条**（操作记录：认出 5 条 + 时间范围 / 类型芯片按 op 归类 / 流水表五列 + 订单快照 / 查红宝石「订单奖励里给过 1 次、共 25 个」/ 表跟着查询词过滤成 1 行 / 查 21510「订单收走 1 单、共 1 个（订单号 + 时间）」/ 判定芯片「被订单收走 N 个：不是被吞」/ 玩家说的时间之后一条都没动过它 / 「清空记录」连话术里那段一起收掉 / 坏 JSON 只提示 / 全程 0 请求）；第 **8z-4** 节 **13 条**（导图默认不占版面 / 输道具出根节点 + 5 个分支 / 存档与镜像两片 / 订单片把「当前订单收走 + 最近一次操作收走」都列出来 / 没贴操作记录时直说还没贴 / 结论「玩家说的时间之后没再变过 → 不是被吞」/ 清掉时间点后结论退化成「要研发拉流水」/ 大框贴操作记录自动转走并解析 / 导图操作记录片跟着更新 / 大框贴棋盘镜像自动转到 03 段并画主棋盘 / 不用点按钮（派发 input，400ms 后自动解析）/ 清空连导图一起收 / 全程 0 请求）；第 **8z-7** 节 **4 条**（点智能解析就同步 / 体检被点亮且标来源 / 直接输道具名出被吞话术 / 0 请求）；第 **8z-6** 节 **17 条**（流水贴大框自动认 / 查道具直接出流水表 / 配对两行高亮「获得 · 被吞的扣除」/ 芯片「对上 1 组」/ 话术里 +100 → 棋盘上传 −100 一行说清 / 导图「流水对账」指向被吞 / 只有「棋盘上传」算被吞（棋盘操作扣的不算）/ −99 差 1 也认 / 换成非上传来源 → 翻成「不是被吞」/ 全程 0 请求 / 清空收起）；第 **8z-5** 节 **2 条**（操作记录里未知道具显示「道具 99999999×3」/ 全程 0 请求）；`tools/verify.mjs` 3g-3 另有 **21 条**静态断言（页面结构（含「活动进度已删」的反向断言：没有 `data-seg="activity"` / `gdAct*` / `mergeActivityScript` / `others.activities`）、解析函数、资源核对话术、对账、只在本机、操作记录入口与函数、四类命中、话术段与芯片、北京时间口径、思维导图结构与函数、万能粘贴与自动解析、物品名中文化、流水对账结构与「+N → 棋盘上传 −N」口径、全量体检、跟智能解析的联动与 keepIgnored）。

## 🧩 棋盘镜像（`#tab-gamedata` 的第 02 段 · 粘 GM 镜像 JSON，2026-10）

用户要求：「增加一个棋盘镜像功能，可以粘贴棋盘镜像数据生成类似展示主棋盘，背包，仓库的页面，还可以输入道具名称或者 id，来生成有几个 xx 在棋盘上，几个 xx 在临时背包，几个 xx 在仓库这样的确认道具棋子的状态的话术」。

- **位置**：它是 **「🎮 游戏数据」页的第 03 段**（`#tab-gamedata` 里的 `[data-seg-card="mirror"]`），不再是独立标签页（用户 2026-10：「将棋盘镜像作为独立的标签页加在这个功能里」）。侧边栏那一项叫 **「游戏数据」**（`data-tab="gamedata"`，`tab-btn-sub`，在「梦幻消除站」组里、`话术生成` / `集卡分析` 后面，**不带图标**）。**跟「下午茶投票」「吉运节节高」都无关**。
- **五块**（id 都别改）：
  1. `#boardInput` 粘贴框 + `#boardParseBtn`（🔍 解析并展示）/ `#boardClearBtn`（🧹 清空）+ 提示 `#boardHint` + 汇总芯片 `#boardSummary`。
  2. `#boardMainCard`：主棋盘 `#boardMainGrid`（`.board-grid`，`--bw` 控制列数）+ 其它棋盘 `#boardOtherGrids`。
  3. `#boardBagCard`：临时背包 `#boardBagList` + 仓库 `#boardWareList`（`.board-chip` 一片一个）。
  4. `#boardAskCard`：`#boardAskInput`（道具名或 id）+ `#boardAskBtn` / `#boardAskCopyBtn` + `#boardAskHint` + 话术框 `#boardAskOut`（回车也能查）。
  5. 抬头 `#boardReportHead`（`#boardReportSub` / `#boardReportMeta`）。
- **数据来源**（GM 玩家页镜像 JSON，原样贴；前面带「镜像数据：」之类的文字也认 —— `boardJsonText()` 取第一个 `{` 到最后一个 `}`）：
  - `chessboardDataList[]`：每块 `{ chessboardId, cellNumW, cellNumH, cellTotalNum, expirationTime, cells[] }`；`cells[].pieceData` = 棋子（`pieceType` / `goodsId` / `itemCodeStr` / `inventory` / `capacity` / `spawnList` / `others.uniqueId`）。**主棋盘 = `chessboardId === 1`**，没有就取第一块；其余当「其它棋盘」（活动棋盘 9 之类）。
  - `warehouseData.pieceDataList[]` = 仓库棋子；`activityChessBoardData.warehouse.pieces[]` = 活动仓库（有就一起算仓库）。
  - `backpack`（`{ goodsId: 数量 }`）= **临时背包**；`backpackGoodsIds` 里出现的空 key（`""`）要跳过。
  - `currencies`（`{ 101: 16, 102: 86130, … }`）= 货币芯片。
- **汇总芯片**：只留「主棋盘 W×H / 另有 N 块 / 棋子 N / 格 M / 临时背包 N 项 / 仓库 N 件」—— **货币（101/102/103）不在这显示**（那是「玩家数据」那边的事，对账行会用）；背包 / 仓库的芯片**只写名字 + ×数量 / 库存**，id 收进 `title`（认不出名字的才把 id 写在脸上）。
- **棋盘怎么画**：按 `cellNumW × cellNumH` 铺格子（7×9 = 63 格），按 `cellIdx` 定位；三种样子 —— 有 `pieceData` = 棋子（名字来自 `itemNameMap`，产出棋 `pieceType` 11/12/31/32 标黄底并显示 `库存/上限`）、`lockState !== 2` = 未解锁（虚线「锁」）、其余 = 空位（虚线「·」）。`title` 里有 id / 库存 / 类型 / 格号。
- **查询 / 话术**（`boardIdsOfQuery` + `boardAskScript`）：
  - 全数字 → 直接当 id；否则用 `itemNameMap` 反查：**先精确匹配名字，再不精确到「真名里包含查询」**（⚠️ 反过来「查询里包含真名」不行 —— 会让「不存在的道具」命中名字叫「道具」的那几条）。
  - 话术（用户要的三段式，别改句式）：
    ```
    【棋盘镜像 · <名字>（<id>）】
    棋盘上有 X 个，临时背包有 Y 个，仓库有 Z 个。
    ```
  - **计数口径**：棋盘上 **每格算 1 个**（两块棋盘一起数）；仓库 **每件算 1 个**（`warehouseData` + 活动仓库）；临时背包 **取 `backpack` 里的数量值**。三处分开存 `model.counts[id] = { onBoard, inBackpack, inWarehouse }`。
  - 名字对不上时话术直接说 `镜像里没找到「…」这个道具 / 棋子`，提示里也写「换个写法或直接输 id」。
- ⚠️ **只在本机内存里**（`boardModel` 变量）：不写 `/api/data`、不塞 localStorage，刷新就没了（想留就重新贴）。
- ⚠️ 活动棋盘的 `activityPieceIdMap` 里那批 id（826xx / 827xx / 610xx…）**物品名表里没有**，会显示成 `#82601` 这种原 id —— 想显示真名就去「映射管理」里补 `itemNameMap`，补完刷新即可（`boardNameOf()` 读的就是它）。
- **测试**：`tools/smoke.cjs` 第 **8z** 节 **19 条**（是「梦幻消除站」组的子项 / 标签上没有图标 / 两段与默认段（没有活动进度那一段）/ 切到第 02 段 / 三块默认收起 / 汇总芯片不含货币、背包仓库 id 在 title / 解析出主棋盘 3×2 + 棋盘数 + 棋子 4·格 8 + 背包 1 项 + 仓库 2 件 + 货币 / 三块都显示 / 主棋盘 6 格含 3 棋子·1 未解锁·1 产出棋 / 名字换成「相思鸟」「云栖茶壶」且带 80/80 库存 / 其它棋盘单独画 / 背包「×3」/ 仓库认识换名·不认识写 id 带库存 / 输名字出话术（棋盘 2·背包 0·仓库 0）/ 输 id 出话术（棋盘 1·背包 0·仓库 1）/ 查不到就说没找到 / 坏 JSON 只提示不炸 / 清空全收 / 全程 0 请求）；`tools/verify.mjs` 3g-3 有 **12 条**静态断言（含「三张子项排在一起、都不带图标」和「棋盘镜像整块收进 `data-seg-card="mirror"`」）。

## SOP 助手（**已删除** · 2026-10，用户要求）

「SOP 助手」标签页已**整块删除**：侧边栏入口 / `#tab-sop` 页面 / `.sop-*` 样式 / `sopXxx()` 全部脚本 / 事件绑定都清了，页面上不再出现任何 sop 字样。`verify.mjs` 3h（4 条）与 `smoke.cjs` 8k（2 条）现在断言的是「**它不该存在**」：要恢复就 `git show 60745e5:public/index.html`，配套测试也一起捡回来。

- **服务端没动**：`server.js` 的 `SOP_TOKEN` + `sop*` 前缀口令关、`tools/sop-seed.cjs`（`npm run sop:seed`）都留着 —— 服务端 `data.json` 里那份 `sopBundle` 还在，删前端不等于删数据，而且数据含内部口径与员工姓名/电话，**别裸奔、别入库**（只在本机 `tools/out/sop/bundle.json`，已 gitignore）。
- 想彻底清干净：删 Render 的 `SOP_TOKEN` 环境变量 + `data.json` 里的 `sopBundle` + `server.js` 的 `denySop`/`SOP_KEY_RE`/`tokenEq` + `tools/sop-seed.cjs`（**这几步都没做**，等用户发话）。

## 生管物料订单工作台（`public/pmc.html` · 临时工具，独立单页）

给 **生管/PMC 岗位**做的临时工具页：读公司《H93A 主料计划》主表 → 逐日推演理论库存 → 算缺料日/覆盖区间/建议下单量 → 按供应商拆 CSV。**跟工作台本体零耦合**：不 import、不碰 `index.html` / `server.js` / `data.json` / `/api/data`，数据只在浏览器内存 + 本机 `localStorage['pmcWorkbench_v1']`（只存参数/导入的数据，不上传任何服务端）。

- **打开**：`http://localhost:3000/pmc.html`（本地）／`https://work-bad.onrender.com/pmc.html`（线上，`express.static` 顺带托管，不用改 server）。
- **六个标签页**：① 下单建议（表内可直接改 SNP/保留倍数/缺口天数/提前期/加工周期/送货周期/运输/MOQ/包装倍数，改完立刻重算）② 到货计划 / 调整建议（在途锁定期，见下）③ 逐日库存明细（柱状图 + 触发线 + 原表「库存」行对照 + 到料计划标记）④ 两版趋势对比（加单/减单/保持，阈值可调）⑤ 按供应商导出（CSV/复制文本）⑥ 参数与数据导入。
- **内置样例**是从**真实主表**抽出来的：21 张月度表里取 **26.6（本版）83 条** + **26.5（上版）86 条**材料块，内联在页面里（`<script id="pmc-sample">`，约 75KB）。打开即用，不依赖任何文件。
- **导入真实 xlsx**：浏览器里零依赖解压（`DecompressionStream('deflate-raw')` + `DOMParser`，要 Chrome/Edge），**版式识别规则跟离线验证过的一致**：
  - 列映射（实测主表）：`0=NO 1=物料名/車種 2=颜色/规格 3=项目 4=小计/月初库存 5..35=1..31日 36..=附注/供应商`。
  - 表头行 = **含 Excel 日期序列号（40000~60000）的第一行**；日期 = 序列号 + i。
  - 材料块 = 「项目」列是 `需求`/`生産必要数` 的行（下面 6 行内的 `库存`/`在庫` 行给月初库存，`SNP xxx` 文字给 SNP，`（馨源）`/附注列给供应商）。
  - ⚠️ 实测坑：**「订单」「实际」也要当成块内行收集**，否则 `SNP 180` 那格收不进来（72/83 命中 vs 9/83）。
  - ⚠️ 一个月度表里有两段不同版式（`需求/订单/实际/进度/库存` 与 `生産必要数/累計/…/在庫`），上面的规则同时吃得下。
- **口径**（PRD 3.1/3.2 + 用户 2026-10 补的加工周期）：触发线 = SNP×保留倍数；缺料日 = 理论库存第一次 < 触发线的当天；覆盖区间 = [缺料日, 缺料日+缺口天数−1]；建议下单量 = 覆盖需求 + 触发线 − 到货库存（**仍按缺料日当天日末库存**）→ 包装倍数向上取整 → 不足 MOQ 提到 MOQ。
  - ⚠️ **加工周期（`procDays`，工作日）**：材料不能卡在缺料那天到货 —— **最晚到货日 = 缺料日往前退 N 个工作日**，**建议下单日 = 到货日 − 提前期**（自提再向前挪到最近的周一/周四）。**到货当天不算加工，从次日开始数**；周末跳过，节假日按「参数」页 `holidays`（支持 `2026-06-19` 或 `06-19`）跳过。实现是 `backWorkdays` / `addWorkdays` / `isWorkday` / `isHoliday`，`compute()` 里返回 `procDays / arrivalDate / readyDate`。
    - 用户给的例子（已进冒烟）：缺料 6/19(周五) + 加工 3 工作日 → 最晚 **6/16(周二)** 到货，6/17·18·19 加工完正好接上；提前期 3 天 → 6/13 下单。
  - **主表里没有缺口天数/提前期/加工周期/送货周期/运输/MOQ/包装倍数**，按默认值 + 页面手改（加工周期默认 0 = 老口径，送货周期默认 3 天）；参数按「车型+物料名」认人，**下个月重新导入同一批材料，参数还认**。
  - ⚠️ **送货周期 / 在途锁定期（`transitDays`，自然天数，②tab）**：用户 2026-10 补的规则 —— 「周三已经下了到料计划，今天周二收到新预测，那批材料在路上，取消不了，只能改后面的」。
    - **锁定线 = 基准日（今天）+ 送货周期**；到货日 ≤ 锁定线的批次 = **在途·锁定（改不了）**，> 锁定线的 = **可调**；基准日之前的 = 已到/已过。锁定线同时是**新下单物理上能到的最早日期**。
    - **到料计划**来自主表的「**订单 / 納入指示数**」行（= 已经下的到料计划），导入时按日读进来；粘贴导入可用「到货计划」列写 `2026-06-15:1000;2026-06-22:2000`。②tab 每行显示每个批次带「在途·锁定 / 可调」标签。
    - 每条材料出**状态 + 建议**（`PLAN_STATE`）：`past` ⏱已进入缺口（**缺料日 < 今天**，这一段赶不上，只能靠在途+加急）/ `late` ⚠来不及（需要的到货日 ≤ 锁定线，新单最早也只能锁定线到）/ `covered` 在途已覆盖（锁定期内在需要日前的量 ≥ 建议下单量 → 不用再下单）/ `intime` 还能下单调整 / `flex-earlier` 可把**锁定期外**的批次提前到需要的到货日（锁定期内的批次挪不动）。
    - ②tab 有 7 张 KPI（含「⏱已进入缺口」「⚠来不及」「在途锁定批次」「可调批次」）与状态/供应商/只看要下单 筛选；③逐日明细图上用 `▼数量` 标到料日、表里多「到料计划 / 该批能不能改」两列；CSV 多「送货周期/锁定线/在途锁定数量/可调数量/到货状态/调整建议」。
  - 未定：提前期仍按**自然天数**算，所以下单日可能落周末（自提单才强制周一/周四）——要不要把下单日也挪到工作日，等用户定。
- **自检**：`npm run smoke:pmc`（= `node tools/smoke-pmc.cjs public/pmc.html`，**123 项**）—— 含**在途锁定/调整建议 18 条 + 到货计划页 12 条**（今天周二+周三到料→锁定、锁定线=今天+周期、可调/已过分开、来不及/在途已覆盖/可下单/可提前、周期 0 与 30 天、改基准日锁定线跟着变、逐日明细标到料批次）、**加工周期 16 条**（周五缺料→周二到货、跨周末、节假日、0 与长周期、下单日联动、不影响下单量） / 计算引擎与**独立复算逐条对账**（缺料日·覆盖需求·下单量）/ 包装倍数与 MOQ 与自提周一四 / 趋势公式 / 界面渲染（31 根柱、触发线、导出预览含真实供应商）/ 改参数即时重算并落本机 / 过滤与状态列 / 迷你主表解析；**第 7 节拿真实 8.5MB xlsx 端到端跑一遍**（21 张表 → 83 条材料 → 真的重画成 83 行），**没有那个文件就自动跳过**（找 `tools/out/pmc-xlsx/src.xlsx`，其次找附件原始路径）。**它不在 `npm run verify` 里**（verify 只管工作台本体，别把 pmc 塞进去）。
- **样例数据管线**（都在 gitignore 的 `tools/out/`，要重跑就按顺序来）：`xlsx-full.cjs`（整表导 TSV 看版式）→ `pmc-extract.cjs`（抽材料块 → sample.json）→ `pmc-embed.cjs`（压成紧凑 JSON）→ `pmc-inject.cjs`（注入 `pmc.html` 的 `__PMC_SAMPLE__` 占位符；**注入过就不能再注入**，要重来得先把占位符改回去）。
- **不改主表**：工具只读、只导出新 CSV（PRD 的方案 A）；回填公司 Excel 仍靠人。
- 📄 **实现规范（交付 AI 写代码用）：`docs/pmc-autoplan-spec.md`** —— 口径 / 参数表（作用域 material>supplier>global）/ 引擎 / **新表「按我设定的自动排」（§6：逐日+缺口段伪代码、可行性判定 `R ≤ S`、在途锁定不动、自提吸附周一四、可调批次三策略）** / 导出 / UI / 与现状差距 / 8 个手算验收用例（A–H）/ 待确认 9 条。**改算法先改这份文档**，断言数同步。

## 硬约定

1. `public/index.html` 必须用 **UTF-8** 保存（不能用 GBK）。
2. **不要在编辑器里执行「格式化文档」**：会整篇重排缩进。功能不受影响，但 diff 会变脏，并且会让基于字符串匹配的补丁脚本失效。
3. 改完先 `npm run verify`，再 `git add` + `git commit`。
4. 后端**不需要重启**：`express.static` 每次请求读磁盘，覆盖文件后浏览器 `Ctrl+F5` 即可生效。

## 已定语义（改之前先问用户）

1. `resolveItemName(id, name)`：**日志里已有非纯数字名字时优先用日志的**（映射表被绕过），只有名字是纯数字或空时才查 `itemNameMap`。结果就是**「映射管理」里改的棋子名，对日志中已带名字的记录不生效**。
   - 本轮已确认**保持现状**，并由 `tools/smoke.cjs` 第 **6b** 节用两条断言锁定：A 日志自带名字 → 用日志名且不查映射；B 日志只有纯数字 ID → 查映射。
   - 要改成「映射优先」会改变已有话术输出，**必须先问用户**，并同步改 6b 的断言。
2. **资源类型「选什么就出什么」**：`parseSmartLog` 里 `if (['体力','红钻','金币','好评点'].includes(userSelectedType))` 会把**每一条**记录的 `道具名称` 与 `_资源类型` 都改写成下拉框选中的类型，所以日志里同时有体力和金币时，选「体力」会把金币那行也输出成体力话术。
   - 用户已确认**这是有意行为**，不做「按日志真实类型筛选」。由 `tools/smoke.cjs` 第 **2d** 节两条断言锁定：混合日志选体力 → 两行都按体力出；选金币 → 两行都按金币出。
   - 要改成「按日志真实类型筛选」会改变已有输出，**必须先问用户**，并同步改 2d 的断言。
   - **例外：「活动奖励（集合）」不适用这条**。它不强制单一类型，而是按「时间+来源」把**一次活动结算**的多种资源合并成一句：`在X，通过【来源】获得A*1，B*20`；同一动作只写一次动词，同一组里既有消耗又有获得时各自带动词（`消耗体力*1，获得金币*20`）。时间或来源不同则不合并。见 `tools/smoke.cjs` **2e** 节 3 条断言。
3. **「道具被吞」的判定口径（2026-10 用户给的，别自己发挥）**：**获得 +N 之后，有没有一条「棋盘上传」把相同数量扣掉** —— `+100 体力` 后面跟 `-100 棋盘上传`（**或 -99，差 1 也算**）就是被吞的特征；**来源不是「棋盘上传」的扣除不算被吞**。
   - 实现：`游戏数据 → 01 资源核对` 的「资源流水对账」（`gdFlowPairs` / `gdFlowLines`），配对结果同时出表格高亮、判定芯片、话术那一段和导图的「流水对账」分支。
   - ⚠️ 别再退回「只看资源最后变动时间」那一套当主判据（那套留着当补充线索）；要改判定条件（比如允许差更多、或把别的来源也算进来）**必须先问用户**，并同步改 `smoke` 8z-6 与 `verify` 3g-3。
4. **集卡卡包名沿用手写风格，不对齐游戏官方名**：`PACK_NAME_MAP` 里 `176–179` 是 `幻狐2星锦囊…幻狐5星锦囊`（沿用该表 `霞光3星锦囊` 的「系列+星+锦囊」写法），而游戏源码里的官方名是 `2星幻狐锦囊…5星幻狐锦囊`（`DEFAULT_ITEM_NAME_MAP` 用的正是官方写法）。
   - 已问过用户：**保持现状**，不改（改它会改变集卡话术输出）。
   - 所以 `npm run build:data` 的 `diff-report.md` 里，`PACK_NAME_MAP` 这一栏会长期有「名称不一致」条目（幻狐 4 条，霞光 3 条同理）——**看到不要顺手改**。

## 待确认（改之前先问用户）

1. 解析完会自动 `safeCopy(...)` **写入系统剪贴板**（5 处：`5556 / 5565 / 5579 / 5657 / 5819`，会覆盖用户原有的剪贴板内容）。是否需要改成显式按钮触发或加开关，待确认。

## 目录结构

```
public/index.html          全部前端（单文件，约 14500 行：内联 CSS + 内联 JS 的 async IIFE；含「客服生涯」「海外业务统计」「反馈模板」「下午茶」标签页 + ?vote= 只投票页）
public/pmc.html            生管物料订单工作台（临时工具单页：内置 H93A 26.5/26.6 样例 + 浏览器端解析真实 xlsx + 逐日库存/缺料日/建议下单 + 按供应商导出 CSV；只存本机，与工作台零耦合）
server.js                  express：静态托管 public/ + GET/POST /api/data/:key ↔ data.json（含 key 白名单）+ GET/POST /api/vote/:key（下午茶投票：原子合并 + 当天 23:00 过期清理）
data.json                  服务端数据（随使用增长；前端字段缺失会被默认值自动补齐）
tools/                     自检脚本（verify / smoke / smoke-nonblocking / smoke-server / smoke-pmc / print-report / build-game-data）＋ sop-seed.cjs（遗留：SOP 页面已删，只用来把旧 bundle 推给服务端）
tools/fixtures/            build:data / extract:maps 的输入；player-page.html 含玩家隐私已 gitignore，样例已入库
tools/out/                 build:data / extract:maps 的产出（4 张表 + 差异报告 + page-*.json / map-audit.md）＋ pmc 样例数据管线 ＋ sop/（附件抽出来的文本与 bundle，已 gitignore），已 gitignore
package.json               scripts: start / verify / verify:static / smoke:server / smoke:pmc / sop:seed / report / build:data / extract:maps / audit:maps / test
```
## 已完成的关键改动

- **🗓️ 七日任务**（2026-10，用户要求「根据任务id、天数、描述、进度、奖励生成任务进度的话术」→ 改口「任务表是固定的，可以不用展现更改区域」→ 再给了整张固定任务表）**任务表已写死在 `SD_TASK_DEFAULT`（两期共 70 条：2416–2450 + 2486–2520，界面只读）**，日常只粘进度日志，按任务ID 出「第几天·描述：进度 老 → 新/目标 · 已达成 / 还差 N 完成 · 可领取 积分 X + 道具×N」；只存本机、不发请求；见上「🗓️ 七日任务」一节。
- **日报表单分组**（2026-10，用户要求「填写日报的几个选项不好分辨」）：工单 / 海外日报按业务分组渲染（一组一片 + 编号 + 已填 n/m 片）；**字段本身不合并、不删、不改名**，组内仍是完整 `label`；见上「每日日报」一节。
- **`b459151`** 工作台优化：
  - 日报模板新增 **⑥伙伴弹途 / ⑦异世界勇者**。改动是**三处配套**，少一处会出现「有输入框但报告没这行」或反之：
    1. `DAILY_DEFAULT_DATA.ticket` 加 `g6_wx/g6_dy/g6_dyol/g7_wx/g7_dy/g7_dyol = 0`
    2. `DAILY_TICKET_FIELDS` 加 6 个 `number` 字段
    3. `generateDailyReport()` 里加两行文本（缩进与 ①~⑤ 对齐）
  - 修复：内置默认常量被就地改写 → 「重置模板 / 重置默认映射」失效（改 `cloneDefault()` 深拷贝 + `applyState()` 归一化）
  - 修复：接口地址用 `location.origin` 拼绝对路径 → 子目录部署出错（改相对 `api/data/`）
  - 修复：日报自定义附加项逐字符发 POST（改 `debouncedSaveDaily()`）
  - 修复：并发保存乱序覆盖服务端（改按 key 串行队列 `__saveChain` + 检查 `resp.ok`）
  - 修复：调试日志跨轮次串台（统一 `resetDebug()`）+ 日志长度上限
  - 修复：初始化异常被静默吞掉（顶层 try/catch + `reportFatal()` 横幅）；拼豆/油炸模块各自 try/catch 隔离
  - 修复：非安全上下文下 `navigator.clipboard` 为 undefined，点「生成日报」抛 TypeError（改用带守卫的 `safeCopy`）
  - 性能：首屏不再阻塞于 9 个网络请求（默认值先渲染，数据到达后 `applyState + refreshDataViews`）；正则缓存 `getCachedRegExp`；元素引用缓存 `$el()`；排序键只取一次；`fryBake` 复用 ImageData；rAF 页面隐藏即暂停；盘子上限 30
  - 体验：模态框 Esc / 点遮罩关闭、补 `role="dialog"` 与 aria、侧边栏拖拽顺序持久化、字体与 CDN 不再阻塞首屏
- **`5ead2a4`** 加入本自检工具链。
- 本轮：把 `resolveItemName` 的语义决定固化——① 从「待确认」移入「已定语义」（确认**保持现状**），并给 `tools/smoke.cjs` 加 **6b** 节两条断言防止日后被无意改掉；冒烟项数 33 → 38。**前端代码未改动**。
- 本轮：修复 **短格式资源流水全部解析不出来** 的回归（用户报的「体力无法生成」）。根因是 `b6141ff` 给 `isNewFormat` 加了 `|| looksLikeResource`，使「第 3 列是资源名但列数 < 10」的日志被误判成新格式，变化量取到来源文字 → `parseInt` 得 NaN → **整条记录被丢弃**。受害范围不只是体力：输入框占位符里的范例格式（8 列）连同 6 列简格式全挂，5 种资源类型（体力/红钻/金币/好评点/道具）**全中招**（用户只是先撞上体力）。
  - 修法：新格式还须满足「第 5 列不是纯数字」（新格式 col5=道具名 → 非数字；旧短格式 col5=之前数量 → 数字）。这样 **9 列新格式仍走新格式分支**（它正是靠 `looksLikeResource` 才被识别，不能简单删掉该条件）。**改动仅 1 行**（`public/index.html` 的 `isNewFormat` 一行）。
  - `tools/smoke.cjs` 新增 **2b** 节 4 条（8 列范例 / 6 列 / 8 列金币 / 9 列新格式）+ **2c** 节 2 条（好评奖励原先只验证「不抛错」，现补「真的生成话术」）。冒烟 38 → **44**。
  - 已用突变测试验证：把条件还原成出错版本，2b 的 3 条短格式断言精确变红、9 列断言仍绿。
- 「游戏活动」子标签页（蒲公英/绣球/茶楼/春生雅艺会 4 张攻略速查表）曾由 `a6a53c8` 加入，**后按用户要求移除**（该提交已在历史里，需恢复时用 `git show a6a53c8 -- public/index.html` 取回那 118 行，并同步恢复 smoke 的 8b 节与 verify 的 2 条静态断言）。
- 本轮：针对「一次活动结算、同时给多种资源」的日志，**新增资源类型「活动奖励（集合）」**（`flowResourceSelect` 第 6 个选项）。起因：用户指出体力+金币混合日志也可能是一次活动奖励集合——实测原有两种模式都出不对（选「体力」会把金币行写成体力；选「道具」因动词不同而拆成两句，不合并）。
  - 行为：按「时间+来源」分组，把该次结算的所有资源合并成一句 `在X，通过【来源】获得A*1，B*20`；同一动作只写一次动词，混合动作各自带动词；时间/来源不同则保持分开。
  - 改动四处（都在 `public/index.html`）：加 `<option>`；把新类型排除出「强制覆盖类型」的筛选块（否则物品名会被抹成「活动奖励」）；智能粘贴路径新增合并分支；CSV 路径的兜底类型改为「道具」（CSV 走 `buildMergedRewardText`，本就按时间+来源+行为合并）。
  - `tools/smoke.cjs` 加 **2e** 节 3 条（同为获得→精确匹配一句；一消耗一获得→仍一句且各自带动词；不同时间/来源→不合并），`tools/verify.mjs` 加 1 条静态断言；冒烟 46 → **49**。
- 本轮：**集卡分析新增幻狐识别**（用户提供：幻狐卡牌与锦囊为 2–5 星，卡牌星级码 **32–35**，锦囊代码 **176–179**）。三处改动（都在 `public/index.html`）：
  1. `PACK_NAME_MAP`（集卡分析查卡包名）补 `176–179 → 幻狐2星锦囊…幻狐5星锦囊`，沿用该表 `霞光3星锦囊` 的「系列+星+锦囊」写法。
  2. `generateCardSentence` 的 `starLabel` 补 `32/33/34/35 → 幻狐2星…幻狐5星`（与既有 `23/24/25 → 霞光3/4/5星` 并列）。
  3. `filterRecordsByStar` 的 `extraStars` 由「星级 → 单个代码」改成「星级 → 代码数组」：`{2:[32], 3:[23,33], 4:[24,34], 5:[25,35]}`，使 2–5 星筛选同时命中霞光与幻狐。
  - ⚠️ `DEFAULT_ITEM_NAME_MAP`（资源流水的物品名）里 **176–179 本来就有**，写法是「2星幻狐锦囊」，与 `PACK_NAME_MAP` 的「幻狐2星锦囊」不同——两张表风格历来不一致，各自沿用，别误当重复。
  - `tools/smoke.cjs` 加 **8b** 节 6 条（包名 / 星级标签 / 霞光回归 / 2、3、5 星筛选），`tools/verify.mjs` 加 1 条静态断言；冒烟 49 → **55**。
- 本轮：新增**游戏数据管线**（`tools/build-game-data.mjs` + `npm run build:data` + `tools/fixtures/`）——从 GM 玩家页快照提取 4 张权威映射表，并与 `index.html` 的硬编码常量做差异比对。**未碰前端代码**（本次按计划的「先做 A、B，不碰前端」）。
  - 产出 `tools/out/game-data.json`（4 表）+ `tools/out/diff-report.md`（缺 / 多 / 名称不一致，另附卡包 `royal` 星级码表）。
  - ⚠️ 真实快照 `tools/fixtures/player-page.html` **含玩家隐私**（playerId/openId/昵称/背包），已加入 `.gitignore` 只留本地；入库的是合成样例 `player-page.sample.html`，提取器已用它对跑验证。
  - 首次自测即复现幻狐命名分歧：游戏官方名为 `2星幻狐锦囊`（与 `DEFAULT_ITEM_NAME_MAP` 一致），而我上轮给 `PACK_NAME_MAP` 写的 `幻狐2星锦囊` 是异类；`royal` 码也确认了 `32–35` = 幻狐 2–5 星。
- 本轮：按方案1 补齐 `index.html` 缺失的来源映射 **253–257**（名称取自 GM 玩家页的 `opFrom` 列表）：
  - 插到 **两张表各 5 条**（`DEFAULT_ITEM_NAME_MAP` 与 `DEFAULT_SOURCE_ID_MAP`，共 10 行）。注意 `DEFAULT_SOURCE_ID_MAP` 原 `"252"` 是**块尾无逗号**，补新条目必须同时给它加逗号 → diff 为 **11 增 1 删**。
  - `tools/smoke.cjs` 加 **6c** 节 4 条：253 / 254+255 / 256 / 257 各走一遍**真实日志解析**（第 11 列当 sourceId），断言 `resolveSource` 能查到新名字。`tools/verify.mjs` 加 2 条静态断言（存在性 + 两表各一份共 10 处）。冒烟 55 → **59**。
  - 方案1 的另一半（活动缺项）**已用快照定案**：`DEFAULT_ACTIVITY_TYPE_MAP` 原有 38 键，快照里「活动」下拉共 39 个类型，**唯一缺的是 `75: "95打怪棋盘"`**（映射表有、快照没有的：无；名称不一致：无）。
    - ⚠️ 方案1 说「`"81"` 之后插」是因为页面里 `type/75` 恰好排在 `81` 之后，但**这张表是按数值升序的**，正确位置在 `74 猫咪叠罗汉` 与 `77 手偶活动` 之间。**别照方案1 的位置插。**
    - 该表**只服务「映射管理」的展示 / 导入导出 / 重置，不参与解析与话术生成**，所以补它零输出影响。
    - `tools/smoke.cjs` 加 **6d** 节 1 条（把 `mappingTypeSelect` 切到 `activity`，断言列表里出现「95打怪棋盘」），`tools/verify.mjs` 加 2 条（存在性 + 键数 = 39）；冒烟 59 → **60**。
  - 另注：方案1 里「静态 45 → 47」与实际不符（`verify.mjs` 的 `ok()` 当时只有 30 处），别照抄那个数。
- 本轮：**工程收尾**（未碰前端 `public/index.html` 一行）：
  1. `server.js` 给 `/api/data/:key` 加 **key 白名单**：`/^[A-Za-z0-9_-]{1,64}$/`，并显式拒绝 `__proto__` / `constructor` / `prototype`。起因是原来直接 `data[key] = value`，`POST /api/data/__proto__` 会去改写对象原型（原型污染）而不是存一个键。非法 key 返回 400。同时支持 `DATA_FILE` 环境变量覆盖落盘位置（自检脚本据此写临时文件）。**前端的 key 是 `work-bad_v2` 这类，落在白名单内，行为不变。**
  2. 新增 `tools/smoke-server.cjs`（真起进程 + 真发 HTTP，12 项）：5 种非法 key → 400、`Object.prototype` 未被污染、落盘文件无危险键、合法 key 读写往返一致。已挂进 `npm run verify` 末段。
  3. 删掉**从未被使用**的 devDependency `eslint`；`npm test` 从 `exit 1` 改为 = `npm run verify`。
  4. 顺带修掉一个**既有的 lockfile 不一致**（发现时 `npm ci` 在任何新克隆上都会直接失败）：`package-lock.json` 里**根本没有 jsdom 条目**，根 `devDependencies` 却只声明 eslint。已用工作区内缓存（`npm_config_cache=tools/out/npm-cache`）跑 `npm install --package-lock-only` 重新生成：-433/+729，**运行时依赖零版本漂移**（express 5.2.1 / cors 2.8.6 原样），diff 纯粹是「删 eslint 树 + 加 jsdom 树」。并在空目录实测 `npm ci` → 106 包装好、jsdom 29.1.1 到位、eslint 不再被安装。
  - 本机 `node_modules` 也已对齐：已装 jsdom 29.1.1（`require.resolve('jsdom')` 指向仓库内那份，不再回落 DSH），eslint 树已 prune；实测在真实 jsdom 下自检同样 60 + 12 全绿。
- 本轮：新增 **「客服生涯」标签页**（`data-tab="career"`）——按外部《工作量登记表》的 **14 个工作类型列**统计工作量，日报的「工单」「海外」两栏自动折算入账。
  - **口径模型（v9）**：`CAREER_SIDES = [工单, 海外]`；`CAREER_ITEMS = CAREER_TICKET_ITEMS.concat(CAREER_OVERSEAS_ITEMS)` = **39 项**（工单侧 29 / 海外侧 10）。
    - ⚠️⚠️ **两处的「异世界」是完全不同的数据，别合并**（用户明确说明）：
      - **工单侧 ⑦异世界勇者（微信/抖音/dy在线）= 各平台的「工单来访」** ← 来自工单日报那三个输入框。
      - **海外侧「异世界群维系」= 群维系的来访** ← 来自**海外日报**里的 `overseas.sj_group` 输入框（不读 `ticket.g7_*`）。
    - **工单侧 29 项 = 「工单日报」的全部数值字段（除姓名/班次），一个不排除**（`CAREER_TICKET_EXCLUDE_PREFIX = []`），**由 `DAILY_TICKET_FIELDS` 自动生成**（key 前缀 `t_`，label 直接用日报的 label）：
      - ⚠️ **以后往 `DAILY_TICKET_FIELDS` 加字段，工单侧会自动跟着有，不用手改**（verify 有断言锁这个构造方式）。用户给的清单就是「SSO工单…⑦异世界勇者」全要（第 4 轮口径，**以此为准**）。
    - 海外侧 10 项（手写 `CAREER_OVERSEAS_ITEMS`）：**异世界群维系←`overseas.sj_group`**、**（梦幻/繁花/乐缤纷）群维系←`overseas.mhl_group`**、**海外CP后台工单←`overseas.cp_ticket`**、**国内工单←`overseas.cn_ticket`**、海外SSO工单量←`overseas.sdk`、商店回复←`overseas.ios+google`、海外邮件←`overseas.email`、海外FB←`overseas.fb`、监控禁言←`overseas.mute`、监控封号←`overseas.ban`。
      - ⚠️ **「国内工单」与工单侧的「SSO工单」是两个不同的项**（用户确认）：前者在海外日报填，后者来自工单日报的 SSO工单。
      - ⚠️ 商店回复是**合并项**（ios+google），因为登记表那列是合并的；海外侧其余项与海外日报字段一一对应。
      - ⚠️ 登记表里那个群维系列写作「（繁花+乐缤纷+梦幻）群维系」（同一个东西、顺序不同）——见 `CAREER_IMPORT_ALIASES`。
      - ⚠️ 海外侧这 4 个群维系/CP后台/国内工单字段（`sj_group`/`mhl_group`/`cp_ticket`/`cn_ticket`）**都在海外日报表单里手填**，工单侧没有任何一项读它们；反过来海外侧也**不读** `ticket.g7_*`。所以两边不会互相重复。
      - ⚠️ **SDk 工单（2026-09 起拆三项填、合并成一个数算）**：海外日报表单里是 `sdk_mh`（梦幻）/ `sdk_ajs`（爱江山）/ `sdk_yl`（月光）三个输入框，`careerSdkTotal(o)` = 三项之和（**三项都是 0 时退回旧字段 `overseas.sdk`** —— 历史日报/登记表里只有总量、没有明细，不能丢）。日报正文与「来访总计」用的都是这个合并值，所以**正文格式没变**（还是 `SDk工单：N例` 一行）。海外侧统计里 `ov_sso`（海外SSO工单量）读的仍是 `overseas.sdk`（合并值），**合计里只算一次**；三项明细单独放在 `CAREER_SDK_BREAKDOWN`（梦幻/爱江山/月光），**只在 `careerAllItems()` 里（能导入导出/查看/补录），不进 `CAREER_ITEMS`** → 不重复计入合计。海外侧表格里它们是最后一组「SDk 明细（其中项，不重复计入合计）」的 3 行（`tr.career-sub-row`，占本侧一列显示 —）；补录表单里也有这三项，**保存时只要填了明细就把 `ov_sso` 改成三项之和**（跟归档口径一致）。
      - ⚠️ 粘贴导入日报文本时，正文只有合并后的 `SDk工单：N例` → `CAREER_OVERSEAS_LABEL_TO_KEY` 里手工补了 `'SDk工单' → 'sdk'`（表单已拆项，这个映射不再是自动推导出来的），导入后明细为空、总量正确（**这是有意的**，按侧覆盖时会连三项明细一起清掉，不留脏数据）。
  - **日报改动（用户明确要求）**：`DAILY_OVERSEAS_FIELDS` 新增 **4** 个 number 字段 `sj_group`（异世界群维系）/ `mhl_group`（（梦幻/繁花/乐缤纷）群维系）/ `cp_ticket`（海外CP后台工单）/ `cn_ticket`（国内工单），`DAILY_DEFAULT_DATA.overseas` 同步加默认值 0，`generateDailyReport()` 的海外分支在「禁言/封号」那行后**新增 4 行正文**（异世界群维系 → （梦幻/繁花/乐缤纷）群维系 → 海外CP后台工单 → 国内工单）。所以**海外日报的正文输出变了**（多 4 行），海外表单从 8 个字段变 12 个；**2026-09 又把 `SDk工单（来访）` 拆成 `sdk_mh`/`sdk_ajs`/`sdk_yl` 三个输入框（正文仍只写合并后的一行）→ 海外表单共 14 个字段（含姓名）**。
  - **`CAREER_HIDDEN_ITEMS`（只存档、不计入统计）= 4 项**：登记表里有、日报里没有对应字段的那几列——猫之城ios&B站评论回复、国内动物领主VIP、邮件+SDK（猫旅馆物语）、塔防FB（一直为 0）。
    - ⚠️ 它们可导入、**不进两侧卡片、不进「累计工作量」**；**2026-09 起页面上不再单独展示**（原来那张「🧩 对外报表口径（登记表 14 项）」卡片按用户要求删掉了），只继续参与**粘贴导入的「总计」对账**与 **CSV 导出**——数据模型 `CAREER_SHEET_ITEMS` / `CAREER_HIDDEN_ITEMS` / `careerSheetSum` 全部保留。
  - **`CAREER_IMPORT_ALIASES`**：登记表列名跟本系统标签写法不同的，导入时按别名对齐。目前两条：`（繁花+乐缤纷+梦幻）群维系` → `mhl_group`（海外侧群维系项）、`SSO国内工单` → `t_sso`（工单侧 SSO工单）。**所以历史数据的 142 会进海外侧统计、22 会进工单侧统计。**
  - **`extra` / 「①~⑥群维系不采集」都已成为历史**：工单侧现在**逐字段**统计工单日报（①~⑥ 各组平台各占一行），不再有聚合项或「不计入」的日报字段。
  - **两套口径**：`累计工作量` = 45 项（工单 29 + 海外 10 + 在线客服 6，界面各侧卡片与之对齐）；`登记表 14 列口径` = 登记表那 14 列（10 列已归入各侧统计，4 列只存档）。
    - **2026-09 起界面上只呈现统计口径**：顶部是一条**堆叠占比条**（`#careerSplitBar > i` 用内联色：工单 `--accent` 黄 / 海外 `#3d7bd6` 蓝 / 在线客服 `#16a34a` 绿，宽度按各侧累计占比，段窄于 12% 就不写字）＋ 图例 `#careerSplitLegend`（各侧的数与占比 + 合计）；下面 `#careerSheetHint` 一行写明「工单侧 X + 海外侧 Y (+ 在线客服侧 Z) = 累计 W；日均 …（按 N 个完整记录日）；数据只存在这台设备的浏览器里，不会同步给别的设备。」——**14 列口径不再出现在界面上**。⚠️ **在线客服侧还没有数据时（sum = 0）占比条 / 图例 / 芯片都不显示这一侧**，老记录的界面跟以前一模一样。
    - 用上传的表导入时**两者都是 5,623，与原表完全一致**（因为表里那 4 个只存档列全是 0）。
  - **导入的「总计」核对用 14 列口径**（不是统计口径），否则有群维系数据的天数会被误报成「总计对不上」。
  - **归档时机**：点「生成日报」时顺手归档当天；跨天自动刷新那条路径**故意不归档**（否则会把昨天的数记到今天）。同一天重复归档 = 覆盖。也可用页面上的「归档今日日报」按钮手动触发。
  - **补录/修正**：可指定任意日期载入→改数字→保存（`src:'manual'`），表单按两侧分组；也能删除某天。
  - **粘贴导入支持两种内容**（`careerImport` 先试日报、再走登记表）：
    1. **登记表 TSV**：从 Excel 直接复制那段表格。带表头按**列名**对齐（列顺序随意），不带表头按 A~T 顺序；日期接受 Excel 序列号或 `2026-06-03`/`2026/6/3`；同一天覆盖。若「总计」列与各列之和对不上，会提示并按各列之和入账。
    2. **工作台自己生成的日报文本**（`careerParseReportPaste`）：工单日报 / 海外日报**两段可以一起粘**，也能一次粘多天。识别「N月N日工作日报（N班）」与「姓名  N月N日」两种表头（年份取当前年）；工单侧认 `1、SSO工单5，…`、`①繁花微信【2】，抖音【0】…`（含 手Q / 支付宝后台 两种写法），海外侧认 `ios商店：9`/`FB：0例`/`禁言：7，封号：3`/`异世界群维系：0` 等「标签：数字」。
       - ⚠️ 标签→字段 key 的映射是**从 `DAILY_TICKET_FIELDS`/`DAILY_OVERSEAS_FIELDS` 推导**的（去掉 `·`、去掉末尾括号），日报改字段这里自动跟着变。
       - ⚠️ 折算复用 `careerItemsFromDaily(t, o)`（与点「生成日报」自动归档**同一套口径**），所以日报文本导入的结果与归档完全一致。
       - 覆盖策略：**按侧覆盖**——粘了工单日报就清工单侧旧值、粘了海外日报就清海外侧旧值，没粘的那侧保留（避免只补一段把另一段清空）。
  - **统计项**（用户要"更能量化工作成果"，已去掉面试/简历相关表述；**2026-09 按用户「更直观一点」重排过版式，又加了身份筛选 / 指标详情 / 折叠面板**）：
    - **身份筛选**：顶部 `#careerScopeBar` 四个按钮「全部 / 📋工单 / 🌐海外 / 💬在线客服」（`data-scope`，选中的加 `.active`；按钮是从 `CAREER_SIDES` 渲染的，`verify` 有断言）。`careerScopeState` 存在本机 `localStorage['careerScope']`（**不是 careerData，也不走服务端**），合法性用 `isCareerSide()` 判。`careerStats(scope)` 是唯一的开关：scope=某一侧时，每条记录的「工作量」改成**该侧项之和**（`careerSideTotal(rec, scope)`），于是日均 / 最高单日 / 连续记录 / 月度 / 趋势全部自动跟着身份走；scope=all 时和以前一模一样。选某一侧时：其他侧的统计卡 `careerCard{Ticket,Overseas,Online}` 隐藏（`CAREER_SIDES.forEach` 统一处理）、占比条 `#careerSplitWrap` 隐藏、`#careerSheetHint` 只讲那一侧。
    - **指标详情** `#careerDetailItem`（范围：全部工作量 / 工单侧 / 海外侧 / 逐项，含 SDk 三项明细）+ `#careerDetailGrain`（按日 / 按月）→ `#careerDetailSummary` 5 张小卡（总量 / 日均 / **按日时是中位数、按月时是月均** / 最高单日或最高月 / 记录天数或月数）+ `#careerDetailChart` 柱状（按日只画最近 90 个记录日）+ `#careerDetailTable`（期间 / 合计 / 日均 / 占总量）。取值走 `careerDetailValue(rec, sel)`。
    - **周维度**（`#careerWeeklyTable`，新卡「🗓️ 周维度」）：按**周一为一周第一天**聚合（`weekStartOf()`），列 = 周（周一～周日）/ 记录天数 / 总量 / 日均 / 最高单日 / **环比上周** / **同比（4 周前）** —— 没有去年数据，所以「同比」用 4 周前那一周当代理（表下有一行说明）。最近的在最上面。
    - **来源结构**（`#careerStructureBox`，在「趋势 · 月度汇总」卡里）：按 `kind`（来源大类）画一条多色占比条 + 图例（`CAREER_KIND_COLORS` 按顺序取色，段宽 <12% 不写字），下面一行 **Top3 集中度**（前 3 个单项的合计占比）+「N 个来源大类、M 项有产出」。**跟着身份筛选走**（选海外就只统计海外侧项）。
    - **异常日 & 峰值**（`#careerAnomalyBox` + 趋势条上色）：异常线 = `μ + 2σ`（`anomalyLine`，记录 <2 天或 σ=0 时不判定，只给说明），超过的日子列表里带「日期（值，几 σ）」；趋势条上异常日涂红（`.career-trend > span.anomaly`）、备注含 **`活动|版本|开服|更新|维护|上线|联动|新服`**（`PEAK_RE`）的日子涂橙（`.peak`），图例写在趋势条下方。峰值靠「补录 / 修正某一天」里的**备注**触发 —— 想让某天被标出来，就给那天写个带「活动」的备注。
    - 顶部 `#careerKpi` 是**两档 KPI 卡**（`careerKpiCard(label, value, sub, accent, mini)`，第 5 个参数 `mini` = 小一号的次要卡 `.career-kpi.mini`）：**主档 4 个**（黄底 `accent`）= 累计工作量（副标题「工单 X + 海外 Y」，选某一侧时变「占全部 X%」）/ 日均工作量（中位数）/ 最高单日（日期）/ 完整记录天数（待确认天数）；**次档 5 个**（`mini`）= 最低单日 / 波动（标准差+变异系数）/ 最长连续记录（+当前连续）/ 记录区间（区间天数+断档天数）/ 近 30 记录日日均（近 7 日 + 环比上月）。
    - 然后依次是：两侧占比条 + 图例 + `careerSheetHint`（见上「两套口径」）→ **工单统计 / 海外统计两张卡**（每张先 4 个 KPI：侧累计 / 侧内日均 / 侧内最高单日 / 有产出的项；再一张 4 列表格「统计项 / 累计 / 占本侧 / 结构」）→ **一张合并卡「📈 趋势 · 月度汇总」**（`#careerTrend` 最近 30 个记录日的单日柱 + `#careerCoverBox` 渠道覆盖一行 + `#careerMonthlyTable` 月度汇总：月份/完整天数/总工作量/日均/最高单日+日期/环比日均 + 合计行）→ **「🧪 数据质量与备注」**（待确认天数+日期明细、特殊问题清单）→ **「✍️ 补录 / 修正某一天」与「📋 粘贴导入」两张卡**（`careerEditToggleBtn`/`careerEditBody`、`careerImportToggleBtn`/`careerImportBody`，**默认 `display:none` 收起**，点标题才展开，`bindCollapse()` 绑定）→ CSV / JSON 导出。
    - **分组规则**：表格**先按 `kind` 分组、组内按累计降序**（`CAREER_KIND_ORDER` 决定组的先后），所以同一组的项必然连续、组小计只出现一次（以前按全局累计降序排、组标题会重复出现好几次）。工单侧 `careerTicketKind`：`kf53`/`alipay` → 「在线客服」，`sso` + `*_cp`（CP后台）+ `g1..g7`（群维系）→ **统一「工单/后台」**（用户要求把 CP后台与群维系并进来，所以工单侧现在只有 2 个分组），其余 → 「其他」。海外侧 `ov_cp` 也归「工单/后台」；`CAREER_SDK_BREAKDOWN` 那组永远排在最后（组标题带说明，`占本侧` 列显示 —，行是 `tr.career-sub-row` 缩进灰字）。
    - ⚠️ 原来单列的「月度汇总」卡和「渠道覆盖」卡**已并入「趋势 · 月度汇总」这一张**（渠道覆盖现在只剩 `careerCoverBox` 一行字；选某一侧时它变成「X 侧覆盖：N 项里有 M 项有产出」）。
  - **持久化：只存本机浏览器，不走服务端**（⚠️ 用户明确要求，2026-09 改的）。`careerData` 是 **localStorage-only**：归档 / 补录 / 删除 / 粘贴导入都只调 `careerSaveLocal()`，加载走 `careerLoadLocal()`（`applyState` 里写死 `careerData = normalizeCareer(careerLoadLocal())`，**不看服务端 bundle**；启动的 `Promise.all` 里也刻意不 `loadData(CAREER_KEY)`）。
    - **为什么**：不同客服在不同设备上打开工作台、各记各的日报，谁的数据都不该同步给别人。旧实现走 `/api/data/careerData`（落 `data.json`），换台设备打开时本机没有缓存 → `loadData` 去服务端兜底 → 看到的是「最后同步上来那个人」的统计（用户报的 bug 就是这个）。
    - ⚠️ **不要再把它改回 `loadData`/`saveData(CAREER_KEY…)`**（那两个会读写 `/api/data`）——`verify.mjs` 有 4 条静态断言锁死：helper 存在 + 不出现 `loadData(CAREER_KEY` / `saveData(CAREER_KEY` + `applyState` 不取 `b.careerData` + `careerSaveLocal();` ≥3 处；`smoke.cjs` 还会断言「整场跑下来**一次都没请求**过 careerData」＋「数据确实落在 localStorage」。
    - 换设备的办法：工具栏上的 **`📤 导入JSON`**（吃 `💾 导出JSON` 导出的文件，按日期合并、同一天以文件为准，提示写在 `careerArchiveHint`）＋ **`🧹 清空本机数据`**（只清这台设备的 localStorage，不碰服务端/别的设备）。
    - ⚠️ **「别的设备已经有我的数据了」怎么办**：旧版 `loadData` 在拉服务端数据时会顺手把值**缓存进那台设备的 localStorage**，所以那些设备本地也有一份副本 —— 改完之后它们读本机，**不会自动消失**。要么让那台设备点一次 `🧹 清空本机数据`，要么在它的控制台跑 `localStorage.removeItem('careerData')` 再刷新。反过来，自己这台设备的数据一直在本机、不受影响。
    - 服务端 `data.json` 里可能还留着历史 `careerData` 键，但**已经没人读它**。
    - 其它数据（`dailyData`/映射表/短语…）仍是「localStorage 优先 + 服务端兜底」，**没动**。
  - **测试**：`tools/smoke.cjs` 有 **8c**（自动归档折算、两侧拆分、工单日报全部字段进工单侧、海外日报 4 个新字段参与统计、两处异世界互不干扰、别名、登记表导入、补录、删除、导出、**只落本机不碰服务端**、`careerSheetHint` 文案只提统计口径（不许出现「登记表」）、`#careerSplitBar` 恰好两段 + 图例两侧的数、**「对外报表口径」整块已从页面移除**（`#careerItemTable` 为 null 且全文无该字样）、**SDk 三项明细各自留存 + 日报正文合并成 `SDk工单：12例`**、**工单侧只剩 2 个分组标题（CP后台+群维系已并进「工单/后台」）**、**海外侧 SDk 明细组 3 行 `tr.career-sub-row`**、**身份筛选 7 条**（海外 → 累计 51 / 工单卡隐藏 / 占比条隐藏 / 汇总行只讲海外 / localStorage 记住身份；工单 → 17 + 海外卡隐藏；全部 → 回到 68）、**指标详情 5 条**（范围下拉、全部按日总量 68、单项 `ov_sso` 按月 12、SDk 明细 `sdk_mh` = 5、按月表格）、**折叠面板 4 条**（默认收起 / 点标题展开 / 补录表单里有 t_sso、ov_sso、sdk_mh））→ **8d**（真去点「生成日报」拿到两段日报正文 → 删掉当天 → 粘回去导入，断言还原的数字/姓名/班次与归档一致、且「只粘工单那段时海外侧不被清空」）→ **8e**（重置模板保姓名）→ **8f**（10 条：`📤 导入JSON` 吃导出的文件 → 新日期进账 / 同一天以文件为准 / 提示写在 `careerArchiveHint`；`🧹 清空本机数据` → 记录归零 / localStorage 键删掉 / 有提示 / **一次都没碰服务端** / 空状态文案）四节，共 **165 项**（多出来的 9 条是周维度 / 来源结构 / 异常日 / 峰值标注）；`tools/verify.mjs` 有整块客服生涯断言（工单侧由 DAILY_TICKET_FIELDS 生成且不排除字段 + 29 项 + 海外侧 10 项覆盖海外日报全部 13 个数值字段（含 SDk 三项）+ 海外侧不读 `ticket.g7_*` + 14 列列名对得上（含别名）+ 只存档 4 项 + 日报标签映射/解析函数 + **只读本机 localStorage** 共 4 条 + 导入JSON/清空本机两个按钮 + **SDk 拆三项/合并总量/明细不计入合计** + **身份筛选 / 指标详情 / 折叠面板 / 工单分组合并**）。
  - **✅ 真实数据对账**：把上传的登记表 81 行（80 天）原样喂进粘贴导入，与表格自己的「月度汇总」「个人指标看板」逐项比对，**38/38 全对，且所有指标都跟原表一致**——79 完整记录天；**工单侧 22 + 海外侧 5,601 = 累计 5,623（= 原表累计工作量）**；海外侧含「异世界群维系 7」（登记表那列）+「（梦幻/繁花/乐缤纷）群维系 142」（别名那列）；**日均 71.2、最高单日 191 @ 2026-08-05、月度 1,312 / 1,614 / 1,572 / 1,125** 全部与原表看板一致；14 列逐项累计吻合；只存档 4 列都是 0。回放脚本是一次性的（`tools/out/`，未入库）。
- 本轮：**「重置模板」不再重置姓名**（用户需求）。`resetDailyBtn` 先把当前栏的 `name` 记下来，重建默认对象后再写回（原本空着就保持空着）；其余字段照旧回默认、自定义附加项照旧清空。确认文案由「含姓名」改成「姓名保留」。冒烟加 **8e** 节 5 条（工单栏保留 / 工单栏其余回默认 / 海外栏保留 / 海外栏其余回默认 / 重置海外栏不动工单栏），`tools/verify.mjs` 加 1 条静态断言；冒烟 116 → **121**。
- 本轮：**客服生涯改成「只存本机」**（用户报的 bug：别的设备打开看到的是我这边的统计）。原因：`careerData` 原来走 `loadData/saveData(CAREER_KEY…)` → `/api/data/careerData` ↔ `data.json`，**本机没有缓存时会拿服务端那份**（`loadData` 的兜底），于是所有设备共享同一份、谁最后同步谁的。
  - 改法：新增 `careerLoadLocal()` / `careerSaveLocal()`（只碰 `localStorage`），把 3 处 `saveData(CAREER_KEY, careerData)` 换成 `careerSaveLocal()`；`applyState` 里 `careerData = normalizeCareer(careerLoadLocal())`（**不看服务端 bundle**）；启动的 `Promise.all` 去掉 `loadData(CAREER_KEY, null)`、`raw` 不再带 `careerData`。**localStorage 键名仍是 `careerData`** → 各设备本地已有的记录照样在（`saveData` 以前是先写 localStorage 再 POST，所以本机那份一直是最新的）。
  - 结果：各客服各设备的数据**互不同步**；换设备要带数据就用页面上的 **JSON 导出 / 导入**。服务端 `data.json` 里可能还留着历史 `careerData` 键，但已无人读取。
  - 测试：`smoke.cjs` 的 career 读取从「POST 体」改为「读 localStorage」，并把「每次回写服务端」那条断言换成 3 条：**整场一次都没请求过 careerData** / 数据确实落在 localStorage / localStorage 记录数与界面一致；`verify.mjs` 把「走服务端持久化」那条换成 4 条**只准本机**的静态断言。冒烟 121 → **123**。
- 本轮：**油猴脚本 0.4.0 就发在原链接上**（用户要求：`E:\ai\gemjy-openid-helper.user.js` 那份不存在 → 把 0.4.0 全文贴过来；随后又要求「不能改到 `gemjy-openid-helper.user.js` 里面吗」→ 不另开新链接）。
  - `public/gemjy-openid-helper.user.js` 的内容**整体换成 0.4.0**，并把 `@updateURL`/`@downloadURL` 改回**这一条原链接**；曾经临时建的 `public/gemjy-openid-helper-0.4.user.js` **已删除**（那个 URL 一直 404，没人装上，删掉不会影响任何已安装的脚本）。
  - 效果：**装过 0.3.0 的人，Tampermonkey 检查更新时会自动升到 0.4.0**（同一 URL + `@version` 变大）；不需要重新安装、也不会多出一条链接。
  - 0.4 的功能差异：**头像提取**（新增纯函数 `isAvatarish` / `pickAvatar` + DOM 层 `avatarCandidatesOf`，记录多一个 `avatar` 字段，且头像会从截图列表里剔掉）、**卡片式面板**（左头像 + 右昵称/时间/openid/三列截图网格）、**问题文本只存不渲染**（`question` 仍在记录里，`buildItem` 里注释掉的 `.gj-q` 可随时打开）。
  - 单测补：**`isAvatarish` 11 条 + `pickAvatar` 9 条 + `buildRecord` 头像 6 条 + `mergeRecord` 头像 6 条**，并加「`@updateURL`/`@downloadURL` 的文件名 == 实际文件名」＋「文件里不出现 `-0.4` 临时链接」断言。125 → **169 项**。
  - 端到端假页面也加了头像 img（外加 14×14 的 icon 当噪声），断言头像被单独挑出、不重复进截图、面板里「有头像渲染 img / 没头像退化成昵称首字圆底」、**面板里没有 `.gj-q`**。
  - ⚠️ 过程中发现一个**测试夹具歧义**（不是脚本 bug）：假页面里原来那个 24×24 的 `avatar/default.png` 也是「头像候选」（URL 带 avatar），而 `pickAvatar` 取面积最小的，于是挑到了它、真头像反倒留在截图里。已把噪声图换成 **14×14 的 `static/icon.png`**（小于 `minAvatarSize` 16 且撞图片噪声表），夹具才无歧义 —— 真实页面上若同时存在「真头像」和「更小的头像角标」，确实会挑到小的那个，这是 `pickAvatar` 的既定取舍。
- 本轮：**客服生涯：换设备带数据 + 统计页面重排**（用户要求「对外报表口径这部分可以不要，统计的页面可以优化的更直观一点」）。两段改动，`public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` 三个文件：
  1. **换设备/清数据两个按钮**（上一提交）：工具栏加 **`📤 导入JSON`**（`careerImportJsonBtn` + 隐藏的 `<input type="file" id="careerImportJsonInput" accept=".json,application/json">`）与 **`🧹 清空本机数据`**（`careerClearLocalBtn`，`.reset-btn` 样式）。JS 新增 `careerImportJsonFile(file)`（FileReader → `normalizeCareer(JSON.parse(...))` → 按日期合并、同一天**以文件为准**）与 `careerClearLocal()`（confirm → 置空 `careerData` → `localStorage.removeItem(CAREER_KEY)`），两者都调新增的 `careerSetToolbarHint(text)` 把结果写进 `careerArchiveHint`（**不是** `careerImportHint`/`careerEditHint`，写错断言会红）。
  2. **删掉「🧩 对外报表口径（登记表 14 项）」整张卡片**及它的 `careerItemTable` 渲染块——**只删展示，数据模型没动**（`CAREER_SHEET_ITEMS` / `CAREER_HIDDEN_ITEMS` / `careerSheetSum` 照旧，粘贴导入的「总计」对账与 CSV 导出仍用 14 列口径）。
  3. **重排统计页面**：新增 `#careerSplitBar`（两段堆叠条）+ `#careerSplitLegend`；`careerKpiCard` 加第 5 个参数 `mini`（次要卡 `.career-kpi.mini`，小一号），KPI 分两档（主档 4 个黄底 + 次档 5 个）；`#careerSheetHint` 文案改成只讲统计口径 + 「数据只存在这台设备的浏览器里」；两侧表格从 3 列扩成 **4 列**（统计项 / 累计 / 占本侧 / 结构）并**按 `kind` 分组**（`td.career-group-cell` 组标题行，colspan=3，带组小计与组占本侧 %）；原「月度汇总」卡 + 「渠道覆盖」卡**合并进「📈 趋势 · 月度汇总」**一张（`careerCoverBox` 现在只剩覆盖那一行字）。新增 CSS：`.career-kpi.mini` / `.career-split-bar`（含 `>i.ticket`、`>i.overseas`）/ `.career-legend` / `.career-table td.career-group-cell`。
  - 测试：`smoke.cjs` 的 **8c** 补了 5 条（`careerSheetHint` 只提统计口径且**不许出现「登记表」**、堆叠条恰好两段 + 图例两侧的数、**「对外报表口径」整块已消失**、两侧表格按类别分组）、导入后的断言数字随之改成 `/=\s*累计\s*130/`；`verify.mjs` 加 1 条（导入JSON/清空本机两个按钮存在）。冒烟 **123 → 135**（其中 8f 10 条是上一提交的 JSON/清空测试）。
  - ⚠️ 这两个提交（JSON 导入/清空 + 本次重排）**都还没推**，`origin/main` 落后两个提交。
- 本轮：**客服生涯：身份筛选 + 指标详情 + 折叠面板 + SDk 工单拆三项**（用户要求）。`public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` 三个文件：
  1. **身份筛选**（`#careerScopeBar` 全部/工单/海外）：`careerStats(scope)` 接一个 scope，`careerSideTotal(rec, scope)` 决定每条记录算哪一侧的工作量，于是总览 KPI、趋势、月度、数据质量、汇总行全部跟着走；选某一侧时另一侧的统计卡 + 两侧占比条隐藏。身份存 `localStorage['careerScope']`（**第二个本机 key，不是 careerData、不走服务端**）。
  2. **指标详情**（新卡 `🔎 指标详情`）：范围（全部 / 工单侧 / 海外侧 / 逐项，含 SDk 三项明细）× 粒度（按日 / 按月）→ 5 张汇总小卡（总量 / 日均 / 期均或月均 / 最高 / 记录天数或月数）+ 柱状趋势 + 一张「期间 / 合计 / 日均 / 占总量」表；按日时柱状只画最近 90 个记录日，表格仍列全。取值 `careerDetailValue(rec, sel)`。
  3. **补录 / 粘贴导入改成折叠**：标题是 `button.career-collapse-btn`（带 `▾` 箭头 + `aria-expanded`），内容在 `#careerEditBody` / `#careerImportBody`，**默认 `display:none`**，`bindCollapse()` 绑定点开/收起。
  4. **工单统计的 CP后台 + 群维系 并进「工单/后台」**：`careerTicketKind` 改掉（只剩「工单/后台」「在线客服」「其他」三种，实际上只出现前两种）；顺带把海外侧的「海外CP后台工单」也归进「工单/后台」，免得它单开一个只有一行的组。**表格改成先按 kind 分组、组内按累计降序**（`CAREER_KIND_ORDER`），组标题不再重复出现。
  5. **海外 SDk 工单拆三项**：`DAILY_OVERSEAS_FIELDS` 的 `sdk` 换成 `sdk_mh`（梦幻）/ `sdk_ajs`（爱江山）/ `sdk_yl`（月光），**日报正文格式不变**（`careerSdkTotal()` 合并后仍写 `SDk工单：N例`，来访总计同样用合并值）；生涯侧新增 `CAREER_SDK_BREAKDOWN` 三项明细（在 `careerAllItems` 里、**不进 `CAREER_ITEMS`**，所以合计不重复计），海外侧表格最后一组展示、指标详情里可单独选、补录表单里可填（填了就同步 `ov_sso` = 三项之和）；`CAREER_OVERSEAS_LABEL_TO_KEY` 手工补 `'SDk工单' → 'sdk'` 以保住日报文本的往返导入。
  - 测试：`smoke.cjs` 加 **21 条**（海外表单 14 字段、SDk 三项各自留存、正文合并成 `SDk工单：12例`、工单侧只剩 2 个分组标题、SDk 明细 3 行、身份筛选 7 条、指标详情 5 条、折叠面板 4 条），**135 → 156**；`verify.mjs` 把「海外数值字段覆盖」改成 13 个（含 SDk 三项）、`careerStats()` 断言改成 `careerStats(scope)`，另加 6 条新断言（SDk 拆项 / 合并总量 / 明细不进合计 / 身份筛选 / 指标详情 / 折叠 / 工单分组合并）。
  - ⚠️ 本轮的 commit **也还没推**。
- 本轮：**客服生涯补运营口径：周维度 + 来源结构 + 异常日 + 活动峰值**（用户从「网易那份报告要哪些指标」里圈了这 4 项；`public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs`）：
  1. **🗓️ 周维度**（新卡 + `#careerWeeklyTable`）：`weekStartOf()` 按**周一为一周第一天**分组，列 = 周（周一～周日）/ 记录天数 / 总量 / 日均 / 最高单日 / **环比上周** / **同比（4 周前）**。**没有去年同周数据**，所以「同比」用「4 周前那一周」当代理（表下一行写明了）。最近的在最上面，表尾有合计行。
  2. **🧩 来源结构**（`#careerStructureBox`，放在「趋势 · 月度汇总」卡里）：按 `kind` 聚合画多色占比条 + 图例（`CAREER_KIND_COLORS` 顺序取色，`color:#fff` 写在行内免得深底看不清），下面一行 **Top3 集中度**（前 3 个单项及其合计占比）+「N 个来源大类、M 项有产出」。**跟着身份筛选走**。
  3. **🚨 异常日**：统计里算 `anomalyLine = μ + 2σ`（记录 <2 天或 σ=0 时不判定，只说明「记录太少/波动为 0」），超过的日子在 `#careerAnomalyBox` 里逐条列出「日期（值，几 σ）」，最多列 12 天；趋势条上异常日涂红（`.career-trend > span.anomaly`）。
  4. **活动峰值标注**：备注命中 `PEAK_RE = /活动|版本|开服|更新|维护|上线|联动|新服/` 的日子涂橙（`.peak`），`#careerAnomalyBox` 里也列出来。**触发方式是「补录 / 修正某一天」里写备注** —— 这是个隐式约定，别改关键词。
  - 测试：`smoke.cjs` 加 **9 条**（周维度表有周区间/环比/同比列 + 合计行；来源结构 5 段 + Top3；异常线 + 峰值块；假数据里把 2026-06-04 的备注改成「开服活动」→ 断言峰值被标出且趋势条上恰好 1 根 `.peak`），**156 → 165**；`verify.mjs` 加 4 条静态断言（周分组函数 + 周表、来源结构 + 配色、异常线 + PEAK_RE + 趋势条上色）。`AGENTS.md` 同步。
  - ⚠️ 这一条 commit 同样**还没推**（连同上面的身份筛选/指标详情/折叠/SDk 拆项一起）。
- 本轮：**整体换暗色主题（明日方舟 / 终末地 视觉语言）+ 客服生涯改成报表版式**（用户要求「更像专业的报表」「暗色系为主、眼睛舒服」）。只动了 `public/index.html` 的 CSS/HTML + 两处 JS 填充，**没有改任何业务口径与数据**：
  1. **`:root` 令牌整体翻成暗色**：页面底 `#090b0d`、面板 `#0e1216`、次级面 `#161b21`/`#1d242b`、侧栏 `#0b0e11`；文字 `#e9eef3 / #d5dde4 / #94a0ac / #66727e`（**不用纯白**，降低刺眼）；线 `#1d252c / #2b343d / #3d4854`；强调色统一成终末地黄 `#ffd60a`；圆角令牌全改直角（2/3/4/3px）；阴影改纯黑低透明。`body` 背景加网格线 + 两处极淡径向光斑，并设 `color-scheme: dark`（原生日期/下拉/滚动条也变暗）。侧边栏选中态由「深黄字」改成「黄字 + 左侧黄条 + 45° 菱形点」。
  2. **新增「暗色主题收口层」**（`<style>` 末尾，后置覆盖）：容器警示条纹顶条、卡片/模态框切角 `clip-path`、卡片黄竖条 + 更暗斜纹、按钮 hover 黄底黑字、输入框 focus 黄边光圈、表头深色带 + 斑马纹、侧边栏编号 `01…06`、滚动条直角。
  3. **客服生涯报表版式**：新增报表抬头（`WORKLOAD REPORT / 工作量统计报表` 英文 kicker + 标题 + 数据范围/口径 + 右上 5 格元数据：身份/记录天数/累计/日均/出具日期，`renderCareer()` 填）；卡片自动编号 `01…`；KPI 卡改等宽大数字 + 右上角刻度线；表格分组标题行黄字、合计行黄线；报表页关掉斜纹底。顺手把 `#e0e0e0`/`#ccc`/`#f8f9fa` 四处硬编码浅色换成令牌（拼豆工具栏、导入结果框、分隔线）。
  - 测试：`smoke.cjs` 加 **2 条**（报表抬头的 kicker/数据范围/口径、右上 5 格元数据），**165 → 167**；`verify.mjs` 加 **5 条**静态断言（暗色令牌值、浅色令牌已清除、暗色基底要素、编号体系、报表抬头 + 渲染时填充）。CSS 花括号平衡已核（333/333）。
  - ⚠️ **沙箱里没法截图验证**（`vision_html_screenshot` 找不到 chrome；Edge headless 因禁命名管道 `mojo platform_channel` 失败），所以暗色观感是按令牌逐项推演的 —— **上线后如果哪块对比度不合适，直接说哪一块，改收口层那一小节即可**。
- （补记，前面几条的正文见对应小节）`5ad7894` 换成**柔和白浅色主题** + 新增「📮 反馈模板」标签页（来源加企微）；`7b046e7` 加「自定义背景色」（侧边栏底部调色条，一版就废）；`8dd1c47` 把界面设置挪到**侧边栏抬头齿轮**（背景色 / 强调色 / 渐变，见「界面设置」小节）；`9009998` 修复**强调色选了没反应**——`themeMix(c, target, ratio)` 把 `{r,g,b}` 当数字算，`#aNaNaN` / `rgba(NaN,…)` 是非法颜色值、整条声明被丢弃，所以「像被取消了」；改成逐通道混，并加断言 + `isColor()` 逐条校验防复发。
- 本轮：**反馈来源「抖音在线」改名「抖音小店」+ 新增「乐缤纷CP后台」模板与来源**（用户：「抖音在线改成抖音小店，加个乐缤纷cp后台的反馈，格式是这样 / 乐缤纷 / 渠道： / 问题： / 角色ID： / 来源：乐缤纷CP后台」）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. `FB_SOURCES` 第 1 项 `'抖音在线'` → `'抖音小店'`（默认来源 `fbSource` 同步改，HTML 里那片选择片也改了）；**旧的 `feedbackTplState` 里存的「抖音在线」认不出来就回落默认值**，不需要迁移代码。
  2. 新增 **第 4 个模板** `lebifen`「乐缤纷CP后台」（`FB_TEMPLATES`，排在常规游戏与内部工单之间）与 **第 12 个来源** `乐缤纷CP后台`（排在繁花CP后台与企微之间）。
  3. 输出**固定五行**：`乐缤纷` / `渠道：` / `问题：` / `角色ID：` / `来源：<选的来源>`（见下一条：输入格式后来按用户给的原文改过一次）。
  4. `fbSetTemplate`：选这个模板时**顺手把来源切成「乐缤纷CP后台」**（这行来源固定是它）；之后再点别的来源片，`来源：` 照旧跟着变。
  5. `fbMismatch` 给新模板加拦截：内容是内部工单。**没有**给常规/梦幻模板反向加「内容像乐缤纷就拦下来」——那会改变已有行为，先不动。
  - 测试：`smoke.cjs` 8h 加断言，并把来源片下标跟着改成 11（企微）、内部工单模板下标改成 3；`verify.mjs` 3e 加 2 条，来源数断言 11 → 12（引号 24 个）、并在断言里锁死 `!抖音在线`。
  - ⚠️ 顺手把 AGENTS.md 里过期的数改成实际值：冒烟 233/236 → **243**，`public/index.html` 约 12500 行 → **约 13200 行**（实测 13224 行、LF、无 BOM）。
- 本轮：**乐缤纷CP后台改成粘后台表格的行**（用户发来后台截图 + 复制出来的原文：「乐缤纷的反馈是复制的这样的」）。上一轮按「游戏日志」写的乐缤纷解析对不上真实输入，这次重写（`public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件）：
  - 真实输入（用户给的原文，制表符分隔、11 列）：`92930999⇥weChat (wechat)⇥2.1.7.62⇥问题反馈⇥没有显示也没有发掘币⇥2026-10-02 10:05:53⇥未查看⇥⇥⇥2026-10-02 10:05:53⇥回复 删除`，列序 = 账号 / 渠道 / 版本号 / 类型 / 问题 / 提交时间 / 状态 / 回复 / 回复人 / 回复时间 / 编辑。
  - 新增 `fbLebifenCells`（有制表符按制表符拆，否则按 2 个以上空格拆）/ `fbLebifenRows`（逐行解析）/ `fbLebifenText`（出一段五行）；**第 1 列当角色ID、第 2 列当渠道、第 5 列当问题**，`fbGenerate` 里对 `lebifen` 单独分支（**不再走 `fbBuildGameText`**，那个 `lebifen` 分支已删）。
  - **一次复制多行 → 每行一段、段间空一行**（用户选的：经常选中多行），提示写「生成 N 段」。
  - 复制时**带上表头行会跳过**（首列是「账号」或同时出现「账号」「渠道」）；**只复制了少数几列**（<5 列）时按内容认（数字账号 / `FB_LB_CHANNEL_RE` 命中渠道 / 最长那句当问题，`FB_LB_NOISE_RE` 排除表头词与状态词）。
  - 一行都认不出来 → **不生成**，提示「没认出乐缤纷后台的行：请把后台表格里复制出来的整行…」；`fbMismatch` 对乐缤纷只留「内容是内部工单」这一条（原来那条「游戏名带梦幻消除战」跟着游戏日志分支一起删了）。
  - `③ 粘贴原始字符串` 的说明与占位符补了乐缤纷的例子（`&#9;` 表示制表符）。
  - 测试：`smoke.cjs` 8h 改成 7 条乐缤纷断言（用户原文那行逐字比对 / 选模板时来源跟着切 / 一次多行出两段且段间空一行 / 带表头跳过 / 只复制三列也能认 / 认不出来不生成 / 内部工单被拦），并把内部工单模板的下标跟着改到 3；**240 → 243**。`verify.mjs` 3e 再加 2 条（`fbLebifenRows` 的制表符分列 + `cells[4]` 当问题 + 跳表头 + `join('\n\n')`、以及三个正则常量），**11 → 13**。
- 本轮：**反馈模板的来源按模板分（并且全都不留「电话」）+ 海外业务统计改成只存本机、删一项、加详情图表**（用户三件事一起提）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. **来源删「电话」**：`FB_SOURCES` 从 12 个变 **11 个**（DOM 里的来源片也删掉那一颗）。
  2. **每个模板的来源各不相同**（新增 `FB_TEMPLATE_SOURCES` + `fbAllowedSources()` / `fbAllowedSource()`）：`menghuan` 8 个（去掉 爱江山 / 繁花 / 乐缤纷CP后台）、`changwu` 与 `gongdan` 11 个、`lebifen` 只有「乐缤纷CP后台」。`fbRenderChips()` 用 **`style.display='none'`** 藏掉不该有的片（不用 `hidden`，`.fb-chip` 自带 display）；换模板时来源若不在新列表里就落到**新列表的第一项**；`fbSetSource` / `fbLoadState` 都按这套校验；抬头「来源总数」按当前模板算。
  3. **海外业务统计去掉服务端**：删掉 `ovbizPushServer` / `ovbizSyncFromServer` / `ovbizManualSync` / `ovbizMergeData` / `ovbizRowSig` / `ovbizSyncState` / `ovbizSyncing` / 「🔄 同步服务端」按钮 / 懒加载后那次同步；导入与清空只调 `ovbizSaveCache()`（清空文案改成「只影响本机」，按钮改名「🧹 清空本机数据」）；`#ovbizSyncHint` 与 `#ovbizSheetHint` 文案改成「只存在这台设备的浏览器里 / 不上传服务端 / 换设备用导出CSV」。**换模板那套「三个人共用一份」的说明一并删掉**（顶部、运行、海外三处都改了）。
  4. **删统计项「邮件+SDK（猫旅馆物语）」**：`OVBIZ_ITEMS` 11 → **10**，`OVBIZ_ALIASES` 里那条「邮件+SDK」也删了；页面说明与逐项统计表标题都从 11 改成 10。⚠️ 客服生涯 `CAREER_HIDDEN_ITEMS` 里的同名项**没动**（那是登记表口径、只存档）。
  5. **加图表**：岗位总览卡里新增 **`#ovbizTrend`** 走势条（最近 30 个记录日，异常日 `.anomaly` 涂红、备注命中新加的 `OVBIZ_PEAK_RE` 涂橙 + `.career-legend` 图例）；新增整张 **「🔎 详情图表」卡**：`ovbizDetailOptions()` / `renderOvbizDetail()` / `ovbizDetailValue(day, sel)` → 5 张汇总卡 + 柱状（按日只画最近 90 个）+ 逐期表；`ovbizRender()` 末尾调它一次，两个下拉各绑 `change`，切标签页也重画。
  - 测试：`smoke.cjs` 8g 整节重写（**30 条**：加了「全程零请求 / 服务端没有这份数据 / 没有同步按钮 / 状态行与汇总行都讲只存本机 / 走势条 2 根且 peak 涂色 / 详情图表可选 11 个范围·默认 277·切按月→月均·切监控禁言→31」，逐项表断言改成 10 行且不含「邮件+SDK」），8h 加 2 条（来源片 11 个无电话、梦幻默认藏掉那 3 个来源、换模板来源保持 + 来源总数 8）；**243 → 248**。`verify.mjs` 3d 断言从「服务端共享」整段换成「只存本机 + 10 项 + 没有邮件+SDK + 15 个容器 + 详情图表 + 走势条上色」；3e 加「每模板来源表 + 按模板隐藏来源片」；静态断言 9/13 → **11/14**。
  - ⚠️ **`public/index.html` 里 `ovbizSyncHint` 这个 id 保留着**（承载「只存本机」那行说明），只是不再有同步语义 —— 别再据此以为还有服务端同步。
- 本轮：新增 **「🧋 下午茶」投票功能**（用户：「统计点什么奶茶和吃的，可以预设好店家，当天可以发起投票，不同设备上打开网站可以选择店家，支持多选，选择完不同的设备的结果会统计在一起，还可以分享投票的链接给其他设备，打开只有投票的页面」→ 先出方案、用户确认后开工，并在方案上加了「到当天 23 点就清除不保留」）。分 3 个提交：
  1. **`server.js` 加 `/api/vote/:key`**（GET 读 + 顺手清过期；POST 原子合并 `votes[voterId]`）：key 限 `^teaPoll_\d{8}$`、voterId 限 `^[A-Za-z0-9_-]{1,64}$`、shopIds 限数组（≤50、去重）；404 没发起 / 409 已截止 / 410 已过期 / 400 参数非法。**过期 = 北京时间当天过了 23:00（或日期早于今天）→ `delete data[key]`，惰性清理**（`isVoteExpired` + `beijingNow()`，服务器时区可能是 UTC 所以显式 +8）。`tools/smoke-server.cjs` 加 **16 条**（合并 / 改票不丢别人 / 非法参数 / 404 / 409 / 过期被真删 / 23:00 前不误删），**12 → 28**（后来又加了「截止时间」相关 7 条 → **35**）。
  2. **前端「下午茶」标签页**（`data-tab="tea"` / `#tab-tea`）：🍵 店家（存服务端 `teaShops`，只有店名 + 备注，可编辑/删除/导入导出 JSON）+ 🗳️ 今天的投票（多选「今天开哪几家」→ 写 `teaPoll_<今天>`，带 `shopNames` 名字快照、标题默认「M月D日 下午茶」、可选截止时间、分享链接与分享文案、截止 / 清空）+ ✅ 我要投（多选片 → POST `/api/vote`，本机 `teaVoterId` 一台设备一票，撤销 = 提交空数组）+ 📊 实时结果（只按店家计票数/占比/结构条/最热，**不显示谁投了什么**，可复制纯文本）。本机另存 `teaPollCache` 做离线兜底；页面开着时 20 秒自动刷新一次。
  3. **`?vote=teaPoll_YYYYMMDD` 只投票页**：启动最早期解析 query → `<html data-vote-only="1">`，CSS 藏掉 `.tabs`（侧边栏）/`#teaShopCard`/`#teaPollAdminBox`/`#teaReportHead`，只留投票页（单列大按钮，手机友好），并 **`if (!TEA_VOTE_ONLY)` 跳过启动那 9 个请求**；`teaPollKey` 用链接里的那一天。
  - 测试：`smoke.cjs` 新增 **8j 节 27 条**，并且**把 fetch mock 抽成 `makeFetchMock(store, log)`**（照真服务端实现 `/api/vote` 合并与过期清理），**另起第二个 jsdom 带 `?vote=` 打开**、与主 jsdom 共用同一份 `serverData` 来模拟「两台设备连同一个服务端」→ 断言只投票页藏了侧边栏/没发启动请求/能投，且**两台设备的票统计在一起**；**248 → 284**（后来加截止时间 → **296**）。`verify.mjs` 新增 **3g 节 10 条**静态断言（含 `server.js` 的 `/api/vote`、`data-vote-only`、分享链接、跳过 bootstrap）。
  - ⚠️ 口径记牢：**这是唯一走服务端的业务数据**（`teaShops` / `teaPoll_*`），跟 `careerData` / `overseasBizData` 只存本机相反；**23:00 后不留档**（连数据一起删，不是隐藏）；**投票里不存投票人姓名**。
- 本轮：**下午茶投票加「可设截止时间」**（用户：「投票要可以设置截止时间，截止后只展示投票结果无法继续投票，直到 23 点将其清除」）。改了 `public/index.html` + `server.js` + `tools/smoke.cjs` + `tools/smoke-server.cjs` + `tools/verify.mjs` + 本文件：
  1. **`poll.deadline` 从自由文本改成北京时间的 `'HH:MM'`**：`#teaPollDeadline` 改成 `type="time"`（前端 `teaDeadline()` 只认 `HH:MM`，格式不对当没设）；`teaStartPoll` 存 `deadline: dl`，**填了已经过去的时间会被拦下**（否则一发就「已截止」）。`teaRenderAll` 回填时也走校验。
  2. **到点 = 只读**（不是删）：新增 `teaClosedReason(poll)`（前端）/ `voteClosedReason(poll)`（服务端）—— `status==='closed'` → `'manual'`，`deadline` 到点 → `'deadline'`（`'HH:MM'` 字典序 == 时刻序，直接字符串比）；`GET /api/vote` 多返回 `closed` / `closedReason`；`POST` 到点返回 **409**（文案带 `HH:MM 截止`）。**数据一条不动，23:00 才由 `isVoteExpired` 惰性删掉**。
  3. **前端到点后只展示结果**：`#teaVoteOpenBox`（多选片 + 提交/撤销）整块 `display:none`，露出 `#teaVoteClosed` 的「🔒 已在 HH:MM 截止 —— 现在只能看下面的「📊 实时结果」…」；`teaSubmitVote` / `teaClearMyVote` 先挡（**不发请求**，提示「只能看结果」）；状态行写「进行中（HH:MM 截止，还有 …）」或「已在 HH:MM 截止（只展示结果）」；`#teaResultMeta` 与复制结果文案都带上截止说明。**`?vote=` 只投票页同样收起**（手机上打开就是只看结果）。
  4. **测试**：`smoke.cjs` 8j 加 **12 条**（`type=time` / deadline 入账 / 状态行 / 过去时间被拦 / 到点后收起 + 数据还在 + 结果照常 / 到点后前端不发请求 / 直接 POST 被 409 挡 / 改回未到点又能投 / 手动截止也是「只能看结果」+ 只投票页那 2 条），**284 → 296**；`smoke-server.cjs` 加 **7 条**（到点前 200 / 到点后 GET `closed:true,closedReason:'deadline'` 且数据还在 / 到点 POST 409 且没写进去 / deadline 写法不对当没设 / 手动截止 `'manual'`），**28 → 35**。mock（`makeFetchMock`）照服务端把 `closed`/`closedReason` 与 deadline 判定一起实现了。
- 本轮：**下午茶界面收干净 + 店家永不丢 + 去掉备注**（用户：「下午茶的预设店家要保留，不需要也被清除，店家那里的备注可以不用，下午茶的界面有点乱」）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. **店家换成 `{ id, name }`（备注整段拿掉）**：DOM 里删掉 `#teaShopNote`，表格只剩「店家 / 操作」两列（`colspan` 跟着改），`teaShopSave` / `teaShopEdit` / `teaNormalizeShops` 都不再碰 `note`（老数据里的 `note` 读进来直接忽略）；`teaChipRow` 的 title 改用店名。⚠️ 用户此前就说过「没有备注不影响」，这次是**明确要求删**。
  2. **店家管理收进折叠面板**：`<details class="card tea-shop-card" id="teaShopCard">`（**默认收起**，`summary` 上带「（N 家）」由 `teaRenderShops` 更新 + 「点开管理；一直保留，不会被清空」），配 CSS `.tea-sep`（虚线分隔「发起 / 管理」）与 `details.tea-shop-card > summary` 的展开箭头。
  3. **页面从 4 张卡压成 2 张 + 折叠**：主卡「🧋 今天的下午茶」= 上半 **我要投**（`#teaVoteOpenBox`，到点/手动截止整块收起）+ 虚线下面 **`#teaPollAdminBox`「发起 / 管理」** + `#teaPollStatus`；第二张「📊 实时结果」；店家排最后且默认收起。顺带删掉上一轮加的两行长提示、按钮文案缩短（「🚀 发起 / 更新」「⏹️ 截止」「🧹 清空票」）。⚠️ **只投票页仍然只藏 `#teaPollAdminBox`**，投票区照常在。
  4. **店家保证不丢**：新增本机备份 `localStorage['teaShopsCache']`（`teaSaveShopsCache` / `teaLoadShopsCache`）——`teaSaveShops` 与 `teaLoadShops` 都会写它；`teaLoadShops` 若发现**服务端一家都没有**而备份还在，就**自动用备份恢复并 POST 回服务端**（提示「已用本机备份恢复 N 家」）。⚠️ 只有「服务端空 + 备份非空」才恢复，用户主动删光不会被复活；另外 23:00 清的只是 `teaPoll_*`，`teaShops` 从来不参与。
  5. **测试**：`smoke.cjs` 8j 加 8 条（`<details>` 默认收起 / 没有备注输入框 / 表格两列 / 服务端店家不带 note / 本机备份写入 / 折叠标题带家数 / 服务端清空后用备份自动恢复 / 恢复提示；另加「投票被 23:00 清掉后 `teaShops` 原样还在」），**296 → 304**；`verify.mjs` 3g 加 2 条（备注整段拿掉 + 折叠面板；`teaShopsCache` 本机备份 + 自动恢复 + 吃纯店名数组），**13 → 15**。`smoke-server.cjs` 不变（**35**）。
- 本轮：**新增「SOP 助手」标签页（基于客服 SOP 的功能，一期）**（用户：「我想做一个基于客服sop的功能，具体可以怎样实现」+ 8 份内部文档；问完选了：**做进 index.html 的新标签页 / 手工骨架 + 之后加导入 / 服务端共享 + 给 sop 数据加口令 / 一期做「检索+处理卡、红线检查、信息清单→提单」**）。改了 `server.js` + `public/index.html` + `tools/sop-seed.cjs` + `package.json` + `tools/smoke.cjs` + `tools/smoke-server.cjs` + `tools/verify.mjs` + 本文件：
  1. **先把 8 份附件抽成文本看结构**（`tools/out/sop/`，gitignore，不入库）：`tools/out/sop-extract.cjs`（xlsx/docx/pptx 零依赖解包抽文本）+ `tools/out/xls-text.cjs`（两个 `.xls` 是 BIFF，只能粗糙扒文本）。得到：SOP docx 69 个二级场景 / 32 处「内部严禁」；后台话术 53·抖小·海外 三张表（122/136/49 行）；游戏问题处理流程按产品分页；客服规范总汇 38 页（含妖怪 855 行、攻沙 484 行行为对照表）。
  2. **服务端口令**：`server.js` 新增 `SOP_TOKEN`（环境变量）+ `SOP_KEY_RE = /^sop/i` + `denySop()` + 常量时间比较 `tokenEq()`；**只有 sop* 前缀的 /api/data 要口令**（头 `x-sop-token` 或 `?token=`），没配 `SOP_TOKEN` 一律 403；其它 key（work-bad_v2 / teaShops / teaPoll_*…）行为不变。`smoke-server.cjs` 起进程时带上 `SOP_TOKEN` 并加 7 条断言，**35 → 42**。
  3. **前端**：新标签页 `data-tab="sop"` / `#tab-sop`（侧边栏在「反馈模板」下面，复用 `.career-report-head` + 卡片样式，新增 `.sop-*` 一小段 CSS）：🔍 查场景（关键词/分类/渠道，命中 1 条自动展开；场景卡 = 流程/要收集/话术逐条复制/⚠️内部口径红框/升级/提单格式/依据）、🚩 红线检查（词表 + 正则，命中给原因与替换口径）、🧾 信息清单→提单文本（勾选 + 三要素 + 还差 + 提单字段）；数据优先级 = 本机导入 `sopBundleLocal` > 服务端 `sopBundle`（带口令）> **内置示例 `SOP_DEMO`（8 场景，去掉姓名/电话）**；「⚙️ 数据与口令」里填口令、粘贴导入/复制 bundle。
  4. **数据**：完整 bundle（19 个场景 + 12 条红线，从文档整理、姓名脱敏）写到 `tools/out/sop/bundle.json`（**gitignore，不入库**），`npm run sop:seed`（`tools/sop-seed.cjs`）读它 POST 到 `/api/data/sopBundle`（要 `SOP_TOKEN`）。
  5. **测试**：`smoke.cjs` 新增 **8k 节 23 条**（标签页/来源/容器/默认入口/命中展开/订单号与话术/内部口径标出/复制话术/搜不到给提示/分类筛选/红线命中两处并给替换/干净话不误报/清空/清单生成文本/复制/导入 bundle 生效并推服务端），**304 → 327**；`verify.mjs` 3h 8 条静态断言。`npm run verify` 全绿（327 / 42 / 169）。
  6. ⚠️ **二期（用户也勾了但没做）**：各游戏后台行为对照表、合区查询、常用语库、xlsx 自动导入 —— `合区表.xls`/`全部常用语.xls` 得先另存 `.xlsx`。
- 本轮：**SOP 助手加页面加密门 + 处理流程改成步骤条**（用户：「SOP 助手加密使用，设备首次进入该功能要输入『客服冷静』，账号密码信息不保留，流程可以用更直观的形式呈现」）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. **加密门**：`const SOP_PASS = '客服冷静'` + `let sopUnlocked = false`（**只在内存**）；`#sopLockCard`（🔒 + `#sopPassInput` type=password + 进入 + 提示）与 `#sopBody`（三个功能卡 + 数据卡）互斥显示，由 `sopApplyLock()` 切换、`sopUnlock()` 校验；**锁着不发 `sopBundle` 请求**（`sopInit()` 先判锁）；口令与输入**不写 localStorage / sessionStorage / 服务端**，成功后清空输入框，所以每次刷新都要重输。
  2. **流程直观化**：处理流程渲染成 `.sop-steps` 竖版时间轴（编号圆点 `sop-step-n` + 正文 `sop-step-x`，竖线 `li::before`、末项隐藏），要收集渲染成 `.sop-needchip` 小片；内部口径仍是 `.sop-internal` 红框。
  3. **测试**：`smoke.cjs` 8k 加 10 条（锁屏/不解锁不发请求/错口令清空/空口令提示/对「客服冷静」才进/成功后清空输入/口令不在本机存储里/步骤条编号 1·2/要收集小片 ≥3），**327 → 337**；`verify.mjs` 3h 加 2 条（加密门实现 + 步骤条与小片），**8 → 10**。`npm run verify` 全绿（337 / 42 / 169）。
- 本轮：**处理流程换成五环节思维导图（点环节出这一步的话术）+ 「数据与口令」写清用法**（用户：「处理流程可以用思维导图表示，详细参考客服问题流程文档里的流程图，点击不同环节可以出现对应的几个话术，数据与口令要怎么使用」）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. **导图**：场景卡的「处理流程」按 SOP §2.1 主流程画成 **提交 → 核实 → 处理 → 登记 → 回访** 五环节（`SOP_FLOW`），左边场景名、右边五条分支带连线；顶部再加一条 `提交 → 核实 → …` 的闭环小片。**点任一环节 → 下面 `#sopStageScripts` 列出这一步的步骤 + 该说的几句话术（可单条复制）**，流程图与导图里的该环节同时高亮。
  2. **映射**：`sopStageOfStep()` 用每个环节的 `strong`/`weak` 词表打分（权重 2 / 1，同分取靠前环节，0 分落「处理」）；话术按 `tone` 走 `SOP_TONE_STAGE` 挂环节。用真实 bundle 31 个场景跑过一遍分布（提交 21 / 核实 43 / 处理 46 / 登记 9 / 回访 6 步），个别场景某环节没有专属话术时明确写「这一步没有单列话术 —— 先用整卡话术」并列出整卡话术，不硬凑。
  3. **删掉旧步骤条**（`.sop-steps` / `.sop-step-n` / `.sop-step-x`）与对应 CSS，换成 `.sop-flowline` / `.sop-mind*` / `.sop-stage-scripts`（0 步 0 话术的环节 `.sop-mind-dim` 变淡）；「要收集」小片与内部口径红框不动。
  4. **数据与口令**：卡里补了 ①②③④ 使用说明（口令 = 服务端 `SOP_TOKEN`，**不是**解锁口令「客服冷静」；只存本机；403 回落内置示例；本机导入/复制备份），并新增状态行 `#sopDataStatus`（`sopDataStatus()`，`sopLoad` / 导入 / 保存口令后刷新）显示「口令已填/未填 · 数据来自 X · 服务端 key sopBundle」；403 提示文案也改成「口令没填 / 填错，或服务端没配 SOP_TOKEN」。
  5. **测试**：`smoke.cjs` 8k 换成导图断言（5 环节小片 + 5 环节节点 + 导图挂步骤 + 默认提示 + 点「核实」出步骤与可复制话术 + 双向高亮 + 换「处理」跟着换 + 环节话术复制）+ 2 条数据与口令（卡里说明、状态行），**337 → 345**；`verify.mjs` 3h 由 1 条步骤条断言换成 4 条（分组函数 / 导图结构 / 连线与高亮 / 数据与口令说明），**10 → 13**。`npm run verify` 全绿（345 / 42 / 169）。
  6. **顺手**：`tools/out/sop/bundle.json`（gitignore）里补了 13 个产品专项场景 + 1 条红线（来自附件《梦幻消除战》《唱全明星》SOP），`version: 2`，19 → **31 个场景**；要上线得用户自己 `npm run sop:seed`（要 `SOP_TOKEN`）。
- 本轮：**SOP 加常用语库 + 话术可编辑 + 版面放松；海外日报把 FB 拆成梦幻/月光**（用户：「话术参考一下这个文件，后续要可以添加修改已有的话术，整个 SOP 功能页面字有点多和紧凑，能不能弄个更容易看的样式，海外客服的日报增加月光的 fb，数据统计单独，不合并在原有的梦幻 fb 中」+ 附件《全部常用语.xls》）。改了 public/index.html + tools/smoke.cjs + tools/verify.mjs + 本文件：
  1. **常用语库**：bundle 加 phrases[]（id/cat/tone/text），SOP 标签页新增「💬 常用语库」卡：关键词搜索 + 14 个分类片 + 复制/新增/改/删；默认只报「共 N 条」不铺满。数据来自《全部常用语.xls》（老 BIFF，先用 tools/out/xls-text.cjs 扒出可读句子，再人工整理成 57 条写进 gitignore 的 tools/out/sop/bundle.json，version 3）；仓库里的 SOP_DEMO 只放 3 条通用口径。
  2. **话术可编辑**：场景卡每条话术加 ✏️ 改 / 🗑 删、「＋ 加话术」；与常用语库共用编辑框组件 sopEditHtml；保存走 sopScriptSave/sopPhSave → sopPersist（写 localStorage sopBundleLocal + 尝试带 x-sop-token 推服务端），抬头来源自动变「本机导入」。
  3. **版面**：.sop-block 卡片化（边框/浅底/内边距 + 标题黄细条）、.sop-script 独立小卡、行高 1.7 → 1.9，提单格式与依据条款折进 details.sop-fold（默认收起），常用语库默认不展开 —— 就是「字少一点、松一点」。
  4. **海外日报 FB 拆分**：DAILY_OVERSEAS_FIELDS 把 fb 改名「FB·梦幻（来访）」并新增 fb_yl「FB·月光（来访）」（表单 14 → 15 字段）；日报正文改成「FB·梦幻：N例 / FB·月光：N例」两行、来访总计两项都算；CAREER_OVERSEAS_ITEMS 拆成 ov_fb（海外FB·梦幻）/ ov_fb_yl（海外FB·月光）两项（海外侧 10 → 11，合计 39 → 40）；粘贴导入的日报标签映射兼容旧的「FB：」（归梦幻），CAREER_IMPORT_ALIASES 加了「海外FB（全产品）」→ov_fb、「海外FB·月光」/「月光FB」→ov_fb_yl。海外业务统计（周报表）不动，仍是「海外FB（全产品）」一列。
  5. **测试**：smoke 8c 字段数 14 → 15、月光FB 填 2（当日 68 → 70、海外 51 → 53，后续 130/134/72 一并对齐成 132/136/74）+ 新增 2 条（月光FB 单独入账不并进梦幻FB、日报正文两行），8k 加 14 条（话术编辑 7 + 常用语库 7），**345 → 361**；verify 3h 加 4 条（常用语库 / 话术编辑 / 落盘 / 版面），**13 → 17**，并把 3b 的数字改成 14 字段 / 11 项 / 29+11=40。npm run verify 全绿（361 / 42 / 169）。
- 本轮：**按用户要求把 SOP 的「🧾 信息清单 / 提单文本」整块拿掉**（用户：「信息清单 / 提单文本这一块可以不要」）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. **删掉整张卡**：`#sopNeedBox` / `#sopFormBuildBtn` / `#sopFormCopyBtn` / `#sopFormOut` / `#sopFormHint` 全去掉，连同 `sopRenderNeed()`、`sopBuildForm()`、`sopCopy()` 三个函数和两处 `setClick` 绑定（`sopOpenScene()` 里那句 `sopRenderNeed(s)` 也删了）。⚠️ `sopCopy()` 只被这块卡用过，所以一起删；`teaSetHint` 仍在用，别动。
  2. **保留的**：场景卡里的「提单格式（折叠）」和「依据条款（折叠）」照旧 —— 用户只砍那块卡，不是砍提单信息；「要收集」小片也还在。
  3. **测试**：`smoke.cjs` 8k 把原来 4 条清单断言（列清单 / 生成文本含已收集 / 含还差与提单字段 / 复制给提示）换成 2 条（**这块卡已经拿掉** —— 那几个 id 都取不到、`body` 里也没有「信息清单」字样；**提单格式仍在场景卡里**），容器断言去掉那两个 id、加上 `sopPhList`，**361 → 359**；`verify.mjs` 3h 的容器/按钮/函数断言同步改成「这些 id 与函数**不该存在**」，仍是 17 条。`npm run verify` 全绿（359 / 42 / 169）。
- 本轮：**SOP 锁屏口令框打不进中文 → 改成 `type="text"` + CSS 遮蔽**（用户：「一开始的口令不能输入中文了」）。
  1. `#sopPassInput` 从 `type="password"` 改成 **`type="text"`**（password 类型在部分浏览器/输入法下会挡中文上屏，导致「客服冷静」打不进去），并加 `-webkit-text-security: disc` / `text-security: disc` 把字符遮成圆点（保留「看不出输入内容」的观感；不支持该属性的浏览器退化成明文，可接受）。placeholder 改成「输入使用口令（可用中文输入法）」。
  2. ⚠️ **别再改回 `type="password"`** —— 冒烟与静态断言都锁了：`smoke.cjs` 8k 里有一条「口令框用 text」，`verify.mjs` 3h 断言 `id="sopPassInput" type="text"` + `-webkit-text-security: disc` 且不存在 `type="password"`。
  3. **测试**：smoke **359 → 360**（8k 53 → 54），verify 3h **17 → 18**。`npm run verify` 全绿（360 / 42 / 169）。

- 本轮：**SOP 常用语库按用户自己分好的问题分类重建（238 条 · 22 类，带标题）+ 场景卡出「相关常用语」分类片**（用户：「可以把常用话术直接按我分好的问题匹配进去吗」—— 指《全部常用语.xls》里「分类名称」那 22 类）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. **数据重建**：`.xls`（BIFF8）改用 SheetJS 读（`G:\work-bad\node_modules\xlsx`，`npm i xlsx@0.18.5 --no-save` 装的，`node_modules/` 已 gitignore）→ `tools/out/sop/xls-rows.cjs` 导行 → `tools/out/sop/rebuild-phrases.cjs` 重建 `bundle.phrases`：**238 条 / 22 个问题分类**，每条 `{id, cat, title, tone, text}`（`cat` = 原表「分类名称」、`title` = 原表「标题」），`version: 4`。上一轮那份「人工整理 57 条」作废；`tools/out/xls-text.cjs`（盲扫文本）只作兜底，**别再用它当数据源**。
  2. **场景 ↔ 问题分类**：新增 `SOP_PH_CAT_RULES`（按场景 `cat` 映射：账号信息 / 充值与退款 / 封禁与处罚 / 游戏问题 / 发票 / VIP 与运营 / 群维系 / 交接与升级）+ `SOP_PH_PRODUCT_CATS`（梦幻消除战→梦幻常规、唱舞全明星→唱舞常规）；`sopPhCatsForScene()` 先过滤再出片（库里没有的分类不出）。场景卡多一块「💬 相关常用语（按问题分类）」，点分类片 → `sopPhGoCat(cat)` 把常用语库筛到那一类并 `scrollIntoView` 滚过去。
  3. **库里带标题**：搜索 blob 改成 标题 + 正文 + 分类 + 语气；每条卡显示「分类片 + 标题 + 正文」；编辑框多一个「标题」输入 —— `sopEditHtml(kind, idx, cat, tone, text, title)` 签名变了（改调用点记得带第 6 个参数）。`SOP_DEMO` 那 3 条示例也按这套分类改（退款 / 询问信息 / 安抚）。
  4. **测试**：`smoke.cjs` 8k 新增 3 条（场景卡按问题分类出分类片 / 点分类片 → 常用语库自动筛到那一类 / 筛出来的条目就是这一类），**360 → 363**；`verify.mjs` 3h 加 2 条（`SOP_PH_CAT_RULES` + `sopPhCatsForScene` + `sopPhGoCat` + `data-sop-phgo` + `.sop-phchips`；`title` 字段与 6 参数签名），**18 → 20**。`npm run verify` 全绿（363 / 42 / 169）。
  5. **要上线得用户自己来**：Render 里那个环境变量的 **KEY 现在叫 `workbad`，服务端只认 `SOP_TOKEN`** —— 要么改名、要么再加一个同名值的 `SOP_TOKEN`；之后 `SOP_TOKEN=xxx BASE_URL=https://work-bad.onrender.com npm run sop:seed` 把 v4（238 条）推上去。没推之前页面只在「本机导入 / 内置示例」之间切。
- 本轮：**删掉 SOP 页面 + 客服生涯 / 海外业务统计去文字化 + 全站「更直观更实用」**（用户：「删除sop功能页面，优化客服生涯和海外业务的数据统计，尽量避免大量文字堆砌。整个网站的ui设计以更直观，更实用的方向进行优化」）。改了 `public/index.html` + `tools/smoke.cjs` + `tools/verify.mjs` + 本文件：
  1. **SOP 页整块删除**：侧边栏按钮、`#tab-sop` 页面、那段 `.sop-*` CSS、`SOP_*` 常量 / `SOP_DEMO` / `sopXxx()` 全部函数（约 800 行 JS）、事件绑定全部移除；`git diff --numstat` 是纯删除，没有整篇重排。**服务端 `SOP_TOKEN` 口令关与 `npm run sop:seed` 保留**（数据仍在服务端 / 本机 bundle，含内部口径不能裸奔）。测试改成「断言它不该存在」：`smoke.cjs` 8k 由 57 条 → **2 条**（无入口 / 全页无 sop 字样），`verify.mjs` 3h 由 20 条 → **4 条**（页面无 sop / 无死代码 / 服务端口令关仍在 / seed 工具留着）。冒烟 **363 → 308**。
  2. **统计页去文字化**：新增 `statChip` / `statChips` helper 与 `.stat-chips` / `.stat-chip` / `details.stat-fold` / `.card-sub` 一套样式 —— 原来成段的「工单侧 X + 海外侧 Y = 累计 Z；日均…；数据只存在这台设备…」改成**芯片条**；来源结构 / 异常日 & 峰值 / 数据质量 / 覆盖 / 海外逐项 Top3 / 海外异常日与备注全部芯片化；卡片标题那一整句 `hint-text` 压成 `.card-sub` 副标；「日期怎么认 / 三种格式怎么粘 / 同比为什么用 4 周前」折进 `details.stat-fold`。
  3. **更好用**：两个统计页顶部加**吸顶页内跳转条**（`.jump-bar` / `.jump-chip` + `bindJumpBar()`，`data-jump` 指向卡片 id，含 `scrollIntoView` 判空）；`.career-scroll` 里的宽表**表头吸顶 + 首列吸左**；反馈模板 / 下午茶 / 日报预览的说明文字同样压成 `.card-sub` + 折叠。
  4. **测试**：`smoke.cjs` **308 项全绿**（唯一要改的是「异常线 μ+2σ」那句必须继续出现在 1 天数据的兜底文案里）；`verify.mjs` 4 条 SOP 断言 + 花括号/CSS 平衡全绿。`npm run verify` 全绿（**308 / 42 / 169**）。
  5. ⚠️ 视觉是**推算的**（这台机器截不了图）：芯片换行、吸顶跳转条、粘性表头需要在浏览器里 `Ctrl+F5` 后瞄一眼，挤了就说一声。
- 本轮：**按用户贴的 GM 玩家查询页快照核对四张映射表**（用户：「根据以下网页代码，检查并更新映射」）。只改了 `public/index.html` 的常量表 + 本文件：
  1. **来源映射 / 活动类型映射：本来就一致，没动**。`opFrom`/`from` 的 1–257（页面本身没有 52）共 256 条与 `DEFAULT_SOURCE_ID_MAP` 逐条相同；39 个活动板块（PASS卡 / 绒绒大冒险 / … / 体力排行榜）与 `DEFAULT_ACTIVITY_TYPE_MAP` 相同。
  2. **卡包表**：`PACK_NAME_MAP` 里 152/154/156/158/160 由「N星大百戏锦囊」改成页面官方「N星百戏大锦囊」，161 由「5星超大百戏锦囊」改成「5星百戏超大锦囊」；另补 170–172「卡牌必得卡包展示」。**霞光 / 幻狐 保持手写风格**（已定语义 3，测试也锁着）。
  3. **物品名表**：补 419 pass卡点 / 783 装饰配套火锅 / 804 孔明灯积分 / 997 茶楼经营簿茶壶 / 4105004 布娃娃·秋婉 / 4105005 布娃娃·清露；修正 769 松鼠精地块积分、782 装饰松鼠精、784 装饰配套喜羊羊，以及 **799/800 瑶池觅宝「奖励分数 / 竞速积分」原本对调**。
  4. ⚠️ 没做全量的物品名对账（1768 条 vs 页面几千条）：要全量得把页面存成 `tools/fixtures/player-page.html` 跑 `npm run build:data`。本轮只抽核了页面里能看到的 137 个 id。
  5. **测试**：常量表改动不影响任何断言（幻狐/霞光的断言未受影响），`npm run verify` 全绿（**308 / 42 / 169**）。
- 本轮：**删掉油猴助手 + 加三个小功能（归档体检 / 增量导入 / 高频回复）**（用户：「漏登记提醒，增量导入可以有。工单回复这个不用保存玩家的openid，而是识别该设备生成或者复制的话术最多的几个，自动归类成常用回复。如果有新的话术使用增多，则也可以加进去，至多十条。油猴助手要删了。」）。改了 `public/index.html` + `tools/verify.mjs` + `tools/smoke.cjs` + `package.json` + 删两个文件 + 本文件：
  1. **油猴「反馈提取助手」整份删除**：`public/gemjy-openid-helper.user.js`、`tools/test-openid-helper.cjs` 从仓库移除；`package.json` 去掉 `test:helper`，`verify` 链里的 `node --check` 与单测两段也去掉 —— `npm run verify` 现在 **5 段**（静态 → 语法 → 冒烟 321 → 挂起 → 服务端 42）。线上 `/gemjy-openid-helper.user.js` 部署后 404（装过的人脚本还在，只是不再更新）。
  2. **归档体检（漏登记提醒）**：客服生涯总览卡加 `#careerAuditBox`，`renderCareerAudit()` 看最近 7 天（不含今天）哪几天没记录，出「漏登记 N 天」+ 日期芯片；齐了出「最近 7 天都归档了」。
  3. **增量导入**：海外业务统计加「📌 只导入新日期」（`ovbizImportNew()`）—— 本机已有那天的整段跳过，提示「增量导入 N 行 · 跳过 K 行」；状态行多一片「最新数据到 YYYY-MM-DD」。
  4. **高频回复**：工单回复标签页新增卡片，`replyTopTrack()` 在「生成」与「复制」时各记一次，按次数排序**只显示 10 条**，可复制 / 删 / 清空；数据只写 `localStorage['replyTopUsage']`，不存 openid、不认玩家、不走服务端。
  5. **测试**：`smoke.cjs` 新增 **8l 节 13 条**（生成记一次 / 复制也算 / 按次数排序 / 删一条 / 清空回空态 / 全程不发请求 / 归档体检有提示 / 增量导入只进新日期 / 同一天再点不重复 / 状态行最新日期），**308 → 321**；`verify.mjs` 新增 **3i 节 5 条**静态断言（高频回复实现与只存本机、归档体检、增量导入、油猴脚本已删干净）。`npm run verify` 全绿（**321 / 42**）。
- 本轮：**客服生涯加「🗓️ 排班休息」**（用户：「客服生涯加个小按钮进去可以设置当月排班休息的情况，这样数据统计时可以不计算休息的天。」）。改了 `public/index.html` + `tools/verify.mjs` + `tools/smoke.cjs` + 本文件：
  1. **面板**：工具条按钮 `#careerRestBtn` 展开 `#careerRestCard`（默认 `display:none`）—— 月份 `#careerRestMonth` + 整月方格 `#careerRestGrid` + 「周末全休」「清空本月」；点格子切换休息，`.career-rest-day.rest` 高亮并显示「休」。
  2. **存储**：`localStorage['careerRestDays']`（`YYYY-MM-DD` 数组），只存本机、不进 `/api/data`。
  3. **口径**：`careerStats()` 里读 `careerRestSet()` —— 断档改由 `gapWorkDays()` 只数工作日；连续记录遇到「中间全是休息日」不算断；新增 `restDays` / `dutyDays`（在岗 = 区间 − 休息），KPI 与数据质量芯片都显示。`renderCareerAudit()` 也跳过休息日（改成「休息 N 天（不算漏登记）」）。
  4. **测试**：`smoke.cjs` 新增 **8m 节 15 条**（默认收起 / 展开 / 月份默认当月 / 整月格子 / 标 6/4 休息 → 断档 1→0、在岗 2 天、localStorage 记录 / 再点取消 / 周末全休 8 天 / 清空本月），**321 → 336**；`verify.mjs` 新增 **3j 节 3 条**静态断言。`npm run verify` 全绿（**336 / 42**）。
- 本轮：**全站操作与统计页可读性重构**（用户：「整个网站的功能操作优化一下，希望可以更直观方便的使用。生涯和业务的统计还是不够直观，参考网易或者鹰角，影视飓风的设计」）。改了 `public/index.html` + `tools/verify.mjs` + `tools/smoke.cjs` + 本文件：
  1. **统计页改「分段导航」**：客服生涯 4 段（总览 / 逐项明细 / 趋势与分析 / 数据与补录）、海外业务 3 段（总览 / 逐项明细 / 导入与导出）—— 一屏只看一段，不再是一条长滚动；顶部 `.seg-bar` 吸顶、带 01/02/03 编号与黄下划线，切标签页自动回「总览」。
  2. **删掉旧的页内跳转条**（`.jump-bar` / `.jump-chip` / `bindJumpBar()` 全部移除），机制换成 `data-seg-card` + `.seg-on`（内联 display 仍优先，排班面板与身份隐藏照旧）。
  3. **一句话摘要**：总览最上面一行大字读完结论（累计 / 日均 / 最高单日 + 日期 / 在岗·区间·休息 / 最新数据日），没数据时给一片引导芯片。
  4. **工具条收拢 + 视觉小改**：客服生涯只留归档与排班休息两个主按钮，导出/导入/清空折进「⋯ 更多」；KPI 卡左侧加细强调条、表格首列加粗、行高收紧。
  5. **测试**：`smoke.cjs` 新增 **8n 节 10 条**（4 段 / 3 段 / 默认总览 / 切明细 / 切数据 / 摘要文案 / 「⋯ 更多」里 4 个按钮 / 海外段位），**336 → 346**；`verify.mjs` 新增 **3k 节 3 条**（分段机制 + 旧跳转条已删 + 摘要 + 收拢），并删除旧 jump-bar 的断言。`npm run verify` 全绿（**346 / 42**）。
