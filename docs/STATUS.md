# 33jane build status

## Built in repository

### Product
- M1 Chat
- M2 multi-model router
- M3 Price Optimizer
- M4 outcome-based routing
- M5 local privacy firewall
- M6 local context minimization
- M7 encrypted Vault
- M8 Confidential Router
- M9 split-inference planner
- M10 privacy receipts
- M11 OpenAI-compatible API
- M12 advanced failover/circuit breakers
- M13 programmable spending policies
- M14 Monad settlement adapter + settlement contract
- M15 verifiable execution receipts
- M16 agent accounts + budget-constrained onchain Agent Wallet + factory
- M17 provider marketplace
- M18 33jane-owned inference adapter
- M19 edge intelligence + device-local exact-response cache
- M20 enterprise policy gateway + hash-only audit + data residency
- M21 fixed-supply optional 33G + staking utility adapter
- M22 open compute network + bonded Monad registry

### Smart contracts
- `JaneInferenceSettlement.sol`
- `JaneAgentWallet.sol`
- `JaneAgentWalletFactory.sol`
- `Jane33G.sol` / `Jane33GUtility`
- `JaneComputeRegistry.sol`

All deployable contracts are compiled in CI.

### Quality gates
`npm run check` validates:
- TypeScript
- automated tests
- browser inline-JavaScript syntax
- every Solidity contract
- production build

## Requires external configuration

These cannot be truthfully marked live until credentials/funds are supplied:

1. At least one paid/live AI provider API key.
2. Optional private or Jane-owned inference endpoint.
3. Monad RPC and chain ID.
4. A funded Monad deployer wallet.
5. A real settlement stablecoin address and provider treasury.
6. Deployment of the settlement/factory/compute-registry contracts.
7. Optional 33G deployment on the final chosen EVM chain.
8. Production hosting permissions/environment variables.

Use:

```text
GET /api/readiness
```

to distinguish code-complete features from externally configured/live infrastructure.

## Privacy invariant

Raw prompts, responses, Vault contents, redaction maps and private documents are not intentionally written onchain.

Onchain infrastructure carries payment information and cryptographic hashes/attestations only.
