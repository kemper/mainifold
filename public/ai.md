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
await mainifold.exportGLB()   // Download GLB
mainifold.exportSTL()         // Download STL
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
  "executionTimeMs": 12
}
```

On error: `{"status":"error","error":"...","executionTimeMs":2}`

## Writing model code

Code runs in a sandbox via `new Function('api', code)`. All transforms return new immutable Manifold instances — chaining works.

```js
const { Manifold, CrossSection } = api;
// MUST return a Manifold object
```

### Primitive origins and orientations

```
cube([x,y,z])         → spans [0,0,0] to [x,y,z]
cube([x,y,z], true)   → centered at origin: [-x/2..x/2, -y/2..y/2, -z/2..z/2]
sphere(r, n?)         → centered at origin
cylinder(h, rLow, rHigh?, n?) → Z-axis aligned, base at z=0, top at z=h
                         rHigh defaults to rLow. Set to 0 for cone.
tetrahedron()          → vertices at ~[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]
                         centered near origin, ~2-unit bbox. Scale to desired size.
extrude(cs, h)         → extrudes CrossSection along Z from z=0 to z=h
revolve(cs, n?)        → revolves CrossSection around Y axis
```

### All constructors

```
Manifold: cube, sphere, cylinder, tetrahedron, extrude, revolve,
          union, difference, intersection, hull, compose, smooth, levelSet, ofMesh
CrossSection: square, circle, ofPolygons (CCW outer, CW holes),
              compose, union, difference, intersection, hull
```

### Instance methods

```
Booleans:   .add(other)  .subtract(other)  .intersect(other)  .hull()
Transforms: .translate([x,y,z])  .rotate([rx,ry,rz])  .scale(s)  .mirror([x,y,z])
            .warp(fn)  .transform(mat4x3)
Mesh ops:   .refine(n)  .simplify()  .smoothOut()  .calculateNormals(idx, angle?)
Queries:    .volume()  .surfaceArea()  .genus()  .numVert()  .numTri()  .isEmpty()
            .boundingBox()  .status() (0=valid)  .decompose()
Slicing:    .slice(z)  .project()  .trimByPlane(n,off)  .splitByPlane(n,off)
Output:     .getMesh() → {vertProperties, triVerts, numVert, numTri, numProp}
```

## Verification

1. Read `#geometry-data` — check `status:"ok"`, volume, dimensions, componentCount, isManifold
2. Check `crossSections` quartiles (z25/z50/z75) for expected profile
3. Use `mainifold.sliceAtZ(z)` for specific heights
4. Screenshot with `?view=ai` — 4 isometric angles show every face
5. Use `mainifold.validate(code)` for quick syntax checks
