// src/entities/guideLine/GuideLineSystem.ts — path-following HDR ribbon to the next authored orb
import type { Scene, Vector3 } from 'three';
import { WORLD } from '../../config/world';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { EnergyOrb } from '../EnergyOrb';
import { createGuideGlowMap } from './guideGlowMap';
import { guideGlowLiveUniforms, resetGuideGlowMapBinding } from './guideGlowUniforms';
import { getLiveGuideLineSettings } from './guideLineDevState';
import { createGuideLineMesh } from './guideLineMesh';
import { createGuideLineParticles } from './guideLineParticles';
import {
  closestPointOnGuide,
  drapeGuidePolyline,
  type GuideSample,
  resolveGuideCellRoute,
} from './guidePolyline';
import { createPathGraph, type PathGraph } from './pathGraph';

export interface GuideLineSystemContext {
  update: (playerPos: Vector3, cameraPos: Vector3) => void;
  dispose: () => void;
}

function nextUnabsorbedOrb(orbs: EnergyOrb[]): { orb: EnergyOrb; index: number } | null {
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!;
    if (!orb.absorbed) return { orb, index: i };
  }
  return null;
}

function writeGuideGlow(opts: {
  intensity: number;
  closestAlong: number;
  alongScale: number;
  pulseSpeed: number;
  pulseSpacingM: number;
  pulseAmplitude: number;
  pulseIdle: number;
  pulseLengthM: number;
  breathSpeed: number;
  breathAmount: number;
}): void {
  const u = guideGlowLiveUniforms;
  u.uGuideLightIntensity.value = opts.intensity;
  u.uGuideClosestAlong.value = opts.closestAlong;
  u.uGuideAlongScale.value = opts.alongScale;
  u.uGuidePulseSpeed.value = opts.pulseSpeed;
  u.uGuidePulseSpacing.value = opts.pulseSpacingM;
  u.uGuidePulseAmplitude.value = opts.pulseAmplitude;
  u.uGuidePulseIdle.value = opts.pulseIdle;
  u.uGuidePulseLength.value = opts.pulseLengthM;
  u.uGuideBreathSpeed.value = opts.breathSpeed;
  u.uGuideBreathAmount.value = opts.breathAmount;
}

export function initGuideLineSystem(opts: {
  scene: Scene;
  terrain: Pick<MapTerrainContext, 'grids' | 'getWorldY'>;
  orbs: EnergyOrb[];
}): GuideLineSystemContext {
  const { scene, terrain, orbs } = opts;
  const graph: PathGraph = createPathGraph(terrain.grids, WORLD.SIZE);
  const settings0 = getLiveGuideLineSettings();
  const ribbon = createGuideLineMesh(scene, settings0.sampleCount);
  const sparkles = createGuideLineParticles(scene, settings0.sampleCount, settings0.particleCount);
  const glowMap = createGuideGlowMap(WORLD.SIZE);
  guideGlowLiveUniforms.uGuideGlowMap.value = glowMap.texture;

  let cachedPoints: GuideSample[] | null = null;
  let cachedOrbIndex = -1;
  let cachedLift = Number.NaN;
  let cachedArcHeight = Number.NaN;
  let cachedWidth = Number.NaN;
  let cachedSoftness = Number.NaN;
  let cachedRadius = Number.NaN;
  let cachedAlongScale = 1;
  let hidden = true;

  const hide = () => {
    ribbon.setVisible(false);
    sparkles.setVisible(false);
    writeGuideGlow({
      intensity: 0,
      closestAlong: 0,
      alongScale: 1,
      pulseSpeed: 0,
      pulseSpacingM: 1,
      pulseAmplitude: 0,
      pulseIdle: 1,
      pulseLengthM: 1,
      breathSpeed: 0,
      breathAmount: 0,
    });
    if (!hidden) {
      glowMap.clear();
      hidden = true;
    }
  };

  const stampGlow = (points: GuideSample[], radiusM: number) => {
    cachedAlongScale = glowMap.stamp(points, radiusM);
    cachedRadius = radiusM;
  };

  const rebuild = (
    playerPos: Vector3,
    orb: EnergyOrb,
    settings: ReturnType<typeof getLiveGuideLineSettings>,
  ) => {
    const cells = resolveGuideCellRoute(
      graph,
      playerPos.x,
      playerPos.z,
      orb.worldPos.x,
      orb.worldPos.z,
      settings.landCost,
    );
    if (!cells) {
      cachedPoints = null;
      return false;
    }
    const draped = drapeGuidePolyline({
      graph,
      cells,
      orbX: orb.worldPos.x,
      orbY: orb.worldPos.y,
      orbZ: orb.worldPos.z,
      getWorldY: terrain.getWorldY,
      settings,
    });
    if (!draped) {
      cachedPoints = null;
      return false;
    }
    cachedPoints = draped;
    cachedLift = settings.lift;
    cachedArcHeight = settings.arcHeight;
    cachedWidth = settings.width;
    cachedSoftness = settings.softness;
    ribbon.writePoints(draped, settings.width, settings.softness);
    sparkles.writePath(draped);
    stampGlow(draped, settings.terrainGlowRadius);
    hidden = false;
    return true;
  };

  const update = (playerPos: Vector3, cameraPos: Vector3) => {
    const settings = getLiveGuideLineSettings();
    if (!settings.enabled) {
      hide();
      return;
    }
    const next = nextUnabsorbedOrb(orbs);
    if (!next) {
      hide();
      return;
    }

    const needRebuild =
      next.index !== cachedOrbIndex ||
      cachedPoints === null ||
      settings.lift !== cachedLift ||
      settings.arcHeight !== cachedArcHeight;

    if (needRebuild) {
      cachedOrbIndex = next.index;
      if (!rebuild(playerPos, next.orb, settings)) {
        hide();
        return;
      }
    } else if (
      cachedPoints &&
      (settings.width !== cachedWidth || settings.softness !== cachedSoftness)
    ) {
      cachedWidth = settings.width;
      cachedSoftness = settings.softness;
      ribbon.writePoints(cachedPoints, settings.width, settings.softness);
    }

    if (!cachedPoints) {
      hide();
      return;
    }

    if (hidden) {
      cachedWidth = settings.width;
      cachedSoftness = settings.softness;
      ribbon.writePoints(cachedPoints, settings.width, settings.softness);
      sparkles.writePath(cachedPoints);
      stampGlow(cachedPoints, settings.terrainGlowRadius);
      hidden = false;
    } else if (settings.terrainGlowRadius !== cachedRadius) {
      stampGlow(cachedPoints, settings.terrainGlowRadius);
    }

    const closest = closestPointOnGuide(cachedPoints, playerPos.x, playerPos.z);
    if (!closest) {
      hide();
      return;
    }

    const maxAlong = cachedPoints[cachedPoints.length - 1]?.along ?? closest.along;
    ribbon.syncUniforms(settings, cameraPos, playerPos, closest.along, maxAlong);
    sparkles.syncUniforms(settings, cameraPos, playerPos, closest.along, maxAlong);
    writeGuideGlow({
      intensity: settings.terrainGlowIntensity,
      closestAlong: closest.along,
      alongScale: cachedAlongScale,
      pulseSpeed: settings.pulseSpeed,
      pulseSpacingM: settings.pulseSpacingM,
      pulseAmplitude: settings.pulseAmplitude,
      pulseIdle: settings.pulseIdle,
      pulseLengthM: settings.pulseLengthM,
      breathSpeed: settings.breathSpeed,
      breathAmount: settings.breathAmount,
    });
  };

  const dispose = () => {
    hide();
    ribbon.dispose();
    sparkles.dispose();
    resetGuideGlowMapBinding();
    glowMap.dispose();
  };

  return { update, dispose };
}
