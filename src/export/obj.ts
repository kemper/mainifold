import type { MeshData } from '../geometry/types';

export function exportOBJ(meshData: MeshData): void {
  const { vertProperties, triVerts, numVert, numTri, numProp } = meshData;

  const lines: string[] = ['# mAInifold OBJ Export'];

  // Vertices
  for (let i = 0; i < numVert; i++) {
    const x = vertProperties[i * numProp];
    const y = vertProperties[i * numProp + 1];
    const z = vertProperties[i * numProp + 2];
    lines.push(`v ${x} ${y} ${z}`);
  }

  // Faces (OBJ indices are 1-based)
  for (let t = 0; t < numTri; t++) {
    const i0 = triVerts[t * 3] + 1;
    const i1 = triVerts[t * 3 + 1] + 1;
    const i2 = triVerts[t * 3 + 2] + 1;
    lines.push(`f ${i0} ${i1} ${i2}`);
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'model.obj';
  a.click();
  URL.revokeObjectURL(url);
}
