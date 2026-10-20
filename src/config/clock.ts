// src/config/clock.ts — the length of a game day, the one place it is written (pure: node-runnable)
//
// The sky's day cycle, the village's hunger and growth days and the weather's fronts all count in game
// days, so they take the length from here; `scripts/checks/weather` keeps them equal.

/** Seconds in one game day. */
export const GAME_DAY_S = 1800;
