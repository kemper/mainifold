# Codebase Concerns

**Analysis Date:** 2026-03-09

## Tech Debt

**God File: `src/main.ts` (1164 lines):**
- Issue: The entire console API (`window.mainifold`), geometry stats computation, assertion checking, stat diffing, session orchestration, clip control wiring, and application bootstrap are all in a single file. Over 60% of the codebase logic lives here.
- Files: `src/main.ts`
- Impact: Any change to the console API, assertions, or execution logic risks breaking unrelated features. Hard to navigate and reason about. Functions like `computeGeometryStats`, `checkAssertions`, `computeStatDiff`, and `executeIsolated` should be in their own modules.
- Fix approach: Extract into focused modules:
  - `src/api/consoleApi.ts` — the `window.mainifold` object definition
  - `src/geometry/stats.ts` — `computeGeometryStats`, `computeStatDiff`, `checkAssertions`
  - `src/geometry/assertions.ts` — `GeometryAssertions` interface and `checkAssertions`
  - Keep `src/main.ts` as a thin bootstrap/wiring layer (<200 lines)

**Duplicated MeshData-to-BufferGeometry Conversion:**
- Issue: Two nearly identical functions convert `MeshData` to `THREE.BufferGeometry`: `meshDataToGeometry` in `src/renderer/multiview.ts` (line 19) and `meshGLToBufferGeometry` in `src/renderer/viewport.ts` (line 249). Both do the exact same vertex extraction and normal computation.
- Files: `src/renderer/multiview.ts`, `src/renderer/viewport.ts`
- Impact: Bug fixes or optimizations to geometry conversion must be applied in two places. Easy to miss one.
- Fix approach: Extract to a shared utility in `src/renderer/geometry.ts` and import from both files.

**Duplicated Download/Export Pattern:**
- Issue: Each export file (`src/export/gltf.ts`, `src/export/stl.ts`, `src/export/obj.ts`, `src/export/threemf.ts`) independently implements the Blob-to-download pattern (create ObjectURL, create anchor, click, revoke). Only `gltf.ts` has a named `downloadBlob` helper.
- Files: `src/export/gltf.ts`, `src/export/stl.ts`, `src/export/obj.ts`, `src/export/threemf.ts`
- Impact: Minor -- repeated boilerplate, but functional. Any change to download behavior (e.g., adding a filename dialog) requires touching 4 files.
- Fix approach: Extract `downloadBlob(blob, filename)` to `src/export/utils.ts` and import in all export modules.

**Duplicated Component Decomposition Logic:**
- Issue: The pattern of decomposing a manifold into components and extracting volume/surfaceArea/centroid/boundingBox is repeated verbatim in `runAndExplain` (line 847) and `query` with `decompose: true` (line 980) inside `src/main.ts`.
- Files: `src/main.ts` (lines 844-856, 978-989)
- Impact: Both blocks have identical logic. Fixing a bug in one requires remembering to fix the other.
- Fix approach: Extract to a `decomposeManifold(manifold)` helper function.

**Pervasive `any` Types for Manifold Objects:**
- Issue: The manifold-3d WASM module lacks TypeScript type definitions. All Manifold instances are typed as `any` throughout the codebase (9 `eslint-disable-next-line @typescript-eslint/no-explicit-any` suppressions). This includes `currentManifold`, function parameters in `computeGeometryStats`, `sliceAtZ`, `getBoundingBox`, and the decompose logic.
- Files: `src/main.ts` (lines 47-48, 71-72, 523-524, 698-699, 806-807, 817-818, 840-841, 941-942), `src/geometry/engine.ts` (line 4), `src/geometry/crossSection.ts` (lines 4-5, 92-93)
- Impact: No compile-time safety for the most critical part of the application. Typos in method names (e.g., `.volume()` vs `.getVolume()`) become runtime errors. Method signature changes in manifold-3d upgrades are invisible at build time.
- Fix approach: Create a `src/types/manifold.d.ts` with type declarations for the subset of the manifold-3d API actually used (Manifold class, CrossSection class, module-level functions). Even partial types would catch most errors.

**Imperative DOM Construction Throughout UI:**
- Issue: All UI components (`src/ui/layout.ts`, `src/ui/toolbar.ts`, `src/ui/sessionBar.ts`, `src/ui/gallery.ts`, `src/ui/sessionList.ts`) build DOM imperatively with `document.createElement`, `classList.add`, inline style strings, and manual event listener attachment. No templating or component model.
- Files: `src/ui/layout.ts`, `src/ui/toolbar.ts`, `src/ui/sessionBar.ts`, `src/ui/gallery.ts`, `src/ui/sessionList.ts`
- Impact: Verbose and hard to maintain. Adding a new UI element requires 5-10 lines of boilerplate. CSS classes are duplicated as string literals across files with no central theme. Inline styles (e.g., `bar.style.backgroundColor = '#1a1a2e'` in `src/ui/sessionBar.ts` line 32) bypass Tailwind.
- Fix approach: This is acceptable for a vanilla TS project. If the UI grows significantly, consider adopting a lightweight component library (Lit, Preact) or at minimum a shared `createElement` helper that reduces boilerplate.

## Known Bugs

**Previous Manifold Not Deleted on New Code Execution:**
- Symptoms: WASM memory grows over time as users iterate on designs. `currentManifold` is reassigned in `runCodeSync` (line 1073) without calling `.delete()` on the previous value.
- Files: `src/main.ts` (lines 1058-1081)
- Trigger: Every code execution leaks the previous Manifold's WASM memory.
- Workaround: Page reload cleans up all WASM memory. The issue only becomes noticeable during long sessions with many iterations.

**Clip Plane Helper Positioned at Incorrect X/Y:**
- Symptoms: The translucent red clip disc is positioned using `modelBounds` which only tracks Z min/max. The X and Y coordinates are set to `(modelBounds.min + modelBounds.max) / 2` -- which is the Z midpoint, not the actual X/Y center of the model.
- Files: `src/renderer/viewport.ts` (lines 231-234)
- Trigger: Any model that is not centered near the origin will show the clip disc offset from the actual geometry.
- Workaround: The disc is very large (1.5x the Z range as radius) so it usually covers the model anyway. The visual is cosmetic.

**Material Not Disposed in Viewport `updateMesh`:**
- Symptoms: Materials are created on every `updateMesh` call but never disposed in the cleanup loop. Only geometry is disposed.
- Files: `src/renderer/viewport.ts` (lines 97-106)
- Trigger: Every code execution creates 2-3 new materials without cleaning up the old ones.
- Workaround: WebGL context cleanup on page reload. Modern browsers are relatively tolerant of material leaks.

**Multiview Scene Doesn't Dispose Geometry on Re-render:**
- Symptoms: `disposeScene` in `src/renderer/multiview.ts` (line 45) only disposes materials, not geometry. The geometry is disposed separately after the function, but if `disposeScene` is called without the manual `geometry.dispose()`, geometry leaks.
- Files: `src/renderer/multiview.ts` (lines 45-51)
- Trigger: If code paths are added that call `disposeScene` without also calling `geometry.dispose()`.
- Workaround: Current callers all call `geometry.dispose()` after `disposeScene()`.

## Security Considerations

**Arbitrary Code Execution via `new Function`:**
- Risk: User-provided JavaScript is executed via `new Function('api', code)` with no sandboxing beyond strict mode. The executed code has full access to the browser environment: `window`, `document`, `fetch`, `localStorage`, `XMLHttpRequest`, etc. It can read cookies, make network requests, and modify the DOM.
- Files: `src/geometry/engine.ts` (line 41)
- Current mitigation: `"use strict"` mode prepended to code. COEP/COOP headers prevent cross-origin resource sharing issues. The code only runs locally in the user's own browser.
- Recommendations: For a local-only CAD tool this is acceptable. If the tool ever allows loading shared URLs that auto-execute code (e.g., `?code=...`), this becomes a critical XSS vector. Consider using a Web Worker with restricted scope, or at minimum sanitizing code before execution if user-shared code becomes a feature.

**Session IDs Are Predictable:**
- Risk: Session IDs are generated using `Math.random()` (12 alphanumeric characters). `Math.random()` is not cryptographically secure.
- Files: `src/storage/db.ts` (lines 57-64)
- Current mitigation: Sessions are stored in the user's own IndexedDB. There is no server-side session sharing, so predictability is not exploitable.
- Recommendations: If session sharing or server-side storage is added, switch to `crypto.randomUUID()` or `crypto.getRandomValues()`.

**No Input Validation on Imported Sessions:**
- Risk: `importSession` in `src/ui/sessionList.ts` does minimal validation (checks for `data.mainifold`, `data.session`, and `Array.isArray(data.versions)`) but does not validate the structure of individual versions or sanitize the code strings. Malformed geometry data could cause runtime errors during gallery rendering.
- Files: `src/ui/sessionList.ts` (lines 65-78), `src/storage/sessionManager.ts` (lines 280-305)
- Current mitigation: The code is just stored and re-executed through the same `executeCode` path, which has try/catch error handling.
- Recommendations: Add schema validation (e.g., with zod, which is already in `node_modules`) to validate imported session structure before processing.

**Reference Images as Data URLs:**
- Risk: Reference images are stored as full base64 data URLs in IndexedDB session records. Large images (e.g., 10MB photos) are stored entirely in memory and in the database. No size limits are enforced.
- Files: `src/ui/sessionBar.ts` (lines 181-201), `src/storage/db.ts` (Session interface)
- Current mitigation: None.
- Recommendations: Add file size validation (e.g., max 5MB per image), resize large images before storing, or use a separate IndexedDB object store for binary data with chunked storage.

## Performance Bottlenecks

**Synchronous Code Execution Blocks the Main Thread:**
- Problem: `executeCode` in `src/geometry/engine.ts` runs user code synchronously on the main thread. Complex boolean operations with high polygon counts can freeze the UI for seconds.
- Files: `src/geometry/engine.ts` (line 18), `src/main.ts` (lines 1058-1081)
- Cause: WASM execution through `new Function` is synchronous. `runCodeSync` does the execution, mesh update, multiview rendering, elevation rendering, and stats computation all in one synchronous block.
- Improvement path: Move code execution to a Web Worker. The manifold-3d library supports worker-based execution (see `manifold-3d/lib/worker.test.js` in node_modules). This would unblock the main thread and allow a progress indicator.

**Redundant Rendering on Every Code Execution:**
- Problem: Every `runCodeSync` call renders ALL views: viewport mesh update, multiview panel (4 isometric views), and elevations panel (5 orthographic + 1 isometric). This happens even though only one tab is visible at a time.
- Files: `src/main.ts` (lines 1071-1077)
- Cause: `updateMesh`, `updateMultiView`, and `renderElevationsToContainer` are all called unconditionally.
- Improvement path: Only render the active tab's view. Render other tabs lazily when they become visible. The current `tab-switched` event listener on `gallery` (line 377) shows this pattern already exists for one tab.

**Offscreen Renderer Shared Singleton:**
- Problem: `src/renderer/multiview.ts` uses a single shared `offRenderer` (line 33) for all offscreen rendering. Each render call resizes it. When rendering views for thumbnails, elevations, and single views in sequence, the renderer is resized multiple times per frame.
- Files: `src/renderer/multiview.ts` (lines 33-42)
- Cause: Single renderer is resized on every call to `getOffscreenRenderer(size)`.
- Improvement path: Minor concern. The resize cost is small compared to actual rendering. Could maintain separate renderers for different sizes if profiling shows it matters.

**Gallery Thumbnail Loading Creates Object URLs:**
- Problem: Each gallery tile creates a `URL.createObjectURL` from the thumbnail Blob. The URL is revoked on `img.load`, but if the gallery is refreshed before images load (e.g., rapid tab switching), URLs may leak.
- Files: `src/ui/gallery.ts` (lines 114-117)
- Cause: Object URLs are created on gallery render, but `galleryEl.innerHTML = ''` on re-render orphans images before their load handlers fire.
- Improvement path: Track created Object URLs and revoke them all in `refreshGallery` before clearing the container.

## Fragile Areas

**Console API (`window.mainifold`):**
- Files: `src/main.ts` (lines 458-1022)
- Why fragile: The API surface is large (30+ methods) and defined as a single object literal inside the `main()` function closure. All methods capture local variables (`currentManifold`, `currentMeshData`, `_running`, `statusBar`, `elevationsContainer`) via closure. Adding or modifying a method requires understanding which closured variables it depends on.
- Safe modification: Trace all variable references in the method you're changing. Test both the isolated API methods (`runIsolated`, `runAndAssert`) and the stateful ones (`run`, `runAndSave`) as they have different side-effect profiles.
- Test coverage: Zero automated tests. All testing is manual via the browser console.

**Session State Machine:**
- Files: `src/storage/sessionManager.ts`
- Why fragile: Session state is managed as a module-level singleton (`currentState`) with listeners. State transitions (create, open, save, navigate, close) mutate the singleton and update the URL. Race conditions are possible if multiple async operations overlap (e.g., rapid version navigation triggers concurrent IndexedDB reads).
- Safe modification: Always await the completion of one operation before starting another. The `saveVersion` function has a deduplication guard (lines 156-158) but other operations do not.
- Test coverage: Zero automated tests.

**Tab Switching and URL State:**
- Files: `src/ui/layout.ts` (lines 109-153), `src/storage/sessionManager.ts` (lines 64-83)
- Why fragile: Two independent systems modify URL parameters. `switchTab` in layout.ts manages `view` and `gallery` params. `updateURL` in sessionManager.ts manages `session` and `v` params. Both use `replaceState`. If they run in quick succession, one can overwrite the other's changes because both read `window.location.search` independently.
- Safe modification: Use a centralized URL state manager rather than having two independent writers.
- Test coverage: Zero automated tests.

## Scaling Limits

**IndexedDB Session Storage:**
- Current capacity: Unlimited sessions and versions, each storing full code text, geometry stats JSON, and a PNG thumbnail Blob.
- Limit: Browser IndexedDB storage limits vary (typically 50-80% of free disk space, but can be as low as 100MB in some contexts). Large sessions with many versions (100+) and high-resolution thumbnails could hit limits.
- Scaling path: Add storage usage tracking and warnings. Implement version pruning (keep last N versions). Compress thumbnails more aggressively or reduce resolution.

**Single WebGL Context:**
- Current capacity: The offscreen renderer in `src/renderer/multiview.ts` and the viewport renderer in `src/renderer/viewport.ts` use separate WebGL contexts. Most browsers limit to 8-16 active WebGL contexts.
- Limit: Not a practical concern with the current 2-context setup, but adding more renderers could hit this.
- Scaling path: Share a single WebGL context between viewport and offscreen rendering if more contexts are needed.

## Dependencies at Risk

**manifold-3d (^3.3.2):**
- Risk: Core dependency for all geometry operations. WASM-based with C++ backend. API surface is accessed through untyped `any` references. A major version bump could silently break the application without compile-time errors.
- Impact: All geometry creation, boolean operations, cross-sections, and mesh extraction depend on this.
- Migration plan: Pin to exact version in `package.json` (remove `^`). Create TypeScript type declarations for the used API surface. Run smoke tests after any upgrade.

**Three.js (^0.183.2):**
- Risk: Rapid release cycle (monthly). The `three/addons` import path and `GLTFExporter` API can change between releases. The `OrbitControls` import path has changed in past versions.
- Impact: Viewport rendering, multiview rendering, all export functionality.
- Migration plan: Pin version. The current usage is straightforward (basic geometry rendering, no advanced features), so upgrades should be manageable.

## Missing Critical Features

**No Undo/Redo:**
- Problem: The code editor supports undo/redo (CodeMirror built-in), but there is no application-level undo for geometry operations. Executing code replaces the model with no way to go back except manually editing and re-running.
- Blocks: Fast iteration workflows. Users must manually save versions to preserve intermediate states.

**No Error Boundary for Rendering:**
- Problem: If Three.js rendering fails (e.g., WebGL context lost), there is no recovery mechanism. The viewport goes blank with no error message.
- Blocks: Reliability on low-end devices or when switching between applications (which can trigger context loss).

## Test Coverage Gaps

**No Automated Tests Exist:**
- What's not tested: The entire codebase has zero test files. No unit tests, no integration tests, no end-to-end tests.
- Files: All files in `src/`
- Risk: Any change can break any feature with no safety net. Regression detection relies entirely on manual testing via the browser console.
- Priority: High. At minimum, add tests for:
  1. `computeGeometryStats` / `checkAssertions` (pure functions, easy to test)
  2. `computeStatDiff` (pure function)
  3. Session manager state transitions (create, open, save, navigate, close)
  4. Export format correctness (STL binary format, OBJ text format, 3MF ZIP structure)
  5. `simpleHash` consistency

**No Linting or Formatting Configuration:**
- What's not tested: No `.eslintrc`, `.prettierrc`, `biome.json`, or any formatting config exists in the project root. The `eslint-disable` comments in the code reference ESLint rules, but ESLint is not installed or configured.
- Files: Project root (missing config files)
- Risk: Code style drift. The `eslint-disable` comments are dead code with no actual linter to suppress. New code may not follow existing conventions.
- Priority: Medium. Add ESLint + Prettier configs or Biome for consistent formatting and basic error detection.

**No CI Validation Beyond Build:**
- What's not tested: The GitHub Actions workflow (`.github/workflows/deploy.yml`) only runs `npm ci` and `npm run build` (TypeScript compilation + Vite build). No linting, no tests, no type checking beyond what `tsc` provides during build.
- Files: `.github/workflows/deploy.yml`
- Risk: Broken features can be deployed to GitHub Pages as long as the code compiles.
- Priority: Medium. Add lint and test steps to the CI pipeline once tests exist.

**Production COEP/COOP Headers Not Configured:**
- What's not tested: The COEP/COOP headers required for `SharedArrayBuffer` (which manifold-3d's WASM threading needs) are only configured for the Vite dev server in `vite.config.ts`. The production build deploys static files to GitHub Pages, which must serve these headers separately.
- Files: `vite.config.ts` (lines 10-14)
- Risk: If GitHub Pages does not serve these headers (it does not by default), the WASM threading may fall back to single-threaded mode or fail entirely in production. This may already be an issue.
- Priority: High. Verify production behavior. If headers are missing, add a service worker or `_headers` file for the hosting platform, or configure the build to include a `Cross-Origin-Isolation` service worker.

---

*Concerns audit: 2026-03-09*
