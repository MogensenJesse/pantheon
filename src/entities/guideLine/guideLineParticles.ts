// src/entities/guideLine/guideLineParticles.ts — path-bound sparkle sprites (dense at pulses)
import { LinearFilter, type Scene, Vector3 } from 'three';
import { cross, float, max, min, normalize, texture, uniform, vec2, vec3 } from 'three/tsl';
import type { GuideLineSettings } from '../../config/visual/guideLine';
import { toSparkleLook } from '../../config/visual/sparkleLook';
import { createSparkleField } from '../sparkleField';
import { createSparklePathTexture } from '../sparklePathTexture';
import { getGuideLineDevRevision, getLiveGuideLineSettings } from './guideLineDevState';
import type { GuideSample } from './guidePolyline';
import { guideFloatOffsetTsl, guidePathFadeTsl } from './guidePulseTsl';

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

export function createGuideLineParticles(
  scene: Scene,
  sampleCap: number,
  particleCap: number,
): GuideLineParticles {
  const pathWidth = Math.max(2, sampleCap);
  const pathTex = createSparklePathTexture(pathWidth, LinearFilter);
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

  const lookScratch = toSparkleLook(getLiveGuideLineSettings());
  let lastLookRev = getGuideLineDevRevision();
  const pathMap = texture(pathTex);
  const field = createSparkleField({
    parent: scene,
    count: particleCap,
    name: 'guideLineSparkles',
    visible: false,
    look: lookScratch,
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
      const pathFade = guidePathFadeTsl({
        worldPos: pathPos,
        along,
        camPos: uCamPos,
        playerPos: uPlayerPos,
        closestAlong: uClosestAlong,
        fadeStart: uFadeStart,
        fadeEnd: uFadeEnd,
        nearFadeStart: uNearFadeStart,
        nearFadeEnd: uNearFadeEnd,
      });
      return {
        along,
        closestAlong: uClosestAlong,
        extraMul: pathFade,
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
    const rev = getGuideLineDevRevision();
    if (rev !== lastLookRev) {
      lastLookRev = rev;
      field.applyLook(toSparkleLook(settings, undefined, lookScratch));
    }
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
