# Pantheon — Overview & World Design

> **Status: vision, mostly not implemented.** What is built is Phase 0 (`docs/phase0.md`) and the village (`docs/village/`). Where this page disagrees with the code, the code and `AGENTS.md` win. Open questions and standing decisions: `BACKLOG.md`.

## Vision

Pantheon is a Spore-like god game about the slow, intimate reclamation of divinity. You begin as a forgotten spark — smaller than a prayer, invisible to the living world — and gradually expand into a force that shapes civilisations. The game is **interaction-first**: you actively move through a top-down 3D world, discovering it by the beacons and the guide line.

The tone is quiet and mythic — closer to Hayao Miyazaki than Tolkien. Power feels like *recognition*, not conquest. The world does not tremble when you return. It simply *remembers*.

---

## Who Were You — The Old God

Long before Verath and the younger gods of commerce, roads, and harvest — before temples had names above their doors — there was something older. Not a god *of* anything particular. More like a god *beneath* everything: the presence in ancient stone, the hum in deep roots, the weight of mountains deciding to stay.

Cultures called this god different things. Some didn't call it anything at all. They simply felt it and built in its direction.

The old god did not require worship the way younger gods do. It predated the concept. It simply *was*, and the world organised itself around that fact.

Then the younger gods arrived with cleaner promises — specific answers to specific prayers. Commerce. Safe roads. Reliable harvests. The old god's domain was too large and too formless to compete. It wasn't destroyed. It wasn't defeated. It was *not needed anymore*. Belief thinned. Prayers stopped. Without the thread of remembrance to hold form, the god dissolved — its consciousness scattering into the oldest things in the world: standing stones, deep roots, mountain peaks, dark water.

**The god's name is Aethon.** It means: *the one who was here before the naming of things*. The player does not know this name at the start. It comes back as the old places are woken: the five landmarks of phase 0 each return a piece of the story, and the name itself is remembered at the sunrise (see `PHASE_0_LANDMARKS.md`).

---

## The World

The world is a set of authored maps (`story-mechanics/MAPS.md`), a specific *place* rather than a random level. Landmarks are placed in the map editor, so every playthrough has the same positions. One island is not the whole game: after the first one is complete a separate world map opens, with a fog of war and more authored islands (draft: `WORLD_MAP.md`, nothing built).

---

## Phase Progression Summary

| Phase | Name | Core goal | Additional requirement | Sparks |
|-------|------|-----------|----------------------|--------|
| 0 | God Particle | 100 energy | All 5 landmarks awake | 2 |
| 1 | Whisper | 5 converts | — | 2 + 1 per convert after 5th |
| 2 | Spirit | Claim the village | Elder Caros converted | 3 |
| 3 | Deity | Repel Verath's first incursion | 50 followers | 4 |
| 4 | Regional God | Claim 3 settlements | — | 5 |
| 5 | Ancient God | Final confrontation | — | — |

---

## The Ascension Tree

The tree opens at the Whisper transition, not before: the first transformation is a *remembering*, not a choice. The tree is the first real act of divine will, choosing what kind of god to become. Built: arch I, The Void, and arch II, The Village (`AGENTS.md` Skills and abilities, `docs/village/arch-ii.md`).

Unbuilt ideas:
- Arch I: Remembrance (reveal explored areas, needs a fog of war), Eternal (passive faith generation +25%).
- A third arch, The World, unlocking at Deity: influence borders visible to rivals, cheaper buildings, a larger village radius, Wrath and Mercy (a smite or a mercy power doubled, shifting morality), Legacy (keep one building on ascension).

---

## Morality Axis

The morality meter runs from **Benevolent** to **Wrathful**. It does not determine good or bad; it determines flavour and unlocks different paths.

| Alignment | Benefits | Costs |
|-----------|----------|-------|
| Benevolent | Higher follower quality, richer story options | Slower growth; Verath more aggressive |
| Wrathful | Faster conversion through fear; Smite doubled | Higher follower churn; fewer event options |
| Inscrutable (neutral) | Access to both trees' weaker nodes | No specialisation bonuses |
