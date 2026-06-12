// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/terrainMapOutlineDebug.ts — DEV square tile-repeat outlines per map channel
import { float, Fn, fract, max, step, vec3 } from 'three/tsl';
import { biomeSurfaceUv } from './biomeAtlasUv';

export const MAP_OUTLINE_CHANNELS = ['diff', 'nor', 'rough', 'disp', 'spec'] as const;
export type MapOutlineChannelKey = (typeof MAP_OUTLINE_CHANNELS)[number];

/** Legend colors — keep in sync with dev panel swatches. */
export const TERRAIN_MAP_OUTLINE_LEGEND: Record<
  MapOutlineChannelKey,
  { label: string; css: string }
> = {
  diff: { label: 'Diff tile grid', css: '#ff4444' },
  nor: { label: 'Normal tile grid', css: '#44ff77' },
  rough: { label: 'Rough tile grid', css: '#ffee44' },
  disp: { label: 'Disp tile grid', css: '#4499ff' },
  spec: { label: 'Spec tile grid', css: '#ff66ff' },
};

export const DEFAULT_MAP_OUTLINE_CHANNELS: Record<MapOutlineChannelKey, boolean> = {
  diff: true,
  nor: false,
  rough: false,
  disp: false,
  spec: false,
};

const COLOR_DIFF = vec3(1, 0.2, 0.2);
const COLOR_NOR = vec3(0.2, 1, 0.45);
const COLOR_ROUGH = vec3(1, 0.92, 0.15);
const COLOR_DISP = vec3(0.2, 0.55, 1);
const COLOR_SPEC = vec3(1, 0.35, 1);

/** Axis-aligned square grid in tile-repeat UV (not distance-field corners). */
const tileRepeatGrid = Fn(([worldXZ, repeat, lineWidth]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  const fu = fract(tileUv.x);
  const fv = fract(tileUv.y);
  const innerU = step(lineWidth, fu).mul(step(fu, float(1).sub(lineWidth)));
  const innerV = step(lineWidth, fv).mul(step(fv, float(1).sub(lineWidth)));
  const lineU = float(1).sub(innerU);
  const lineV = float(1).sub(innerV);
  return max(lineU, lineV);
});

export interface MapOutlineChannelMask {
  diff: ReturnType<typeof float>;
  nor: ReturnType<typeof float>;
  rough: ReturnType<typeof float>;
  disp: ReturnType<typeof float>;
  spec: ReturnType<typeof float>;
}

/**
 * Path tile-repeat square grid — one color per enabled channel (max blend, not additive).
 * Same tile UV for all channels today; toggle one at a time to compare.
 */
export const mapTypeOutlineDebugColor = Fn(([worldXZ, repeat, albedoDim, mask]) => {
  const lineWidth = float(0.018);
  const grid = tileRepeatGrid(worldXZ, repeat, lineWidth);

  const layerDiff = COLOR_DIFF.mul(grid.mul(mask.diff));
  const layerNor = COLOR_NOR.mul(grid.mul(mask.nor));
  const layerRough = COLOR_ROUGH.mul(grid.mul(mask.rough));
  const layerDisp = COLOR_DISP.mul(grid.mul(mask.disp));
  const layerSpec = COLOR_SPEC.mul(grid.mul(mask.spec));

  const lines = max(
    max(max(max(layerDiff, layerNor), layerRough), layerDisp),
    layerSpec,
  );
  return max(albedoDim, lines);
});
