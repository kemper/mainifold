# mAInifold

A browser-based CAD tool designed for AI-driven 3D modeling. Write JavaScript code, get instant 3D geometry — no backend, no installs.

Built on [manifold-3d](https://github.com/elalish/manifold) (fast WASM boolean engine), [Three.js](https://threejs.org/) (rendering), and [CodeMirror](https://codemirror.net/) (editor).

## What it does

- **Code-driven CAD** — Write JS that constructs 3D geometry using primitives, booleans, extrusions, and revolves. Hit Run, see the result.
- **AI-friendly** — A `window.mainifold` console API lets AI agents create, validate, and iterate on designs programmatically. Structured geometry data (volume, bounding box, cross-sections) is always available in the DOM for verification.
- **Session & versioning** — Save multiple design variations, then open a gallery view to compare them side-by-side. Ideal for AI workflows that generate N variations for human review.
- **Multi-view rendering** — Interactive 3D viewport plus a 4-panel isometric grid (alternating cube corners, every face visible in 2+ views).
- **Cross-sections** — Slice geometry at any Z height, inspect the 2D profile as SVG.
- **Export** — GLB and STL download.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) for the landing page, or [http://localhost:5173/editor?view=ai](http://localhost:5173/editor?view=ai) to start with all 4 isometric views visible (recommended for AI agents).

## How it works

The editor runs user code in a sandboxed function. Code receives an `api` object with `Manifold`, `CrossSection`, and `setCircularSegments`, and must `return` a Manifold:

```javascript
const { Manifold, CrossSection } = api;

// Create a plate with rounded edges and a bolt hole
const plate = Manifold.cube([40, 30, 5]);
const hole = Manifold.cylinder(5, 3, 3, 32).translate([20, 15, 0]);
return plate.subtract(hole);
```

All transforms are immutable — methods return new objects, originals are unchanged. Method chaining works naturally:

```javascript
Manifold.cube([10, 10, 10], true)
  .subtract(Manifold.cylinder(12, 3, 3, 32))
  .translate([0, 0, 5]);
```

## AI Agent Setup

AI agents (Claude Code, etc.) interact with the app via `window.mainifold` in the browser. There are several ways to give an AI agent browser access:

### Option 1: Claude in Chrome extension (recommended)

The [Claude in Chrome](https://chromewebstore.google.com/detail/claude-in-chrome/ifjdokaooeocjpmoijgkndfhkmnbobkp) extension lets Claude Desktop control your active Chrome tab directly — screenshots, JavaScript execution, and DOM reading all work. No extra setup beyond installing the extension.

Best for: interactive sessions where you want to see what the AI is doing in real time.

### Option 2: Chrome DevTools MCP

If Chrome is running with remote debugging enabled (there's a Chrome setting for this, or launch with `--remote-debugging-port=9222`), Claude Desktop can connect via the DevTools protocol.

```bash
claude mcp add chrome-devtools -s user -- npx -y @anthropic-ai/chrome-devtools-mcp-server
```

Best for: using your existing browser with all your sessions/data intact.

### Option 3: Playwright MCP

Launches a separate browser instance — no Chrome setup needed.

```bash
claude mcp add playwright -s user -- npx -y @playwright/mcp
```

Best for: automated/headless workflows, CI pipelines, or when you don't want to use your main browser.

### The workflow

Whichever option you use, the AI agent navigates to `http://localhost:5173/editor?view=ai`, then uses the `window.mainifold` console API to create sessions, write geometry code, validate results with assertions, save versions, and hand you a gallery URL for review.

See `CLAUDE.md` for the full API reference and recommended iteration patterns.

## Console API

For AI agents and automation, `window.mainifold` exposes:

```javascript
mainifold.run(code)             // Execute code, returns geometry stats
mainifold.validate(code)        // Syntax/logic check without rendering
mainifold.getGeometryData()     // Current model stats (volume, bbox, genus, ...)
mainifold.getCode()             // Read editor contents
mainifold.setCode(code)         // Write to editor
mainifold.sliceAtZ(z)           // Cross-section at height z
mainifold.exportGLB()           // Download GLB
mainifold.exportSTL()           // Download STL

// Sessions — save/compare design iterations
await mainifold.createSession("Gear variations")
await mainifold.runAndSave(code, "v1 - basic")
mainifold.getGalleryUrl()       // URL for gallery view
```

Geometry stats are also always available as JSON in `#geometry-data` for DOM scraping.

## Examples

The toolbar dropdown includes built-in examples:

| Example | What it demonstrates |
|---------|---------------------|
| Basic Shapes | Primitives and booleans |
| Twisted Vase | Stacked cylinders with twist |
| Boolean Demo | Union, difference, intersection |
| Chess Rook | Revolve profile + circular array |
| Spur Gear | Involute tooth profile, extrude, bore |
| L-Bracket | Plate with fillets and bolt holes |
| Desk Organizer | Rounded rectangles, hollowing |
| Christmas Tree | Stacked cones with ornaments |

## Architecture

Static site — vanilla TypeScript + Vite, no backend or framework.

```
src/
  geometry/engine.ts      Manifold WASM init + sandboxed code execution
  geometry/crossSection.ts  Z-slice to SVG/polygon conversion
  renderer/viewport.ts    Three.js interactive viewport
  renderer/multiview.ts   4-panel isometric view grid
  editor/codeEditor.ts    CodeMirror editor setup
  ui/layout.ts            Split-pane layout
  ui/toolbar.ts           Top toolbar with examples dropdown
  ui/panels.ts            View tab wiring
  export/gltf.ts          GLB export
  export/stl.ts           STL export
```

Requires `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers for SharedArrayBuffer / WASM threads (configured in `vite.config.ts`).

## Coordinate system

Right-handed, Z-up. The XY plane is the ground, Z points up. Units are arbitrary — use consistent scale.
