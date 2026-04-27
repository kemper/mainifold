import type { MeshData } from '../geometry/types';
import { get3MFUnitString } from '../geometry/units';
import { downloadBlob, getExportFilename, getExportTitle } from './download';
import { buildZip } from './zip';

export function export3MF(meshData: MeshData, customName?: string): void {
  const { vertProperties, triVerts, numVert, numTri, numProp, triColors } = meshData;

  // Build vertices XML
  const vertices: string[] = [];
  for (let i = 0; i < numVert; i++) {
    const x = vertProperties[i * numProp];
    const y = vertProperties[i * numProp + 1];
    const z = vertProperties[i * numProp + 2];
    vertices.push(`          <vertex x="${x}" y="${y}" z="${z}" />`);
  }

  // Collect distinct colors for basematerials (if triColors present)
  // Index 0 is always the default base color for unpainted triangles
  const DEFAULT_COLOR = '#4a9eff';
  const colorMap = new Map<string, number>(); // hex -> material index
  const materialColors: string[] = [];
  let hasColors = false;

  if (triColors) {
    // Reserve index 0 for the default color
    colorMap.set(DEFAULT_COLOR, 0);
    materialColors.push(DEFAULT_COLOR);

    const painted = (triColors as Uint8Array & { _painted?: Uint8Array })._painted;
    for (let t = 0; t < numTri; t++) {
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

  // Build triangles XML — when colors exist, every triangle gets a pid
  const triangles: string[] = [];
  for (let t = 0; t < numTri; t++) {
    const v1 = triVerts[t * 3];
    const v2 = triVerts[t * 3 + 1];
    const v3 = triVerts[t * 3 + 2];

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
        // Unpainted triangles get the default base color
        triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="2" p1="0" />`);
      }
    } else {
      triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }
  }

  // Build basematerials XML block
  let basematerialsXml = '';
  if (hasColors) {
    const bases = materialColors.map((hex, i) =>
      `      <base name="${i === 0 ? 'Default' : 'Color ' + i}" displaycolor="${hex}" />`
    ).join('\n');
    basematerialsXml = `
    <basematerials id="2">
${bases}
    </basematerials>`;
  }

  // Escape XML special chars in title
  const title = getExportTitle().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Add materials namespace if colors present
  const nsAttr = hasColors ? ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"' : '';

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${get3MFUnitString()}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${nsAttr}>
  <metadata name="Title">${title}</metadata>
  <metadata name="Application">Partwright</metadata>
  <resources>${basematerialsXml}
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

