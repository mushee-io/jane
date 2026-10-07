# CL Monad Deployment Checklist

The full Metropolis proof is now pinned to **Monad mainnet (chain 143)**.

Reason: Kuru and Perpl are available on both mainnet and testnet, but the verified Euler deployment carried by this repository is Monad mainnet. A Kuru + Perpl testnet dry-run is still useful, but it must not be presented as the full three-venue clearing demo.

This checklist is fail-closed. Do not replace missing addresses, markets, feeds or vaults with guessed values.

## 0. Preflight

- `forge build`
- `forge build --sizes --skip script --skip test`
- `forge test -vvv`
- `npm install --ignore-scripts`
- `npm run typecheck`
- `npm run build:apps`
- export your ignored local `.env`
- run `npm run preflight:protocols`
- confirm `CL_DEMO_CHAIN_ID=143`
- re-verify Kuru, Perpl, Euler and oracle addresses from primary sources
- use a fresh low-value deployment wallet for the demo
- never commit `PRIVATE_KEY`

The preflight validator refuses the full demo profile when the chain is not 143 and checks the pinned Kuru margin account, Perpl exchange/collateral and Euler EVC before broadcast.

## 1. Environment

Copy `.env.example` to a local ignored `.env` and fill only verified values.

Required tracking values are CSV lists:

```text
KURU_TRACKED_TOKENS=0xTokenA,0xTokenB
KURU_MARKETS=0xMarketA
PERPL_TRACKED_PERP_IDS=10
EULER_TRACKED_VAULTS=0xVaultA
FREE_COLLATERAL_ASSETS=0xCollateralA,0xCollateralB
```

The deployment scripts reject empty tracked sets. A live adapter with no read universe would allow execution without corresponding portfolio visibility.

## 2. Deploy core

```bash
forge script script/DeployCore.s.sol:DeployCore \
  --rpc-url "$MONAD_MAINNET_RPC" \
  --broadcast -vvvv
```

Record:

- `AdapterRegistry`
- `CLAccountFactory`

Set `ADAPTER_REGISTRY` and `CL_ACCOUNT_FACTORY` before continuing.

## 3. Deploy adapters + free-collateral source

```bash
forge script script/DeployAdapters.s.sol:DeployAdapters \
  --rpc-url "$MONAD_MAINNET_RPC" \
  --broadcast -vvvv
```

Record:

- `KuruAdapter`
- `PerplAdapter`
- `EulerAdapter`
- `WalletBalanceAdapter`

Set `KURU_ADAPTER`, `PERPL_ADAPTER`, `EULER_ADAPTER`, and `WALLET_BALANCE_ADAPTER`.

## 4. Configure exact execution permissions

Run **before any account authorizes an adapter**:

```bash
forge script script/ConfigureAdapterPermissions.s.sol:ConfigureAdapterPermissions \
  --rpc-url "$MONAD_MAINNET_RPC" \
  --broadcast -vvvv
```

This configures:

- adapter activation
- exact execution targets
- exact function selectors
- selector enforcement

Every permission change increments the adapter version. If permissions change later, existing account authorizations intentionally become stale until the owner re-authorizes the adapter.

## 5. Deploy risk + automation stack

```bash
forge script script/DeployRiskAutomation.s.sol:DeployRiskAutomation \
  --rpc-url "$MONAD_MAINNET_RPC" \
  --broadcast -vvvv
```

Record every emitted address and populate the `CL_*` / `VITE_CL_*` environment variables.

## 6. Configure the risk universe

Fill and verify:

- `RISK_REGISTRY`
- primary underlying token + feed
- collateral token + feed
- token decimals
- initial / maintenance / hedge margin parameters
- stress parameters
- maximum oracle staleness
- Perpl exposure / collateral / PnL unit conventions
- tracked Perpl market IDs

Then run:

```bash
forge script script/ConfigureDemoRisk.s.sol:ConfigureDemoRisk \
  --rpc-url "$MONAD_MAINNET_RPC" \
  --broadcast -vvvv
```

A missing asset, derivative mapping or stale/invalid price is expected to fail closed.

## 7. Create and initialize the CL Account

Choose a unique 32-byte `CL_ACCOUNT_SALT`, fill `CL_ALLOWED_ASSETS` and review all `CL_POLICY_*` values.

Run deployment preflight after all CL addresses are populated:

```bash
npm run preflight:deployment
```

Then initialize:

```bash
forge script script/InitializeDemoAccount.s.sol:InitializeDemoAccount \
  --rpc-url "$MONAD_MAINNET_RPC" \
  --broadcast -vvvv
```

The script:

1. creates the deterministic owner-controlled CL Account;
2. allowlists the configured wallet assets;
3. authorizes Kuru, Perpl and Euler at their current registry versions;
4. includes Kuru, Perpl, Euler and WalletBalanceAdapter in the risk universe;
5. installs the owner-defined portfolio policy;
6. enables `RiskPolicyManager` as the account risk guard;
7. authorizes `DefensiveExecutor` for strictly risk-reducing automation.

It does **not** fund the account and does not move user assets.

Set `CL_ACCOUNT` to the emitted account address and `CL_ACCOUNT_OWNER` to the owner wallet.

Now verify the entire configured account without broadcasting anything:

```bash
forge script script/VerifyDemoDeployment.s.sol:VerifyDemoDeployment \
  --rpc-url "$MONAD_MAINNET_RPC" -vvvv
```

The verifier checks owner, risk guard, defensive executor, current registry versions, adapter authorization, risk coverage and allowed assets. Do not fund the account until it passes.

Run `npm run preflight` one final time.

## 8. Funded smoke test

Use the smallest practical values. Mainnet makes every mistake real.

Required proof sequence:

1. fund the CL Account with the configured collateral;
2. Kuru: deposit/fund margin and execute the configured MON spot action;
3. Perpl: create/fund the exchange account and open a small MON perp position;
4. Euler: supply collateral and make one small borrow/repay transition in a verified vault;
5. query CL unified risk;
6. confirm all venue states plus free collateral are visible;
7. run a stress scenario;
8. attempt a low-severity policy-violating state transition and show it reverts;
9. obtain a solver recommendation;
10. execute a permitted defensive action;
11. confirm the resulting portfolio is strictly safer.

Capture transaction hashes for every state-changing operation.

## 9. Negative security smoke tests

Before recording the final demo:

- unapproved selector reverts
- unapproved target reverts
- stale adapter authorization reverts
- unauthorized keeper reverts
- delegated defense that increases risk reverts
- stale oracle observation reverts
- withdrawal violating policy reverts atomically
- malformed adapter action reverts
- downstream protocol revert leaves no partial CL state

## 10. API + Terminal

API:

```bash
npm --workspace @cl-monad/api run build
npm --workspace @cl-monad/api run start
```

Terminal:

```bash
npm --workspace @cl-monad/terminal run build
```

Verify both are configured for chain `143` and the exact same deployed CL contracts.

## 11. Final evidence bundle

Populate the `DEMO_TX_*` fields in your local environment using only confirmed transaction hashes and set `GIT_COMMIT_SHA` to the final green commit.

Generate the manifest:

```bash
npm run evidence
```

This writes `deployments/monad-mainnet.json` containing:

- chain ID (`143`)
- generation time
- all CL contract addresses
- all adapter addresses
- Kuru / Perpl / Euler execution targets
- tracked markets / perp IDs / vaults
- oracle sources
- CL Account + owner
- funded demo transaction hashes
- final CI commit SHA

Review it before committing it to the repository.

No deployment may be described as live/complete until every funded transaction is confirmed on Monad mainnet.

## Testnet dry-run boundary

Monad testnet (`10143`) remains valuable for Kuru + Perpl integration tests. The SDK contains current Kuru testnet contract/token constants and Perpl's published testnet exchange configuration. However, the repository does not claim an Euler testnet deployment. Therefore a testnet run is a **two-venue dry-run**, not the final CL clearing proof.
