import type { MeshData } from '../geometry/types';
import { downloadBlob, getExportFilename, getExportTitle } from './download';
import { buildZip } from './zip';

const DEFAULT_COLOR = '#4a9eff';

/**
 * Build a vertex remap table that merges duplicate vertices into canonical indices.
 *
 * Uses merge vectors from manifold-3d (authoritative) when available, otherwise
 * falls back to quantized position dedup (same tolerance as scadToManifold.ts).
 * Returns { remap, uniquePositions }.
 */
function buildVertexRemap(meshData: MeshData) {
  const { vertProperties, numVert, numProp, mergeFromVert, mergeToVert } = meshData;

  // Union-find for vertex merging
  const parent = new Uint32Array(numVert);
  for (let i = 0; i < numVert; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Phase 1: merge vectors from manifold-3d (exact pairs)
  if (mergeFromVert && mergeToVert && mergeFromVert.length === mergeToVert.length) {
    for (let i = 0; i < mergeFromVert.length; i++) {
      union(mergeFromVert[i], mergeToVert[i]);
    }
  }

  // Phase 2: quantized position dedup as fallback (catches anything merge vectors missed,
  // or handles meshes without merge vectors like raw STL imports)
  const quantize = (v: number) => Math.round(v * 1e5);
  const posMap = new Map<string, number>();
  for (let i = 0; i < numVert; i++) {
    const x = quantize(vertProperties[i * numProp]);
    const y = quantize(vertProperties[i * numProp + 1]);
    const z = quantize(vertProperties[i * numProp + 2]);
    const key = `${x},${y},${z}`;
    const existing = posMap.get(key);
    if (existing !== undefined) {
      union(i, existing);
    } else {
      posMap.set(key, i);
    }
  }

  // Flatten: assign sequential indices to unique roots
  const rootToIndex = new Map<number, number>();
  const uniquePositions: number[] = [];
  const remap = new Uint32Array(numVert);

  for (let i = 0; i < numVert; i++) {
    const root = find(i);
    let idx = rootToIndex.get(root);
    if (idx === undefined) {
      idx = uniquePositions.length / 3;
      rootToIndex.set(root, idx);
      uniquePositions.push(
        vertProperties[root * numProp],
        vertProperties[root * numProp + 1],
        vertProperties[root * numProp + 2],
      );
    }
    remap[i] = idx;
  }

  return { remap, uniquePositions };
}

/** Round a float to 6 decimal places (float32 has ~7 significant digits). */
function f6(v: number): string {
  return v.toFixed(6);
}

export function exportOBJ(meshData: MeshData, customName?: string): void {
  const { triVerts, numTri, triColors } = meshData;
  const title = getExportTitle();

  const { remap, uniquePositions } = buildVertexRemap(meshData);

  // Build non-degenerate triangle list (filter triangles that collapsed during merge)
  const validTris: number[] = [];
  for (let t = 0; t < numTri; t++) {
    const a = remap[triVerts[t * 3]];
    const b = remap[triVerts[t * 3 + 1]];
    const c = remap[triVerts[t * 3 + 2]];
    if (a !== b && b !== c && a !== c) {
      validTris.push(t);
    }
  }

  // Detect whether we have painted triangles
  let hasColors = false;
  if (triColors) {
    const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;
    for (const t of validTris) {
      const isPainted = painted
        ? painted[t] === 1
        : (triColors[t * 3] !== 0 || triColors[t * 3 + 1] !== 0 || triColors[t * 3 + 2] !== 0);
      if (isPainted) { hasColors = true; break; }
    }
  }

  const baseName = getExportFilename('obj', customName).replace(/\.obj$/, '');
  const lines: string[] = [`# ${title}`];

  if (hasColors) {
    lines.push(`mtllib ${baseName}.mtl`);
  }

  // Vertices (deduplicated, 6 decimal places — matches float32 precision)
  const numUniqueVerts = uniquePositions.length / 3;
  for (let i = 0; i < numUniqueVerts; i++) {
    lines.push(`v ${f6(uniquePositions[i * 3])} ${f6(uniquePositions[i * 3 + 1])} ${f6(uniquePositions[i * 3 + 2])}`);
  }

  // Face format: plain "f v1 v2 v3" (1-based indices).
  // Do NOT include vn normal references — per-face normals with f v//vn cause
  // parsers to treat each (vertex, normal) pair as unique, destroying vertex
  // sharing and making the mesh non-manifold. Slicers compute normals from
  // face winding order; explicit normals are unnecessary.
  const fv = (origVert: number) => remap[origVert] + 1;

  if (hasColors && triColors) {
    const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;

    // Group valid triangles by color hex
    const colorGroups = new Map<string, number[]>();
    for (const t of validTris) {
      const isPainted = painted
        ? painted[t] === 1
        : (triColors[t * 3] !== 0 || triColors[t * 3 + 1] !== 0 || triColors[t * 3 + 2] !== 0);

      let hex: string;
      if (isPainted) {
        const r = triColors[t * 3].toString(16).padStart(2, '0');
        const g = triColors[t * 3 + 1].toString(16).padStart(2, '0');
        const b = triColors[t * 3 + 2].toString(16).padStart(2, '0');
        hex = `#${r}${g}${b}`;
      } else {
        hex = DEFAULT_COLOR;
      }

      if (!colorGroups.has(hex)) colorGroups.set(hex, []);
      colorGroups.get(hex)!.push(t);
    }

    // Faces grouped by material
    for (const [hex, tris] of colorGroups) {
      lines.push(`usemtl ${matName(hex)}`);
      for (const t of tris) {
        lines.push(`f ${fv(triVerts[t * 3])} ${fv(triVerts[t * 3 + 1])} ${fv(triVerts[t * 3 + 2])}`);
      }
    }

    // Generate MTL file
    const mtlLines: string[] = [`# ${title} — Materials`];
    for (const hex of colorGroups.keys()) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      mtlLines.push(`newmtl ${matName(hex)}`);
      mtlLines.push(`Kd ${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`);
      mtlLines.push(`Ka 0.100000 0.100000 0.100000`);
      mtlLines.push(`Ks 0.300000 0.300000 0.300000`);
      mtlLines.push(`Ns 40.000000`);
      mtlLines.push(`d 1.000000`);
      mtlLines.push('');
    }

    // Bundle OBJ + MTL in a ZIP
    const enc = new TextEncoder();
    const zip = buildZip([
      { name: `${baseName}.obj`, data: enc.encode(lines.join('\n')) },
      { name: `${baseName}.mtl`, data: enc.encode(mtlLines.join('\n')) },
    ]);

    const blob = new Blob([zip], { type: 'application/zip' });
    downloadBlob(blob, `${baseName}.zip`);
  } else {
    // No colors — plain OBJ
    for (const t of validTris) {
      lines.push(`f ${fv(triVerts[t * 3])} ${fv(triVerts[t * 3 + 1])} ${fv(triVerts[t * 3 + 2])}`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    downloadBlob(blob, getExportFilename('obj', customName));
  }
}

function matName(hex: string): string {
  return hex === DEFAULT_COLOR ? 'Default' : `Color_${hex.slice(1)}`;
}
