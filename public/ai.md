# Partwright -- AI Agent Instructions

Partwright is a browser-based parametric CAD tool with two modeling engines: **manifold-js** (default, JavaScript DSL with manifold-3d API) and **OpenSCAD** (SCAD language via WASM). You write code that constructs 3D geometry, which renders live. All interaction is via the `window.partwright` programmatic API -- do not drive the app through clicks or keystrokes. `window.mainifold` remains available as a legacy alias for older prompts.

**Coordinate system:** Right-handed, Z-up. XY plane is the ground. Units are arbitrary.

## Contents

- [Before you start](#before-you-start)
- [Choosing an engine](#choosing-an-engine)
- [Common agent mistakes](#common-agent-mistakes)
- [Argument validation](#argument-validation)
- [Console API -- window.partwright](#console-api--windowpartwright)
- [Geometry data](#geometry-data)
- [Writing model code](#writing-model-code)
- [Writing OpenSCAD code](#writing-openscad-code)
- [Common pitfalls for boolean operations](#common-pitfalls-for-boolean-operations)
- [Print-safe geometry](#print-safe-geometry)
- [Color regions](#color-regions)
- [Reference images](#reference-images)
- [Photo-to-model workflow](#photo-to-model-workflow) (optional tooling)
- [Iteration workflow](#iteration-workflow)
- [Visual verification](#visual-verification)
- [Stat-based verification](#stat-based-verification)
- [Resuming a session](#resuming-a-session)

## Before you start

1. **Use `window.partwright`** -- that's the programmatic API. Do NOT drive the app with clicks, keystrokes, or DOM manipulation.
2. **Pick your engine:** manifold-js (default) or OpenSCAD. See [Choosing an engine](#choosing-an-engine).
3. **manifold-js code must end with `return manifoldObject;`** -- a bare trailing expression won't work. OpenSCAD code uses standard SCAD syntax (no `return`).
4. **Use `runAndSave(code, label, {isManifold: true, maxComponents: 1})`** to validate and commit a version.
5. **Log decisions with `addSessionNote("[PREFIX] ...")`** -- prefixes: `[REQUIREMENT]`, `[DECISION]`, `[FEEDBACK]`, `[MEASUREMENT]`, `[ATTEMPT]`, `[TODO]`.

## Choosing an engine

Partwright supports two modeling engines. Pick whichever is best for the task:

| | **manifold-js** (default) | **OpenSCAD** (SCAD) |
|---|---|---|
| Language | JavaScript | OpenSCAD `.scad` |
| Best for | Algorithmic/parametric geometry, complex math, programmatic iteration | Standard OpenSCAD idioms, porting existing `.scad` files, users who think in CSG |
| Code style | `return Manifold.cube([10,10,10], true);` | `cube([10,10,10], center=true);` |
| Strengths | Fast execution, rich JS ecosystem, direct Manifold API access | Familiar to OpenSCAD users, large body of existing `.scad` code online |
| Limitations | Must learn the manifold-3d API | No `text()` (fonts not loaded), no `use<>`/`include<>` with external libraries, slower (fresh WASM instance per run) |

### Switching engines

```js
// Check current engine
partwright.getActiveLanguage()        // -> 'manifold-js' or 'scad'

// Switch engine (also updates the code editor's syntax highlighting)
await partwright.setActiveLanguage('scad')
await partwright.setActiveLanguage('manifold-js')

// Run code with a specific engine (one-shot, doesn't change active engine)
await partwright.run(scadCode)        // uses active engine
// To force a specific engine, switch first then run
```

Selecting a SCAD example from the toolbar dropdown auto-switches to OpenSCAD mode. Session versions remember which engine was used and restore it when loaded.

## Common agent mistakes

- **Driving the UI with clicks/keystrokes** -- CodeMirror's auto-close-brackets will corrupt your code. Use `partwright.setCode()` and `partwright.run()` instead.
- **Forgetting `return`** -- code runs in `new Function()`, so a trailing expression is NOT automatically returned. You must write `return Manifold.cube(...)`.
- **Skipping sessions** -- always create a session (`createSession`) and save versions (`runAndSave`) so the user can review your work in the gallery.
- **Skipping visual verification** -- stats alone can't catch visual defects. After structural changes, screenshot the Elevations tab or use `renderView()`.
- **Flush boolean placement** -- shapes must overlap by at least 0.5 units to union correctly. Merely touching at a face produces disconnected components.
- **Tapering to a near-point on printed geometry** -- `scaleTop=[0.01, 0.01]` or chamfers that collapse the top to sub-millimeter area look fine in `geometry-data` but FDM slicers silently drop sub-extrusion-width layers, so the cap disappears on the print. See [Print-safe geometry](#print-safe-geometry).
- **Not reading session context before modifying** -- when opening an existing session, always call `getSessionContext()` first and read the notes/version history before making changes. See [Resuming a session](#resuming-a-session).
- **Branching off a prior version by hand** -- don't chain `loadVersion` -> `getCode` -> modify -> `runAndSave`. A silent failure (blocked return value, stale buffer) can drop parts of the parent. Use [`forkVersion({index} | {id}, transformFn, label, assertions?)`](#forking-a-prior-version) instead -- it loads the parent's code server-side, applies your transform, validates, and saves atomically.
- **Passing a bare index or id instead of `{index}` / `{id}`** -- `loadVersion` and `forkVersion` take an object with exactly one of `{index: number}` or `{id: string}`, e.g. `loadVersion({index: 2})` or `loadVersion({id: "Kx3Pq9mA2wEr"})`. Bare `loadVersion(2)` will return `{error: "...target must be { index: number } or { id: string }..."}`.
- **Passing the wrong object shape to `setReferenceImages`, `setReferenceGeometry`, `query`, `runAndAssert`, etc.** -- the API rejects unknown keys and wrong-type values. See [Argument validation](#argument-validation).

## Argument validation

Every `window.partwright` method validates its arguments at runtime. If you pass the wrong type or an object with unexpected keys, the call fails fast with a descriptive error rather than silently accepting bad input.

**Conventions:**

- **Methods that return a value** (e.g. `runAndSave`, `loadVersion`, `query`, `importSession`, `setReferenceGeometry`, notes/session CRUD) return `{ error: "..." }` on a validation failure. The error string names the exact parameter and expected type, e.g. `"setReferenceImages(images).front must be a string, got null. See /ai.md#argument-validation"`.
- **Void setters** (`setCode`, `setClipZ`, `setReferenceImages`, `setView`, `setUnits`, `measureAt`, `measureBetween`, `probeRay`, `measurePoints`, `renameSession`) **throw** a `ValidationError`. Wrap calls in a try/catch if you want to handle failure rather than crash the console.
- **No coercion.** `setClipZ("5")` throws -- strings are not auto-converted to numbers. Pass the right type.
- **Unknown object keys are rejected.** `runAndAssert(code, { widthToDeep: [1,2] })` errors on the typo; it does not silently ignore it. Allowed keys are listed on each assertion/options interface.
- **Empty strings are rejected** by default for required string params (names, IDs, note text, code). Optional strings can be omitted but, if provided, must still be non-empty unless noted otherwise.

**Examples of what gets rejected:**

```js
partwright.navigateVersion('backward')            // ValidationError: direction must be one of: "prev" | "next"
partwright.setView('sketch')                      // ValidationError: tab must be one of: ...
partwright.measureAt([5])                         // ValidationError: measureAt(xy) must have exactly 2 elements
partwright.probeRay([0,0,0], [0, '1', 0])         // ValidationError: probeRay(direction)[1] must be a finite number
partwright.setReferenceImages({ fron: '...' })    // ValidationError: setReferenceImages(images).fron is not a recognized field
partwright.setReferenceGeometry(code, { opacity: 2 })  // returns { success: false, error: "... .opacity must be <= 1 ..." }
await partwright.runAndAssert(code, { minVolume: '1000' })  // returns { passed: false, failures: ["... .minVolume must be a finite number ..."] }
await partwright.runAndSave(code, 'v1', { boundsRatio: { widthToDeep: [1,2] } })  // typo caught: not a recognized field
await partwright.query({ sliceAt: 5 })            // returns { error: "... .sliceAt must be an array ..." }
```

When you see a validation error, fix the call -- don't pattern-match around it.

## How to use this tool

1. Navigate with `?view=ai` to see 4 isometric views (e.g. `/editor?view=ai`)
2. Use `window.partwright` in the browser console to interact programmatically
3. Call `partwright.help()` for a full method list, or `partwright.help('methodName')` for a specific method
4. Use `partwright.getGeometryData()` to read current geometry stats programmatically

## Console API -- window.partwright

<a id="console-api--windowmainifold"></a>

```js
partwright.run(code?)          // Run code, update views, return geometry stats
partwright.getGeometryData()   // Current stats (same as #geometry-data)
partwright.validate(code)      // Check code without rendering -> {valid, error?}
partwright.getCode()           // Read editor contents
partwright.setCode(code)       // Set editor contents (no auto-run)
partwright.sliceAtZ(z)         // Cross-section -> {polygons, svg, boundingBox, area}
partwright.getBoundingBox()    // -> {min:[x,y,z], max:[x,y,z]}
partwright.getModule()         // Raw manifold-3d WASM module
partwright.getActiveLanguage() // -> 'manifold-js' or 'scad'
await partwright.setActiveLanguage(lang) // Switch engine + editor mode ('manifold-js' | 'scad')
partwright.toggleClip(on?)     // Toggle 3D clipping plane -> {enabled, z, min, max}
partwright.setClipZ(z)         // Set clip height -> {enabled, z, min, max}
partwright.getClipState()      // -> {enabled, z, min, max}
await partwright.exportGLB()   // Download GLB
partwright.exportSTL()         // Download STL
partwright.exportOBJ()         // Download OBJ
partwright.export3MF()         // Download 3MF

// Isolated execution -- test code without changing editor/viewport state
await partwright.runIsolated(code)       // -> {geometryData, thumbnail}
await partwright.runAndAssert(code, assertions) // -> {passed, failures?, stats}
await partwright.runAndExplain(code)     // -> {stats, components[], hints[]} (debug disconnects)
await partwright.modifyAndTest(patchFn, assertions?) // Modify current code + test in isolation
partwright.query({sliceAt?, decompose?, boundingBox?}) // Multi-query current geometry in one call
partwright.renderView({elevation?, azimuth?, ortho?, size?}) // Render from any angle -> data URL
partwright.sliceAtZVisual(z)            // Cross-section SVG at height z -> {svg, area, contours}
partwright.isRunning()                   // -> boolean (is code executing?)

// Reference images -- compare model against photos
partwright.setReferenceImages({front?, right?, back?, left?, top?, perspective?})
partwright.clearReferenceImages()
partwright.getReferenceImages()

// Sessions -- save/compare design iterations
await partwright.createSession(name?)    // -> {id, url, galleryUrl}
await partwright.runAndSave(code, label?, assertions?) // Assert+save in one call -> {passed?, geometry, version, diff, galleryUrl}
await partwright.createSessionWithVersions(name, [{code, label},...]) // Batch create
await partwright.saveVersion(label?)     // Save current state as version
await partwright.listVersions()          // -> [{id, index, label, timestamp, status}]
await partwright.loadVersion({index} | {id})  // Load version into editor -> {id, index, label, code, geometryData} or {error}
await partwright.forkVersion({index} | {id}, transformFn, label?, assertions?) // Load + modify + validate + save in one call
partwright.getGalleryUrl()               // -> URL for gallery view (human review)
partwright.getSessionUrl()               // -> URL for this session
await partwright.listSessions()          // -> [{id, name, updated}]
await partwright.openSession(id)         // Open existing session
await partwright.clearAllSessions()      // Delete all sessions & versions

// Color regions -- tag coplanar face regions with a color (see #color-regions)
partwright.paintRegion({point, normal, color, name?, tolerance?}) // -> {id, name, triangles} or {error}
partwright.listRegions()                 // -> [{id, name, color, source, triangles, order}, ...]
partwright.clearColors()                 // Remove all regions

// Notes -- track design context, decisions, and measurements
await partwright.addSessionNote(text)    // -> {id, text, timestamp}
await partwright.listSessionNotes()      // -> [{id, text, timestamp}, ...]
await partwright.updateSessionNote(noteId, text) // Edit a note
await partwright.deleteSessionNote(noteId)       // Remove a note

// Session context -- get everything in one call (for resuming sessions)
await partwright.getSessionContext()     // -> {session, versions[], notes[], currentVersion, versionCount, agentHints}
// agentHints: {apiDocsUrl, recommendedEntrypoint, codeMustReturnManifold, recentErrors[]}
```

## Geometry data

**Preferred:** Use `partwright.getGeometryData()` to read current geometry stats programmatically.

**Fallback** (if `window.partwright` is not yet initialized): read `document.getElementById("geometry-data").textContent` -- it contains the same JSON.

```json
{
  "status": "ok",
  "vertexCount": 8, "triangleCount": 12,
  "boundingBox": { "x":[-5,5], "y":[-5,5], "z":[-5,5], "dimensions":[10,10,10] },
  "centroid": [0,0,0],
  "volume": 1000, "surfaceArea": 600,
  "genus": 0, "isManifold": true, "componentCount": 1,
  "crossSections": {
    "z25": {"z":-2.5,"area":100,"contours":1},
    "z50": {"z":0,"area":100,"contours":1},
    "z75": {"z":2.5,"area":100,"contours":1}
  },
  "executionTimeMs": 12,
  "codeHash": "a1b2c3d4"
}
```

On error: `{"status":"error","error":"...","executionTimeMs":2,"codeHash":"..."}`

### Common errors
- `Code must return a Manifold object` -- forgot `return` statement
- `function _Cylinder called with N arguments` -- wrong arg count
- Geometry looks wrong -- check `isManifold` and `componentCount` (failed booleans = extra components)

## Writing model code

Code runs in a sandbox via `new Function('api', code)`. All transforms return new immutable Manifold instances -- chaining works.

```js
const { Manifold, CrossSection, setCircularSegments } = api;
// MUST return a Manifold object
```

**Sandbox environment:** The `api` object provides `Manifold`, `CrossSection`, and `setCircularSegments`. Standard JavaScript globals (`Math`, `Array`, `Object`, `JSON`, `Date`, `console`, etc.) are available. There is no DOM access, no `fetch`/network, no `require`/`import`, and no file I/O. Do not attempt to load external libraries or make HTTP requests in model code.

### Primitive origins and orientations

```
cube([x,y,z])         -> spans [0,0,0] to [x,y,z]. center=true -> centered at origin
sphere(r, n?)         -> centered at origin
cylinder(h,rLo,rHi?,n?) -> Z-axis, base z=0, top z=h. rHi=0 for cone
tetrahedron()          -> vertices at [1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]. Scale to size.
extrude(cs, h, nDiv?, twist?, scaleTop?, center?)
  -> along Z, z=0 to z=h. twist=degrees, scaleTop=number or [x,y] (0 for cone point)
revolve(cs, n?, degrees?)
  -> around Y axis, then remaps so result is Z-up.
    Profile X=radial distance, Y=height -> after revolve, Y becomes Z automatically.
    Only positive-X side used. degrees defaults to 360.
Segments guide: 6-8 low-poly, 32-48 smooth, 64+ high quality
```

### All constructors

```
Manifold: cube, sphere, cylinder, tetrahedron, extrude, revolve,
          union, difference, intersection, hull, compose, smooth, levelSet, ofMesh
CrossSection: square, circle, ofPolygons (CCW outer, CW holes),
              compose, union, difference, intersection, hull
```

### Manifold instance methods

```
Booleans:   .add(other)  .subtract(other)  .intersect(other)  .hull()
Transforms: .translate([x,y,z])  .rotate([rx,ry,rz]) (degrees, applied X->Y->Z)
            .scale(s) or .scale([x,y,z])  .mirror([nx,ny,nz]) (plane normal)
            .warp(fn)  .transform(mat4x3)
Mesh ops:   .refine(n)  .simplify()  .smoothOut()  .calculateNormals(idx, angle?)
Queries:    .volume()  .surfaceArea()  .genus()  .numVert()  .numTri()  .isEmpty()
            .boundingBox()  .status() (0=valid)  .decompose()
Slicing:    .slice(z)  .project()  .trimByPlane(n,off)  .splitByPlane(n,off)
Output:     .getMesh() -> {vertProperties, triVerts, numVert, numTri, numProp}
```

### CrossSection instance methods

```
2D->3D:      .extrude(h, nDiv?, twist?, scaleTop?, center?)  .revolve(n?, degrees?)
Transforms: .translate([x,y])  .rotate(degrees)  .scale(s or [x,y])
            .mirror([nx,ny])  .warp(fn)  .transform(mat3)
Booleans:   .add(other)  .subtract(other)  .intersect(other)  .hull()
Modify:     .offset(delta, joinType?, miterLimit?, segments?)  .simplify(epsilon?)
Queries:    .area()  .isEmpty()  .numVert()  .numContour()  .bounds()
Output:     .toPolygons()  .decompose()  .delete()
```

## Writing OpenSCAD code

When the engine is set to `scad`, code is compiled by OpenSCAD (WASM) instead of running as JavaScript.

**Key differences from manifold-js:**
- **No `return` statement** -- SCAD uses implicit top-level geometry. Just write `cube(10);`, not `return Manifold.cube(...)`.
- **SCAD syntax** -- standard OpenSCAD: `module`, `function`, `for`, `let`, `if/else`, `use`, `include`.
- **Built-in primitives** -- `cube`, `sphere`, `cylinder`, `polyhedron`, `polygon`, `circle`, `square`, `text` (text not available -- fonts not loaded).
- **Transforms** -- `translate`, `rotate`, `scale`, `mirror`, `multmatrix`, `color`, `resize`.
- **Booleans** -- `union()`, `difference()`, `intersection()`, `hull()`, `minkowski()`.
- **Extrusion** -- `linear_extrude(height, twist, slices, scale)`, `rotate_extrude(angle)`.
- **The `--enable=manifold` flag is set automatically** -- OpenSCAD uses the same manifold-3d boolean backend, so CSG results match the JS engine.

**Known limitations (v1):**
- `text()` is not available (font data not loaded to save ~8MB).
- `use <...>` / `include <...>` with external `.scad` libraries does not work (no external file system). Inline all modules.
- BOSL2 and MCAD libraries are not available.
- Each SCAD run creates a fresh WASM instance (~100-300ms overhead). For fast iteration, manifold-js is snappier.

**Example SCAD code:**
```scad
// Cube with cylindrical hole
difference() {
  cube([10, 10, 10], center=true);
  cylinder(h=12, r=4, center=true, $fn=32);
}
```

## Common pitfalls for boolean operations

### Always use volumetric overlap, never flush placement
Shapes that merely touch at a face will NOT union correctly -- they stay as separate components. Offset joining geometry by at least 0.5 units along the joining axis.
```js
// BAD -- merlon sits exactly on wall top, stays disconnected
merlon.translate([x, y, wallTopZ])

// GOOD -- merlon overlaps 0.5 units into wall body
merlon.translate([x, y, wallTopZ - 0.5])
```

### Spires on hollow shapes need a base wider than the inner void
A cone on top of a hollow cylinder/box floats inside the void unless its base radius exceeds the inner hollow radius, ensuring it intersects the wall material.
```js
// Keep outer half-width = 10, inner hollow half-width = 8
// Spire base radius must be > 8 to touch wall ring
Manifold.cylinder(spireH, 11, 0, 24).translate([0, 0, keepH - 0.5])
```

### Flag poles on cone tips need to start inside the cone body
A cylinder placed at the exact tip of a cone (where radius = 0) has nothing to union with. Start the pole 1-2 units below the tip so it overlaps solid cone geometry.

### Debugging disconnected components
When `componentCount > 1`, use `runAndExplain(code)` to identify which pieces are floating:
```js
const r = await partwright.runAndExplain(code);
// r.components = [
//   { index: 0, volume: 14800, centroid: [0, 0, 9], boundingBox: {...} },
//   { index: 1, volume: 12,    centroid: [29, 29, 26], boundingBox: {...} },
// ]
// r.hints = [
//   "1 tiny disconnected component(s) detected -- likely floating attachments...",
//   "Components 0 and 1 share a face or near-touch (gap: 0.00) -- need volumetric overlap"
// ]
```

## Print-safe geometry

If the output will be 3D-printed (FDM/FFF), geometry thinner than the nozzle's extrusion width is silently dropped by slicers. This is a real class of bug that passes every `geometry-data` check (volume, `componentCount`, `genus`, `isManifold` all correct) but renders the top of the model as "missing" on the physical print.

### The classic trap: `scaleTop` near zero

An extrusion with `scaleTop=[0.01, 0.01]` (or any small fraction) tapers linearly to a near-point. The last slices have areas well under 1 mm², which most slicers drop at typical nozzle widths. Example failure mode observed in the wild: a hook band extruded with `scaleTop=[0.01, 0.01]` had layer areas of 118 mm² at z=5.8 collapsing to 0.07 mm² at z=6.55 -- the slicer dropped every layer under ~0.4 mm² and the cap disappeared.

```js
// BAD -- lead-in chamfer via scaleTop=0, tapers to sub-extrusion-width
ring.extrude(6, 4, 0, [0.01, 0.01])

// GOOD -- explicit 45deg chamfer that stops at a flat-top ring of finite width.
// Stack a full-width body + a chamfer frustum whose smaller radius is still >= wall thickness.
const body    = ringCS.extrude(bodyH);
const chamfer = ringCS.extrude(chamferH, 1, 0, outerFrac)  // outerFrac chosen so top width >= wallT
                    .translate([0, 0, bodyH]);
const result  = body.add(chamfer);
```

### Rules of thumb (assume ~0.4 mm nozzle, ~0.2 mm layer height)

- **Minimum wall / feature thickness:** `>= 0.4 mm` (one nozzle width). Prefer `>= 0.8 mm` for anything load-bearing.
- **Minimum cross-sectional area on any printed layer:** `>= ~0.4 mm²` (roughly nozzle width x 1 mm of extruded line).
- **Never taper to a true point on a printed face.** Chamfers, drafts, and lead-ins must land on a flat plateau wider than the nozzle.
- **Decorative points** (spires, finials) either need to be printed as a separate top piece, or accept that the tip will be missing up to the slicer's minimum width.

### Catch this before the user does

After any change that uses `scaleTop` < 1, tapers via `hull`, or brings two surfaces toward a vanishing edge, dense-sample near `zMax` and flag sub-extrusion-width layers:

```js
const bb = partwright.getBoundingBox();
const zMax = bb.max[2];
const layerH = 0.2;
const minArea = 0.4;  // mm^2, assuming ~0.4mm nozzle

const problems = [];
for (let z = zMax - 2; z <= zMax - layerH; z += layerH) {
  const s = partwright.sliceAtZ(z);
  if (s && s.area > 0 && s.area < minArea) {
    problems.push({ z: +z.toFixed(2), area: +s.area.toFixed(3) });
  }
}
if (problems.length) {
  console.warn("Sub-extrusion-width layers detected:", problems);
}
```

Or batch it with `query({ sliceAt: [zMax - 2, zMax - 1.8, ..., zMax - 0.2] })` and check each slice's `area`. If any layer below the actual geometry end falls under threshold, redesign the top to terminate with a flat plateau instead of a near-point taper.

## Color regions

Color regions tag a coplanar set of triangles with an RGB color. Regions are persisted on the saved version, ride through GLB and 3MF exports, and show as swatch badges in the gallery. They do **not** modify the geometry -- the underlying mesh, volume, manifoldness, etc. are unchanged.

```js
// Paint the face that contains [10, 0, 5] with normal [0, 0, 1] (top face) bright red.
const r = partwright.paintRegion({
  point:  [10, 0, 5],
  normal: [0, 0, 1],
  color:  [1, 0, 0],         // RGB in 0..1
  name:   "Top",             // optional, defaults to "Region N"
  tolerance: 0.9995,         // optional cosine threshold for coplanarity (default 0.9995)
});
// r = { id, name, triangles } on success, or { error } if no matching face found

partwright.listRegions()    // [{ id, name, color, source, triangles, order }, ...]
partwright.clearColors()    // remove all regions
```

**How face matching works.** `paintRegion` flood-fills outward from the seed triangle, including any neighbor whose normal is within `tolerance` of the seed's. Pick `point` slightly inside the model surface and pass the outward-pointing `normal` -- the seed resolver looks for the triangle whose plane the point lies on and whose normal aligns with yours.

**Editor lock.** When color regions exist, the editor is locked (the model can't be re-run, because new geometry would invalidate the saved triangle indices). To edit code, the user clicks "Unlock to edit" in the UI. Agents that need to iterate on the geometry should call `clearColors()` first, or fork a new uncolored version with `forkVersion`.

**Export behavior.**
- `exportGLB()` -- vertex colors flow through automatically.
- `export3MF()` -- regions become `<basematerials>` entries with per-triangle `pid` attributes (compatible with PrusaSlicer / Bambu Studio multi-material slicing).
- `exportSTL()` and `exportOBJ()` -- formats don't carry color, so colors are dropped.

## Reference images

Load reference photos to compare against your model's elevations:
```js
// Load reference images for side-by-side comparison in Elevations tab
partwright.setReferenceImages({
  front: 'data:image/jpeg;base64,...',   // or a URL
  right: 'data:image/jpeg;base64,...',
  back: 'data:image/jpeg;base64,...',
  left: 'data:image/jpeg;base64,...',
  top: 'data:image/jpeg;base64,...',     // optional
  perspective: 'data:image/jpeg;base64,...', // optional - original photo
})

// Clear reference images
partwright.clearReferenceImages()

// Get current reference image state
partwright.getReferenceImages()  // -> {front?, right?, ...} or null
```

When reference images are loaded, the Elevations tab shows each model view side-by-side with the corresponding reference image. This enables direct visual comparison for accuracy.

## Photo-to-model workflow

> **Optional tooling.** This workflow uses `scripts/generate-views.js` and Gemini, which may not be installed in every environment. If unavailable, skip the analysis step and supply reference images manually via `setReferenceImages()`.

To recreate a building or object from a photo:

### 1. Analyze the reference (optional helper)
Use `scripts/generate-views.js` to extract structural analysis:
```bash
node scripts/generate-views.js /path/to/photo.jpg
```
This calls Gemini to analyze the photo and produces a JSON file with:
- Building mass decomposition (main body, wings, garage, etc.)
- Proportion estimates (width:depth:height ratios)
- Roof style, pitch angle, overhangs
- Feature positions (windows, doors, porches) as percentages
- Elevation descriptions for all 4 sides

### 2. Load reference images
If you have multiple angle photos (or Gemini-generated views), load them:
```js
partwright.setReferenceImages({ front: frontDataUrl, right: rightDataUrl, ... })
```

### 3. Build major masses first
Start with the largest geometric volumes and get proportions right before adding detail:
```js
// Decompose into: main body -> wings -> roof -> porch -> details
// Build each mass, validate proportions against reference
const r = await partwright.runAndAssert(code, {
  isManifold: true, maxComponents: 1,
  // Use proportion assertions to match reference
  boundsRatio: { widthToDepth: [1.2, 1.8], widthToHeight: [1.5, 2.5] }
});
```

### 4. Compare elevations after each structural change
Switch to Elevations tab and compare model silhouette against reference at each angle. Focus on:
- Overall proportions and mass placement
- Roof profile (side view reveals pitch and overhangs)
- Feature alignment (windows, doors at correct heights)
- Porch depth and column spacing

### 5. Iterate on details
Add features in order of visual impact: roof -> porch -> windows/doors -> trim details.
After each addition, verify the relevant elevation matches the reference.

## Iteration workflow

### Testing without side effects

Use `runIsolated` to test code variations without changing the editor or viewport:
```js
const r = await partwright.runIsolated(code);
// r.geometryData = full stats (same schema as #geometry-data)
// r.thumbnail = data:image/png base64 string (4 isometric views)
```

### Assertions -- structured validation

Check geometry against expectations in one call:
```js
const r = await partwright.runAndAssert(code, {
  minVolume: 1000,      // volume bounds
  maxVolume: 50000,
  isManifold: true,     // must be valid manifold
  maxComponents: 1,     // detect failed booleans
  genus: 0,             // exact topological genus (0 = solid, N = N holes)
  minGenus: 1,          // genus range -- useful when exact count is unpredictable
  maxGenus: 20,
  minBounds: [10,10,5], // minimum bounding box dimensions [X,Y,Z]
  maxBounds: [50,50,30],
  minTriangles: 100,    // mesh complexity bounds
  maxTriangles: 50000,
  boundsRatio: { widthToDepth: [1.2, 1.8], widthToHeight: [1.5, 2.5] },  // proportion ranges
  notes: "Design rationale or context for this version",  // optional: attached to saved version
});
// r.passed = true/false
// r.failures = ["volume 500.0 < minVolume 1000"] (only if failed)
// r.stats = full geometry stats
```

### Assert + save in one call

`runAndSave` accepts optional assertions. If provided, validates in isolation first -- fails fast
without saving if assertions don't pass. On success, saves the version and returns stat diff:
```js
const r = await partwright.runAndSave(code, "v2 - added towers", {
  isManifold: true, maxComponents: 1
});
// If assertions fail: r.passed = false, r.failures = [...], version NOT saved
// If assertions pass (or no assertions given):
// r.passed       = true (only present when assertions provided)
// r.geometry     = full geometry stats
// r.version      = { id, index, label }
// r.diff         = { volume: { from, to, delta }, componentCount: ..., ... }
// r.galleryUrl   = gallery URL for human review
```

### Forking a prior version

When iterating on a design, the common flow is *load a previous version, tweak it, save as a new version*.
Doing that across separate `loadVersion` -> `getCode` -> modify -> `runAndSave` calls is fragile: if any
step fails silently (wrong arg type, a client-side content filter on `getCode`, etc.) you can end up saving
a regression without noticing. `forkVersion` collapses the whole chain into one server-side call:

```js
const r = await partwright.forkVersion(
  { index: 11 },                       // or { id: "Kx3Pq9mA2wEr" } from listVersions()
  code => code.replace('towerH = 28', 'towerH = 35'),
  "v11a - taller towers",              // label for the new version
  { isManifold: true, maxComponents: 1 } // optional assertions (validated before saving)
);
// On success:
//   r.passed       = true (only when assertions provided)
//   r.parent       = { id, index, label } of the version you forked from
//   r.geometry     = full geometry stats
//   r.version      = { id, index, label } of the newly saved version
//   r.diff         = stat diff vs. the previous current version
//   r.galleryUrl   = gallery URL for human review
// On failure:
//   r.error        = "No version found with index ..." / "transformFn threw: ..." / etc.
//   r.passed=false + r.failures=[...] if assertions didn't pass (nothing saved)
```

`target` is an object with exactly one of `{ index }` (numeric, 1-based) or `{ id }` (string from
`listVersions()[].id`). The two are never mixed, so there's no ambiguity about which field is being
looked up. This is the recommended way to build parallel branches (v11a, v11b, ...) off a shared
parent without a load/read/modify/save round-trip chain.

### Modify and test

Modify current editor code with a transform function and test the result without committing:
```js
const r = await partwright.modifyAndTest(
  code => code.replace('towerH = 28', 'towerH = 35'),
  { isManifold: true, maxComponents: 1 }
);
// r.modifiedCode = the transformed code string
// r.stats        = geometry stats of the modified code
// r.passed       = true/false (only if assertions given)
// r.failures     = [...] (only if failed)
```

### Multi-query current geometry

Query multiple properties of the already-computed geometry in a single call:
```js
const r = partwright.query({
  sliceAt: [5, 10, 15, 20],  // cross-sections at these Z heights
  decompose: true,             // component breakdown
  boundingBox: true,           // bounding box
});
// r.slices     = { z5: {area, contours, ...}, z10: {...}, ... }
// r.components = [{ index, volume, centroid, boundingBox }, ...]
// r.boundingBox = { min: [...], max: [...] }
// r.stats      = current geometry-data stats
```

### Batch session creation

Create a complete session with multiple versions in one call:
```js
const r = await partwright.createSessionWithVersions("Castle", [
  { code: v1Code, label: "v1 - walls" },
  { code: v2Code, label: "v2 - towers" },
  { code: v3Code, label: "v3 - gate" },
]);
// r.session = {id, name}
// r.versions = [{version, geometry}, ...]
// r.galleryUrl = "/editor?session=abc&gallery"
```

### Session notes -- tracking design context

Use session notes to build a persistent record of the design story. This enables any agent (or human) resuming the session later to understand what happened and why.

**When to log notes:**
- Before first version: log the user's requirements and constraints
- On each version: include rationale in the label and optional `notes` field
- When the user gives feedback: log it as a note, then save the next version
- On key decisions: log dimensions, materials, constraints, tradeoffs
- On failed attempts: log what didn't work and why

**Prefix conventions** (so notes are scannable):
```js
await partwright.addSessionNote("[REQUIREMENT] 5.5x5.5x36in boards, snap-on C-channel, screw holes");
await partwright.addSessionNote("[FEEDBACK] User: groove looks too shallow, wants full tongue insertion");
await partwright.addSessionNote("[DECISION] Omitted right wall on end pieces for clearance");
await partwright.addSessionNote("[MEASUREMENT] Tongue width = outerW - 2*wallT = 133.7mm");
await partwright.addSessionNote("[ATTEMPT] v2 tried 3mm walls but too flimsy. Increased to 5mm in v3");
await partwright.addSessionNote("[TODO] Add chamfer to bottom edge for easier print removal");
```

Version-level notes go in the `runAndSave` assertions object:
```js
await partwright.runAndSave(code, "v2 - widened tongue per feedback", {
  isManifold: true,
  notes: "Changed tabW from 20mm to outerW - 2*wallT per user request"
});
```

### Resuming a session

When opening a session you haven't worked on (or returning after time away), **always call `getSessionContext()` first**:
```js
await partwright.openSession(sessionId);
const ctx = await partwright.getSessionContext();
// ctx.session    -- {id, name, created, updated}
// ctx.versions   -- [{index, label, timestamp, notes?, geometrySummary: {volume, boundingBox, ...}}]
// ctx.notes      -- [{id, text, timestamp}]  (all session notes)
// ctx.currentVersion -- {index, label}
// ctx.versionCount
// ctx.agentHints -- {apiDocsUrl, recommendedEntrypoint, codeMustReturnManifold, recentErrors}
//   recentErrors: last 5 validation errors from this page session (helps avoid repeating mistakes)
```

Read the notes and version history before making changes. The notes tell you:
- What the user originally asked for (`[REQUIREMENT]` notes)
- What was tried and why (`[DECISION]` and `[ATTEMPT]` notes)
- What feedback the user gave (`[FEEDBACK]` notes)
- What measurements or constraints matter (`[MEASUREMENT]` notes)
- What still needs to be done (`[TODO]` notes)

### Recommended iteration pattern

1. Write initial code, assert+save in one call: `runAndSave(code, "v1 - base", {isManifold: true, maxComponents: 1})`
2. **Visually verify** -- switch to Elevations tab (`?view=elevations`) and screenshot. Check Front/Side views.
3. Modify code, test with `modifyAndTest(patchFn)` or `runIsolated(code)` -- no side effects
4. When satisfied, save: `runAndSave(modifiedCode, "v2 - improvements", assertions)` -- check the diff
5. Use `query({sliceAt: [...], decompose: true})` for follow-up inspection without re-running
6. Repeat. Gallery URL is in `#geometry-data` or the `runAndSave` return value.

## Visual verification

**CRITICAL: Stats alone cannot catch visual defects.** A roof can be mangled, a spire twisted,
or proportions wrong -- all while volume, componentCount, and genus look correct. After every
structural change:

1. **Check the Elevations tab** (`?view=elevations`) -- shows Front, Right, Back, Left, Top views.
   Side elevations immediately reveal roof profiles, wall alignment, and symmetry issues that
   isometric views can hide.
2. **Use `renderView()` for specific angles:**
```js
partwright.renderView({ elevation: 0, azimuth: 0, ortho: true })   // front elevation
partwright.renderView({ elevation: 0, azimuth: 90, ortho: true })  // right side elevation
partwright.renderView({ elevation: 90, ortho: true })               // top-down plan view
partwright.renderView({ elevation: 30, azimuth: 315 })              // isometric (default)
```
3. **Use `sliceAtZVisual(z)` for cross-section thumbnails:**
```js
const s = partwright.sliceAtZVisual(10);  // returns {svg, area, contours}
// svg = visual rendering of the cross-section profile at z=10
```
4. **Feature-specific checks:**
   - Added a roof? Check side elevation -- should be a clean triangle/gable profile.
   - Cut a door/window? Check front elevation -- opening should be visible.
   - Added a tower? Check top-down -- should be circular, properly positioned.
   - Made something hollow? Slice at mid-height -- should show wall ring, not solid fill.

### View tabs

- `?view=ai` -- 4 isometric views (alternating cube corners)
- `?view=elevations` -- Front, Right, Back, Left, Top orthographic + 1 isometric (6 views)
- Use Elevations for shape verification, AI Views for overall appearance.

## Stat-based verification

1. Read `#geometry-data` -- check `status:"ok"`, volume, dimensions, componentCount, isManifold
2. Check `crossSections` quartiles (z25/z50/z75) for expected profile
3. Use `partwright.sliceAtZ(z)` for specific heights
4. Use `partwright.validate(code)` for quick syntax checks
5. Use `partwright.runAndAssert(code, assertions)` for structured validation
