import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { createHash, createHmac } from "node:crypto";

export interface ObjectStore {
  put(key: string, bytes: Uint8Array, type: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  size(): Promise<number>;
}

export function createMemoryStore(): ObjectStore {
  const objects = new Map<string, Uint8Array>();
  return {
    async put(key, bytes) {
      objects.set(key, bytes);
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async size() {
      let total = 0;
      for (const bytes of objects.values()) total += bytes.byteLength;
      return total;
    },
  };
}

export function createFsStore(root: string): ObjectStore {
  return {
    async put(key, bytes) {
      const path = contained(root, key);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    },
    async get(key) {
      const path = contained(root, key);
      try {
        const bytes = await readFile(path);
        return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      } catch {
        return null;
      }
    },
    async delete(key) {
      const path = contained(root, key);
      try {
        rmSync(path);
      } catch {
        return;
      }
    },
    async size() {
      return walk(root);
    },
  };
}

function contained(root: string, key: string): string {
  const base = resolve(root);
  const path = resolve(base, key);
  if (path !== base && !path.startsWith(base + sep)) throw new Error("object key escapes the store");
  return path;
}

function walk(directory: string): number {
  let total = 0;
  let entries: string[] = [];
  try {
    entries = readdirSync(directory);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isDirectory()) total += walk(path);
    else total += info.size;
  }
  return total;
}

export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function planR2Request(input: {
  method: "GET" | "PUT" | "DELETE";
  accountId: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
  payload: Uint8Array;
  query?: Record<string, string>;
  region?: string;
}): { url: string; headers: Record<string, string> } {
  const region = input.region ?? "auto";
  const host = `${input.accountId}.r2.cloudflarestorage.com`;
  const amzDate = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const date = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(input.payload).digest("hex");
  const canonicalUri = input.key.length === 0 ? `/${input.bucket}` : `/${input.bucket}/${input.key.split("/").map(encodeURIComponent).join("/")}`;
  const canonicalQuery = canonicalQueryString(input.query ?? {});
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [input.method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(Buffer.from(`AWS4${input.secretAccessKey}`), date), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    url: canonicalQuery.length === 0 ? `https://${host}${canonicalUri}` : `https://${host}${canonicalUri}?${canonicalQuery}`,
    headers: {
      host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

export function createR2Store(input: {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): ObjectStore {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
  return {
    async put(key, bytes, type) {
      const planned = planR2Request({ ...input, method: "PUT", key, now: now(), payload: bytes });
      const response = await fetchImpl(planned.url, { method: "PUT", headers: { ...planned.headers, "content-type": type }, body: Buffer.from(bytes) });
      if (!response.ok) throw new Error(`r2 put failed ${response.status}`);
    },
    async get(key) {
      const planned = planR2Request({ ...input, method: "GET", key, now: now(), payload: new Uint8Array() });
      const response = await fetchImpl(planned.url, { method: "GET", headers: planned.headers });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`r2 get failed ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    async delete(key) {
      const planned = planR2Request({ ...input, method: "DELETE", key, now: now(), payload: new Uint8Array() });
      const response = await fetchImpl(planned.url, { method: "DELETE", headers: planned.headers });
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`r2 delete failed ${response.status}`);
    },
    async size() {
      let total = 0;
      let token: string | undefined;
      for (let page = 0; page < 1_000; page += 1) {
        const query: Record<string, string> = { "list-type": "2" };
        if (token) query["continuation-token"] = token;
        const planned = planR2Request({ ...input, method: "GET", key: "", now: now(), payload: new Uint8Array(), query });
        const response = await fetchImpl(planned.url, { method: "GET", headers: planned.headers });
        if (!response.ok) throw new Error(`r2 list failed ${response.status}`);
        const xml = await response.text();
        for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g)) total += Number(match[1]);
        if (!xml.includes("<IsTruncated>true</IsTruncated>")) return total;
        const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        if (!next?.[1]) return total;
        token = next[1];
      }
      return total;
    },
  };
}
