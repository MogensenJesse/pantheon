// src/world/grass/grassPerfStats.ts — DEV grass compute timing (Tier 0 profiling)
import { grassInstanceCount } from './grassConfig';

export interface GrassPerfSnapshot {
  instanceCount: number;
  bladesPerSide: number;
  lastComputeMs: number;
  avgComputeMs: number;
  maxComputeMs: number;
  totalComputePasses: number;
  computeInFlight: boolean;
  computePending: boolean;
  skippedComputeFrames: number;
  lastPass: 'full' | 'visibility' | 'none';
}

const state = {
  lastComputeMs: 0,
  avgComputeMs: 0,
  maxComputeMs: 0,
  totalComputePasses: 0,
  computeInFlight: false,
  computePending: false,
  skippedComputeFrames: 0,
  lastPass: 'none' as 'full' | 'visibility' | 'none',
  /** Exponential moving average factor for compute duration. */
  emaAlpha: 0.12,
};

export function recordGrassComputeStart(): void {
  state.computeInFlight = true;
}

export function recordGrassComputePass(pass: 'full' | 'visibility'): void {
  state.lastPass = pass;
}

export function recordGrassComputeEnd(durationMs: number): void {
  state.computeInFlight = false;
  state.lastComputeMs = durationMs;
  state.totalComputePasses += 1;
  if (durationMs > state.maxComputeMs) state.maxComputeMs = durationMs;
  if (state.totalComputePasses === 1) {
    state.avgComputeMs = durationMs;
  } else {
    state.avgComputeMs += state.emaAlpha * (durationMs - state.avgComputeMs);
  }
}

export function setGrassComputeQueue(inFlight: boolean, pending: boolean): void {
  state.computeInFlight = inFlight;
  state.computePending = pending;
}

export function incrementGrassSkippedComputeFrames(): void {
  state.skippedComputeFrames += 1;
}

export function getGrassPerfSnapshot(bladesPerSide: number): GrassPerfSnapshot {
  return {
    instanceCount: grassInstanceCount(),
    bladesPerSide,
    lastComputeMs: state.lastComputeMs,
    avgComputeMs: state.avgComputeMs,
    maxComputeMs: state.maxComputeMs,
    totalComputePasses: state.totalComputePasses,
    computeInFlight: state.computeInFlight,
    computePending: state.computePending,
    skippedComputeFrames: state.skippedComputeFrames,
    lastPass: state.lastPass,
  };
}

export function resetGrassPerfStats(): void {
  state.lastComputeMs = 0;
  state.avgComputeMs = 0;
  state.maxComputeMs = 0;
  state.totalComputePasses = 0;
  state.computeInFlight = false;
  state.computePending = false;
  state.skippedComputeFrames = 0;
  state.lastPass = 'none';
}

export function logGrassPerfSnapshot(bladesPerSide: number, label = 'snapshot'): void {
  const s = getGrassPerfSnapshot(bladesPerSide);
  console.info(`[grass/perf] ${label}`, {
    instances: s.instanceCount,
    bladesPerSide: s.bladesPerSide,
    lastComputeMs: s.lastComputeMs.toFixed(2),
    avgComputeMs: s.avgComputeMs.toFixed(2),
    maxComputeMs: s.maxComputeMs.toFixed(2),
    totalComputePasses: s.totalComputePasses,
    computeInFlight: s.computeInFlight,
    computePending: s.computePending,
    skippedComputeFrames: s.skippedComputeFrames,
    lastPass: s.lastPass,
  });
}
