import { strFromU8, unzipSync } from "fflate";

export type TakeoutEntry = {
  filename: string;
  bytes: Uint8Array;
  takenAt: string | null;
  sourceRef: string;
};

export function readTakeout(bytes: Uint8Array): TakeoutEntry[] {
  const files = unzipSync(bytes);
  const jsonByStem = new Map<string, { title?: string; photoTakenTime?: { timestamp?: string } }>();
  for (const [name, content] of Object.entries(files)) {
    if (!name.endsWith(".json")) continue;
    try {
      jsonByStem.set(stem(name), JSON.parse(strFromU8(content)) as { title?: string; photoTakenTime?: { timestamp?: string } });
    } catch {
      continue;
    }
  }
  const images: TakeoutEntry[] = [];
  for (const [name, content] of Object.entries(files)) {
    if (!/\.(jpe?g|png|webp|heic)$/i.test(name)) continue;
    const meta = jsonByStem.get(stem(name));
    const stamp = meta?.photoTakenTime?.timestamp;
    const takenAt = stamp && Number.isFinite(Number(stamp)) ? new Date(Number(stamp) * 1000).toISOString() : null;
    images.push({ filename: name, bytes: content, takenAt, sourceRef: meta?.title ?? name });
  }
  return images;
}

function stem(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base.replace(/\.json$/i, "").replace(/\.(jpe?g|png|webp|heic)$/i, "");
}
