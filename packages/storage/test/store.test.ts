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
