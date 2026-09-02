// src/world/grass/render/grassMaterial.ts — SpriteNodeMaterial grass blades (Revo-inspired)
import type { Texture } from 'three';
import {
  float,
  hash,
  instanceIndex,
  length,
  min,
  mix,
  normalize,
  positionWorld,
  smoothstep,
  texture,
  transformNormal,
  uv,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import type { ReceiverSunShadowNode } from '../../../rendering/sunShadow';
import type { GrassSsbo } from '../compute/grassSsbo';
import {
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackOriginalScale,
  unpackTerrainY,
  unpackVisByte,
} from '../compute/grassSsboPack';
import { grassSharedUniforms } from '../config/grassUniforms';
import { grassBendOffset, grassSpriteRotation } from '../tsl/grassBladeBendTsl';
import {
  applyGrassBladeSheenTransmission,
  grassBladeOcclusion,
  mixGrassBladeColor,
} from '../tsl/grassBladeLookTsl';
import { applyGrassCullDebugColor } from '../tsl/grassCullDebugTsl';
import { applyGrassTerrainDepthBias } from '../tsl/grassDepthBiasTsl';
import { applyGrassLodDebugColor } from '../tsl/grassLodDebugTsl';
import { applyGrassVegetationShading } from '../tsl/grassVegetationShadingTsl';
import { grassLiveWindBendXZ, grassTrailBendXZ } from '../tsl/grassWindTsl';
import type { TslNode } from '../tsl/tslNode';

/** 0 = LOD0 near (full quality), 1 = LOD1 mid, 2 = LOD2 far (cheapest). */
export type GrassLodTier = 0 | 1 | 2;

export function createGrassMaterial(
  ssbo: GrassSsbo,
  options: {
    sunShadow: ReceiverSunShadowNode;
    windAtlas?: Texture | null;
    lodTier?: GrassLodTier;
  },
): SpriteNodeMaterial {
  const lodTier = options.lodTier ?? 0;
  const {
    uBaseShadeHeight,
    uBaseWindShade,
    uPlayerPosition,
    uUncompactedDeltaXZ,
    uHeightScale,
    uSurfaceBias,
    uBladeMinScale,
    uBladeMaxScale,
    uTrailMinScale,
    uGrassCullDebug,
    uGrassLodColorDebug,
    uSunDirection,
    uWidthFarGain,
    uWidthNearRadiusSquared,
    uWidthFarRadiusSquared,
  } = grassSharedUniforms as any;

  const material = new SpriteNodeMaterial();
  material.precision = 'mediump';
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
  const currentScaleMin = min(uBladeMinScale, uTrailMinScale);
  const currentScaleSpan = uBladeMaxScale.sub(currentScaleMin);
  const offsetX = unpackOffsetX(packed.x).sub(uUncompactedDeltaXZ.x);
  const offsetZ = unpackOffsetZ(packed.y).sub(uUncompactedDeltaXZ.y);
  const originalScaleSpan = uBladeMaxScale.sub(uBladeMinScale);
  const scaleY = unpackCurrentScale(packed.w, currentScaleMin, currentScaleSpan);
  const originalScale = unpackOriginalScale(packed.w, uBladeMinScale, originalScaleSpan);
  const positionNoise = hash(sourceIndex.add(196.4356));
  const distSq = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
  const farWidthBlend = smoothstep(uWidthNearRadiusSquared, uWidthFarRadiusSquared, distSq);
  const farWidthGain = mix(float(1), uWidthFarGain, farWidthBlend);
  const scaleX = positionNoise.remap(0, 1, 0.5, 1.5).mul(farWidthGain);
  material.scaleNode = vec3(scaleX, scaleY, 1);

  const bladeUv = uv();
  const wrapNormal = normalize(vec3(bladeUv.x.sub(0.5).mul(0.8), float(0.85), float(0.15)));
  material.normalNode = wrapNormal;
  const h = bladeUv.y;
  material.rotationNode = grassSpriteRotation(sourceIndex, h) as any;

  const bladeY = unpackTerrainY(packed.z, uHeightScale, uSurfaceBias);
  const worldX = offsetX.add(uPlayerPosition.x);
  const worldZ = offsetZ.add(uPlayerPosition.z);
  const worldPos = vec3(worldX, bladeY, worldZ);
  const windTex = options.windAtlas ? texture(options.windAtlas) : null;
  const sampleWindAtlas = windTex ? (atlasUv: TslNode) => windTex.sample(atlasUv) : null;
  const windBend = grassLiveWindBendXZ({
    worldPos,
    scaleY,
    sourceIndex,
    distanceSquared: distSq,
    sampleWindAtlas,
    blendDistant: lodTier >= 2,
  });
  const trailBend = grassTrailBendXZ(offsetX, offsetZ, distSq, scaleY, originalScale);
  const bendXZ = windBend.add(trailBend);
  const bladePosition = vec3(offsetX, bladeY, offsetZ).add(grassBendOffset(bendXZ, h, scaleY));
  material.positionNode = bladePosition;

  const bladeColor = mixGrassBladeColor(h, positionNoise);
  const occlusion = grassBladeOcclusion(bladeUv, offsetX, offsetZ);
  const baseMask = float(1).sub((smoothstep as any)(float(0), uBaseShadeHeight, h));
  const swayFactor = h.mul(length(bendXZ));
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
    offsetX,
    offsetZ,
  });
  const shaded = applyGrassBladeSheenTransmission({
    lit,
    albedo,
    bladeHash: positionNoise,
    bladeHeight: h,
    worldPosition: worldPos,
  });
  const cullReason = unpackVisByte(packed.w).toFloat();
  const lodTinted = applyGrassLodDebugColor(shaded, lodTier, uGrassLodColorDebug);
  material.colorNode = applyGrassCullDebugColor(lodTinted, cullReason, uGrassCullDebug);

  applyGrassTerrainDepthBias(material);

  return material;
}
