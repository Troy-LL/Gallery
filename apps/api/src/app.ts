import { zipSync } from "fflate";
import { Hono } from "hono";
import { compress } from "hono/compress";
import {
  acceptUpload,
  answersToChips,
  collectionSchema,
  curationPatchSchema,
  formatSpend,
  groupNearDuplicates,
  keywordChips,
  knn,
  libraryQuerySchema,
  needsReview,
  paletteSchema,
  toLibrarySummary,
  type FilterChip,
  type LibraryRecord,
  type PlatformConfig,
  type Settings,
} from "@gallery/core";
import type { LibraryStore, ObjectStore } from "@gallery/storage";
import { rejectUnauthenticated, type AuthEnv } from "./auth.js";

export type AppDeps = {
  store: LibraryStore;
  objects: ObjectStore;
  auth: AuthEnv;
  settings: Settings;
  platforms: PlatformConfig[];
  importBytes?: (bytes: Uint8Array, filename: string) => Promise<LibraryRecord>;
  exportBytes?: (bytes: Uint8Array, width: number, keepExif: boolean) => Promise<Uint8Array>;
  seed?: (count: number) => Promise<number>;
  nl?: (text: string) => Promise<FilterChip[]>;
  tag?: (ids: string[]) => Promise<{ tagged: number; paused: boolean }>;
  pickerStart?: () => string;
};

const EXPORT_CONCURRENCY = 4;

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use("/api/*", compress());
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/health") return next();
    const denied = await rejectUnauthenticated(c.req.raw.headers, deps.auth);
    if (denied) return denied;
    await next();
  });
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/platforms", (c) => c.json({ platforms: deps.platforms }));
  app.post("/api/query", async (c) => {
    const query = libraryQuerySchema.parse(await c.req.json());
    const result = await deps.store.query(query);
    return c.json({ ...result, records: result.records.map(toLibrarySummary) });
  });
  app.get("/api/images/:id", async (c) => {
    const record = await deps.store.get(c.req.param("id"));
    if (!record) return c.json({ error: "missing image" }, 404);
    return c.json({ record: publish(record) });
  });
  app.get("/api/media/:id", async (c) => {
    const media = await deps.store.getMedia(c.req.param("id"));
    if (!media) return c.json({ error: "missing image" }, 404);
    const kind = c.req.query("kind") === "working" ? "working" : "thumb";
    const etag = `"${media.hash}-${kind}"`;
    const cacheHeaders = { etag, "cache-control": "private, max-age=31536000, immutable" };
    if (etagMatches(c.req.header("if-none-match"), etag)) return new Response(null, { status: 304, headers: cacheHeaders });
    const bytes = await deps.objects.get(kind === "working" ? media.file_path : media.thumbnail_path);
    if (!bytes) return c.json({ error: "missing bytes" }, 404);
    return new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: { ...cacheHeaders, "content-type": "image/jpeg", "content-length": String(bytes.byteLength) },
    });
  });
  app.post("/api/import", async (c) => {
    if (!deps.importBytes) return c.json({ error: "import runs on the desktop importer" }, 501);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const used = await deps.store.usedBytes();
    if (!acceptUpload(used, bytes.byteLength, deps.settings.storage_cap_bytes)) {
      return c.json({ error: "storage cap" }, 413);
    }
    const record = await deps.importBytes(bytes, file.name);
    return c.json({ record: publish(record) });
  });
  app.post("/api/export", async (c) => {
    const body = (await c.req.json()) as { imageIds?: string[]; platform?: string; keepExif?: boolean };
    const imageIds = body.imageIds ?? [];
    const platform = body.platform ?? "instagram";
    const config = deps.platforms.find((item) => item.id === platform);
    if (!config) return c.json({ error: "unknown platform" }, 400);
    if (body.keepExif && !deps.exportBytes) return c.json({ error: "keeping exif runs on the desktop importer" }, 501);
    const encoded = await mapLimit(imageIds, EXPORT_CONCURRENCY, async (id) => {
      const media = await deps.store.getMedia(id);
      if (!media) return null;
      const stored = await deps.objects.get(media.file_path);
      if (!stored) return null;
      return deps.exportBytes ? deps.exportBytes(stored, config.export_px, body.keepExif === true) : stored;
    });
    const files: Record<string, Uint8Array> = {};
    const kept: string[] = [];
    for (const [index, id] of imageIds.entries()) {
      const bytes = encoded[index];
      if (!bytes) continue;
      files[`${platform}/${String(index + 1).padStart(2, "0")}.jpg`] = bytes;
      kept.push(id);
    }
    if (kept.length === 0) return c.json({ error: "no images" }, 400);
    await deps.store.createPost({
      id: crypto.randomUUID(),
      platform: config.id,
      posted_at: new Date().toISOString(),
      image_ids: kept,
      caption_notes: null,
    });
    const zipped = zipSync(files, { level: 0 });
    return new Response(zipped as Uint8Array<ArrayBuffer>, {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${platform}.zip"` },
    });
  });
  app.post("/api/curation", async (c) => {
    const body = (await c.req.json()) as { id?: string; patch?: unknown };
    if (!body.id) return c.json({ error: "id is required" }, 400);
    const patch = curationPatchSchema.parse(body.patch ?? {});
    const record = await deps.store.updateCuration(body.id, patch);
    return c.json({ record: publish(record) });
  });
  app.get("/api/palettes", async (c) => c.json({ palettes: await deps.store.listPalettes() }));
  app.post("/api/palettes", async (c) => {
    const palette = paletteSchema.parse(await c.req.json());
    await deps.store.createPalette(palette);
    return c.json({ ok: true });
  });
  app.get("/api/posts", async (c) => c.json({ posts: await deps.store.listPosts() }));
  app.get("/api/collections", async (c) => c.json({ collections: await deps.store.listCollections() }));
  app.post("/api/collections", async (c) => {
    const collection = collectionSchema.parse(await c.req.json());
    await deps.store.createCollection(collection);
    return c.json({ ok: true });
  });
  app.get("/api/queue", async (c) => c.json(await deps.store.queueState()));
  app.post("/api/estimate", async (c) => {
    const body = (await c.req.json()) as { count?: number };
    const count = body.count ?? 0;
    const usd = (count * deps.settings.mean_input_tokens * deps.settings.price_per_million_input_tokens) / 1_000_000;
    return c.json({ images: count, usd, label: formatSpend(count, usd) });
  });
  app.post("/api/dev/seed", async (c) => {
    if (!deps.seed) return c.json({ error: "seed is disabled" }, 404);
    const body = (await c.req.json()) as { count?: number };
    const count = Math.max(1, Math.min(500, body.count ?? 24));
    return c.json({ seeded: await deps.seed(count) });
  });
  app.post("/api/nl", async (c) => {
    const body = (await c.req.json()) as { text?: string };
    const text = body.text ?? "";
    const chips = deps.nl ? await deps.nl(text) : keywordChips(text);
    return c.json({ chips });
  });
  app.get("/api/similar/:id", async (c) => {
    const id = c.req.param("id");
    const rows = await deps.store.listEmbeddings();
    const target = rows.find((row) => row.id === id);
    if (!target) return c.json({ matches: [] });
    return c.json({ matches: knn(target.embedding, rows.filter((row) => row.id !== id), 8) });
  });
  app.get("/api/duplicates", async (c) => c.json({ groups: groupNearDuplicates(await deps.store.listDedupeInputs()) }));
  app.get("/api/review", async (c) => {
    const records = (await deps.store.list()).filter(needsReview).map(publish);
    return c.json({ records });
  });
  app.post("/api/report-tag", async (c) => {
    const body = await c.req.json();
    deps.store.appendWrongTag(body);
    return c.json({ ok: true });
  });
  app.get("/api/export/json", async (c) => c.json(await deps.store.exportJson()));
  app.get("/api/export/csv", async (c) => c.text(await deps.store.exportCsv()));
  app.post("/api/queue/run", async (c) => {
    if (!deps.tag) return c.json({ error: "tagging is not configured" }, 404);
    const body = (await c.req.json()) as { ids?: string[] };
    return c.json(await deps.tag(body.ids ?? []));
  });
  app.get("/api/picker/start", (c) => {
    if (!deps.pickerStart) return c.json({ error: "picker is not configured" }, 404);
    return c.json({ url: deps.pickerStart() });
  });
  app.post("/api/nl/answers", async (c) => {
    const body = (await c.req.json()) as { answers?: Parameters<typeof answersToChips>[0] };
    return c.json({ chips: answersToChips(body.answers ?? []) });
  });
  return app;
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const trimmed = tag.trim();
    return trimmed === "*" || trimmed.replace(/^W\//, "") === etag;
  });
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const drain = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, drain));
  return results;
}

function publish(record: LibraryRecord): Omit<LibraryRecord, "embedding"> {
  const { embedding: _embedding, ...rest } = record;
  return rest;
}
