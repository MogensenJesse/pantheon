// src/core/reveal/dayCycleDevScrub.ts — DEV scrub lock shared by WorldReveal + DayCycle

let _devScrubLock = false;

/** DEV: pause automatic reveal/day arc while scrubbing elevation or phase. */
export function setDayCycleDevScrubLock(locked: boolean): void {
  _devScrubLock = locked;
}

export function isDayCycleDevScrubLocked(): boolean {
  return _devScrubLock;
}
