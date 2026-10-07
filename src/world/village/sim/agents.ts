// src/world/village/sim/agents.ts — villager behaviour: routines, destinations, walking, working
import { VILLAGE } from '../../../config/village.ts';
import type { VillageAssetMeta } from '../model/assetKeys.ts';
import {
  Activity,
  Anim,
  type AnimId,
  type Building,
  type Field,
  Mode,
  Role,
  type Villagers,
} from '../model/types.ts';
import { localToWorld, turnToward } from './geometry.ts';
import type { Pathfinder } from './pathfind.ts';
import { scheduledActivity } from './routine.ts';

export interface AgentInputs {
  /** Day-cycle phase 0..1 (0.25 sunrise, 0.75 sunset). */
  dayPhase: number;
  /** Phase 0: the sun never rises, so some people keep vigil at night. */
  vigil: boolean;
  /** Orb presence 0..1, which speeds builders up. */
  boost01: number;
}

export interface AgentStats {
  asleep: number;
  praying: number;
  working: number;
  wandering: number;
  walking: number;
  pathQueue: number;
}

export interface AgentsOptions {
  pool: Villagers;
  pathfinder: Pathfinder;
  rng: () => number;
  /** Live building list (the sim appends to it). */
  buildings: readonly Building[];
  /** Live field list (the sim appends to it). */
  fields: readonly Field[];
  metaOf: (type: Building['type']) => Pick<VillageAssetMeta, 'door' | 'workSlots'>;
  /** Builder-seconds delivered to a site. */
  onWork: (site: Building, seconds: number) => void;
  /** A villager walked `distance` m and now stands at (x, z). */
  onWalk?: (x: number, z: number, distance: number) => void;
}

export interface Agents {
  /** Once per fixed update: remember positions for render interpolation. */
  beginStep: () => void;
  update: (dt: number, inputs: AgentInputs) => void;
  stats: () => AgentStats;
}

const { VILLAGERS: V, PATH } = VILLAGE;
const TURN_RATE = 8;
/** Each farmer already at a field counts like this many extra metres of walking. */
const FIELD_LOAD_COST_M = 12;

export function createAgents(options: AgentsOptions): Agents {
  const { pool, pathfinder, rng, buildings, fields, metaOf, onWork, onWalk } = options;
  const byId = new Map<number, Building>();
  const syncIndex = () => {
    if (byId.size === buildings.length) return;
    for (const b of buildings) byId.set(b.id, b);
  };
  /** Work-slot owners per site: villager index + 1, 0 = free. */
  const slotOwners = new Map<number, Int32Array>();
  /** Villagers waiting for a path, oldest first from `queueHead` (no O(n) shift per request). */
  const pathQueue: number[] = [];
  let queueHead = 0;
  let inputs: AgentInputs = { dayPhase: 0.5, vigil: false, boost01: 0 };

  const temple = () => buildings.find((b) => b.type === 'temple');
  const buildingOf = (id: number) => {
    syncIndex();
    return byId.get(id);
  };

  const setAnim = (i: number, anim: AnimId) => {
    if (pool.anim[i] === anim) return;
    pool.animPrev[i] = pool.anim[i]!;
    pool.anim[i] = anim;
    pool.animBlend[i] = 0;
  };

  const doorWorld = (b: Building, out = 0): [number, number] => {
    const [dx, dz] = metaOf(b.type).door;
    return localToWorld(b, dx, dz + out);
  };

  const releaseSlot = (i: number) => {
    const slot = pool.slot[i]!;
    if (slot >= 0) {
      const owners = slotOwners.get(pool.target[i]!);
      if (owners) owners[slot] = 0;
    }
    pool.slot[i] = -1;
  };

  const requestPath = (i: number, gx: number, gz: number) => {
    // Each journey is a path follower or a cutter: most traffic keeps to the paths, not all of it.
    const { AFFINITY } = VILLAGE.PATHS;
    pool.affinity[i] = rng() < AFFINITY.FOLLOWER_SHARE ? AFFINITY.FOLLOWER : AFFINITY.CUTTER;
    pool.destX[i] = gx;
    pool.destZ[i] = gz;
    pool.mode[i] = Mode.Pending;
    pool.pathLen[i] = 0;
    pool.pathCur[i] = 0;
    pathQueue.push(i);
  };

  /** Nearest open site with a free work slot; claims it and returns the slot's world position. */
  const claimSlot = (i: number): [number, number] | null => {
    let best: Building | null = null;
    let bestSlot = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (const site of buildings) {
      if (site.stage >= 2) continue;
      const owners = slotOwners.get(site.id) ?? new Int32Array(VILLAGE.CONSTRUCTION.SLOTS_PER_SITE);
      slotOwners.set(site.id, owners);
      const free = owners.indexOf(0);
      if (free < 0) continue;
      const d = (site.x - pool.x[i]!) ** 2 + (site.z - pool.z[i]!) ** 2;
      if (d < bestD) {
        bestD = d;
        best = site;
        bestSlot = free;
      }
    }
    if (!best) return null;
    slotOwners.get(best.id)![bestSlot] = i + 1;
    pool.target[i] = best.id;
    pool.slot[i] = bestSlot;
    const slots = metaOf(best.type).workSlots;
    const [lx, lz] = slots[bestSlot % slots.length]!;
    return localToWorld(best, lx, lz);
  };

  /** A spot just outside the nearest field's rows, where a farmer stands to tend it. */
  const claimField = (i: number): [number, number] | null => {
    let best: Field | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const field of fields) {
      let load = 0;
      for (let k = 0; k < pool.count; k++) {
        if (pool.target[k] === -field.id && pool.slot[k]! >= 0) load++;
      }
      // Distance plus a penalty per farmer already there, so the fields share the work.
      const cost =
        Math.hypot(field.x - pool.x[i]!, field.z - pool.z[i]!) +
        load * FIELD_LOAD_COST_M +
        rng() * 5;
      if (cost < bestCost) {
        bestCost = cost;
        best = field;
      }
    }
    if (!best) return null;
    pool.target[i] = -best.id;
    pool.slot[i] = 0;
    const edge = 1.3;
    const along = rng() * 2 - 1;
    const side = Math.floor(rng() * 4);
    const [lx, lz] =
      side === 0
        ? [along * best.halfW, best.halfD + edge]
        : side === 1
          ? [along * best.halfW, -best.halfD - edge]
          : side === 2
            ? [best.halfW + edge, along * best.halfD]
            : [-best.halfW - edge, along * best.halfD];
    return localToWorld(best, lx, lz);
  };

  const prayerSpot = (): [number, number] | null => {
    const t = temple();
    if (!t) return null;
    const [, doorZ] = metaOf(t.type).door;
    return localToWorld(t, (rng() - 0.5) * 7, doorZ + 2.2 + rng() * 3);
  };

  const wanderSpot = (fromX: number, fromZ: number): [number, number] | null => {
    const anchor = buildings[Math.floor(rng() * buildings.length)];
    const here = pathfinder.regionOf(fromX, fromZ);
    if (!anchor) return null;
    // Most strolls head for a spot on or beside a path; the rest go anywhere walkable.
    const wantPath = rng() < VILLAGE.PATHS.WANDER_ON_PATH_SHARE;
    for (const onPathOnly of wantPath ? [true, false] : [false]) {
      for (let attempt = 0; attempt < (onPathOnly ? 10 : 6); attempt++) {
        const angle = rng() * Math.PI * 2;
        const r = 4 + rng() * (V.WANDER.RADIUS_M * 0.35);
        const x = anchor.x + Math.sin(angle) * r;
        const z = anchor.z + Math.cos(angle) * r;
        if (!pathfinder.isWalkable(x, z)) continue;
        if (pathfinder.regionOf(x, z) !== here) continue;
        if (onPathOnly && pathfinder.pathinessAt(x, z) < 0.5) continue;
        return [x, z];
      }
    }
    return null;
  };

  const startWander = (i: number): boolean => {
    const spot = wanderSpot(pool.x[i]!, pool.z[i]!);
    if (!spot) return false;
    pool.target[i] = 0;
    requestPath(i, spot[0], spot[1]);
    return true;
  };

  const goHome = (i: number): boolean => {
    const home = buildingOf(pool.home[i]!) ?? temple();
    if (!home) return false;
    pool.target[i] = home.id;
    const [x, z] = doorWorld(home, PATH.DOORSTEP_M);
    requestPath(i, x, z);
    return true;
  };

  const rest = (i: number, seconds: number) => {
    pool.mode[i] = Mode.Acting;
    pool.timer[i] = seconds;
    setAnim(i, Anim.Idle);
  };

  /** Start doing `desired`: walk to where it happens (or stay put when already in bed). */
  const begin = (i: number, desired: number) => {
    releaseSlot(i);
    if (pool.indoors[i]) {
      if (desired === Activity.Sleep) {
        pool.activity[i] = desired;
        rest(i, Number.POSITIVE_INFINITY);
        return;
      }
      const home = buildingOf(pool.target[i]!);
      if (home) {
        const [x, z] = doorWorld(home, PATH.DOORSTEP_M);
        pool.x[i] = x;
        pool.z[i] = z;
        pool.prevX[i] = x;
        pool.prevZ[i] = z;
      }
      pool.indoors[i] = 0;
    }
    pool.activity[i] = desired;
    let ok = false;
    if (desired === Activity.Sleep) {
      ok = goHome(i);
    } else if (desired === Activity.Pray) {
      const spot = prayerSpot();
      if (spot) {
        pool.target[i] = temple()?.id ?? 0;
        requestPath(i, spot[0], spot[1]);
        ok = true;
      }
    } else if (desired === Activity.Work) {
      const spot = pool.role[i] === Role.Farmer ? claimField(i) : claimSlot(i);
      if (spot) {
        requestPath(i, spot[0], spot[1]);
        ok = true;
      } else {
        // No open site: stroll about; the activity stays Work so the next try comes soon.
        ok = startWander(i);
      }
    } else {
      ok = startWander(i);
    }
    if (!ok) rest(i, 3);
  };

  const think = (i: number) => {
    const desired = scheduledActivity(
      {
        role: pool.role[i]!,
        piety: pool.piety[i]!,
        nightOwl: pool.nightOwl[i]!,
        offset: pool.offset[i]!,
      },
      inputs.dayPhase,
      inputs.vigil,
    );
    if (
      pool.mode[i] === Mode.Acting &&
      pool.activity[i] === Activity.Work &&
      pool.slot[i]! >= 0 &&
      pool.target[i]! > 0
    ) {
      const site = buildingOf(pool.target[i]!);
      if (!site || site.stage >= 2) {
        releaseSlot(i);
        pool.mode[i] = Mode.Free;
      }
    }
    if (pool.mode[i] === Mode.Entering) return;
    if (pool.mode[i] === Mode.Free || desired !== pool.activity[i]) begin(i, desired);
  };

  const faceToward = (i: number, x: number, z: number) => {
    pool.yaw[i] = Math.atan2(x - pool.x[i]!, z - pool.z[i]!);
  };

  const arrive = (i: number) => {
    const activity = pool.activity[i]!;
    if (activity === Activity.Sleep) {
      const home = buildingOf(pool.target[i]!);
      if (!home) return rest(i, 3);
      const [x, z] = doorWorld(home);
      const base = i * PATH.MAX_WAYPOINTS * 2;
      pool.waypoints[base] = x;
      pool.waypoints[base + 1] = z;
      pool.pathLen[i] = 1;
      pool.pathCur[i] = 0;
      pool.mode[i] = Mode.Entering;
      return;
    }
    if (activity === Activity.Pray) {
      const t = temple();
      if (t) faceToward(i, t.x, t.z);
      pool.mode[i] = Mode.Acting;
      pool.timer[i] = V.PRAY_S.MIN + rng() * (V.PRAY_S.MAX - V.PRAY_S.MIN);
      setAnim(i, Anim.Pray);
      return;
    }
    if (activity === Activity.Work && pool.slot[i]! >= 0) {
      const site =
        pool.target[i]! > 0
          ? buildingOf(pool.target[i]!)
          : fields.find((f) => f.id === -pool.target[i]!);
      if (site) faceToward(i, site.x, site.z);
      pool.mode[i] = Mode.Acting;
      pool.timer[i] = Number.POSITIVE_INFINITY;
      setAnim(i, Anim.Work);
      return;
    }
    rest(i, V.WANDER.PAUSE_MIN_S + rng() * (V.WANDER.PAUSE_MAX_S - V.WANDER.PAUSE_MIN_S));
  };

  const finishPath = (i: number) => {
    if (pool.mode[i] === Mode.Entering) {
      pool.indoors[i] = 1;
      rest(i, Number.POSITIVE_INFINITY);
      return;
    }
    // A path cut short at the waypoint cap resumes from where it ended.
    const truncated = pool.pathLen[i] === PATH.MAX_WAYPOINTS;
    const left = Math.hypot(pool.destX[i]! - pool.x[i]!, pool.destZ[i]! - pool.z[i]!);
    if (truncated && left > V.ARRIVE_M * 2) requestPath(i, pool.destX[i]!, pool.destZ[i]!);
    else arrive(i);
  };

  const move = (i: number, dt: number) => {
    const mode = pool.mode[i];
    if (mode !== Mode.Walking && mode !== Mode.Entering) return;
    const base = i * PATH.MAX_WAYPOINTS * 2;
    const len = pool.pathLen[i]!;
    let cur = pool.pathCur[i]!;
    const carrying = pool.role[i] === Role.Builder && pool.activity[i] === Activity.Work;
    let budget = (carrying ? V.CARRY_SPEED_MPS : V.WALK_SPEED_MPS) * dt;
    const startX = pool.x[i]!;
    const startZ = pool.z[i]!;
    setAnim(i, carrying ? Anim.Carry : Anim.Walk);
    while (budget > 1e-4 && cur < len) {
      const tx = pool.waypoints[base + cur * 2]!;
      const tz = pool.waypoints[base + cur * 2 + 1]!;
      const dx = tx - pool.x[i]!;
      const dz = tz - pool.z[i]!;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) pool.yaw[i] = turnToward(pool.yaw[i]!, Math.atan2(dx, dz), dt * TURN_RATE);
      if (d <= budget) {
        pool.x[i] = tx;
        pool.z[i] = tz;
        budget -= d;
        pool.stride[i] += d / V.STRIDE_M;
        cur++;
      } else {
        pool.x[i] += (dx / d) * budget;
        pool.z[i] += (dz / d) * budget;
        pool.stride[i] += budget / V.STRIDE_M;
        budget = 0;
      }
    }
    pool.stride[i] = pool.stride[i]! % 1;
    const moved = Math.hypot(pool.x[i]! - startX, pool.z[i]! - startZ);
    if (moved > 0) onWalk?.(pool.x[i]!, pool.z[i]!, moved);
    pool.pathCur[i] = cur;
    if (cur >= len) finishPath(i);
  };

  const act = (i: number, dt: number) => {
    if (pool.mode[i] === Mode.Pending) setAnim(i, Anim.Idle);
    if (pool.mode[i] !== Mode.Acting) return;
    if (pool.activity[i] === Activity.Work && pool.slot[i]! >= 0) {
      if (pool.target[i]! < 0) {
        const field = fields.find((f) => f.id === -pool.target[i]!);
        if (field) field.tenders++;
        return;
      }
      const site = buildingOf(pool.target[i]!);
      if (site && site.stage < 2) {
        const { BUILDER_RATE, PRESENCE_WORK_BOOST } = VILLAGE.CONSTRUCTION;
        onWork(site, BUILDER_RATE * (1 + PRESENCE_WORK_BOOST * inputs.boost01) * dt);
      }
      return;
    }
    pool.timer[i] = pool.timer[i]! - dt;
    if (pool.timer[i]! <= 0) pool.mode[i] = Mode.Free;
  };

  const processPaths = () => {
    let budget = PATH.REQUESTS_PER_STEP;
    while (budget > 0 && queueHead < pathQueue.length) {
      const i = pathQueue[queueHead++]!;
      if (pool.mode[i] !== Mode.Pending) continue;
      budget--;
      const n = pathfinder.find(
        pool.x[i]!,
        pool.z[i]!,
        pool.destX[i]!,
        pool.destZ[i]!,
        pool.waypoints,
        i * PATH.MAX_WAYPOINTS * 2,
        PATH.MAX_WAYPOINTS,
        pool.affinity[i],
      );
      if (n === 0) {
        releaseSlot(i);
        rest(i, 3);
      } else {
        pool.pathLen[i] = n;
        pool.pathCur[i] = 0;
        pool.mode[i] = Mode.Walking;
      }
    }
    if (queueHead === pathQueue.length) {
      pathQueue.length = 0;
      queueHead = 0;
    }
  };

  return {
    beginStep: () => {
      for (let i = 0; i < pool.count; i++) {
        pool.prevX[i] = pool.x[i]!;
        pool.prevZ[i] = pool.z[i]!;
      }
    },
    update: (dt, next) => {
      inputs = next;
      processPaths();
      for (let i = 0; i < pool.count; i++) {
        pool.think[i] = pool.think[i]! - dt;
        if (pool.think[i]! <= 0) {
          pool.think[i] = V.THINK_S * (0.7 + 0.6 * rng());
          think(i);
        }
        move(i, dt);
        act(i, dt);
        pool.animBlend[i] = Math.min(1, pool.animBlend[i]! + dt * 4);
      }
    },
    stats: () => {
      const s: AgentStats = {
        asleep: 0,
        praying: 0,
        working: 0,
        wandering: 0,
        walking: 0,
        pathQueue: pathQueue.length - queueHead,
      };
      for (let i = 0; i < pool.count; i++) {
        const a = pool.activity[i];
        if (a === Activity.Sleep) s.asleep++;
        else if (a === Activity.Pray) s.praying++;
        else if (a === Activity.Work) s.working++;
        else s.wandering++;
        if (pool.mode[i] === Mode.Walking) s.walking++;
      }
      return s;
    },
  };
}
