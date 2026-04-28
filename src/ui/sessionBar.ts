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
  bar.className = 'flex items-center gap-2 px-3 py-1 bg-zinc-800 border-b border-zinc-700 text-xs shrink-0';

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
type AngleKey = typeof ANGLE_KEYS[number];

function createRefLoader(): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.id = 'btn-ref-upload';
  wrapper.className = 'relative';

  const button = document.createElement('button');
  button.className = 'px-2 py-0.5 rounded text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors cursor-pointer';
  button.textContent = '\uD83D\uDCF7 Refs';
  button.title = 'Load reference images for side-by-side comparison in the Elevations tab.';
  button.addEventListener('click', () => showRefUploadModal());

  wrapper.appendChild(button);
  return wrapper;
}

function showRefUploadModal(): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';

  const modal = document.createElement('div');
  modal.className = 'bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4';

  const title = document.createElement('h2');
  title.className = 'text-base font-semibold text-zinc-100 mb-2';
  title.textContent = 'Load reference images';

  const explanation = document.createElement('p');
  explanation.className = 'text-sm text-zinc-400 mb-4 leading-relaxed';
  explanation.textContent = 'Reference images are photos or renderings you want your model to match. They appear next to each elevation view in the Elevations tab so you (or an AI agent) can compare silhouettes and proportions side-by-side. Add up to one image per angle: front, right, back, left, top, or perspective.';

  // File upload section
  const fileSection = document.createElement('div');
  fileSection.className = 'mb-4 p-3 rounded border border-zinc-700 bg-zinc-900/50';

  const fileLabel = document.createElement('div');
  fileLabel.className = 'text-xs font-semibold text-zinc-300 mb-1';
  fileLabel.textContent = 'Upload from your computer';

  const fileHint = document.createElement('div');
  fileHint.className = 'text-xs text-zinc-500 mb-2 leading-relaxed';
  fileHint.textContent = 'Select one or more images. Filenames containing front/right/back/left/top/perspective auto-assign by angle; anything else loads as perspective.';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.className = 'hidden';
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;

    const images: Record<string, string> = {};
    for (const file of files) {
      const name = file.name.toLowerCase();
      const dataUrl = await readFileAsDataURL(file);
      const matched = ANGLE_KEYS.find(a => name.includes(a));
      images[matched ?? 'perspective'] = dataUrl;
    }

    callbacks.onLoadReferenceImages(images);
    fileInput.value = '';
    backdrop.remove();
  });

  const fileBtn = document.createElement('button');
  fileBtn.className = 'px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors';
  fileBtn.textContent = 'Choose files…';
  fileBtn.addEventListener('click', () => fileInput.click());

  fileSection.appendChild(fileLabel);
  fileSection.appendChild(fileHint);
  fileSection.appendChild(fileInput);
  fileSection.appendChild(fileBtn);

  // URL section
  const urlSection = document.createElement('div');
  urlSection.className = 'mb-4 p-3 rounded border border-zinc-700 bg-zinc-900/50';

  const urlLabel = document.createElement('div');
  urlLabel.className = 'text-xs font-semibold text-zinc-300 mb-1';
  urlLabel.textContent = 'Paste an image URL';

  const urlHint = document.createElement('div');
  urlHint.className = 'text-xs text-zinc-500 mb-2 leading-relaxed';
  urlHint.textContent = 'The URL must serve the image with permissive CORS headers. If the host blocks cross-origin requests, download the file and use Upload above.';

  const urlRow = document.createElement('div');
  urlRow.className = 'flex gap-2 items-stretch';

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.placeholder = 'https://example.com/photo.jpg';
  urlInput.className = 'flex-1 bg-zinc-800 text-zinc-200 font-mono text-xs px-2 py-1.5 rounded border border-zinc-600 outline-none focus:border-blue-500';

  const angleSelect = document.createElement('select');
  angleSelect.className = 'bg-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded border border-zinc-600 outline-none focus:border-blue-500';
  for (const angle of ANGLE_KEYS) {
    const opt = document.createElement('option');
    opt.value = angle;
    opt.textContent = angle.charAt(0).toUpperCase() + angle.slice(1);
    angleSelect.appendChild(opt);
  }
  angleSelect.value = 'perspective';

  const urlBtn = document.createElement('button');
  urlBtn.className = 'px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  urlBtn.textContent = 'Load URL';

  const urlError = document.createElement('div');
  urlError.className = 'text-xs text-red-400 mt-2 hidden leading-relaxed';

  urlInput.addEventListener('input', () => {
    const url = urlInput.value.trim().toLowerCase();
    const matched = ANGLE_KEYS.find(a => url.includes(a));
    if (matched) angleSelect.value = matched;
  });

  urlBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    urlError.classList.add('hidden');
    urlBtn.disabled = true;
    const original = urlBtn.textContent;
    urlBtn.textContent = 'Loading…';
    try {
      const dataUrl = await fetchImageAsDataURL(url);
      const angle = angleSelect.value as AngleKey;
      callbacks.onLoadReferenceImages({ [angle]: dataUrl });
      backdrop.remove();
    } catch (err) {
      urlError.textContent = `Could not load image: ${(err as Error).message}. The host may block cross-origin requests — try downloading and uploading instead.`;
      urlError.classList.remove('hidden');
      urlBtn.disabled = false;
      urlBtn.textContent = original;
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !urlBtn.disabled) urlBtn.click();
  });

  urlRow.appendChild(urlInput);
  urlRow.appendChild(angleSelect);
  urlRow.appendChild(urlBtn);

  urlSection.appendChild(urlLabel);
  urlSection.appendChild(urlHint);
  urlSection.appendChild(urlRow);
  urlSection.appendChild(urlError);

  // Footer
  const btnRow = document.createElement('div');
  btnRow.className = 'flex justify-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => backdrop.remove());

  btnRow.appendChild(cancelBtn);

  modal.appendChild(title);
  modal.appendChild(explanation);
  modal.appendChild(fileSection);
  modal.appendChild(urlSection);
  modal.appendChild(btnRow);
  backdrop.appendChild(modal);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(backdrop);
  urlInput.focus();
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

async function fetchImageAsDataURL(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('only http(s) URLs are supported');
  }

  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`expected an image, got ${contentType || 'unknown content-type'}`);
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('failed to read blob'));
    reader.readAsDataURL(blob);
  });
}
