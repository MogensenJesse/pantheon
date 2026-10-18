// scripts/ui/kit-check.ts — headless checks of the UI kit's pure rules (notification queue, tooltip
// placement, settings validation). The DOM parts are checked in the browser.
//
//   node --experimental-strip-types scripts/ui/kit-check.ts
import assert from 'node:assert/strict';
import { bus } from '../../src/core/EventBus.ts';
import { createNotifyQueue } from '../../src/ui/kit/notifyQueue.ts';
import { clampScale, normaliseSettings, UI_SCALE } from '../../src/ui/kit/settingsModel.ts';
import { placeTooltip } from '../../src/ui/kit/tooltipPlacement.ts';

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

// --- notification queue ---------------------------------------------------------------------------

function queue(maxVisible = 3) {
  let t = 0;
  const q = createNotifyQueue({ maxVisible, now: () => t });
  return { q, at: (ms: number) => (t = ms) };
}

check('notify: shows at most maxVisible and queues the rest', () => {
  const { q } = queue();
  for (let i = 0; i < 5; i++) q.push({ text: `n${i}` });
  assert.equal(q.visible().length, 3);
  assert.equal(q.waiting(), 2);
});

check('notify: the same key merges into one item with a count', () => {
  const { q } = queue();
  const a = q.push({ text: 'Saved' });
  const b = q.push({ text: 'Saved' });
  assert.equal(a, b);
  assert.equal(q.visible().length, 1);
  assert.equal(q.visible()[0]!.count, 2);
});

check('notify: a merge restarts the timer of a visible item', () => {
  const { q, at } = queue();
  q.push({ text: 'x', durationMs: 1000 });
  at(900);
  q.push({ text: 'x', durationMs: 1000 });
  at(1500);
  q.tick();
  assert.equal(q.visible().length, 1, 'still visible 1500 ms in: restarted at 900');
  at(1901);
  q.tick();
  assert.equal(q.visible().length, 0);
});

check('notify: waiting items promote by priority, then by age', () => {
  const { q, at } = queue(1);
  q.push({ text: 'first', durationMs: 100 });
  q.push({ text: 'low', priority: 0, durationMs: 100 });
  q.push({ text: 'high', priority: 2, durationMs: 100 });
  q.push({ text: 'mid', priority: 1, durationMs: 100 });
  at(101);
  q.tick();
  assert.equal(q.visible()[0]!.text, 'high');
  at(300);
  q.tick();
  assert.equal(q.visible()[0]!.text, 'mid');
  at(6000);
  q.tick();
  assert.equal(q.visible()[0]!.text, 'low');
});

check('notify: sticky (duration 0) stays until dismissed', () => {
  const { q, at } = queue();
  const id = q.push({ text: 'hungry', kind: 'danger', durationMs: 0 });
  at(1_000_000);
  q.tick();
  assert.equal(q.visible().length, 1);
  assert.ok(q.dismiss(id));
  assert.equal(q.visible().length, 0);
  assert.equal(q.dismiss(id), false);
});

check('notify: dismissing a visible item promotes a waiting one', () => {
  const { q } = queue(1);
  const a = q.push({ text: 'a' });
  q.push({ text: 'b' });
  q.dismiss(a);
  assert.equal(q.visible()[0]!.text, 'b');
});

check('notify: default durations grow with severity and the version counts changes', () => {
  const { q, at } = queue();
  const v0 = q.version();
  q.push({ text: 'i', kind: 'info' });
  q.push({ text: 'd', kind: 'danger' });
  assert.ok(q.version() > v0);
  at(4001);
  q.tick();
  assert.deepEqual(
    q.visible().map((n) => n.text),
    ['d'],
  );
});

// --- tooltip placement ----------------------------------------------------------------------------

const viewport = { width: 1000, height: 600 };
const tip = { width: 200, height: 80 };

check('tooltip: goes above the anchor and centres on it', () => {
  const p = placeTooltip({ left: 400, top: 300, width: 100, height: 30 }, tip, viewport);
  assert.equal(p.side, 'top');
  assert.equal(p.x, 350);
  assert.equal(p.y, 300 - 8 - 80);
});

check('tooltip: flips below when there is no room above', () => {
  const p = placeTooltip({ left: 400, top: 20, width: 100, height: 30 }, tip, viewport);
  assert.equal(p.side, 'bottom');
  assert.equal(p.y, 20 + 30 + 8);
});

check('tooltip: stays inside the viewport at the edges', () => {
  const left = placeTooltip({ left: 0, top: 300, width: 20, height: 20 }, tip, viewport);
  assert.equal(left.x, 8);
  const right = placeTooltip({ left: 990, top: 300, width: 10, height: 20 }, tip, viewport);
  assert.equal(right.x, viewport.width - tip.width - 8);
  // Neither side fits a 100 px tall viewport: pinned inside it instead of leaving the screen.
  const short = { width: 1000, height: 100 };
  const pinned = placeTooltip({ left: 400, top: 50, width: 10, height: 10 }, tip, short);
  assert.ok(pinned.y >= 8 && pinned.y + tip.height <= short.height - 8);
});

// --- settings -------------------------------------------------------------------------------------

const defaults = { scale: 1, reduceMotion: false, highContrast: false };

check('settings: scale is clamped and rounded to a step', () => {
  assert.equal(clampScale(0.1), UI_SCALE.min);
  assert.equal(clampScale(9), UI_SCALE.max);
  assert.equal(clampScale(1.23), 1.25);
  assert.equal(clampScale(Number.NaN), UI_SCALE.default);
  assert.equal(clampScale('big'), UI_SCALE.default);
});

check('settings: garbage falls back to the defaults field by field', () => {
  assert.deepEqual(normaliseSettings(null, defaults), defaults);
  assert.deepEqual(normaliseSettings('x', defaults), defaults);
  assert.deepEqual(
    normaliseSettings({ scale: 1.3, reduceMotion: 'yes', highContrast: true }, defaults),
    { scale: 1.3, reduceMotion: false, highContrast: true },
  );
  assert.deepEqual(normaliseSettings({}, { ...defaults, reduceMotion: true }), {
    ...defaults,
    reduceMotion: true,
  });
});

// --- event bus -------------------------------------------------------------------------------------

check('bus: one throwing subscriber does not stop the others', () => {
  const seen: string[] = [];
  const log = console.error;
  console.error = () => {};
  const off1 = bus.on('memory:trigger', () => {
    throw new Error('boom');
  });
  const off2 = bus.on('memory:trigger', ({ id }) => seen.push(`second ${id}`));
  try {
    bus.emit('memory:trigger', { id: 7 });
  } finally {
    console.error = log;
    off1();
    off2();
  }
  assert.deepEqual(seen, ['second 7']);
});

if (failures > 0) {
  console.log(`\nui kit check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nui kit check: OK');
