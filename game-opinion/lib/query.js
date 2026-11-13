"use strict";

// 关注维度：决定分析的角度（对应 make_daily_query.py 里的 FOCUS_DIMENSIONS）
const FOCUS_DIMENSIONS = [
  "外挂、脚本与工作室",
  "服务器稳定性、卡顿掉线",
  "付费点与抽卡概率争议",
  "版本更新与活动性价比",
  "客服与封号处理",
  "竞品动态与玩家流失",
];

// 平台偏好（写进 query，影响检索倾向）
const PLATFORM_HINT = "贴吧、B站、抖音、小红书、微博超话、知乎";

function buildQuery(game, days, extra = "") {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const dims = FOCUS_DIMENSIONS.join("、");
  let q =
    `${game} 游戏玩家舆情分析，时间范围：${since} 至今（近 ${days} 天）。` +
    `重点检索 ${PLATFORM_HINT} 上的玩家真实发言，优先玩家原声，忽略通稿与买量软文。` +
    `分析维度：${dims}。` +
    `请统计各维度的提及量与情感倾向，引用具体玩家原话并标注来源链接和时间，` +
    `识别是否存在竞品拉踩或有组织刷屏，最后给出可执行的运营动作建议。`;
  if (extra) q += `补充要求：${extra}`;
  return q;
}

module.exports = { buildQuery, FOCUS_DIMENSIONS, PLATFORM_HINT };
