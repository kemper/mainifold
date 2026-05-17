// Toolbar overlay button for the free-sculpt "Push vertex" tool. Lives next
// to the paint button in the viewport overlay; enabled only when the active
// version is `source: 'mesh'`.

import { activate, deactivate, isActive } from './freeSculpt';

let btn: HTMLButtonElement | null = null;
let onActivate: (() => void) | null = null;
let onDeactivate: (() => void) | null = null;

export function initFreeSculptUI(controlsContainer: HTMLElement, callbacks: {
  onActivate?: () => void;
  onDeactivate?: () => void;
} = {}): void {
  onActivate = callbacks.onActivate ?? null;
  onDeactivate = callbacks.onDeactivate ?? null;

  btn = document.createElement('button');
  btn.id = 'sculpt-push-toggle';
  btn.className = inactiveClass();
  btn.textContent = 'Push vertex';
  btn.title = 'Push the nearest vertex of the clicked face along its normal (frozen-mesh only)';
  btn.disabled = true;
  btn.style.display = 'none';
  btn.addEventListener('click', toggle);

  // Insert before the paint toggle if it exists so the related sculpt tools
  // cluster on the left of the strip; fall back to appending.
  const paintBtn = controlsContainer.querySelector('#paint-toggle');
  if (paintBtn) {
    controlsContainer.insertBefore(btn, paintBtn);
  } else {
    controlsContainer.appendChild(btn);
  }
}

/** Show / hide the button based on whether the active version is a frozen
 *  mesh. When hidden, the tool is force-deactivated so we don't leave the
 *  mousedown listener attached. */
export function setSculptEnabled(enabled: boolean): void {
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.display = enabled ? '' : 'none';
  if (!enabled && isActive()) {
    deactivate();
    btn.className = inactiveClass();
    if (onDeactivate) onDeactivate();
  }
}

function toggle(): void {
  if (!btn) return;
  if (isActive()) {
    deactivate();
    btn.className = inactiveClass();
    if (onDeactivate) onDeactivate();
  } else {
    activate();
    btn.className = activeClass();
    if (onActivate) onActivate();
  }
}

/** Force-deactivate from outside (e.g. when version changes off a frozen-mesh). */
export function forceDeactivateSculpt(): void {
  if (!btn) return;
  if (isActive()) {
    deactivate();
    btn.className = inactiveClass();
    if (onDeactivate) onDeactivate();
  }
}

function inactiveClass(): string {
  return 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
}

function activeClass(): string {
  return 'px-2 py-1 rounded text-xs bg-indigo-500/30 backdrop-blur text-indigo-100 hover:bg-indigo-500/40 transition-colors border border-indigo-400/60';
}
