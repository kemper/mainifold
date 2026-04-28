import type { MeshData } from '../geometry/types';
import { downloadBlob, getExportFilename, getExportTitle } from './download';
import { buildZip } from './zip';
import { cleanMeshForExport } from './meshClean';

const DEFAULT_COLOR_HEX = '#4a9eff';
const DEFAULT_COLOR_RGB = [0.290196, 0.619608, 1.0] as const;

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

  const numUniqueVerts = uniquePositions.length / 3;
  const fv = (origVert: number) => remap[origVert] + 1;

  if (hasColors && triColors) {
    const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;

    lines.push(`mtllib ${baseName}.mtl`);

    // Assign per-vertex colors for Bambu Studio (v x y z r g b format).
    // Colors are per-triangle, so shared vertices pick the first triangle's color.
    const vertColor = new Float32Array(numUniqueVerts * 3);
    const vertColorSet = new Uint8Array(numUniqueVerts); // 0 = not yet assigned

    for (const t of validTris) {
      const isPainted = painted
        ? painted[t] === 1
        : (triColors[t * 3] !== 0 || triColors[t * 3 + 1] !== 0 || triColors[t * 3 + 2] !== 0);

      const r = isPainted ? triColors[t * 3] / 255 : DEFAULT_COLOR_RGB[0];
      const g = isPainted ? triColors[t * 3 + 1] / 255 : DEFAULT_COLOR_RGB[1];
      const b = isPainted ? triColors[t * 3 + 2] / 255 : DEFAULT_COLOR_RGB[2];

      for (let vi = 0; vi < 3; vi++) {
        const idx = remap[triVerts[t * 3 + vi]];
        if (!vertColorSet[idx]) {
          vertColor[idx * 3] = r;
          vertColor[idx * 3 + 1] = g;
          vertColor[idx * 3 + 2] = b;
          vertColorSet[idx] = 1;
        }
      }
    }

    // Write vertices with colors (v x y z r g b)
    for (let i = 0; i < numUniqueVerts; i++) {
      const x = f6(uniquePositions[i * 3]);
      const y = f6(uniquePositions[i * 3 + 1]);
      const z = f6(uniquePositions[i * 3 + 2]);
      const r = f6(vertColorSet[i] ? vertColor[i * 3] : DEFAULT_COLOR_RGB[0]);
      const g = f6(vertColorSet[i] ? vertColor[i * 3 + 1] : DEFAULT_COLOR_RGB[1]);
      const b = f6(vertColorSet[i] ? vertColor[i * 3 + 2] : DEFAULT_COLOR_RGB[2]);
      lines.push(`v ${x} ${y} ${z} ${r} ${g} ${b}`);
    }

    // Group triangles by color hex for usemtl (Blender/other tools)
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
        hex = DEFAULT_COLOR_HEX;
      }

      if (!colorGroups.has(hex)) colorGroups.set(hex, []);
      colorGroups.get(hex)!.push(t);
    }

    // Faces grouped by usemtl (Bambu Studio does NOT split mesh by usemtl —
    // it uses face ranges as color metadata on a unified mesh)
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
    for (let i = 0; i < numUniqueVerts; i++) {
      lines.push(`v ${f6(uniquePositions[i * 3])} ${f6(uniquePositions[i * 3 + 1])} ${f6(uniquePositions[i * 3 + 2])}`);
    }

    for (const t of validTris) {
      lines.push(`f ${fv(triVerts[t * 3])} ${fv(triVerts[t * 3 + 1])} ${fv(triVerts[t * 3 + 2])}`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    downloadBlob(blob, getExportFilename('obj', customName));
  }
}

function matName(hex: string): string {
  return hex === DEFAULT_COLOR_HEX ? 'Default' : `Color_${hex.slice(1)}`;
}
