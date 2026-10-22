// src/rendering/ambience/ambienceView.ts — sets the world's ambient state once a frame: the wind and the time of day
import type { PerspectiveCamera } from 'three';
import { life } from '../../config/visual/life';
import { followTarget, preRainGust, windBoostTarget, windHeading } from '../../life/windGust';
import type { Weather } from '../../world/weather/weather';
import { todWeights } from '../tod/todBlend';
import { weatherLook } from '../weather/weatherLook';
import { ambience } from './ambienceState';
import { windUniforms } from './windUniforms';

const W = life.WIND;

export interface AmbienceViewOptions {
  camera: PerspectiveCamera;
  weather: Weather;
  /** The heading the clouds and storm fronts blow toward (degrees); the one wind direction for everything. */
  windDirectionDeg: () => number;
  /** False in Phase 0, where the sun is pinned and there is no weather. */
  weatherOn: () => boolean;
}

export interface AmbienceView {
  /**
   * Once a frame, after the weather look is set and the sun's height is known.
   * `windClock` is the render-rate wind clock; `clockS` is the game clock the weather follows.
   */
  update: (frameDelta: number, windClock: number, clockS: number, sunElevationDeg: number) => void;
}

export function createAmbienceView(options: AmbienceViewOptions): AmbienceView {
  const { camera, weather } = options;
  let boost = 1;

  return {
    update: (frameDelta, windClock, clockS, sunElevationDeg) => {
      const heading = windHeading(options.windDirectionDeg());
      const { x, z } = camera.position;
      const rain = weatherLook.rain01;
      const preRain = options.weatherOn()
        ? preRainGust(rain, weather.rainAt(x, z, clockS + W.PRE_RAIN_LEAD_S))
        : 0;
      boost = followTarget(boost, windBoostTarget(rain, preRain), frameDelta, W.SMOOTH_S);

      const tod = todWeights(sunElevationDeg);
      ambience.windDirX = heading.x;
      ambience.windDirZ = heading.z;
      ambience.windBoost = boost;
      ambience.windClock = windClock;
      ambience.night01 = tod.night;
      ambience.golden01 = tod.goldenHour;

      windUniforms.uWindDirection.value.set(heading.x, heading.z);
      windUniforms.uWindClock.value = windClock;
      windUniforms.uWindBoost.value = boost;
    },
  };
}
