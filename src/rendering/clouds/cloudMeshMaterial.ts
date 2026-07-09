// src/rendering/clouds/cloudMeshMaterial.ts — TSL soft-sphere cloud particles (mesh cluster)
import { Color, DoubleSide, Vector3 } from 'three';
import {
  cameraPosition,
  dot,
  float,
  max,
  normalWorld,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  uniform,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { readCloudSettings } from './cloudConfig';

type UniformNode = ReturnType<typeof uniform>;
type TslNode = any;

/** After water (`renderOrder` 1), before glow/props. */
export const CLOUD_MESH_RENDER_ORDER = 2;

export interface CloudMeshUniforms {
  uSunDir: { value: Vector3 };
  uSunColor: { value: Color };
  uAmbientColor: { value: Color };
  uBaseColor: { value: Color };
  uOpacity: UniformNode;
}

export function createCloudMeshUniforms(): CloudMeshUniforms {
  const defaults = readCloudSettings();
  return {
    uSunDir: uniform(new Vector3(0.3, 0.8, 0.5).normalize()),
    uSunColor: uniform(new Color(0xfff8e7)),
    uAmbientColor: uniform(new Color(0xb0c4de)),
    uBaseColor: uniform(new Color(0xffffff)),
    uOpacity: uniform(defaults.opacity),
  };
}

export interface CloudMeshLighting {
  sunDir: Vector3;
  sunColor: Color;
  ambientColor: Color;
  baseColor?: Color;
  opacity?: number;
}

export function syncCloudMeshLighting(
  uniforms: CloudMeshUniforms,
  lighting: CloudMeshLighting,
): void {
  uniforms.uSunDir.value.copy(lighting.sunDir).normalize();
  uniforms.uSunColor.value.copy(lighting.sunColor);
  uniforms.uAmbientColor.value.copy(lighting.ambientColor);
  if (lighting.baseColor) uniforms.uBaseColor.value.copy(lighting.baseColor);
  if (lighting.opacity !== undefined) uniforms.uOpacity.value = lighting.opacity;
}

/**
 * Instanced unit-sphere material — wrap diffuse, mild SSS, view-facing soft alpha.
 * Port of procedural-clouds skill mesh_cloud.frag (TSL).
 */
export function createCloudMeshMaterial(
  uniforms: CloudMeshUniforms = createCloudMeshUniforms(),
): MeshBasicNodeMaterial {
  const uSunDir = uniforms.uSunDir as TslNode;
  const uSunColor = uniforms.uSunColor as TslNode;
  const uAmbientColor = uniforms.uAmbientColor as TslNode;
  const uBaseColor = uniforms.uBaseColor as TslNode;
  const uOpacity = uniforms.uOpacity as TslNode;

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  material.fog = false;
  material.side = DoubleSide;
  material.forceSinglePass = true;
  material.precision = 'mediump';

  const N = normalize(normalWorld);
  const L = normalize(uSunDir);
  const viewDir = normalize(cameraPosition.sub(positionWorld));

  const diff = dot(N, L).mul(0.5).add(0.5);
  const sss = pow(max(dot(N.negate(), L), float(0)), float(2)).mul(0.4);
  const topBias = smoothstep(float(-0.2), float(0.5), N.y).mul(0.3);
  const baseDarken = smoothstep(float(0.3), float(-0.3), N.y).mul(0.3);

  const sunLit = uSunColor.mul(diff).add(uAmbientColor.mul(0.4)).add(uSunColor.mul(sss));
  let lit = uBaseColor.mul(sunLit).add(uSunColor.mul(topBias));
  lit = lit.mul(float(1).sub(baseDarken));

  const facing = pow(max(dot(N, viewDir), float(0)), float(0.55));
  const alpha = uOpacity.mul(facing);

  material.colorNode = lit;
  material.opacityNode = alpha;

  return material;
}
