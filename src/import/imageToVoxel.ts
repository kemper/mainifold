// Image → voxel grid conversion. Turns a raster image (logo, sprite,
// pixel-art, small photo) into a standing billboard of colored voxels, then
// emits runnable editor code that rebuilds it via `voxels.decode(...)`.
//
// The pure conversion + codegen live here (unit-testable with a synthetic
// ImageData); the DOM step that turns a `File` into pixels lives in main.ts.

import { VoxelGrid, encodeGrid, COORD_MIN, COORD_MAX } from '../geometry/voxel/grid';

/** Minimal shape of the browser `ImageData` we consume (also satisfiable by a
 *  plain object in tests). */
export interface ImageDataLike {
  width: number;
  height: number;
  /** RGBA bytes, row-major, length `width * height * 4`. */
  data: Uint8ClampedArray | Uint8Array | number[];
}

/** How the image's pixels are turned into voxel depth along +Y.
 *  - `billboard`: every surviving pixel becomes a flat column of `depth`
 *    voxels — a standing colored picture (the original behavior).
 *  - `heightmap`: each pixel's brightness drives a per-column height, so
 *    the image becomes a relief/lithophane-style 3D surface. */
export type ImageVoxelMode = 'billboard' | 'heightmap';

/** How surviving pixels are colored.
 *  - `original`: keep each pixel's RGB.
 *  - `grayscale`: replace with its luminance (handy for heightmaps).
 *  - `flat`: paint every voxel a single `flatColor`. */
export type ImageVoxelColorMode = 'original' | 'grayscale' | 'flat';

export interface ImageToVoxelOptions {
  /** Longest side after downsampling. The grid axis range caps this anyway. */
  maxSize?: number;
  /** Conversion mode (default `billboard`). */
  mode?: ImageVoxelMode;
  /** Billboard mode: how many voxels deep to extrude the image along Y. */
  depth?: number;
  /** Heightmap mode: the tallest a pixel's relief can reach (voxels along Y). */
  maxHeight?: number;
  /** Heightmap mode: a solid backing slab (voxels along Y) added behind every
   *  surviving pixel, so even the darkest areas stay connected/printable. */
  baseThickness?: number;
  /** Heightmap mode: invert the brightness→height mapping (dark = tall). */
  invert?: boolean;
  /** Minimum alpha (0–255) for a pixel to become a voxel. Lets transparent
   *  PNG/sprite backgrounds drop out; opaque photos become a full slab. */
  alphaThreshold?: number;
  /** How surviving pixels are colored (default `original`). */
  colorMode?: ImageVoxelColorMode;
  /** RGB used when `colorMode` is `flat` (default mid-gray). */
  flatColor?: [number, number, number];
}

const DEFAULTS = {
  maxSize: 64,
  mode: 'billboard' as ImageVoxelMode,
  depth: 1,
  maxHeight: 16,
  baseThickness: 1,
  invert: false,
  alphaThreshold: 128,
  colorMode: 'original' as ImageVoxelColorMode,
  flatColor: [128, 128, 128] as [number, number, number],
};
// Cap so a pathological maxSize can't exceed the grid's coordinate range.
const HARD_MAX = Math.min(256, COORD_MAX - COORD_MIN);
// Cap the Y extent (depth / maxHeight + baseThickness) similarly.
const HARD_MAX_Y = Math.min(512, COORD_MAX - COORD_MIN);

/** Rec. 601 luma — the perceptual brightness used for the heightmap mapping
 *  and the `grayscale` color mode. Returns 0–255. */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** One downsampled pixel that survived the alpha test, resolved to a voxel
 *  column: where it sits in the grid, how tall its +Y extrusion is, and the
 *  color every voxel in the column takes. */
export interface VoxelColumn {
  /** Grid coordinates of the column's base voxel. */
  x: number;
  z: number;
  /** Downsampled-image pixel coordinates (origin top-left) — handy for 2D previews. */
  px: number;
  py: number;
  /** Number of voxels stacked along +Y (always ≥ 1). */
  height: number;
  color: [number, number, number];
}

export interface ImageVoxelLayout {
  /** Downsampled image dimensions (also the preview canvas pixel grid). */
  tw: number;
  th: number;
  columns: VoxelColumn[];
  /** Total voxels the grid will contain (columns never overlap, so this is the
   *  sum of column heights). */
  voxelCount: number;
  /** Bounding-box size of the produced voxels, matching the codegen's
   *  `W×H×D` (X×Y×Z) readout. Zeroes when nothing survives. */
  dims: { x: number; y: number; z: number };
}

/** Resolve the image into voxel columns without allocating the grid. This is
 *  the single source of truth for the survive / height / color rules, shared
 *  by `imageDataToVoxelGrid` (which fills a real grid) and the import modal's
 *  live preview (which just draws + counts). */
export function computeImageVoxelLayout(image: ImageDataLike, options: ImageToVoxelOptions = {}): ImageVoxelLayout {
  const maxSize = Math.max(1, Math.min(Math.floor(options.maxSize ?? DEFAULTS.maxSize), HARD_MAX));
  const mode = options.mode ?? DEFAULTS.mode;
  const depth = Math.max(1, Math.min(Math.floor(options.depth ?? DEFAULTS.depth), HARD_MAX_Y));
  const maxHeight = Math.max(1, Math.min(Math.floor(options.maxHeight ?? DEFAULTS.maxHeight), HARD_MAX_Y));
  const baseThickness = Math.max(0, Math.min(Math.floor(options.baseThickness ?? DEFAULTS.baseThickness), HARD_MAX_Y));
  const invert = options.invert ?? DEFAULTS.invert;
  const alphaThreshold = Math.max(0, Math.min(255, options.alphaThreshold ?? DEFAULTS.alphaThreshold));
  const colorMode = options.colorMode ?? DEFAULTS.colorMode;
  const flatColor = options.flatColor ?? DEFAULTS.flatColor;

  const { width: sw, height: sh, data } = image;
  if (sw <= 0 || sh <= 0) return { tw: 0, th: 0, columns: [], voxelCount: 0, dims: { x: 0, y: 0, z: 0 } };

  // Downsample (nearest-neighbor) so the longest side fits maxSize.
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));

  const offX = Math.floor(tw / 2); // center horizontally on X=0
  const columns: VoxelColumn[] = [];
  let voxelCount = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;

  for (let ty = 0; ty < th; ty++) {
    // Nearest source row for this target row.
    const sy = Math.min(sh - 1, Math.floor((ty / th) * sh));
    for (let tx = 0; tx < tw; tx++) {
      const sx = Math.min(sw - 1, Math.floor((tx / tw) * sw));
      const p = (sy * sw + sx) * 4;
      const a = data[p + 3];
      if (a < alphaThreshold) continue;
      const r = data[p], g = data[p + 1], b = data[p + 2];

      // Per-column height in voxels.
      let height: number;
      if (mode === 'heightmap') {
        const lum = luminance(r, g, b) / 255;
        const norm = invert ? 1 - lum : lum;
        height = baseThickness + Math.round(norm * maxHeight);
      } else {
        height = depth;
      }
      if (height <= 0) continue; // e.g. heightmap, no base, fully dark

      // Resolve the voxel color for this pixel.
      let color: [number, number, number];
      if (colorMode === 'flat') {
        color = [clampByte(flatColor[0]), clampByte(flatColor[1]), clampByte(flatColor[2])];
      } else if (colorMode === 'grayscale') {
        const l = clampByte(luminance(r, g, b));
        color = [l, l, l];
      } else {
        color = [r, g, b];
      }

      const x = tx - offX;
      const z = th - 1 - ty; // flip so image top is high Z; base sits at Z=0
      columns.push({ x, z, px: tx, py: ty, height, color });
      voxelCount += height;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      if (height > maxY) maxY = height;
    }
  }

  const dims = columns.length
    ? { x: maxX - minX + 1, y: maxY, z: maxZ - minZ + 1 }
    : { x: 0, y: 0, z: 0 };
  return { tw, th, columns, voxelCount, dims };
}

/** Convert image pixels into a centered, upright voxel model.
 *
 *  Mapping: image column → X (centered on 0), image row → Z (row 0 at the
 *  top, so the picture stands upright on the ground plane), extruded along
 *  +Y. In `billboard` mode every surviving pixel gets a flat `depth`-voxel
 *  column; in `heightmap` mode the per-pixel column height comes from the
 *  pixel's brightness (plus an optional solid backing). */
export function imageDataToVoxelGrid(image: ImageDataLike, options: ImageToVoxelOptions = {}): VoxelGrid {
  const { columns } = computeImageVoxelLayout(image, options);
  const grid = new VoxelGrid();
  for (const col of columns) {
    for (let y = 0; y < col.height; y++) grid.set(col.x, y, col.z, col.color);
  }
  return grid;
}

/** Emit editor code that rebuilds a grid via `voxels.decode(...)`. Mirrors the
 *  imported-mesh codegen: human-readable header, one self-contained `return`. */
export function generateVoxelImportCode(grid: VoxelGrid, filename: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const b = grid.bounds();
  const dims = b
    ? `${b.max[0] - b.min[0] + 1}×${b.max[1] - b.min[1] + 1}×${b.max[2] - b.min[2] + 1}`
    : '0×0×0';
  const encoded = encodeGrid(grid);
  // Preserve the grid's surfacing setting in the emitted code so a
  // smooth-surfaced model that's baked (e.g. via the voxel paint flow) keeps
  // its rounded edges after the next run, instead of silently reverting to
  // hard blocks. The default (blocks) needs no call.
  const surf = grid.surfacing();
  const surfaceCall = surf.mode === 'smooth'
    ? `\nv.smooth({ iterations: ${surf.iterations}, detail: ${surf.detail} });`
    : '';
  return `// Imported from ${filename} on ${date}
// ${grid.size} voxels (${dims}). Edit below — e.g. add v.fillBox(...) before returning.
const { voxels } = api;
const v = voxels.decode(${JSON.stringify(encoded)});${surfaceCall}
return v;
`;
}
