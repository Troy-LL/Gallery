# 002 — Keep grid photo tiles still; add non-scale hover

- **Status**: TODO
- **Commit**: 27d3306
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file (`apps/web/src/styles.css`, ~20 lines)

## Problem

Grid photo tiles (`.tile`) are seen tens of times per session. Scaling photographs on hover feels like the image is moving; press feedback belongs on chrome, not the photo surface.

The repo already blocks transform on tiles inside the pointer-fine gate:

```css
/* apps/web/src/styles.css:389-392 — current */
  .tile:hover,
  .tile:active {
    transform: none;
  }
```

But `.tile` has **no** pointer-only hover affordance besides `tile-in-tray` outline (`styles.css:336-339`). High-frequency tiles feel inert on mouse hover while chrome buttons lift with `translateY(-1px)`.

Keyboard paths: `Grid.tsx` arrows move focus; Space opens inspect (`apps/web/src/grid/Grid.tsx:35-38`). Hover rules must not affect keyboard focus rings.

## Target

Photos never scale on hover or press. Pointer hover gets a static cue (outline or border), not `transform`.

```css
/* target */
@media (hover: hover) and (pointer: fine) {
  .tile:hover {
    transform: none;
    outline: 2px solid color-mix(in oklab, var(--ink) 28%, transparent);
    outline-offset: -2px;
  }

  .tile:active {
    transform: none;
  }
}

.tile-in-tray {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
}
```

No `scale()`, no `translateY()`, no transition on `transform` for `.tile`.

## Repo conventions to follow

- Sharp chrome radius: `--radius-chrome: 2px` (`styles.css:11`)
- Tray selection already uses 2px ink outline (`styles.css:336-339`) — match weight for hover, lighter mix for non-tray hover
- Pointer gate matches `styles.css:374`

## Steps

1. Add `.tile { transition: outline-color 120ms var(--ease-out); }` (outline only — not `transition: all`).
2. Inside `@media (hover: hover) and (pointer: fine)`, add `.tile:hover` outline as above; keep `transform: none` on `:active`.
3. Ensure `.tile-in-tray` wins over hover outline (same specificity or order after hover rule).
4. Confirm `.chrome-btn:hover` rules do not apply to `.tile` (already excluded via `button:not(.tile)`).

## Boundaries

- Do NOT animate `transform` on `.tile` or `.tile img`.
- Do NOT add hover scale to tray thumbs (`.tray-tile`) in this plan.
- Do NOT change `Grid.tsx` markup.
- If `.tile` selectors changed at HEAD, STOP and report.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` — pass.
- **Feel check**: Mouse over grid thumbnails — subtle outline appears, image does not grow or shift. Keyboard arrow through grid — no hover outline flash on focused tile unless pointer is also over it. Space opens lightbox without any tile scale. Reduced motion — outline may remain; no transform motion added.
- **Done when**: No `scale` or `translate` on `.tile` hover/active; pointer hover shows outline-only feedback.