// @ts-nocheck — TSL node typings incomplete in three r186
// src/world/village/render/blobShadows.ts — soft contact shadow quad under each villager, tilted to the ground
import {
  attribute,
  cameraFar,
  cameraNear,
  float,
  length,
  max,
  mix,
  positionView,
  smoothstep,
  sqrt,
  vec3,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VILLAGE } from '../../../config/village';
import { propShadowUniforms } from '../../mapProps/config/mapPropShadowUniforms';
import { BLOB_DEPTH_PULL_M } from './depthPull';

const LIFT_M = 0.05;

export function createBlobShadowMaterial(): MeshBasicNodeMaterial {
  const iPose = attribute('iPose', 'vec4');
  const iLook = attribute('iLook', 'vec4');
  const corner = attribute('position', 'vec3');
  const { BLOB } = VILLAGE.VILLAGERS;

  const nx = iLook.z;
  const nz = iLook.w;
  const ny = max(sqrt(max(float(1).sub(nx.mul(nx)).sub(nz.mul(nz)), 0.09)), 0.3);
  const size = iLook.y.mul(BLOB.RADIUS_M * 2);
  const dx = corner.x.mul(size);
  const dz = corner.z.mul(size);
  // Slide the quad along the ground plane: y follows the surface normal across the footprint.
  const y = iPose.y.add(LIFT_M).sub(nx.mul(dx).add(nz.mul(dz)).div(ny));

  const { uDaylight, uNightSkyDaylight } = propShadowUniforms;
  const day = smoothstep(uNightSkyDaylight, float(1), uDaylight);
  const strength = mix(float(BLOB.STRENGTH * BLOB.NIGHT_MUL), float(BLOB.STRENGTH), day);
  const falloff = float(1).sub(smoothstep(float(0.3), float(1), length(corner.xz).mul(2)));

  const material = new MeshBasicNodeMaterial();
  material.name = 'village_blob_shadow';
  material.lights = false;
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.positionNode = vec3(iPose.x.add(dx), y, iPose.z.add(dz));
  material.colorNode = vec3(0, 0, 0);
  material.opacityNode = falloff.mul(strength);
  material.depthNode = viewZToPerspectiveDepth(
    positionView.z.add(float(BLOB_DEPTH_PULL_M)),
    cameraNear,
    cameraFar,
  );
  return material;
}
