// src/dev/profiling/cpuSectionProfiler.ts — User Timing marks + per-frame CPU section table
export interface CpuSectionSample {
  name: string;
  ms: number;
}

const MEASURE_PREFIX = 'pantheon/';

let frameOpen = false;
let currentSection: string | null = null;
let sectionStart = 0;
const currentDurations = new Map<string, number>();
const lastFrame: CpuSectionSample[] = [];

function clearOurMeasures(): void {
  const entries = performance.getEntriesByType('measure');
  for (const entry of entries) {
    if (entry.name.startsWith(MEASURE_PREFIX)) {
      performance.clearMeasures(entry.name);
    }
  }
}

function closeSection(now: number): void {
  if (!currentSection) return;
  const ms = now - sectionStart;
  currentDurations.set(currentSection, (currentDurations.get(currentSection) ?? 0) + ms);
  try {
    performance.measure(`${MEASURE_PREFIX}${currentSection}`, {
      start: sectionStart,
      duration: ms,
    });
  } catch {
    // User Timing can throw if the start stamp is in the future after a clock skew.
  }
  currentSection = null;
}

/** Start a CPU-section frame. Cheap no-op if already open. */
export function beginCpuFrame(): void {
  if (!import.meta.env.DEV) return;
  clearOurMeasures();
  currentDurations.clear();
  currentSection = null;
  frameOpen = true;
  sectionStart = performance.now();
}

/** Close the previous section and open `name`. */
export function markCpuSection(name: string): void {
  if (!import.meta.env.DEV || !frameOpen) return;
  const now = performance.now();
  closeSection(now);
  currentSection = name;
  sectionStart = now;
}

/** Finish the frame and publish samples for the HUD. */
export function endCpuFrame(): CpuSectionSample[] {
  if (!import.meta.env.DEV || !frameOpen) return lastFrame;
  closeSection(performance.now());
  frameOpen = false;
  lastFrame.length = 0;
  for (const [name, ms] of currentDurations) {
    lastFrame.push({ name, ms });
  }
  lastFrame.sort((a, b) => b.ms - a.ms);
  currentDurations.clear();
  return lastFrame;
}

export function getLastCpuSections(): readonly CpuSectionSample[] {
  return lastFrame;
}

export function getCpuFrameTotalMs(): number {
  let total = 0;
  for (const sample of lastFrame) total += sample.ms;
  return total;
}
