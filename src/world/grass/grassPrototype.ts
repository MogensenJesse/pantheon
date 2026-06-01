// src/world/grass/grassPrototype.ts — extract meshes and PBR textures from foliage glTF packs
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  TextureLoader,
} from 'three';
import { FOLIAGE_PACKS, type AssetRegistry } from '../../assets/assetManifest';
import type { FoliagePackKey } from './foliageTypes';

type MappedMaterial = Material & {
  map?: Texture | null;
  metalnessMap?: Texture | null;
  roughnessMap?: Texture | null;
  aoMap?: Texture | null;
  alphaMap?: Texture | null;
};

export interface GrassTextureSet {
  diffuse: Texture;
  /** Poly Haven ARM packed map (R=AO, G=roughness, B=metallic). */
  arm?: Texture;
  /** Opacity / cutout mask (grayscale PNG or glTF alphaMap). */
  opacity?: Texture;
  /** When true, {@link disposeFoliageMaterials} disposes {@link opacity}. */
  opacityOwned?: boolean;
}

function firstMeshInSubtree(root: Object3D): Mesh | null {
  let found: Mesh | null = null;
  root.traverse((child) => {
    if (found) return;
    const mesh = child as Mesh;
    if (mesh.isMesh) found = mesh;
  });
  return found;
}

function mapsFromMaterial(mat: Material): Partial<GrassTextureSet> {
  const m = mat as MappedMaterial;
  const arm = m.metalnessMap ?? m.roughnessMap ?? m.aoMap ?? undefined;
  return {
    diffuse: m.map ?? undefined,
    arm,
    opacity: m.alphaMap ?? undefined,
  };
}

function mergeMaps(into: Partial<GrassTextureSet>, next: Partial<GrassTextureSet>): void {
  if (!into.diffuse && next.diffuse) into.diffuse = next.diffuse;
  if (!into.arm && next.arm) into.arm = next.arm;
  if (!into.opacity && next.opacity) into.opacity = next.opacity;
}

const opacityLoadByPath = new Map<string, Promise<Texture | null>>();

async function loadOpacityTexture(alphaPath: string): Promise<Texture | null> {
  let pending = opacityLoadByPath.get(alphaPath);
  if (!pending) {
    pending = (async () => {
      const loader = new TextureLoader();
      try {
        const tex = await loader.loadAsync(alphaPath);
        tex.colorSpace = NoColorSpace;
        tex.anisotropy = 8;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.magFilter = LinearFilter;
        return tex;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[foliage] opacity PNG not found:', alphaPath, err);
        }
        return null;
      }
    })();
    opacityLoadByPath.set(alphaPath, pending);
  }
  return pending;
}

/** glTF maps plus Poly Haven opacity PNG when configured (preferred over glTF alphaMap). */
export async function prepareGrassTextures(
  packKey: FoliagePackKey,
  grassRoot: Object3D,
): Promise<GrassTextureSet> {
  const pack = FOLIAGE_PACKS[packKey];
  const set = extractGrassTextures(grassRoot, pack.preferredMeshForTextures);

  if (pack.alphaPath) {
    const opacity = await loadOpacityTexture(pack.alphaPath);
    if (opacity) {
      opacity.flipY = set.diffuse.flipY;
      return { ...set, opacity, opacityOwned: true };
    }
    if (import.meta.env.DEV) {
      console.warn(`[foliage] missing opacity PNG for ${packKey}:`, pack.alphaPath);
    }
  }

  if (set.opacity) return set;
  return set;
}

/** Collect diffuse / ARM from the first mesh that exposes them. */
export function extractGrassTextures(
  grassRoot: Object3D,
  preferredMeshName: string,
): GrassTextureSet {
  const tryMesh = (name: string): Partial<GrassTextureSet> | null => {
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
    const out: Partial<GrassTextureSet> = {};
    for (const mat of mats) {
      mergeMaps(out, mapsFromMaterial(mat));
    }
    return out.diffuse ? out : null;
  };

  const preferred = tryMesh(preferredMeshName);
  if (preferred?.diffuse) return preferred as GrassTextureSet;

  const out: Partial<GrassTextureSet> = {};
  grassRoot.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || child.name.includes('geonodes')) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) mergeMaps(out, mapsFromMaterial(mat));
  });

  if (!out.diffuse) throw new Error('Foliage glTF has no diffuse texture');
  return out as GrassTextureSet;
}

export function getGrassPrototype(
  registry: AssetRegistry,
  packKey: FoliagePackKey,
  meshName: string,
): Mesh {
  const root = registry.get(packKey);
  if (!root) throw new Error(`Missing foliage glTF: ${packKey}`);

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
    `Foliage mesh not found: ${meshName} in ${packKey}. Sample: ${names.slice(0, 12).join(', ')}`,
  );
}

export function countResolvedGrassMeshes(
  registry: AssetRegistry,
  packKey: FoliagePackKey,
  meshNames: readonly string[],
): number {
  let n = 0;
  for (const name of meshNames) {
    try {
      getGrassPrototype(registry, packKey, name);
      n++;
    } catch {
      // skip
    }
  }
  return n;
}
