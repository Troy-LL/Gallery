import { closeSync, fstatSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";

export type TakeoutEntry = {
  filename: string;
  bytes: Uint8Array;
  takenAt: string | null;
  sourceRef: string;
};

type TakeoutMeta = { title?: string; photoTakenTime?: { timestamp?: string } };

type ZipEntry = { name: string; flags: number; method: number; crc: number; compressedSize: number; size: number; localOffset: number };

const STILL = /\.(jpe?g|png|webp|heic)$/i;
const META_SUFFIX = ".supplemental-metadata.json";
const MAX_ENTRY_BYTES = 120 * 1024 * 1024;
const EOCD_SIZE = 22;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;
const STORED = 0;
const DEFLATED = 8;

export function readTakeout(bytes: Uint8Array): TakeoutEntry[] {
  return entriesFromMap(unzipSync(bytes));
}

export function* iterateTakeoutZip(zipPath: string): Generator<TakeoutEntry> {
  const fd = openSync(zipPath, "r");
  try {
    const entries = readCentralDirectory(fd).filter((entry) => !entry.name.endsWith("/"));
    const jsonByKey = new Map<string, TakeoutMeta>();
    for (const entry of entries) {
      const key = metaKey(entry.name);
      if (!key) continue;
      try {
        jsonByKey.set(key, JSON.parse(readZipEntry(fd, entry).toString("utf8")) as TakeoutMeta);
      } catch {
        continue;
      }
    }
    for (const entry of entries) {
      if (!STILL.test(entry.name)) continue;
      const meta = jsonByKey.get(imageKey(entry.name));
      yield {
        filename: entry.name,
        bytes: readZipEntry(fd, entry),
        takenAt: takenAtFrom(meta),
        sourceRef: meta?.title ?? imageKey(entry.name),
      };
    }
  } finally {
    closeSync(fd);
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

function readCentralDirectory(fd: number): ZipEntry[] {
  const fileSize = fstatSync(fd).size;
  const tailStart = Math.max(0, fileSize - EOCD_SIZE - 0xffff);
  const tail = readAt(fd, tailStart, fileSize - tailStart);
  let eocd = -1;
  for (let at = tail.length - EOCD_SIZE; at >= 0; at -= 1) {
    if (tail.readUInt32LE(at) === EOCD_SIGNATURE) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip end of central directory not found");
  let count = tail.readUInt16LE(eocd + 10);
  let directorySize = tail.readUInt32LE(eocd + 12);
  let directoryOffset = tail.readUInt32LE(eocd + 16);
  const locatorAt = tailStart + eocd - 20;
  if ((count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) && locatorAt >= 0) {
    const locator = readAt(fd, locatorAt, 20);
    if (locator.readUInt32LE(0) === ZIP64_LOCATOR_SIGNATURE) {
      const record = readAt(fd, Number(locator.readBigUInt64LE(8)), 56);
      if (record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) throw new Error("zip64 end of central directory not found");
      count = Number(record.readBigUInt64LE(32));
      directorySize = Number(record.readBigUInt64LE(40));
      directoryOffset = Number(record.readBigUInt64LE(48));
    }
  }
  const directory = readAt(fd, directoryOffset, directorySize);
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let index = 0; index < count; index += 1) {
    if (directory.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw new Error("corrupt zip central directory");
    let compressedSize = directory.readUInt32LE(at + 20);
    let size = directory.readUInt32LE(at + 24);
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    let localOffset = directory.readUInt32LE(at + 42);
    const nameEnd = at + 46 + nameLength;
    const extraEnd = nameEnd + extraLength;
    for (let extra = nameEnd; extra + 4 <= extraEnd; extra += 4 + directory.readUInt16LE(extra + 2)) {
      if (directory.readUInt16LE(extra) !== ZIP64_EXTRA_ID) continue;
      let field = extra + 4;
      if (size === 0xffffffff) {
        size = Number(directory.readBigUInt64LE(field));
        field += 8;
      }
      if (compressedSize === 0xffffffff) {
        compressedSize = Number(directory.readBigUInt64LE(field));
        field += 8;
      }
      if (localOffset === 0xffffffff) localOffset = Number(directory.readBigUInt64LE(field));
    }
    entries.push({
      name: directory.toString("utf8", at + 46, nameEnd),
      flags: directory.readUInt16LE(at + 8),
      method: directory.readUInt16LE(at + 10),
      crc: directory.readUInt32LE(at + 16),
      compressedSize,
      size,
      localOffset,
    });
    at = extraEnd + commentLength;
  }
  return entries;
}

function readZipEntry(fd: number, entry: ZipEntry): Buffer {
  if (entry.flags & 1) throw new Error(`${entry.name} is encrypted`);
  if (entry.size > MAX_ENTRY_BYTES) throw new Error(`${entry.name} exceeds ${MAX_ENTRY_BYTES} bytes`);
  const header = readAt(fd, entry.localOffset, 30);
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error(`corrupt zip local header for ${entry.name}`);
  const compressed = readAt(fd, entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28), entry.compressedSize);
  let bytes: Buffer;
  if (entry.method === STORED) bytes = compressed;
  else if (entry.method === DEFLATED) bytes = inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
  else throw new Error(`${entry.name} uses unsupported zip method ${entry.method}`);
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new Error(`zip crc mismatch for ${entry.name}`);
  return bytes;
}

function readAt(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.allocUnsafeSlow(length);
  for (let filled = 0; filled < length; ) {
    const read = readSync(fd, buffer, filled, length - filled, position + filled);
    if (read === 0) throw new Error("unexpected end of zip");
    filled += read;
  }
  return buffer;
}
