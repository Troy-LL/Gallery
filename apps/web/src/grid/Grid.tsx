import { useState } from "react";
import type { PublicRecord } from "../api/client";
import { visibleRange } from "./window";

export function Grid(props: { records: PublicRecord[]; onOpen: (id: string) => void }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [tile, setTile] = useState(160);
  const columns = 4;
  const range = visibleRange(scrollTop, 640, tile + 8, props.records.length, columns);
  const visible = props.records.slice(range.start, range.end);
  return (
    <div className="grid-wrap">
      <label>
        Tile size
        <input aria-label="Tile size" type="range" min={96} max={280} value={tile} onChange={(event) => setTile(Number(event.target.value))} />
      </label>
      <div className="grid" data-count={props.records.length} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {visible.map((record) => (
          <button key={record.id} className="tile" style={{ width: tile, height: tile }} onClick={() => props.onOpen(record.id)}>
            <img src={`/api/media/${record.id}?kind=thumb`} alt="" />
            {record.needs_tags ? <span className="badge">needs tags</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
