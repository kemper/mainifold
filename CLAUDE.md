# mAInifold — AI-Driven Browser CAD Tool

## Quick Start

```bash
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build to dist/
```

Open `http://localhost:5173/?view=ai` to start with the 4 isometric views visible (instead of the interactive viewport). This is the recommended URL for AI agents — all views are visible on page load without clicking any tabs.

Requires COEP/COOP headers (configured in vite.config.ts) for SharedArrayBuffer / WASM threads.

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

## Writing Model Code

User code runs in a sandboxed `new Function('api', code)`. The `api` object provides:

```javascript
const { Manifold, CrossSection, setCircularSegments } = api;
```

Code **must** `return` a Manifold object.

### Manifold Static Constructors

```javascript
Manifold.cube([x, y, z], center?)           // Box. center=true centers at origin
Manifold.sphere(radius, segments?)          // Sphere
Manifold.cylinder(height, radiusLow, radiusHigh?, segments?)  // Cylinder/cone
Manifold.tetrahedron()                      // Regular tetrahedron
Manifold.extrude(crossSection, height)      // Extrude 2D shape
Manifold.revolve(crossSection, segments?)   // Revolve 2D shape
Manifold.compose(manifolds[])               // Combine without booleans
Manifold.union(manifolds[])                 // Boolean union array
Manifold.difference(manifolds[])            // Boolean difference array
Manifold.intersection(manifolds[])          // Boolean intersection array
Manifold.hull(manifolds[])                  // Convex hull
Manifold.smooth(mesh, sharpenedEdges?)      // Smooth mesh
Manifold.levelSet(fn, bounds, edgeLength)   // Implicit surface
Manifold.ofMesh(mesh)                       // From raw mesh data
```

### Manifold Instance Methods

```javascript
// Booleans
manifold.add(other)              // Union
manifold.subtract(other)         // Difference
manifold.intersect(other)        // Intersection
manifold.hull()                  // Convex hull of self

// Transforms
manifold.translate([x, y, z])
manifold.rotate([xDeg, yDeg, zDeg])
manifold.scale([x, y, z])       // or scale(uniform)
manifold.mirror([x, y, z])      // Mirror across plane through origin
manifold.transform(matrix4x3)   // Arbitrary affine transform
manifold.warp(fn)                // Per-vertex warp function

// Mesh operations
manifold.refine(n)               // Subdivide triangles
manifold.refineToLength(length)
manifold.refineToTolerance(tol)
manifold.simplify(epsilon?)
manifold.smoothOut(minSharpAngle?, minSmoothness?)
manifold.calculateNormals(normalIdx, minSharpAngle?)

// Queries
manifold.volume()
manifold.surfaceArea()
manifold.genus()
manifold.numVert()
manifold.numTri()
manifold.numEdge()
manifold.isEmpty()
manifold.boundingBox()           // Returns {min, max} Vec3
manifold.status()
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
manifold.decompose()             // Separate disconnected components
```

### CrossSection Static Constructors

```javascript
CrossSection.square([x, y], center?)
CrossSection.circle(radius, segments?)
CrossSection.ofPolygons(polygons)           // Array of [x,y] point arrays
CrossSection.compose(sections[])
CrossSection.union(sections[])
CrossSection.difference(sections[])
CrossSection.intersection(sections[])
CrossSection.hull(sections[])
```

## Console API (window.mainifold)

When using this tool via DevTools MCP or browser automation:

```javascript
// Run code and get geometry stats back
mainifold.run(`
  const { Manifold } = api;
  return Manifold.cube([10, 10, 10], true);
`)
// → { vertexCount, triangleCount, boundingBox, volume, surfaceArea, genus, crossSectionAtMidZ }

// Read geometry data without re-running
mainifold.getGeometryData()

// Read/write editor
mainifold.getCode()
mainifold.setCode(code)

// Cross-section at any Z height
mainifold.sliceAtZ(3.5)
// → { polygons, svg, boundingBox, area }

// Bounding box
mainifold.getBoundingBox()
// → { min: [x,y,z], max: [x,y,z] }

// Exports
await mainifold.exportGLB()
mainifold.exportSTL()

// Raw manifold-3d module for advanced use
mainifold.getModule()
```

## Structured Geometry Data

`document.getElementById("geometry-data").textContent` always contains current model stats as JSON:

```json
{
  "vertexCount": 8,
  "triangleCount": 12,
  "boundingBox": { "x": [-5,5], "y": [-5,5], "z": [-5,5] },
  "volume": 1000,
  "surfaceArea": 600,
  "genus": 0,
  "crossSectionAtMidZ": { "z": 0, "area": 100, "contours": 1 }
}
```

## Verification Workflow

Navigate to `http://localhost:5173/?view=ai` to start with isometric views visible.

After modifying geometry code:

1. Read `#geometry-data` to verify volume, dimensions, topology
2. Use `mainifold.sliceAtZ(z)` at key heights to verify cross-sections
3. Take a screenshot — with `?view=ai`, the 4 isometric views fill the right panel (alternating cube corners, every face visible in 2+ views)
4. Check the status indicator: green = ready, amber = running, red = error

## Examples

Located in `examples/*.js`. Loaded via the toolbar dropdown.
