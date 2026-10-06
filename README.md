# 33jane

**Private intelligence routing for the internet.**

33jane gives people and software one place to use the best AI models without having to decide which model to use, overpay for simple work, or expose more private context than necessary.

> **The internet should not have to choose an AI. 33jane chooses intelligence for it.**

## Milestones 1–35

### 1. Core 33jane Chat
The repository now ships a responsive AI chat product with:

- Auto, Fast, Reason, Code, Vision and Private modes
- local browser conversation history
- local text-file attachments
- provider health state
- per-answer route, cost and savings metadata
- desktop and mobile layouts

### 2. Multi-model Intelligence Router
33jane classifies each request and scores available routes using:

- task capability
- quality
- latency
- context window
- privacy
- provider availability
- observed reliability

Current adapters support:

- OpenAI-compatible OpenAI
- Groq
- OpenRouter
- a custom OpenAI-compatible confidential endpoint

If the selected provider fails, 33jane can try the next eligible route.

### 3. Price Optimizer
33jane estimates the expected input/output token cost for eligible models and chooses the economical route subject to a quality threshold.

It exposes:

- expected cost
- alternatives
- quality threshold
- estimated savings
- effective cost adjusted by observed reliability

Provider/model pricing is environment-configurable. Published estimates are routing inputs, not billing guarantees.

### 4. Outcome-based Routing
The alpha router learns from actual outcomes:

- successes/failures
- latency
- retry signals
- thumbs up/down
- observed reliability

A cheap route that repeatedly fails or causes retries becomes less attractive.

Current telemetry is process-memory only; durable telemetry is a later milestone.

### 5. Local Privacy Firewall
Privacy scanning happens in the browser before the prompt is sent to 33jane.

Current detectors include:

- email addresses
- phone-like identifiers
- API keys
- bearer tokens
- IBAN-style identifiers
- UK NI-style identifiers
- 32-byte hex private-key patterns

Detected values are replaced with placeholders such as `<EMAIL_1>` before inference. The browser restores protected values after the answer returns.

This is the beginning of the core principle:

> **No model knows more than it needs to know.**


### 6. Local Context Minimization
Large attachments are reduced in the browser before inference. 33jane scores local chunks against the user's question and sends only the most relevant excerpts.

The client reports:
- original context size
- transmitted context size
- selected chunk count
- context source
- exposure percentage

This reduces both privacy exposure and token cost.

### 7. Encrypted 33jane Vault
33jane now includes a browser-side encrypted knowledge Vault.

- AES-256-GCM encryption through Web Crypto
- PBKDF2-SHA256 key derivation
- 210,000 derivation iterations
- passphrase is never stored
- Vault content remains encrypted at rest in the browser
- only locally retrieved excerpts are inserted into inference context

The full Vault is never transmitted to an AI provider.

### 8. Confidential Router
A new **Confidential** mode imposes stricter routing than ordinary Private mode.

Confidential routes require:
- local privacy firewall enabled
- zero-retention provider policy
- private provider boundary
- privacy score of at least 0.95

If no configured model satisfies those conditions, 33jane blocks execution rather than silently downgrading privacy.

### 9. Split-Inference Planner
33jane detects requests that combine confidential source material with public/web research.

It creates isolated boundaries:

```text
Private extraction
      |
      v
Sanitized public question
      |
      v
Public research
      |
      v
Local merge
```

The public step is explicitly marked as unable to receive the original sensitive context. The current milestone ships the policy/planning layer; full web-tool orchestration will be connected to supported provider tooling later.

Endpoint:

```text
POST /api/ai/plan
```

### 10. Privacy Receipts
Successful inference now produces a machine-readable Privacy Receipt.

Receipts contain:
- request hash, never the raw prompt
- privacy-policy hash
- selected provider/model
- zero-retention status
- provider privacy score
- number/categories of locally redacted fields
- context exposure percentage
- estimated and actual routing cost
- failover count
- receipt hash

This makes 33jane's privacy behavior inspectable instead of relying only on a marketing promise. Receipts are tamper-detectable and can be checked through `POST /api/privacy/verify`.



### 11. OpenAI-Compatible API
33jane now exposes OpenAI-style endpoints so existing applications can switch to the router with minimal integration work.

```text
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses
```

Virtual model names:

```text
33jane-auto
33jane-fast
33jane-reason
33jane-code
33jane-vision
33jane-private
33jane-confidential
```

`/v1/chat/completions` supports standard JSON responses plus SSE-compatible streaming output. The current streaming layer emits the completed upstream answer as compatible chunks; native upstream token streaming can be added later without changing the public API.

Optional API-key protection can be enabled with `JANE_API_KEYS`.

### 12. Advanced Provider Failover
Provider resilience now includes:

- per-provider request timeouts
- failure classification
- automatic fallback to another eligible route
- circuit breaker after repeated failures
- cooldown/recovery
- rate-limit detection
- provider-unavailable detection
- authentication/error classification
- failover telemetry returned with the response

33jane will not silently bypass privacy policy just to make a request succeed.

### 13. Programmable AI Spending Policies
Users and agents can attach budget/policy constraints to inference:

- maximum USD cost per request
- daily USD budget
- allowed 33jane modes
- allowed provider classes
- mandatory zero-retention
- minimum privacy score
- latency-policy threshold

The in-memory alpha ledger tracks spend per principal/day and rejects routes that violate the configured policy.

Endpoints:

```text
POST /api/policy/evaluate
GET  /api/policy/usage?principal=<id>
```

The browser UI includes an optional agent spending-policy panel.

### 14. Monad Pay-Per-Inference Settlement
33jane now contains a real EVM/Monad settlement path rather than merely storing a blockchain reference.

`contracts/JaneInferenceSettlement.sol`:

- accepts native-token or ERC-20 settlement
- transfers payment from the caller to the configured provider treasury
- prevents the same receipt hash from being settled twice
- keeps prompts and responses offchain
- emits a settlement event containing only hashes and payment metadata

After successful inference, 33jane can prepare a user-signable transaction containing:

- receipt hash
- request hash
- policy hash
- provider address
- settlement token
- atomic payment amount

For ERC-20 settlement, an approval transaction is generated as well.

API:

```text
GET  /api/monad/status
POST /api/monad/settlement/prepare
POST /api/monad/settlement/verify

POST /api/edge/plan

GET  /api/agents
POST /api/agents
GET  /api/agents/wallet/status
POST /api/agents/wallet/prepare

GET  /api/network/summary
GET  /api/network/providers
POST /api/network/providers
GET  /api/network/registry/status
POST /api/network/registry/prepare

GET  /api/enterprise/orgs
POST /api/enterprise/orgs
GET  /api/enterprise/audit

GET  /api/token/status
GET  /api/token/utility

GET  /api/catalog
GET  /api/media/models
POST /api/media/generate
GET  /api/voice/status
POST /api/voice/session
GET  /api/research/status
POST /api/research
GET  /api/characters
POST /api/characters/:id/chat
POST /api/arena
GET  /api/confidential/status
GET  /api/confidential/attestation
GET  /api/confidential/envelope
POST /api/confidential/infer
GET  /api/benchmarks
GET  /api/benchmarks/leaderboard
```

The web client can send the approval + settlement transaction through an injected EVM wallet once Monad configuration is present.

Compile:

```bash
npm run compile:contracts
```

Deploy after configuring Monad RPC, chain ID and a funded deployment key:

```bash
npm run compile:contracts
npm run deploy:monad-settlement
```

Do not place a deployment private key in browser-visible environment variables.

### 15. Verifiable Onchain Execution Receipts
The settlement contract emits `InferenceSettled` with:

- payer
- provider
- privacy-receipt hash
- request hash
- policy hash
- settlement token
- amount

33jane verifies the transaction through the configured Monad RPC and returns an execution receipt containing the transaction hash and block number.

This gives the architecture two linked proofs:

```text
Offchain Privacy Receipt
        |
        | hash
        v
Monad InferenceSettled event
        |
        v
Verified Execution Receipt
```

The actual prompt, response, Vault contents and redaction map never need to be written onchain.



### 16. Agent Wallets
33jane now has both an offchain agent-account policy layer and deployable onchain agent wallets.

The offchain registry gives every autonomous agent:
- a stable agent ID
- owner identity
- optional wallet/delegate address
- daily inference budget
- per-request budget
- allowed 33jane modes
- zero-retention requirement
- minimum privacy score

The onchain layer includes:
- `JaneAgentWallet.sol`
- `JaneAgentWalletFactory.sol`

An agent wallet can hold native assets or ERC-20s and pay inference through `JaneInferenceSettlement` while enforcing daily and per-request limits.

Public transaction-builder endpoints:

```text
GET  /api/agents/wallet/status
POST /api/agents/wallet/prepare
```

Admin account-management endpoints are disabled unless `JANE_ADMIN_KEY` is set.

### 17. AI Provider Marketplace
Approved external compute providers can register model manifests with 33jane.

Each provider advertises:
- model/capabilities
- context window
- input/output pricing
- quality score
- latency score
- privacy score
- zero-retention status
- region
- capacity
- reputation

The normal 33jane router consumes these manifests as first-class routes, so marketplace providers compete directly with OpenAI, Groq, OpenRouter and Jane Compute.

Provider mutation endpoints require `JANE_ADMIN_KEY`; the public provider list never exposes API-key environment names or secret values.

### 18. 33jane-Owned Inference
33jane now has a dedicated `jane` provider class.

Configure:

```text
JANE_COMPUTE_BASE_URL
JANE_COMPUTE_API_KEY
JANE_COMPUTE_MODEL
```

Jane Compute participates in the same price, quality, reliability and privacy router as external providers.

A sufficiently private zero-retention Jane Compute deployment can serve **Confidential** mode without relying on a third party.

### 19. Edge Intelligence
The client and server now cooperate on local-first inference planning.

The edge layer includes:
- local PII scanning
- local context minimization
- local task hints
- request hashing
- device-local exact-response cache in `sessionStorage`
- automatic cache bypass when external context is attached

A local cache hit makes no upstream provider request and costs $0 in provider inference.

Endpoint:

```text
POST /api/edge/plan
```

### 20. Enterprise Gateway
Organizations can define policy that is applied before routing:

- allowed modes
- allowed provider classes
- zero-retention requirement
- minimum privacy score
- per-request budget
- daily budget
- data-residency region

Enterprise identity can be attached to API calls through:

```text
X-Jane-Org
X-Jane-Actor
X-Jane-Department
```

Audit events store only request/receipt hashes, selected model/provider, cost and organizational identity—not raw prompts.

Admin endpoints:

```text
GET  /api/enterprise/orgs
POST /api/enterprise/orgs
GET  /api/enterprise/audit
```

### 21. Optional 33G Utility Layer
The repository contains deployable `Jane33G` and `Jane33GUtility` contracts.

33G has:
- fixed maximum supply: **1,000,000,000 33G**
- no post-deployment mint function
- configurable treasury receiver at deployment

The utility staking contract has three tiers and returns a platform-benefit basis-point value.

Important: the benefit applies to 33jane platform fees/limits/credits. It does **not** magically reduce what an upstream model provider must be paid.

The 33G chain is intentionally environment-configurable so the final deployment can be BNB Chain, Monad, Base or another EVM chain without rewriting Jane.

```text
GET /api/token/status
GET /api/token/utility?address=0x...
```

### 22. Open Compute Network
The open network adds:
- dynamic provider manifests
- node heartbeat
- capacity reporting
- outcome-derived reputation
- network routing
- region/privacy metadata
- optional API authentication per node
- bonded provider registration on Monad

`JaneComputeRegistry.sol` stores only:
- provider operator
- metadata hash
- endpoint hash
- bond
- active status

It does not expose the actual private endpoint configuration onchain.

Unsigned registration transactions can be prepared through:

```text
GET  /api/network/registry/status
POST /api/network/registry/prepare
```

The public network console in the 33jane UI shows active nodes, capacity, regions, privacy-capable nodes, agent infrastructure, enterprise status, Monad status and optional 33G status.



### 23. Massive Model Catalog
The text router can ingest an arbitrary JSON model catalog through `JANE_LLM_MODELS_JSON`, while `JANE_MODEL_CATALOG_JSON` publishes a cross-modality inventory for text, image, video, audio, speech, embeddings and search.

```text
GET /api/catalog
```

This is intentionally data-driven: adding 100+ routes should be a configuration problem, not a code rewrite.

### 24. Jane Image Studio
Creator routing supports text-to-image, image editing, inpainting, upscaling and background removal through configurable providers.

### 25. Jane Video Studio
Video routing supports text-to-video, image-to-video, extend and upscale operations.

### 26. Jane Audio + Music
Audio routing supports music generation, sound effects and transcription.

### 27. Jane Voice
The speech layer supports TTS, STT and speech-to-speech media routes, plus a provider-agnostic realtime session broker.

```text
GET  /api/voice/status
POST /api/voice/session
```

### 28. Jane Deep Research
Public search is isolated from confidential context. The search provider receives a sanitized research query; Jane can then synthesize the returned public sources through the normal AI router.

```text
GET  /api/research/status
POST /api/research
```

### 29. Characters + Agents
Characters have server-side system prompts, default modes, tool declarations and optional memory flags. Users can select a character without exposing its hidden system prompt in the public character list.

```text
GET  /api/characters
POST /api/characters/:id/chat
```

Agent accounts/wallets from M16 remain the economic identity underneath autonomous characters.

### 30. Jane Arena
Arena executes the same prompt across multiple configured models and returns cost, latency, output, quality metadata and a recommended result.

```text
POST /api/arena
```

### 31. TEE + E2EE Confidential Compute Interface
The confidential stack now contains:
- an attestation document fetcher
- expected enclave-measurement verification
- attestation fingerprinting
- an RSA-OAEP + AES-256-GCM browser encryption helper
- a ciphertext-only confidential gateway
- a policy that refuses to hand out the enclave encryption key until attestation passes

```text
GET  /api/confidential/status
GET  /api/confidential/attestation
POST /api/confidential/verify
GET  /api/confidential/envelope
GET  /api/confidential/gateway/status
POST /api/confidential/infer
```

The repository provides the end-to-end interface; production hardware guarantees still depend on connecting a genuine TEE provider/verifier and enclave endpoint.

### 32. Developer Platform
Jane now includes:
- OpenAI-compatible API
- JavaScript SDK
- Python SDK
- CLI
- MCP stdio server
- OpenAI-compatible proxy behavior
- organization/agent request headers

```bash
npm run jane -- chat "hello"
npm run mcp
```

### 33. Installable Desktop/Mobile App
The main web client is now a PWA with:
- web manifest
- service worker shell caching
- standalone install mode
- install prompt
- shared responsive desktop/mobile UI

### 34. Teams + Administration
Teams support owners/admins/developers/members/viewers, member budgets, departments and organization links. Enterprise policy continues to control provider, privacy, budget and data-residency constraints.

### 35. Benchmarks + Savings Intelligence
Every successful and failed routed inference can feed the benchmark layer. The leaderboard tracks:
- success rate
- average latency
- average cost
- average quality
- cost per successful task

```text
GET /api/benchmarks
GET /api/benchmarks/leaderboard
```

The goal is not merely the cheapest token. Jane optimizes toward the lowest **cost per successful task**.


## API

```text
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses

GET  /api/ai/health
GET  /api/ai/models
GET  /api/ai/metrics
POST /api/ai/route
POST /api/ai/plan
POST /api/ai/chat
POST /api/ai/feedback

POST /api/privacy/verify
POST /api/policy/evaluate
GET  /api/policy/usage
GET  /api/monad/status
POST /api/monad/settlement/prepare
POST /api/monad/settlement/verify
```

### Route preview

```json
{
  "mode": "auto",
  "messages": [
    {
      "role": "user",
      "content": "Debug this TypeScript function"
    }
  ],
  "clientPrivacy": {
    "applied": true,
    "redactedCount": 1,
    "categories": ["EMAIL"]
  }
}
```

## Architecture

```text
User
  |
  v
Local privacy firewall
  |
  |  minimum necessary context
  v
33jane Router
  |-- task classifier
  |-- privacy policy
  |-- quality threshold
  |-- price optimizer
  |-- reliability/outcome score
  v
Best eligible AI provider
  |
  v
Answer + route/cost metadata
  |
  v
Local rehydration
```

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Then open:

```text
http://localhost:8787
```

At least one provider credential is needed for live inference. The routing/price preview works without provider credentials.

## Quality gates

```bash
npm run check
```

This runs:

- TypeScript lint/typecheck
- AI router tests
- production build

## Monad architecture

33jane's prompts, private files and AI responses remain offchain.

Monad is the programmable economic and verification layer for:

- inference budgets
- agent spending policies
- pay-per-inference settlement
- execution receipts
- provider settlement/reputation

```text
Private intelligence offchain
          +
Programmable settlement on Monad
```

This repository is the standalone **33jane AI product**. The older 33jane RWA/CoW repository remains separate and can be integrated later if desired.

## License

MIT
