# 33jane — parity + superiority checklist

The objective is not to ship a Venice clone. The objective is to match the useful product surface of a leading private multi-model AI platform, then make the same jobs easier to route, cheaper to execute, and more privacy-minimized.

## Product surface

| Capability | 33jane implementation |
|---|---|
| Multi-model chat | Auto/Fast/Reason/Code/Vision/Private/Confidential |
| Large model catalog | JSON-configurable LLM + multimodal catalog |
| Automatic model choice | Intelligence Router |
| Price optimization | Cheapest route subject to task-quality/privacy policy |
| Outcome optimization | Cost per successful task, failures/retries/feedback |
| Private mode | zero-retention policy-aware routing |
| Confidential mode | strict provider/privacy constraints |
| Local privacy | browser PII/secret redaction |
| Minimum context | local chunk selection |
| Private memory | encrypted browser Vault |
| Split inference | private/public boundary planner |
| Privacy receipts | request/policy/context/cost hashes and metadata |
| TEE interface | attestation fetch + measurement validation |
| E2EE interface | client AES-GCM payload + RSA enclave key wrapping |
| Image generation/editing | Creator Studio media router |
| Video generation | Creator Studio media router |
| Audio/music/SFX | Creator Studio media router |
| TTS/STT/speech-to-speech | Creator Studio speech router |
| Realtime voice | provider-agnostic WebRTC session broker/client |
| Web/deep research | sanitized public search + routed synthesis |
| Characters | server-side system prompts + selectable personas |
| Autonomous agents | agent accounts + budgets + onchain wallets |
| Model comparison | Jane Arena |
| OpenAI API | /v1/chat/completions + /v1/responses + /v1/models |
| JavaScript SDK | packages/sdk-js |
| Python SDK | packages/sdk-python |
| CLI | bin/jane.mjs |
| MCP | mcp/jane-server.mjs |
| Installable app | PWA manifest + service worker |
| Teams | roles, member budgets, org links |
| Enterprise gateway | provider/privacy/budget/residency policies |
| Benchmarks | quality/cost/latency/success leaderboard |
| Provider marketplace | dynamic provider manifests |
| Jane-owned compute | jane provider class |
| Open compute | dynamic nodes + reputation + bonded registry |
| Agent payments | programmable policies + Agent Wallet |
| Onchain settlement | JaneInferenceSettlement on Monad |
| Verifiable execution | Monad InferenceSettled receipts |
| Optional token utility | fixed-supply 33G + staking utility |

## How 33jane is intended to win

1. **Do not make users choose models.** Jane Auto should be the default.
2. **Optimize cost per successful task, not sticker token price.**
3. **Send less data, not merely "protect" more data.**
4. **Use private/public split inference when a job mixes secrets and web research.**
5. **Expose a receipt so cost/privacy behavior can be inspected.**
6. **Apply the same routing logic to text, image, video, audio and speech.**
7. **Give agents budgets and payment permissions, not unrestricted API keys.**
8. **Let compute providers compete for work.**
9. **Use Monad for economic coordination and execution proof, never raw prompts.**
10. **Keep 33G optional; the product must be useful without a token.**

## Truthfulness rule

A route is not "live" merely because an adapter exists. Production status requires actual provider credentials/endpoints, a successful request, and where applicable a verified enclave or confirmed Monad deployment.
