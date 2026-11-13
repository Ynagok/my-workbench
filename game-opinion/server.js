"use strict";

// 游戏舆情监测（个人研究用）· 极简后端
// 只做三件事：拼 query → 检索（搜索 API 或手动粘贴）→ LLM 分析。
// 防御性：结果只回传浏览器，不写盘、不存玩家个人信息。

// 加载 .env：Node 20.12+ 内置 loadEnvFile，文件不存在时静默跳过
try {
  process.loadEnvFile();
} catch (_) {
  /* 无 .env 时忽略，配置可走系统环境变量 */
}
const path = require("path");
const express = require("express");

const { buildQuery } = require("./lib/query");
const { searchTavily } = require("./lib/search");
const { analyzeWithLLM } = require("./lib/analyze");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT) || 3100;
const DEFAULT_GAME = "梦幻消除战";

// 前端启动时读它，判断哪些能力可用、是否强制手动粘贴
app.get("/api/config", (_req, res) => {
  res.json({
    defaultGame: DEFAULT_GAME,
    hasTavily: !!process.env.TAVILY_API_KEY,
    hasDeepSeek: !!process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  });
});

app.post("/api/analyze", async (req, res) => {
  const body = req.body || {};
  const game = String(body.game || "").trim() || DEFAULT_GAME;
  const days = Math.max(1, Math.min(365, Number(body.days) || 7));
  const mode = body.mode === "paste" ? "paste" : "auto";
  const pastedText = String(body.pastedText || "").trim();
  const extra = String(body.extra || "").trim();

  const query = buildQuery(game, days, extra);

  // ① 检索：手动粘贴优先，否则走 Tavily（没配 Key 也退回手动）
  let sources = [];
  let usedSearch = false;
  if (mode === "paste" || !process.env.TAVILY_API_KEY) {
    if (!pastedText) {
      return res.status(400).json({ error: "请先粘贴玩家发言内容，或配置 TAVILY_API_KEY 后用自动检索。" });
    }
    sources = [{ title: "", url: "", content: pastedText }];
  } else {
    try {
      const r = await searchTavily(query, process.env.TAVILY_API_KEY, { maxResults: 20 });
      if (r.answer) sources.push({ title: "Tavily 综合答案", url: "", content: r.answer });
      sources = sources.concat(r.results);
      usedSearch = true;
    } catch (e) {
      return res.status(502).json({ error: `搜索失败：${e.message}` });
    }
  }
  if (!sources.length) {
    return res.status(400).json({ error: "没有拿到任何内容，请检查粘贴内容或搜索 Key。" });
  }

  // ② 分析
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(400).json({ error: "未配置 DEEPSEEK_API_KEY，请先复制 .env.example 为 .env 并填入 Key。" });
  }
  try {
    const analysis = await analyzeWithLLM(
      { game, days, sources },
      {
        baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      }
    );
    res.json({ query, usedSearch, sourceCount: sources.length, days, analysis });
  } catch (e) {
    res.status(502).json({ error: `分析失败：${e.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`游戏舆情监测已启动：http://localhost:${PORT}`);
});
