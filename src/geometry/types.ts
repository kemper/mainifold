export interface MeshData {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  numVert: number;
  numTri: number;
  numProp: number;
  triColors?: Uint8Array; // numTri * 3 (RGB per triangle), optional
  mergeFromVert?: Uint32Array; // vertex merge pairs from manifold-3d (for export dedup)
  mergeToVert?: Uint32Array;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface SourceDiagnostic {
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
  hint?: string;
  from?: number;
  to?: number;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface MeshResult {
  mesh: MeshData | null;
  manifold: unknown | null;
  error: string | null;
  diagnostics?: SourceDiagnostic[];
}

export interface CrossSectionResult {
  polygons: number[][][];
  svg: string;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
}
