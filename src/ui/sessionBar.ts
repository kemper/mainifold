// Session bar — thin strip below toolbar showing session state

import {
  getState,
  onStateChange,
  createSession,
  closeSession,
  saveVersion,
  navigateVersion,
  type SessionState,
} from '../storage/sessionManager';

export interface SessionBarCallbacks {
  onSaveVersion: () => Promise<{ code: string; geometryData: Record<string, unknown> | null; thumbnail: Blob | null }>;
  onLoadVersion: (code: string) => void;
  onOpenGallery: () => void;
  onOpenSessionList: () => void;
}

let barEl: HTMLElement | null = null;
let callbacks: SessionBarCallbacks;

export function createSessionBar(container: HTMLElement, cb: SessionBarCallbacks): HTMLElement {
  callbacks = cb;

  const bar = document.createElement('div');
  bar.id = 'session-bar';
  bar.className = 'flex items-center gap-2 px-3 py-1 bg-zinc-850 border-b border-zinc-700 text-xs shrink-0';
  bar.style.backgroundColor = '#1a1a2e';

  barEl = bar;
  render(getState());
  onStateChange(render);

  container.appendChild(bar);
  return bar;
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
    });
    barEl.appendChild(btnNew);

    const btnList = btn('Sessions…', () => callbacks.onOpenSessionList());
    barEl.appendChild(btnList);

    return;
  }

  // Active session
  const nameEl = el('span', 'text-zinc-300 font-mono font-medium truncate max-w-48', state.session.name);
  nameEl.title = state.session.name;
  barEl.appendChild(nameEl);

  // Separator
  barEl.appendChild(el('span', 'text-zinc-600', '|'));

  // Version nav
  if (state.currentVersion && state.versionCount > 0) {
    const prevBtn = btn('◀', async () => {
      const v = await navigateVersion('prev');
      if (v) callbacks.onLoadVersion(v.code);
    });
    prevBtn.className += state.currentVersion.index <= 1 ? ' opacity-30 cursor-default' : '';
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

    const nextBtn = btn('▶', async () => {
      const v = await navigateVersion('next');
      if (v) callbacks.onLoadVersion(v.code);
    });
    nextBtn.className += state.currentVersion.index >= state.versionCount ? ' opacity-30 cursor-default' : '';
    barEl.appendChild(nextBtn);
  } else {
    barEl.appendChild(el('span', 'text-zinc-500 font-mono', 'no versions'));
  }

  barEl.appendChild(el('span', 'text-zinc-600', '|'));

  // Save version
  const saveBtn = btn('💾 Save', async () => {
    const data = await callbacks.onSaveVersion();
    const label = `v${state.versionCount + 1}`;
    await saveVersion(data.code, data.geometryData, data.thumbnail, label);
  });
  barEl.appendChild(saveBtn);

  // Gallery
  const galleryBtn = btn('▦ Gallery', () => callbacks.onOpenGallery());
  barEl.appendChild(galleryBtn);

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

function el(tag: string, className: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

function btn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'px-1.5 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors text-xs';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
