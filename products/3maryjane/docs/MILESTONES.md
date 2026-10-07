# CL build milestones

## Complete in current codebase

- [x] M1 Repository + architecture
- [x] M2 CL Account
- [x] M3 Asset custody / permissions
- [x] M4 Adapter standard + registry
- [x] M5 Kuru adapter
- [x] M6 Perpl adapter
- [x] M7 Euler adapter
- [x] M8 Position normalization envelope
- [x] M9 Unified Portfolio Lens / ledger read path
- [x] M10 Cross-protocol atomic execution primitive
- [x] M11 Exposure engine
- [x] M12 Unified leverage engine
- [x] M13 CL Health
- [x] M14 Portfolio critical-move / liquidation-buffer engine V1
- [x] M15 Stress engine
- [x] M16 Portfolio Margin Engine V1
- [x] M17 Enforceable risk policy engine
- [x] M18 Intent engine
- [x] M19 Capital Router V1
- [x] M20 Multi-step planner
- [x] M21 Risk solver
- [x] M22 Automated defensive actions
- [x] M23 Keeper network
- [x] M24 Simulation engine
- [x] M25 Production SDK surface
- [x] M26 Public Risk API
- [x] M27 Protocol onboarding framework
- [x] M28 CL Terminal
- [x] M29 Security hardening pass
- [x] M30 Production deployment/demo tooling
- [ ] M30 Live funded Monad broadcast + transaction evidence

## M11-M17 implementation notes

The risk stack is implemented in `RiskRegistry`, `RiskEngine`, `RiskPolicyManager`, `IRiskGuard`, and the risk-guard path in `CLAccount`.

- Raw Kuru, Perpl, and Euler positions are converted to canonical USD risk using configured asset/instrument mappings and fresh price sources.
- Positions sharing an economic underlying are netted across protocols into one risk bucket.
- Portfolio metrics include equity, debt, gross exposure, directional exposure, leverage, initial margin, maintenance margin, margin utilization, health, and critical-move buffer.
- Portfolio Margin V1 charges full directional margin on net exposure and a smaller basis/hedge charge on offsetting long/short pairs.
- The stress engine supports default configured shocks and explicit per-asset scenario shocks.
- Risk policy enforcement is transaction-level: CL captures portfolio state before execution, validates the final state after all protocol calls, and reverts the entire transaction if the policy is violated.
- Enforcement fails closed if a covered adapter cannot be read, required instrument configuration is missing, or a required price is invalid/stale.

`criticalMoveBps` is a CL portfolio-level linear adverse-move buffer estimate. It is not presented as an exact native liquidation price for Kuru, Perpl, Euler, or any other independent protocol; those venues continue to enforce their own liquidation rules.

## M18-M24 implementation notes

The decision/automation stack is implemented in `IntentEngine`, `CapitalRouter`, `MultiStepPlanner`, `RiskSolver`, `DefensiveExecutor`, `KeeperNetwork`, `SimulationEngine`, and the defensive-operator path in `CLAccount`.

- Intents are owner-authenticated, nonce-bound economic objectives; they do not grant custody.
- Capital routing deterministically ranks same-input quotes after gas and explicit risk penalties.
- Multi-step plans commit an exact ordered `AdapterAction[]` hash, expiry and linked intent.
- Risk solver output is venue-neutral and recommends hedge, repay or deleverage actions from live policy breaches.
- Defensive automation can only run through an owner-authorized `CLAccount` operator and must be strictly risk reducing.
- Strict defense prevents aggregate margin, gross/directional exposure and debt from worsening; per-asset net exposure also cannot worsen.
- Keeper jobs are user-created, cooldown-bounded and action-count-bounded.
- Simulation projects portfolio-level assets/debt/PnL/exposure/margin deltas and recomputes leverage, health, margin utilization and critical-move buffer.
- Exact venue execution remains an `eth_call`/live-integration concern; the onchain simulator does not pretend to emulate arbitrary protocol state transitions.

See `docs/INTENT_AUTOMATION.md` for the M18-M24 architecture and trust boundaries.

## M25-M29 implementation notes

The product and integration surface is now part of the repository rather than a separate future phase.

- The TypeScript SDK exports a stable `CLClient` interface instead of leaking package-manager-specific viem inference types into declarations.
- SDK lifecycle methods cover deterministic account prediction/creation, adapter authorization, wallet-asset permissions, policy configuration, per-asset limits, risk reads, solver reads, intents, owner execution and withdrawals.
- The Public Risk API exposes account, policy, unified risk, solver and protocol deployment reads over a read-only HTTP surface.
- The onboarding standard validates Monad chain IDs, execution targets and optional exact selector-permission manifests.
- `ConfigureAdapterPermissions.s.sol` configures Kuru, Perpl and Euler with explicit target + function-selector permissions before users authorize adapters.
- Adapter permission mutations bump registry versions, invalidating stale user authorization.
- Kuru/Perpl/Euler deployment requires explicit tracked tokens/perp IDs/vaults instead of silently deploying an empty read universe.
- Perpl configured position reads fail closed rather than hiding a venue read failure from CL risk.
- The CL Terminal reads the live unified portfolio, policy and solver state and can submit owner-authorized adapter execution through `CLAccount`.
- `docs/THREAT_MODEL.md` records the trust boundaries and residual risks; this is security hardening documentation, not an external audit.

CI covers Forge compilation, deployable bytecode sizes, the Solidity test suite, TypeScript typechecking and production SDK/API/Terminal builds.

## M30 boundary

The repository contains the production deployment scripts, exact adapter permission configuration, environment template, deployment evidence format, fail-closed deployment checklist and Metropolis demo runbook.

The final checkbox remains deliberately open because it is an external onchain operation rather than a code milestone. It requires:

1. re-verifying the selected Monad network's Kuru, Perpl, Euler and oracle addresses against primary protocol sources;
2. broadcasting the contracts from an authorized funded signer;
3. creating and funding a CL Account;
4. completing real Kuru, Perpl and Euler state transitions;
5. recording confirmed transaction hashes and final deployed addresses in `deployments/`;
6. showing the same live state through the API and CL Terminal.

No mocked transaction, guessed address or fabricated hash may be used to close the live M30 checkbox.
