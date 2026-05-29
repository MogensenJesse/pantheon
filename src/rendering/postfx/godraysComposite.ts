// src/rendering/postfx/godraysComposite.ts — HDR tonemap helpers for the post composite
import { agxToneMapping } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toneMapScene(bloomed: any, exposure: any): any {
  return agxToneMapping(bloomed, exposure);
}
