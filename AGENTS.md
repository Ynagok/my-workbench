# work-bad · 客服冷静演绎工作台

单文件前端（`public/index.html`）+ 极简同步后端（`server.js` / express）。
数据走 `/api/data/<key>`（GET 读、POST 写），落盘到 `data.json`；前端 **localStorage 优先、服务端兜底**。

> 给 AI 助手：接手本仓库前先读这个文件，末尾「待确认」两项**不要擅自改**。

## 运行

```powershell
npm start          # http://localhost:3000（静态托管 public/ + /api/data 接口）
npm run verify     # 改完代码、push 前的完整自检
```

⚠️ 不要用双击 `public/index.html` 的方式打开：`file://` 下 `/api/data` 请求会失败，数据只留在本机浏览器，换设备不共享。

## 自检工具链（tools/）

| 命令 | 内容 |
|---|---|
| `npm run verify` | 静态结构校验 + `node --check` 语法 + jsdom 集成冒烟 33 项 + 「接口挂起时界面仍可用」 |
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

## 待确认（改之前先问用户）

1. `resolveItemName(id, name)` 当前语义是「日志里已有中文名就优先用日志的，只有名字是纯数字时才查映射表」→ 结果就是**「映射管理」里改的棋子名，对日志中已带名字的记录不生效**。改它会让已有话术输出发生变化，必须先确认预期语义。
2. 解析完会自动 `safeCopy(...)` **写入系统剪贴板**（会覆盖用户原有的剪贴板内容）。是否需要改成显式按钮触发，待确认。

## 目录结构

```
public/index.html   全部前端（单文件，约 9100 行：内联 CSS + 内联 JS 的 async IIFE）
server.js           express：静态托管 public/ + GET/POST /api/data/:key ↔ data.json
data.json           服务端数据（随使用增长；前端字段缺失会被默认值自动补齐）
tools/              自检脚本
package.json        scripts: start / verify / verify:static / report
```
