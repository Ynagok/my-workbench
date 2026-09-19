# work-bad · 客服冷静演绎工作台

单文件前端（`public/index.html`）+ 极简同步后端（`server.js` / express）。
数据走 `/api/data/<key>`（GET 读、POST 写），落盘到 `data.json`；前端 **localStorage 优先、服务端兜底**。

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
| `npm run verify` | 静态结构校验 + `node --check` 语法 + jsdom 集成冒烟 44 项 + 「接口挂起时界面仍可用」 |
| `npm run verify:static` | 只要静态校验 + 语法检查（最快） |
| `npm run report` | 打印一份真实生成的日报，肉眼确认排版（含 ⑥伙伴弹途 / ⑦异世界勇者） |

`npm run verify` 失败就不要提交。jsdom 未安装时脚本会自动回落到本机 DSH 自带的那份。

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

## 已定语义（改之前先问用户）

1. `resolveItemName(id, name)`：**日志里已有非纯数字名字时优先用日志的**（映射表被绕过），只有名字是纯数字或空时才查 `itemNameMap`。结果就是**「映射管理」里改的棋子名，对日志中已带名字的记录不生效**。
   - 本轮已确认**保持现状**，并由 `tools/smoke.cjs` 第 **6b** 节用两条断言锁定：A 日志自带名字 → 用日志名且不查映射；B 日志只有纯数字 ID → 查映射。
   - 要改成「映射优先」会改变已有话术输出，**必须先问用户**，并同步改 6b 的断言。

## 待确认（改之前先问用户）

1. 解析完会自动 `safeCopy(...)` **写入系统剪贴板**（5 处：`5556 / 5565 / 5579 / 5657 / 5819`，会覆盖用户原有的剪贴板内容）。是否需要改成显式按钮触发或加开关，待确认。
2. **资源类型筛选被强制覆盖**（`parseSmartLog` 里 `if (['体力','红钻','金币','好评点'].includes(userSelectedType))` 会把**每一条**记录的 `道具名称` 与 `_资源类型` 都改写成下拉框选中的类型）。后果：后面那段「资源类型筛选」永远匹配到全部记录、形同虚设；日志里同时含体力和金币流水时，选「体力」会把金币那行也输出成体力话术（实测：`体力+金币` 混合日志选体力 → 2 条都变体力，金币那条从 500 变 480 被算进体力）。修它会改变已有输出，**必须先确认预期**：是按日志里的真实类型筛选，还是「用户选什么就出什么」（后者就是当前行为，注释里写的是前者）。

## 目录结构

```
public/index.html   全部前端（单文件，约 9100 行：内联 CSS + 内联 JS 的 async IIFE）
server.js           express：静态托管 public/ + GET/POST /api/data/:key ↔ data.json
data.json           服务端数据（随使用增长；前端字段缺失会被默认值自动补齐）
tools/              自检脚本
package.json        scripts: start / verify / verify:static / report
```
