// src/rendering/postfx/pixelateEffect.ts
import { floor, mix } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pixelatedUv(uv: any, pixelSize: any, resolution: any): { sampleUv: any; usePixelate: any } {
  const block = pixelSize.div(resolution);
  const pxUv = block.mul(floor(uv.div(block)));
  const usePixelate = pixelSize.greaterThan(1);
  const sampleUv = mix(uv, pxUv, usePixelate);
  return { sampleUv, usePixelate };
}
