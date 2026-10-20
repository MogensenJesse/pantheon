// src/world/village/render/crownColumn.ts — wide light column with a flared base, ground ring and rising sparkles around the temple
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  type Group,
  Mesh,
  PlaneGeometry,
  Vector3,
} from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  cos,
  dot,
  exp,
  float,
  fract,
  length,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  sqrt,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { toSparkleLook } from '../../../config/visual/sparkleLook';
import { VISUAL } from '../../../config/visualTuning';
import {
  guideBreathFadeTsl,
  guideTravelPacketTsl,
} from '../../../entities/guideLine/guidePulseTsl';
import { createSparkleField } from '../../../entities/sparkleField';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../../../rendering/glowMaterial';
import { enableWaterReflectionLayer } from '../../../rendering/layers/waterReflectionLayers';
import { crownTuning } from './crownTuning';
import { uVillageGlow } from './villageUniforms';

type TslNode = any;

const COL = VISUAL.village.CROWN_COLUMN;
const RADIAL = 40;
const ROWS = 28;
/** Rows are packed toward the base, where the flare bends fastest. */
const ROW_POWER = 2.5;
/** The ground ring floats this far above the floor (m) so it clears the terrace slabs. */
const RING_LIFT_M = 0.35;
const lerp = (range: { MIN: number; MAX: number }, t: number) =>
  range.MIN + (range.MAX - range.MIN) * t;

export interface CrownColumn {
  /** Column base on the floor (world) and growth 0..1 (0 = hidden). */
  update: (base: Vector3, growth01: number) => void;
  dispose: () => void;
}

export function createCrownColumn(parent: Group): CrownColumn {
  const guide = VISUAL.guideLine;
  const uBase = uniform(new Vector3());
  const uHeight = uniform(COL.HEIGHT_M.MIN);
  const uBaseRadius = uniform(COL.BASE_RADIUS_M.MIN);
  const uTopRadius = uniform(COL.TOP_RADIUS_M.MIN);
  const uIntensity = uniform(COL.HDR.MIN);
  const uTint = uniform(new Color(COL.COLOR_HEX));
  const uBreathSpeed = uniform(COL.BREATH.SPEED);
  const uBreathAmount = uniform(COL.BREATH.AMOUNT);
  const uBandIdle = uniform(COL.PULSE.IDLE);
  const flare = float(COL.FLARE_M);
  const radiusAt = (h: TslNode) =>
    uTopRadius.add(uBaseRadius.sub(uTopRadius).mul(exp(h.negate().div(flare))));
  const dayMul = mix(float(COL.DAY_MUL), float(1), clamp(uVillageGlow, 0, 1)).mul(
    guideBreathFadeTsl(uBreathSpeed, uBreathAmount),
  );
  const heightFade = (h: TslNode) => float(1).sub(smoothstep(uHeight.mul(0.2), uHeight, h));

  // Open tube: rows along the height (packed toward the base) around the full circle.
  const stride = RADIAL + 1;
  const angle = new Float32Array(stride * (ROWS + 1));
  const rowU = new Float32Array(stride * (ROWS + 1));
  const indices: number[] = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let a = 0; a <= RADIAL; a++) {
      const i = r * stride + a;
      angle[i] = (a / RADIAL) * Math.PI * 2;
      rowU[i] = r / ROWS;
      if (r < ROWS && a < RADIAL) {
        indices.push(i, i + 1, i + stride, i + 1, i + stride + 1, i + stride);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(angle.length * 3), 3));
  geometry.setAttribute('colAngle', new BufferAttribute(angle, 1));
  geometry.setAttribute('colRow', new BufferAttribute(rowU, 1));
  geometry.setIndex(indices);

  const ang = attribute('colAngle', 'float') as TslNode;
  const h = pow(attribute('colRow', 'float') as TslNode, float(ROW_POWER)).mul(uHeight);
  const dir = vec3(cos(ang), 0, sin(ang));

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  material.fog = false;
  material.positionNode = uBase.add(vec3(0, 1, 0).mul(h)).add(dir.mul(radiusAt(h)));
  // Facing the camera is bright, the silhouette fades: a soft volume from any angle.
  const facing = abs(dot(dir, normalize(cameraPosition.sub(positionWorld))));
  const packet = guideTravelPacketTsl(
    h,
    float(0),
    float(COL.PULSE.SPEED),
    float(COL.PULSE.SPACING_M),
    float(COL.PULSE.LENGTH_M),
    float(COL.PULSE.SHARPNESS),
  );
  const bands = mix(uBandIdle, float(1), packet);
  const baseGlow = float(1).add(exp(h.negate().div(5)).mul(0.8));
  material.colorNode = (uTint as TslNode)
    .mul(uIntensity)
    .mul(uHdrBloomScale)
    .mul(pow(facing, float(2.2)))
    .mul(bands)
    .mul(heightFade(h))
    .mul(baseGlow)
    .mul(dayMul);

  const column = new Mesh(geometry, material);
  column.name = 'crownColumn';
  column.frustumCulled = false;
  column.renderOrder = GLOW_MESH_RENDER_ORDER;
  enableWaterReflectionLayer(column);
  parent.add(column);

  // Flat ring on the floor, the pedestal glow of the reference: a bright ring and a soft inner pool.
  const ringGeometry = new PlaneGeometry(2, 2);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  ringMaterial.fog = false;
  ringMaterial.positionNode = uBase
    .add(vec3(0, RING_LIFT_M, 0))
    .add(vec3(positionLocal.x, 0, positionLocal.z).mul(uBaseRadius.mul(1.25)));
  const rr = length(uv().sub(0.5)).mul(2);
  const ring = exp(rr.sub(0.8).div(0.07).pow(2).negate());
  const pool = float(1)
    .sub(smoothstep(float(0.1), float(1), rr))
    .mul(0.35);
  ringMaterial.colorNode = (uTint as TslNode)
    .mul(uIntensity)
    .mul(uHdrBloomScale)
    .mul(ring.mul(1.6).add(pool))
    .mul(float(1).sub(smoothstep(float(0.9), float(1), rr)))
    .mul(dayMul);
  const ringMesh = new Mesh(ringGeometry, ringMaterial);
  ringMesh.name = 'crownColumnRing';
  ringMesh.frustumCulled = false;
  ringMesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  enableWaterReflectionLayer(ringMesh);
  parent.add(ringMesh);

  const tint = COL.COLOR_HEX;
  const sparkles = createSparkleField({
    parent,
    count: COL.PARTICLES.COUNT,
    name: 'crownColumnSparkles',
    look: toSparkleLook(guide, {
      sizeM: COL.PARTICLES.SIZE_M,
      spreadM: 0,
      idle: 0.85,
      colorAHex: tint,
      colorBHex: tint,
      colorCHex: tint,
      pulseSpeed: COL.PULSE.SPEED,
      pulseSpacingM: COL.PULSE.SPACING_M,
      pulseLengthM: COL.PULSE.LENGTH_M,
    }),
    place: ({ alongFrac, h1, h2, h3 }) => {
      // Each sparkle climbs its own lane inside the column and wraps back to the floor.
      const u = fract(alongFrac.add(time.mul(float(COL.PARTICLES.RISE))));
      const sparkH = pow(u, float(1.6)).mul(uHeight);
      const around = h2.mul(Math.PI * 2).add(time.mul(h3.sub(0.5).mul(0.4)));
      const lane = radiusAt(sparkH).mul(sqrt(h1));
      return {
        along: sparkH,
        closestAlong: float(0),
        extraMul: heightFade(sparkH),
        position: uBase
          .add(vec3(0, 1, 0).mul(sparkH))
          .add(vec3(cos(around), 0, sin(around)).mul(lane)),
      };
    },
  });

  const setVisible = (visible: boolean) => {
    column.visible = visible;
    ringMesh.visible = visible;
    sparkles.mesh.visible = visible;
  };
  setVisible(false);

  return {
    update: (base, growth01) => {
      const k = Math.min(1, Math.max(0, growth01));
      setVisible(k > 0.001);
      (uBase.value as Vector3).copy(base);
      uHeight.value = lerp(COL.HEIGHT_M, k);
      uBaseRadius.value = lerp({ ...COL.BASE_RADIUS_M, MAX: crownTuning.columnBaseRadiusMax }, k);
      uTopRadius.value = lerp({ ...COL.TOP_RADIUS_M, MAX: crownTuning.columnTopRadiusMax }, k);
      uIntensity.value = lerp({ ...COL.HDR, MAX: crownTuning.columnHdrMax }, k);
      uBreathSpeed.value = crownTuning.columnBreathSpeed;
      uBreathAmount.value = crownTuning.columnBreathAmount;
      uBandIdle.value = crownTuning.columnPulseIdle;
      sparkles.mesh.count = Math.round(k * COL.PARTICLES.COUNT);
    },
    dispose: () => {
      parent.remove(column);
      parent.remove(ringMesh);
      geometry.dispose();
      ringGeometry.dispose();
      material.dispose();
      ringMaterial.dispose();
      sparkles.dispose();
    },
  };
}
