// src/landmarks/outpostProps.ts — what stands at an outpost: the crew's camp while it is built, a hut when it is done
//
// Placeholders from the existing asset set (landmarkStandIns.ts), spawned and freed one outpost at a time through
// the normal prop pipeline, like the restoration props. Follows the village's remote sites: a site of an outpost kind
// that is under way shows the camp, a finished one shows the outpost.

import type { DirectionalLight, Scene } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { bus } from '../core/EventBus';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { disposeMapProps, spawnMapProps } from '../world/map/MapEntitySpawner';
import type { PropLodGroup } from '../world/mapProps/mapPropLod';
import type { RemoteSite } from '../world/village/model/types';
import { outpostOf } from '../world/village/sim/outposts';
import { outpostProps } from './landmarkStandIns';

export interface OutpostPropsDeps {
  scene: Scene;
  sun: DirectionalLight;
  assets: AssetRegistry;
  terrain: MapTerrainContext;
  /** The shared list the prop LOD update walks; groups made here are added to it and taken out again. */
  propLodGroups: PropLodGroup[];
  /** The village's remote sites, read live. */
  sites: () => readonly RemoteSite[];
}

export function initOutpostProps(deps: OutpostPropsDeps): () => void {
  const { scene, propLodGroups } = deps;
  type Spawned = ReturnType<typeof spawnMapProps>;
  /** By site id: whether it is finished, and what was spawned. */
  const shown = new Map<number, { finished: boolean; spawned: Spawned }>();

  const clear = (id: number) => {
    const current = shown.get(id);
    if (!current) return;
    for (const group of current.spawned.lodGroups) {
      const at = propLodGroups.indexOf(group);
      if (at >= 0) propLodGroups.splice(at, 1);
    }
    disposeMapProps(scene, current.spawned);
    shown.delete(id);
  };

  const sync = () => {
    for (const site of deps.sites()) {
      const kind = outpostOf(site.kind);
      if (!kind) continue;
      const finished = site.stage >= 2;
      if (shown.get(site.id)?.finished === finished && shown.has(site.id)) continue;
      clear(site.id);
      const entities = outpostProps(kind, site.campX, site.campZ, finished);
      const spawned = spawnMapProps(scene, deps.sun, deps.assets, deps.terrain, entities);
      propLodGroups.push(...spawned.lodGroups);
      shown.set(site.id, { finished, spawned });
    }
  };

  sync();
  const off = bus.on('village:outpost', sync);
  return () => {
    off();
    for (const id of [...shown.keys()]) clear(id);
  };
}
