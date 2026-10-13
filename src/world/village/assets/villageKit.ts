// src/world/village/assets/villageKit.ts — modelled village assets (GLB) that replace placeholder keys
import { Box3, type Mesh, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGPURenderer } from 'three/webgpu';
import { lodSiblingPath, type PropLodAsset } from '../../../assets/assetManifest';
import { createKtx2Loader } from '../../../assets/createKtx2Loader';
import type { VillageAssetMeta, VillageBuildingType } from '../model/assetKeys';

/**
 * Baked kit files under `public/models/village-kit/` (source: `assets-src/village/`). Each key replaces the
 * placeholder of the same key; `type` names the building whose metadata the file's extras carry; `single`
 * files have no `_lod1` / `_lod2` siblings.
 */
const KIT: readonly { key: string; file: string; type?: VillageBuildingType; single?: boolean }[] =
  [
    { key: 'village_temple_s2', file: 'temple', type: 'temple' },
    { key: 'village_temple_glow', file: 'temple_glow', single: true },
    { key: 'village_house_c_s0', file: 'house_c_s0' },
    { key: 'village_house_c_s1', file: 'house_c_s1' },
    { key: 'village_house_c_s2', file: 'house_c_s2', type: 'house_c' },
    { key: 'village_house_c_glow', file: 'house_c_glow', single: true },
    { key: 'village_house_a_s0', file: 'house_a_s0' },
    { key: 'village_house_a_s1', file: 'house_a_s1' },
    { key: 'village_house_a_s2', file: 'house_a_s2', type: 'house_a' },
    { key: 'village_house_a_glow', file: 'house_a_glow', single: true },
    { key: 'village_house_b_s0', file: 'house_b_s0' },
    { key: 'village_house_b_s1', file: 'house_b_s1' },
    { key: 'village_house_b_s2', file: 'house_b_s2', type: 'house_b' },
    { key: 'village_house_b_glow', file: 'house_b_glow', single: true },
    { key: 'village_workshop_s0', file: 'workshop_s0' },
    { key: 'village_workshop_s1', file: 'workshop_s1' },
    { key: 'village_workshop_s2', file: 'workshop_s2', type: 'workshop' },
    { key: 'village_workshop_glow', file: 'workshop_glow', single: true },
    { key: 'village_granary_s0', file: 'granary_s0' },
    { key: 'village_granary_s1', file: 'granary_s1' },
    { key: 'village_granary_s2', file: 'granary_s2', type: 'granary' },
    { key: 'village_well_s2', file: 'well_s2', type: 'well' },
    { key: 'village_fence', file: 'fence', single: true },
    { key: 'village_stockpile', file: 'stockpile', single: true },
  ];

export interface VillageKit {
  assets: Map<string, PropLodAsset>;
  meta: Map<VillageBuildingType, VillageAssetMeta>;
}

type Pair = readonly [number, number];

function pair(value: unknown, what: string, file: string): Pair {
  if (Array.isArray(value) && value.length === 2 && value.every((v) => Number.isFinite(v))) {
    return [value[0], value[1]];
  }
  throw new Error(`village kit ${file}: extras.${what} must be [x, z] numbers`);
}

/** Footprint, door and builder spots from the glTF extras on the building node (see the kit README). */
function metaFromExtras(root: Object3D, file: string): VillageAssetMeta {
  let extras: Record<string, unknown> | null = null;
  root.traverse((o) => {
    if (!extras && o.userData.footprint) extras = o.userData;
  });
  if (!extras) throw new Error(`village kit ${file}: no node carries extras.footprint`);
  const e: Record<string, unknown> = extras;
  const slots = Array.isArray(e.workSlots) ? e.workSlots : [];
  const box = new Box3().setFromObject(root);
  return {
    footprint: pair(e.footprint, 'footprint', file),
    height: box.max.y - box.min.y,
    door: pair(e.door, 'door', file),
    workSlots: slots.map((s, i) => pair(s, `workSlots[${i}]`, file)),
    crownY: typeof e.crownY === 'number' ? e.crownY : undefined,
  };
}

/** Every kit file shares the village atlas: keep the first copy of each texture name, drop the rest. */
function shareTextures(root: Object3D, textures: Map<string, Texture>): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const map = (material as { map?: Texture | null }).map;
      if (!map?.name) continue;
      const shared = textures.get(map.name);
      if (!shared) textures.set(map.name, map);
      else if (shared !== map) {
        (material as { map?: Texture | null }).map = shared;
        map.dispose();
      }
    }
  });
}

/**
 * Load the modelled kit. A missing lod0 file keeps that key's placeholder (with a warning); missing
 * `_lod1` / `_lod2` siblings fall back to the next finer level.
 */
export async function loadVillageKit(renderer: WebGPURenderer): Promise<VillageKit> {
  const loader = new GLTFLoader();
  loader.setKTX2Loader(createKtx2Loader(renderer));
  const load = async (path: string): Promise<Object3D | null> => {
    try {
      return (await loader.loadAsync(path)).scene;
    } catch {
      return null;
    }
  };
  const textures = new Map<string, Texture>();
  const kit: VillageKit = { assets: new Map(), meta: new Map() };
  await Promise.all(
    KIT.map(async ({ key, file, type, single }) => {
      const path = `models/village-kit/${file}.glb`;
      const lod0 = await load(path);
      if (!lod0) {
        console.warn(
          `[village] kit file ${path} is missing or failed to load; keeping the placeholder for ${key}`,
        );
        return;
      }
      const lod1 = (single ? null : await load(lodSiblingPath(path, 1))) ?? lod0;
      const lod2 = (single ? null : await load(lodSiblingPath(path, 2))) ?? lod1;
      for (const root of new Set([lod0, lod1, lod2])) shareTextures(root, textures);
      kit.assets.set(key, { lod0, lod1, lod2 });
      if (type) kit.meta.set(type, metaFromExtras(lod0, file));
    }),
  );
  return kit;
}
