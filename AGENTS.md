# Agent map

Load this file. Then at most two others this turn (three if this turn needs `docs/eval.md`). Skip unused. Cite paths. Do not paste.

- `README.md` — product scope, milestone order, setup credentials, deployment modes, and `jev` / free-tier / Google Photos limits; read when bootstrapping or changing runtime config
- `docs/architecture.md` — C4 containers, ingest adapters, 8-stage processing pipeline, retrieval wiring, and canonical data shapes; read when changing processes, storage, or data flow
- `docs/design.md` — OKLCH color wheel, selection tools, vocabulary filters, lightbox curation, post preview surfaces, and keyboard/a11y rules; read when touching UI or interactions
- `docs/eval.md` — 50-photo `jev` smoke gate, `gallery_eval.*` metrics, prompt rules, and calibration workflow; read before bulk import or bumping `model_version` / `vocab_version`
- `docs/decisions/001-typed-vision-boundary.md` — asking a vision model for hex colors, headcounts, captions, embeddings, `jev-latest`, or ungated `Box` looks useful; read before changing `analyze()`
- `docs/decisions/002-local-importer-thin-cloud.md` — running Takeout unzip, Google Picker OAuth, media transcoding, embeddings, or `jev` inside cloud workers looks useful; read before adding server jobs
- `docs/decisions/003-data-driven-post-previews.md` — per-platform preview components, official brand logos, or social publishing APIs look useful; read before adding or editing a platform preview

No runnable code is checked in yet; wire test, typecheck, and `gallery-eval smoke` commands here when the first package lands. Pin `jev` to an explicit `model_version` (never `jev-latest`), send `TypeSafe-Danger-Zone-Images: true` with upright `280`–`1568` px PNG/baseline-JPEG copies placed once in `state`, never overwrite `Analysis.locked_fields`, and strip EXIF on export by default.

Park thinking in `scratch/`. Do not map it, even if they asked.
Do not commit `scratch/`.
