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
  private items: StoredMapEntity[] = [];

  loadFromMapEntities(entities: MapEntity[] | undefined): void {
    this.items = (entities ?? []).map((entity) => ({ uid: newUid(), entity }));
  }

  getAll(): readonly StoredMapEntity[] {
    return this.items;
  }

  add(entity: MapEntity): string {
    const uid = newUid();
    this.items.push({ uid, entity });
    return uid;
  }

  remove(uid: string): boolean {
    const i = this.items.findIndex((x) => x.uid === uid);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  update(uid: string, patch: Partial<MapEntity>): boolean {
    const item = this.items.find((x) => x.uid === uid);
    if (!item) return false;
    item.entity = { ...item.entity, ...patch } as MapEntity;
    return true;
  }

  get(uid: string): StoredMapEntity | undefined {
    return this.items.find((x) => x.uid === uid);
  }

  serialize(): MapEntity[] {
    return this.items.map((x) => x.entity);
  }

  snapshot(): StoredMapEntity[] {
    return this.items.map(({ uid, entity }) => ({
      uid,
      entity: structuredClone(entity),
    }));
  }

  restoreSnapshot(items: StoredMapEntity[]): void {
    this.items = items.map(({ uid, entity }) => ({
      uid,
      entity: structuredClone(entity),
    }));
  }
}
