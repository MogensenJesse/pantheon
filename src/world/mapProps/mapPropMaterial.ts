// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/mapProps/mapPropMaterial.ts — GLTF map prop NodeMaterial with sun shadow receive
import { Color, DoubleSide, type DirectionalLight, type Material, type Texture } from 'three';
import { attribute, color, float, mix, positionWorld, texture, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { configureAlphaCutoutTexture } from '../../rendering/loaders/configureAlphaCutoutTexture';
import { hardenedAlphaCutoutNode } from '../../rendering/tsl/alphaCutoutTsl';
import { createSunShadowNode } from '../../rendering/sunShadow';
import { normalizeMaterialTextureSlots } from '../../rendering/shadowCastConfig';
import { applyPropShading } from './mapPropShadingTsl';
import { propCategoryMulUniform, propShadowUniforms } from './mapPropShadowUniforms';

type TexturedMaterial = Material & { map?: Texture | null; color?: Color };

/** Leaf cutout materials — sync CPU alphaTest when dev panel moves uAlphaTest. */
const leafPropMaterials = new Set<MeshBasicNodeMaterial>();

export function syncPropLeafAlphaTest(): void {
  const threshold = Number(propShadowUniforms.uAlphaTest.value);
  for (const material of leafPropMaterials) {
    material.alphaTest = threshold;
  }
}

/** GLTF petals/flowers keep authored MASK 0.2; tree leaves use live uAlphaTest. */
export function isSoftFoliageMaterial(base: Material): boolean {
  const name = (base.name ?? '').toLowerCase();
  return (
    name.includes('flower') ||
    name.includes('petal') ||
    name.includes('plant') ||
    name.includes('bush') ||
    name.includes('clover') ||
    name.includes('mushroom')
  );
}

function prepareBaseMaterial(base: Material): TexturedMaterial {
  const mat = base.clone();
  mat.side = DoubleSide;
  normalizeMaterialTextureSlots(mat);
  const textured = mat as TexturedMaterial;
  if (textured.map) {
    configureAlphaCutoutTexture(textured.map);
  }
  return textured;
}

function hardenedAlphaCutout(mapSample, base: Material) {
  const alphaTestNode = isSoftFoliageMaterial(base)
    ? float(0.2)
    : propShadowUniforms.uAlphaTest;
  const aCut = hardenedAlphaCutoutNode(
    mapSample.a,
    alphaTestNode,
    propShadowUniforms.uAlphaCutoffSharpness,
  );
  return aCut;
}

/** Baked AO from glTF COLOR_0; ensureGeometryColor fills white when absent. */
const propVertexColor = attribute('color', 'vec3');

/** GLTF prop material with TSL sun shadow receive (WebGPU). */
export function createMapPropNodeMaterial(
  sun: DirectionalLight,
  baseMaterial: Material,
): MeshBasicNodeMaterial {
  const base = prepareBaseMaterial(baseMaterial);
  const categoryMul = isSoftFoliageMaterial(baseMaterial)
    ? propShadowUniforms.uFoliageMul
    : propCategoryMulUniform(baseMaterial);
  const sunShadow = createSunShadowNode(sun);
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
    const aCut = hardenedAlphaCutout(mapSample, base);
    const vertexColorBlend = mix(vec3(1), propVertexColor, propShadowUniforms.uVertexColorMul);
    const albedo = mapSample.rgb.mul(tint).mul(vertexColorBlend).mul(aCut);
    const softFoliage = isSoftFoliageMaterial(base);
    material.opacityNode = aCut;
    material.alphaTest = softFoliage ? 0.2 : Number(propShadowUniforms.uAlphaTest.value);
    material.transparent = false;
    material.depthWrite = true;
    material.colorNode = applyPropShading(
      albedo,
      sunShadow,
      positionWorld,
      propShadowUniforms,
      categoryMul,
    );
    if (!softFoliage) {
      leafPropMaterials.add(material);
      material.addEventListener('dispose', () => {
        leafPropMaterials.delete(material);
      });
    }
  } else {
    material.colorNode = applyPropShading(
      tint.mul(mix(vec3(1), propVertexColor, propShadowUniforms.uVertexColorMul)),
      sunShadow,
      positionWorld,
      propShadowUniforms,
      categoryMul,
    );
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
