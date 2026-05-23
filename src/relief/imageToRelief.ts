// HueForge-style relief (heightmap) mesh generation.
//
// A relief is built directly from a regular grid of heights, NOT by unioning
// per-pixel boxes (which would be O(cells) boolean ops and far too slow). The
// top surface follows the grid, vertical skirt walls drop to z=0, and a flat
// bottom closes the solid so the result is edge-manifold and accepted by
// Manifold.ofMesh().

import type {
  HeightGrid,
  ReliefMesh,
  ReliefOptions,
  SeedRegion,
  GenerateReliefResult,
} from './types';
import { DEFAULT_RELIEF_OPTIONS } from './types';

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

function luminance255(r: number, g: number, b: number): number {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b;
}

/** Box/average downsample of an RGBA ImageData into per-cell mean RGB stored as
 *  Float32 (one [r,g,b] triple per cell, components 0..255). Columns are capped
 *  at `resolution`; rows scale to preserve aspect. */
function downsample(
  image: ImageData,
  resolution: number,
): { width: number; height: number; rgb: Float32Array } {
  const srcW = image.width;
  const srcH = image.height;
  const cols = Math.max(1, Math.min(resolution, srcW));
  // Preserve aspect: rows track the same px/cell scale as columns.
  const scale = cols / srcW;
  const rows = Math.max(1, Math.round(srcH * scale));

  const src = image.data;
  const rgb = new Float32Array(cols * rows * 3);

  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor((cy * srcH) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * srcH) / rows));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor((cx * srcW) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * srcW) / cols));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        let p = (sy * srcW + x0) * 4;
        for (let sx = x0; sx < x1; sx++) {
          sr += src[p];
          sg += src[p + 1];
          sb += src[p + 2];
          p += 4;
          n++;
        }
      }
      const inv = n > 0 ? 1 / n : 0;
      const o = (cy * cols + cx) * 3;
      rgb[o] = sr * inv;
      rgb[o + 1] = sg * inv;
      rgb[o + 2] = sb * inv;
    }
  }

  return { width: cols, height: rows, rgb };
}

/** Separable box blur (radius `r` cells) over an interleaved RGB Float32 grid.
 *  A box blur repeated would approach Gaussian; one pass is enough smoothing for
 *  relief sampling and keeps this dependency-free and fast. */
function blurRGB(rgb: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return rgb;
  const radius = Math.round(r);
  if (radius <= 0) return rgb;

  const tmp = new Float32Array(rgb.length);
  const out = new Float32Array(rgb.length);
  const win = radius * 2 + 1;
  const inv = 1 / win;

  // Horizontal pass: rgb -> tmp.
  for (let y = 0; y < h; y++) {
    const row = y * w * 3;
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = clampIndex(k, w);
        acc += rgb[row + sx * 3 + c];
      }
      for (let x = 0; x < w; x++) {
        tmp[row + x * 3 + c] = acc * inv;
        const addX = clampIndex(x + radius + 1, w);
        const subX = clampIndex(x - radius, w);
        acc += rgb[row + addX * 3 + c] - rgb[row + subX * 3 + c];
      }
    }
  }

  // Vertical pass: tmp -> out.
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = clampIndex(k, h);
        acc += tmp[(sy * w + x) * 3 + c];
      }
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 3 + c] = acc * inv;
        const addY = clampIndex(y + radius + 1, h);
        const subY = clampIndex(y - radius, h);
        acc += tmp[(addY * w + x) * 3 + c] - tmp[(subY * w + x) * 3 + c];
      }
    }
  }

  return out;
}

function clampIndex(i: number, n: number): number {
  if (i < 0) return 0;
  if (i >= n) return n - 1;
  return i;
}

/** Snap a height in [0, maxHeight] to one of `levels` evenly spaced steps, each
 *  itself rounded to a layerHeight multiple. */
function makeQuantizedLevels(maxHeight: number, layerHeight: number, levels: number): Float32Array {
  const n = Math.max(1, Math.floor(levels));
  const out = new Float32Array(n);
  const lh = layerHeight > 0 ? layerHeight : 0;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    let h = t * maxHeight;
    if (lh > 0) h = Math.round(h / lh) * lh;
    out[i] = h;
  }
  return out;
}

function quantizeHeight(h: number, levels: Float32Array, maxHeight: number): number {
  const n = levels.length;
  if (n <= 1) return levels[0] ?? 0;
  const t = maxHeight > 0 ? h / maxHeight : 0;
  let i = Math.round(t * (n - 1));
  if (i < 0) i = 0;
  else if (i >= n) i = n - 1;
  return levels[i];
}

/**
 * Sample an image into a quantized height grid. See module / type docs for the
 * per-mode mapping; `ai` mode reuses the luminance path (the AI only chooses
 * options upstream).
 */
export function sampleImageToGrid(image: ImageData, opts: ReliefOptions): HeightGrid {
  const { resolution, smoothing, maxHeight, layerHeight } = opts.common;
  const ds = downsample(image, resolution);
  const rgb = blurRGB(ds.rgb, ds.width, ds.height, smoothing);
  const w = ds.width;
  const h = ds.height;
  const count = w * h;

  if (opts.mode === 'quantized') {
    return sampleQuantized(rgb, w, h, opts);
  }

  // Luminance (and AI) mode.
  const { invert, gamma } = opts.luminance;
  const levels = makeQuantizedLevels(maxHeight, layerHeight, opts.luminance.levels);
  const heights = new Float32Array(count);
  const g = gamma > 0 ? gamma : 1;

  for (let i = 0; i < count; i++) {
    const o = i * 3;
    let l = luminance255(rgb[o], rgb[o + 1], rgb[o + 2]) / 255;
    if (invert) l = 1 - l;
    if (g !== 1) l = Math.pow(l, g);
    heights[i] = quantizeHeight(l * maxHeight, levels, maxHeight);
  }

  return { width: w, height: h, heights };
}

interface Cluster {
  r: number;
  g: number;
  b: number;
  height: number;
}

/** Median-cut color quantization producing exactly `k` clusters (or fewer when
 *  the image has fewer distinct colors). Deterministic and dependency-free. */
function medianCut(rgb: Float32Array, count: number, k: number): Cluster[] {
  // Each box is a contiguous slice of `order` (indices into the cells).
  const order = new Int32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;

  interface Box {
    start: number;
    end: number; // exclusive
  }
  const boxes: Box[] = [{ start: 0, end: count }];

  const channelAt = (cellIdx: number, c: number) => rgb[cellIdx * 3 + c];

  while (boxes.length < k) {
    // Pick the box with the largest single-channel extent.
    let bestBox = -1;
    let bestExtent = -1;
    let bestChannel = 0;
    for (let bi = 0; bi < boxes.length; bi++) {
      const b = boxes[bi];
      if (b.end - b.start <= 1) continue;
      for (let c = 0; c < 3; c++) {
        let mn = Infinity;
        let mx = -Infinity;
        for (let i = b.start; i < b.end; i++) {
          const v = channelAt(order[i], c);
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        const extent = mx - mn;
        if (extent > bestExtent) {
          bestExtent = extent;
          bestBox = bi;
          bestChannel = c;
        }
      }
    }
    if (bestBox < 0 || bestExtent <= 0) break; // no splittable box left

    const b = boxes[bestBox];
    // Sort the box's slice by the chosen channel, split at the median.
    const slice = Array.from(order.subarray(b.start, b.end));
    slice.sort((p, q) => channelAt(p, bestChannel) - channelAt(q, bestChannel));
    for (let i = 0; i < slice.length; i++) order[b.start + i] = slice[i];
    const mid = b.start + (slice.length >> 1);
    boxes[bestBox] = { start: b.start, end: mid };
    boxes.push({ start: mid, end: b.end });
  }

  // Each box's representative color = mean of its members.
  const centers: Cluster[] = [];
  for (let bi = 0; bi < boxes.length; bi++) {
    const b = boxes[bi];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    const n = b.end - b.start;
    for (let i = b.start; i < b.end; i++) {
      const cell = order[i];
      sr += rgb[cell * 3];
      sg += rgb[cell * 3 + 1];
      sb += rgb[cell * 3 + 2];
    }
    const inv = n > 0 ? 1 / n : 0;
    centers.push({ r: sr * inv, g: sg * inv, b: sb * inv, height: 0 });
  }

  return centers;
}

function sampleQuantized(rgb: Float32Array, w: number, h: number, opts: ReliefOptions): HeightGrid {
  const count = w * h;
  const { maxHeight, layerHeight } = opts.common;
  const k = Math.max(1, Math.floor(opts.quantized.clusters));

  const centers = medianCut(rgb, count, k);

  // Order clusters by luminance, then assign evenly spaced height bands snapped
  // to layer multiples (darkest cluster sits lowest).
  const sorted = centers
    .map((c, i) => ({ i, lum: luminance255(c.r, c.g, c.b) }))
    .sort((a, b) => a.lum - b.lum);
  const n = sorted.length;
  const lh = layerHeight > 0 ? layerHeight : 0;
  for (let s = 0; s < n; s++) {
    const t = n === 1 ? 0 : s / (n - 1);
    let height = t * maxHeight;
    if (lh > 0) height = Math.round(height / lh) * lh;
    centers[sorted[s].i].height = height;
  }

  const heights = new Float32Array(count);
  const colors = new Uint8Array(count * 3);

  if (opts.quantized.dither) {
    ditherAssign(rgb, w, h, centers, heights, colors);
  } else {
    for (let i = 0; i < count; i++) {
      const ci = nearestCluster(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], centers);
      const c = centers[ci];
      heights[i] = c.height;
      writeColor(colors, i, c);
    }
  }

  return { width: w, height: h, heights, colors };
}

function nearestCluster(r: number, g: number, b: number, centers: Cluster[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const dr = r - c.r;
    const dg = g - c.g;
    const db = b - c.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function writeColor(colors: Uint8Array, cell: number, c: Cluster): void {
  const o = cell * 3;
  colors[o] = clamp255(c.r);
  colors[o + 1] = clamp255(c.g);
  colors[o + 2] = clamp255(c.b);
}

function clamp255(v: number): number {
  const r = Math.round(v);
  if (r < 0) return 0;
  if (r > 255) return 255;
  return r;
}

/** Floyd–Steinberg dithering of the cluster assignment. Diffuses the per-cell
 *  quantization error over a working copy of the RGB grid so the assignment
 *  picks neighbours that average back toward the true color. */
function ditherAssign(
  rgb: Float32Array,
  w: number,
  h: number,
  centers: Cluster[],
  heights: Float32Array,
  colors: Uint8Array,
): void {
  const work = Float32Array.from(rgb);
  const add = (x: number, y: number, er: number, eg: number, eb: number, f: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const o = (y * w + x) * 3;
    work[o] += er * f;
    work[o + 1] += eg * f;
    work[o + 2] += eb * f;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 3;
      const r = work[o];
      const g = work[o + 1];
      const b = work[o + 2];
      const ci = nearestCluster(r, g, b, centers);
      const c = centers[ci];
      heights[i] = c.height;
      writeColor(colors, i, c);
      const er = r - c.r;
      const eg = g - c.g;
      const eb = b - c.b;
      add(x + 1, y, er, eg, eb, 7 / 16);
      add(x - 1, y + 1, er, eg, eb, 3 / 16);
      add(x, y + 1, er, eg, eb, 5 / 16);
      add(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
}

/**
 * The two top-surface triangle ids for grid cell (x,y). Top triangles are
 * emitted first in `triVerts`, scanned cell-major (y outer, x inner), 2 per
 * cell, so cell (x,y) owns triangles [2*q, 2*q+1] where q = y*(W-1)+x.
 */
export function gridTriangleIndexForCell(grid: HeightGrid, x: number, y: number): [number, number] {
  const quadsPerRow = grid.width - 1;
  const q = y * quadsPerRow + x;
  return [2 * q, 2 * q + 1];
}

/**
 * Build a closed, edge-manifold solid from a height grid. Triangle order:
 *   1. top surface  (cell-major, 2 tris/cell, +Z normals)
 *   2. bottom plane (cell-major, 2 tris/cell, -Z normals)
 *   3. skirt walls  (-Y, +X, +Y, -X borders), reusing the top & bottom border
 *      vertices so every border edge is shared by exactly two triangles.
 */
export function buildReliefMesh(grid: HeightGrid, opts: ReliefOptions): ReliefMesh {
  const W = grid.width;
  const H = grid.height;
  const base = opts.common.baseThickness;
  const widthMm = opts.common.widthMm;
  const heightMm = widthMm * (H / W);

  const cols = W - 1; // quad columns
  const rows = H - 1; // quad rows
  const numVert = 2 * W * H; // top grid + bottom grid
  // Tris: top (2/cell) + bottom (2/cell) + 4 walls (2/border-segment).
  const numTri = 2 * cols * rows * 2 + 4 * (cols + rows);

  const vertProperties = new Float32Array(numVert * 3);
  const triVerts = new Uint32Array(numTri * 3);

  // Position both vertex grids. World placement: centered on XY origin, Z up.
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const dx = W > 1 ? widthMm / (W - 1) : 0;
  const dy = H > 1 ? heightMm / (H - 1) : 0;
  const topBase = W * H * 3; // byte-free offset (in floats) to bottom grid

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = y * W + x;
      const px = -halfW + x * dx;
      const py = -halfH + y * dy;
      const topZ = base + grid.heights[cell];
      const t = cell * 3;
      vertProperties[t] = px;
      vertProperties[t + 1] = py;
      vertProperties[t + 2] = topZ;
      const b = topBase + cell * 3;
      vertProperties[b] = px;
      vertProperties[b + 1] = py;
      vertProperties[b + 2] = 0;
    }
  }

  const topIdx = (x: number, y: number) => y * W + x;
  const botIdx = (x: number, y: number) => W * H + y * W + x;

  let ti = 0; // running triangle-vertex write cursor (in indices)
  const tri = (a: number, b: number, c: number) => {
    triVerts[ti] = a;
    triVerts[ti + 1] = b;
    triVerts[ti + 2] = c;
    ti += 3;
  };

  // 1. Top surface — CCW seen from +Z (normals up). Cell-major to match
  //    gridTriangleIndexForCell.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = topIdx(x, y);
      const b = topIdx(x + 1, y);
      const c = topIdx(x + 1, y + 1);
      const d = topIdx(x, y + 1);
      tri(a, b, c);
      tri(a, c, d);
    }
  }

  // 2. Bottom plane at z=0 — CCW seen from -Z (normals down): reverse winding.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = botIdx(x, y);
      const b = botIdx(x + 1, y);
      const c = botIdx(x + 1, y + 1);
      const d = botIdx(x, y + 1);
      tri(a, c, b);
      tri(a, d, c);
    }
  }

  // 3. Skirt walls. Each border segment makes a quad (two top verts over two
  //    bottom verts); winding chosen so the normal points outward.
  //    -Y border (y=0): outward normal -Y.
  for (let x = 0; x < cols; x++) {
    const t0 = topIdx(x, 0);
    const t1 = topIdx(x + 1, 0);
    const b0 = botIdx(x, 0);
    const b1 = botIdx(x + 1, 0);
    tri(t0, b0, b1);
    tri(t0, b1, t1);
  }
  // +Y border (y=H-1): outward normal +Y.
  for (let x = 0; x < cols; x++) {
    const t0 = topIdx(x, H - 1);
    const t1 = topIdx(x + 1, H - 1);
    const b0 = botIdx(x, H - 1);
    const b1 = botIdx(x + 1, H - 1);
    tri(t0, t1, b1);
    tri(t0, b1, b0);
  }
  // -X border (x=0): outward normal -X.
  for (let y = 0; y < rows; y++) {
    const t0 = topIdx(0, y);
    const t1 = topIdx(0, y + 1);
    const b0 = botIdx(0, y);
    const b1 = botIdx(0, y + 1);
    tri(t0, t1, b1);
    tri(t0, b1, b0);
  }
  // +X border (x=W-1): outward normal +X.
  for (let y = 0; y < rows; y++) {
    const t0 = topIdx(W - 1, y);
    const t1 = topIdx(W - 1, y + 1);
    const b0 = botIdx(W - 1, y);
    const b1 = botIdx(W - 1, y + 1);
    tri(t0, b0, b1);
    tri(t0, b1, t1);
  }

  const watertight = isEdgeManifold(triVerts, ti / 3);

  return {
    vertProperties,
    triVerts,
    numVert,
    numTri,
    numProp: 3,
    watertight,
  };
}

/** Edge-manifold check: every undirected edge must be shared by exactly two
 *  triangles. This is exactly Manifold.ofMesh's topological precondition. */
function isEdgeManifold(triVerts: Uint32Array, numTri: number): boolean {
  const counts = new Map<number, number>();
  // Encode an undirected edge (min,max) as a single number. Vertex ids fit well
  // within 2^26 for any plausible relief, so a 2^26 multiplier stays exact in a
  // double and avoids string-key allocation per edge.
  const MUL = 1 << 26;
  const bump = (u: number, v: number) => {
    const a = u < v ? u : v;
    const b = u < v ? v : u;
    const key = a * MUL + b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let t = 0; t < numTri; t++) {
    const a = triVerts[t * 3];
    const b = triVerts[t * 3 + 1];
    const c = triVerts[t * 3 + 2];
    bump(a, b);
    bump(b, c);
    bump(c, a);
  }
  for (const count of counts.values()) {
    if (count !== 2) return false;
  }
  return true;
}

/**
 * Sample + build in one call. In `quantized` mode also returns one SeedRegion
 * per cluster listing the top-surface triangle ids of that cluster's cells
 * (color 0..1), so the caller can pre-paint the relief. Luminance/AI modes
 * return no seedRegions.
 */
export function generateRelief(image: ImageData, opts: ReliefOptions = DEFAULT_RELIEF_OPTIONS): GenerateReliefResult {
  const grid = sampleImageToGrid(image, opts);
  const mesh = buildReliefMesh(grid, opts);

  if (opts.mode !== 'quantized' || !grid.colors) {
    return { mesh, grid };
  }

  // Group cells by their representative color, then translate each cell to its
  // two top triangle ids via gridTriangleIndexForCell.
  const colors = grid.colors;
  const byColor = new Map<number, { color: [number, number, number]; triangleIds: number[] }>();
  for (let y = 0; y < grid.height - 1; y++) {
    for (let x = 0; x < grid.width - 1; x++) {
      const cell = y * grid.width + x;
      const r = colors[cell * 3];
      const g = colors[cell * 3 + 1];
      const b = colors[cell * 3 + 2];
      const key = (r << 16) | (g << 8) | b;
      let bucket = byColor.get(key);
      if (!bucket) {
        bucket = { color: [r / 255, g / 255, b / 255], triangleIds: [] };
        byColor.set(key, bucket);
      }
      const [t0, t1] = gridTriangleIndexForCell(grid, x, y);
      bucket.triangleIds.push(t0, t1);
    }
  }

  const seedRegions: SeedRegion[] = [];
  let i = 0;
  for (const bucket of byColor.values()) {
    seedRegions.push({
      color: bucket.color,
      triangleIds: bucket.triangleIds,
      name: `Region ${++i}`,
    });
  }

  return { mesh, grid, seedRegions };
}
