// src/config/visual/organicOrb.ts — player orb volume look (residue uses energyOrb.look overrides)
/**
 * Translucent refracted fill + white fresnel rim.
 * Player energy mins stay on `player.orbScaleMin` / `orbEmissiveMin` / `orbFillWhiteMin`;
 * cap rim HDR is `rimHdr`, cap fill white is `fillWhite`.
 */
export const organicOrb = {
  /** Normal-blend alpha for the warped fill (rim pulls toward opaque). */
  fillOpacity: 1,
  /** Mix the fill toward white at 100% energy (0 = refracted scene / nebula only). */
  fillWhite: 0.03,
  /** Screen-UV refraction offset (smaller than water). */
  refractionStrength: 0.044,
  /** Local-space noise frequency for refraction + nebula. */
  refractionScale: 1,
  /** Mix of dark wisps into the fill. */
  nebula: 1,
  /** Tendril inner core: `pow(NdotV, corePower)`. */
  corePower: 0.5,
  coreAmount: 1,
  /** Tendril fresnel: `pow(1 - NdotV, rimPower)`. */
  rimPower: 6,
  /** HDR rim at 100% energy. */
  rimHdr: 6,
  /** Vertex morph along normal (m). A few percent of orb radius. */
  morphAmp: 0.08,
  morphSpeed: 0.8,
  /** World-metres scale of morph / refraction noise (local space — does not swim when moving). */
  morphScale: 0.2,
  /** Max extra stretch along move direction (0 = sphere, ~0.5 = clear teardrop). */
  stretchAmt: 0.3,
  /** Trailing offset opposite velocity at full stretch (local m). */
  stretchTrail: 0.5,
  /** Player speed (m/s) at which stretch is full. */
  stretchSpeedRef: 6,
  /** When heading opposes, stretch eases through zero so the new back grows (no spin). Higher = snappier. */
  stretchTurnSmooth: 8,
  pulseSpeed: 0.24,
  /** Fake circumference for packet chase around the sphere (m). */
  pulseSpacingM: 1.2,
  pulseLengthM: 0.5,
  /** Rim brightness between packets (1 = always full). */
  pulseIdle: 0.28,
  pulseAmplitude: 0.7,
  /** Shader-only meridian threads in the fill. */
  meridianAmount: 0,
  meridianCount: 0,
} as const;

export type OrganicOrbSettings = {
  -readonly [K in keyof typeof organicOrb]: number;
};
