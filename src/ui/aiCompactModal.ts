// Confirm-before-compact modal. Shows the proposed summary, the proposed
// session notes (each editable / dismissable), the count of turns to drop
// vs keep, and the cost of the compaction call itself.

import { formatUsd } from '../ai/cost';
import type { CompactionProposal } from '../ai/compaction';

let modalEl: HTMLElement | null = null;

export interface CompactConfirm {
  /** The summary text the user accepted (may be edited from the proposal). */
  summary: string;
  /** Notes the user kept and wants written to the session log. */
  notes: string[];
}

export function showCompactConfirmModal(
  proposal: CompactionProposal,
  onConfirm: (result: CompactConfirm) => void,
): void {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  const modal = document.createElement('div');
  modal.className = 'bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-2xl max-h-[80vh] flex flex-col';

  const header = document.createElement('div');
  header.className = 'px-5 py-3 border-b border-zinc-700 flex items-center justify-between';
  const title = document.createElement('h2');
  title.className = 'text-sm font-semibold text-zinc-100';
  title.textContent = 'Compact conversation';
  header.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 text-sm';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeModal);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = document.createElement('div');
  body.className = 'px-5 py-4 flex flex-col gap-4 overflow-auto text-sm text-zinc-200';

  const stats = document.createElement('div');
  stats.className = 'flex gap-4 text-xs text-zinc-400';
  const dropEl = document.createElement('span');
  dropEl.innerHTML = `<span class="text-zinc-200 font-medium">${proposal.drop.length}</span> turns dropped`;
  const keepEl = document.createElement('span');
  keepEl.innerHTML = `<span class="text-zinc-200 font-medium">${proposal.keep.length}</span> turns kept verbatim`;
  const costEl = document.createElement('span');
  costEl.innerHTML = `compaction cost: <span class="text-zinc-200 font-medium">${formatUsd(proposal.costUsd)}</span>`;
  stats.appendChild(dropEl);
  stats.appendChild(keepEl);
  stats.appendChild(costEl);
  body.appendChild(stats);

  const summaryHeader = document.createElement('h3');
  summaryHeader.className = 'text-xs uppercase tracking-wider text-zinc-500 font-semibold';
  summaryHeader.textContent = 'Summary';
  body.appendChild(summaryHeader);

  const summaryArea = document.createElement('textarea');
  summaryArea.className = 'w-full min-h-[120px] px-3 py-2 rounded bg-zinc-900 border border-zinc-600 text-zinc-100 text-xs leading-relaxed font-mono resize-y';
  summaryArea.value = proposal.summary;
  body.appendChild(summaryArea);

  const notesHeader = document.createElement('h3');
  notesHeader.className = 'text-xs uppercase tracking-wider text-zinc-500 font-semibold mt-2';
  notesHeader.textContent = `Session notes to add (${proposal.proposedNotes.length})`;
  body.appendChild(notesHeader);

  const notesIntro = document.createElement('p');
  notesIntro.className = 'text-xs text-zinc-500 leading-snug';
  notesIntro.textContent = 'These get appended to the session log so they survive future compactions and are visible to future agents. Uncheck any you do not want to keep, or edit the text in place.';
  body.appendChild(notesIntro);

  const notesContainer = document.createElement('div');
  notesContainer.className = 'flex flex-col gap-1';
  const noteRows: { include: HTMLInputElement; text: HTMLInputElement }[] = [];
  for (const note of proposal.proposedNotes) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.className = 'shrink-0 accent-blue-500';
    const txt = document.createElement('input');
    txt.type = 'text';
    txt.value = note;
    txt.className = 'flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-600 text-zinc-100 text-xs font-mono';
    row.appendChild(cb);
    row.appendChild(txt);
    notesContainer.appendChild(row);
    noteRows.push({ include: cb, text: txt });
  }
  if (proposal.proposedNotes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-zinc-500';
    empty.textContent = 'No notes proposed — the summary is enough.';
    notesContainer.appendChild(empty);
  }
  body.appendChild(notesContainer);

  modal.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'px-5 py-3 border-t border-zinc-700 flex items-center justify-end gap-2';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'px-3 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-700';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  footer.appendChild(cancelBtn);
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white';
  confirmBtn.textContent = 'Compact';
  confirmBtn.addEventListener('click', () => {
    const notes = noteRows
      .filter(r => r.include.checked)
      .map(r => r.text.value.trim())
      .filter(n => n.length > 0);
    closeModal();
    onConfirm({ summary: summaryArea.value.trim(), notes });
  });
  footer.appendChild(confirmBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modalEl = overlay;

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeModal(): void {
  modalEl?.remove();
  modalEl = null;
}
