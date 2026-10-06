import { randomUUID } from "node:crypto";
import type { ModelProfile, TaskKind } from "../ai/types.js";

export interface NetworkProviderManifest {
  nodeId: string;
  operator: string;
  name: string;
  endpoint: string;
  apiKeyEnv?: string;
  model: string;
  label: string;
  capabilities: TaskKind[];
  contextWindow: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  qualityScore: number;
  latencyScore: number;
  privacyScore: number;
  zeroRetention: boolean;
  region?: string;
  capacityRpm: number;
  reputation: number;
  successfulJobs: number;
  failedJobs: number;
  lastHeartbeatAt: string;
  active: boolean;
}

function allowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !(url.hostname === "localhost" || url.hostname === "127.0.0.1")) return false;
    const allowlist = (process.env.JANE_NETWORK_ALLOWED_HOSTS ?? "")
      .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!allowlist.length) return true;
    return allowlist.some((host) => url.hostname.toLowerCase() === host || url.hostname.toLowerCase().endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function bootstrap(): NetworkProviderManifest[] {
  const raw = process.env.JANE_NETWORK_PROVIDERS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as NetworkProviderManifest[];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.nodeId && allowedEndpoint(entry.endpoint)) : [];
  } catch {
    return [];
  }
}

export class ProviderMarket {
  private readonly nodes = new Map<string, NetworkProviderManifest>();

  constructor() {
    for (const node of bootstrap()) this.nodes.set(node.nodeId, node);
  }

  list(includeInactive = false): NetworkProviderManifest[] {
    return [...this.nodes.values()]
      .filter((node) => includeInactive || node.active)
      .map((node) => ({ ...node }));
  }

  upsert(input: Partial<NetworkProviderManifest> & Pick<NetworkProviderManifest, "operator" | "name" | "endpoint" | "model" | "label">): NetworkProviderManifest {
    if (!allowedEndpoint(input.endpoint)) throw new Error("NETWORK_ENDPOINT_NOT_ALLOWED");
    const nodeId = input.nodeId?.trim() || `node_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const existing = this.nodes.get(nodeId);
    const now = new Date().toISOString();
    const node: NetworkProviderManifest = {
      nodeId,
      operator: input.operator.trim(),
      name: input.name.trim(),
      endpoint: input.endpoint.replace(/\/$/, ""),
      apiKeyEnv: input.apiKeyEnv?.trim() || existing?.apiKeyEnv,
      model: input.model.trim(),
      label: input.label.trim(),
      capabilities: input.capabilities?.length ? [...input.capabilities] : existing?.capabilities ?? ["general"],
      contextWindow: Math.max(1024, input.contextWindow ?? existing?.contextWindow ?? 128000),
      inputCostPerMillion: Math.max(0, input.inputCostPerMillion ?? existing?.inputCostPerMillion ?? 0.1),
      outputCostPerMillion: Math.max(0, input.outputCostPerMillion ?? existing?.outputCostPerMillion ?? 0.3),
      qualityScore: Math.min(1, Math.max(0, input.qualityScore ?? existing?.qualityScore ?? 0.75)),
      latencyScore: Math.min(1, Math.max(0, input.latencyScore ?? existing?.latencyScore ?? 0.75)),
      privacyScore: Math.min(1, Math.max(0, input.privacyScore ?? existing?.privacyScore ?? 0.7)),
      zeroRetention: input.zeroRetention ?? existing?.zeroRetention ?? false,
      region: input.region?.trim() || existing?.region,
      capacityRpm: Math.max(1, input.capacityRpm ?? existing?.capacityRpm ?? 60),
      reputation: Math.min(1, Math.max(0, input.reputation ?? existing?.reputation ?? 0.8)),
      successfulJobs: input.successfulJobs ?? existing?.successfulJobs ?? 0,
      failedJobs: input.failedJobs ?? existing?.failedJobs ?? 0,
      lastHeartbeatAt: input.lastHeartbeatAt ?? existing?.lastHeartbeatAt ?? now,
      active: input.active ?? existing?.active ?? true
    };
    this.nodes.set(nodeId, node);
    return { ...node };
  }

  heartbeat(nodeId: string): NetworkProviderManifest {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error("NETWORK_NODE_NOT_FOUND");
    const updated = { ...node, active: true, lastHeartbeatAt: new Date().toISOString() };
    this.nodes.set(nodeId, updated);
    return { ...updated };
  }

  record(nodeId: string, success: boolean): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    const successfulJobs = node.successfulJobs + (success ? 1 : 0);
    const failedJobs = node.failedJobs + (success ? 0 : 1);
    const total = successfulJobs + failedJobs;
    const observed = total ? successfulJobs / total : 0.8;
    const reputation = Math.min(0.99, Math.max(0.2, node.reputation * 0.75 + observed * 0.25));
    this.nodes.set(nodeId, { ...node, successfulJobs, failedJobs, reputation });
  }

  modelProfiles(): ModelProfile[] {
    const staleMs = Number(process.env.JANE_NETWORK_HEARTBEAT_STALE_MS ?? 300_000);
    const now = Date.now();
    return this.list()
      .filter((node) => now - Date.parse(node.lastHeartbeatAt) <= staleMs)
      .map((node) => ({
        id: `network:${node.nodeId}`,
        provider: "network",
        model: node.model,
        label: node.label,
        capabilities: node.capabilities,
        contextWindow: node.contextWindow,
        inputCostPerMillion: node.inputCostPerMillion,
        outputCostPerMillion: node.outputCostPerMillion,
        qualityScore: Math.min(0.99, node.qualityScore * 0.8 + node.reputation * 0.2),
        latencyScore: node.latencyScore,
        privacyScore: node.privacyScore,
        zeroRetention: node.zeroRetention,
        configured: true,
        endpoint: node.endpoint,
        apiKeyEnv: node.apiKeyEnv,
        networkNodeId: node.nodeId,
        region: node.region
      }));
  }

  summary() {
    const nodes = this.list();
    return {
      nodes: nodes.length,
      capacityRpm: nodes.reduce((sum, node) => sum + node.capacityRpm, 0),
      zeroRetentionNodes: nodes.filter((node) => node.zeroRetention).length,
      regions: [...new Set(nodes.map((node) => node.region).filter(Boolean))],
      averageReputation: nodes.length
        ? Number((nodes.reduce((sum, node) => sum + node.reputation, 0) / nodes.length).toFixed(4))
        : null
    };
  }
}
