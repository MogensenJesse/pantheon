// src/core/EventBus.ts

export interface GameEvents {
  'energy:changed': { energy: number; cap: number };
  /** Energy is returning at this rate (per second); 0 when nothing regenerates or the bar is full. */
  'energy:regen': Readonly<{ perSec: number }>;
  'orb:absorbed': Readonly<{ energy: number; x: number; y: number; z: number }>;
  'memory:trigger': { id: number };
  /** A landmark woke: `order` is how many are awake now (1 for the first), of `total` on this map. */
  'landmark:awakened': Readonly<{ kind: string; order: number; total: number }>;
  /** The village began restoring a place of power / finished it (`restored` of `total` places now). */
  'landmark:restoreStarted': Readonly<{ kind: string }>;
  'landmark:restored': Readonly<{ kind: string; restored: number; total: number }>;
  /** The skill tree opened (once, at the energy cap) with its first sparks. */
  'skills:opened': Readonly<Record<string, never>>;
  /** Arch II, The Village, opened (once) with its first sparks. */
  'skills:villageOpened': Readonly<{ sparks: number }>;
  /** The village reached a milestone (once each): it may open skills, upgrades and verbs. */
  'milestone:reached': Readonly<{ id: string; label: string }>;
  /** Sparks, ranks or the respec changed. */
  'skills:changed': Readonly<Record<string, never>>;
  'ability:cast': Readonly<{ id: string }>;
  /** The quest moved: a step done, or progress within one. */
  'quest:changed': Readonly<Record<string, never>>;
  /** A story beat to show: its lines go through the story log, one card each. */
  'story:beat': Readonly<{ id: string; lines: readonly string[] }>;
  /** A memory fragment finished showing (text gone, queue free for the next). */
  'story:fragmentEnded': Readonly<{ id: number }>;
  /** A villager reached full belief; `converts` counts everyone who believes now, of `total` villagers. */
  'village:villagerConverted': Readonly<{ villager: number; converts: number; total: number }>;
  /** Hunger: the larder ran out, everyone is weak, or food is back. */
  'village:hunger': Readonly<{ stage: 'empty' | 'weak' | 'recovered' }>;
  /** A villager began to die of hunger. */
  'village:villagerDying': Readonly<Record<string, never>>;
  /**
   * A villager was removed from the village. The last villager moved into the freed slot: `moved` is the
   * index they had before (-1 when the removed one was the last); keep any held villager index in step.
   */
  'village:villagerDied': Readonly<{ villager: number; moved: number; total: number }>;
  /** The elder and enough of the village believe: the hamlet is converted and starts to grow. */
  'village:converted': Readonly<{ converts: number; total: number }>;
  /** A crew set out to restore a place of power / finished its work (the landmark kind). */
  'village:remoteStarted': Readonly<{ kind: string }>;
  'village:remoteDone': Readonly<{ kind: string }>;
  /** A finished building rose to a new upgrade level. */
  'village:upgraded': Readonly<{ type: string; level: number }>;
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
