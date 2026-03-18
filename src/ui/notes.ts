// Notes panel — list, create, edit, delete session notes

import { listSessionNotes, addSessionNote, getState, type SessionNote } from '../storage/sessionManager';
import { deleteNote as dbDeleteNote, updateNote as dbUpdateNote } from '../storage/db';

let notesEl: HTMLElement | null = null;

export function createNotesView(container: HTMLElement): void {
  notesEl = container;

  window.addEventListener('session-changed', () => {
    if (notesEl && !notesEl.classList.contains('hidden')) refreshNotes();
  });
}

export async function refreshNotes(): Promise<void> {
  if (!notesEl) return;
  notesEl.innerHTML = '';

  const state = getState();
  if (!state.session) {
    const empty = document.createElement('div');
    empty.className = 'flex items-center justify-center flex-1 text-zinc-500 text-sm';
    empty.textContent = 'Open a session to view and add notes.';
    notesEl.appendChild(empty);
    return;
  }

  const notes = await listSessionNotes();

  // Note input at top
  notesEl.appendChild(createNoteInput());

  if (notes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'flex items-center justify-center flex-1 text-zinc-500 text-sm';
    empty.textContent = 'No notes yet. Add one above.';
    notesEl.appendChild(empty);
    return;
  }

  // Notes list
  const list = document.createElement('div');
  list.className = 'space-y-2 mt-3';

  for (const note of notes) {
    list.appendChild(createNoteRow(note));
  }

  notesEl.appendChild(list);
}

function createNoteInput(): HTMLElement {
  const form = document.createElement('form');
  form.className = 'flex gap-2 shrink-0';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Add a note...';
  input.className = 'flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono';

  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.textContent = 'Add';
  btn.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  btn.disabled = true;

  input.addEventListener('input', () => {
    btn.disabled = input.value.trim().length === 0;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    btn.disabled = true;
    input.disabled = true;
    await addSessionNote(text);
    input.value = '';
    input.disabled = false;
    input.focus();
    await refreshNotes();
  });

  form.appendChild(input);
  form.appendChild(btn);
  return form;
}

function createNoteRow(note: SessionNote): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 group';

  // Top: text content (or edit input)
  const textEl = document.createElement('div');
  textEl.className = 'text-sm text-zinc-300 whitespace-pre-wrap';
  textEl.textContent = note.text;
  row.appendChild(textEl);

  // Bottom: timestamp + actions
  const footer = document.createElement('div');
  footer.className = 'flex items-center justify-between mt-2';

  const time = document.createElement('span');
  time.className = 'text-xs text-zinc-500 font-mono';
  time.textContent = formatTime(note.timestamp);
  footer.appendChild(time);

  const actions = document.createElement('div');
  actions.className = 'flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity';

  const editBtn = document.createElement('button');
  editBtn.className = 'text-xs text-zinc-500 hover:text-blue-400 transition-colors';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => enterEditMode(row, note));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'text-xs text-zinc-500 hover:text-red-400 transition-colors';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', async () => {
    await dbDeleteNote(note.id);
    await refreshNotes();
  });
  actions.appendChild(deleteBtn);

  footer.appendChild(actions);
  row.appendChild(footer);

  return row;
}

function enterEditMode(row: HTMLElement, note: SessionNote): void {
  // Replace text with textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'w-full bg-zinc-700 border border-blue-500 rounded px-2 py-1.5 text-sm text-zinc-200 font-mono focus:outline-none resize-none';
  textarea.value = note.text;
  textarea.rows = Math.max(2, note.text.split('\n').length);

  const btnRow = document.createElement('div');
  btnRow.className = 'flex gap-2 mt-2';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded font-medium transition-colors';
  cancelBtn.textContent = 'Cancel';

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);

  // Hide original content, show edit UI
  const originalHTML = row.innerHTML;
  row.innerHTML = '';
  row.appendChild(textarea);
  row.appendChild(btnRow);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  cancelBtn.addEventListener('click', () => {
    row.innerHTML = originalHTML;
    // Rebind event listeners by refreshing
    refreshNotes();
  });

  saveBtn.addEventListener('click', async () => {
    const newText = textarea.value.trim();
    if (!newText) return;
    await dbUpdateNote(note.id, newText);
    await refreshNotes();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelBtn.click();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      saveBtn.click();
    }
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
