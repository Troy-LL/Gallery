import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchLibrary, percentile, syntheticRecord } from "@gallery/core";
import { createFsStore, createMemoryStore, createPostgresDb, createR2Store, createStore, openSqlite, planR2Request, r2Endpoint } from "@gallery/storage";

describe("sqlite library", () => {
  it("skips a duplicate hash, keeps locked tags, and exports", async () => {
    const store = createStore(openSqlite(":memory:"));
    const first = syntheticRecord(1);
    expect((await store.upsert(first)).status).toBe("inserted");
    expect((await store.upsert({ ...first, id: "other" })).status).toBe("duplicate");
    await store.updateCuration(first.id, {
      answer: { question_id: "time_of_day", type: "choice", value: "night", confidence: 1 },
      dominant_hex: "#abcdef",
    });
    const saved = await store.saveAnalysis(first.id, {
      image_id: first.id,
      model_version: "jev-1.14.0",
      analyzed_at: "2026-02-01T00:00:00.000Z",
      vocab_version: "v1",
      answers: [{ question_id: "time_of_day", type: "choice", value: "daylight", confidence: 0.2 }],
      has_text: false,
      subject_box: null,
      locked_fields: [],
      needs_tags: false,
    });
    expect(saved.answers[0]?.value).toBe("night");
    expect(saved.dominant_hex).toBe("#abcdef");
    const exported = await store.exportJson();
    expect(exported.images).toHaveLength(1);
    expect(await store.exportCsv()).toContain(first.id);
  });

  it("skips a row whose body is not a record", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gallery-store-"));
    const path = join(dir, "gallery.db");
    const store = createStore(openSqlite(path));
    const first = syntheticRecord(1);
    await store.upsert(first);
    const raw = openSqlite(path);
    await raw.run(
      `INSERT INTO images (id, hash, source_ref, taken_at, phash, file_size, orientation, dominant_h, dominant_l, peak_c, is_monochrome, body)
       SELECT 'bad-row', hash || '-x', NULL, taken_at, phash, file_size, orientation, dominant_h, dominant_l, peak_c, is_monochrome, '1' FROM images LIMIT 1`,
    );
    const result = await store.query({ selection: { type: "all" }, facets: {} });
    expect(result.records.map((record) => record.id)).toEqual([first.id]);
    expect(result.total).toBe(2);
  });

  it("reads media keys, embeddings, and dedupe inputs without full records", async () => {
    const store = createStore(openSqlite(":memory:"));
    const first = { ...syntheticRecord(1), embedding: [0.25, -0.5, 1] };
    const second = syntheticRecord(2);
    await store.upsert(first);
    await store.upsert(second);
    expect(await store.getMedia(first.id)).toEqual({ hash: first.hash, file_path: first.file_path, thumbnail_path: first.thumbnail_path });
    expect(await store.getMedia("missing")).toBeNull();
    expect(await store.listEmbeddings()).toEqual([{ id: first.id, embedding: [0.25, -0.5, 1] }]);
    expect(await store.listDedupeInputs()).toEqual(
      [first, second]
        .map((record) => ({ id: record.id, phash: record.phash, sharpness: record.sharpness, luminance: record.avg_luminance }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("backfills media columns for rows written before they existed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gallery-backfill-"));
    const path = join(dir, "gallery.db");
    const record = syntheticRecord(3);
    await createStore(openSqlite(path)).upsert(record);
    const raw = openSqlite(path);
    await raw.run("UPDATE images SET file_path = NULL, thumbnail_path = NULL, sharpness = NULL, avg_luminance = NULL, embedding = NULL");
    const reopened = createStore(openSqlite(path));
    expect(await reopened.getMedia(record.id)).toEqual({ hash: record.hash, file_path: record.file_path, thumbnail_path: record.thumbnail_path });
    expect((await reopened.listDedupeInputs()).map((row) => row.id)).toEqual([record.id]);
  });

  it("counts every image of a post in one batch and filters a large id selection", async () => {
    const store = createStore(openSqlite(":memory:"));
    const records = Array.from({ length: 3 }, (_, index) => syntheticRecord(index));
    for (const record of records) await store.upsert(record);
    const [a, b] = records;
    if (!a || !b) throw new Error("missing synthetic records");
    await store.createPost({
      id: "post-1",
      platform: "instagram",
      posted_at: "2026-03-01T00:00:00.000Z",
      image_ids: [a.id, b.id, a.id, "missing"],
      caption_notes: null,
    });
    expect((await store.get(a.id))?.used_count).toBe(a.used_count + 2);
    expect((await store.get(b.id))?.last_used_at).toBe("2026-03-01T00:00:00.000Z");
    const ids = [a.id, ...Array.from({ length: 700 }, (_, index) => `absent-${index}`)];
    const result = await store.query({ selection: { type: "ids", ids }, facets: {} });
    expect(result.records.map((record) => record.id)).toEqual([a.id]);
  });

  it("gives the lease to one holder at a time", async () => {
    const store = createStore(openSqlite(":memory:"));
    expect(await store.acquireLease("a", 1_000, 500)).toBe(true);
    expect(await store.acquireLease("b", 1_200, 500)).toBe(false);
    expect(await store.acquireLease("b", 1_600, 500)).toBe(true);
  });

  it("answers 5,000 polar queries under 40 ms", async () => {
    const records = Array.from({ length: 5_000 }, (_, index) => syntheticRecord(index));
    const samples: number[] = [];
    for (let index = 0; index < 40; index += 1) {
      const started = performance.now();
      matchLibrary(records, {
        selection: { type: "wedge", startHue: 350, endHue: 15 },
        facets: { orientation: ["landscape"] },
      });
      samples.push(performance.now() - started);
    }
    expect(percentile(samples.slice(5), 95)).toBeLessThan(40);
    const store = createStore(openSqlite(":memory:"));
    for (const record of records.slice(0, 200)) await store.upsert(record);
    await store.query({ selection: { type: "all" }, facets: {} });
    const started = performance.now();
    const result = await store.query({ selection: { type: "all" }, facets: { orientation: ["portrait"] } });
    expect(performance.now() - started).toBeLessThan(100);
    expect(result.total).toBe(200);
    const wedge = {
      selection: { type: "wedge" as const, startHue: 350, endHue: 15 },
      facets: { orientation: ["landscape" as const] },
    };
    const filtered = await store.query(wedge);
    const expected = matchLibrary(records.slice(0, 200), wedge);
    expect(filtered.records.map((record) => record.id).sort()).toEqual(expected.map((record) => record.id).sort());
  });
});

describe("postgres and objects", () => {
  it("runs the same insert and lock flow on pglite", { timeout: 30_000 }, async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    const store = createStore(
      createPostgresDb(async (sql, params) => {
        const result = await pg.query(sql, params);
        return result.rows as Record<string, unknown>[];
      }),
    );
    const record = syntheticRecord(4);
    expect((await store.upsert(record)).status).toBe("inserted");
    expect((await store.get(record.id))?.hash).toBe(record.hash);
    expect(await store.getMedia(record.id)).toEqual({ hash: record.hash, file_path: record.file_path, thumbnail_path: record.thumbnail_path });
  });

  it("stores bytes and signs an r2 request", async () => {
    const memory = createMemoryStore();
    await memory.put("a.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(await memory.size()).toBe(3);
    const dir = mkdtempSync(join(tmpdir(), "gallery-fs-"));
    const disk = createFsStore(dir);
    await disk.put("nested/a.jpg", new Uint8Array([4, 5]), "image/jpeg");
    expect(await disk.get("nested/a.jpg")).toEqual(new Uint8Array([4, 5]));
    const planned = planR2Request({
      method: "PUT",
      accountId: "acct",
      bucket: "gallery",
      key: "working/a.jpg",
      accessKeyId: "key",
      secretAccessKey: "secret",
      now: new Date("2026-01-01T00:00:00.000Z"),
      payload: new Uint8Array([1]),
    });
    expect(r2Endpoint("acct")).toBe("https://acct.r2.cloudflarestorage.com");
    expect(planned.url).toContain("acct.r2.cloudflarestorage.com/gallery/working/a.jpg");
    expect(planned.headers.authorization).toContain("AWS4-HMAC-SHA256 Credential=key/20260101/auto/s3/aws4_request");
    const listed = createR2Store({
      accountId: "acct",
      bucket: "gallery",
      accessKeyId: "key",
      secretAccessKey: "secret",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      fetchImpl: async () =>
        new Response("<ListBucketResult><Contents><Size>10</Size></Contents><Contents><Size>5</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>"),
    });
    expect(await listed.size()).toBe(15);
  });
});
