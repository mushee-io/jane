import test from "node:test";
import assert from "node:assert/strict";
import { JaneResearchService } from "../src/research/service.js";

test("Tavily is a one-key search + extract adapter", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    JANE_SEARCH_PROVIDER: process.env.JANE_SEARCH_PROVIDER,
    JANE_SEARCH_ENDPOINT: process.env.JANE_SEARCH_ENDPOINT,
    JANE_SCRAPE_ENDPOINT: process.env.JANE_SCRAPE_ENDPOINT
  };

  process.env.TAVILY_API_KEY = "tvly-test";
  process.env.JANE_SEARCH_PROVIDER = "tavily";
  delete process.env.JANE_SEARCH_ENDPOINT;
  delete process.env.JANE_SCRAPE_ENDPOINT;

  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });

    if (url.endsWith("/search")) {
      return Response.json({
        results: [{
          title: "Jane result",
          url: "https://example.com/result",
          content: "Tavily content snippet",
          published_date: "2026-10-12T10:00:00Z"
        }]
      });
    }

    return Response.json({
      results: [{
        url: "https://example.com/article",
        raw_content: "# Extracted article\nUseful source text."
      }],
      failed_results: []
    });
  };

  try {
    const service = new JaneResearchService();
    const status = service.status();
    assert.equal(status.configured, true);
    assert.equal(status.provider, "tavily");
    assert.equal(status.webSearch, true);
    assert.equal(status.webScrape, true);

    const search = await service.search("Jane AI", 4);
    assert.equal(calls[0]?.url, "https://api.tavily.com/search");
    assert.equal(calls[0]?.body.max_results, 4);
    assert.equal(calls[0]?.body.include_answer, false);
    assert.equal(search[0]?.snippet, "Tavily content snippet");
    assert.equal(search[0]?.publishedAt, "2026-10-12T10:00:00Z");

    const scraped = await service.scrape("https://example.com/article");
    assert.equal(calls[1]?.url, "https://api.tavily.com/extract");
    assert.equal(calls[1]?.body.urls, "https://example.com/article");
    assert.match(scraped.snippet ?? "", /Extracted article/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
