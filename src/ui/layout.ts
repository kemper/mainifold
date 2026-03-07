export interface LayoutElements {
  editorPane: HTMLElement;
  editorContainer: HTMLElement;
  viewportPane: HTMLElement;
  viewsContainer: HTMLElement;
  galleryContainer: HTMLElement;
  statusBar: HTMLElement;
  sectionPanel: HTMLElement;
  switchTab: (tab: 'interactive' | 'ai' | 'gallery') => void;
}

export function createLayout(appContainer: HTMLElement): LayoutElements {
  const main = document.createElement('div');
  main.className = 'flex flex-1 min-h-0';

  // === Left: Editor pane ===
  const editorPane = document.createElement('div');
  editorPane.className = 'flex flex-col border-r border-zinc-700';
  editorPane.style.width = '35%';

  const editorHeader = document.createElement('div');
  editorHeader.className = 'flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700';

  const editorTitle = document.createElement('span');
  editorTitle.className = 'text-xs text-zinc-400 font-mono';
  editorTitle.textContent = 'editor.js';
  editorHeader.appendChild(editorTitle);

  const statusBar = document.createElement('span');
  statusBar.id = 'status-indicator';
  statusBar.className = 'text-xs text-emerald-400 font-mono';
  statusBar.textContent = 'Ready';
  editorHeader.appendChild(statusBar);

  editorPane.appendChild(editorHeader);

  const editorContainer = document.createElement('div');
  editorContainer.id = 'editor-container';
  editorContainer.className = 'flex-1 min-h-0 overflow-hidden';
  editorPane.appendChild(editorContainer);

  // Cross-section panel
  const sectionPanel = createSectionPanel();
  editorPane.appendChild(sectionPanel);

  // === Splitter ===
  const splitter = document.createElement('div');
  splitter.className = 'w-1 bg-zinc-700 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors';
  initSplitter(splitter, editorPane);

  // === Right: Tabbed viewport ===
  const rightPane = document.createElement('div');
  rightPane.className = 'flex-1 flex flex-col min-w-0';

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'flex items-center bg-zinc-800 border-b border-zinc-700 shrink-0';

  const tabInteractive = createTab('Interactive', true);
  const tabAI = createTab('AI Views', false);
  const tabGallery = createTab('Gallery', false);

  // Copy / Download buttons (shown only on AI Views tab)
  const viewActions = document.createElement('div');
  viewActions.id = 'view-actions';
  viewActions.className = 'flex gap-2 ml-auto pr-3 hidden';

  const btnCopyViews = document.createElement('button');
  btnCopyViews.id = 'btn-copy-views';
  btnCopyViews.className = 'text-xs text-zinc-500 hover:text-zinc-300 transition-colors';
  btnCopyViews.textContent = 'Copy';
  viewActions.appendChild(btnCopyViews);

  const btnDownloadViews = document.createElement('button');
  btnDownloadViews.id = 'btn-download-views';
  btnDownloadViews.className = 'text-xs text-zinc-500 hover:text-zinc-300 transition-colors';
  btnDownloadViews.textContent = 'Download PNG';
  viewActions.appendChild(btnDownloadViews);

  tabBar.appendChild(tabInteractive);
  tabBar.appendChild(tabAI);
  tabBar.appendChild(tabGallery);
  tabBar.appendChild(viewActions);

  // Tab content panels
  const viewportPane = document.createElement('div');
  viewportPane.id = 'viewport-container';
  viewportPane.className = 'relative flex-1 min-h-0';

  const viewsContainer = document.createElement('div');
  viewsContainer.id = 'views-container';
  viewsContainer.className = 'flex-1 min-h-0 overflow-auto bg-zinc-900 hidden p-2';

  const galleryContainer = document.createElement('div');
  galleryContainer.id = 'gallery-container';
  galleryContainer.className = 'flex-1 min-h-0 overflow-auto bg-zinc-900 hidden p-4';

  const allTabs = [tabInteractive, tabAI, tabGallery];
  const allPanes = [viewportPane, viewsContainer, galleryContainer];

  // Tab switching
  function switchTab(tab: 'interactive' | 'ai' | 'gallery') {
    const idx = tab === 'interactive' ? 0 : tab === 'ai' ? 1 : 2;

    for (let i = 0; i < allPanes.length; i++) {
      if (i === idx) {
        allPanes[i].classList.remove('hidden');
        allTabs[i].className = 'px-4 py-1.5 text-xs font-medium text-zinc-100 border-b-2 border-blue-500 bg-zinc-900';
      } else {
        allPanes[i].classList.add('hidden');
        allTabs[i].className = 'px-4 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent';
      }
    }

    viewActions.classList.toggle('hidden', tab !== 'ai');
    window.dispatchEvent(new Event('resize'));
  }

  tabInteractive.addEventListener('click', () => switchTab('interactive'));
  tabAI.addEventListener('click', () => switchTab('ai'));
  tabGallery.addEventListener('click', () => switchTab('gallery'));

  // Default to AI views if ?view=ai, gallery if ?gallery
  const params = new URLSearchParams(window.location.search);
  if (params.has('gallery')) {
    switchTab('gallery');
  } else if (params.get('view') === 'ai') {
    switchTab('ai');
  }

  rightPane.appendChild(tabBar);
  rightPane.appendChild(viewportPane);
  rightPane.appendChild(viewsContainer);
  rightPane.appendChild(galleryContainer);

  main.appendChild(editorPane);
  main.appendChild(splitter);
  main.appendChild(rightPane);

  appContainer.appendChild(main);

  return { editorPane, editorContainer, viewportPane, viewsContainer, galleryContainer, statusBar, sectionPanel, switchTab };
}

function createTab(label: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = active
    ? 'px-4 py-1.5 text-xs font-medium text-zinc-100 border-b-2 border-blue-500 bg-zinc-900'
    : 'px-4 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent';
  btn.textContent = label;
  btn.dataset.tab = label;
  return btn;
}

function createSectionPanel(): HTMLElement {
  const sectionPanel = document.createElement('div');
  sectionPanel.id = 'section-panel';
  sectionPanel.className = 'border-t border-zinc-700 shrink-0 hidden';

  const sectionToggle = document.createElement('button');
  sectionToggle.id = 'section-toggle';
  sectionToggle.className = 'flex items-center w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 font-mono';

  const toggleLabel = document.createElement('span');
  toggleLabel.textContent = '\u2298 Cross-Section';
  sectionToggle.appendChild(toggleLabel);

  const chevron = document.createElement('span');
  chevron.id = 'section-chevron';
  chevron.className = 'ml-auto';
  chevron.textContent = '\u25BE';
  sectionToggle.appendChild(chevron);

  sectionPanel.appendChild(sectionToggle);

  const sectionContent = document.createElement('div');
  sectionContent.id = 'section-content';
  sectionContent.className = 'p-3 space-y-2';

  const sliderRow = document.createElement('div');
  sliderRow.className = 'flex items-center gap-2';

  const label = document.createElement('label');
  label.className = 'text-xs text-zinc-400 w-4';
  label.textContent = 'Z';
  sliderRow.appendChild(label);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'z-slider';
  slider.className = 'flex-1 accent-blue-500';
  slider.min = '0';
  slider.max = '10';
  slider.step = '0.01';
  slider.value = '5';
  sliderRow.appendChild(slider);

  const zValue = document.createElement('span');
  zValue.id = 'z-value';
  zValue.className = 'text-xs text-zinc-300 w-14 text-right font-mono';
  zValue.textContent = '5.00';
  sliderRow.appendChild(zValue);

  sectionContent.appendChild(sliderRow);

  const svgPreview = document.createElement('div');
  svgPreview.id = 'svg-preview';
  svgPreview.className = 'bg-zinc-900 rounded p-2 flex justify-center';
  sectionContent.appendChild(svgPreview);

  const stats = document.createElement('div');
  stats.id = 'section-stats';
  stats.className = 'text-xs text-zinc-500';
  sectionContent.appendChild(stats);

  const btnRow = document.createElement('div');
  btnRow.className = 'flex gap-2';

  const btnCopySvg = document.createElement('button');
  btnCopySvg.id = 'btn-copy-svg';
  btnCopySvg.className = 'px-2.5 py-1 rounded text-xs text-zinc-300 bg-zinc-700 hover:bg-zinc-600 transition-colors';
  btnCopySvg.textContent = 'Copy SVG';
  btnRow.appendChild(btnCopySvg);

  const btnCopyJson = document.createElement('button');
  btnCopyJson.id = 'btn-copy-json';
  btnCopyJson.className = 'px-2.5 py-1 rounded text-xs text-zinc-300 bg-zinc-700 hover:bg-zinc-600 transition-colors';
  btnCopyJson.textContent = 'Copy JSON';
  btnRow.appendChild(btnCopyJson);

  sectionContent.appendChild(btnRow);
  sectionPanel.appendChild(sectionContent);

  return sectionPanel;
}

function initSplitter(splitter: HTMLElement, editorPane: HTMLElement) {
  let startX = 0;
  let startWidth = 0;

  const onMouseMove = (e: MouseEvent) => {
    const newWidth = startWidth + (e.clientX - startX);
    const minW = 200;
    const maxW = window.innerWidth - 200;
    editorPane.style.width = `${Math.max(minW, Math.min(maxW, newWidth))}px`;
    window.dispatchEvent(new Event('resize'));
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = editorPane.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
