import { randomUUID } from "node:crypto";
import type { JaneMode, SpendingPolicy } from "../ai/types.js";

export interface AgentAccount {
  id: string;
  name: string;
  owner: string;
  walletAddress?: string;
  delegateAddress?: string;
  active: boolean;
  dailyBudgetUsd: number;
  maxCostUsdPerRequest: number;
  allowedModes: JaneMode[];
  requireZeroRetention: boolean;
  minPrivacyScore?: number;
  createdAt: string;
  updatedAt: string;
}

function bootstrap(): AgentAccount[] {
  const raw = process.env.JANE_AGENT_ACCOUNTS_JSON;
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as AgentAccount[];
    return Array.isArray(value) ? value.filter((entry) => entry?.id && entry?.owner) : [];
  } catch {
    return [];
  }
}

export class AgentAccountRegistry {
  private readonly accounts = new Map<string, AgentAccount>();

  constructor() {
    for (const account of bootstrap()) this.accounts.set(account.id, account);
  }

  list(): AgentAccount[] {
    return [...this.accounts.values()].map((entry) => ({ ...entry }));
  }

  get(id: string): AgentAccount | null {
    const account = this.accounts.get(id);
    return account ? { ...account } : null;
  }

  upsert(input: Partial<AgentAccount> & Pick<AgentAccount, "name" | "owner">): AgentAccount {
    const id = input.id?.trim() || `agent_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const existing = this.accounts.get(id);
    const now = new Date().toISOString();

    const account: AgentAccount = {
      id,
      name: input.name.trim(),
      owner: input.owner.trim(),
      walletAddress: input.walletAddress?.trim() || existing?.walletAddress,
      delegateAddress: input.delegateAddress?.trim() || existing?.delegateAddress,
      active: input.active ?? existing?.active ?? true,
      dailyBudgetUsd: Math.max(0.000001, input.dailyBudgetUsd ?? existing?.dailyBudgetUsd ?? 2),
      maxCostUsdPerRequest: Math.max(0.000001, input.maxCostUsdPerRequest ?? existing?.maxCostUsdPerRequest ?? 0.05),
      allowedModes: input.allowedModes?.length ? [...input.allowedModes] : existing?.allowedModes ?? ["auto", "fast", "reason", "code", "private", "confidential"],
      requireZeroRetention: input.requireZeroRetention ?? existing?.requireZeroRetention ?? false,
      minPrivacyScore: input.minPrivacyScore ?? existing?.minPrivacyScore,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.accounts.set(id, account);
    return { ...account };
  }

  disable(id: string): AgentAccount | null {
    const current = this.accounts.get(id);
    if (!current) return null;
    const updated = { ...current, active: false, updatedAt: new Date().toISOString() };
    this.accounts.set(id, updated);
    return { ...updated };
  }

  spendingPolicy(id: string): SpendingPolicy {
    const account = this.accounts.get(id);
    if (!account || !account.active) throw new Error("AGENT_ACCOUNT_NOT_ACTIVE");
    return {
      principal: account.id,
      maxCostUsdPerRequest: account.maxCostUsdPerRequest,
      dailyBudgetUsd: account.dailyBudgetUsd,
      allowedModes: account.allowedModes,
      requireZeroRetention: account.requireZeroRetention,
      minPrivacyScore: account.minPrivacyScore
    };
  }
}
