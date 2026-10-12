import { proxyNeonAuth } from "../src/auth/neon.js";

export const config = { maxDuration: 30 };

export default {
  async fetch(): Promise<Response> {
    const request = new Request("https://jane-seven-sooty.vercel.app/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://jane-seven-sooty.vercel.app"
      },
      body: JSON.stringify({
        email: "jane-auth-smoke-user@example.invalid",
        password: "NotARealPassword123!"
      })
    });

    const upstream = await proxyNeonAuth(request, "sign-in/email");
    const data = await upstream.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;

    return Response.json({
      upstreamStatus: upstream.status,
      code: data.code ?? null,
      message: data.message ?? data.error ?? null,
      originLayerPassed: upstream.status !== 403 || (data.code !== "INVALID_ORIGIN" && data.message !== "Invalid origin")
    }, { headers: { "cache-control": "no-store" } });
  }
};
