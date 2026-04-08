---
session: "production-readiness"
timestamp: "2026-04-08T18:50:00Z"
model: claude-opus-4-6
tools: [playwright]
---

## Human

Shared links don't embed previews in Slack. Investigate and fix, plus
identify and implement other production-readiness improvements.

## Assistant

### Key decisions

1. **Open Graph + Twitter Card meta tags** — Added og:title, og:description,
   og:image (1200x630 PNG), twitter:card (summary_large_image) to index.html.
2. **Favicon suite** — SVG favicon, 32px PNG fallback, 180px Apple Touch Icon.
3. **Web app manifest** — For mobile "Add to Home Screen" and PWA basics.
4. **Loading splash** — Inline HTML spinner visible before JS loads, removed
   on app mount. Uses inline styles (no Tailwind dependency).
5. **Canonical URL + og:url** — With Vite plugin to resolve to absolute URLs
   at build time using Netlify's SITE_URL/URL env var.
6. **JSON-LD structured data** — SoftwareApplication schema for Google.
7. **404 page** — Route check for unrecognized paths, simple centered page
   with "Go home" button. Prevents unknown URLs from loading the editor.
8. **CSP headers** — Content-Security-Policy in _headers with wasm-unsafe-eval
   for manifold-3d, unsafe-inline for coi-serviceworker, blob: for workers.
9. **Code-splitting** — manualChunks splits Three.js (509 KB), CodeMirror
   (445 KB), and manifold-3d (44 KB) into separate cacheable chunks. Main
   bundle reduced from 1,175 KB to 221 KB.

### Files changed

- `index.html` — Meta tags, splash screen, JSON-LD, canonical
- `vite.config.ts` — Absolute URL plugin, manualChunks
- `src/main.ts` — Splash removal, 404 routing
- `src/ui/notFound.ts` — New 404 page component
- `public/_headers` — CSP header
- `public/robots.txt` — New
- `public/manifest.json` — New
- `public/favicon.svg`, `public/favicon-32.png`, `public/apple-touch-icon.png` — New
- `public/og-image.svg`, `public/og-image.png` — New
