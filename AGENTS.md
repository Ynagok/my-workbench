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
| `npm run verify` | 静态结构校验 + `node --check` 语法 + jsdom 集成冒烟 360 项 + 「接口挂起时界面仍可用」+ 服务端冒烟 42 项 |
| `npm run verify:static` | 只要静态校验 + 语法检查（最快） |
| `npm run report` | 打印一份真实生成的日报，肉眼确认排版（含 ⑥伙伴弹途 / ⑦异世界勇者） |
| `npm run build:data` | 从 GM 玩家页快照提取 4 张权威映射表 + 与硬编码常量的**差异报告**（见下「游戏数据管线」） |
| `npm run smoke:server` | 单独跑服务端冒烟（真起进程 + 真发 HTTP，42 项，含 SOP 口令 7 项） |
| `npm run smoke:pmc` | **生管物料订单工作台**（`public/pmc.html`）自检，123 项（含加工周期工作日推算 + 在途锁定/调整建议 + 真实 8.5MB xlsx 端到端导入）；**不在 verify 里**，见下「生管物料订单工作台」一节 |
| `npm test` | = `npm run verify` |

`npm run verify` 失败就不要提交。它一共 5 段：静态结构 → 语法 → jsdom 集成冒烟 **360 项** → 接口挂起时界面仍可用 → 服务端冒烟 **42 项**。

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
  - ⚠️ **物品名表没做全量对账**（1768 条）：要全量得把玩家页存成 `tools/fixtures/player-page.html` 再 `npm run build:data` 出 diff；本轮只按页面里看得见的 id 抽核（137 条）。
  - ⚠️ 两处存疑未动：`774` 表里是「珍蚌」、页面原文像是「珍虾」（还愿锦鲤的珍珠蚌更合理，先留）；`997` 页面本身写作「茶楼经营**簿**茶壶」而来源表写「茶楼经营**薄**任务奖励」，按页面原样抄成「簿」。

## 反馈提取助手（油猴脚本）—— **已删除**（2026-10，用户要求「油猴助手要删了」）

`public/gemjy-openid-helper.user.js` 与 `tools/test-openid-helper.cjs` **已从仓库删除**，`package.json` 里的 `test:helper` 脚本和 `verify` 链里的那两段也一起去掉了（verify 现在 5 段）。
线上那条安装链接 `https://work-bad.onrender.com/gemjy-openid-helper.user.js` **部署后会 404**；已经装过 0.3.0 / 0.4.0 的人，脚本还在他们浏览器里，只是再也收不到更新。
要恢复就 `git show a6d2833:public/gemjy-openid-helper.user.js`（测试文件同理）。

## 界面主题（柔和白 · 明日方舟 / 终末地 视觉语言）

**整个工作台是浅色「柔和白」的**（用户要求：背景不刺眼，所以底不用纯白，用带一点冷灰的白）。只靠 `:root` 令牌驱动，改观感先改令牌、再动两层「收口层」。

- **令牌**（`public/index.html` 顶部 `<style>` 里的 `:root`）：`--bg-0 #eef1f4`（页面底，冷灰白）/ `--bg-1 #f7f9fb` / `--surface #fbfcfd`（卡片）/ `--surface-2 #f1f4f7` / `--surface-3 #e6eaee`（次级面、斑马、分组标题）/ `--sidebar #f4f6f9`；文字 `--ink-0 #1b2228`（主）/ `--ink-1 #2c353d` / `--ink-2 #5b6672`（次要）/ `--ink-3 #8b959f`（三级、placeholder）；线 `--line-0 #e3e8ed` / `--line-1 #d3dae1` / `--line-2 #b7c0c9`。
  - **强调色仍是「方舟黄」，但浅底上压深了一档：`--accent #c89500`**（当文字/描边看得清，当填充配黑字也够）；配套 `--accent-hi #a97c00` / `--accent-ink #8a6200`（浅底上的强调文字）/ `--accent-dim`(12%) / `--accent-line`(42%) / `--accent-glow`(20%)。`--dark #0a0c0e` 仍是**黄底/亮底上的文字色**，也是「小游戏那几个故意做黑的按钮」的底色 —— **别改它**。
  - `--warn #bd7300` / `--danger #cf3b30`（浅底上压深一档）；阴影改成柔和黑低透明（`--shadow-1/2/3`）。
  - 圆角令牌全部≈直角：`--r-sm 2px` / `--r-md 3px` / `--r-lg 4px` / `--r-pill 3px`。
  - `--ak-primary` / `--primary` / `--bg` / `--border` / `--text` / `--shadow` 这些旧别名**已改成引用上面那套令牌**，别再写死颜色。
  - 新增：`--grid-line`（页面网格线，浅底上是 `rgba(28,40,52,0.035)`）/ `--hazard`（45° 警示条纹）/ `--clip-card`、`--clip-btn`（切角 polygon）。
- **两层收口层**（都在 `<style>` 末尾，**后置覆盖前面的规则**，同特异性后者胜）：
  1. **「暗色主题收口层 · 明日方舟 / 终末地 视觉语言」**（含「客服生涯 · 报表版式」）—— 形状/版式层：切角、编号、表头、按钮形状、报表抬头等。⚠️ **它是上一版暗色主题留下的，名字也没改；里面的 `rgba(255,255,255,…)`、`rgba(4,6,8,…)` 这类颜色全是暗色专用值，靠下面第 2 层覆盖**。改版式（不是颜色）就动这一层。
  2. **「浅色收口层 · 柔和白」**（最后一段）—— 颜色收口：把上面那层的暗色硬编码改回浅色（`.tab-btn:hover` 的淡黑、`button` 的浅底、表单白底、`.card::after` 斜纹、`tbody` 斑马、`.modal` 遮罩、`.career-kpi.accent` / `.career-trend` 的底纹），外加 `.fb-chip`（反馈模板的选择片）。**再加浅色样式就写这一段**，并且**不要用 `rgba(255,255,255,…)`**（verify 有断言锁死这一段里不出现白底白线）。
  - 直角/切角：`.container` 边框+警示条纹顶条（浅底上 opacity 0.22）；`.card` / `.modal-content` 用 `--clip-card` 切右上右下角；`button` 用 `--clip-btn`。
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
  - ⚠️ **旧的 `.jump-bar` / `.jump-chip` / `bindJumpBar()` 已整段删除**（冒烟/静态断言锁着「不该再出现」），别再捡回来。

  - `.career-scroll table.career-table` 现在**表头吸顶 + 首列吸左**（宽表横向拖动时不跟丢）。
  - ⚠️ 冒烟对这些块用的是 `textContent` 精确/正则断言（如 `工单侧 17 + 海外侧 53 = 累计 70`、`Top3 集中度：`、`合计占`、`待确认 1 天`、`异常线 μ+2σ`、`活动 / 版本峰值标注`、`只存在这台设备的浏览器里`、`不上传服务端`）—— 改芯片文案要同步改断言。
- **报告式「一句话摘要」+ 工具条收拢（2026-10）**：两个统计页顶部 `.stat-headline`（`#careerHeadline` / `#ovbizHeadline`）由 `renderCareer()` / `ovbizRender()` 填 —— 「累计 X · 日均 Y · 最高单日 Z（日期）· 在岗 N 天 / 区间 M 天（休 K）」一行读完；没数据时回落成一片提示芯片。KPI 卡左侧加了一根 2px 强调条（主指标黄、次指标灰），表格首列加粗、行高收到 1.6。
  - **工具条**：客服生涯总览卡只留「🗂️ 归档今日日报」+「🗓️ 排班休息」两个主按钮，导出CSV / 导出JSON / 导入JSON / 清空本机 折进 `details.card-more`（点「⋯ 更多」展开）——**按钮 id 没变**，测试照旧能点。
- **🗓️ 排班休息（2026-10 用户要求）**：客服生涯工具条上的「🗓️ 排班休息」按钮（`#careerRestBtn`）展开 `#careerRestCard` 面板 —— 月份输入 `#careerRestMonth`（默认当月）+ 整月方格 `#careerRestGrid`（点一天 = 切换休息，休的格子带 `.rest` 并显示「休」，周末虚线框）+「周末全休」(`#careerRestWeekendBtn`) /「清空本月」(`#careerRestClearMonthBtn`)。
  - **存哪儿**：只写本机 `localStorage['careerRestDays']`（`YYYY-MM-DD` 数组，`careerRestLoad` / `careerRestSave` / `careerRestToggle`），**不进 `/api/data`** —— 跟 `careerData` 一个规矩。
  - **统计口径（`careerStats` 里只有这一处）**：`const restSet = careerRestSet()` 之后 —— ① **断档只数工作日**（`gapWorkDays()` 跳过休息日）；② **连续记录不休息日打断**（中间全是休息日就继续连续）；③ 新增 `restDays`（记录区间内的休息天数）与 `dutyDays = spanDays - restDays`（**在岗天数**），KPI「记录区间」副标与「数据质量」芯片都会显示「在岗 / 休息」。
  - **归档体检也跳过休息日**：休息日不报「漏登记」，另起一片「休息 N 天（不算漏登记）」。
- **归档体检 / 漏登记提醒（2026-10）**：客服生涯总览卡里的 `#careerAuditBox` 由 `renderCareerAudit()` 填 —— 看**最近 7 天（不含今天）**有哪些日子 `careerData.records` 里没有，有就出 `k-warn` 芯片点名（「漏登记 N 天」+ 每个日期一片 + 指路「去每日日报归档或下面补录」），齐了就一片「最近 7 天都归档了」。日期用 `careerRecentDays(7)` 按 UTC 递减算，不依赖时区。
- ⚠️ 想再换回暗色：把 `:root` 的 `--bg-0/--surface*/--ink*/--line*/--accent*` 换回深色值即可，但**要同时删掉/改掉「浅色收口层 · 柔和白」这一段 + `color-scheme: light` + select 箭头 SVG 的 `%23c89500`**，否则会有浅底白线。

## 每日日报（`data-tab="daily"` · 表单分组）

工单日报 32 个字段 / 海外日报 15 个字段原来是平铺的一个 auto-fit 网格，用户反馈「每次填的时候都要找一下对应项在哪」（2026-10），现在按业务**分组**渲染：

- **分组定义**：`DAILY_TICKET_GROUPS`（10 组：基础信息 / 工单与后台 / ① 繁花 / ② 乐缤纷 / ③ 不差钱 / ④ 你的江湖 / ⑤ 梦幻消除战 / ⑥ 伙伴弹途 / ⑦ 异世界勇者 / 待跟进）与 `DAILY_OVERSEAS_GROUPS`（6 组：基础信息 / 评价与来访 / SDk 工单 / 工单 / 监控 / 群维系）。**数组顺序 = 表单里从上到下的顺序**；字段靠自身的 `group` 归组（`DAILY_TICKET_FIELDS` / `DAILY_OVERSEAS_FIELDS` 里每个字段都带 `group`，一部分还带 `short`）。
- **渲染**：`renderDailyForm()` 按组出 `<section class="daily-group" data-group="…">` —— 组头 = 两位数编号 `.dg-n` + 标题 `.dg-title` + 副标 `.dg-sub` + 右上「已填 n/m」`.dg-fill`；组内 `.daily-group-grid` 自己一套 `repeat(auto-fit, minmax(150px,1fr))`。`.daily-form` 外层改成 flex 竖排，不再是全局网格。
- **短标签**：组内只写「微信 / 抖音 / dy在线 / 手Q」「梦幻 / 爱江山 / 月光」这类短名（`short`），全称放 `title`（鼠标悬停可见），组标题已经带 ①~⑦ 不必重复。**`label` 一个字都没改** —— 它还被 `CAREER_TICKET_ITEMS` 的统计标签和 `CAREER_TICKET_LABEL_TO_KEY` 的日报正文解析用着。
- **已填片**：`updateDailyGroupFill(container, tab)` 在渲染后 + 每次输入时刷新：`0/4`（灰）/ `1/4`（部分，`.is-part` 橙）/ `4/4`（齐，`.is-full` 黄底）。数值字段按「> 0」算、文本按「非空」算，所以带默认值的「班次」一开始就算已填。
- **兜底**：以后新增字段忘了写 `group`，会落进 `data-group="misc"` 的「其他」片照旧渲染（`verify.mjs` 3b-2 同时断言「每个字段都归了组」和「misc 兜底存在」）。
- **测试**：`tools/smoke.cjs` 第 **8o** 节 **14 条**（工单 10 组 / 组标题是业务名 / 01…10 编号 / 32 个字段一个不少 / ① 繁花只装 4 个平台 / 组内短标签 + title 全称 / 没有 misc / 待跟进 0/1 → 填了 1/1 并高亮 / ① 繁花 1/4 / 海外 6 组 / SDk 三项同一片 / 海外 15 字段 / 切回工单仍是 10 组 32 字段）；`tools/verify.mjs` 3b-2 有 9 条静态断言。
- ⚠️ 字段数组新增键（`group` / `short`）不影响统计：`CAREER_TICKET_ITEMS` 仍按 `f.type === 'number'` 过滤；但 `verify.mjs` 里那个 `numKeys()` 的正则已放宽成 `type: 'number'[^{}]*}`，否则认不出带 `group` 的字段。

## 工单回复（`data-tab="reply"` · ⭐ 高频回复自动统计）

选开头 / 正文 / 结束语 → 「✨ 生成回复」→ 「📋 复制」，另有标签预设。**2026-10 用户要求加了「高频回复」**：

- **口径**：不存玩家 openid、不认人，只统计「**这台设备生成 / 复制过的话术**」哪几句最多；生成算一次、复制也算一次（含从高频列表里点复制）。只写本机 `localStorage['replyTopUsage']` = `[{ text, count, gen, cop, last }]`，**不进 `/api/data`**，上限 `REPLY_TOP_KEEP = 60` 条原始统计。
- **展示**：卡片 `#replyTopList` 按 `count` 降序、同次数按 `last` 新的在前，**只显示 `REPLY_TOP_MAX = 10` 条**（用户要求「至多十条」）；新的句子用得多了自然会挤进前 10。每行有「用 N 次 / 生成 N / 复制 N / 最近 日期」芯片 + 📋 复制 + 🗑 删；右上「🧹 清空统计」(`#replyTopClearBtn`)，清空/删除都带 confirm。
- ⚠️ 不到 4 个字的回复不记（`replyTopTrack` 里 `t.length < 4` 直接 return），免得分隔符/一句话灌满统计。
- ⚠️ 它是**纯本机统计**：换设备就没了，也不该同步（跟 `careerData` / `ovbizData` 是一个规矩）。

## 反馈模板（工单信息提取器）

**「📮 反馈模板」标签页**（`data-tab="feedback"` / `#tab-feedback`，侧边栏在「工单回复」下面）—— 口径**照搬用户给的《反馈模板生成器》单页工具**（文件名 `test - 多选生成(🆕) - 修改异世界区服无法正常显示的问题.html`）：选模板 + 选来源 + 粘原始字符串 → 出反馈格式文本。

- **四种模板**（`FB_TEMPLATES`，单选片 `.fb-chip`）：`menghuan` 梦幻消除战 / `changwu` 常规游戏 / `lebifen` 乐缤纷CP后台 / `gongdan` 内部工单。
- **来源 11 个**（`FB_SOURCES`，**已按用户要求删掉「电话」**）：抖音小店 / 抖音后台 / 53 / 工单 / 支付宝在线 / 支付宝后台 / 微信后台 / 爱江山CP后台 / 繁花CP后台 / 乐缤纷CP后台 / 企微。
  - ⚠️ **每个模板能选的来源不一样**（`FB_TEMPLATE_SOURCES` + `fbAllowedSources()`，用户明确要求）：
    - `menghuan` 梦幻消除战 → **8 个**：抖音小店 / 抖音后台 / 53 / 工单 / 支付宝在线 / 支付宝后台 / 微信后台 / 企微（**不要爱江山 / 繁花 / 乐缤纷CP后台**）。
    - `changwu` 常规游戏、`gongdan` 内部工单 → 全部 11 个。
    - `lebifen` 乐缤纷CP后台 → **只有「乐缤纷CP后台」**这一个。
    - 谁的列表里都没有「电话」。
  - 实现：11 个来源片都在 DOM 里，`fbRenderChips()` 按当前模板把不该有的 **`style.display='none'`** 掉（**别用 `hidden` 属性**：`.fb-chip` 有 `display` 样式，`hidden` 会被盖掉）；换模板时若当前来源不在新模板的列表里，**自动落到该模板的第一个来源**（乐缤纷只有一个，所以自动就切过去了）；`fbSetSource` 会拒绝不在列表里的来源；`fbLoadState` 读本机记录时也按这套校验（老记录里的来源可能已经不合法）。抬头「来源总数」= **当前模板**的可选数。
- **三种解析**（`fbBuildOrderText` / `fbBuildGameText`）：
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
- **模板对不上时不生成**（`fbMismatch`）：内容像内部工单却选了常规/梦幻/乐缤纷、或选了内部工单但没「工单号」行，都会清空结果 + 在 `#fbHint` 里说明该换成哪个模板（原工具是 `confirm` 弹窗 + `return`，这里换成不打断的提示，**行为仍是「不给错格式」**）。乐缤纷模板只拦一种：内容是内部工单（后台表格行不会被误判）。
- **只存本机**：选中的模板/来源存 `localStorage['feedbackTplState']`（`fbLoadState`/`fbSaveState`），**不进 `/api/data`**；页面启动（`bindAll`）和切到该标签页时都会 `fbRenderChips()` 把选中态画回来。
- **抬头**：复用 `.career-report-head`，`#fbReportSub` = 当前模板/来源/可选来源数，`#fbReportMeta` 三格 = 模板 / 来源 / 来源总数。
- **按钮**：`⚡ 生成反馈格式`（`fbGenerate`）/ `📋 复制结果`（`fbCopy`，走 `safeCopy`，空结果只提示不抛错）/ `🧹 清空`（`fbClear`）。
- **测试**：`tools/smoke.cjs` 第 **8h** 节 **29 条**（标签页 + 4 模板 + **来源片 11 个且不含「电话」** + **梦幻消除战默认藏掉爱江山/繁花/乐缤纷CP后台** + 默认选中 + 抬头 3 格 / 常规游戏各区服特例（001 / 000 / 唱舞数字 / 普通取服务器名）/ 切来源后结果跟着变 + 记住 `feedbackTplState` + **换回梦幻消除战时来源没变（企微在它的列表里）且「来源总数」= 8** / 梦幻正文与渠道去括号 / **乐缤纷CP后台：用户原文那行逐字比对 + 来源只剩它自己且自动切过去 + 一次多行出两段（段间空一行）+ 带表头跳过 + 只复制三列也能认 + 认不出来不生成 + 内部工单会被拦** / 模板选错不生成并提示 / 内部工单字段提取（手机号优先、没手机号用联系人）/ 清空 / 空输入提示 / 复制按钮不抛错 / 整场不往服务端存）；`tools/verify.mjs` 另有 14 条静态断言（标签页、来源 11 个含乐缤纷CP后台且**已无「电话」**、旧名「抖音在线」已不存在、模板 4 种、**每个模板的来源表（梦幻 8 个 / 乐缤纷只有它自己）+ 按模板隐藏来源片**、两套正文、**乐缤纷五行格式 + 后台表格行解析（制表符分列/第 5 列是问题/跳表头/多行拼多段）+ 少数几列按内容认**、切模板时来源落到列表第一项、区服特例、字段表、只存本机、容器、按钮与标签页刷新）。

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
3. **集卡卡包名沿用手写风格，不对齐游戏官方名**：`PACK_NAME_MAP` 里 `176–179` 是 `幻狐2星锦囊…幻狐5星锦囊`（沿用该表 `霞光3星锦囊` 的「系列+星+锦囊」写法），而游戏源码里的官方名是 `2星幻狐锦囊…5星幻狐锦囊`（`DEFAULT_ITEM_NAME_MAP` 用的正是官方写法）。
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
tools/fixtures/            build:data 的输入；player-page.html 含玩家隐私已 gitignore，样例已入库
tools/out/                 build:data 的产出（4 张表 + 差异报告）＋ pmc 样例数据管线 ＋ sop/（附件抽出来的文本与 bundle，已 gitignore），已 gitignore
package.json               scripts: start / verify / verify:static / smoke:server / smoke:pmc / sop:seed / report / build:data / test
```
## 已完成的关键改动

- **日报表单分组**（2026-10，用户要求「填写日报的几个选项不好分辨」）：工单 / 海外日报按业务分组渲染（一组一片 + 编号 + 已填 n/m 片），组内用短标签、全称放 title；见上「每日日报」一节。
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
  - **两套口径**：`累计工作量` = 39 项（界面两侧卡片与之对齐）；`登记表 14 列口径` = 登记表那 14 列（10 列已归入两侧统计，4 列只存档）。
    - **2026-09 起界面上只呈现统计口径**：顶部是一条**两段式堆叠占比条**（`#careerSplitBar > i.ticket` 用 `--accent` 黄、`i.overseas` 用 `#3d7bd6` 蓝，宽度按两侧累计占比，段窄于 12% 就不写字）＋ 图例 `#careerSplitLegend`（工单侧/海外侧各自的数与占比 + 合计）；下面 `#careerSheetHint` 一行写明「工单侧 X + 海外侧 Y = 累计 Z；日均 …（按 N 个完整记录日）；数据只存在这台设备的浏览器里，不会同步给别的设备。」——**14 列口径不再出现在界面上**。
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
    - **身份筛选**：顶部 `#careerScopeBar` 三个按钮「全部 / 📋工单 / 🌐海外」（`data-scope`，选中的加 `.active`）。`careerScopeState` 存在本机 `localStorage['careerScope']`（**不是 careerData，也不走服务端**）。`careerStats(scope)` 是唯一的开关：scope=某一侧时，每条记录的「工作量」改成**该侧项之和**（`careerSideTotal(rec, scope)`），于是日均 / 最高单日 / 连续记录 / 月度 / 趋势全部自动跟着身份走；scope=all 时和以前一模一样。选某一侧时：另一侧的统计卡 `#careerCardTicket`/`#careerCardOverseas` 隐藏、两侧占比条 `#careerSplitWrap` 隐藏、`#careerSheetHint` 只讲那一侧。
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
