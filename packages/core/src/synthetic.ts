import { libraryRecordSchema, type LibraryRecord, type Oklch } from "./schema.js";
import { oklchToOklab, oklabToRgb, rgbToHex, rgbToHsl } from "./color.js";

export function syntheticRecord(index: number, overrides: Partial<LibraryRecord> = {}): LibraryRecord {
  const hue = (index * 47) % 360;
  const oklch: Oklch = { L: 0.2 + (index % 5) * 0.15, C: 0.04 + (index % 7) * 0.02, h: hue };
  const rgb = oklabToRgb(oklchToOklab(oklch));
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const orientations = ["portrait", "landscape", "square"] as const;
  const orientation = orientations[index % 3] ?? "square";
  const record: LibraryRecord = {
    id: `img-${index}`,
    file_path: `library/${index}.jpg`,
    thumbnail_path: `thumbs/${index}.jpg`,
    width: orientation === "portrait" ? 800 : 1200,
    height: orientation === "landscape" ? 800 : 1200,
    orientation,
    aspect_ratio: orientation === "square" ? "1:1" : orientation === "portrait" ? "4:5" : "3:2",
    file_size: 1000 + index,
    hash: `hash-${index}`,
    phash: (index % 16).toString(16).padStart(16, "0"),
    created_at: "2026-01-01T00:00:00.000Z",
    added_at: "2026-01-02T00:00:00.000Z",
    media_type: "image/jpeg",
    source_type: "upload",
    source_ref: null,
    embedding: null,
    taken_at: null,
    lat: null,
    lon: null,
    place_name: null,
    camera: null,
    lens: null,
    dominant_hex: hex,
    dominant_h: hsl.h,
    dominant_s: hsl.s,
    dominant_l: hsl.l,
    dominant_oklch: oklch,
    palette: [{ hex, h: hsl.h, s: hsl.s, l: hsl.l, oklch, weight: 1 }],
    avg_luminance: oklch.L,
    contrast: 0.2,
    temperature: hue < 40 || hue > 330 ? "warm" : hue > 180 && hue < 280 ? "cool" : "neutral",
    is_monochrome: false,
    saturation: oklch.C,
    sharpness: index % 11 === 0 ? "blurry" : "sharp",
    negative_space: 0.2,
    composition: [],
    resolution_tier: "low",
    model_version: null,
    analyzed_at: null,
    vocab_version: null,
    answers: [],
    has_text: false,
    subject_box: null,
    locked_fields: [],
    needs_tags: true,
    rating: null,
    status: "unreviewed",
    notes: null,
    source_credit: null,
    used_count: 0,
    last_used_at: null,
  };
  return libraryRecordSchema.parse({ ...record, ...overrides });
}
