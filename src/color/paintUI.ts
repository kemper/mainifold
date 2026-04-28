// Paint mode UI — button toggle, color picker, region count badge,
// undo/redo/hide/clear actions.

import { activate, deactivate, isActive, setColor } from './paintMode';
import {
  getRegions,
  onChange as onRegionsChange,
  onRedoChange,
  onVisibilityChange,
  isVisible as isPaintVisible,
  setVisible as setPaintVisible,
  removeLastRegion,
  redoLastRegion,
  canRedoRegion,
  clearRegions,
} from './regions';
import { forceDeactivate as forceDeactivateAnnotate } from '../annotations/annotateUI';
import { forceDeactivate as forceDeactivateAnnotateText } from '../annotations/textMode';
import { forceDeactivate as forceDeactivateAnnotateSelect } from '../annotations/selectMode';

const PRESET_COLORS: [number, number, number][] = [
  [0.92, 0.26, 0.21], // red
  [0.13, 0.59, 0.95], // blue
  [0.30, 0.69, 0.31], // green
  [1.00, 0.76, 0.03], // yellow
  [0.61, 0.15, 0.69], // purple
  [1.00, 0.60, 0.00], // orange
  [0.00, 0.74, 0.83], // teal
  [0.91, 0.12, 0.39], // pink
];

let paintBtn: HTMLButtonElement | null = null;
let pickerPanel: HTMLElement | null = null;
let regionCountBadge: HTMLElement | null = null;
let visibilityBtn: HTMLButtonElement | null = null;
let undoBtn: HTMLButtonElement | null = null;
let redoBtn: HTMLButtonElement | null = null;

/** Initialize the paint UI inside the clip-controls overlay area. */
export function initPaintUI(controlsContainer: HTMLElement): void {
  // Paint toggle button
  paintBtn = document.createElement('button');
  paintBtn.id = 'paint-toggle';
  paintBtn.className = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
  paintBtn.textContent = '\uD83C\uDFA8 Paint';
  paintBtn.title = 'Paint color regions on model faces';

  // Region count badge
  regionCountBadge = document.createElement('span');
  regionCountBadge.className = 'hidden ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white leading-none';
  paintBtn.appendChild(regionCountBadge);

  paintBtn.addEventListener('click', togglePaintMode);

  // Insert before the measure toggle
  const measureBtn = controlsContainer.querySelector('#measure-toggle');
  if (measureBtn) {
    controlsContainer.insertBefore(paintBtn, measureBtn);
  } else {
    controlsContainer.appendChild(paintBtn);
  }

  // Color picker panel (hidden by default)
  pickerPanel = createPickerPanel();
  controlsContainer.appendChild(pickerPanel);

  // Update badge + button states when regions / redo / visibility change
  onRegionsChange(() => {
    updateBadge();
    updateUndoButton();
  });
  onRedoChange(updateRedoButton);
  onVisibilityChange(updateVisibilityButton);
  updateBadge();
  updateUndoButton();
  updateRedoButton();
  updateVisibilityButton();
}

function togglePaintMode(): void {
  if (isActive()) {
    deactivate();
    updateButtonState(false);
    pickerPanel?.classList.add('hidden');
  } else {
    // Mutual exclusion with annotate (pen + text + select) modes.
    forceDeactivateAnnotate();
    forceDeactivateAnnotateText();
    forceDeactivateAnnotateSelect();
    activate();
    updateButtonState(true);
    pickerPanel?.classList.remove('hidden');
  }
}

function updateButtonState(active: boolean): void {
  if (!paintBtn) return;
  if (active) {
    paintBtn.className = 'px-2 py-1 rounded text-xs bg-blue-500/30 backdrop-blur text-blue-300 border border-blue-500/50 transition-colors';
  } else {
    paintBtn.className = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
  }
}

function updateBadge(): void {
  if (!regionCountBadge) return;
  const count = getRegions().length;
  if (count > 0) {
    regionCountBadge.textContent = String(count);
    regionCountBadge.classList.remove('hidden');
  } else {
    regionCountBadge.classList.add('hidden');
  }
}

function createPickerPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'paint-picker-panel';
  panel.className = 'hidden absolute top-10 right-2 z-20 bg-zinc-800/95 backdrop-blur border border-zinc-600/60 rounded-lg p-2.5 shadow-xl';
  panel.style.minWidth = '160px';

  // Title
  const title = document.createElement('div');
  title.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-medium';
  title.textContent = 'Color';
  panel.appendChild(title);

  // Preset swatches grid
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-4 gap-1.5 mb-2';

  for (const color of PRESET_COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'w-6 h-6 rounded border-2 border-transparent hover:border-white/50 transition-colors';
    swatch.style.backgroundColor = rgbToCSS(color);
    swatch.title = rgbToHex(color);

    swatch.addEventListener('click', () => {
      setColor(color);
      updateActiveSwatch(grid, swatch);
    });

    grid.appendChild(swatch);
  }

  // Mark first swatch as active
  const first = grid.children[0] as HTMLElement;
  if (first) first.classList.add('border-white/80', 'ring-1', 'ring-white/30');

  panel.appendChild(grid);

  // Custom color input
  const customRow = document.createElement('div');
  customRow.className = 'flex items-center gap-1.5';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = rgbToHex(PRESET_COLORS[0]);
  colorInput.className = 'w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent';
  colorInput.title = 'Custom color';

  colorInput.addEventListener('input', () => {
    const hex = colorInput.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    setColor([r, g, b]);
    // Clear active swatch borders
    for (const child of Array.from(grid.children)) {
      (child as HTMLElement).classList.remove('border-white/80', 'ring-1', 'ring-white/30');
    }
  });

  const customLabel = document.createElement('span');
  customLabel.className = 'text-[10px] text-zinc-500';
  customLabel.textContent = 'Custom';

  customRow.appendChild(colorInput);
  customRow.appendChild(customLabel);
  panel.appendChild(customRow);

  // Region list (compact)
  const regionList = document.createElement('div');
  regionList.id = 'paint-region-list';
  regionList.className = 'mt-2 border-t border-zinc-700 pt-2 max-h-32 overflow-y-auto';
  panel.appendChild(regionList);

  onRegionsChange(() => updateRegionList(regionList));

  // Action row: visibility, undo, redo, clear
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-700 flex-wrap';

  visibilityBtn = document.createElement('button');
  visibilityBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors';
  visibilityBtn.title = 'Toggle paint region visibility in viewport (exports keep colors regardless)';
  visibilityBtn.addEventListener('click', () => { setPaintVisible(!isPaintVisible()); });
  actions.appendChild(visibilityBtn);

  undoBtn = document.createElement('button');
  undoBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors opacity-40 cursor-not-allowed';
  undoBtn.textContent = 'Undo paint';
  undoBtn.title = 'Remove the most recent paint region';
  undoBtn.disabled = true;
  undoBtn.addEventListener('click', () => { removeLastRegion(); });
  actions.appendChild(undoBtn);

  redoBtn = document.createElement('button');
  redoBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors opacity-40 cursor-not-allowed';
  redoBtn.textContent = 'Redo paint';
  redoBtn.title = 'Restore the most recently undone paint region';
  redoBtn.disabled = true;
  redoBtn.addEventListener('click', () => { redoLastRegion(); });
  actions.appendChild(redoBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'px-2 py-1 rounded text-[10px] bg-red-700/60 text-red-200 hover:bg-red-600/60 transition-colors';
  clearBtn.textContent = 'Clear';
  clearBtn.title = 'Remove all paint regions';
  clearBtn.addEventListener('click', () => { clearRegions(); });
  actions.appendChild(clearBtn);

  panel.appendChild(actions);

  return panel;
}

function updateVisibilityButton(): void {
  if (!visibilityBtn) return;
  visibilityBtn.textContent = isPaintVisible() ? 'Hide' : 'Show';
}

function updateUndoButton(): void {
  if (!undoBtn) return;
  const can = getRegions().length > 0;
  undoBtn.disabled = !can;
  undoBtn.classList.toggle('opacity-40', !can);
  undoBtn.classList.toggle('cursor-not-allowed', !can);
}

function updateRedoButton(): void {
  if (!redoBtn) return;
  const can = canRedoRegion();
  redoBtn.disabled = !can;
  redoBtn.classList.toggle('opacity-40', !can);
  redoBtn.classList.toggle('cursor-not-allowed', !can);
}

function updateActiveSwatch(grid: HTMLElement, activeSwatch: HTMLElement): void {
  for (const child of Array.from(grid.children)) {
    (child as HTMLElement).classList.remove('border-white/80', 'ring-1', 'ring-white/30');
  }
  activeSwatch.classList.add('border-white/80', 'ring-1', 'ring-white/30');
}

function updateRegionList(container: HTMLElement): void {
  const regions = getRegions();
  container.innerHTML = '';

  if (regions.length === 0) return;

  for (const region of regions) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 py-0.5';

    const dot = document.createElement('span');
    dot.className = 'w-3 h-3 rounded-sm shrink-0';
    dot.style.backgroundColor = rgbToCSS(region.color);

    const label = document.createElement('span');
    label.className = 'text-[11px] text-zinc-400 truncate flex-1';
    label.textContent = region.name;

    const count = document.createElement('span');
    count.className = 'text-[10px] text-zinc-600';
    count.textContent = `${region.triangles.size}\u25B3`;

    row.appendChild(dot);
    row.appendChild(label);
    row.appendChild(count);
    container.appendChild(row);
  }
}

function rgbToCSS(color: [number, number, number]): string {
  return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}

function rgbToHex(color: [number, number, number]): string {
  const r = Math.round(color[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(color[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(color[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Deactivate paint mode externally (e.g. when switching tabs). */
export function forceDeactivate(): void {
  if (isActive()) {
    deactivate();
    updateButtonState(false);
    pickerPanel?.classList.add('hidden');
  }
}
