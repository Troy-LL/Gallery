import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LibraryStore } from "@gallery/storage";
import { isIgnoredMedia } from "./pipeline/prepare.js";
import { readTakeout } from "./takeout.js";

export async function tickImporter(input: {
  store: LibraryStore;
  holder: string;
  now: number;
  ttlMs: number;
  clock?: () => number;
  inboxDir?: string;
  takeoutDir?: string;
  importFile: (bytes: Uint8Array, source: { sourceType: "inbox" | "google_photos"; sourceRef: string | null; takenAt: string | null }) => Promise<void>;
}): Promise<{ stoodDown: boolean; imported: number }> {
  const clock = input.clock ?? (() => input.now);
  const held = await input.store.acquireLease(input.holder, clock(), input.ttlMs);
  if (!held) return { stoodDown: true, imported: 0 };
  try {
    let imported = 0;
    const renew = () => input.store.acquireLease(input.holder, clock(), input.ttlMs);
    if (input.inboxDir) {
      const batch = await importInbox(input.inboxDir, input.importFile, renew);
      imported += batch.imported;
      if (batch.stoodDown) return { stoodDown: true, imported };
    }
    if (input.takeoutDir) {
      const batch = await importTakeoutDir(input.takeoutDir, input.importFile, renew);
      imported += batch.imported;
      if (batch.stoodDown) return { stoodDown: true, imported };
    }
    return { stoodDown: false, imported };
  } finally {
    await input.store.releaseLease(input.holder);
  }
}

async function importInbox(
  directory: string,
  importFile: (bytes: Uint8Array, source: { sourceType: "inbox"; sourceRef: null; takenAt: null }) => Promise<void>,
  renew: () => Promise<boolean>,
): Promise<{ imported: number; stoodDown: boolean }> {
  let imported = 0;
  for (const name of readdirSync(directory)) {
    if (isIgnoredMedia(name)) continue;
    if (!/\.(jpe?g|png|webp|heic)$/i.test(name)) continue;
    if (!(await renew())) return { imported, stoodDown: true };
    const path = join(directory, name);
    await importFile(readFileSync(path), { sourceType: "inbox", sourceRef: null, takenAt: null });
    rmSync(path);
    imported += 1;
  }
  return { imported, stoodDown: false };
}

async function importTakeoutDir(
  directory: string,
  importFile: (bytes: Uint8Array, source: { sourceType: "google_photos"; sourceRef: string; takenAt: string | null }) => Promise<void>,
  renew: () => Promise<boolean>,
): Promise<{ imported: number; stoodDown: boolean }> {
  let imported = 0;
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".zip")) continue;
    const entries = readTakeout(readFileSync(join(directory, name)));
    for (const entry of entries) {
      if (!(await renew())) return { imported, stoodDown: true };
      await importFile(entry.bytes, { sourceType: "google_photos", sourceRef: entry.sourceRef, takenAt: entry.takenAt });
      imported += 1;
    }
  }
  return { imported, stoodDown: false };
}
