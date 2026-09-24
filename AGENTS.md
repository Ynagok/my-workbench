# work-bad · 客服冷静演绎工作台

单文件前端（`public/index.html`）+ 极简同步后端（`server.js` / express）。
数据走 `/api/data/<key>`（GET 读、POST 写，key 有白名单校验），落盘到 `data.json`；前端 **localStorage 优先、服务端兜底**。

> 给 AI 助手：接手本仓库前先读这个文件，末尾「已定语义 / 待确认」**不要擅自改**。

## 协作工作流（用户与 AI 的约定）

用户说「改一下 xxx」→ **直接改，不要先问确认、不要先出方案**。改完按硬约定 3 跑 `npm run verify` 并 `git add` + `git commit`，然后**简短**汇报（改了什么 / 验证结果），不要长篇铺陈。

**推送由用户自己执行**（`git push`），AI 不要代推。注意本机直连 `github.com:443` 被阻断，用户推送需要 Clash 代理（见下方「已知环境问题」）。

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

⚠️ 不要用双击 `public/index.html` 的方式打开：`file://` 下 `/api/data` 请求会失败，数据只留在本机浏览器，换设备不共享。

## 自检工具链（tools/）

| 命令 | 内容 |
|---|---|
| `npm run verify` | 静态结构校验 + `node --check` 语法 + jsdom 集成冒烟 105 项 + 「接口挂起时界面仍可用」+ 服务端冒烟 12 项 |
| `npm run verify:static` | 只要静态校验 + 语法检查（最快） |
| `npm run report` | 打印一份真实生成的日报，肉眼确认排版（含 ⑥伙伴弹途 / ⑦异世界勇者） |
| `npm run build:data` | 从 GM 玩家页快照提取 4 张权威映射表 + 与硬编码常量的**差异报告**（见下「游戏数据管线」） |
| `npm run smoke:server` | 单独跑服务端冒烟（真起进程 + 真发 HTTP，12 项） |
| `npm test` | = `npm run verify` |

`npm run verify` 失败就不要提交。它一共 5 段：静态结构 → 语法 → jsdom 集成冒烟 **105 项** → 接口挂起时界面仍可用 → 服务端冒烟 **12 项**。

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

## 硬约定

1. `public/index.html` 必须用 **UTF-8** 保存（不能用 GBK）。
2. **不要在编辑器里执行「格式化文档」**：会整篇重排缩进。功能不受影响，但 diff 会变脏，并且会让基于字符串匹配的补丁脚本失效。
3. 改完先 `npm run verify`，再 `git add` + `git commit`。
4. 后端**不需要重启**：`express.static` 每次请求读磁盘，覆盖文件后浏览器 `Ctrl+F5` 即可生效。

## 已完成的关键改动

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
  - **口径模型（v6：工单侧与工单日报逐字段对齐 + 海外侧 10 项）**：`CAREER_SIDES = [工单, 海外]`；`CAREER_ITEMS = CAREER_TICKET_ITEMS.concat(CAREER_OVERSEAS_ITEMS)` = **36 项**（工单侧 26 / 海外侧 10）。
    - **工单侧 26 项 = 「工单日报」的全部数值字段 − 3**，**由 `DAILY_TICKET_FIELDS` 自动生成**（`CAREER_TICKET_ITEMS`，key 前缀 `t_`，label 直接用日报的 label）：
      - ⚠️ **以后往 `DAILY_TICKET_FIELDS` 加字段，工单侧会自动跟着有，不用手改**（verify 有断言锁这个构造方式）。用户的要求就是「和工单日报对齐（除姓名和班次）」。
      - 唯一排除的是 **⑦异世界勇者 `g7_wx/g7_dy/g7_dyol`**（`CAREER_TICKET_EXCLUDE`）：按用户口径它算海外业务，归海外侧的「异世界群维系」。
    - 海外侧 10 项（手写 `CAREER_OVERSEAS_ITEMS`）：异世界群维系←`ticket.g7_*`、**（梦幻/繁花/乐缤纷）群维系←`overseas.mhl_group`**、**海外CP后台工单←`overseas.cp_ticket`**、**国内工单←`overseas.cn_ticket`**、海外SSO工单量←`overseas.sdk`、商店回复←`overseas.ios+google`、海外邮件←`overseas.email`、海外FB←`overseas.fb`、监控禁言←`overseas.mute`、监控封号←`overseas.ban`。
      - ⚠️ **「国内工单」与工单侧的「SSO工单」是两个不同的项**（用户确认）：前者在海外日报填，后者来自工单日报的 SSO工单。
      - ⚠️ 商店回复是**合并项**（ios+google），因为登记表那列是合并的；海外侧其余项与海外日报字段一一对应。
      - ⚠️ 登记表里那个群维系列写作「（繁花+乐缤纷+梦幻）群维系」（同一个东西、顺序不同）——见 `CAREER_IMPORT_ALIASES`。
  - **日报改动（用户明确要求）**：`DAILY_OVERSEAS_FIELDS` 新增 3 个 number 字段 `cp_ticket`（海外CP后台工单）/ `cn_ticket`（国内工单）/ `mhl_group`（（梦幻/繁花/乐缤纷）群维系），`DAILY_DEFAULT_DATA.overseas` 同步加默认值 0，`generateDailyReport()` 的海外分支在「禁言/封号」那行后**新增 3 行正文**。所以**海外日报的正文输出变了**（多 3 行），海外表单从 8 个字段变 11 个。
  - **`CAREER_HIDDEN_ITEMS`（只存档、不计入统计）= 4 项**：登记表里恒为 0 的那几列——猫之城ios&B站评论回复、国内动物领主VIP、邮件+SDK（猫旅馆物语）、塔防FB。
    - ⚠️ **它们仍然可导入**（`from: []`，没有日报来源），只是不进两侧卡片、不进「累计工作量」，**只用于「对外登记表口径」那张对账表**——否则导入的表跟原表对不上账。
  - **`CAREER_IMPORT_ALIASES`**：登记表列名跟本系统标签写法不同的，导入时按别名对齐。目前两条：`（繁花+乐缤纷+梦幻）群维系` → `mhl_group`（海外侧群维系项）、`SSO国内工单` → `t_sso`（工单侧 SSO工单）。**所以历史数据的 142 会进海外侧统计、22 会进工单侧统计。**
  - **`extra` / 「①~⑥群维系不采集」都已成为历史**：工单侧现在**逐字段**统计工单日报（①~⑥ 各组平台各占一行），不再有聚合项或「不计入」的日报字段。
  - **两套口径**：`累计工作量` = 36 项（界面两侧卡片与之对齐）；`登记表 14 列口径` = 登记表那 14 列（10 列已归入两侧统计，4 列只存档）。**用上传的表导入时两者都是 5623，与原表完全一致**（因为表里那 4 个只存档列全是 0）。顶部写明「工单侧 X + 海外侧 Y = 累计 Z；其中登记表 14 列口径 W」。
    - ⚠️ 注意工单侧逐字段后，①~⑥ 各组平台的量**同时**会出现在海外侧的「（梦幻/繁花/乐缤纷）群维系」那一项里（后者是你在海外日报里单独填的一个汇总数）——如果这算重复计量，告诉 AI 去掉其中一边。
  - **导入的「总计」核对用 14 列口径**（不是统计口径），否则有群维系数据的天数会被误报成「总计对不上」。
  - **归档时机**：点「生成日报」时顺手归档当天；跨天自动刷新那条路径**故意不归档**（否则会把昨天的数记到今天）。同一天重复归档 = 覆盖。也可用页面上的「归档今日日报」按钮手动触发。
  - **补录/修正**：可指定任意日期载入→改数字→保存（`src:'manual'`），表单按两侧分组；也能删除某天。
  - **粘贴导入**：从 Excel 直接复制那段表格粘贴即可。带表头按**列名**对齐（列顺序随意），不带表头按 A~T 顺序；日期接受 Excel 序列号或 `2026-06-03`/`2026/6/3`；同一天覆盖。导入时若「总计」列与各列之和对不上，会提示并按各列之和入账。
  - **统计项**（用户要"更能量化工作成果"，已去掉面试/简历相关表述）：累计工作量、完整记录天数、日均、中位数、最高单日+日期、最低单日、标准差+变异系数、最长连续记录+当前连续、记录区间+断档天数、近 7/30 记录日日均、环比上月、月度汇总（天数/总量/日均/最高单日/环比）、**工单侧/海外侧各自的累计·占比·侧内日均·侧内最高单日·有产出项数**、逐项累计+占比+结构条、渠道覆盖广度（几项有产出 + 单日最多触达）、数据质量（待确认天数+日期明细、特殊问题清单）、CSV/JSON 导出。
  - **持久化**：走 `/api/data/careerData`（= 服务端 `data.json`，仓库在 G 盘所以是非 C 盘，多设备打开同一地址即共享；localStorage 兜底）。`DATA_FILE` 环境变量可把数据文件指定到别的盘。
  - **测试**：`tools/smoke.cjs` 加 **8c** 节（自动归档折算、两侧拆分、工单日报字段自动进统计、海外日报新增 3 字段参与统计、别名、导入、补录、删除、导出，含「打乱表头顺序仍按列名落位」「重复导入不翻倍」「总计为空不计入」），冒烟 60 → **105**；`tools/verify.mjs` 加了一整块客服生涯断言（工单侧由 DAILY_TICKET_FIELDS 生成的构造方式 + 只排除 g7_* + 海外侧 10 项覆盖海外日报全部数值字段 + 14 列列名对得上（含别名）+ 只存档 4 项 + 持久化 key 等）。
  - **✅ 真实数据对账**：把上传的登记表 81 行（80 天）原样喂进粘贴导入，与表格自己的「月度汇总」「个人指标看板」逐项比对，**39/39 全对，且所有指标都跟原表一致**——79 完整记录天；**工单侧 22 + 海外侧 5,601 = 累计 5,623（= 原表累计工作量）**；海外侧含「（梦幻/繁花/乐缤纷）群维系 142」（登记表那列经别名导入）；**日均 71.2、最高单日 191 @ 2026-08-05**、月度 **1,312 / 1,614 / 1,572 / 1,125** 全部与原表看板一致；14 列逐项累计吻合；只存档的 4 列都是 0。回放脚本是一次性的（`tools/out/`，未入库）。

## 已定语义（改之前先问用户）

1. `resolveItemName(id, name)`：**日志里已有非纯数字名字时优先用日志的**（映射表被绕过），只有名字是纯数字或空时才查 `itemNameMap`。结果就是**「映射管理」里改的棋子名，对日志中已带名字的记录不生效**。
   - 本轮已确认**保持现状**，并由 `tools/smoke.cjs` 第 **6b** 节用两条断言锁定：A 日志自带名字 → 用日志名且不查映射；B 日志只有纯数字 ID → 查映射。
   - 要改成「映射优先」会改变已有话术输出，**必须先问用户**，并同步改 6b 的断言。
2. **资源类型「选什么就出什么」**：`parseSmartLog` 里 `if (['体力','红钻','金币','好评点'].includes(userSelectedType))` 会把**每一条**记录的 `道具名称` 与 `_资源类型` 都改写成下拉框选中的类型，所以日志里同时有体力和金币时，选「体力」会把金币那行也输出成体力话术。
   - 用户已确认**这是有意行为**，不做「按日志真实类型筛选」。由 `tools/smoke.cjs` 第 **2d** 节两条断言锁定：混合日志选体力 → 两行都按体力出；选金币 → 两行都按金币出。
   - 要改成「按日志真实类型筛选」会改变已有输出，**必须先问用户**，并同步改 2d 的断言。
   - **例外：「活动奖励（集合）」不适用这条**。它不强制单一类型，而是按「时间+来源」把**一次活动结算**的多种资源合并成一句：`在X，通过【来源】获得A*1，B*20`；同一动作只写一次动词，同一组里既有消耗又有获得时各自带动词（`消耗体力*1，获得金币*20`）。时间或来源不同则不合并。见 `tools/smoke.cjs` **2e** 节 3 条断言。
3. **集卡卡包名沿用手写风格，不对齐游戏官方名**：`PACK_NAME_MAP` 里 `176–179` 是 `幻狐2星锦囊…幻狐5星锦囊`（沿用该表 `霞光3星锦囊` 的「系列+星+锦囊」写法），而游戏源码里的官方名是 `2星幻狐锦囊…5星幻狐锦囊`（`DEFAULT_ITEM_NAME_MAP` 用的正是官方写法）。
   - 已问过用户：**保持现状**，不改（改它会改变集卡话术输出）。
   - 所以 `npm run build:data` 的 `diff-report.md` 里，`PACK_NAME_MAP` 这一栏会长期有「名称不一致」条目（幻狐 4 条，霞光 3 条同理）——**看到不要顺手改**。

## 待确认（改之前先问用户）

1. 解析完会自动 `safeCopy(...)` **写入系统剪贴板**（5 处：`5556 / 5565 / 5579 / 5657 / 5819`，会覆盖用户原有的剪贴板内容）。是否需要改成显式按钮触发或加开关，待确认。

## 目录结构

```
public/index.html          全部前端（单文件，约 9890 行：内联 CSS + 内联 JS 的 async IIFE；含「客服生涯」标签页）
server.js                  express：静态托管 public/ + GET/POST /api/data/:key ↔ data.json（含 key 白名单）
data.json                  服务端数据（随使用增长；前端字段缺失会被默认值自动补齐）
tools/                     自检脚本（verify / smoke / smoke-nonblocking / smoke-server / print-report / build-game-data）
tools/fixtures/            build:data 的输入；player-page.html 含玩家隐私已 gitignore，样例已入库
tools/out/                 build:data 的产出（4 张表 + 差异报告），已 gitignore
package.json               scripts: start / verify / verify:static / smoke:server / report / build:data / test
```
