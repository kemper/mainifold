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
// segments defaults to ~22 (circular resolution).

Manifold.tetrahedron()
// Regular tetrahedron. Vertices approximately at:
// [1,1,1], [1,-1,-1], [-1,1,-1], [-1,-1,1]
// Centered near origin, fits in a ~2-unit bounding box.
// Scale it to desired size.

Manifold.extrude(crossSection, height)
// Extrude a 2D CrossSection along Z from z=0 to z=height.

Manifold.revolve(crossSection, segments?)
// Revolve a 2D CrossSection around the Y axis.

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
manifold.rotate([xDeg, yDeg, zDeg])  // Euler angles in degrees
manifold.scale([x, y, z])       // or scale(uniform)
manifold.mirror([x, y, z])      // Mirror across plane through origin
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
manifold.genus()                 // Topological genus (0 = sphere-like, 1 = torus-like)
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
// Array of polygon contours. Each contour is an array of [x,y] points.
// First contour = outer boundary (CCW winding).
// Subsequent contours = holes (CW winding).

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
  "executionTimeMs": 12
}
```

On error:
```json
{
  "status": "error",
  "error": "Code must return a Manifold object.",
  "executionTimeMs": 2
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

## Examples

Located in `examples/*.js`. Loaded via the toolbar dropdown.
