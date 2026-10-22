// scripts/checks/finale/timeline-check.ts — headless check of the last night's timeline: the view glides place to place,
// a beam rises at each, the rune's strokes light one after another in the return shot and the rune holds.
//
//   node --experimental-strip-types scripts/checks/finale/timeline-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { buildFinaleTimeline } from '../../../src/finale/timeline.ts';
import { check, finish } from '../lib/check.ts';

const CUT = PHASE0.QUEST.FINALE.CUTSCENE;

const PLACES = [
  { kind: 'runestones', x: 100, z: 0 },
  { kind: 'tree', x: 0, z: 120 },
  { kind: 'temple_ruin', x: -90, z: 10 },
  { kind: 'sunken_ruin', x: -20, z: -110 },
  { kind: 'monolith', x: 60, z: 90 },
] as const;
const TEMPLE = { x: 0, z: 0 };

await check(
  'the cutscene raises a beam at each place in turn and keeps the rune dark meanwhile',
  () => {
    const tl = buildFinaleTimeline(PLACES, TEMPLE);
    const expected = CUT.INTRO_S + PLACES.length * CUT.PLACE_S + CUT.RETURN_S + CUT.HOLD_S;
    assert.ok(Math.abs(tl.duration - expected) < 1e-9, 'the slots add up to the duration');
    const start = tl.at(0);
    for (const p of PLACES) {
      assert.equal(start.beams[p.kind], 0, 'it opens dark');
      assert.equal(start.strokes[p.kind], 0);
    }
    assert.equal(start.glow, 0);
    for (const [i, p] of PLACES.entries()) {
      const slot = CUT.INTRO_S + i * CUT.PLACE_S;
      const before = tl.at(slot + CUT.BEAM_AT_S - 0.01);
      assert.equal(before.beams[p.kind], 0, `${p.kind}: no beam before its moment`);
      const during = tl.at(slot + CUT.BEAM_AT_S + CUT.BEAM_RISE_S * 0.5);
      assert.ok(
        (during.beams[p.kind] ?? 0) > 0 && (during.beams[p.kind] ?? 0) < 1,
        `${p.kind} rises`,
      );
      const after = tl.at(slot + CUT.PLACE_S - 0.01);
      assert.equal(after.beams[p.kind], 1, `${p.kind}: the beam is whole by the end of its slot`);
      assert.equal(after.strokes[p.kind], 0, `${p.kind}: its stroke waits for the return shot`);
      assert.equal(after.glow, 0, 'and so does the rune');
      // The view is at the place while its beam rises.
      const v = during.view;
      assert.ok(Math.hypot(v.x - p.x, v.z - p.z) < 25, `${p.kind}: the view is on the place`);
      const next = PLACES[i + 1];
      if (next) {
        assert.equal(tl.at(slot + CUT.PLACE_S - 0.01).beams[next.kind], 0, 'the next place waits');
      }
    }
  },
);

await check(
  'the strokes light one after another in the return shot, then the rune glows whole',
  () => {
    const tl = buildFinaleTimeline(PLACES, TEMPLE);
    const placesEnd = CUT.INTRO_S + PLACES.length * CUT.PLACE_S;
    const first = placesEnd + CUT.RETURN_S * CUT.STROKES_AT;
    let before = tl.at(first - 0.01);
    assert.equal(before.glow, 0, 'dark until the first stroke');
    for (const [i, p] of PLACES.entries()) {
      const start = first + i * CUT.STROKE_STAGGER_S;
      before = tl.at(start - 0.01);
      assert.equal(before.strokes[p.kind], 0, `${p.kind}: not before its turn`);
      const done = tl.at(start + CUT.STROKE_FADE_S);
      assert.equal(done.strokes[p.kind], 1, `${p.kind}: lit after its fade`);
      assert.ok(done.glow >= CUT.GLOW_BASE * 0.99 || i === 0, 'the rune glows once strokes show');
      const next = PLACES[i + 1];
      if (next)
        assert.ok((tl.at(start + CUT.STROKE_STAGGER_S - 0.01).strokes[next.kind] ?? 0) < 0.01);
    }
    assert.ok(tl.at(first + 0.5).glow > 0, 'the glow starts with the first stroke');
  },
);

await check('the view is continuous: the first glide leaves the opening look where it is', () => {
  const tl = buildFinaleTimeline(PLACES, TEMPLE);
  for (const t of [
    CUT.INTRO_S,
    CUT.INTRO_S + CUT.PLACE_S,
    CUT.INTRO_S + CUT.PLACE_S * PLACES.length,
  ]) {
    const a = tl.at(t - 1e-3).view;
    const b = tl.at(t + 1e-3).view;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.5, `no jump in position at ${t}`);
    // Angles may differ by whole turns.
    const turn = Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw));
    assert.ok(Math.abs(turn) < 0.01, `no snap in yaw at ${t}`);
  }
});

await check('the cutscene returns to the temple, lights the whole rune and holds', () => {
  const tl = buildFinaleTimeline(PLACES, TEMPLE);
  const end = tl.at(tl.duration);
  assert.equal(end.glow, 1, 'the rune is at full glow');
  for (const p of PLACES) {
    assert.equal(end.beams[p.kind], 1);
    assert.equal(end.strokes[p.kind], 1);
  }
  assert.ok(
    Math.hypot(end.view.x - TEMPLE.x, end.view.z - TEMPLE.z) < 1e-6,
    'it ends over the temple',
  );
  assert.ok(end.view.lookM > CUT.RUNE_HEIGHT_M * 0.99, 'looking up at the rune');
  assert.deepEqual(tl.at(tl.duration + 50), end, 'past the end it stays');
  assert.deepEqual(tl.at(-5), tl.at(0), 'before the start it stays');
  // Skipping jumps to the end: every frame is whole and the glow never falls back.
  let glow = 0;
  for (let t = 0; t <= tl.duration; t += 0.25) {
    const f = tl.at(t);
    assert.ok(f.glow >= glow - 1e-9, 'the glow only rises');
    glow = f.glow;
    for (const p of PLACES) {
      if ((f.strokes[p.kind] ?? 0) > 0) {
        assert.ok((f.beams[p.kind] ?? 0) > 0, 'a stroke lights only once its beam is rising');
      }
    }
  }
});

await check('the cutscene copes with a map that has fewer places or none', () => {
  const some = buildFinaleTimeline(PLACES.slice(0, 2), TEMPLE);
  assert.equal(some.at(some.duration).glow, 1);
  const none = buildFinaleTimeline([], TEMPLE);
  assert.ok(Number.isFinite(none.duration) && none.duration > 0);
  assert.ok(Number.isFinite(none.at(1).view.x));
});

finish('all finale timeline checks passed');
