// src/editor/place/placeOptions.ts — place-tool randomization toggles (editor toolbar)

export interface PlaceOptions {
  /** Random Y rotation in radians (full turn). */
  randomRotation: boolean;
  /** Random scale multiplier applied to the palette default scale. */
  randomScale: boolean;
  /** Inclusive multiplier range (e.g. 0.8–1.2 = ±20%). */
  scaleMinMul: number;
  scaleMaxMul: number;
}

const DEFAULTS: PlaceOptions = {
  randomRotation: false,
  randomScale: false,
  scaleMinMul: 0.8,
  scaleMaxMul: 1.2,
};

let options: PlaceOptions = { ...DEFAULTS };

export function getPlaceOptions(): Readonly<PlaceOptions> {
  return options;
}

export function setPlaceOptions(patch: Partial<PlaceOptions>): void {
  options = { ...options, ...patch };
}

export function resetPlaceOptions(): void {
  options = { ...DEFAULTS };
}
