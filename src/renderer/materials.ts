import * as THREE from 'three';

export function createDefaultMaterial(vertexColors = false): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: vertexColors ? 0xffffff : 0x4a9eff,
    shininess: 40,
    side: THREE.DoubleSide,
    vertexColors,
  });
}

export function createWireframeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  });
}

export function createWhiteMaterial(vertexColors = false): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: 0xffffff,
    shininess: 30,
    side: THREE.DoubleSide,
    vertexColors,
  });
}

export function createBlackWireframeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
    opacity: 0.3,
  });
}
