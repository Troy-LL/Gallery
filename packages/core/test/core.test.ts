import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyAnswerLock,
  applyDominantHex,
  answersToChips,
  cosine,
  coverCrop,
  dotsFor,
  extractPalette,
  groupNearDuplicates,
  hammingHex,
  harmonyHues,
  hueInWedge,
  keywordChips,
  knn,
  layoutPreview,
  matchHarmony,
  matchLibrary,
  mergeAnalysis,
  modelVersionSchema,
  oklabDistance,
  oklabDistanceSquared,
  oklabToRgb,
  parsePlatformConfig,
  parseSettings,
  percentile,
  pointInPolygon,
  reduceWheelKey,
  rgbToOklab,
  selectionMatches,
  subjectPreservingCrop,
  subjectIsCropped,
  swatchFromRgb,
  syntheticRecord,
  vocabularyFileSchema,
  workingCopyPx,
  type Rgb,
  type SharpnessLevel,
  type Swatch,
} from "../src/index.ts";
import { loadPlatformConfigs } from "../src/node.ts";

describe("schema and color", () => {
  it("rejects an unpinned model and accepts the example settings", () => {
    expect(() => modelVersionSchema.parse("jev-latest")).toThrow(/explicit pin/);
    const settings = parseSettings(JSON.parse(readFileSync("config/settings.example.json", "utf8")));
    expect(settings.model_version).toBe("jev-1.14.0");
  });

  it("rejects an analysis without locked_fields", () => {
    const record = syntheticRecord(1);
    expect(() => parseSettings({ ...record })).toThrow();
    expect(record.locked_fields).toEqual([]);
  });

  it("builds swatches whose weights sum to 1", () => {
    const pixels = [
      ...Array.from({ length: 30 }, () => ({ r: 220, g: 20, b: 20 })),
      ...Array.from({ length: 20 }, () => ({ r: 20, g: 20, b: 200 })),
      ...Array.from({ length: 10 }, () => ({ r: 20, g: 180, b: 40 })),
    ];
    const palette = extractPalette(pixels, 5);
    const total = palette.reduce((sum, swatch) => sum + swatch.weight, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(palette[0]?.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("selection", () => {
  it("wraps a wedge across 0 degrees and hits a lasso", () => {
    expect(hueInWedge(5, 350, 10)).toBe(true);
    expect(hueInWedge(180, 350, 10)).toBe(false);
    const inside = pointInPolygon({ x: 0, y: 0 }, [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ]);
    expect(inside).toBe(true);
    const red = syntheticRecord(0, { dominant_oklch: { L: 0.5, C: 0.1, h: 2 } });
    const blue = syntheticRecord(1, { dominant_oklch: { L: 0.5, C: 0.1, h: 200 } });
    const matched = matchLibrary([red, blue], { selection: { type: "wedge", startHue: 350, endHue: 10 }, facets: {} });
    expect(matched.map((item) => item.id)).toEqual([red.id]);
  });

  it("moves the keyboard cursor", () => {
    const next = reduceWheelKey({ hue: 0, radius: 0.5, brush: 0.08 }, "ArrowRight");
    expect(next.hue).toBe(5);
    expect(reduceWheelKey(next, "+").brush).toBeGreaterThan(next.brush);
  });
});

describe("preview and harmony", () => {
  it("loads platform files with no brand marks and crops a wide frame", () => {
    const configs = loadPlatformConfigs("config/platforms");
    expect(configs.map((item) => item.id)).toEqual(["facebook", "instagram", "linkedin"]);
    const raw = JSON.parse(readFileSync("config/platforms/instagram.json", "utf8"));
    expect(JSON.stringify(raw)).not.toMatch(/logo|instagram-glyph|brand/i);
    expect(() => parsePlatformConfig({ ...raw, logo: "x" })).toThrow();
    const crop = coverCrop(1000, 500, 1);
    expect(crop).toEqual({ x: 250, y: 0, width: 500, height: 500 });
    const box = { top: 0.1, bottom: 0.9, left: 0, right: 0.2, confidence: 0.8 };
    expect(subjectIsCropped(crop, box, 1000, 500)).toBe(true);
    const shifted = subjectPreservingCrop(1000, 500, 1, box);
    expect(subjectIsCropped(shifted, box, 1000, 500)).toBe(false);
    const layout = layoutPreview({
      config: configs.find((item) => item.id === "instagram") ?? configs[0]!,
      surfaceId: "feed_square",
      images: [{ width: 1000, height: 500, subjectBox: box }],
      caption: "hello",
    });
    expect(layout.previewLabel).toBe("Preview");
    expect(layout.badge?.label).toBe("subject cropped");
  });

  it("suggests complementary hues and ignores an uncertain answer", () => {
    expect(harmonyHues(10, "complementary")).toEqual([10, 190]);
    expect(matchHarmony([{ id: "a", hue: 10 }, { id: "b", hue: 190 }, { id: "c", hue: 40 }], "a", 10, "complementary")).toEqual(["b"]);
    expect(answersToChips([{ questionId: "time_of_day", type: "choice", value: "night", confidence: 0.4 }])).toEqual([]);
    expect(keywordChips("warm portraits").map((chip) => chip.label)).toEqual(["portrait", "warm"]);
  });
});

describe("retrieval and locks", () => {
  it("ranks the nearer embedding first", () => {
    const matches = knn([1, 0], [
      { id: "far", embedding: [0, 1] },
      { id: "near", embedding: [1, 0] },
    ], 1);
    expect(matches[0]?.id).toBe("near");
  });

  it("keeps a locked answer when analysis is replaced", () => {
    const previous = {
      image_id: "img",
      model_version: "jev-1.14.0",
      analyzed_at: "2026-01-01T00:00:00.000Z",
      vocab_version: "v1",
      answers: [{ question_id: "time_of_day", type: "choice" as const, value: "night", confidence: 1 }],
      has_text: false,
      subject_box: null,
      locked_fields: ["time_of_day"],
      needs_tags: false,
    };
    const merged = mergeAnalysis(previous, {
      ...previous,
      answers: [{ question_id: "time_of_day", type: "choice", value: "daylight", confidence: 0.9 }],
    });
    expect(merged.answers[0]?.value).toBe("night");
    const omitted = mergeAnalysis(previous, { ...previous, answers: [] });
    expect(omitted.answers[0]?.value).toBe("night");
    expect(omitted.locked_fields).toEqual(["time_of_day"]);
    const record = applyDominantHex(applyAnswerLock(syntheticRecord(3), previous.answers[0]!), "#112233");
    expect(record.locked_fields).toEqual(expect.arrayContaining(["time_of_day", "dominant_hex"]));
    expect(record.dominant_hex).toBe("#112233");
  });

  it("steps the working copy down near the storage cap", () => {
    expect(workingCopyPx(7_000_000_000, 10_000_000_000)).toBe(2048);
    expect(workingCopyPx(8_500_000_000, 10_000_000_000)).toBe(1600);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });
});

describe("vocabulary", () => {
  it("parses the checked-in vocabulary", () => {
    const vocab = vocabularyFileSchema.parse(JSON.parse(readFileSync("prompts/v1/vocabulary.json", "utf8")));
    expect(vocab.version).toBe("v1");
    expect(vocab.questions.some((question) => question.id === "subject_visible")).toBe(true);
  });
});

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function referenceExtractPalette(pixels: Rgb[], requested = 5): Swatch[] {
  const points = pixels.map((pixel) => ({ ...pixel, ...rgbToOklab(pixel.r, pixel.g, pixel.b) }));
  const k = Math.max(1, Math.min(requested, points.length));
  const centers = Array.from({ length: k }, (_, index) => {
    const point = points[Math.floor((index * points.length) / k)] ?? points[0];
    return { L: point.L, a: point.a, b: point.b };
  });
  let groups = centers.map(() => [] as typeof points);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    groups = centers.map(() => []);
    for (const point of points) {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centers.length; index += 1) {
        const distance = oklabDistance(point, centers[index] ?? point);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      groups[best]?.push(point);
    }
    for (let index = 0; index < centers.length; index += 1) {
      const group = groups[index] ?? [];
      if (group.length === 0) continue;
      const next = group.reduce(
        (sum, point) => ({ L: sum.L + point.L, a: sum.a + point.a, b: sum.b + point.b }),
        { L: 0, a: 0, b: 0 },
      );
      centers[index] = { L: next.L / group.length, a: next.a / group.length, b: next.b / group.length };
    }
  }
  const ranked = centers
    .map((center, index) => ({ center, count: (groups[index] ?? []).length }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const total = ranked.reduce((sum, entry) => sum + entry.count, 0);
  return ranked.map((entry) => {
    const { r, g, b } = oklabToRgb(entry.center);
    return swatchFromRgb({ r, g, b }, entry.count / total);
  });
}

function naiveHammingHex(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length) * 4;
  for (let index = 0; index < length; index += 1) {
    const mixed = Number.parseInt(left[index] ?? "0", 16) ^ Number.parseInt(right[index] ?? "0", 16);
    distance += (mixed & 1) + ((mixed >> 1) & 1) + ((mixed >> 2) & 1) + ((mixed >> 3) & 1);
  }
  return distance;
}

function naiveGroupNearDuplicates(
  rows: { id: string; phash: string; sharpness: SharpnessLevel; luminance: number }[],
  maxDistance = 8,
): { bestId: string; memberIds: string[] }[] {
  const rank: Record<SharpnessLevel, number> = { sharp: 2, soft: 1, blurry: 0 };
  const score = (row: { sharpness: SharpnessLevel; luminance: number }) => rank[row.sharpness] * 10 + (1 - Math.abs(row.luminance - 0.5));
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
      if (naiveHammingHex(rows[i].phash, rows[j].phash) <= maxDistance) union(i, j);
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
      const ranked = [...group].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
      return { bestId: ranked[0].id, memberIds: group.map((row) => row.id) };
    });
}

function flipBits64(hex: string, bitIndices: number[]): string {
  const nibbles = Array.from(hex, (ch) => Number.parseInt(ch, 16));
  for (const bit of bitIndices) {
    const nibbleIndex = Math.floor(bit / 4);
    const bitInNibble = bit % 4;
    nibbles[nibbleIndex] ^= 1 << bitInNibble;
  }
  return nibbles.map((n) => n.toString(16)).join("");
}

describe("hot-path equivalence", () => {
  it("matches naive knn on random embeddings including exact score ties", () => {
    const rng = mulberry32(42);
    const dims = 32;
    const query = Array.from({ length: dims }, () => rng() * 2 - 1);
    const shared = Array.from({ length: dims }, () => rng() * 2 - 1);
    const rows: { id: string; embedding: number[] }[] = [];
    for (let i = 0; i < 400; i += 1) {
      rows.push({
        id: `img-${String(i).padStart(4, "0")}`,
        embedding: Array.from({ length: dims }, () => rng() * 2 - 1),
      });
    }
    rows.push({ id: "tie-c", embedding: [...shared] });
    rows.push({ id: "tie-a", embedding: [...shared] });
    rows.push({ id: "tie-b", embedding: [...shared] });
    rows.push({ id: "zero-vec", embedding: new Array(dims).fill(0) });
    rows.push({ id: "short-vec", embedding: query.slice(0, 8) });

    const naive = (k: number) =>
      rows
        .map((row) => ({ id: row.id, score: cosine(query, row.embedding) }))
        .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, k);

    for (const k of [0, 1, 5, 12, 50, rows.length + 10]) {
      expect(knn(query, rows, k)).toEqual(naive(k));
    }

    const tiedOnly = [
      { id: "z", embedding: [1, 0] },
      { id: "a", embedding: [1, 0] },
      { id: "m", embedding: [1, 0] },
      { id: "b", embedding: [1, 0] },
    ];
    expect(knn([1, 0], tiedOnly, 2)).toEqual([
      { id: "a", score: 1 },
      { id: "b", score: 1 },
    ]);
  });

  it("matches naive groupNearDuplicates on random 64-bit phashes, near-dupes, and mixed lengths", () => {
    const rng = mulberry32(1337);
    const levels: SharpnessLevel[] = ["sharp", "soft", "blurry"];
    const randomHex64 = () =>
      Array.from({ length: 16 }, () => Math.floor(rng() * 16).toString(16)).join("");

    const rows: { id: string; phash: string; sharpness: SharpnessLevel; luminance: number }[] = [];
    for (let i = 0; i < 120; i += 1) {
      rows.push({
        id: `rand-${String(i).padStart(3, "0")}`,
        phash: randomHex64(),
        sharpness: levels[i % 3],
        luminance: Math.round(rng() * 10) / 10,
      });
    }
    for (let cluster = 0; cluster < 12; cluster += 1) {
      const base = randomHex64();
      rows.push({ id: `c${cluster}-0`, phash: base, sharpness: "soft", luminance: 0.4 });
      rows.push({ id: `c${cluster}-exact`, phash: base.toUpperCase(), sharpness: "sharp", luminance: 0.5 });
      const near1 = flipBits64(base, [0, 7, 15, 23, 31, 40, 52, 63]);
      rows.push({ id: `c${cluster}-8bits`, phash: near1, sharpness: "sharp", luminance: 0.5 });
      const chain = flipBits64(near1, [1, 2, 3, 4, 5]);
      rows.push({ id: `c${cluster}-chain`, phash: chain, sharpness: "blurry", luminance: 0.2 });
    }

    for (const maxDist of [0, 1, 4, 8, 14]) {
      expect(groupNearDuplicates(rows, maxDist)).toEqual(naiveGroupNearDuplicates(rows, maxDist));
    }

    expect(hammingHex("00ff", "0f")).toBe(naiveHammingHex("00ff", "0f"));
    expect(hammingHex("ABCD1234", "abcd1235")).toBe(naiveHammingHex("ABCD1234", "abcd1235"));

    const mixedRows: { id: string; phash: string; sharpness: SharpnessLevel; luminance: number }[] = [
      { id: "m1", phash: "00ff", sharpness: "sharp", luminance: 0.5 },
      { id: "m2", phash: "00fe", sharpness: "soft", luminance: 0.5 },
      { id: "m3", phash: "00ff00", sharpness: "sharp", luminance: 0.5 },
      { id: "m4", phash: "ffff", sharpness: "blurry", luminance: 0.3 },
    ];
    expect(groupNearDuplicates(mixedRows, 8)).toEqual(naiveGroupNearDuplicates(mixedRows, 8));
  });

  it("extractPalette matches the inline reference implementation identically", () => {
    const rng = mulberry32(99);
    const pixels: Rgb[] = Array.from({ length: 250 }, () => ({
      r: Math.floor(rng() * 256),
      g: Math.floor(rng() * 256),
      b: Math.floor(rng() * 256),
    }));
    for (const requested of [1, 3, 5, 8]) {
      expect(extractPalette(pixels, requested)).toEqual(referenceExtractPalette(pixels, requested));
    }
    const left = rgbToOklab(200, 80, 40);
    const right = rgbToOklab(40, 120, 210);
    expect(oklabDistanceSquared(left, right)).toBeCloseTo(oklabDistance(left, right) ** 2, 12);
  });

  it("matchLibrary fast paths and dotsFor missing-palette handling work accurately", () => {
    const records = Array.from({ length: 120 }, (_, i) => syntheticRecord(i));
    const idsSelection = { type: "ids" as const, ids: [records[3].id, records[42].id, records[99].id] };
    expect(matchLibrary(records, { selection: idsSelection, facets: {} }).map((r) => r.id)).toEqual([
      records[3].id,
      records[42].id,
      records[99].id,
    ]);

    const brushSelection = { type: "brush" as const, lab: rgbToOklab(200, 100, 80), radius: 0.2 };
    expect(matchLibrary(records, { selection: brushSelection, facets: {} })).toEqual(
      records.filter((r) => selectionMatches(r, brushSelection, 0)),
    );

    const record = syntheticRecord(5);
    const withoutPalette = { ...record, palette: undefined as unknown as Swatch[] };
    expect(dotsFor(withoutPalette, "dominant", 0.08)).toEqual([
      { imageId: record.id, hex: record.dominant_hex, oklch: record.dominant_oklch, weight: 1 },
    ]);
    expect(dotsFor(withoutPalette, "all", 0.08)).toEqual([]);
    expect(dotsFor({ ...record, palette: [] }, "dominant", 0.08)[0]?.weight).toBe(1);
    expect(dotsFor({ ...record, palette: [] }, "all", 0.08)).toEqual([]);
  });
});
