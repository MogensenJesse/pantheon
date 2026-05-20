// src/rendering/postfx/quantizeEffect.ts
import { floor, float, max, mix } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyQuantize(color: any, levels: any): any {
  const quantize = levels.greaterThan(1);
  const quantized = floor(color.mul(levels)).div(max(levels, float(1)));
  return mix(color, quantized, quantize);
}
