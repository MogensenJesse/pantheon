// src/world/water/material/waterShadowUniforms.ts — shared sun shadow uniforms for water materials
import { waterSunReceiverUniforms } from '../../../rendering/sunShadow/receiverUniforms';

export type WaterShadowUniforms = typeof waterSunReceiverUniforms;

/** Alias of rendering-owned sun receiver uniforms (same object identity). */
export const waterShadowUniforms: WaterShadowUniforms = waterSunReceiverUniforms;
