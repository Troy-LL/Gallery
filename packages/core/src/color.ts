import type { Lab, Oklch, Swatch } from "./schema.js";

export type Rgb = { r: number; g: number; b: number };

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const value = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToOklch(lab: Lab): Oklch {
  const C = Math.min(0.5, Math.hypot(lab.a, lab.b));
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (!Number.isFinite(h) || C < 1e-4) h = 0;
  if (h < 0) h += 360;
  if (h >= 360) h = 0;
  return { L: Math.min(1, Math.max(0, lab.L)), C, h };
}

export function oklchToOklab(oklch: Oklch): Lab {
  const rad = (oklch.h * Math.PI) / 180;
  return { L: oklch.L, a: oklch.C * Math.cos(rad), b: oklch.C * Math.sin(rad) };
}

export function oklabDistance(left: Lab, right: Lab): number {
  return Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b);
}

export function oklabDistanceSquared(left: Lab, right: Lab): number {
  const dL = left.L - right.L;
  const da = left.a - right.a;
  const db = left.b - right.b;
  return dL * dL + da * da + db * db;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) throw new Error(`invalid hex ${hex}`);
  const value = match[1] ?? "000000";
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === red) h = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;
  return { h: h * 60, s, l };
}

export function swatchFromRgb(rgb: Rgb, weight: number): Swatch {
  const lab = rgbToOklab(rgb.r, rgb.g, rgb.b);
  const oklch = oklabToOklch(lab);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return {
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    h: hsl.h,
    s: hsl.s,
    l: hsl.l,
    oklch,
    weight,
  };
}

export function extractPalette(pixels: Rgb[], requested = 5): Swatch[] {
  const n = pixels.length;
  if (n === 0) throw new Error("no pixels");
  const ptL = new Float64Array(n);
  const ptA = new Float64Array(n);
  const ptB = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const pixel = pixels[i];
    const lr = srgbToLinear(pixel.r);
    const lg = srgbToLinear(pixel.g);
    const lb = srgbToLinear(pixel.b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    ptL[i] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    ptA[i] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    ptB[i] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  }
  const k = Math.max(1, Math.min(Math.floor(requested), n));
  const cL = new Float64Array(k);
  const cA = new Float64Array(k);
  const cB = new Float64Array(k);
  for (let index = 0; index < k; index += 1) {
    const pick = Math.floor((index * n) / k);
    cL[index] = ptL[pick];
    cA[index] = ptA[pick];
    cB[index] = ptB[pick];
  }
  const assignments = new Int32Array(n);
  const sumL = new Float64Array(k);
  const sumA = new Float64Array(k);
  const sumB = new Float64Array(k);
  const counts = new Int32Array(k);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    counts.fill(0);
    for (let p = 0; p < n; p += 1) {
      const pL = ptL[p];
      const pA = ptA[p];
      const pB = ptB[p];
      let best = 0;
      let bestDistSq = Number.POSITIVE_INFINITY;
      for (let c = 0; c < k; c += 1) {
        const dL = pL - cL[c];
        const da = pA - cA[c];
        const db = pB - cB[c];
        const distSq = dL * dL + da * da + db * db;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          best = c;
        }
      }
      assignments[p] = best;
      sumL[best] += pL;
      sumA[best] += pA;
      sumB[best] += pB;
      counts[best] += 1;
    }
    for (let c = 0; c < k; c += 1) {
      const count = counts[c];
      if (count === 0) continue;
      cL[c] = sumL[c] / count;
      cA[c] = sumA[c] / count;
      cB[c] = sumB[c] / count;
    }
  }
  const ranked: { index: number; count: number }[] = [];
  for (let c = 0; c < k; c += 1) {
    const count = counts[c];
    if (count > 0) ranked.push({ index: c, count });
  }
  ranked.sort((left, right) => right.count - left.count);
  const top = ranked.slice(0, 5);
  let total = 0;
  for (const entry of top) total += entry.count;
  return top.map((entry) => {
    const { r, g, b } = oklabToRgb({ L: cL[entry.index], a: cA[entry.index], b: cB[entry.index] });
    return swatchFromRgb({ r, g, b }, entry.count / total);
  });
}

export function oklabToRgb(lab: Lab): Rgb {
  const l = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  };
}

export function dominantOf(palette: Swatch[]): Swatch {
  const first = palette[0];
  if (!first) throw new Error("empty palette");
  return first;
}
