import { renderViewsToContainer, renderCompositeCanvas } from '../renderer/multiview';
import type { MeshData } from '../geometry/types';

let viewsContainerEl: HTMLElement | null = null;
let lastMeshData: MeshData | null = null;

export function initViewsPanel(viewsContainer: HTMLElement): void {
  viewsContainerEl = viewsContainer;

  // Copy button
  document.getElementById('btn-copy-views')?.addEventListener('click', async () => {
    if (!lastMeshData) return;
    const canvas = renderCompositeCanvas(lastMeshData);
    try {
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
    } catch {
      downloadCanvasAsPNG(canvas);
    }
  });

  // Download button
  document.getElementById('btn-download-views')?.addEventListener('click', () => {
    if (!lastMeshData) return;
    const canvas = renderCompositeCanvas(lastMeshData);
    downloadCanvasAsPNG(canvas);
  });
}

export function updateMultiView(meshData: MeshData): void {
  lastMeshData = meshData;
  if (viewsContainerEl) {
    renderViewsToContainer(viewsContainerEl, meshData);
  }
}

function downloadCanvasAsPNG(canvas: HTMLCanvasElement) {
  const link = document.createElement('a');
  link.download = 'mainifold-views.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}
