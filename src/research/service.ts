import { randomUUID } from "node:crypto";
import type { JaneRequest } from "../ai/types.js";
import { planSplitInference } from "../privacy/split-planner.js";

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  source?: "web" | "x" | "scrape";
}

async function postJson(endpoint: string, apiKey: string | undefined, body: unknown) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`RESEARCH_PROVIDER_ERROR:${response.status}`);
  return payload;
}

function normalizeResults(payload: Record<string, unknown>, source: SearchResult["source"]): SearchResult[] {
  const values = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.data)
      ? payload.data
      : [];
  return values.map((value) => {
    const item = value as Record<string, unknown>;
    return {
      title: String(item.title ?? item.name ?? item.text ?? "Result"),
      url: String(item.url ?? item.link ?? item.permalink ?? ""),
      snippet: item.snippet !== undefined
        ? String(item.snippet)
        : item.description !== undefined
          ? String(item.description)
          : item.text !== undefined
            ? String(item.text)
            : undefined,
      publishedAt: item.publishedAt !== undefined
        ? String(item.publishedAt)
        : item.published_at !== undefined
          ? String(item.published_at)
          : undefined,
      source
    };
  }).filter((item) => item.url || item.snippet);
}

export class JaneResearchService {
  status() {
    return {
      configured: Boolean(process.env.JANE_SEARCH_ENDPOINT),
      provider: process.env.JANE_SEARCH_PROVIDER ?? "configurable",
      webSearch: Boolean(process.env.JANE_SEARCH_ENDPOINT),
      webScrape: Boolean(process.env.JANE_SCRAPE_ENDPOINT),
      xSearch: Boolean(process.env.JANE_X_SEARCH_ENDPOINT),
      privateSplitResearch: true
    };
  }

  async search(query: string, maxResults = 8): Promise<SearchResult[]> {
    const endpoint = process.env.JANE_SEARCH_ENDPOINT;
    if (!endpoint) throw new Error("SEARCH_PROVIDER_NOT_CONFIGURED");
    const payload = await postJson(endpoint, process.env.JANE_SEARCH_API_KEY, {
      query,
      max_results: maxResults
    });
    return normalizeResults(payload, "web");
  }

  async scrape(url: string): Promise<SearchResult> {
    const endpoint = process.env.JANE_SCRAPE_ENDPOINT;
    if (!endpoint) throw new Error("SCRAPE_PROVIDER_NOT_CONFIGURED");
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("INVALID_SCRAPE_URL");

    const payload = await postJson(endpoint, process.env.JANE_SCRAPE_API_KEY ?? process.env.JANE_SEARCH_API_KEY, {
      url: parsed.toString()
    });
    const content = String(payload.content ?? payload.text ?? payload.markdown ?? "");
    return {
      title: String(payload.title ?? parsed.hostname),
      url: parsed.toString(),
      snippet: content.slice(0, 30_000),
      source: "scrape"
    };
  }

  async searchX(query: string, maxResults = 8): Promise<SearchResult[]> {
    const endpoint = process.env.JANE_X_SEARCH_ENDPOINT;
    if (!endpoint) throw new Error("X_SEARCH_PROVIDER_NOT_CONFIGURED");
    const payload = await postJson(endpoint, process.env.JANE_X_SEARCH_API_KEY ?? process.env.JANE_SEARCH_API_KEY, {
      query,
      max_results: maxResults
    });
    return normalizeResults(payload, "x");
  }

  async research(request: JaneRequest & {
    query?: string;
    urls?: string[];
    includeX?: boolean;
    maxResults?: number;
  }) {
    const query = request.query ?? request.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    if (!query.trim()) throw new Error("RESEARCH_QUERY_REQUIRED");

    const split = planSplitInference(request);
    const sanitizedQuery = query
      .replace(/<([A-Z_]+)_\d+>/g, "[$1]")
      .slice(0, 4000);

    const sourceGroups: SearchResult[][] = [];
    if (process.env.JANE_SEARCH_ENDPOINT) {
      sourceGroups.push(await this.search(sanitizedQuery, request.maxResults ?? 10));
    }
    if (request.includeX && process.env.JANE_X_SEARCH_ENDPOINT) {
      sourceGroups.push(await this.searchX(sanitizedQuery, Math.min(10, request.maxResults ?? 8)));
    }
    if (request.urls?.length && process.env.JANE_SCRAPE_ENDPOINT) {
      const scraped = await Promise.all(request.urls.slice(0, 5).map((url) => this.scrape(url)));
      sourceGroups.push(scraped);
    }

    if (sourceGroups.length === 0) throw new Error("RESEARCH_PROVIDER_NOT_CONFIGURED");

    const results = sourceGroups.flat();
    return {
      id: `research_${randomUUID().replace(/-/g, "")}`,
      query: sanitizedQuery,
      splitPlan: split,
      sources: results,
      sourceCount: results.length,
      capabilitiesUsed: {
        web: results.some((item) => item.source === "web"),
        x: results.some((item) => item.source === "x"),
        scrape: results.some((item) => item.source === "scrape")
      }
    };
  }
}
