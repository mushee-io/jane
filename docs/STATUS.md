# Jane build status

## Code-complete milestone stack

### M1–M10 — private intelligent routing
- Chat
- multi-model router
- Price Optimizer
- outcome-based routing
- local privacy firewall
- context minimization
- encrypted Vault
- Confidential Router
- split-inference planner
- Privacy Receipts

### M11–M15 — developer + Monad execution
- OpenAI-compatible API
- failover/circuit breakers
- programmable spending policies
- Monad settlement contract/adapter
- verifiable execution receipts

### M16–M22 — agent economy + open compute
- agent accounts
- onchain Agent Wallet + factory
- provider marketplace
- jane-owned compute adapter
- edge intelligence/cache
- enterprise policy gateway
- optional fixed-supply 33G utility
- open compute network + bonded Monad registry

### M23–M35 — full product parity/superiority layer
- configurable massive text + multimodal model catalog
- Image Studio
- Video Studio
- Audio/Music Studio
- TTS/STT/speech-to-speech + realtime WebRTC voice client
- privacy-aware Deep Research
- Characters + character chat
- Jane Arena
- attestation + browser E2EE confidential-compute interface
- JavaScript SDK
- Python SDK
- CLI
- MCP server
- installable desktop/mobile PWA
- Teams administration
- public benchmark / cost-per-success leaderboard

## Smart contracts

- `JaneInferenceSettlement.sol`
- `JaneAgentWallet.sol`
- `JaneAgentWalletFactory.sol`
- `Jane33G.sol` / `Jane33GUtility`
- `JaneComputeRegistry.sol`

All deployable contracts are compiled by CI.

## What still requires external infrastructure

Code-complete does not mean externally live.

The following require credentials, provider infrastructure, funded wallets, or hosting access:

1. Real inference provider API keys.
2. Image/video/audio/voice provider endpoints and keys.
3. Search provider endpoint/key.
4. A genuine TEE attestation/verifier service and enclave.
5. Jane-owned GPU inference endpoint.
6. Monad RPC, funded deployer and real stable settlement token.
7. Deployment of settlement, Agent Wallet Factory and Compute Registry contracts.
8. Optional 33G deployment on the final chosen chain.
9. Production hosting environment variables/permissions.
10. Durable database/event storage for production-scale accounts, teams, benchmarks and registries.

## CI definition

`npm run check` covers:
- TypeScript
- automated tests
- inline browser JavaScript syntax
- Solidity compilation
- production static/API build

## Readiness

Use:

```text
GET /api/readiness
```

to distinguish code capability from live external configuration.

## Privacy invariant

Raw prompts, AI responses, Vault contents, local redaction maps and private documents are not intentionally written to Monad.

The confidential E2EE route is designed so the normal Jane gateway receives ciphertext only; production confidentiality requires a genuine verified enclave behind the configured confidential gateway.
