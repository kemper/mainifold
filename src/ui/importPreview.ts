// Modal that shows a summary of a `.partwright.json` payload before committing
// it to IndexedDB. Mirrors the styling of showInlineConfirm so importing feels
// like the existing confirmation flow, just with more detail.

import type { ExportedSession } from '../storage/sessionManager';

export interface SessionImportSummary {
  sessionName: string;
  schemaVersion: string;
  versionCount: number;
  noteCount: number;
  annotationCount: number;
  referenceSides: string[];
  language: string;
  createdAt: number | null;
  updatedAt: number | null;
}

/** Build a SessionImportSummary from a parsed .partwright.json payload. */
export function summarizeSessionImport(data: ExportedSession): SessionImportSummary {
  // Build a list of image labels for the import preview. Handle three shapes:
  //   - current: array of {id, src, label?}
  //   - pre-unification: array of {id, angle, src, label?} — fall back to angle
  //   - pre-array: object map {front: 'url', ...} — use the keys
  // Items with no label and no angle are listed as "(unlabeled)".
  const imgs = data.session.images ?? data.session.referenceImages ?? null;
  const referenceSides: string[] = [];
  if (Array.isArray(imgs)) {
    for (const item of imgs) {
      const it = item as { label?: string; angle?: string };
      const label = (it.label ?? '').trim() || (it.angle ? it.angle : '');
      referenceSides.push(label || '(unlabeled)');
    }
  } else if (imgs && typeof imgs === 'object') {
    for (const k of ['front', 'right', 'back', 'left', 'top', 'perspective'] as const) {
      if ((imgs as Record<string, unknown>)[k]) referenceSides.push(k);
    }
  }
  return {
    sessionName: data.session.name || '(unnamed)',
    schemaVersion: data.partwright ?? data.mainifold ?? 'unknown',
    versionCount: data.versions.length,
    noteCount: data.notes?.length ?? 0,
    annotationCount: data.annotations?.length ?? 0,
    referenceSides,
    language: data.session.language ?? 'manifold-js',
    createdAt: data.session.created ?? null,
    updatedAt: data.session.updated ?? null,
  };
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString();
}

/**
 * Show a preview modal for a session import. Resolves true if the user
 * confirms, false if they cancel or dismiss.
 */
export function showImportPreview(filename: string, summary: SessionImportSummary): Promise<boolean> {
  return new Promise((resolve) => {
    document.querySelector('.import-preview-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'import-preview-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center';

    const modal = document.createElement('div');
    modal.className = 'bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl p-5 max-w-md mx-4 animate-modal-in';

    const heading = document.createElement('div');
    heading.className = 'flex items-baseline justify-between gap-3 mb-1';
    const title = document.createElement('h2');
    title.className = 'text-zinc-100 text-base font-semibold';
    title.textContent = 'Import session?';
    const schema = document.createElement('span');
    schema.className = 'text-[10px] uppercase tracking-wide text-zinc-400 border border-zinc-600 rounded px-1.5 py-0.5';
    schema.textContent = `schema ${summary.schemaVersion}`;
    heading.appendChild(title);
    heading.appendChild(schema);

    const file = document.createElement('p');
    file.className = 'text-[11px] text-zinc-500 mb-3 truncate';
    file.title = filename;
    file.textContent = filename;

    const sessionName = document.createElement('p');
    sessionName.className = 'text-zinc-200 text-sm mb-3';
    sessionName.innerHTML = `Session: <span class="font-medium">${escapeHtml(summary.sessionName)}</span>`;

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-300 mb-4';

    function addRow(label: string, value: string) {
      const k = document.createElement('div');
      k.className = 'text-zinc-500';
      k.textContent = label;
      const v = document.createElement('div');
      v.className = 'text-zinc-200 truncate';
      v.textContent = value;
      v.title = value;
      grid.appendChild(k);
      grid.appendChild(v);
    }

    addRow('Versions', String(summary.versionCount));
    addRow('Language', summary.language);
    addRow('Notes', String(summary.noteCount));
    addRow('Annotations', String(summary.annotationCount));
    addRow('Reference images', summary.referenceSides.length ? summary.referenceSides.join(', ') : 'none');
    addRow('Last updated', formatTimestamp(summary.updatedAt));

    const note = document.createElement('p');
    note.className = 'text-[11px] text-zinc-500 leading-relaxed mb-4';
    note.textContent = 'Imports as a new session — your current session is kept.';

    const btnGroup = document.createElement('div');
    btnGroup.className = 'flex items-center justify-end gap-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'px-4 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors';
    cancelBtn.textContent = 'Cancel';

    const importBtn = document.createElement('button');
    importBtn.className = 'px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors';
    importBtn.textContent = 'Import';

    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(importBtn);

    modal.appendChild(heading);
    modal.appendChild(file);
    modal.appendChild(sessionName);
    modal.appendChild(grid);
    modal.appendChild(note);
    modal.appendChild(btnGroup);
    overlay.appendChild(modal);

    let resolved = false;
    function finish(result: boolean) {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    importBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(false);
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    importBtn.focus();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
