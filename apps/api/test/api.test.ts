import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { rejectUnauthenticated } from "../src/auth.ts";
import { createLocalApp } from "../src/local.ts";
import worker from "../src/worker.ts";

describe("local api", () => {
  it("imports a photo, filters it, and exports a zip without the comment marker", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gallery-api-"));
    const app = createLocalApp({ dataDir: dir, dbPath: join(dir, "gallery.db") });
    const jpeg = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 180, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const marked = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xfe, 0x00, 0x08]), Buffer.from("NOTEME"), jpeg.subarray(2)]);
    const form = new FormData();
    form.set("file", new File([marked], "warm.jpg", { type: "image/jpeg" }));
    const imported = await app.request("/api/import", { method: "POST", body: form });
    expect(imported.status).toBe(200);
    const body = (await imported.json()) as { record: { id: string } };
    const queried = await app.request("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selection: { type: "all" }, facets: {} }),
    });
    const library = (await queried.json()) as { total: number };
    expect(library.total).toBe(1);
    const exported = await app.request("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageIds: [body.record.id], platform: "instagram", keepExif: false }),
    });
    expect(exported.status).toBe(200);
    const unzipped = unzipSync(new Uint8Array(await exported.arrayBuffer()));
    const file = Object.values(unzipped)[0];
    expect(file).toBeTruthy();
    expect(Buffer.from(file ?? []).includes(Buffer.from("NOTEME"))).toBe(false);
    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
  });

  it("lists and creates a collection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gallery-collections-"));
    const app = createLocalApp({ dataDir: dir, dbPath: join(dir, "gallery.db") });
    const created = await app.request("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "summer", name: "Summer", image_ids: ["img-1"] }),
    });
    expect(created.status).toBe(200);
    const listed = await app.request("/api/collections");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      collections: [{ id: "summer", name: "Summer", image_ids: ["img-1"] }],
    });
  });

  it("rejects a token-gated request", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gallery-auth-"));
    const app = createLocalApp({ dataDir: dir, dbPath: join(dir, "gallery.db"), auth: { mode: "token", token: "secret" } });
    const denied = await app.request("/api/queue");
    expect(denied.status).toBe(401);
    const allowed = await app.request("/api/queue", { headers: { authorization: "Bearer secret" } });
    expect(allowed.status).toBe(200);
  });
});

describe("cloud worker", () => {
  it("serves health and requires access", async () => {
    const health = await worker.fetch(new Request("https://gallery.test/api/health"), {});
    expect(health.status).toBe(200);
    const denied = await worker.fetch(new Request("https://gallery.test/api/query"), {});
    expect(denied.status).toBe(401);
    const missing = await worker.fetch(new Request("https://gallery.test/api/query", { headers: { "cf-access-jwt-assertion": "jwt" } }), {});
    expect(missing.status).toBe(401);
  });

  it("accepts a signed access jwt and rejects a tampered one", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const jwk: JsonWebKey & { kid?: string } = await crypto.subtle.exportKey("jwk", pair.publicKey);
    jwk.kid = "k1";
    jwk.alg = "RS256";
    const header = base64Url(JSON.stringify({ alg: "RS256", kid: "k1" }));
    const payload = base64Url(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 60,
        aud: "gallery",
        iss: "https://team.cloudflareaccess.com",
      }),
    );
    const signed = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
    const token = `${header}.${payload}.${base64Url(signed)}`;
    const auth = {
      mode: "access" as const,
      teamDomain: "team.cloudflareaccess.com",
      aud: "gallery",
      certs: async () => ({ keys: [jwk] }),
    };
    expect(await rejectUnauthenticated(new Headers({ "cf-access-jwt-assertion": token }), auth)).toBeNull();
    const tampered = await rejectUnauthenticated(new Headers({ "cf-access-jwt-assertion": `${token}x` }), auth);
    expect(tampered?.status).toBe(401);
  });
});

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
