# CL Risk Engine — M11-M17

CL treats protocol adapters as position sources and the risk stack as the canonical cross-protocol interpretation layer.

## Pipeline

```text
Kuru / Perpl / Euler adapters
           |
           v
   normalized Position[]
           |
           v
      RiskRegistry
  asset + instrument map
  price + margin config
           |
           v
       RiskEngine
 valuation / netting / margin
 leverage / health / stress
           |
           v
   RiskPolicyManager
           |
           v
       CLAccount
 pre-state -> execute -> post-state
             |
     violation => revert all
```

## Canonical valuation

Every spot/lending asset has an `AssetConfig` containing its price source, token decimals, initial/maintenance margin rates, hedge charge, stress shock and maximum price staleness.

Derivatives use an `InstrumentConfig` because their protocol position representation can differ from the economic underlying. A Perpl market, for example, can expose lot units for the position while collateral/PnL are denominated in a stablecoin. CL maps those units independently rather than pretending they share decimals.

The enforcement path fails closed if required configuration or a valid price is unavailable.

## Cross-protocol exposure

All valued positions are grouped by economic underlying.

Example:

```text
Kuru MON spot       +$20,000
Perpl MON perp      -$12,000
Euler MON supplied   +$3,000
--------------------------------
Gross MON             $35,000
Net MON              +$11,000
```

For one bucket:

```text
net = sum(signed position value)
gross = sum(abs(signed position value))
hedgedPair = (gross - abs(net)) / 2
```

This lets a long on one venue offset a short on another without erasing basis risk.

## Portfolio Margin V1

For each underlying:

```text
initialMargin = abs(net) * initialMarginRate
              + hedgedPair * hedgeMarginRate

maintenanceMargin = abs(net) * maintenanceMarginRate
                  + hedgedPair * hedgeMarginRate
```

This is CL's portfolio margin model. It does not modify the native collateral or liquidation requirements enforced independently by Kuru, Perpl, Euler or other venues.

## Unified metrics

The engine exposes:

- assets and debt in canonical 1e18 USD units
- portfolio equity
- aggregate unrealized PnL
- gross exposure
- directional exposure
- initial margin
- maintenance margin
- leverage
- margin utilization
- CL Health
- portfolio critical-move buffer

Definitions:

```text
Equity = Assets - Debt + PnL
Leverage = Gross Exposure / Equity
CL Health = Equity / Maintenance Margin
Margin Utilization = Initial Margin / Equity
```

`criticalMoveBps` estimates how much linear adverse movement the current directional portfolio can absorb before CL equity reaches its maintenance-margin requirement. It is deliberately named a portfolio buffer: it is not an exact protocol-native liquidation price.

## Stress engine

Two stress modes exist:

1. Default stress uses each asset's configured shock and adds a basis charge to hedged pairs.
2. Scenario stress accepts explicit signed per-asset shocks and applies them to net cross-protocol exposure.

This means a -25% MON scenario shocks the portfolio's net MON exposure rather than separately pretending an offsetting spot long and perp short both lose 25%.

## Transaction-level policy enforcement

A CL account can install `RiskPolicyManager` as its risk guard. Policies can constrain:

- gross exposure
- total debt
- leverage
- margin utilization
- minimum CL Health
- minimum critical-move buffer
- absolute net exposure per asset
- which adapters are part of the enforced risk universe

Execution becomes:

```text
1. Capture pre-action portfolio state.
2. Execute one adapter action or an atomic cross-protocol batch.
3. Re-read the complete covered portfolio.
4. Check the post-action portfolio against policy.
5. If invalid, revert CLAccount.
```

Because the risk check occurs in the same transaction, a policy rejection rolls back every preceding protocol state change in that transaction.

A policy may optionally permit an already-breached account to make a strictly risk-reducing transition. The current V1 requires maintenance margin not to increase, debt not to increase, and either health or critical-move buffer to improve.

## Guardrails

- The risk engine fails closed when a covered adapter read fails.
- Perpetual positions require explicit instrument mapping.
- Price observations must be positive, timestamped and inside configured staleness limits.
- When a risk guard is enabled, CLAccount refuses actions from adapters outside the policy's covered universe.
- Withdrawals also run post-state policy validation.
- Risk contracts remain separate from adapter custody/execution contracts.

## Current boundary

M11-M17 establish a working clearing-risk kernel. They do not yet create shared collateral accepted natively by independent protocols and do not override venue liquidators. M18-M24 build intents, routing, planning, solving, automated defensive execution, keepers and pre-trade simulation on top of this kernel.
