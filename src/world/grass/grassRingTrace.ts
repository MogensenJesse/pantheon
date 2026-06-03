// src/world/grass/grassRingTrace.ts — DEV per-ring layout + compaction trace

import type { WebGPURenderer } from 'three/webgpu';

import { formatGrassRingSummary } from './grassFieldMetrics';

import { readGrassRingsLayout } from './grassConfig';

import type { GrassRingField } from './grassRingField';



export function logGrassRingTrace(label = 'rings'): void {

  const layout = readGrassRingsLayout();

  console.info(`[grass/rings] ${label}`, {

    totalInstances: layout.totalInstances,

    rings: layout.rings.map((ring, i: number) => ({

      index: i,

      radius: ring.radius,

      innerRadius: ring.innerRadius,

      outerRadius: ring.outerRadius,

      densityPerM2: ring.densityPerM2,

      bladeWidth: ring.bladeWidth,

      segments: ring.segments,

      bladesPerSide: ring.bladesPerSide,

      instanceCount: ring.instanceCount,

      tileSize: ring.tileSize,

      summary: formatGrassRingSummary(ring, i),

    })),

  });

}



const _compactHeadReadback = new ArrayBuffer(12);



/** Read back compact index head + draw counts to catch remap regressions. */

export async function logGrassCompactTrace(

  renderer: WebGPURenderer,

  ringFields: GrassRingField[],

  label = 'compact',

): Promise<void> {

  const rows = [];

  for (const field of ringFields) {

    const compaction = field.compaction;

    if (!compaction) {

      rows.push({

        ring: field.ringIndex,

        compaction: 'off',

        draw: field.stats.drawInstances,

        allocated: field.stats.allocatedInstances,

      });

      continue;

    }



    let head: number[] = [];

    try {

      const buf = await renderer.getArrayBufferAsync(

        compaction.remap.geometryAttribute,

        _compactHeadReadback,

        0,

        12,

      );

      head = Array.from(new Uint32Array(buf).slice(0, 3));

    } catch (err) {

      head = [-1, -1, -1];

      console.warn('[grass/compact] readback failed for ring', field.ringIndex, err);

    }



    const sequentialHead = head.every((v, i) => v === i);

    rows.push({

      ring: field.ringIndex,

      draw: field.stats.drawInstances,

      allocated: field.stats.allocatedInstances,

      'compact[0..2]': head,

      sequentialHead,

      wedgeIfRemapIgnored: sequentialHead && field.stats.drawInstances > 256 ? 'yes — check remap' : 'no',

    });

  }



  console.info(`[grass/compact] ${label}`, rows);

}

