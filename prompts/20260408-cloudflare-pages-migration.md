---
session: "cloudflare-pages-migration"
timestamp: "2026-04-08T15:00:00Z"
model: claude-opus-4-6
tools: [playwright-mcp]
---

## Human

Page refresh on deployed site returns 404 for /mainifold/editor and /mainifold/help.
Want all routes to be RESTful and linkable. After discussing hosting options,
decided to migrate from GitHub Pages to Cloudflare Pages for native SPA routing
support and future flexibility (Ruby backend on Fly.io, etc.).

## Changes

- Removed /mainifold/ base path — app now serves from root (/)
- Added Cloudflare Pages _redirects for SPA catch-all (/* /index.html 200)
- Added _headers for native COOP/COEP headers
- Removed GitHub Actions deploy workflow
- Updated all route references across source, docs, and planning files
- Removed .planning/ directory (not using GSD skills)
