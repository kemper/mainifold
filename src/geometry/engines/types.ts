import type { MeshData, MeshResult } from '../types';

export type Language = 'manifold-js' | 'scad';

export const DEFAULT_LANGUAGE: Language = 'manifold-js';

export function isLanguage(v: unknown): v is Language {
  return v === 'manifold-js' || v === 'scad';
}

export interface ValidateResult {
  valid: boolean;
  error?: string;
}

export interface Engine {
  id: Language;
  /** Initialize the engine. Idempotent. */
  init(): Promise<void>;
  /** Is the engine initialized and ready? */
  isReady(): boolean;
  /** Run source code; return mesh + (optional) manifold handle or error.
   * Requires init() to have completed — throws/errors if not ready. */
  run(source: string): MeshResult;
  /** Best-effort syntax/compile check. */
  validate(source: string): ValidateResult;
}

export type { MeshData, MeshResult };
