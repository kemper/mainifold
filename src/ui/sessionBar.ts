// Session bar — thin strip below toolbar showing session state

import {
  getState,
  onStateChange,
  createSession,
  closeSession,
  saveVersion,
  navigateVersion,
  renameSession,
  type SessionState,
} from '../storage/sessionManager';
import { getReferenceImages } from '../renderer/multiview';

export interface SessionBarCallbacks {
  onSaveVersion: () => Promise<{ code: string; geometryData: Record<string, unknown> | null; thumbnail: Blob | null }>;
  onLoadVersion: (code: string) => void;
  onOpenGallery: () => void;
  onOpenSessionList: () => void;
  onLoadReferenceImages: (images: Record<string, string>) => void;
  onNewSession: () => void;
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

  // Version nav
  if (state.currentVersion && state.versionCount > 0) {
    const atFirst = state.currentVersion.index <= 1;
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

    const atLast = state.currentVersion.index >= state.versionCount;
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

  // Save version (with guard against double-click)
  let saving = false;
  const saveBtn = btn('\uD83D\uDCBE Save', async () => {
    if (saving) return;
    saving = true;
    saveBtn.disabled = true;
    saveBtn.className += ' opacity-50';
    try {
      const data = await callbacks.onSaveVersion();
      const label = `v${state.versionCount + 1}`;
      await saveVersion(data.code, data.geometryData, data.thumbnail, label);
    } finally {
      saving = false;
    }
  });
  saveBtn.id = 'btn-save-version';
  barEl.appendChild(saveBtn);

  // Gallery
  const galleryBtn = btn('\u25A6 Gallery', () => callbacks.onOpenGallery());
  galleryBtn.id = 'btn-gallery';
  barEl.appendChild(galleryBtn);

  // Reference images indicator + loader
  const refImages = getReferenceImages();
  if (refImages) {
    const refCount = Object.values(refImages).filter(Boolean).length;
    const refBadge = el('span', 'text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded', `Ref (${refCount})`);
    refBadge.title = `${refCount} reference image(s) loaded`;
    barEl.appendChild(refBadge);
  }
  barEl.appendChild(createRefLoader());

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

const ANGLE_KEYS = ['front', 'right', 'back', 'left', 'top', 'perspective'] as const;

function createRefLoader(): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.id = 'btn-ref-upload';
  wrapper.className = 'relative';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.className = 'hidden';
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const images: Record<string, string> = {};

    for (const file of files) {
      const name = file.name.toLowerCase();
      const dataUrl = await readFileAsDataURL(file);
      const matched = ANGLE_KEYS.find(a => name.includes(a));
      if (matched) {
        images[matched] = dataUrl;
      } else {
        // Default unmatched files to perspective
        images.perspective = dataUrl;
      }
    }

    callbacks.onLoadReferenceImages(images);
    input.value = '';
  });

  const button = document.createElement('button');
  button.className = 'px-2 py-0.5 rounded text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors cursor-pointer';
  button.textContent = '\uD83D\uDCF7 Refs';
  button.title = 'Upload reference images. Name files by angle (front.jpg, right.png, etc.) for multi-view comparison, or load a single photo as perspective.';
  button.addEventListener('click', () => input.click());

  wrapper.appendChild(input);
  wrapper.appendChild(button);
  return wrapper;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}
