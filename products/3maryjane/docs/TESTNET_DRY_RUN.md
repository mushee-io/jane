# 3maryjane Monad Testnet Dry Run

This path exists to make the Netlify terminal genuinely functional on Monad Testnet (10143) before the final mainnet demo.

It deliberately uses **Kuru + Perpl + direct account balances**. Euler is not included because this repository does not carry a verified Monad testnet Euler deployment.

The testnet price sources are explicitly manual and are **not production oracles**. They exist only to exercise valuation, policy enforcement and solver UI during the dry run.

## Required verified testnet inputs

Use the current verified protocol values before broadcasting:

- `KURU_MARGIN_ACCOUNT`
- `KURU_TRACKED_TOKENS`
- `KURU_MARKETS`
- `PERPL_EXCHANGE`
- `PERPL_COLLATERAL`
- `PERPL_TRACKED_PERP_IDS`
- `FREE_COLLATERAL_ASSETS`

Also set:

- `RISK_UNDERLYING_ASSET`
- `RISK_COLLATERAL_ASSET`
- `RISK_UNDERLYING_PRICE_E18`
- `RISK_COLLATERAL_PRICE_E18`
- the existing margin/decimal variables
- `CL_ACCOUNT_SALT`
- `CL_ALLOWED_ASSETS`
- the existing policy variables

Never commit `PRIVATE_KEY`.

## Broadcast order

```bash
forge script script/DeployCore.s.sol:DeployCore --rpc-url "$MONAD_TESTNET_RPC" --broadcast -vvvv

forge script script/DeployTestnetAdapters.s.sol:DeployTestnetAdapters --rpc-url "$MONAD_TESTNET_RPC" --broadcast -vvvv

forge script script/ConfigureTestnetAdapterPermissions.s.sol:ConfigureTestnetAdapterPermissions --rpc-url "$MONAD_TESTNET_RPC" --broadcast -vvvv

forge script script/DeployRiskAutomation.s.sol:DeployRiskAutomation --rpc-url "$MONAD_TESTNET_RPC" --broadcast -vvvv

forge script script/ConfigureTestnetRisk.s.sol:ConfigureTestnetRisk --rpc-url "$MONAD_TESTNET_RPC" --broadcast -vvvv

forge script script/InitializeTestnetDemoAccount.s.sol:InitializeTestnetDemoAccount --rpc-url "$MONAD_TESTNET_RPC" --broadcast -vvvv
```

After every deployment step, copy the emitted addresses into the local environment before running the next step.

## Netlify variables

For this dry run set:

```text
VITE_CL_CHAIN_ID=10143
VITE_CL_RPC_URL=https://testnet-rpc.monad.xyz
VITE_CL_ACCOUNT_FACTORY=<deployed factory>
VITE_CL_ADAPTER_REGISTRY=<deployed registry>
VITE_CL_RISK_REGISTRY=<deployed risk registry>
VITE_CL_RISK_ENGINE=<deployed risk engine>
VITE_CL_RISK_POLICY_MANAGER=<deployed policy manager>
VITE_CL_RISK_SOLVER=<deployed solver>
VITE_CL_INTENT_ENGINE=<deployed intent engine>
VITE_CL_CAPITAL_ROUTER=<deployed router>
VITE_CL_MULTI_STEP_PLANNER=<deployed planner>
VITE_CL_DEFENSIVE_EXECUTOR=<deployed defensive executor>
VITE_CL_KEEPER_NETWORK=<deployed keeper network>
VITE_CL_SIMULATION_ENGINE=<deployed simulator>
VITE_CL_KURU_ADAPTER=<deployed Kuru adapter>
VITE_CL_PERPL_ADAPTER=<deployed Perpl adapter>
VITE_CL_WALLET_BALANCE_ADAPTER=<deployed wallet balance adapter>
```

Leave `VITE_CL_EULER_ADAPTER` unset on testnet.

Redeploy Netlify after changing Vite variables. Then the terminal can create/load a 3maryjane account and populate real onchain testnet state.
