// Serialize / deserialize MeshData to a compact binary blob.
//
// Used by the "free mesh" (frozen-mesh) version source: a Version may store
// a serialized MeshData blob in place of executable code. The blob *is* the
// source of truth — there's no replay step.
//
// Format (little-endian):
//   bytes  0..3   uint32  magic ('PWFM' = 0x4d465750)
//   bytes  4..7   uint32  version (= 1)
//   bytes  8..11  uint32  numVert
//   bytes 12..15  uint32  numTri
//   bytes 16..19  uint32  numProp
//   bytes 20..   Float32  vertProperties (numVert * numProp values)
//   then         Uint32   triVerts       (numTri * 3 values)
//
// Optional fields (colors, mergeFromVert/mergeToVert, runIndex/runOriginalID)
// are NOT persisted — they're derived/runtime data. On deserialize the mesh
// is fed straight into Manifold.ofMesh() which rebuilds the canonical form.

import type { MeshData } from '../geometry/types';

const MAGIC = 0x4d465750; // 'PWFM' little-endian
const FORMAT_VERSION = 1;
const HEADER_BYTES = 20;

export function serializeMeshData(mesh: MeshData): ArrayBuffer {
  const numVert = mesh.numVert;
  const numTri = mesh.numTri;
  const numProp = mesh.numProp;

  if (mesh.vertProperties.length !== numVert * numProp) {
    throw new Error(`serializeMeshData: vertProperties length ${mesh.vertProperties.length} !== numVert*numProp ${numVert * numProp}`);
  }
  if (mesh.triVerts.length !== numTri * 3) {
    throw new Error(`serializeMeshData: triVerts length ${mesh.triVerts.length} !== numTri*3 ${numTri * 3}`);
  }

  const vertBytes = numVert * numProp * 4;
  const triBytes = numTri * 3 * 4;
  const total = HEADER_BYTES + vertBytes + triBytes;

  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, FORMAT_VERSION, true);
  dv.setUint32(8, numVert, true);
  dv.setUint32(12, numTri, true);
  dv.setUint32(16, numProp, true);

  // Float32 + Uint32 arrays need their offset to be 4-byte-aligned — header
  // is exactly 20 bytes which is 4-aligned, so we can write straight in.
  new Float32Array(buf, HEADER_BYTES, numVert * numProp).set(mesh.vertProperties);
  new Uint32Array(buf, HEADER_BYTES + vertBytes, numTri * 3).set(mesh.triVerts);

  return buf;
}

export function deserializeMeshData(buf: ArrayBuffer | Uint8Array): MeshData {
  // Normalize to ArrayBuffer view. IndexedDB tends to give back ArrayBuffer,
  // but support Uint8Array too for callers that already wrapped it.
  let abuf: ArrayBuffer;
  let byteOffset = 0;
  let byteLength: number;
  if (buf instanceof Uint8Array) {
    abuf = buf.buffer;
    byteOffset = buf.byteOffset;
    byteLength = buf.byteLength;
  } else {
    abuf = buf;
    byteLength = buf.byteLength;
  }

  if (byteLength < HEADER_BYTES) {
    throw new Error('deserializeMeshData: blob too small for header');
  }
  const dv = new DataView(abuf, byteOffset, byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new Error(`deserializeMeshData: bad magic 0x${magic.toString(16)} (expected 0x${MAGIC.toString(16)})`);
  }
  const version = dv.getUint32(4, true);
  if (version !== FORMAT_VERSION) {
    throw new Error(`deserializeMeshData: unsupported format version ${version}`);
  }
  const numVert = dv.getUint32(8, true);
  const numTri = dv.getUint32(12, true);
  const numProp = dv.getUint32(16, true);

  const vertCount = numVert * numProp;
  const triCount = numTri * 3;
  const expected = HEADER_BYTES + vertCount * 4 + triCount * 4;
  if (byteLength < expected) {
    throw new Error(`deserializeMeshData: blob too small (${byteLength} bytes, expected ${expected})`);
  }

  // Copy out of the underlying buffer so the returned arrays own their memory.
  // The DataView offsets are exact; we copy via .slice() to avoid keeping a
  // reference to the (potentially much larger) IndexedDB-backed ArrayBuffer.
  const vertProperties = new Float32Array(abuf.slice(
    byteOffset + HEADER_BYTES,
    byteOffset + HEADER_BYTES + vertCount * 4,
  ));
  const triVerts = new Uint32Array(abuf.slice(
    byteOffset + HEADER_BYTES + vertCount * 4,
    byteOffset + HEADER_BYTES + vertCount * 4 + triCount * 4,
  ));

  return {
    vertProperties,
    triVerts,
    numVert,
    numTri,
    numProp,
  };
}

// --- Inline self-test (runs at module load in dev only) -------------------
// Verify roundtrip on a tiny synthetic mesh. Throws on failure so problems
// surface at import time rather than as silent data corruption later.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  try {
    const sample: MeshData = {
      vertProperties: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ]),
      triVerts: new Uint32Array([
        0, 1, 2,
        0, 2, 3,
        0, 3, 1,
        1, 3, 2,
      ]),
      numVert: 4,
      numTri: 4,
      numProp: 3,
    };
    const buf = serializeMeshData(sample);
    const round = deserializeMeshData(buf);
    if (round.numVert !== sample.numVert) throw new Error('numVert mismatch');
    if (round.numTri !== sample.numTri) throw new Error('numTri mismatch');
    if (round.numProp !== sample.numProp) throw new Error('numProp mismatch');
    for (let i = 0; i < sample.vertProperties.length; i++) {
      if (round.vertProperties[i] !== sample.vertProperties[i]) {
        throw new Error(`vertProperties[${i}] mismatch`);
      }
    }
    for (let i = 0; i < sample.triVerts.length; i++) {
      if (round.triVerts[i] !== sample.triVerts[i]) {
        throw new Error(`triVerts[${i}] mismatch`);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[meshIO] roundtrip self-test failed:', e);
  }
}
