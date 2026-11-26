import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  hueSymbol,
  oklchToOklab,
  reduceWheelKey,
  wheelPoint,
  type LibrarySummary,
  type Point,
  type WheelCursor,
} from "@gallery/core";
import {
  buildWheelIndex,
  countGestureMatches,
  hexAtCanvasPoint,
  selectBrushIds,
  selectGestureIds,
} from "./geometry";
import { classifyGesture, type Gesture, type WheelTool } from "./gesture";

const DOT = 3;
const GUIDE = "rgba(20, 20, 19, 0.35)";

function drawGuides(context: CanvasRenderingContext2D, center: number, radius: number): void {
  context.strokeStyle = GUIDE;
  context.lineWidth = 1;
  context.lineCap = "butt";
  context.setLineDash([]);
  for (const fraction of [1, 2 / 3, 1 / 3]) {
    context.beginPath();
    context.arc(center, center, radius * fraction, 0, Math.PI * 2);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(center - radius, center);
  context.lineTo(center + radius, center);
  context.moveTo(center, center - radius);
  context.lineTo(center, center + radius);
  context.stroke();
}

function devicePixelRatioValue(): number {
  if (typeof window === "undefined") return 1;
  const ratio = window.devicePixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export function Wheel(props: {
  records: LibrarySummary[];
  maxChroma: number;
  tool: WheelTool;
  multiSwatch: boolean;
  large?: boolean;
  colorBlind?: boolean;
  selectedIds: string[];
  onSelect: (ids: string[], mode: "replace" | "add" | "subtract") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ start: Point; points: Point[]; radius: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const [cursor, setCursor] = useState<WheelCursor>({ hue: 0, radius: 0.4, brush: 0.08 });
  const [hoverHex, setHoverHex] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ gesture: Gesture; count: number; points: Point[] } | null>(null);

  const size = props.large ? 520 : 240;
  const dpr = devicePixelRatioValue();
  const pixelSize = Math.round(size * dpr);
  const ringRadius = size * 0.42;
  const chroma = Math.max(props.maxChroma, 0.001);
  const hasSelection = props.selectedIds.length > 0;
  const colorBlind = props.colorBlind === true;

  const index = useMemo(
    () => buildWheelIndex(props.records, props.multiSwatch, chroma, size),
    [props.records, props.multiSwatch, chroma, size],
  );

  const visibleDotIndices = useMemo(() => {
    if (!hasSelection) return null;
    const selected = new Set(props.selectedIds);
    const { dotCount, dotRecordIndex, recordIds } = index;
    let count = 0;
    for (let d = 0; d < dotCount; d += 1) {
      if (selected.has(recordIds[dotRecordIndex[d]])) count += 1;
    }
    const indices = new Int32Array(count);
    let cursorIdx = 0;
    for (let d = 0; d < dotCount; d += 1) {
      if (selected.has(recordIds[dotRecordIndex[d]])) {
        indices[cursorIdx] = d;
        cursorIdx += 1;
      }
    }
    return indices;
  }, [index, hasSelection, props.selectedIds]);

  const latestRef = useRef({ index, tool: props.tool });
  latestRef.current = { index, tool: props.tool };

  function cancelPendingFrame() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    dirtyRef.current = false;
  }

  useEffect(() => cancelPendingFrame, []);

  useEffect(() => {
    if (!hasSelection) setDraft(null);
  }, [hasSelection]);

  useEffect(() => {
    const base = baseRef.current ?? document.createElement("canvas");
    if (base.width !== pixelSize || base.height !== pixelSize) {
      base.width = pixelSize;
      base.height = pixelSize;
    }
    const context = base.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
    drawGuides(context, size / 2, ringRadius);

    const { dotCount, dotX, dotY, dotHex, dotHue } = index;
    const count = visibleDotIndices ? visibleDotIndices.length : dotCount;
    for (let k = 0; k < count; k += 1) {
      const d = visibleDotIndices ? visibleDotIndices[k] : k;
      context.fillStyle = dotHex[d];
      context.beginPath();
      context.arc(dotX[d], dotY[d], DOT, 0, Math.PI * 2);
      context.fill();
    }

    if (hasSelection) {
      context.strokeStyle = "#141413";
      context.lineWidth = 1;
      for (let k = 0; k < count; k += 1) {
        const d = visibleDotIndices ? visibleDotIndices[k] : k;
        context.beginPath();
        context.arc(dotX[d], dotY[d], DOT + 2, 0, Math.PI * 2);
        context.stroke();
      }
    }

    if (colorBlind) {
      context.font = "12px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 3;
      context.strokeStyle = "#fcfcfb";
      context.fillStyle = "#141413";
      for (let k = 0; k < count; k += 1) {
        const d = visibleDotIndices ? visibleDotIndices[k] : k;
        const symbol = hueSymbol(dotHue[d]);
        const x = dotX[d];
        const y = dotY[d];
        context.strokeText(symbol, x, y);
        context.fillText(symbol, x, y);
      }
    }

    baseRef.current = base;
  }, [index, visibleDotIndices, hasSelection, colorBlind, size, pixelSize, dpr, ringRadius]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const base = baseRef.current;
    if (!canvas || !context || !base) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
    context.drawImage(base, 0, 0, size, size);
    if (draft) drawGesture(context, draft.gesture, draft.points, size, ringRadius);
    const placed = wheelPoint(cursorColor(cursor, props.maxChroma), chroma);
    const center = size / 2;
    context.beginPath();
    context.arc(center + placed.x * ringRadius, center - placed.y * ringRadius, Math.max(4, cursor.brush * ringRadius), 0, Math.PI * 2);
    context.strokeStyle = "#141413";
    context.lineWidth = 1.5;
    context.stroke();
  }, [index, visibleDotIndices, hasSelection, colorBlind, props.maxChroma, chroma, cursor, draft, size, dpr, ringRadius]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (event.key === " ") {
      event.preventDefault();
      const gesture = classifyGesture("brush", cursor.radius, 0);
      const mode = event.shiftKey ? "add" : event.altKey ? "subtract" : "replace";
      selectGesture(gesture, mode);
      return;
    }
    const next = reduceWheelKey(cursor, event.key);
    if (next === cursor) return;
    event.preventDefault();
    setCursor(next);
  }

  function selectGesture(gesture: ReturnType<typeof classifyGesture>, mode: "replace" | "add" | "subtract") {
    switch (gesture) {
      case "brush": {
        const lab = oklchToOklab(cursorColor(cursor, props.maxChroma));
        const ids = selectBrushIds(index, lab, cursor.brush);
        props.onSelect(ids, mode);
        return;
      }
      case "click":
      case "eyedropper":
      case "wedge":
      case "lasso":
      case "ring":
        return;
      default: {
        const unreachable: never = gesture;
        return unreachable;
      }
    }
  }

  function hexAt(event: ReactPointerEvent<HTMLCanvasElement>): string | null {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || size;
    const height = rect.height || size;
    const left = rect.width ? rect.left : 0;
    const top = rect.height ? rect.top : 0;
    const px = ((event.clientX - left) / width) * size;
    const py = ((event.clientY - top) / height) * size;
    return hexAtCanvasPoint(index, px, py);
  }

  function localPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width || size;
    const height = rect.height || size;
    const x = ((event.clientX - rect.left) / width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / height) * 2 - 1);
    return { x, y };
  }

  function flushDraft() {
    const current = drag.current;
    if (!current) return;
    const end = current.points[current.points.length - 1] ?? current.start;
    const moved = Math.hypot(end.x - current.start.x, end.y - current.start.y);
    const { index: activeIndex, tool } = latestRef.current;
    const gesture = classifyGesture(tool, current.radius, moved);
    const count = countGestureMatches(activeIndex, gesture, current.start, current.points);
    setDraft({ gesture, count, points: current.points.slice() });
  }

  function scheduleFrame() {
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!dirtyRef.current || !drag.current) return;
      dirtyRef.current = false;
      flushDraft();
      scheduleFrame();
    });
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    const hadDirty = dirtyRef.current;
    cancelPendingFrame();
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const end = localPoint(event);
    const points = [...current.points, end];
    const moved = Math.hypot(end.x - current.start.x, end.y - current.start.y);
    const gesture = classifyGesture(props.tool, current.radius, moved);
    const mode = event.shiftKey ? "add" : event.altKey ? "subtract" : "replace";
    const ids = selectGestureIds(index, gesture, current.start, points);
    if (hadDirty) setDraft({ gesture, count: ids.length, points });
    props.onSelect(ids, mode);
  }

  return (
    <div className="wheel-minimap">
      <canvas
        ref={canvasRef}
        width={pixelSize}
        height={pixelSize}
        style={{ width: size, height: size }}
        aria-label="Color wheel"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          cancelPendingFrame();
          const start = localPoint(event);
          drag.current = { start, points: [start], radius: Math.hypot(start.x, start.y) };
        }}
        onPointerMove={(event) => {
          if (colorBlind) {
            const next = hexAt(event);
            setHoverHex((current) => (current === next ? current : next));
          }
          if (!drag.current) return;
          drag.current.points.push(localPoint(event));
          if (rafRef.current === null) {
            flushDraft();
            scheduleFrame();
          } else {
            dirtyRef.current = true;
          }
        }}
        onPointerLeave={() => setHoverHex(null)}
        onPointerCancel={() => {
          cancelPendingFrame();
          drag.current = null;
        }}
        onPointerUp={finish}
      />
      <output className="wheel-selection" aria-live="polite" aria-label="Wheel selection">
        {draft ? `${gestureLabel(draft.gesture)} · ${draft.count} photos` : `${props.selectedIds.length} selected`}
      </output>
      {colorBlind && hoverHex ? (
        <output className="wheel-hex" aria-label="Hovered swatch">{hoverHex}</output>
      ) : null}
    </div>
  );
}

function drawGesture(context: CanvasRenderingContext2D, gesture: Gesture, points: Point[], size: number, ring: number): void {
  const start = points[0];
  const end = points.at(-1) ?? start;
  if (!start || !end) return;
  const center = size / 2;
  context.strokeStyle = "#141413";
  context.lineWidth = 1.5;
  context.setLineDash([5, 4]);
  switch (gesture) {
    case "lasso": {
      context.beginPath();
      points.forEach((point, index) => {
        const placed = toCanvas(point, size);
        if (index === 0) context.moveTo(placed.x, placed.y);
        else context.lineTo(placed.x, placed.y);
      });
      context.closePath();
      context.stroke();
      break;
    }
    case "wedge": {
      const from = ray(start, center, ring);
      const to = ray(end, center, ring);
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(from.x, from.y);
      context.moveTo(center, center);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.beginPath();
      context.arc(center, center, ring, Math.atan2(from.y - center, from.x - center), Math.atan2(to.y - center, to.x - center));
      context.stroke();
      break;
    }
    case "ring": {
      const inner = Math.min(Math.hypot(start.x, start.y), Math.hypot(end.x, end.y));
      const outer = Math.max(Math.hypot(start.x, start.y), Math.hypot(end.x, end.y));
      context.beginPath();
      context.arc(center, center, inner * center, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(center, center, outer * center, 0, Math.PI * 2);
      context.stroke();
      break;
    }
    case "brush":
    case "click":
    case "eyedropper": {
      const placed = toCanvas(start, size);
      context.beginPath();
      context.arc(placed.x, placed.y, (gesture === "brush" ? 0.12 : 0.08) * center, 0, Math.PI * 2);
      context.stroke();
      break;
    }
    default: {
      const unreachable: never = gesture;
      context.setLineDash([]);
      return unreachable;
    }
  }
  context.setLineDash([]);
}

function toCanvas(point: Point, size: number): Point {
  return { x: ((point.x + 1) / 2) * size, y: ((1 - point.y) / 2) * size };
}

function ray(point: Point, center: number, ring: number): Point {
  const dx = point.x * center;
  const dy = -point.y * center;
  const mag = Math.hypot(dx, dy) || 1;
  return { x: center + (dx / mag) * ring, y: center + (dy / mag) * ring };
}

function gestureLabel(gesture: Gesture): string {
  switch (gesture) {
    case "wedge":
      return "Wedge";
    case "lasso":
      return "Lasso";
    case "ring":
      return "Ring";
    case "brush":
      return "Brush";
    case "click":
      return "Click";
    case "eyedropper":
      return "Eyedropper";
    default: {
      const unreachable: never = gesture;
      return unreachable;
    }
  }
}

function cursorColor(cursor: WheelCursor, maxChroma: number): { L: number; C: number; h: number } {
  return { L: 0.5, C: cursor.radius * Math.max(maxChroma, 0.001), h: cursor.hue };
}