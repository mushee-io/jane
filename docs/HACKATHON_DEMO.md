# Jane Monad Metropolis demo

## One-line pitch

**Jane is the private intelligence router for the agent economy: it chooses the best AI for each task by quality, cost and privacy, then uses Monad for programmable pay-per-inference settlement and verifiable execution receipts.**

## 90-second demo

### 1. Set a policy

Enable the Agent Spending Policy:

- max per request: $0.03
- daily budget: $2
- require zero retention

Explain:

> The agent is allowed to buy intelligence, but only inside this policy.

### 2. Use a confidential prompt

Example:

> Analyze our private hiring budget, research current public engineering salary benchmarks, and recommend whether we can hire five engineers. Do not expose private data. Spend no more than $0.03.

Attach a synthetic confidential text file containing an email/phone and financial figures.

### 3. Show local privacy

Point to:

- sensitive values protected
- context exposure percentage
- local Vault/context minimization

Explain:

> Jane removes identifiers and sends only the minimum context required.

### 4. Show routing

Point to:

- selected provider
- quality threshold
- estimated price
- alternatives
- savings

Explain:

> Users do not choose a model. Jane buys the right intelligence.

### 5. Show split inference

Point to the Split Inference panel.

Explain:

> Private analysis and public research are separated so the public route never receives the source document.

### 6. Show privacy receipt

Point to:

- zero-retention status
- privacy score
- receipt hash

Explain:

> This receipt proves how the request was handled without publishing the prompt.

### 7. Settle on Monad

Click **Settle inference on Monad**.

Sign the stable-token approval if required, then sign settlement.

After mining, show:

- Monad transaction hash
- verified block
- `InferenceSettled` verification

Explain:

> The private intelligence stays offchain. Payment and execution proof settle on Monad.

### 8. Network Console

Open Network Console.

Show:

- active compute providers
- capacity
- private nodes
- Agent Wallet infrastructure
- Enterprise Gateway
- Monad status
- optional 33G utility layer

Finish with:

> The internet should not have to choose an AI. Jane chooses intelligence for it.

## What not to claim

Do not claim:
- Monad executes the AI model.
- prompts are stored onchain.
- 33G is already deployed if it is not.
- the settlement contract is live before a real deployment transaction exists.
- an AI provider is zero-retention unless its configured route genuinely has that property.
