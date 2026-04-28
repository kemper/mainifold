// Session JSON + raw code exports

import { exportSession, getState } from '../storage/sessionManager';
import { downloadBlob } from './download';

/** Sanitize a session name into a filename-safe slug. Falls back to "session". */
function slugify(name: string): string {
  const slug = name
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug || 'session';
}

/**
 * Export the current (or specified) session as a `.partwright.json` file.
 * Returns true if a download was triggered, false if no session was available.
 */
export async function exportSessionJSON(sessionId?: string): Promise<boolean> {
  const data = await exportSession(sessionId);
  if (!data) return false;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${slugify(data.session.name)}.partwright.json`);
  return true;
}

/**
 * Export the editor's current code as a plain `.js` or `.scad` file.
 * Uses the active session/version for the filename when available.
 */
export function exportRawCode(code: string, language: 'manifold-js' | 'scad'): void {
  const ext = language === 'scad' ? 'scad' : 'js';
  const state = getState();
  let base = state.session?.name ?? 'code';
  if (state.currentVersion?.label) base += `_${state.currentVersion.label}`;
  const blob = new Blob([code], { type: 'text/plain' });
  downloadBlob(blob, `${slugify(base)}.${ext}`);
}
