// src/world/village/sim/crew.ts — builders on a trip to a remote site: out along the route, a camp, and home again
// (pure and node-runnable; the villager arrays hold all of it, so a save needs nothing else)
//
// A crew member leaves the normal routine: `agents.ts` hands them to this module in `think`, `act` and when a
// path ends. They walk through the village to the route's gate (the local pathfinder), the route out in chunks
// of `PATH.MAX_WAYPOINTS` points, and work at the camp whenever their routine says work. They eat a packed meal
// where they are, and rest by the camp at night and in rain. When the site is done they walk the route back
// and the routine takes them home.

import { VILLAGE } from '../../../config/village.ts';
import {
  Activity,
  Anim,
  type AnimId,
  CrewPhase,
  Mode,
  type RemoteSite,
  Role,
  type Villagers,
  WORK_ANIM,
} from '../model/types.ts';

const { PATH } = VILLAGE;
/** The crew stands this far (m) from the camp's middle, each at their own angle. */
const CAMP_RING_M = 3;
const GOLDEN_ANGLE = 2.399963;

export interface CrewDeps {
  pool: Villagers;
  sites: readonly RemoteSite[];
  /** Walk to a point through the village (the local pathfinder). */
  requestPath: (i: number, x: number, z: number) => void;
  rest: (i: number, seconds: number) => void;
  /** Sit down to the meal that is due, wherever they are. */
  startMeal: (i: number) => void;
  setAnim: (i: number, anim: AnimId) => void;
  faceToward: (i: number, x: number, z: number) => void;
  /** Step out of the house if indoors. */
  leaveHome: (i: number) => void;
  releaseSlot: (i: number) => void;
  /** Hunger has made everyone weak. */
  weak: () => boolean;
  /** Builder-seconds of work this villager delivers per second at a remote site. */
  workRate: (i: number) => number;
  /** Builder-seconds delivered to a site (the sim turns them into stages and events). */
  onWork: (site: RemoteSite, seconds: number) => void;
}

export interface Crew {
  /** Sends up to `max` free builders, the nearest to the gate first; returns how many went. */
  recruit: (site: RemoteSite, max: number) => number;
  /** Crew members (alive) of a site. */
  size: (site: RemoteSite) => number;
  /** A crew member's routine decision: `desired` is the activity their day asks for now. */
  think: (i: number, desired: number) => void;
  /** A crew member finished the walk they were on. */
  pathDone: (i: number) => void;
  /** True when the crew member is working at the camp (and so needs nothing else this step). */
  act: (i: number, dt: number) => boolean;
}

export function createCrew(deps: CrewDeps): Crew {
  const { pool, sites } = deps;
  const siteOf = (i: number) => sites.find((s) => s.id === pool.crew[i]);
  const routeLen = (site: RemoteSite) => site.route.length / 2;

  const release = (i: number) => {
    pool.crew[i] = 0;
    pool.crewPhase[i] = CrewPhase.None;
    pool.routeCur[i] = 0;
    pool.pathLen[i] = 0;
    pool.pathCur[i] = 0;
    pool.mode[i] = Mode.Free;
  };

  /** Where crew member `i` stands at the camp. */
  const spotAt = (i: number, site: RemoteSite): [number, number] => {
    const angle = i * GOLDEN_ANGLE;
    return [site.campX + Math.cos(angle) * CAMP_RING_M, site.campZ + Math.sin(angle) * CAMP_RING_M];
  };

  /** Set the next stretch of the route as the waypoints to walk; false when there is none left. */
  const loadChunk = (i: number, site: RemoteSite, out: boolean): boolean => {
    const base = i * PATH.MAX_WAYPOINTS * 2;
    const n = routeLen(site);
    let count = 0;
    if (out) {
      const start = pool.routeCur[i]!;
      count = Math.min(PATH.MAX_WAYPOINTS, n - start);
      for (let k = 0; k < count; k++) {
        pool.waypoints[base + k * 2] = site.route[(start + k) * 2]!;
        pool.waypoints[base + k * 2 + 1] = site.route[(start + k) * 2 + 1]!;
      }
      pool.routeCur[i] = start + Math.max(0, count);
    } else {
      const left = pool.routeCur[i]!;
      count = Math.min(PATH.MAX_WAYPOINTS, left);
      for (let k = 0; k < count; k++) {
        const at = left - 1 - k;
        pool.waypoints[base + k * 2] = site.route[at * 2]!;
        pool.waypoints[base + k * 2 + 1] = site.route[at * 2 + 1]!;
      }
      pool.routeCur[i] = left - Math.max(0, count);
    }
    if (count <= 0) return false;
    pool.pathLen[i] = count;
    pool.pathCur[i] = 0;
    pool.mode[i] = Mode.Walking;
    return true;
  };

  /** Go to the spot at the camp (a single waypoint) when not yet there. */
  const walkToSpot = (i: number, site: RemoteSite): boolean => {
    const [x, z] = spotAt(i, site);
    if (Math.hypot(x - pool.x[i]!, z - pool.z[i]!) <= VILLAGE.VILLAGERS.ARRIVE_M) return false;
    const base = i * PATH.MAX_WAYPOINTS * 2;
    pool.waypoints[base] = x;
    pool.waypoints[base + 1] = z;
    pool.pathLen[i] = 1;
    pool.pathCur[i] = 0;
    pool.mode[i] = Mode.Walking;
    return true;
  };

  /** The site is done: walk the route back (from the camp the whole of it, from a walk out what had been loaded). */
  const callHome = (i: number, site: RemoteSite) => {
    if (pool.crewPhase[i] === CrewPhase.ToGate) return release(i);
    if (pool.crewPhase[i] === CrewPhase.Camp) pool.routeCur[i] = routeLen(site);
    pool.crewPhase[i] = CrewPhase.Back;
    pool.activity[i] = Activity.Wander;
    pool.pathLen[i] = 0;
    pool.pathCur[i] = 0;
    pool.mode[i] = Mode.Free;
  };

  return {
    recruit: (site, max) => {
      const [gateX, gateZ] = [site.route[0]!, site.route[1]!];
      const free: number[] = [];
      for (let i = 0; i < pool.count; i++) {
        if (pool.role[i] === Role.Builder && pool.crew[i] === 0 && pool.dying[i] === 0)
          free.push(i);
      }
      free.sort(
        (a, b) =>
          Math.hypot(pool.x[a]! - gateX, pool.z[a]! - gateZ) -
          Math.hypot(pool.x[b]! - gateX, pool.z[b]! - gateZ),
      );
      const sent = free.slice(0, max);
      for (const i of sent) {
        deps.releaseSlot(i);
        deps.leaveHome(i);
        pool.crew[i] = site.id;
        pool.crewPhase[i] = CrewPhase.ToGate;
        pool.routeCur[i] = 0;
        pool.activity[i] = Activity.Work;
        pool.target[i] = 0;
        deps.requestPath(i, gateX, gateZ);
      }
      return sent.length;
    },
    size: (site) => {
      let n = 0;
      for (let i = 0; i < pool.count; i++) if (pool.crew[i] === site.id && pool.dying[i] === 0) n++;
      return n;
    },
    think: (i, desired) => {
      const site = siteOf(i);
      if (!site) return release(i);
      // A finished site calls its crew home (the routine takes over again at the gate).
      if (site.stage >= 2 && pool.crewPhase[i] !== CrewPhase.Back) {
        callHome(i, site);
        if (!pool.crew[i]) return;
      }
      const mode = pool.mode[i];
      if (mode === Mode.Pending || mode === Mode.Walking || mode === Mode.Entering) return;
      switch (pool.crewPhase[i]) {
        case CrewPhase.ToGate:
          if (mode === Mode.Free) deps.requestPath(i, site.route[0]!, site.route[1]!);
          return;
        case CrewPhase.Out:
          if (mode === Mode.Free && !loadChunk(i, site, true)) {
            pool.crewPhase[i] = CrewPhase.Camp;
          }
          return;
        case CrewPhase.Back:
          if (mode === Mode.Free && !loadChunk(i, site, false)) release(i);
          return;
        default:
          break;
      }
      // At the camp.
      if (pool.activity[i] === Activity.Eat && mode !== Mode.Free) return;
      if (mode === Mode.Free && walkToSpot(i, site)) return;
      if (desired === Activity.Work) {
        if (pool.activity[i] !== Activity.Work || mode !== Mode.Acting) {
          pool.activity[i] = Activity.Work;
          pool.mode[i] = Mode.Acting;
          pool.timer[i] = Number.POSITIVE_INFINITY;
          deps.faceToward(i, site.x, site.z);
        }
        return;
      }
      if (desired === Activity.Eat) {
        if (pool.activity[i] !== Activity.Eat) {
          pool.activity[i] = Activity.Eat;
          deps.startMeal(i);
        }
        return;
      }
      // Night, rain, prayers and the rest: they stay by the camp.
      if (pool.activity[i] !== desired || mode === Mode.Free) {
        pool.activity[i] = desired;
        deps.rest(i, 3);
      }
    },
    pathDone: (i) => {
      const site = siteOf(i);
      if (!site) return release(i);
      switch (pool.crewPhase[i]) {
        case CrewPhase.ToGate:
          pool.crewPhase[i] = CrewPhase.Out;
          pool.routeCur[i] = 0;
          pool.mode[i] = Mode.Free;
          return;
        case CrewPhase.Out:
          if (pool.routeCur[i]! >= routeLen(site)) pool.crewPhase[i] = CrewPhase.Camp;
          pool.mode[i] = Mode.Free;
          return;
        case CrewPhase.Back:
          pool.mode[i] = Mode.Free;
          if (pool.routeCur[i] === 0) release(i);
          return;
        default:
          pool.mode[i] = Mode.Free;
      }
    },
    act: (i, dt) => {
      if (
        pool.crewPhase[i] !== CrewPhase.Camp ||
        pool.activity[i] !== Activity.Work ||
        pool.mode[i] !== Mode.Acting
      ) {
        return false;
      }
      const site = siteOf(i);
      if (!site || site.stage >= 2) return true;
      const working = !deps.weak();
      deps.setAnim(i, working ? (WORK_ANIM[pool.role[i]!] ?? Anim.Work) : Anim.Idle);
      if (working) deps.onWork(site, deps.workRate(i) * dt);
      return true;
    },
  };
}
