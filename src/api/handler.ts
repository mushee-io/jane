import { JaneAIService } from "../ai/service.js";
import {
  agentAccountSchema,
  enterpriseOrgSchema,
  feedbackSchema,
  janeRequestSchema,
  networkProviderSchema,
  policyEvaluateSchema
} from "../ai/schemas.js";
import {
  openAIChatSchema,
  openAIModels,
  openAIResponsesSchema,
  openAIStream,
  responseToJaneRequest,
  toJaneRequest,
  toOpenAIResponse,
  toOpenAIResponsesResult
} from "../openai/compat.js";
import { prepareSettlement, settlementStatus, verifySettlement } from "../monad/settlement.js";
import { verifyPrivacyReceipt, type PrivacyReceipt } from "../privacy/receipt.js";
import { getTokenUtility, tokenUtilityStatus } from "../token/utility.js";
import { agentWalletStatus, prepareAgentWalletCreation } from "../agents/onchain-wallet.js";
import { computeRegistryStatus, prepareComputeRegistration } from "../network/onchain-registry.js";
import type { JaneRequest } from "../ai/types.js";
import { unifiedCatalog, catalogSummary } from "../catalog/unified.js";
import { JaneMediaService, type MediaRequest } from "../media/service.js";
import { JaneResearchService } from "../research/service.js";
import { JaneDocumentService, type DocumentExtractRequest } from "../documents/service.js";
import { JaneAgenticService, type AgenticRunRequest } from "../agents/orchestrator.js";
import { JaneCharacterRegistry, type JaneCharacter } from "../characters/service.js";
import { JaneArenaService, type ArenaRequest } from "../arena/service.js";
import { ConfidentialComputeService, type AttestationDocument } from "../confidential/attestation.js";
import { ConfidentialGateway, type EncryptedInferenceEnvelope } from "../confidential/gateway.js";
import { TeamService, type JaneTeam, type TeamMember } from "../teams/service.js";
import { JaneVoiceService, type VoiceSessionRequest } from "../voice/service.js";
import { JaneEmbeddingService, type EmbeddingRequest } from "../embeddings/service.js";
import type { Hex } from "viem";

function json(payload: unknown, status = 200, extra: Record<string,string> = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-jane-admin,x-jane-org,x-jane-actor,x-jane-department,x-jane-agent",
      ...extra
    }
  });
}

async function parseBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function normalizePath(url: URL): string {
  const v1 = url.searchParams.get("v1");
  if (v1 !== null) return `/v1/${v1.replace(/^\/+/, "")}`;
  const routed = url.searchParams.get("path");
  if (!routed) return url.pathname;
  const clean = routed.replace(/^\/+/, "").replace(/^api\//, "");
  return `/api/${clean}`;
}

function openAIError(message: string, status = 400, code = "jane_error"): Response {
  return json({
    error: {
      message,
      type: "invalid_request_error",
      param: null,
      code
    }
  }, status);
}

function requireAdmin(request: Request): Response | null {
  const configured = process.env.JANE_ADMIN_KEY?.trim();
  if (!configured) return json({ error: "ADMIN_API_DISABLED" }, 503);
  const supplied = request.headers.get("x-jane-admin")?.trim();
  if (supplied !== configured) return json({ error: "ADMIN_UNAUTHORIZED" }, 401);
  return null;
}

function requestContext(request: Request, input: JaneRequest): JaneRequest {
  const orgId = request.headers.get("x-jane-org")?.trim();
  const actorId = request.headers.get("x-jane-actor")?.trim();
  const department = request.headers.get("x-jane-department")?.trim();
  const agentAccountId = request.headers.get("x-jane-agent")?.trim();

  return {
    ...input,
    enterprise: orgId
      ? { orgId, actorId: actorId || undefined, department: department || undefined }
      : input.enterprise,
    agentAccountId: agentAccountId || input.agentAccountId
  };
}

function requireJaneApiKey(request: Request): Response | null {
  const configured = (process.env.JANE_API_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length === 0) return null;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!configured.includes(token)) {
    return openAIError("Invalid or missing Jane API key.", 401, "invalid_api_key");
  }
  return null;
}

export function createApiHandler() {
  const jane = new JaneAIService();
  const media = new JaneMediaService();
  const research = new JaneResearchService();
  const documents = new JaneDocumentService();
  const agentic = new JaneAgenticService(jane, research, media);
  const characters = new JaneCharacterRegistry();
  const arena = new JaneArenaService();
  const confidential = new ConfidentialComputeService();
  const confidentialGateway = new ConfidentialGateway();
  const teams = new TeamService();
  const voice = new JaneVoiceService();
  const embeddings = new JaneEmbeddingService();

  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });

    const url = new URL(request.url);
    const path = normalizePath(url);

    try {
      if (path.startsWith("/v1/")) {
        const authError = requireJaneApiKey(request);
        if (authError) return authError;
      }

      if (request.method === "GET" && path === "/v1/models") {
        return json({ object: "list", data: openAIModels() });
      }

      if (request.method === "POST" && path === "/v1/responses") {
        let input;
        try {
          input = openAIResponsesSchema.parse(await parseBody(request));
        } catch {
          return openAIError("Invalid OpenAI-compatible Responses request.", 400, "invalid_request");
        }

        try {
          const result = await jane.chat(requestContext(request, responseToJaneRequest(input)));
          return json(toOpenAIResponsesResult(result, input.model));
        } catch (error) {
          const value = error as Error;
          const status = value.message === "NO_LIVE_AI_PROVIDER_CONFIGURED" ? 503 : 502;
          return openAIError(value.message, status, "upstream_error");
        }
      }

      if (request.method === "POST" && path === "/v1/chat/completions") {
        let input;
        try {
          input = openAIChatSchema.parse(await parseBody(request));
        } catch (error) {
          const value = error as { issues?: unknown[] };
          return openAIError(
            Array.isArray(value.issues) ? "Invalid OpenAI-compatible chat request." : "Invalid request.",
            400,
            "invalid_request"
          );
        }

        try {
          const result = await jane.chat(requestContext(request, toJaneRequest(input)));
          if (input.stream) {
            return new Response(openAIStream(result, input.model), {
              status: 200,
              headers: {
                "content-type": "text/event-stream; charset=utf-8",
                "cache-control": "no-cache, no-transform",
                "connection": "keep-alive",
                "access-control-allow-origin": "*"
              }
            });
          }
          return json(toOpenAIResponse(result, input.model));
        } catch (error) {
          const value = error as Error & { failures?: unknown };
          const status = value.message === "NO_LIVE_AI_PROVIDER_CONFIGURED" ? 503 : 502;
          return openAIError(value.message, status, "upstream_error");
        }
      }

      if (request.method === "POST" && path === "/v1/images/generations") {
        const body = await parseBody(request) as Record<string, unknown>;
        if (!String(body.prompt ?? "").trim()) return openAIError("prompt is required", 400, "invalid_request");
        const result = await media.generate({
          modality: "image",
          operation: "text-to-image",
          prompt: String(body.prompt),
          maxCostUsd: typeof body.max_cost_usd === "number" ? body.max_cost_usd : undefined,
          privacy: body.privacy === "confidential" ? "confidential" : body.privacy === "private" ? "private" : "standard",
          metadata: {
            size: body.size,
            quality: body.quality,
            style: body.style,
            n: body.n
          }
        });
        const output = result.output as Record<string, unknown>;
        return json({
          created: Math.floor(Date.now() / 1000),
          data: Array.isArray(output.data) ? output.data : [output],
          jane: { provider: result.provider, model: result.model, estimated_cost_usd: result.estimatedCostUsd }
        });
      }

      if (request.method === "POST" && path === "/v1/video/generations") {
        const body = await parseBody(request) as Record<string, unknown>;
        if (!String(body.prompt ?? "").trim()) return openAIError("prompt is required", 400, "invalid_request");
        return json(await media.generate({
          modality: "video",
          operation: body.input_url ? "image-to-video" : "text-to-video",
          prompt: String(body.prompt),
          inputUrl: typeof body.input_url === "string" ? body.input_url : undefined,
          durationSeconds: typeof body.duration === "number" ? body.duration : undefined,
          maxCostUsd: typeof body.max_cost_usd === "number" ? body.max_cost_usd : undefined,
          privacy: body.privacy === "confidential" ? "confidential" : body.privacy === "private" ? "private" : "standard",
          metadata: body
        }));
      }

      if (request.method === "POST" && path === "/v1/audio/speech") {
        const body = await parseBody(request) as Record<string, unknown>;
        if (!String(body.input ?? "").trim()) return openAIError("input is required", 400, "invalid_request");
        return json(await media.generate({
          modality: "speech",
          operation: "tts",
          prompt: String(body.input),
          voice: typeof body.voice === "string" ? body.voice : undefined,
          format: typeof body.response_format === "string" ? body.response_format : undefined,
          privacy: body.privacy === "confidential" ? "confidential" : body.privacy === "private" ? "private" : "standard",
          metadata: { speed: body.speed, model: body.model }
        }));
      }

      if (request.method === "POST" && path === "/v1/audio/music") {
        const body = await parseBody(request) as Record<string, unknown>;
        if (!String(body.prompt ?? "").trim()) return openAIError("prompt is required", 400, "invalid_request");
        return json(await media.generate({
          modality: "audio",
          operation: "music",
          prompt: String(body.prompt),
          durationSeconds: typeof body.duration === "number" ? body.duration : undefined,
          privacy: body.privacy === "confidential" ? "confidential" : body.privacy === "private" ? "private" : "standard",
          metadata: body
        }));
      }

      if (request.method === "POST" && path === "/v1/embeddings") {
        const body = await parseBody(request) as EmbeddingRequest;
        if (typeof body.input !== "string" && !Array.isArray(body.input)) return openAIError("input is required", 400, "invalid_request");
        return json(await embeddings.create(body));
      }

      if (request.method === "POST" && path === "/v1/search") {
        const body = await parseBody(request) as Record<string, unknown>;
        const query = String(body.query ?? "").trim();
        if (!query) return openAIError("query is required", 400, "invalid_request");
        const results = await research.search(query, Math.min(20, Math.max(1, Number(body.max_results ?? 8))));
        return json({ object: "search.results", data: results });
      }

      if (request.method === "GET" && (path === "/api/health" || path === "/api/ai/health")) {
        return json(jane.health());
      }

      if (request.method === "GET" && path === "/api/readiness") {
        const health = jane.health();
        const agentWallet = agentWalletStatus();
        const computeRegistry = computeRegistryStatus();
        const token = tokenUtilityStatus();
        const aiReady = health.configuredProviders.length > 0;
        const monadReady = health.monad.configured;
        return json({
          status: aiReady && monadReady ? "hackathon-ready" : aiReady ? "ai-ready" : "configuration-required",
          core: {
            aiProvider: aiReady,
            privateOrJaneCompute: health.availableRoutes.some((route) =>
              route.configured && (route.id === "jane-private" || route.id === "jane-compute")
            ),
            openAICompatibleApi: true,
            localPrivacyFirewall: true,
            encryptedVault: true,
            edgeIntelligence: true
          },
          monad: {
            settlement: monadReady,
            agentWalletFactory: agentWallet.configured,
            computeRegistry: computeRegistry.configured
          },
          network: health.providerNetwork,
          enterpriseOrganizations: health.enterprise.organizations,
          catalog: catalogSummary(),
          creator: {
            configuredModels: media.list().filter((model) => model.configured).length,
            modalities: [...new Set(media.list().filter((model) => model.configured).map((model) => model.modality))]
          },
          research: research.status(),
          voice: voice.status(),
          confidential: {
            ...confidential.status(),
            gateway: confidentialGateway.status()
          },
          teams: { count: teams.list().length },
          developer: {
            openAICompatibleApi: true,
            javascriptSdk: true,
            pythonSdk: true,
            cli: true,
            mcp: true,
            pwa: true
          },
          token: {
            optional: true,
            configured: token.configured,
            symbol: token.symbol,
            maxSupply: token.maxSupply
          }
        });
      }

      if (request.method === "GET" && path === "/api/ai/models") {
        return json({ models: jane.models() });
      }

      if (request.method === "GET" && path === "/api/ai/metrics") {
        return json({ metrics: jane.telemetry.snapshot() });
      }

      if (request.method === "POST" && path === "/api/ai/route") {
        const input = requestContext(request, janeRequestSchema.parse(await parseBody(request)));
        return json(jane.preview(input));
      }

      if (request.method === "POST" && path === "/api/ai/plan") {
        const input = requestContext(request, janeRequestSchema.parse(await parseBody(request)));
        return json(jane.plan(input));
      }

      if (request.method === "POST" && path === "/api/ai/chat") {
        const input = requestContext(request, janeRequestSchema.parse(await parseBody(request)));
        try {
          return json(await jane.chat(input));
        } catch (error) {
          const value = error as Error & { route?: unknown; failures?: unknown };
          const status = value.message === "NO_LIVE_AI_PROVIDER_CONFIGURED" ? 503 : 502;
          return json({ error: value.message, route: value.route, failures: value.failures }, status);
        }
      }

      if (request.method === "POST" && path === "/api/ai/feedback") {
        const input = feedbackSchema.parse(await parseBody(request));
        return json(jane.feedback(input.requestId, input.signal));
      }

      if (request.method === "POST" && path === "/api/edge/plan") {
        const input = requestContext(request, janeRequestSchema.parse(await parseBody(request)));
        return json(jane.edge(input));
      }

      if (request.method === "GET" && path === "/api/agents") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        return json({ agents: jane.agents.list() });
      }

      if (request.method === "POST" && path === "/api/agents") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const input = agentAccountSchema.parse(await parseBody(request));
        return json({ agent: jane.agents.upsert(input) }, 201);
      }

      if (request.method === "POST" && /^\/api\/agents\/[^/]+\/disable$/.test(path)) {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const id = path.split("/")[3] ?? "";
        const agent = jane.agents.disable(id);
        return agent ? json({ agent }) : json({ error: "AGENT_NOT_FOUND" }, 404);
      }

      if (request.method === "GET" && path === "/api/agents/wallet/status") {
        return json(agentWalletStatus());
      }

      if (request.method === "POST" && path === "/api/agents/wallet/prepare") {
        const body = await parseBody(request) as {
          owner?: string;
          dailyLimitAtomic?: string;
          perRequestLimitAtomic?: string;
        };
        if (!body.owner || !body.dailyLimitAtomic || !body.perRequestLimitAtomic) {
          return json({ error: "OWNER_AND_BUDGETS_REQUIRED" }, 400);
        }
        return json(prepareAgentWalletCreation({
          owner: body.owner,
          dailyLimitAtomic: body.dailyLimitAtomic,
          perRequestLimitAtomic: body.perRequestLimitAtomic
        }));
      }

      if (request.method === "GET" && path === "/api/network/registry/status") {
        return json(computeRegistryStatus());
      }

      if (request.method === "POST" && path === "/api/network/registry/prepare") {
        const body = await parseBody(request) as {
          metadata?: Record<string, unknown>;
          endpoint?: string;
          bondNative?: string;
        };
        if (!body.metadata || !body.endpoint) {
          return json({ error: "METADATA_AND_ENDPOINT_REQUIRED" }, 400);
        }
        return json(prepareComputeRegistration({
          metadata: body.metadata,
          endpoint: body.endpoint,
          bondNative: body.bondNative
        }));
      }

      if (request.method === "GET" && path === "/api/network/summary") {
        return json(jane.market.summary());
      }

      if (request.method === "GET" && path === "/api/network/providers") {
        return json({
          providers: jane.market.list().map((node) => ({
            nodeId: node.nodeId,
            operator: node.operator,
            name: node.name,
            model: node.model,
            label: node.label,
            capabilities: node.capabilities,
            contextWindow: node.contextWindow,
            inputCostPerMillion: node.inputCostPerMillion,
            outputCostPerMillion: node.outputCostPerMillion,
            qualityScore: node.qualityScore,
            latencyScore: node.latencyScore,
            privacyScore: node.privacyScore,
            zeroRetention: node.zeroRetention,
            region: node.region,
            capacityRpm: node.capacityRpm,
            reputation: node.reputation,
            successfulJobs: node.successfulJobs,
            failedJobs: node.failedJobs,
            lastHeartbeatAt: node.lastHeartbeatAt
          }))
        });
      }

      if (request.method === "POST" && path === "/api/network/providers") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const input = networkProviderSchema.parse(await parseBody(request));
        return json({ provider: jane.market.upsert(input) }, 201);
      }

      if (request.method === "POST" && /^\/api\/network\/providers\/[^/]+\/heartbeat$/.test(path)) {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const nodeId = path.split("/")[4] ?? "";
        return json({ provider: jane.market.heartbeat(nodeId) });
      }

      if (request.method === "GET" && path === "/api/enterprise/orgs") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        return json({ organizations: jane.enterprise.listOrgs() });
      }

      if (request.method === "POST" && path === "/api/enterprise/orgs") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const input = enterpriseOrgSchema.parse(await parseBody(request));
        return json({ organization: jane.enterprise.upsertOrg(input) }, 201);
      }

      if (request.method === "GET" && path === "/api/enterprise/audit") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        return json({ events: jane.enterprise.auditLog(url.searchParams.get("orgId") ?? undefined) });
      }

      if (request.method === "GET" && path === "/api/token/status") {
        return json(tokenUtilityStatus());
      }

      if (request.method === "GET" && path === "/api/token/utility") {
        const address = url.searchParams.get("address");
        if (!address) return json({ error: "ADDRESS_REQUIRED" }, 400);
        return json(await getTokenUtility(address));
      }

      if (request.method === "GET" && path === "/api/catalog") {
        return json({ summary: catalogSummary(), models: unifiedCatalog() });
      }

      if (request.method === "GET" && path === "/api/media/models") {
        return json({ models: media.list() });
      }

      if (request.method === "POST" && path === "/api/media/generate") {
        const body = await parseBody(request) as MediaRequest;
        if (!body?.modality || !body?.operation) return json({ error: "MODALITY_AND_OPERATION_REQUIRED" }, 400);
        return json(await media.generate(body));
      }

      if (request.method === "GET" && path === "/api/research/status") {
        return json(research.status());
      }

      if (request.method === "POST" && path === "/api/documents/extract") {
        const body = await parseBody(request) as DocumentExtractRequest;
        return json(await documents.extract(body));
      }

      if (request.method === "POST" && path === "/api/agent/plan") {
        const body = await parseBody(request) as AgenticRunRequest;
        const parsed = requestContext(request, janeRequestSchema.parse(body));
        return json({ steps: agentic.plan({ ...body, ...parsed }) });
      }

      if (request.method === "POST" && path === "/api/agent/run") {
        const body = await parseBody(request) as AgenticRunRequest;
        const parsed = requestContext(request, janeRequestSchema.parse(body));
        return json(await agentic.run({ ...body, ...parsed }));
      }

      if (request.method === "GET" && path === "/api/voice/status") {
        return json(voice.status());
      }

      if (request.method === "POST" && path === "/api/voice/session") {
        const body = await parseBody(request) as VoiceSessionRequest;
        return json(await voice.createSession(body));
      }

      if (request.method === "POST" && path === "/api/research") {
        const body = await parseBody(request) as JaneRequest & {
          query?: string;
          synthesize?: boolean;
          urls?: string[];
          includeX?: boolean;
          maxResults?: number;
        };
        const input = requestContext(request, janeRequestSchema.parse(body));
        const result = await research.research({
          ...input,
          query: body.query,
          urls: body.urls,
          includeX: body.includeX,
          maxResults: body.maxResults
        });
        if (body.synthesize === false || result.sources.length === 0) return json(result);

        try {
          const sourceContext = result.sources.map((source, index) =>
            `[${index + 1}] ${source.title}\n${source.url}\n${source.snippet ?? ""}`
          ).join("\n\n");
          const synthesis = await jane.chat({
            ...input,
            messages: [
              {
                role: "system",
                content: "You are Jane Research. Synthesize only from the supplied public sources. Cite source numbers like [1]. Do not infer private data that is not in the sanitized query."
              },
              {
                role: "user",
                content: `Question:\n${result.query}\n\nPublic sources:\n${sourceContext}`
              }
            ]
          });
          return json({ ...result, answer: synthesis.answer, synthesisRoute: synthesis.route });
        } catch (error) {
          return json({
            ...result,
            answer: null,
            synthesisError: error instanceof Error ? error.message : "RESEARCH_SYNTHESIS_FAILED"
          });
        }
      }

      if (request.method === "GET" && path === "/api/characters") {
        return json({ characters: characters.list() });
      }

      if (request.method === "POST" && path === "/api/characters") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const body = await parseBody(request) as Omit<JaneCharacter, "id"|"createdAt"> & { id?: string };
        if (!body?.name || !body?.systemPrompt) return json({ error: "NAME_AND_SYSTEM_PROMPT_REQUIRED" }, 400);
        return json({ character: characters.upsert(body) }, 201);
      }

      if (request.method === "POST" && /^\/api\/characters\/[^/]+\/chat$/.test(path)) {
        const characterId = path.split("/")[3] ?? "";
        const character = characters.get(characterId);
        if (!character) return json({ error: "CHARACTER_NOT_FOUND" }, 404);
        const body = await parseBody(request) as JaneRequest;
        const parsed = requestContext(request, janeRequestSchema.parse({
          ...body,
          mode: body.mode ?? character.defaultMode
        }));
        return json(await jane.chat({
          ...parsed,
          mode: parsed.mode ?? character.defaultMode,
          messages: [
            { role: "system", content: character.systemPrompt },
            ...parsed.messages
          ]
        }));
      }

      if (request.method === "POST" && path === "/api/arena") {
        const body = await parseBody(request) as ArenaRequest;
        if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ error: "MESSAGES_REQUIRED" }, 400);
        return json(await arena.run(body));
      }

      if (request.method === "GET" && path === "/api/confidential/status") {
        return json(confidential.status());
      }

      if (request.method === "GET" && path === "/api/confidential/attestation") {
        const document = await confidential.fetchAttestation();
        return json({ document, verification: await confidential.verifyTrusted(document) });
      }

      if (request.method === "POST" && path === "/api/confidential/verify") {
        const body = await parseBody(request) as { document?: AttestationDocument };
        if (!body.document) return json({ error: "ATTESTATION_DOCUMENT_REQUIRED" }, 400);
        return json(await confidential.verifyTrusted(body.document));
      }

      if (request.method === "GET" && path === "/api/confidential/envelope") {
        const attestation = await confidential.fetchAttestation();
        const verification = await confidential.verifyTrusted(attestation);
        if (!verification.valid) return json({ error: "ENCLAVE_ATTESTATION_NOT_VERIFIED", verification }, 503);
        return json({
          ...confidential.clientEnvelope(),
          attestationFingerprint: verification.fingerprint,
          enclaveId: verification.enclaveId,
          provider: verification.provider
        });
      }

      if (request.method === "GET" && path === "/api/confidential/gateway/status") {
        return json(confidentialGateway.status());
      }

      if (request.method === "POST" && path === "/api/confidential/infer") {
        const body = await parseBody(request) as EncryptedInferenceEnvelope;
        if (!body?.ciphertext || !body?.encryptedKey || !body?.iv || !body?.attestationFingerprint) {
          return json({ error: "ENCRYPTED_ENVELOPE_REQUIRED" }, 400);
        }
        return json(await confidentialGateway.infer(body));
      }

      if (request.method === "GET" && path === "/api/teams") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        return json({ teams: teams.list() });
      }

      if (request.method === "POST" && path === "/api/teams") {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const body = await parseBody(request) as Omit<JaneTeam, "id"|"createdAt"> & { id?: string };
        if (!body?.name || !Array.isArray(body.members)) return json({ error: "TEAM_NAME_AND_MEMBERS_REQUIRED" }, 400);
        return json({ team: teams.upsert(body) }, 201);
      }

      if (request.method === "POST" && /^\/api\/teams\/[^/]+\/members$/.test(path)) {
        const adminError = requireAdmin(request);
        if (adminError) return adminError;
        const teamId = path.split("/")[3] ?? "";
        const body = await parseBody(request) as TeamMember;
        if (!body?.userId || !body?.role) return json({ error: "USER_AND_ROLE_REQUIRED" }, 400);
        return json({ team: teams.addMember(teamId, body) });
      }

      if (request.method === "GET" && path === "/api/benchmarks") {
        return json({ runs: jane.benchmarks.list(Number(url.searchParams.get("limit") ?? 200)) });
      }

      if (request.method === "GET" && path === "/api/benchmarks/leaderboard") {
        return json({ leaderboard: jane.benchmarks.leaderboard() });
      }

      if (request.method === "POST" && path === "/api/privacy/verify") {
        const body = await parseBody(request) as { receipt?: PrivacyReceipt };
        if (!body.receipt || typeof body.receipt !== "object") {
          return json({ error: "RECEIPT_REQUIRED" }, 400);
        }
        return json({
          valid: verifyPrivacyReceipt(body.receipt),
          receiptId: body.receipt.receiptId ?? null,
          receiptHash: body.receipt.receiptHash ?? null
        });
      }

      if (request.method === "POST" && path === "/api/policy/evaluate") {
        const input = policyEvaluateSchema.parse(await parseBody(request));
        return json(jane.evaluatePolicy(input.policy, input.mode));
      }

      if (request.method === "GET" && path === "/api/policy/usage") {
        const principal = url.searchParams.get("principal");
        if (!principal) return json({ error: "PRINCIPAL_REQUIRED" }, 400);
        return json(jane.policyUsage(principal));
      }

      if (request.method === "GET" && path === "/api/monad/status") {
        return json(settlementStatus());
      }

      if (request.method === "POST" && path === "/api/monad/settlement/prepare") {
        const body = await parseBody(request) as { receipt?: PrivacyReceipt };
        if (!body.receipt || !verifyPrivacyReceipt(body.receipt)) {
          return json({ error: "VALID_PRIVACY_RECEIPT_REQUIRED" }, 400);
        }
        return json(prepareSettlement(body.receipt));
      }

      if (request.method === "POST" && path === "/api/monad/settlement/verify") {
        const body = await parseBody(request) as { txHash?: Hex; receiptHash?: string };
        if (!body.txHash || !/^0x[a-fA-F0-9]{64}$/.test(body.txHash)) {
          return json({ error: "VALID_TX_HASH_REQUIRED" }, 400);
        }
        if (!body.receiptHash || !/^(0x)?[a-fA-F0-9]{64}$/.test(body.receiptHash)) {
          return json({ error: "VALID_RECEIPT_HASH_REQUIRED" }, 400);
        }
        const executionReceipt = await verifySettlement(body.txHash, body.receiptHash);
        return json({ executionReceipt });
      }

      return json({ error: "NOT_FOUND", path, method: request.method }, 404);
    } catch (error) {
      const value = error as { issues?: unknown[]; message?: string };
      if (Array.isArray(value.issues)) {
        return json({ error: "VALIDATION_ERROR", issues: value.issues }, 400);
      }
      return json({ error: value.message ?? "UNKNOWN_ERROR" }, 400);
    }
  };
}
