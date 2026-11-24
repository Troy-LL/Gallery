# Architecture

## Context and Containers (C4)

Color Wheel Gallery splits interactive browsing from heavy media/AI ingestion so cloud hosting stays inside $0 free tiers while offline browsing remains fast:

1. **Web App & Thin API** (Cloudflare Pages/Workers in cloud mode; local HTTP server in zero-cloud mode; single-user authenticated): Serves the desktop UI, runs polar/metadata/vector queries, persists curation edits (`Analysis.locked_fields`), manages `Palette`, `Collection`, and `Post` records, renders declarative platform previews, and exports resized, EXIF-stripped downloads. Browser bundles never receive Google or `jev` credentials.
2. **Metadata & Vector Database** (Neon or Supabase Postgres + `pgvector` in cloud mode; SQLite + in-memory vector search in local mode): Holds image metadata, color profiles, `jev` probability answers, embeddings, curation state, saved palettes, post history, and the active importer lease.
3. **Working-Copy Object Store** (S3-compatible Cloudflare R2 in cloud mode; local filesystem in local mode): Stores private working copies (`~2048` px, stepped down to `1600` px near storage caps) and thumbnails. Originals stay untouched in Google Photos or source folders.
4. **Local Desktop Importer** (macOS and Windows background process; active replica count = `1`, coordinated via a short database lease): Watches local sync/archive directories, hosts `localhost` OAuth for the Google Photos Picker, converts HEIC and rotates pixels upright, extracts OKLab palettes and technical metrics, computes CLIP embeddings locally, calls `jev` behind `analyze(image)`, writes sidecar JSON/XMP files, and uploads working copies + rows to R2 and Postgres. When every desktop is asleep, new imports wait while the cloud gallery stays live.

## Ingest Adapters

All sources implement a single `ImportAdapter` interface:

- **Scheduled Google Takeout watcher:** Monitors a synced Drive/Dropbox/OneDrive or downloads directory, extracts split archive zips, reads Takeout JSON sidecars, and skips videos plus known hashes or `source_ref` IDs.
- **`Sync now` Google Photos Picker (`localhost`):** Creates a Picker session (`photospicker.mediaitems.readonly`), opens `pickerUri` in a browser tab, polls until selection completes, downloads short-lived item URLs immediately, and deletes the session.
- **Near-live Phone Inbox:** Watches a mirrored folder — by default an iPhone Share-Sheet Shortcut (`Send to Gallery`) writing into iCloud Drive `Gallery Inbox` (synced natively on macOS and via iCloud for Windows; Telegram file-bot polling or Dropbox/OneDrive camera folders act as fallbacks) — and deletes inbox files after import.
- **Direct upload:** Browser/desktop drag-and-drop (files or folders) and clipboard paste/screenshots.

**Deduplication:** Exact content SHA-256 (`Image.hash`) and Google media item ID (`Image.source_ref`) prevent double import and double `jev` billing. When an uncompressed phone-inbox photo later arrives as a recompressed Google Takeout export, the importer matches `Exif.taken_at` + perceptual hash (`Image.phash`), retains the higher-quality file, and attaches the Google `source_ref`.

## Processing Pipeline

Ingestion runs in a bounded background queue so bulk imports (500–5,000 photos) never block UI rendering:

1. **Ingest & normalize:** Write working copy, convert HEIC to JPEG (drop Live Photo video companions), parse EXIF (`taken_at`, `lat`, `lon`, `place_name`, `camera`, `lens`, orientation), generate thumbnail once, and compute SHA-256 `hash` plus `phash` (for near-duplicate grouping and sharpest/best-exposure ranking).
2. **Color extraction (deterministic code):** Downscale and run k-means in **OKLab** to produce 3–5 weighted swatches (`{hex, h, s, l, oklch: {L, C, h}, weight}`); promote the highest-weight swatch to dominant and store both OKLCH and HSL.
3. **Technical & composition metrics (deterministic code):** Compute orientation (`portrait`, `landscape`, `square`), aspect-ratio bucket (`1:1`, `4:5`, `9:16`, `16:9`, `3:2`, `other`), resolution/post-readiness tier, Laplacian-variance sharpness (`sharp`, `soft`, `blurry`), `avg_luminance`, contrast, color temperature (`warm`, `neutral`, `cool`), saturation tier, `is_monochrome`, negative-space ratio, and frame composition signals (rule-of-thirds, centered, symmetry, leading lines, depth, busy vs clean).
4. **`jev` image preparation:** Bake EXIF orientation into upright pixels, encode baseline JPEG or PNG, and clamp dimensions to `280`–`1568` px per side (`78,400`–`2.46M` total pixels; upscale/pad `< 280` px, downscale longest side `≤ 1568` px).
5. **Typed vision analysis (`analyze(image) -> tags`):** Provider-isolated call (`jev-1.14.0` default via TypeSafe SDK with `TypeSafe-Danger-Zone-Images: true`; fallback vision provider behind the same signature). Places `photo` **once** in `state` (plus compact reference thumbnails from `Vocabulary.example_image_ids[]` when a tag is defined by example) and batches all `Vocabulary` questions (`Choice` with `"other / none"` + companion `Noul` where needed, `Noul` tags, `Score` spectrums, `has_text`, and `subject_visible` `Noul` paired with `subject_box` `Box`). Workers retry HTTP `429`/`529` with exponential backoff, run a shuffled-option second pass on low-confidence key `Choice` answers, and pause when the monthly token-cost cap is reached. Failed calls still index locally with `needs_tags = true`.
6. **Visual embedding:** A separate local or API CLIP-style vision model computes `Image.embedding`.
7. **Index & sidecar:** Commit database records, write local sidecar JSON/XMP (tags, rating, status), and push live updates to the wheel and grid.
8. **Re-analysis:** On-demand per-image or bulk re-run after a `model_version` or `vocab_version` bump; skips every field recorded in `Analysis.locked_fields[]`.

## Query, Retrieval, and Preview Wiring

- **Faceted + wheel filtering:** Client/API intersects polar OKLCH/HSL selection shapes and OKLab distance tolerances with structured metadata/tag probability predicates (`AND` across facets, optional `OR` within a facet).
- **Similarity & hybrid text search:** Vector kNN over `Image.embedding` powers `More like this`, lightbox similar rows, and similarity-ranked palette selections. Free-form visual queries retrieve an embedding shortlist (dozens of candidates) and optionally re-rank candidates via one `jev` `Noul` question per image.
- **Natural-language filter bar:** Sends the query string as `state` to `jev` with one typed question per filter facet; deterministic code converts answers into visible, user-editable filter chips.
- **Platform preview engine:** One generic renderer consumes `{images, caption, platform, surface, theme}` plus declarative JSON/YAML platform configs (`surfaces`, `frame_tokens`, `media_rules`, `caption_rules`, `version`, `last_verified`).

## Data Shapes and Portability

Once SQL DDL or TypeScript schema definitions land in code, replace the list below with a single pointer to that schema file.

- `Image`: `id`, `file_path`, `thumbnail_path`, `width`, `height`, `orientation`, `aspect_ratio`, `file_size`, `hash`, `phash`, `created_at`, `added_at`, `media_type`, `source_type` (`google_photos | upload | inbox`), `source_ref`, `embedding`
- `Exif`: `image_id`, `taken_at`, `lat`, `lon`, `place_name`, `camera`, `lens`
- `ColorProfile`: `image_id`, `dominant_hex`, `dominant_h`, `dominant_s`, `dominant_l`, `dominant_oklch` (`L`, `C`, `h`), `palette[]` (`hex`, `h`, `s`, `l`, `oklch`, `weight`), `avg_luminance`, `contrast`, `temperature`, `is_monochrome`
- `Analysis`: `image_id`, `model_version`, `analyzed_at`, `vocab_version`, `answers[]` (`question_id`, `type`, `value`, `probability | probabilities`, `confidence`), `has_text`, `subject_box` (`top`, `bottom`, `left`, `right`, `confidence`), `locked_fields[]`, `needs_tags`
- `Vocabulary`: `id`, `kind` (`yesno | choice | score`), `name`, `definition`, `example_image_ids[]`, `version`
- `Curation`: `image_id`, `rating`, `status` (`unreviewed | shortlisted | approved | rejected | archived`), `notes`, `source_credit`, `used_count`, `last_used_at`
- `Collection`: `id`, `name`, `image_ids[]`
- `Palette`: `id`, `name`, `selection_shape`, `swatches[]`
- `Post`: `id`, `platform`, `posted_at`, `image_ids[]` (ordered), `caption_notes`

Portability is preserved via per-image sidecar JSON/XMP files and a one-click full database export to JSON/CSV.
