// Gallery view — grid of version thumbnails for comparing iterations

import { listCurrentVersions, loadVersionByIndex, getReferenceImagesFromSession, type Version, type ReferenceImagesData } from '../storage/sessionManager';

let galleryEl: HTMLElement | null = null;
let onLoadCode: ((code: string) => void) | null = null;

export function createGalleryView(container: HTMLElement, loadCode: (code: string) => void): void {
  galleryEl = container;
  onLoadCode = loadCode;

  window.addEventListener('session-changed', () => {
    if (galleryEl && !galleryEl.classList.contains('hidden')) refreshGallery();
  });
}

export async function refreshGallery(): Promise<void> {
  if (!galleryEl) return;

  const versions = await listCurrentVersions();
  const refImages = await getReferenceImagesFromSession();
  galleryEl.innerHTML = '';

  // Show reference images section if they exist
  if (refImages) {
    galleryEl.appendChild(createReferenceImagesSection(refImages));
  }

  if (versions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'flex items-center justify-center h-full text-zinc-500 text-sm';
    empty.textContent = 'No versions saved yet. Click "Save" to capture a version.';
    galleryEl.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid gap-3';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';

  for (const version of versions) {
    grid.appendChild(createTile(version));
  }

  galleryEl.appendChild(grid);
}

const REF_LABELS: { key: keyof ReferenceImagesData; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'right', label: 'Right' },
  { key: 'back', label: 'Back' },
  { key: 'left', label: 'Left' },
  { key: 'top', label: 'Top' },
  { key: 'perspective', label: 'Perspective' },
];

function createReferenceImagesSection(images: ReferenceImagesData): HTMLElement {
  const section = document.createElement('div');
  section.className = 'mb-4 pb-4 border-b border-zinc-700';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-2 mb-2';

  const icon = document.createElement('span');
  icon.className = 'text-blue-400 text-sm';
  icon.textContent = '\u{1F5BC}'; // framed picture unicode
  header.appendChild(icon);

  const title = document.createElement('span');
  title.className = 'text-xs font-mono font-medium text-zinc-300';
  title.textContent = 'Reference Images';
  header.appendChild(title);

  section.appendChild(header);

  const row = document.createElement('div');
  row.className = 'flex gap-2 overflow-x-auto';

  for (const { key, label } of REF_LABELS) {
    const src = images[key];
    if (!src) continue;

    const thumb = document.createElement('div');
    thumb.className = 'flex flex-col items-center shrink-0';

    const imgEl = document.createElement('img');
    imgEl.src = src;
    imgEl.className = 'w-24 h-24 object-contain rounded bg-zinc-800 border border-blue-500/30 cursor-pointer hover:border-blue-400 transition-colors';
    imgEl.title = `Click to enlarge: ${label}`;
    imgEl.addEventListener('click', () => showLightbox(src, label));
    thumb.appendChild(imgEl);

    const labelEl = document.createElement('div');
    labelEl.className = 'text-xs text-zinc-500 font-mono mt-0.5';
    labelEl.textContent = label;
    thumb.appendChild(labelEl);

    row.appendChild(thumb);
  }

  section.appendChild(row);
  return section;
}

function createTile(version: Version): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'bg-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group';
  tile.addEventListener('click', async () => {
    const v = await loadVersionByIndex(version.index);
    if (v && onLoadCode) onLoadCode(v.code);
  });

  // Thumbnail
  const thumbContainer = document.createElement('div');
  thumbContainer.className = 'aspect-square bg-zinc-900 flex items-center justify-center overflow-hidden';

  if (version.thumbnail) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(version.thumbnail);
    img.className = 'w-full h-full object-contain';
    img.addEventListener('load', () => URL.revokeObjectURL(img.src));
    thumbContainer.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'text-zinc-600 text-3xl';
    placeholder.textContent = '⬡';
    thumbContainer.appendChild(placeholder);
  }

  tile.appendChild(thumbContainer);

  // Info bar
  const info = document.createElement('div');
  info.className = 'px-3 py-2 space-y-1';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between';

  const label = document.createElement('span');
  label.className = 'text-xs font-mono font-medium text-zinc-200';
  label.textContent = version.label;
  header.appendChild(label);

  const time = document.createElement('span');
  time.className = 'text-xs text-zinc-500';
  time.textContent = formatTime(version.timestamp);
  header.appendChild(time);

  info.appendChild(header);

  // Stats from geometryData
  if (version.geometryData) {
    const stats = document.createElement('div');
    stats.className = 'text-xs text-zinc-500 font-mono';
    const gd = version.geometryData;
    const parts: string[] = [];

    if (gd.status === 'ok') {
      if (typeof gd.volume === 'number') parts.push(`vol: ${(gd.volume as number).toFixed(0)}`);
      const bbox = gd.boundingBox as { dimensions?: number[] } | null;
      if (bbox?.dimensions) {
        const d = bbox.dimensions;
        parts.push(`${d[0].toFixed(0)}×${d[1].toFixed(0)}×${d[2].toFixed(0)}`);
      }
      stats.textContent = parts.join(' · ');

      const dot = document.createElement('span');
      dot.className = 'inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1';
      dot.style.verticalAlign = 'middle';
      label.appendChild(dot);
    } else if (gd.status === 'error') {
      stats.textContent = `Error: ${gd.error}`;
      stats.className += ' text-red-400';

      const dot = document.createElement('span');
      dot.className = 'inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-1';
      dot.style.verticalAlign = 'middle';
      label.appendChild(dot);
    }

    info.appendChild(stats);
  }

  // Version notes (design rationale)
  if (version.notes) {
    const notesEl = document.createElement('div');
    notesEl.className = 'text-xs text-zinc-400 mt-1 line-clamp-2';
    notesEl.textContent = version.notes;
    notesEl.title = version.notes;
    info.appendChild(notesEl);
  }

  tile.appendChild(info);
  return tile;
}

function showLightbox(src: string, label: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const container = document.createElement('div');
  container.className = 'relative max-w-[90vw] max-h-[90vh] flex flex-col items-center';

  const img = document.createElement('img');
  img.src = src;
  img.className = 'max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl';
  container.appendChild(img);

  const caption = document.createElement('div');
  caption.className = 'text-sm text-zinc-300 font-mono mt-2';
  caption.textContent = `Reference: ${label}`;
  container.appendChild(caption);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-700 text-zinc-300 hover:bg-zinc-600 flex items-center justify-center text-lg';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => overlay.remove());
  container.appendChild(closeBtn);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Close on Escape
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
