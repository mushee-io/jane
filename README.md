# 33jane

**Private intelligence routing for the internet.**

33jane gives people and software one place to use the best AI models without having to decide which model to use, overpay for simple work, or expose more private context than necessary.

> **The internet should not have to choose an AI. 33jane chooses intelligence for it.**

## Milestones 1–10

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


## API

```text
GET  /api/ai/health
GET  /api/ai/models
GET  /api/ai/metrics
POST /api/ai/route
POST /api/ai/plan
POST /api/ai/chat
POST /api/ai/feedback
POST /api/privacy/verify
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

## Monad direction

33jane's prompts, private files and AI responses remain offchain.

Monad will be used later for the programmable economic and verification layer:

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
