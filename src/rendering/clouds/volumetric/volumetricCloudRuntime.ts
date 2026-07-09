// src/rendering/clouds/volumetric/volumetricCloudRuntime.ts — shipped + DEV volumetric cloud active state
import { devSettings } from '../../../core/GameState';
import { getLiveCloudSettings } from '../cloudDevState';
import { getLiveVolumetricCloudParams } from './volumetricCloudDevState';

/** Shipped toggle, DEV override, or render-debug preview. */
export function isVolumetricCloudsActive(): boolean {
  const params = getLiveVolumetricCloudParams();
  if (params.enabled) return true;
  if (!import.meta.env.DEV) return false;
  const d = devSettings.renderDebug;
  return (
    d.showVolumetricCloudRaymarch ||
    d.showVolumetricCloudMarchDebug ||
    d.showVolumetricCloudDensityDebug
  );
}

/** Mesh clusters hide when volumetric owns the sky layer. */
export function shouldRenderMeshClouds(): boolean {
  if (!getLiveCloudSettings().enabled) return false;
  if (import.meta.env.DEV && devSettings.renderDebug.hideClouds) return false;
  if (import.meta.env.DEV && devSettings.renderDebug.showCloudNoiseDebug) return false;
  return !isVolumetricCloudsActive();
}

/** Post shader graph inclusion + RTT resolution — rebuild when these change. */
export function getVolumetricPipelineRebuildKey(): string {
  const p = getLiveVolumetricCloudParams();
  return `${p.enabled}|${p.passResolutionScale}|${p.maxSteps}|${p.marchShapeOctaves}|${p.marchDetailOctaves}|${p.debugShapeOctaves}`;
}
