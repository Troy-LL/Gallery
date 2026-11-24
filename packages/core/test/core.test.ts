import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyAnswerLock,
  applyDominantHex,
  answersToChips,
  coverCrop,
  extractPalette,
  harmonyHues,
  hueInWedge,
  keywordChips,
  knn,
  layoutPreview,
  matchHarmony,
  matchLibrary,
  mergeAnalysis,
  modelVersionSchema,
  parsePlatformConfig,
  parseSettings,
  percentile,
  pointInPolygon,
  reduceWheelKey,
  subjectPreservingCrop,
  subjectIsCropped,
  syntheticRecord,
  vocabularyFileSchema,
  workingCopyPx,
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
