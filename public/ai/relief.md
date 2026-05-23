# HueForge-style reliefs (Relief Studio)

A **relief** is a heightmap mesh generated from an image: at each XY the model
has a height, built as a stepped solid quantized to the print layer height. You
paint its surface with the normal paint tools — free per-region color, which is
exactly what an AMS / multi-material printer reproduces. For single-nozzle
printers, the app derives an advisory **swap guide** (which layer heights to
change filament at); it does not export swap instructions.

## Make a relief from an image

```js
// src is a data: or http(s) image URL (e.g. an attached reference image's src).
await partwright.importImageAsRelief({
  src: 'data:image/png;base64,...',
  mode: 'luminance',            // 'luminance' (default) | 'quantized' | 'ai'
  options: { widthMm: 100, layerHeight: 0.08, baseThickness: 0.6, maxHeight: 3, resolution: 200 },
})
// -> { sessionId } (a new session whose geometry is the relief), or { error }
```

- **luminance** — brightness → height (tonal relief). Best for photos/portraits.
- **quantized** — clusters the image colors into height bands AND pre-seeds a
  color region per cluster, so the relief starts already painted.
- **ai** — currently mapped to luminance for geometry.

The relief is a normal Manifold Part (`return Manifold.ofMesh(api.imports[0])`),
so all geometry/paint/slice tools work on it.

## Paint it

Use the regular paint tools. Two strategies:

- **AMS (free paint):** paint features however you like — `paintInBox`,
  `paintConnected`, `paintByLabel`, etc. Each region is one filament color.
- **Single-nozzle friendly:** keep color a function of height — paint with
  `paintSlab({ axis: 'z', offset, thickness, color })` in horizontal bands so a
  single nozzle can reproduce it with filament swaps.

## See it like a print

```js
partwright.setReliefPreviewMode('single-nozzle') // 'flat' | 'ams' | 'single-nozzle'
```

`single-nozzle` simulates light through the translucent layer stack (filament
transmission distance), so it differs from flat paint. The preview is baked into
the per-triangle colors, so `renderView` / `renderViews` show it — set it before
rendering to self-check a HueForge against the reference image.

## Read the swap guide

```js
partwright.getReliefSwapGuide()
// -> { layerHeight, totalLayers, totalHeight,
//      swaps: [{ atLayer, atZ, color:[r,g,b], filamentName? }, ...],
//      bands: [...], printability: 0..1, warnings: [...] }
```

`printability` near 1 means a single nozzle reproduces the painting well. A
`warnings` entry means a layer mixes colors at the same height — only an AMS can
reproduce that; constrain the paint there to Z-slabs if single-nozzle output
matters.

## Imported HueForge STLs

Import the `.stl` normally, then in the Relief Studio panel use **Detect levels**
to seed a color region per existing Z plateau (or, programmatically, paint Z
slabs). Then preview + read the swap guide as above.
