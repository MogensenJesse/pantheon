// src/world/village/assets/placeholder/palette.ts — linear vertex colours for the placeholder kit
import { Color } from 'three';
import type { Rgb } from './meshBuilder.ts';

/** sRGB hex to the linear working space the prop shader multiplies in. */
export function rgb(hex: number): Rgb {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

export const PALETTE = {
  faluRed: rgb(0x8f3a2b),
  ochre: rgb(0xb98a3e),
  greyWood: rgb(0x7a6c5a),
  tar: rgb(0x2a2118),
  turf: rgb(0x5a6b34),
  thatch: rgb(0xb59b57),
  slate: rgb(0x4a4e52),
  shingle: rgb(0x2f2a28),
  timber: rgb(0x7a5232),
  timberDark: rgb(0x5a3d28),
  timberLight: rgb(0x9a7248),
  trim: rgb(0xe7ddc8),
  stone: rgb(0x8a8780),
  stoneDark: rgb(0x6d6a65),
  stoneLight: rgb(0xa09d95),
  window: rgb(0x1a2430),
  door: rgb(0x3a2718),
  glow: rgb(0xffc26a),
  skin: rgb(0xd9a77a),
  trousers: rgb(0x5a4632),
  boots: rgb(0x2e2218),
  hair: rgb(0x3b2a1c),
  tunicBlue: rgb(0x3e5f8a),
  tunicCream: rgb(0xd8cfc0),
} as const;
