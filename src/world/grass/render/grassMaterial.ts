// src/world/grass/render/grassMaterial.ts — SpriteNodeMaterial grass blades (Revo-inspired)
import type { Texture } from 'three';
import {
  float,
  hash,
  instanceIndex,
  length,
  mix,
  normalize,
  positionWorld,
  smoothstep,
  texture,
  transformNormal,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import type { ReceiverSunShadowNode } from '../../../rendering/sunShadow';
import { applyWetLookTsl } from '../../../rendering/tsl/wetLookTsl';
import type { GrassSsbo } from '../compute/grassSsbo';
import {
  unpackBaseScale,
  unpackCurrentScale,
  unpackTerrainY,
  unpackVisReason,
} from '../compute/grassSsboPack';
import { vegetationFollowSlot } from '../compute/shared/vegetationOffsetTsl';
import {
  createRingFadeIn,
  createRingFadeOut,
  createSampleGrassField,
} from '../compute/shared/vegetationVisibilityTsl';
import { type GrassRingUniforms, grassSharedUniforms } from '../config/grassUniforms';
import { grassBendOffset, grassSpriteRotation } from '../tsl/grassBladeBendTsl';
import {
  applyGrassBladeSheenTransmission,
  grassBladeOcclusion,
  mixGrassBladeColor,
} from '../tsl/grassBladeLookTsl';
import { applyGrassCullDebugColor } from '../tsl/grassCullDebugTsl';
import { grassViewRayPull } from '../tsl/grassDepthBiasTsl';
import { applyGrassLodDebugColor } from '../tsl/grassLodDebugTsl';
import { applyGrassVegetationShading } from '../tsl/grassVegetationShadingTsl';
import { mixWheatColor, wheatMask, wheatRipeness } from '../tsl/grassWheatTsl';
import { grassLiveWindBendXZ, grassTrailBendXZ } from '../tsl/grassWindTsl';
import type { TslNode } from '../tsl/tslNode';

/** 0 = LOD0 near (full quality), 1 = LOD1 mid, 2 = LOD2 far (cheapest). */
export type GrassLodTier = 0 | 1 | 2;

export function createGrassMaterial(
  ssbo: GrassSsbo,
  options: {
    sunShadow: ReceiverSunShadowNode;
    windAtlas: Texture;
    ringUniforms: GrassRingUniforms;
    lodTier?: GrassLodTier;
  },
): SpriteNodeMaterial {
  const lodTier = options.lodTier ?? 0;
  const {
    uBaseShadeHeight,
    uBaseWindShade,
    uPlayerPosition,
    uHeightScale,
    uSurfaceBias,
    uGrassCullDebug,
    uGrassLodColorDebug,
    uSunDirection,
    uWidthFarGain,
    uWidthNearRadiusSquared,
    uWidthFarRadiusSquared,
    uRingFadeHeightPower,
    uDepthPullM,
    uWorldSize,
  } = grassSharedUniforms;

  const material = new SpriteNodeMaterial();
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  {
    const contactPushM = VISUAL.shadows.lighting.shadowContactPushM;
    material.receivedShadowPositionNode =
      contactPushM > 0 ? positionWorld.sub(uSunDirection.mul(float(contactPushM))) : positionWorld;
  }
  const bladeNormalWorld = transformNormal(vec3(0, 0, 1));

  const sourceIndex = ssbo.visibleIndicesBuffer.element(instanceIndex) as any;
  const packed = ssbo.packedBuffer.element(sourceIndex) as any;
  const { uTileSize, uBladesPerSide, uInnerRadius, uOuterRadius, uFadeBandM, uFadeInBandM } =
    options.ringUniforms;
  const windTex = texture(options.windAtlas);
  const placed = vegetationFollowSlot({
    slotIndex: sourceIndex,
    perSide: uBladesPerSide,
    spacing: uTileSize.div(uBladesPerSide),
    tileSize: uTileSize,
    windTex,
    playerX: uPlayerPosition.x,
    playerZ: uPlayerPosition.z,
  });
  const offsetX = placed.offsetX;
  const offsetZ = placed.offsetZ;
  const distSq = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
  // Outer skirt: 1 through the full band, then to 0 at the cull radius. The next ring is
  // already full there, so this ring shrinks away on top of it. The inner fade-in is the
  // mirror ramp. Length uses a steeper curve than the (linear) compact density so a
  // thinning edge never reads as tall grass.
  const ringDist = distSq.sqrt();
  const fadeOut: TslNode = createRingFadeOut(uOuterRadius, uFadeBandM)(ringDist);
  const fadeIn: TslNode = createRingFadeIn(uInnerRadius, uFadeInBandM)(ringDist);
  const ringFade: TslNode = fadeOut.mul(fadeIn);
  const currentScale = unpackCurrentScale(packed.y);
  const scaleY = currentScale.mul(ringFade.pow(uRingFadeHeightPower));
  const baseScale = unpackBaseScale(packed.y);
  const positionNoise: TslNode = hash(sourceIndex.add(196.4356));
  const farWidthBlend = smoothstep(uWidthNearRadiusSquared, uWidthFarRadiusSquared, distSq);
  const farWidthGain: TslNode = mix(float(1), uWidthFarGain, farWidthBlend);
  const scaleX: TslNode = positionNoise.remap(0, 1, 0.5, 1.5).mul(farWidthGain).mul(ringFade);
  material.scaleNode = vec2(scaleX, scaleY);

  const bladeUv = uv();
  const wrapNormal = normalize(vec3(bladeUv.x.sub(0.5).mul(0.8), float(0.85), float(0.15)));
  material.normalNode = wrapNormal;
  const h = bladeUv.y;
  material.rotationNode = grassSpriteRotation(sourceIndex, h) as any;

  const bladeY = unpackTerrainY(packed.x, uHeightScale, uSurfaceBias);
  const worldX = offsetX.add(uPlayerPosition.x);
  const worldZ = offsetZ.add(uPlayerPosition.z);
  const worldPos = vec3(worldX, bladeY, worldZ);
  const sampleWindAtlas = (atlasUv: TslNode) => windTex.sample(atlasUv);
  const windBend = grassLiveWindBendXZ({
    worldPos,
    scaleY,
    sourceIndex,
    sampleWindAtlas: lodTier >= 2 ? null : sampleWindAtlas,
  });
  // Un-skirted scale: the fade must not read as trampling and lean edge blades outward.
  const trailBend = grassTrailBendXZ(offsetX, offsetZ, distSq, currentScale, baseScale);
  const bendXZ = windBend.add(trailBend);
  const depthPull = grassViewRayPull(worldPos, uDepthPullM);
  const bladePosition = vec3(offsetX, bladeY, offsetZ)
    .add(grassBendOffset(bendXZ, h, scaleY))
    .add(depthPull);
  material.positionNode = bladePosition;

  // Per-instance values the fragment stage reads. Without varyings TSL re-emits their whole
  // graph (storage reads, hashes, wrap maths, wind-atlas sample) for every pixel.
  const fragNoise: TslNode = (positionNoise as any).toVarying();
  const fragOffset: TslNode = (vec2(offsetX, offsetZ) as any).toVarying();
  const fragOffsetX: TslNode = (fragOffset as any).x;
  const fragOffsetZ: TslNode = (fragOffset as any).y;
  const fragWorldPos: TslNode = (worldPos as any).toVarying();
  const fragBendLength: TslNode = (length(bendXZ) as any).toVarying();

  // Wheat fields (grass data B): the blade takes the field colour, green when young to gold when ripe.
  const wheatRaw = createSampleGrassField(texture(ssbo.grassDataMap), uWorldSize)(worldX, worldZ);
  const fragWheat: TslNode = (
    vec2(wheatMask(wheatRaw), wheatRipeness(wheatRaw)) as any
  ).toVarying();
  const bladeColor = mix(
    mixGrassBladeColor(h, fragNoise),
    mixWheatColor(h, fragNoise, (fragWheat as any).y),
    (fragWheat as any).x,
  );
  const occlusion =
    lodTier >= 2 ? float(1) : grassBladeOcclusion(bladeUv, fragOffsetX, fragOffsetZ);
  const baseMask = float(1).sub((smoothstep as any)(float(0), uBaseShadeHeight, h));
  const swayFactor = h.mul(fragBendLength);
  const windAo: TslNode = (mix as any)(
    float(1),
    float(1).sub(uBaseWindShade),
    baseMask.mul((smoothstep as any)(float(0), float(1), swayFactor)),
  );

  const albedo = (bladeColor as any).mul(windAo).mul(occlusion);
  const thickness = (smoothstep as any)(float(0.15), float(0.95), h);
  const lit = applyGrassVegetationShading({
    albedo,
    wrapNormal,
    bladeNormalWorld,
    thickness,
    sunShadow: options.sunShadow,
    backlightMode: 'full',
    nightMode: lodTier >= 2 ? 'simple-dim' : 'player-glow',
    offsetX: fragOffsetX,
    offsetZ: fragOffsetZ,
  });
  const sheened =
    lodTier >= 2
      ? lit
      : applyGrassBladeSheenTransmission({
          lit,
          albedo,
          bladeHash: fragNoise,
          bladeHeight: h,
          worldPosition: fragWorldPos,
        });
  // Rain: wet grass is darker and richer, like the ground it grows from.
  const shaded = applyWetLookTsl(sheened);
  if (import.meta.env.DEV) {
    const cullReason = (unpackVisReason(packed.y) as any).toVarying();
    const lodTinted = applyGrassLodDebugColor(shaded, lodTier, uGrassLodColorDebug);
    material.colorNode = applyGrassCullDebugColor(lodTinted, cullReason, uGrassCullDebug);
  } else {
    material.colorNode = shaded;
  }

  return material;
}
