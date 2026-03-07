export interface ToolbarCallbacks {
  onRun: () => void;
  onSection: () => void;
  onExportGLB: () => void;
  onExportSTL: () => void;
  onExampleSelect: (code: string) => void;
}

export function createToolbar(
  container: HTMLElement,
  examples: Record<string, string>,
  callbacks: ToolbarCallbacks,
): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border-b border-zinc-700 text-sm shrink-0';

  // Logo
  const logo = document.createElement('span');
  logo.className = 'text-zinc-100 font-semibold mr-4';
  logo.textContent = 'mAInifold';
  toolbar.appendChild(logo);

  // Run button
  const btnRun = createButton('btn-run', '\u25B6 Run');
  btnRun.addEventListener('click', callbacks.onRun);
  toolbar.appendChild(btnRun);

  // Section button
  const btnSection = createButton('btn-section', '\u2298 Section');
  btnSection.addEventListener('click', callbacks.onSection);
  toolbar.appendChild(btnSection);

  // Spacer
  const spacer = document.createElement('div');
  spacer.className = 'flex-1';
  toolbar.appendChild(spacer);

  // Example select
  const select = document.createElement('select');
  select.id = 'example-select';
  select.className = 'bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-300 cursor-pointer';

  const defaultOpt = document.createElement('option');
  defaultOpt.textContent = 'Load example\u2026';
  defaultOpt.value = '';
  select.appendChild(defaultOpt);

  for (const [name] of Object.entries(examples)) {
    const opt = document.createElement('option');
    const displayName = name
      .replace(/^.*\//, '')
      .replace(/\.js$/, '')
      .replace(/_/g, ' ');
    opt.textContent = displayName;
    opt.value = name;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const key = select.value;
    if (key && examples[key]) {
      callbacks.onExampleSelect(examples[key]);
      select.value = '';
    }
  });
  toolbar.appendChild(select);

  // Export dropdown
  const exportWrapper = document.createElement('div');
  exportWrapper.className = 'relative ml-2';
  exportWrapper.id = 'export-wrapper';

  const btnExport = createButton('btn-export', '\u2193 Export');
  exportWrapper.appendChild(btnExport);

  const dropdown = document.createElement('div');
  dropdown.id = 'export-dropdown';
  dropdown.className = 'absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-lg py-1 hidden z-10 min-w-32';

  const glbOpt = createDropdownItem('GLB (recommended)');
  glbOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportGLB();
  });

  const stlOpt = createDropdownItem('STL');
  stlOpt.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onExportSTL();
  });

  dropdown.appendChild(glbOpt);
  dropdown.appendChild(stlOpt);
  exportWrapper.appendChild(dropdown);

  btnExport.addEventListener('click', () => {
    dropdown.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!exportWrapper.contains(e.target as Node)) {
      dropdown.classList.add('hidden');
    }
  });

  toolbar.appendChild(exportWrapper);
  container.appendChild(toolbar);

  return toolbar;
}

function createButton(id: string, text: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = id;
  btn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors text-xs';
  btn.textContent = text;
  return btn;
}

function createDropdownItem(text: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'block w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700';
  btn.textContent = text;
  return btn;
}
