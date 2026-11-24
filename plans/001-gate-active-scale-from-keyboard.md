# 001 — Gate `:active` scale to pointer presses

- **Status**: TODO
- **Commit**: 27d3306
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file (`apps/web/src/styles.css`, ~15 lines)

## Problem

Chrome buttons animate `transform` on every `:active` press, including keyboard activation (Space/Enter). Grid and tray keyboard paths are high-frequency; Emil's rule is **0ms motion on keyboard-driven actions**.

Evidence:

```css
/* apps/web/src/styles.css:211-223 — current */
.chrome-btn,
button:not(.tile):not(.tray-tile) {
  ...
  transition:
    ...
    transform 150ms var(--ease-out);
}

/* apps/web/src/styles.css:395-397 — current */
.chrome-btn:active,
button:not(.tile):not(.tray-tile):active {
  transform: scale(0.97);
}
```

`.tile` and `.tray-tile` are correctly excluded, but header chrome (`Add photos`, mode filters, lightbox controls) still scale when activated from the keyboard.

## Target

Pointer fine presses keep subtle press feedback; keyboard activation does not animate `transform`.

```css
/* target — press feedback pointer-only */
@media (hover: hover) and (pointer: fine) {
  .chrome-btn:active,
  button:not(.tile):not(.tray-tile):active {
    transform: scale(0.97);
    transition: transform 160ms var(--ease-out);
  }
}

/* outside that media query: no :active transform on chrome buttons */
```

Keep existing `@media (prefers-reduced-motion: reduce)` block that zeroes `:active` transform on chrome buttons.

## Repo conventions to follow

- Easing token: `:root { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); }` at `apps/web/src/styles.css:10`
- Hover gate pattern already used at `styles.css:374-393` and `styles.css:180-186`
- Photo tiles already opt out via `button:not(.tile)` selectors

## Steps

1. Move the `.chrome-btn:active, button:not(.tile):not(.tray-tile):active` rule block inside `@media (hover: hover) and (pointer: fine) { ... }`.
2. Split button `transition` so `transform` transition applies only inside the same pointer-fine media query (color/background transitions may stay global at 150ms).
3. Verify no duplicate `:active` rules remain outside the media query except the reduced-motion override at `styles.css:406-408`.

## Boundaries

- Do NOT touch `apps/web/src/**/*.tsx`.
- Do NOT add scale feedback to `.tile` or `.tray-tile`.
- Do NOT add new dependencies.
- If selectors differ at HEAD ≠ `27d3306`, STOP and report drift.

## Verification

- **Mechanical**: From repo root, `pnpm typecheck` and `pnpm test` — expect pass.
- **Feel check**: Run `pnpm dev:web`, focus `Add photos`, press Space/Enter — the button should toggle import with **no** visible shrink. Click the same button with a mouse — a brief `scale(0.97)` press is acceptable. Tab to a chrome button, press Space — no scale. DevTools → Rendering → emulate `prefers-reduced-motion: reduce` — no press scale anywhere.
- **Done when**: Keyboard Space/Enter on chrome buttons never animates `transform`; pointer `:active` still shows `scale(0.97)` inside `(hover: hover) and (pointer: fine)`.