import { extractPalette, rgbToOklab, type Swatch } from "@gallery/core";
import type { AspectBucket, Orientation, SharpnessLevel, Temperature } from "@gallery/core";

export type Pixel = { r: number; g: number; b: number };

export function orientationOf(width: number, height: number): Orientation {
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.02) return "square";
  return height > width ? "portrait" : "landscape";
}

export function aspectBucket(width: number, height: number): AspectBucket {
  const ratio = width / height;
  const targets: [AspectBucket, number][] = [
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
  ];
  let best: AspectBucket = "other";
  let error = 0.08;
  for (const [name, value] of targets) {
    const delta = Math.abs(ratio - value);
    if (delta < error) {
      error = delta;
      best = name;
    }
  }
  return best;
}

export function laplacianVariance(gray: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  const values = new Float64Array((width - 2) * (height - 2));
  let sum = 0;
  let cursor = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = gray[y * width + x] ?? 0;
      const value =
        (gray[(y - 1) * width + x] ?? 0) +
        (gray[(y + 1) * width + x] ?? 0) +
        (gray[y * width + (x - 1)] ?? 0) +
        (gray[y * width + (x + 1)] ?? 0) -
        4 * center;
      values[cursor] = value;
      sum += value;
      cursor += 1;
    }
  }
  const mean = sum / values.length;
  let deviation = 0;
  for (const value of values) deviation += (value - mean) ** 2;
  return deviation / values.length;
}

export function classifySharpness(variance: number): SharpnessLevel {
  if (variance < 20) return "blurry";
  if (variance < 80) return "soft";
  return "sharp";
}

export function averageHash(gray: Uint8Array): string {
  if (gray.length !== 64) throw new Error("average hash expects 64 samples");
  let sum = 0;
  for (const value of gray) sum += value;
  const mean = sum / gray.length;
  let hex = "";
  for (let index = 0; index < 64; index += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if ((gray[index + bit] ?? 0) >= mean) nibble |= 1 << (3 - bit);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

export function boxAverage8x8(gray: Uint8Array, width: number, height: number): Uint8Array {
  if (width % 8 !== 0 || height % 8 !== 0 || gray.length !== width * height) throw new Error("box average expects a grid divisible by 8");
  const cellWidth = width / 8;
  const cellHeight = height / 8;
  const sums = new Uint32Array(64);
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / cellHeight) * 8;
    for (let x = 0; x < width; x += 1) sums[row + Math.floor(x / cellWidth)]! += gray[y * width + x] ?? 0;
  }
  const area = cellWidth * cellHeight;
  return Uint8Array.from(sums, (sum) => Math.round(sum / area));
}

function temperatureFrom(pixels: number, warmth: number): Temperature {
  if (pixels === 0) return "neutral";
  const mean = warmth / pixels;
  if (mean > 12) return "warm";
  if (mean < -12) return "cool";
  return "neutral";
}

export function summarizePixels(pixels: Pixel[], width: number, height: number, gray: Uint8Array): {
  palette: Swatch[];
  avgLuminance: number;
  contrast: number;
  temperature: Temperature;
  isMonochrome: boolean;
  saturation: number;
  sharpness: SharpnessLevel;
  negativeSpace: number;
  composition: string[];
} {
  const palette = extractPalette(pixels, 5);
  const count = pixels.length;
  const corner = averageCorner(pixels, width, height);
  const lumas = new Float64Array(count);
  let lumaSum = 0;
  let chromaSum = 0;
  let warmth = 0;
  let nearCorner = 0;
  let weight = 0;
  let sx = 0;
  let sy = 0;
  for (let index = 0; index < count; index += 1) {
    const pixel = pixels[index];
    if (!pixel) continue;
    const luma = (0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b) / 255;
    lumas[index] = luma;
    lumaSum += luma;
    const lab = rgbToOklab(pixel.r, pixel.g, pixel.b);
    chromaSum += Math.hypot(lab.a, lab.b);
    warmth += pixel.r - pixel.b;
    const distance = Math.hypot(pixel.r - corner.r, pixel.g - corner.g, pixel.b - corner.b);
    if (distance < 18) nearCorner += 1;
    if (distance >= 24 && index < width * height) {
      weight += distance;
      sx += (index % width) * distance;
      sy += Math.floor(index / width) * distance;
    }
  }
  const avgLuminance = lumaSum / count;
  let lumaDeviation = 0;
  for (const luma of lumas) lumaDeviation += (luma - avgLuminance) ** 2;
  const saturation = chromaSum / count;
  const variance = laplacianVariance(gray, width, height);
  return {
    palette,
    avgLuminance,
    contrast: Math.sqrt(lumaDeviation / count),
    temperature: temperatureFrom(count, warmth),
    isMonochrome: saturation < 0.02,
    saturation,
    sharpness: classifySharpness(variance),
    negativeSpace: nearCorner / count,
    composition: compositionOf(gray, width, height, variance, weight > 0 ? { x: sx / weight / width, y: sy / weight / height } : null),
  };
}

function averageCorner(pixels: Pixel[], width: number, height: number): Pixel {
  const indexes = [0, width - 1, (height - 1) * width, width * height - 1];
  const acc = { r: 0, g: 0, b: 0 };
  for (const index of indexes) {
    const pixel = pixels[index] ?? { r: 0, g: 0, b: 0 };
    acc.r += pixel.r;
    acc.g += pixel.g;
    acc.b += pixel.b;
  }
  return { r: acc.r / indexes.length, g: acc.g / indexes.length, b: acc.b / indexes.length };
}

function compositionOf(gray: Uint8Array, width: number, height: number, variance: number, centroid: { x: number; y: number } | null): string[] {
  const labels: string[] = [];
  const mid = Math.floor(width / 2);
  let diff = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < mid; x += 1) {
      const left = gray[y * width + x] ?? 0;
      const right = gray[y * width + (width - 1 - x)] ?? 0;
      diff += Math.abs(left - right);
      count += 1;
    }
  }
  if (count > 0 && diff / count < 8) labels.push("symmetry");
  labels.push(variance > 40 ? "busy" : "clean");
  if (centroid && Math.hypot(centroid.x - 0.5, centroid.y - 0.5) < 0.18) labels.push("centered");
  return labels;
}

export function resolutionTier(width: number, height: number): "ready" | "low" {
  return Math.min(width, height) >= 1080 ? "ready" : "low";
}
