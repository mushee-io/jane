# CL Public Risk API

The API is deliberately read-only. It exposes the same canonical risk state used by the onchain clearing policy without holding keys or submitting transactions.

## Endpoints

```text
GET /healthz
GET /v1/protocols
GET /v1/account/:address
GET /v1/risk/:address
GET /v1/policy/:address
GET /v1/solver/:address
```

All USD values are canonical 1e18 fixed-point integers serialized as decimal strings. Consumers should not parse them through floating-point arithmetic when making execution decisions.

### `/v1/risk/:address`

Returns:

- policy pass/fail
- reason hash
- equity and debt
- gross and directional exposure
- initial and maintenance margin
- leverage
- CL Health
- margin utilization
- critical-move buffer
- per-underlying net/gross/hedged exposure buckets
- block number used for the request envelope

### `/v1/solver/:address`

Returns the venue-neutral solver recommendation generated from the live policy state. It may recommend `HEDGE`, `REPAY`, or `DELEVERAGE`. The public API never executes this recommendation.

## Configuration

Set `CL_CHAIN_ID`, `CL_RPC_URL`, and the deployed CL core addresses listed in `.env.example`. Endpoints whose required contract is not configured fail with `503` rather than inventing or mocking data.

## Trust boundary

The API is a convenience surface, not a consensus component. Onchain `CLAccount` and `RiskPolicyManager` remain authoritative for execution. A client may use API data for UX and planning, but transaction safety is still enforced in the same Monad transaction after protocol state changes and before commit.
