import { useEffect, useState } from "react";
import type { PublicRecord } from "../api/client";
import { saveCuration } from "../api/client";

export type LightboxProps = {
  record: PublicRecord;
  records: PublicRecord[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onChange: () => void;
};

export function Lightbox(props: LightboxProps) {
  const [status, setStatus] = useState(props.record.status);
  const favorite = (props.record.rating ?? 0) >= 1;

  useEffect(() => {
    setStatus(props.record.status);
  }, [props.record.id, props.record.status]);

  useEffect(() => {
    const { record, records, onClose, onNavigate } = props;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      const index = records.findIndex((item) => item.id === record.id);
      if (index < 0) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = records[index - 1];
        if (prev) onNavigate(prev.id);
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = records[index + 1];
        if (next) onNavigate(next.id);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.record, props.records, props.onClose, props.onNavigate]);

  async function save(patch: unknown) {
    await saveCuration(props.record.id, patch);
    props.onChange();
  }

  return (
    <div className="lightbox" role="dialog" aria-label="Inspect photo">
      <button type="button" onClick={props.onClose}>Close</button>
      <img src={`/api/media/${props.record.id}?kind=working`} alt="" />
      <div className="swatches">
        {props.record.palette.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            style={{ background: swatch.hex }}
            aria-label={`Use ${swatch.hex}`}
            onClick={() => save({ dominant_hex: swatch.hex })}
          >
            {swatch.hex}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={favorite}
        onClick={() => save({ rating: favorite ? 0 : 1 })}
      >
        {favorite ? "Unfavorite" : "Favorite"}
      </button>
      <label>
        Status
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            const next = event.target.value as PublicRecord["status"];
            setStatus(next);
            void save({ status: next });
          }}
        >
          {(["unreviewed", "shortlisted", "approved", "rejected", "archived"] as const).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
    </div>
  );
}