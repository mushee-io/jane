export interface JaneAuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

function authBaseUrl() {
  const value = (process.env.JANE_NEON_AUTH_BASE_URL ?? process.env.NEON_AUTH_BASE_URL)?.replace(/\/$/, "");
  if (!value) throw new Error("NEON_AUTH_BASE_URL_NOT_CONFIGURED");
  return value;
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

  const headers: Record<string,string> = {
    accept: "application/json",
    "content-type": request.headers.get("content-type") ?? "application/json"
  };
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  const upstream = await fetch(authBaseUrl() + "/" + action, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    redirect: "manual"
  });

  const outHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store"
  });
  const setCookie = upstream.headers.get("set-cookie");
  if (setCookie) outHeaders.append("set-cookie", setCookie.replace(/;\s*Domain=[^;]+/ig, ""));
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: outHeaders });
}
