// scripts/checks/quests/cinematic-check.ts — headless check of the camera director: a script poses the camera,
// eases in from where it was, takes the movement keys while it plays, can be skipped and hands the camera back.
//
//   node --experimental-strip-types scripts/checks/quests/cinematic-check.ts
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { type CinematicScript, createCinematic } from '../../../src/core/cinematic.ts';
import { check, finish } from '../lib/check.ts';

const makeRig = () => {
  const poses: { position: Vector3; look: Vector3 }[] = [];
  const look = new Vector3(0, 0, 0);
  return {
    poses,
    rig: {
      update: () => {},
      getMovementAxes: () => ({ forwardX: 0, forwardZ: -1, rightX: 1, rightZ: 0 }),
      getYaw: () => 0,
      computePose: () => {},
      getLook: (out: Vector3) => out.copy(look),
      setPose: (position: Vector3, l: Vector3) => {
        poses.push({ position: position.clone(), look: l.clone() });
        look.copy(l);
      },
    },
  };
};

const script = (duration: number, frames: number[] = []): CinematicScript => ({
  duration,
  view: () => ({ x: 100, z: 50, lookM: 6, distanceM: 40, yaw: 0, pitch: 0 }),
  onFrame: (t) => frames.push(t),
});

const setup = () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 10, 20);
  const { rig, poses } = makeRig();
  const cinematic = createCinematic({ camera, cameraRig: rig, groundY: () => 0 });
  return { camera, cinematic, poses };
};

await check('a script poses the camera, ends once and hands the camera back', () => {
  const { camera, cinematic, poses } = setup();
  const frames: number[] = [];
  let ended = 0;
  assert.equal(cinematic.update(0.1), false, 'idle: the follow camera runs');
  assert.ok(cinematic.start(script(5, frames), () => ended++));
  assert.equal(
    cinematic.start(script(5), () => {}),
    false,
    'one script at a time',
  );
  assert.equal(cinematic.isPlaying(), true);
  for (let i = 0; i < 20; i++)
    assert.equal(cinematic.update(0.25), true, 'the script poses every frame, the last included');
  assert.equal(ended, 1);
  assert.equal(cinematic.isPlaying(), false);
  assert.equal(cinematic.update(0.1), false, "the camera is the follow rig's again");
  // After the ease the camera sits where the script asked: 40 m from (100, 6, 50) at pitch 0, yaw 0.
  assert.ok(Math.abs(camera.position.x - 100) < 1e-6);
  assert.ok(Math.abs(camera.position.y - 6) < 1e-6);
  assert.ok(Math.abs(camera.position.z - 90) < 1e-6);
  assert.ok(poses.length > 0, 'the rig is told where the camera is');
  assert.equal(frames.at(-1), 5, 'the script saw its last frame');
});

await check('the camera eases in from where it was', () => {
  const { camera, cinematic } = setup();
  cinematic.start(script(10), () => {});
  cinematic.update(0.05);
  const near = camera.position.distanceTo(new Vector3(0, 10, 20));
  assert.ok(near < 5, 'the first frame barely moves');
  assert.ok(cinematic.weight() < 0.1);
  for (let i = 0; i < 10; i++) cinematic.update(0.25);
  assert.equal(cinematic.weight(), 1);
});

await check('movement belongs to the script while it plays', () => {
  const { cinematic } = setup();
  assert.equal(cinematic.isPlaying(), false);
  cinematic.start(script(2), () => {});
  assert.equal(cinematic.isPlaying(), true);
  cinematic.update(3);
  assert.equal(cinematic.isPlaying(), false, 'and is given back at the end');
});

await check('skipping glides to the end and finishes soon after', () => {
  const { cinematic } = setup();
  const frames: number[] = [];
  let ended = 0;
  cinematic.start(script(60, frames), () => ended++);
  cinematic.update(1);
  cinematic.skip();
  cinematic.skip();
  cinematic.update(0.1);
  assert.equal(frames.at(-1), 60, 'the scene jumps to its end state');
  assert.equal(ended, 0, 'but the view still glides');
  for (let i = 0; i < 12; i++) cinematic.update(0.25);
  assert.equal(ended, 1, 'and ends once');
});

await check('the detail centre follows the script and returns to the player after it', () => {
  const { cinematic } = setup();
  const out = new Vector3();
  const player = new Vector3(3, 0, 4);
  cinematic.focusPoint(out, player);
  assert.ok(out.equals(player), 'idle: the player');
  cinematic.start(script(4), () => {});
  for (let i = 0; i < 8; i++) cinematic.update(0.25);
  cinematic.focusPoint(out, player);
  assert.ok(Math.hypot(out.x - 100, out.z - 50) < 20, 'at the scripted view');
  for (let i = 0; i < 40; i++) cinematic.update(0.25);
  cinematic.focusPoint(out, player);
  assert.ok(Math.hypot(out.x - 3, out.z - 4) < 1e-6, 'back on the player');
});

await check('listeners run every frame, playing or not, and can be removed', () => {
  const { cinematic } = setup();
  let n = 0;
  const off = cinematic.onFrame(() => n++);
  cinematic.update(0.1);
  cinematic.start(script(1), () => {});
  cinematic.update(0.1);
  assert.equal(n, 2);
  off();
  cinematic.update(0.1);
  assert.equal(n, 2);
});

finish('all cinematic checks passed');
