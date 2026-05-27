// src/rendering/postfx/godraysComposite.ts — helpers for official god-rays composite path
import { acesFilmicToneMapping } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toneMapScene(bloomed: any, exposure: any): any {
  return acesFilmicToneMapping(bloomed, exposure);
}
