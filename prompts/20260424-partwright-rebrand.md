---
session: "partwright-rebrand"
timestamp: "2026-04-24T17:45:00Z"
model: codex
tools: [codex-cli]
---

## Human

Rebrand the app from mAInifold/mainifold to Partwright, prepare it for
`www.partwrightstudio.com`, add compatibility for old browser/API/session
references, explore logo options, then use the Wright Compass mark for now.

## Key Changes

1. **Product rebrand** — Updated public metadata, package names, README,
   security docs, AI-agent docs, manifest, robots, sitemap, export metadata,
   and UI copy to use Partwright.

2. **Console API migration** — Made `window.partwright` the canonical browser
   API and kept `window.mainifold` as a legacy alias for old prompts and tools.

3. **Session/storage compatibility** — Added new `partwright` session export
   marker and `.partwright.json` filenames while preserving import support for
   legacy `.mainifold.json` exports. Added a one-time IndexedDB migration from
   the old `mainifold` database into the new `partwright` database.

4. **Logo work** — Created exploratory logo sheets under `.plans/`, then
   applied the selected Wright Compass mark to the toolbar, landing page,
   favicon, Apple touch icon, and Open Graph image.

5. **Verification** — Ran `npm run build`; build passed with the existing Vite
   warnings about `coi-serviceworker.js`, `manifold-3d` browser externalization,
   and large OpenSCAD chunks.
