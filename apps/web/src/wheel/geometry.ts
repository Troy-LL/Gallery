import { wheelPoint, type Oklch, type Point } from "@gallery/core";

export type WheelMetrics = {
  size: number;
  center: number;
  outerR: number;
  ringStroke: number;
  clearance: number;
  gap: number;
  dotRadius: number;
  plotR: number;
  sections: [number, number];
};

export function dotRadiusForCount(count: number, size: number): number {
  const scale = size / 240;
  const t = Math.log10(Math.max(count, 1) / 24);
  const base = Math.min(3, Math.max(1.25, 3 - t));
  return base * scale;
}

export function wheelMetrics(size: number, dotRadius: number): WheelMetrics {
  const center = size / 2;
  const outerR = size * 0.42;
  const clearance = Math.max(6, size * 0.025);
  const plotR = Math.max(0, outerR - clearance - dotRadius);
  return { size, center, outerR, ringStroke: 2, clearance, gap: clearance, dotRadius, plotR, sections: [plotR * 0.33, plotR * 0.66] };
}

export function dotCanvasPosition(oklch: Oklch, maxChroma: number, metrics: WheelMetrics): Point {
  const point = wheelPoint(oklch, maxChroma);
  return { x: metrics.center + point.x * metrics.plotR, y: metrics.center - point.y * metrics.plotR };
}

export function pointerToWheel(px: number, py: number, metrics: WheelMetrics): Point {
  if (metrics.plotR === 0) return { x: 0, y: 0 };
  return { x: (px - metrics.center) / metrics.plotR, y: -(py - metrics.center) / metrics.plotR };
}
