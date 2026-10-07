# Metropolis Demo Runbook

Goal: prove that 3maryjane is not just a dashboard. One user-owned account must execute Hashed on Monad testnet, then show that the resulting equity collateral and hUSD debt are read through the same risk policy as the account's other covered sources.

## Live demo state

Monad testnet chain: **10143**

Demo account:

```text
0x38Ac1B6b3ec3eD28E0b49C5331b01151D1C3577f
```

Covered adapters:

- Perpl: `0x49062a35132c0982b54B0C3FA03bdaC0bB650489`
- free collateral: `0x76D9fd10b396faCA0FBAF0c39E0804BB39803F03`
- Hashed: `0xF43bc85317345Ce54Fa616440b9b76AF276866eb`

Hashed market:

- vault: `0x63814b52f6c2d366598dc7ed47eb364b41cf9a15`
- hUSD: `0xdcc5b92d7e99f4f31527121a402516f69d3edc27`
- hNVDA: `0x2ac57e9246e11cbf9899d276f2571d2b4cdfffac`
- hAAPL: `0x4edd0c5532cdc7c88c91eecbdf355b62ef309cb9`

Kuru's stale testnet target is disabled and Euler is not claimed as a live testnet venue.

## 90-second sequence

### 0–10s — thesis

Open the 3maryjane Terminal.

> One user-owned account. Multiple Monad markets. One portfolio-risk policy.

Show Monad testnet and the deployed account.

### 10–25s — obtain demo collateral

Open **HASHED**.

Claim hNVDA or hAAPL from the synthetic testnet faucet.

Say clearly that these are synthetic testnet demo equities and that the current prices are manual testnet prices.

### 25–50s — execute Hashed through 3maryjane

In **UNIFIED CLEARING DEMO**:

1. load the demo 3maryjane account,
2. **FUND ACCOUNT**,
3. **LOCK VIA ADAPTER**,
4. **BORROW VIA ADAPTER** for a small amount such as 25 hUSD.

These calls go through the owner-controlled account and registered Hashed adapter. After each adapter transition, the configured 3maryjane risk policy validates the final state before the transaction can commit.

### 50–70s — unified portfolio proof

Refresh the account and point to:

- portfolio equity,
- total debt,
- gross exposure,
- portfolio health,
- policy PASS/BREACH,
- solver action,
- per-asset exposure rows,
- **HASHED COVERED = YES**.

The key point is that Hashed collateral/debt is normalized into the same risk engine that already reads the account's Perpl and free-collateral sources.

### 70–84s — unwind through the same adapter

1. **REPAY VIA ADAPTER**,
2. **UNLOCK VIA ADAPTER**,
3. **RETURN TO WALLET**.

Refresh and show debt/exposure falling again.

### 84–90s — close

> 3maryjane is the account, execution and risk layer for wallets and agents coordinating capital across Monad protocols without giving up custody.

## Optional CLI smoke proof

The repository includes an end-to-end script that opens and fully unwinds a small Hashed position through the live 3maryjane account:

```bash
forge script script/DemoHashedClearingTestnet.s.sol:DemoHashedClearingTestnet \
  --rpc-url "$MONAD_TESTNET_RPC" \
  --broadcast
```

It:

1. funds the 3maryjane account with 1 hNVDA,
2. locks that hNVDA through HashedAdapter,
3. borrows 25 hUSD through HashedAdapter,
4. checks the unified risk policy,
5. repays 25 hUSD,
6. unlocks hNVDA through HashedAdapter,
7. returns the asset to the owner,
8. asserts the Hashed balances/collateral/debt are restored to their pre-run values.

The private key remains local to the Foundry terminal and must never be committed or pasted into documentation.

## Evidence before recording

- Hashed adapter active in AdapterRegistry
- Hashed adapter authorized by the demo account
- Hashed adapter included in RiskPolicyManager adapter set
- exact token/vault target and selector permissions configured
- Terminal deployment status shows Hashed live
- one confirmed Hashed adapter deposit transaction
- one confirmed Hashed adapter borrow transaction
- one confirmed repay/unlock sequence
- unified risk view loads after the borrow
- CI green
- explorer tabs ready

## Claims to avoid

Do not describe 3maryjane as if independent protocols share collateral or native portfolio margin. Underlying venues retain their own native margin and liquidation rules.

Do not call hNVDA/hAAPL real shares.

Do not call the manual testnet prices production oracles.

Do not call `criticalMoveBps` an exact venue liquidation price.

Do not claim an independent audit. Use **security-hardened and CI-tested** until an external audit exists.

Do not claim Kuru or Euler as live Monad testnet integrations in the current demo.
