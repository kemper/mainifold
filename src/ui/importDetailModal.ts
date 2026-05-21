// Optional mesh-reduction step shown when importing a heavy STL. Lets the user
// trade triangle count for a lighter session via manifold-3d's tolerance-based
// simplify (see ../import/simplify.ts). Small meshes skip this entirely.

import { createModalShell } from './modalShell';
import { simplifyMesh, meshDiagonal } from '../import/simplify';
import type { MeshData } from '../geometry/types';

/** Only offer the reduction step for imports above this triangle count — below
 *  it, simplification isn't worth interrupting the import for. */
export const IMPORT_DETAIL_TRIANGLE_THRESHOLD = 20_000;

export interface ImportDetailResult {
  /** The mesh to import — original, or a simplified copy. */
  mesh: MeshData;
  /** Original triangle count when the user reduced; null when full detail. */
  reducedFrom: number | null;
}

interface Preset {
  id: string;
  label: string;
  hint: string;
  /** Simplify tolerance as a fraction of the bounding-box diagonal. 0 = full. */
  fraction: number;
}

const PRESETS: Preset[] = [
  { id: 'full', label: 'Full detail', hint: 'Keep every triangle', fraction: 0 },
  { id: 'light', label: 'Light', hint: 'Merge near-coplanar detail', fraction: 0.0005 },
  { id: 'medium', label: 'Medium', hint: 'Balanced reduction', fraction: 0.002 },
  { id: 'strong', label: 'Strong', hint: 'Aggressive — may soften fine features', fraction: 0.01 },
];

const fmt = (n: number) => n.toLocaleString();

export function showImportDetailModal(mesh: MeshData, filename: string): Promise<ImportDetailResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    const diag = meshDiagonal(mesh) || 1;

    // Lazily-computed simplified meshes, keyed by preset id. Full detail is the
    // original mesh; the rest are computed the first time they're selected so a
    // huge import doesn't simplify three times up front.
    const cache = new Map<string, MeshData>([['full', mesh]]);

    const shell = createModalShell({ title: 'Import detail', onClose: () => finish(null) });

    function finish(result: ImportDetailResult | null): void {
      if (!settled) { settled = true; resolve(result); }
      shell.close();
    }

    const intro = document.createElement('p');
    intro.className = 'text-xs text-zinc-400 leading-relaxed';
    intro.innerHTML =
      `<span class="text-zinc-200 font-mono">${filename}</span> has <span class="text-zinc-200">${fmt(mesh.numTri)}</span> triangles. ` +
      'You can reduce it for a lighter, faster session. Reduction merges vertices within a tolerance of the surface — ideal for over-tessellated flat regions, less so for smoothly curved scans. You can re-import the original any time.';
    shell.body.appendChild(intro);

    const group = document.createElement('div');
    group.className = 'flex flex-col gap-2';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Import detail level');

    let selectedId = 'full';
    const countEls = new Map<string, HTMLElement>();

    for (const preset of PRESETS) {
      const row = document.createElement('label');
      row.className =
        'flex items-center gap-3 px-3 py-2 rounded border border-zinc-700 hover:border-zinc-500 cursor-pointer transition-colors';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'import-detail';
      radio.value = preset.id;
      radio.checked = preset.id === selectedId;
      radio.className = 'accent-blue-500';

      const text = document.createElement('div');
      text.className = 'flex flex-col gap-0.5 flex-1 min-w-0';
      const label = document.createElement('span');
      label.className = 'text-sm font-medium text-zinc-100';
      label.textContent = preset.label;
      const hint = document.createElement('span');
      hint.className = 'text-xs text-zinc-400';
      hint.textContent = preset.hint;
      text.appendChild(label);
      text.appendChild(hint);

      const count = document.createElement('span');
      count.className = 'shrink-0 text-xs font-mono text-zinc-400 tabular-nums';
      count.textContent = preset.id === 'full' ? `${fmt(mesh.numTri)} tris` : '';
      countEls.set(preset.id, count);

      row.appendChild(radio);
      row.appendChild(text);
      row.appendChild(count);
      group.appendChild(row);

      radio.addEventListener('change', () => {
        if (radio.checked) {
          selectedId = preset.id;
          ensureComputed(preset);
        }
      });
    }
    shell.body.appendChild(group);

    function ensureComputed(preset: Preset): void {
      if (preset.id === 'full' || cache.has(preset.id)) return;
      const el = countEls.get(preset.id);
      if (el) el.textContent = '…';
      // Defer so the "…" paints before the (synchronous) WASM simplify blocks.
      setTimeout(() => {
        const reduced = simplifyMesh(mesh, preset.fraction * diag);
        cache.set(preset.id, reduced);
        if (el) el.textContent = `${fmt(reduced.numTri)} tris`;
      }, 0);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'px-3 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => finish(null));

    const importBtn = document.createElement('button');
    importBtn.className = 'px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white';
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', () => {
      // Compute synchronously if the user confirms before the deferred preview
      // simplify has run, so the chosen reduction is never silently skipped.
      let chosen = cache.get(selectedId);
      if (!chosen) {
        const preset = PRESETS.find((p) => p.id === selectedId);
        chosen = preset ? simplifyMesh(mesh, preset.fraction * diag) : mesh;
        cache.set(selectedId, chosen);
      }
      finish({ mesh: chosen, reducedFrom: selectedId === 'full' ? null : mesh.numTri });
    });

    shell.footer.appendChild(cancelBtn);
    shell.footer.appendChild(importBtn);
  });
}
