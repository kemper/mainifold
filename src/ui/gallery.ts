// Gallery view — grid of version thumbnails for comparing iterations,
// plus a read-only strip of attached reference images at the top.

import { listCurrentVersions, loadVersion, type Version } from '../storage/sessionManager';
import { getImages, type AttachedImage } from '../renderer/multiview';

let galleryEl: HTMLElement | null = null;
let onLoadCode: ((code: string) => void) | null = null;

export function createGalleryView(container: HTMLElement, loadCode: (code: string) => void): void {
  galleryEl = container;
  onLoadCode = loadCode;

  window.addEventListener('session-changed', () => {
    if (galleryEl && !galleryEl.classList.contains('hidden')) refreshGallery();
  });
  // Re-render when images are attached/removed/relabeled elsewhere.
  window.addEventListener('images-changed', () => {
    if (galleryEl && !galleryEl.classList.contains('hidden')) refreshGallery();
  });
}

export async function refreshGallery(): Promise<void> {
  if (!galleryEl) return;

  const versions = await listCurrentVersions();
  const images = getImages();
  galleryEl.innerHTML = '';

  if (images.length > 0) {
    galleryEl.appendChild(createImagesSection(images));
  }

  if (versions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'flex items-center justify-center text-zinc-500 text-sm py-12';
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

function createImagesSection(images: AttachedImage[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'mb-4 pb-4 border-b border-zinc-700';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-2 mb-2';

  const icon = document.createElement('span');
  icon.className = 'text-blue-400 text-sm';
  icon.textContent = '\u{1F5BC}';
  header.appendChild(icon);

  const title = document.createElement('span');
  title.className = 'text-xs font-mono font-medium text-zinc-300';
  title.textContent = `Images (${images.length})`;
  header.appendChild(title);

  section.appendChild(header);

  const angleOrder = ['perspective', 'front', 'right', 'back', 'left', 'top'] as const;
  const sorted = [...images].sort((a, b) => angleOrder.indexOf(a.angle) - angleOrder.indexOf(b.angle));

  const row = document.createElement('div');
  row.className = 'flex gap-2 overflow-x-auto';

  for (const item of sorted) {
    const thumb = document.createElement('div');
    thumb.className = 'flex flex-col items-center shrink-0';

    const caption = (item.label ?? '').trim();
    const imgEl = document.createElement('img');
    imgEl.src = item.src;
    imgEl.className = 'w-24 h-24 object-contain rounded bg-zinc-800 border border-blue-500/30 cursor-pointer hover:border-blue-400 transition-colors';
    imgEl.title = caption ? `Click to enlarge: ${caption}` : 'Click to enlarge';
    imgEl.addEventListener('click', () => showLightbox(item.src, caption));
    thumb.appendChild(imgEl);

    // Caption only shows the user-provided label. Angle is system metadata
    // surfaced in the Images tab, not used as a fallback caption here — the
    // image content speaks for itself.
    if (caption) {
      const labelEl = document.createElement('div');
      labelEl.className = 'text-xs text-zinc-300 font-mono mt-0.5 max-w-24 truncate';
      labelEl.title = caption;
      labelEl.textContent = caption;
      thumb.appendChild(labelEl);
    }

    row.appendChild(thumb);
  }

  section.appendChild(row);
  return section;
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

  if (label) {
    const caption = document.createElement('div');
    caption.className = 'text-sm text-zinc-300 font-mono mt-2';
    caption.textContent = label;
    container.appendChild(caption);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-700 text-zinc-300 hover:bg-zinc-600 flex items-center justify-center text-lg';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => overlay.remove());
  container.appendChild(closeBtn);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

function createTile(version: Version): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'bg-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group';
  tile.addEventListener('click', async () => {
    const v = await loadVersion(version.index);
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

  // Color region badge — show swatch dots if version has color regions
  if (version.geometryData) {
    const colorRegions = (version.geometryData as Record<string, unknown>).colorRegions as
      { color: [number, number, number] }[] | undefined;
    if (colorRegions && colorRegions.length > 0) {
      const badge = document.createElement('div');
      badge.className = 'flex items-center gap-0.5 ml-1';
      badge.title = `${colorRegions.length} color region${colorRegions.length > 1 ? 's' : ''}`;

      const shown = colorRegions.slice(0, 3);
      for (const region of shown) {
        const dot = document.createElement('span');
        dot.className = 'inline-block w-2.5 h-2.5 rounded-sm';
        const [r, g, b] = region.color;
        dot.style.backgroundColor = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        badge.appendChild(dot);
      }
      if (colorRegions.length > 3) {
        const more = document.createElement('span');
        more.className = 'text-[9px] text-zinc-500';
        more.textContent = `+${colorRegions.length - 3}`;
        badge.appendChild(more);
      }
      header.appendChild(badge);
    }
  }

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

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
