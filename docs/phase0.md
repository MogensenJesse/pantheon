# Phase 0: the five landmarks

How Phase 0 (God Particle) works in the code: the rules, the config keys, the events, the save fields, the DEV hooks and the checks. The design is in `story-mechanics/PHASE_0_LANDMARKS.md`; what the author owes the build (models, story, map) is in `story-mechanics/PHASE_0_TODO.md`.

## Rules

- The map holds up to five landmarks, each kind at most once: `runestones`, `tree`, `temple_ruin`, `sunken_ruin`, `monolith`. The kind is the identity (it picks the stand-in props or model, the beacon colour and the caption).
- The orb wakes a dormant landmark by standing within `PHASE0.LANDMARK.RADIUS_M` (8 m) for `DWELL_S` (4 s) of game time. Leaving resets the count. Any visiting order works.
- Waking pays `PHASE0.LANDMARK.ENERGY` (14) through `addEnergy`, then tells the Nth chapter (N = how many are awake now).
- **The gate**: the sunrise and phase 1 need the bar at the cap **and** every landmark of the map awake (`isPhase0Complete`). A map without landmarks keeps the old rule, the bar alone. With the bar full and landmarks left, the world waits and fragment 17 ("something is unfinished") is shown once.
- **Guide line**: orbs lead in the order the map lists them; once none is left the line leads to the nearest dormant landmark and keeps that one until it wakes (`stickyTarget`).
- **World lightness**: the night lift grows with `phase0Progress` (energy over the cap, 1 from the sunrise on) instead of an orb count.

## Where it lives

| Part | File |
|---|---|
| Pure rules: dwell, awaken, gate, nearest and sticky target, parse | `src/landmarks/landmarks.ts` |
| Runtime (state, dwell, energy, event): created in `main.ts` before the world reveal | `src/landmarks/landmarkRuntime.ts` |
| Stand-in props per kind (swap the keys when the models exist) | `src/landmarks/landmarkStandIns.ts` |
| Light: beacon column, dwell ring, awakening burst and pulse, steady glow | `src/entities/landmark/landmarkLights.ts` |
| The gate in the sunrise | `src/core/reveal/WorldReveal.ts` (`Phase0Gate`) |
| Guide line target (orb, else landmark) | `src/entities/guideLine/guideTarget.ts`, `GuideLineSystem.ts` (`setFallbackTarget`) |
| Night lift from phase 0 progress | `src/core/reveal/phase0Progress.ts`, `worldLightnessT` in `src/rendering/sky/lightingCurves.ts` |
| Chapters and captions (placeholder text) | `src/story/fragments.ts`, `src/ui/StoryLog.ts` |
| Map entity | `landmark` in `src/map/MapTypes.ts`; see `story-mechanics/MAPS.md` |

## Config keys

- `PHASE0.LANDMARK`: `RADIUS_M`, `DWELL_S`, `ENERGY`, `GUIDE_END_HEIGHT_M` (`src/config/phase0.ts`).
- `PHASE0.UNFINISHED_MEMORY_ID` (17) and `PHASE0.AETHON_MEMORY_ID` (16).
- `VISUAL.landmark`: colour per kind, beacon height, radius, visible distance and pulse, ring, awakening pulse and glow (`src/config/visual/landmark.ts`). The light is additive emissive meshes only; the player's light is still the only `PointLight`.
- `VISUAL.sky.worldLightness`: the four lift amounts.

## Events

`landmark:awakened { kind, order, total }` is emitted before the energy is paid, so a landmark that fills the bar tells its chapter before the sunrise's memory. `WorldReveal` re-evaluates the gate on it; the story log queues the caption and the chapter; the lights fire the burst.

## Save

`ProfileState.landmarks = { awakened: LandmarkKind[] }` in wake order (save version 11, no migration from older versions). A kind the map no longer has is dropped on load. The dwell count is not saved.

## DEV hooks

`window.__pantheonLandmarks`: `list()`, `state()`, `allAwake()`, `nextTarget()`, `awaken(kind)`, `awakenAll()`, `teleportTo(kind, offsetM?)`. With `__pantheonSkills.setEnergy(...)` this walks the whole gate from the console.

## Checks

`npm run check:landmarks` (in `check:fast`): dwell, any order, reset on leave, the gate with and without landmarks, the guide target, phase 0 progress, stand-ins, chapters and captions, the save round trip and refusals. The map validation check covers the entity.

## Pacing

Target 20 to 30 minutes; the orb walks 6 m/s (0.65x in forest, 0.5x on high ground). island-mountain has 6 orbs worth 33 energy, so it needs about 20 more in a trail past the landmarks. Tune `ENERGY`, `DWELL_S`, the orb values and the map after a playtest.
