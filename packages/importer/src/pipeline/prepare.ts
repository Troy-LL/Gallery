import { createHash } from "node:crypto";
import exifr from "exifr";
import sharp from "sharp";
import { deterministicEmbedding, dominantOf, type LibraryRecord, type SourceType } from "@gallery/core";
import { aspectBucket, averageHash, orientationOf, resolutionTier, summarizePixels, type Pixel } from "./metrics.js";
import { isBaselineJpeg, targetJevSize } from "./size.js";

export type PreparedStill = {
  partial: Omit<LibraryRecord, "id" | "file_path" | "thumbnail_path">;
  working: Buffer;
  thumbnail: Buffer;
  jev: Buffer;
};

const VIDEO = new Set([".mov", ".mp4", ".m4v"]);

export function isIgnoredMedia(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return false;
  return VIDEO.has(filename.slice(dot).toLowerCase());
}

export async function prepareStill(
  input: Buffer,
  source: { sourceType: SourceType; sourceRef: string | null; addedAt?: string },
  limits: { workingPx: number } = { workingPx: 2048 },
): Promise<PreparedStill> {
  const hash = createHash("sha256").update(input).digest("hex");
  const upright = sharp(input, { failOn: "none", limitInputPixels: 80_000_000 }).rotate();
  const working = await upright
    .clone()
    .resize({ width: limits.workingPx, height: limits.workingPx, fit: "inside", withoutEnlargement: true })
    .jpeg({ progressive: false, quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(working.data).resize({ width: 320, height: 320, fit: "inside" }).jpeg({ quality: 70, progressive: false }).toBuffer();
  const sample = await sharp(working.data).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const hashSample = await sharp(working.data).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  const pixels = pixelsFrom(sample, 64, 64);
  const gray = new Uint8Array(64 * 64);
  for (let index = 0; index < pixels.length; index += 1) {
    const pixel = pixels[index];
    gray[index] = pixel ? Math.round(0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b) : 0;
  }
  const summary = summarizePixels(pixels, 64, 64, gray);
  const dominant = dominantOf(summary.palette);
  const exif = await readExif(input);
  const width = working.info.width;
  const height = working.info.height;
  const jev = await encodeJev(working.data);
  if (!isBaselineJpeg(jev)) throw new Error("jev copy is not baseline jpeg");
  const addedAt = source.addedAt ?? new Date().toISOString();
  return {
    working: working.data,
    thumbnail,
    jev,
    partial: {
      width,
      height,
      orientation: orientationOf(width, height),
      aspect_ratio: aspectBucket(width, height),
      file_size: working.data.length + thumbnail.length,
      hash,
      phash: averageHash(hashSample),
      created_at: exif.takenAt ?? addedAt,
      added_at: addedAt,
      media_type: "image/jpeg",
      source_type: source.sourceType,
      source_ref: source.sourceRef,
      embedding: deterministicEmbedding(working.data),
      taken_at: exif.takenAt,
      lat: exif.lat,
      lon: exif.lon,
      place_name: null,
      camera: exif.camera,
      lens: exif.lens,
      dominant_hex: dominant.hex,
      dominant_h: dominant.h,
      dominant_s: dominant.s,
      dominant_l: dominant.l,
      dominant_oklch: dominant.oklch,
      palette: summary.palette,
      avg_luminance: summary.avgLuminance,
      contrast: summary.contrast,
      temperature: summary.temperature,
      is_monochrome: summary.isMonochrome,
      saturation: summary.saturation,
      sharpness: summary.sharpness,
      negative_space: summary.negativeSpace,
      composition: summary.composition,
      resolution_tier: resolutionTier(width, height),
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
    },
  };
}

export function finishRecord(partial: PreparedStill["partial"], id: string, filePath: string, thumbnailPath: string): LibraryRecord {
  return { ...partial, id, file_path: filePath, thumbnail_path: thumbnailPath };
}

export async function encodeJev(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const fit = targetJevSize(meta.width ?? 1, meta.height ?? 1);
  let image = sharp(input).resize(fit.width, fit.height, { fit: "fill" });
  if (fit.padLeft || fit.padRight || fit.padTop || fit.padBottom) {
    image = image.extend({
      left: fit.padLeft,
      right: fit.padRight,
      top: fit.padTop,
      bottom: fit.padBottom,
      background: { r: 0, g: 0, b: 0 },
    });
  }
  return image.jpeg({ progressive: false, quality: 85 }).toBuffer();
}

export async function encodeExport(input: Buffer, options: { keepExif: boolean; width: number }): Promise<Buffer> {
  const rotated = sharp(input, { failOn: "none" }).rotate();
  const sized = rotated.resize({ width: options.width, height: options.width, fit: "inside", withoutEnlargement: false });
  const image = options.keepExif ? sized.withMetadata() : sized;
  return image.jpeg({ progressive: false, quality: 85 }).toBuffer();
}

async function readExif(input: Buffer): Promise<{ takenAt: string | null; lat: number | null; lon: number | null; camera: string | null; lens: string | null }> {
  try {
    const parsed = await exifr.parse(input, { gps: true, reviveValues: true });
    if (!parsed) return { takenAt: null, lat: null, lon: null, camera: null, lens: null };
    const taken = parsed.DateTimeOriginal ?? parsed.CreateDate;
    const make = typeof parsed.Make === "string" ? parsed.Make : "";
    const model = typeof parsed.Model === "string" ? parsed.Model : "";
    const camera = `${make} ${model}`.trim();
    return {
      takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : null,
      lat: typeof parsed.latitude === "number" ? parsed.latitude : null,
      lon: typeof parsed.longitude === "number" ? parsed.longitude : null,
      camera: camera || null,
      lens: typeof parsed.LensModel === "string" ? parsed.LensModel : null,
    };
  } catch {
    return { takenAt: null, lat: null, lon: null, camera: null, lens: null };
  }
}

function pixelsFrom(raw: Buffer, width: number, height: number): Pixel[] {
  const pixels: Pixel[] = [];
  for (let index = 0; index < width * height; index += 1) {
    pixels.push({ r: raw[index * 3] ?? 0, g: raw[index * 3 + 1] ?? 0, b: raw[index * 3 + 2] ?? 0 });
  }
  return pixels;
}
