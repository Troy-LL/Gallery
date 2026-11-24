import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicRecord } from "../api/client";
import { columnCount, visibleRange } from "./window";

export type GridProps = {
  records: PublicRecord[];
  trayIds: string[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onToggle: (id: string) => void;
  onInspect: (id: string) => void;
  tile?: number;
};

const GAP = 8;

export function Grid(props: GridProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const tile = props.tile ?? 160;
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = columnCount(gridWidth || 640, tile, GAP);
  const rowHeight = tile + GAP;
  const range = visibleRange(scrollTop, viewportHeight || 640, rowHeight, props.records.length, columns);
  const visible = props.records.slice(range.start, range.end);
  const totalHeight = props.records.length === 0 ? 0 : Math.ceil(props.records.length / columns) * rowHeight;

  useLayoutEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const measure = (entries?: ResizeObserverEntry[]) => {
      const entry = entries?.[0];
      setGridWidth(entry?.contentRect.width ?? node.clientWidth);
      setViewportHeight(entry?.contentRect.height ?? node.clientHeight);
    };
    measure();
    const observer = new ResizeObserver((entries) => measure(entries));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const { records, focusId, onFocus, onInspect } = props;
    function onKeyDown(event: KeyboardEvent) {
      const wrap = wrapRef.current;
      const grid = gridRef.current;
      if (!wrap || !grid) return;
      const target = event.target;
      if (!(target instanceof Node) || (target !== wrap && !wrap.contains(target))) return;
      if (event.key === "Escape") {
        onFocus(null);
        return;
      }
      if (event.key === " " && focusId) {
        event.preventDefault();
        onInspect(focusId);
        return;
      }
      if (!focusId || (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      const width = grid.clientWidth || 640;
      const cols = columnCount(width, tile, GAP);
      const index = records.findIndex((record) => record.id === focusId);
      if (index < 0) return;
      const column = index % cols;
      const row = Math.floor(index / cols);
      let next = index;
      if (event.key === "ArrowLeft") next = column > 0 ? index - 1 : index;
      if (event.key === "ArrowRight") next = column < cols - 1 && index + 1 < records.length ? index + 1 : index;
      if (event.key === "ArrowUp") next = row > 0 ? index - cols : index;
      if (event.key === "ArrowDown") next = index + cols < records.length ? index + cols : index;
      const record = records[next];
      if (record) onFocus(record.id);
    }
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [props.records, props.focusId, props.onFocus, props.onInspect, tile]);

  return (
    <div className="grid-wrap" ref={wrapRef} tabIndex={-1}>
      <div
        className="grid"
        ref={gridRef}
        data-count={props.records.length}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="grid-inner" style={{ height: totalHeight }}>
          {visible.map((record, offset) => {
            const index = range.start + offset;
            const inTray = props.trayIds.includes(record.id);
            const focused = props.focusId === record.id;
            const tabStop = focused || (props.focusId === null && offset === 0);
            const col = index % columns;
            const row = Math.floor(index / columns);
            return (
              <button
                key={record.id}
                className={`tile${inTray ? " tile-in-tray" : ""}`}
                style={{
                  width: tile,
                  height: tile,
                  left: col * (tile + GAP),
                  top: row * rowHeight,
                }}
                tabIndex={tabStop ? 0 : -1}
                aria-pressed={inTray}
                aria-label={`Photo ${index + 1}`}
                onFocus={() => props.onFocus(record.id)}
                onClick={(event) => {
                  if (event.detail > 1) return;
                  props.onToggle(record.id);
                }}
                onDoubleClick={() => props.onInspect(record.id)}
              >
                <img src={`/api/media/${record.id}?kind=thumb`} alt="" draggable={false} />
                {inTray ? <span className="tray-check" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}