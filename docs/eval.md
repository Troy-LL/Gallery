# Eval

Pre-import smoke gate and calibration protocol for `analyze(image)` (`jev`, pinned to an explicit `model_version` such as `jev-1.14.0` — never `jev-latest`). Bulk ingestion and `model_version` / `vocab_version` upgrades are gated on a passing gold run.

## Layout

- `prompts/` — literal question instructions, `Choice` option definitions, and `Score` rubric strings, versioned together as `vocab_version`.
- `evals/gold-manifest.json` — frozen gold set manifest (`n ≥ 50` representative owned photos spanning portraits, landscapes, indoor/night/golden-hour lighting, monochrome, text overlays, and subjectless textures) with human ground-truth labels and subject boxes.
- `evals/YYYY-MM-DD-<model_version>-<vocab_version>.json` — dated score artifacts.
- `evals/wrong-tags.jsonl` — operator `report wrong tag` events exported from the UI to drive question wording and threshold revisions.

## Gold Command

Wire the importer CLI to expose one deterministic probe runner when the first package lands:

```bash
gallery-eval smoke --manifest evals/gold-manifest.json
```

Each run sends one upright, downscaled image (`≤ 1568` px, PNG/baseline JPEG) per request in `state` with the full 20–30 question vocabulary batched in `questions` and header `TypeSafe-Danger-Zone-Images: true`.

## Metrics (`gallery_eval.*`)

Record on every gold run:

1. `gallery_eval.tag_f1` — macro and per-question precision/recall across `Noul`, `Choice`, and `Score` questions, sweeping thresholds to set default UI strictness per `(model_version, vocab_version)`.
2. `gallery_eval.subject_box_iou` — mean IoU on frames with a subject, plus false-box suppression rate confirming `subject_box` is discarded whenever paired `subject_visible` `Noul` falls below threshold.
3. `gallery_eval.order_flip_disagreement` — fraction of low-confidence `Choice` answers that change label when re-queried with reversed option order.
4. `gallery_eval.uncertain_rate` — share of answers landing in the Needs-Review band (`0.4–0.6` `Noul` probability or low `Choice`/`Score` confidence).
5. `gallery_eval.input_tokens_mean` and `gallery_eval.input_tokens_p95` — scraped from `usage.input_tokens` to calibrate the pre-import spend estimator (`~$0.042` per 1M input tokens) and compare `768` px vs `1568` px downscale accuracy.
6. `gallery_eval.latency_ms_p50` and `gallery_eval.latency_ms_p95` — wall-clock latency per batched single-image `system_one` call.

## Sample Floor and Hygiene

- **Smoke gate floor:** `n ≥ 50` gold images before initial bulk import or any `model_version` / `vocab_version` promotion.
- **Prompt discipline:** Write literal observable criteria (e.g. `"grainy, faded colors, soft contrast, like a 35mm film photo"` rather than bare `"aesthetic"`), include `"other / none of these"` plus a companion `Noul` check where `Choice` exhaustion could force a bad label, and cap `Vocabulary.example_image_ids[]` at 3–5 images per tag so per-request token cost stays bounded.
- **Secret and corpus hygiene:** Read `TYPESAFE_API_KEY` from the environment only. Never write API keys or raw image bytes/base64 into `evals/*.json`.
