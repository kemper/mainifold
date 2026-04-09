# Interactive Features — Combined Implementation Plan

## Overview

Three feature groups that share core infrastructure, to be built on top of mAInifold's existing interactive 3D viewport:

1. **Model Painting** — Click/brush/fill to color faces and triangles on the 3D model
2. **Click-to-Annotate** — Click a point on the model, leave a text note, persist per session. AI agents read and resolve notes.
3. **Interactive Parameters** — Extract numeric parameters from code as sliders, optionally map 3D clicks to source code

All three require the same foundation: raycasting, interaction mode management, and mesh metadata extraction. This plan builds that shared layer first, then each feature on top.

---

## Current Codebase State

### Key Files & What They Do

| File | Purpose | Lines |
|------|---------|-------|
| `src/renderer/viewport.ts` | Three.js scene, camera, OrbitControls, mesh rendering, clipping plane. Exports `getScene()`, `getCamera()`, `getRenderer()`. No raycasting exists. | 282 |
| `src/geometry/engine.ts` | WASM init, `executeCode(jsCode)` → sandbox `new Function('api', code)` → `getMesh()`. Returns `MeshResult { mesh, manifold, error }`. Currently extracts only `vertProperties`, `triVerts`, `numVert`, `numTri`, `numProp` — discards `faceID`, `runOriginalID`. | 83 |
| `src/geometry/types.ts` | `MeshData { vertProperties, triVerts, numVert, numTri, numProp }`, `MeshResult`, `CrossSectionResult` | 21 |
| `src/renderer/materials.ts` | `createDefaultMaterial()` (blue Phong), `createWireframeMaterial()`, `createWhiteMaterial()`, `createBlackWireframeMaterial()`. No vertex-color material. | 36 |
| `src/editor/codeEditor.ts` | CodeMirror 6 setup. `initEditor(container, code, onChange)`, `getValue()`, `setValue(code)`. No line highlighting or AST analysis. | 55 |
| `src/ui/toolbar.ts` | Top toolbar: logo, Run button, example dropdown, export dropdown. No mode toggle buttons. | 137 |
| `src/ui/layout.ts` | Split-pane layout. Tabs: Interactive / AI Views / Elevations / Gallery. `switchTab()` manages visibility and URL state. | 284 |
| `src/ui/panels.ts` | Wires up AI Views panel (copy/download buttons). | 47 |
| `src/storage/db.ts` | IndexedDB with `sessions` and `versions` object stores. No `annotations` store. `DB_VERSION = 1`. | 205 |
| `src/storage/sessionManager.ts` | Session state machine, version navigation, URL params. | 306 |
| `src/main.ts` | Orchestrates everything. `window.mainifold` console API. ~1100 lines. | ~1100 |

### Mesh Pipeline (current)

```
User code → new Function('api', code) → manifold.getMesh()
  → { vertProperties, triVerts, numVert, numTri, numProp }
    → meshGLToBufferGeometry() extracts XYZ positions only
      → BufferGeometry + blue MeshPhongMaterial + wireframe overlay
```

**What's discarded:** `mesh.faceID` (per-triangle face group IDs), `mesh.runOriginalID` (per-triangle source object IDs), vertex properties beyond XYZ (channels 3+ for colors).

### manifold-3d Capabilities We'll Use

- `faceID: Uint32Array` — per-triangle. Coplanar faces from the same original shape share an ID. Stable across runs with same topology.
- `runOriginalID: Uint32Array` — per-run. Maps each output triangle back to the original shape that created it (before booleans merged them).
- `setProperties(numProp, propFunc)` — inject per-vertex data (e.g., RGBA colors)
- `Manifold.reserveIDs(n)` — allocate unique material IDs
- `result.originalID()` — get the unique ID assigned to a manifold when it was created

### Three.js Version

Three.js 0.183.2. `THREE.Raycaster` is available and works with `BufferGeometry`. `intersectObject()` returns `{ point, face, faceIndex, object }`.

---

## Build Order & Parallelism

```
PHASE 0: Shared Foundation (MUST BE FIRST — sequential)
├── 0A: MeshData expansion (faceID, runOriginalID, vertex colors)
├── 0B: Picker module (raycaster + interaction modes)
└── 0C: DB migration (annotations store)

PHASE 1: Features (CAN BE PARALLEL after Phase 0)
├── 1A: Face Painting ──────── [parallel]
├── 1B: Click-to-Annotate ──── [parallel]
└── 1C: Parameter Panel ────── [parallel, no picker dependency]

PHASE 2: Advanced (sequential, builds on Phase 1)
├── 2A: Brush Painting (needs 1A)
├── 2B: Fill Bucket (needs 2A)
├── 2C: Click-to-Code Mapping (needs 0B + 1C)

PHASE 3: Persistence & Export (after Phase 1-2)
├── 3A: Paint persistence + colored exports
├── 3B: Programmatic coloring (code-level vertex colors)
└── 3C: Paint subdivision (advanced, optional)
```

**Phases 1A, 1B, and 1C can be built by parallel subagents** since they touch mostly different files. The main contention points are `src/main.ts` (console API additions) and `src/ui/toolbar.ts` (mode buttons) — coordinate these by having each feature add its own section.

---

## PHASE 0: Shared Foundation

### 0A: Expand MeshData with faceID, runOriginalID, vertex colors

**Files to modify:**

**`src/geometry/types.ts`** — Add optional fields:
```typescript
export interface MeshData {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  numVert: number;
  numTri: number;
  numProp: number;
  faceID?: Uint32Array;          // NEW: per-triangle face group ID
  runOriginalID?: Uint32Array;   // NEW: per-triangle original shape ID
}
```

**`src/geometry/engine.ts`** — Extract new fields from `getMesh()`:
```typescript
const mesh = result.getMesh();
return {
  mesh: {
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
    numVert: mesh.numVert,
    numTri: mesh.numTri,
    numProp: mesh.numProp,
    faceID: mesh.faceID,                 // NEW
    runOriginalID: mesh.runOriginalID,   // NEW
  },
  manifold: result,
  error: null,
};
```

**`src/renderer/viewport.ts`** — Store metadata alongside geometry:
- Keep module-level `currentFaceID: Uint32Array | null` and `currentRunOriginalID: Uint32Array | null`
- In `updateMesh()`, save these from `meshData.faceID` and `meshData.runOriginalID`
- In `meshGLToBufferGeometry()`, detect `numProp >= 6` and extract channels 3-5 as vertex colors (for programmatic coloring support):
  ```typescript
  if (mesh.numProp >= 6) {
    const colors = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++) {
      colors[i * 3] = mesh.vertProperties[i * mesh.numProp + 3];     // R
      colors[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 4]; // G
      colors[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 5]; // B
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  ```
- Export `getCurrentFaceID()` and `getCurrentRunOriginalID()` getters

**`src/renderer/materials.ts`** — Add vertex-color material:
```typescript
export function createVertexColorMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 40,
    side: THREE.DoubleSide,
  });
}
```

In `viewport.ts` `updateMesh()`, check if the geometry has a `color` attribute. If yes, use `createVertexColorMaterial()` instead of `createDefaultMaterial()`.

### 0B: Picker Module

**New file: `src/interaction/picker.ts`**

General-purpose 3D picking that painting, annotations, and click-to-code all consume.

```typescript
import * as THREE from 'three';

export interface PickResult {
  point: [number, number, number];     // world-space hit position
  normal: [number, number, number];    // surface normal at hit
  faceIndex: number;                   // triangle index in BufferGeometry
  faceID: number;                      // coplanar face group (from manifold)
  screenPos: [number, number];         // mouse position in pixels
}

export type InteractionMode = 'orbit' | 'paint' | 'annotate';

// Callbacks
type PickCallback = (result: PickResult) => void;
type HoverCallback = (result: PickResult | null) => void;
type ModeCallback = (mode: InteractionMode) => void;
```

**Implementation details:**
- Holds a `THREE.Raycaster` instance
- `initPicker(renderer, camera, meshGroup, orbitControls)` — attach pointer listeners to the renderer's canvas
- **Click vs. drag detection**: On `pointerdown`, record `{x, y}`. On `pointerup`, if Euclidean distance < 3px AND mode !== `'orbit'`, it's a pick. Otherwise it was an orbit drag.
- When mode is `'orbit'`: `OrbitControls.enabled = true`, no picks fire
- When mode is `'paint'` or `'annotate'`: `OrbitControls.enabled = false`, cursor set to `crosshair`, picks fire on click
- `onPick(callback)` — register pick listener, returns unsubscribe function
- `onHover(callback)` — register hover listener (fires on `pointermove` in non-orbit modes), returns unsubscribe
- `onModeChange(callback)` — fires when mode changes
- `setMode(mode)` / `getMode()` — get/set current mode
- `setFaceIDArray(faceID: Uint32Array | null)` — called by viewport when mesh updates, so picker can include `faceID` in pick results
- `destroy()` — cleanup listeners

**`src/renderer/viewport.ts`** — Integration:
- After `initViewport()`, call `initPicker(renderer, camera, meshGroup, controls)`
- In `updateMesh()`, call `setFaceIDArray(meshData.faceID)` and `setMeshGroup(meshGroup)` so the picker raycasts the current geometry
- Export `getControls()` so the picker can toggle `OrbitControls.enabled`

**`src/ui/toolbar.ts`** — Add mode toggle buttons:
- Add to `ToolbarCallbacks`: `onModeChange: (mode: InteractionMode) => void`
- After the Run button, add a button group: `[Orbit] [Paint] [Annotate]`
- Style: the active mode button gets a highlighted background (e.g., `bg-blue-600`)
- Orbit is active by default
- Keyboard shortcuts: `V` for orbit, `B` for paint, `N` for annotate (vim-style, left hand)

### 0C: Database Migration for Annotations

**`src/storage/db.ts`**:
- Bump `DB_VERSION` from `1` to `2`
- In `onupgradeneeded`, add `annotations` object store:
  ```typescript
  if (!db.objectStoreNames.contains('annotations')) {
    const store = db.createObjectStore('annotations', { keyPath: 'id' });
    store.createIndex('sessionId', 'sessionId', { unique: false });
  }
  ```
- Add `Annotation` interface:
  ```typescript
  export interface Annotation {
    id: string;
    sessionId: string;
    versionIndex: number;
    position: [number, number, number];
    normal: [number, number, number];
    relativePosition: [number, number, number]; // 0-1 ratios within bounding box
    text: string;
    status: 'open' | 'resolved';
    createdAt: number;
    resolvedAt?: number;
    resolvedBy?: string;
  }
  ```
- Add CRUD functions: `createAnnotation()`, `getAnnotation()`, `listAnnotations(sessionId)`, `updateAnnotation()`, `deleteAnnotation()`, `deleteAnnotationsBySession()`
- Handle upgrade path: existing v1 databases must not lose `sessions`/`versions` data

---

## PHASE 1A: Face Painting

**Goal**: Click a face on the 3D model and it turns a chosen color. Color picker UI in toolbar area.

### Paint state module

**New file: `src/painting/paintState.ts`**

```typescript
export interface PaintStateData {
  faceColors: Map<number, string>;  // faceID → hex color
  activeColor: string;
  activeTool: 'face' | 'brush' | 'fill';
}
```

Methods:
- `setFaceColor(faceID, color)` / `getFaceColor(faceID)` / `clearFaceColor(faceID)`
- `clearAll()`
- `setActiveColor(color)` / `getActiveColor()`
- `setActiveTool(tool)` / `getActiveTool()`
- `hasPaint()` — returns true if any face has been painted
- `serialize()` / `deserialize(data)` — for persistence
- `onPaintChange(callback)` — notify renderer to rebuild color buffer

### Color buffer generation

**New file: `src/painting/colorBuffer.ts`**

```typescript
export function applyPaintColors(
  geometry: THREE.BufferGeometry,  // must be non-indexed (toNonIndexed)
  faceIDs: Uint32Array,
  faceColors: Map<number, string>,
  defaultColor: string,            // '#4a9eff' — the default blue
): void
```

- Geometry must be non-indexed so each triangle has independent vertex colors
- For triangle `i`: vertices are at `i*3`, `i*3+1`, `i*3+2`
- Look up `faceColors.get(faceIDs[i])` or use default
- Write RGB float values to all 3 vertices
- Set `geometry.attributes.color.needsUpdate = true`

Utility: `hexToRGB(hex: string): [number, number, number]`

### Viewport integration

**`src/renderer/viewport.ts`** changes:

In `updateMesh()`:
- After creating geometry, check if paint state has any colors
- If yes: call `geometry.toNonIndexed()` (duplicates vertices so each triangle is independent — ~3x memory, fine for <100k triangles)
- Apply color buffer via `applyPaintColors()`
- Use `createVertexColorMaterial()` instead of `createDefaultMaterial()`
- If no paint: keep current indexed geometry + blue material (zero cost)
- Subscribe to paint state `onPaintChange` — when colors change, reapply without re-running manifold code
- When new manifold code runs and faceIDs are compatible (same topology), preserve paint state

### Paint toolbar UI

**New file: `src/ui/paintToolbar.ts`**

A secondary toolbar that appears below the main toolbar when paint mode is active:
- 8-12 preset color swatches (red, orange, yellow, green, cyan, blue, purple, pink, white, gray, black)
- Custom hex input field
- Active color indicator (bordered/highlighted swatch)
- "Clear all paint" button
- Hidden when mode !== 'paint'

### Wire into picker

Register an `onPick` callback that fires when mode === 'paint':
- Get `faceID` from the pick result
- Call `setFaceColor(faceID, activeColor)`
- This triggers `onPaintChange` → viewport rebuilds color buffer

### Console API additions to `src/main.ts`

```javascript
mainifold.setPaintMode(on)        // shortcut: setMode('paint') or setMode('orbit')
mainifold.getPaintMode()          // → boolean
mainifold.setActiveColor(hex)
mainifold.getActiveColor()
mainifold.paintFace(faceID, color)
mainifold.getFaceColors()         // → { [faceID]: color }
mainifold.clearPaint()
mainifold.getFaceAtPoint(x, y)    // raycast from screen coords → faceID
```

---

## PHASE 1B: Click-to-Annotate

**Goal**: Click a point on the model, type a note, see a marker. AI agents can read and resolve notes. Notes panel tab.

### Annotation store

**New file: `src/annotations/annotationStore.ts`**

In-memory store synced to IndexedDB. Uses the `Annotation` interface from `db.ts`.

```typescript
// CRUD
createAnnotation(pick: PickResult, text: string, sessionId: string, versionIndex: number, bbox: BBox): Annotation
resolveAnnotation(id: string, resolvedBy?: string): void
reopenAnnotation(id: string): void
deleteAnnotation(id: string): void
getAnnotations(filter?: { status?: 'open' | 'resolved', sessionId?: string }): Annotation[]
getOpenAnnotations(): Annotation[]

// Persistence
loadAnnotations(sessionId: string): Promise<void>  // load from IndexedDB
saveAnnotation(annotation: Annotation): Promise<void>

// Events
onAnnotationsChange(callback: (annotations: Annotation[]) => void): () => void
```

`relativePosition` calculation: when creating an annotation, compute `[(point.x - bbox.min.x) / (bbox.max.x - bbox.min.x), ...]` for each axis. This allows approximate repositioning if the model changes scale.

### 3D annotation markers

**New file: `src/annotations/annotationMarkers.ts`**

- Creates a `THREE.Group` for markers, added to the scene (separate from `meshGroup` so raycasts on the model don't hit markers)
- For each annotation: a `THREE.Sprite` with a canvas-drawn pin texture
  - Open: yellow/orange
  - Resolved: green (hidden by default, togglable)
- On hover: show a CSS tooltip positioned via `THREE.Vector3.project()` to screen coordinates
  - Shows annotation text, version number, timestamp
- On click in annotate mode: select annotation for editing/resolving
- `updateMarkers(annotations)` — rebuild marker group when annotations change
- Markers should respect the clipping plane (hide markers where `position.z > clipZ` when clipping is enabled)

### Annotation input UI

**New file: `src/annotations/annotationUI.ts`**

When user clicks in annotate mode:
1. Get the pick result (3D point)
2. Project the 3D point to screen coordinates
3. Show a small floating `<div>` near that screen position containing:
   - `<textarea>` for note text (auto-focused)
   - "Save" button and "Cancel" button
4. On Enter (without Shift) or Save click: create annotation, add marker, close input
5. On Escape or Cancel: close without saving
6. Position the floating div so it doesn't go off-screen (clamp to viewport bounds)

### Annotations panel (Notes tab)

**New file: `src/annotations/annotationPanel.ts`**

**`src/ui/layout.ts`** — Add a 5th tab: "Notes"
- Add to the tab bar after Gallery
- Add a `notesContainer` div (same pattern as `galleryContainer`)
- Update `switchTab()` to handle `'notes'` as a new tab value
- Update `LayoutElements` interface to include `notesContainer`
- Add `'notes'` to the type union for the `tab` parameter
- Notes tab should show editor pane (like Interactive), not hide it (like AI/Elevations)

Panel contents:
- Annotation list sorted by creation time (newest first)
- Each entry: status icon (yellow dot / green check), note text, version badge ("v3"), timestamp, Resolve/Reopen button, Delete button
- Filter toggles at top: [Show open] [Show resolved]
- Badge on tab: "Notes (3)" showing open annotation count
- Clicking an annotation entry should:
  - Switch to Interactive tab
  - Fly camera to look at that annotation's 3D position (animate `controls.target` and `camera.position`)

### Wire into picker

Register an `onPick` callback that fires when mode === 'annotate':
- Show the annotation input UI at the pick point
- On save: create annotation via store, update markers, update panel

### Console API additions to `src/main.ts`

```javascript
mainifold.getAnnotations()              // → Annotation[]
mainifold.getOpenAnnotations()          // → open annotations only
mainifold.resolveAnnotation(id, resolvedBy?)
mainifold.resolveAnnotationByText(substring)  // find+resolve by text match
mainifold.addAnnotation({ position, text })   // programmatic add
mainifold.resolveAllAnnotations()
mainifold.deleteResolvedAnnotations()
```

**Annotation-aware AI workflow:**
1. AI calls `mainifold.getOpenAnnotations()` to see feedback
2. Makes code changes addressing notes
3. Calls `mainifold.resolveAnnotation(id)` for each addressed note
4. Saves version with `runAndSave(code, "v4 - addressed feedback")`

---

## PHASE 1C: Parameter Panel

**Goal**: Auto-extract numeric parameters from editor code, show as labeled sliders, live-update code on change.

### Parameter extraction

**New file: `src/parameters/paramExtractor.ts`**

```typescript
export interface ExtractedParam {
  name: string;           // variable name or inferred label
  value: number;          // current numeric value
  line: number;           // 1-based line number in source
  column: number;         // 0-based column of the numeric literal
  length: number;         // character length of the value string
  context?: string;       // inferred context: "translate X", "radius", "height"
}

export function extractParameters(code: string): ExtractedParam[]
```

**Extraction strategy (start with regex, upgrade to AST later if needed):**

1. **Top-level numeric constants**: `const name = 123;` or `var name = 45.6;` or `let name = -7;`
   - Regex: `/(?:const|let|var)\s+(\w+)\s*=\s*(-?\d+\.?\d*)\s*;/g`
   - Name = capture group 1, value = capture group 2

2. **Array literals in known API calls**: `.translate([5, 0, 10])`, `.scale([1.2, 0.8, 1])`, `.cube([10, 20, 30])`, `.cylinder(height, radiusLow, radiusHigh, segments)`
   - Regex for array args: `/\.(translate|scale|rotate|cube|mirror)\(\[([^\]]+)\]\)/g`
   - Parse array contents, generate params like `{name}.translate_X`, `{name}.translate_Y`, `{name}.translate_Z`
   - Skip values that are 0 (likely intentional, not adjustable)

3. **Constructor positional args**: `.sphere(radius, segments)`, `.cylinder(height, rLow, rHigh, segments)`
   - Regex: `/\.(sphere|cylinder)\(([^)]+)\)/g`
   - Map positions to known parameter names based on API docs

### Parameter panel UI

**New file: `src/parameters/paramPanel.ts`**

- Renders as a collapsible section below the editor in the left pane (inside `editorPane`)
- Toggle button "Params" in the editor header (next to "editor.js" label)
- When expanded, shows a scrollable list of extracted parameters:
  - Label (variable name or context)
  - Number input (editable, step = auto-derived from value magnitude)
  - Range slider (min = value * 0.1 or 0, max = value * 5, step = auto)
  - Reset button (restore to original extracted value)
- Grouped by comment sections if the code has `// === Section ===` style comments
- Re-extracts parameters when editor content changes (debounced, 500ms)

### Live code update

When a slider/input changes:
1. Use `line`, `column`, `length` from the `ExtractedParam` to locate the old value in the code string
2. Replace with the new value string (formatted to match original precision)
3. Call `setValue(newCode)` on the editor
4. Code change triggers the existing `onChange` debounce (300ms) → `runCode()`
5. Slider dragging should debounce at 200ms to avoid thrashing

**Edge case:** If the user edits code manually, the line/column offsets may shift. Re-extract parameters after every editor change to keep offsets current.

### Console API additions to `src/main.ts`

```javascript
mainifold.getParameters()                    // → ExtractedParam[]
mainifold.setParameter(name, value)          // update code + re-run
mainifold.setParameters({ name: value, ... }) // batch update
```

---

## PHASE 2A: Brush Painting

**Goal**: Paint individual triangles by dragging, with adjustable brush radius.

**Depends on**: Phase 1A (paint state, color buffer, paint mode).

### Per-triangle color overrides

**`src/painting/paintState.ts`** — Add:
- `triColors: Map<number, string>` — per-triangle overrides
- Priority: `triColors[triIdx]` > `faceColors[faceID]` > default
- Methods: `setTriColor(triIdx, color)`, `clearTriColor(triIdx)`

### Triangle adjacency

**New file: `src/painting/adjacency.ts`**

```typescript
// Build from triVerts: for each triangle, find edge-adjacent neighbors
export function buildAdjacency(triVerts: Uint32Array, numTri: number): Map<number, number[]>

// Get N-ring neighborhood
export function getNRing(triIdx: number, radius: number, adjacency: Map<number, number[]>): Set<number>
```

Two triangles are adjacent if they share 2 vertex indices. Build an edge→triangle lookup, then for each triangle's 3 edges, find neighbors.

### Drag painting

**`src/renderer/viewport.ts`** + picker integration:
- On `pointerdown` in paint mode: start painting
- On `pointermove` while painting: raycast continuously, paint hit triangle + N-ring neighbors based on brush size
- On `pointerup`: stop painting
- Throttle raycasts to ~30fps
- Batch paint operations, update color buffer once per animation frame

### Brush controls

**`src/ui/paintToolbar.ts`** additions:
- Tool selector: [Face] [Brush] [Fill] buttons
- Brush size slider (radius 0-5) — visible when brush tool selected
- Keyboard shortcuts: `[` and `]` to adjust brush size

### Paint hover preview

On `pointermove` in paint mode (not actively painting):
- Raycast and temporarily highlight the triangle(s) that would be painted
- Use a semi-transparent overlay of the active color
- Clear on mouse leave

### Console API

```javascript
mainifold.setBrushSize(radius)
mainifold.getBrushSize()
mainifold.paintTriangle(triIdx, color)
mainifold.paintTriangles(triIdxArray, color)  // batch
mainifold.setTool('face' | 'brush' | 'fill')
mainifold.getTool()
```

---

## PHASE 2B: Fill Bucket

**Goal**: Click to flood-fill regions by face group or color boundary.

**Depends on**: Phase 2A (adjacency structure, per-triangle colors).

### Flood fill algorithms

**New file: `src/painting/floodFill.ts`**

```typescript
// BFS — spread to neighbors with same current color
export function floodFillByColor(
  startTri: number,
  newColor: string,
  getColor: (triIdx: number) => string,
  adjacency: Map<number, number[]>,
): Set<number>

// BFS — spread to all reachable triangles regardless of color
export function floodFillConnected(
  startTri: number,
  adjacency: Map<number, number[]>,
): Set<number>
```

### Tool modes

- **Face paint** (default): click paints entire coplanar face group (faceID) — already in Phase 1A
- **Brush**: click/drag paints individual triangles — Phase 2A
- **Fill bucket**: click flood-fills by color boundary — this phase

Modifier: `Shift+click` with fill bucket → fill entire connected component

### Console API

```javascript
mainifold.fillByColor(triIdx, color)
mainifold.fillConnected(triIdx, color)
```

---

## PHASE 2C: Click-to-Code Mapping

**Goal**: Click on geometry → highlight the source code line that created it → show relevant parameters.

**Depends on**: Phase 0B (picker), Phase 1C (parameter panel), Phase 0A (runOriginalID).

### Instrument API to track originalID → source line

**`src/geometry/engine.ts`** changes:

Before executing user code, wrap the `api.Manifold` constructors to record which code line created each primitive:

```typescript
let idMap: Map<number, { line: number; varName?: string; call: string }> | null = null;

// Inside executeCode(), before running user code:
idMap = new Map();
const origConstructors = { cube: Manifold.cube, sphere: Manifold.sphere, cylinder: Manifold.cylinder, /* etc */ };

for (const [name, orig] of Object.entries(origConstructors)) {
  Manifold[name] = (...args) => {
    const result = orig.apply(Manifold, args);
    const id = result.originalID();
    // Parse stack trace to get caller line number within the user code
    const line = getCallerLine();
    idMap.set(id, { line, call: name });
    return result;
  };
}

function getCallerLine(): number {
  const stack = new Error().stack || '';
  // User code runs inside new Function() — find the line offset
  // The function body starts at line 2 (after "use strict")
  // Parse stack for the eval'd function frame
  // ...
  return lineNumber;
}
```

Export `getIDMap()` for other modules to access.

**Note:** Stack trace parsing for `new Function()` can be brittle across browsers. Alternative: before execution, prepend `let __line = 0;` and rewrite each statement to `__line = N;` — simple but requires a basic line-splitter. Start with stack trace, fall back to instrumentation.

### Click-to-highlight in editor

**`src/editor/codeEditor.ts`** — Add:
```typescript
export function highlightLine(line: number): void
// Add a CodeMirror Decoration (background highlight) to the given line
// Scroll to make the line visible

export function clearHighlight(): void
// Remove the highlight decoration
```

Uses CodeMirror's `Decoration.line()` API with a custom CSS class (e.g., `bg-blue-500/20`).

### Integration

When picker mode is `'annotate'` (or a new `'inspect'` mode):
1. Click on model → raycaster gives `faceIndex`
2. Look up `runOriginalID[faceIndex]` → get original mesh ID
3. Look up `idMap.get(originalID)` → get source line
4. Call `highlightLine(line)` in the editor
5. Filter parameter panel to show only params on/near that line

### Contextual parameter editing

When a part is selected:
- Parameter panel scrolls to and highlights parameters from that code region
- Adjusting those sliders updates only the relevant line and re-runs

### Console API

```javascript
mainifold.getCodeLineAtPoint(x, y)  // screen coords → { line, call, originalID }
mainifold.highlightCode(line)       // highlight a line in editor
mainifold.clearHighlight()
```

---

## PHASE 3A: Paint Persistence & Colored Export

**Goal**: Paint data survives page reloads and exports to colored file formats.

### Serialize paint with versions

**`src/storage/db.ts`** — Add `paintData` field to `Version` interface:
```typescript
paintData?: { faceColors: Record<number, string>, triColors: Record<number, string> } | null;
```

**`src/painting/paintState.ts`**:
- `serialize()` → JSON-safe object with faceColors and triColors as plain objects
- `deserialize(data)` → restore Maps from plain objects
- Store face centroid+normal fingerprints alongside paint data for topology-change remapping

**`src/storage/sessionManager.ts`** — Include paint data in `saveVersion()` and restore in `loadVersion()`.

### Colored exports

**`src/export/gltf.ts`** — Add `COLOR_0` vertex attribute (per-vertex RGB floats). GLB/glTF natively supports this.

**`src/export/obj.ts`** — Generate companion `.mtl` file with one material per unique color. Group triangles by color.

**`src/export/threemf.ts`** — Add `<color>` elements to the 3MF XML (per-triangle color is natively supported).

**`src/export/stl.ts`** — Skip (no standard color support in STL).

### Console API

```javascript
mainifold.exportColoredGLB()   // GLB with vertex colors
mainifold.getPaintData()       // serialized paint state
mainifold.setPaintData(data)   // restore paint state
```

---

## PHASE 3B: Programmatic Coloring (Code-Level)

**Goal**: User code can set vertex colors via `setProperties()`, renderer auto-detects and uses them.

Already partially handled in Phase 0A (vertex color extraction in `meshGLToBufferGeometry`). This phase adds:

- Document the convention in `CLAUDE.md`: properties 3,4,5 = R,G,B (0.0-1.0), property 6 = alpha (reserved)
- Ensure multiview/elevation renders also use vertex colors if present
- Ensure thumbnails capture painted colors for gallery
- Add example code to `examples/` demonstrating programmatic coloring

```javascript
// Example: color by height
const { Manifold } = api;
const model = Manifold.cube([10, 10, 10], true);
return model.setProperties(7, (newProp, pos) => {
  const t = (pos[2] + 5) / 10;
  newProp[3] = t;         // R
  newProp[4] = 0.2;       // G
  newProp[5] = 1.0 - t;   // B
  newProp[6] = 1.0;       // A
});
```

---

## PHASE 3C: Paint Subdivision (Advanced, Optional)

**Goal**: Crisp color boundaries instead of vertex-interpolated gradients.

### Pre-subdivide

Use `manifold.refineToLength(targetEdgeLength)` before painting for finer resolution. Add a "paint resolution" setting (low/medium/high).

### Edge-split at paint boundaries

When adjacent faces have different colors, split the boundary triangle by inserting midpoint vertices. This is a render-time operation on `BufferGeometry`, not on the manifold.

### Boolean-based paint regions (experimental)

Project paint shapes onto the model surface, use `manifold.intersect()` to cut geometric boundaries, assign `originalID` for material tracking. Expensive — consider only for final output.

---

## File Summary

### New files

| File | Phase | Purpose |
|------|-------|---------|
| `src/interaction/picker.ts` | 0B | Raycaster, interaction modes, pick/hover events |
| `src/painting/paintState.ts` | 1A | Paint data store, color map, tool state |
| `src/painting/colorBuffer.ts` | 1A | Paint state → per-vertex color attribute |
| `src/ui/paintToolbar.ts` | 1A | Color picker swatches, tool selector |
| `src/annotations/annotationStore.ts` | 1B | Annotation CRUD + IndexedDB sync |
| `src/annotations/annotationMarkers.ts` | 1B | THREE.Sprite pins + tooltips |
| `src/annotations/annotationUI.ts` | 1B | Floating text input on click |
| `src/annotations/annotationPanel.ts` | 1B | Notes tab content |
| `src/parameters/paramExtractor.ts` | 1C | Parse code for numeric params |
| `src/parameters/paramPanel.ts` | 1C | Slider/input UI below editor |
| `src/painting/adjacency.ts` | 2A | Triangle neighbor map, N-ring |
| `src/painting/floodFill.ts` | 2B | BFS flood fill algorithms |

### Modified files

| File | Phase | Changes |
|------|-------|---------|
| `src/geometry/types.ts` | 0A | Add `faceID`, `runOriginalID` to MeshData |
| `src/geometry/engine.ts` | 0A, 2C | Extract faceID/runOriginalID; API instrumentation for originalID tracking |
| `src/renderer/viewport.ts` | 0A, 0B, 1A | Store mesh metadata, picker init, paint color integration, vertex color detection |
| `src/renderer/materials.ts` | 0A | Add `createVertexColorMaterial()` |
| `src/ui/toolbar.ts` | 0B | Mode toggle buttons (Orbit/Paint/Annotate) |
| `src/ui/layout.ts` | 1B | Add "Notes" tab, `notesContainer`, update `switchTab` |
| `src/storage/db.ts` | 0C, 3A | DB_VERSION bump, annotations store, paint data on versions |
| `src/storage/sessionManager.ts` | 3A | Paint data in saveVersion/loadVersion |
| `src/main.ts` | 1A, 1B, 1C, 2A, 2B, 2C | Console API additions for all features |
| `src/editor/codeEditor.ts` | 2C | Line highlighting via CodeMirror Decoration |
| `src/export/gltf.ts` | 3A | COLOR_0 vertex attribute |
| `src/export/obj.ts` | 3A | .mtl material generation |
| `src/export/threemf.ts` | 3A | Per-triangle color XML |
| `CLAUDE.md` | 3B | Document vertex color convention |

---

## Feature Interaction Notes

- **Multiview/Elevations**: Render with vertex colors if present (read-only, no painting/annotation interaction)
- **Clipping plane**: Cap material stays red. Painted faces show vertex colors when clipped. Annotation markers hide when below clip Z.
- **Sessions/Versions**: Paint data and annotations are scoped to sessions. Each version can have independent paint data. Annotations persist across versions within a session.
- **Assertions**: Paint and annotations don't affect geometry assertions (volume, bounds, genus, etc.)
- **Gallery**: Show painted thumbnails. Could show annotation count badge per version.
- **Wireframe overlay**: Unchanged — drawn on top of painted surfaces
- **Mode exclusivity**: Only one mode active at a time (orbit/paint/annotate). Mode toggle buttons enforce this.

---

## Testing Strategy

For each phase, verify:

1. **Phase 0**: Run existing examples, confirm mesh renders identically (no regressions). Check that `faceID` and `runOriginalID` are non-null for a simple cube. Check DB migration doesn't lose existing sessions.
2. **Phase 1A**: Click a face in paint mode → it turns the selected color. Change color, click another face. Clear paint → back to default blue. Verify `mainifold.paintFace()` works from console.
3. **Phase 1B**: Click in annotate mode → input appears → type note → marker shows up. Switch to Notes tab → note is listed. Call `mainifold.resolveAnnotation(id)` → marker turns green. Reload page → annotation persists.
4. **Phase 1C**: Load a code example with numeric constants → parameter panel shows sliders → drag slider → code updates → model re-renders.
5. **Phase 2A**: Switch to brush tool → drag across model → triangles under cursor get painted.
6. **Phase 2B**: Use fill bucket → click triangle → entire same-colored region fills.
7. **Phase 2C**: Click on model part → corresponding code line highlights in editor → relevant parameters shown.

Run `npm run build` after each phase to catch TypeScript errors. Test in Chrome (primary) and Firefox (secondary).
