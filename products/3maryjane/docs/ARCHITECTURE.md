# CL — Monad Clearing Network architecture

## Core rule

The CL account owns capital and protocol positions. Adapters **do not** custody funds and are not called with `delegatecall`.

An adapter converts a high-level action into an execution plan. The CL account then calls each target directly. This preserves `msg.sender == CLAccount` when the underlying protocol is invoked, so positions remain owned by the user's account.

## Trust boundaries

1. **Registry:** globally approves adapter implementations and the targets each adapter may call.
2. **Account owner:** explicitly authorizes a subset of active adapters.
3. **Adapter:** may only build calls to targets allowlisted for that adapter.
4. **CLAccount:** enforces the registry target boundary before every external call.
5. **Config-version pinning:** each user authorization is pinned to the adapter registry version. If governance changes an adapter's allowed targets or activation state, the old authorization becomes stale and execution fails until the user explicitly re-authorizes it.

The version pin closes a governance-expansion risk: registry administration cannot silently widen an already-authorized adapter's powers and immediately use the user's old approval.

## Execution path

```text
User
  -> CLAccount.execute(adapter, action)
       -> verify adapter active
       -> verify adapter user-authorized
       -> verify authorization version == current registry version
       -> adapter.buildExecution(account, action) [view]
       -> verify every target allowed for adapter
       -> CLAccount calls target #1
       -> CLAccount calls target #2
```

For cross-protocol transactions, `executeBatch` runs several adapter actions atomically. One failed call reverts the whole batch.

## Position path

```text
KuruAdapter  ----\
PerplAdapter -----+--> PortfolioLens --> Position[]
EulerAdapter -----/
```

Every adapter maps protocol-specific state into `CLTypes.Position`. Raw protocol units are preserved until a later valuation layer applies verified decimals and prices.

## Why not delegatecall adapters?

`delegatecall` preserves the account as the external caller but lets adapter bytecode mutate the account's storage. CL avoids that class of risk by using execution plans plus direct calls.
