export type AccessJwk = JsonWebKey & { kid?: string };

export type AccessCerts = { keys: AccessJwk[] };

export type AuthEnv = {
  mode: "off" | "token" | "access";
  token?: string;
  teamDomain?: string;
  aud?: string;
  now?: () => number;
  certs?: (url: string) => Promise<AccessCerts>;
};

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

export async function rejectUnauthenticated(headers: Headers, auth: AuthEnv): Promise<Response | null> {
  switch (auth.mode) {
    case "off":
      return null;
    case "token":
      return headers.get("authorization") === `Bearer ${auth.token ?? ""}` ? null : unauthorized();
    case "access": {
      const token = headers.get("cf-access-jwt-assertion");
      if (!token || !auth.teamDomain || !auth.aud) return unauthorized();
      const valid = await verifyAccessJwt(token, {
        teamDomain: auth.teamDomain,
        aud: auth.aud,
        now: auth.now ?? (() => Date.now()),
        certs: auth.certs,
      });
      return valid ? null : unauthorized();
    }
    default: {
      const unreachable: never = auth.mode;
      throw new Error(unreachable);
    }
  }
}

export function accessCertUrl(teamDomain: string): string {
  const host = teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const qualified = host.includes(".") ? host : `${host}.cloudflareaccess.com`;
  return `https://${qualified}/cdn-cgi/access/certs`;
}

export async function verifyAccessJwt(
  token: string,
  input: { teamDomain: string; aud: string; now: () => number; certs?: (url: string) => Promise<AccessCerts> },
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return false;
  const header = decodeJson(encodedHeader);
  const payload = decodeJson(encodedPayload);
  if (!header || !payload) return false;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= input.now()) return false;
  const url = accessCertUrl(input.teamDomain);
  const issuer = url.slice(0, url.indexOf("/cdn-cgi/"));
  if (payload.iss !== issuer) return false;
  const audience = payload.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(input.aud)) return false;
  const certs = input.certs ?? ((certUrl) => fetch(certUrl).then((response) => response.json() as Promise<AccessCerts>));
  const published = await certs(url);
  const jwk = published.keys.find((key) => key.kid === header.kid);
  if (!jwk) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytesOf(base64UrlToBytes(encodedSignature)), bytesOf(signed));
  } catch {
    return false;
  }
}

function decodeJson(value: string): { alg?: unknown; kid?: unknown; exp?: unknown; iss?: unknown; aud?: unknown } | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as {
      alg?: unknown;
      kid?: unknown;
      exp?: unknown;
      iss?: unknown;
      aud?: unknown;
    };
  } catch {
    return null;
  }
}

function bytesOf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
