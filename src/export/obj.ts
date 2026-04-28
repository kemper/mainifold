import type { MeshData } from '../geometry/types';
import { downloadBlob, getExportFilename, getExportTitle } from './download';
import { buildZip } from './zip';
import { cleanMeshForExport } from './meshClean';

const DEFAULT_COLOR = '#4a9eff';

/** Round a float to 6 decimal places (float32 has ~7 significant digits). */
function f6(v: number): string {
  return v.toFixed(6);
}

export function exportOBJ(meshData: MeshData, customName?: string): void {
  const { triVerts, triColors } = meshData;
  const title = getExportTitle();

  const { remap, uniquePositions, validTris } = cleanMeshForExport(meshData);

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

    // Collect unique colors for the MTL file
    const colorSet = new Map<string, number[]>(); // hex -> triangle indices
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

      if (!colorSet.has(hex)) colorSet.set(hex, []);
      colorSet.get(hex)!.push(t);
    }

    // Write ALL faces as a single object — do NOT group by usemtl.
    // Slicers like Bambu Studio treat each usemtl group as a separate
    // shell/part that must be independently manifold. Since our color
    // regions are surface patches (not closed solids), grouping by material
    // creates non-manifold boundary edges at every color boundary.
    for (const t of validTris) {
      lines.push(`f ${fv(triVerts[t * 3])} ${fv(triVerts[t * 3 + 1])} ${fv(triVerts[t * 3 + 2])}`);
    }

    // Generate MTL file as a color reference (usable by Blender and similar tools)
    const mtlLines: string[] = [`# ${title} — Materials`];
    for (const hex of colorSet.keys()) {
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

    // Bundle OBJ + MTL in a ZIP (MTL for reference; OBJ is slicer-clean)
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
