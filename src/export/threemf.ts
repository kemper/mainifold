import type { MeshData } from '../geometry/types';
import { get3MFUnitString } from '../geometry/units';
import { downloadBlob, getExportFilename, getExportTitle } from './download';
import { buildZip } from './zip';
import { cleanMeshForExport } from './meshClean';

export function export3MF(meshData: MeshData, customName?: string): void {
  const { triVerts, triColors } = meshData;

  // Deduplicate vertices and filter degenerate triangles (same as OBJ export)
  const { remap, uniquePositions, validTris } = cleanMeshForExport(meshData);

  // Build vertices XML (deduplicated, 6dp precision)
  const numUniqueVerts = uniquePositions.length / 3;
  const vertices: string[] = [];
  for (let i = 0; i < numUniqueVerts; i++) {
    const x = uniquePositions[i * 3].toFixed(6);
    const y = uniquePositions[i * 3 + 1].toFixed(6);
    const z = uniquePositions[i * 3 + 2].toFixed(6);
    vertices.push(`          <vertex x="${x}" y="${y}" z="${z}" />`);
  }

  // Collect distinct colors for basematerials (if triColors present)
  const DEFAULT_COLOR = '#4a9eff';
  const colorMap = new Map<string, number>();
  const materialColors: string[] = [];
  let hasColors = false;

  if (triColors) {
    colorMap.set(DEFAULT_COLOR, 0);
    materialColors.push(DEFAULT_COLOR);

    const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;
    for (const t of validTris) {
      const isPainted = painted ? painted[t] === 1 : (triColors[t * 3] !== 0 || triColors[t * 3 + 1] !== 0 || triColors[t * 3 + 2] !== 0);
      if (!isPainted) continue;

      const r = triColors[t * 3].toString(16).padStart(2, '0');
      const g = triColors[t * 3 + 1].toString(16).padStart(2, '0');
      const b = triColors[t * 3 + 2].toString(16).padStart(2, '0');
      const hex = `#${r}${g}${b}`;
      if (!colorMap.has(hex)) {
        colorMap.set(hex, materialColors.length);
        materialColors.push(hex);
      }
      hasColors = true;
    }
  }

  // Build triangles XML (using remapped vertex indices, filtered for degenerates)
  const triangles: string[] = [];
  for (const t of validTris) {
    const v1 = remap[triVerts[t * 3]];
    const v2 = remap[triVerts[t * 3 + 1]];
    const v3 = remap[triVerts[t * 3 + 2]];

    if (hasColors && triColors) {
      const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;
      const isPainted = painted ? painted[t] === 1 : (triColors[t * 3] !== 0 || triColors[t * 3 + 1] !== 0 || triColors[t * 3 + 2] !== 0);
      if (isPainted) {
        const r = triColors[t * 3].toString(16).padStart(2, '0');
        const g = triColors[t * 3 + 1].toString(16).padStart(2, '0');
        const b = triColors[t * 3 + 2].toString(16).padStart(2, '0');
        const hex = `#${r}${g}${b}`;
        const matIdx = colorMap.get(hex)!;
        triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="2" p1="${matIdx}" />`);
      } else {
        triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="2" p1="0" />`);
      }
    } else {
      triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }
  }

  // Build colorgroup XML block (Bambu Studio requires m:colorgroup, not basematerials)
  let colorgroupXml = '';
  if (hasColors) {
    const colors = materialColors.map(hex =>
      `      <m:color color="${hex.toUpperCase()}FF" />`
    ).join('\n');
    colorgroupXml = `
    <m:colorgroup id="2">
${colors}
    </m:colorgroup>`;
  }

  // Escape XML special chars in title
  const title = getExportTitle().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Add materials namespace if colors present
  const nsAttr = hasColors ? ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"' : '';

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${get3MFUnitString()}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${nsAttr}>
  <metadata name="Title">${title}</metadata>
  <metadata name="Application">Partwright</metadata>
  <resources>${colorgroupXml}
    <object id="1" type="model"${hasColors ? ' pid="2" pindex="0"' : ''}>
      <mesh>
        <vertices>
${vertices.join('\n')}
        </vertices>
        <triangles>
${triangles.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  // Build ZIP (3MF is a ZIP archive)
  const zip = buildZip([
    { name: '[Content_Types].xml', data: new TextEncoder().encode(contentTypesXml) },
    { name: '_rels/.rels', data: new TextEncoder().encode(relsXml) },
    { name: '3D/3dmodel.model', data: new TextEncoder().encode(modelXml) },
  ]);

  const blob = new Blob([zip], { type: 'application/vnd.ms-package.3dmanufacturing' });
  downloadBlob(blob, getExportFilename('3mf', customName));
}

