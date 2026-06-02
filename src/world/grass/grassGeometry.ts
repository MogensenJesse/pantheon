// src/world/grass/grassGeometry.ts — tapered blade strip for SpriteNodeMaterial
import { BufferAttribute, BufferGeometry, StaticDrawUsage } from 'three';
import { GRASS_CONFIG } from './grassConfig';

export function createGrassBladeGeometry(segmentsOverride?: number): BufferGeometry {
  const segments = Math.max(
    1,
    Math.floor(segmentsOverride ?? GRASS_CONFIG.SEGMENTS),
  );
  const height = GRASS_CONFIG.BLADE_HEIGHT;
  const halfWidthBase = GRASS_CONFIG.BLADE_WIDTH * 0.5;
  const rowCount = segments;
  const vertexCount = rowCount * 2 + 1;
  const quadCount = Math.max(0, rowCount - 1);
  const indexCount = quadCount * 6 + 3;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint8Array(indexCount);

  const taper = (t: number) => halfWidthBase * (1 - 0.7 * t);

  let idx = 0;
  for (let row = 0; row < rowCount; row++) {
    const v = row / segments;
    const y = v * height;
    const halfWidth = taper(v);
    const left = row * 2;
    const right = left + 1;

    positions[3 * left] = -halfWidth;
    positions[3 * left + 1] = y;
    positions[3 * right] = halfWidth;
    positions[3 * right + 1] = y;

    uvs[2 * left] = 0;
    uvs[2 * left + 1] = v;
    uvs[2 * right] = 0;
    uvs[2 * right + 1] = v;

    if (row > 0) {
      const prevLeft = (row - 1) * 2;
      const prevRight = prevLeft + 1;
      indices[idx++] = prevLeft;
      indices[idx++] = prevRight;
      indices[idx++] = right;
      indices[idx++] = prevLeft;
      indices[idx++] = right;
      indices[idx++] = left;
    }
  }

  const tip = rowCount * 2;
  positions[3 * tip + 1] = height;
  uvs[2 * tip] = 0.5;
  uvs[2 * tip + 1] = 1;

  const lastLeft = (rowCount - 1) * 2;
  const lastRight = lastLeft + 1;
  indices[idx++] = lastLeft;
  indices[idx++] = lastRight;
  indices[idx++] = tip;

  const geom = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  posAttr.setUsage(StaticDrawUsage);
  geom.setAttribute('position', posAttr);
  const uvAttr = new BufferAttribute(uvs, 2);
  uvAttr.setUsage(StaticDrawUsage);
  geom.setAttribute('uv', uvAttr);
  const indexAttr = new BufferAttribute(indices, 1);
  indexAttr.setUsage(StaticDrawUsage);
  geom.setIndex(indexAttr);

  return geom;
}
