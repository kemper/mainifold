# Architecture

**Analysis Date:** 2026-03-09

## Pattern Overview

**Overall:** Single-Page Application with monolithic entry point (`src/main.ts`) orchestrating functional modules

**Key Characteristics:**
- Static site, no backend -- all logic runs in the browser
- WASM-based geometry engine (manifold-3d) executed via sandboxed `new Function()` calls
- Three.js for 3D rendering (interactive viewport + offscreen multi-view rendering)
- IndexedDB for client-side persistence (sessions, versions, thumbnails)
- `window.mainifold` console API designed as the primary interface for AI agent interaction
- URL-driven state: tabs, sessions, and versions reflected in query parameters

## Layers

**Geometry Engine (`src/geometry/`):**
- Purpose: Initialize manifold-3d WASM module and execute user-provided JavaScript code against it
- Location: `src/geometry/`
- Contains: WASM initialization, sandboxed code execution, cross-section slicing, shared types
- Depends on: `manifold-3d` npm package (WASM)
- Used by: `src/main.ts` (directly and via console API)

**Renderer (`src/renderer/`):**
- Purpose: Convert mesh data into visual output -- interactive 3D viewport and static multi-view renders
- Location: `src/renderer/`
- Contains: Three.js interactive viewport with OrbitControls, offscreen multi-view renderer (isometric + elevation), material definitions, SVG cross-section rendering, reference image overlay
- Depends on: `three` (Three.js), `src/geometry/types.ts`
- Used by: `src/main.ts`, `src/ui/panels.ts`

**Editor (`src/editor/`):**
- Purpose: Provide a CodeMirror-based code editor for writing manifold geometry code
- Location: `src/editor/`
- Contains: Single file -- editor initialization, get/set value, debounced onChange callback
- Depends on: `codemirror`, `@codemirror/lang-javascript`, `@codemirror/theme-one-dark`, `@codemirror/state`, `@codemirror/view`
- Used by: `src/main.ts`

**Storage (`src/storage/`):**
- Purpose: Client-side persistence of sessions, versions, and reference images via IndexedDB
- Location: `src/storage/`
- Contains: Low-level IndexedDB operations (`db.ts`) and higher-level session state management with URL sync (`sessionManager.ts`)
- Depends on: Browser IndexedDB API
- Used by: `src/main.ts`, `src/ui/sessionBar.ts`, `src/ui/gallery.ts`, `src/ui/sessionList.ts`

**UI (`src/ui/`):**
- Purpose: Construct the DOM layout, toolbar, tab system, session management UI, and gallery view
- Location: `src/ui/`
- Contains: Layout with split pane and tabs, toolbar with run/export/example-select, session bar, gallery grid, session list modal
- Depends on: `src/renderer/multiview.ts`, `src/storage/sessionManager.ts`, `src/storage/db.ts`
- Used by: `src/main.ts`

**Export (`src/export/`):**
- Purpose: Convert mesh data to downloadable file formats (GLB, STL, OBJ, 3MF)
- Location: `src/export/`
- Contains: Format-specific exporters, each producing a Blob and triggering a download
- Depends on: `src/geometry/types.ts`, `three` (for GLB via GLTFExporter), `src/renderer/viewport.ts` (GLB reads scene)
- Used by: `src/main.ts` (toolbar callbacks and console API)

**Orchestrator (`src/main.ts`):**
- Purpose: Application entry point that wires all layers together and exposes the `window.mainifold` console API
- Location: `src/main.ts`
- Contains: Initialization sequence, `runCode`/`runCodeSync` execution loop, geometry stats computation, assertion checking, stat diffing, thumbnail capture, the entire console API (~40 methods), clip control wiring
- Depends on: All other layers
- Used by: `index.html` (script entry point), AI agents (via `window.mainifold`)

## Data Flow

**Code Execution (primary flow):**

1. User edits code in CodeMirror editor OR AI agent calls `mainifold.run(code)` / `mainifold.runAndSave(code, label)`
2. `src/main.ts` receives code string, calls `executeCode(code)` in `src/geometry/engine.ts`
3. `engine.ts` wraps code in `new Function('api', code)`, passes manifold-3d API objects, executes
4. Code must `return` a `Manifold` object; `engine.ts` calls `.getMesh()` to extract `MeshData`
5. `src/main.ts` receives `MeshResult` (mesh + manifold + error), updates module-level `currentMeshData` and `currentManifold`
6. Mesh is pushed to all renderers: `updateMesh()` (interactive viewport), `updateMultiView()` (isometric views), `renderElevationsToContainer()` (orthographic elevations)
7. Geometry stats computed via `computeGeometryStats()` and written to `#geometry-data` hidden DOM element as JSON
8. If in a session, stats and thumbnail are persisted to IndexedDB via `saveVersion()`

**Isolated Execution (no side effects):**

1. AI agent calls `mainifold.runIsolated(code)` or `mainifold.runAndAssert(code, assertions)`
2. `executeIsolated(code)` in `src/main.ts` runs code and computes stats but does NOT update `currentMeshData`, viewport, editor, or session state
3. Manifold object is deleted after stats extraction to prevent memory leaks
4. Returns geometry stats (and optionally a thumbnail via offscreen composite render)

**Session Versioning:**

1. `src/storage/sessionManager.ts` manages a `currentState: SessionState` singleton with `session`, `currentVersion`, `versionCount`
2. State changes trigger registered listener callbacks (observer pattern via `onStateChange()`)
3. Every state mutation updates the URL via `history.replaceState()` -- `?session=<id>&v=<index>`
4. `src/ui/sessionBar.ts` re-renders itself on each state change notification
5. Gallery view (`src/ui/gallery.ts`) reads versions from IndexedDB on demand when the gallery tab is selected

**State Management:**
- **Geometry state:** Module-level variables in `src/main.ts` (`currentMeshData`, `currentManifold`, `_running`)
- **Session state:** Singleton object in `src/storage/sessionManager.ts` with observer pattern
- **Editor state:** Encapsulated in `src/editor/codeEditor.ts` via CodeMirror EditorView instance
- **Viewport state:** Module-level variables in `src/renderer/viewport.ts` (scene, camera, renderer, controls, clip state)
- **Reference images:** Module-level variable in `src/renderer/multiview.ts` (`_referenceImages`)
- **URL state:** Query parameters managed by `src/storage/sessionManager.ts` and `src/ui/layout.ts` -- source of truth for session, version, and active tab

## Key Abstractions

**MeshData:**
- Purpose: Intermediate representation of 3D geometry for rendering and export
- Defined in: `src/geometry/types.ts`
- Pattern: Plain data object with typed arrays (`vertProperties: Float32Array`, `triVerts: Uint32Array`)
- Used by: All renderers, all exporters, `src/main.ts`

**MeshResult:**
- Purpose: Return type from code execution -- contains mesh data, the live manifold reference, and any error
- Defined in: `src/geometry/types.ts`
- Pattern: Discriminated union (check `error` field)

**Session / Version:**
- Purpose: Persistent design iteration tracking
- Defined in: `src/storage/db.ts`
- Pattern: IndexedDB entities with compound index (`sessionId_index` for `[sessionId, index]`)
- Session has: `id`, `name`, `created`, `updated`, `referenceImages?`
- Version has: `id`, `sessionId`, `index`, `code`, `geometryData`, `thumbnail`, `label`, `timestamp`

**GeometryAssertions:**
- Purpose: Declarative constraints for validating geometry output (volume, bounds, manifold status, proportions)
- Defined in: `src/main.ts` (interface + `checkAssertions()` function)
- Pattern: Object with optional numeric bounds, checked against computed geometry stats

**Console API (`window.mainifold`):**
- Purpose: The primary interface for AI agents to interact with the application programmatically
- Defined in: `src/main.ts` (object literal assigned to `window.mainifold`)
- Pattern: Facade over all layers -- ~40 methods spanning code execution, isolated testing, assertions, session management, export, clipping, view rendering, and reference images

## Entry Points

**Browser Entry:**
- Location: `index.html` -> `src/main.ts`
- Triggers: Page load
- Responsibilities: Initialize WASM engine, create DOM layout, init editor/viewport, expose console API, optionally restore session from URL

**Console API Entry:**
- Location: `window.mainifold` (set in `src/main.ts`)
- Triggers: AI agent interaction via browser DevTools, Chrome extension, or automation
- Responsibilities: All geometry operations, session management, view rendering, export

**Service Worker (COOP/COEP):**
- Location: `public/coi-serviceworker.js`
- Triggers: Page load (before main script)
- Responsibilities: Adds `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers required for `SharedArrayBuffer` (needed by manifold-3d WASM threads)

## Error Handling

**Strategy:** Errors are caught at execution boundaries and surfaced through structured data rather than exceptions

**Patterns:**
- `executeCode()` in `src/geometry/engine.ts` catches all errors during code execution, enhances WASM error messages with actionable hints, and returns `{ mesh: null, error: "..." }`
- `src/main.ts` propagates errors to `#geometry-data` JSON (`{ status: "error", error: "...", executionTimeMs, codeHash }`)
- Console API methods return error objects rather than throwing: `{ error: "No geometry loaded" }`, `{ passed: false, failures: [...] }`
- Status bar shows colored text (emerald=ready, amber=running, red=error) with truncated error messages
- IndexedDB operations use `reqToPromise()` wrapper in `src/storage/db.ts` to convert IDBRequest callbacks to Promises
- WASM memory cleanup uses defensive `try { manifold.delete?.() } catch {}` pattern throughout

## Cross-Cutting Concerns

**Logging:** Minimal -- `console.log` for API availability announcement on startup, `console.error` for GLB export failures. No logging framework.

**Validation:** `mainifold.validate(code)` provides fast syntax/logic checking without rendering. `checkAssertions()` validates geometry stats against declarative constraints. `runAndExplain()` provides component decomposition diagnostics.

**Authentication:** None -- static site with no backend or user accounts.

**URL State Synchronization:** Managed in two places:
- `src/storage/sessionManager.ts` handles `?session=<id>&v=<index>` updates
- `src/ui/layout.ts` handles `?view=ai|elevations` and `?gallery` updates
- Both use `history.replaceState()` to avoid polluting browser history

**WASM Memory Management:** Intermediate `Manifold` and `CrossSection` objects consume WASM heap memory. Isolated execution paths (`runIsolated`, `runAndAssert`, `runAndExplain`) explicitly call `.delete()` on manifold objects after extracting stats. The main execution path retains `currentManifold` until the next run overwrites it.

---

*Architecture analysis: 2026-03-09*
