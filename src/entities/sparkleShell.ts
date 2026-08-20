// src/entities/sparkleShell.ts — fibonacci shell placement (CPU + TSL)
import { cos, cross, float, max, normalize, sin, vec3 } from 'three/tsl';

type TslNode = any;

/** Golden-angle step (radians) for fibonacci sphere / shell packing. */
export const SPARKLE_GOLDEN_ANGLE = 2.399963229728653;

export function sparkleFract(x: number): number {
  return x - Math.floor(x);
}

export function sparkleFibonacciDir(i: number, n: number): { x: number; y: number; z: number } {
  const y = 1 - ((i + 0.5) / Math.max(n, 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * SPARKLE_GOLDEN_ANGLE;
  return { x: r * Math.cos(theta), y, z: r * Math.sin(theta) };
}

export function sparkleShellPlacementTsl(opts: {
  alongFrac: TslNode;
  theta: TslNode;
  orbitM: TslNode;
}): { along: TslNode; shell: TslNode; tangent: TslNode; bitangent: TslNode } {
  const along = opts.alongFrac.mul(max(opts.orbitM, float(0.01)));
  const y = float(1).sub(opts.alongFrac.mul(2));
  const rXZ = max(float(1).sub(y.mul(y)), 0).sqrt();
  const shell = normalize(
    vec3(rXZ.mul(cos(opts.theta)), y, rXZ.mul(sin(opts.theta))).add(vec3(0.0002, 0, 0)),
  );
  const tangent = normalize(cross(shell, vec3(0, 1, 0)).add(vec3(0.0002, 0, 0)));
  const bitangent = normalize(cross(tangent, shell));
  return { along, shell, tangent, bitangent };
}

export function sparkleShellTubeOffsetTsl(
  shell: TslNode,
  tangent: TslNode,
  bitangent: TslNode,
  tubeOffset: (side: TslNode, up: TslNode) => TslNode,
  uSpread: TslNode,
  h3: TslNode,
): TslNode {
  return tubeOffset(tangent, bitangent)
    .mul(uSpread)
    .add(shell.mul(h3.sub(0.5).mul(uSpread).mul(0.35)));
}
