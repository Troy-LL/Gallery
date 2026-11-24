# Color Wheel Gallery

A single-user, desktop-first image gallery for curating personal photos into cohesive social media posts. Every photo is indexed locally for color and technical quality, tagged against a fixed vocabulary by TypeSafe AI's System One model (**jev**), embedded for visual similarity, and plotted on an **OKLCH color wheel minimap**. Selecting a region on the wheel filters the library in under 100 ms, previews posts across social surfaces, and exports resized, EXIF-stripped files.

## Scope

- **Audience and corpus:** Single owner curating self-shot still photos (`jpg`, `png`, `webp`, `heic`; Live Photo video tracks are ignored). Stock/client licensing, multi-user permissions, brand-palette managers, image editing, mobile layouts, and direct social publishing/scheduling are out of scope.
- **Launch preview platforms:** Instagram, LinkedIn, and Facebook, rendered from declarative platform data files (see [`docs/decisions/003-data-driven-post-previews.md`](docs/decisions/003-data-driven-post-previews.md)).
- **Delivery stages:**
  1. **MVP:** 50-photo `jev` smoke test ([`docs/eval.md`](docs/eval.md)), ingest (Google Photos Picker, drag-drop/folder, clipboard paste), OKLCH wheel with click/wedge/lasso selection, orientation and light filters, EXIF read, full preview engine across Instagram (single, carousel, profile grid — single and carousel built first), LinkedIn (single, multi-image, carousel/document), and Facebook (single, multi-image grid) in Compare and Focus views, size presets, EXIF-stripped download, and `Export all` zip.
  2. **v1:** Batched `jev` tagging with probabilities, strictness sliders, needs-review queue, `Box` subject detection, inline tag/dominant-color edits with `locked_fields`, saved palettes, favorites/status/usage tracking, `Post` records, sidecar JSON files, monthly cost cap + content-hash cache, cross-platform desktop importer (Google Takeout + `Sync now` Picker + iPhone iCloud Drive `Gallery Inbox` Shortcut), and $0 free-tier cloud deployment.
  3. **v1.5:** Multi-swatch wheel toggle, ring/circle-brush/eyedropper selection, CLIP embeddings (`More like this`, text-to-image + `jev` re-rank, near-duplicate grouping), color harmony suggestions, natural-language filter bar, crop-safety warnings, keyboard navigation, and color-blind-safe mode.

## Setup and Run Modes

No application code is checked in yet. When packages land, provider settings (pinned `model_version` such as `jev-1.14.0`, endpoint URL, and optional fallback vision provider such as OpenRouter) live in a single settings file.

### Required credentials (desktop importer only)

- `TYPESAFE_API_KEY` — TypeSafe AI API key with beta image support enabled. Every request carrying an image or `Box` question must send HTTP header `TypeSafe-Danger-Zone-Images: true` via `typesafe-sdk` (Python) or `@typesafe-ai/sdk` (JavaScript).
- Google OAuth client configured on `localhost` with scope `photospicker.mediaitems.readonly` for the `Sync now` Google Photos Picker flow.

### Deployment modes

- **Cloud mode ($0/mo free-tier target):** Cloudflare Pages/Workers (UI + thin API), Cloudflare R2 (working copies + thumbnails), Neon Free or Supabase Free Postgres with `pgvector` (add a weekly keep-alive cron if using Supabase), single-user auth (Cloudflare Access, Supabase Auth, or single-user login), plus the local desktop importer on macOS and Windows ([`docs/decisions/002-local-importer-thin-cloud.md`](docs/decisions/002-local-importer-thin-cloud.md)).
- **Local fallback ($0, zero accounts):** Same UI and pipeline backed by local SQLite, an in-memory vector index, and local disk storage.

## Operator Limits

- **Library scale:** Designed for ~5,000 photos in v1 (tolerates 10,000 without redesign).
- **`jev` image constraints:** Accepts still PNG or baseline JPEG only (convert HEIC, WebP, GIF, and progressive JPEG first, and rotate pixels upright because `jev` strips EXIF orientation). Each dimension must be `280`–`1568` px and total pixels `78,400`–`~2,460,000`; one out-of-range image fails the entire request. File size ≤ `16 MiB`, request body ≤ `32 MiB` (prefer multipart upload over base64), context window ≤ `64k` tokens (split oversized vocabularies across two calls per image).
- **AI billing and privacy:** `jev` bills input tokens only (~`$0.042` per 1M input tokens; output is free). Only downscaled copies (≤ `1568` px) and question text leave the machine. A configurable monthly cap pauses the background queue, and a pre-import prompt shows estimated spend from measured `usage.input_tokens`. Privacy mode skips `jev` for sensitive photos (local color/technical math only, or a local model); verify TypeSafe retention terms before sending sensitive images.
- **Free-tier storage ceilings:** Cloudflare R2 free tier covers `10 GB`-month, `1M` writes/mo, and `10M` reads/mo (~5,000 working copies at `2048` px / `0.6–1 MB` use ~`3–5 GB` plus `< 1 GB` thumbnails; step working copies down to `1600` px if tight). Supabase Free allows `500 MB` Postgres and pauses after 7 days idle. Hard app caps refuse new uploads before crossing free-tier limits.
- **Google Photos limits:** The Google Photos Library API only sees app-uploaded media (since March 31, 2025). Scheduled Google Takeout exports run roughly every 2 months for up to 1 year (up to `50 GB` zip splits; unavailable on Advanced Protection accounts). Picker media download URLs expire quickly, cannot render in an iframe, and enforce session count caps — download immediately and delete completed sessions.

## Docs

- [`AGENTS.md`](AGENTS.md) — agent routing map and repository guardrails
- [`docs/architecture.md`](docs/architecture.md) — containers, ingest pipeline, retrieval wiring, and data shapes
- [`docs/design.md`](docs/design.md) — color wheel geometry, curation UI, post preview surfaces, and accessibility
- [`docs/eval.md`](docs/eval.md) — 50-photo `jev` smoke test, `gallery_eval.*` metrics, and calibration rules
- Decisions: [`001`](docs/decisions/001-typed-vision-boundary.md), [`002`](docs/decisions/002-local-importer-thin-cloud.md), [`003`](docs/decisions/003-data-driven-post-previews.md)
