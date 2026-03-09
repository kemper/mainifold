# External Integrations

**Analysis Date:** 2026-03-09

## APIs & External Services

**Geometry Engine (WASM):**
- manifold-3d - CSG geometry engine compiled to WebAssembly
  - SDK/Client: `manifold-3d` npm package
  - Auth: None (client-side WASM, no network calls)
  - Init: `src/geometry/engine.ts` - `initEngine()` dynamically imports and initializes the WASM module
  - Usage: User code executes in a sandboxed `new Function('api', code)` with access to `Manifold`, `CrossSection`, and segment config functions

**Gemini CLI (Optional, Dev-only):**
- Google Gemini AI - Used for photo-to-model workflow (architectural analysis of reference photos)
  - Client: Gemini CLI at `/opt/homebrew/bin/gemini` (not an npm dependency)
  - Auth: Managed by Gemini CLI's own auth (not app-level env vars)
  - Scripts:
    - `scripts/generate-views.cjs` - Analyzes a building photo and produces structured JSON with proportions, masses, features
    - `scripts/generate-reference-images.cjs` - Generates multi-angle reference images using Gemini CLI + nanobanana extension
  - Note: These are standalone Node.js scripts, not part of the web application. They run locally and produce JSON/image files.

**Nanobanana (Optional, Dev-only):**
- Image generation extension for Gemini CLI
  - Used by `scripts/generate-reference-images.cjs` to generate reference images from different angles
  - Auth: `NANOBANANA_API_KEY` environment variable
  - Not part of the web application

## Data Storage

**Databases:**
- IndexedDB (browser-native) - Session and version storage
  - Database name: `mainifold`
  - Database version: 1
  - Client: Direct IndexedDB API (no ORM)
  - Implementation: `src/storage/db.ts`
  - Object stores:
    - `sessions` (keyPath: `id`) - Session metadata (name, timestamps, reference images)
    - `versions` (keyPath: `id`) - Version data (code, geometry stats, thumbnails)
      - Index: `sessionId` (non-unique)
      - Index: `sessionId_index` (unique composite key)
  - Session manager: `src/storage/sessionManager.ts` - Coordinates between storage, UI, and URL state

**File Storage:**
- Local filesystem only (no cloud storage)
- Reference images stored as base64 data URLs in IndexedDB session records
- Thumbnails stored as Blobs in IndexedDB version records
- Export formats (GLB, STL, OBJ, 3MF) trigger browser download - no server-side storage

**Caching:**
- None (no explicit caching layer)
- Browser's standard HTTP cache for static assets
- WASM module cached by Vite's dependency optimization (excluded from pre-bundling via `optimizeDeps.exclude`)

## Authentication & Identity

**Auth Provider:**
- None - No authentication. Fully client-side application with no user accounts.
- All data persists in browser-local IndexedDB.

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service (no Sentry, Bugsnag, etc.)
- WASM errors are caught and enhanced with diagnostic hints in `src/geometry/engine.ts`

**Logs:**
- Browser console only (`console.log`, `console.error`)
- Geometry execution results written to DOM element `#geometry-data` as JSON for programmatic access

**Analytics:**
- None

## CI/CD & Deployment

**Hosting:**
- GitHub Pages (static site hosting)
- Base URL: `/mainifold/` (configured in `vite.config.ts`)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/deploy.yml`)
- Trigger: Push to `main` branch or manual `workflow_dispatch`
- Steps:
  1. Checkout code
  2. Setup Node.js 20 with npm cache
  3. `npm ci` (clean install)
  4. `npm run build` (TypeScript check + Vite build)
  5. Upload `dist/` as Pages artifact
  6. Deploy to GitHub Pages
- Concurrency: `group: pages`, cancels in-progress deployments

**No staging environment.** Single production deployment from `main`.

## Environment Configuration

**Required env vars:**
- None for the web application itself

**Optional env vars (scripts only):**
- `NANOBANANA_API_KEY` - Required only for `scripts/generate-reference-images.cjs`

**Secrets location:**
- No application secrets
- GitHub Pages deployment uses `id-token: write` permission for OIDC-based deployment (no manual tokens)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Browser APIs Used

**Critical browser APIs the application depends on:**
- `SharedArrayBuffer` - Required for WASM multi-threading (manifold-3d). Needs COEP/COOP headers.
- `WebAssembly` - manifold-3d geometry engine
- `WebGL` (via Three.js) - All 3D rendering
- `IndexedDB` - Session/version persistence (`src/storage/db.ts`)
- `Service Worker` - `public/coi-serviceworker.js` injects required security headers
- `Canvas API` - Offscreen rendering for thumbnails and multiview snapshots
- `Blob / URL.createObjectURL` - File exports (GLB, STL, OBJ, 3MF)
- `ResizeObserver` - Viewport canvas resizing (`src/renderer/viewport.ts`)
- `history.replaceState` - URL state management for tabs, sessions, versions

## Third-Party Addons (Three.js)

**Used from `three/addons/`:**
- `OrbitControls` - Interactive camera controls in `src/renderer/viewport.ts`
- `GLTFExporter` - GLB export in `src/export/gltf.ts`

## Export Formats

All exports are client-side only (no server processing):
- **GLB** (`src/export/gltf.ts`) - Via Three.js GLTFExporter
- **STL** (`src/export/stl.ts`) - Custom binary STL writer
- **OBJ** (`src/export/obj.ts`) - Custom OBJ text writer
- **3MF** (`src/export/threemf.ts`) - Custom XML + minimal ZIP builder (no compression)

---

*Integration audit: 2026-03-09*
