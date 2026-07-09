// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/clouds/volumetric/cloudDensityTsl.ts — altitude-shaped 3D FBM cloud density
import { Vector2, Vector3 } from 'three';
import { float, length, max, mod, pow, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import { getLiveCloudSettings } from '../cloudDevState';
import { cloudFbm3D } from './cloudNoiseTsl';
import { getLiveVolumetricCloudParams } from './volumetricCloudDevState';

type TslNode = any;

export interface CloudDensityUniforms {
  uCloudBaseY: ReturnType<typeof uniform>;
  uCloudTopY: ReturnType<typeof uniform>;
  uSlabFadeM: ReturnType<typeof uniform>;
  uCloudSpread: ReturnType<typeof uniform>;
  uCloudRadius: ReturnType<typeof uniform>;
  uCloudRadialFade: ReturnType<typeof uniform>;
  uCloudCenterXZ: ReturnType<typeof uniform>;
  uCoverage: ReturnType<typeof uniform>;
  uDetailStrength: ReturnType<typeof uniform>;
  uShapeScale: ReturnType<typeof uniform>;
  uDetailScale: ReturnType<typeof uniform>;
  uMarchDensityPow: ReturnType<typeof uniform>;
  uMarchIntegrationScale: ReturnType<typeof uniform>;
  uWindOffset: ReturnType<typeof uniform>;
}

export function createCloudDensityUniforms(): CloudDensityUniforms {
  const live = getLiveVolumetricCloudParams();
  const cloud = getLiveCloudSettings();
  const cloudBaseY = cloud.cloudBaseY + live.baseLiftM;
  const cloudTopY = cloud.cloudBaseY + cloud.altitudeJitter + live.topMarginM;

  return {
    uCloudBaseY: uniform(cloudBaseY),
    uCloudTopY: uniform(cloudTopY),
    uSlabFadeM: uniform(live.slabFadeM),
    uCloudSpread: uniform(cloud.spread),
    uCloudRadius: uniform(cloud.spread * live.radiusSpreadMul),
    uCloudRadialFade: uniform(cloud.spread * live.radialFadeSpreadMul),
    uCloudCenterXZ: uniform(new Vector2()),
    uCoverage: uniform(live.coverage),
    uDetailStrength: uniform(live.detailStrength),
    uShapeScale: uniform(live.shapeScale),
    uDetailScale: uniform(live.detailScale),
    uMarchDensityPow: uniform(live.marchDensityPow),
    uMarchIntegrationScale: uniform(live.marchIntegrationScale),
    uWindOffset: uniform(new Vector3()),
  };
}

/** Toroidal local XZ around camera — matches mesh cloud wrap period. */
function wrapLocalAxis(local: TslNode, period: TslNode): TslNode {
  const half = period.mul(0.5);
  return mod(local.add(half), period).sub(half);
}

function cloudLocalXZ(
  worldPos: TslNode,
  u: CloudDensityUniforms,
): { localX: TslNode; localZ: TslNode } {
  const localX = wrapLocalAxis(worldPos.x.sub(u.uCloudCenterXZ.x), u.uCloudSpread);
  const localZ = wrapLocalAxis(worldPos.z.sub(u.uCloudCenterXZ.y), u.uCloudSpread);
  return { localX, localZ };
}

/**
 * Noise sample position — camera-relative toroidal XZ, wind scroll matches mesh drift.
 * Subtract wind offset so features move with wind (not opposite).
 */
export function cloudNoiseWorldPos(worldPos: TslNode, u: CloudDensityUniforms): TslNode {
  const { localX, localZ } = cloudLocalXZ(worldPos, u);
  const p = vec3(localX, localZ, worldPos.y.mul(0.2)).mul(u.uShapeScale);
  const windXZ = vec3(u.uWindOffset.x, u.uWindOffset.z, float(0));
  return p.sub(windXZ);
}

function cloudNoiseDetailPos(worldPos: TslNode, u: CloudDensityUniforms): TslNode {
  const { localX, localZ } = cloudLocalXZ(worldPos, u);
  const p = vec3(localX, localZ, worldPos.y.mul(0.2)).mul(u.uDetailScale);
  const windXZ = vec3(u.uWindOffset.x.mul(2), u.uWindOffset.z.mul(2), float(0));
  return p.sub(windXZ);
}

function remapCloudShape(shape: TslNode, u: CloudDensityUniforms): TslNode {
  const invCoverage = float(1).sub(u.uCoverage);
  const edgeLow = invCoverage.mul(0.35);
  const edgeHigh = edgeLow.add(0.4);
  return smoothstep(edgeLow, edgeHigh, pow(shape, 0.85));
}

/**
 * Shared 0–1 cloud puff field — density debug displays this; raymarch integrates it.
 * Coverage trims low values (higher coverage → more clear sky between puffs).
 */
function sampleCloudShapeField(
  worldPos: TslNode,
  u: CloudDensityUniforms,
  shapeOctaves: number,
  detailOctaves: number,
): TslNode {
  const pShape = cloudNoiseWorldPos(worldPos, u);
  const shape = cloudFbm3D(pShape, { octaves: shapeOctaves });
  let field = smoothstep(float(0.18), float(0.82), pow(shape, 0.8));

  const floor = float(1).sub(u.uCoverage).mul(0.45);
  field = smoothstep(floor, floor.add(0.22), field);

  if (detailOctaves > 0) {
    const detail = cloudFbm3D(cloudNoiseDetailPos(worldPos, u), { octaves: detailOctaves });
    field = max(field.sub(detail.mul(u.uDetailStrength)), float(0));
  }

  return field;
}

function cloudAltitudeFade(worldPos: TslNode, u: CloudDensityUniforms): TslNode {
  const y = worldPos.y;
  return smoothstep(u.uCloudBaseY, u.uCloudBaseY.add(u.uSlabFadeM), y).mul(
    smoothstep(u.uCloudTopY, u.uCloudTopY.sub(u.uSlabFadeM), y),
  );
}

/** Soft edge at field radius — centered on camera (matches mesh root follow). */
function cloudRadialFade(worldPos: TslNode, u: CloudDensityUniforms): TslNode {
  const dx = worldPos.x.sub(u.uCloudCenterXZ.x);
  const dz = worldPos.z.sub(u.uCloudCenterXZ.y);
  const dist = length(vec2(dx, dz));
  return float(1).sub(smoothstep(u.uCloudRadius, u.uCloudRadius.add(u.uCloudRadialFade), dist));
}

/** Skill-style density: large-scale shape − detail erosion, confined to a horizontal slab. */
export function sampleCloudDensity(worldPos: TslNode, u: CloudDensityUniforms): TslNode {
  const pShape = cloudNoiseWorldPos(worldPos, u);
  const shape = cloudFbm3D(pShape, { octaves: 4 });
  const shapeRemapped = remapCloudShape(shape, u);
  const detail = cloudFbm3D(cloudNoiseDetailPos(worldPos, u), { octaves: 3 });

  return max(shapeRemapped.sub(detail.mul(u.uDetailStrength)), float(0))
    .mul(cloudAltitudeFade(worldPos, u))
    .mul(cloudRadialFade(worldPos, u));
}

/**
 * Cheaper density for the raymarch loop — fewer FBM octaves, optional detail skip.
 * ~3× less noise work per step vs sampleCloudDensity (Phase 2.2 perf default).
 */
export function sampleCloudDensityMarch(worldPos: TslNode, u: CloudDensityUniforms): TslNode {
  const params = getLiveVolumetricCloudParams();
  let field = sampleCloudShapeField(
    worldPos,
    u,
    params.marchShapeOctaves,
    params.marchDetailOctaves,
  );
  field = pow(field, u.uMarchDensityPow);
  const density = field.mul(u.uMarchIntegrationScale);

  return density.mul(cloudAltitudeFade(worldPos, u)).mul(cloudRadialFade(worldPos, u));
}

/** DEV density preview — same puff field as march (pre-integration scale). */
export function sampleCloudDensityDebug(worldPos: TslNode, u: CloudDensityUniforms): TslNode {
  const params = getLiveVolumetricCloudParams();
  const field = sampleCloudShapeField(
    worldPos,
    u,
    params.debugShapeOctaves,
    params.marchDetailOctaves,
  );
  return field.mul(cloudRadialFade(worldPos, u)).mul(cloudAltitudeFade(worldPos, u));
}

/** Toroidal wrap — same period as mesh cloud field spread. */
function wrapWindAxis(value: number, spread: number): number {
  const half = spread * 0.5;
  let v = value;
  while (v > half) v -= spread;
  while (v < -half) v += spread;
  return v;
}

const WIND_TRAVEL_SCALE = 0.1;

export function syncCloudDensityWind(
  u: CloudDensityUniforms,
  elapsed: number,
  windDirectionDeg: number,
  windSpeed: number,
  spread = getLiveCloudSettings().spread,
): void {
  const rad = (windDirectionDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = Math.cos(rad);
  const travel = elapsed * windSpeed * WIND_TRAVEL_SCALE;
  u.uWindOffset.value.set(
    wrapWindAxis(dirX * travel, spread),
    0,
    wrapWindAxis(dirZ * travel, spread),
  );
}

export function syncCloudDensityCenter(u: CloudDensityUniforms, centerX: number, centerZ: number): void {
  u.uCloudCenterXZ.value.set(centerX, centerZ);
}

export function readVolumetricSlabBounds(): { cloudBaseY: number; cloudTopY: number; cloudRadiusM: number } {
  const cloud = getLiveCloudSettings();
  const p = getLiveVolumetricCloudParams();
  return {
    cloudBaseY: cloud.cloudBaseY + p.baseLiftM,
    cloudTopY: cloud.cloudBaseY + cloud.altitudeJitter + p.topMarginM,
    cloudRadiusM: cloud.spread * p.radiusSpreadMul,
  };
}
