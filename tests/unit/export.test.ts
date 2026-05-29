import { describe, it, expect } from 'vitest';
import { buildSTL } from '../../src/export/stl';
import { build3MF, build3MFBambu } from '../../src/export/threemf';
import { buildOBJ } from '../../src/export/obj';
import type { MeshData } from '../../src/geometry/types';

// A trivial single-triangle mesh — enough to exercise the export writers.
function tri(): MeshData {
  return {
    numProp: 3,
    numVert: 3,
    numTri: 1,
    vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    triVerts: new Uint32Array([0, 1, 2]),
  } as unknown as MeshData;
}

// Two disjoint triangles painted distinct colors (red, green) — exercises the
// multi-color colorgroup path and, for Bambu, one filament per color.
function triPainted(): MeshData {
  return {
    numProp: 3,
    numVert: 6,
    numTri: 2,
    vertProperties: new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, // tri 0
      2, 0, 0, 3, 0, 0, 2, 1, 0, // tri 1
    ]),
    triVerts: new Uint32Array([0, 1, 2, 3, 4, 5]),
    triColors: new Uint8Array([255, 0, 0, 0, 255, 0]),
  } as unknown as MeshData;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decode a byte buffer as Latin-1 so we can substring-search ASCII content
 *  regardless of any binary bytes around it (the 3MF/OBJ ZIPs use STORE so
 *  the text is embedded verbatim). */
function asLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

describe('export attribution + STL header safety', () => {
  it('STL header never exceeds 80 bytes and the triangle count is intact', async () => {
    const bytes = await blobBytes(buildSTL(tri()).blob);
    // Binary STL: 80-byte header, then a uint32 triangle count at byte 80.
    const dv = new DataView(bytes.buffer);
    const count = dv.getUint32(80, true);
    expect(count).toBe(1);
    // The header region is exactly 80 bytes by construction; assert the buffer
    // is at least header(80) + count(4) + one triangle(50).
    expect(bytes.length).toBe(80 + 4 + 50);
  });

  it('STL header carries the Partwright attribution within the 80-byte window', async () => {
    const bytes = await blobBytes(buildSTL(tri()).blob);
    const header = asLatin1(bytes.subarray(0, 80));
    expect(header).toContain('Partwright partwrightstudio.com');
  });

  it('STL attribution is dropped (never truncated past byte 80) for a very long title', async () => {
    // Even an extreme custom name must not push the header past 80 bytes.
    const longName = 'x'.repeat(200);
    const bytes = await blobBytes(buildSTL(tri(), longName).blob);
    const dv = new DataView(bytes.buffer);
    // The triangle count at byte 80 must still read 1 — proof byte 80 wasn't
    // overwritten by header overflow.
    expect(dv.getUint32(80, true)).toBe(1);
  });

  it('3MF embeds Partwright application metadata and the studio URL', async () => {
    const text = asLatin1(await blobBytes(build3MF(tri()).blob));
    expect(text).toContain('<metadata name="Application">Partwright');
    expect(text).toContain('www.partwrightstudio.com');
  });

  it('OBJ text carries the Partwright attribution comment + URL', async () => {
    const text = asLatin1(await blobBytes(buildOBJ(tri()).blob));
    expect(text).toContain('# Partwright');
    expect(text).toContain('https://www.partwrightstudio.com');
  });
});

describe('Bambu 3MF — all-PLA filament metadata', () => {
  it('declares one Generic PLA filament per color, never ABS', async () => {
    const text = asLatin1(await blobBytes(build3MFBambu(triPainted()).blob));
    // The Bambu project marker is present (this is what flips Bambu out of its
    // color-match guessing into project-load mode).
    expect(text).toContain('Metadata/project_settings.config');
    expect(text).toContain('"filament_type"');
    // Every filament is PLA, and ABS appears nowhere.
    expect(text).not.toContain('ABS');
    // One PLA entry per colorgroup color: default + red + green = 3. The regex
    // matches the bare "PLA" type values, not the "Generic PLA" preset names
    // (those have a space before PLA, not a quote).
    expect((text.match(/"PLA"/g) ?? []).length).toBe(3);
    // The painted colors carry through as filament colours.
    expect(text).toContain('#FF0000');
    expect(text).toContain('#00FF00');
  });

  it('still carries the standard mesh + colorgroup so it opens in any slicer', async () => {
    const text = asLatin1(await blobBytes(build3MFBambu(triPainted()).blob));
    expect(text).toContain('<m:colorgroup');
    expect(text).toContain('3D/3dmodel.model');
  });

  it('an uncolored model still pins a single PLA filament', async () => {
    const text = asLatin1(await blobBytes(build3MFBambu(tri()).blob));
    expect(text).toContain('"filament_type"');
    expect((text.match(/"PLA"/g) ?? []).length).toBe(1);
    expect(text).not.toContain('ABS');
  });

  it('uses a distinct _bambu filename', () => {
    expect(build3MFBambu(tri()).filename.endsWith('_bambu.3mf')).toBe(true);
  });

  it('does NOT inject printer/process settings (only filament keys)', async () => {
    // The whole point of the filament-only config is to avoid clobbering the
    // user's machine setup on import.
    const text = asLatin1(await blobBytes(build3MFBambu(triPainted()).blob));
    expect(text).not.toContain('printer_settings_id');
    expect(text).not.toContain('nozzle_diameter');
    expect(text).not.toContain('layer_height');
  });
});

describe('standard 3MF stays portable (no Bambu coupling)', () => {
  it('omits Bambu project metadata but keeps native color', async () => {
    const text = asLatin1(await blobBytes(build3MF(triPainted()).blob));
    expect(text).not.toContain('project_settings.config');
    expect(text).not.toContain('filament_type');
    expect(text).toContain('<m:colorgroup');
  });
});
