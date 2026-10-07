import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseUnits,
  stringToHex,
  type WalletClient,
} from "viem";
import {
  createCLClient,
  encodeHashed,
  euler,
  kuru,
  monadMainnet,
  monadTestnet,
  perpl,
  type Address,
  type CLDeployment,
  type Hex,
  type RiskPolicy,
  type RiskSnapshot,
  type SolverRecommendation,
} from "@cl-monad/sdk";

const configuredChainId = Number(import.meta.env.VITE_CL_CHAIN_ID ?? "10143");
const chain = configuredChainId === 143 ? monadMainnet : monadTestnet;
const rpcUrl = import.meta.env.VITE_CL_RPC_URL as string | undefined;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

const hashedDeployment = {
  vault: envAddress("VITE_HASHED_VAULT") ?? (chain.id === 10143 ? "0x63814b52f6c2d366598dc7ed47eb364b41cf9a15" as Address : undefined),
  adapter: envAddress("VITE_HASHED_ADAPTER") ?? (chain.id === 10143 ? "0xF43bc85317345Ce54Fa616440b9b76AF276866eb" as Address : undefined),
  hUSD: envAddress("VITE_HASHED_USD") ?? (chain.id === 10143 ? "0xdcc5b92d7e99f4f31527121a402516f69d3edc27" as Address : undefined),
  hNVDA: envAddress("VITE_HASHED_NVDA") ?? (chain.id === 10143 ? "0x2ac57e9246e11cbf9899d276f2571d2b4cdfffac" as Address : undefined),
  hAAPL: envAddress("VITE_HASHED_AAPL") ?? (chain.id === 10143 ? "0x4edd0c5532cdc7c88c91eecbdf355b62ef309cb9" as Address : undefined),
  demoAccount: envAddress("VITE_CL_DEMO_ACCOUNT") ?? (chain.id === 10143 ? "0x38Ac1B6b3ec3eD28E0b49C5331b01151D1C3577f" as Address : undefined),
};

const equityTokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function faucetClaimed(address account) view returns (bool)",
  "function faucet()",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const hashedUsdAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const hashedVaultAbi = parseAbi([
  "function collateralOf(address account, address asset) view returns (uint256)",
  "function debtOf(address account) view returns (uint256)",
  "function totalCollateralUsdE18(address account) view returns (uint256)",
  "function borrowCapacityUsdE18(address account) view returns (uint256)",
  "function liquidationCapacityUsdE18(address account) view returns (uint256)",
  "function debtUsdE18(address account) view returns (uint256)",
  "function healthFactorE18(address account) view returns (uint256)",
  "function deposit(address asset, uint256 amount)",
  "function withdraw(address asset, uint256 amount)",
  "function borrow(uint256 amount)",
  "function repay(uint256 amount) returns (uint256)",
]);

type HashedReadState = {
  walletNvda: bigint;
  walletAapl: bigint;
  walletHusd: bigint;
  lockedNvda: bigint;
  lockedAapl: bigint;
  debtRaw: bigint;
  collateralUsdE18: bigint;
  borrowCapacityUsdE18: bigint;
  liquidationCapacityUsdE18: bigint;
  debtUsdE18: bigint;
  healthFactorE18: bigint;
  nvdaClaimed: boolean;
  aaplClaimed: boolean;
};

type HashedClearingState = {
  owner: Address;
  riskGuardEnabled: boolean;
  risk: RiskSnapshot;
  recommendation: SolverRecommendation | null;
  coveredAdapters: Address[];
  accountNvda: bigint;
  accountAapl: bigint;
  accountHusd: bigint;
  lockedNvda: bigint;
  lockedAapl: bigint;
  debtRaw: bigint;
  borrowCapacityUsdE18: bigint;
  healthFactorE18: bigint;
};

function envAddress(key: string): Address | undefined {
  const value = import.meta.env[key] as string | undefined;
  return value && isAddress(value) ? (getAddress(value) as Address) : undefined;
}

const deployment: CLDeployment = {
  chainId: chain.id,
  accountFactory: envAddress("VITE_CL_ACCOUNT_FACTORY"),
  adapterRegistry: envAddress("VITE_CL_ADAPTER_REGISTRY"),
  riskRegistry: envAddress("VITE_CL_RISK_REGISTRY"),
  riskEngine: envAddress("VITE_CL_RISK_ENGINE"),
  riskPolicyManager: envAddress("VITE_CL_RISK_POLICY_MANAGER"),
  riskSolver: envAddress("VITE_CL_RISK_SOLVER"),
  intentEngine: envAddress("VITE_CL_INTENT_ENGINE"),
  capitalRouter: envAddress("VITE_CL_CAPITAL_ROUTER"),
  multiStepPlanner: envAddress("VITE_CL_MULTI_STEP_PLANNER"),
  defensiveExecutor: envAddress("VITE_CL_DEFENSIVE_EXECUTOR"),
  keeperNetwork: envAddress("VITE_CL_KEEPER_NETWORK"),
  simulationEngine: envAddress("VITE_CL_SIMULATION_ENGINE"),
  adapters: {
    ...(envAddress("VITE_CL_KURU_ADAPTER") ? { Kuru: envAddress("VITE_CL_KURU_ADAPTER")! } : {}),
    ...(envAddress("VITE_CL_PERPL_ADAPTER") ? { Perpl: envAddress("VITE_CL_PERPL_ADAPTER")! } : {}),
    ...(envAddress("VITE_CL_EULER_ADAPTER") ? { Euler: envAddress("VITE_CL_EULER_ADAPTER")! } : {}),
    ...(envAddress("VITE_CL_WALLET_BALANCE_ADAPTER")
      ? { WalletBalance: envAddress("VITE_CL_WALLET_BALANCE_ADAPTER")! }
      : {}),
    ...(hashedDeployment.adapter ? { Hashed: hashedDeployment.adapter } : {}),
  },
};

function usd(value: bigint | undefined): string {
  if (value === undefined) return "—";
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const number = Number(formatUnits(absolute, 18));
  const rendered = Number.isFinite(number)
    ? number.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : formatUnits(absolute, 18);
  return negative ? `-${rendered}` : rendered;
}

function ratio(value: bigint | undefined): string {
  if (value === undefined) return "—";
  if (value > 1_000_000n * 10n ** 18n) return "∞";
  return `${Number(formatUnits(value, 18)).toFixed(2)}×`;
}

function percentBps(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return `${(Number(value) / 100).toFixed(2)}%`;
}

function short(address: string | undefined): string {
  if (!address) return "not configured";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function tokenAmount(value: bigint | undefined, decimals: number, maximumFractionDigits = 4): string {
  if (value === undefined) return "—";
  const number = Number(formatUnits(value, decimals));
  if (!Number.isFinite(number)) return formatUnits(value, decimals);
  return number.toLocaleString(undefined, { maximumFractionDigits });
}

export default function App() {
  const reader = useMemo(() => createCLClient({ publicClient, deployment }), []);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [accountInput, setAccountInput] = useState("");
  const [risk, setRisk] = useState<RiskSnapshot | null>(null);
  const [policy, setPolicy] = useState<RiskPolicy | null>(null);
  const [recommendation, setRecommendation] = useState<SolverRecommendation | null>(null);
  const [accountState, setAccountState] = useState<Awaited<ReturnType<typeof reader.getAccountState>> | null>(null);
  const [adapterInput, setAdapterInput] = useState("");
  const [actionInput, setActionInput] = useState("0x");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Connect a wallet, then load or create a deployed 3maryjane account.");
  const [activeProduct, setActiveProduct] = useState<"clearing" | "hashed">("clearing");

  const account = isAddress(accountInput) ? (getAddress(accountInput) as Address) : null;
  const coreConfigured = Boolean(deployment.accountFactory && deployment.adapterRegistry);
  const riskConfigured = Boolean(deployment.riskEngine && deployment.riskPolicyManager && deployment.riskSolver);
  const configuredAdapterCount = Object.keys(deployment.adapters ?? {}).length;
  const missingConfig = [
    !deployment.accountFactory && "ACCOUNT FACTORY",
    !deployment.adapterRegistry && "ADAPTER REGISTRY",
    !deployment.riskPolicyManager && "RISK POLICY",
    !deployment.riskSolver && "RISK SOLVER",
  ].filter(Boolean) as string[];

  async function connectWallet() {
    const ethereum = (window as Window & { ethereum?: any }).ethereum;
    if (!ethereum) {
      setMessage("No injected EVM wallet found.");
      return;
    }

    const chainIdHex = `0x${chain.id.toString(16)}`;

    try {
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError) {
        const code = Number((switchError as { code?: number }).code ?? 0);
        const message = switchError instanceof Error ? switchError.message.toLowerCase() : "";
        const missingChain = code === 4902 || message.includes("unrecognized chain") || message.includes("unknown chain");

        if (!missingChain) throw switchError;

        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [rpcUrl ?? chain.rpcUrls.default.http[0]],
          }],
        });

        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      }

      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0] || !isAddress(accounts[0])) throw new Error("Wallet returned no account");

      const address = getAddress(accounts[0]) as Address;
      const wallet = createWalletClient({ account: address, chain, transport: custom(ethereum) });
      setWalletAddress(address);
      setWalletClient(wallet);
      setMessage(`Wallet connected on ${chain.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection failed");
    }
  }

  async function createMyAccount() {
    if (!walletClient || !walletAddress) {
      setMessage("Connect your wallet first.");
      return;
    }
    if (!deployment.accountFactory) {
      setMessage("3maryjane core is not deployed/configured yet. Add VITE_CL_ACCOUNT_FACTORY in Netlify after deployment.");
      return;
    }

    setBusy(true);
    setTxHash(null);
    try {
      const writer = createCLClient({ publicClient, walletClient, deployment });
      const salt = keccak256(stringToHex(`3maryjane:${chain.id}:${walletAddress.toLowerCase()}`));
      const predicted = await writer.predictAccount(walletAddress, salt);
      const code = await publicClient.getCode({ address: predicted });

      if (code && code !== "0x") {
        setAccountInput(predicted);
        setMessage("Your deterministic 3maryjane account already exists. Loading it now.");
        setBusy(false);
        return;
      }

      const hash = await writer.createAccount(salt);
      setTxHash(hash);
      setMessage("Creating your 3maryjane account…");
      await publicClient.waitForTransactionReceipt({ hash });
      setAccountInput(predicted);
      setMessage("3maryjane account created. Click LOAD to sync portfolio state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!account) {
      setMessage("Enter a valid 3maryjane account address.");
      return;
    }
    setBusy(true);
    setMessage("Reading 3maryjane clearing state…");
    try {
      const [state, nextRisk, nextPolicy, solver] = await Promise.all([
        reader.getAccountState(account),
        deployment.riskPolicyManager ? reader.getRisk(account) : Promise.resolve(null),
        deployment.riskPolicyManager ? reader.getPolicy(account) : Promise.resolve(null),
        deployment.riskSolver ? reader.getSolverRecommendation(account) : Promise.resolve(null),
      ]);
      setAccountState(state);
      setRisk(nextRisk);
      setPolicy(nextPolicy);
      setRecommendation(solver?.recommendation ?? null);
      setMessage(`Clearing state synced from ${chain.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load clearing state");
    } finally {
      setBusy(false);
    }
  }

  async function executeRawAction() {
    if (!account || !walletClient || !walletAddress) {
      setMessage("Connect the owner wallet and enter a valid 3maryjane account first.");
      return;
    }
    if (!isAddress(adapterInput) || !/^0x[0-9a-fA-F]*$/.test(actionInput) || actionInput.length % 2 !== 0) {
      setMessage("Adapter or action calldata is invalid.");
      return;
    }
    setBusy(true);
    setTxHash(null);
    try {
      const writer = createCLClient({ publicClient, walletClient, deployment });
      const hash = await writer.execute(account, getAddress(adapterInput) as Address, actionInput as Hex);
      setTxHash(hash);
      setMessage("Transaction submitted. Waiting for Monad confirmation…");
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage("Execution confirmed and post-trade portfolio risk validation passed.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Execution failed");
      setBusy(false);
    }
  }

  const metrics = risk?.metrics;
  const protocolCards = [
    ["KURU", chain.id === 143 ? kuru[143].marginAccount : kuru[10143].marginAccount, deployment.adapters?.Kuru],
    ["PERPL", chain.id === 143 ? perpl[143].exchange : perpl[10143].exchange, deployment.adapters?.Perpl],
    ["EULER", chain.id === 143 ? euler[143].evc : undefined, deployment.adapters?.Euler],
    ["FREE COLLATERAL", undefined, deployment.adapters?.WalletBalance],
    ["HASHED", hashedDeployment.vault, deployment.adapters?.Hashed],
  ] as const;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="eyebrow">MONAD / CAPITAL + CLEARING</div>
          <h1>3maryjane</h1>
        </div>
        <nav className="product-nav" aria-label="Product">
          <button
            className={activeProduct === "clearing" ? "active" : ""}
            onClick={() => setActiveProduct("clearing")}
            type="button"
          >
            CLEARING
          </button>
          <button
            className={activeProduct === "hashed" ? "active" : ""}
            onClick={() => setActiveProduct("hashed")}
            type="button"
          >
            HASHED <span>TESTNET</span>
          </button>
        </nav>
        <div className="top-actions">
          <div className="network-dot"><span />{chain.name} · {chain.id}</div>
          <button className="button secondary" onClick={connectWallet}>
            {walletAddress ? short(walletAddress) : "CONNECT WALLET"}
          </button>
        </div>
      </header>

      <main>
        {activeProduct === "clearing" ? (
          <div id="clearing" className="product-page clearing-page">
        <section className="hero-grid">
          <div>
            <p className="kicker">3maryjane / CLEARING ENGINE</p>
            <h2>One account.<br />Every market.<br /><span>One risk layer.</span></h2>
          </div>
          <div className="account-box">
            <label>3maryjane ACCOUNT</label>
            <div className="input-row">
              <input
                value={accountInput}
                onChange={(event) => setAccountInput(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
              <button className="button" onClick={refresh} disabled={busy || !account}>{busy ? "SYNCING" : "LOAD"}</button>
            </div>
            <div className="account-actions">
              <button className="button secondary" onClick={createMyAccount} disabled={busy || !walletAddress || !deployment.accountFactory}>
                CREATE MY ACCOUNT
              </button>
            </div>
            <p>{message}</p>
          </div>
        </section>

        {(!coreConfigured || !riskConfigured || configuredAdapterCount === 0) && (
          <section className="setup-banner">
            <div>
              <div className="panel-title"><span>SETUP</span> DEPLOYMENT NOT CONNECTED</div>
              <h3>The frontend is live. The 3maryjane contracts are not connected yet.</h3>
              <p>
                Wallet connection is working. Portfolio metrics, policy checks, solver output and execution only become live after the
                3maryjane contracts are deployed and their addresses are added to the deployment environment.
              </p>
            </div>
            <div className="setup-status">
              <div><span>CORE</span><strong>{coreConfigured ? "READY" : "MISSING"}</strong></div>
              <div><span>RISK STACK</span><strong>{riskConfigured ? "READY" : "MISSING"}</strong></div>
              <div><span>ADAPTERS</span><strong>{configuredAdapterCount} LIVE</strong></div>
              <div><span>MISSING</span><strong>{missingConfig.length ? missingConfig.join(" · ") : "NONE"}</strong></div>
            </div>
          </section>
        )}

        <section className="metrics-grid">
          <Metric label="EQUITY" value={usd(metrics?.equityUsd)} />
          <Metric label="GROSS EXPOSURE" value={usd(metrics?.grossExposureUsd)} />
          <Metric label="NET DIRECTIONAL" value={usd(metrics?.directionalExposureUsd)} />
          <Metric label="LEVERAGE" value={ratio(metrics?.leverageE18)} />
          <Metric label="PORTFOLIO HEALTH" value={ratio(metrics?.healthE18)} emphasis />
          <Metric label="CRITICAL MOVE" value={percentBps(metrics?.criticalMoveBps)} />
        </section>

        <section className="two-col">
          <div className="panel">
            <div className="panel-title"><span>01</span> CROSS-PROTOCOL EXPOSURE</div>
            <div className="table">
              <div className="tr th"><span>ASSET</span><span>NET</span><span>GROSS</span><span>IM</span><span>MM</span></div>
              {risk?.exposures.length ? risk.exposures.map((exposure) => (
                <div className="tr" key={exposure.asset}>
                  <span className="mono">{short(exposure.asset)}</span>
                  <span>{usd(exposure.netUsd)}</span>
                  <span>{usd(exposure.grossUsd)}</span>
                  <span>{usd(exposure.initialMarginUsd)}</span>
                  <span>{usd(exposure.maintenanceMarginUsd)}</span>
                </div>
              )) : <div className="empty">NO VALUED EXPOSURE LOADED</div>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title"><span>02</span> RISK SOLVER</div>
            <div className="solver-action">{deployment.riskSolver ? (recommendation?.action ?? "STANDBY") : "OFFLINE"}</div>
            <div className="solver-grid">
              <div><small>ASSET</small><strong>{short(recommendation?.asset)}</strong></div>
              <div><small>CURRENT NET</small><strong>{usd(recommendation?.currentNetUsd)}</strong></div>
              <div><small>TARGET NET</small><strong>{usd(recommendation?.targetNetUsd)}</strong></div>
              <div><small>REPAY</small><strong>{usd(recommendation?.repayDebtUsd)}</strong></div>
            </div>
            <div className="status-line">
              <span className={risk ? (risk.ok ? "status good" : "status danger") : "status"}>
                {risk ? (risk.ok ? "POLICY PASS" : "POLICY BREACH") : "POLICY NOT CONFIGURED"}
              </span>
              <span>margin util {metrics ? ratio(metrics.marginUtilizationE18) : "—"}</span>
            </div>
          </div>
        </section>

        <section className="two-col">
          <div className="panel">
            <div className="panel-title"><span>03</span> VENUES + RISK SOURCES</div>
            {protocolCards.map(([name, venue, adapter]) => (
              <div className="venue" key={name}>
                <div>
                  <strong>{name}</strong>
                  <small>
                    {name === "EULER" && chain.id !== 143
                      ? "mainnet-only in the current 3maryjane build"
                      : venue
                        ? short(venue)
                        : "direct account balances"}
                  </small>
                </div>
                <div className="venue-right">
                  <span className={adapter ? "light active" : "light"} />
                  {name === "EULER" && chain.id !== 143 ? "not on testnet" : adapter ? short(adapter) : "adapter pending"}
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-title"><span>04</span> ACCOUNT CONTROL</div>
            <div className="control-grid">
              <div><small>OWNER</small><strong className="mono">{short(accountState?.owner)}</strong></div>
              <div><small>RISK GUARD</small><strong>{accountState?.riskGuardEnabled ? "ENFORCED" : "OFF"}</strong></div>
              <div><small>PAUSED</small><strong>{accountState ? (accountState.paused ? "YES" : "NO") : "—"}</strong></div>
              <div><small>MAX GROSS</small><strong>{usd(policy?.maxGrossExposureUsd)}</strong></div>
              <div><small>MAX DEBT</small><strong>{usd(policy?.maxDebtUsd)}</strong></div>
              <div><small>MIN HEALTH</small><strong>{ratio(policy?.minHealthE18)}</strong></div>
            </div>
          </div>
        </section>

        <section className="panel execution-panel">
          <div className="panel-title"><span>05</span> OWNER EXECUTION CONSOLE</div>
          <p className="warning">Raw adapter execution is intentionally explicit. The account still enforces adapter authorization, target allowlists, selector permissions and post-trade portfolio risk onchain.</p>
          <div className="execution-grid">
            <label>ADAPTER<input value={adapterInput} onChange={(e) => setAdapterInput(e.target.value)} placeholder="0x adapter" /></label>
            <label>ACTION CALLDATA<textarea value={actionInput} onChange={(e) => setActionInput(e.target.value)} rows={3} /></label>
            <button className="button danger-button" disabled={busy || !walletAddress} onClick={executeRawAction}>EXECUTE</button>
          </div>
          {txHash && <div className="tx mono">TX {txHash}</div>}
        </section>
          </div>
        ) : (
          <HashedPage
            walletClient={walletClient}
            walletAddress={walletAddress}
            connectWallet={connectWallet}
          />
        )}
      </main>

      <footer>
        <span>3maryjane / MONAD</span>
        <span>NON-CUSTODIAL · CROSS-PROTOCOL · FAIL-CLOSED</span>
      </footer>
    </div>
  );
}

function HashedPage({
  walletClient,
  walletAddress,
  connectWallet,
}: {
  walletClient: WalletClient | null;
  walletAddress: Address | null;
  connectWallet: () => Promise<void>;
}) {
  const connected = Boolean(
    hashedDeployment.vault &&
    hashedDeployment.adapter &&
    hashedDeployment.hUSD &&
    hashedDeployment.hNVDA &&
    hashedDeployment.hAAPL
  );
  const [state, setState] = useState<HashedReadState | null>(null);
  const [selectedCollateral, setSelectedCollateral] = useState<"hNVDA" | "hAAPL">("hNVDA");
  const [collateralAmount, setCollateralAmount] = useState("1");
  const [creditAmount, setCreditAmount] = useState("100");
  const [hashedBusy, setHashedBusy] = useState(false);
  const [hashedMessage, setHashedMessage] = useState(
    "Connect a wallet to claim demo equity and open a live Hashed testnet position."
  );
  const [hashedTx, setHashedTx] = useState<Hex | null>(null);
  const clearingReader = useMemo(() => createCLClient({ publicClient, deployment }), []);
  const [clearingAccountInput, setClearingAccountInput] = useState(hashedDeployment.demoAccount ?? "");
  const [clearingState, setClearingState] = useState<HashedClearingState | null>(null);
  const [clearingBusy, setClearingBusy] = useState(false);
  const [clearingMessage, setClearingMessage] = useState(
    "Load the configured 3maryjane account to prove Hashed is part of the unified portfolio."
  );
  const [clearingTx, setClearingTx] = useState<Hex | null>(null);
  const clearingAccount = isAddress(clearingAccountInput)
    ? (getAddress(clearingAccountInput) as Address)
    : null;

  const deploymentRows = [
    ["CREDIT VAULT", hashedDeployment.vault],
    ["3MARYJANE ADAPTER", hashedDeployment.adapter],
    ["CREDIT UNIT", hashedDeployment.hUSD],
    ["DEMO hNVDA", hashedDeployment.hNVDA],
    ["DEMO hAAPL", hashedDeployment.hAAPL],
  ] as const;

  function requireHashedDeployment() {
    const vault = hashedDeployment.vault;
    const hUSD = hashedDeployment.hUSD;
    const hNVDA = hashedDeployment.hNVDA;
    const hAAPL = hashedDeployment.hAAPL;
    if (!vault || !hUSD || !hNVDA || !hAAPL) {
      throw new Error("Hashed is not configured for this network.");
    }
    return { vault, hUSD, hNVDA, hAAPL };
  }

  function parsePositive(value: string, decimals: number): bigint {
    const clean = value.trim();
    if (!clean) throw new Error("Enter an amount.");
    const parsed = parseUnits(clean, decimals);
    if (parsed <= 0n) throw new Error("Amount must be greater than zero.");
    return parsed;
  }

  async function waitFor(hash: Hex) {
    setHashedTx(hash);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function refreshHashed() {
    if (!walletAddress) {
      setState(null);
      return;
    }

    try {
      const d = requireHashedDeployment();
      const [
        walletNvda,
        walletAapl,
        walletHusd,
        lockedNvda,
        lockedAapl,
        debtRaw,
        collateralUsdE18,
        borrowCapacityUsdE18,
        liquidationCapacityUsdE18,
        debtUsdE18,
        healthFactorE18,
        nvdaClaimed,
        aaplClaimed,
      ] = await Promise.all([
        publicClient.readContract({ address: d.hNVDA, abi: equityTokenAbi, functionName: "balanceOf", args: [walletAddress] }),
        publicClient.readContract({ address: d.hAAPL, abi: equityTokenAbi, functionName: "balanceOf", args: [walletAddress] }),
        publicClient.readContract({ address: d.hUSD, abi: hashedUsdAbi, functionName: "balanceOf", args: [walletAddress] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "collateralOf", args: [walletAddress, d.hNVDA] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "collateralOf", args: [walletAddress, d.hAAPL] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "debtOf", args: [walletAddress] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "totalCollateralUsdE18", args: [walletAddress] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "borrowCapacityUsdE18", args: [walletAddress] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "liquidationCapacityUsdE18", args: [walletAddress] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "debtUsdE18", args: [walletAddress] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "healthFactorE18", args: [walletAddress] }),
        publicClient.readContract({ address: d.hNVDA, abi: equityTokenAbi, functionName: "faucetClaimed", args: [walletAddress] }),
        publicClient.readContract({ address: d.hAAPL, abi: equityTokenAbi, functionName: "faucetClaimed", args: [walletAddress] }),
      ]);

      setState({
        walletNvda,
        walletAapl,
        walletHusd,
        lockedNvda,
        lockedAapl,
        debtRaw,
        collateralUsdE18,
        borrowCapacityUsdE18,
        liquidationCapacityUsdE18,
        debtUsdE18,
        healthFactorE18,
        nvdaClaimed,
        aaplClaimed,
      });
      setHashedMessage("Live Hashed position synced from Monad testnet.");
    } catch (error) {
      setHashedMessage(error instanceof Error ? error.message : "Failed to read Hashed state.");
    }
  }

  useEffect(() => {
    if (walletAddress && connected) void refreshHashed();
  }, [walletAddress, connected]);

  async function claimDemo(asset: "hNVDA" | "hAAPL") {
    if (!walletClient || !walletAddress) {
      await connectWallet();
      return;
    }

    setHashedBusy(true);
    setHashedTx(null);
    try {
      const d = requireHashedDeployment();
      const token = asset === "hNVDA" ? d.hNVDA : d.hAAPL;
      setHashedMessage("Claiming 10 " + asset + " from the Monad testnet faucet…");
      const hash = await walletClient.writeContract({
        account: walletAddress,
        chain,
        address: token,
        abi: equityTokenAbi,
        functionName: "faucet",
      });
      await waitFor(hash);
      setHashedMessage("10 " + asset + " claimed. Ready to deposit.");
      await refreshHashed();
    } catch (error) {
      setHashedMessage(error instanceof Error ? error.message : "Faucet claim failed.");
    } finally {
      setHashedBusy(false);
    }
  }

  async function depositCollateral() {
    if (!walletClient || !walletAddress) {
      setHashedMessage("Connect your wallet first.");
      return;
    }

    setHashedBusy(true);
    setHashedTx(null);
    try {
      const d = requireHashedDeployment();
      const token = selectedCollateral === "hNVDA" ? d.hNVDA : d.hAAPL;
      const amount = parsePositive(collateralAmount, 18);

      setHashedMessage("1/2 Approving " + selectedCollateral + " for the Hashed vault…");
      const approvalHash = await walletClient.writeContract({
        account: walletAddress,
        chain,
        address: token,
        abi: equityTokenAbi,
        functionName: "approve",
        args: [d.vault, amount],
      });
      await waitFor(approvalHash);

      setHashedMessage("2/2 Locking " + selectedCollateral + " as collateral…");
      const depositHash = await walletClient.writeContract({
        account: walletAddress,
        chain,
        address: d.vault,
        abi: hashedVaultAbi,
        functionName: "deposit",
        args: [token, amount],
      });
      await waitFor(depositHash);
      setHashedMessage("Collateral locked. Borrow power updated onchain.");
      await refreshHashed();
    } catch (error) {
      setHashedMessage(error instanceof Error ? error.message : "Deposit failed.");
    } finally {
      setHashedBusy(false);
    }
  }

  async function withdrawCollateral() {
    if (!walletClient || !walletAddress) {
      setHashedMessage("Connect your wallet first.");
      return;
    }

    setHashedBusy(true);
    setHashedTx(null);
    try {
      const d = requireHashedDeployment();
      const token = selectedCollateral === "hNVDA" ? d.hNVDA : d.hAAPL;
      const amount = parsePositive(collateralAmount, 18);
      setHashedMessage("Withdrawing collateral after onchain health check…");
      const hash = await walletClient.writeContract({
        account: walletAddress,
        chain,
        address: d.vault,
        abi: hashedVaultAbi,
        functionName: "withdraw",
        args: [token, amount],
      });
      await waitFor(hash);
      setHashedMessage("Collateral withdrawn.");
      await refreshHashed();
    } catch (error) {
      setHashedMessage(error instanceof Error ? error.message : "Withdrawal failed.");
    } finally {
      setHashedBusy(false);
    }
  }

  async function borrowCredit() {
    if (!walletClient || !walletAddress) {
      setHashedMessage("Connect your wallet first.");
      return;
    }

    setHashedBusy(true);
    setHashedTx(null);
    try {
      const d = requireHashedDeployment();
      const amount = parsePositive(creditAmount, 6);
      setHashedMessage("Borrowing hUSD against the live collateral position…");
      const hash = await walletClient.writeContract({
        account: walletAddress,
        chain,
        address: d.vault,
        abi: hashedVaultAbi,
        functionName: "borrow",
        args: [amount],
      });
      await waitFor(hash);
      setHashedMessage("hUSD borrowed. Health and debt updated onchain.");
      await refreshHashed();
    } catch (error) {
      setHashedMessage(error instanceof Error ? error.message : "Borrow failed.");
    } finally {
      setHashedBusy(false);
    }
  }

  async function repayCredit() {
    if (!walletClient || !walletAddress) {
      setHashedMessage("Connect your wallet first.");
      return;
    }

    setHashedBusy(true);
    setHashedTx(null);
    try {
      const d = requireHashedDeployment();
      const amount = parsePositive(creditAmount, 6);

      setHashedMessage("1/2 Approving hUSD for repayment…");
      const approvalHash = await walletClient.writeContract({
        account: walletAddress,
        chain,
        address: d.hUSD,
        abi: hashedUsdAbi,
        functionName: "approve",
        args: [d.vault, amount],
      });
      await waitFor(approvalHash);

      setHashedMessage("2/2 Repaying hUSD debt…");
      const repayHash = await walletClient.writeContract({
        account: walletAddress,
        chain,
        address: d.vault,
        abi: hashedVaultAbi,
        functionName: "repay",
        args: [amount],
      });
      await waitFor(repayHash);
      setHashedMessage("Debt repaid. Borrow power restored.");
      await refreshHashed();
    } catch (error) {
      setHashedMessage(error instanceof Error ? error.message : "Repayment failed.");
    } finally {
      setHashedBusy(false);
    }
  }

  async function refreshClearing() {
    if (!clearingAccount) {
      setClearingMessage("Enter a valid 3maryjane account address.");
      return;
    }

    setClearingBusy(true);
    try {
      const d = requireHashedDeployment();
      const [
        accountState,
        nextRisk,
        coveredAdapters,
        solver,
        accountNvda,
        accountAapl,
        accountHusd,
        lockedNvda,
        lockedAapl,
        debtRaw,
        borrowCapacityUsdE18,
        healthFactorE18,
      ] = await Promise.all([
        clearingReader.getAccountState(clearingAccount),
        clearingReader.getRisk(clearingAccount),
        clearingReader.getCoveredAdapters(clearingAccount),
        clearingReader.getSolverRecommendation(clearingAccount),
        clearingReader.tokenBalance(d.hNVDA, clearingAccount),
        clearingReader.tokenBalance(d.hAAPL, clearingAccount),
        clearingReader.tokenBalance(d.hUSD, clearingAccount),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "collateralOf", args: [clearingAccount, d.hNVDA] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "collateralOf", args: [clearingAccount, d.hAAPL] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "debtOf", args: [clearingAccount] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "borrowCapacityUsdE18", args: [clearingAccount] }),
        publicClient.readContract({ address: d.vault, abi: hashedVaultAbi, functionName: "healthFactorE18", args: [clearingAccount] }),
      ]);

      setClearingState({
        owner: accountState.owner,
        riskGuardEnabled: accountState.riskGuardEnabled,
        risk: nextRisk,
        recommendation: solver.recommendation,
        coveredAdapters,
        accountNvda,
        accountAapl,
        accountHusd,
        lockedNvda,
        lockedAapl,
        debtRaw,
        borrowCapacityUsdE18,
        healthFactorE18,
      });
      setClearingMessage("Unified portfolio synced. Hashed, Perpl and free collateral are read through one risk policy.");
    } catch (error) {
      setClearingMessage(error instanceof Error ? error.message : "Failed to load unified clearing state.");
    } finally {
      setClearingBusy(false);
    }
  }

  async function clearingWriter() {
    if (!walletClient || !walletAddress) throw new Error("Connect the owner wallet first.");
    if (!clearingAccount) throw new Error("Enter a valid 3maryjane account.");
    if (!hashedDeployment.adapter) throw new Error("Hashed adapter is not configured.");
    const state = await clearingReader.getAccountState(clearingAccount);
    if (state.owner.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error("Connected wallet is not the owner of this 3maryjane account.");
    }
    return createCLClient({ publicClient, walletClient, deployment });
  }

  async function waitClearing(hash: Hex, message: string) {
    setClearingTx(hash);
    setClearingMessage(message);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function fundClearingAccount() {
    setClearingBusy(true);
    setClearingTx(null);
    try {
      const d = requireHashedDeployment();
      const writer = await clearingWriter();
      const token = selectedCollateral === "hNVDA" ? d.hNVDA : d.hAAPL;
      const amount = parsePositive(collateralAmount, 18);

      const approveHash = await writer.approveToken(token, clearingAccount!, amount);
      await waitClearing(approveHash, "1/2 Approving " + selectedCollateral + " for the 3maryjane account…");

      const depositHash = await writer.depositToken(clearingAccount!, token, amount);
      await waitClearing(depositHash, "2/2 Funding the 3maryjane account…");

      setClearingMessage(selectedCollateral + " funded into the user-owned 3maryjane account.");
      await refreshClearing();
      await refreshHashed();
    } catch (error) {
      setClearingMessage(error instanceof Error ? error.message : "Clearing-account funding failed.");
    } finally {
      setClearingBusy(false);
    }
  }

  async function executeHashedFromClearing(kind: "deposit" | "withdraw" | "borrow" | "repay") {
    setClearingBusy(true);
    setClearingTx(null);
    try {
      const d = requireHashedDeployment();
      const writer = await clearingWriter();
      const token = selectedCollateral === "hNVDA" ? d.hNVDA : d.hAAPL;
      const action =
        kind === "deposit"
          ? encodeHashed.deposit(token, parsePositive(collateralAmount, 18))
          : kind === "withdraw"
            ? encodeHashed.withdraw(token, parsePositive(collateralAmount, 18))
            : kind === "borrow"
              ? encodeHashed.borrow(d.hUSD, parsePositive(creditAmount, 6))
              : encodeHashed.repay(d.hUSD, parsePositive(creditAmount, 6));

      const hash = await writer.execute(clearingAccount!, hashedDeployment.adapter!, action);
      await waitClearing(hash, "Executing Hashed through the 3maryjane account and validating portfolio risk…");
      setClearingMessage("Hashed adapter execution confirmed. Unified portfolio risk passed onchain.");
      await refreshClearing();
    } catch (error) {
      setClearingMessage(error instanceof Error ? error.message : "3maryjane Hashed execution failed.");
    } finally {
      setClearingBusy(false);
    }
  }

  async function returnCollateralToWallet() {
    if (!walletAddress) {
      setClearingMessage("Connect the owner wallet first.");
      return;
    }

    setClearingBusy(true);
    setClearingTx(null);
    try {
      const d = requireHashedDeployment();
      const writer = await clearingWriter();
      const token = selectedCollateral === "hNVDA" ? d.hNVDA : d.hAAPL;
      const amount = parsePositive(collateralAmount, 18);
      const hash = await writer.withdraw(clearingAccount!, token, walletAddress, amount);
      await waitClearing(hash, "Returning unlocked collateral from the 3maryjane account…");
      setClearingMessage(selectedCollateral + " returned to the owner wallet.");
      await refreshClearing();
      await refreshHashed();
    } catch (error) {
      setClearingMessage(error instanceof Error ? error.message : "Account withdrawal failed.");
    } finally {
      setClearingBusy(false);
    }
  }

  const availableBorrow =
    state && state.borrowCapacityUsdE18 > state.debtUsdE18
      ? state.borrowCapacityUsdE18 - state.debtUsdE18
      : 0n;
  const selectedWalletBalance =
    selectedCollateral === "hNVDA" ? state?.walletNvda : state?.walletAapl;
  const selectedLocked =
    selectedCollateral === "hNVDA" ? state?.lockedNvda : state?.lockedAapl;
  const healthClass =
    !state || state.debtRaw === 0n
      ? "good"
      : state.healthFactorE18 < 10n ** 18n
        ? "danger"
        : state.healthFactorE18 < 125n * 10n ** 16n
          ? "warning"
          : "good";

  return (
    <div id="hashed" className="product-page hashed-page">
      <section className="hashed-hero">
        <div>
          <p className="kicker">3maryjane / HASHED</p>
          <h2>Lock equity.<br />Borrow liquidity.<br /><span>Keep your exposure.</span></h2>
        </div>
        <div className="hashed-status-card">
          <small>MONAD TESTNET</small>
          <strong>{connected ? "LIVE" : "PROTOCOL READY"}</strong>
          <p>
            Hashed is the stock-backed credit module for 3maryjane. Tokenized-equity collateral
            becomes a programmable credit line, with the Hashed adapter already registered in the
            3maryjane clearing and risk stack.
          </p>
        </div>
      </section>

      <section className="hashed-stat-grid">
        <div><small>COLLATERAL VALUE</small><strong>{usd(state?.collateralUsdE18)}</strong><span>live wallet position</span></div>
        <div><small>BORROW POWER</small><strong>{usd(state?.borrowCapacityUsdE18)}</strong><span>{usd(availableBorrow)} remaining</span></div>
        <div><small>hUSD DEBT</small><strong>{usd(state?.debtUsdE18)}</strong><span>{tokenAmount(state?.walletHusd, 6, 2)} hUSD in wallet</span></div>
        <div className={"hashed-health " + healthClass}><small>HEALTH FACTOR</small><strong>{ratio(state?.healthFactorE18)}</strong><span>liquidation below 1.00×</span></div>
      </section>

      <section className="panel hashed-console">
        <div className="hashed-console-head">
          <div>
            <div className="panel-title"><span>H01</span> LIVE TESTNET CONSOLE</div>
            <h3>Open a stock-backed credit position.</h3>
          </div>
          <div className="hashed-wallet">
            <small>WALLET</small>
            <strong className="mono">{walletAddress ? short(walletAddress) : "NOT CONNECTED"}</strong>
            {walletAddress ? (
              <button className="button secondary" disabled={hashedBusy} onClick={refreshHashed}>SYNC POSITION</button>
            ) : (
              <button className="button" onClick={connectWallet}>CONNECT WALLET</button>
            )}
          </div>
        </div>

        <div className="hashed-live-grid">
          <div className="hashed-asset-card">
            <div className="hashed-asset-top">
              <div><small>DEMO EQUITY</small><strong>hNVDA</strong><span>$100 manual testnet price · 60% LTV</span></div>
              <button className="button secondary" disabled={hashedBusy || !walletAddress || state?.nvdaClaimed} onClick={() => claimDemo("hNVDA")}>
                {state?.nvdaClaimed ? "CLAIMED" : "CLAIM 10"}
              </button>
            </div>
            <div className="hashed-balance-row">
              <span>WALLET <strong>{tokenAmount(state?.walletNvda, 18)} hNVDA</strong></span>
              <span>LOCKED <strong>{tokenAmount(state?.lockedNvda, 18)} hNVDA</strong></span>
            </div>
          </div>

          <div className="hashed-asset-card">
            <div className="hashed-asset-top">
              <div><small>DEMO EQUITY</small><strong>hAAPL</strong><span>$200 manual testnet price · 65% LTV</span></div>
              <button className="button secondary" disabled={hashedBusy || !walletAddress || state?.aaplClaimed} onClick={() => claimDemo("hAAPL")}>
                {state?.aaplClaimed ? "CLAIMED" : "CLAIM 10"}
              </button>
            </div>
            <div className="hashed-balance-row">
              <span>WALLET <strong>{tokenAmount(state?.walletAapl, 18)} hAAPL</strong></span>
              <span>LOCKED <strong>{tokenAmount(state?.lockedAapl, 18)} hAAPL</strong></span>
            </div>
          </div>
        </div>

        <div className="hashed-action-grid">
          <div className="hashed-action-box">
            <div className="hashed-action-label"><span>01</span> COLLATERAL</div>
            <div className="hashed-asset-switch">
              <button type="button" className={selectedCollateral === "hNVDA" ? "active" : ""} onClick={() => setSelectedCollateral("hNVDA")}>hNVDA</button>
              <button type="button" className={selectedCollateral === "hAAPL" ? "active" : ""} onClick={() => setSelectedCollateral("hAAPL")}>hAAPL</button>
            </div>
            <label>
              AMOUNT
              <input value={collateralAmount} onChange={(event) => setCollateralAmount(event.target.value)} inputMode="decimal" placeholder="1.0" />
            </label>
            <div className="hashed-mini-state">
              <span>WALLET {tokenAmount(selectedWalletBalance, 18)}</span>
              <span>LOCKED {tokenAmount(selectedLocked, 18)}</span>
            </div>
            <div className="hashed-action-buttons">
              <button className="button" disabled={hashedBusy || !walletAddress} onClick={depositCollateral}>DEPOSIT</button>
              <button className="button secondary" disabled={hashedBusy || !walletAddress} onClick={withdrawCollateral}>WITHDRAW</button>
            </div>
          </div>

          <div className="hashed-action-box">
            <div className="hashed-action-label"><span>02</span> CREDIT</div>
            <div className="hashed-credit-symbol">hUSD</div>
            <label>
              AMOUNT
              <input value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} inputMode="decimal" placeholder="100" />
            </label>
            <div className="hashed-mini-state">
              <span>AVAILABLE {usd(availableBorrow)}</span>
              <span>WALLET {tokenAmount(state?.walletHusd, 6, 2)} hUSD</span>
            </div>
            <div className="hashed-action-buttons">
              <button className="button" disabled={hashedBusy || !walletAddress} onClick={borrowCredit}>BORROW</button>
              <button className="button secondary" disabled={hashedBusy || !walletAddress || !state?.debtRaw} onClick={repayCredit}>REPAY</button>
            </div>
          </div>

          <div className="hashed-position-box">
            <div className="hashed-action-label"><span>03</span> POSITION RISK</div>
            <div className="hashed-risk-readout">
              <div><small>COLLATERAL</small><strong>{usd(state?.collateralUsdE18)}</strong></div>
              <div><small>DEBT</small><strong>{usd(state?.debtUsdE18)}</strong></div>
              <div><small>LIQUIDATION CAPACITY</small><strong>{usd(state?.liquidationCapacityUsdE18)}</strong></div>
              <div><small>HEALTH</small><strong className={healthClass}>{ratio(state?.healthFactorE18)}</strong></div>
            </div>
            <p>Withdrawals and new borrowing are rejected onchain when they would exceed the configured collateral limits.</p>
          </div>
        </div>

        <div className="hashed-console-status">
          <span className={hashedBusy ? "pulse" : ""}>{hashedBusy ? "CONFIRM IN WALLET / WAITING FOR MONAD" : hashedMessage}</span>
          {hashedTx && <strong className="mono">TX {short(hashedTx)}</strong>}
        </div>
        <p className="hashed-demo-note">
          Quick vault demo: claim hNVDA or hAAPL → deposit → borrow hUSD → repay → withdraw.
          The unified clearing demo below executes the same credit actions through HashedAdapter from the user-owned
          3maryjane account and validates the combined portfolio after every action.
        </p>
      </section>

      <section className="panel hashed-clearing-demo">
        <div className="hashed-clearing-head">
          <div>
            <div className="panel-title"><span>H02</span> UNIFIED CLEARING DEMO</div>
            <h3>Hashed inside the actual 3maryjane account.</h3>
            <p>
              Fund the clearing account, execute Hashed through the registered adapter, then watch equity collateral,
              hUSD debt, Perpl and free collateral resolve into one portfolio-risk surface.
            </p>
          </div>
          <div className="hashed-clearing-account">
            <label>3MARYJANE ACCOUNT</label>
            <div className="input-row">
              <input
                value={clearingAccountInput}
                onChange={(event) => setClearingAccountInput(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
              <button className="button secondary" disabled={clearingBusy || !clearingAccount} onClick={refreshClearing}>
                {clearingBusy ? "SYNCING" : "LOAD"}
              </button>
            </div>
            <small>
              {clearingState
                ? "OWNER " + short(clearingState.owner) + (walletAddress && clearingState.owner.toLowerCase() === walletAddress.toLowerCase() ? " · CONNECTED OWNER" : " · READ ONLY")
                : "Default: deployed Monad testnet demo account"}
            </small>
          </div>
        </div>

        <div className="hashed-clearing-metrics">
          <div><small>PORTFOLIO EQUITY</small><strong>{usd(clearingState?.risk.metrics.equityUsd)}</strong></div>
          <div><small>TOTAL DEBT</small><strong>{usd(clearingState?.risk.metrics.debtUsd)}</strong></div>
          <div><small>GROSS EXPOSURE</small><strong>{usd(clearingState?.risk.metrics.grossExposureUsd)}</strong></div>
          <div><small>PORTFOLIO HEALTH</small><strong>{ratio(clearingState?.risk.metrics.healthE18)}</strong></div>
          <div><small>RISK SOLVER</small><strong>{clearingState?.recommendation?.action ?? "—"}</strong></div>
          <div><small>POLICY</small><strong>{clearingState ? (clearingState.risk.ok ? "PASS" : "BREACH") : "—"}</strong></div>
        </div>

        <div className="hashed-clearing-grid">
          <div className="hashed-clearing-actions">
            <div className="hashed-action-label"><span>A</span> ACCOUNT INVENTORY</div>
            <div className="hashed-account-balances">
              <div><span>hNVDA IN ACCOUNT</span><strong>{tokenAmount(clearingState?.accountNvda, 18)}</strong></div>
              <div><span>hAAPL IN ACCOUNT</span><strong>{tokenAmount(clearingState?.accountAapl, 18)}</strong></div>
              <div><span>hUSD IN ACCOUNT</span><strong>{tokenAmount(clearingState?.accountHusd, 6, 2)}</strong></div>
              <div><span>HASHED DEBT</span><strong>{tokenAmount(clearingState?.debtRaw, 6, 2)}</strong></div>
            </div>
            <div className="hashed-clearing-buttons">
              <button className="button" disabled={clearingBusy || !walletAddress || !clearingAccount} onClick={fundClearingAccount}>
                1 · FUND ACCOUNT
              </button>
              <button className="button" disabled={clearingBusy || !walletAddress || !clearingAccount} onClick={() => executeHashedFromClearing("deposit")}>
                2 · LOCK VIA ADAPTER
              </button>
              <button className="button" disabled={clearingBusy || !walletAddress || !clearingAccount} onClick={() => executeHashedFromClearing("borrow")}>
                3 · BORROW VIA ADAPTER
              </button>
              <button className="button secondary" disabled={clearingBusy || !walletAddress || !clearingAccount} onClick={() => executeHashedFromClearing("repay")}>
                4 · REPAY VIA ADAPTER
              </button>
              <button className="button secondary" disabled={clearingBusy || !walletAddress || !clearingAccount} onClick={() => executeHashedFromClearing("withdraw")}>
                5 · UNLOCK VIA ADAPTER
              </button>
              <button className="button secondary" disabled={clearingBusy || !walletAddress || !clearingAccount} onClick={returnCollateralToWallet}>
                6 · RETURN TO WALLET
              </button>
            </div>
            <p className="hashed-clearing-help">
              Uses the same selected collateral and amounts from the live console above. Owner-only adapter execution is
              enforced by the 3maryjane account; every adapter action is followed by the configured portfolio-risk check.
            </p>
          </div>

          <div className="hashed-clearing-risk">
            <div className="hashed-action-label"><span>B</span> CROSS-PROTOCOL RISK</div>
            <div className="hashed-covered-line">
              <span>RISK GUARD</span><strong>{clearingState?.riskGuardEnabled ? "ENFORCED" : "—"}</strong>
              <span>HASHED COVERED</span><strong>{clearingState && hashedDeployment.adapter
                ? (clearingState.coveredAdapters.some((adapter) => adapter.toLowerCase() === hashedDeployment.adapter!.toLowerCase()) ? "YES" : "NO")
                : "—"}</strong>
            </div>
            <div className="hashed-exposure-table">
              <div className="hashed-exposure-row head"><span>ASSET</span><span>NET</span><span>GROSS</span><span>MM</span></div>
              {clearingState?.risk.exposures.length ? clearingState.risk.exposures.map((exposure) => {
                const label =
                  hashedDeployment.hNVDA && exposure.asset.toLowerCase() === hashedDeployment.hNVDA.toLowerCase()
                    ? "hNVDA"
                    : hashedDeployment.hAAPL && exposure.asset.toLowerCase() === hashedDeployment.hAAPL.toLowerCase()
                      ? "hAAPL"
                      : hashedDeployment.hUSD && exposure.asset.toLowerCase() === hashedDeployment.hUSD.toLowerCase()
                        ? "hUSD"
                        : short(exposure.asset);
                return (
                  <div className="hashed-exposure-row" key={exposure.asset}>
                    <span>{label}</span>
                    <strong>{usd(exposure.netUsd)}</strong>
                    <strong>{usd(exposure.grossUsd)}</strong>
                    <strong>{usd(exposure.maintenanceMarginUsd)}</strong>
                  </div>
                );
              }) : <div className="empty">LOAD THE ACCOUNT TO READ THE UNIFIED RISK SURFACE</div>}
            </div>
          </div>
        </div>

        <div className="hashed-console-status">
          <span className={clearingBusy ? "pulse" : ""}>{clearingBusy ? "CONFIRM IN WALLET / VALIDATING ON MONAD" : clearingMessage}</span>
          {clearingTx && <strong className="mono">TX {short(clearingTx)}</strong>}
        </div>
      </section>

      <section className="two-col hashed-columns">
        <div className="panel">
          <div className="panel-title"><span>H03</span> CREDIT FLOW</div>
          <div className="hashed-steps">
            <div><span>01</span><strong>LOCK EQUITY</strong><small>Deposit supported tokenized-equity collateral into the Hashed vault.</small></div>
            <div><span>02</span><strong>BORROW hUSD</strong><small>Mint credit up to the asset-specific LTV without selling the collateral.</small></div>
            <div><span>03</span><strong>CLEAR THE POSITION</strong><small>HashedAdapter exposes collateral and debt to the existing 3maryjane risk engine.</small></div>
            <div><span>04</span><strong>DEFEND OR LIQUIDATE</strong><small>Health falls with collateral value; unsafe positions become liquidatable onchain.</small></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title"><span>H04</span> TESTNET DEPLOYMENT</div>
          <div className="hashed-deployment">
            {deploymentRows.map(([label, address]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className="mono">{address ? short(address) : "pending deployment"}</strong>
              </div>
            ))}
          </div>
          <p className="hashed-note">
            Demo equity tokens and manual prices are testnet-only. They are not real shares,
            production stablecoins, or production oracle infrastructure.
          </p>
        </div>
      </section>

      <section className="hashed-thesis">
        <div className="panel-title"><span>H05</span> WHY HASHED EXISTS</div>
        <h3>Credit should understand the portfolio it is lending against.</h3>
        <p>
          A normal lending market sees collateral in isolation. Hashed is built inside 3maryjane:
          its collateral and debt normalize into the same clearing architecture that tracks
          cross-protocol exposure. The first market is testnet equity-backed credit; the architecture
          can later extend to verified real-world-asset collateral without changing the clearing model.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`metric ${emphasis ? "emphasis" : ""}`}><small>{label}</small><strong>{value}</strong></div>;
}
