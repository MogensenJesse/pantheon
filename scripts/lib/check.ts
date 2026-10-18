// scripts/lib/check.ts — the tiny test runner the check scripts share
//
//   import { check, finish } from '../lib/check.ts';
//   await check('what it proves', () => { assert...; });
//   finish('all x checks passed');
//
// A failing check prints its message and the script goes on; `finish` sets the exit code.

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

/** Prints the summary and sets the exit code (1 when any check failed). */
export function finish(passed: string): void {
  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${passed}`);
}
