# 游戏舆情监测（梦幻消除战）· 个人研究用

一个极简的网页工具：输入「梦幻消除战」的玩家发言（手动粘贴，或走 Tavily 搜索 API 自动检索），用 DeepSeek 做情感与议题分析，输出 **舆情看板** + 按《游戏玩家口碑与舆情监测报告模板》生成的完整报告。

## 为什么是它

- 相比直接上 BettaFish（爬虫 + 三 Agent + 报告引擎），这个网页**零爬虫、零风控**，半天就能验证「分析出来的是不是有用的玩家舆情」。
- **防御性设计**：只走官方搜索 API（Tavily），不碰微博/抖音/小红书的逆向接口；结果只在浏览器内存里，不落盘、不存玩家昵称/头像等个人信息；不对外发布。

## 快速开始

```powershell
cd G:\work-bad\game-opinion
copy .env.example .env     # 然后把 .env 里的 Key 填上
npm install
npm start                  # 打开 http://localhost:3100
```

## 拿 Key

| 用途 | 平台 | 步骤 | 费用 |
|---|---|---|---|
| 搜索（可选） | Tavily | `tavily.com` 注册 → Dashboard 复制 Key（`tvly-` 开头） | 免费档 1000 次/月 |
| 分析（必填） | DeepSeek | `platform.deepseek.com` 注册 → 充值 → API Keys 创建 Key（`sk-` 开头） | ¥10 能用很久 |

- **没填 Tavily Key 也能用**：网页自动退回「手动粘贴」模式，你从贴吧/B站复制玩家发言贴进来即可。
- **DeepSeek Key 必填**：没有它无法分析（网页会提示）。

## 目录结构

```
game-opinion/
├─ server.js            # express 后端：/api/config + /api/analyze
├─ lib/
│  ├─ query.js          # 把「游戏+时间窗+关注维度」拼成检索 query
│  ├─ search.js         # Tavily 搜索（可选）
│  └─ analyze.js        # DeepSeek 分析，输出结构化舆情 JSON
├─ public/index.html    # 单页前端：看板 + 报告
└─ .env.example         # Key 模板
```

## 说明

- 关注维度、平台偏好都在 `lib/query.js` 里，想加/改维度直接改那个数组。
- 报告结构对应你给的《游戏玩家口碑与舆情监测报告模板.md》7 章。
- 这是独立项目，跟 work-bad 客服工作台互不干扰。
