# 33jane deployment checklist

This document separates what is already built from what requires deployment secrets or funded wallets.

## 1. Web/API deployment

Required for live inference:

```text
OPENAI_API_KEY and/or GROQ_API_KEY and/or OPENROUTER_API_KEY
```

Optional private/Jane Compute:

```text
JANE_PRIVATE_BASE_URL
JANE_PRIVATE_MODEL
JANE_PRIVATE_API_KEY

JANE_COMPUTE_BASE_URL
JANE_COMPUTE_MODEL
JANE_COMPUTE_API_KEY
```

Recommended production controls:

```text
JANE_API_KEYS
JANE_ADMIN_KEY
JANE_PROVIDER_TIMEOUT_MS
JANE_CIRCUIT_FAILURE_THRESHOLD
JANE_CIRCUIT_COOLDOWN_MS
```

## 2. Monad settlement contracts

Compile all contracts:

```bash
npm install
npm run compile:contracts
```

Deploy `JaneInferenceSettlement`:

```bash
DEPLOY_RPC_URL=<monad rpc> \
DEPLOY_CHAIN_ID=<monad chain id> \
DEPLOYER_PRIVATE_KEY=<funded deployer key> \
DEPLOY_CONTRACT=JaneInferenceSettlement \
npm run deploy:contract
```

Set:

```text
MONAD_RPC_URL
MONAD_CHAIN_ID
MONAD_SETTLEMENT_CONTRACT
MONAD_PROVIDER_TREASURY
MONAD_SETTLEMENT_TOKEN
MONAD_SETTLEMENT_TOKEN_DECIMALS
MONAD_SETTLEMENT_TOKEN_SYMBOL
```

For production, use a real supported stable settlement token rather than pretending a native token has USD value.

## 3. Agent-wallet factory

After settlement is deployed, deploy `JaneAgentWalletFactory` with the settlement contract address as its constructor argument.

```bash
DEPLOY_CONTRACT=JaneAgentWalletFactory
DEPLOY_ARGS_JSON='["0xSettlementContract"]'
```

Set:

```text
MONAD_AGENT_WALLET_FACTORY
```

Users/agents can then request an unsigned create-wallet transaction through:

```text
POST /api/agents/wallet/prepare
```

## 4. Open compute registry

Deploy `JaneComputeRegistry` on Monad:

```bash
DEPLOY_CONTRACT=JaneComputeRegistry
DEPLOY_ARGS_JSON='[]'
```

Set:

```text
MONAD_COMPUTE_REGISTRY
MONAD_COMPUTE_MIN_BOND=0.01
```

Providers prepare a bonded registration transaction through:

```text
POST /api/network/registry/prepare
```

Only hashes of metadata and endpoint location are anchored onchain.

## 5. Optional 33G deployment

33G is not required for the Monad hackathon demo.

The token contracts are chain-agnostic and can be deployed later on the chosen EVM chain.

Deploy fixed-supply token:

```bash
DEPLOY_RPC_URL=<chosen chain rpc>
DEPLOY_CHAIN_ID=<chosen chain id>
DEPLOY_CONTRACT=Jane33G
DEPLOY_ARGS_JSON='["0xTreasury"]'
npm run deploy:contract
```

Deploy utility staking with the token address:

```bash
DEPLOY_CONTRACT=Jane33GUtility
DEPLOY_ARGS_JSON='["0x33GToken"]'
npm run deploy:contract
```

Then set:

```text
JANE_TOKEN_RPC_URL
JANE_TOKEN_CHAIN_ID
JANE_33G_TOKEN_CONTRACT
JANE_33G_STAKING_CONTRACT
```

## 6. Provider network

For static bootstrap, use `JANE_NETWORK_PROVIDERS_JSON`.

For runtime administration, configure `JANE_ADMIN_KEY` and call:

```text
POST /api/network/providers
POST /api/network/providers/:nodeId/heartbeat
```

For production, define `JANE_NETWORK_ALLOWED_HOSTS` so arbitrary endpoints cannot be registered.

## 7. Enterprise gateway

Bootstrap organizations with:

```text
JANE_ENTERPRISE_ORGS_JSON
```

or configure them through the admin API.

Never store raw employee prompts in the audit log; the current gateway intentionally records hashes and execution metadata only.

## 8. End-to-end verification

Before calling the deployment complete, verify all of the following:

1. `GET /api/ai/health` shows at least one configured live inference provider.
2. A chat request returns a real upstream response.
3. Price Optimizer displays the selected route and alternatives.
4. Private mode redacts a test email before upload.
5. Confidential mode refuses non-compliant routes.
6. Vault encrypt/decrypt works after a page reload.
7. A spending policy blocks an over-budget request.
8. Monad settlement returns a user-signable transaction.
9. The transaction is submitted from a wallet.
10. `/api/monad/settlement/verify` finds the matching `InferenceSettled` event.
11. The Network Console reports the correct live status.
12. `npm run check` passes.
