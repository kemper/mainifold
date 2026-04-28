// Modal for browsing and loading example models. Replaces the old
// <select> dropdown with a categorized, previewable picker that mirrors
// the visual language of the Import/Export dropdowns.

import type { ExampleEntry } from './toolbar';

type Language = 'manifold-js' | 'scad';

interface ExampleItem {
  key: string;
  entry: ExampleEntry;
  displayName: string;
  description: string;
  preview: string;
}

/** Convert "openscad_basic.scad" / "chess_rook.js" → "Basic" / "Chess Rook". */
function deriveDisplayName(key: string, language: Language): string {
  let name = key
    .replace(/^.*\//, '')
    .replace(/\.(js|scad)$/, '');
  if (language === 'scad') {
    name = name.replace(/^openscad_/i, '');
  }
  if (!name) name = key;
  return name
    .split('_')
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}

/** First non-empty `// …` comment line, stripped. Falls back to a generic blurb. */
function deriveDescription(code: string, language: Language): string {
  const lines = code.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\/\/\s?(.*)$/);
    if (m) {
      const text = m[1].trim();
      if (text) return text;
      continue;
    }
    break;
  }
  return language === 'scad' ? 'OpenSCAD example.' : 'JavaScript example.';
}

/** Trim a leading description comment then take the next ~6 substantive lines. */
function derivePreview(code: string): string {
  const lines = code.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim().startsWith('//')) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  const out: string[] = [];
  for (; i < lines.length && out.length < 6; i++) {
    out.push(lines[i]);
  }
  return out.join('\n').trimEnd();
}

function buildItems(examples: Record<string, ExampleEntry>): ExampleItem[] {
  return Object.entries(examples).map(([key, entry]) => ({
    key,
    entry,
    displayName: deriveDisplayName(key, entry.language),
    description: deriveDescription(entry.code, entry.language),
    preview: derivePreview(entry.code),
  }));
}

const TAB_ACTIVE = 'px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-700 text-zinc-100 transition-colors';
const TAB_INACTIVE = 'px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors';

/**
 * Show the examples picker modal. Calls `onSelect` with the chosen example
 * and closes itself; resolves once the modal is dismissed (via Escape, the
 * close button, the backdrop, or after a selection).
 */
export function showExamplesModal(
  examples: Record<string, ExampleEntry>,
  onSelect: (key: string, entry: ExampleEntry) => void,
): Promise<void> {
  return new Promise((resolve) => {
    document.querySelector('.examples-modal-overlay')?.remove();

    const items = buildItems(examples);
    const jsItems = items.filter((it) => it.entry.language === 'manifold-js');
    const scadItems = items.filter((it) => it.entry.language === 'scad');

    const overlay = document.createElement('div');
    overlay.className = 'examples-modal-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center';

    const modal = document.createElement('div');
    modal.className = 'bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl flex flex-col w-[min(48rem,calc(100vw-2rem))] max-h-[min(40rem,calc(100vh-4rem))] mx-4 animate-modal-in';

    // Header: title + close button
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-3 px-5 pt-4 pb-2';

    const titleEl = document.createElement('h2');
    titleEl.className = 'text-zinc-100 text-base font-semibold';
    titleEl.textContent = 'Load example';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors text-base leading-none';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00D7';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Sub-header: explanatory note about session creation
    const note = document.createElement('p');
    note.className = 'px-5 pb-3 text-[11px] text-zinc-400 leading-relaxed';
    note.textContent = 'Loading an example starts a new session — your current session is saved automatically.';

    // Tabs
    const tabBar = document.createElement('div');
    tabBar.className = 'flex items-center gap-1 px-4 pb-3 border-b border-zinc-700';

    const jsTab = document.createElement('button');
    jsTab.className = TAB_ACTIVE;
    jsTab.textContent = `JavaScript (${jsItems.length})`;

    const scadTab = document.createElement('button');
    scadTab.className = TAB_INACTIVE;
    scadTab.textContent = `OpenSCAD (${scadItems.length})`;

    tabBar.appendChild(jsTab);
    tabBar.appendChild(scadTab);

    // Body: scrollable grid of example cards
    const body = document.createElement('div');
    body.className = 'flex-1 overflow-y-auto px-4 py-3';

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';
    body.appendChild(grid);

    function renderTab(tab: 'js' | 'scad') {
      jsTab.className = tab === 'js' ? TAB_ACTIVE : TAB_INACTIVE;
      scadTab.className = tab === 'scad' ? TAB_ACTIVE : TAB_INACTIVE;
      const list = tab === 'js' ? jsItems : scadItems;
      grid.replaceChildren(...list.map(renderCard));
      if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'col-span-full text-center text-xs text-zinc-500 py-8';
        empty.textContent = 'No examples available.';
        grid.appendChild(empty);
      }
    }

    function renderCard(item: ExampleItem): HTMLElement {
      const card = document.createElement('button');
      card.className = 'flex flex-col items-stretch text-left p-3 bg-zinc-900/60 hover:bg-zinc-700/60 border border-zinc-700 hover:border-zinc-500 rounded-lg transition-colors';

      const top = document.createElement('div');
      top.className = 'flex items-center gap-1.5 mb-1';

      const nameEl = document.createElement('span');
      nameEl.className = 'text-sm text-zinc-100 font-medium truncate';
      nameEl.textContent = item.displayName;
      top.appendChild(nameEl);

      const desc = document.createElement('div');
      desc.className = 'text-[11px] text-zinc-400 leading-snug mb-2 line-clamp-2';
      desc.textContent = item.description;

      const previewWrap = document.createElement('pre');
      previewWrap.className = 'text-[10px] leading-tight font-mono text-zinc-400 bg-zinc-900/80 border border-zinc-700/60 rounded px-2 py-1.5 overflow-hidden whitespace-pre';
      previewWrap.style.maxHeight = '5.5rem';
      previewWrap.textContent = item.preview;

      card.appendChild(top);
      card.appendChild(desc);
      card.appendChild(previewWrap);

      card.addEventListener('click', () => {
        finish();
        onSelect(item.key, item.entry);
      });

      return card;
    }

    jsTab.addEventListener('click', () => renderTab('js'));
    scadTab.addEventListener('click', () => renderTab('scad'));

    // Default to whichever tab has items; prefer JS.
    renderTab(jsItems.length > 0 ? 'js' : 'scad');

    modal.appendChild(header);
    modal.appendChild(note);
    modal.appendChild(tabBar);
    modal.appendChild(body);
    overlay.appendChild(modal);

    let resolved = false;
    function finish() {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve();
    }

    closeBtn.addEventListener('click', finish);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish();
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish();
    }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
  });
}
