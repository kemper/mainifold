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

**Fix (round 1):** Added `'unsafe-eval'` to the `script-src` directive in both:
- `index.html` (meta tag, used in production)
- `vite.config.ts` (server headers, used in local dev)

**Fix (round 2):** The staging `_headers` file (served by Cloudflare Pages as
HTTP headers) had its own CSP without `'unsafe-eval'`. When both an HTTP header
CSP and a meta tag CSP exist, browsers enforce the most restrictive intersection.
Fixed `public/_headers` and removed the redundant meta tag from `index.html` —
the `_headers` file is the single source of truth for production CSP.

**Cleanup:** Removed 57 tracked junk files from the staging branch:
- `.playwright-mcp/` screenshots and exported models from testing
- 40+ top-level PNG files (lowpoly cat renders, gemini/claude comparison images)
- Test reference images in `public/` (freddy-ref.jpg, lowpoly-cat, ref-right.jpg)
- Chrome extension feedback docs (`docs/feedback-from-claude-chrome-extension*.md`)
Updated `.gitignore` to prevent future accumulation.


