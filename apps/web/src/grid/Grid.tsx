import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
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
const TOGGLE_DELAY_MS = 200;

type GridTileProps = {
  record: PublicRecord;
  index: number;
  tile: number;
  left: number;
  top: number;
  inTray: boolean;
  tabStop: boolean;
  onFocus: (id: string) => void;
  onScheduleToggle: (id: string) => void;
  onInspectTile: (id: string) => void;
};

const GridTile = memo(function GridTile({
  record,
  index,
  tile,
  left,
  top,
  inTray,
  tabStop,
  onFocus,
  onScheduleToggle,
  onInspectTile,
}: GridTileProps) {
  return (
    <button
      data-photo-id={record.id}
      className={`tile${inTray ? " tile-in-tray" : ""}`}
      style={{
        width: tile,
        height: tile,
        left,
        top,
        backgroundColor: record.dominant_hex,
      }}
      tabIndex={tabStop ? 0 : -1}
      aria-pressed={inTray}
      aria-label={`Photo ${index + 1}`}
      onFocus={() => onFocus(record.id)}
      onClick={() => onScheduleToggle(record.id)}
      onDoubleClick={() => onInspectTile(record.id)}
    >
      <img
        src={`/api/media/${record.id}?kind=thumb`}
        alt=""
        loading="lazy"
        decoding="async"
        width={tile}
        height={tile}
        draggable={false}
      />
      {inTray ? <span className="tray-check" aria-hidden="true">✓</span> : null}
    </button>
  );
});

export function Grid(props: GridProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const tile = props.tile ?? 160;
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const toggleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const scrollRafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(0);
  const { onFocus, onToggle, onInspect } = props;

  const traySet = useMemo(() => new Set(props.trayIds), [props.trayIds]);
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

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!props.focusId || !grid) return;
    const button = grid.querySelector<HTMLButtonElement>(`[data-photo-id="${props.focusId}"]`);
    if (button) {
      if (document.activeElement !== button) button.focus();
      return;
    }
    const index = props.records.findIndex((record) => record.id === props.focusId);
    if (index < 0) return;
    const top = Math.floor(index / columns) * rowHeight;
    if (grid.scrollTop !== top) {
      grid.scrollTop = top;
      setScrollTop(top);
    }
  }, [props.focusId, props.records, columns, rowHeight]);

  useEffect(() => () => {
    for (const timer of toggleTimers.current.values()) clearTimeout(timer);
    toggleTimers.current.clear();
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const cancelToggle = useCallback((id: string) => {
    const timer = toggleTimers.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    toggleTimers.current.delete(id);
  }, []);

  const scheduleToggle = useCallback((id: string) => {
    cancelToggle(id);
    const timer = setTimeout(() => {
      toggleTimers.current.delete(id);
      onToggle(id);
    }, TOGGLE_DELAY_MS);
    toggleTimers.current.set(id, timer);
  }, [cancelToggle, onToggle]);

  const inspectTile = useCallback((id: string) => {
    cancelToggle(id);
    onInspect(id);
  }, [cancelToggle, onInspect]);

  const focusTile = useCallback((id: string) => {
    onFocus(id);
  }, [onFocus]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  }, []);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const { records, focusId } = props;
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
  }, [props.records, props.focusId, onFocus, onInspect, tile]);

  return (
    <div className="grid-wrap" ref={wrapRef} tabIndex={-1}>
      <div
        className="grid"
        ref={gridRef}
        data-count={props.records.length}
        onScroll={handleScroll}
      >
        <div className="grid-inner" style={{ height: totalHeight }}>
          {visible.map((record, offset) => {
            const index = range.start + offset;
            const inTray = traySet.has(record.id);
            const focused = props.focusId === record.id;
            const tabStop = focused || (props.focusId === null && offset === 0);
            const col = index % columns;
            const row = Math.floor(index / columns);
            return (
              <GridTile
                key={record.id}
                record={record}
                index={index}
                tile={tile}
                left={col * (tile + GAP)}
                top={row * rowHeight}
                inTray={inTray}
                tabStop={tabStop}
                onFocus={focusTile}
                onScheduleToggle={scheduleToggle}
                onInspectTile={inspectTile}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}