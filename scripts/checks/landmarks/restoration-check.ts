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

finish('all restoration checks passed');
