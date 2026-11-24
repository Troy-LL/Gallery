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
  const values: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = gray[y * width + x] ?? 0;
      const value =
        (gray[(y - 1) * width + x] ?? 0) +
        (gray[(y + 1) * width + x] ?? 0) +
        (gray[y * width + (x - 1)] ?? 0) +
        (gray[y * width + (x + 1)] ?? 0) -
        4 * center;
      values.push(value);
    }
  }
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
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

export function temperatureOf(pixels: Pixel[]): Temperature {
  if (pixels.length === 0) return "neutral";
  let score = 0;
  for (const pixel of pixels) score += pixel.r - pixel.b;
  const mean = score / pixels.length;
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
  const lumas = pixels.map((pixel) => (0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b) / 255);
  const avgLuminance = lumas.reduce((sum, value) => sum + value, 0) / lumas.length;
  const contrast = Math.sqrt(lumas.reduce((sum, value) => sum + (value - avgLuminance) ** 2, 0) / lumas.length);
  const chromas = pixels.map((pixel) => rgbToOklab(pixel.r, pixel.g, pixel.b)).map((lab) => Math.hypot(lab.a, lab.b));
  const saturation = chromas.reduce((sum, value) => sum + value, 0) / chromas.length;
  const variance = laplacianVariance(gray, width, height);
  const corner = averageCorner(pixels, width, height);
  let nearCorner = 0;
  for (const pixel of pixels) {
    if (Math.hypot(pixel.r - corner.r, pixel.g - corner.g, pixel.b - corner.b) < 18) nearCorner += 1;
  }
  return {
    palette,
    avgLuminance,
    contrast,
    temperature: temperatureOf(pixels),
    isMonochrome: saturation < 0.02,
    saturation,
    sharpness: classifySharpness(variance),
    negativeSpace: nearCorner / pixels.length,
    composition: compositionOf(pixels, width, height, gray, variance),
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

function compositionOf(pixels: Pixel[], width: number, height: number, gray: Uint8Array, variance: number): string[] {
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
  const corner = averageCorner(pixels, width, height);
  let weight = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = pixels[y * width + x];
      if (!pixel) continue;
      const distance = Math.hypot(pixel.r - corner.r, pixel.g - corner.g, pixel.b - corner.b);
      if (distance < 24) continue;
      weight += distance;
      sx += x * distance;
      sy += y * distance;
    }
  }
  if (weight > 0) {
    const cx = sx / weight / width;
    const cy = sy / weight / height;
    if (Math.hypot(cx - 0.5, cy - 0.5) < 0.18) labels.push("centered");
  }
  return labels;
}

export function resolutionTier(width: number, height: number): "ready" | "low" {
  return Math.min(width, height) >= 1080 ? "ready" : "low";
}
