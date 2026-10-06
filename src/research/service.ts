import { randomUUID } from "node:crypto";
import type { JaneRequest } from "../ai/types.js";
import { planSplitInference } from "../privacy/split-planner.js";

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

export class JaneResearchService {
  status() {
    return {
      configured:Boolean(process.env.JANE_SEARCH_ENDPOINT),
      provider:process.env.JANE_SEARCH_PROVIDER ?? "configurable",
      privateSplitResearch:true
    };
  }

  async search(query:string, maxResults=8): Promise<SearchResult[]> {
    const endpoint=process.env.JANE_SEARCH_ENDPOINT;
    if(!endpoint) throw new Error("SEARCH_PROVIDER_NOT_CONFIGURED");
    const key=process.env.JANE_SEARCH_API_KEY;
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json",...(key?{authorization:`Bearer ${key}`}:{})},
      body:JSON.stringify({query,max_results:maxResults})
    });
    const body=await response.json().catch(()=>({})) as {results?:SearchResult[]};
    if(!response.ok) throw new Error(`SEARCH_PROVIDER_ERROR:${response.status}`);
    return Array.isArray(body.results)?body.results:[];
  }

  async research(request:JaneRequest & {query?:string}) {
    const query=request.query ?? request.messages.filter((m)=>m.role==="user").at(-1)?.content ?? "";
    if(!query.trim()) throw new Error("RESEARCH_QUERY_REQUIRED");
    const split=planSplitInference(request);
    const sanitizedQuery=query
      .replace(/<([A-Z_]+)_\d+>/g,"[$1]")
      .slice(0,4000);
    const results=await this.search(sanitizedQuery,10);
    return {
      id:`research_${randomUUID().replace(/-/g,"")}`,
      query:sanitizedQuery,
      splitPlan:split,
      sources:results,
      sourceCount:results.length
    };
  }
}
