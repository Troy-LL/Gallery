# Design

Desktop-first workspace with three primary modes: `Gallery`, `Wheel focus` (expanded wheel), and `Post preview` (`Compare` | `Focus`).

## Workspace Layout

- **Left rail:** Color wheel minimap, continuous lightness slider (`dark ↔ light`), vertical neutrals strip (near-gray/black/white dots spread vertically by lightness), `Monochrome` filter chip, and saved palettes list.
- **Top bar:** Natural-language filter input, facet chips (orientation, aspect ratio, resolution, sharpness, light, contrast, temperature, saturation, time of day, subject, people, setting, text-in-image, negative space, vibe/mood/aesthetic/season/style, composition, EXIF date/location/camera, status, favorites, `never used`), per-tag **strictness slider** (probability threshold), and an **Active filters bar** rendering removable pills with a live matching image count.
- **Center canvas:** Virtualized masonry thumbnail grid with adjustable tile size. Wheel selection updates the grid in **< 100 ms** at 5,000 images.

## Color Wheel Minimap

- **Axes & color space:** Angle maps to Hue (`0–360°`, red at top, clockwise). Radius maps to **OKLCH** chroma normalized to the library's max chroma so perceptual distances stay uniform and dark/light neutrals do not scatter to the rim; a toggle switches layout to classic **HSL**. Clustering, neighborhood selection, and color tolerance always use **OKLab** distance. Outer hue ring gradient, faint radial/concentric guides, ring label `HUE`, and spoke label `SATURATION: less → more`. Rendered on HTML Canvas/SVG with a quadtree spatial index.
- **Dots & clustering:** Default mode plots **one dominant-color dot per image** (optional weight-scaled dot radius). Overlapping dots collapse into count badges that expand on hover or zoom. Hover previews thumbnail; click opens the image in gallery/lightbox.
- **Multi-swatch toggle (off by default):** Switching on plots all 3–5 swatches above a minimum weight threshold while keeping the active selection (optionally scoped to current selection/filtered results). Hovering one swatch highlights sibling dots from the same photo.
- **Selection tools (`Shift` adds, `Alt` subtracts):**
  1. **Click dot** — selects image plus OKLab color neighborhood.
  2. **Wedge select** — drag outer ring for a hue arc.
  3. **Ring select** — drag along radius for a chroma/saturation band.
  4. **Lasso** — freehand region inside the wheel.
  5. **Circle brush** — click-drag adjustable OKLab radius.
  6. **Eyedropper** — hex input or image pixel picker with tolerance slider.
- **Saved palettes & harmony:** Save any selection shape + swatches by name; re-apply in one click, combine, or export (hex list, JSON, swatch strip). From a selected image, suggest analogous, complementary, or triadic library matches, or rank images by fit to a saved palette.

## Vocabulary, Lightbox, and Curation

- **Default vocabulary:**
  - *Single-label (`Choice`):* `time_of_day` (`golden hour`, `daylight`, `blue hour`, `night`, `indoor`), `subject_type` (`people`, `food`, `places`, `nature`, `architecture`, `products`, `objects`, `animals`, `abstract`), `people` (`none`, `one person`, `several`), `setting` (`indoor`, `outdoor`, `urban`, `nature`, `studio`), `photo_style` (`candid`, `posed`, `flat lay`, `close-up`, `wide shot`, `aerial`, `silhouette`).
  - *Multi-label (`Noul`):* `mood` (`cozy`, `energetic`, `calm`, `moody`, `playful`, `dreamy`, `bold`, `nostalgic`, `luxe`, `raw`), `aesthetic` (`minimal`, `vintage`, `film`, `y2k`, `editorial`, `street`, `cinematic`, `clean`, `grainy`, `maximalist`), `season` (`summer`, `rainy`, `festive`, `holiday`, `cold`, `tropical`), `has_text`.
  - *Spectrums (`Score` sliders):* `calm ↔ energetic`, `playful ↔ serious`, `rustic ↔ polished`.
  - Users can edit definitions and attach 3–5 library example images per tag. No auto-generated prose captions.
- **Lightbox & fast correction (< 5 s):** Displays full photo, palette swatches (click any swatch to set it as dominant), tag chips with probabilities, inline tag add/remove, manual notes/credit, favorite toggle, status (`unreviewed`, `shortlisted`, `approved`, `rejected`, `archived`), manual `Collection` boards, near-duplicate cluster with sharpest/best-exposure badge, `similar images` strip, and `Post` usage history. Any manual tag or color edit adds that field to `Analysis.locked_fields`. Bulk selection applies tag/status edits across multiple photos at once.
- **Queues, badges, and empty/pause states:**
  - **Needs-review queue:** Surfaces photos with low `Choice`/`Score` confidence or mid-band `Noul` probabilities (`0.4–0.6`) for rapid accept/reject, plus an optional `report wrong tag` action.
  - **Degraded AI badge:** Photos whose `jev` request failed still plot on the wheel via local color math and carry a `needs tags` badge.
  - **Cap banners:** Pre-import modal shows `"~N images, about $X"` before bulk runs; hitting the monthly `jev` spend cap or cloud storage cap pauses ingestion with a visible queue-paused banner.

## Post Preview and Export (< 15 s preview, < 30 s download)

- **Controls:** Slim top bar with platform chips (`Instagram`, `LinkedIn`, `Facebook`), `Light | Dark` theme switch, and `Compare | Focus`.
- **Shared state:** One draggable image-order strip and one shared caption box drive every preview card; optional per-platform crop or caption overrides carry an explicit override badge.
- **Surfaces:**
  - **Instagram:** Single-image feed (`1:1`, `4:5`, landscape), carousel with swipe dots, and 3-column profile grid showing the post alongside recent history.
  - **LinkedIn:** Single-image feed (`1.91:1`, `1:1`, `4:5`), multi-image grids, and carousel/document post.
  - **Facebook:** Single-image feed and multi-image grids (`2`, `3`, `4`, `5+` photos).
- **Card presentation:** Every card displays a `Preview` label, placeholder name/avatar, zero official platform logos, accurate `"see more"` truncation, and (in `Compare`) equal-width neutral framing with one compact status badge (e.g. `"subject cropped"`, `"caption cut at line 3"`) that expands details on hover. `Focus` renders one chosen platform at full inspection scale.
- **Crop-safety warning:** When `subject_visible` passes threshold and a surface crop clips `Analysis.subject_box`, show a crop warning badge and suggest a subject-preserving offset.
- **Download & history:** Export individual preset-sized files, copy single image to clipboard, or download `Export all` zip (`/<platform>/...` ordered by slide). **Strip EXIF (including GPS) by default**, with an explicit opt-out checkbox. Saving or exporting creates a `Post` record and marks included photos as used.

## Accessibility and Keyboard

- **Keyboard wheel:** Arrow keys move a polar wheel cursor, `Space` drops a circle brush selection, and `+` / `-` resizes the brush radius.
- **Color-blind-safe mode:** Overlays dot patterns/labels and displays hex values on hover so selection never relies on hue perception alone.
- **Motion:** Respects `prefers-reduced-motion` across dot clustering, zoom, and mode transitions.
