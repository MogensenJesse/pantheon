// src/rendering/postfx/godraysDiagnoseLog.ts — DEV console dump for light-shaft debugging
import type { DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import type { createGodraysControls } from './controls/godraysControls';
import type { createEffectGraphBypassGate } from './effectGraphBypass';

type GodraysControls = ReturnType<typeof createGodraysControls>;
type EffectBypass = ReturnType<typeof createEffectGraphBypassGate>;

export function logGodraysDiagnose(
  sunLight: DirectionalLight,
  godraysControls: GodraysControls,
  effectBypass: EffectBypass,
): void {
  const last = godraysControls.getLastSunState();
  const elevAbove = last.elevationDeg - last.horizonElevationDeg;
  const depthTex = sunLight.shadow.map?.depthTexture ?? null;
  const compare = depthTex?.compareFunction ?? null;
  const live = godraysControls.getLiveDensity();
  const horizonDisabled = last.horizonElevationDeg <= -89.5;
  console.info('[godrays diagnose]', {
    mixWeight: godraysControls.getEffectiveWeight(),
    uGodRaysWeight: godraysControls.uGodRaysWeight.value,
    graphWithGodrays: effectBypass.state.withGodrays,
    sunIntensity: last.intensity,
    elevationDeg: last.elevationDeg,
    horizonElevationDeg: last.horizonElevationDeg,
    elevAboveHorizonDeg: elevAbove,
    horizonOcclusion: horizonDisabled ? 'DEV-off (-90 sentinel)' : 'on',
    liveDensity: live.density,
    liveMaxDensity: live.maxDensity,
    params: godraysControls.getGodraysParams(),
    sunCastShadow: sunLight.castShadow,
    shadowMap: sunLight.shadow.map
      ? `${sunLight.shadow.mapSize.x}x${sunLight.shadow.mapSize.y}`
      : null,
    depthCompareFunction: compare,
    usePcss: VISUAL.shadows.lighting.usePcss,
    useSoftShadowMap: VISUAL.shadows.lighting.useSoftShadowMap,
    shadowSample: godraysControls.getShadowSampleMode(),
    directional: godraysControls.getDirectionalDiagnose?.() ?? null,
    shadowCameraCoordinateSystem: sunLight.shadow.camera.coordinateSystem,
    hint:
      compare === null && godraysControls.getShadowSampleMode() === 'directionalDepthCompare'
        ? 'depth compareFunction is null — cannot cut shafts'
        : horizonDisabled
          ? 'horizon occlusion DEV-off — not blocking; Disable haze to isolate shafts'
          : elevAbove < 0
            ? 'sun below terrain silhouette — weight/density gated off'
            : !effectBypass.state.withGodrays
              ? 'god-rays graph disconnected (bypass)'
              : 'directional shafts — look toward sun through trees; Disable haze to isolate',
  });
}
