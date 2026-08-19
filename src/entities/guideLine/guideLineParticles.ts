// src/entities/guideLine/guideLineParticles.ts — path-bound sparkle sprites (dense at pulses)
import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  FloatType,
  InstancedMesh,
  LinearFilter,
  NoColorSpace,
  PlaneGeometry,
  RGBAFormat,
  type Scene,
  Vector3,
} from 'three';
import {
  clamp,
  cos,
  cross,
  Discard,
  Fn,
  float,
  fract,
  hash,
  If,
  instanceIndex,
  length,
  max,
  min,
  mix,
  normalize,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import type { GuideLineSettings } from '../../config/visual/guideLine';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../../rendering/glowMaterial';
import { disableWaterReflectionLayer } from '../../rendering/layers/waterReflectionLayers';
import type { GuideSample } from './guidePolyline';
import {
  guideBreathFadeTsl,
  guideFloatOffsetTsl,
  guideTravelColorTsl,
  guideTravelLinearMaskTsl,
} from './guidePulseTsl';

type TslNode = any;

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
  const count = Math.max(8, particleCap);
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
  const uPulseSpeed = uniform(0.1);
  const uPulseSpacing = uniform(30);
  const uPulseLength = uniform(9);
  const uFloatAmp = uniform(0.25);
  const uFloatSpeed = uniform(0.75);
  const uFloatWave = uniform(32);
  const uBreathSpeed = uniform(0.65);
  const uBreathAmount = uniform(0.7);
  const uSpread = uniform(0.32);
  const uSize = uniform(0.07);
  const uIdleDensity = uniform(0.14);
  const uParticleHdr = uniform(1.6);
  const uSpin = uniform(0.7);
  const uColorTravel = uniform(18);
  const uColorA = uniform(new Color(0xffcc44));
  const uColorB = uniform(new Color(0x44e8ff));
  const uColorC = uniform(new Color(0xd080ff));

  const pathMap = texture(pathTex);
  const id = float(instanceIndex);
  const alongFrac = fract(id.mul(0.61803398875).add(0.11));
  const seed = id.add(19.17);
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
  const worldUp = vec3(0, 1, 0);
  const side = normalize(cross(tangent, worldUp).add(vec3(0.0002, 0, 0)));
  const up = normalize(cross(side, tangent));
  const h1 = hash(seed);
  const h2 = hash(seed.add(17.3));
  const h3 = hash(seed.add(41.9));
  const ang = time.mul(uSpin).add(h1.mul(6.283185));
  const tube = side
    .mul(h1.sub(0.5))
    .add(up.mul(h2.sub(0.5).mul(0.85)))
    .add(
      side
        .mul(cos(ang))
        .add(up.mul(sin(ang)))
        .mul(0.4),
    );
  const yWave = guideFloatOffsetTsl(along, uFloatAmp, uFloatSpeed, uFloatWave);
  const packet = guideTravelLinearMaskTsl(
    along,
    uClosestAlong,
    uPulseSpeed,
    uPulseSpacing,
    uPulseLength,
  );
  const chance = mix(clamp(uIdleDensity, 0, 1), float(1), packet);
  const shown = smoothstep(h3, h3.add(0.16), chance);
  const breath = guideBreathFadeTsl(uBreathSpeed, uBreathAmount);
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
  const playerFade = min(nearFade, aheadFade);
  const haloColor = guideTravelColorTsl(
    along,
    uPulseSpeed,
    uColorTravel,
    uColorA as TslNode,
    uColorB as TslNode,
    uColorC as TslNode,
  );
  const hot = vec3(1.2, 1.12, 0.98);
  const rgb = mix(haloColor, hot, packet);
  const r = length(uv().sub(0.5)).mul(2);
  const disc = float(1).sub(smoothstep(float(0.12), float(1), r));
  const size = mix(uSize.mul(0.45), uSize, packet).mul(h2.mul(0.55).add(0.7));

  const material = new SpriteNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.blending = AdditiveBlending;
  material.fog = false;
  material.forceSinglePass = true;
  material.positionNode = pathPos
    .add(tube.mul(uSpread))
    .add(vec3(0, 1, 0).mul(yWave))
    .add(up.mul(h3.sub(0.5).mul(uSpread).mul(0.35)));
  material.scaleNode = vec3(size, size, 1);
  material.colorNode = Fn(() => {
    const out = vec3(0).toVar();
    If(shown.greaterThan(float(0.02)), () => {
      out.assign(
        rgb
          .mul(uParticleHdr)
          .mul(uHdrBloomScale)
          .mul(mix(float(0.28), float(1), packet))
          .mul(camFade)
          .mul(playerFade)
          .mul(breath)
          .mul(shown)
          .mul(disc),
      );
    }).Else(() => {
      Discard();
    });
    return out;
  })();

  const geometry = new PlaneGeometry(1, 1);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  mesh.visible = false;
  mesh.count = count;
  disableWaterReflectionLayer(mesh);
  scene.add(mesh);

  const setVisible = (visible: boolean) => {
    mesh.visible = visible;
  };

  const syncUniforms = (
    settings: GuideLineSettings,
    cam: Vector3,
    player: Vector3,
    closestAlong: number,
    maxAlong: number,
  ) => {
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
    uPulseSpeed.value = settings.pulseSpeed;
    uPulseSpacing.value = settings.pulseSpacingM;
    uPulseLength.value = settings.pulseLengthM;
    uFloatAmp.value = settings.floatAmp;
    uFloatSpeed.value = settings.floatSpeed;
    uFloatWave.value = settings.floatWaveM;
    uBreathSpeed.value = settings.breathSpeed;
    uBreathAmount.value = settings.breathAmount;
    uSpread.value = settings.particleSpreadM;
    uSize.value = settings.particleSizeM;
    uIdleDensity.value = settings.particleIdle;
    uParticleHdr.value = settings.particleHdr;
    uSpin.value = settings.particleSpin;
    uColorTravel.value = settings.colorTravelM;
    (uColorA.value as Color).setHex(settings.emissiveHex);
    (uColorB.value as Color).setHex(settings.colorBHex);
    (uColorC.value as Color).setHex(settings.colorCHex);
  };

  const writePath = (points: GuideSample[]) => {
    const n = Math.min(points.length, pathWidth);
    if (n < 2) {
      mesh.visible = false;
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
    mesh.visible = true;
  };

  const dispose = () => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    pathTex.dispose();
  };

  return { setVisible, syncUniforms, writePath, dispose };
}
