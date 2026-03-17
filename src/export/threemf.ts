import type { MeshData } from '../geometry/types';
import { get3MFUnitString } from '../geometry/units';

export function export3MF(meshData: MeshData): void {
  const { vertProperties, triVerts, numVert, numTri, numProp } = meshData;

  // Build vertices XML
  const vertices: string[] = [];
  for (let i = 0; i < numVert; i++) {
    const x = vertProperties[i * numProp];
    const y = vertProperties[i * numProp + 1];
    const z = vertProperties[i * numProp + 2];
    vertices.push(`          <vertex x="${x}" y="${y}" z="${z}" />`);
  }

  // Build triangles XML
  const triangles: string[] = [];
  for (let t = 0; t < numTri; t++) {
    const v1 = triVerts[t * 3];
    const v2 = triVerts[t * 3 + 1];
    const v3 = triVerts[t * 3 + 2];
    triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
  }

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${get3MFUnitString()}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'model.3mf';
  a.click();
  URL.revokeObjectURL(url);
}

// Minimal ZIP builder — no compression (STORE method), sufficient for 3MF
interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);

    // Local file header (30 + name + data)
    const local = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(local);
    lv.setUint32(0, 0x04034b50, true);  // signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // compression: STORE
    lv.setUint16(10, 0, true);           // mod time
    lv.setUint16(12, 0, true);           // mod date
    lv.setUint32(14, crc, true);         // crc32
    lv.setUint32(18, entry.data.length, true); // compressed size
    lv.setUint32(22, entry.data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);  // name length
    lv.setUint16(28, 0, true);           // extra length
    new Uint8Array(local).set(nameBytes, 30);

    localHeaders.push(new Uint8Array(local));
    localHeaders.push(entry.data);

    // Central directory header (46 + name)
    const central = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(central);
    cv.setUint32(0, 0x02014b50, true);   // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // compression: STORE
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0, true);            // mod date
    cv.setUint32(16, crc, true);          // crc32
    cv.setUint32(20, entry.data.length, true); // compressed size
    cv.setUint32(24, entry.data.length, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true);  // name length
    cv.setUint16(30, 0, true);            // extra length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk number
    cv.setUint16(36, 0, true);            // internal attrs
    cv.setUint32(38, 0, true);            // external attrs
    cv.setUint32(42, offset, true);       // local header offset
    new Uint8Array(central).set(nameBytes, 46);

    centralHeaders.push(new Uint8Array(central));
    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) centralDirSize += h.length;

  // End of central directory (22 bytes)
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);     // signature
  ev.setUint16(4, 0, true);               // disk number
  ev.setUint16(6, 0, true);               // central dir disk
  ev.setUint16(8, entries.length, true);   // entries on disk
  ev.setUint16(10, entries.length, true);  // total entries
  ev.setUint32(12, centralDirSize, true);  // central dir size
  ev.setUint32(16, centralDirOffset, true); // central dir offset
  ev.setUint16(20, 0, true);              // comment length

  const totalSize = offset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const h of localHeaders) { result.set(h, pos); pos += h.length; }
  for (const h of centralHeaders) { result.set(h, pos); pos += h.length; }
  result.set(new Uint8Array(eocd), pos);

  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
