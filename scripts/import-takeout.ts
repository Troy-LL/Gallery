import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateSpendUsd, parseSettings, workingCopyPx, vocabularyFileSchema } from "@gallery/core";
import {
  commitRecord,
  createTypeSafeVision,
  encodeJev,
  finishRecord,
  iterateTakeoutZip,
  listTakeoutZips,
  photoAsset,
  prepareStill,
  runTagQueue,
  writeSidecar,
} from "@gallery/importer";
import { createFsStore, createStore, openSqlite } from "@gallery/storage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, process.env.GALLERY_DATA ?? "data");
const takeoutDir = resolve(process.argv.includes("--takeout-dir") ? process.argv[process.argv.indexOf("--takeout-dir") + 1]! : join(dataDir, "takeout"));
const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : Number.POSITIVE_INFINITY;
const tag = process.argv.includes("--tag");
const tagOnly = process.argv.includes("--tag-only");
const wipe = process.argv.includes("--wipe");
const settingsPath = resolve(root, "config/settings.example.json");
const vocabPath = resolve(root, "prompts/v1/vocabulary.json");
const prepareConcurrency = 4;

async function main(): Promise<void> {
  if (wipe) wipeLibrary(dataDir);
  mkdirSync(join(dataDir, "objects", "working"), { recursive: true });
  mkdirSync(join(dataDir, "objects", "thumbs"), { recursive: true });
  mkdirSync(join(dataDir, "sidecars"), { recursive: true });
  const settings = parseSettings(JSON.parse(readFileSync(settingsPath, "utf8")));
  const vocab = vocabularyFileSchema.parse(JSON.parse(readFileSync(vocabPath, "utf8")));
  const store = createStore(openSqlite(join(dataDir, "gallery.db")));
  const objects = createFsStore(join(dataDir, "objects"));

  if (!tagOnly) {
    const zips = listTakeoutZips(takeoutDir);
    if (zips.length === 0) throw new Error(`no takeout zips in ${takeoutDir}`);

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let dispatched = 0;
    let usedBytes = await store.usedBytes();

    for (const zipPath of zips) {
      if (dispatched >= limit) break;
      console.log(`zip ${zipPath}`);
      const entries = iterateTakeoutZip(zipPath);
      const window: { filename: string; prepared: ReturnType<typeof prepareStill> }[] = [];
      const fillWindow = (): void => {
        while (window.length < prepareConcurrency && dispatched < limit) {
          const next = entries.next();
          if (next.done) return;
          const entry = next.value;
          dispatched += 1;
          const prepared = prepareStill(
            Buffer.from(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength),
            { sourceType: "google_photos", sourceRef: entry.sourceRef, takenAt: entry.takenAt },
            { workingPx: workingCopyPx(usedBytes, settings.storage_cap_bytes) },
          );
          prepared.catch(() => undefined);
          window.push({ filename: entry.filename, prepared });
        }
      };
      fillWindow();
      for (let head = window.shift(); head; head = window.shift()) {
        fillWindow();
        try {
          const prepared = await head.prepared;
          const id = crypto.randomUUID();
          const filePath = `working/${prepared.partial.hash}.jpg`;
          const thumbPath = `thumbs/${prepared.partial.hash}.jpg`;
          await objects.put(filePath, prepared.working, "image/jpeg");
          await objects.put(thumbPath, prepared.thumbnail, "image/jpeg");
          const record = finishRecord(prepared.partial, id, filePath, thumbPath);
          const committed = await commitRecord(store, record);
          if (committed.action === "inserted") usedBytes += committed.record.file_size;
          else if (committed.action === "upgraded") usedBytes = await store.usedBytes();
          if ((committed.action === "duplicate" || committed.action === "attached") && committed.record.file_path !== filePath) {
            await objects.delete(filePath);
            await objects.delete(thumbPath);
            skipped += 1;
          } else if (committed.action === "duplicate") {
            skipped += 1;
          } else {
            writeSidecar(join(dataDir, "sidecars"), committed.record);
            imported += 1;
          }
          if ((imported + skipped + failed) % 25 === 0) {
            console.log(`progress imported=${imported} skipped=${skipped} failed=${failed}`);
          }
        } catch (error) {
          failed += 1;
          console.error(`fail ${head.filename}: ${error instanceof Error ? error.message : error}`);
        }
      }
      entries.return(undefined);
    }

    console.log(`import done imported=${imported} skipped=${skipped} failed=${failed}`);
  }

  if (!tag && !tagOnly) return;
  await tagNeeds(store, objects, settings, vocab);
}

async function tagNeeds(
  store: ReturnType<typeof createStore>,
  objects: ReturnType<typeof createFsStore>,
  settings: ReturnType<typeof parseSettings>,
  vocab: ReturnType<typeof vocabularyFileSchema.parse>,
): Promise<void> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set; import finished without jev labels");
  const records = (await store.list()).filter((record) => record.needs_tags).slice(0, Number.isFinite(limit) ? limit : undefined);
  const measuredTokens = Math.max(settings.mean_input_tokens, 6615);
  const estimate = estimateSpendUsd(records.length, measuredTokens, settings.price_per_million_input_tokens);
  console.log(`tagging ${records.length} photos (~$${estimate.toFixed(3)} at ${measuredTokens} tokens/image)`);
  const client = createTypeSafeVision({ apiKey, model: settings.model_version });
  const totals = { tagged: 0, cached: 0, failed: 0, skipped: 0, paused: false };
  const batchSize = 20;
  const encodeBatch = (offset: number) =>
    Promise.all(
      records.slice(offset, offset + batchSize).map(async (record) => {
        const working = await objects.get(record.file_path);
        return working ? { imageId: record.id, hash: record.hash, photo: await encodeJev(Buffer.from(working)), privacy: false } : null;
      }),
    );
  let encoding = encodeBatch(0);
  for (let offset = 0; offset < records.length; offset += batchSize) {
    if (totals.paused) break;
    const batch = records.slice(offset, offset + batchSize);
    const encoded = await encoding;
    encoding = encodeBatch(offset + batchSize);
    encoding.catch(() => undefined);
    const queue = encoded.filter((item) => item !== null);
    totals.skipped += encoded.length - queue.length;
    const summary = await runTagQueue(queue, {
      store,
      client,
      settings,
      vocab,
      now: new Date(),
      sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
      place: photoAsset,
      writeSidecar: async (imageId) => {
        const record = await store.get(imageId);
        if (record) writeSidecar(join(dataDir, "sidecars"), record);
      },
    });
    totals.tagged += summary.tagged;
    totals.cached += summary.cached;
    totals.failed += summary.failed;
    totals.skipped += summary.skipped;
    totals.paused = summary.paused;
    console.log(`tag progress ${Math.min(offset + batch.length, records.length)}/${records.length} ${JSON.stringify(summary)}`);
    writeFileSync(join(dataDir, "last-tag-summary.json"), JSON.stringify(totals, null, 2));
  }
  console.log(`tag done ${JSON.stringify(totals)}`);
}

function wipeLibrary(dir: string): void {
  for (const rel of ["gallery.db", "objects/working", "objects/thumbs", "sidecars", "wrong-tags.jsonl", "last-tag-summary.json"]) {
    rmSync(join(dir, rel), { recursive: true, force: true });
  }
  console.log(`wiped seed library under ${dir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
