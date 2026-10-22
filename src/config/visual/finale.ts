// src/config/visual/finale.ts — how the last night looks: the rune in the sky and how the beams and the rune settle
//
// The cutscene's timings and sizes are gameplay and live in `PHASE0.QUEST.FINALE.CUTSCENE`.

export const FINALE_VISUAL = {
  RUNE: {
    /** Half the width of a stroke's ribbon, as a share of the rune's half size. */
    HALF_WIDTH: 0.05,
    /** Brightness (HDR) of the rune at a glow of 1. */
    HDR: 2.4,
    /** The tip of a stroke being drawn glows a little brighter than the rest of it. */
    HEAD_BOOST: 0.8,
  },
  /** How quickly the beams and the rune settle to their rest level after the cutscene (share per second). */
  SETTLE_RATE: 0.5,
  /** A level below this is dark: nothing is drawn. */
  DARK: 0.002,
} as const;
