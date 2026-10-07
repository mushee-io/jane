# CL protocol integrations

CL adapters are deliberately thin and fail closed. They do not custody funds and they do not use `delegatecall`. The user's `CLAccount` is the caller of each underlying protocol contract.

## Kuru

CL integrates Kuru's central `MarginAccount` and individual order books.

Implemented actions:
- deposit / withdraw margin
- market buy / sell using margin balances
- limit buy / sell
- cancel orders / flip orders
- normalized margin-token balances

A Kuru market must be allowlisted as an adapter target before a CL account can trade it. ERC-20 tokens used for margin deposits must also be allowlisted because the account performs the approval itself.

## Perpl

CL uses Perpl's Exchange contract directly onchain. API key enrollment and order forwarding are not required for direct `execOrder*` calls sent by the CL account itself.

Implemented actions:
- create Exchange account
- deposit / withdraw collateral
- enable / disable order forwarding
- single and batch order execution
- V2 order execution with extensions
- account collateral normalization
- tracked perpetual position normalization

Raw Perpl values such as `lotLNS`, `pricePNS`, and `balanceCNS` are preserved rather than pretending they have already been converted into common decimals.

## Euler v2

CL integrates Euler's EVC plus configured EVaults.

Implemented actions:
- enable / disable collateral
- enable / disable controller
- supply / withdraw
- borrow / repay
- normalize supplied assets and debt per tracked vault

Vault addresses are intentionally deployment configuration, not hardcoded protocol assumptions. The adapter discovers each vault's underlying asset at runtime.

## Valuation boundary

Milestones 5–10 normalize positions but **do not fabricate unified USD notional**. Protocol-native values are returned with `notional = 0` where a trustworthy conversion layer has not yet been applied. A later valuation/risk module will consume verified price sources and per-market decimal metadata before cross-protocol margin is calculated.
