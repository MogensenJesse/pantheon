// src/world/mapProps/material/mapPropMaterial.ts — GLTF map prop NodeMaterial with sun shadow receive
import { Color, type DirectionalLight, DoubleSide, type Material, type Texture } from 'three';
import {
  attribute,
  cameraFar,
  cameraNear,
  color,
  float,
  mix,
  normalWorld,
  positionView,
  positionWorld,
  texture,
  vec3,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { MeshBasicNodeMaterial, NodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import { configureAlphaCutoutTexture } from '../../../rendering/loaders/configureAlphaCutoutTexture';
import {
  createReceiverSunShadowNode,
  getShadowCastMaterial,
  normalizeMaterialTextureSlots,
} from '../../../rendering/sunShadow';
import { hardenedAlphaCutoutNode, hashedAlphaCutoutNode } from '../../../rendering/tsl/alphaCutoutTsl';
import { applyPropShading } from '../tsl/mapPropShadingTsl';
import {
  classifyPropMaterial,
  type PropMaterialClass,
  propCategoryMulFromClass,
  propGroundContactMulFromClass,
  propShadowUniforms,
} from '../config/mapPropShadowUniforms';

type TexturedMaterial = Material & { map?: Texture | null; color?: Color };
type TslNode = any;

/** View-space pull toward camera (m) — beats grass terrain bias (0.35) when drawn after grass. */
const PROP_GRASS_OVERLAY_DEPTH_BIAS_M = 0.45;

/** Tree leaf cutouts — sync CPU alphaTest when dev panel moves uAlphaTest. */
const leafPropMaterials = new Set<NodeMaterial>();

export function syncPropLeafAlphaTest(): void {
  const threshold = Number(propShadowUniforms.uAlphaTest.value);
  for (const material of leafPropMaterials) {
    material.alphaTest = threshold;
  }
}

/** GLTF petals/flowers keep authored MASK 0.2; tree leaves use live uAlphaTest. */
export function isSoftFoliageMaterial(base: Material): boolean {
  return classifyPropMaterial(base.name).isSoftFoliage;
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

function propAlphaCutout(mapSample: TslNode, materialClass: PropMaterialClass): TslNode {
  const u = propShadowUniforms as any;
  const alphaTestNode = materialClass.isSoftFoliage ? float(0.2) : u.uAlphaTest;
  // Tree leaves/needles only — bark/rocks/soft foliage keep hardened cutout.
  if (materialClass.category === 'foliage' && !materialClass.isSoftFoliage) {
    return (hashedAlphaCutoutNode as any)(
      mapSample.a,
      alphaTestNode,
      u.uAlphaCutoffSharpness,
      u.uHashedAlphaStrength,
      positionWorld,
    );
  }
  return (hardenedAlphaCutoutNode as any)(mapSample.a, alphaTestNode, u.uAlphaCutoffSharpness);
}

/** Texture-only foliage caster that matches visible MASK silhouettes without sampling shadow(sun). */
function createMapPropShadowCastMaterial(baseMaterial: Material): NodeMaterial | null {
  const materialClass = classifyPropMaterial(baseMaterial.name);
  const textured = baseMaterial as TexturedMaterial;
  if (materialClass.category !== 'foliage' || !textured.map) return null;

  configureAlphaCutoutTexture(textured.map);
  const u = propShadowUniforms as any;
  const alphaTestNode = materialClass.isSoftFoliage ? float(0.2) : u.uAlphaTest;
  const alphaCutout = (hardenedAlphaCutoutNode as any)(
    texture(textured.map).a,
    alphaTestNode,
    u.uAlphaCutoffSharpness,
  );

  const material = new NodeMaterial();
  material.name = `${baseMaterial.name || 'foliage'}-shadow-cast`;
  material.fog = false;
  material.side = DoubleSide;
  material.forceSinglePass = true;
  material.transparent = false;
  material.depthWrite = true;
  material.opacityNode = alphaCutout;
  material.alphaTest = materialClass.isSoftFoliage
    ? 0.2
    : Number(propShadowUniforms.uAlphaTest.value);

  if (!materialClass.isSoftFoliage) {
    leafPropMaterials.add(material);
    material.addEventListener('dispose', () => {
      leafPropMaterials.delete(material);
    });
  }
  return material;
}

/** Baked AO from glTF COLOR_0; ensureGeometryColor fills white when absent. */
const propVertexColor = attribute('color', 'vec3') as TslNode;

/** GLTF prop material with TSL sun shadow receive (WebGPU). */
export function createMapPropNodeMaterial(
  sun: DirectionalLight,
  baseMaterial: Material,
): MeshBasicNodeMaterial {
  const materialClass = classifyPropMaterial(baseMaterial.name);
  const base = prepareBaseMaterial(baseMaterial);
  const categoryMul = propCategoryMulFromClass(materialClass);
  const contactCategoryMul = propGroundContactMulFromClass(materialClass);
  const sunShadow = createReceiverSunShadowNode(sun);
  const tint = color(base.color ?? new Color(0xffffff));
  const u = propShadowUniforms as any;

  const material = new MeshBasicNodeMaterial();
  material.precision = 'mediump';
  material.lights = false;
  material.side = base.side;
  material.forceSinglePass = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;

  material.receivedShadowPositionNode =
    materialClass.category === 'foliage'
      ? positionWorld.add(normalWorld.mul(float(VISUAL.props.shadowSampleLiftM)))
      : positionWorld;

  if (base.map) {
    const mapSample = texture(base.map);
    const aCut = propAlphaCutout(mapSample, materialClass);
    const vertexColorBlend = mix(vec3(1), propVertexColor, u.uVertexColorMul);
    const albedo = mapSample.rgb.mul(tint).mul(vertexColorBlend).mul(aCut);
    material.opacityNode = aCut;
    material.alphaTest = materialClass.isSoftFoliage
      ? 0.2
      : Number(propShadowUniforms.uAlphaTest.value);
    material.transparent = false;
    material.depthWrite = true;
    material.colorNode = applyPropShading(
      albedo,
      sunShadow,
      positionWorld,
      categoryMul as TslNode,
      contactCategoryMul as TslNode,
    );
    if (!materialClass.isSoftFoliage) {
      leafPropMaterials.add(material);
      material.addEventListener('dispose', () => {
        leafPropMaterials.delete(material);
      });
    }
  } else {
    material.colorNode = applyPropShading(
      mix(vec3(1), propVertexColor, u.uVertexColorMul as TslNode).mul(tint),
      sunShadow,
      positionWorld,
      categoryMul as TslNode,
      contactCategoryMul as TslNode,
    );
  }

  const biasedViewZ = positionView.z.add(float(PROP_GRASS_OVERLAY_DEPTH_BIAS_M));
  material.depthNode = viewZToPerspectiveDepth(biasedViewZ, cameraNear, cameraFar);

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

/**
 * Matching shadow-pass materials for foliage slots. Returns undefined when every slot is opaque,
 * allowing rocks and trunks to keep the shared texture-free caster.
 */
export function createMapPropShadowCastMaterials(
  material: Material | Material[],
): Material | Material[] | undefined {
  const source = Array.isArray(material) ? material : [material];
  const foliageCasts = source.map(createMapPropShadowCastMaterial);
  if (foliageCasts.every((cast) => cast === null)) return undefined;

  const casts = foliageCasts.map((cast) => cast ?? getShadowCastMaterial());
  return Array.isArray(material) ? casts : casts[0];
}
