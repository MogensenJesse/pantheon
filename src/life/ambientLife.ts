// src/life/ambientLife.ts — ties the life at the places of power to the story
//
// Each fixed step it reads where the story stands at each place of the map (awake, restored, the name returned) and
// hands the level the life there is heading for to `placeLife`. Nothing is saved or subscribed to: a load works the
// levels out from the same facts and starts every place at its level, so nothing fades in on a load. A map with no
// landmarks has no place life (DEV `fakePlaces` stands some up to look at).
import type { LandmarkRuntime } from '../landmarks/landmarkRuntime.ts';
import type { LandmarkKind } from '../map/MapTypes.ts';
import { LIFE_KINDS, placeTarget } from './lifeRules.ts';
import type { PlaceLife, PlaceLifeView } from './placeLife.ts';

export interface AmbientLifeDeps {
  placeLife: PlaceLife;
  landmarks: Pick<LandmarkRuntime, 'places' | 'isAwake' | 'isRestored'>;
  /** The last quest is done: every place keeps its small mark. */
  nameReturned: () => boolean;
}

export interface AmbientLife {
  /** Once per fixed step. */
  update: () => void;
  /** DEV: where each place's life stands. */
  list: () => PlaceLifeView[];
  /** DEV: hold a place at a level whatever the story says (null lets go); false when the map has no such place. */
  setPlaceLevel: (kind: LandmarkKind, level: number | null) => boolean;
  /** DEV: stand up the places this map lacks in a ring round a point, each at a full level; returns the kinds made. */
  fakePlaces: (x: number, z: number, radiusM?: number) => LandmarkKind[];
  /** DEV: take the made-up places away again. */
  clearFakes: () => void;
  dispose: () => void;
}

const FAKE_RADIUS_M = 22;

export function initAmbientLife(deps: AmbientLifeDeps): AmbientLife {
  const { placeLife, landmarks, nameReturned } = deps;
  const factsOf = (kind: LandmarkKind) => ({
    awake: landmarks.isAwake(kind),
    restored: landmarks.isRestored(kind),
    nameReturned: nameReturned(),
  });
  const real = new Set<LandmarkKind>(landmarks.places.map((p) => p.kind));
  const fakes = new Set<LandmarkKind>();

  // every place begins at its level: a load shows the world as it was
  for (const place of landmarks.places) {
    placeLife.site(place.kind, place.x, place.z, placeTarget(factsOf(place.kind)));
  }

  const clearFakes = () => {
    for (const kind of fakes) placeLife.unsite(kind);
    fakes.clear();
  };

  return {
    update: () => {
      const returned = nameReturned();
      for (const place of landmarks.places) {
        placeLife.setTarget(
          place.kind,
          placeTarget({
            awake: landmarks.isAwake(place.kind),
            restored: landmarks.isRestored(place.kind),
            nameReturned: returned,
          }),
        );
      }
    },
    list: () => placeLife.list(),
    setPlaceLevel: (kind, level) => {
      if (!real.has(kind) && !fakes.has(kind)) return false;
      placeLife.setOverride(kind, level);
      return true;
    },
    fakePlaces: (x, z, radiusM = FAKE_RADIUS_M) => {
      clearFakes();
      const missing = LIFE_KINDS.filter((k) => !real.has(k));
      missing.forEach((kind, i) => {
        const angle = (i / missing.length) * Math.PI * 2;
        placeLife.site(kind, x + Math.cos(angle) * radiusM, z + Math.sin(angle) * radiusM, 1);
        fakes.add(kind);
      });
      return missing;
    },
    clearFakes,
    dispose: clearFakes,
  };
}
