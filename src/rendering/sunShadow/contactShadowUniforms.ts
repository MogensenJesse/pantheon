// src/rendering/sunShadow/contactShadowUniforms.ts — live PCSS softness
import type { DirectionalLight } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

const L = VISUAL.shadows.lighting;

export interface ContactShadowSoftness {
  softnessMin: number;
  softnessMax: number;
  penumbraScale: number;
  /** World-XZ Vogel cell (m). 0 = fixed phi. */
  vogelGridM: number;
}

/** Shared by PcssShadowFilter — DEV sliders write these live. */
export const contactShadowUniforms = {
  uSoftnessMin: uniform(L.shadowSoftnessMin),
  uSoftnessMax: uniform(L.shadowSoftnessMax),
  uPenumbraScale: uniform(L.shadowPenumbraScale),
  uVogelGridM: uniform(L.pcssVogelGridM),
};

export function readContactShadowSoftness(): ContactShadowSoftness {
  return {
    softnessMin: contactShadowUniforms.uSoftnessMin.value as number,
    softnessMax: contactShadowUniforms.uSoftnessMax.value as number,
    penumbraScale: contactShadowUniforms.uPenumbraScale.value as number,
    vogelGridM: contactShadowUniforms.uVogelGridM.value as number,
  };
}

/** Apply contact-hardening knobs and mirror the max radius for diagnostics. */
export function setContactShadowSoftness(
  light: DirectionalLight,
  partial: Partial<ContactShadowSoftness>,
): void {
  if (partial.softnessMin !== undefined) {
    contactShadowUniforms.uSoftnessMin.value = partial.softnessMin;
  }
  if (partial.softnessMax !== undefined) {
    contactShadowUniforms.uSoftnessMax.value = partial.softnessMax;
  }
  if (partial.penumbraScale !== undefined) {
    contactShadowUniforms.uPenumbraScale.value = partial.penumbraScale;
  }
  if (partial.vogelGridM !== undefined) {
    contactShadowUniforms.uVogelGridM.value = partial.vogelGridM;
  }
  syncSunShadowRadiusToContactMax(light);
}

export function resetContactShadowSoftness(light: DirectionalLight): void {
  setContactShadowSoftness(light, {
    softnessMin: L.shadowSoftnessMin,
    softnessMax: L.shadowSoftnessMax,
    penumbraScale: L.shadowPenumbraScale,
    vogelGridM: L.pcssVogelGridM,
  });
}

/** Filters use uSoftnessMax directly; shadow debug logging still reports shadow.radius. */
export function syncSunShadowRadiusToContactMax(light: DirectionalLight): void {
  light.shadow.radius = contactShadowUniforms.uSoftnessMax.value as number;
}
