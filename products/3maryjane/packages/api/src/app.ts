import { Hono } from "hono";
import { cors } from "hono/cors";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import {
  createCLClient,
  euler,
  kuru,
  monadMainnet,
  monadTestnet,
  perpl,
  type Address,
} from "@cl-monad/sdk";
import { deployment, rpcUrl } from "./config";
import { jsonSafe } from "./json";

const chain = deployment.chainId === 143 ? monadMainnet : monadTestnet;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const cl = createCLClient({ publicClient, deployment });

export const app = new Hono();

app.use("/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

function accountParam(value: string): Address {
  if (!isAddress(value)) throw new Error("invalid account address");
  return getAddress(value) as Address;
}

function requireComponent(name: "riskPolicyManager" | "riskSolver") {
  if (!deployment[name]) {
    const error = new Error(`${name} is not configured on this API instance`);
    Object.assign(error, { status: 503 });
    throw error;
  }
}

app.get("/", (c) =>
  c.json({
    name: "3maryjane Public Risk API",
    version: "v1",
    chainId: deployment.chainId,
    readOnly: true,
    endpoints: [
      "/healthz",
      "/v1/protocols",
      "/v1/account/:address",
      "/v1/risk/:address",
      "/v1/policy/:address",
      "/v1/solver/:address",
    ],
  }),
);

app.get("/healthz", async (c) => {
  const blockNumber = await publicClient.getBlockNumber();
  return c.json({ ok: true, chainId: deployment.chainId, blockNumber: blockNumber.toString() });
});

app.get("/v1/protocols", (c) => {
  const chainId = deployment.chainId as 143 | 10143;
  const protocolData = {
    Kuru: kuru[chainId],
    Perpl: perpl[chainId],
    Euler: chainId === 143 ? euler[143] : null,
  };
  return c.json(
    jsonSafe({
      chainId,
      protocols: protocolData,
      cl: deployment,
    }),
  );
});

app.get("/v1/account/:address", async (c) => {
  const account = accountParam(c.req.param("address"));
  const [state, blockNumber] = await Promise.all([cl.getAccountState(account), publicClient.getBlockNumber()]);
  return c.json(jsonSafe({ account, blockNumber, state }));
});

app.get("/v1/risk/:address", async (c) => {
  requireComponent("riskPolicyManager");
  const account = accountParam(c.req.param("address"));
  const [risk, blockNumber] = await Promise.all([cl.getRisk(account), publicClient.getBlockNumber()]);
  return c.json(jsonSafe({ account, blockNumber, ...risk }));
});

app.get("/v1/policy/:address", async (c) => {
  requireComponent("riskPolicyManager");
  const account = accountParam(c.req.param("address"));
  const [policy, adapters] = await Promise.all([cl.getPolicy(account), cl.getCoveredAdapters(account)]);
  return c.json(jsonSafe({ account, policy, adapters }));
});

app.get("/v1/solver/:address", async (c) => {
  requireComponent("riskSolver");
  const account = accountParam(c.req.param("address"));
  const result = await cl.getSolverRecommendation(account);
  return c.json(jsonSafe({ account, ...result }));
});

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((error, c) => {
  const status = Number((error as Error & { status?: number }).status ?? 500);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  return c.json(
    {
      error: safeStatus === 500 ? "internal_error" : "request_error",
      message: error instanceof Error ? error.message : "unknown error",
    },
    safeStatus as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503,
  );
});
