// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/liveLook.ts — numbers and colours of a look as uniforms, so the DEV panel can edit them live
//
// A field passes the look it was built from (the config object itself); each uniform starts at the value the look
// holds and, in DEV, is refreshed from it once a frame by `sync`. Production keeps the starting values and pays nothing.
import { Color } from 'three';
import { uniform } from 'three/tsl';

export interface LiveLook {
  /** A uniform holding `get()`. */
  num: (get: () => number) => ReturnType<typeof uniform>;
  /** A colour uniform holding the hex `get()` returns. */
  color: (get: () => string) => ReturnType<typeof uniform>;
  /** Refreshes the uniforms from the look (DEV only). */
  sync: () => void;
}

export function createLiveLook(): LiveLook {
  const nums: Array<[() => number, { value: number }]> = [];
  const colors: Array<{ get: () => string; node: { value: Color }; last: string }> = [];
  return {
    num: (get) => {
      const node = uniform(get());
      nums.push([get, node]);
      return node;
    },
    color: (get) => {
      const last = get();
      const node = uniform(new Color(last));
      colors.push({ get, node, last });
      return node;
    },
    sync: () => {
      if (!import.meta.env.DEV) return;
      for (const [get, node] of nums) node.value = get();
      for (const c of colors) {
        const hex = c.get();
        if (hex === c.last) continue;
        c.last = hex;
        c.node.value.set(hex);
      }
    },
  };
}
