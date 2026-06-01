// src/rendering/postfx/godraysComposite.ts — HDR tonemap helpers for the post composite
import { agxToneMapping } from 'three/tsl';

export function toneMapScene(bloomed: any, exposure: any): any {
  return agxToneMapping(bloomed, exposure);
}
