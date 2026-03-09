# Technology Stack

**Analysis Date:** 2026-03-09

## Languages

**Primary:**
- TypeScript ~5.8.3 - All application source code in `src/`
- JavaScript (ES Modules) - Example files in `examples/*.js`, session scripts in `scripts/`

**Secondary:**
- HTML - Single entry point `index.html`
- CSS - Minimal custom styles in `src/style.css`, Tailwind CSS for all UI styling
- WASM - manifold-3d geometry engine runs as WebAssembly (loaded at runtime via `manifold-3d` npm package)

## Runtime

**Environment:**
- Node.js v20.x (v20.9.0 on dev machine, v20 specified in CI)
- Browser: Modern browsers with SharedArrayBuffer support (requires COEP/COOP headers)

**Package Manager:**
- npm 10.x (10.1.0 on dev machine)
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- Three.js ^0.183.2 - 3D rendering (WebGL), viewport, multiview, elevation rendering
- manifold-3d ^3.3.2 - CSG (Constructive Solid Geometry) engine compiled to WASM
- Tailwind CSS ^4.2.1 - Utility-first CSS framework for all UI styling

**Editor:**
- CodeMirror 6 (^6.0.2) - In-browser code editor with JavaScript syntax highlighting
  - `@codemirror/lang-javascript` ^6.2.5
  - `@codemirror/state` ^6.5.4
  - `@codemirror/theme-one-dark` ^6.1.3
  - `@codemirror/view` ^6.39.16

**Build/Dev:**
- Vite ^6.3.5 - Dev server and production bundler
- TypeScript ~5.8.3 - Type checking (noEmit mode, bundler handles output)
- `@tailwindcss/vite` ^4.2.1 - Tailwind CSS Vite plugin

## Key Dependencies

**Critical:**
- `manifold-3d` ^3.3.2 - The core geometry engine. WASM binary loaded asynchronously in `src/geometry/engine.ts`. All CAD operations (boolean, transforms, meshing) run through this.
- `three` ^0.183.2 - All 3D rendering: interactive viewport (`src/renderer/viewport.ts`), multiview (`src/renderer/multiview.ts`), export to GLB via `GLTFExporter` from three addons.

**UI:**
- `codemirror` ^6.0.2 - Full code editing experience with syntax highlighting, used in `src/editor/codeEditor.ts`.
- `tailwindcss` ^4.2.1 - CSS framework. Imported via `@import "tailwindcss"` in `src/style.css`.

**Dev-only:**
- `@types/three` ^0.183.1 - TypeScript type definitions for Three.js
- `typescript` ~5.8.3 - Compiler for type checking
- `vite` ^6.3.5 - Dev server and bundler

**Infrastructure (vendored/external):**
- `coi-serviceworker` v0.1.7 - Service worker in `public/coi-serviceworker.js` that injects COEP/COOP headers for SharedArrayBuffer support when server headers are not configured.

## Configuration

**TypeScript (`tsconfig.json`):**
- Target: ES2020
- Module: ESNext with bundler resolution
- Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`
- `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`
- Includes only `src/` directory

**Vite (`vite.config.ts`):**
- Base path: `/mainifold/` (for GitHub Pages deployment under subpath)
- Plugins: `@tailwindcss/vite`
- `manifold-3d` excluded from dependency optimization (WASM module needs special handling)
- Dev server sets COEP/COOP headers for SharedArrayBuffer:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`

**CSS (`src/style.css`):**
- Single import: `@import "tailwindcss"`
- One custom class: `.viewport-canvas` for Three.js canvas sizing

**Environment:**
- No `.env` files present
- No environment variables required for the main application
- `NANOBANANA_API_KEY` env var required only for the optional `scripts/generate-reference-images.cjs` script

**Build:**
- `npm run build` runs `tsc && vite build` - type-check then bundle to `dist/`
- `npm run dev` runs `vite` dev server at `http://localhost:5173`
- `npm run preview` runs `vite preview` for production build preview

## Platform Requirements

**Development:**
- Node.js >= 20
- npm >= 10
- Modern browser with SharedArrayBuffer support (Chrome, Firefox, Edge)
- No backend server required - fully static site

**Production:**
- Static file hosting with COEP/COOP header support (or relies on `coi-serviceworker.js` fallback)
- Currently deployed to GitHub Pages via GitHub Actions

**Browser Requirements:**
- WebGL 1.0+ (Three.js rendering)
- WebAssembly (manifold-3d WASM engine)
- SharedArrayBuffer (WASM multi-threading)
- IndexedDB (session/version storage in `src/storage/db.ts`)
- Service Workers (coi-serviceworker for header injection)

---

*Stack analysis: 2026-03-09*
