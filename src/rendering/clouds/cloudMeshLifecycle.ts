// src/rendering/clouds/cloudMeshLifecycle.ts — mesh create/configure/dispose + reflection proxies
import { type Group, type InstancedMesh, SphereGeometry } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { configureMeshShadowCast, unregisterMeshShadowCast } from '../sunShadow';
import { CLOUD_SHADOW_LAYER } from '../sunShadow/cloudCastShadowLayer';
import { CLOUD_MESH_RENDER_ORDER } from './cloudMeshMaterial';
import type { CloudFieldData, CloudParticlePlacement } from './generateCloudField';

/** Soft-sphere tessellation — soft N·V hides faceting; keep low for fill rate. */
const CLOUD_SPHERE_WIDTH_SEGMENTS = 10;
const CLOUD_SPHERE_HEIGHT_SEGMENTS = 8;

/** Reflection proxy spheres — low-res RT; faceting is invisible. */
const CLOUD_PROXY_WIDTH_SEGMENTS = 6;
const CLOUD_PROXY_HEIGHT_SEGMENTS = 4;

export function createCloudSphereGeometry(): SphereGeometry {
  return new SphereGeometry(1, CLOUD_SPHERE_WIDTH_SEGMENTS, CLOUD_SPHERE_HEIGHT_SEGMENTS);
}

export function createCloudProxySphereGeometry(): SphereGeometry {
  return new SphereGeometry(1, CLOUD_PROXY_WIDTH_SEGMENTS, CLOUD_PROXY_HEIGHT_SEGMENTS);
}

/**
 * One inflated sphere per cluster for the water reflector — covers soft-particle footprint
 * without redrawing particlesPerCloud soft spheres into the low-res RT.
 */
export function buildClusterProxyPlacements(
  field: CloudFieldData,
  scaleMul: number,
): CloudParticlePlacement[] {
  const out: CloudParticlePlacement[] = [];
  for (const c of field.clusters) {
    let maxR = 1;
    for (const p of c.particles) {
      const reach = Math.hypot(p.x, p.y, p.z) + Math.max(p.sx, p.sy, p.sz) * 0.5;
      if (reach > maxR) maxR = reach;
    }
    const s = maxR * scaleMul;
    out.push({
      cloudIndex: c.index,
      particleIndex: 0,
      genus: c.genus,
      clusterX: c.centerX,
      clusterY: c.centerY,
      clusterZ: c.centerZ,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      scaleX: s,
      scaleY: s * 0.55,
      scaleZ: s * 0.85,
    });
  }
  return out;
}

export function configureCloudMesh(
  mesh: InstancedMesh,
  castShadows: boolean,
  receiveShadows: boolean,
): void {
  mesh.name = 'meshCloudInstances';
  mesh.frustumCulled = true;
  mesh.castShadow = castShadows;
  mesh.receiveShadow = receiveShadows;
  mesh.renderOrder = CLOUD_MESH_RENDER_ORDER;
  // Soft cloud-cast map only — leave layer 0 so the main PCSS sun map never sees clouds.
  mesh.layers.disable(0);
  mesh.layers.enable(CLOUD_SHADOW_LAYER);
  if (castShadows) {
    configureMeshShadowCast(mesh);
  } else {
    unregisterMeshShadowCast(mesh);
  }
}

export function disposeCloudMesh(root: Group, mesh: InstancedMesh | null): void {
  if (!mesh) return;
  unregisterMeshShadowCast(mesh);
  root.remove(mesh);
  mesh.geometry.dispose();
}

export function readReflectCloudsMode(): 'proxy' | 'full' | 'off' {
  return VISUAL.water.reflectClouds;
}
