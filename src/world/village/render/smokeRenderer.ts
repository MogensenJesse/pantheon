// @ts-nocheck — TSL node typings incomplete in three r186
// src/world/village/render/smokeRenderer.ts — chimney smoke: shader-animated puffs, strength set per chimney
import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, PlaneGeometry } from 'three';
import { attribute, float, fract, mix, sin, smoothstep, vec3 } from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { VILLAGE } from '../../../config/village';
import { VISUAL } from '../../../config/visualTuning';
import { propShadowUniforms } from '../../mapProps/config/mapPropShadowUniforms';
import { hash01 } from '../sim/geometry';
import { uVillageTime } from './villageUniforms';

export interface SmokeRenderer {
  readonly mesh: InstancedMesh;
  addChimney: (id: number, x: number, y: number, z: number) => void;
  /** 0 (cold) .. 1 (cooking). */
  setStrength: (id: number, strength: number) => void;
  dispose: () => void;
}

function dynamicAttribute(count: number): InstancedBufferAttribute {
  const attr = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
  attr.setUsage(DynamicDrawUsage);
  return attr;
}

export function createSmokeRenderer(): SmokeRenderer {
  const SMOKE = VISUAL.village.SMOKE;
  const puffs = SMOKE.PUFFS_PER_CHIMNEY;
  const capacity = VISUAL.village.CAPACITY.CHIMNEYS * puffs;
  const emit = dynamicAttribute(capacity); // chimney top x, y, z + seed
  const state = dynamicAttribute(capacity); // strength, puff slot 0..1

  const iEmit = attribute('iEmit', 'vec4');
  const iState = attribute('iState', 'vec4');
  const age = fract(uVillageTime.div(SMOKE.PUFF_PERIOD_S).add(iState.y).add(iEmit.w));
  const wind = vec3(0.8, 0, 0.35).mul(age.mul(age).mul(SMOKE.DRIFT_M));
  const wobble = vec3(
    sin(age.mul(7).add(iEmit.w.mul(40))),
    0,
    sin(age.mul(5).add(iEmit.w.mul(90))),
  ).mul(age.mul(0.35));
  const size = mix(float(0.45), float(2.1), age);
  const opacity = iState.x
    .mul(float(1).sub(age))
    .mul(smoothstep(float(0), float(0.12), age))
    .mul(0.45);
  const { uDaylight, uNightSkyDaylight } = propShadowUniforms;
  const day = smoothstep(uNightSkyDaylight, float(1), uDaylight);

  const material = new SpriteNodeMaterial();
  material.name = 'village_smoke';
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.positionNode = iEmit.xyz
    .add(vec3(0, age.mul(SMOKE.RISE_M), 0))
    .add(wind)
    .add(wobble);
  material.scaleNode = vec3(size, size, 1);
  material.colorNode = mix(vec3(0.1, 0.1, 0.12), vec3(0.78, 0.78, 0.8), day);
  material.opacityNode = opacity;

  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute('iEmit', emit);
  geometry.setAttribute('iState', state);
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = 'villageSmoke';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  const slotOf = new Map<number, number>();

  return {
    mesh,
    addChimney: (id, x, y, z) => {
      if (slotOf.has(id) || slotOf.size * puffs + puffs > capacity) return;
      const slot = slotOf.size;
      slotOf.set(id, slot);
      const seed = hash01(id + 3);
      for (let k = 0; k < puffs; k++) {
        const i = slot * puffs + k;
        emit.setXYZW(i, x, y, z, seed);
        state.setXYZW(i, VILLAGE.SMOKE.IDLE, k / puffs, 0, 0);
      }
      mesh.count = slotOf.size * puffs;
      emit.needsUpdate = true;
      state.needsUpdate = true;
    },
    setStrength: (id, strength) => {
      const slot = slotOf.get(id);
      if (slot === undefined) return;
      for (let k = 0; k < puffs; k++) state.setX(slot * puffs + k, strength);
      state.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      slotOf.clear();
    },
  };
}
