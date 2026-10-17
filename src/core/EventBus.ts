// src/core/EventBus.ts

export interface GameEvents {
  'energy:changed': { energy: number; cap: number };
  /** Energy is returning at this rate (per second); 0 when nothing regenerates or the bar is full. */
  'energy:regen': Readonly<{ perSec: number }>;
  'orb:absorbed': Readonly<{ energy: number; x: number; y: number; z: number }>;
  'memory:trigger': { id: number };
  /** The skill tree opened (once, at the energy cap) with its first sparks. */
  'skills:opened': Readonly<{ sparks: number }>;
  /** Sparks, ranks or the respec changed. */
  'skills:changed': Readonly<{ sparks: number }>;
  'ability:cast': Readonly<{ id: string }>;
  /** A memory fragment finished showing (text gone, queue free for the next). */
  'story:fragmentEnded': Readonly<{ id: number }>;
  'village:founded': Readonly<{ x: number; z: number; buildings: number }>;
  'village:siteStarted': Readonly<{ id: number; type: string; x: number; z: number }>;
  'village:stageCompleted': Readonly<{ id: number; type: string; stage: number }>;
}

export type GameEventName = keyof GameEvents;
export type Handler<K extends GameEventName> = (payload: GameEvents[K]) => void;
export type Unsubscribe = () => void;

// Internal storage is keyed by string; the public API is keyed by GameEventName.
// Handlers are stored as opaque callbacks and re-typed per-invocation.
type AnyHandler = (payload: unknown) => void;

class EventBus {
  private listeners = new Map<string, Set<AnyHandler>>();

  emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(payload as unknown);
    }
  }

  on<K extends GameEventName>(event: K, handler: Handler<K>): Unsubscribe {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    const erased = handler as unknown as AnyHandler;
    handlers.add(erased);
    return () => this.off(event, handler);
  }

  off<K extends GameEventName>(event: K, handler: Handler<K>): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.delete(handler as unknown as AnyHandler);
    if (handlers.size === 0) this.listeners.delete(event);
  }

  /** Subscribe to `event` and auto-unsubscribe after the first delivery. */
  once<K extends GameEventName>(event: K, handler: Handler<K>): Unsubscribe {
    const wrapped: Handler<K> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }
}

export const bus = new EventBus();
