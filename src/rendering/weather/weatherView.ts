// src/rendering/weather/weatherView.ts — the weather where the camera is: rain streaks, overcast and wet ground
import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { WEATHER } from '../../config/weather';
import { stepWetness, type Weather } from '../../world/weather/weather';
import { createRainStreaks } from './rainStreaks';
import { weatherLook } from './weatherLook';
import { uWetness } from './weatherLookTsl';

export interface WeatherViewOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  weather: Weather;
  /** False in Phase 0, where the sun is pinned and there is no weather. */
  weatherOn: () => boolean;
  /** A rain forced from the DEV tools, or null to follow the weather. */
  forcedRain: () => number | null;
}

export interface WeatherView {
  /** Once a frame, before the lighting is pushed: reads the weather at the camera and sets the look. */
  update: (frameDelta: number, clockS: number) => void;
  dispose: () => void;
}

const _centre = new Vector3();
const _forward = new Vector3();

export function createWeatherView(options: WeatherViewOptions): WeatherView {
  const { scene, camera, weather } = options;
  const streaks = createRainStreaks();
  scene.add(streaks.mesh);
  let wetness = 0;

  return {
    update: (frameDelta, clockS) => {
      const forced = options.forcedRain();
      const { x, z } = camera.position;
      const on = options.weatherOn();
      const rain = forced ?? (on ? weather.rainAt(x, z, clockS) : 0);
      const overcast = forced ?? (on ? weather.overcastAt(x, z, clockS) : 0);
      wetness = stepWetness(wetness, rain, frameDelta);
      weatherLook.rain01 = rain;
      weatherLook.overcast01 = Math.max(overcast, rain);
      weatherLook.wetness01 = wetness;
      uWetness.value = wetness;
      // the box sits a little ahead of the camera, so the streaks fill the view rather than the back of the head
      camera.getWorldDirection(_forward);
      _centre.copy(camera.position).addScaledVector(_forward, WEATHER.LOOK.STREAKS.BOX_M * 0.25);
      streaks.update(rain, _centre);
    },
    dispose: () => {
      scene.remove(streaks.mesh);
      streaks.dispose();
    },
  };
}
