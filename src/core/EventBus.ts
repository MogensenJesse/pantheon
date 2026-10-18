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
  /** The quest moved: a step done, or progress within one. */
  'quest:changed': Readonly<Record<string, never>>;
  /** A story beat to show: its lines go through the story log, one card each. */
  'story:beat': Readonly<{ id: string; lines: readonly string[] }>;
  /** A memory fragment finished showing (text gone, queue free for the next). */
  'story:fragmentEnded': Readonly<{ id: number }>;
  'village:founded': Readonly<{ x: number; z: number; buildings: number }>;
  'village:siteStarted': Readonly<{ id: number; type: string; x: number; z: number }>;
  'village:stageCompleted': Readonly<{ id: number; type: string; stage: number }>;
  /** A villager reached full belief; `converts` counts everyone who believes now, of `total` villagers. */
  'village:villagerConverted': Readonly<{ villager: number; converts: number; total: number }>;
  /** The elder and enough of the village believe: the hamlet is converted and starts to grow. */
  'village:converted': Readonly<{ converts: number; total: number }>;
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
    // One failing subscriber must not stop the others.
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[bus] a "${event}" handler threw:`, err);
      }
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
}

export const bus = new EventBus();
