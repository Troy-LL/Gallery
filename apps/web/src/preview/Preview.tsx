import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { layoutPreview, type PlatformConfig } from "@gallery/core";
import type { PublicRecord } from "../api/client";

type PlatformChrome = {
  title: string;
  handle: string;
  meta: string;
  captionPosition: "above" | "below";
  reactions: string;
  secondaryStats: string;
  timestamp: string;
  actions: readonly string[];
};

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

function platformChrome(platform: PlatformConfig): PlatformChrome {
  const name = platform.frame_tokens.name;
  const handle = name.toLowerCase().replace(/[^a-z0-9._]+/g, "_") || "member";
  switch (platform.id) {
    case "instagram":
      return {
        title: "Instagram",
        handle,
        meta: "2h",
        captionPosition: "below",
        reactions: "128 likes",
        secondaryStats: "",
        timestamp: "2 HOURS AGO",
        actions: ["Like", "Comment", "Share", "Save"],
      };
    case "linkedin":
      return {
        title: "LinkedIn",
        handle: name,
        meta: "Creative Director • 2h",
        captionPosition: "above",
        reactions: "42",
        secondaryStats: "6 comments • 2 reposts",
        timestamp: "2h",
        actions: ["Like", "Comment", "Repost", "Send"],
      };
    case "facebook":
      return {
        title: "Facebook",
        handle: name,
        meta: "2h",
        captionPosition: "above",
        reactions: "36",
        secondaryStats: "4 comments  2 shares",
        timestamp: "2h",
        actions: ["Like", "Comment", "Share"],
      };
    default: {
      const unreachable: never = platform.id;
      return unreachable;
    }
  }
}

function placeholderInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
  return name.slice(0, 2).toUpperCase();
}

function ActionIcon(props: { kind: string }) {
  switch (props.kind) {
    case "Heart":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 20.4 4.6 13.3a4.9 4.9 0 0 1 0-7 4.7 4.7 0 0 1 6.7 0L12 7l.7-.7a4.7 4.7 0 0 1 6.7 0 4.9 4.9 0 0 1 0 7Z" />
        </svg>
      );
    case "Like":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M7 11v9H4v-9h3Zm0 0 4-7a2 2 0 0 1 3 1.7V10h4.5a2 2 0 0 1 1.9 2.5l-1.4 5.5a2 2 0 0 1-1.9 1.5H7" />
        </svg>
      );
    case "Comment":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M20 11.5a8 8 0 0 1-8 8 8.3 8.3 0 0 1-3.5-.8L4 20l1.3-4.2A8 8 0 1 1 20 11.5Z" />
        </svg>
      );
    case "Share":
    case "Send":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M21 4 10 14" />
          <path d="m21 4-6.5 16-4.5-6-6-3.5L21 4Z" />
        </svg>
      );
    case "Repost":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M17 2 21 6l-4 4" />
          <path d="M3 11V9a3 3 0 0 1 3-3h15" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a3 3 0 0 1-3 3H3" />
        </svg>
      );
    case "Save":
      return (
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M6 4h12v16l-6-4.2L6 20V4Z" />
        </svg>
      );
    default:
      return null;
  }
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2a8.5 8.5 0 0 1 0 12M8 2a8.5 8.5 0 0 0 0 12" />
    </svg>
  );
}

function EllipsisIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function PreviewImage(props: { id: string; useWorking: boolean; lazy?: boolean; draggable?: boolean }) {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const workingLoaded = props.useWorking && loadedId === props.id;

  if (!props.useWorking) {
    return (
      <img
        src={`/api/media/${props.id}?kind=thumb`}
        alt=""
        decoding="async"
        loading={props.lazy ? "lazy" : undefined}
        draggable={props.draggable}
      />
    );
  }

  return (
    <>
      {workingLoaded ? null : (
        <img
          className="frame-thumb"
          src={`/api/media/${props.id}?kind=thumb`}
          alt=""
          decoding="async"
          draggable={props.draggable}
        />
      )}
      <img
        className={`frame-working${workingLoaded ? " is-loaded" : ""}`}
        src={`/api/media/${props.id}?kind=working`}
        alt=""
        decoding="async"
        draggable={props.draggable}
        onLoad={() => setLoadedId(props.id)}
      />
    </>
  );
}

function CarouselMedia(props: {
  platformId: PlatformConfig["id"];
  records: PublicRecord[];
  aspect: number;
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  highRes: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const count = props.records.length;
  const clampedIndex = Math.min(props.activeIndex, Math.max(0, count - 1));

  useEffect(() => {
    if (clampedIndex !== props.activeIndex) props.onActiveIndex(clampedIndex);
  }, [clampedIndex, props.activeIndex, props.onActiveIndex]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth <= 0) return;
    const current = Math.round(track.scrollLeft / track.clientWidth);
    if (current === clampedIndex) return;
    const left = clampedIndex * track.clientWidth;
    if (typeof track.scrollTo === "function") {
      track.scrollTo({ left, behavior: "smooth" });
    } else {
      track.scrollLeft = left;
    }
  }, [clampedIndex]);

  function scrollToSlide(nextIndex: number) {
    const bounded = Math.max(0, Math.min(count - 1, nextIndex));
    props.onActiveIndex(bounded);
  }

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth <= 0) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    if (next >= 0 && next < count && next !== clampedIndex) {
      props.onActiveIndex(next);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToSlide(clampedIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToSlide(clampedIndex - 1);
    }
  }

  return (
    <div className="carousel-shell">
      <div
        ref={trackRef}
        className="frames carousel-track"
        data-kind="carousel"
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${platformTitle(props.platformId)} slides`}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
      >
        {props.records.map((record, index) => (
          <div
            key={record.id}
            className="frame carousel-slide"
            style={{ aspectRatio: String(props.aspect) }}
            data-slide={index + 1}
            aria-hidden={index !== clampedIndex}
          >
            <PreviewImage
              id={record.id}
              useWorking={props.highRes && index === clampedIndex}
              lazy={index !== clampedIndex}
              draggable={false}
            />
          </div>
        ))}
      </div>
      {count > 1 ? (
        <>
          <span className="carousel-counter" aria-live="polite">
            {clampedIndex + 1}/{count}
          </span>
          {clampedIndex > 0 ? (
            <button
              type="button"
              className="carousel-nav carousel-prev"
              aria-label="Previous slide"
              onClick={() => scrollToSlide(clampedIndex - 1)}
            >
              ‹
            </button>
          ) : null}
          {clampedIndex < count - 1 ? (
            <button
              type="button"
              className="carousel-nav carousel-next"
              aria-label="Next slide"
              onClick={() => scrollToSlide(clampedIndex + 1)}
            >
              ›
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PlatformCard(props: {
  platform: PlatformConfig;
  records: PublicRecord[];
  previewImages: { width: number; height: number; subjectBox: PublicRecord["subject_box"] }[];
  caption: string;
  highRes: boolean;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const surface = pickSurface(props.platform, props.records.length);
  if (!surface) return null;
  const slice = props.records.slice(0, surface.max_images);
  if (slice.length === 0) return null;

  const layout = layoutPreview({
    config: props.platform,
    surfaceId: surface.id,
    caption: props.caption,
    images: props.previewImages.slice(0, surface.max_images),
  });
  const chrome = platformChrome(props.platform);
  const isCarousel = surface.kind === "carousel" || surface.kind === "document";
  const isGrid = surface.kind === "grid";
  const visibleGridRecords = isGrid && slice.length > 5 && props.platform.id !== "instagram" ? slice.slice(0, 5) : slice;
  const overflowCount = isGrid && props.platform.id !== "instagram" ? Math.max(0, slice.length - 5) : 0;
  const clampedSlide = Math.min(slideIndex, Math.max(0, slice.length - 1));
  const columns = surface.columns ?? 2;

  function renderCaption() {
    if (!layout.caption && !layout.seeMore) return null;
    if (props.platform.id === "instagram") {
      return (
        <p className="caption">
          <strong className="caption-handle">{chrome.handle}</strong> {layout.caption}
          {layout.seeMore ? <span className="see-more"> … {props.platform.caption_rules.see_more_label}</span> : null}
        </p>
      );
    }
    return (
      <p className="caption">
        {layout.caption}
        {layout.seeMore ? <span className="see-more"> …{props.platform.caption_rules.see_more_label}</span> : null}
      </p>
    );
  }

  return (
    <article className="card" data-platform={props.platform.id}>
      <div className="card-eyebrow">
        <span className="preview-mark">{layout.previewLabel}</span>
        <h2>{chrome.title}</h2>
        <span className="surface">{surface.label}</span>
      </div>
      <div className="platform-surface">
        <header className="post-header">
          <div className="identity">
            <span className="avatar" aria-hidden="true">
              {placeholderInitials(props.platform.frame_tokens.name)}
            </span>
            <div className="identity-meta">
              <div className="identity-line">
                <span className="identity-name">{chrome.handle}</span>
                {props.platform.id === "instagram" ? <span className="identity-dot">• {chrome.meta}</span> : null}
                {props.platform.id === "linkedin" ? <span className="identity-dot">• 1st</span> : null}
              </div>
              {props.platform.id === "linkedin" ? (
                <div className="identity-sub">
                  <span>{chrome.meta}</span>
                  <GlobeIcon />
                </div>
              ) : null}
              {props.platform.id === "facebook" ? (
                <div className="identity-sub">
                  <span>{chrome.meta}</span>
                  <span aria-hidden="true">·</span>
                  <GlobeIcon />
                </div>
              ) : null}
            </div>
          </div>
          <span className="post-more" aria-hidden="true">
            <EllipsisIcon />
          </span>
        </header>

        {chrome.captionPosition === "above" ? <div className="post-copy">{renderCaption()}</div> : null}

        <div className="post-media">
          {isCarousel ? (
            <CarouselMedia
              platformId={props.platform.id}
              records={slice}
              aspect={layout.aspect}
              activeIndex={clampedSlide}
              onActiveIndex={setSlideIndex}
              highRes={props.highRes}
            />
          ) : (
            <div
              className="frames"
              data-kind={surface.kind}
              data-count={isGrid ? String(Math.min(visibleGridRecords.length, 5)) : "1"}
              style={
                isGrid && props.platform.id === "instagram"
                  ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
                  : undefined
              }
            >
              {visibleGridRecords.map((record, index) => (
                <div
                  key={record.id}
                  className="frame"
                  style={isGrid ? undefined : { aspectRatio: String(layout.aspect) }}
                  data-slide={index + 1}
                >
                  <PreviewImage id={record.id} useWorking={props.highRes} />
                  {overflowCount > 0 && index === visibleGridRecords.length - 1 ? (
                    <span className="grid-overflow">+{overflowCount}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {props.platform.id === "instagram" ? (
          <div className="post-footer">
            <div className="ig-actions">
              <div className="ig-actions-left" aria-hidden="true">
                <ActionIcon kind="Heart" />
                <ActionIcon kind="Comment" />
                <ActionIcon kind="Share" />
              </div>
              {isCarousel && slice.length > 1 ? (
                <div className="carousel-dots" role="tablist" aria-label="Carousel slides">
                  {slice.map((record, index) => (
                    <button
                      key={record.id}
                      type="button"
                      role="tab"
                      aria-selected={index === clampedSlide}
                      aria-label={`Slide ${index + 1}`}
                      className="carousel-dot"
                      data-active={index === clampedSlide ? "true" : "false"}
                      onClick={() => setSlideIndex(index)}
                    />
                  ))}
                </div>
              ) : null}
              <div className="ig-actions-right" aria-hidden="true">
                <ActionIcon kind="Save" />
              </div>
            </div>
            <p className="ig-likes">{chrome.reactions}</p>
            {renderCaption()}
            <p className="ig-time">{chrome.timestamp}</p>
          </div>
        ) : (
          <div className="post-footer">
            <div className="social-counts" aria-hidden="true">
              <span className="reaction-summary">
                <span className="reaction-dot" />
                <span>{chrome.reactions}</span>
              </span>
              <span>{chrome.secondaryStats}</span>
            </div>
            <div className="social-actions" aria-hidden="true">
              {chrome.actions.map((action) => (
                <span key={action} className="social-action">
                  <ActionIcon kind={action} />
                  <span>{action}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {layout.badge ? (
        <p className="badge">
          <span className="badge-label">{layout.badge.label}</span>
          <span className="badge-detail">{layout.badge.detail}</span>
        </p>
      ) : null}
    </article>
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
  const dragId = useRef<string | null>(null);
  const recordsById = useMemo(
    () => new Map(props.records.map((record) => [record.id, record])),
    [props.records],
  );
  const ordered = useMemo(
    () =>
      props.orderedIds
        .map((id) => recordsById.get(id))
        .filter((record): record is PublicRecord => Boolean(record)),
    [props.orderedIds, recordsById],
  );
  const previewImages = useMemo(
    () =>
      ordered.map((record) => ({
        width: record.width,
        height: record.height,
        subjectBox: record.subject_box,
      })),
    [ordered],
  );
  const shown = platformsForFocus(props.platforms, props.focus, props.platformId);
  const highRes = props.focus === "focus";

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
                <img src={`/api/media/${record.id}?kind=thumb`} alt="" decoding="async" draggable={false} />
                <span className="order-index" aria-hidden="true">
                  {index + 1}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="cards">
        {shown.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            records={ordered}
            previewImages={previewImages}
            caption={props.caption}
            highRes={highRes}
          />
        ))}
      </div>
    </section>
  );
}
