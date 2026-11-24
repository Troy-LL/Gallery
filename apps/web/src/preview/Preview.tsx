import { useRef, type DragEvent } from "react";
import { layoutPreview, type PlatformConfig } from "@gallery/core";
import type { PublicRecord } from "../api/client";

function pickSurface(platform: PlatformConfig, imageCount: number) {
  return (
    platform.surfaces.find(
      (surface) => imageCount >= surface.min_images && imageCount <= surface.max_images,
    ) ?? platform.surfaces[0]
  );
}

function themeName(theme: "light" | "dark"): "light" | "dark" {
  switch (theme) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    default: {
      const unreachable: never = theme;
      return unreachable;
    }
  }
}

function platformsForFocus(platforms: PlatformConfig[], focus: "compare" | "focus", platformId: string): PlatformConfig[] {
  switch (focus) {
    case "compare":
      return platforms;
    case "focus":
      return platforms.filter((platform) => platform.id === platformId);
    default: {
      const unreachable: never = focus;
      return unreachable;
    }
  }
}

function platformTitle(id: PlatformConfig["id"]): string {
  switch (id) {
    case "instagram":
      return "Instagram";
    case "linkedin":
      return "LinkedIn";
    case "facebook":
      return "Facebook";
    default: {
      const unreachable: never = id;
      return unreachable;
    }
  }
}

function placeholderInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
  return name.slice(0, 2).toUpperCase();
}

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
  const dragId = useRef<string | null>(null);
  const ordered = props.orderedIds
    .map((id) => props.records.find((record) => record.id === id))
    .filter((record): record is PublicRecord => Boolean(record));
  const previewImages = ordered.map((record) => ({
    width: record.width,
    height: record.height,
    subjectBox: record.subject_box,
  }));
  const shown = platformsForFocus(props.platforms, props.focus, props.platformId);

  function dropOn(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const dragged = dragId.current;
    dragId.current = null;
    if (!dragged || dragged === targetId) return;
    const from = ordered.findIndex((record) => record.id === dragged);
    const to = ordered.findIndex((record) => record.id === targetId);
    if (from < 0 || to < 0) return;
    const direction: -1 | 1 = to > from ? 1 : -1;
    const steps = Math.abs(to - from);
    for (let step = 0; step < steps; step += 1) props.onMove(dragged, direction);
  }

  return (
    <section className="preview" aria-label="Crop previews" data-theme={themeName(props.theme)} data-focus={props.focus}>
      <div className="preview-bar">
        <div className="platform-chips" role="group" aria-label="Platform">
          {props.platforms.map((platform) => (
            <button
              key={platform.id}
              type="button"
              aria-pressed={platform.id === props.platformId}
              onClick={() => props.onPlatform(platform.id)}
            >
              {platformTitle(platform.id)}
            </button>
          ))}
        </div>
        <div className="preview-switch" role="group" aria-label="Layout">
          <button type="button" aria-pressed={props.focus === "compare"} onClick={() => props.onFocus("compare")}>
            Compare
          </button>
          <button type="button" aria-pressed={props.focus === "focus"} onClick={() => props.onFocus("focus")}>
            Focus
          </button>
        </div>
        <div className="preview-switch" role="group" aria-label="Theme">
          <button type="button" aria-pressed={props.theme === "light"} onClick={() => props.onTheme("light")}>
            Light
          </button>
          <button type="button" aria-pressed={props.theme === "dark"} onClick={() => props.onTheme("dark")}>
            Dark
          </button>
        </div>
      </div>
      <label className="caption-field">
        Caption
        <textarea aria-label="Caption" rows={3} value={props.caption} onChange={(event) => props.onCaption(event.target.value)} />
      </label>
      <div className="order-strip">
        <ol className="order" aria-label="Image order">
          {ordered.map((record, index) => (
            <li key={record.id}>
              <div
                className="order-thumb"
                draggable
                onDragStart={() => {
                  dragId.current = record.id;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropOn(event, record.id)}
              >
                <img src={`/api/media/${record.id}?kind=thumb`} alt="" draggable={false} />
                <span className="order-index" aria-hidden="true">
                  {index + 1}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="cards">
        {shown.map((platform) => {
          const surface = pickSurface(platform, ordered.length);
          if (!surface) return null;
          const slice = ordered.slice(0, surface.max_images);
          if (slice.length === 0) return null;
          const layout = layoutPreview({
            config: platform,
            surfaceId: surface.id,
            caption: props.caption,
            images: previewImages.slice(0, surface.max_images),
          });
          const columns = surface.kind === "grid" ? (surface.columns ?? 2) : 1;
          return (
            <article key={platform.id} className="card" data-platform={platform.id}>
              <header className="card-head">
                <p className="preview-mark">{layout.previewLabel}</p>
                <div className="identity">
                  <span className="avatar" aria-hidden="true">
                    {placeholderInitials(platform.frame_tokens.name)}
                  </span>
                  <h2>{platformTitle(platform.id)}</h2>
                </div>
                <p className="surface">{surface.label}</p>
              </header>
              <div
                className="frames"
                data-kind={surface.kind}
                style={surface.kind === "grid" ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
              >
                {slice.map((record, index) => (
                  <div
                    key={record.id}
                    className="frame"
                    style={{ aspectRatio: String(layout.aspect) }}
                    data-slide={index + 1}
                  >
                    <img src={`/api/media/${record.id}?kind=working`} alt="" />
                  </div>
                ))}
              </div>
              <p className="caption">
                {layout.caption}
                {layout.seeMore ? <span className="see-more"> {platform.caption_rules.see_more_label}</span> : null}
              </p>
              {layout.badge ? (
                <p className="badge">
                  <span className="badge-label">{layout.badge.label}</span>
                  <span className="badge-detail">{layout.badge.detail}</span>
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}