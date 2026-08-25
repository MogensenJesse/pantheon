// src/editor/place/placeOptions.ts — session-owned place-tool randomization options

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

export interface PlaceOptionsModel {
  get: () => Readonly<PlaceOptions>;
  set: (patch: Partial<PlaceOptions>) => void;
}

export function createPlaceOptionsModel(initial: Partial<PlaceOptions> = {}): PlaceOptionsModel {
  let options: PlaceOptions = { ...DEFAULTS, ...initial };
  return {
    get: () => options,
    set: (patch) => {
      options = { ...options, ...patch };
    },
  };
}

let activeModel: PlaceOptionsModel = createPlaceOptionsModel();

/** Bind session-owned place options for the editor lifetime. */
export function bindActivePlaceOptionsModel(model: PlaceOptionsModel): () => void {
  activeModel = model;
  return () => {
    activeModel = createPlaceOptionsModel();
  };
}

export function getPlaceOptions(): Readonly<PlaceOptions> {
  return activeModel.get();
}

export function setPlaceOptions(patch: Partial<PlaceOptions>): void {
  activeModel.set(patch);
}
