"use strict";

// 分析层：把检索结果（或手动粘贴的玩家发言）交给 DeepSeek，输出结构化舆情 JSON。
// 防御性设计：只读输入、结果只回传浏览器，不落盘、不存玩家昵称/头像等个人信息。

const SYSTEM_PROMPT = `你是游戏行业舆情分析师，负责分析一款游戏在玩家社区的口碑与舆情。
你会拿到一批「玩家真实发言」材料（含标题/来源/正文），请做情感与议题分析，并严格输出一个 JSON 对象。

分析要求：
1. 只基于给定内容，不要编造；某部分内容不足时，对应字段写"信息不足"。
2. 区分"玩过的人在骂"（版本/产品问题）和"没玩过的人在跟风"（公关问题），两者处置方式不同。
3. 尽量引用玩家原话并标注来源与时间；通稿、软文、官方公告要降权或忽略。
4. 若同一话术在短时间内多账号重复出现，标注"疑似水军/竞品拉踩"，不要当作真实民意统计。
5. 小红书是主要舆情阵地：内容是「笔记」（标题+正文+评论区），要区分笔记正文与评论区情绪；玩家常用「避雷/种草/拔草/集美/姐妹/蹲后续」等口语，按游戏场景理解，不要照字面误判；渠道分析时优先小红书。

严格按下面 JSON 结构输出（不要输出任何 JSON 以外的文字，也不要 markdown 代码块）：

{
  "headline": "一句话总结本期舆情",
  "dataBoard": {
    "volume": 0,
    "sentiment": { "positive": 0.0, "neutral": 0.0, "negative": 0.0 },
    "mom": "环比变化说明（无历史数据就写：暂无环比）",
    "top3": ["热度话题1", "热度话题2", "热度话题3"],
    "alerts": [ { "level": "high", "text": "需要立刻关注的预警" } ]
  },
  "player": {
    "sentimentTrend": "情绪分布与走势说明",
    "complaints": [ { "topic": "吐槽主题", "mentions": 0, "sentiment": "negative", "sample": "玩家原话", "source": "贴吧", "time": "时间" } ],
    "highlights": ["玩家自发好评的亮点"],
    "quotes": [ { "text": "玩家原话", "source": "来源平台", "time": "时间" } ]
  },
  "versionActivity": {
    "versionReview": "版本更新评价",
    "activitySatisfaction": "活动满意度与性价比",
    "payment": "付费点与商业化反馈（抽卡/礼包/月卡）",
    "balance": "玩法与数值平衡争议"
  },
  "risk": {
    "cheat": "外挂脚本工作室",
    "server": "服务器稳定性卡顿掉线",
    "banService": "封号与客服处理",
    "compliance": "内容合规与舆论敏感点",
    "astroturf": "疑似竞品拉踩或有组织刷屏"
  },
  "channels": {
    "tieba": "贴吧表现", "bili": "B站表现", "douyin": "抖音表现",
    "xiaohongshu": "小红书表现", "zhihu": "知乎表现"
  },
  "competitors": {
    "actions": "竞品同期动作", "comparison": "竞品口碑对比", "churnSignals": "玩家流失/迁移信号"
  },
  "actions": {
    "today": ["今日内要响应的动作"],
    "announcement": ["公告口径建议"],
    "compensation": ["补偿/活动调整建议"],
    "nextWatch": ["下期重点监测方向"]
  }
}`;

function extractJson(text) {
  const s = (text || "").trim();
  const fenced = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(fenced);
  } catch (_) {
    /* fallthrough */
  }
  const a = fenced.indexOf("{");
  const b = fenced.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(fenced.slice(a, b + 1));
    } catch (_) {
      /* fallthrough */
    }
  }
  throw new Error("LLM 输出无法解析为 JSON");
}

async function analyzeWithLLM({ game, days, sources }, cfg) {
  const corpus = sources
    .map((s, i) => {
      const title = s.title ? `【标题】${s.title}` : "";
      const url = s.url ? `【来源】${s.url}` : "";
      const content = String(s.content || "").slice(0, 2000);
      return `--- 第${i + 1}条 ---\n${title}\n${url}\n${content}`;
    })
    .join("\n\n");

  const userPrompt =
    `游戏：${game}\n监测时间窗：近 ${days} 天\n\n以下是检索到的玩家发言材料：\n\n${corpus}\n\n` +
    `请按系统要求输出 JSON 分析结果。`;

  const base = (cfg.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM ${resp.status}: ${text.slice(0, 400)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  return extractJson(content);
}

module.exports = { analyzeWithLLM };
