"use strict";

// Tavily 搜索：只走官方 API，不爬网页、不碰登录态，风险最低。
// 文档：https://docs.tavily.com/documentation/api-reference/endpoint/search
async function searchTavily(query, apiKey, { maxResults = 20, searchDepth = "basic" } = {}) {
  const url = "https://api.tavily.com/search";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      include_answer: true,
      max_results: maxResults,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Tavily ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  const results = (data.results || []).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    content: r.content || "",
    score: typeof r.score === "number" ? r.score : null,
  }));

  return { answer: data.answer || "", results };
}

module.exports = { searchTavily };
