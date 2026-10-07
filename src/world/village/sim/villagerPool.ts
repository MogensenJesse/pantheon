// src/world/village/sim/villagerPool.ts — allocation and spawning for the villager struct-of-arrays
import { VILLAGE } from '../../../config/village.ts';
import { Anim, Mode, Role, type RoleId, type Villagers } from './villageTypes.ts';

export function createVillagerPool(): Villagers {
  const n = VILLAGE.VILLAGERS.MAX;
  return {
    count: 0,
    x: new Float32Array(n),
    z: new Float32Array(n),
    prevX: new Float32Array(n),
    prevZ: new Float32Array(n),
    yaw: new Float32Array(n),
    stride: new Float32Array(n),
    anim: new Uint8Array(n),
    animPrev: new Uint8Array(n),
    animBlend: new Float32Array(n).fill(1),
    indoors: new Uint8Array(n),
    variant: new Uint8Array(n),
    offset: new Float32Array(n),
    piety: new Float32Array(n),
    nightOwl: new Uint8Array(n),
    role: new Uint8Array(n),
    home: new Int32Array(n),
    activity: new Uint8Array(n),
    mode: new Uint8Array(n),
    target: new Int32Array(n),
    slot: new Int8Array(n).fill(-1),
    timer: new Float32Array(n),
    think: new Float32Array(n),
    destX: new Float32Array(n),
    destZ: new Float32Array(n),
    affinity: new Float32Array(n).fill(VILLAGE.PATHS.AFFINITY.FOLLOWER),
    waypoints: new Float32Array(n * VILLAGE.PATH.MAX_WAYPOINTS * 2),
    pathLen: new Uint8Array(n),
    pathCur: new Uint8Array(n),
  };
}

/** Add a villager standing at (x, z); returns its index, or -1 when the pool is full. */
export function spawnVillager(
  pool: Villagers,
  rng: () => number,
  x: number,
  z: number,
  role: RoleId,
  home: number,
): number {
  if (pool.count >= VILLAGE.VILLAGERS.MAX) return -1;
  const i = pool.count++;
  const { VIGIL } = VILLAGE.VILLAGERS;
  const owlRoll = rng();
  let workOwls = 0;
  for (let k = 0; k < pool.count; k++) {
    if (pool.role[k] === Role.Builder && pool.nightOwl[k] === 1) workOwls++;
  }
  pool.x[i] = x;
  pool.z[i] = z;
  pool.prevX[i] = x;
  pool.prevZ[i] = z;
  pool.yaw[i] = rng() * Math.PI * 2;
  pool.stride[i] = rng();
  pool.anim[i] = Anim.Idle;
  pool.animPrev[i] = Anim.Idle;
  pool.animBlend[i] = 1;
  pool.indoors[i] = 0;
  pool.variant[i] = Math.floor(rng() * 6);
  pool.offset[i] = (rng() - 0.5) * 0.04;
  pool.piety[i] = rng();
  if (role === Role.Builder) {
    pool.nightOwl[i] = workOwls === 0 || owlRoll < VIGIL.BUILDER_WORK_SHARE ? 1 : 0;
  } else {
    pool.nightOwl[i] = owlRoll < VIGIL.PRAY_SHARE ? 2 : 0;
  }
  pool.role[i] = role;
  pool.home[i] = home;
  pool.activity[i] = 0;
  pool.mode[i] = Mode.Free;
  pool.target[i] = 0;
  pool.slot[i] = -1;
  pool.timer[i] = 0;
  pool.think[i] = rng() * VILLAGE.VILLAGERS.THINK_S;
  pool.pathLen[i] = 0;
  pool.pathCur[i] = 0;
  return i;
}
