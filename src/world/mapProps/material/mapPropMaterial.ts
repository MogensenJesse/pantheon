// src/world/mapProps/material/mapPropMaterial.ts — GLTF map prop NodeMaterial with sun shadow receive
import {
  Color,
  type DirectionalLight,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  type Texture,
} from 'three';
import {
  attribute,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  clamp,
  color,
  float,
  max,
  mix,
  normalWorld,
  positionView,
  positionWorld,
  texture,
  vec3,
  vec4,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { MeshBasicNodeMaterial, NodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import { configureAlphaCutoutTexture } from '../../../rendering/loaders/configureAlphaCutoutTexture';
import {
  createFarOnlySunShadowNode,
  createReceiverSunShadowNode,
  getShadowCastMaterial,
  normalizeMaterialTextureSlots,
  uWorldFoliageAlphaTest,
} from '../../../rendering/sunShadow';
import { hardenedAlphaCutoutNode } from '../../../rendering/tsl/alphaCutoutTsl';
import {
  classifyPropMaterial,
  type PropMaterialClass,
  propCategoryMulFromClass,
  propGroundContactMulFromClass,
  propShadowUniforms,
} from '../config/mapPropShadowUniforms';
import { applyPropShading } from '../tsl/mapPropShadingTsl';
import { applyPropLodDebugColor } from '../tsl/propLodDebugTsl';

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
  return (hardenedAlphaCutoutNode as any)(mapSample.a, alphaTestNode, u.uAlphaCutoffSharpness);
}

/** Opaque-depth NodeMaterial shell shared by both foliage shadow casters. */
function createCasterMaterial(name: string): NodeMaterial {
  const material = new NodeMaterial();
  material.name = name;
  material.fog = false;
  material.side = DoubleSide;
  material.forceSinglePass = true;
  material.transparent = false;
  material.depthWrite = true;
  return material;
}

/**
 * Per-slot caster factory → matching shadow-pass materials. Returns undefined when every slot is
 * opaque so rocks and trunks keep the shared texture-free caster.
 */
function buildCasterMaterials(
  material: Material | Material[],
  createSlotCaster: (slot: Material) => NodeMaterial | null,
): Material | Material[] | undefined {
  const source = Array.isArray(material) ? material : [material];
  const casters = source.map(createSlotCaster);
  if (casters.every((cast) => cast === null)) return undefined;

  const resolved = casters.map((cast) => cast ?? getShadowCastMaterial());
  return Array.isArray(material) ? resolved : resolved[0];
}

/** Texture-only foliage caster that matches visible MASK silhouettes without sampling shadow(sun). */
function createMapPropShadowCastMaterial(baseMaterial: Material): NodeMaterial | null {
  const materialClass = classifyPropMaterial(baseMaterial.name);
  const textured = baseMaterial as TexturedMaterial;
  if (materialClass.category !== 'foliage' || !textured.map) return null;

  configureAlphaCutoutTexture(textured.map);
  const material = createCasterMaterial(`${baseMaterial.name || 'foliage'}-shadow-cast`);
  material.opacityNode = propAlphaCutout(texture(textured.map), materialClass);
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

/** Mip-mapped copy of a cutout map (one per source map, shared by every LOD and submesh). */
const mipAlphaCache = new WeakMap<Texture, Texture>();

function mipAlphaTexture(map: Texture): Texture {
  let mip = mipAlphaCache.get(map);
  if (!mip) {
    mip = map.clone();
    mip.generateMipmaps = true;
    mip.minFilter = LinearMipmapLinearFilter;
    mip.magFilter = LinearFilter;
    mip.needsUpdate = true;
    mipAlphaCache.set(map, mip);
  }
  return mip;
}

/**
 * World-cascade foliage caster. Cutout maps have no mips, so a metre-wide world texel would
 * point-sample one needle or gap, a coin flip per bake as the sun turns. A mip-mapped alpha copy
 * lets the texel test averaged coverage instead. Selected by alpha use rather than material name:
 * conifer cards (`Branches_lp`, `*_Billboard_Mat`) are glTF BLEND but not named leaf/needle.
 *
 * Coverage is applied as `maskShadowNode`: the shadow pass ignores `opacityNode`, so without it
 * every card would cast as a solid rectangle.
 */
function createMapPropCoarseShadowCastMaterial(baseMaterial: Material): NodeMaterial | null {
  const textured = baseMaterial as TexturedMaterial;
  const usesAlpha =
    classifyPropMaterial(baseMaterial.name).category === 'foliage' ||
    baseMaterial.transparent ||
    baseMaterial.alphaTest > 0;
  if (!textured.map || !usesAlpha) return null;

  const material = createCasterMaterial(`${baseMaterial.name || 'foliage'}-shadow-cast-coarse`);
  (material as NodeMaterial & { maskShadowNode: TslNode }).maskShadowNode = texture(
    mipAlphaTexture(textured.map),
  ).a.greaterThanEqual(uWorldFoliageAlphaTest);
  return material;
}

/** Shadow-pass materials for the world cascade; skipped when the cascade is disabled. */
export function createMapPropCoarseShadowCastMaterials(
  material: Material | Material[],
): Material | Material[] | undefined {
  if (!VISUAL.shadows.lighting.world.enabled) return undefined;
  return buildCasterMaterials(material, createMapPropCoarseShadowCastMaterial);
}

/** Baked AO from glTF COLOR_0; ensureGeometryColor fills white when absent. */
const propVertexColor = attribute('color', 'vec3') as TslNode;

/** Optional look of a textured prop (the village kit), as nodes so it can be tuned live: shade lift 0..1 and colour gain. */
export interface PropKitGrade {
  shade: TslNode;
  gain: TslNode;
}

/**
 * GLTF prop material with TSL sun shadow receive (WebGPU). `grade` lifts the shaded sides and scales the colour.
 * `largeFaces` (buildings): faces several metres wide keep the per-fragment depth write, because the vertex pull
 * interpolates wrongly across them (textures swim with the camera, layered faces swap places).
 */
export function createMapPropNodeMaterial(
  sun: DirectionalLight,
  baseMaterial: Material,
  lodBand: 0 | 1 | 2 = 0,
  grade?: PropKitGrade,
  largeFaces = false,
): MeshBasicNodeMaterial {
  const materialClass = classifyPropMaterial(baseMaterial.name);
  const base = prepareBaseMaterial(baseMaterial);
  const categoryMul = propCategoryMulFromClass(materialClass);
  const contactCategoryMul = propGroundContactMulFromClass(materialClass);
  // LOD1/LOD2 start past the near PCSS square (±32 m), so skip its ~48 taps there, like LOD2 grass.
  const sunShadow =
    lodBand >= 1 ? createFarOnlySunShadowNode(sun) : createReceiverSunShadowNode(sun);
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
    const texColor = grade ? mapSample.rgb.mul(grade.gain) : mapSample.rgb;
    const albedo = texColor.mul(tint).mul(vertexColorBlend).mul(aCut);
    material.opacityNode = aCut;
    material.alphaTest = materialClass.isSoftFoliage
      ? 0.2
      : Number(propShadowUniforms.uAlphaTest.value);
    material.transparent = false;
    material.depthWrite = true;
    material.colorNode = applyPropLodDebugColor(
      applyPropShading(
        albedo,
        sunShadow,
        positionWorld,
        categoryMul as TslNode,
        contactCategoryMul as TslNode,
        undefined,
        grade?.shade,
      ),
      lodBand,
    );
    if (!materialClass.isSoftFoliage) {
      leafPropMaterials.add(material);
      material.addEventListener('dispose', () => {
        leafPropMaterials.delete(material);
      });
    }
  } else {
    material.colorNode = applyPropLodDebugColor(
      applyPropShading(
        mix(vec3(1), propVertexColor, u.uVertexColorMul as TslNode).mul(tint),
        sunShadow,
        positionWorld,
        categoryMul as TslNode,
        contactCategoryMul as TslNode,
      ),
      lodBand,
    );
  }

  if (VISUAL.props.vertexDepthBias && !largeFaces) {
    // Same pull toward the camera, applied to the clip position along the view ray (xy unchanged)
    // instead of writing frag depth, which disables early-Z for every prop fragment.
    // positionWorld / positionView stay true, so ground contact and shadow lookups do not shift.
    const depth = max(positionView.z.negate(), float(1e-4));
    const pull = clamp(float(1).sub(float(PROP_GRASS_OVERLAY_DEPTH_BIAS_M).div(depth)), 0.5, 1);
    material.vertexNode = cameraProjectionMatrix.mul(vec4(positionView.mul(pull), 1));
  } else {
    const biasedViewZ = positionView.z.add(float(PROP_GRASS_OVERLAY_DEPTH_BIAS_M));
    material.depthNode = viewZToPerspectiveDepth(biasedViewZ, cameraNear, cameraFar);
  }

  return material;
}

export function createMapPropNodeMaterials(
  sun: DirectionalLight,
  material: Material | Material[],
  lodBand: 0 | 1 | 2 = 0,
): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((m) => createMapPropNodeMaterial(sun, m, lodBand));
  }
  return createMapPropNodeMaterial(sun, material, lodBand);
}

/** Matching far / near / cloud shadow-pass materials for foliage slots. */
export function createMapPropShadowCastMaterials(
  material: Material | Material[],
): Material | Material[] | undefined {
  return buildCasterMaterials(material, createMapPropShadowCastMaterial);
}
