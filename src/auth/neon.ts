export interface JaneAuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

function authBaseUrl() {
  const value = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
  if (!value) throw new Error("NEON_AUTH_BASE_URL_NOT_CONFIGURED");
  return value;
}

function janePublicOrigin() {
  return (process.env.JANE_PUBLIC_ORIGIN || "https://jane-seven-sooty.vercel.app").replace(/\/$/, "");
}

function isAllowedBrowserOrigin(origin: string | null) {
  if (!origin) return true; // server-to-server/native clients
  const normalized = origin.replace(/\/$/, "");
  if (normalized === janePublicOrigin()) return true;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;
  return false;
}

function rewriteSetCookie(value: string) {
  return value
    .replace(/;\s*Domain=[^;]+/ig, "")
    .replace(/;\s*Path=[^;]+/ig, "; Path=/");
}

export async function requireJaneUser(request: Request): Promise<JaneAuthUser> {
  const response = await fetch(authBaseUrl() + "/get-session", {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      accept: "application/json"
    },
    redirect: "manual"
  });
  if (!response.ok) throw new Error("AUTH_SESSION_LOOKUP_FAILED");
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  const user = data && typeof data.user === "object" ? data.user as Record<string, unknown> : null;
  if (!user?.id) throw new Error("AUTH_REQUIRED");
  return {
    id: String(user.id),
    email: user.email == null ? null : String(user.email),
    name: user.name == null ? null : String(user.name)
  };
}

export async function proxyNeonAuth(request: Request, action: string) {
  const allowed = new Set(["sign-up/email","sign-in/email","sign-out","get-session"]);
  if (!allowed.has(action)) return Response.json({ error: "AUTH_ACTION_NOT_ALLOWED" }, { status: 404 });

  // Jane is the CSRF boundary. Reject browser requests coming from anywhere
  // except the Jane production origin before forwarding them to Neon Auth.
  if (!isAllowedBrowserOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "AUTH_ORIGIN_NOT_ALLOWED" }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const authBase = authBaseUrl();
  const upstreamOrigin = new URL(authBase).origin;
  const headers: Record<string,string> = {
    accept: "application/json",
    "content-type": request.headers.get("content-type") ?? "application/json"
  };

  // The Neon Auth request is server-to-server. Present the auth service's own
  // origin to Better Auth's CSRF middleware instead of forwarding Vercel/browser
  // proxy headers, which can be mis-resolved on multi-origin deployments.
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.origin = upstreamOrigin;
    headers.referer = upstreamOrigin + "/";
  }

  // Existing session cookies are needed for get-session/sign-out. Do not send
  // stale session cookies into sign-in/sign-up.
  const cookie = request.headers.get("cookie");
  if (cookie && action !== "sign-in/email" && action !== "sign-up/email") {
    headers.cookie = cookie;
  }

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Email/password auth does not need a redirect. Forward the client payload
    // unchanged and let the session cookie response complete the login.
    body = await request.text();
  }

  const upstream = await fetch(authBase + "/" + action, {
    method: request.method,
    headers,
    body,
    redirect: "manual"
  });

  const outHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store"
  });

  const cookieHeaders =
    (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie") as string] : []);
  for (const value of cookieHeaders) outHeaders.append("set-cookie", rewriteSetCookie(value));

  const location = upstream.headers.get("location");
  if (location) outHeaders.set("location", location);

  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: outHeaders });
}
