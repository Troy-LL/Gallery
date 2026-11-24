# 003 — Lightbox enter motion skips keyboard open

- **Status**: TODO
- **Commit**: 27d3306
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 3 files (`styles.css`, `App.tsx`, `Grid.tsx` — ~40 lines)

## Problem

Lightbox mounts instantly with no entrance CSS today:

```css
/* apps/web/src/styles.css:341-350 — current */
.lightbox {
  position: fixed;
  inset: 5vh 10vw;
  ...
}
```

Keyboard opens inspect without click:

```tsx
/* apps/web/src/grid/Grid.tsx:35-38 */
      if (event.key === " " && focusId) {
        event.preventDefault();
        onInspect(focusId);
```

```tsx
/* apps/web/src/App.tsx:363-371 */
      {open ? (
        <Lightbox
          record={open}
          ...
        />
      ) : null}
```

A future modal `scale(0.97)` + opacity entrance would violate the 0ms keyboard rule if it runs on Space-open. Modals may animate for pointer users, but keyboard-initiated opens must appear immediately.

## Target

- Pointer/double-click open: optional enter — `opacity` 0→1 and `scale(0.97→1)` over 200ms `var(--ease-out)`, max 300ms.
- Keyboard open (Space in grid, Space on tray tile `Tray.tsx:64-67`): **no** enter animation — set `data-enter="skip"` or equivalent on first paint.
- Reduced motion: opacity-only fade ≤200ms or instant; drop scale movement.

```css
/* target */
.lightbox[data-enter="animate"] {
  animation: lightbox-in 200ms var(--ease-out) both;
}
@keyframes lightbox-in {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
.lightbox[data-enter="skip"] {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .lightbox[data-enter="animate"] {
    animation: lightbox-fade 200ms ease both;
  }
  @keyframes lightbox-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
```

## Repo conventions to follow

- Modal scale floor `0.97`, not `scale(0)` (AUDIT.md §3)
- `--ease-out` at `styles.css:10`
- Lightbox is centered fixed — `transform-origin: center` is correct for modals (do not anchor to grid tile)

## Steps

1. Extend `openInspect(id: string, source?: "pointer" | "keyboard")` in `App.tsx`; default `pointer`.
2. Pass `source` from `Grid` Space handler as `"keyboard"`; keep `onDoubleClick` / click paths as `"pointer"`.
3. Pass `enter={source}` into `Lightbox`; on mount, set root `data-enter={enter === "keyboard" ? "skip" : "animate"}`.
4. Add CSS above to `styles.css`; modal `transform-origin: center`.
5. Tray Space inspect (`Tray.tsx`) should call `onInspect` with keyboard source — may require prop callback signature update in same PR as executor.

## Boundaries

- Do NOT animate lightbox image decode or swatch buttons on open.
- Do NOT add Framer Motion / new deps.
- Do NOT block interaction during enter animation longer than 200ms.
- If `openInspect` signature already changed at HEAD, STOP and reconcile.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` — pass.
- **Feel check**: Double-click a tile — brief modal ease-in. Focus a tile, press Space — dialog appears with **no** scale fade. Arrow inside lightbox changes photo without replaying enter. Reduced motion — opacity only. DevTools 10% playback confirms keyboard path has zero transform animation.
- **Done when**: Keyboard-open lightbox has `data-enter="skip"` and no transform animation; pointer open may use `lightbox-in`.