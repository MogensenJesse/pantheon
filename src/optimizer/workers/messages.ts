// src/optimizer/workers/messages.ts — geometry-worker protocol
import type {
  GeometryJobResult,
  PrimitivePayload,
  RemeshFlag,
  TopologyMode,
} from '../pipeline/types';

export type WorkerIn =
  | {
      type: 'simplify';
      generation: number;
      primitives: PrimitivePayload[];
      targetTriangles: number;
    }
  | {
      type: 'rebuild';
      generation: number;
      primitives: PrimitivePayload[];
      targetTriangles: number;
      remeshFlags: RemeshFlag[];
      textureSize: number;
    };

export type WorkerOut =
  | { type: 'progress'; generation: number; phase: string; message: string }
  | { type: 'result'; generation: number; result: GeometryJobResult }
  | { type: 'error'; generation: number; error: string };

export type { GeometryJobResult, PrimitivePayload, RemeshFlag, TopologyMode };
