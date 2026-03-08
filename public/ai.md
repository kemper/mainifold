# mAInifold — AI Agent Instructions

Browser-based parametric CAD tool powered by manifold-3d (WASM). Write JavaScript that constructs 3D geometry, returns a Manifold object, and it renders live.

**Coordinate system:** Right-handed, Z-up. XY plane is the ground. Units are arbitrary.

## How to use this tool

1. Navigate with `?view=ai` to see 4 isometric views (e.g. `http://localhost:5173/?view=ai`)
2. Use `window.mainifold` in the browser console to interact programmatically
3. Read `document.getElementById("geometry-data").textContent` for structured stats (JSON)

## Console API — window.mainifold

```js
mainifold.run(code?)          // Run code, update views, return geometry stats
mainifold.getGeometryData()   // Current stats (same as #geometry-data)
mainifold.validate(code)      // Check code without rendering → {valid, error?}
mainifold.getCode()           // Read editor contents
mainifold.setCode(code)       // Set editor contents (no auto-run)
mainifold.sliceAtZ(z)         // Cross-section → {polygons, svg, boundingBox, area}
mainifold.getBoundingBox()    // → {min:[x,y,z], max:[x,y,z]}
mainifold.getModule()         // Raw manifold-3d WASM module
mainifold.toggleClip(on?)     // Toggle 3D clipping plane → {enabled, z, min, max}
mainifold.setClipZ(z)         // Set clip height → {enabled, z, min, max}
mainifold.getClipState()      // → {enabled, z, min, max}
await mainifold.exportGLB()   // Download GLB
mainifold.exportSTL()         // Download STL
mainifold.exportOBJ()         // Download OBJ
mainifold.export3MF()         // Download 3MF

// Isolated execution — test code without changing editor/viewport state
await mainifold.runIsolated(code)       // → {geometryData, thumbnail}
await mainifold.runAndAssert(code, assertions) // → {passed, failures?, stats}
mainifold.isRunning()                   // → boolean (is code executing?)

// Sessions — save/compare design iterations
await mainifold.createSession(name?)    // → {id, url}
await mainifold.runAndSave(code, label?) // Run + save + stat diff → {geometry, version, diff}
await mainifold.createSessionWithVersions(name, [{code, label},...]) // Batch create
await mainifold.saveVersion(label?)     // Save current state as version
await mainifold.listVersions()          // → [{id, index, label, timestamp, status}]
await mainifold.loadVersion(index)      // Load specific version
mainifold.getGalleryUrl()               // → URL for gallery view (human review)
mainifold.getSessionUrl()               // → URL for this session
await mainifold.listSessions()          // → [{id, name, updated}]
await mainifold.openSession(id)         // Open existing session
await mainifold.clearAllSessions()      // Delete all sessions & versions
```

## #geometry-data schema

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
- `Code must return a Manifold object` → forgot `return` statement
- `function _Cylinder called with N arguments` → wrong arg count
- Geometry looks wrong → check `isManifold` and `componentCount` (failed booleans = extra components)

## Writing model code

Code runs in a sandbox via `new Function('api', code)`. All transforms return new immutable Manifold instances — chaining works.

```js
const { Manifold, CrossSection } = api;
// MUST return a Manifold object
```

### Primitive origins and orientations

```
cube([x,y,z])         → spans [0,0,0] to [x,y,z]. center=true → centered at origin
sphere(r, n?)         → centered at origin
cylinder(h,rLo,rHi?,n?) → Z-axis, base z=0, top z=h. rHi=0 for cone
tetrahedron()          → vertices at [1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]. Scale to size.
extrude(cs, h, nDiv?, twist?, scaleTop?, center?)
  → along Z, z=0 to z=h. twist=degrees, scaleTop=number or [x,y] (0 for cone point)
revolve(cs, n?, degrees?)
  → around Y axis, then remaps so result is Z-up.
    Profile X=radial distance, Y=height → after revolve, Y becomes Z automatically.
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
Transforms: .translate([x,y,z])  .rotate([rx,ry,rz]) (degrees, applied X→Y→Z)
            .scale(s) or .scale([x,y,z])  .mirror([nx,ny,nz]) (plane normal)
            .warp(fn)  .transform(mat4x3)
Mesh ops:   .refine(n)  .simplify()  .smoothOut()  .calculateNormals(idx, angle?)
Queries:    .volume()  .surfaceArea()  .genus()  .numVert()  .numTri()  .isEmpty()
            .boundingBox()  .status() (0=valid)  .decompose()
Slicing:    .slice(z)  .project()  .trimByPlane(n,off)  .splitByPlane(n,off)
Output:     .getMesh() → {vertProperties, triVerts, numVert, numTri, numProp}
```

### CrossSection instance methods

```
2D→3D:      .extrude(h, nDiv?, twist?, scaleTop?, center?)  .revolve(n?, degrees?)
Transforms: .translate([x,y])  .rotate(degrees)  .scale(s or [x,y])
            .mirror([nx,ny])  .warp(fn)  .transform(mat3)
Booleans:   .add(other)  .subtract(other)  .intersect(other)  .hull()
Modify:     .offset(delta, joinType?, miterLimit?, segments?)  .simplify(epsilon?)
Queries:    .area()  .isEmpty()  .numVert()  .numContour()  .bounds()
Output:     .toPolygons()  .decompose()  .delete()
```

## Iteration Workflow

### Testing without side effects

Use `runIsolated` to test code variations without changing the editor or viewport:
```js
const r = await mainifold.runIsolated(code);
// r.geometryData = full stats (same schema as #geometry-data)
// r.thumbnail = data:image/png base64 string (4 isometric views)
```

### Assertions — structured validation

Check geometry against expectations in one call:
```js
const r = await mainifold.runAndAssert(code, {
  minVolume: 1000,      // volume bounds
  maxVolume: 50000,
  isManifold: true,     // must be valid manifold
  maxComponents: 1,     // detect failed booleans
  genus: 0,             // topological genus (0 = solid, N = N holes)
  minBounds: [10,10,5], // minimum bounding box dimensions [X,Y,Z]
  maxBounds: [50,50,30],
  minTriangles: 100,    // mesh complexity bounds
  maxTriangles: 50000,
});
// r.passed = true/false
// r.failures = ["volume 500.0 < minVolume 1000"] (only if failed)
// r.stats = full geometry stats
```

### Stat diffing

`runAndSave` returns a diff against the previous version:
```js
const r = await mainifold.runAndSave(code, "v2 - added towers");
// r.diff = {
//   volume: { from: 18200, to: 24500, delta: "+6300 (+34.6%)" },
//   componentCount: { from: 1, to: 1, delta: "unchanged" },
//   ...
// }
```

### Batch session creation

Create a complete session with multiple versions in one call:
```js
const r = await mainifold.createSessionWithVersions("Castle", [
  { code: v1Code, label: "v1 - walls" },
  { code: v2Code, label: "v2 - towers" },
  { code: v3Code, label: "v3 - gate" },
]);
// r.session = {id, name}
// r.versions = [{version, geometry}, ...]
// r.galleryUrl = "http://localhost:5173/?session=abc&gallery"
```

### Recommended iteration pattern

1. Write initial code, test with `runAndAssert(code, {isManifold: true, maxComponents: 1})`
2. If assertions pass, save: `runAndSave(code, "v1 - base")`
3. Modify code, test with `runIsolated(modifiedCode)` — check stats without committing
4. When satisfied, save: `runAndSave(modifiedCode, "v2 - improvements")` — check the diff
5. Repeat. Hand off `getGalleryUrl()` for human review.

## Verification

1. Read `#geometry-data` — check `status:"ok"`, volume, dimensions, componentCount, isManifold
2. Check `crossSections` quartiles (z25/z50/z75) for expected profile
3. Use `mainifold.sliceAtZ(z)` for specific heights
4. Screenshot with `?view=ai` — 4 isometric angles show every face
5. Use `mainifold.validate(code)` for quick syntax checks
6. Use `mainifold.runAndAssert(code, assertions)` for structured validation
