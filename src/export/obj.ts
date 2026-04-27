import type { MeshData } from '../geometry/types';
import { downloadBlob, getExportFilename, getExportTitle } from './download';
import { buildZip } from './zip';

const DEFAULT_COLOR = '#4a9eff';

export function exportOBJ(meshData: MeshData, customName?: string): void {
  const { vertProperties, triVerts, numVert, numTri, numProp, triColors } = meshData;
  const title = getExportTitle();

  // --- Vertex deduplication ---
  // manifold-3d getMesh() duplicates vertices at property boundaries (numPropVert >= numVert).
  // In OBJ (an indexed format), two triangles sharing a physical edge must reference the same
  // vertex index — otherwise slicers flag the edge as non-manifold. Merge vertices by position.
  const posToIndex = new Map<string, number>();
  const uniquePositions: number[] = []; // flat xyz
  const vertRemap = new Uint32Array(numVert); // old index -> merged index

  for (let i = 0; i < numVert; i++) {
    const x = vertProperties[i * numProp];
    const y = vertProperties[i * numProp + 1];
    const z = vertProperties[i * numProp + 2];
    const key = `${x},${y},${z}`;
    const existing = posToIndex.get(key);
    if (existing !== undefined) {
      vertRemap[i] = existing;
    } else {
      const idx = uniquePositions.length / 3;
      posToIndex.set(key, idx);
      uniquePositions.push(x, y, z);
      vertRemap[i] = idx;
    }
  }

  // Detect whether we have painted triangles
  let hasColors = false;
  if (triColors) {
    const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;
    for (let t = 0; t < numTri; t++) {
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

  // Vertices (deduplicated)
  const numUniqueVerts = uniquePositions.length / 3;
  for (let i = 0; i < numUniqueVerts; i++) {
    lines.push(`v ${uniquePositions[i * 3]} ${uniquePositions[i * 3 + 1]} ${uniquePositions[i * 3 + 2]}`);
  }

  // Face normals (one per triangle, computed via cross product)
  for (let t = 0; t < numTri; t++) {
    const i0 = triVerts[t * 3];
    const i1 = triVerts[t * 3 + 1];
    const i2 = triVerts[t * 3 + 2];

    const v0x = vertProperties[i0 * numProp],     v0y = vertProperties[i0 * numProp + 1], v0z = vertProperties[i0 * numProp + 2];
    const v1x = vertProperties[i1 * numProp],     v1y = vertProperties[i1 * numProp + 1], v1z = vertProperties[i1 * numProp + 2];
    const v2x = vertProperties[i2 * numProp],     v2y = vertProperties[i2 * numProp + 1], v2z = vertProperties[i2 * numProp + 2];

    const ax = v1x - v0x, ay = v1y - v0y, az = v1z - v0z;
    const bx = v2x - v0x, by = v2y - v0y, bz = v2z - v0z;
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;

    lines.push(`vn ${nx} ${ny} ${nz}`);
  }

  // Helper to format a face vertex as "vertIdx//normalIdx" (both 1-based)
  const fv = (origVert: number, normalIdx1: number) =>
    `${vertRemap[origVert] + 1}//${normalIdx1}`;

  if (hasColors && triColors) {
    const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;

    // Group triangles by color hex
    const colorGroups = new Map<string, number[]>();
    for (let t = 0; t < numTri; t++) {
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
        const n1 = t + 1; // normal index (1-based, one normal per triangle)
        lines.push(`f ${fv(triVerts[t * 3], n1)} ${fv(triVerts[t * 3 + 1], n1)} ${fv(triVerts[t * 3 + 2], n1)}`);
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

    // Bundle OBJ + MTL in a ZIP for single-file download
    const enc = new TextEncoder();
    const zip = buildZip([
      { name: `${baseName}.obj`, data: enc.encode(lines.join('\n')) },
      { name: `${baseName}.mtl`, data: enc.encode(mtlLines.join('\n')) },
    ]);

    const blob = new Blob([zip], { type: 'application/zip' });
    downloadBlob(blob, `${baseName}.zip`);
  } else {
    // No colors — plain OBJ with normals
    for (let t = 0; t < numTri; t++) {
      const n1 = t + 1;
      lines.push(`f ${fv(triVerts[t * 3], n1)} ${fv(triVerts[t * 3 + 1], n1)} ${fv(triVerts[t * 3 + 2], n1)}`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    downloadBlob(blob, getExportFilename('obj', customName));
  }
}

function matName(hex: string): string {
  return hex === DEFAULT_COLOR ? 'Default' : `Color_${hex.slice(1)}`;
}
