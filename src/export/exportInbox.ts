// Recent-exports inbox: an in-memory ring buffer of the last N export blobs the
// app produced. Both the toolbar (Recent Exports list) and the AI console API
// read from this — so an export the human triggered remains downloadable and
// inspectable without re-running the geometry.

const MAX_ENTRIES = 10;

export interface ExportInboxEntry {
  id: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  source: string;
  sizeBytes: number;
  timestamp: number;
}

const entries: ExportInboxEntry[] = [];
const listeners = new Set<() => void>();

let nextSeq = 1;

function notify() {
  for (const fn of listeners) fn();
}

/** Add an export to the inbox. Newest entries are at index 0. */
export function registerExport(
  blob: Blob,
  filename: string,
  source: string,
  mimeType?: string,
): ExportInboxEntry {
  const entry: ExportInboxEntry = {
    id: `exp_${Date.now().toString(36)}_${nextSeq++}`,
    blob,
    filename,
    mimeType: mimeType ?? blob.type ?? 'application/octet-stream',
    source,
    sizeBytes: blob.size,
    timestamp: Date.now(),
  };
  entries.unshift(entry);
  while (entries.length > MAX_ENTRIES) entries.pop();
  notify();
  return entry;
}

/** Snapshot of the inbox, newest first. */
export function listExports(): ExportInboxEntry[] {
  return entries.slice();
}

/** Look up a single entry by id. */
export function getExport(id: string): ExportInboxEntry | null {
  return entries.find(e => e.id === id) ?? null;
}

/** Drop everything from the inbox (used by the toolbar Clear action). */
export function clearExports(): void {
  if (entries.length === 0) return;
  entries.length = 0;
  notify();
}

/** Subscribe to inbox changes. Returns an unsubscribe fn. */
export function onExportInboxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
