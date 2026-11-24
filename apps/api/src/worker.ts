import { rejectUnauthenticated, type AuthEnv } from "./auth.js";

type Env = {
  AUTH_MODE?: string;
  GALLERY_TOKEN?: string;
  DATABASE_URL?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return Response.json({ ok: true, mode: "cloud" });
    const auth: AuthEnv =
      env.AUTH_MODE === "token"
        ? { mode: "token", token: env.GALLERY_TOKEN }
        : { mode: "access", teamDomain: env.CF_ACCESS_TEAM_DOMAIN, aud: env.CF_ACCESS_AUD };
    const denied = await rejectUnauthenticated(request.headers, auth);
    if (denied) return denied;
    if (!env.DATABASE_URL) return Response.json({ error: "DATABASE_URL is not set" }, { status: 503 });
    return Response.json({ error: "cloud query adapter is waiting for DATABASE_URL wiring in this isolate" }, { status: 503 });
  },
};
