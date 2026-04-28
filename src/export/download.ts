// Shared export download utilities — filename generation + blob download

import { getState } from '../storage/sessionManager';
import { getUnits } from '../geometry/units';
import { registerExport } from './exportInbox';

/**
 * Build a descriptive export filename from session context.
 *
 * Priority: customName > session name (+ version label) > "model"
 * Always appends date, optional unit suffix, and extension.
 */
export function getExportFilename(extension: string, customName?: string): string {
  let base: string;

  if (customName) {
    base = customName;
  } else {
    const state = getState();
    if (state.session?.name) {
      base = state.session.name;
      if (state.currentVersion?.label) {
        base += `_${state.currentVersion.label}`;
      }
    } else {
      base = 'model';
    }
  }

  // Sanitize: keep alphanumeric, spaces, hyphens, underscores
  base = base.replace(/[^a-zA-Z0-9 _-]/g, '');
  // Collapse whitespace to hyphens
  base = base.replace(/\s+/g, '-');
  // Collapse consecutive hyphens/underscores
  base = base.replace(/[-_]{2,}/g, '-');
  // Trim leading/trailing hyphens
  base = base.replace(/^[-_]+|[-_]+$/g, '');
  // Truncate
  base = base.slice(0, 80);
  // Fallback if sanitization emptied it
  if (!base) base = 'model';

  // Date suffix
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Unit suffix
  const unit = getUnits();
  const unitSuffix = unit !== 'unitless' ? `_${unit}` : '';

  return `${base}_${date}${unitSuffix}.${extension}`;
}

/**
 * Get a human-readable export name for embedding in file metadata (headers, comments).
 * Returns session name if active, otherwise "Partwright Export".
 */
export function getExportTitle(): string {
  const state = getState();
  if (state.session?.name) {
    let title = state.session.name;
    if (state.currentVersion?.label) {
      title += ` — ${state.currentVersion.label}`;
    }
    return title;
  }
  return 'Partwright Export';
}

/**
 * Trigger a browser download for a Blob and add the entry to the export inbox.
 * `source` is a short label shown in the Recent Exports list (e.g. "GLB", "Session JSON").
 * Pass `register: false` to download without recording (e.g. when re-downloading
 * an existing inbox entry — we don't want to double-register it).
 */
export function downloadBlob(
  blob: Blob,
  filename: string,
  source?: string,
  options?: { register?: boolean },
): void {
  if (options?.register !== false && source) {
    registerExport(blob, filename, source);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Encode an ArrayBuffer / Uint8Array as base64 without blowing the call stack. */
export function bytesToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

/** Async-read a Blob as base64 (no data: prefix). */
export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(await blob.arrayBuffer());
}
