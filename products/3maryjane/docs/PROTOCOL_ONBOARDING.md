# CL Protocol Onboarding Standard

CL integrations are adapters into a user-owned clearing account, not custody modules. A protocol is considered onboarded only when its execution and position-reading paths can participate safely in the CL risk universe.

## 1. Adapter contract

Every integration implements `ICLAdapter`:

```solidity
interface ICLAdapter {
    function protocolId() external view returns (bytes32);
    function buildExecution(address account, bytes calldata action)
        external view returns (CLTypes.Execution[] memory);
    function getPositions(address account)
        external view returns (CLTypes.Position[] memory);
}
```

The adapter must remain stateless with respect to user funds. `CLAccount` executes every returned call itself. An adapter must never require a user to transfer assets into the adapter and CL never uses adapter `delegatecall`.

## 2. Target + selector permissions

Every low-level target emitted by `buildExecution` must be registered in `AdapterRegistry` for that adapter. Production integrations should also enable exact function-selector enforcement for every executable target.

Permission changes are deliberately versioned. Changing adapter activity, targets, selector permissions or selector-enforcement state increments the adapter registry version. Existing CL Account authorization then becomes stale until the account owner explicitly re-authorizes the adapter.

A production protocol manifest therefore declares:

- adapter address
- Monad chain ID
- normalized position types
- exact executable target addresses
- exact 4-byte selectors for every target
- assets read by the adapter
- documentation / metadata

The SDK exports `validateProtocolManifest()` and `manifestSecurityChecklist()` to validate this envelope before registry onboarding. `ConfigureAdapterPermissions.s.sol` demonstrates the production permission model for Kuru, Perpl and Euler.

## 3. Position normalization

`getPositions(account)` maps venue-native state into `CLTypes.Position` without inventing USD values.

Required fields:

```text
protocolId
instrumentId
asset
positionType
signedExposure
collateral
debt
pnl
metadata
```

`notional = 0` means deliberately unvalued. The Risk Engine owns valuation.

Derivative integrations must use a stable `instrumentId` and explicit `RiskRegistry.InstrumentConfig` for:

- economic underlying
- collateral asset
- exposure decimals
- collateral decimals
- PnL decimals

CL fails closed when a derivative is missing this mapping.

## 4. Read failure policy

Material state used for clearing risk cannot silently disappear. A covered adapter call that reverts causes the Risk Engine to revert the portfolio calculation.

Inside an adapter, a read may only be suppressed when the protocol specification proves that the failure is equivalent to non-material absence. A configured market, perp instrument or lending vault that is part of the enforced risk universe should otherwise fail closed rather than disappear from the account snapshot.

This distinction matters: returning an empty position array after an RPC/protocol integration failure can make an unhealthy portfolio look safe.

## 5. Required integration tests

Before a manifest is accepted:

1. deposit / fund venue position
2. open or create position
3. read normalized position
4. reduce / close position
5. withdraw / repay path
6. target allowlist rejection
7. selector allowlist rejection
8. stale adapter authorization rejection after permission mutation
9. malformed action rejection
10. protocol revert propagation
11. configured position-read failure propagation
12. post-action CL risk-policy rollback
13. withdrawal rollback when policy would be violated

For lending/perp protocols, liquidation and health semantics remain venue-native. CL may model cross-protocol portfolio risk but must never claim to override the venue liquidator.

## 6. Manifest example

```ts
import { assertProtocolManifest } from "@cl-monad/sdk";

const vault = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";

const manifest = assertProtocolManifest({
  id: "EXAMPLE_LEND",
  displayName: "Example Lending",
  chainId: 10143,
  adapter: "0x1111111111111111111111111111111111111111",
  positionTypes: ["SUPPLY", "DEBT"],
  targets: [vault, token],
  targetPermissions: [
    {
      target: vault,
      selectors: [
        "0x6e553f65", // example selector; derive from the verified production ABI
        "0xb460af94",
      ],
    },
    {
      target: token,
      selectors: ["0x095ea7b3"], // approve(address,uint256)
    },
  ],
  assets: [token],
  docsUrl: "https://example.invalid/docs",
});
```

Do not copy example selectors into a live manifest without deriving/verifying them from the intended protocol ABI.

## 7. Deployment order

Production onboarding should occur in this order:

```text
Deploy adapter with explicit tracked state
        ↓
Verify target addresses + ABIs
        ↓
Register adapter
        ↓
Allow exact targets
        ↓
Allow exact selectors
        ↓
Enable selector enforcement
        ↓
Configure RiskRegistry assets/instruments
        ↓
Run read-path smoke tests
        ↓
User authorizes current adapter version
        ↓
Enable adapter in user's risk policy
```

Configuring permissions after user authorization intentionally invalidates that authorization.

## 8. Production acceptance

A manifest is not production-ready merely because it compiles. Mainnet/testnet addresses must be re-verified against primary protocol documentation immediately before deployment. The funded integration flow must produce real transaction hashes and the resulting positions must be visible through both the CL Public Risk API and Terminal.

The deployment evidence format lives in `deployments/README.md`, and the operational sequence is in `docs/DEPLOYMENT_CHECKLIST.md`.
