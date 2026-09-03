// src/config/visual/organicOrb.ts — player orb volume (residue uses energyOrb.look)
/** Refracted fill + fresnel rim. Energy mins on player.orbScaleMin / orbEmissiveMin / orbFillWhiteMin. */
export const organicOrb = {
  fillOpacity: 1,
  fillWhite: 0.03,
  refractionStrength: 0.044,
  refractionScale: 1,
  nebula: 1,
  corePower: 0.5,
  coreAmount: 1,
  rimPower: 6,
  rimHdr: 6,
  morphAmp: 0.08,
  morphSpeed: 0.8,
  morphScale: 0.2,
  stretchAmt: 0.3,
  stretchTrail: 0.5,
  stretchSpeedRef: 6,
  stretchTurnSmooth: 8,
  pulseSpeed: 0.24,
  pulseSpacingM: 1.2,
  pulseLengthM: 0.5,
  pulseIdle: 0.28,
  pulseAmplitude: 0.7,
} as const;

export type OrganicOrbSettings = {
  -readonly [K in keyof typeof organicOrb]: number;
};
