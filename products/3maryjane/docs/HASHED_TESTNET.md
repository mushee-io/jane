# Hashed — Monad Testnet

Hashed is the equity-backed credit module inside **3maryjane**. The contracts are deployed on Monad testnet and the Hashed adapter is registered in the live 3maryjane demo account.

## What it proves

1. claim synthetic demo equity on Monad testnet,
2. fund a user-owned 3maryjane account,
3. execute Hashed through the registered adapter,
4. lock hNVDA or hAAPL and borrow hUSD,
5. expose both collateral and debt to the same 3maryjane risk policy that already reads Perpl and free collateral,
6. reject unsafe post-trade states atomically,
7. repay and unlock through the same account.

This is an equity-backed credit wedge, not a claim that independent protocols share native collateral.

## Live deployment

Network: **Monad testnet · chain 10143**

| Component | Address |
| --- | --- |
| Demo 3maryjane account | `0x38Ac1B6b3ec3eD28E0b49C5331b01151D1C3577f` |
| HashedCreditVault | `0x63814b52f6c2d366598dc7ed47eb364b41cf9a15` |
| HashedAdapter | `0xF43bc85317345Ce54Fa616440b9b76AF276866eb` |
| hUSD | `0xdcc5b92d7e99f4f31527121a402516f69d3edc27` |
| hNVDA | `0x2ac57e9246e11cbf9899d276f2571d2b4cdfffac` |
| hAAPL | `0x4edd0c5532cdc7c88c91eecbdf355b62ef309cb9` |
| AdapterRegistry | `0x2e48c231588fcf6b8100a22d3a5b279b20098695` |
| RiskRegistry | `0xdd6a9a09961b65dff5b91c550800d3791d199f3d` |
| RiskEngine | `0x4ec4b8062c0eab4dfef9ede4a335e4e165e8ef50` |
| RiskPolicyManager | `0xebf69ede951ff508c0a0cfcbb75c90db186fd834` |

Explorer base: `https://testnet.monadvision.com`

Known integration evidence:

- asset permission transaction: `0xe061f93e49d4081fb84ec8a681b0fba9d476f6c672bec9f38f08ffce6da7364d`
- adapter authorization transaction: `0xe5464bd0292af4c7b111c1acf8cf7e79862041daab90886f0114465b51ed25ea`
- risk-policy configuration transaction: `0x8ca600fdd3b6d69e7296302a3a28ec693ddcef2d13f934cf59673c2e49a5ef23`

Onchain read-back after configuration:

```text
AdapterRegistry.isAdapterActive(HashedAdapter) = true
CLAccount.authorizedAdapter(HashedAdapter) = true
RiskPolicyManager.adapters(CLAccount) =
[
  0x49062a35132c0982b54B0C3FA03bdaC0bB650489, // Perpl
  0x76D9fd10b396faCA0FBAF0c39E0804BB39803F03, // free collateral
  0xF43bc85317345Ce54Fa616440b9b76AF276866eb  // Hashed
]
```

## Contracts

- `src/hashed/HashedUSD.sol` — 6-decimal testnet credit unit.
- `src/hashed/HashedCreditVault.sol` — collateral, LTV, health, repayment and liquidation.
- `src/adapters/HashedAdapter.sol` — converts Hashed collateral + debt into normalized 3maryjane positions.
- `src/hashed/TestnetEquityToken.sol` — synthetic equity faucet token for demo/testnet use only.
- `script/DeployHashedTestnet.s.sol` — deploys the Hashed market.
- `script/ConfigureHashedTestnet.s.sol` — registers exact targets/selectors and adds Hashed to the demo account risk policy.

## Testnet market parameters

| Asset | Manual demo price | LTV | Liquidation threshold | Liquidation bonus |
| --- | ---: | ---: | ---: | ---: |
| hNVDA | $100 | 60% | 75% | 5% |
| hAAPL | $200 | 65% | 78% | 5% |
| hUSD | $1 | — | — | — |

## Terminal demo modes

### Quick vault demo

This is the shortest product interaction:

```text
Connect → Claim hNVDA/hAAPL → Deposit → Borrow hUSD → Repay → Withdraw
```

### Unified clearing demo

This is the important architecture proof:

```text
Claim demo equity
  → fund the 3maryjane account
  → LOCK VIA ADAPTER
  → BORROW VIA ADAPTER
  → inspect unified risk
  → REPAY VIA ADAPTER
  → UNLOCK VIA ADAPTER
  → return asset to owner wallet
```

The unified panel reads portfolio equity, total debt, gross exposure, portfolio health, solver output, policy state and per-asset exposure buckets from the existing clearing stack.

## SDK

The SDK exports `encodeHashed` for exact adapter calldata:

```ts
encodeHashed.deposit(hNVDA, amount)
encodeHashed.withdraw(hNVDA, amount)
encodeHashed.borrow(hUSD, amount)
encodeHashed.repay(hUSD, amount)
```

It also exposes `depositToken(account, asset, amount)` so a wallet can fund its 3maryjane account before adapter execution.


## End-to-end smoke proof — confirmed

The live Monad testnet clearing smoke script completed successfully on 2026-09-23 and restored the Hashed position to its pre-run state after the round trip.

Confirmed transactions from the final sequence:

- adapter execution: `0xe0549f97f08b0bef61f509e50a9a2434b1ebef853805fb5b985c1d6d6092bcb4`
- adapter execution: `0x005fe1897c18f4b29f91d40b24c27c5d455d2934469258f24bfbb4dafc051349`
- adapter execution: `0x598286bf9d59dce3553f64cf22c6abd99d8c15ca7b5df923db921f022667eb00`
- account withdrawal: `0x2445c82b837171eb87ba7e861ffc4dc09237cf27fa73f84929eca04ae4b11474`

The Foundry run reported:

```text
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
Total paid: 0.467546973004539291 MON
```

Because `DemoHashedClearingTestnet.s.sol` asserts the final wallet/account collateral balances, Hashed locked collateral, debt, and unified policy state are restored, a successful completion is also evidence that the full open → borrow → repay → unlock → return path completed without leaving residual Hashed state.

## Production warning

hNVDA and hAAPL are synthetic testnet demo tokens. The current price sources are manual testnet sources. hUSD is a testnet credit unit. None of them should be represented as real shares, a production stablecoin, or production oracle infrastructure.

A production rollout requires verified tokenized-equity/RWA contracts, production-grade oracle feeds, legal/compliance review for the underlying assets and jurisdictions, conservative market parameters, monitoring and an independent security audit.
