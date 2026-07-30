// src/core/reveal/dayCycleDevScrub.ts — DEV scrub lock + pause shared by DayCycle
let _devScrubLock = false;
let _devPaused = false;

/** DEV: pause automatic reveal/day arc while scrubbing elevation or phase. */
export function setDayCycleDevScrubLock(locked: boolean): void {
  _devScrubLock = locked;
}

export function isDayCycleDevScrubLocked(): boolean {
  return _devScrubLock;
}

/** DEV: pause the looping day cycle without scrubbing (Gameplay panel toggle). */
export function setDayCyclePaused(paused: boolean): void {
  _devPaused = paused;
}

export function isDayCyclePaused(): boolean {
  return _devPaused;
}

/** True when automatic day/reveal time should not advance. */
export function isDayCycleTimeFrozen(): boolean {
  return _devScrubLock || _devPaused;
}
