# 004 — Import popover origin matches trigger

- **Status**: TODO
- **Commit**: 27d3306
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files (`styles.css`, `App.tsx`, ~25 lines)

## Problem

The import menu sets `transformOrigin` inline but has no transform or entrance in CSS — the property has no effect until motion exists, and it lives in JSX instead of styles.

```tsx
/* apps/web/src/App.tsx:154-160 — current */
            {importOpen ? (
              <div
                ref={importPopoverRef}
                className="import-popover"
                role="menu"
                style={{ transformOrigin: "top left" }}
              >
```

```css
/* apps/web/src/styles.css:76-90 — current */
.import-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  ...
}
```

Popover is anchored under `Add photos` (`top-bar-primary` `position: relative`). Scaling from center would feel detached; `top left` matches the trigger's top-left corner. The origin must live in CSS alongside a proper ease-out enter, not as an orphaned inline style.

## Target

```css
/* target */
.import-popover {
  transform-origin: top left;
  transition:
    opacity 200ms var(--ease-out),
    transform 200ms var(--ease-out);
}
@starting-style {
  .import-popover {
    opacity: 0;
    transform: scale(0.95);
  }
}
```

Enter: `scale(0.95)` + `opacity: 0` → rest, 200ms `var(--ease-out)`. No `scale(0)`.

Remove inline `style={{ transformOrigin: "top left" }}` from `App.tsx`.

Keyboard: Escape already closes (`App.tsx:72-76`). Opening via button click is pointer; if opened via keyboard, skip transform enter (reuse pattern from plan 003 if `aria-expanded` toggles without pointer).

## Repo conventions to follow

- Popover trigger anchoring: `left: 0` under primary button — `top left` origin (AUDIT.md §3)
- Token `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` at `styles.css:10`
- Sharp radius `var(--radius-chrome)` on popover (`styles.css:88`)

## Steps

1. Add `transform-origin: top left` and starting-style / transition rules to `.import-popover` in `styles.css`.
2. Remove inline `transformOrigin` from `App.tsx`.
3. Add `@media (prefers-reduced-motion: reduce)` override: opacity fade only, no scale.
4. If `@starting-style` unsupported in target browsers, document fallback: `data-mounted` class toggled in `useEffect` on popover (executor chooses after checking Vite browserslist).

## Boundaries

- Do NOT change popover position (`top`/`left`) in this plan.
- Do NOT add `transition: all`.
- Do NOT add animation libraries.
- If `.import-popover` moved out of `App.tsx`, STOP and report.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` — pass.
- **Feel check**: Click `Add photos` — menu grows from its top-left corner, not the center. Click outside / Escape closes without scale glitch. Slow-motion: initial frame shows `scale(0.95)` at popover top-left. Reduced motion — fade only.
- **Done when**: `transform-origin: top left` is in CSS; popover enter uses strong ease-out; no inline origin on JSX.