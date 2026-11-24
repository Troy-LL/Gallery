import { layoutPreview, type PlatformConfig } from "@gallery/core";
import type { PublicRecord } from "../api/client";

export function Preview(props: {
  records: PublicRecord[];
  orderedIds: string[];
  platforms: PlatformConfig[];
  caption: string;
  onCaption: (value: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  theme: "light" | "dark";
  focus: "compare" | "focus";
  platformId: string;
  onPlatform: (id: string) => void;
  onTheme: (theme: "light" | "dark") => void;
  onFocus: (focus: "compare" | "focus") => void;
}) {
  const ordered = props.orderedIds
    .map((id) => props.records.find((record) => record.id === id))
    .filter((record): record is PublicRecord => Boolean(record));
  const platforms = props.focus === "focus" ? props.platforms.filter((item) => item.id === props.platformId) : props.platforms;
  return (
    <section className={`preview theme-${props.theme}`}>
      <div className="preview-bar">
        {props.platforms.map((platform) => (
          <button key={platform.id} aria-pressed={platform.id === props.platformId} onClick={() => props.onPlatform(platform.id)}>
            {platform.id}
          </button>
        ))}
        <button aria-pressed={props.theme === "light"} onClick={() => props.onTheme("light")}>Light</button>
        <button aria-pressed={props.theme === "dark"} onClick={() => props.onTheme("dark")}>Dark</button>
        <button aria-pressed={props.focus === "compare"} onClick={() => props.onFocus("compare")}>Compare</button>
        <button aria-pressed={props.focus === "focus"} onClick={() => props.onFocus("focus")}>Focus</button>
      </div>
      <label>
        Caption
        <textarea aria-label="Caption" value={props.caption} onChange={(event) => props.onCaption(event.target.value)} />
      </label>
      <ol className="order">
        {ordered.map((record) => (
          <li key={record.id}>
            <img src={`/api/media/${record.id}?kind=thumb`} alt="" />
            <button onClick={() => props.onMove(record.id, -1)}>Move earlier</button>
            <button onClick={() => props.onMove(record.id, 1)}>Move later</button>
          </li>
        ))}
      </ol>
      <div className="cards">
        {platforms.map((platform) => {
          const surface = platform.surfaces[0];
          if (!surface) return null;
          const layout = layoutPreview({
            config: platform,
            surfaceId: surface.id,
            caption: props.caption,
            images: ordered.map((record) => ({ width: record.width, height: record.height, subjectBox: record.subject_box })),
          });
          return (
            <article key={platform.id} className="card" data-platform={platform.id}>
              <p className="preview-label">{layout.previewLabel}</p>
              <p className="who">{platform.frame_tokens.name}</p>
              <div className="frame" style={{ aspectRatio: String(layout.aspect) }}>
                {ordered[0] ? <img src={`/api/media/${ordered[0].id}?kind=working`} alt="" /> : null}
              </div>
              <p>{layout.caption}{layout.seeMore ? " see more" : ""}</p>
              {layout.badge ? <p className="badge">{layout.badge.label}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

