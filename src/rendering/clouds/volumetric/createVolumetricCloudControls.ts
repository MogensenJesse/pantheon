// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/clouds/volumetric/createVolumetricCloudControls.ts — RTT pass + depth blend (Phase 2.3)
import type { Camera, DirectionalLight } from 'three';
import { Color, Vector3 } from 'three';
import { float, int, rtt, uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { computeCloudOpacity, sampleCloudColors } from '../cloudColorTsl';
import { getLiveCloudSettings } from '../cloudDevState';
import {
  createCloudDensityUniforms,
  readVolumetricSlabBounds,
  syncCloudDensityCenter,
  syncCloudDensityWind,
} from './cloudDensityTsl';
import { createCloudRaymarchUniforms } from './cloudRaymarchTsl';
import { applyVolumetricCloudDevUniforms, getLiveVolumetricCloudParams } from './volumetricCloudDevState';
import { buildVolumetricCloudPassNode } from './volumetricCloudPassTsl';

type TslNode = any;
type RttNodeWithResolutionScale = TslNode & { setResolutionScale(scale: number): void };

const _sunDir = new Vector3();
const _colors = {
  sunColor: new Color(),
  ambientColor: new Color(),
  cloudTint: new Color(),
};

export interface VolumetricCloudSyncParams {
  elapsed: number;
  elevationDeg: number;
  daylightFactor: number;
  hdriWeight: number;
  atmosphereBlendT: number;
  sun: DirectionalLight;
  cameraX: number;
  cameraZ: number;
  enabled: boolean;
}

export interface VolumetricCloudDebugState {
  enabled: boolean;
  marchDebug: boolean;
  densityDebug: boolean;
  weight: number;
  slab: ReturnType<typeof readVolumetricSlabBounds>;
  cameraY: number;
}

export interface VolumetricCloudBlendOptions {
  edgeRadius: ReturnType<typeof int>;
  edgeStrength: ReturnType<typeof float>;
  weight: ReturnType<typeof uniform>;
  compositeMode: ReturnType<typeof uniform>;
}

export interface VolumetricCloudControls {
  /** vec4 cloud pass RTT — rgb + slab-occluded alpha. */
  cloudPassRtt: TslNode;
  blendOptions: VolumetricCloudBlendOptions;
  uWeight: ReturnType<typeof uniform>;
  sync: (params: VolumetricCloudSyncParams) => void;
  getDebugState: (cameraY: number) => VolumetricCloudDebugState;
}

export function createVolumetricCloudControls(
  camera: Camera,
  sceneDepth: TslNode,
): VolumetricCloudControls {
  const densityUniforms = createCloudDensityUniforms();
  const raymarchUniforms = createCloudRaymarchUniforms(densityUniforms);
  const uWeight = uniform(0);
  const uCompositeMode = uniform(0);

  const cloudPassColor = buildVolumetricCloudPassNode(
    camera,
    sceneDepth,
    densityUniforms,
    raymarchUniforms,
  );
  const cloudPassRtt = rtt(cloudPassColor) as RttNodeWithResolutionScale;
  cloudPassRtt.setResolutionScale(getLiveVolumetricCloudParams().passResolutionScale);

  const blendOptions: VolumetricCloudBlendOptions = {
    edgeRadius: int(VISUAL.godrays.EDGE_RADIUS),
    edgeStrength: float(VISUAL.godrays.EDGE_STRENGTH),
    weight: uWeight,
    compositeMode: uCompositeMode,
  };

  return {
    cloudPassRtt,
    blendOptions,
    uWeight,
    sync: ({
      elapsed,
      elevationDeg,
      daylightFactor,
      hdriWeight,
      atmosphereBlendT,
      sun,
      cameraX,
      cameraZ,
      enabled,
    }) => {
      const settings = getLiveCloudSettings();
      applyVolumetricCloudDevUniforms(densityUniforms, raymarchUniforms, settings);
      syncCloudDensityCenter(densityUniforms, cameraX, cameraZ);
      syncCloudDensityWind(
        densityUniforms,
        elapsed,
        settings.windDirectionDeg,
        settings.windSpeed,
        settings.spread,
      );

      _sunDir.copy(sun.position).sub(sun.target.position).normalize();
      const colors = sampleCloudColors(elevationDeg, _colors);
      raymarchUniforms.uSunDir.value.copy(_sunDir);
      raymarchUniforms.uSunColor.value.copy(colors.sunColor);
      raymarchUniforms.uAmbientColor.value.copy(colors.ambientColor);
      raymarchUniforms.uCloudTint.value.copy(colors.cloudTint);

      const marchDebug =
        import.meta.env.DEV && devSettings.renderDebug.showVolumetricCloudMarchDebug;
      const densityDebug =
        import.meta.env.DEV && devSettings.renderDebug.showVolumetricCloudDensityDebug;
      raymarchUniforms.uMarchDebug.value = marchDebug ? 1 : densityDebug ? 2 : 0;
      uCompositeMode.value = densityDebug ? 1 : 0;

      if (!enabled) {
        uWeight.value = 0;
        return;
      }

      uWeight.value =
        marchDebug || densityDebug
          ? 1
          : Math.min(
              1,
              Math.max(
                0.75,
                computeCloudOpacity({
                  elevationDeg,
                  daylightFactor,
                  hdriWeight,
                  atmosphereBlendT,
                }),
              ),
            );
    },
    getDebugState: (cameraY) => ({
      enabled: uWeight.value > 0,
      marchDebug: raymarchUniforms.uMarchDebug.value > 0.5 && raymarchUniforms.uMarchDebug.value < 1.5,
      densityDebug: raymarchUniforms.uMarchDebug.value > 1.5,
      weight: uWeight.value,
      slab: readVolumetricSlabBounds(),
      cameraY,
    }),
  };
}

/** @deprecated Phase 2.2 alias — use createVolumetricCloudControls. */
export const createVolumetricCloudPass = createVolumetricCloudControls;

export type VolumetricCloudPass = VolumetricCloudControls;
