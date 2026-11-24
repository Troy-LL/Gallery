# 005 — Tray drag float scale (pointer only)

- **Status**: TODO
- **Commit**: 27d3306
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files (`styles.css`, `Tray.tsx`, ~35 lines)

## Problem

Tray reorder uses HTML5 drag with no visual lift. Thumbs snap instantly with no feedback during drag.

```tsx
/* apps/web/src/tray/Tray.tsx:50-60 — current */
                <button
                  type="button"
                  className="tray-tile"
                  ...
                  draggable
                  onDragStart={() => {
                    dragId.current = id;
                  }}
```

```css
/* apps/web/src/styles.css:138-145 — current */
.tray-tile {
  position: relative;
  padding: 0;
  border: 1px solid var(--line);
  ...
}
```

No `.tray-tile` drag rules exist in the worktree (confirmed grep). Pointer drags should float slightly; keyboard reorder (if added later) must not animate scale.

## Target

```css
/* target */
.tray-tile {
  transition:
    transform 160ms var(--ease-out),
    box-shadow 160ms var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .tray-tile:active {
    transform: scale(1.03);
    box-shadow: 0 8px 20px -6px rgb(20 20 19 / 0.22);
  }
}
.tray-tile[data-dragging="true"] {
  transform: scale(1.06);
  box-shadow: 0 12px 28px -8px rgb(20 20 19 / 0.28);
  opacity: 0.92;
}
```

In `Tray.tsx`, set `data-dragging="true"` on the source tile in `onDragStart`; clear on `onDragEnd` (add handler on button or list).

Scale cap `1.06` — subtle lift, not `scale(0)` entrance. Use `transform` + `opacity` only (AUDIT.md §5).

## Repo conventions to follow

- Press feedback elsewhere: `scale(0.97)` on chrome `:active` — tray drag is the inverse (lift while moving)
- `--ease-out` token at `styles.css:10`
- Tray thumb size 48×48 (`Tray.tsx:70`)

## Steps

1. Add CSS above after `.tray-tile` block in `styles.css`; gate `:active` lift to pointer-fine media query.
2. In `Tray.tsx`, track dragging id in state or ref; set `data-dragging` on active tray button.
3. Wire `onDragEnd` to clear dragging state (on the button and as fallback on `tray-ids` `onDragEnd`).
4. Under `prefers-reduced-motion: reduce`, drop `transform` on drag; keep opacity cue optional.

## Boundaries

- Do NOT animate layout properties (`width`/`height`).
- Do NOT use `transition: all`.
- Do NOT implement FLIP for the full list in this plan — float on source tile only.
- Do NOT change reorder logic in `reorder()`.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` — pass.
- **Feel check**: Pointer drag a tray thumb — tile lifts (`scale(1.06)`) and soft shadow while dragging; drop restores instantly. Keyboard Space on tray still opens inspect with no drag scale. Reduced motion — no scale during drag.
- **Done when**: Dragging tray tile shows pointer-only float; at-rest tiles match commit `27d3306` when not dragging.