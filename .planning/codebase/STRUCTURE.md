# Codebase Structure

**Analysis Date:** 2026-03-09

## Directory Layout

```
mainifold/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages deployment
├── .planning/
│   └── codebase/               # GSD analysis documents (this file)
├── docs/                       # Project planning & design docs (not published)
│   ├── CAD_PROJECT_PLAN.md
│   ├── plan-ai-iteration-loop.md
│   ├── plan-annotations-and-parameters.md
│   ├── plan-model-painting.md
│   ├── plan-human-ui-features.md
│   └── feedback-from-claude-chrome-extension*.md
├── examples/                   # Example manifold code files loaded by toolbar dropdown
│   ├── basic_shapes.js
│   ├── boolean_demo.js
│   ├── chess_rook.js
│   ├── christmas_tree.js
│   ├── desk_organizer.js
│   ├── l_bracket.js
│   ├── spur_gear.js
│   └── twisted_vase.js
├── prompts/                    # Prompt templates for AI workflows
│   └── castle-session.md
├── public/                     # Static assets served as-is
│   ├── ai.md                   # AI instructions served at /ai.md
│   ├── coi-serviceworker.js    # COOP/COEP service worker for SharedArrayBuffer
│   ├── freddy-ref.jpg          # Reference image
│   └── ref-right.jpg           # Reference image
├── ref-images/                 # Reference images for photo-to-model workflow
├── scripts/                    # Node.js utility scripts (not part of the app)
│   ├── castle-session.js       # Session creation script
│   ├── generate-views.cjs      # Gemini-powered photo analysis
│   ├── generate-reference-images.cjs  # Reference image generation
│   └── log-cabin-session.mjs   # Session creation script
├── screenshots/                # Screenshot storage (empty)
├── src/                        # Application source code
│   ├── editor/
│   │   └── codeEditor.ts       # CodeMirror editor init, get/set value
│   ├── export/
│   │   ├── gltf.ts             # GLB export via Three.js GLTFExporter
│   │   ├── stl.ts              # Binary STL export (manual buffer construction)
│   │   ├── obj.ts              # OBJ text export
│   │   └── threemf.ts          # 3MF export (XML + custom ZIP builder)
│   ├── geometry/
│   │   ├── engine.ts           # manifold-3d WASM init + sandboxed code execution
│   │   ├── crossSection.ts     # Z-slice to polygons/SVG, bounding box extraction
│   │   └── types.ts            # MeshData, MeshResult, CrossSectionResult interfaces
│   ├── renderer/
│   │   ├── viewport.ts         # Three.js interactive viewport (OrbitControls, clipping)
│   │   ├── multiview.ts        # Offscreen multi-view renderer (isometric + elevation + reference images)
│   │   └── materials.ts        # Shared Three.js material factories
│   ├── storage/
│   │   ├── db.ts               # IndexedDB CRUD for sessions and versions
│   │   └── sessionManager.ts   # Session state machine, URL sync, observer pattern
│   ├── ui/
│   │   ├── layout.ts           # Split-pane layout, tab system, clip controls
│   │   ├── toolbar.ts          # Top toolbar (run, examples, export dropdown)
│   │   ├── panels.ts           # AI Views panel wiring (multi-view render + copy/download)
│   │   ├── sessionBar.ts       # Session status bar (version nav, save, refs loader)
│   │   ├── gallery.ts          # Gallery grid view (version thumbnails + stats)
│   │   └── sessionList.ts      # Session list modal (browse, create, delete, import/export)
│   ├── main.ts                 # App entry point, console API, execution loop (~1165 lines)
│   ├── style.css               # Tailwind import + viewport canvas sizing
│   └── vite-env.d.ts           # Vite type declarations
├── index.html                  # SPA entry HTML
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite config (Tailwind plugin, COOP/COEP headers)
├── CLAUDE.md                   # AI agent instructions (symlinked as AGENTS.md and GEMINI.md)
├── AGENTS.md -> CLAUDE.md      # Symlink
├── GEMINI.md -> CLAUDE.md      # Symlink
└── README.md                   # Project readme
```

## Directory Purposes

**`src/geometry/`:**
- Purpose: WASM-based geometry engine interface
- Contains: Engine initialization, code execution sandbox, cross-section utilities, shared type definitions
- Key files: `engine.ts` (core), `types.ts` (shared interfaces)

**`src/renderer/`:**
- Purpose: All 3D rendering -- interactive viewport and offscreen multi-view
- Contains: Three.js scene setup, camera management, mesh updates, offscreen rendering, material definitions, reference image display
- Key files: `viewport.ts` (interactive), `multiview.ts` (static views + elevations)

**`src/editor/`:**
- Purpose: Code editor component
- Contains: Single-file CodeMirror integration
- Key files: `codeEditor.ts`

**`src/export/`:**
- Purpose: 3D model file format exporters
- Contains: One file per export format, each producing a downloadable Blob
- Key files: `gltf.ts` (uses Three.js exporter), `stl.ts`, `obj.ts`, `threemf.ts` (includes custom ZIP builder)

**`src/storage/`:**
- Purpose: Client-side persistence layer
- Contains: Raw IndexedDB operations and higher-level session management with state observation
- Key files: `db.ts` (CRUD), `sessionManager.ts` (state machine + URL sync)

**`src/ui/`:**
- Purpose: DOM construction and user interaction handling
- Contains: Layout structure, toolbar, tab system, session UI components, gallery view
- Key files: `layout.ts` (overall structure + tabs), `sessionBar.ts` (session controls), `gallery.ts` (version grid)

**`examples/`:**
- Purpose: Sample geometry code loaded via the toolbar dropdown
- Contains: `.js` files imported at build time via `import.meta.glob('../examples/*.js', { query: '?raw' })`
- Key files: `basic_shapes.js` (default loaded on startup)

**`scripts/`:**
- Purpose: Node.js utility scripts for AI workflows (not part of the browser app)
- Contains: Gemini API integration for photo analysis, session creation scripts
- Key files: `generate-views.cjs` (photo-to-model analysis)

**`public/`:**
- Purpose: Static files served at root path
- Contains: `ai.md` (AI instructions at `/ai.md`), `coi-serviceworker.js` (COOP/COEP for SharedArrayBuffer), reference images

**`docs/`:**
- Purpose: Internal planning and design documents
- Contains: Feature plans, feedback notes, project roadmap
- Not published or served by the app

## Key File Locations

**Entry Points:**
- `index.html`: SPA HTML shell, loads `src/main.ts` as module
- `src/main.ts`: Application bootstrap, console API, execution orchestration

**Configuration:**
- `vite.config.ts`: Build config, Tailwind plugin, COOP/COEP dev server headers, base path `/mainifold/`
- `tsconfig.json`: Strict TypeScript, ES2020 target, bundler module resolution
- `package.json`: Dependencies, `npm run dev` / `npm run build` / `npm run preview`

**Core Logic:**
- `src/geometry/engine.ts`: WASM initialization and sandboxed code execution
- `src/main.ts`: Geometry stats computation, assertion checking, console API (lines 458-1022)
- `src/storage/sessionManager.ts`: Session state management and URL synchronization

**Rendering:**
- `src/renderer/viewport.ts`: Interactive 3D viewport with clipping plane
- `src/renderer/multiview.ts`: Offscreen rendering for AI views, elevations, and single-view captures

**Testing:**
- No test files exist in this codebase

## Naming Conventions

**Files:**
- `camelCase.ts`: All source files use camelCase (e.g., `codeEditor.ts`, `sessionManager.ts`, `crossSection.ts`)
- `snake_case.js`: Example files use snake_case (e.g., `basic_shapes.js`, `chess_rook.js`)
- `.cjs` / `.mjs`: Node.js scripts use explicit extensions based on module system

**Directories:**
- `lowercase`: All directory names are lowercase singular nouns (e.g., `geometry`, `renderer`, `editor`, `storage`, `ui`, `export`)

**Exports:**
- Named exports only -- no default exports in any source file
- Functions are exported individually: `export function initEngine()`, `export function executeCode()`
- Types exported with `export interface` or `export type`

## Where to Add New Code

**New Geometry Feature (e.g., new primitive, mesh operation):**
- If extending the manifold-3d API surface: `src/geometry/engine.ts` (add to `api` object)
- If adding a new analysis/utility: New file in `src/geometry/` (e.g., `src/geometry/analysis.ts`)
- Wire into console API in `src/main.ts`

**New Export Format:**
- Create `src/export/<format>.ts`
- Follow the pattern in `src/export/stl.ts`: accept `MeshData`, produce Blob, trigger download
- Wire into toolbar in `src/main.ts` callbacks and console API

**New UI Panel or Tab:**
- Create `src/ui/<panelName>.ts`
- Add tab button and content container in `src/ui/layout.ts` (follow the `tabInteractive`/`tabAI`/`tabElevations`/`tabGallery` pattern)
- Add URL parameter handling in `switchTab()` function

**New Rendering Mode:**
- Add to `src/renderer/multiview.ts` for static/offscreen rendering
- Add to `src/renderer/viewport.ts` for interactive rendering
- Share materials via `src/renderer/materials.ts`

**New Console API Method:**
- Add to the `mainifoldAPI` object literal in `src/main.ts` (around line 458)
- Follow the existing pattern: sync methods for queries, async methods for operations with side effects
- Update `CLAUDE.md` documentation

**New Example:**
- Create `examples/<name>.js`
- It will be auto-discovered via `import.meta.glob('../examples/*.js', { query: '?raw' })` -- no manual registration needed
- File name (snake_case, without `.js`) becomes the dropdown label with underscores replaced by spaces

**New Storage Entity:**
- Add interface to `src/storage/db.ts`
- If new IndexedDB object store needed: bump `DB_VERSION` and handle in `onupgradeneeded`
- Add higher-level operations in `src/storage/sessionManager.ts`

**New Script (Node.js utility):**
- Create in `scripts/` directory
- Use `.cjs` for CommonJS or `.mjs` for ESM (package.json has `"type": "module"`)

## Special Directories

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in `.gitignore`)

**`dist/`:**
- Purpose: Production build output
- Generated: Yes (by `npm run build`)
- Committed: No (in `.gitignore`)

**`.planning/codebase/`:**
- Purpose: GSD analysis documents for AI agent consumption
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes

**`nanobanana-output/`:**
- Purpose: Unknown output directory (empty)
- Generated: Yes
- Committed: Unclear (present but empty)

---

*Structure analysis: 2026-03-09*
