import { oklabDistance, oklchToOklab } from "./color.js";
import type { Facets, Lab, LibraryQuery, LibraryRecord, Oklch, Point, Selection } from "./schema.js";

export type Dot = {
  imageId: string;
  hex: string;
  oklch: Oklch;
  weight: number;
};

export function wheelPoint(oklch: Oklch, maxChroma: number): Point {
  const radius = maxChroma <= 1e-6 ? 0 : Math.min(1, oklch.C / maxChroma);
  const rad = (oklch.h * Math.PI) / 180;
  return { x: radius * Math.sin(rad), y: radius * Math.cos(rad) };
}

export function hueInWedge(hue: number, start: number, end: number): boolean {
  const norm = (value: number) => ((value % 360) + 360) % 360;
  const current = norm(hue);
  const from = norm(start);
  const to = norm(end);
  if (from <= to) return current >= from && current <= to;
  return current >= from || current <= to;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const crosses = a.y > point.y !== b.y > point.y;
    if (!crosses) continue;
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 0) + a.x;
    if (point.x < x) inside = !inside;
  }
  return inside;
}

export function maxChroma(records: LibraryRecord[]): number {
  let max = 0;
  for (const record of records) {
    max = Math.max(max, record.dominant_oklch.C);
    for (const swatch of record.palette) max = Math.max(max, swatch.oklch.C);
  }
  return max;
}

export function selectionMatches(record: LibraryRecord, selection: Selection, libraryMaxChroma: number): boolean {
  switch (selection.type) {
    case "all":
      return true;
    case "ids":
      return selection.ids.includes(record.id);
    case "neighborhood":
    case "brush": {
      const lab = oklchToOklab(record.dominant_oklch);
      const limit = selection.type === "neighborhood" ? selection.tolerance : selection.radius;
      return oklabDistance(lab, selection.lab) <= limit;
    }
    case "wedge":
      return hueInWedge(record.dominant_oklch.h, selection.startHue, selection.endHue);
    case "lasso":
      return pointInPolygon(wheelPoint(record.dominant_oklch, libraryMaxChroma), selection.points);
    case "ring": {
      const radius = libraryMaxChroma <= 1e-6 ? 0 : record.dominant_oklch.C / libraryMaxChroma;
      const inner = Math.min(selection.inner, selection.outer);
      const outer = Math.max(selection.inner, selection.outer);
      return radius >= inner && radius <= outer;
    }
    default: {
      const unreachable: never = selection;
      return unreachable;
    }
  }
}

function tagMatches(record: LibraryRecord, facets: Facets): boolean {
  if (!facets.tags) return true;
  return facets.tags.every((tag) => {
    const answer = record.answers.find((item) => item.question_id === tag.questionId);
    if (!answer) return false;
    if (typeof tag.equals === "boolean") {
      const probability = answer.probability ?? 0;
      return tag.equals ? probability >= tag.minProbability : probability <= 1 - tag.minProbability;
    }
    if (answer.value !== tag.equals) return false;
    const keyed = answer.probabilities?.[String(tag.equals)];
    const probability = keyed ?? answer.confidence ?? answer.probability ?? 0;
    return probability >= tag.minProbability;
  });
}

export function facetMatches(record: LibraryRecord, facets: Facets): boolean {
  if (facets.orientation && !facets.orientation.includes(record.orientation)) return false;
  if (facets.aspect_ratio && !facets.aspect_ratio.includes(record.aspect_ratio)) return false;
  if (facets.sharpness && !facets.sharpness.includes(record.sharpness)) return false;
  if (facets.temperature && !facets.temperature.includes(record.temperature)) return false;
  if (facets.monochrome !== undefined && record.is_monochrome !== facets.monochrome) return false;
  if (facets.lightness && (record.dominant_oklch.L < facets.lightness.min || record.dominant_oklch.L > facets.lightness.max)) {
    return false;
  }
  if (facets.status && !facets.status.includes(record.status)) return false;
  if (facets.favorites && (record.rating ?? 0) < 1) return false;
  if (facets.neverUsed && record.used_count !== 0) return false;
  if (facets.needsTags !== undefined && record.needs_tags !== facets.needsTags) return false;
  return tagMatches(record, facets);
}

export function matchLibrary(records: LibraryRecord[], query: LibraryQuery): LibraryRecord[] {
  const needsChroma = query.selection.type === "lasso" || query.selection.type === "ring";
  const peak = needsChroma ? maxChroma(records) : 0;
  return records.filter((record) => selectionMatches(record, query.selection, peak) && facetMatches(record, query.facets));
}

export function applySelection(current: string[], incoming: string[], mode: "replace" | "add" | "subtract"): string[] {
  if (mode === "replace") return [...incoming];
  const set = new Set(current);
  for (const id of incoming) {
    if (mode === "add") set.add(id);
    else set.delete(id);
  }
  return [...set];
}

export type QuadItem = { id: string; x: number; y: number };

export class Quadtree {
  private readonly items: QuadItem[] = [];
  private readonly children: Quadtree[] = [];

  constructor(
    private readonly bounds: { x0: number; y0: number; x1: number; y1: number },
    private readonly capacity = 8,
  ) {}

  insert(item: QuadItem): void {
    if (!this.contains(item.x, item.y)) return;
    if (this.children.length > 0) {
      for (const child of this.children) child.insert(item);
      return;
    }
    this.items.push(item);
    if (this.items.length <= this.capacity) return;
    this.split();
  }

  queryCircle(x: number, y: number, radius: number): QuadItem[] {
    const found: QuadItem[] = [];
    this.collectCircle(x, y, radius, found);
    return found;
  }

  private collectCircle(x: number, y: number, radius: number, found: QuadItem[]): void {
    if (!this.intersectsCircle(x, y, radius)) return;
    for (const item of this.items) {
      if (Math.hypot(item.x - x, item.y - y) <= radius) found.push(item);
    }
    for (const child of this.children) child.collectCircle(x, y, radius, found);
  }

  private split(): void {
    const { x0, y0, x1, y1 } = this.bounds;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const quadrants = [
      { x0, y0, x1: mx, y1: my },
      { x0: mx, y0, x1, y1: my },
      { x0, y0: my, x1: mx, y1 },
      { x0: mx, y0: my, x1, y1 },
    ];
    for (const bounds of quadrants) this.children.push(new Quadtree(bounds, this.capacity));
    const moving = this.items.splice(0, this.items.length);
    for (const item of moving) {
      for (const child of this.children) child.insert(item);
    }
  }

  private contains(x: number, y: number): boolean {
    return x >= this.bounds.x0 && x <= this.bounds.x1 && y >= this.bounds.y0 && y <= this.bounds.y1;
  }

  private intersectsCircle(x: number, y: number, radius: number): boolean {
    const cx = Math.min(Math.max(x, this.bounds.x0), this.bounds.x1);
    const cy = Math.min(Math.max(y, this.bounds.y0), this.bounds.y1);
    return Math.hypot(cx - x, cy - y) <= radius;
  }
}

export type WheelCursor = { hue: number; radius: number; brush: number };

export function reduceWheelKey(state: WheelCursor, key: string): WheelCursor {
  switch (key) {
    case "ArrowLeft":
      return { ...state, hue: (state.hue + 360 - 5) % 360 };
    case "ArrowRight":
      return { ...state, hue: (state.hue + 5) % 360 };
    case "ArrowUp":
      return { ...state, radius: Math.min(1, state.radius + 0.05) };
    case "ArrowDown":
      return { ...state, radius: Math.max(0, state.radius - 0.05) };
    case "+":
    case "=":
      return { ...state, brush: Math.min(0.5, Math.round((state.brush + 0.02) * 1000) / 1000) };
    case "-":
    case "_":
      return { ...state, brush: Math.max(0.02, Math.round((state.brush - 0.02) * 1000) / 1000) };
    default:
      return state;
  }
}

export function dotsFor(record: LibraryRecord, mode: "dominant" | "all", minWeight: number): Dot[] {
  if (mode === "dominant") {
    return [{ imageId: record.id, hex: record.dominant_hex, oklch: record.dominant_oklch, weight: record.palette[0]?.weight ?? 1 }];
  }
  return record.palette
    .filter((swatch) => swatch.weight >= minWeight)
    .map((swatch) => ({ imageId: record.id, hex: swatch.hex, oklch: swatch.oklch, weight: swatch.weight }));
}

export function hueSymbol(hue: number): string {
  const symbols = ["●", "■", "▲", "◆", "✚", "✦", "▣", "◉", "⬟", "✶", "◍", "▢"];
  const index = Math.floor((((hue % 360) + 360) % 360) / 30) % symbols.length;
  return symbols[index] ?? "●";
}

export function needsReview(record: LibraryRecord): boolean {
  if (record.needs_tags) return true;
  return record.answers.some((answer) => {
    if (answer.type === "noul") {
      const probability = answer.probability ?? 0;
      return probability >= 0.4 && probability <= 0.6;
    }
    if (answer.type === "choice" || answer.type === "score") return (answer.confidence ?? 1) < 0.6;
    return false;
  });
}

export function labOfRecord(record: LibraryRecord): Lab {
  return oklchToOklab(record.dominant_oklch);
}
