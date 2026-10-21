// src/config/visual/landmark.ts — the light on the Phase 0 landmarks: beacon, dwell ring, awakening burst, glow
//
// Additive emissive meshes only (the player's light is the only PointLight). Colours are linear RGB, one per
// landmark kind; heights and radii are metres.

export const landmark = {
  /** Beacon colour of each kind. */
  colors: {
    runestones: [0.45, 0.8, 1],
    tree: [0.7, 1, 0.5],
    temple_ruin: [1, 0.78, 0.4],
    sunken_ruin: [0.35, 1, 0.85],
    monolith: [0.75, 0.55, 1],
  },
  beacon: {
    /** A dormant landmark's column of light reaches this high... */
    heightM: 90,
    radiusM: 1.1,
    /** ...is seen from this far (fades out beyond), and fades out near the camera so it never blinds. */
    visibleM: 450,
    nearFadeStartM: 6,
    nearFadeEndM: 30,
    /** HDR strength of a dormant beacon. */
    dormantHdr: 1.4,
    pulseSpeed: 1.1,
    pulseAmount: 0.25,
  },
  ring: {
    ribbonWidthM: 0.5,
    liftM: 0.2,
    /** The ring shows only near a dormant landmark: it fades in between these distances (m) from the orb. */
    showStartM: 60,
    showEndM: 25,
    /** Opacity (HDR) of the empty ring and of the filled part. */
    baseHdr: 0.35,
    fillHdr: 2.2,
  },
  /** After waking: a pulse that dies away, then a steady glow. */
  awaken: {
    pulseS: 3.5,
    pulseHdr: 5,
    /** The steady column is this short (m) and this strong (HDR). */
    glowHeightM: 14,
    glowHdr: 0.8,
    /** Where the burst of sparkles starts, above the ground (m). */
    burstHeightM: 2.5,
  },
} as const;
