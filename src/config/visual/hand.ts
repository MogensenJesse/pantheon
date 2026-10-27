// src/config/visual/hand.ts — how the orb's hand looks: what it carries, and the burst of a delivery
//
// Plain numbers, node-safe: `src/hand/carryPose.ts` imports it with the `.ts` extension. The sim's own hand
// numbers (reach, cost, zones, deeds) are `VILLAGE.HAND` (`config/village/hand.ts`).

export const hand = {
  /** How a carried tree hangs from the orb (a stand-in look, to be judged on a GPU). */
  CARRY: {
    /** Size next to the tree standing. */
    TREE_SCALE: 0.35,
    /** The tree is tipped back from upright by this much (rad) and trails behind the orb's heading. */
    TILT_RAD: 1.2,
    /** The root hangs this far (m) below the orb. */
    HANG_M: 0.15,
    /** The sheaf (a stand-in pile) is this big next to the model, and its base hangs this far (m) below the orb. */
    SHEAF_SCALE: 0.4,
    SHEAF_DROP_M: 0.45,
    /** A carried sheep is this big next to a grazing one and its feet hang this far (m) below the orb. */
    SHEEP_SCALE: 0.6,
    SHEEP_DROP_M: 0.7,
    /** How fast the heading follows the orb's movement (per second), and the least movement (m per frame) that turns it. */
    TURN_PER_S: 6,
    MIN_MOVE_M: 0.01,
  },
  /** The sparkles of a delivery burst this high (m) above the orb. */
  BURST_HEIGHT_M: 1.2,
} as const;
