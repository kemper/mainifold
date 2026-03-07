# mAInifold — AI Agent Instructions

This is a browser-based parametric CAD tool powered by manifold-3d (WASM). You write JavaScript code that constructs 3D geometry, and it renders live.

## How to use this tool

1. Navigate to this app's URL with `?view=ai` to see 4 isometric views (e.g. `http://localhost:5173/?view=ai`)
2. Use `window.mainifold` in the browser console to interact programmatically
3. Read `document.getElementById("geometry-data").textContent` for structured geometry stats (JSON)

## Console API — window.mainifold

```js
// Run code in the editor and get geometry stats back
mainifold.run(`
  const { Manifold } = api;
  return Manifold.cube([10, 10, 10], true);
`)
// Returns: { vertexCount, triangleCount, boundingBox, volume, surfaceArea, genus, crossSectionAtMidZ }

mainifold.getGeometryData()   // Read current geometry stats (same as #geometry-data)
mainifold.getCode()           // Read editor contents
mainifold.setCode(code)       // Set editor contents (does not auto-run)
mainifold.sliceAtZ(z)         // Cross-section at Z → { polygons, svg, boundingBox, area }
mainifold.getBoundingBox()    // → { min: [x,y,z], max: [x,y,z] }
mainifold.getModule()         // Raw manifold-3d WASM module
await mainifold.exportGLB()   // Download GLB file
mainifold.exportSTL()         // Download STL file
```

## Writing model code

Code runs in a sandbox via `new Function('api', code)`. Destructure the API:

```js
const { Manifold, CrossSection, setCircularSegments } = api;
```

**You must `return` a Manifold object.**

### Constructors

```
Manifold.cube([x,y,z], center?)        Manifold.sphere(radius, segments?)
Manifold.cylinder(h, rLow, rHigh?, n?) Manifold.tetrahedron()
Manifold.extrude(crossSection, h)      Manifold.revolve(crossSection, n?)
Manifold.union(arr)                    Manifold.difference(arr)
Manifold.intersection(arr)             Manifold.hull(arr)
Manifold.compose(arr)                  Manifold.smooth(mesh, edges?)
Manifold.levelSet(fn, bounds, edge)    Manifold.ofMesh(mesh)
CrossSection.square([x,y], center?)    CrossSection.circle(r, n?)
CrossSection.ofPolygons(polygons)      CrossSection.hull(arr)
```

### Instance methods

```
.add(other)  .subtract(other)  .intersect(other)  .hull()
.translate([x,y,z])  .rotate([rx,ry,rz])  .scale(s)  .mirror([x,y,z])
.warp(fn)  .refine(n)  .simplify()  .smoothOut()
.volume()  .surfaceArea()  .genus()  .numVert()  .numTri()  .isEmpty()
.boundingBox()  .slice(z)  .project()  .getMesh()  .decompose()
.trimByPlane(normal, offset)  .splitByPlane(normal, offset)
```

## Verification

1. Read `#geometry-data` for volume, bounding box, vertex/triangle counts
2. Use `mainifold.sliceAtZ(z)` to verify cross-sections at key heights
3. Take a screenshot with `?view=ai` — 4 isometric angles show every face
4. Status indicator: green=ready, amber=running, red=error
