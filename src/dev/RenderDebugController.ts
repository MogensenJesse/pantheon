// src/dev/RenderDebugController.ts — dev-only scene visibility and shadow overrides
import type { DirectionalLight, InstancedMesh, Mesh, Object3D, Scene } from 'three';
import type { SkyBackgroundHandle } from '../rendering/sky/SkySystem';
import type { RenderDebugSettings } from '../core/GameState';
import type { TerrainSplatUniforms } from '../world/terrain/biomeSplatUniforms';
import { applyShadowDebugOverrides } from './shadowDebugOverrides';

export interface RenderDebugTargets {
  scene: Scene;
  terrainMesh: Mesh;
  water: Object3D;
  clouds: Object3D;
  sky: SkyBackgroundHandle;
  scatterMeshes: InstancedMesh[];
  sun: DirectionalLight;
  /** Terrain splat uniforms — shadow floor override when disabling shadows. */
  terrainUniforms?: TerrainSplatUniforms;
}

export function applyRenderDebug(
  targets: RenderDebugTargets | null,
  settings: RenderDebugSettings,
): void {
  if (!targets) return;
  const d = settings;

  targets.terrainMesh.visible = !d.hideTerrain;
  targets.water.visible = !d.hideWater;
  targets.clouds.visible = !d.hideClouds;
  targets.sky.visible = !d.hideSky;

  for (const mesh of targets.scatterMeshes) {
    if (d.hideScatter) {
      mesh.visible = false;
    } else if (mesh.userData.__hiddenByDevPanel) {
      mesh.visible = true;
    }
    mesh.userData.__hiddenByDevPanel = d.hideScatter;
  }

  applyShadowDebugOverrides(targets.sun, targets.terrainUniforms, d.disableShadows);
}
