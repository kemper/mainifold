import * as THREE from 'three';

export function createDefaultMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: 0x4a9eff,
    shininess: 40,
    side: THREE.DoubleSide,
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

export function createWhiteMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: 0xffffff,
    shininess: 30,
    side: THREE.DoubleSide,
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
