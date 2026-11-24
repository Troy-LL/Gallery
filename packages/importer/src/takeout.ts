import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";

export type TakeoutEntry = {
  filename: string;
  bytes: Uint8Array;
  takenAt: string | null;
  sourceRef: string;
};

type TakeoutMeta = { title?: string; photoTakenTime?: { timestamp?: string } };

const STILL = /\.(jpe?g|png|webp|heic)$/i;
const META_SUFFIX = ".supplemental-metadata.json";

export function readTakeout(bytes: Uint8Array): TakeoutEntry[] {
  return entriesFromMap(unzipSync(bytes));
}

export function* iterateTakeoutZip(zipPath: string): Generator<TakeoutEntry> {
  const names = listZipEntries(zipPath);
  const jsonByKey = new Map<string, TakeoutMeta>();
  for (const name of names) {
    const key = metaKey(name);
    if (!key) continue;
    try {
      jsonByKey.set(key, JSON.parse(extractZipEntry(zipPath, name).toString("utf8")) as TakeoutMeta);
    } catch {
      continue;
    }
  }
  for (const name of names) {
    if (!STILL.test(name)) continue;
    const meta = jsonByKey.get(imageKey(name));
    yield {
      filename: name,
      bytes: new Uint8Array(extractZipEntry(zipPath, name)),
      takenAt: takenAtFrom(meta),
      sourceRef: meta?.title ?? imageKey(name),
    };
  }
}

export function listTakeoutZips(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".zip"))
    .map((name) => join(directory, name))
    .sort();
}

function entriesFromMap(files: Record<string, Uint8Array>): TakeoutEntry[] {
  const jsonByKey = new Map<string, TakeoutMeta>();
  for (const [name, content] of Object.entries(files)) {
    const key = metaKey(name);
    if (!key) continue;
    try {
      jsonByKey.set(key, JSON.parse(strFromU8(content)) as TakeoutMeta);
    } catch {
      continue;
    }
  }
  const images: TakeoutEntry[] = [];
  for (const [name, content] of Object.entries(files)) {
    if (!STILL.test(name)) continue;
    const meta = jsonByKey.get(imageKey(name));
    images.push({
      filename: name,
      bytes: content,
      takenAt: takenAtFrom(meta),
      sourceRef: meta?.title ?? imageKey(name),
    });
  }
  return images;
}

function metaKey(name: string): string | null {
  const base = basename(name);
  if (base.endsWith(META_SUFFIX)) return base.slice(0, -META_SUFFIX.length);
  if (base.endsWith(".json") && STILL.test(base.slice(0, -".json".length))) return base.slice(0, -".json".length);
  return null;
}

function imageKey(name: string): string {
  return basename(name);
}

function basename(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

function takenAtFrom(meta: TakeoutMeta | undefined): string | null {
  const stamp = meta?.photoTakenTime?.timestamp;
  if (!stamp || !Number.isFinite(Number(stamp))) return null;
  return new Date(Number(stamp) * 1000).toISOString();
}

function listZipEntries(zipPath: string): string[] {
  const listed = execFileSync("zipinfo", ["-1", zipPath], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return listed.split("\n").filter((name) => name.length > 0 && !name.endsWith("/"));
}

function extractZipEntry(zipPath: string, entry: string): Buffer {
  return execFileSync("unzip", ["-p", zipPath, entry], { maxBuffer: 120 * 1024 * 1024 });
}
