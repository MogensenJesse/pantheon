# Phase 0 — The five landmarks (design and roadmap)

Status: planned, nothing built yet (milestones L0 to L7 below; tick them off as they land). Replaces the "standing stones and syllables" idea of the first Phase 0 draft. The author's own checklist is `PHASE_0_TODO.md`.

## Why

Phase 0 is the thinnest part of the game: collect orbs, the bar fills, the sun rises. island-mountain has 6 orbs (about 33 energy) so the cap cannot even be reached by play today. Each phase should take longer than the one before, and even phase 0 should take a while: **20 to 30 minutes** is the working target (the map is 2 km wide and the orb walks 6 m/s), to be tuned in a playtest.

## The idea

Five landmarks stand in the world, each a place the old god was once remembered. Reaching one wakes it and tells the next chapter of the backstory. The chapters lead, in the order the player finds them, to the village. The landmarks are also the places of power for later phases.

| Kind (`landmark.kind`) | What it is |
|---|---|
| `runestones` | A ring or row of carved stones |
| `tree` | An ancient tree |
| `temple_ruin` | A ruined temple on dry land |
| `sunken_ruin` | A half-sunken temple ruin |
| `monolith` | A single great standing stone |

Each kind is used once per map and is its own identity: it picks the model, the beacon colour and a short caption.

## Rules (decided)

- **The gate**: the sunrise needs the energy at the cap **and** all five landmarks awake. A map with no landmarks keeps the old rule (energy alone).
- **Any order.** The story chapter follows the order of visits (the Nth landmark you wake tells chapter N); each landmark also has a short caption of its own, so any order reads well.
- **Energy**: each landmark gives a chunk of energy (`LANDMARK.ENERGY`, 14) on top of the orbs.
- **Guide line**: "orbs lead, landmarks pull". The line follows the orbs as now (in editor placement order). Each dormant landmark shows a faint beacon you can see from afar. When no orb is left, the line leads to the nearest dormant landmark.
- **States**: *dormant* (beacon), *awakening* (you stand within `LANDMARK.RADIUS_M`; a ring fills over `LANDMARK.DWELL_S`; leaving resets it), *awakened* (a soft steady glow stays).
- **At the cap with landmarks left**: the sunrise waits, the bar stays full, a one-time fragment says something is unfinished, and the guide line leads to the nearest dormant landmark.
- **Light**: additive emissive meshes and sparkles only; the player's light is the only point light in the game. Dormant: a faint pulsing column. Awakening: a terrain-draped ring that fills. Awakened: a burst, a bloom pulse and a steady glow.
- **Saved**: which landmarks are awake, in visit order, by kind. The profile gets a `landmarks` slice (save version 11).
- **Later phases**: nothing is built, but the awake set is saved and exposed so landmarks can become places of power (shrine-like regeneration, builder boosts, quest hooks).

Not in scope: fog of war, sound, the final landmark models (stand-in props are used until the models exist), what the landmarks do in later phases.

## Story outline (placeholder — the author owns the text)

The memories move from sensation → loss → the younger gods → the last worshipper → the village. The chapters are written to be told in any order; the five fragments are triggered by visit order, plus one caption per kind. Existing fragments that mention syllables or specific stones are rewritten; ideas worth keeping from the first draft: the faces and the song, the winter of thinning prayers, Merra and the smooth stone, the temple built wrong and loved for the trying, Verath who offered something more useful, the old woman who whispered the words, and the shepherd girl saying the name nearly right.

## Milestones

Each ends green (`check:fast`, build) and is one commit.

- [x] **L0** Docs: this page, the Phase 0 rewrite, `PHASE_0_TODO.md`.
- [x] **L1** The `landmark` map entity (`{ x, z, rotY?, kind }`), validation, spawner, editor palette and marker.
- [x] **L2** Pure rules and state (dwell, awaken, gate, next target), runtime, save slice (version 11), `check:landmarks`.
- [x] **L3** The gate in `WorldReveal`, the guide line's target provider, world lightness driven by phase 0 progress instead of an orb count.
- [x] **L4** Stand-in props per kind through the prop pipeline (`landmarkStandIns.ts`); beacon, dwell ring, awakening burst and awakened glow (`entities/landmark/landmarkLights.ts`, look values in `config/visual/landmark.ts`, no new PointLights). The look is unverified on a real GPU.
- [x] **L5** Story wiring: the Nth landmark woken tells chapter N (`LANDMARK_CHAPTER_IDS` in `src/story/fragments.ts`) after a short caption of its own kind; the journal (J) already lists every fragment found. All text is PLACEHOLDER.
- [x] **L6** DEV probe `__pantheonLandmarks`, pacing pass (energy per landmark 14), `docs/phase0.md`.
- [ ] **L7** Cleanup of what this supersedes (old fragments, orb-count lightness, stale docs and comments).
