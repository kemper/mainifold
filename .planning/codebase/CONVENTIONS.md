# Coding Conventions

**Analysis Date:** 2026-03-09

## Naming Patterns

**Files:**
- Use `camelCase.ts` for all source files: `codeEditor.ts`, `sessionManager.ts`, `crossSection.ts`
- Use `snake_case.js` for example files: `basic_shapes.js`, `twisted_vase.js`, `spur_gear.js`
- Use `camelCase.cjs` / `camelCase.mjs` for Node scripts: `generate-views.cjs`
- Config files at root use standard names: `vite.config.ts`, `tsconfig.json`

**Functions:**
- Use `camelCase` for all functions: `executeCode`, `sliceAtZ`, `computeGeometryStats`, `createSessionBar`
- Prefix with action verbs: `create*`, `init*`, `update*`, `render*`, `export*`, `get*`, `set*`, `compute*`, `check*`
- Boolean-returning functions use `is*` prefix: `isClipping()`, `isRunning()`, `isGalleryMode()`
- Internal/private helpers use short names: `el()`, `btn()`, `tx()` in `src/storage/db.ts` and `src/ui/sessionBar.ts`

**Variables:**
- Use `camelCase`: `currentMeshData`, `geometryDataEl`, `offRenderer`
- Module-level state uses `let` with descriptive names: `let currentManifold`, `let clippingEnabled`
- Prefixed with underscore for import aliases to avoid name collisions: `_setRefImages`, `_clearRefImages`, `_getRefImages`
- Constants use `UPPER_SNAKE_CASE`: `DB_NAME`, `DB_VERSION`, `VIEWS`, `ELEVATIONS`, `TOUCH_TOL`, `ANGLE_KEYS`

**Types/Interfaces:**
- Use `PascalCase`: `MeshData`, `MeshResult`, `CrossSectionResult`, `ViewConfig`, `ElevationConfig`
- Interface names describe the data shape: `LayoutElements`, `ToolbarCallbacks`, `SessionBarCallbacks`, `SessionState`
- Exported types co-located with implementation or in dedicated `types.ts` files (e.g., `src/geometry/types.ts`)
- Use `type` imports via `import type { ... }` pattern (enforced by `verbatimModuleSyntax` in tsconfig)

## Code Style

**Formatting:**
- No Prettier or ESLint config files exist in the project
- TypeScript strict mode (`"strict": true` in `tsconfig.json`)
- 2-space indentation throughout all `.ts` files
- Single quotes for string literals
- Semicolons at end of statements
- Trailing commas in multi-line parameter lists and object literals
- Line length generally kept under 140 characters, but some longer lines exist (e.g., complex class strings)

**Linting:**
- TypeScript compiler provides linting via `tsconfig.json`:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`
  - `strict: true`
- No ESLint, Biome, or other linter configured
- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments appear in code despite no ESLint config, suggesting ESLint was used previously or comments are preemptive

**TypeScript Strictness:**
- Use `unknown` for catch clause variables: `catch (e: unknown)` with `e instanceof Error ? e.message : String(e)` pattern
- Nullable types explicitly handled: `MeshData | null`, `Version | null`
- WASM interop uses `any` type with eslint-disable comments for manifold-3d objects that lack proper TypeScript types
- Non-null assertion (`!`) used sparingly for DOM elements known to exist: `document.getElementById('...')!`, `canvas.getContext('2d')!`

## Import Organization

**Order:**
1. CSS imports first (only in entry file): `import './style.css'`
2. External library imports: `import * as THREE from 'three'`, `import { EditorView } from '@codemirror/view'`
3. Internal module imports grouped by layer: geometry, renderer, editor, ui, storage, export
4. Type-only imports use `import type { ... }` syntax (enforced by `verbatimModuleSyntax`)

**Path Aliases:**
- No path aliases configured. All imports use relative paths: `'../geometry/types'`, `'./materials'`
- Three.js addons imported via `'three/addons/...'` paths

**Re-exports:**
- `src/storage/sessionManager.ts` re-exports types from `src/storage/db.ts`: `export type { Session, Version, ReferenceImagesData } from './db'`
- Import renaming used to avoid name collisions between DB functions and manager functions: `import { createSession as dbCreateSession, ... } from './db'`

## Error Handling

**Patterns:**
- Return error objects instead of throwing: `{ mesh: null, manifold: null, error: 'message' }` in `src/geometry/engine.ts`
- Silent catch blocks with `catch { }` for non-critical failures (WASM property access that may not exist)
- Error messages enhanced with contextual hints in `src/geometry/engine.ts` (line 68-78):
  ```typescript
  if (msg.includes('BindingError') && msg.includes('deleted object')) {
    msg += '\nHint: A Manifold or CrossSection was used after being deleted...';
  }
  ```
- DOM operations guarded with optional chaining: `el?.addEventListener(...)`, `document.getElementById('...')?.addEventListener(...)`
- Async error handling uses try/catch in `async` functions, with `alert()` for user-facing errors in UI code (e.g., `src/ui/sessionList.ts` line 77)
- Top-level `main().catch(console.error)` pattern for the application entry point

**Error UI pattern:**
- Status bar changes color to indicate state: emerald for ready, amber for loading/running, red for error
- Error messages truncated in status bar via `max-w-xs truncate` CSS class
- `#geometry-data` element always contains JSON with either `status: 'ok'` or `status: 'error'`

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- Styled console.log for API availability announcement at startup (`src/main.ts` line 1027-1045)
- `console.error` for caught errors in export callbacks
- No verbose debug logging in production code
- Geometry data exposed via DOM element (`#geometry-data`) rather than console for machine readability

## Comments

**When to Comment:**
- File-level comments describe module purpose: `// IndexedDB storage for sessions and versions`, `// Session bar -- thin strip below toolbar showing session state`
- Section separators using `// === Section Name ===` pattern: `// === Clipping API ===`, `// === Session API ===`, `// === Versions ===`
- Inline comments for non-obvious logic: coordinate system notes, WASM quirks, binary format byte offsets
- JSDoc-style `/** ... */` comments for public API methods on `window.mainifold` (extensive documentation in `src/main.ts`)

**JSDoc/TSDoc:**
- Used extensively for the `mainifoldAPI` object methods in `src/main.ts`
- Used for complex renderer functions in `src/renderer/multiview.ts`
- Not used consistently for internal module functions

## Function Design

**Size:**
- Most functions are under 50 lines
- Exception: `main()` in `src/main.ts` is the application bootstrap (over 700 lines) containing all initialization and the `mainifoldAPI` object definition
- Helper functions extracted for repeated patterns: `el()`, `btn()`, `createTab()`, `createButton()`

**Parameters:**
- Use options objects for functions with many optional parameters:
  ```typescript
  renderSingleView(meshData: MeshData, options: {
    elevation?: number;
    azimuth?: number;
    ortho?: boolean;
    size?: number;
  } = {})
  ```
- Use callbacks interface pattern for component communication:
  ```typescript
  export interface ToolbarCallbacks {
    onRun: () => void;
    onExportGLB: () => void;
    // ...
  }
  ```
- Destructured parameters for mesh data: `const { vertProperties, triVerts, numTri, numProp } = meshData`

**Return Values:**
- Return `null` for "not found" / "not available" states
- Return result objects with explicit success/failure fields: `{ passed: boolean, failures?: string[], stats: ... }`
- Functions that download files return `void` (side effect is file download via anchor click)
- Promise-returning functions are `async` and return the resolved type

## Module Design

**Exports:**
- Named exports exclusively. No default exports anywhere.
- Each module exports its public API as individual named functions: `export function initViewport(...)`, `export function updateMesh(...)`
- Module-level state is private (not exported): `let renderer`, `let camera`, `let scene`
- Getter functions expose needed private state: `getScene()`, `getCamera()`, `getRenderer()`, `getClipState()`

**Barrel Files:**
- No barrel/index files. Each module imported directly by path.

## DOM Construction Pattern

- All UI is built imperatively via `document.createElement()` -- no JSX, no templates, no framework
- Tailwind CSS utility classes applied via `element.className = '...'`
- Pattern: create element, set className, set textContent/attributes, append to parent
- Helper functions `el(tag, className, text)` and `btn(text, onClick)` in `src/ui/sessionBar.ts` for repetitive DOM creation
- Event listeners attached inline during construction: `element.addEventListener('click', handler)`
- Cleanup via `container.innerHTML = ''` before re-rendering (e.g., gallery, elevation views)

## State Management

- Module-level `let` variables for component state (no global store, no reactive framework)
- Pub/sub pattern for session state: `onStateChange(listener)` in `src/storage/sessionManager.ts`
- URL parameters as source of truth for navigation state, synced via `history.replaceState`
- Custom DOM events for cross-component communication: `window.dispatchEvent(new CustomEvent('tab-switched', ...))`
- `#geometry-data` DOM element as a machine-readable data channel for AI agents

## CSS/Styling

- Tailwind CSS v4 via `@tailwindcss/vite` plugin
- `@import "tailwindcss"` in `src/style.css` (single line, no custom CSS except viewport canvas sizing)
- Dark theme exclusively: `bg-zinc-900`, `text-zinc-400`, `border-zinc-700`
- Color semantics: emerald for success, amber for loading, red for errors, blue for primary actions
- Responsive not a concern -- app is fullscreen desktop layout

---

*Convention analysis: 2026-03-09*
