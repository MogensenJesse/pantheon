// scripts/lib/check.ts — the tiny test runner the check scripts share
//
//   import { check, finish } from '../lib/check.ts';
//   await check('what it proves', () => { assert...; });
//   finish('all x checks passed');
//
// `expectOk` and `expectRefuses` are for the save parsers (`{ ok: true, ... } | { ok: false, ... }`).
//
// A failing check prints its message and the script goes on; `finish` sets the exit code.

import assert from 'node:assert/strict';

let failures = 0;

export async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  const t0 = performance.now();
  try {
    await fn();
    const seconds = (performance.now() - t0) / 1000;
    console.log(`ok   ${name}${seconds >= 1 ? ` (${seconds.toFixed(1)} s)` : ''}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

/** Records a failure from a scan that goes on after finding one (it does not throw). */
export function fail(message: string): void {
  failures++;
  console.log(`FAIL ${message}`);
}

/** Prints the summary and sets the exit code (1 when any check failed). */
export function finish(passed: string): void {
  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${passed}`);
}

/** The parsed value of an `ok: true` result; fails the check when the parser refused. */
export function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.ok(result.ok, `refused: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

/** Every `[what, value]` must be refused by `parse`. */
export function expectRefuses(
  parse: (value: unknown) => { ok: boolean },
  cases: readonly (readonly [what: string, value: unknown])[],
): void {
  for (const [what, value] of cases) assert.equal(parse(value).ok, false, what);
}
