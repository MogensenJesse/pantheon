// src/core/EventBus.ts
import type { Vector3 } from 'three';

export interface GameEvents {
  'energy:changed': { energy: number; cap: number };
  'stone:touched': { stoneId: number };
  'orb:absorbed': { energy: number; pos: Vector3 };
  'memory:trigger': { id: number };
  'whisper:ascended': Record<string, never>;
}

type Handler<T = unknown> = (payload: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Handler>>();

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void;
  emit(event: string, payload?: unknown): void;
  emit(event: string, payload?: unknown): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      (handler as Handler)(payload);
    }
  }

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void;
  on(event: string, handler: Handler): void;
  on(event: string, handler: Handler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void;
  off(event: string, handler: Handler): void;
  off(event: string, handler: Handler): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) this.listeners.delete(event);
  }
}

export const bus = new EventBus();
