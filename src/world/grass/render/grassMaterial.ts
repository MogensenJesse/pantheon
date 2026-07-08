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
  PI2,
  positionWorld,
  sin,
  smoothstep,
  transformNormal,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { type SunShadowNode } from '../../../rendering/sunShadow';
import type { GrassSsbo } from '../compute/grassSsbo';
import {
  unpackCurrentScale,
  unpackOffsetX,
  unpackOffsetZ,
  unpackTerrainY,
  unpackVisByte,
} from '../compute/grassSsboPack';
import { grassSharedUniforms } from '../config/grassUniforms';
import { applyGrassCullDebugColor } from '../tsl/grassCullDebugTsl';
import { applyGrassTerrainDepthBias } from '../tsl/grassDepthBiasTsl';
import { applyGrassVegetationShading } from '../tsl/grassVegetationShadingTsl';
import { sampleGrassWindXZ } from '../tsl/grassWindTsl';
import type { TslNode } from '../tsl/tslNode';

/** 0 = LOD0 near (full quality), 1 = LOD1 mid, 2 = LOD2 far (cheapest). */
export type GrassLodTier = 0 | 1 | 2;

export function createGrassMaterial(
  ssbo: GrassSsbo,
  options: {
    sunShadow: SunShadowNode;
    windAtlas?: Texture | null;
    sampleTerrainSurfacePosition?: ((worldXZ: TslNode) => TslNode) | null;
    lodTier?: GrassLodTier;
  },
): SpriteNodeMaterial {
  const lodTier = options.lodTier ?? 0;
  const {
    uBaseBending,
    uTime,
    uWindDirection,
    uWindSpeed,
    uColorMixFactor,
    uColorVariationStrength,
    uBaseColor,
    uTipColor,
    uBaseShadeHeight,
    uBaseWindShade,
    uPlayerPosition,
    uHeightScale,
    uSurfaceBias,
    uBladeMinScale,
    uBladeMaxScale,
    uTrailMinScale,
    uGrassCullDebug,
  } = grassSharedUniforms as any;

  const material = new SpriteNodeMaterial();
  material.precision = 'mediump';
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;
  material.receivedShadowPositionNode = positionWorld;
  const wrapNormal = normalize(vec3(uv().x.sub(0.5).mul(0.8), float(0.85), float(0.15)));
  material.normalNode = wrapNormal;
  const bladeNormalWorld = transformNormal(vec3(0, 0, 1));

  const sourceIndex = ssbo.visibleIndicesBuffer.element(instanceIndex) as any;
  const packed = ssbo.packedBuffer.element(sourceIndex) as any;
  const currentScaleMin = min(uBladeMinScale, uTrailMinScale);
  const currentScaleSpan = uBladeMaxScale.sub(currentScaleMin);
  const offsetX = unpackOffsetX(packed.x);
  const offsetZ = unpackOffsetZ(packed.y);
  const scaleY = unpackCurrentScale(packed.w, currentScaleMin, currentScaleSpan);
  const positionNoise = hash(sourceIndex.add(196.4356));

  const scaleX = positionNoise.remap(0, 1, 0.5, 1.5);
  material.scaleNode = vec3(scaleX, scaleY, 1);

  const h = uv().y;
  const bendProfile = h.mul(h).mul(uBaseBending);
  const instanceNoise = positionNoise.sub(0.5).mul(0.25);
  const baseBending = instanceNoise.mul(bendProfile);
  material.rotationNode = vec3(baseBending as any, float(0), float(0));

  const terrainY = unpackTerrainY(packed.z, uHeightScale, uSurfaceBias);
  const worldX = offsetX.add(uPlayerPosition.x);
  const worldZ = offsetZ.add(uPlayerPosition.z);
  let localX = offsetX;
  let localZ = offsetZ;
  let bladeY = terrainY;
  const sampleTerrainSurfacePosition = options?.sampleTerrainSurfacePosition ?? null;
  if (sampleTerrainSurfacePosition) {
    const surfacePos = sampleTerrainSurfacePosition(vec2(worldX, worldZ));
    localX = surfacePos.x.sub(uPlayerPosition.x);
    localZ = surfacePos.z.sub(uPlayerPosition.z);
    bladeY = surfacePos.y.add(uSurfaceBias);
  }
  const bladePosition = vec3(localX, bladeY, localZ);
  const windAtlas = lodTier === 0 ? (options?.windAtlas ?? null) : null;
  const windXZ = sampleGrassWindXZ(worldX, worldZ, windAtlas);

  const randomPhase = positionNoise.mul(PI2);
  const swayAmount = sin(uTime.mul(5).add(randomPhase)).mul(0.15);
  const swayFactor = uv().y.mul(length(windXZ));
  const swayOffset = swayAmount.mul(swayFactor);

  const dirXZ = uWindDirection;
  const perp = vec2(dirXZ.y.negate(), dirXZ.x);
  const phase = positionNoise.mul(PI2);
  const flutter = sin(uTime.mul(uWindSpeed.mul(1.7)).add(phase.mul(1.3)))
    .mul(0.06)
    .mul(bendProfile);
  const flutterOffset = vec3(perp.x, 0, perp.y).mul(flutter);

  const windY = float(1).sub(h.mul(h)).mul(0.25);
  const windOffset = vec3(windXZ.x, windY, windXZ.y).mul(bendProfile);

  if (lodTier >= 2) {
    material.positionNode = bladePosition;
  } else if (lodTier === 1) {
    material.positionNode = bladePosition.add(swayOffset);
  } else {
    material.positionNode = bladePosition.add(swayOffset).add(flutterOffset).add(windOffset);
  }

  const colorProfile = h.mul(uColorMixFactor);
  const jitter = (smoothstep as any)(float(0), uColorVariationStrength, positionNoise);
  const baseColorJittered = uBaseColor.mul(jitter);
  const baseToTip = (mix as any)(baseColorJittered, uTipColor, colorProfile);

  const baseMask = float(1).sub((smoothstep as any)(float(0), uBaseShadeHeight, h));
  const windAo: TslNode =
    lodTier >= 2
      ? float(1)
      : (mix as any)(
          float(1),
          float(1).sub(uBaseWindShade),
          baseMask.mul((smoothstep as any)(float(0), float(1), swayFactor)),
        );

  const albedo = (baseToTip as any).mul(windAo);
  const thickness = (smoothstep as any)(float(0.15), float(0.95), h);
  const nearLodBacklight = lodTier < 2;
  const lit = applyGrassVegetationShading({
    albedo,
    wrapNormal,
    bladeNormalWorld: nearLodBacklight ? bladeNormalWorld : undefined,
    thickness,
    sunShadow: options.sunShadow,
    backlightMode: nearLodBacklight ? 'full' : 'shadow-only',
    nightMode: lodTier >= 2 ? 'simple-dim' : 'player-glow',
    offsetX: localX,
    offsetZ: localZ,
  });
  const cullReason = unpackVisByte(packed.w).toFloat();
  material.colorNode = applyGrassCullDebugColor(lit, cullReason, uGrassCullDebug);

  applyGrassTerrainDepthBias(material);

  return material;
}
