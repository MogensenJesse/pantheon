// src/rendering/weather/weatherLook.ts — what the weather looks like where the camera is (plain numbers)
//
// Set once a frame by `weatherView`; the sky lighting, the clouds and the shaders read it. 0 everywhere in
// clear weather, so every reader is a no-op until a front arrives.

export const weatherLook = {
  /** Rain at the camera, 0..1. */
  rain01: 0,
  /** How closed in the sky is at the camera, 0..1 (it starts before the rain and ends after it). */
  overcast01: 0,
  /** Wet ground, 0..1: it soaks while it rains and dries slowly after. */
  wetness01: 0,
};
