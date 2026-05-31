// Image projection onto mesh triangles — planar projection from a chosen axis.
// The image is preprocessed (brightness/contrast/saturation/levels) and
// optionally background-masked before sampling. Returns per-triangle colors
// as a Map and a compact serializable entry array for the descriptor.

import type { MeshData } from '../geometry/types';
import type { PreprocessOptions } from '../relief/types';
import { preprocessRgb, detectBackgroundMask, bgMaskFromColor } from '../relief/imageToRelief';

export type ProjectionAxis = 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left';

export interface ImagePaintOptions {
  axis: ProjectionAxis;
  preprocess: PreprocessOptions;
  removeBackground: boolean;
  manualBgColor?: [number, number, number]; // 0-255
  bgTolerance: number; // sum-of-squared-dist threshold, default 36*36*3
}

export interface ImagePaintResult {
  /** Per-triangle colors: tri index → [r, g, b] in 0–1 range */
  perTriColors: Map<number, [number, number, number]>;
  /** Average color across painted triangles, 0–1 */
  avgColor: [number, number, number];
  /** Serializable: flat [triIdx, r, g, b, …] with r/g/b in 0–255 */
  entries: number[];
}

/** Project an image onto the mesh from `opts.axis` direction.
 *  Only front-facing triangles (facing toward the projection source) are painted.
 *  Returns per-triangle colors sampled from the preprocessed + masked image. */
export function projectImageOntoMesh(
  mesh: MeshData,
  imageData: ImageData,
  opts: ImagePaintOptions,
): ImagePaintResult {
  const { numTri, numProp, vertProperties, triVerts } = mesh;
  const { axis, preprocess, removeBackground, manualBgColor, bgTolerance } = opts;

  const imgW = imageData.width;
  const imgH = imageData.height;
  const pixelCount = imgW * imgH;

  // Copy image pixels into Float32 RGB (0–255) and preprocess
  const rgb = new Float32Array(pixelCount * 3);
  const src = imageData.data;
  for (let i = 0; i < pixelCount; i++) {
    rgb[i * 3]     = src[i * 4];
    rgb[i * 3 + 1] = src[i * 4 + 1];
    rgb[i * 3 + 2] = src[i * 4 + 2];
  }
  preprocessRgb(rgb, imgW, imgH, preprocess);

  // Build background mask if requested
  let bgMask: Uint8Array | null = null;
  if (removeBackground) {
    const colorsU8 = new Uint8Array(pixelCount * 3);
    for (let i = 0; i < pixelCount * 3; i++) colorsU8[i] = clamp255(rgb[i]);
    bgMask = manualBgColor
      ? bgMaskFromColor(colorsU8, imgW, imgH, manualBgColor, bgTolerance)
      : detectBackgroundMask(colorsU8, imgW, imgH);
  }

  // Mesh bounding box for UV normalization
  const bounds = computeBounds(mesh);

  const perTriColors = new Map<number, [number, number, number]>();
  const entries: number[] = [];
  let sumR = 0, sumG = 0, sumB = 0, paintedCount = 0;

  for (let t = 0; t < numTri; t++) {
    const v0 = triVerts[t * 3];
    const v1 = triVerts[t * 3 + 1];
    const v2 = triVerts[t * 3 + 2];

    const x0 = vertProperties[v0 * numProp], y0 = vertProperties[v0 * numProp + 1], z0 = vertProperties[v0 * numProp + 2];
    const x1 = vertProperties[v1 * numProp], y1 = vertProperties[v1 * numProp + 1], z1 = vertProperties[v1 * numProp + 2];
    const x2 = vertProperties[v2 * numProp], y2 = vertProperties[v2 * numProp + 1], z2 = vertProperties[v2 * numProp + 2];

    // Skip back-facing triangles (dot product of face normal with projection direction ≤ 0)
    const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0;
    const fx = x2 - x0, fy = y2 - y0, fz = z2 - z0;
    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;
    if (faceNormalDot(nx, ny, nz, axis) <= 0) continue;

    // Triangle centroid → UV
    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    const cz = (z0 + z1 + z2) / 3;
    const [u, v] = projectToUV(cx, cy, cz, axis, bounds);
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;

    // Nearest-neighbor sample: image V is canvas-top-down, world V is bottom-up
    const px = Math.max(0, Math.min(imgW - 1, Math.floor(u * imgW)));
    const py = Math.max(0, Math.min(imgH - 1, Math.floor((1 - v) * imgH)));
    const pidx = py * imgW + px;

    if (bgMask && bgMask[pidx] === 0) continue;

    const r = clamp255(rgb[pidx * 3]);
    const g = clamp255(rgb[pidx * 3 + 1]);
    const b = clamp255(rgb[pidx * 3 + 2]);

    const color: [number, number, number] = [r / 255, g / 255, b / 255];
    perTriColors.set(t, color);
    entries.push(t, r, g, b);
    sumR += r; sumG += g; sumB += b;
    paintedCount++;
  }

  const avgColor: [number, number, number] = paintedCount > 0
    ? [sumR / paintedCount / 255, sumG / paintedCount / 255, sumB / paintedCount / 255]
    : [0.5, 0.5, 0.5];

  return { perTriColors, avgColor, entries };
}

/** Reconstruct perTriColors from a stored entries array, expanding via
 *  parentToChildren if the mesh was subdivided since projection. */
export function entriesToPerTriColors(
  entries: number[],
  parentToChildren: Map<number, number[]> | null,
): { triangles: Set<number>; perTriColors: Map<number, [number, number, number]> } {
  const triangles = new Set<number>();
  const perTriColors = new Map<number, [number, number, number]>();

  for (let i = 0; i < entries.length; i += 4) {
    const baseTri = entries[i];
    const color: [number, number, number] = [entries[i + 1] / 255, entries[i + 2] / 255, entries[i + 3] / 255];

    if (parentToChildren) {
      const children = parentToChildren.get(baseTri);
      if (children) {
        for (const child of children) {
          triangles.add(child);
          perTriColors.set(child, color);
        }
        continue;
      }
    }
    triangles.add(baseTri);
    perTriColors.set(baseTri, color);
  }

  return { triangles, perTriColors };
}

/** Remap perTriColors through a parentToChildren map (for mesh subdivision). */
export function remapPerTriColors(
  perTriColors: Map<number, [number, number, number]> | undefined,
  parentToChildren: Map<number, number[]> | null,
): Map<number, [number, number, number]> | undefined {
  if (!perTriColors || !parentToChildren) return perTriColors;
  const out = new Map<number, [number, number, number]>();
  for (const [parent, color] of perTriColors) {
    const children = parentToChildren.get(parent);
    if (children) {
      for (const child of children) out.set(child, color);
    } else {
      out.set(parent, color);
    }
  }
  return out;
}

/** Load ImageData from a data URL (async — requires a browser Document). */
export function loadImageDataFromUrl(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D not available')); return; }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src.startsWith('blob:') ? img.src : '');
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/** Scale an ImageData so its longer dimension ≤ maxDim. */
export function resizeImageData(imageData: ImageData, maxDim: number): ImageData {
  const { width, height } = imageData;
  if (width <= maxDim && height <= maxDim) return imageData;
  const scale = maxDim / Math.max(width, height);
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));
  const src = document.createElement('canvas');
  src.width = width; src.height = height;
  const sCtx = src.getContext('2d')!;
  sCtx.putImageData(imageData, 0, 0);
  const dst = document.createElement('canvas');
  dst.width = dw; dst.height = dh;
  const dCtx = dst.getContext('2d')!;
  dCtx.drawImage(src, 0, 0, dw, dh);
  return dCtx.getImageData(0, 0, dw, dh);
}

/** Convert an ImageData to a JPEG data URL at the given quality. */
export function imageDataToDataUrl(imageData: ImageData, quality = 0.75): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Return default no-op preprocess options. */
export function defaultPreprocess(): PreprocessOptions {
  return { brightness: 0, contrast: 0, saturation: 0, levelsLow: 0, levelsHigh: 255 };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface Bounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function computeBounds(mesh: MeshData): Bounds {
  const { numVert, numProp, vertProperties } = mesh;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let v = 0; v < numVert; v++) {
    const x = vertProperties[v * numProp];
    const y = vertProperties[v * numProp + 1];
    const z = vertProperties[v * numProp + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function normalize(v: number, lo: number, hi: number): number {
  return hi > lo ? (v - lo) / (hi - lo) : 0.5;
}

/** Map a world-space centroid to UV [0,1]×[0,1] for the given projection axis.
 *  The image is stretched to fill the model's bounding box in the two axes
 *  that are perpendicular to the projection direction. */
function projectToUV(
  cx: number, cy: number, cz: number,
  axis: ProjectionAxis,
  b: Bounds,
): [number, number] {
  switch (axis) {
    case 'top':    return [normalize(cx, b.minX, b.maxX), normalize(cy, b.minY, b.maxY)];
    case 'bottom': return [normalize(b.maxX - cx + b.minX, b.minX, b.maxX), normalize(cy, b.minY, b.maxY)];
    case 'front':  return [normalize(cx, b.minX, b.maxX), normalize(cz, b.minZ, b.maxZ)];
    case 'back':   return [normalize(b.maxX - cx + b.minX, b.minX, b.maxX), normalize(cz, b.minZ, b.maxZ)];
    case 'right':  return [normalize(b.maxY - cy + b.minY, b.minY, b.maxY), normalize(cz, b.minZ, b.maxZ)];
    case 'left':   return [normalize(cy, b.minY, b.maxY), normalize(cz, b.minZ, b.maxZ)];
  }
}

/** Dot product of the face normal with the incoming projection ray.
 *  Positive ⟹ the face is visible from the projection source. */
function faceNormalDot(nx: number, ny: number, nz: number, axis: ProjectionAxis): number {
  switch (axis) {
    case 'top':    return nz;
    case 'bottom': return -nz;
    case 'front':  return -ny;
    case 'back':   return ny;
    case 'right':  return nx;
    case 'left':   return -nx;
  }
}

function clamp255(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}
