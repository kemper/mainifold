# mAInifold — AI-Driven Browser CAD Tool

## Quick Start

```bash
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build to dist/
```

Open `http://localhost:5173/?view=ai` to start with the 4 isometric views visible (instead of the interactive viewport). This is the recommended URL for AI agents — all views are visible on page load without clicking any tabs.

Requires COEP/COOP headers (configured in vite.config.ts) for SharedArrayBuffer / WASM threads.

## AI Agent Workflow

**When a user asks you to design, build, or iterate on geometry, always use a session — never create example files.**

The `examples/` directory is for hand-curated demos shipped with the app. User-requested designs go through the session system, which tracks versions, generates thumbnails, and produces a gallery URL for human review.

### How to create geometry

1. **Write the geometry code** as a string (the same code that goes in the editor — must `return` a Manifold).
2. **Create a session** and save versions via the `window.mainifold` console API:
   ```javascript
   await mainifold.createSession("Walkway shield variations");
   await mainifold.runAndSave(code, "v1 - basic C-channel", { isManifold: true, maxComponents: 1 });
   // iterate...
   await mainifold.runAndSave(v2Code, "v2 - added grip ribs");
   ```
3. **Hand the user a gallery URL** so they can visually compare versions.

### Browser access required

The session API lives at `window.mainifold` in the browser. To call it from a terminal agent:

- **Chrome DevTools MCP (preferred):** If available, use it to call `mainifold.createSession()`, `mainifold.runAndSave()`, etc. directly.
- **No browser access (fallback):** Write the geometry code, then tell the user to paste it into the editor at `http://localhost:5173/?view=ai`. Do NOT create files in `examples/` — that directory is not for user-requested work.

### Anti-patterns

- Creating files in `examples/` for user-requested geometry
- Writing standalone `.js` scripts for the user to run manually
- Skipping sessions and just dumping code in the chat

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

## Writing Model Code

User code runs in a sandboxed `new Function('api', code)`. The `api` object provides:

```javascript
const { Manifold, CrossSection, setCircularSegments } = api;
```

Code **must** `return` a Manifold object. All transform methods return new Manifold instances (immutable — originals are unchanged). Method chaining works: `Manifold.cube(...).translate(...).subtract(...)`.

### Manifold Static Constructors

```javascript
Manifold.cube([x, y, z], center?)
// Box with dimensions [x, y, z].
// center=false (default): spans [0,0,0] to [x,y,z]
// center=true: spans [-x/2,-y/2,-z/2] to [x/2,y/2,z/2]

Manifold.sphere(radius, segments?)
// Sphere centered at origin. segments defaults to ~22.

Manifold.cylinder(height, radiusLow, radiusHigh?, segments?)
// Cylinder/cone aligned along the Z axis.
// Base at z=0, top at z=height.
// radiusLow = radius at z=0, radiusHigh = radius at z=height.
// radiusHigh defaults to radiusLow. Set to 0 for a cone.
// segments defaults to ~22. Guide: 6-8 for low-poly, 32-48 for smooth, 64+ for high quality.

Manifold.tetrahedron()
// Regular tetrahedron. Vertices at:
// [1,1,1], [1,-1,-1], [-1,1,-1], [-1,-1,1]
// Centroid at origin, fits in a 2-unit bounding box.
// Scale it to desired size.

Manifold.extrude(crossSection, height, nDivisions?, twistDegrees?, scaleTop?, center?)
// Extrude a 2D CrossSection along Z from z=0 to z=height.
// nDivisions: extra vertical slices (useful with twist to avoid artifacts)
// twistDegrees: twist the top relative to the bottom
// scaleTop: scale at the top — number for uniform, [x,y] for non-uniform. Default 1.
//           Use 0 for a cone-like point at the top.
// center: if true, centered on Z from -height/2 to height/2

Manifold.revolve(crossSection, segments?, revolveDegrees?)
// Revolve a 2D CrossSection around the Y axis, then remap so the result is Z-up.
// In the 2D profile: X = radial distance from center, Y = height.
// After revolve: the profile's Y becomes the 3D Z axis automatically.
// So a profile spanning Y=0..16 produces geometry with Z=0..16 — no rotation needed.
// Only the positive-X side of the profile is used.
// revolveDegrees: partial revolution (default 360). E.g. 180 for a half-turn.

Manifold.compose(manifolds[])               // Combine without booleans
Manifold.union(manifolds[])                 // Boolean union array
Manifold.difference(manifolds[])            // Boolean difference array
Manifold.intersection(manifolds[])          // Boolean intersection array
Manifold.hull(manifolds[])                  // Convex hull of multiple
Manifold.smooth(mesh, sharpenedEdges?)      // Smooth mesh
Manifold.levelSet(fn, bounds, edgeLength)   // Implicit surface
Manifold.ofMesh(mesh)                       // From raw mesh data
```

### Manifold Instance Methods

```javascript
// Booleans (return new Manifold)
manifold.add(other)              // Union
manifold.subtract(other)         // Difference
manifold.intersect(other)        // Intersection
manifold.hull()                  // Convex hull of self

// Transforms (return new Manifold — original unchanged)
manifold.translate([x, y, z])
manifold.rotate([xDeg, yDeg, zDeg])  // Euler angles in degrees, applied X then Y then Z
manifold.scale([x, y, z])       // or scale(s) for uniform scaling
manifold.mirror([nx, ny, nz])   // Mirror across plane through origin with given normal
                                // e.g. mirror([1,0,0]) reflects across YZ plane (flips X)
                                //      mirror([0,0,1]) reflects across XY plane (flips Z)
manifold.transform(matrix4x3)   // Arbitrary affine transform
manifold.warp(fn)                // Per-vertex warp function (fn receives [x,y,z])

// Mesh operations
manifold.refine(n)               // Subdivide triangles n times
manifold.refineToLength(length)
manifold.refineToTolerance(tol)
manifold.simplify(epsilon?)
manifold.smoothOut(minSharpAngle?, minSmoothness?)
manifold.calculateNormals(normalIdx, minSharpAngle?)

// Queries
manifold.volume()
manifold.surfaceArea()
manifold.genus()                 // Topological genus: 0 = solid block, +1 per through-hole
                                 // A plate with 4 bolt holes has genus 4
manifold.numVert()
manifold.numTri()
manifold.numEdge()
manifold.isEmpty()
manifold.boundingBox()           // Returns {min, max} Vec3
manifold.status()                // 0 = valid manifold
manifold.tolerance()
manifold.originalID()

// Slicing
manifold.slice(z)                // Returns CrossSection at Z height
manifold.project()               // Project to XY plane → CrossSection
manifold.trimByPlane(normal, offset)
manifold.splitByPlane(normal, offset)
manifold.split(other)            // Split by another manifold

// Output
manifold.getMesh()               // Returns MeshGL {vertProperties, triVerts, numVert, numTri, numProp}
manifold.decompose()             // Separate disconnected components → Manifold[]
```

### CrossSection Static Constructors

```javascript
CrossSection.square([x, y], center?)
// Rectangle. Same center semantics as cube.

CrossSection.circle(radius, segments?)
// Circle centered at origin on XY plane.

CrossSection.ofPolygons(polygons)
// Type: [number, number][][] — array of contours, each contour is [x,y] pairs.
// First contour = outer boundary (CCW winding in standard math coords: Y-up).
// Subsequent contours = holes (CW winding).
// Example — triangle: CrossSection.ofPolygons([[[0,0], [10,0], [5,8]]])
// Example — ring (square with circular hole):
//   const outer = [[0,0],[10,0],[10,10],[0,10]];     // CCW
//   const hole = [];                                   // CW
//   for (let i = 0; i < 16; i++) {
//     const a = -i/16 * 2 * Math.PI;                  // negative = CW
//     hole.push([5 + 2*Math.cos(a), 5 + 2*Math.sin(a)]);
//   }
//   CrossSection.ofPolygons([outer, hole])
// Note: near-coincident points and minor self-intersections are cleaned up
// by the Positive fill rule (default). Exact duplicates are fine.

CrossSection.compose(sections[])
CrossSection.union(sections[])
CrossSection.difference(sections[])
CrossSection.intersection(sections[])
CrossSection.hull(sections[])
```

### CrossSection Instance Methods

```javascript
// 2D to 3D (return Manifold)
cs.extrude(height, nDivisions?, twistDegrees?, scaleTop?, center?)
cs.revolve(segments?, revolveDegrees?)

// Transforms (return new CrossSection)
cs.translate([x, y]) or cs.translate(x, y?)
cs.rotate(degrees)               // Rotation around the Z-axis (in 2D: around origin)
cs.scale([x, y]) or cs.scale(s)  // Uniform or per-axis scaling
cs.mirror([nx, ny])              // Mirror across axis through origin
cs.transform(mat3)               // Arbitrary 2D affine transform
cs.warp(fn)                      // Per-vertex warp function (fn receives [x,y])

// Booleans (return new CrossSection)
cs.add(other)                    // Union
cs.subtract(other)               // Difference
cs.intersect(other)              // Intersection
cs.hull()                        // Convex hull

// Modification
cs.offset(delta, joinType?, miterLimit?, circularSegments?)
// Inflate/deflate contours. delta>0 = expand outlines, shrink holes.
// joinType: 'Square' | 'Round' (default) | 'Miter'
// miterLimit: max offset distance for Miter joins (default 2, minimum 2)
cs.simplify(epsilon?)            // Remove near-duplicate vertices

// Queries
cs.area()                        // Total area
cs.isEmpty()
cs.numVert()
cs.numContour()                  // Number of contours (outer + holes)
cs.bounds()                      // Axis-aligned bounding rect

// Output
cs.toPolygons()                  // → SimplePolygon[]
cs.decompose()                   // Separate disconnected sections → CrossSection[]
cs.delete()                      // Free WASM memory
```

**Note:** `Manifold.extrude(cs, h, ...)` and `cs.extrude(h, ...)` are equivalent, as are `Manifold.revolve(cs, n, ...)` and `cs.revolve(n, ...)`. Use whichever reads better.

### Common Patterns

```javascript
// Circular array of features (bolt holes, gear teeth, crenellations)
const features = [];
const n = 8;
for (let i = 0; i < n; i++) {
  const angle = (i * 360) / n;
  features.push(
    Manifold.cylinder(10, 2, 2, 32).translate([20, 0, 0]).rotate([0, 0, angle])
  );
}
const result = body.subtract(Manifold.union(features));

// Revolve profile: X = radial distance, Y = height → Z-up result
const profile = [[0,0], [5,0], [5,10], [3,12], [0,12]]; // CCW, half-profile
const vase = Manifold.revolve(CrossSection.ofPolygons([profile]), 64);

// Extrude with twist (e.g., twisted column)
const star = CrossSection.ofPolygons([/* star shape */]);
const column = star.extrude(20, 10, 90); // 10 divisions, 90-degree twist

// 2D fillet on an inner corner (replace sharp corner with arc)
// For a corner at (cx, cy), fillet center offset by radius inward:
const filletR = 3, cx = 5, cy = 5;
const fcx = cx + filletR, fcy = cy + filletR;
const arcPts = [];
for (let i = 0; i <= 8; i++) {
  const a = -Math.PI/2 - (i/8) * (Math.PI/2); // -90° to -180°
  arcPts.push([fcx + filletR*Math.cos(a), fcy + filletR*Math.sin(a)]);
}
// Insert arcPts in place of the sharp corner point in your profile

// Through-holes via cylinder subtraction
const plate = Manifold.cube([40, 30, 5]);
const hole = Manifold.cylinder(5, 2, 2, 32).translate([20, 15, 0]);
const result = plate.subtract(hole); // genus = 1 per through-hole

// Rounded rectangle via hull of 4 corner circles
function roundedRect(w, h, r, segs) {
  const hw = w/2 - r, hh = h/2 - r;
  return CrossSection.hull([
    CrossSection.circle(r, segs).translate([hw, hh]),
    CrossSection.circle(r, segs).translate([-hw, hh]),
    CrossSection.circle(r, segs).translate([-hw, -hh]),
    CrossSection.circle(r, segs).translate([hw, -hh]),
  ]);
}
const base = roundedRect(100, 50, 5, 32).extrude(10);

// Hollow container (open top): subtract inner with +1mm Z overshoot
const outerCS = roundedRect(40, 40, 3, 32);
const innerCS = outerCS.offset(-2); // 2mm wall thickness
const container = outerCS.extrude(30)
  .subtract(innerCS.extrude(31)); // +1 ensures open top
```

### Boolean Operation Pitfalls

**Shapes must volumetrically overlap to union.** Shapes that merely share a face (flush placement) will silently stay as separate components. Always offset by at least 0.5 units:

```javascript
// BAD — merlon sits exactly on wall top, stays disconnected
merlon.translate([x, y, wallTopZ])

// GOOD — merlon overlaps 0.5 into wall body
merlon.translate([x, y, wallTopZ - 0.5])
```

**Spires on hollow shapes** need a base wider than the inner void — otherwise the cone sits inside the hollow and doesn't touch wall material.

**Flag poles on cone tips** need to start inside the cone body (1-2 units below tip), not at the exact tip where radius = 0.

**Debugging disconnected components:** Use `mainifold.runAndExplain(code)` to decompose the result and identify which pieces are floating, with bounding boxes and centroids for each.

### Performance Tips

- Prefer `Manifold.union(array)` over chaining `.add()` calls — the batch version is optimized.
- Same for `Manifold.difference(array)` and `Manifold.intersection(array)`.
- Boolean operations on complex meshes (high segment counts) are expensive. Use lower segment counts during iteration, increase for final output.

### Memory Management

Intermediate Manifold/CrossSection objects consume WASM memory. For simple scripts, this is fine — the page reload cleans up. For complex models with many intermediates, call `.delete()` on objects you no longer need.

### Default Values

- `center`: defaults to `false` for cube, square, extrude (origin-corner placement)
- `segments`: defaults to ~22 based on internal quality heuristics. Pass explicit value for control.
- `CrossSection.circle`: always centered at origin (no `center` param needed)
- `CrossSection.square`: like cube, defaults to first-quadrant placement. `center=true` → centered.

## Development Guidelines

### URL State

All meaningful UI state must be reflected in the URL via query parameters so that views are linkable and shareable. When adding a new feature that changes what the user sees (tabs, modes, panels, filters, etc.), update the URL with `history.replaceState`. Current URL parameters:

- `?view=ai` — AI Views tab
- `?gallery` — Gallery tab
- `?session=<id>` — Active session
- `?session=<id>&v=3` — Specific version
- Tab switching is handled in `src/ui/layout.ts` (`switchTab`). Session/version state is handled in `src/storage/sessionManager.ts` (`updateURL`).

## Common Errors

| Error | Cause |
|-------|-------|
| `Code must return a Manifold object. Did you forget to 'return'?` | Code didn't `return` anything, or returned undefined/null |
| `Manifold.cube is not a function` | Engine not initialized (WASM still loading) |
| `function _Cylinder called with N arguments, expected M` | Wrong number of arguments to a constructor |
| `Missing field: "x"` | Passed an array where an object was expected, or vice versa |
| Geometry renders but looks wrong | Check `isManifold` and `componentCount` in geometry-data — failed booleans often produce extra components |

## Console API (window.mainifold)

When using this tool via DevTools MCP or browser automation:

```javascript
// Run code and get geometry stats back
mainifold.run(`
  const { Manifold } = api;
  return Manifold.cube([10, 10, 10], true);
`)
// → { status, vertexCount, triangleCount, boundingBox, centroid, volume,
//    surfaceArea, genus, isManifold, componentCount, crossSections, executionTimeMs }

// Read geometry data without re-running
mainifold.getGeometryData()

// Validate code without rendering (fast syntax/logic check)
mainifold.validate(code)
// → { valid: true } or { valid: false, error: "..." }

// Read/write editor
mainifold.getCode()
mainifold.setCode(code)

// Cross-section at any Z height
mainifold.sliceAtZ(3.5)
// → { polygons, svg, boundingBox, area }

// Bounding box
mainifold.getBoundingBox()
// → { min: [x,y,z], max: [x,y,z] }

// 3D Clipping plane (cross-section visualization)
mainifold.toggleClip(on?)      // Toggle clip plane; omit arg to toggle
// → { enabled, z, min, max }
mainifold.setClipZ(z)          // Set clip height
// → { enabled, z, min, max }
mainifold.getClipState()       // Current state
// → { enabled, z, min, max }

// Exports
await mainifold.exportGLB()
mainifold.exportSTL()
mainifold.exportOBJ()
mainifold.export3MF()

// Raw manifold-3d module for advanced use
mainifold.getModule()

// Reference images — side-by-side comparison in Elevations tab
mainifold.setReferenceImages({ front?, right?, back?, left?, top?, perspective? })
mainifold.clearReferenceImages()
mainifold.getReferenceImages()   // → ReferenceImages | null
```

### Isolated Execution & Assertions

Test code without changing the editor, viewport, or session state:

```javascript
// Run code in isolation — no side effects on editor/viewport/session
const result = await mainifold.runIsolated(code)
// → { geometryData: {...stats...}, thumbnail: "data:image/png;base64,..." }

// Run code and check geometry against assertions
const result = await mainifold.runAndAssert(code, {
  minVolume: 1000,       // volume bounds
  maxVolume: 50000,
  isManifold: true,      // must be a valid manifold
  maxComponents: 1,      // detect failed booleans (extra disconnected pieces)
  genus: 0,              // exact topological genus (0 = solid, N = N through-holes)
  minGenus: 1,           // genus range — useful for subtraction steps
  maxGenus: 20,          //   where exact hole count is unpredictable
  minBounds: [10, 10, 5],  // minimum bounding box dimensions [X, Y, Z]
  maxBounds: [50, 50, 30],
  minTriangles: 100,     // mesh complexity bounds
  maxTriangles: 50000,
  boundsRatio: {          // proportion range assertions
    widthToDepth: [1.2, 1.8],   // X/Y ratio must be in this range
    widthToHeight: [1.5, 2.5],  // X/Z ratio must be in this range
    depthToHeight: [0.8, 1.5],  // Y/Z ratio must be in this range
  },
})
// → { passed: true, stats: {...} }
// → { passed: false, failures: ["volume 500.0 < minVolume 1000"], stats: {...} }

// Check if code is currently executing
mainifold.isRunning()
// → boolean

// Debug disconnected components (enhanced hints with main body ID and fix suggestions)
const result = await mainifold.runAndExplain(code)
// → {
//   stats: {...geometryData...},
//   components: [  // null if only 1 component
//     { index: 0, volume: 14800, surfaceArea: 5200, centroid: [0,0,9], boundingBox: {min,max} },
//     { index: 1, volume: 12, surfaceArea: 48, centroid: [29,29,26], boundingBox: {min,max} },
//   ],
//   hints: [  // diagnostics — identifies main body, suggests fixes
//     "Main body: component 0 (volume: 14800, centroid: [0,0,9])",
//     "1 tiny disconnected component(s) detected...",
//     "  Component 1: volume 12, centroid [29,29,26] — sits on max X-face of main body. Try .translate() to overlap by 0.5 units along X.",
//     "Components 0 and 1 share a face (gap: 0.00) — need volumetric overlap"
//   ]
// }

// Modify current code and test without committing (saves tokens — no need to echo unchanged code)
const r = await mainifold.modifyAndTest(
  code => code.replace('towerH = 28', 'towerH = 35'),
  { isManifold: true, maxComponents: 1 }
)
// r.modifiedCode = transformed code, r.stats = geometry stats, r.passed = true/false

// Multi-query current geometry in one call (no re-execution)
const r = mainifold.query({ sliceAt: [5, 10, 15], decompose: true, boundingBox: true })
// r.slices = {z5: {...}, z10: {...}, z15: {...}}
// r.components = [{index, volume, centroid, boundingBox}, ...]
// r.boundingBox = {min, max}, r.stats = current geometry-data
```

### Session & Versioning API

Sessions let you (or an AI agent) save multiple versions of a design, then compare them in a gallery view.

```javascript
// Create a session and iterate on a design
const { id, url } = await mainifold.createSession("Gear variations");

// Assert + save in one call — fails fast without saving if assertions don't pass
const r = await mainifold.runAndSave(`
  const { Manifold } = api;
  return Manifold.cylinder(10, 8, 8, 32);
`, "v1 - basic cylinder", { isManifold: true, maxComponents: 1 });
// If assertions fail: r.passed = false, r.failures = [...], version NOT saved
// If pass: r.passed = true, r.geometry, r.version, r.diff, r.galleryUrl
// Assertions are optional — omit the third arg for save-without-validation

// Run more variations — each returns diff against previous
await mainifold.runAndSave(variant2Code, "v2 - added teeth", { isManifold: true });
await mainifold.runAndSave(variant3Code, "v3 - wider base");

// Or create a complete session with all versions in one call
await mainifold.createSessionWithVersions("Gear variations", [
  { code: v1Code, label: "v1 - basic cylinder" },
  { code: v2Code, label: "v2 - added teeth" },
  { code: v3Code, label: "v3 - wider base" },
]);
// → { session: {id, name}, versions: [{version, geometry},...], galleryUrl }

// Get gallery URL for human review
mainifold.getGalleryUrl()
// → "http://localhost:5173/?session=abc123&gallery"

// Session management
await mainifold.listSessions()        // → [{id, name, updated}]
await mainifold.openSession(id)       // Load latest version
await mainifold.closeSession()

// Version navigation
await mainifold.listVersions()        // → [{id, index, label, timestamp, status}]
await mainifold.loadVersion(2)        // Load version by index
await mainifold.navigateVersion('prev')
await mainifold.navigateVersion('next')
await mainifold.saveVersion("label")  // Save current state as version
mainifold.getSessionState()           // → {session, currentVersion, versionCount}

// Export / Import (sharing sessions between users)
const data = await mainifold.exportSession()     // Export current session as JSON
const data = await mainifold.exportSession(id)   // Export specific session
await mainifold.importSession(data)              // Import JSON, regenerates thumbnails
await mainifold.clearAllSessions()               // Delete ALL sessions & versions from IndexedDB
```

**URL parameters:**
- `?session=<id>` — Load session, resume latest version
- `?session=<id>&v=3` — Load specific version
- `?session=<id>&gallery` — Open gallery view
- `?view=ai` — Works with any of the above

**Gallery view:** Grid of version tiles with isometric thumbnails, geometry stats (volume, dimensions), and status indicators. Click any tile to load that version. Ideal for AI to produce N variations, then hand off a gallery URL for human review.

## Structured Geometry Data

`document.getElementById("geometry-data").textContent` always contains current model stats as JSON:

```json
{
  "status": "ok",
  "vertexCount": 8,
  "triangleCount": 12,
  "boundingBox": {
    "x": [-5, 5], "y": [-5, 5], "z": [-5, 5],
    "dimensions": [10, 10, 10]
  },
  "centroid": [0, 0, 0],
  "volume": 1000,
  "surfaceArea": 600,
  "genus": 0,
  "isManifold": true,
  "componentCount": 1,
  "crossSections": {
    "z25": { "z": -2.5, "area": 100, "contours": 1 },
    "z50": { "z": 0, "area": 100, "contours": 1 },
    "z75": { "z": 2.5, "area": 100, "contours": 1 }
  },
  "executionTimeMs": 12,
  "codeHash": "a1b2c3d4"
}
```

`codeHash` is a hash of the source code that produced the geometry. Use it to confirm the displayed stats correspond to the code you submitted (detect stale data from a previous run).

On error:
```json
{
  "status": "error",
  "error": "Code must return a Manifold object.",
  "executionTimeMs": 2,
  "codeHash": "e5f6g7h8"
}
```

## Verification Workflow

Navigate to `http://localhost:5173/?view=ai` to start with isometric views visible.

After modifying geometry code:

1. Read `#geometry-data` — check `status` is `"ok"`, verify volume, dimensions, componentCount, isManifold
2. Check `crossSections` quartiles for expected profile (area and contour count at 25%/50%/75% height)
3. Use `mainifold.sliceAtZ(z)` for additional cross-sections at specific heights
4. Take a screenshot — with `?view=ai`, the 4 isometric views fill the right panel (alternating cube corners, every face visible in 2+ views)
5. Use `mainifold.validate(code)` for quick syntax checks before committing to a full run
6. Use `mainifold.runAndAssert(code, assertions)` for structured validation with pass/fail

### Recommended iteration pattern

1. Write initial code, assert+save in one call: `runAndSave(code, "v1 - base", {isManifold: true, maxComponents: 1})`
2. Tweak code with `modifyAndTest(patchFn, assertions)` — no side effects, saves tokens
3. When satisfied, save: `runAndSave(modifiedCode, "v2 - improvements", assertions)` — check the diff
4. Use `query({sliceAt: [...], decompose: true})` for follow-up inspection without re-running
5. Gallery URL is in `#geometry-data` JSON and `runAndSave` return value (avoids sandbox-blocked `getGalleryUrl()`).

## Photo-to-Model Workflow

To recreate a building or object from a reference photo:

### 1. Analyze the reference
Use the Gemini-powered analysis script:
```bash
node scripts/generate-views.js /path/to/photo.jpg
```
This produces a JSON analysis with mass decomposition, proportions, roof style, feature positions, and elevation descriptions.

### 2. Load reference images
If you have reference photos for specific angles, load them for side-by-side comparison:
```javascript
mainifold.setReferenceImages({
  front: 'data:image/jpeg;base64,...',
  right: 'data:image/jpeg;base64,...',
  perspective: 'data:image/jpeg;base64,...',  // original photo
})
// Elevations tab now shows Ref | Model side-by-side for each view
```

### 3. Build major masses first
Decompose the building into volumes and build largest-to-smallest:
1. Main body (walls + floors) — get overall proportions right
2. Roof (use hull-based approach) — verify with side elevation
3. Wings/extensions (garage, additions)
4. Porches/decks
5. Detail features (windows, doors, trim)

Use `boundsRatio` assertions to enforce proportion targets from the analysis:
```javascript
await mainifold.runAndAssert(code, {
  isManifold: true, maxComponents: 1,
  boundsRatio: { widthToDepth: [1.2, 1.8], widthToHeight: [1.5, 2.5] }
});
```

### 4. Compare at each step
After every structural change, check the Elevations tab (`?view=elevations`). With reference images loaded, each panel shows the reference alongside the model at the same angle.

## Examples

Located in `examples/*.js`. Loaded via the toolbar dropdown.
