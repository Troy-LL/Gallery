import { zipSync } from "fflate";
import { Hono } from "hono";
import {
  acceptUpload,
  answersToChips,
  curationPatchSchema,
  formatSpend,
  groupNearDuplicates,
  keywordChips,
  knn,
  libraryQuerySchema,
  needsReview,
  paletteSchema,
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

export function createApp(deps: AppDeps) {
  const app = new Hono();
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
    return c.json({ ...result, records: result.records.map(publish) });
  });
  app.get("/api/media/:id", async (c) => {
    const record = await deps.store.get(c.req.param("id"));
    if (!record) return c.json({ error: "missing image" }, 404);
    const kind = c.req.query("kind") === "working" ? "working" : "thumb";
    const key = kind === "working" ? record.file_path : record.thumbnail_path;
    const bytes = await deps.objects.get(key);
    if (!bytes) return c.json({ error: "missing bytes" }, 404);
    return new Response(blobOf(bytes, "image/jpeg"));
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
    const files: Record<string, Uint8Array> = {};
    const kept: string[] = [];
    for (const [index, id] of imageIds.entries()) {
      const record = await deps.store.get(id);
      if (!record) continue;
      const stored = await deps.objects.get(record.file_path);
      if (!stored) continue;
      const bytes = deps.exportBytes ? await deps.exportBytes(stored, config.export_px, body.keepExif === true) : stored;
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
    const zipped = zipSync(files);
    return new Response(blobOf(zipped, "application/zip"), {
      headers: { "content-disposition": `attachment; filename="${platform}.zip"` },
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
    const record = await deps.store.get(c.req.param("id"));
    if (!record?.embedding) return c.json({ matches: [] });
    const rows = (await deps.store.list())
      .filter((item) => item.id !== record.id && item.embedding)
      .map((item) => ({ id: item.id, embedding: item.embedding ?? [] }));
    return c.json({ matches: knn(record.embedding, rows, 8) });
  });
  app.get("/api/duplicates", async (c) => {
    const rows = (await deps.store.list()).map((record) => ({
      id: record.id,
      phash: record.phash,
      sharpness: record.sharpness,
      luminance: record.avg_luminance,
    }));
    return c.json({ groups: groupNearDuplicates(rows) });
  });
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

function blobOf(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type });
}

function publish(record: LibraryRecord): Omit<LibraryRecord, "embedding"> {
  const { embedding: _embedding, ...rest } = record;
  return rest;
}
