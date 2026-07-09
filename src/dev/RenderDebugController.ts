// src/dev/RenderDebugController.ts — dev-only scene visibility and shadow overrides
import type { DirectionalLight, InstancedMesh, Object3D, Scene } from 'three';
import type { RenderDebugSettings } from '../core/GameState';
import type { SunShadowDebugTargets } from '../rendering/sunShadow';
import type { SkyBackgroundHandle } from '../rendering/sky/SkySystem';
import type { MeshCloudSystemContext } from '../rendering/clouds/MeshCloudSystem';
import { shouldRenderMeshClouds } from '../rendering/clouds/volumetric/volumetricCloudRuntime';
import type { TerrainSplatUniforms } from '../world/terrain/material/biomeSplatUniforms';
import { applyShadowDebugOverrides } from './shadowDebugOverrides';

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
    const hide = d.hideClouds || d.showCloudNoiseDebug || !shouldRenderMeshClouds();
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
  }

  applyShadowDebugOverrides(targets.sun, targets.sunShadowDebugTargets, d.disableShadows);
}
