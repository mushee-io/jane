# CL Netlify Deployment

CL's public web deployment is configured as one Netlify site:

- `packages/terminal` builds the Vite/React Terminal.
- `netlify/functions/api.ts` serves the read-only CL Public Risk API as a Netlify Function.
- `/api/*` is proxied to the function.
- all other unmatched paths fall back to the Terminal's `index.html`.

The repository root contains `netlify.toml`; do not add a second conflicting Netlify config in a workspace.

## Connect the repository

Create a Netlify project from `mushee-io/3maryjane` and leave the base directory at the repository root. Netlify should read the committed `netlify.toml`.

Expected settings:

```text
Build command: npm install --ignore-scripts && npm --workspace @cl-monad/terminal run build
Publish directory: packages/terminal/dist
Functions directory: netlify/functions
```

## Required environment variables

Set these in Netlify project environment variables. Do not put `PRIVATE_KEY` in Netlify.

Server-side function variables:

```text
CL_CHAIN_ID=143
CL_RPC_URL=https://rpc.monad.xyz
CL_ACCOUNT_FACTORY=
CL_ADAPTER_REGISTRY=
CL_RISK_REGISTRY=
CL_RISK_ENGINE=
CL_RISK_POLICY_MANAGER=
CL_RISK_SOLVER=
CL_INTENT_ENGINE=
CL_CAPITAL_ROUTER=
CL_MULTI_STEP_PLANNER=
CL_DEFENSIVE_EXECUTOR=
CL_KEEPER_NETWORK=
CL_SIMULATION_ENGINE=
CL_KURU_ADAPTER=
CL_PERPL_ADAPTER=
CL_EULER_ADAPTER=
CL_WALLET_BALANCE_ADAPTER=
```

Browser/build-time Terminal variables:

```text
VITE_CL_CHAIN_ID=143
VITE_CL_RPC_URL=https://rpc.monad.xyz
VITE_CL_ACCOUNT_FACTORY=
VITE_CL_ADAPTER_REGISTRY=
VITE_CL_RISK_REGISTRY=
VITE_CL_RISK_ENGINE=
VITE_CL_RISK_POLICY_MANAGER=
VITE_CL_RISK_SOLVER=
VITE_CL_INTENT_ENGINE=
VITE_CL_CAPITAL_ROUTER=
VITE_CL_MULTI_STEP_PLANNER=
VITE_CL_DEFENSIVE_EXECUTOR=
VITE_CL_KEEPER_NETWORK=
VITE_CL_SIMULATION_ENGINE=
VITE_CL_KURU_ADAPTER=
VITE_CL_PERPL_ADAPTER=
VITE_CL_EULER_ADAPTER=
VITE_CL_WALLET_BALANCE_ADAPTER=
```

The `VITE_*` values are intentionally public configuration. Never expose signing keys or secrets using a `VITE_*` variable.

## Smoke test after deploy

Verify:

```text
GET /api/healthz
GET /api/v1/protocols
GET /api/v1/account/<CL_ACCOUNT>
GET /api/v1/risk/<CL_ACCOUNT>
GET /api/v1/policy/<CL_ACCOUNT>
GET /api/v1/solver/<CL_ACCOUNT>
```

Then open the root site and confirm the Terminal reads the same chain and CL deployment.

## Deployment boundary

Netlify deployment does not replace the onchain M30 work. Deploy CL to Monad mainnet first, populate the exact deployed addresses in Netlify, then deploy the web project. Never publish guessed contract addresses or transaction hashes.
