import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { STATUSES, type Collection, type Post } from "@gallery/core";
import { api, getImage, saveCuration, type DetailRecord, type PublicRecord } from "../api/client";

export type LightboxProps = {
  record: PublicRecord;
  records: PublicRecord[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onChange: () => void;
};

const INK = "#141413";
const PAPER = "#fcfcfb";

type Answer = DetailRecord["answers"][number];
type SimilarMatch = { id: string; score: number };

export function Lightbox(props: LightboxProps) {
  const [status, setStatus] = useState(props.record.status);
  const [detail, setDetail] = useState<DetailRecord | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<SimilarMatch[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const favorite = (props.record.rating ?? 0) >= 1;
  const index = props.records.findIndex((item) => item.id === props.record.id);
  const previous = index > 0 ? props.records[index - 1] : undefined;
  const next = index >= 0 ? props.records[index + 1] : undefined;
  const activeDetail = detail?.id === props.record.id ? detail : null;
  const workingLoaded = loadedId === props.record.id;
  const posts = useMemo(
    () => allPosts.filter((post) => post.image_ids.includes(props.record.id)),
    [allPosts, props.record.id],
  );
  const palette = activeDetail?.palette ?? props.record.palette;

  useEffect(() => {
    setStatus(props.record.status);
  }, [props.record.id, props.record.status]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    restoreRef.current = previousFocus instanceof HTMLElement ? previousFocus : null;
    closeRef.current?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api<{ posts: Post[] }>("/api/posts")
      .then((result) => {
        if (!cancelled) setAllPosts(result.posts);
      })
      .catch(() => undefined);
    void api<{ collections: Collection[] }>("/api/collections")
      .then((result) => {
        if (!cancelled) setCollections(result.collections);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const { record, records, onClose, onNavigate } = props;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const current = records.findIndex((item) => item.id === record.id);
      if (current < 0) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = records[current - 1];
        if (prev) onNavigate(prev.id);
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const following = records[current + 1];
        if (following) onNavigate(following.id);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.record, props.records, props.onClose, props.onNavigate]);

  useEffect(() => {
    const id = props.record.id;
    const controller = new AbortController();
    let cancelled = false;
    void getImage(id, controller.signal)
      .then((result) => {
        if (!cancelled) setDetail(result.record);
      })
      .catch(() => undefined);
    void api<{ matches: SimilarMatch[] }>(`/api/similar/${id}`, { signal: controller.signal })
      .then((result) => {
        if (!cancelled) setMatches(result.matches);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [props.record.id]);

  useEffect(() => {
    const preloadIds = [previous?.id, next?.id].filter((id): id is string => Boolean(id));
    for (const id of preloadIds) {
      const image = new Image();
      image.decoding = "async";
      image.src = `/api/media/${id}?kind=working`;
    }
  }, [previous?.id, next?.id]);

  async function save(patch: unknown) {
    const result = await saveCuration(props.record.id, patch);
    if (result?.record) setDetail(result.record);
    props.onChange();
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const questionId = String(data.get("question") ?? "").trim();
    const value = String(data.get("value") ?? "").trim();
    if (!questionId || !value) return;
    event.currentTarget.reset();
    void save({ answer: { question_id: questionId, type: "choice", value } });
  }

  function removeTag(answer: Answer) {
    void save({
      answer: {
        question_id: answer.question_id,
        type: answer.type,
        value: null,
        ...(answer.probability !== undefined ? { probability: answer.probability } : {}),
      },
    });
  }

  function addCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const collection: Collection = {
      id: crypto.randomUUID(),
      name,
      image_ids: [props.record.id],
    };
    event.currentTarget.reset();
    setCollections((current) => [...current, collection]);
    void api("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(collection),
    });
  }

  const visibleAnswers = activeDetail ? activeDetail.answers.filter((answer) => answer.value !== null) : [];

  return (
    <div className="lightbox-root">
      <div className="lightbox-scrim" onClick={props.onClose} />
      <div className="lightbox" role="dialog" aria-modal="true" aria-label="Inspect photo">
        <div className="lightbox-stage">
          <button
            type="button"
            className="lightbox-nav lightbox-prev"
            aria-label="Previous photo"
            disabled={!previous}
            onClick={() => {
              if (previous) props.onNavigate(previous.id);
            }}
          >
            Previous
          </button>
          <div className="lightbox-media">
            {workingLoaded ? null : (
              <img
                className="lightbox-photo lightbox-thumb"
                src={`/api/media/${props.record.id}?kind=thumb`}
                alt=""
                decoding="async"
                style={{ maxHeight: "70vh" }}
              />
            )}
            <img
              className={`lightbox-photo lightbox-working${workingLoaded ? " is-loaded" : ""}`}
              src={`/api/media/${props.record.id}?kind=working`}
              alt=""
              fetchPriority="high"
              decoding="async"
              style={{ maxHeight: "70vh" }}
              onLoad={() => setLoadedId(props.record.id)}
            />
          </div>
          <button
            type="button"
            className="lightbox-nav lightbox-next"
            aria-label="Next photo"
            disabled={!next}
            onClick={() => {
              if (next) props.onNavigate(next.id);
            }}
          >
            Next
          </button>
        </div>
        <div className="lightbox-side">
          <button ref={closeRef} type="button" onClick={props.onClose}>
            Close
          </button>
          <button type="button" aria-pressed={favorite} onClick={() => save({ rating: favorite ? 0 : 1 })}>
            {favorite ? "Unfavorite" : "Favorite"}
          </button>
          <div className="lightbox-status" role="radiogroup" aria-label="Status">
            {STATUSES.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={status === item}
                onClick={() => {
                  setStatus(item);
                  void save({ status: item });
                }}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="swatches">
            {palette.map((swatch) => {
              const ink = swatchLabelColor(swatch.hex);
              return (
                <div className="swatch" key={swatch.hex}>
                  <button
                    type="button"
                    style={{ backgroundColor: swatch.hex, color: ink ?? undefined }}
                    aria-label={`Use ${swatch.hex}`}
                    onClick={() => save({ dominant_hex: swatch.hex })}
                  >
                    {ink ? swatch.hex : null}
                  </button>
                  {ink ? null : (
                    <span className="swatch-hex" style={{ color: INK }}>
                      {swatch.hex}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {activeDetail ? (
            <>
              <div className="tag-row">
                {visibleAnswers.map((answer) => (
                  <span className="tag-chip" key={answer.question_id}>
                    <span>{String(answer.value)}</span>
                    {answer.probability !== undefined ? <span>{answer.probability}</span> : null}
                    <button type="button" aria-label={`Remove ${String(answer.value)}`} onClick={() => removeTag(answer)}>
                      Remove
                    </button>
                  </span>
                ))}
              </div>
              <form aria-label="Add tag" onSubmit={addTag}>
                <input name="question" aria-label="Tag question" />
                <input name="value" aria-label="Tag value" />
                <button type="submit">Add tag</button>
              </form>
              <label>
                Notes
                <textarea
                  aria-label="Notes"
                  key={`${activeDetail.id}:${activeDetail.notes ?? ""}`}
                  defaultValue={activeDetail.notes ?? ""}
                  onBlur={(event) => {
                    const nextNotes = event.currentTarget.value;
                    if (nextNotes === (activeDetail.notes ?? "")) return;
                    void save({ notes: nextNotes });
                  }}
                />
              </label>
              <label>
                Credit
                <input
                  aria-label="Credit"
                  key={`${activeDetail.id}:${activeDetail.source_credit ?? ""}`}
                  defaultValue={activeDetail.source_credit ?? ""}
                  onBlur={(event) => {
                    const nextCredit = event.currentTarget.value;
                    if (nextCredit === (activeDetail.source_credit ?? "")) return;
                    void save({ source_credit: nextCredit });
                  }}
                />
              </label>
            </>
          ) : (
            <p className="lightbox-loading">Loading details…</p>
          )}
          <section aria-label="Similar images" className="lightbox-strip">
            {matches.map((match) => (
              <button key={match.id} type="button" onClick={() => props.onNavigate(match.id)}>
                <img src={`/api/media/${match.id}?kind=thumb`} alt="" decoding="async" />
                <span>{match.id}</span>
              </button>
            ))}
          </section>
          <section aria-label="Post history">
            {posts.map((post) => (
              <article key={post.id}>
                <span>{post.platform}</span>
                <time dateTime={post.posted_at}>{post.posted_at}</time>
                {post.caption_notes ? <p>{post.caption_notes}</p> : null}
              </article>
            ))}
          </section>
          <section aria-label="Collections">
            <ul>
              {collections.map((collection) => (
                <li key={collection.id}>{collection.name}</li>
              ))}
            </ul>
            <form aria-label="Add collection" onSubmit={addCollection}>
              <input name="name" aria-label="Collection name" />
              <button type="submit">Add collection</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const r = channel(Number.parseInt(raw.slice(0, 2), 16));
  const g = channel(Number.parseInt(raw.slice(2, 4), 16));
  const b = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function swatchLabelColor(hex: string): string | null {
  const lum = luminance(hex);
  const ink = contrast(lum, luminance(INK));
  const paper = contrast(lum, luminance(PAPER));
  if (ink >= 4.5 && ink >= paper) return INK;
  if (paper >= 4.5) return PAPER;
  if (ink >= 4.5) return INK;
  return null;
}
