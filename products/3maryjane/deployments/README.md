# CL Deployment Records

Create one JSON record per live deployment only after the contracts are actually broadcast. Do not commit guessed or placeholder addresses as if they were deployed.

Recommended filename:

```text
<chainId>-<network>-<YYYYMMDD>.json
```

Required shape:

```json
{
  "chainId": 10143,
  "network": "monad-testnet",
  "gitCommit": "<40-byte commit sha>",
  "deployedAtBlock": "0",
  "contracts": {
    "adapterRegistry": "0x...",
    "accountFactory": "0x...",
    "riskRegistry": "0x...",
    "riskEngine": "0x...",
    "riskPolicyManager": "0x...",
    "riskSolver": "0x...",
    "intentEngine": "0x...",
    "capitalRouter": "0x...",
    "multiStepPlanner": "0x...",
    "defensiveExecutor": "0x...",
    "keeperNetwork": "0x...",
    "simulationEngine": "0x..."
  },
  "adapters": {
    "kuru": "0x...",
    "perpl": "0x...",
    "euler": "0x..."
  },
  "underlyingTargets": {
    "kuruMargin": "0x...",
    "kuruMarkets": [],
    "perplExchange": "0x...",
    "perplCollateral": "0x...",
    "eulerEvc": "0x...",
    "eulerVaults": []
  },
  "risk": {
    "assets": [],
    "instruments": []
  },
  "account": "0x...",
  "transactions": {
    "createAccount": "0x...",
    "kuru": [],
    "perpl": [],
    "euler": [],
    "defense": []
  }
}
```

The `transactions` section is the evidence boundary for M30. A network configuration is not considered a completed live demo until the relevant transaction hashes are confirmed on the selected Monad network.
