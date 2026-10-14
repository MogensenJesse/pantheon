// src/world/village/render/villageKitLook.ts — live grade of the modelled kit's albedo, shared by every kit material
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';

const { SHADE, GAIN } = VISUAL.village.KIT_LOOK;

/** Shade lift and colour gain of every textured kit material; the DEV hook `__pantheonVillage.kitLook` edits them live. */
export const kitLook = { shade: uniform(SHADE), gain: uniform(GAIN) };
