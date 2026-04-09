# AI-Enabled Web CAD Tool — Project Plan

## Overview

Build a browser-based parametric CAD tool powered by `manifold-3d` (WASM) and Three.js,
with a code editor, multi-view rendering, and cross-section export. The tool is a static
site with no backend — all geometry runs client-side in WebAssembly.

This document is structured so an AI agent (Claude Code + Chrome DevTools MCP) can
build, run, and verify each phase autonomously before proceeding to the next.

---

## Agent Setup

### Required Tools
- **Claude Code** — primary build agent
- **Chrome DevTools MCP** — browser inspection and verification
  - Gives Claude Code direct access to the running browser: DOM inspection,
    console reading, screenshot capture, and JavaScript execution
  - The dev server must be running (`npm run dev`) and the page open in Chrome
    before using DevTools MCP commands

### Workflow Pattern
For every phase the agent MUST:
1. Implement the feature
2. Ensure `npm run dev` is running (start it if not)
3. Use Chrome DevTools MCP to:
   - Take a screenshot and visually confirm the rendered output
   - Read the browser console and assert no errors
   - Inspect key DOM elements to confirm they exist and contain expected content
   - Execute JavaScript in the page context to read `#geometry-data` or other
     structured state
4. Only mark the phase complete when visual output and console are both clean

### Chrome DevTools MCP Verification Pattern
At each phase milestone the agent should run checks like:

```
// Take a screenshot to visually verify
devtools.screenshot()

// Read console errors
devtools.getConsoleMessages({ type: 'error' })

// Inspect a DOM element
devtools.querySelector('#geometry-data').textContent

// Execute JS in page context to read structured state
devtools.evaluate('JSON.parse(document.getElementById("geometry-data").textContent)')

// Check an element exists
devtools.evaluate('document.querySelector(".viewport-canvas") !== null')
```

The agent should save screenshots at each milestone as
`screenshots/phase{N}_{description}.png` for later review.

---

## Tech Stack

| Concern | Library | Notes |
|---|---|---|
| Build tool | Vite | Static output, no backend ever |
| Geometry kernel | `manifold-3d` (npm) | WASM, runs in browser |
| 3D rendering | `three` (npm) | BufferGeometry from Manifold mesh |
| Code editor | `codemirror` (npm) | JavaScript mode |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS v4 | Via `@tailwindcss/vite` plugin |
| Browser verification | Chrome DevTools MCP | Agent uses this to see the app |

**No React, no Vue.** Vanilla TypeScript with Vite. Keeps the dependency graph
minimal and makes the codebase easy for an AI to reason about holistically.

### Tailwind v4 Notes
- Tailwind v4 uses a Vite plugin — no `tailwind.config.js` needed for basic use
- Import via `@import "tailwindcss"` in your main CSS file
- The Three.js canvas must **not** use Tailwind layout classes — it needs explicit
  pixel dimensions managed by a ResizeObserver. Use Tailwind for everything
  surrounding the canvas (panels, toolbar, editor wrapper, modals)
- Use Tailwind's dark mode classes throughout — set `class="dark"` on `<html>`
  by default for a tool aesthetic

---

## Repository Structure

```
/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── screenshots/           # Agent saves verification screenshots here
├── src/
│   ├── main.ts            # Entry point, wires everything together
│   ├── style.css          # @import "tailwindcss" + canvas override
│   ├── geometry/
│   │   ├── engine.ts      # manifold-3d init, execute user code, return mesh
│   │   ├── types.ts       # Shared geometry types
│   │   └── crossSection.ts # Z-slice → SVG / polygon data
│   ├── renderer/
│   │   ├── viewport.ts    # Main Three.js scene, camera, controls
│   │   ├── multiview.ts   # 7-shot canonical view renderer
│   │   └── materials.ts   # Shared materials (flat, wireframe, vertex color)
│   ├── editor/
│   │   └── codeEditor.ts  # CodeMirror instance, run-on-change logic
│   ├── ui/
│   │   ├── layout.ts      # Panel sizing, splitter
│   │   ├── toolbar.ts     # Buttons: run, export, cross-section
│   │   └── panels.ts      # View panel, cross-section panel
│   └── export/
│       ├── gltf.ts        # GLB export via manifold-3d gltf-io
│       └── stl.ts         # STL export fallback
├── public/
└── examples/
    ├── basic_shapes.js
    ├── twisted_vase.js
    └── boolean_demo.js
```

---

## Phase 1 — Project Scaffold and Geometry Pipeline

**Goal:** manifold-3d initializes, executes a hardcoded JS snippet, and the resulting
mesh renders in a Three.js canvas. Nothing interactive yet.

### Tasks

1. Init project:
   ```bash
   npm create vite@latest . -- --template vanilla-ts
   npm install manifold-3d three
   npm install -D @types/three
   ```

2. Install Tailwind v4:
   ```bash
   npm install tailwindcss @tailwindcss/vite
   ```

3. Configure `vite.config.ts`:
   ```typescript
   import { defineConfig } from 'vite';
   import tailwindcss from '@tailwindcss/vite';

   export default defineConfig({
     plugins: [tailwindcss()],
     optimizeDeps: {
       exclude: ['manifold-3d']
     },
     server: {
       headers: {
         'Cross-Origin-Opener-Policy': 'same-origin',
         'Cross-Origin-Embedder-Policy': 'require-corp',
       }
     }
   });
   ```
   > **Note:** COEP/COOP headers are required for SharedArrayBuffer which manifold-3d
   > needs for its WASM threads. Do not remove them.

4. Create `src/style.css`:
   ```css
   @import "tailwindcss";

   /* Three.js canvas must be sized by ResizeObserver, not Tailwind */
   .viewport-canvas {
     display: block;
     width: 100%;
     height: 100%;
   }
   ```

5. Implement `src/geometry/engine.ts`:
   - Async `initEngine()` — loads and initializes manifold-3d WASM module
   - `executeCode(jsCode: string): MeshResult` — runs user JS in a sandboxed
     `Function()` with manifold API injected, returns mesh data
   - Exposes full manifold API: `Manifold`, `CrossSection`,
     `setMinCircularAngle`, `setMinCircularEdgeLength`, `setCircularSegments`
   - Returns `{ mesh: MeshGL, error: string | null }`

6. Implement `src/renderer/viewport.ts`:
   - Three.js `WebGLRenderer`, `PerspectiveCamera`, `Scene`
   - `OrbitControls` for mouse interaction
   - `updateMesh(meshGL: MeshGL)` — converts MeshGL to `BufferGeometry`,
     replaces scene object
   - Ambient + directional lighting, grid helper on XY plane
   - ResizeObserver for canvas resizing

7. Wire in `src/main.ts` with hardcoded example:
   ```javascript
   const { Manifold } = api;
   const sphere = Manifold.sphere(5, 32);
   const cube = Manifold.cube([8, 8, 8], true);
   return cube.subtract(sphere);
   ```

8. `index.html` — full-viewport canvas, dark background:
   ```html
   <!DOCTYPE html>
   <html lang="en" class="dark">
   <head>
     <meta charset="UTF-8" />
     <title>ManifoldCAD</title>
     <link rel="stylesheet" href="/src/style.css" />
   </head>
   <body class="bg-zinc-900 w-screen h-screen overflow-hidden">
     <canvas class="viewport-canvas" id="viewport"></canvas>
     <script type="module" src="/src/main.ts"></script>
   </body>
   </html>
   ```

### Chrome DevTools MCP Verification for Phase 1
- Take screenshot → confirm 3D shape visible against dark background
- Check console → assert no errors
- Evaluate `document.querySelector('#viewport') !== null` → true
- Evaluate `!!document.querySelector('#viewport').getContext('webgl2')` → true

### Done When
- [ ] A rendered 3D shape is visible in the browser on a dark background
- [ ] No console errors
- [ ] Screenshot shows non-blank canvas with visible geometry

---

## Phase 2 — Code Editor with Live Execution

**Goal:** Split-pane layout with CodeMirror editor on the left and 3D viewport
on the right. Editing code re-renders the geometry.

### Tasks

1. Install CodeMirror:
   ```bash
   npm install @codemirror/view @codemirror/state @codemirror/lang-javascript
   npm install @codemirror/theme-one-dark
   ```

2. Implement `src/editor/codeEditor.ts`:
   - CodeMirror with JS highlighting and One Dark theme
   - Debounced onChange (300ms) → `engine.executeCode()` → update viewport
   - `getValue() / setValue()` helpers
   - Error state styling on executeCode error

3. Implement `src/ui/layout.ts` with Tailwind:
   - `<div class="flex h-screen w-screen">` outer container
   - Editor pane: `<div class="w-2/5 flex flex-col border-r border-zinc-700">`
   - Viewport pane: `<div class="flex-1 relative">`
   - Draggable splitter between panes
   - Editor header with status indicator:
     - `text-emerald-400` for ready
     - `text-amber-400` for running
     - `text-red-400` for error

4. Load `examples/basic_shapes.js` as default editor content on startup.

5. `examples/basic_shapes.js`:
   ```javascript
   // Basic shapes demo
   // The 'api' object exposes the full manifold-3d API
   const { Manifold } = api;

   const box = Manifold.cube([10, 10, 10], true);
   const hole = Manifold.cylinder(6, 4, 4, 32);
   const result = box.subtract(hole);

   // Always return the final Manifold object
   return result;
   ```

6. Write `examples/twisted_vase.js` and `examples/boolean_demo.js`.

### Chrome DevTools MCP Verification for Phase 2
- Screenshot → confirm split-pane dark UI
- Evaluate `document.querySelector('.cm-editor') !== null` → true
- Check status indicator shows "Ready" in green
- Inject a syntax error via DevTools → screenshot error state

### Done When
- [ ] Split layout renders with Tailwind dark theme
- [ ] Editing updates geometry within ~300ms
- [ ] Status indicator reflects ready/running/error states correctly

---

## Phase 3 — Toolbar

**Goal:** Toolbar across the top with labeled action buttons. Built with Tailwind.

### Tasks

1. Implement `src/ui/toolbar.ts`:
   ```html
   <div class="flex items-center gap-1 px-3 py-1.5 bg-zinc-900
               border-b border-zinc-700 text-sm shrink-0">
     <span class="text-zinc-100 font-semibold mr-4">ManifoldCAD</span>

     <button id="btn-run"
       class="flex items-center gap-1.5 px-2.5 py-1 rounded text-zinc-300
              hover:bg-zinc-700 hover:text-zinc-100 transition-colors text-xs">
       ▶ Run
     </button>
     <button id="btn-views" class="...">⊞ Views</button>
     <button id="btn-section" class="...">⊘ Section</button>

     <div class="flex-1"></div>

     <select id="example-select"
       class="bg-zinc-800 border border-zinc-600 rounded px-2 py-1
              text-xs text-zinc-300 cursor-pointer">
       <option>Load example…</option>
     </select>

     <div class="relative" id="export-wrapper">
       <button id="btn-export" class="...">↓ Export</button>
       <div id="export-dropdown"
         class="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-600
                rounded shadow-lg py-1 hidden z-10 min-w-32">
         <button class="block w-full text-left px-3 py-1.5 text-xs
                        text-zinc-300 hover:bg-zinc-700">GLB (recommended)</button>
         <button class="...">3MF</button>
         <button class="...">STL</button>
       </div>
     </div>
   </div>
   ```

2. Wire all button handlers to module functions.

3. Example select populates via `import.meta.glob('./../../examples/*.js', { as: 'raw' })`.

### Chrome DevTools MCP Verification for Phase 3
- Screenshot → confirm toolbar visible across top
- Evaluate presence of all button IDs
- Click "▶ Run" → assert geometry updates

### Done When
- [ ] Toolbar renders with consistent Tailwind dark styling
- [ ] All buttons functional
- [ ] Export dropdown shows three options

---

## Phase 4 — Multi-View Rendering (7 Canonical Views)

**Goal:** "⊞ Views" produces a 7-shot grid. Designed for AI agents to verify
geometry from all angles without needing to ask.

### Canonical Views
| # | Name | Camera Position | Up |
|---|---|---|---|
| 0 | Front | `(0, -d, 0)` | `(0,0,1)` |
| 1 | Back | `(0, d, 0)` | `(0,0,1)` |
| 2 | Left | `(-d, 0, 0)` | `(0,0,1)` |
| 3 | Right | `(d, 0, 0)` | `(0,0,1)` |
| 4 | Top | `(0, 0, d)` | `(0,1,0)` |
| 5 | Bottom | `(0, 0, -d)` | `(0,1,0)` |
| 6 | Isometric | `(d, -d, d)` | `(0,0,1)` |

`d` = calculated from bounding box so views are always well-framed.

### Tasks

1. `src/renderer/multiview.ts`:
   - `renderMultiView(scene, mesh): HTMLCanvasElement`
   - Offscreen renderer 400×400px per view
   - Composite into 1400×800 (3 top row, 4 bottom row)
   - White background, black wireframe overlay (AI vision friendly)
   - View name label in each panel corner

2. Auto-render on every successful execution, stored quietly.

3. Modal with Tailwind:
   ```html
   <div id="views-modal"
     class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
     <div class="bg-zinc-800 rounded-lg p-4 max-w-5xl w-full mx-4 shadow-2xl">
       <div class="flex justify-between items-center mb-3">
         <h2 class="text-zinc-100 font-semibold text-sm">Canonical Views</h2>
         <button id="btn-close-views"
           class="text-zinc-400 hover:text-zinc-100 text-lg leading-none">✕</button>
       </div>
       <canvas id="multiview-canvas" class="w-full rounded"></canvas>
       <div class="flex gap-2 mt-3 justify-end">
         <button id="btn-copy-views" class="...">Copy to Clipboard</button>
         <button id="btn-download-views" class="...">Download PNG</button>
       </div>
     </div>
   </div>
   ```

### Chrome DevTools MCP Verification for Phase 4
- Click "⊞ Views" → screenshot to confirm modal with 7-panel grid
- Evaluate `!document.querySelector('#views-modal').classList.contains('hidden')`
- Count view labels visible in the composite

### Done When
- [ ] 7-view modal renders correctly
- [ ] Labels visible in all panels
- [ ] Download PNG works
- [ ] Views auto-update on code change

---

## Phase 5 — Cross-Section Export

**Goal:** Z-slice geometry, export as SVG and JSON. Gives AI agents geometric
ground truth as text rather than images.

### Tasks

1. `src/geometry/crossSection.ts`:
   ```typescript
   interface CrossSectionResult {
     polygons: number[][][];
     svg: string;
     boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
     area: number;
   }

   export function sliceAtZ(manifold: Manifold, z: number): CrossSectionResult
   ```
   - Uses manifold `.slice(z)` → `CrossSection.toPolygons()`
   - SVG: light blue fill `#dbeafe`, dark blue stroke `#1d4ed8`,
     400×400 viewBox, 20px padding, scale label

2. Cross-section panel (collapsible, below editor):
   ```html
   <div id="section-panel" class="border-t border-zinc-700 shrink-0">
     <button id="section-toggle"
       class="flex items-center w-full px-3 py-2 bg-zinc-800
              hover:bg-zinc-750 text-xs text-zinc-400 font-mono">
       ⊘ Cross-Section
       <span id="section-chevron" class="ml-auto">▾</span>
     </button>
     <div id="section-content" class="hidden p-3 space-y-2">
       <div class="flex items-center gap-2">
         <label class="text-xs text-zinc-400 w-4">Z</label>
         <input type="range" id="z-slider" class="flex-1 accent-blue-500" />
         <span id="z-value" class="text-xs text-zinc-300 w-14 text-right font-mono">
           0.00
         </span>
       </div>
       <div id="svg-preview" class="bg-zinc-900 rounded p-2 flex justify-center"></div>
       <div id="section-stats" class="text-xs text-zinc-500"></div>
       <div class="flex gap-2">
         <button id="btn-copy-svg" class="...">Copy SVG</button>
         <button id="btn-copy-json" class="...">Copy JSON</button>
       </div>
     </div>
   </div>
   ```

3. "⊘ Section" toolbar button toggles panel.

### Chrome DevTools MCP Verification for Phase 5
- Click "⊘ Section" → screenshot confirms panel opens
- Evaluate Z slider min/max match model bounding box Z range
- Evaluate `document.querySelector('#svg-preview svg') !== null` → true
- Click "Copy JSON" → evaluate `navigator.clipboard.readText()` → valid JSON

### Done When
- [ ] Panel opens with SVG cross-section for default example
- [ ] Slider updates slice in real time
- [ ] Copy SVG and Copy JSON both work

---

## Phase 6 — Face Colorization

**Goal:** Click a face, pick a color. Colors stored separately from model code,
survive code re-runs.

### Tasks

1. Face ID extraction in `engine.ts`:
   - Extract `mesh.originalID` array after execution
   - Build `Map<faceGroupID, Set<triangleIndex>>`

2. Face picking in `viewport.ts`:
   - `Raycaster` on canvas click
   - Find intersected triangle → look up face group
   - Highlight group with emissive overlay

3. Vertex color assignment:
   - `setFaceGroupColor(groupID: number, color: THREE.Color)`
   - Rebuild BufferGeometry color attribute
   - `THREE.MeshPhongMaterial` with `vertexColors: true`

4. Color picker panel (shown in toolbar when face selected):
   ```html
   <div id="color-picker-panel"
     class="hidden flex items-center gap-2 px-3 py-1 bg-zinc-800
            border border-zinc-600 rounded">
     <span class="text-xs text-zinc-400">Face</span>
     <span id="face-id-label" class="text-xs text-zinc-300 font-mono">#0</span>
     <input type="color" id="face-color-input"
       class="w-7 h-6 rounded cursor-pointer border-0 bg-transparent" />
     <button id="btn-clear-color"
       class="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
   </div>
   ```

5. Color map persists in module-level state, re-applied after each code run.

### Chrome DevTools MCP Verification for Phase 6
- Load default example (box — 6 clear faces)
- Simulate click on canvas pixel at top face via DevTools
- Screenshot → confirm highlight
- Set color input value to `#ff0000` via DevTools evaluate
- Screenshot → confirm top face is red

### Done When
- [ ] Face selection highlights correctly
- [ ] Color applies to selected face
- [ ] Colors persist across re-runs

---

## Phase 7 — Export

**Goal:** GLB (with colors), 3MF, and STL export.

### Tasks

1. `src/export/gltf.ts`:
   - Use manifold-3d's `gltf-io.ts` helper
   - Embed vertex colors
   - `EXT_mesh_manifold` extension
   - Trigger browser download

2. `src/export/stl.ts`:
   - Binary STL from BufferGeometry
   - Show toast: "STL loses color and topology. GLB recommended."

3. Toast component:
   ```html
   <div id="toast"
     class="fixed bottom-4 right-4 bg-zinc-700 text-zinc-100 text-sm
            px-4 py-2 rounded shadow-lg opacity-0 transition-opacity duration-300
            pointer-events-none">
   </div>
   ```

### Chrome DevTools MCP Verification for Phase 7
- Click Export → GLB → monitor for download event
- Assert downloaded file has `.glb` extension and is non-empty

### Done When
- [ ] GLB, 3MF, STL all download correctly
- [ ] STL shows warning toast

---

## Phase 8 — AI Ergonomics and Polish

**Goal:** Make the tool maximally useful for AI-assisted workflows via
Chrome DevTools MCP or Claude browser extension.

### Tasks

1. **`#geometry-data` element** — always-updated, machine-readable:
   ```html
   <pre id="geometry-data" class="sr-only"></pre>
   ```
   Always contains:
   ```json
   {
     "vertexCount": 1234,
     "triangleCount": 456,
     "boundingBox": { "x": [-5, 5], "y": [-5, 5], "z": [0, 10] },
     "volume": 523.6,
     "surfaceArea": 314.2,
     "isManifold": true,
     "faceGroups": 6,
     "crossSectionAtMidZ": { "area": 78.5, "contours": 1 }
   }
   ```
   AI agents read this directly — no vision needed for geometric ground truth.

2. **Keyboard shortcuts:**
   - `Ctrl+Enter` — run code
   - `Ctrl+Shift+V` — open views modal
   - `Ctrl+Shift+X` — toggle cross-section panel
   - `Ctrl+Shift+E` — export GLB

3. **URL state** — gzip + base64 encode editor code into `location.hash`.
   Decode on load. Enables shareable model links.

4. **Loading overlay** on viewport during execution:
   ```html
   <div id="loading-overlay"
     class="absolute inset-0 bg-zinc-900/60 flex items-center
            justify-center hidden">
     <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent
                 rounded-full animate-spin"></div>
   </div>
   ```

5. **Better errors** — parse stack traces, show line numbers, hint
   "Did you forget to `return` the final Manifold?" when result is undefined.

6. **README.md** — setup, manifold-3d API link, multi-view and cross-section
   documentation for AI agent authors, `#geometry-data` schema.

### Chrome DevTools MCP Verification for Phase 8
- Evaluate `JSON.parse(document.querySelector('#geometry-data').textContent)`
  → assert all expected keys present
- Press `Ctrl+Enter` → assert geometry updates
- Modify code, copy URL, open new tab → assert code restored
- Assert `#loading-overlay` becomes visible during execution

### Done When
- [ ] `#geometry-data` always reflects current model state
- [ ] All keyboard shortcuts work
- [ ] URL round-trip preserves editor code
- [ ] Loading spinner visible during execution
- [ ] README complete

---

## Key Implementation Notes

### manifold-3d WASM Initialization
```typescript
let manifoldModule: ManifoldToplevel | null = null;

export async function initEngine() {
  if (manifoldModule) return manifoldModule;
  const Module = await import('manifold-3d');
  manifoldModule = await Module.default();
  return manifoldModule;
}
```

### MeshGL → Three.js BufferGeometry
`vertProperties` is interleaved. `numProp` is the stride:

```typescript
export function meshGLToBufferGeometry(mesh: MeshGL): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(mesh.numVert * 3);

  for (let i = 0; i < mesh.numVert; i++) {
    positions[i * 3]     = mesh.vertProperties[i * mesh.numProp];
    positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geometry.computeVertexNormals();
  return geometry;
}
```

### WASM Memory Management
```typescript
let result: Manifold | null = null;
try {
  result = userFn(api);
  const mesh = result.getMesh();
  // use mesh...
} finally {
  result?.delete();
}
```

### User Code Sandbox
```typescript
const fn = new Function('api', `"use strict";\n${userCode}`);
const result = fn(manifoldAPI);
```

### Three.js Canvas Sizing
Never use Tailwind classes to size the canvas. Use ResizeObserver:

```typescript
const observer = new ResizeObserver(entries => {
  const { width, height } = entries[0].contentRect;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
observer.observe(canvas.parentElement!);
```

### COEP/COOP Headers Are Mandatory
Required for `SharedArrayBuffer` / manifold-3d WASM threads. Do not remove.

---

## Acceptance Criteria

1. Type manifold-3d JavaScript → geometry renders live
2. 7-view canonical render available, auto-updates on code change
3. Z-slice cross-sections export as SVG and JSON polygon data
4. Faces selectable and color-assignable
5. Export as GLB, 3MF, STL
6. `#geometry-data` always contains valid structured geometry metadata
7. `npm run build` produces self-contained static site in `dist/`

---

## Getting Started

```bash
# 1. Create project
npm create vite@latest manifold-cad-ai -- --template vanilla-ts
cd manifold-cad-ai

# 2. Install runtime dependencies
npm install manifold-3d three \
  @codemirror/view @codemirror/state @codemirror/lang-javascript \
  @codemirror/theme-one-dark \
  tailwindcss @tailwindcss/vite

# 3. Install dev dependencies
npm install -D @types/three

# 4. Start dev server
npm run dev
# Open http://localhost:5173 in Chrome
# Chrome DevTools MCP is now available to the agent

# Begin Phase 1. Do not proceed to Phase 2 until Chrome DevTools MCP
# confirms Phase 1 is visually correct with no console errors.
```
