// src/world/village/render/crownBeam.ts — light beam rising from the crown orb: guide-line pulses and sparkles on a vertical ribbon
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  type Group,
  Mesh,
  Vector3,
} from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  exp,
  float,
  mix,
  normalize,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { toSparkleLook } from '../../../config/visual/sparkleLook';
import { VISUAL } from '../../../config/visualTuning';
import { lerp, lerpRange } from '../../../core/math/scalar';
import {
  guideBreathFadeTsl,
  guideNoiseDriftTsl,
  guideTravelColorTsl,
  guideTravelPacketTsl,
} from '../../../entities/guideLine/guidePulseTsl';
import { createSparkleField } from '../../../entities/sparkleField';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../../../rendering/glowMaterial';
import { enableWaterReflectionLayer } from '../../../rendering/layers/waterReflectionLayers';
import { crownTuning } from './crownTuning';
import { uVillageGlow } from './villageUniforms';

type TslNode = any;

const BEAM = VISUAL.village.CROWN_BEAM;

/** Rows along the beam: enough for the sway to bend it smoothly. */
const SEGMENTS = 32;

export interface CrownBeam {
  setVisible: (visible: boolean) => void;
  /** Beam base (world) and strength 0..1 (0 = the faintest beam, 1 = the strongest). */
  update: (base: Vector3, strength01: number) => void;
  dispose: () => void;
}

export function createCrownBeam(parent: Group): CrownBeam {
  const guide = VISUAL.guideLine;
  const uBase = uniform(new Vector3());
  const uHeight = uniform(BEAM.HEIGHT_M.MIN);
  const uHalfWidth = uniform(BEAM.HALF_WIDTH_M.MIN);
  const uIntensity = uniform(BEAM.HDR.MIN);
  const uColorA = uniform(new Color(guide.emissiveHex));
  const uColorB = uniform(new Color(guide.colorBHex));
  const uColorC = uniform(new Color(guide.colorCHex));
  const uPulseSpeed = uniform(BEAM.PULSE.SPEED);
  const uPulseSpacing = uniform(BEAM.PULSE.SPACING_M);
  const uPulseLength = uniform(BEAM.PULSE.LENGTH_M);
  const uPulseSharpness = uniform(BEAM.PULSE.SHARPNESS);
  const uPulseIdle = uniform(BEAM.PULSE.IDLE);
  const uFade = uniform(BEAM.FADE_M);

  // A strip of vertex pairs: the shader lifts each row to its height and spreads it across the view.
  const rows = SEGMENTS + 1;
  const beamT = new Float32Array(rows * 2);
  const acrossAttr = new Float32Array(rows * 2);
  const indices: number[] = [];
  for (let i = 0; i < rows; i++) {
    beamT[i * 2] = beamT[i * 2 + 1] = i / SEGMENTS;
    acrossAttr[i * 2] = -1;
    acrossAttr[i * 2 + 1] = 1;
    if (i < SEGMENTS) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(rows * 6), 3));
  geometry.setAttribute('beamT', new BufferAttribute(beamT, 1));
  geometry.setAttribute('across', new BufferAttribute(acrossAttr, 1));
  geometry.setIndex(indices);

  const t = attribute('beamT', 'float') as TslNode;
  const across = attribute('across', 'float') as TslNode;
  const along = t.mul(uHeight);
  const toCamera = cameraPosition.sub(uBase);
  const right = normalize(vec3(toCamera.z, 0, toCamera.x.negate()));
  const halfWidth = uHalfWidth.mul(mix(float(1), float(BEAM.TOP_WIDEN), t));
  const sway = (a: TslNode) =>
    guideNoiseDriftTsl(
      a,
      uHeight,
      float(BEAM.SWAY.AMP_M),
      float(BEAM.SWAY.SPEED),
      float(BEAM.SWAY.SCALE),
    );

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  material.fog = false;
  material.positionNode = uBase
    .add(vec3(0, 1, 0).mul(along))
    .add(sway(along))
    .add(right.mul(across.mul(halfWidth)));

  const r = abs(across);
  // The guide ribbon's crisp-core, soft-halo falloff.
  const core = exp(r.mul(r).mul(-18));
  const halo = exp(r.mul(r).mul(-3.8));
  const packet = guideTravelPacketTsl(
    along,
    float(0),
    uPulseSpeed,
    uPulseSpacing,
    uPulseLength,
    uPulseSharpness,
  );
  const brightness = mix(uPulseIdle, float(1.5), packet);
  const heightFade = float(1).sub(smoothstep(uHeight.mul(0.25), uHeight, along));
  const baseFade = (a: TslNode) => smoothstep(float(0.3), uFade.add(0.3), a);
  const dayMul = mix(float(BEAM.DAY_MUL), float(1), clamp(uVillageGlow, 0, 1));
  const haloColor = guideTravelColorTsl(
    along,
    uPulseSpeed,
    float(guide.colorTravelM),
    uColorA as TslNode,
    uColorB as TslNode,
    uColorC as TslNode,
  );
  material.colorNode = mix(haloColor, vec3(1.18, 1.1, 0.98), core)
    .mul(uIntensity)
    .mul(uHdrBloomScale)
    .mul(brightness)
    .mul(halo.add(core.mul(0.55)))
    .mul(heightFade)
    .mul(baseFade(along))
    .mul(dayMul)
    .mul(guideBreathFadeTsl(float(guide.breathSpeed), float(guide.breathAmount)));

  const mesh = new Mesh(geometry, material);
  mesh.name = 'crownBeam';
  mesh.frustumCulled = false;
  mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  enableWaterReflectionLayer(mesh);
  parent.add(mesh);

  const sparkles = createSparkleField({
    parent,
    count: BEAM.PARTICLES.COUNT,
    name: 'crownBeamSparkles',
    look: toSparkleLook(guide, {
      sizeM: BEAM.PARTICLES.SIZE_M,
      spreadM: BEAM.PARTICLES.SPREAD_M,
      pulseSpeed: BEAM.PULSE.SPEED,
      pulseSpacingM: BEAM.PULSE.SPACING_M,
      pulseLengthM: BEAM.PULSE.LENGTH_M,
    }),
    place: ({ alongFrac, uSpread, tubeOffset }) => {
      const sparkAlong = alongFrac.mul(uHeight);
      const fade = float(1).sub(smoothstep(uHeight.mul(0.25), uHeight, sparkAlong));
      return {
        along: sparkAlong,
        closestAlong: float(0),
        extraMul: fade.mul(baseFade(sparkAlong)),
        position: uBase
          .add(vec3(0, 1, 0).mul(sparkAlong))
          .add(sway(sparkAlong))
          .add(tubeOffset(vec3(1, 0, 0), vec3(0, 0, 1)).mul(uSpread)),
      };
    },
  });

  mesh.visible = false;
  sparkles.mesh.visible = false;

  return {
    setVisible: (visible) => {
      mesh.visible = visible;
      sparkles.mesh.visible = visible;
    },
    update: (base, strength01) => {
      // Squared: faint for most of the climb, full only near MAX_FAITH.
      const eased = strength01 * strength01;
      (uBase.value as Vector3).copy(base);
      uHeight.value = lerpRange(BEAM.HEIGHT_M, strength01);
      uHalfWidth.value = lerp(BEAM.HALF_WIDTH_M.MIN, crownTuning.beamHalfWidthMax, strength01);
      uIntensity.value = lerp(BEAM.HDR.MIN, crownTuning.beamHdrMax, eased);
      uPulseIdle.value = crownTuning.beamPulseIdle;
      uFade.value = crownTuning.beamFadeM;
      sparkles.mesh.count = Math.round(eased * BEAM.PARTICLES.COUNT);
    },
    dispose: () => {
      parent.remove(mesh);
      geometry.dispose();
      material.dispose();
      sparkles.dispose();
    },
  };
}
