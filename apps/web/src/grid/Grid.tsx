import { useEffect, useRef, useState } from "react";
import type { PublicRecord } from "../api/client";
import { visibleRange } from "./window";

export type GridProps = {
  records: PublicRecord[];
  trayIds: string[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onToggle: (id: string) => void;
  onInspect: (id: string) => void;
  tile?: number;
  onTile?: (value: number) => void;
};

export function Grid(props: GridProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const tile = props.tile ?? 160;
  const wrapRef = useRef<HTMLDivElement>(null);
  const columns = 4;
  const range = visibleRange(scrollTop, 640, tile + 8, props.records.length, columns);
  const visible = props.records.slice(range.start, range.end);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const { records, focusId, onFocus, onInspect } = props;
    function onKeyDown(event: KeyboardEvent) {
      const wrap = wrapRef.current;
      if (!wrap) return;
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
      const index = records.findIndex((record) => record.id === focusId);
      if (index < 0) return;
      const column = index % columns;
      const row = Math.floor(index / columns);
      let next = index;
      if (event.key === "ArrowLeft") next = column > 0 ? index - 1 : index;
      if (event.key === "ArrowRight") next = column < columns - 1 && index + 1 < records.length ? index + 1 : index;
      if (event.key === "ArrowUp") next = row > 0 ? index - columns : index;
      if (event.key === "ArrowDown") next = index + columns < records.length ? index + columns : index;
      const record = records[next];
      if (record) onFocus(record.id);
    }
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [columns, props.records, props.focusId, props.onFocus, props.onInspect]);

  return (
    <div className="grid-wrap" ref={wrapRef} tabIndex={-1}>
      <div className="grid" data-count={props.records.length} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {visible.map((record) => {
          const inTray = props.trayIds.includes(record.id);
          const focused = props.focusId === record.id;
          return (
            <button
              key={record.id}
              className={`tile${inTray ? " tile-in-tray" : ""}`}
              style={{ width: tile, height: tile }}
              tabIndex={focused ? 0 : -1}
              aria-pressed={inTray}
              onFocus={() => props.onFocus(record.id)}
              onClick={() => props.onToggle(record.id)}
              onDoubleClick={() => props.onInspect(record.id)}
            >
              <img src={`/api/media/${record.id}?kind=thumb`} alt="" draggable={false} />
              {inTray ? <span className="tray-check" aria-hidden="true">✓</span> : null}
              {record.needs_tags ? <span className="badge">needs tags</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}