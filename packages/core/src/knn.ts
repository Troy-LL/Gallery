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

function isWorseCandidate(scoreA: number, idA: string, scoreB: number, idB: string): boolean {
  return scoreA < scoreB || (scoreA === scoreB && idA > idB);
}

function siftUp(heapScores: Float64Array, heapIds: string[], start: number): void {
  let i = start;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!isWorseCandidate(heapScores[i], heapIds[i], heapScores[parent], heapIds[parent])) break;
    const tmpScore = heapScores[i];
    const tmpId = heapIds[i];
    heapScores[i] = heapScores[parent];
    heapIds[i] = heapIds[parent];
    heapScores[parent] = tmpScore;
    heapIds[parent] = tmpId;
    i = parent;
  }
}

function siftDown(heapScores: Float64Array, heapIds: string[], start: number, size: number): void {
  let i = start;
  while (true) {
    const left = (i << 1) + 1;
    if (left >= size) break;
    let worst = left;
    const right = left + 1;
    if (right < size && isWorseCandidate(heapScores[right], heapIds[right], heapScores[left], heapIds[left])) {
      worst = right;
    }
    if (!isWorseCandidate(heapScores[worst], heapIds[worst], heapScores[i], heapIds[i])) break;
    const tmpScore = heapScores[i];
    const tmpId = heapIds[i];
    heapScores[i] = heapScores[worst];
    heapIds[i] = heapIds[worst];
    heapScores[worst] = tmpScore;
    heapIds[worst] = tmpId;
    i = worst;
  }
}

export function knn(query: number[], rows: { id: string; embedding: number[] }[], k: number): { id: string; score: number }[] {
  const limit = Math.min(Math.max(0, Math.floor(k)), rows.length);
  if (limit === 0) return [];

  const qLen = query.length;
  const q = new Float64Array(qLen);
  let queryNormSq = 0;
  for (let i = 0; i < qLen; i += 1) {
    const v = query[i] ?? 0;
    q[i] = v;
    queryNormSq += v * v;
  }

  const heapScores = new Float64Array(limit);
  const heapIds = new Array<string>(limit);
  let heapSize = 0;
  let minScore = Number.NEGATIVE_INFINITY;
  let minId = "";
  let minScoreSqGuard = 0;

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const emb = row.embedding;
    const eLen = emb.length;
    let score = 0;
    if (eLen >= qLen) {
      if (queryNormSq !== 0) {
        let dot = 0;
        let rightNormSq = 0;
        for (let i = 0; i < qLen; i += 1) {
          const b = emb[i] ?? 0;
          dot += q[i] * b;
          rightNormSq += b * b;
        }
        if (rightNormSq !== 0) {
          if (heapSize === limit && minScore > 0) {
            if (dot <= 0 || dot * dot < minScoreSqGuard * rightNormSq) continue;
          }
          score = dot / Math.sqrt(queryNormSq * rightNormSq);
        }
      }
    } else {
      let dot = 0;
      let leftNormSq = 0;
      let rightNormSq = 0;
      for (let i = 0; i < eLen; i += 1) {
        const a = q[i];
        const b = emb[i] ?? 0;
        dot += a * b;
        leftNormSq += a * a;
        rightNormSq += b * b;
      }
      if (leftNormSq !== 0 && rightNormSq !== 0) score = dot / Math.sqrt(leftNormSq * rightNormSq);
    }

    if (heapSize < limit) {
      heapScores[heapSize] = score;
      heapIds[heapSize] = row.id;
      siftUp(heapScores, heapIds, heapSize);
      heapSize += 1;
      if (heapSize === limit) {
        minScore = heapScores[0];
        minId = heapIds[0];
        minScoreSqGuard = minScore > 0 ? minScore * minScore * queryNormSq * (1 - 1e-12) : 0;
      }
    } else if (score > minScore || (score === minScore && row.id < minId)) {
      heapScores[0] = score;
      heapIds[0] = row.id;
      siftDown(heapScores, heapIds, 0, heapSize);
      minScore = heapScores[0];
      minId = heapIds[0];
      minScoreSqGuard = minScore > 0 ? minScore * minScore * queryNormSq * (1 - 1e-12) : 0;
    }
  }

  const out = new Array<{ id: string; score: number }>(heapSize);
  let remaining = heapSize;
  for (let pos = remaining - 1; pos >= 0; pos -= 1) {
    out[pos] = { id: heapIds[0], score: heapScores[0] };
    remaining -= 1;
    if (remaining > 0) {
      heapScores[0] = heapScores[remaining];
      heapIds[0] = heapIds[remaining];
      siftDown(heapScores, heapIds, 0, remaining);
    }
  }
  return out;
}

const NIBBLE_POPCOUNT = new Uint8Array([0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]);

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 102) return code - 87;
  if (code >= 65 && code <= 70) return code - 55;
  return 0;
}

function popcount32(value: number): number {
  let v = (value >>> 0) - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

function parseHexWord32(hex: string, start: number): number {
  let word = 0;
  for (let i = start; i < start + 8; i += 1) {
    word = (word << 4) | hexNibble(hex.charCodeAt(i));
  }
  return word >>> 0;
}

function parseHexNibbles(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length);
  for (let i = 0; i < hex.length; i += 1) out[i] = hexNibble(hex.charCodeAt(i));
  return out;
}

export function hammingHex(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length) * 4;
  for (let index = 0; index < length; index += 1) {
    distance += NIBBLE_POPCOUNT[hexNibble(left.charCodeAt(index)) ^ hexNibble(right.charCodeAt(index))];
  }
  return distance;
}

const SHARPNESS_RANK: Record<SharpnessLevel, number> = { sharp: 2, soft: 1, blurry: 0 };

type BandSpec = { startBit: number; width: number };

function build64BitBands(bandCount: number): BandSpec[] {
  const base = Math.floor(64 / bandCount);
  const rem = 64 % bandCount;
  const specs: BandSpec[] = [];
  let startBit = 0;
  for (let i = 0; i < bandCount; i += 1) {
    const width = base + (i < rem ? 1 : 0);
    specs.push({ startBit, width });
    startBit += width;
  }
  return specs;
}

function extractBandKey(hi: number, lo: number, startBit: number, width: number): number {
  const endBit = startBit + width;
  if (endBit <= 32) {
    if (width === 32) return lo >>> 0;
    return (lo >>> startBit) & ((1 << width) - 1);
  }
  if (startBit >= 32) {
    if (width === 32) return hi >>> 0;
    return (hi >>> (startBit - 32)) & ((1 << width) - 1);
  }
  const loBits = 32 - startBit;
  const hiBits = width - loBits;
  const loPart = lo >>> startBit;
  const hiPart = hi & ((1 << hiBits) - 1);
  return ((hiPart << loBits) | loPart) >>> 0;
}

export function groupNearDuplicates(
  rows: { id: string; phash: string; sharpness: SharpnessLevel; luminance: number }[],
  maxDistance = 8,
): { bestId: string; memberIds: string[] }[] {
  const n = rows.length;
  const maxDist = Math.floor(maxDistance);
  if (n < 2 || maxDist < 0) return [];

  let all64Bit = true;
  for (let i = 0; i < n; i += 1) {
    if (rows[i].phash.length !== 16) {
      all64Bit = false;
      break;
    }
  }

  let rowRoot: Int32Array;

  if (all64Bit) {
    const rowRep = new Int32Array(n);
    const uniqueHiList: number[] = [];
    const uniqueLoList: number[] = [];
    const seen = new Map<bigint, number>();
    for (let i = 0; i < n; i += 1) {
      const phash = rows[i].phash;
      const hi = parseHexWord32(phash, 0);
      const lo = parseHexWord32(phash, 8);
      const key = (BigInt(hi) << 32n) | BigInt(lo);
      const existing = seen.get(key);
      if (existing !== undefined) {
        rowRep[i] = existing;
      } else {
        const rep = uniqueHiList.length;
        seen.set(key, rep);
        rowRep[i] = rep;
        uniqueHiList.push(hi);
        uniqueLoList.push(lo);
      }
    }

    const uCount = uniqueHiList.length;
    const parent = new Int32Array(uCount);
    const rank = new Uint8Array(uCount);
    for (let i = 0; i < uCount; i += 1) parent[i] = i;

    const find = (index: number): number => {
      let cursor = index;
      while (parent[cursor] !== cursor) {
        parent[cursor] = parent[parent[cursor]];
        cursor = parent[cursor];
      }
      return cursor;
    };
    const union = (left: number, right: number) => {
      const a = find(left);
      const b = find(right);
      if (a === b) return;
      if (rank[a] < rank[b]) parent[a] = b;
      else {
        parent[b] = a;
        if (rank[a] === rank[b]) rank[a] += 1;
      }
    };

    if (uCount > 1 && maxDist > 0) {
      const uHi = Uint32Array.from(uniqueHiList);
      const uLo = Uint32Array.from(uniqueLoList);
      if (uCount <= 128 || maxDist > 12) {
        for (let i = 0; i < uCount; i += 1) {
          const hiI = uHi[i];
          const loI = uLo[i];
          for (let j = i + 1; j < uCount; j += 1) {
            if (popcount32(hiI ^ uHi[j]) + popcount32(loI ^ uLo[j]) <= maxDist) {
              union(i, j);
            }
          }
        }
      } else {
        const bands = build64BitBands(maxDist + 1);
        for (let b = 0; b < bands.length; b += 1) {
          const { startBit, width } = bands[b];
          if (width <= 10) {
            const buckets = new Array<number[] | undefined>(1 << width);
            for (let u = 0; u < uCount; u += 1) {
              const hiU = uHi[u];
              const loU = uLo[u];
              const key = extractBandKey(hiU, loU, startBit, width);
              const bucket = buckets[key];
              if (bucket !== undefined) {
                for (let t = 0; t < bucket.length; t += 1) {
                  const v = bucket[t];
                  if (popcount32(hiU ^ uHi[v]) + popcount32(loU ^ uLo[v]) <= maxDist) {
                    union(u, v);
                  }
                }
                bucket.push(u);
              } else {
                buckets[key] = [u];
              }
            }
          } else {
            const buckets = new Map<number, number[]>();
            for (let u = 0; u < uCount; u += 1) {
              const hiU = uHi[u];
              const loU = uLo[u];
              const key = extractBandKey(hiU, loU, startBit, width);
              const bucket = buckets.get(key);
              if (bucket !== undefined) {
                for (let t = 0; t < bucket.length; t += 1) {
                  const v = bucket[t];
                  if (popcount32(hiU ^ uHi[v]) + popcount32(loU ^ uLo[v]) <= maxDist) {
                    union(u, v);
                  }
                }
                bucket.push(u);
              } else {
                buckets.set(key, [u]);
              }
            }
          }
        }
      }
    }

    rowRoot = new Int32Array(n);
    for (let i = 0; i < n; i += 1) rowRoot[i] = find(rowRep[i]);
  } else {
    const rowRep = new Int32Array(n);
    const uniqueNibbles: Uint8Array[] = [];
    const seen = new Map<string, number>();
    for (let i = 0; i < n; i += 1) {
      const phash = rows[i].phash;
      const existing = seen.get(phash);
      if (existing !== undefined) {
        rowRep[i] = existing;
      } else {
        const rep = uniqueNibbles.length;
        seen.set(phash, rep);
        rowRep[i] = rep;
        uniqueNibbles.push(parseHexNibbles(phash));
      }
    }
    const uCount = uniqueNibbles.length;
    const parent = new Int32Array(uCount);
    const rank = new Uint8Array(uCount);
    for (let i = 0; i < uCount; i += 1) parent[i] = i;
    const find = (index: number): number => {
      let cursor = index;
      while (parent[cursor] !== cursor) {
        parent[cursor] = parent[parent[cursor]];
        cursor = parent[cursor];
      }
      return cursor;
    };
    const union = (left: number, right: number) => {
      const a = find(left);
      const b = find(right);
      if (a === b) return;
      if (rank[a] < rank[b]) parent[a] = b;
      else {
        parent[b] = a;
        if (rank[a] === rank[b]) rank[a] += 1;
      }
    };
    for (let i = 0; i < uCount; i += 1) {
      const left = uniqueNibbles[i];
      const lenL = left.length;
      for (let j = i + 1; j < uCount; j += 1) {
        const right = uniqueNibbles[j];
        const lenR = right.length;
        let dist = (lenL > lenR ? lenL - lenR : lenR - lenL) * 4;
        if (dist > maxDist) continue;
        const len = lenL < lenR ? lenL : lenR;
        for (let k = 0; k < len; k += 1) {
          dist += NIBBLE_POPCOUNT[left[k] ^ right[k]];
          if (dist > maxDist) break;
        }
        if (dist <= maxDist) union(i, j);
      }
    }
    rowRoot = new Int32Array(n);
    for (let i = 0; i < n; i += 1) rowRoot[i] = find(rowRep[i]);
  }

  const groups = new Map<number, (typeof rows)[number][]>();
  for (let index = 0; index < n; index += 1) {
    const root = rowRoot[index];
    const list = groups.get(root);
    if (list) list.push(rows[index]);
    else groups.set(root, [rows[index]]);
  }
  const result: { bestId: string; memberIds: string[] }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let best = group[0];
    let bestScore = duplicateScore(best);
    for (let i = 1; i < group.length; i += 1) {
      const candidate = group[i];
      const score = duplicateScore(candidate);
      if (score > bestScore || (score === bestScore && candidate.id.localeCompare(best.id) < 0)) {
        best = candidate;
        bestScore = score;
      }
    }
    result.push({ bestId: best.id, memberIds: group.map((row) => row.id) });
  }
  return result;
}

function duplicateScore(row: { sharpness: SharpnessLevel; luminance: number }): number {
  return SHARPNESS_RANK[row.sharpness] * 10 + (1 - Math.abs(row.luminance - 0.5));
}
