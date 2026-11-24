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

    for (const zipPath of zips) {
      console.log(`zip ${zipPath}`);
      for (const entry of iterateTakeoutZip(zipPath)) {
        if (imported + failed + skipped >= limit) break;
        try {
          const used = await store.usedBytes();
          const prepared = await prepareStill(
            Buffer.from(entry.bytes),
            { sourceType: "google_photos", sourceRef: entry.sourceRef, takenAt: entry.takenAt },
            { workingPx: workingCopyPx(used, settings.storage_cap_bytes) },
          );
          const id = crypto.randomUUID();
          const filePath = `working/${prepared.partial.hash}.jpg`;
          const thumbPath = `thumbs/${prepared.partial.hash}.jpg`;
          await objects.put(filePath, prepared.working, "image/jpeg");
          await objects.put(thumbPath, prepared.thumbnail, "image/jpeg");
          const record = finishRecord(prepared.partial, id, filePath, thumbPath);
          const committed = await commitRecord(store, record);
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
          console.error(`fail ${entry.filename}: ${error instanceof Error ? error.message : error}`);
        }
      }
      if (imported + failed + skipped >= limit) break;
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
  const queue = [];
  for (const record of records) {
    const working = await objects.get(record.file_path);
    if (!working) continue;
    queue.push({ imageId: record.id, hash: record.hash, photo: await encodeJev(Buffer.from(working)), privacy: false });
  }
  const estimate = estimateSpendUsd(queue.length, settings.mean_input_tokens, settings.price_per_million_input_tokens);
  console.log(`tagging ${queue.length} photos (~$${estimate.toFixed(3)} at mean tokens)`);
  const summary = await runTagQueue(queue, {
    store,
    client: createTypeSafeVision({ apiKey, model: settings.model_version }),
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
  writeFileSync(join(dataDir, "last-tag-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`tag done ${JSON.stringify(summary)}`);
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
