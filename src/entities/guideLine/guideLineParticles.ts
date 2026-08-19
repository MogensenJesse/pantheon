// src/entities/guideLine/guideLineParticles.ts — path-bound sparkle sprites (dense at pulses)
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  type Scene,
  Vector3,
} from 'three';
import {
  cross,
  float,
  length,
  max,
  min,
  normalize,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { GuideLineSettings } from '../../config/visual/guideLine';
import type { SparkleLookSettings } from '../../config/visual/sparkleLook';
import { VISUAL } from '../../config/visualTuning';
import { createSparkleField } from '../sparkleField';
import type { GuideSample } from './guidePolyline';
import { guideFloatOffsetTsl } from './guidePulseTsl';

export interface GuideLineParticles {
  setVisible: (visible: boolean) => void;
  syncUniforms: (
    settings: GuideLineSettings,
    cam: Vector3,
    player: Vector3,
    closestAlong: number,
    maxAlong: number,
  ) => void;
  writePath: (points: GuideSample[]) => void;
  dispose: () => void;
}

function lookFromGuide(settings: GuideLineSettings): SparkleLookSettings {
  return {
    sizeM: settings.particleSizeM,
    spreadM: settings.particleSpreadM,
    idle: settings.particleIdle,
    hdr: settings.particleHdr,
    spin: settings.particleSpin,
    breathAmount: settings.breathAmount,
    breathSpeed: settings.breathSpeed,
    colorAHex: settings.emissiveHex,
    colorBHex: settings.colorBHex,
    colorCHex: settings.colorCHex,
    colorTravelM: settings.colorTravelM,
    pulseSpeed: settings.pulseSpeed,
    pulseSpacingM: settings.pulseSpacingM,
    pulseLengthM: settings.pulseLengthM,
  };
}

function createPathTexture(sampleCap: number): DataTexture {
  const width = Math.max(2, sampleCap);
  const data = new Float32Array(width * 4);
  const tex = new DataTexture(data, width, 1, RGBAFormat, FloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createGuideLineParticles(
  scene: Scene,
  sampleCap: number,
  particleCap: number,
): GuideLineParticles {
  const pathWidth = Math.max(2, sampleCap);
  const pathTex = createPathTexture(pathWidth);
  const pathData = pathTex.image.data as Float32Array;

  const uCamPos = uniform(new Vector3());
  const uPlayerPos = uniform(new Vector3());
  const uFadeStart = uniform(16);
  const uFadeEnd = uniform(64);
  const uNearFadeStart = uniform(2.4);
  const uNearFadeEnd = uniform(5.5);
  const uClosestAlong = uniform(0);
  const uMaxAlong = uniform(1);
  const uPathCount = uniform(2);
  const uFloatAmp = uniform(0.25);
  const uFloatSpeed = uniform(0.75);
  const uFloatWave = uniform(32);

  const pathMap = texture(pathTex);
  const field = createSparkleField({
    parent: scene,
    count: particleCap,
    name: 'guideLineSparkles',
    visible: false,
    look: lookFromGuide(VISUAL.guideLine),
    place: ({ alongFrac, h3, uSpread, tubeOffset }) => {
      const along = alongFrac.mul(max(uMaxAlong, float(0.01)));
      const pathU = alongFrac
        .mul(max(uPathCount, float(2)).sub(1))
        .add(0.5)
        .div(float(pathWidth));
      const pathSample = pathMap.sample(vec2(pathU, float(0.5)));
      const pathPos = vec3(pathSample.x, pathSample.y, pathSample.z);
      const pathSampleNext = pathMap.sample(
        vec2(min(pathU.add(float(1).div(float(pathWidth))), float(0.999)), float(0.5)),
      );
      const pathPosNext = vec3(pathSampleNext.x, pathSampleNext.y, pathSampleNext.z);
      const tangent = normalize(pathPosNext.sub(pathPos).add(vec3(0.0002, 0, 0)));
      const side = normalize(cross(tangent, vec3(0, 1, 0)).add(vec3(0.0002, 0, 0)));
      const up = normalize(cross(side, tangent));
      const yWave = guideFloatOffsetTsl(along, uFloatAmp, uFloatSpeed, uFloatWave);
      const camDist = length(pathPos.sub(uCamPos));
      const camFade = float(1).sub(smoothstep(uFadeStart, uFadeEnd, camDist));
      const playerDelta = pathPos.sub(uPlayerPos);
      const playerDist = length(vec2(playerDelta.x, playerDelta.z));
      const nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, playerDist);
      const aheadFade = smoothstep(
        uClosestAlong.add(uNearFadeStart),
        uClosestAlong.add(uNearFadeEnd),
        along,
      );
      return {
        along,
        closestAlong: uClosestAlong,
        extraMul: camFade.mul(min(nearFade, aheadFade)),
        position: pathPos
          .add(tubeOffset(side, up).mul(uSpread))
          .add(vec3(0, 1, 0).mul(yWave))
          .add(up.mul(h3.sub(0.5).mul(uSpread).mul(0.35))),
      };
    },
  });

  const setVisible = (visible: boolean) => {
    field.mesh.visible = visible;
  };

  const syncUniforms = (
    settings: GuideLineSettings,
    cam: Vector3,
    player: Vector3,
    closestAlong: number,
    maxAlong: number,
  ) => {
    field.applyLook(lookFromGuide(settings));
    (uCamPos.value as Vector3).copy(cam);
    (uPlayerPos.value as Vector3).copy(player);
    uFadeStart.value = settings.fadeStartM;
    uFadeEnd.value = settings.fadeEndM;
    uNearFadeEnd.value = settings.playerNearFadeEndM;
    uNearFadeStart.value = Math.min(
      settings.playerNearFadeStartM,
      settings.playerNearFadeEndM * 0.5,
    );
    uClosestAlong.value = closestAlong;
    uMaxAlong.value = Math.max(maxAlong, 0.01);
    uFloatAmp.value = settings.floatAmp;
    uFloatSpeed.value = settings.floatSpeed;
    uFloatWave.value = settings.floatWaveM;
  };

  const writePath = (points: GuideSample[]) => {
    const n = Math.min(points.length, pathWidth);
    if (n < 2) {
      field.mesh.visible = false;
      return;
    }
    const last = points[n - 1]!;
    for (let i = 0; i < pathWidth; i++) {
      const p = i < n ? points[i]! : last;
      const o = i * 4;
      pathData[o] = p.x;
      pathData[o + 1] = p.y;
      pathData[o + 2] = p.z;
      pathData[o + 3] = 1;
    }
    pathTex.needsUpdate = true;
    uPathCount.value = n;
    field.mesh.visible = true;
  };

  const dispose = () => {
    field.dispose();
    pathTex.dispose();
  };

  return { setVisible, syncUniforms, writePath, dispose };
}
