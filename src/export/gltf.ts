import { getScene } from '../renderer/viewport';
import { getPhantomGroup } from '../renderer/phantomGeometry';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { downloadBlob, getExportFilename } from './download';

export interface BuiltExport {
  blob: Blob;
  filename: string;
  mimeType: string;
}

/** Build the GLB blob for the current scene without triggering a download. */
export async function buildGLB(customName?: string): Promise<BuiltExport> {
  const scene = getScene();
  const exporter = new GLTFExporter();

  // Hide phantom geometry during export so it's excluded
  const phantom = getPhantomGroup();
  const wasVisible = phantom?.visible ?? true;
  if (phantom) phantom.visible = false;

  const result = await exporter.parseAsync(scene, { binary: true });

  // Restore phantom visibility
  if (phantom) phantom.visible = wasVisible;

  const mimeType = 'model/gltf-binary';
  const blob = new Blob([result as ArrayBuffer], { type: mimeType });
  return { blob, filename: getExportFilename('glb', customName), mimeType };
}

export async function exportGLB(customName?: string): Promise<void> {
  const built = await buildGLB(customName);
  downloadBlob(built.blob, built.filename, 'GLB');
}
