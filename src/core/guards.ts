// src/core/guards.ts — type guards for checking stored or untrusted data (pure: node-runnable)

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A finite number. */
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A finite number that is not negative. */
export const isCount = (v: unknown): v is number => isNum(v) && v >= 0;

/** A whole number. */
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** A whole number that is not negative. */
export const isCountInt = (v: unknown): v is number => isInt(v) && v >= 0;
