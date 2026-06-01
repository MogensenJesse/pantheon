// src/rendering/postfx/vignetteEffect.ts
import { float, smoothstep } from 'three/tsl';

export function applyVignette(color: any, uv: any, inner: any, darkness: any, enabled: any): any {
  const dist = uv.sub(0.5).length().mul(2);
  const vignette = smoothstep(inner, float(1.42), dist).mul(darkness);
  const vigMul = float(1).sub(vignette.mul(enabled));
  return color.mul(vigMul);
}
