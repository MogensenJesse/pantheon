// src/rendering/sunShadow/contactShadowUniforms.ts — live PCSS / WidePCF softness (shadow.radius sync)
import type { DirectionalLight } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

const L = VISUAL.shadows.lighting;

export interface ContactShadowSoftness {
  softnessMin: number;
  softnessMax: number;
  penumbraScale: number;
}

/** Shared by PcssShadowFilter / WidePCFShadowFilter — DEV sliders write these live. */
export const contactShadowUniforms = {
  uSoftnessMin: uniform(L.shadowSoftnessMin),
  uSoftnessMax: uniform(L.shadowSoftnessMax),
  uPenumbraScale: uniform(L.shadowPenumbraScale),
};

export function readContactShadowSoftness(): ContactShadowSoftness {
  return {
    softnessMin: contactShadowUniforms.uSoftnessMin.value as number,
    softnessMax: contactShadowUniforms.uSoftnessMax.value as number,
    penumbraScale: contactShadowUniforms.uPenumbraScale.value as number,
  };
}

/** Apply contact-hardening knobs and keep sun.shadow.radius synced to max. */
export function setContactShadowSoftness(
  sun: DirectionalLight,
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
  syncSunShadowRadiusToContactMax(sun);
}

export function resetContactShadowSoftness(sun: DirectionalLight): void {
  setContactShadowSoftness(sun, {
    softnessMin: L.shadowSoftnessMin,
    softnessMax: L.shadowSoftnessMax,
    penumbraScale: L.shadowPenumbraScale,
  });
}

/** Legacy / debug readers still look at shadow.radius — keep it at softness max. */
export function syncSunShadowRadiusToContactMax(sun: DirectionalLight): void {
  sun.shadow.radius = contactShadowUniforms.uSoftnessMax.value as number;
}
