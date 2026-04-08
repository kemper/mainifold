import { getScene } from '../renderer/viewport';
import { getPhantomGroup } from '../renderer/phantomGeometry';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { downloadBlob, getExportFilename } from './download';

export async function exportGLB(customName?: string): Promise<void> {
  const scene = getScene();
  const exporter = new GLTFExporter();

  // Hide phantom geometry during export so it's excluded
  const phantom = getPhantomGroup();
  const wasVisible = phantom?.visible ?? true;
  if (phantom) phantom.visible = false;

  const result = await exporter.parseAsync(scene, { binary: true });

  // Restore phantom visibility
  if (phantom) phantom.visible = wasVisible;

  const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
  downloadBlob(blob, getExportFilename('glb', customName));
}
