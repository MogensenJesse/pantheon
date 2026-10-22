// src/landmarks/landmarkRestoreProps.ts — what the village builds at a place of power while it restores it
//
// The place's own props stay as the map spawned them. While a crew works, a ring of stones marks the site and
// the crew's camp stands where its route ends; when the place is restored the camp goes and the restored look
// stands around it (landmarkStandIns.ts has the props). Spawned and freed one place at a time through the
// normal prop pipeline.

import type { DirectionalLight, Scene } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { bus } from '../core/EventBus';
import type { LandmarkEntity, LandmarkKind } from '../map/MapTypes';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { disposeMapProps, spawnMapProps } from '../world/map/MapEntitySpawner';
import type { PropLodGroup } from '../world/mapProps/mapPropLod';
import { campProps, restoreProps } from './landmarkStandIns';
import type { LandmarkState, RestorationStatus } from './landmarks';

export interface LandmarkRestorePropsDeps {
  scene: Scene;
  sun: DirectionalLight;
  assets: AssetRegistry;
  terrain: MapTerrainContext;
  landmarks: readonly LandmarkEntity[];
  /** The shared list the prop LOD update walks; groups made here are added to it and taken out again. */
  propLodGroups: PropLodGroup[];
  state: () => LandmarkState;
  /** Where the crew's camp stands for a place, or null when there is none (yet). */
  campOf: (kind: LandmarkKind) => { x: number; z: number } | null;
}

export function initLandmarkRestoreProps(deps: LandmarkRestorePropsDeps): () => void {
  const { scene, propLodGroups } = deps;
  type Spawned = ReturnType<typeof spawnMapProps>;
  const shown = new Map<LandmarkKind, { status: RestorationStatus; spawned: Spawned }>();

  const clear = (kind: LandmarkKind) => {
    const current = shown.get(kind);
    if (!current) return;
    for (const group of current.spawned.lodGroups) {
      const at = propLodGroups.indexOf(group);
      if (at >= 0) propLodGroups.splice(at, 1);
    }
    disposeMapProps(scene, current.spawned);
    shown.delete(kind);
  };

  const sync = () => {
    const state = deps.state();
    for (const landmark of deps.landmarks) {
      const status = state.restoration[landmark.kind];
      if (shown.get(landmark.kind)?.status === status) continue;
      clear(landmark.kind);
      if (!status) continue;
      const entities = restoreProps(landmark, status);
      if (status === 'inProgress') {
        const camp = deps.campOf(landmark.kind);
        if (camp) entities.push(...campProps(camp.x, camp.z));
      }
      const spawned = spawnMapProps(scene, deps.sun, deps.assets, deps.terrain, entities);
      propLodGroups.push(...spawned.lodGroups);
      shown.set(landmark.kind, { status, spawned });
    }
  };

  sync();
  const offStarted = bus.on('landmark:restoreStarted', sync);
  const offRestored = bus.on('landmark:restored', sync);
  return () => {
    offStarted();
    offRestored();
    for (const kind of [...shown.keys()]) clear(kind);
  };
}
