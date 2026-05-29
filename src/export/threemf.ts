import type { MeshData } from '../geometry/types';
import { get3MFUnitString } from '../geometry/units';
import { downloadBlob, getExportFilename, getExportTitle } from './download';
import type { BuiltExport } from './gltf';
import { buildZip } from './zip';
import { assertFiniteMesh, cleanMeshForExport, DEFAULT_COLOR_HEX, triColorHex, hasAnyPainted } from './meshClean';

/** Escape XML special chars for attribute values / text content. */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface ModelXmlResult {
  /** The full 3D/3dmodel.model XML — identical for the standard and Bambu writers. */
  modelXml: string;
  /** Distinct material colors in m:colorgroup order ('#rrggbb', lowercase). The
   *  index is the filament/extruder slot each triangle's `p1` points at. Empty
   *  when the model has no painted regions (a single uncolored object). */
  materialColors: string[];
}

/** Build the shared 3dmodel.model XML (vertices, triangles, optional
 *  m:colorgroup). Used verbatim by both {@link build3MF} (standard/portable)
 *  and {@link build3MFBambu} (which wraps the same model in Bambu project
 *  metadata). */
function buildModelXml(meshData: MeshData): ModelXmlResult {
  const { triVerts, triColors } = meshData;

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

  // Collect distinct colors for m:colorgroup
  const hasColors = triColors != null && hasAnyPainted(triColors, validTris);
  const colorMap = new Map<string, number>(); // hex -> material index
  const materialColors: string[] = [];

  if (hasColors && triColors) {
    colorMap.set(DEFAULT_COLOR_HEX, 0);
    materialColors.push(DEFAULT_COLOR_HEX);

    for (const t of validTris) {
      const hex = triColorHex(triColors, t);
      if (hex !== DEFAULT_COLOR_HEX && !colorMap.has(hex)) {
        colorMap.set(hex, materialColors.length);
        materialColors.push(hex);
      }
    }
  }

  // Build triangles XML (remapped vertex indices, filtered for degenerates)
  const triangles: string[] = [];
  for (const t of validTris) {
    const v1 = remap[triVerts[t * 3]];
    const v2 = remap[triVerts[t * 3 + 1]];
    const v3 = remap[triVerts[t * 3 + 2]];

    if (hasColors && triColors) {
      const hex = triColorHex(triColors, t);
      const matIdx = colorMap.get(hex) ?? 0;
      triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="2" p1="${matIdx}" />`);
    } else {
      triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }
  }

  // Build m:colorgroup XML block
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

  const title = escapeXml(getExportTitle());

  const nsAttr = hasColors ? ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"' : '';

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${get3MFUnitString()}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${nsAttr}>
  <metadata name="Title">${title}</metadata>
  <metadata name="Application">Partwright (https://www.partwrightstudio.com)</metadata>
  <metadata name="Designer">Partwright</metadata>
  <metadata name="LicenseTerms">Created with Partwright — https://www.partwrightstudio.com</metadata>
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

  return { modelXml, materialColors };
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

const MIME_3MF = 'application/vnd.ms-package.3dmanufacturing';

/** Build a standard, portable 3MF export blob (no download). Geometry plus
 *  native color via the Microsoft material `m:colorgroup` extension — imports
 *  cleanly into Bambu Studio, OrcaSlicer, PrusaSlicer, etc. The 3MF format has
 *  no concept of filament *type*, so a slicer assigns each color a filament by
 *  its own rules (Bambu nearest-color-matches your existing presets, which is
 *  why types come in mixed). Use {@link build3MFBambu} for a Bambu project file
 *  that pins every filament to PLA. */
export function build3MF(meshData: MeshData, customName?: string): BuiltExport {
  assertFiniteMesh(meshData);
  const { modelXml } = buildModelXml(meshData);

  const enc = new TextEncoder();
  const zip = buildZip([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: enc.encode(RELS_XML) },
    { name: '3D/3dmodel.model', data: enc.encode(modelXml) },
  ]);

  const blob = new Blob([zip], { type: MIME_3MF });
  return { blob, filename: getExportFilename('3mf', customName), mimeType: MIME_3MF };
}

export function export3MF(meshData: MeshData, customName?: string): string {
  const built = build3MF(meshData, customName);
  downloadBlob(built.blob, built.filename, '3MF');
  return built.filename;
}

// --- Bambu Studio project variant ------------------------------------------
//
// A standard 3MF carries colors but no filament *type*, so Bambu Studio (and
// OrcaSlicer) infer a type per color by nearest-color matching against the
// user's existing filament presets — which yields a mix of PLA / ABS / etc.
// To force every color to import as PLA we additionally write Bambu's own
// project metadata (Metadata/project_settings.config). Its presence makes Bambu
// treat the file as a project and load the declared filaments directly, instead
// of guessing types by color. We declare one Generic PLA filament per
// m:colorgroup color, in the same order, so each painted color comes in as a
// PLA filament of that exact color. Only filament keys are written — no printer
// or process settings — so opening the file can't clobber the machine setup.

const BAMBU_GENERIC_PLA_ID = 'GFL99';      // Bambu/Orca "Generic PLA" filament_id
const BAMBU_GENERIC_PLA_NAME = 'Generic PLA';

/** project_settings.config wants 6-digit uppercase '#RRGGBB'; our material
 *  hexes are already '#rrggbb'. */
function toBambuFilamentColour(hex: string): string {
  return hex.toUpperCase();
}

/** The Bambu project filament declaration: parallel arrays, one entry per
 *  colorgroup color, every entry typed PLA. An uncolored model still gets a
 *  single PLA filament so the whole part prints in PLA. */
function buildBambuProjectConfig(materialColors: string[]): string {
  const colors = materialColors.length > 0 ? materialColors : [DEFAULT_COLOR_HEX];
  const n = colors.length;
  const config = {
    filament_colour: colors.map(toBambuFilamentColour),
    filament_type: Array.from({ length: n }, () => 'PLA'),
    filament_ids: Array.from({ length: n }, () => BAMBU_GENERIC_PLA_ID),
    filament_settings_id: Array.from({ length: n }, () => BAMBU_GENERIC_PLA_NAME),
  };
  return JSON.stringify(config, null, 4);
}

/** Build a Bambu-Studio-flavored 3MF (no download): the same mesh + colorgroup
 *  as {@link build3MF}, plus Bambu project metadata declaring every filament as
 *  Generic PLA. Bambu imports all colors typed PLA (no ABS); the file still
 *  opens in OrcaSlicer / PrusaSlicer, which read the standard mesh + colorgroup
 *  and ignore the Bambu-specific config. */
export function build3MFBambu(meshData: MeshData, customName?: string): BuiltExport {
  assertFiniteMesh(meshData);
  const { modelXml, materialColors } = buildModelXml(meshData);

  const enc = new TextEncoder();
  const zip = buildZip([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: enc.encode(RELS_XML) },
    { name: '3D/3dmodel.model', data: enc.encode(modelXml) },
    { name: 'Metadata/project_settings.config', data: enc.encode(buildBambuProjectConfig(materialColors)) },
  ]);

  const blob = new Blob([zip], { type: MIME_3MF });
  // Suffix the download so it's distinguishable from the standard 3MF.
  const filename = getExportFilename('3mf', customName).replace(/\.3mf$/i, '_bambu.3mf');
  return { blob, filename, mimeType: MIME_3MF };
}

export function export3MFBambu(meshData: MeshData, customName?: string): string {
  const built = build3MFBambu(meshData, customName);
  downloadBlob(built.blob, built.filename, '3MF (Bambu)');
  return built.filename;
}
