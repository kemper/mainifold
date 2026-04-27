// Annotate mode UI — toggle button, color picker, undo/clear actions, count badge.

import {
  activate,
  deactivate,
  isActive,
  setColor,
  setWidth,
  getWidth,
  onActiveChange,
} from './annotateMode';
import { getCount, onChange as onStrokesChange, removeLastStroke, clearStrokes } from './annotations';
import { setAnnotationsVisible, isAnnotationsVisible } from './annotationOverlay';

const PRESET_COLORS: [number, number, number][] = [
  [0.95, 0.20, 0.45], // hot pink (default)
  [0.92, 0.26, 0.21], // red
  [1.00, 0.76, 0.03], // yellow
  [0.30, 0.69, 0.31], // green
  [0.13, 0.59, 0.95], // blue
  [0.61, 0.15, 0.69], // purple
  [0.20, 0.20, 0.20], // near-black
  [0.96, 0.96, 0.96], // near-white
];

const PRESET_WIDTHS: { label: string; value: number }[] = [
  { label: 'XS', value: 2 },
  { label: 'S',  value: 4 },
  { label: 'M',  value: 7 },
  { label: 'L',  value: 12 },
];

let annotateBtn: HTMLButtonElement | null = null;
let pickerPanel: HTMLElement | null = null;
let countBadge: HTMLElement | null = null;
let visibilityBtn: HTMLButtonElement | null = null;

const inactiveBtnClass = 'px-2 py-1 rounded text-xs bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors border border-zinc-600/50';
const activeBtnClass = 'px-2 py-1 rounded text-xs bg-pink-500/30 backdrop-blur text-pink-200 border border-pink-400/60 transition-colors';

export function initAnnotateUI(controlsContainer: HTMLElement): void {
  annotateBtn = document.createElement('button');
  annotateBtn.id = 'annotate-toggle';
  annotateBtn.className = inactiveBtnClass;
  annotateBtn.textContent = '\u270F\uFE0F Annotate';
  annotateBtn.title = 'Draw freehand marks on the model surface';

  countBadge = document.createElement('span');
  countBadge.className = 'hidden ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-500 text-white leading-none';
  annotateBtn.appendChild(countBadge);

  annotateBtn.addEventListener('click', toggleAnnotateMode);

  // Insert before the paint button if it exists, else before measure, else append.
  const paintBtn = controlsContainer.querySelector('#paint-toggle');
  const measureBtn = controlsContainer.querySelector('#measure-toggle');
  const anchor = paintBtn ?? measureBtn;
  if (anchor) controlsContainer.insertBefore(annotateBtn, anchor);
  else controlsContainer.appendChild(annotateBtn);

  pickerPanel = createPickerPanel();
  controlsContainer.appendChild(pickerPanel);

  onStrokesChange(updateCountBadge);
  onActiveChange(updateButtonState);
  updateCountBadge();
  updateButtonState(isActive());
}

function toggleAnnotateMode(): void {
  if (isActive()) deactivate();
  else activate();
}

function updateButtonState(active: boolean): void {
  if (!annotateBtn) return;
  annotateBtn.className = active ? activeBtnClass : inactiveBtnClass;
  if (active) pickerPanel?.classList.remove('hidden');
  else pickerPanel?.classList.add('hidden');
}

function updateCountBadge(): void {
  if (!countBadge) return;
  const c = getCount();
  if (c > 0) {
    countBadge.textContent = String(c);
    countBadge.classList.remove('hidden');
  } else {
    countBadge.classList.add('hidden');
  }
}

function createPickerPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'annotate-picker-panel';
  panel.className = 'hidden absolute top-10 right-2 z-20 bg-zinc-800/95 backdrop-blur border border-zinc-600/60 rounded-lg p-2.5 shadow-xl';
  panel.style.minWidth = '180px';

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
      markActiveSwatch(grid, swatch);
    });

    grid.appendChild(swatch);
  }
  // Activate first swatch by default
  const first = grid.children[0] as HTMLElement;
  if (first) first.classList.add('border-white/80', 'ring-1', 'ring-white/30');

  panel.appendChild(grid);

  // Custom color row
  const customRow = document.createElement('div');
  customRow.className = 'flex items-center gap-1.5 mb-2';
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

  // Width picker
  const widthLabel = document.createElement('div');
  widthLabel.className = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 mt-2 font-medium';
  widthLabel.textContent = 'Width';
  panel.appendChild(widthLabel);

  const widthRow = document.createElement('div');
  widthRow.className = 'flex items-center gap-1.5 mb-1';

  const widthButtons: HTMLButtonElement[] = [];
  for (const preset of PRESET_WIDTHS) {
    const btn = document.createElement('button');
    btn.className = 'flex-1 px-2 py-1 rounded text-[11px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors flex items-center justify-center gap-1.5';
    btn.title = `${preset.value}px`;

    // Show a thickness swatch + label
    const dot = document.createElement('span');
    dot.className = 'rounded-full bg-zinc-300';
    const sz = Math.max(2, Math.min(12, preset.value));
    dot.style.width = `${sz}px`;
    dot.style.height = `${sz}px`;
    btn.appendChild(dot);

    const lbl = document.createElement('span');
    lbl.textContent = preset.label;
    btn.appendChild(lbl);

    btn.addEventListener('click', () => {
      setWidth(preset.value);
      markActiveWidth(widthButtons, btn);
    });

    widthButtons.push(btn);
    widthRow.appendChild(btn);
  }
  panel.appendChild(widthRow);

  // Sync initial active width button to current setting
  const initialIdx = PRESET_WIDTHS.findIndex(w => w.value === getWidth());
  if (initialIdx >= 0) markActiveWidth(widthButtons, widthButtons[initialIdx]);

  // Action row: visibility, undo, clear
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-700';

  visibilityBtn = document.createElement('button');
  visibilityBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors';
  visibilityBtn.textContent = isAnnotationsVisible() ? 'Hide' : 'Show';
  visibilityBtn.title = 'Toggle annotation visibility';
  visibilityBtn.addEventListener('click', () => {
    const next = !isAnnotationsVisible();
    setAnnotationsVisible(next);
    if (visibilityBtn) visibilityBtn.textContent = next ? 'Hide' : 'Show';
  });
  actions.appendChild(visibilityBtn);

  const undoBtn = document.createElement('button');
  undoBtn.className = 'px-2 py-1 rounded text-[10px] bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60 transition-colors';
  undoBtn.textContent = 'Undo';
  undoBtn.title = 'Remove the last stroke';
  undoBtn.addEventListener('click', () => { removeLastStroke(); });
  actions.appendChild(undoBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'px-2 py-1 rounded text-[10px] bg-red-700/60 text-red-200 hover:bg-red-600/60 transition-colors ml-auto';
  clearBtn.textContent = 'Clear';
  clearBtn.title = 'Remove all annotations';
  clearBtn.addEventListener('click', () => { clearStrokes(); });
  actions.appendChild(clearBtn);

  panel.appendChild(actions);

  return panel;
}

function markActiveSwatch(grid: HTMLElement, activeSwatch: HTMLElement): void {
  for (const child of Array.from(grid.children)) {
    (child as HTMLElement).classList.remove('border-white/80', 'ring-1', 'ring-white/30');
  }
  activeSwatch.classList.add('border-white/80', 'ring-1', 'ring-white/30');
}

function markActiveWidth(buttons: HTMLButtonElement[], active: HTMLButtonElement): void {
  for (const b of buttons) {
    b.classList.remove('bg-zinc-500/60', 'ring-1', 'ring-white/30');
    b.classList.add('bg-zinc-700/60');
  }
  active.classList.remove('bg-zinc-700/60');
  active.classList.add('bg-zinc-500/60', 'ring-1', 'ring-white/30');
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

/** Force-deactivate annotate mode externally (mutual exclusion with paint mode, tab switches). */
export function forceDeactivate(): void {
  if (isActive()) deactivate();
}
