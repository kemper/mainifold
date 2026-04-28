// Modal that lets the user choose what to embed in a `.partwright.json`
// session export. Defaults match the historical behavior — everything
// session-bound is on, thumbnails off (importer regenerates from code).

import type { ExportOptions } from '../storage/sessionManager';

interface OptionDef {
  key: keyof ExportOptions;
  label: string;
  description: string;
  defaultValue: boolean;
}

const OPTIONS: OptionDef[] = [
  {
    key: 'includeThumbnails',
    label: 'Thumbnail',
    description: 'Embeds the version preview image. Required for catalog entries; otherwise the importer regenerates it from code.',
    defaultValue: false,
  },
  {
    key: 'includeAnnotations',
    label: 'Annotations',
    description: 'Freehand strokes and pinned text labels drawn on the model.',
    defaultValue: true,
  },
  {
    key: 'includeNotes',
    label: 'Notes',
    description: 'Session-level design log entries (decisions, requirements, measurements).',
    defaultValue: true,
  },
  {
    key: 'includeColorRegions',
    label: 'Color regions',
    description: 'Per-face color metadata (used for multi-color 3MF / OBJ exports).',
    defaultValue: true,
  },
];

/**
 * Show the export options modal. Resolves with the selected options when the
 * user confirms, or null if they cancel / dismiss.
 */
export function showExportOptionsDialog(): Promise<ExportOptions | null> {
  return new Promise((resolve) => {
    document.querySelector('.export-options-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'export-options-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center';

    const modal = document.createElement('div');
    modal.className = 'bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl p-5 w-[min(28rem,calc(100vw-2rem))] mx-4 animate-modal-in';

    const heading = document.createElement('h2');
    heading.className = 'text-zinc-100 text-base font-semibold mb-1';
    heading.textContent = 'Export session';

    const sub = document.createElement('p');
    sub.className = 'text-[11px] text-zinc-400 mb-4 leading-relaxed';
    sub.textContent = 'Choose what to include in the .partwright.json file.';

    modal.appendChild(heading);
    modal.appendChild(sub);

    const checkboxes = new Map<keyof ExportOptions, HTMLInputElement>();

    for (const opt of OPTIONS) {
      const row = document.createElement('label');
      row.className = 'flex items-start gap-2.5 py-1.5 cursor-pointer hover:bg-zinc-700/40 rounded px-2 -mx-2';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = opt.defaultValue;
      input.className = 'mt-0.5 w-4 h-4 accent-blue-500 cursor-pointer';
      checkboxes.set(opt.key, input);

      const text = document.createElement('div');
      text.className = 'flex-1 min-w-0';

      const labelEl = document.createElement('div');
      labelEl.className = 'text-xs text-zinc-200 font-medium';
      labelEl.textContent = opt.label;

      const descEl = document.createElement('div');
      descEl.className = 'text-[10px] text-zinc-500 leading-snug';
      descEl.textContent = opt.description;

      text.appendChild(labelEl);
      text.appendChild(descEl);

      row.appendChild(input);
      row.appendChild(text);
      modal.appendChild(row);
    }

    const btnGroup = document.createElement('div');
    btnGroup.className = 'flex items-center justify-end gap-2 mt-4';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'px-4 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors';
    cancelBtn.textContent = 'Cancel';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors';
    exportBtn.textContent = 'Export';

    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(exportBtn);
    modal.appendChild(btnGroup);

    overlay.appendChild(modal);

    let resolved = false;
    function finish(result: ExportOptions | null) {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    exportBtn.addEventListener('click', () => {
      const opts: ExportOptions = {};
      for (const [key, input] of checkboxes) {
        opts[key] = input.checked;
      }
      finish(opts);
    });
    cancelBtn.addEventListener('click', () => finish(null));

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null);
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish(null);
      if (e.key === 'Enter') exportBtn.click();
    }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    exportBtn.focus();
  });
}
