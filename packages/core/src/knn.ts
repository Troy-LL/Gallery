import type { SharpnessLevel } from "./schema.js";

export function deterministicEmbedding(bytes: Uint8Array, dims = 32): number[] {
  const values: number[] = [];
  let state = 2166136261;
  for (const byte of bytes) state = Math.imul(state ^ byte, 16777619);
  for (let index = 0; values.length < dims; index += 1) {
    state = Math.imul(state ^ index, 16777619);
    const channel = (state >>> 0) / 4294967295;
    values.push(channel * 2 - 1);
  }
  const norm = Math.hypot(...values);
  if (norm === 0) return values;
  return values.map((value) => value / norm);
}

export function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function knn(query: number[], rows: { id: string; embedding: number[] }[], k: number): { id: string; score: number }[] {
  return rows
    .map((row) => ({ id: row.id, score: cosine(query, row.embedding) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, k);
}

export function hammingHex(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length) * 4;
  for (let index = 0; index < length; index += 1) {
    const mixed = Number.parseInt(left[index] ?? "0", 16) ^ Number.parseInt(right[index] ?? "0", 16);
    distance += (mixed & 1) + ((mixed >> 1) & 1) + ((mixed >> 2) & 1) + ((mixed >> 3) & 1);
  }
  return distance;
}

const SHARPNESS_RANK: Record<SharpnessLevel, number> = { sharp: 2, soft: 1, blurry: 0 };

export function groupNearDuplicates(
  rows: { id: string; phash: string; sharpness: SharpnessLevel; luminance: number }[],
  maxDistance = 8,
): { bestId: string; memberIds: string[] }[] {
  const parent = rows.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor] ?? cursor] ?? cursor;
      cursor = parent[cursor] ?? cursor;
    }
    return cursor;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a && b && hammingHex(a.phash, b.phash) <= maxDistance) union(i, j);
    }
  }
  const groups = new Map<number, typeof rows>();
  rows.forEach((row, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(row);
    groups.set(root, list);
  });
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const ranked = [...group].sort((a, b) => duplicateScore(b) - duplicateScore(a) || a.id.localeCompare(b.id));
      const best = ranked[0];
      if (!best) throw new Error("empty duplicate group");
      return { bestId: best.id, memberIds: group.map((row) => row.id) };
    });
}

function duplicateScore(row: { sharpness: SharpnessLevel; luminance: number }): number {
  return SHARPNESS_RANK[row.sharpness] * 10 + (1 - Math.abs(row.luminance - 0.5));
}
