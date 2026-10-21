// scripts/checks/map/map-entities-check.ts — map entity validation and the editor palette's landmark entries
import assert from 'node:assert/strict';
import {
  EDITOR_PALETTE,
  getPaletteEntry,
  isValidMapEntity,
  landmarkKindOfPlaceId,
  landmarkPlaceId,
  markerThumbClass,
} from '../../../src/map/authoring/mapEntityCatalog.ts';
import { isLandmarkKind, LANDMARK_KINDS } from '../../../src/map/MapTypes.ts';
import { validateMapEntitiesArray } from '../../../src/map/validateMapPayload.ts';
import { check, finish } from '../lib/check.ts';

await check('the five landmark kinds are the ones the design names', () => {
  assert.deepEqual(
    [...LANDMARK_KINDS],
    ['runestones', 'tree', 'temple_ruin', 'sunken_ruin', 'monolith'],
  );
  assert.ok(isLandmarkKind('monolith'));
  assert.ok(!isLandmarkKind('spring'));
  assert.ok(!isLandmarkKind(3));
});

await check('a landmark entity needs a known kind and finite numbers', () => {
  assert.ok(isValidMapEntity({ type: 'landmark', x: 1, z: 2, kind: 'tree' }));
  assert.ok(isValidMapEntity({ type: 'landmark', x: 1, z: 2, rotY: 0.5, kind: 'sunken_ruin' }));
  assert.ok(!isValidMapEntity({ type: 'landmark', x: 1, z: 2, kind: 'spring' }));
  assert.ok(!isValidMapEntity({ type: 'landmark', x: 1, z: 2 }));
  assert.ok(!isValidMapEntity({ type: 'landmark', x: Number.NaN, z: 2, kind: 'tree' }));
  assert.ok(!isValidMapEntity({ type: 'landmark', x: 1, z: 2, rotY: 'a', kind: 'tree' }));
});

await check('a map holds each landmark kind at most once', () => {
  const all = LANDMARK_KINDS.map((kind, i) => ({ type: 'landmark', x: i, z: i, kind }));
  assert.equal(validateMapEntitiesArray(all), null);
  const dup = [...all, { type: 'landmark', x: 9, z: 9, kind: 'tree' }];
  assert.match(validateMapEntitiesArray(dup) ?? '', /Duplicate landmark "tree"/);
});

await check('the other entity types still validate', () => {
  assert.equal(
    validateMapEntitiesArray([
      { type: 'playerStart', x: 0, z: 0 },
      { type: 'orb', x: 1, z: 1 },
      { type: 'shrine', x: 2, z: 2 },
      { type: 'villageSeed', x: 3, z: 3 },
    ]),
    null,
  );
});

await check('the palette has one landmark entry per kind, each producing a valid entity', () => {
  const entries = EDITOR_PALETTE.filter((e) => landmarkKindOfPlaceId(e.placeId));
  assert.equal(entries.length, LANDMARK_KINDS.length);
  for (const kind of LANDMARK_KINDS) {
    const entry = getPaletteEntry(landmarkPlaceId(kind));
    assert.ok(entry, `palette entry for ${kind}`);
    assert.equal(entry.group, 'markers');
    const entity = entry.entityFactory(5, 6);
    assert.ok(isValidMapEntity(entity));
    assert.deepEqual(entity, { type: 'landmark', x: 5, z: 6, rotY: 0, kind });
    assert.equal(markerThumbClass(entry.placeId), 'landmark');
    assert.equal(landmarkKindOfPlaceId(entry.placeId), kind);
  }
  assert.equal(landmarkKindOfPlaceId('shrine'), null);
  assert.equal(landmarkKindOfPlaceId('landmark:spring'), null);
});

finish('all map entity checks passed');
