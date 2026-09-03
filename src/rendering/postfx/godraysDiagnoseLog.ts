// src/rendering/postfx/godraysDiagnoseLog.ts — DEV console dump for light-shaft debugging
import type { DirectionalLight } from 'three';
import type { createGodraysControls } from './controls/godraysControls';
import type { createEffectGraphBypassGate } from './effectGraphBypass';

type GodraysControls = ReturnType<typeof createGodraysControls>;
type EffectBypass = ReturnType<typeof createEffectGraphBypassGate>;

export function logGodraysDiagnose(
  _sunLight: DirectionalLight,
  godraysControls: GodraysControls,
  effectBypass: EffectBypass,
): void {
  const last = godraysControls.getLastSunState();
  const sunScreen = godraysControls.getSunScreen();
  console.info('[godrays diagnose]', {
    weight: godraysControls.getEffectiveWeight(),
    uGodRaysWeight: godraysControls.uGodRaysWeight.value,
    graphWithGodrays: effectBypass.state.withGodrays,
    sunIntensity: last.intensity,
    elevationDeg: last.elevationDeg,
    sunUv: sunScreen,
    params: godraysControls.getGodraysParams(),
    hint:
      last.intensity <= 0.001
        ? 'sun intensity ~0 — shafts gated off'
        : sunScreen.inFront < 0.5
          ? 'sun behind camera — shafts faded'
          : sunScreen.offscreenFade < 0.02
            ? 'sun far off-screen — shafts faded'
            : !effectBypass.state.withGodrays
              ? 'god-rays graph disconnected (bypass)'
              : 'occlusion shafts — look toward sun through trees; Disable valley fog / distance haze to isolate',
  });
}
