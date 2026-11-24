import { layoutPreview, type PlatformConfig } from "@gallery/core";
import type { PublicRecord } from "../api/client";

function pickSurface(platform: PlatformConfig, imageCount: number) {
  return (
    platform.surfaces.find(
      (surface) => imageCount >= surface.min_images && imageCount <= surface.max_images,
    ) ?? platform.surfaces[0]
  );
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
  const ordered = props.orderedIds
    .map((id) => props.records.find((record) => record.id === id))
    .filter((record): record is PublicRecord => Boolean(record));
  const previewImages = ordered.map((record) => ({
    width: record.width,
    height: record.height,
    subjectBox: record.subject_box,
  }));

  return (
    <section className="preview" aria-label="Crop previews">
      <ol className="order" aria-label="Image order">
        {ordered.map((record, index) => (
          <li key={record.id}>
            <img src={`/api/media/${record.id}?kind=thumb`} alt="" />
            <span className="order-index" aria-hidden="true">
              {index + 1}
            </span>
            <button type="button" disabled={index === 0} onClick={() => props.onMove(record.id, -1)}>
              Move earlier
            </button>
            <button
              type="button"
              disabled={index === ordered.length - 1}
              onClick={() => props.onMove(record.id, 1)}
            >
              Move later
            </button>
          </li>
        ))}
      </ol>
      <div className="cards">
        {props.platforms.map((platform) => {
          const surface = pickSurface(platform, ordered.length);
          if (!surface) return null;
          const slice = ordered.slice(0, surface.max_images);
          if (slice.length === 0) return null;
          const layout = layoutPreview({
            config: platform,
            surfaceId: surface.id,
            caption: "",
            images: previewImages.slice(0, surface.max_images),
          });
          const columns = surface.kind === "grid" ? (surface.columns ?? 2) : 1;
          return (
            <article key={platform.id} className="card" data-platform={platform.id}>
              <header className="card-head">
                <h2>{platform.id}</h2>
                <p>{surface.label}</p>
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
            </article>
          );
        })}
      </div>
    </section>
  );
}