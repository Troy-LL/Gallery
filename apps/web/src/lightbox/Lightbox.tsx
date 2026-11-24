import { useState } from "react";
import type { PublicRecord } from "../api/client";
import { saveCuration } from "../api/client";

export function Lightbox(props: { record: PublicRecord; onClose: () => void; onChange: () => void }) {
  const [notes, setNotes] = useState(props.record.notes ?? "");
  const [status, setStatus] = useState(props.record.status);
  async function save(patch: unknown) {
    await saveCuration(props.record.id, patch);
    props.onChange();
  }
  return (
    <div className="lightbox" role="dialog" aria-label="Photo">
      <button onClick={props.onClose}>Close</button>
      <img src={`/api/media/${props.record.id}?kind=working`} alt="" />
      <div className="swatches">
        {props.record.palette.map((swatch) => (
          <button key={swatch.hex} style={{ background: swatch.hex }} aria-label={`Use ${swatch.hex}`} onClick={() => save({ dominant_hex: swatch.hex })}>
            {swatch.hex}
          </button>
        ))}
      </div>
      <ul>
        {props.record.answers.map((answer) => (
          <li key={answer.question_id}>
            {answer.question_id}: {String(answer.value)}
            <button onClick={() => save({ answer: { ...answer, value: answer.value } })}>Lock tag</button>
          </li>
        ))}
      </ul>
      <label>
        Status
        <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as PublicRecord["status"])}>
          {["unreviewed", "shortlisted", "approved", "rejected", "archived"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea aria-label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <button onClick={() => save({ status, notes, rating: (props.record.rating ?? 0) >= 1 ? 0 : 1 })}>Save curation</button>
      {props.record.subject_box ? <p>Subject box is on this frame.</p> : null}
    </div>
  );
}
