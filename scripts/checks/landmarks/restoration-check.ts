// scripts/checks/landmarks/restoration-check.ts — the places of power in the village: hurdle, boon, and how they fold with skills
import assert from 'node:assert/strict';
import { LANDMARK_EFFECTS, landmarkEffects } from '../../../src/landmarks/landmarkEffects.ts';
import {
  awaken,
  finishRestoration,
  initialLandmarks,
  type LandmarkPlace,
  startRestoration,
} from '../../../src/landmarks/landmarks.ts';
import { LANDMARK_KINDS } from '../../../src/map/MapTypes.ts';
import {
  LANDMARK_NAMES,
  restorationGoals,
  siteFraction,
} from '../../../src/quests/restorationGoals.ts';
import { foldEffects, neutralModifiers } from '../../../src/skills/modifiers.ts';
import { modifiersOf, newSkillsState } from '../../../src/skills/skillTree.ts';
import { createWeather } from '../../../src/world/weather/weather.ts';
import { check, finish } from '../lib/check.ts';

const places: LandmarkPlace[] = LANDMARK_KINDS.map((kind, i) => ({ kind, x: i * 100, z: 0 }));
const treeOnly: LandmarkPlace[] = [{ kind: 'tree', x: 0, z: 0 }];

await check('nothing weighs on a village that is not converted yet', () => {
  assert.deepEqual(landmarkEffects(places, awaken(initialLandmarks(), 'tree'), false), []);
});

await check(
  'the hurdle of an unrestored place weighs on a converted village and the boon replaces it',
  () => {
    let state = awaken(initialLandmarks(), 'tree');
    const hurdle = foldEffects(landmarkEffects(treeOnly, state, true));
    assert.ok(hurdle.weatherChanceMul < 1 && hurdle.rainBoostMul < 1, 'drought');
    state = finishRestoration(startRestoration(state, 'tree'), 'tree');
    const boon = foldEffects(landmarkEffects(treeOnly, state, true));
    assert.equal(boon.weatherChanceMul, 1, 'the drought is lifted');
    assert.equal(boon.rainBoostMul, 1);
    assert.ok(boon.fieldYieldAdd > 0 && boon.stumpWaitMul < 1, 'the boon');
    // A place restored before the village converts (not possible in play) still gives its boon.
    assert.deepEqual(
      landmarkEffects(treeOnly, state, false),
      landmarkEffects(treeOnly, state, true),
    );
  },
);

await check(
  'every effect changes something, and a hurdle and a boon on the same knob point opposite ways',
  () => {
    const neutral = neutralModifiers();
    const delta = (e: (typeof LANDMARK_EFFECTS)['tree']['hurdle'][number]) =>
      'mul' in e ? e.mul - 1 : e.add;
    for (const kind of LANDMARK_KINDS) {
      const { hurdle, boon } = LANDMARK_EFFECTS[kind];
      for (const effect of [...hurdle, ...boon]) {
        assert.notEqual(delta(effect), 0, `${kind} ${effect.key} does nothing`);
        assert.ok(effect.key in neutral, `${effect.key} is a modifier`);
      }
      for (const h of hurdle) {
        for (const b of boon.filter((e) => e.key === h.key)) {
          assert.ok(delta(h) * delta(b) < 0, `${kind} ${h.key}: hurdle and boon agree`);
        }
      }
    }
  },
);

await check(
  'every place has a hurdle and a boon, and lifting the hurdle never leaves a loss behind',
  () => {
    for (const kind of LANDMARK_KINDS) {
      const only: LandmarkPlace[] = [{ kind, x: 0, z: 0 }];
      const woken = awaken(initialLandmarks(), kind);
      const hurdle = foldEffects(landmarkEffects(only, woken, true));
      const boon = foldEffects(
        landmarkEffects(only, finishRestoration(startRestoration(woken, kind), kind), true),
      );
      assert.ok(LANDMARK_EFFECTS[kind].hurdle.length > 0, `${kind} has a hurdle`);
      assert.ok(LANDMARK_EFFECTS[kind].boon.length > 0, `${kind} has a boon`);
      assert.notDeepEqual(hurdle, neutralModifiers(), `${kind} hurdle weighs`);
      assert.notDeepEqual(boon, neutralModifiers(), `${kind} boon gives`);
      // A key the hurdle moved is no worse after the restoration than it was before the hurdle.
      for (const effect of LANDMARK_EFFECTS[kind].hurdle) {
        const from = neutralModifiers()[effect.key];
        const worse =
          (hurdle[effect.key] - from) *
          ('mul' in effect ? Math.sign(effect.mul - 1) : Math.sign(effect.add));
        const after =
          (boon[effect.key] - from) *
          ('mul' in effect ? Math.sign(effect.mul - 1) : Math.sign(effect.add));
        assert.ok(worse > 0 && after < worse, `${kind} ${effect.key}: the boon undoes the hurdle`);
      }
    }
  },
);

await check('the storm ward makes fronts weaker and narrower, from days not yet rolled', () => {
  const make = (strength: number) =>
    createWeather({
      anchorX: 0,
      anchorZ: 0,
      seed: 7,
      windDirectionDeg: 270,
      strengthMul: () => strength,
    });
  const days = Array.from({ length: 200 }, (_, i) => i + 10);
  const normal = make(1);
  const ward = make(0.7);
  const pairs = days
    .map((d) => [normal.frontOfDay(d), ward.frontOfDay(d)] as const)
    .filter(([a, b]) => a && b);
  assert.ok(pairs.length > 5, 'fronts to compare');
  for (const [a, b] of pairs) {
    assert.ok(Math.abs(b!.peak - a!.peak * 0.7) < 1e-9, 'weaker');
    assert.ok(Math.abs(b!.radius - a!.radius * 0.7) < 1e-9, 'narrower');
  }
  assert.equal(
    days.filter((d) => normal.frontOfDay(d)).length,
    days.filter((d) => ward.frontOfDay(d)).length,
    'as many fronts, only calmer',
  );
});

await check('place effects fold with the skill ranks without replacing them', () => {
  const state = awaken(initialLandmarks(), 'tree');
  const effects = landmarkEffects(treeOnly, state, true);
  const skills = newSkillsState();
  const alone = modifiersOf(skills);
  const both = modifiersOf(skills, undefined, effects);
  assert.equal(alone.weatherChanceMul, 1);
  const drought = LANDMARK_EFFECTS.tree.hurdle.find((e) => e.key === 'weatherChanceMul');
  assert.ok(drought && 'mul' in drought);
  assert.equal(both.weatherChanceMul, drought.mul);
  assert.equal(both.absorbRadiusMul, alone.absorbRadiusMul, 'the skills part is untouched');
});

await check(
  'the weather chance changes the fronts of days not yet rolled, and a rolled day stays',
  () => {
    let mul = 1;
    const make = () =>
      createWeather({
        anchorX: 0,
        anchorZ: 0,
        seed: 7,
        windDirectionDeg: 270,
        chanceMul: () => mul,
      });
    const days = Array.from({ length: 200 }, (_, i) => i + 10);
    const normal = make();
    const fronts = days.filter((d) => normal.frontOfDay(d)).length;
    mul = 0;
    const drought = make();
    assert.equal(days.filter((d) => drought.frontOfDay(d)).length, 0, 'no storms at 0');
    mul = 0.4;
    const dry = make();
    const dryFronts = days.filter((d) => dry.frontOfDay(d)).length;
    assert.ok(dryFronts < fronts * 0.7, `fewer fronts (${dryFronts} of ${fronts})`);
    // A day that has been rolled keeps its answer when the multiplier moves.
    const kept = days.map((d) => dry.frontOfDay(d));
    mul = 1;
    assert.deepEqual(
      days.map((d) => dry.frontOfDay(d)),
      kept,
    );
  },
);

await check(
  'the goals show nothing until the village converts, then the places the player has woken',
  () => {
    const view = (state: ReturnType<typeof initialLandmarks>, converted: boolean, wood = 100) => ({
      places,
      state,
      converted,
      wood,
      site: () => ({ stage: 1 as const, progress: 300 }),
    });
    const woken = awaken(awaken(initialLandmarks(), 'tree'), 'monolith');
    assert.deepEqual(restorationGoals(view(woken, false)), { objective: null });
    const offered = restorationGoals(view(woken, true));
    assert.equal(offered.objective?.text, `Stand at ${LANDMARK_NAMES.tree} to restore it`);
    const poor = restorationGoals(view(woken, true, 0));
    assert.match(poor.objective?.text ?? '', /wood/);
    const going = restorationGoals(view(startRestoration(woken, 'tree'), true));
    assert.match(going.objective?.text ?? '', /restoring the old tree {2}\d+%/);
    const done = restorationGoals(
      view(finishRestoration(startRestoration(woken, 'tree'), 'tree'), true),
    );
    // The monolith, still to do, is offered after the tree is done.
    assert.match(done.objective?.text ?? '', /monolith/);
  },
);

await check('the progress of a site runs from 0 to 1 across both stages', () => {
  assert.equal(siteFraction(0, 0), 0);
  assert.ok(siteFraction(0, 300) > 0 && siteFraction(0, 300) < siteFraction(1, 0));
  assert.ok(siteFraction(1, 0) < siteFraction(1, 600) && siteFraction(1, 600) < 1);
  assert.equal(siteFraction(2, 0), 1);
});

finish('all restoration checks passed');
