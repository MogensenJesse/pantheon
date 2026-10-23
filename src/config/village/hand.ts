// src/config/village/hand.ts — village tunables: the orb's hand, which uproots, lifts and drops
// (story-mechanics/HAND.md; the numbers are placeholders until a playtest).

export const HAND_PARTS = {
  HAND: {
    /** Builder-seconds of work one wood hauled to a build site counts for. */
    WORK_PER_WOOD_S: 12,
    WHEAT: {
      /** A field can be harvested by the hand from this growth (0..1); the food is the yield times the growth. */
      MIN_RIPE: 0.9,
    },
    /** How near (m) the orb has to be to take a thing: a tree from its trunk, a field from its edge, an animal. */
    REACH_M: { tree: 6, wheat: 2, sheep: 3 },
    /** Food a delivered sheep gives (the animal itself is cosmetic and comes back after `ANIMALS.RESPAWN_S`). */
    ANIMAL_FOOD: { sheep: 2 },
    /** Energy a lift costs (the orb holds 100): wood is heavy, a sheaf is light. */
    COST: { tree: 10, wheat: 4, sheep: 6 },
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
    /** A drop counts on a building when it lands within this many metres of its footprint. */
    ZONE_MARGIN_M: 3,
    /** What the village makes of a deed. A lift and a delivery are paid on their own cooldowns. */
    DEED: {
      /** Villagers outdoors and awake within this distance (m) of the deed see it. */
      WITNESS_M: 25,
      /** Belief each witness gains at a lift (awe) and at a delivery, before the worth of what was moved. */
      LIFT_BELIEF: 0.05,
      DELIVER_BELIEF: 0.1,
      /** A delivery that met an open need (a site waiting for wood, an empty larder) is worth this many times more. */
      NEED_MUL: 2,
      /** What a thing is worth next to a tree. */
      WORTH: { tree: 1, wheat: 0.6, sheep: 0.8 },
      /** Seconds before the same villager can be impressed by the same kind of deed again (in memory, not saved). */
      LIFT_COOLDOWN_S: 30,
      DELIVER_COOLDOWN_S: 10,
      /** Witnesses stop and look at the deed for this long (s). */
      NOTICE_S: 3,
    },
  },
} as const;
