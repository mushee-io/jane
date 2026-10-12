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

const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_EXTRACT_ENDPOINT = "https://api.tavily.com/extract";

function researchProvider(): string {
  return (process.env.JANE_SEARCH_PROVIDER ?? (process.env.TAVILY_API_KEY ? "tavily" : "configurable")).trim().toLowerCase();
}

function researchApiKey(): string | undefined {
  return process.env.TAVILY_API_KEY ?? process.env.JANE_SEARCH_API_KEY;
}

function searchEndpoint(): string | undefined {
  if (process.env.JANE_SEARCH_ENDPOINT) return process.env.JANE_SEARCH_ENDPOINT;
  if (researchProvider() === "tavily" && researchApiKey()) return TAVILY_SEARCH_ENDPOINT;
  return undefined;
}

function scrapeEndpoint(): string | undefined {
  if (process.env.JANE_SCRAPE_ENDPOINT) return process.env.JANE_SCRAPE_ENDPOINT;
  if (researchProvider() === "tavily" && researchApiKey()) return TAVILY_EXTRACT_ENDPOINT;
  return undefined;
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
          : item.content !== undefined
            ? String(item.content)
            : item.text !== undefined
              ? String(item.text)
              : item.raw_content !== undefined
                ? String(item.raw_content)
                : undefined,
      publishedAt: item.publishedAt !== undefined
        ? String(item.publishedAt)
        : item.published_at !== undefined
          ? String(item.published_at)
          : item.published_date !== undefined
            ? String(item.published_date)
            : undefined,
      source
    };
  }).filter((item) => item.url || item.snippet);
}

export class JaneResearchService {
  status() {
    const provider = researchProvider();
    return {
      configured: Boolean(searchEndpoint()),
      provider,
      webSearch: Boolean(searchEndpoint()),
      webScrape: Boolean(scrapeEndpoint()),
      xSearch: Boolean(process.env.JANE_X_SEARCH_ENDPOINT),
      privateSplitResearch: true
    };
  }

  async search(query: string, maxResults = 8): Promise<SearchResult[]> {
    const endpoint = searchEndpoint();
    if (!endpoint) throw new Error("SEARCH_PROVIDER_NOT_CONFIGURED");
    const provider = researchProvider();
    const payload = await postJson(endpoint, researchApiKey(), provider === "tavily"
      ? {
          query,
          search_depth: process.env.JANE_TAVILY_SEARCH_DEPTH ?? "basic",
          max_results: maxResults,
          topic: "general",
          include_answer: false,
          include_raw_content: false,
          include_published_date: true,
          include_images: false,
          safe_search: true
        }
      : {
          query,
          max_results: maxResults
        });
    return normalizeResults(payload, "web");
  }

  async scrape(url: string): Promise<SearchResult> {
    const endpoint = scrapeEndpoint();
    if (!endpoint) throw new Error("SCRAPE_PROVIDER_NOT_CONFIGURED");
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("INVALID_SCRAPE_URL");

    const provider = researchProvider();
    const payload = await postJson(
      endpoint,
      process.env.JANE_SCRAPE_API_KEY ?? researchApiKey(),
      provider === "tavily"
        ? {
            urls: parsed.toString(),
            extract_depth: process.env.JANE_TAVILY_EXTRACT_DEPTH ?? "basic",
            format: "markdown",
            include_images: false
          }
        : { url: parsed.toString() }
    );

    if (provider === "tavily") {
      const first = Array.isArray(payload.results) ? payload.results[0] as Record<string, unknown> | undefined : undefined;
      const content = String(first?.raw_content ?? "");
      if (!first || !content) throw new Error("SCRAPE_PROVIDER_EMPTY_RESULT");
      return {
        title: parsed.hostname,
        url: String(first.url ?? parsed.toString()),
        snippet: content.slice(0, 30_000),
        source: "scrape"
      };
    }

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
    if (searchEndpoint()) {
      sourceGroups.push(await this.search(sanitizedQuery, request.maxResults ?? 10));
    }
    if (request.includeX && process.env.JANE_X_SEARCH_ENDPOINT) {
      sourceGroups.push(await this.searchX(sanitizedQuery, Math.min(10, request.maxResults ?? 8)));
    }
    if (request.urls?.length && scrapeEndpoint()) {
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
