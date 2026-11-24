# Constrain `jev` to batched fixed-vocabulary judgments behind `analyze()`

Status: Accepted

## Context

`jev` (TypeSafe AI's System One model) returns fast, low-cost typed answers (`Choice`, `Noul`, `Score`, `Box`) with probabilities and confidence, but it cannot generate free-form text, produces unreliable RGB/hex math and exact headcounts, ignores EXIF orientation, rejects images outside `280`–`1568` px, always emits a bounding box even on empty frames, biases `Choice` toward early options when uncertain, and ships image/`Box` support under a beta `"dreamer-ready"` flag (`TypeSafe-Danger-Zone-Images: true`). Calling a vision model for colors, counts, captions, or embeddings — or calling `jev-latest` one question at a time — looks standard in AI gallery apps and silently degrades accuracy, cost, and upgrade safety.

## Decision

We will isolate vision tagging behind a single `analyze(image) -> tags` boundary pinned to an explicit `model_version` (never `jev-latest`) that sends each upright, `280`–`1568` px PNG/baseline-JPEG image **once** in `state` with all fixed-vocabulary `Choice`, `Noul`, `Score`, and `Box` questions batched in one request, while computing all colors (OKLab k-means, OKLCH/HSL), geometry, sharpness, luminance, EXIF, and perceptual hashes in deterministic code and computing visual similarity vectors in a separate CLIP-style embedding model. Every `Box` question will pair with a `Noul` presence gate (`subject_visible`), people counts will use coarse `Choice` buckets (`none`, `one person`, `several`), and raw probabilities + `model_version` + `vocab_version` will be stored without overwriting `Analysis.locked_fields`.

## Consequences

Color wheel coordinates and technical filters remain exact, free, and available even when `jev` is offline or skipped in privacy mode. Token spend stays minimal because image tokens are paid once per photo rather than once per tag, and swapping `jev` for a fallback vision provider requires changing only `analyze()` and provider config. Upgrading `jev` or editing vocabulary becomes an explicit opt-in re-analysis pass calibrated via `docs/eval.md` while preserving all manual user corrections.
