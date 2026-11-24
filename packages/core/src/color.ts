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
  if (pixels.length === 0) throw new Error("no pixels");
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
