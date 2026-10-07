# CL Intent, Routing & Automation — M18-M24

M18-M24 turns CL's cross-protocol risk kernel into a bounded decision and automation layer without giving agents or keepers unrestricted custody.

## Architecture

```text
User / Agent UI
      |
      v
 IntentEngine (M18)
      |
      v
CapitalRouter (M19) ---> same-input quote ranking
      |
      v
MultiStepPlanner (M20) ---> immutable ordered action commitment
      |
      v
 RiskSolver (M21) ---> hedge / repay / deleverage recommendation
      |
      v
SimulationEngine (M24) ---> projected post-plan risk
      |
      v
CLAccount owner execution
      |
      v
RiskPolicyManager post-state enforcement

Breach automation path:
KeeperNetwork (M23)
      |
      v
DefensiveExecutor (M22)
      |
      v
CLAccount.executeDefensiveBatch
      |
      v
STRICT risk-reduction validation
      |
      +-- safer -> commit
      +-- not safer -> revert every underlying call
```

## M18 — Intent Engine

`IntentEngine` stores owner-authenticated economic intent rather than protocol calldata. An intent specifies:

- CL account
- intent kind (hedge, rebalance, deleverage, repay, supply, unwind, custom)
- economic asset
- target net USD exposure
- maximum notional
- deadline
- constraint hash
- metadata hash
- monotonic per-account nonce

The intent can be cancelled, bound to a plan commitment, or marked executed only by the CL account owner. Creating an intent does **not** authorize a solver or agent to move funds.

## M19 — Capital Router V1

`CapitalRouter` ranks route quotes only when they represent the same requested input. The conservative score is:

```text
net route value = quoted output - gas cost - risk penalty
```

The router rejects expired routes, inactive adapters, excessive slippage, mismatched input amounts, and routes below minimum output. Risk penalties are routing heuristics, not security guarantees; CLAccount and RiskPolicyManager remain the execution security boundary.

## M20 — Multi-step Planner

`MultiStepPlanner` commits an exact ordered `AdapterAction[]` sequence to an immutable hash. A plan contains:

- account
- linked intent ID
- ordered actions hash
- expiry
- step count
- nonce
- status

Plans are bounded to 16 steps. Every referenced adapter must be active when the plan is created. The planner does not execute the account or bypass user ownership.

## M21 — Risk Solver

`RiskSolver` converts a current policy breach into a deterministic venue-neutral recommendation:

- `HEDGE`
- `REPAY`
- `DELEVERAGE`
- `NONE`

It returns the breach reason, largest directional asset, current/target net exposure, required gross reduction, required debt repayment, and breach severity. It deliberately does not fabricate venue-specific calldata.

## M22 — Automated Defensive Actions

`CLAccount` now supports owner-authorized **defensive operators** through `executeDefensiveBatch`.

This path is intentionally stronger than normal owner execution. A delegated batch must:

1. use already-authorized, active adapters;
2. stay inside each adapter's target allowlist;
3. use only adapters covered by the account's risk guard;
4. have no direct withdrawal capability;
5. finish in a state that is strictly risk-reducing.

Strict reduction means aggregate maintenance margin, initial margin, gross exposure, directional exposure and debt cannot worsen; per-asset net exposure cannot worsen; and at least one solvency/risk axis must improve.

If this test fails, the whole transaction reverts, including every protocol call performed earlier in the batch.

`DefensiveExecutor` adds a second boundary: automation only starts when the account is already policy-breached, and only approved keeper dispatchers may invoke it.

## M23 — Keeper Network

`KeeperNetwork` provides user-created bounded automation jobs. Each job specifies:

- CL account
- cooldown
- maximum adapter actions per execution
- active status

Network keepers can dispatch a job only within those limits. The account owner can disable the job. The job ultimately routes through `DefensiveExecutor` and the CL account's strict risk-reduction check.

Recommended deployment wiring:

```text
CLAccount defensive operator = DefensiveExecutor
DefensiveExecutor keeper      = KeeperNetwork
KeeperNetwork keeper          = authorized automation node(s)
```

## M24 — Simulation Engine

`SimulationEngine` projects portfolio-level risk under explicit planner/solver deltas for:

- assets
- debt
- PnL
- gross exposure
- directional exposure
- initial margin
- maintenance margin

It recomputes projected equity, leverage, health, margin utilization and critical-move buffer, and can check aggregate policy fields.

This is intentionally called a **risk-state simulator**. It is not a protocol execution emulator. Exact Kuru/Perpl/Euler execution should still be dry-run with `eth_call` against the final CLAccount transaction before broadcast.

## Security boundary

No M18-M24 component receives blanket custody.

- Intents express outcomes, not authority.
- Routing ranks quotes, not trust.
- Plans commit calldata, not execution rights.
- Solver output is advisory.
- Simulation is explicit about assumptions.
- Keepers are limited to a defensive path.
- CLAccount remains the custodian and executor.
- RiskPolicyManager remains the final cross-protocol policy check.

This preserves the core CL principle: **automation may propose and dispatch; the account and policy contracts decide what is allowed to commit.**
