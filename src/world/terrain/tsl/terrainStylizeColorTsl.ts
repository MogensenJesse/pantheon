// src/world/terrain/tsl/terrainStylizeColorTsl.ts — painterly albedo ramp (scene fog owns aerial)
import { clamp, dot, Fn, mix, vec3 } from 'three/tsl';

type TslNode = any;

export type StylizePaletteStopMap = {
  shore: TslNode;
  forest: TslNode;
  hills: TslNode;
  mountain: TslNode;
  rock: TslNode;
  snow: TslNode;
  path: TslNode;
  meadow: TslNode;
};

const LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * Land (shore/forest/hills/mountain) plus slope-rock / snow / path / meadow overlays.
 * Same overlay order as the albedo splat.
 */
const splatWeightedBiomeColor = Fn(
  ([
    shore,
    forest,
    hills,
    mountain,
    rock,
    snow,
    path,
    meadow,
    hwUsed,
    slopeRockW,
    snowW,
    pathW,
    meadowW,
  ]: TslNode[]) => {
    const land = shore
      .mul(hwUsed.x)
      .add(forest.mul(hwUsed.y))
      .add(hills.mul(hwUsed.z))
      .add(mountain.mul(hwUsed.w));
    return mix(mix(mix(mix(land, rock, slopeRockW), snow, snowW), path, pathW), meadow, meadowW);
  },
);

export function splatStylizePaletteStop(
  map: StylizePaletteStopMap,
  hwUsed: TslNode,
  slopeRockW: TslNode,
  snowW: TslNode,
  pathW: TslNode,
  meadowW: TslNode,
): TslNode {
  return splatWeightedBiomeColor(
    map.shore,
    map.forest,
    map.hills,
    map.mountain,
    map.rock,
    map.snow,
    map.path,
    map.meadow,
    hwUsed,
    slopeRockW,
    snowW,
    pathW,
    meadowW,
  );
}

/**
 * Luma-only palette ramps. Lighting (Phase 2) owns the N·L hue split.
 * Noon vs golden-hour is already lerped into the palette uniforms on the CPU.
 */
export function stylizePaletteRamps(opts: {
  sampledAlbedo: TslNode;
  paletteSun: StylizePaletteStopMap;
  paletteGround: StylizePaletteStopMap;
  paletteShadow: StylizePaletteStopMap;
  hwUsed: TslNode;
  slopeRockW: TslNode;
  snowW: TslNode;
  pathW: TslNode;
  meadowW: TslNode;
}): { luma: TslNode; unlit: TslNode; lit: TslNode; paletteAlbedo: TslNode } {
  const sun = splatStylizePaletteStop(
    opts.paletteSun,
    opts.hwUsed,
    opts.slopeRockW,
    opts.snowW,
    opts.pathW,
    opts.meadowW,
  );
  const ground = splatStylizePaletteStop(
    opts.paletteGround,
    opts.hwUsed,
    opts.slopeRockW,
    opts.snowW,
    opts.pathW,
    opts.meadowW,
  );
  const shadow = splatStylizePaletteStop(
    opts.paletteShadow,
    opts.hwUsed,
    opts.slopeRockW,
    opts.snowW,
    opts.pathW,
    opts.meadowW,
  );
  const luma = clamp(dot(opts.sampledAlbedo, LUMA), 0, 1);
  const unlit = mix(shadow, ground, luma);
  const lit = mix(ground, sun, luma);
  const paletteAlbedo = mix(unlit, lit, luma);
  return { luma, unlit, lit, paletteAlbedo };
}

/** Remap photographed albedo onto a 3-stop luma palette (no lighting terminator). */
export function stylizeAlbedoFromPalette(
  opts: Parameters<typeof stylizePaletteRamps>[0] & { mixAmt: TslNode },
): TslNode {
  const { paletteAlbedo } = stylizePaletteRamps(opts);
  return mix(opts.sampledAlbedo, paletteAlbedo, opts.mixAmt);
}
