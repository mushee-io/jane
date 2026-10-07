# Jane — parity + superiority checklist

The objective is not to ship a Venice clone. The objective is to match the useful product surface of a leading private multi-model AI platform, then make the same jobs easier to route, cheaper to execute, and more privacy-minimized.

## Product surface

| Capability | Jane implementation |
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

## How Jane is intended to win

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


## October 2026 Venice parity audit

This matrix separates **code-complete** from **externally live**. Jane must not claim production superiority merely because an adapter exists.

| Surface | Venice public product | Jane implementation | Jane advantage / remaining work |
|---|---|---|---|
| Default chat | Agentic default chat | Auto router + Agentic toggle/orchestrator | Jane combines agent tools with price/privacy routing |
| Model choice | Manual choice plus agent model selection | Auto/Fast/Reason/Code/Vision/Private/Confidential | Jane makes automatic cost/quality/privacy selection the default thesis |
| Text model breadth | Large live model library | Configurable catalog + multiple providers/network | **Live gap:** connect enough real providers/models to exceed Venice breadth |
| Image/video/audio breadth | Large live creator catalog | Configurable multimodal router | **Live gap:** provider credentials/catalog population |
| Price optimization | Published per-model rates/credits | Per-request price optimizer + quality floor | Jane wins if live prices are kept current |
| Outcome optimization | Model selection | Cost per successful task + retry/failure learning | Jane-specific differentiator |
| Privacy minimization | Proxy/ZDR/TEE/E2EE modes | Local redaction + context minimization + split inference + TEE/E2EE interface | Jane aims to expose less data before privacy transport is considered |
| Privacy receipts | Privacy badges + E2EE attestation | Per-request privacy receipt + policy/context/cost hash | Jane gives broader route-level evidence |
| Local history | Yes | Yes | Parity |
| Encrypted backup/restore | Yes | AES-256-GCM local encrypted export/import | Parity in code |
| Secure conversation sharing | Secure sharing | Client-side encrypted fragment link | Jane server need not receive shared plaintext |
| Documents | PDF/document upload | PDF, DOCX and text extraction + local context minimization | Jane adds DOCX and minimum-context routing |
| Vision | Image understanding | Image URL/base64 input through Jane and OpenAI-compatible API | Parity in code |
| System prompt | Yes | Custom system prompt | Parity |
| Temperature / Top P | Yes | Temperature + Top P routed upstream | Parity |
| Web search | Yes | Configurable web-search adapter | **Live gap:** production provider configuration |
| URL scraping | Yes | Dedicated scrape adapter | **Live gap:** production provider configuration |
| X search | Supported on selected models | Dedicated optional X-search adapter | **Live gap:** provider configuration |
| Image edit/upscale/background | Yes | Creator operations: edit, inpaint, upscale, background removal | Parity once media routes are configured |
| Watermark cleanup | Yes | Licensed/owned-image cleanup operation | Route requires a supporting media provider |
| Characters | Yes | Characters + agents + budgets/wallets | Jane goes further into agent identity/economics |
| Voice | TTS + speech models | TTS/STT/speech-to-speech + realtime WebRTC layer | Jane has broader interface; live provider config required |
| Deep research | Agent/search workflows | Privacy-split research + synthesis | Jane keeps public research isolated from private source material |
| Model comparison | Model library | Jane Arena | Jane lets the same prompt compete across routes |
| OpenAI chat API | Yes | /v1/chat/completions + /v1/responses | Parity |
| Unified media API | Text/image/video/speech/music/etc. | /v1/images/generations, /v1/video/generations, /v1/audio/speech, /v1/audio/music | Parity-oriented API surface |
| Embeddings API | Yes | /v1/embeddings adapter | Live provider configuration required |
| Search API | Yes | /v1/search | Live provider configuration required |
| Agent spending controls | API credits | Per-request/daily policy, allowed modes/providers/privacy | Jane differentiator |
| Onchain settlement | Optional token/API economics | Monad inference settlement + execution receipt | Jane differentiator |
| Open compute | Venice-controlled/partners | Provider marketplace + bonded compute registry | Jane differentiator if network becomes live |
| Enterprise gateway | General API product | Org provider/privacy/budget/residency policy | Jane differentiator |
| Installable client | Web + native mobile apps | PWA | **Gap:** native iOS/Android packaging/store releases |
| Consumer billing | Free/Pro/Pro+/Max live plans | Cost engine exists, consumer billing not yet productized | **Gap:** ship accounts/credits/payment plans |
| Anonymous/no-account | Available for basic use | Current web client can operate without account | Parity at product-shell level |

### Remaining blockers before we can truthfully say “better everywhere”

1. Populate and continuously benchmark a live model catalog at least as broad as Venice.
2. Configure production web search, scraping, X search, media, speech and embeddings providers.
3. Connect a genuine attested TEE/enclave and verify E2EE in production.
4. Deploy Monad settlement contracts and use a real settlement asset.
5. Productize consumer accounts, billing/credits and a cheaper sustainable plan.
6. Package and release native iOS/Android clients if app-store parity matters.
7. Run public side-by-side benchmarks for price, latency, privacy exposure and task success.

### Win condition

Jane should not claim victory from feature-count alone. The measurable target is:

- lower **cost per successful task**
- lower **sensitive-context exposure**
- equal-or-better task quality
- equal-or-better model/media breadth
- equal-or-better reliability
- more inspectable privacy
- less manual model selection

That is how Jane becomes demonstrably better rather than merely larger.
