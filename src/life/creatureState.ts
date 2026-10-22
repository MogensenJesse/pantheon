// src/life/creatureState.ts — what living things notice, as plain numbers (a leaf with no imports)
//
// Written once a frame by the drift fields' update; read by whatever has creatures (fireflies in the shader now,
// animals on the CPU later). Phase 0 has no living creature that perceives the orb, so `notices` stays false until
// the world is alive.

export const creatureState = {
  /** Where the orb is (the player's orb, in metres). */
  orbX: 0,
  orbY: 0,
  orbZ: 0,
  /** True from Phase 1: creatures react to the orb. */
  notices: false,
};
