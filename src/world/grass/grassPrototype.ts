// src/world/grass/grassPrototype.ts — extract meshes from the grass_medium_01 GLB
import { Mesh, type Object3D, type Texture } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';

function firstMeshInSubtree(root: Object3D): Mesh | null {
  let found: Mesh | null = null;
  root.traverse((child) => {
    if (found) return;
    const mesh = child as Mesh;
    if (mesh.isMesh) found = mesh;
  });
  return found;
}

export function getGrassPrototype(registry: AssetRegistry, glbKey: string, meshName: string): Mesh {
  const root = registry.get(glbKey);
  if (!root) throw new Error(`Missing grass GLB: ${glbKey}`);

  let direct: Mesh | null = null;
  let group: Object3D | null = null;

  root.traverse((child) => {
    const matches = child.name === meshName || child.name.endsWith(meshName);
    if (!matches) return;
    const mesh = child as Mesh;
    if (mesh.isMesh && !direct) direct = mesh;
    else if (!group) group = child;
  });

  if (direct) return direct;
  if (group) {
    const nested = firstMeshInSubtree(group);
    if (nested) return nested;
  }

  const names: string[] = [];
  root.traverse((child) => {
    if ((child as Mesh).isMesh) names.push(child.name || '(unnamed)');
  });
  throw new Error(
    `Grass mesh not found: ${meshName}. Sample mesh names: ${names.slice(0, 12).join(', ')}`,
  );
}

/** Diffuse map from a curated LOD0 clump (skip geo-nodes meshes listed first in the GLB). */
export function extractGrassDiffuseMap(
  grassRoot: Object3D,
  preferredMeshName = 'grass_medium_01_tiny_a_LOD0',
): Texture {
  const tryMesh = (name: string): Texture | null => {
    let mesh: Mesh | null = null;
    grassRoot.traverse((child) => {
      if (mesh) return;
      const matches = child.name === name || child.name.endsWith(name);
      if (!matches) return;
      const m = child as Mesh;
      if (m.isMesh) mesh = m;
    });
    if (!mesh) {
      let group: Object3D | null = null;
      grassRoot.traverse((child) => {
        if (group) return;
        if (child.name === name || child.name.endsWith(name)) group = child;
      });
      if (group) mesh = firstMeshInSubtree(group);
    }
    if (!mesh) return null;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as { map?: Texture | null };
      if (m.map) return m.map;
    }
    return null;
  };

  const preferred = tryMesh(preferredMeshName);
  if (preferred) return preferred;

  let map: Texture | null = null;
  grassRoot.traverse((child) => {
    if (map) return;
    const mesh = child as Mesh;
    if (!mesh.isMesh || child.name.includes('geonodes')) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as { map?: Texture | null };
      if (m.map) {
        map = m.map;
        return;
      }
    }
  });
  if (!map) throw new Error('Grass GLB has no diffuse texture');
  return map;
}

export function countResolvedGrassMeshes(
  registry: AssetRegistry,
  glbKey: string,
  meshNames: readonly string[],
): number {
  let n = 0;
  for (const name of meshNames) {
    try {
      getGrassPrototype(registry, glbKey, name);
      n++;
    } catch {
      // skip
    }
  }
  return n;
}
