# Phase 0 — The five landmarks (design)

How it works in the code: `docs/phase0.md`. The author's own checklist: `PHASE_0_TODO.md`.

## The idea

Five landmarks stand in the world, each a place the old god was once remembered. Reaching one wakes it and tells the next chapter of the backstory. The chapters lead, in the order the player finds them, to the village. The sunrise needs the energy at the cap and all five landmarks awake. Phase 0 should take **20 to 30 minutes** (the map is 2 km wide and the orb walks 6 m/s), to be tuned in a playtest.

| Kind (`landmark.kind`) | What it is |
|---|---|
| `runestones` | A ring or row of carved stones |
| `tree` | An ancient tree |
| `temple_ruin` | A ruined temple on dry land |
| `sunken_ruin` | A half-sunken temple ruin |
| `monolith` | A single great standing stone |

Each kind is used once per map and is its own identity: it picks the model, the beacon colour and a short caption.

## Story outline (placeholder — the author owns the text)

The memories move from sensation → loss → the younger gods → the last worshipper → the village. The chapters are written to be told in any order; the five fragments are triggered by visit order, plus one caption per kind. Ideas worth keeping: the faces and the song, the winter of thinning prayers, Merra and the smooth stone, the temple built wrong and loved for the trying, Verath who offered something more useful, the old woman who whispered the words, and the shepherd girl saying the name nearly right.

## Later phases

The awake set is saved and exposed; the village phase restores the places (hurdle, boon, faith): `PHASE_2_RESTORATION.md`.

Not in scope: fog of war, sound, the final landmark models (stand-in props are used until they exist).
