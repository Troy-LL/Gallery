import { wheelPoint, type Lab, type LibrarySummary, type Oklch, type Point } from "@gallery/core";
import type { Gesture } from "./gesture";

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

export type WheelRecord = Pick<LibrarySummary, "id" | "dominant_hex" | "dominant_oklch" | "palette">;

export type WheelIndex = {
  size: number;
  ringRadius: number;
  chroma: number;
  recordCount: number;
  recordIds: string[];
  wx: Float64Array;
  wy: Float64Array;
  hue: Float64Array;
  chromaRatio: Float64Array;
  labL: Float64Array;
  labA: Float64Array;
  labB: Float64Array;
  recordGridCols: number;
  recordCellHead: Int32Array;
  recordNext: Int32Array;
  dotCount: number;
  dotRecordIndex: Int32Array;
  dotX: Float64Array;
  dotY: Float64Array;
  dotHex: string[];
  dotHue: Float64Array;
  dotCellSize: number;
  dotGridCols: number;
  dotCellHead: Int32Array;
  dotNext: Int32Array;
};

const RECORD_GRID_COLS = 16;
const DOT_CELL_SIZE = 16;
const MIN_SWATCH_WEIGHT = 0.08;
const CLICK_RADIUS = 0.08;
const BRUSH_RADIUS = 0.12;
const HOVER_RADIUS = 12;

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angle(point: Point): number {
  return (Math.atan2(point.x, point.y) * 180) / Math.PI;
}

function labFrom(point: Point): Lab {
  return { L: 0.5, a: point.x * 0.2, b: point.y * 0.2 };
}

function pointInPolygonCoords(px: number, py: number, polygon: readonly Point[]): boolean {
  let inside = false;
  const len = polygon.length;
  for (let i = 0, j = len - 1; i < len; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    if ((a.y > py) !== (b.y > py)) {
      const x = ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x;
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

function polygonBounds(polygon: readonly Point[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (polygon.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const point = polygon[i];
    if (!point) continue;
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return null;
  return { minX, maxX, minY, maxY };
}

export function buildWheelIndex(
  records: readonly WheelRecord[],
  multiSwatch: boolean,
  chroma: number,
  size: number,
): WheelIndex {
  const center = size / 2;
  const ringRadius = size * 0.42;
  const safeChroma = chroma <= 1e-6 ? 0 : chroma;
  let recordCount = 0;
  let dotCount = 0;

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record || !record.dominant_oklch) continue;
    recordCount += 1;
    if (!multiSwatch) {
      dotCount += 1;
    } else if (Array.isArray(record.palette)) {
      for (let s = 0; s < record.palette.length; s += 1) {
        const swatch = record.palette[s];
        if (swatch && swatch.oklch && swatch.weight >= MIN_SWATCH_WEIGHT) dotCount += 1;
      }
    }
  }

  const recordIds = new Array<string>(recordCount);
  const wx = new Float64Array(recordCount);
  const wy = new Float64Array(recordCount);
  const hue = new Float64Array(recordCount);
  const chromaRatio = new Float64Array(recordCount);
  const labL = new Float64Array(recordCount);
  const labA = new Float64Array(recordCount);
  const labB = new Float64Array(recordCount);
  const recordCellHead = new Int32Array(RECORD_GRID_COLS * RECORD_GRID_COLS).fill(-1);
  const recordNext = new Int32Array(recordCount);

  const dotRecordIndex = new Int32Array(dotCount);
  const dotX = new Float64Array(dotCount);
  const dotY = new Float64Array(dotCount);
  const dotHex = new Array<string>(dotCount);
  const dotHue = new Float64Array(dotCount);
  const dotGridCols = Math.max(1, Math.ceil(size / DOT_CELL_SIZE));
  const dotCellHead = new Int32Array(dotGridCols * dotGridCols).fill(-1);
  const dotNext = new Int32Array(dotCount);

  let ri = 0;
  let di = 0;
  const degToRad = Math.PI / 180;

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record || !record.dominant_oklch) continue;
    const oklch = record.dominant_oklch;
    const ratio = safeChroma === 0 ? 0 : oklch.C / safeChroma;
    const clamped = ratio > 1 ? 1 : ratio;
    const rad = oklch.h * degToRad;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const rx = clamped * sin;
    const ry = clamped * cos;

    recordIds[ri] = record.id;
    wx[ri] = rx;
    wy[ri] = ry;
    hue[ri] = normalizeHue(oklch.h);
    chromaRatio[ri] = ratio;
    labL[ri] = oklch.L;
    labA[ri] = oklch.C * cos;
    labB[ri] = oklch.C * sin;

    if (!multiSwatch) {
      dotRecordIndex[di] = ri;
      dotX[di] = center + rx * ringRadius;
      dotY[di] = center - ry * ringRadius;
      dotHex[di] = record.dominant_hex;
      dotHue[di] = oklch.h;
      di += 1;
    } else if (Array.isArray(record.palette)) {
      for (let s = 0; s < record.palette.length; s += 1) {
        const swatch = record.palette[s];
        if (!swatch || !swatch.oklch || swatch.weight < MIN_SWATCH_WEIGHT) continue;
        const sRatio = safeChroma === 0 ? 0 : swatch.oklch.C / safeChroma;
        const sClamped = sRatio > 1 ? 1 : sRatio;
        const sRad = swatch.oklch.h * degToRad;
        dotRecordIndex[di] = ri;
        dotX[di] = center + sClamped * Math.sin(sRad) * ringRadius;
        dotY[di] = center - sClamped * Math.cos(sRad) * ringRadius;
        dotHex[di] = swatch.hex;
        dotHue[di] = swatch.oklch.h;
        di += 1;
      }
    }
    ri += 1;
  }

  const recordHalf = RECORD_GRID_COLS / 2;
  for (let i = recordCount - 1; i >= 0; i -= 1) {
    const col = clampInt(Math.floor((wx[i] + 1) * recordHalf), 0, RECORD_GRID_COLS - 1);
    const row = clampInt(Math.floor((wy[i] + 1) * recordHalf), 0, RECORD_GRID_COLS - 1);
    const cell = row * RECORD_GRID_COLS + col;
    recordNext[i] = recordCellHead[cell];
    recordCellHead[cell] = i;
  }

  const invDotCell = 1 / DOT_CELL_SIZE;
  for (let d = dotCount - 1; d >= 0; d -= 1) {
    const col = clampInt(Math.floor(dotX[d] * invDotCell), 0, dotGridCols - 1);
    const row = clampInt(Math.floor(dotY[d] * invDotCell), 0, dotGridCols - 1);
    const cell = row * dotGridCols + col;
    dotNext[d] = dotCellHead[cell];
    dotCellHead[cell] = d;
  }

  return {
    size,
    ringRadius,
    chroma,
    recordCount,
    recordIds,
    wx,
    wy,
    hue,
    chromaRatio,
    labL,
    labA,
    labB,
    recordGridCols: RECORD_GRID_COLS,
    recordCellHead,
    recordNext,
    dotCount,
    dotRecordIndex,
    dotX,
    dotY,
    dotHex,
    dotHue,
    dotCellSize: DOT_CELL_SIZE,
    dotGridCols,
    dotCellHead,
    dotNext,
  };
}

export function hexAtCanvasPoint(index: WheelIndex, px: number, py: number, radius = HOVER_RADIUS): string | null {
  if (index.dotCount === 0) return null;
  if (px + radius < 0 || px - radius > index.size || py + radius < 0 || py - radius > index.size) return null;

  const invCell = 1 / index.dotCellSize;
  const cols = index.dotGridCols;
  const minCol = clampInt(Math.floor((px - radius) * invCell), 0, cols - 1);
  const maxCol = clampInt(Math.floor((px + radius) * invCell), 0, cols - 1);
  const minRow = clampInt(Math.floor((py - radius) * invCell), 0, cols - 1);
  const maxRow = clampInt(Math.floor((py + radius) * invCell), 0, cols - 1);
  const r2 = radius * radius;
  const { dotX, dotY, dotCellHead, dotNext } = index;

  let bestIdx = -1;
  let bestDistSq = r2;
  for (let row = minRow; row <= maxRow; row += 1) {
    const rowOffset = row * cols;
    for (let col = minCol; col <= maxCol; col += 1) {
      for (let d = dotCellHead[rowOffset + col]; d !== -1; d = dotNext[d]) {
        const dx = px - dotX[d];
        const dy = py - dotY[d];
        const distSq = dx * dx + dy * dy;
        if (distSq > r2) continue;
        if (bestIdx === -1 || distSq < bestDistSq || (distSq === bestDistSq && d < bestIdx)) {
          bestDistSq = distSq;
          bestIdx = d;
        }
      }
    }
  }
  return bestIdx === -1 ? null : (index.dotHex[bestIdx] ?? null);
}

export function selectBrushIds(index: WheelIndex, lab: Lab, radius: number): string[] {
  const { recordCount, recordIds, labL, labA, labB } = index;
  const tL = lab.L;
  const tA = lab.a;
  const tB = lab.b;
  const r2 = radius * radius;
  const ids: string[] = [];
  for (let i = 0; i < recordCount; i += 1) {
    const dL = labL[i] - tL;
    const dA = labA[i] - tA;
    const dB = labB[i] - tB;
    if (dL * dL + dA * dA + dB * dB <= r2) ids.push(recordIds[i]);
  }
  return ids;
}

export function countGestureMatches(
  index: WheelIndex,
  gesture: Gesture,
  start: Point,
  points: readonly Point[],
): number {
  const { recordCount } = index;
  if (recordCount === 0) return 0;
  switch (gesture) {
    case "click":
    case "eyedropper": {
      const sx = start.x;
      const sy = start.y;
      if (sx + CLICK_RADIUS < -1 || sx - CLICK_RADIUS > 1 || sy + CLICK_RADIUS < -1 || sy - CLICK_RADIUS > 1) return 0;
      const cols = index.recordGridCols;
      const half = cols / 2;
      const minCol = clampInt(Math.floor((sx - CLICK_RADIUS + 1) * half), 0, cols - 1);
      const maxCol = clampInt(Math.floor((sx + CLICK_RADIUS + 1) * half), 0, cols - 1);
      const minRow = clampInt(Math.floor((sy - CLICK_RADIUS + 1) * half), 0, cols - 1);
      const maxRow = clampInt(Math.floor((sy + CLICK_RADIUS + 1) * half), 0, cols - 1);
      const r2 = CLICK_RADIUS * CLICK_RADIUS;
      const { wx, wy, recordCellHead, recordNext } = index;
      let count = 0;
      for (let row = minRow; row <= maxRow; row += 1) {
        const rowOffset = row * cols;
        for (let col = minCol; col <= maxCol; col += 1) {
          for (let i = recordCellHead[rowOffset + col]; i !== -1; i = recordNext[i]) {
            const dx = wx[i] - sx;
            const dy = wy[i] - sy;
            if (dx * dx + dy * dy <= r2) count += 1;
          }
        }
      }
      return count;
    }
    case "wedge": {
      const end = points[points.length - 1] ?? start;
      const from = normalizeHue(angle(start));
      const to = normalizeHue(angle(end));
      const { hue } = index;
      let count = 0;
      if (from <= to) {
        for (let i = 0; i < recordCount; i += 1) {
          const h = hue[i];
          if (h >= from && h <= to) count += 1;
        }
      } else {
        for (let i = 0; i < recordCount; i += 1) {
          const h = hue[i];
          if (h >= from || h <= to) count += 1;
        }
      }
      return count;
    }
    case "lasso": {
      const bounds = polygonBounds(points);
      if (!bounds) return 0;
      const { minX, maxX, minY, maxY } = bounds;
      const cols = index.recordGridCols;
      const half = cols / 2;
      const minCol = clampInt(Math.floor((minX + 1) * half), 0, cols - 1);
      const maxCol = clampInt(Math.floor((maxX + 1) * half), 0, cols - 1);
      const minRow = clampInt(Math.floor((minY + 1) * half), 0, cols - 1);
      const maxRow = clampInt(Math.floor((maxY + 1) * half), 0, cols - 1);
      const { wx, wy, recordCellHead, recordNext } = index;
      let count = 0;
      for (let row = minRow; row <= maxRow; row += 1) {
        const rowOffset = row * cols;
        for (let col = minCol; col <= maxCol; col += 1) {
          for (let i = recordCellHead[rowOffset + col]; i !== -1; i = recordNext[i]) {
            const px = wx[i];
            const py = wy[i];
            if (px < minX || px > maxX || py < minY || py > maxY) continue;
            if (pointInPolygonCoords(px, py, points)) count += 1;
          }
        }
      }
      return count;
    }
    case "ring": {
      const end = points[points.length - 1] ?? start;
      const rStart = Math.hypot(start.x, start.y);
      const rEnd = Math.hypot(end.x, end.y);
      const inner = rStart < rEnd ? rStart : rEnd;
      const outer = rStart > rEnd ? rStart : rEnd;
      const { chromaRatio } = index;
      let count = 0;
      for (let i = 0; i < recordCount; i += 1) {
        const r = chromaRatio[i];
        if (r >= inner && r <= outer) count += 1;
      }
      return count;
    }
    case "brush": {
      const target = labFrom(start);
      const tL = target.L;
      const tA = target.a;
      const tB = target.b;
      const r2 = BRUSH_RADIUS * BRUSH_RADIUS;
      const { labL, labA, labB } = index;
      let count = 0;
      for (let i = 0; i < recordCount; i += 1) {
        const dL = labL[i] - tL;
        const dA = labA[i] - tA;
        const dB = labB[i] - tB;
        if (dL * dL + dA * dA + dB * dB <= r2) count += 1;
      }
      return count;
    }
    default: {
      const unreachable: never = gesture;
      return unreachable;
    }
  }
}

export function selectGestureIds(
  index: WheelIndex,
  gesture: Gesture,
  start: Point,
  points: readonly Point[],
): string[] {
  const { recordCount, recordIds } = index;
  if (recordCount === 0) return [];
  switch (gesture) {
    case "click":
    case "eyedropper": {
      const sx = start.x;
      const sy = start.y;
      if (sx + CLICK_RADIUS < -1 || sx - CLICK_RADIUS > 1 || sy + CLICK_RADIUS < -1 || sy - CLICK_RADIUS > 1) return [];
      const cols = index.recordGridCols;
      const half = cols / 2;
      const minCol = clampInt(Math.floor((sx - CLICK_RADIUS + 1) * half), 0, cols - 1);
      const maxCol = clampInt(Math.floor((sx + CLICK_RADIUS + 1) * half), 0, cols - 1);
      const minRow = clampInt(Math.floor((sy - CLICK_RADIUS + 1) * half), 0, cols - 1);
      const maxRow = clampInt(Math.floor((sy + CLICK_RADIUS + 1) * half), 0, cols - 1);
      const r2 = CLICK_RADIUS * CLICK_RADIUS;
      const { wx, wy, recordCellHead, recordNext } = index;
      const indices: number[] = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        const rowOffset = row * cols;
        for (let col = minCol; col <= maxCol; col += 1) {
          for (let i = recordCellHead[rowOffset + col]; i !== -1; i = recordNext[i]) {
            const dx = wx[i] - sx;
            const dy = wy[i] - sy;
            if (dx * dx + dy * dy <= r2) indices.push(i);
          }
        }
      }
      indices.sort((left, right) => left - right);
      return indices.map((i) => recordIds[i]);
    }
    case "wedge": {
      const end = points[points.length - 1] ?? start;
      const from = normalizeHue(angle(start));
      const to = normalizeHue(angle(end));
      const { hue } = index;
      const ids: string[] = [];
      if (from <= to) {
        for (let i = 0; i < recordCount; i += 1) {
          const h = hue[i];
          if (h >= from && h <= to) ids.push(recordIds[i]);
        }
      } else {
        for (let i = 0; i < recordCount; i += 1) {
          const h = hue[i];
          if (h >= from || h <= to) ids.push(recordIds[i]);
        }
      }
      return ids;
    }
    case "lasso": {
      const bounds = polygonBounds(points);
      if (!bounds) return [];
      const { minX, maxX, minY, maxY } = bounds;
      const cols = index.recordGridCols;
      const half = cols / 2;
      const minCol = clampInt(Math.floor((minX + 1) * half), 0, cols - 1);
      const maxCol = clampInt(Math.floor((maxX + 1) * half), 0, cols - 1);
      const minRow = clampInt(Math.floor((minY + 1) * half), 0, cols - 1);
      const maxRow = clampInt(Math.floor((maxY + 1) * half), 0, cols - 1);
      const { wx, wy, recordCellHead, recordNext } = index;
      const indices: number[] = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        const rowOffset = row * cols;
        for (let col = minCol; col <= maxCol; col += 1) {
          for (let i = recordCellHead[rowOffset + col]; i !== -1; i = recordNext[i]) {
            const px = wx[i];
            const py = wy[i];
            if (px < minX || px > maxX || py < minY || py > maxY) continue;
            if (pointInPolygonCoords(px, py, points)) indices.push(i);
          }
        }
      }
      indices.sort((left, right) => left - right);
      return indices.map((i) => recordIds[i]);
    }
    case "ring": {
      const end = points[points.length - 1] ?? start;
      const rStart = Math.hypot(start.x, start.y);
      const rEnd = Math.hypot(end.x, end.y);
      const inner = rStart < rEnd ? rStart : rEnd;
      const outer = rStart > rEnd ? rStart : rEnd;
      const { chromaRatio } = index;
      const ids: string[] = [];
      for (let i = 0; i < recordCount; i += 1) {
        const r = chromaRatio[i];
        if (r >= inner && r <= outer) ids.push(recordIds[i]);
      }
      return ids;
    }
    case "brush":
      return selectBrushIds(index, labFrom(start), BRUSH_RADIUS);
    default: {
      const unreachable: never = gesture;
      return unreachable;
    }
  }
}

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
