---
session: "theme-toggle-polish"
timestamp: "2026-04-27T16:14:59Z"
model: claude-opus-4-7
---

## Human

The light mode looks terrible; there isn't much separation between white zones. We
should improve it. Also, can we make it less bright? That white is really white and
bright. I also don't like the sun and moon Icon. I think I'd rather just have a
toggle button that says "Dark Mode" that is on by default but off when clicked
(and then turned back on when clicked again). I'd also like the light/dark
selection to be remembered for the user if they revisit the site.

## Assistant

Three changes:

1. **Light palette retuned** (`src/style.css`). The previous mapping was a
   straight inversion of the zinc scale, which collapsed body, panels, and
   hover states into nearly identical shades. New mapping:
   - `bg-zinc-900` (body) → `#ededed` — soft off-white, no longer eye-searing
   - `bg-zinc-800` (panels, toolbars) → `#ffffff` — pure white pops above body
   - `bg-zinc-700` (hover, splitters) → `#d4d4d8` — clear interactive contrast
   - `border-zinc-700/600` → `#d4d4d8` / `#a1a1aa` — visible borders
   - text shades clamp to dark grays (`#18181b` … `#52525b`) for readability

2. **Toggle button replaces sun/moon** (`src/ui/toolbar.ts`,
   `src/ui/landing.ts`). Always says "Dark Mode". Active style (filled,
   `bg-zinc-700`) when dark mode is on; outlined style when off. Uses
   `aria-pressed` for accessibility.

3. **Default to dark, no OS sniffing** (`src/ui/theme.ts`). Dropped the
   `prefers-color-scheme` fallback so first-time visitors always start in dark.
   The localStorage-backed persistence was already in place.

Also updated the Three.js viewport's light bg to `#ededed` so the 3D canvas
matches the body.
