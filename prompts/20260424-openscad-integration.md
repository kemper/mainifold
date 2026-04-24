---
session: "openscad-integration"
timestamp: "2026-04-24T13:00:00Z"
model: claude-opus-4-6
tools: [claude-code, playwright-mcp]
---

## Human

Add OpenSCAD (WASM) as an alternative modeling engine alongside the
existing manifold-3d JavaScript engine. Users should be able to toggle
between engines, with the UI clearly indicating which is active. All
existing functionality (exports, sessions, assertions, console API)
must keep working.

## Approach

### Engine architecture
Refactored `engine.ts` into a thin dispatcher with per-engine modules:
- `engines/types.ts` — Engine interface, Language type
- `engines/manifoldJs.ts` — Extracted existing JS engine
- `engines/openscad.ts` — OpenSCAD WASM wrapper
- `engines/scadToManifold.ts` — Binary STL → MeshGL parser

Key finding: Emscripten's `callMain()` can only be called once per
WASM instance. Fixed by creating a fresh instance per run (~100-300ms
overhead). The STL output is parsed, vertices welded, and round-tripped
through `Manifold.ofMesh()` so all downstream APIs work unchanged.

### Language model
Language is stored per session (not per version). All versions in a
session share the same language. Switching language creates a new
session; empty sessions are auto-cleaned.

### UI
- JS/SCAD segmented toggle in toolbar
- Modal confirmation when switching with unsaved work
- Language badges on session list, landing page, session bar
- Dynamic editor.js/editor.scad filename
- Updated help page, tour, meta descriptions, llms.txt, ai.md

### Session cleanup
Added proactive empty session cleanup in `createSession()`,
`openSession()`, and `closeSession()` — deletes sessions with
0 versions and 0 notes immediately rather than relying on the
unreliable `beforeunload` handler.
