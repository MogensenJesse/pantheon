// src/dev/runtime/RenderDebugController.ts — dev-only scene visibility and shadow overrides
import type { DirectionalLight, InstancedMesh, Object3D, Scene } from 'three';
import type { RenderDebugSettings } from '../../core/GameState';
import {
  GRASS_ISOLATE_FLOWER_ROOT_NAME,
  GRASS_ISOLATE_RING_ROOT_NAMES,
  grassIsolateFlowerHidden,
  grassIsolateRingHidden,
} from '../../core/state/grassIsolateDebug';
import type { MeshCloudSystemContext } from '../../rendering/clouds/MeshCloudSystem';
import type { SkyBackgroundHandle } from '../../rendering/sky/SkySystem';
import {
  invalidateNearCascadeShadowMap,
  invalidateSunShadowMap,
  type SunShadowDebugTargets,
} from '../../rendering/sunShadow';
import type { TerrainSplatUniforms } from '../../world/terrain/material/biomeSplatUniforms';
import { applyShadowDebugOverrides } from './shadowDebugOverrides';

/** Shadow-map content changes when caster visibility toggles — re-render the gated map. */
let lastHideMapProps: boolean | undefined;
let lastHideClouds: boolean | undefined;

export interface RenderDebugTargets {
  scene: Scene;
  terrainMesh: Object3D;
  water: Object3D;
  sky: SkyBackgroundHandle;
  cloudSystem?: MeshCloudSystemContext | null;
  mapPropMeshes: InstancedMesh[];
  grassMesh?: Object3D | null;
  sun: DirectionalLight;
  /** Terrain splat uniforms — shadow visualization debug view. */
  terrainUniforms?: TerrainSplatUniforms;
  sunShadowDebugTargets?: SunShadowDebugTargets;
}

export function applyRenderDebug(
  targets: RenderDebugTargets | null,
  settings: RenderDebugSettings,
): void {
  if (!targets) return;
  const d = settings;

  targets.terrainMesh.visible = !d.hideTerrain;
  targets.water.visible = !d.hideWater;
  targets.sky.visible = !d.hideSky;

  const clouds = targets.cloudSystem;
  if (clouds) {
    const hide = d.hideClouds;
    if (hide) {
      clouds.setEnabled(false);
    } else if (clouds.root.userData.__hiddenByDevPanel) {
      clouds.setEnabled(true);
    }
    clouds.root.userData.__hiddenByDevPanel = hide;
  }

  for (const mesh of targets.mapPropMeshes) {
    if (d.hideMapProps) {
      mesh.visible = false;
    } else if (mesh.userData.__hiddenByDevPanel) {
      mesh.visible = true;
    }
    mesh.userData.__hiddenByDevPanel = d.hideMapProps;
  }

  const grass = targets.grassMesh;
  if (grass) {
    if (d.hideGrass) {
      grass.visible = false;
    } else if (grass.userData.__hiddenByDevPanel) {
      grass.visible = true;
    }
    grass.userData.__hiddenByDevPanel = d.hideGrass;
    applyGrassIsolateVisibility(grass, d);
  }

  applyShadowDebugOverrides(targets.sun, targets.sunShadowDebugTargets, d.disableShadows);

  if (d.hideMapProps !== lastHideMapProps || d.hideClouds !== lastHideClouds) {
    invalidateSunShadowMap();
    invalidateNearCascadeShadowMap();
    lastHideMapProps = d.hideMapProps;
    lastHideClouds = d.hideClouds;
  }
}

/** Per-ring / flower draw hide. Compact skip is applied in GrassSystem.update. */
function applyGrassIsolateVisibility(grassRoot: Object3D, settings: RenderDebugSettings): void {
  for (const child of grassRoot.children) {
    const ringIndex = (GRASS_ISOLATE_RING_ROOT_NAMES as readonly string[]).indexOf(child.name);
    if (ringIndex >= 0) {
      child.visible = !grassIsolateRingHidden(settings, ringIndex);
      continue;
    }
    if (child.name === GRASS_ISOLATE_FLOWER_ROOT_NAME) {
      child.visible = !grassIsolateFlowerHidden(settings);
    }
  }
}
