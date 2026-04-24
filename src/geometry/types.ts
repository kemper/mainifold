export interface MeshData {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  numVert: number;
  numTri: number;
  numProp: number;
  triColors?: Uint8Array; // numTri * 3 (RGB per triangle), optional
}

export interface MeshResult {
  mesh: MeshData | null;
  manifold: unknown | null;
  error: string | null;
}

export interface CrossSectionResult {
  polygons: number[][][];
  svg: string;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
}
