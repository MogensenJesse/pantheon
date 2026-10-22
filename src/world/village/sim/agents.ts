// src/world/village/sim/agents.ts — villager behaviour: routines, destinations, walking, working
import { VILLAGE } from '../../../config/village.ts';
import {
  Activity,
  Anim,
  type AnimId,
  Mode,
  Role,
  WORK_ANIM,
  WORK_SPOT_ID_BASE,
} from '../model/types.ts';
import { advanceAlongPath } from './agentMotion.ts';
import { createAgentTargets } from './agentTargets.ts';
import type { AgentInputs, AgentStats, Agents, AgentsOptions } from './agentTypes.ts';
import { isOpenSite } from './construction.ts';
import { createCrew } from './crew.ts';
import { clearedDone, Done, mealAt, mealRoundAt, ownPhase, scheduledActivity } from './routine.ts';
import { removeVillager } from './villagerPool.ts';

export type {
  AgentInputs,
  AgentStats,
  Agents,
  AgentsOptions,
  AgentsState,
} from './agentTypes.ts';

const { VILLAGERS: V, PATH } = VILLAGE;
const WEAK_MUL = VILLAGE.HUNGER.WEAK_MUL;
/** Roles that gather food and so keep working when weak (the rest cannot work at all). */
const isGatherer = (role: number) => role === Role.Farmer || role === Role.Fisherman;

export function createAgents(options: AgentsOptions): Agents {
  const {
    pool,
    pathfinder,
    rng,
    buildings,
    fields,
    metaOf,
    spots,
    onWork,
    onWalk,
    onFish,
    onChop,
    onEat,
    isStanding,
    graveSite,
    builderRateMul,
    workBoost,
    remoteSites,
    onRemoteWork,
  } = options;
  const targets = createAgentTargets({
    pool,
    pathfinder,
    rng,
    buildings,
    fields,
    metaOf,
    spots,
    isStanding,
    graveSite,
  });
  const {
    temple,
    buildingOf,
    doorWorld,
    releaseSlot,
    claimSlot,
    claimField,
    claimTree,
    claimShore,
    focusOf,
    spotOf,
    prayerSpot,
    wanderSpot,
    plazaSpot,
    mournSpot,
    rebuildClaims,
  } = targets;
  /** Villagers waiting for a path, oldest first from `queueHead` (no O(n) shift per request). */
  const pathQueue: number[] = [];
  let queueHead = 0;
  let inputs: AgentInputs = {
    dayPhase: 0.5,
    vigil: false,
    boost01: 0,
    weak: false,
    rain01: 0,
    mourning: false,
    gathering: false,
  };
  /** Seconds each villager still has to stand and look at the orb, and what they look at. */
  const noticeLeft = new Float32Array(V.MAX);
  const noticeX = new Float32Array(V.MAX);
  const noticeZ = new Float32Array(V.MAX);

  const setAnim = (i: number, anim: AnimId) => {
    if (pool.anim[i] === anim) return;
    pool.animPrev[i] = pool.anim[i]!;
    pool.anim[i] = anim;
    pool.animBlend[i] = 0;
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

  const startWander = (i: number): boolean => {
    const spot = wanderSpot(pool.x[i]!, pool.z[i]!);
    if (!spot) return false;
    pool.target[i] = 0;
    requestPath(i, spot[0], spot[1]);
    return true;
  };

  /** Idlers stroll about the plaza; if no spot can be reached, anywhere. */
  const startPlaza = (i: number): boolean => {
    const spot = plazaSpot(pool.x[i]!, pool.z[i]!);
    if (!spot) return startWander(i);
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

  /** Sit down to the meal that is due: the larder gives its portion, and it is done for this window. */
  const startMeal = (i: number) => {
    const p = ownPhase(inputs.dayPhase, pool.offset[i]!);
    pool.done[i] = pool.done[i]! | mealAt(p);
    onEat(i, mealRoundAt(p));
    rest(i, V.MEAL.EAT_S.MIN + rng() * (V.MEAL.EAT_S.MAX - V.MEAL.EAT_S.MIN));
  };

  /** Step out of the house onto the doorstep (a villager indoors is inside the building they last targeted). */
  const leaveHome = (i: number) => {
    if (!pool.indoors[i]) return;
    const home = buildingOf(pool.target[i]!);
    if (home) {
      const [x, z] = doorWorld(home, PATH.DOORSTEP_M);
      pool.x[i] = x;
      pool.z[i] = z;
      pool.prevX[i] = x;
      pool.prevZ[i] = z;
    }
    pool.indoors[i] = 0;
  };

  /** Start doing `desired`: walk to where it happens (or stay put when already in bed). */
  const begin = (i: number, desired: number) => {
    releaseSlot(i);
    if (pool.indoors[i]) {
      if (desired === Activity.Sleep || desired === Activity.Shelter) {
        pool.activity[i] = desired;
        rest(i, Number.POSITIVE_INFINITY);
        return;
      }
      // Already at home: the meal is eaten where they are.
      if (desired === Activity.Eat && pool.target[i] === pool.home[i]) {
        pool.activity[i] = desired;
        startMeal(i);
        return;
      }
      leaveHome(i);
    }
    pool.activity[i] = desired;
    let ok = false;
    if (desired === Activity.Sleep || desired === Activity.Shelter) {
      ok = goHome(i);
    } else if (desired === Activity.Eat) {
      const home = buildingOf(pool.home[i]!);
      if (home && Math.hypot(home.x - pool.x[i]!, home.z - pool.z[i]!) > V.MEAL.HOME_MAX_M) {
        // Too far from home: a packed meal where they stand.
        startMeal(i);
        return;
      }
      if (home) {
        ok = goHome(i);
      } else {
        // No home: the meal is on the plaza.
        const spot = plazaSpot(pool.x[i]!, pool.z[i]!);
        if (spot) {
          pool.target[i] = 0;
          requestPath(i, spot[0], spot[1]);
          ok = true;
        }
      }
    } else if (desired === Activity.Mourn) {
      // To the graves; with no way in, to the temple like the other priests.
      const spot = mournSpot(pool.x[i]!, pool.z[i]!) ?? prayerSpot();
      if (spot) {
        pool.target[i] = 0;
        requestPath(i, spot[0], spot[1]);
        ok = true;
      }
    } else if (desired === Activity.Pray) {
      const spot = prayerSpot();
      if (spot) {
        pool.target[i] = temple()?.id ?? 0;
        requestPath(i, spot[0], spot[1]);
        ok = true;
      }
    } else if (desired === Activity.Work) {
      const role = pool.role[i];
      const spot =
        role === Role.Farmer
          ? claimField(i)
          : role === Role.Woodcutter
            ? claimTree(i)
            : role === Role.Fisherman
              ? claimShore(i)
              : claimSlot(i);
      if (spot) {
        requestPath(i, spot[0], spot[1]);
        ok = true;
      } else {
        // No open site: stroll about; the activity stays Work so the next try comes soon.
        ok = startWander(i);
      }
    } else {
      ok = pool.role[i] === Role.Idler ? startPlaza(i) : startWander(i);
    }
    if (!ok) rest(i, 3);
  };

  const think = (i: number) => {
    pool.done[i] = clearedDone(pool.done[i]!, ownPhase(inputs.dayPhase, pool.offset[i]!));
    const desired = scheduledActivity(
      {
        role: pool.role[i]!,
        piety: pool.piety[i]!,
        nightOwl: pool.nightOwl[i]!,
        offset: pool.offset[i]!,
        done: pool.done[i]!,
      },
      inputs.dayPhase,
      inputs.vigil,
      {
        shelter:
          inputs.rain01 >= V.SHELTER.RAIN_ON ||
          (pool.activity[i] === Activity.Shelter && inputs.rain01 >= V.SHELTER.RAIN_OFF),
        mourning: inputs.mourning,
        gathering: inputs.gathering,
      },
    );
    if (pool.crew[i]! > 0) return crew.think(i, desired);
    if (
      pool.mode[i] === Mode.Acting &&
      pool.activity[i] === Activity.Work &&
      pool.slot[i]! >= 0 &&
      pool.target[i]! > 0
    ) {
      const site = buildingOf(pool.target[i]!);
      if (!site || !isOpenSite(site)) {
        releaseSlot(i);
        pool.mode[i] = Mode.Free;
      }
    }
    if (pool.mode[i] === Mode.Entering) return;
    // A meal or the mourning, once begun, is seen through.
    const now = pool.activity[i];
    if ((now === Activity.Eat || now === Activity.Mourn) && pool.mode[i] !== Mode.Free) return;
    if (pool.mode[i] === Mode.Free || desired !== pool.activity[i]) begin(i, desired);
  };

  const faceToward = (i: number, x: number, z: number) => {
    pool.yaw[i] = Math.atan2(x - pool.x[i]!, z - pool.z[i]!);
  };

  const crew = createCrew({
    pool,
    sites: remoteSites,
    requestPath,
    rest,
    startMeal,
    setAnim,
    faceToward,
    leaveHome,
    releaseSlot,
    weak: () => inputs.weak,
    workRate: (i) => VILLAGE.CONSTRUCTION.BUILDER_RATE * builderRateMul() * workBoost(i),
    onWork: onRemoteWork,
  });

  const arrive = (i: number) => {
    const activity = pool.activity[i]!;
    if (activity === Activity.Eat && pool.target[i] === 0) return startMeal(i);
    if (activity === Activity.Mourn) {
      const grave = graveSite();
      const t = temple();
      if (grave) faceToward(i, grave.x, grave.z);
      else if (t) faceToward(i, t.x, t.z);
      pool.done[i] = pool.done[i]! | Done.Mourned;
      pool.mode[i] = Mode.Acting;
      pool.timer[i] = V.MOURN_S;
      setAnim(i, Anim.Pray);
      return;
    }
    if (activity === Activity.Sleep || activity === Activity.Shelter || activity === Activity.Eat) {
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
      const focus = focusOf(i);
      if (focus) faceToward(i, focus[0], focus[1]);
      pool.mode[i] = Mode.Acting;
      pool.timer[i] = Number.POSITIVE_INFINITY;
      setAnim(i, WORK_ANIM[pool.role[i]!] ?? Anim.Work);
      return;
    }
    rest(i, V.WANDER.PAUSE_MIN_S + rng() * (V.WANDER.PAUSE_MAX_S - V.WANDER.PAUSE_MIN_S));
  };

  const finishPath = (i: number) => {
    if (pool.mode[i] === Mode.Entering) {
      pool.indoors[i] = 1;
      if (pool.activity[i] === Activity.Eat) startMeal(i);
      else rest(i, Number.POSITIVE_INFINITY);
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
    const carrying = pool.role[i] === Role.Builder && pool.activity[i] === Activity.Work;
    setAnim(i, carrying ? Anim.Carry : Anim.Walk);
    const speed = (carrying ? V.CARRY_SPEED_MPS : V.WALK_SPEED_MPS) * (inputs.weak ? WEAK_MUL : 1);
    if (advanceAlongPath(pool, i, speed, dt, onWalk)) {
      if (pool.crew[i]! > 0) crew.pathDone(i);
      else finishPath(i);
    }
  };

  const act = (i: number, dt: number) => {
    if (pool.mode[i] === Mode.Pending) setAnim(i, Anim.Idle);
    if (pool.mode[i] !== Mode.Acting) return;
    if (pool.crew[i]! > 0 && crew.act(i, dt)) return;
    if (pool.activity[i] === Activity.Work && pool.slot[i]! >= 0) {
      const role = pool.role[i]!;
      const weak = inputs.weak;
      // A weak builder or woodcutter stands about without working; those who gather food carry on (a
      // village whose gatherers stopped could never feed itself back to health).
      const working = !weak || isGatherer(role);
      setAnim(i, working ? (WORK_ANIM[role] ?? Anim.Work) : Anim.Idle);
      if (pool.target[i]! <= -WORK_SPOT_ID_BASE) {
        const spot = spotOf(i);
        if (role === Role.Woodcutter && spot?.tree !== undefined) {
          // A tree somebody else (DEV) felled meanwhile: look for another.
          if (!isStanding(spot.tree)) {
            releaseSlot(i);
            pool.mode[i] = Mode.Free;
          } else if (working) {
            const dx = spot.faceX - spot.x;
            const dz = spot.faceZ - spot.z;
            const len = Math.hypot(dx, dz) || 1;
            // The last hit lands: the tree is down and the woodcutter is free to find the next one.
            if (onChop(spot.tree, dt * workBoost(i), dx / len, dz / len)) {
              releaseSlot(i);
              pool.mode[i] = Mode.Free;
            }
          }
        } else if (working) {
          // Fishing: food comes in while they stand at the shore.
          onFish(VILLAGE.ECONOMY.FISH_PER_SEC * dt * workBoost(i));
        }
        return;
      }
      if (pool.target[i]! < 0) {
        const field = fields.find((f) => f.id === -pool.target[i]!);
        if (field) field.tenders += workBoost(i);
        return;
      }
      const site = buildingOf(pool.target[i]!);
      if (site && isOpenSite(site) && working) {
        const { BUILDER_RATE, PRESENCE_WORK_BOOST } = VILLAGE.CONSTRUCTION;
        onWork(
          site,
          BUILDER_RATE *
            (1 + PRESENCE_WORK_BOOST * inputs.boost01) *
            builderRateMul() *
            workBoost(i) *
            dt,
        );
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
        if (pool.dying[i]! > 0) {
          pool.dying[i] = pool.dying[i]! + dt;
          setAnim(i, Anim.Collapse);
          pool.animBlend[i] = Math.min(1, pool.animBlend[i]! + dt * 4);
          continue;
        }
        if (noticeLeft[i]! > 0) {
          noticeLeft[i] = noticeLeft[i]! - dt;
          faceToward(i, noticeX[i]!, noticeZ[i]!);
          setAnim(i, Anim.Idle);
          pool.animBlend[i] = Math.min(1, pool.animBlend[i]! + dt * 4);
          continue;
        }
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
    recruitCrew: crew.recruit,
    crewSize: crew.size,
    notice: (villager, x, z, seconds) => {
      if (villager < 0 || villager >= pool.count || pool.indoors[villager]) return false;
      if (pool.dying[villager]! > 0) return false;
      if (noticeLeft[villager]! <= 0) setAnim(villager, Anim.Idle);
      noticeLeft[villager] = Math.max(noticeLeft[villager]!, seconds);
      noticeX[villager] = x;
      noticeZ[villager] = z;
      faceToward(villager, x, z);
      return true;
    },
    startDying: (villager) => {
      if (villager < 0 || villager >= pool.count || pool.dying[villager]! > 0) return;
      releaseSlot(villager);
      noticeLeft[villager] = 0;
      pool.dying[villager] = 1e-3;
      // Not walking, not waiting for a path: the update loop leaves a dying villager alone.
      pool.mode[villager] = Mode.Acting;
      pool.timer[villager] = Number.POSITIVE_INFINITY;
    },
    remove: (villager) => {
      releaseSlot(villager);
      const moved = removeVillager(pool, villager);
      for (let q = queueHead; q < pathQueue.length; q++) {
        if (pathQueue[q] === villager) pathQueue[q] = -1;
        else if (moved >= 0 && pathQueue[q] === moved) pathQueue[q] = villager;
      }
      if (moved >= 0) {
        noticeLeft[villager] = noticeLeft[moved]!;
        noticeX[villager] = noticeX[moved]!;
        noticeZ[villager] = noticeZ[moved]!;
      }
      noticeLeft[moved >= 0 ? moved : villager] = 0;
      rebuildClaims();
      return moved;
    },
    serialize: () => ({ pathQueue: pathQueue.slice(queueHead) }),
    restore: (state) => {
      noticeLeft.fill(0);
      pathQueue.length = 0;
      pathQueue.push(...state.pathQueue);
      queueHead = 0;
      rebuildClaims();
    },
    stats: () => {
      const s: AgentStats = {
        asleep: 0,
        praying: 0,
        working: 0,
        wandering: 0,
        eating: 0,
        sheltering: 0,
        mourning: 0,
        walking: 0,
        pathQueue: pathQueue.length - queueHead,
      };
      for (let i = 0; i < pool.count; i++) {
        const a = pool.activity[i];
        if (a === Activity.Sleep) s.asleep++;
        else if (a === Activity.Pray) s.praying++;
        else if (a === Activity.Work) s.working++;
        else if (a === Activity.Eat) s.eating++;
        else if (a === Activity.Shelter) s.sheltering++;
        else if (a === Activity.Mourn) s.mourning++;
        else s.wandering++;
        if (pool.mode[i] === Mode.Walking) s.walking++;
      }
      return s;
    },
  };
}
