# Motion punch list (PR-05)

Plans for `apps/web` motion, written at commit **27d3306** on branch `pr-05-motion-plans`. Read-only audit output — executors implement in a later PR.

## Seed verification

| Seed | Verdict at 27d3306 | Plan |
| --- | --- | --- |
| Keyboard `:active` scale | **Confirmed** — chrome buttons scale on all `:active`, including keyboard | 001 |
| Photo hover scale | **Confirmed gap** — tiles block transform but lack hover affordance; must not scale photos | 002 |
| Lightbox enter on keyboard | **Confirmed** — no enter yet; keyboard Space path must stay 0ms when enter is added | 003 |
| Popup `transform-origin` | **Confirmed** — inline origin on import popover, no CSS enter | 004 |
| Drag float scale | **Confirmed gap** — tray drag has no lift styling | 005 |

## Plans

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Gate `:active` scale to pointer presses | HIGH | TODO |
| 002 | Keep grid photo tiles still; add non-scale hover | MEDIUM | TODO |
| 003 | Lightbox enter motion skips keyboard open | HIGH | TODO |
| 004 | Import popover origin matches trigger | MEDIUM | TODO |
| 005 | Tray drag float scale (pointer only) | MEDIUM | TODO |

## Recommended execution order

1. **001** — Removes feel-breaking keyboard scale on chrome (no dependencies).
2. **002** — Grid hover affordance; safe before lightbox/popover work.
3. **004** — Popover origin + enter; independent of lightbox.
4. **003** — Depends on agreeing `openInspect` source API (touch Grid, App, Lightbox, Tray).
5. **005** — Tray drag polish; lowest blast radius on core browse loop.

## Dependencies

- **003 → 001**: Share pointer-only / keyboard-skip patterns; implement 001 first.
- **003 → Tray**: Space inspect in `Tray.tsx` should use keyboard source when 003 lands.
- **004** and **005** are independent.

## Verification (repo)

```bash
pnpm typecheck
pnpm test
```

Feel checks are spelled out in each plan; no browser automation required for plan completion.