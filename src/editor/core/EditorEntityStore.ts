// src/editor/core/EditorEntityStore.ts — in-memory map entities with stable selection uids
import type { MapEntity } from '../../map/MapTypes';

export interface StoredMapEntity {
  uid: string;
  entity: MapEntity;
}

let nextUid = 1;

function newUid(): string {
  return `e${nextUid++}`;
}

export class EditorEntityStore {
  private readonly byUid = new Map<string, StoredMapEntity>();
  /** Insertion order for stable serialize / iterate. */
  private order: string[] = [];
  private readonly orderIndex = new Map<string, number>();
  private _entityEpoch = 0;

  get entityEpoch(): number {
    return this._entityEpoch;
  }

  private bumpEpoch(): void {
    this._entityEpoch++;
  }

  private reindexFrom(start: number): void {
    for (let i = start; i < this.order.length; i++) {
      this.orderIndex.set(this.order[i]!, i);
    }
  }

  private resetOrder(uids: string[]): void {
    this.order = uids;
    this.orderIndex.clear();
    this.reindexFrom(0);
  }

  loadFromMapEntities(entities: MapEntity[] | undefined): void {
    this.byUid.clear();
    const uids: string[] = [];
    for (const entity of entities ?? []) {
      const uid = newUid();
      this.byUid.set(uid, { uid, entity });
      uids.push(uid);
    }
    this.resetOrder(uids);
    this.bumpEpoch();
  }

  getAll(): readonly StoredMapEntity[] {
    return this.order.map((uid) => this.byUid.get(uid)!);
  }

  add(entity: MapEntity): string {
    const uid = newUid();
    this.byUid.set(uid, { uid, entity });
    this.orderIndex.set(uid, this.order.length);
    this.order.push(uid);
    this.bumpEpoch();
    return uid;
  }

  remove(uid: string): boolean {
    if (!this.byUid.delete(uid)) return false;
    const i = this.orderIndex.get(uid);
    if (i !== undefined) {
      this.order.splice(i, 1);
      this.orderIndex.delete(uid);
      this.reindexFrom(i);
    }
    this.bumpEpoch();
    return true;
  }

  update(uid: string, patch: Partial<MapEntity>): boolean {
    const item = this.byUid.get(uid);
    if (!item) return false;
    item.entity = { ...item.entity, ...patch } as MapEntity;
    this.bumpEpoch();
    return true;
  }

  get(uid: string): StoredMapEntity | undefined {
    return this.byUid.get(uid);
  }

  serialize(): MapEntity[] {
    return this.order.map((uid) => this.byUid.get(uid)!.entity);
  }

  snapshot(): StoredMapEntity[] {
    return this.order.map((uid) => {
      const item = this.byUid.get(uid)!;
      return { uid, entity: structuredClone(item.entity) };
    });
  }

  restoreSnapshot(items: StoredMapEntity[], epoch?: number): void {
    this.byUid.clear();
    const uids: string[] = [];
    for (const { uid, entity } of items) {
      this.byUid.set(uid, { uid, entity: structuredClone(entity) });
      uids.push(uid);
    }
    this.resetOrder(uids);
    this._entityEpoch = epoch ?? this._entityEpoch + 1;
  }
}
