# Partwright — AI-Driven Browser CAD Tool

## Quick Start

```bash
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build to dist/
```

Open `http://localhost:5173/editor?view=ai` to start with the 4 isometric views visible (instead of the interactive viewport). This is the recommended URL for AI agents — all views are visible on page load without clicking any tabs.

Requires COEP/COOP headers (configured in vite.config.ts) for SharedArrayBuffer / WASM threads.

## Deployment

Hosted on **Cloudflare Pages** with production custom domain `www.partwrightstudio.com` and branch-based environments:

- **`staging`** branch → Cloudflare Pages preview deploy
- **`main`** branch → production deploy (protected, requires PR review)

**All work should be merged to `staging` first.** Do not push directly to `main`. The workflow is:

1. Create a feature branch, develop and test locally
2. Merge to `staging` — auto-deploys for verification
3. Once validated on staging, open a PR from `staging` → `main` for production release

- **Build command:** `npm run build`
- **Output directory:** `dist/`
- **SPA routing:** `public/_redirects` (`/* /index.html 200`)
- **Headers:** `public/_headers` (COEP, COOP, CSP) — Cloudflare Pages serves these automatically
- **Environment variable:** Set `SITE_URL` in Cloudflare Pages dashboard (Settings > Environment variables) to the production URL (`https://www.partwrightstudio.com`). This is used at build time by the `absoluteUrls` Vite plugin to make Open Graph image URLs and canonical links absolute. If `SITE_URL` is not set, the plugin falls back to `CF_PAGES_URL` (provided automatically by Cloudflare Pages for each deployment).

## Smoke Test — Verifying the App Works

After any changes that touch routing, Vite config, index.html, or initialization code, verify these things still work:

1. **Landing page**: Navigate to `http://localhost:5173/` — should show the hero section ("Partwright", "AI-driven parametric CAD in your browser"), CTA buttons, and a Recent Sessions grid (or empty state).
2. **Open Editor**: Click "Open Editor" on the landing page — URL should change to `/editor`, status should show "Ready" (green), the code editor should appear on the left with a default example, and a 3D model should render in the viewport on the right.
3. **WASM engine loads**: The status indicator (between editor header and tabs) should say "Ready" in green, NOT "Loading WASM..." or "WASM failed". If it shows "WASM failed", check:
   - `coi-serviceworker.js` loads without 404 (check Network tab)
   - `manifold.wasm` loads without 403 (check Network tab) — if 403, check `server.fs.strict` in vite.config.ts
   - COEP/COOP headers are present on responses (check Response Headers)
4. **Help page**: Click the `?` icon in the toolbar — should navigate to `/help` and show the help content. "Back" should return to the editor.
5. **AI agent bypass**: `http://localhost:5173/editor?view=ai` should skip the landing page and go straight to the editor with AI Views tab selected.
6. **Session loading**: Click a session tile on the landing page — should load the session code in the editor, show the session name in the session bar, and update the URL to `/editor?session=<id>`.
7. **Build**: `npm run build` should succeed with no TypeScript errors.
8. **Paint mode**: Click the Paint button in the viewport overlay. A color picker panel should appear. Click a face on the model — it should paint the coplanar region in the selected color. The Paint button badge should show the region count.
9. **Editor lock**: After painting a face, the editor should show a lock banner ("This version has color regions applied.") and become read-only. The run button should be disabled.
10. **Unlock modal**: Click "Unlock to edit" — a modal should appear with two options (preserve/destructive). Clicking "Unlock editor" with the default "preserve" option should save the colored version and create a new uncolored version. The editor should unlock.
11. **Gallery badges**: Colored versions in the gallery should show small color-swatch dots next to the version label.
12. **Color export**: With color regions painted, export GLB — the file should carry vertex colors. Export 3MF — the file should include `<basematerials>` and per-triangle `pid` attributes.

## AI Agent Workflow & API Reference

For the full Manifold/CrossSection API, `window.partwright` console API, session workflow, verification patterns, and photo-to-model workflow, see `public/ai.md`. The legacy `window.mainifold` alias remains available for older prompts.

Key rules:
- **Always use sessions** for user-requested geometry — never create files in `examples/`
- Code must `return` a Manifold. Sandbox: `const { Manifold, CrossSection } = api;`
- Shapes must volumetrically overlap by 0.5+ units to boolean-union correctly
- Use `runAndSave(code, label, {isManifold: true, maxComponents: 1})` to validate+commit
- Use `getSessionContext()` when resuming a session to read notes and version history first
- Log design decisions with `addSessionNote("[PREFIX] ...")` — prefixes: `[REQUIREMENT]`, `[DECISION]`, `[FEEDBACK]`, `[MEASUREMENT]`, `[ATTEMPT]`, `[TODO]`
- API methods validate their arguments — no type coercion, unknown keys rejected. Value-returning methods return `{ error }` on bad input; void setters throw. See `public/ai.md#argument-validation`

## Architecture

Static site, no backend. Vanilla TypeScript + Vite.

- `src/geometry/engine.ts` — manifold-3d WASM init + code execution
- `src/renderer/viewport.ts` — Three.js interactive viewport
- `src/renderer/multiview.ts` — 4 isometric view grid (always visible)
- `src/editor/codeEditor.ts` — CodeMirror editor
- `src/ui/layout.ts` — Split-pane layout
- `src/ui/toolbar.ts` — Top toolbar
- `src/ui/panels.ts` — Views panel wiring
- `src/geometry/crossSection.ts` — Z-slice to SVG/polygons
- `src/export/gltf.ts` — GLB export
- `src/export/stl.ts` — STL export
- `src/export/obj.ts` — OBJ export
- `src/export/threemf.ts` — 3MF export (ZIP-packaged XML)

## Coordinate System

- **Right-handed, Z-up.** The XY plane is the ground, Z points up.
- Units are arbitrary (no physical unit assumed). Use consistent scale.

## Development Guidelines

### Planning Files

Write interstitial planning, design, and brainstorming documents to `.plans/` (gitignored). Do **not** write plan files to `docs/` — that directory is reserved for user-facing documentation that ships with the project.

### URL State

The app uses path-based routing for top-level pages and query parameters for view state within the editor.

**Paths:**
- `/` — Landing page (hero + recent sessions grid)
- `/editor` — Editor view (code + viewport)
- `/help` — Help/docs page

**Query parameters** (on `/editor`):
- `?view=ai` — AI Views tab
- `?view=elevations` — Elevations tab
- `?gallery` — Gallery tab
- `?notes` — Notes tab
- `?session=<id>` — Active session
- `?session=<id>&v=3` — Specific version

AI agent URLs like `/editor?view=ai` bypass the landing page entirely. Tab switching is handled in `src/ui/layout.ts` (`switchTab`). Session/version state is handled in `src/storage/sessionManager.ts` (`updateURL`). Page-level routing is in `src/main.ts`.

### Resource Lifecycle

Every resource you acquire must have a corresponding release:

- **Three.js**: When removing a `THREE.Mesh`, dispose both its `.geometry` and `.material` (handle `Array.isArray(mat)` for multi-materials). Failing to dispose materials leaks WebGL GPU memory.
- **Blob URLs**: Every `URL.createObjectURL()` must have a matching `URL.revokeObjectURL()`. The standard pattern is `img.addEventListener('load', () => URL.revokeObjectURL(img.src))`.
- **Event listeners on `document` or `window`**: If the component that added the listener can be destroyed/recreated, store a reference and call `removeEventListener` on teardown. Singleton components (created once, never destroyed) are exempt.

### URL State Consistency

Every URL parameter the app writes must also be read back correctly everywhere:

- If `switchTab()` in `layout.ts` writes a parameter (e.g., `?notes`), then `getViewState()` in `main.ts` must detect it. These two locations must stay in sync.
- `updateURL()` in `sessionManager.ts` must preserve tab parameters it doesn't own — don't delete query params managed by other modules.
- When adding a new tab or URL parameter, grep for all places that read or write URL state and update them all.

### IndexedDB Transactions

Always await `txn.oncomplete` before returning from functions that modify IndexedDB data. Awaiting individual request promises within a transaction is not sufficient — the transaction can still fail to commit after those promises resolve. Follow the pattern in `clearAllData()`.

### Dead Code

Don't export functions unless they're imported elsewhere. When removing usage of an exported function, delete the export too. Periodically grep for exported symbols to verify they have importers.

### Internal Links and Paths

When referencing app routes in HTML/JS strings (links, prompts, instructions), use root-relative paths (`/ai.md`, `/editor?view=ai`), not paths with a subdirectory prefix. The app is served from the root, and hardcoded path prefixes break both development and deployment.

### Duplicated Logic

When two functions share identical logic (same DOM manipulation, same data transformation), extract the shared part into a single helper and have both callers use it. Copy-pasted logic drifts out of sync when one copy gets updated and the other doesn't.

## Common Errors

| Error | Cause |
|-------|-------|
| `Code must return a Manifold object. Did you forget to 'return'?` | Code didn't `return` anything, or returned undefined/null |
| `Manifold.cube is not a function` | Engine not initialized (WASM still loading) |
| `function _Cylinder called with N arguments, expected M` | Wrong number of arguments to a constructor |
| `Missing field: "x"` | Passed an array where an object was expected, or vice versa |
| Geometry renders but looks wrong | Check `isManifold` and `componentCount` in geometry-data — failed booleans often produce extra components |

## Examples

Located in `examples/*.js`. Loaded via the toolbar dropdown.
