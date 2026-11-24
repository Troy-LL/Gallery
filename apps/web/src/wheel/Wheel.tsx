import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  dotsFor,
  hueInWedge,
  oklchToOklab,
  oklabToRgb,
  pointInPolygon,
  reduceWheelKey,
  rgbToHex,
  selectionMatches,
  wheelPoint,
  type LibraryRecord,
  type WheelCursor,
} from "@gallery/core";
import type { PublicRecord } from "../api/client";
import { classifyGesture, type WheelTool } from "./gesture";

type Point = { x: number; y: number };

const RING_CHROMA = 0.14;
const RING_LIGHTNESS = 0.7;

function canvasHueRadians(hue: number): number {
  return ((hue - 90) * Math.PI) / 180;
}

function drawHueRing(context: CanvasRenderingContext2D, center: number, radius: number, lineWidth: number): void {
  context.lineWidth = lineWidth;
  context.lineCap = "butt";
  for (let hue = 0; hue < 360; hue += 1) {
    const rgb = oklabToRgb(oklchToOklab({ L: RING_LIGHTNESS, C: RING_CHROMA, h: hue }));
    context.strokeStyle = rgbToHex(rgb.r, rgb.g, rgb.b);
    context.beginPath();
    context.arc(center, center, radius, canvasHueRadians(hue), canvasHueRadians(hue + 1));
    context.stroke();
  }
}

export function Wheel(props: {
  records: PublicRecord[];
  maxChroma: number;
  tool: WheelTool;
  multiSwatch: boolean;
  large?: boolean;
  selectedIds: string[];
  onSelect: (ids: string[], mode: "replace" | "add" | "subtract") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ start: Point; points: Point[]; radius: number } | null>(null);
  const [cursor, setCursor] = useState<WheelCursor>({ hue: 0, radius: 0.4, brush: 0.08 });
  const size = props.large ? 520 : 240;
  const records = props.records.map((record) => ({ ...record, embedding: null })) as LibraryRecord[];
  const ringRadius = size * 0.42;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const selected = new Set(props.selectedIds);
    const center = size / 2;
    context.clearRect(0, 0, size, size);
    drawHueRing(context, center, ringRadius, 2);
    const dots = records.flatMap((record) => dotsFor(record, props.multiSwatch ? "all" : "dominant", 0.08));
    for (const dot of dots) {
      const point = wheelPoint(dot.oklch, Math.max(props.maxChroma, 0.001));
      const x = center + point.x * ringRadius;
      const y = center - point.y * ringRadius;
      context.fillStyle = dot.hex;
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      if (!selected.has(dot.imageId)) continue;
      context.beginPath();
      context.arc(x, y, 8, 0, Math.PI * 2);
      context.strokeStyle = "#fcfcfb";
      context.lineWidth = 3;
      context.stroke();
      context.beginPath();
      context.arc(x, y, 8, 0, Math.PI * 2);
      context.strokeStyle = "#141413";
      context.lineWidth = 1;
      context.stroke();
    }
    const placed = wheelPoint(cursorColor(cursor, props.maxChroma), Math.max(props.maxChroma, 0.001));
    const cursorX = center + placed.x * ringRadius;
    const cursorY = center - placed.y * ringRadius;
    context.beginPath();
    context.arc(cursorX, cursorY, Math.max(4, cursor.brush * ringRadius), 0, Math.PI * 2);
    context.strokeStyle = "#141413";
    context.lineWidth = 1.5;
    context.stroke();
  }, [records, props.maxChroma, props.multiSwatch, props.selectedIds, cursor, size, ringRadius]);

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
        const ids = records
          .filter((record) => selectionMatches(record, { type: "brush", lab, radius: cursor.brush }, props.maxChroma))
          .map((record) => record.id);
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

  function localPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    return { x, y };
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const end = localPoint(event);
    const moved = Math.hypot(end.x - current.start.x, end.y - current.start.y);
    const gesture = classifyGesture(props.tool, current.radius, moved);
    const mode = event.shiftKey ? "add" : event.altKey ? "subtract" : "replace";
    const ids = records
      .filter((record) => matches(record, gesture, current.start, [...current.points, end]))
      .map((record) => record.id);
    props.onSelect(ids, mode);
  }

  function matches(record: LibraryRecord, gesture: ReturnType<typeof classifyGesture>, start: Point, points: Point[]): boolean {
    const chroma = Math.max(props.maxChroma, 0.001);
    switch (gesture) {
      case "click":
      case "eyedropper": {
        const dot = wheelPoint(record.dominant_oklch, chroma);
        return Math.hypot(dot.x - start.x, dot.y - start.y) <= 0.08;
      }
      case "wedge": {
        const end = points[points.length - 1] ?? start;
        return hueInWedge(record.dominant_oklch.h, angle(start), angle(end));
      }
      case "lasso":
        return pointInPolygon(wheelPoint(record.dominant_oklch, chroma), points);
      case "ring": {
        const end = points.at(-1) ?? start;
        const inner = Math.min(Math.hypot(start.x, start.y), Math.hypot(end.x, end.y));
        const outer = Math.max(Math.hypot(start.x, start.y), Math.hypot(end.x, end.y));
        return selectionMatches(record, { type: "ring", inner, outer }, chroma);
      }
      case "brush":
        return selectionMatches(record, { type: "brush", lab: labFrom(start), radius: 0.12 }, props.maxChroma);
      default: {
        const unreachable: never = gesture;
        return unreachable;
      }
    }
  }

  return (
    <div className="wheel-minimap">
      <span className="wheel-hue">HUE</span>
      <span className="wheel-saturation">SATURATION: less → more</span>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        aria-label="Color wheel"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          const start = localPoint(event);
          drag.current = { start, points: [start], radius: Math.hypot(start.x, start.y) };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          drag.current.points.push(localPoint(event));
        }}
        onPointerUp={finish}
      />
    </div>
  );
}

function cursorColor(cursor: WheelCursor, maxChroma: number): { L: number; C: number; h: number } {
  return { L: 0.5, C: cursor.radius * Math.max(maxChroma, 0.001), h: cursor.hue };
}

function angle(point: Point): number {
  return (Math.atan2(point.x, point.y) * 180) / Math.PI;
}

function labFrom(point: Point): { L: number; a: number; b: number } {
  return { L: 0.5, a: point.x * 0.2, b: point.y * 0.2 };
}