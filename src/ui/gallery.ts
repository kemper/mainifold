// Gallery view — grid of version thumbnails for comparing iterations

import { listCurrentVersions, loadVersion, type Version } from '../storage/sessionManager';

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
  galleryEl.innerHTML = '';

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
