---
session: "fix-csp-wasm-loading"
timestamp: "2026-04-08T22:12:00Z"
model: claude-opus-4-6
---

## Human

Reported that mainifold.pages.dev deployment was getting a "WASM failed to load"
error after a recent change. Asked to investigate and fix.

## Assistant

Investigated the WASM loading failure on the Cloudflare Pages deployment.

**Root cause:** Commit 5865f9f added a Content-Security-Policy with
`script-src 'self' 'wasm-unsafe-eval'` but omitted `'unsafe-eval'`. The app's
code editor executes user-written geometry code via `new Function('api', code)`
in `src/geometry/engine.ts`, which requires `'unsafe-eval'` in the CSP's
`script-src` directive. Without it, the Function constructor is blocked by the
browser's CSP enforcement.

**Fix:** Added `'unsafe-eval'` to the `script-src` directive in both:
- `index.html` (meta tag, used in production)
- `vite.config.ts` (server headers, used in local dev)
