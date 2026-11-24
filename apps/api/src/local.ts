import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { parseSettings, workingCopyPx } from "@gallery/core";
import { loadPlatformConfigs } from "@gallery/core/node";
import { commitRecord, encodeExport, finishRecord, googleAuthUrl, prepareStill, writeSidecar } from "@gallery/importer";
import { createFsStore, createStore, openSqlite } from "@gallery/storage";
import { createApp, type AppDeps } from "./app.js";

export function createLocalApp(options: { dataDir: string; dbPath?: string; settingsPath?: string; auth?: AppDeps["auth"] }) {
  mkdirSync(options.dataDir, { recursive: true });
  const settings = parseSettings(JSON.parse(readFileSync(options.settingsPath ?? defaultSettingsPath(), "utf8")));
  const store = createStore(openSqlite(options.dbPath ?? join(options.dataDir, "gallery.db")), {
    wrongTagsPath: join(options.dataDir, "wrong-tags.jsonl"),
  });
  const objects = createFsStore(join(options.dataDir, "objects"));
  const platforms = loadPlatformConfigs(defaultPlatformDir());
  return createApp({
    store,
    objects,
    settings,
    platforms,
    auth: options.auth ?? { mode: "off" },
    importBytes: (bytes, filename) => importOne(store, objects, settings, options.dataDir, bytes, filename),
    exportBytes: async (bytes, width, keepExif) => encodeExport(Buffer.from(bytes), { width, keepExif }),
    seed: (count) => seedLibrary(store, objects, settings, options.dataDir, count),
    pickerStart: () =>
      googleAuthUrl({
        clientId: process.env.GOOGLE_CLIENT_ID ?? "local-client",
        redirectUri: "http://127.0.0.1:8787/api/picker/callback",
        state: "gallery",
      }),
  });
}

async function importOne(
  store: AppDeps["store"],
  objects: AppDeps["objects"],
  settings: AppDeps["settings"],
  dataDir: string,
  bytes: Uint8Array,
  filename: string,
) {
  const used = await store.usedBytes();
  const prepared = await prepareStill(Buffer.from(bytes), { sourceType: filename.includes("inbox") ? "inbox" : "upload", sourceRef: null }, {
    workingPx: workingCopyPx(used, settings.storage_cap_bytes),
  });
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
  }
  writeSidecar(join(dataDir, "sidecars"), committed.record);
  return committed.record;
}

async function seedLibrary(
  store: AppDeps["store"],
  objects: AppDeps["objects"],
  settings: AppDeps["settings"],
  dataDir: string,
  count: number,
) {
  let seeded = 0;
  for (let index = 0; index < count; index += 1) {
    const hue = (index * 47) % 360;
    const color = hslToRgb(hue, 0.65, 0.45 + (index % 5) * 0.08);
    const jpeg = await sharp({
      create: { width: 640, height: index % 2 === 0 ? 800 : 640, channels: 3, background: color },
    })
      .jpeg({ progressive: false })
      .toBuffer();
    await importOne(store, objects, settings, dataDir, jpeg, `seed-${index}.jpg`);
    seeded += 1;
  }
  return seeded;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const channel = table[Math.floor(hp) % 6] ?? [0, 0, 0];
  return { r: Math.round((channel[0] + m) * 255), g: Math.round((channel[1] + m) * 255), b: Math.round((channel[2] + m) * 255) };
}

function defaultSettingsPath(): string {
  return fileUrl(new URL("../../../config/settings.example.json", import.meta.url));
}

function defaultPlatformDir(): string {
  return fileUrl(new URL("../../../config/platforms/", import.meta.url));
}

function fileUrl(url: URL): string {
  return decodeURIComponent(url.pathname);
}
