// Frozen-mesh editor notice — shown in place of the code editor (or layered
// on top via a banner) when the current version is `source: 'mesh'`. The
// code editor is also set read-only and the Run button disabled, mirroring
// the existing color-lock pattern.

import { setReadOnly } from '../editor/codeEditor';

let notice: HTMLElement | null = null;
let editorContainer: HTMLElement | null = null;
let runButton: HTMLButtonElement | null = null;
let autoRunButton: HTMLButtonElement | null = null;
let active = false;

export function initFreeMeshUI(container: HTMLElement): void {
  editorContainer = container;
  runButton = document.getElementById('btn-run') as HTMLButtonElement | null;
  autoRunButton = document.getElementById('btn-auto-run') as HTMLButtonElement | null;
}

export function isFreeMeshActive(): boolean {
  return active;
}

/** Toggle the frozen-mesh editor banner + read-only lock + run-disable.
 *  Pass the timestamp the mesh was imported/last edited (shown to the user)
 *  or null to hide the notice. */
export function setFreeMeshNotice(timestamp: number | null): void {
  const shouldShow = timestamp !== null;
  if (shouldShow === active) {
    if (shouldShow && notice) updateTimestampDisplay(notice, timestamp);
    return;
  }
  active = shouldShow;
  setReadOnly(active);
  if (active) {
    showNotice(timestamp);
    disableRun();
  } else {
    hideNotice();
    enableRun();
  }
}

function showNotice(timestamp: number | null): void {
  if (notice || !editorContainer) return;
  const editorPane = editorContainer.parentElement;
  if (!editorPane) return;

  notice = document.createElement('div');
  notice.id = 'free-mesh-notice';
  notice.className = 'flex items-center justify-between px-3 py-1.5 bg-indigo-900/60 border-b border-indigo-500/40 text-xs text-indigo-200 shrink-0';

  const msg = document.createElement('span');
  msg.dataset.role = 'free-mesh-msg';
  notice.appendChild(msg);
  updateTimestampDisplay(notice, timestamp);

  const convertBtn = document.createElement('button');
  convertBtn.className = 'px-2 py-0.5 rounded text-xs bg-zinc-700/40 text-zinc-400 border border-zinc-600/40 cursor-not-allowed opacity-60';
  convertBtn.textContent = 'Convert to code';
  convertBtn.disabled = true;
  convertBtn.title = 'Not implemented in this prototype';
  notice.appendChild(convertBtn);

  editorPane.insertBefore(notice, editorContainer);
}

function updateTimestampDisplay(noticeEl: HTMLElement, timestamp: number | null): void {
  const msg = noticeEl.querySelector('[data-role="free-mesh-msg"]') as HTMLElement | null;
  if (!msg) return;
  const stamp = timestamp ? new Date(timestamp).toLocaleString() : 'an unknown time';
  msg.textContent = `🧊 This version is a frozen mesh imported on ${stamp}. Source code is not available.`;
}

function hideNotice(): void {
  if (notice) {
    notice.remove();
    notice = null;
  }
}

function disableRun(): void {
  if (runButton) {
    runButton.disabled = true;
    runButton.classList.add('opacity-40', 'pointer-events-none');
  }
  if (autoRunButton) {
    autoRunButton.disabled = true;
    autoRunButton.classList.add('opacity-40', 'pointer-events-none');
  }
}

function enableRun(): void {
  if (runButton) {
    runButton.disabled = false;
    runButton.classList.remove('opacity-40', 'pointer-events-none');
  }
  if (autoRunButton) {
    autoRunButton.disabled = false;
    autoRunButton.classList.remove('opacity-40', 'pointer-events-none');
  }
}
