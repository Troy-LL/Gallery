import { useRef, type DragEvent } from "react";
import type { PublicRecord } from "../api/client";

export type TrayProps = {
  records: PublicRecord[];
  orderedIds: string[];
  onReorder: (ids: string[]) => void;
  onToggle: (id: string) => void;
  onInspect: (id: string) => void;
  stripExif: boolean;
  onStripExif: (value: boolean) => void;
  platformId: string;
  exporting: boolean;
  onExport: () => void;
};

export function Tray(props: TrayProps) {
  const dragId = useRef<string | null>(null);
  const count = props.orderedIds.length;
  const exportDisabled = count === 0 || props.exporting;
  const exportLabel = props.exporting ? "Exporting…" : `Export ${props.platformId} zip`;

  function move(dragged: string, target: string) {
    if (dragged === target) return;
    props.onReorder(reorder(props.orderedIds, dragged, target));
  }

  function onDrop(event: DragEvent<HTMLButtonElement>, targetId: string) {
    event.preventDefault();
    const dragged = dragId.current;
    dragId.current = null;
    if (!dragged) return;
    move(dragged, targetId);
  }

  return (
    <section className="tray" aria-label="Selection">
      <p className={count > 0 ? "tray-count" : "tray-empty"}>
        {count > 0 ? `${count} in selection` : "Click photos to build a selection"}
      </p>
      <ol className="tray-ids" role="listbox" aria-label="Selection order">
        {props.orderedIds.map((id) => {
          const record = props.records.find((item) => item.id === id);
          return (
            <li key={id}>
              <button
                type="button"
                className="tray-tile"
                role="option"
                aria-selected="true"
                draggable
                onDragStart={() => {
                  dragId.current = id;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, id)}
                onClick={() => props.onToggle(id)}
                onDoubleClick={() => props.onInspect(id)}
                onKeyDown={(event) => {
                  if (event.key === " ") {
                    event.preventDefault();
                    props.onInspect(id);
                  }
                }}
              >
                {record ? <img src={`/api/media/${id}?kind=thumb`} alt="" width={48} height={48} draggable={false} /> : id}
                <span className="tray-check" aria-hidden="true">✓</span>
              </button>
            </li>
          );
        })}
      </ol>
      <label className="export-options">
        <input type="checkbox" checked={props.stripExif} aria-label="Strip EXIF" onChange={(event) => props.onStripExif(event.target.checked)} />
        Strip EXIF
      </label>
      <button type="button" className="chrome-btn primary" disabled={exportDisabled} onClick={props.onExport}>
        {exportLabel}
      </button>
    </section>
  );
}

function reorder(ids: string[], dragged: string, target: string): string[] {
  const from = ids.indexOf(dragged);
  const to = ids.indexOf(target);
  if (from < 0 || to < 0) return ids;
  const copy = [...ids];
  const [item] = copy.splice(from, 1);
  if (!item) return ids;
  copy.splice(to, 0, item);
  return copy;
}