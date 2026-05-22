// Session bar — thin strip below toolbar showing session state

import {
  getState,
  onStateChange,
  onNotesChange,
  createSession,
  closeSession,
  saveVersion,
  navigateVersion,
  listCurrentVersions,
  renameSession,
  renamePart,
  type SessionState,
} from '../storage/sessionManager';
import { onChange as onColorRegionsChange } from '../color/regions';
import { onChange as onAnnotationStrokesChange } from '../annotations/annotations';

export interface SessionBarCallbacks {
  onSaveVersion: () => Promise<{ code: string; geometryData: Record<string, unknown> | null; thumbnail: Blob | null }>;
  onLoadVersion: (code: string) => void;
  onOpenSessionList: () => void;
  onNewSession: () => void;
  /** Switch the active part by id (loads its latest version into the editor). */
  onSwitchPart: (partId: string) => void | Promise<void>;
  /** Create a new part in the active session (resets editor to a starter). */
  onCreatePart: () => void | Promise<void>;
  /** Delete a part by id (an adjacent part becomes active). */
  onDeletePart: (partId: string) => void | Promise<void>;
}

let barEl: HTMLElement | null = null;
let callbacks: SessionBarCallbacks;
// Sorted indices of the active session's versions. Cached so the (synchronous)
// render can decide prev/next availability correctly even when deletions have
// left gaps in the index sequence. Refreshed whenever session state changes.
let versionIndices: number[] = [];

export function createSessionBar(container: HTMLElement, cb: SessionBarCallbacks): HTMLElement {
  callbacks = cb;

  const bar = document.createElement('div');
  bar.id = 'session-bar';
  bar.className = 'flex items-center gap-2 px-3 py-1 bg-zinc-800 border-b border-zinc-700 text-xs shrink-0';

  barEl = bar;
  render(getState());
  // Version set can change on any state transition (save, delete, switch
  // session), so refresh the cached indices before each state-driven render.
  void syncAndRender();
  onStateChange(() => { void syncAndRender(); });

  // Re-render when paint regions, annotations, or notes change so the Save
  // button reflects current dirty state and is clickable after these edits.
  // These don't change the version set, so the cached indices stay valid.
  const refresh = () => render(getState());
  onColorRegionsChange(refresh);
  onAnnotationStrokesChange(refresh);
  onNotesChange(refresh);

  container.appendChild(bar);
  return bar;
}

/** Refresh the cached version indices, then render. Used for state-driven
 *  renders where the version set may have changed. */
async function syncAndRender(): Promise<void> {
  const state = getState();
  versionIndices = state.session ? (await listCurrentVersions()).map(v => v.index) : [];
  render(state);
}

function render(state: SessionState) {
  if (!barEl) return;
  barEl.innerHTML = '';

  if (!state.session) {
    // No active session
    const label = el('span', 'text-zinc-500 font-mono', 'No session');
    barEl.appendChild(label);

    const btnNew = btn('+ New Session', async () => {
      await createSession();
      callbacks.onNewSession();
    });
    barEl.appendChild(btnNew);

    const btnList = btn('Sessions…', () => callbacks.onOpenSessionList());
    barEl.appendChild(btnList);

    return;
  }

  // Active session — double-click to rename
  const nameEl = el('span', 'text-zinc-300 font-mono font-medium truncate max-w-48 cursor-pointer', state.session.name);
  nameEl.title = `${state.session.name} (double-click to rename)`;
  nameEl.addEventListener('dblclick', () => {
    if (!state.session) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = state.session.name;
    input.className = 'bg-zinc-700 text-zinc-200 font-mono text-xs px-1 py-0.5 rounded border border-zinc-500 w-48 outline-none focus:border-blue-500';
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = async () => {
      const newName = input.value.trim();
      if (newName && newName !== state.session!.name) {
        await renameSession(state.session!.id, newName);
      } else {
        render(getState());
      }
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') render(getState());
    });
  });
  barEl.appendChild(nameEl);

  // Language badge
  const langLabel = state.session.language === 'scad' ? 'SCAD' : 'JS';
  const langColor = state.session.language === 'scad' ? 'text-amber-400 border-amber-400/30' : 'text-blue-400 border-blue-400/30';
  const langBadge = el('span', `text-[10px] font-semibold border rounded px-1 ${langColor}`, langLabel);
  barEl.appendChild(langBadge);

  // Separator
  barEl.appendChild(el('span', 'text-zinc-600', '|'));

  // Part switcher (a session always has at least one part)
  renderPartControl(barEl, state);

  // Separator
  barEl.appendChild(el('span', 'text-zinc-600', '|'));

  // Version nav
  if (state.currentVersion && state.versionCount > 0) {
    // Position within the (gap-tolerant) index list, not raw index math.
    const pos = versionIndices.indexOf(state.currentVersion.index);
    const atFirst = pos <= 0;
    const prevBtn = btn('◀', async () => {
      const v = await navigateVersion('prev');
      if (v) callbacks.onLoadVersion(v.code);
    });
    if (atFirst) {
      prevBtn.disabled = true;
      prevBtn.className += ' opacity-30 cursor-default';
    }
    barEl.appendChild(prevBtn);

    const versionText = state.currentVersion.label
      ? `v${state.currentVersion.index}/${state.versionCount} — ${state.currentVersion.label}`
      : `v${state.currentVersion.index}/${state.versionCount}`;
    const versionLabel = el(
      'span',
      'text-zinc-400 font-mono tabular-nums truncate max-w-64',
      versionText,
    );
    versionLabel.title = state.currentVersion.label || `Version ${state.currentVersion.index}`;
    barEl.appendChild(versionLabel);

    const atLast = pos === -1 || pos >= versionIndices.length - 1;
    const nextBtn = btn('▶', async () => {
      const v = await navigateVersion('next');
      if (v) callbacks.onLoadVersion(v.code);
    });
    if (atLast) {
      nextBtn.disabled = true;
      nextBtn.className += ' opacity-30 cursor-default';
    }
    barEl.appendChild(nextBtn);
  } else {
    barEl.appendChild(el('span', 'text-zinc-500 font-mono', 'no versions'));
  }

  barEl.appendChild(el('span', 'text-zinc-600', '|'));

  // Save version (with guard against double-click).
  // The button must be re-enabled in finally so it doesn't get stuck disabled
  // when saveVersion silently skips a code-identical save (e.g. clicking save
  // after only painting, annotating, or adding notes — none of which mutate
  // the code text). Force=true when colors differ so paint-only changes still
  // create a new version.
  let saving = false;
  const saveBtn = btn('\uD83D\uDCBE Save', async () => {
    if (saving) return;
    saving = true;
    saveBtn.disabled = true;
    saveBtn.classList.add('opacity-50');
    try {
      const data = await callbacks.onSaveVersion();
      const label = `v${state.versionCount + 1}`;
      const force = colorRegionsDiffer(state.currentVersion?.geometryData, data.geometryData);
      await saveVersion(
        data.code,
        data.geometryData,
        data.thumbnail,
        label,
        undefined,
        force ? { force: true } : undefined,
      );
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.classList.remove('opacity-50');
    }
  });
  saveBtn.id = 'btn-save-version';
  barEl.appendChild(saveBtn);

  // Spacer
  barEl.appendChild(el('div', 'flex-1', ''));

  // Sessions list
  const listBtn = btn('Sessions…', () => callbacks.onOpenSessionList());
  barEl.appendChild(listBtn);

  // Close session
  const closeBtn = btn('✕', () => closeSession());
  closeBtn.title = 'Close session';
  barEl.appendChild(closeBtn);
}

/** Render the part switcher: a dropdown of the session's parts plus add/rename/
 *  delete controls. A session always has ≥1 part, so this always shows when a
 *  session is active. */
function renderPartControl(container: HTMLElement, state: SessionState): void {
  const current = state.currentPart;
  if (!current) return;

  const icon = el('span', 'text-zinc-500', '▤'); // ▤ parts glyph
  icon.title = 'Parts in this session';
  container.appendChild(icon);

  const select = document.createElement('select');
  select.id = 'part-select';
  select.className = 'bg-zinc-700 text-zinc-200 text-xs rounded px-1 py-0.5 border border-zinc-600 max-w-40 truncate cursor-pointer focus:outline-none focus:border-blue-500';
  select.title = 'Switch part';
  for (const p of state.parts) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === current.id) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => { void callbacks.onSwitchPart(select.value); });
  container.appendChild(select);

  const addBtn = btn('＋', () => { void callbacks.onCreatePart(); }); // ＋
  addBtn.id = 'btn-add-part';
  addBtn.title = 'Add a new part to this session';
  container.appendChild(addBtn);

  const renameBtn = btn('✎', async () => { // ✎
    const name = prompt('Rename part', current.name);
    if (name && name.trim() && name.trim() !== current.name) {
      await renamePart(current.id, name.trim());
    }
  });
  renameBtn.title = 'Rename this part';
  container.appendChild(renameBtn);

  // Deleting is only possible when more than one part exists.
  if (state.parts.length > 1) {
    const delBtn = btn('\u{1F5D1}', async () => { // 🗑
      if (confirm(`Delete part "${current.name}" and all of its versions? This cannot be undone.`)) {
        await callbacks.onDeletePart(current.id);
      }
    });
    delBtn.title = 'Delete this part';
    container.appendChild(delBtn);
  }
}

function el(tag: string, className: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

function colorRegionsDiffer(
  oldGeo: Record<string, unknown> | null | undefined,
  newGeo: Record<string, unknown> | null | undefined,
): boolean {
  const oldColors = (oldGeo as Record<string, unknown> | null | undefined)?.colorRegions ?? null;
  const newColors = (newGeo as Record<string, unknown> | null | undefined)?.colorRegions ?? null;
  return JSON.stringify(oldColors) !== JSON.stringify(newColors);
}

function btn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'px-1.5 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors text-xs';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
