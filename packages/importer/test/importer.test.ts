import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseSettings, syntheticRecord, vocabularyFileSchema } from "@gallery/core";
import { createStore, openSqlite } from "@gallery/storage";
import {
  analyzeImage,
  assertSmokeFloor,
  buildQuestions,
  commitRecord,
  encodeExport,
  finishRecord,
  googleAuthUrl,
  isBaselineJpeg,
  prepareStill,
  readTakeout,
  runPickerDownload,
  runSmoke,
  runTagQueue,
  scoreGold,
  sidecarDocument,
  targetJevSize,
  fittedJevPixels,
  tickImporter,
  withStatusRetry,
  RetryableStatus,
  embedWithOnnx,
} from "@gallery/importer";

const vocab = vocabularyFileSchema.parse(JSON.parse(readFileSync("prompts/v1/vocabulary.json", "utf8")));
const settings = parseSettings(JSON.parse(readFileSync("config/settings.example.json", "utf8")));

describe("image prep", () => {
  it("clamps extreme sizes into the jev window", () => {
    expect(fittedJevPixels(targetJevSize(10, 10))).toEqual({ width: 280, height: 280 });
    const wide = fittedJevPixels(targetJevSize(10_000, 200));
    expect(wide.width).toBeGreaterThanOrEqual(280);
    expect(wide.width).toBeLessThanOrEqual(1568);
    expect(wide.height).toBeGreaterThanOrEqual(280);
    expect(wide.height).toBeLessThanOrEqual(1568);
    expect(wide.width * wide.height).toBeLessThanOrEqual(2_460_000);
  });

  it("writes an upright baseline working copy and a stable hash", async () => {
    const progressive = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 220, g: 30, b: 40 } },
    })
      .jpeg({ progressive: true })
      .toBuffer();
    expect(isBaselineJpeg(progressive)).toBe(false);
    const first = await prepareStill(progressive, { sourceType: "upload", sourceRef: null, addedAt: "2026-01-01T00:00:00.000Z" });
    const second = await prepareStill(progressive, { sourceType: "upload", sourceRef: null, addedAt: "2026-01-01T00:00:00.000Z" });
    expect(first.partial.hash).toBe(second.partial.hash);
    expect(isBaselineJpeg(first.jev)).toBe(true);
    const meta = await sharp(first.jev).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(280);
    expect(meta.height).toBeGreaterThanOrEqual(280);
    expect(meta.width).toBeLessThanOrEqual(1568);
    expect(meta.height).toBeLessThanOrEqual(1568);
    const weight = first.partial.palette.reduce((sum, swatch) => sum + swatch.weight, 0);
    expect(weight).toBeCloseTo(1, 5);
    const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer();
    const preparedTiny = await prepareStill(tiny, { sourceType: "upload", sourceRef: null });
    const tinyMeta = await sharp(preparedTiny.jev).metadata();
    expect(tinyMeta.width).toBeGreaterThanOrEqual(280);
    expect(tinyMeta.height).toBeGreaterThanOrEqual(280);
  });

  it("strips a description marker unless keepExif is set", async () => {
    const marked = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 20, b: 200 } },
    })
      .jpeg()
      .toBuffer();
    const withNote = Buffer.concat([marked.subarray(0, 2), Buffer.from([0xff, 0xfe, 0x00, 0x08]), Buffer.from("NOTEME"), marked.subarray(2)]);
    const stripped = await encodeExport(withNote, { keepExif: false, width: 64 });
    const kept = await encodeExport(marked, { keepExif: true, width: 64 });
    expect(stripped.includes(Buffer.from("NOTEME"))).toBe(false);
    expect(isBaselineJpeg(stripped)).toBe(true);
    expect(isBaselineJpeg(kept)).toBe(true);
  });
});

describe("vision and eval", () => {
  it("drops a subject box when the subject is not visible and pins the model", async () => {
    expect(() => buildQuestions(vocab, false)).not.toThrow();
    const reversed = buildQuestions(vocab, true);
    const forward = buildQuestions(vocab, false);
    const forwardLabels = Object.keys(forward.time_of_day?.criteria ?? {});
    const reversedLabels = Object.keys(reversed.time_of_day?.criteria ?? {});
    expect(reversedLabels[0]).toBe(forwardLabels.at(-1));
    const photo = new Uint8Array([9, 9, 9]);
    const analyzed = await analyzeImage({
      client: {
        async systemOne(request) {
          expect(request.model).toBe("jev-1.14.0");
          expect(request.state).toMatchObject({ photo });
          return {
            model: "jev-1.14.0",
            usage: { input_tokens: 12, output_tokens: 1 },
            answers: {
              subject_visible: { type: "noul", noul: 0.2 },
              subject_box: { type: "box", box: { top: 0.1, bottom: 0.2, left: 0.1, right: 0.2 }, confidence: 0.4 },
              has_text: { type: "noul", noul: 0.1 },
            },
          };
        },
      },
      model: "jev-1.14.0",
      vocab,
      photo,
      examples: [photo, photo, photo, photo, photo, photo, photo, photo],
    });
    expect(analyzed.state.examples).toHaveLength(5);
    expect(analyzed.analysis.subject_box).toBeNull();
    expect(analyzed.rawSubjectBox).not.toBeNull();
  });

  it("scores a gold pair and refuses a short live manifest", () => {
    expect(() => assertSmokeFloor(49, false)).toThrow(/50/);
    expect(() => assertSmokeFloor(1, true)).not.toThrow();
    const report = scoreGold(
      [{ id: "gold-1", labels: { has_text: false }, subject_box: { top: 0, bottom: 1, left: 0, right: 1 } }],
      [
        {
          id: "gold-1",
          answers: [{ question_id: "has_text", type: "noul", value: false, probability: 0.1 }],
          secondPass: [],
          rawSubjectBox: { top: 0, bottom: 1, left: 0, right: 1, confidence: 1 },
          keptSubjectBox: { top: 0, bottom: 1, left: 0, right: 1, confidence: 1 },
          inputTokens: 100,
          latencyMs: 20,
        },
      ],
      "jev-1.14.0",
      "v1",
    );
    expect(report["gallery_eval.tag_f1"].macro).toBe(1);
    expect(report["gallery_eval.subject_box_iou"].mean).toBe(1);
    expect(report["gallery_eval.input_tokens_mean"]).toBe(100);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("sk-");
  });

  it("runs the mock smoke manifest", async () => {
    const report = await runSmoke({
      manifest: JSON.parse(readFileSync("evals/gold-manifest.example.json", "utf8")),
      vocab,
      mock: true,
      client: {
        async systemOne() {
          return {
            model: "jev-1.14.0",
            usage: { input_tokens: 80, output_tokens: 4 },
            answers: {
              time_of_day: { type: "choice", choice: "daylight", confidence: 0.9, probabilities: { daylight: 0.9 } },
              has_text: { type: "noul", noul: 0.1 },
              subject_visible: { type: "noul", noul: 0.95 },
              subject_box: { type: "box", box: { top: 0.1, bottom: 0.6, left: 0.2, right: 0.7 }, confidence: 0.8 },
            },
          };
        },
      },
    });
    expect(report.n).toBe(1);
    expect(report["gallery_eval.tag_f1"].macro).toBeGreaterThan(0.9);
  });
});

describe("queue, picker, daemon", () => {
  it("retries 429s and pauses at the cap", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const value = await withStatusRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new RetryableStatus(429);
        return "ok";
      },
      { retries: 2, baseMs: 10, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(value).toBe("ok");
    expect(sleeps).toEqual([10, 20]);
    const store = createStore(openSqlite(":memory:"));
    const record = syntheticRecord(8);
    await store.upsert(record);
    const summary = await runTagQueue([{ imageId: record.id, hash: record.hash, photo: new Uint8Array([1]), privacy: false }], {
      store,
      settings: { ...settings, monthly_cap_usd: 0 },
      vocab,
      now: new Date("2026-03-01T00:00:00.000Z"),
      sleep: async () => undefined,
      client: { async systemOne() { throw new Error("should not spend"); } },
    });
    expect(summary.paused).toBe(true);
    expect((await store.queueState()).paused).toBe(true);
  });

  it("uses the tag cache and upgrades a sharper takeout twin", async () => {
    const store = createStore(openSqlite(":memory:"));
    const original = syntheticRecord(9, { file_size: 100, taken_at: "2020-01-01T00:00:00.000Z", phash: "0000000000000000" });
    await store.upsert(original);
    await store.putTagCache(original.hash, settings.model_version, settings.vocab_version, {
      image_id: original.id,
      model_version: settings.model_version,
      analyzed_at: "2026-01-01T00:00:00.000Z",
      vocab_version: "v1",
      answers: [],
      has_text: false,
      subject_box: null,
      locked_fields: [],
      needs_tags: false,
    });
    let calls = 0;
    const cached = await runTagQueue([{ imageId: original.id, hash: original.hash, photo: new Uint8Array([1]), privacy: false }], {
      store,
      settings,
      vocab,
      now: new Date("2026-03-01T00:00:00.000Z"),
      sleep: async () => undefined,
      client: { async systemOne() { calls += 1; throw new Error("cache miss"); } },
    });
    expect(cached.cached).toBe(1);
    expect(calls).toBe(0);
    const incoming = syntheticRecord(10, {
      id: "newer",
      hash: "hash-newer",
      file_size: 500,
      taken_at: original.taken_at,
      phash: original.phash,
      source_ref: "takeout-1",
      source_type: "google_photos",
    });
    const committed = await commitRecord(store, incoming);
    expect(committed.action).toBe("upgraded");
    expect(committed.record.id).toBe(original.id);
    expect(committed.record.source_ref).toBe("takeout-1");
    expect(committed.record.file_size).toBe(500);
  });

  it("downloads a picker selection and deletes the session", async () => {
    const calls: string[] = [];
    const jpeg = new Uint8Array([1, 2, 3, 4]);
    const result = await runPickerDownload(
      async (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/sessions") && init?.method === "POST") {
          return json({ id: "s1", pickerUri: "https://photos.google.com/picker/s1" });
        }
        if (url.endsWith("/sessions/s1") && init?.method !== "DELETE") return json({ mediaItemsSet: true });
        if (url.includes("/mediaItems")) {
          return json({ mediaItems: [{ id: "m1", mediaFile: { baseUrl: "https://download.example/m1", filename: "a.jpg" } }] });
        }
        if (url.endsWith("/m1")) return new Response(jpeg);
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        return new Response("no", { status: 404 });
      },
      { accessToken: "token", apiBase: "https://picker.test/v1" },
    );
    expect(result.files[0]?.bytes).toEqual(jpeg);
    expect(calls.some((call) => call.startsWith("DELETE"))).toBe(true);
    expect(googleAuthUrl({ clientId: "cid", redirectUri: "http://127.0.0.1/cb", state: "s" })).toContain("photospicker.mediaitems.readonly");
  });

  it("reads a takeout zip and stands the second daemon down", async () => {
    const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).jpeg().toBuffer();
    const zipped = zipSync({
      "Takeout/IMG.jpg": jpeg,
      "Takeout/IMG.jpg.json": strToU8(JSON.stringify({ title: "IMG.jpg", photoTakenTime: { timestamp: "1600000000" } })),
    });
    const entries = readTakeout(zipped);
    expect(entries[0]?.sourceRef).toBe("IMG.jpg");
    expect(entries[0]?.takenAt).toBe("2020-09-13T12:26:40.000Z");
    const store = createStore(openSqlite(":memory:"));
    const dir = mkdtempSync(join(tmpdir(), "gallery-inbox-"));
    writeFileSync(join(dir, "a.jpg"), jpeg);
    writeFileSync(join(dir, "clip.mov"), Buffer.from("video"));
    const tick = await tickImporter({
      store,
      holder: "mac",
      now: 5_000,
      ttlMs: 10_000,
      inboxDir: dir,
      importFile: async (bytes) => {
        const prepared = await prepareStill(Buffer.from(bytes), { sourceType: "inbox", sourceRef: null });
        const record = finishRecord(prepared.partial, crypto.randomUUID(), "working/a.jpg", "thumbs/a.jpg");
        await commitRecord(store, record);
      },
    });
    expect(tick.stoodDown).toBe(false);
    expect(tick.imported).toBe(1);
    expect(() => readFileSync(join(dir, "a.jpg"))).toThrow();
    await store.acquireLease("other", 6_000, 10_000);
    const blocked = await tickImporter({
      store,
      holder: "windows",
      now: 6_100,
      ttlMs: 10_000,
      importFile: async () => undefined,
    });
    expect(blocked.stoodDown).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    const doc = sidecarDocument(syntheticRecord(1, { status: "approved", rating: 1 }));
    expect(doc.xmp).toContain('gallery:status="approved"');
    expect(doc.json).not.toContain("TYPESAFE");
    await expect(embedWithOnnx("", new Uint8Array())).rejects.toThrow(/CLIP model path/);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}
