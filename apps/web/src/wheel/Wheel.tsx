import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { dotsFor, hueInWedge, pointInPolygon, selectionMatches, wheelPoint, hueSymbol, type LibraryRecord } from "@gallery/core";
import type { PublicRecord } from "../api/client";
import { classifyGesture, type WheelTool } from "./gesture";

type Point = { x: number; y: number };

export function Wheel(props: {
  records: PublicRecord[];
  maxChroma: number;
  tool: WheelTool;
  colorBlind: boolean;
  multiSwatch: boolean;
  large?: boolean;
  onSelect: (ids: string[], mode: "replace" | "add" | "subtract") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ start: Point; points: Point[]; radius: number } | null>(null);
  const size = props.large ? 520 : 240;
  const records = props.records.map((record) => ({ ...record, embedding: null })) as LibraryRecord[];

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, size, size);
    context.fillStyle = "#1c1916";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "#3a342c";
    context.beginPath();
    context.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    context.stroke();
    const dots = records.flatMap((record) => dotsFor(record, props.multiSwatch ? "all" : "dominant", 0.08));
    for (const dot of dots) {
      const point = wheelPoint(dot.oklch, Math.max(props.maxChroma, 0.001));
      const x = size / 2 + point.x * size * 0.42;
      const y = size / 2 - point.y * size * 0.42;
      context.fillStyle = dot.hex;
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      if (props.colorBlind) {
        context.fillStyle = "#f4efe6";
        context.font = "10px sans-serif";
        context.fillText(hueSymbol(dot.oklch.h), x + 6, y);
      }
    }
  }, [records, props.maxChroma, props.multiSwatch, props.colorBlind, size]);

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
    if (gesture === "click" || gesture === "eyedropper") {
      const dot = wheelPoint(record.dominant_oklch, Math.max(props.maxChroma, 0.001));
      return Math.hypot(dot.x - start.x, dot.y - start.y) <= 0.08;
    }
    if (gesture === "wedge") {
      const end = points[points.length - 1] ?? start;
      return hueInWedge(record.dominant_oklch.h, angle(start), angle(end));
    }
    if (gesture === "lasso") return pointInPolygon(wheelPoint(record.dominant_oklch, Math.max(props.maxChroma, 0.001)), points);
    if (gesture === "ring") {
      const inner = Math.min(Math.hypot(start.x, start.y), Math.hypot((points.at(-1)?.x ?? start.x), points.at(-1)?.y ?? start.y));
      const outer = Math.max(Math.hypot(start.x, start.y), Math.hypot((points.at(-1)?.x ?? start.x), points.at(-1)?.y ?? start.y));
      return selectionMatches(record, { type: "ring", inner, outer }, Math.max(props.maxChroma, 0.001));
    }
    if (gesture === "brush") {
      return selectionMatches(record, { type: "brush", lab: labFrom(start), radius: 0.12 }, props.maxChroma);
    }
    return false;
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-label="Color wheel"
      tabIndex={0}
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
  );
}

function angle(point: Point): number {
  return (Math.atan2(point.x, point.y) * 180) / Math.PI;
}

function labFrom(point: Point): { L: number; a: number; b: number } {
  return { L: 0.5, a: point.x * 0.2, b: point.y * 0.2 };
}
