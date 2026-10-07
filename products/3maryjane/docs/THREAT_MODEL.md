# CL Threat Model

CL is a non-custodial cross-protocol clearing layer. The primary security boundary is the user-owned `CLAccount`: adapters describe calls, while the account executes them and remains the owner of funds and venue positions.

This document describes the current implementation, not an external audit.

## Assets at risk

- ERC-20 and native assets held by a `CLAccount`
- collateral deposited into integrated protocols from a `CLAccount`
- spot, perp and lending positions owned by a `CLAccount`
- owner execution authority
- delegated defensive execution authority
- portfolio valuation and policy state

## Trust boundaries

### Account owner

The owner can withdraw, authorize adapters, set the risk guard, configure defensive operators and submit normal execution batches. Owner compromise is therefore account compromise. CL does not attempt to protect a user from a compromised owner key.

### Adapter registry owner

The registry owner can activate adapters and modify target/selector permissions. Every permission mutation increments the adapter version. Existing account authorization becomes stale and execution fails until the account owner explicitly re-authorizes that adapter. This prevents a registry administrator from silently widening an already-authorized adapter's execution surface.

### Adapters

Adapters are not trusted with custody. They cannot receive user funds as part of the CL architecture and are never invoked with `delegatecall`. They only return an execution plan. `CLAccount` independently checks every target and selector before issuing the call.

### Risk registry owner

The risk registry owner chooses price sources, instrument mappings and margin parameters. A malicious or incorrect configuration can make portfolio metrics incorrect. Production ownership should therefore be transferred to an appropriately controlled multisig/timelock after deployment.

### Keepers

Keepers can submit only owner-created, bounded defensive jobs through the automation path. They cannot withdraw funds. The final CL state must be strictly safer under the configured risk guard or the complete transaction reverts.

### External protocols

Kuru, Perpl, Euler, ERC-20 contracts, price feeds and Monad itself remain independent trust domains. CL cannot prevent an integrated protocol exploit, governance action, oracle failure, chain reorganization or venue-native liquidation.

## Primary attack classes and controls

### Arbitrary adapter execution

Threat: a malicious adapter returns a transfer or arbitrary protocol call.

Controls:
- adapter must be active
- user must explicitly authorize adapter
- authorization is pinned to registry version
- target must be allowlisted
- selector must be allowlisted when selector enforcement is enabled
- target cannot be the CL account itself
- adapters execute without `delegatecall`

### Permission expansion after authorization

Threat: registry owner adds a dangerous target or selector after a user has authorized an adapter.

Control: target, selector and selector-enforcement changes increment `adapterVersion`. The account's pinned version no longer matches and execution reverts with `AdapterAuthorizationStale` until the owner re-authorizes.

### Withdrawal while leveraged

Threat: owner withdraws collateral and leaves cross-protocol positions undercollateralized relative to their CL policy.

Control: withdrawals capture pre-state risk, perform the transfer, then validate final portfolio risk. A policy violation reverts the entire transaction, including the transfer.

### Keeper abuse

Threat: a delegated keeper uses automation to speculate, increase leverage or extract value.

Controls:
- only explicit defensive operators may call the delegated account path
- keeper network has per-job action bounds and cooldowns
- defensive executor requires a breached account
- final state must be strictly risk reducing
- no withdrawal entry point is exposed to keepers

### Oracle manipulation / stale data

Threat: policy validation relies on missing, zero, future-dated or stale observations.

Controls:
- missing asset/instrument configuration fails closed
- zero/future timestamps fail closed
- observations older than configured staleness fail closed
- risk calculations use explicit asset/instrument mappings rather than guessing derivative semantics

Residual risk: a fresh but economically manipulated upstream oracle can still produce a wrong valuation. Production feed selection, heartbeat, deviation controls and independent monitoring remain operational requirements.

### Partial multi-protocol execution

Threat: one step in a Kuru/Perpl/Euler plan succeeds while a later step fails.

Control: when all calls are issued within one `CLAccount.executeBatch` transaction, an EVM revert rolls back the complete batch. This does not make unrelated future transactions atomic and does not protect against offchain/API actions that are not part of the same transaction.

### Reentrancy

Threat: an external token/protocol callback re-enters CL execution or withdrawal.

Controls:
- state-changing custody/execution paths use `nonReentrant`
- account target itself cannot be emitted by an adapter
- owner/registry authorization is checked again for every adapter action

Residual risk: integrated token/protocol behavior must still be reviewed, especially callback-based tokens or protocols.

### Malformed position reads

Threat: a venue read silently disappears, making a risky portfolio appear healthy.

Control: the risk engine fails closed when a covered adapter itself fails. Adapter-specific optional market reads must only suppress failures that are proven equivalent to 'position absent'; material read failures must propagate.

## Non-goals / explicit limitations

CL V1 does not make independent venues recognize one shared collateral pool. Kuru, Perpl and Euler continue to enforce their own collateral, margin and liquidation rules. CL Health and `criticalMoveBps` are derived portfolio metrics, not promises that an underlying venue will delay or avoid liquidation.

CL does not provide MEV protection, guaranteed execution, guaranteed solver optimality, or insurance against protocol failure.

## Production controls

Before a live deployment:

1. verify every protocol and oracle address from primary sources
2. configure target + selector permissions before users authorize adapters
3. configure only the exact markets/vaults/instruments used by the deployment
4. run funded low-notional transactions for every adapter action class
5. test stale price, permission revocation and downstream-revert paths on the selected Monad network
6. transfer administrative roles to the intended operational owner
7. record deployed bytecode, addresses and configuration in a deployment manifest
8. run an independent security review before meaningful value is deposited

See `docs/DEPLOYMENT_CHECKLIST.md` for the operational sequence.
