// src/world/village/assets/placeholder/dressingKit.ts — plinth, steps, fence and stockpile placeholders
import { alias, type LodGeometries } from './kitUtil.ts';
import { MeshBuilder, seedFromString } from './meshBuilder.ts';
import { PALETTE as P } from './palette.ts';

/** Unit stone block (pivot at the bottom centre); the renderer scales it to a building pad. */
export function buildPlinthGeometry(): LodGeometries {
  return alias(
    new MeshBuilder(seedFromString('plinth'), 0.08)
      .box(0, 0, 0, 1, 1, 1, P.stone, P.stoneLight)
      .build(),
  );
}

/** Two-metre fence segment along local X. */
export function buildFenceGeometry(): LodGeometries {
  const full = new MeshBuilder(seedFromString('fence:0'));
  for (const sx of [-1, 1]) full.beam([sx, 0, 0], [sx, 1, 0], 0.12, P.timberDark);
  full.beam([-1, 0.4, 0], [1, 0.4, 0], 0.08, P.timber);
  full.beam([-1, 0.75, 0], [1, 0.75, 0], 0.08, P.timber);
  const low = new MeshBuilder(seedFromString('fence:1'));
  for (const sx of [-1, 1]) low.beam([sx, 0, 0], [sx, 1, 0], 0.12, P.timberDark);
  low.beam([-1, 0.6, 0], [1, 0.6, 0], 0.1, P.timber);
  const lowGeometry = low.build();
  return [full.build(), lowGeometry, lowGeometry];
}

/** Stacked planks and a log: the site stockpile (about 1.6 x 0.8 x 0.6 m). */
export function buildStockpileGeometry(): LodGeometries {
  const b = new MeshBuilder(seedFromString('stockpile'), 0.08);
  for (let layer = 0; layer < 3; layer++) {
    for (const z of [-0.2, 0.2]) {
      b.beam([-0.8, 0.1 + layer * 0.16, z], [0.8, 0.1 + layer * 0.16, z], 0.14, P.timberLight);
    }
  }
  b.beam([-0.7, 0.62, 0], [0.7, 0.62, 0], 0.2, P.timber);
  return alias(b.build());
}
