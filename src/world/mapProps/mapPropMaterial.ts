// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/mapProps/mapPropMaterial.ts — GLTF map prop NodeMaterial with sun shadow receive
import { Color, DoubleSide, type DirectionalLight, type Material, type Texture } from 'three';
import { color, float, positionWorld, texture, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { normalizeMaterialTextureSlots } from '../../rendering/shadowCastConfig';
import { applyPropShading } from './mapPropShadingTsl';
import { getPropSunShadow, propShadowUniforms } from './mapPropShadowUniforms';

type TexturedMaterial = Material & { map?: Texture | null; color?: Color };

function prepareBaseMaterial(base: Material): TexturedMaterial {
  const mat = base.clone();
  mat.side = DoubleSide;
  normalizeMaterialTextureSlots(mat);
  return mat as TexturedMaterial;
}

/** GLTF prop material with TSL sun shadow receive (WebGPU). */
export function createMapPropNodeMaterial(
  sun: DirectionalLight,
  baseMaterial: Material,
): MeshBasicNodeMaterial {
  const base = prepareBaseMaterial(baseMaterial);
  const sunShadow = getPropSunShadow(sun);
  const tint = color(base.color ?? new Color(0xffffff));

  const material = new MeshBasicNodeMaterial();
  material.lights = false;
  material.side = base.side;
  material.forceSinglePass = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;

  const shadowLift = float(VISUAL.props.shadowSampleLiftM);
  material.receivedShadowPositionNode = positionWorld.add(vec3(0, shadowLift, 0));

  if (base.map) {
    const mapSample = texture(base.map);
    const albedo = mapSample.rgb.mul(tint);
    material.opacityNode = mapSample.a;
    material.alphaTest = 0.2;
    material.transparent = false;
    material.depthWrite = true;
    material.colorNode = applyPropShading(albedo, sunShadow, positionWorld, propShadowUniforms);
  } else {
    material.colorNode = applyPropShading(tint, sunShadow, positionWorld, propShadowUniforms);
  }

  return material;
}

export function createMapPropNodeMaterials(
  sun: DirectionalLight,
  material: Material | Material[],
): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((m) => createMapPropNodeMaterial(sun, m));
  }
  return createMapPropNodeMaterial(sun, material);
}
