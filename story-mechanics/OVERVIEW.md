# Pantheon — Overview & World Design

## Vision

Pantheon is a Spore-like god game about the slow, intimate reclamation of divinity. You begin as a forgotten spark — smaller than a prayer, invisible to the living world — and gradually expand into a force that shapes civilisations. The game is **interaction-first**: you actively move through a top-down 3D world, discovering it as the canvas-texture fog of war peels back permanently with every step.

The tone is quiet and mythic — closer to Hayao Miyazaki than Tolkien. Power feels like *recognition*, not conquest. The world does not tremble when you return. It simply *remembers*.

---

## Who Were You — The Old God

Long before Verath and the younger gods of commerce, roads, and harvest — before temples had names above their doors — there was something older. Not a god *of* anything particular. More like a god *beneath* everything: the presence in ancient stone, the hum in deep roots, the weight of mountains deciding to stay.

Cultures called this god different things. Some didn't call it anything at all. They simply felt it and built in its direction.

The old god did not require worship the way younger gods do. It predated the concept. It simply *was*, and the world organised itself around that fact.

Then the younger gods arrived with cleaner promises — specific answers to specific prayers. Commerce. Safe roads. Reliable harvests. The old god's domain was too large and too formless to compete. It wasn't destroyed. It wasn't defeated. It was *not needed anymore*. Belief thinned. Prayers stopped. Without the thread of remembrance to hold form, the god dissolved — its consciousness scattering into the oldest things in the world: standing stones, deep roots, mountain peaks, dark water.

**The god's name is Aethon.** It means: *the one who was here before the naming of things*. The player does not know this name at the start. It must be reconstructed, syllable by syllable, from standing stones scattered across the map.

---

## The World — 3D Landscape

The world is a procedurally generated 3D landscape rendered with Three.js. Terrain is a layered value-noise heightmap with vertex colours shifting by elevation.

| Height | Biome | Colour | Features |
|--------|-------|--------|----------|
| < 0.08 | Water | Deep blue | Impassable; Drowned Temple sits here |
| 0.08–0.42 | Shore / low grass | Muted green | Transition zones |
| 0.42–1.1 | Forest / grass | Dark green | Tree placement, most orbs |
| 1.1–1.9 | Hills | Brown | Rock clusters, some standing stones |
| > 1.9 | Mountain | Grey-white | High Cairn, sparse energy |

**Fog of war** is a three-layer canvas-texture overlay (heights 0.3m, 3.0m, 7.0m) permanently erased as the player explores. Trees and rocks inside the fog remain hidden until approached. What is revealed stays revealed.

**Landmark placement** is seeded — each playthrough has the same positions. The world is a specific *place*, not a random level.

---

## Phase Progression Summary

| Phase | Name | Core goal | Additional requirement | Sparks |
|-------|------|-----------|----------------------|--------|
| 0 | God Particle | 100 energy | 3 of 5 standing stones | 2 |
| 1 | Whisper | 5 converts | — | 2 + 1 per convert after 5th |
| 2 | Spirit | Claim the village | Elder Caros converted | 3 |
| 3 | Deity | Repel Verath's first incursion | 50 followers | 4 |
| 4 | Regional God | Claim 3 settlements | — | 5 |
| 5 | Ancient God | Final confrontation | — | — |

---

## The Ascension Tree

The ascension tree opens at the Whisper transition — not before. Phase 0 has no ascension. The first transformation is a *remembering*, not a choice. The tree represents the first real act of divine will: choosing what kind of god to become now that you have a self to become something *with*.

Three arches unlock across the phases:

### Arch I — The Void *(unlocks at Whisper)*
Shapes the fundamental nature of your divine presence.

| Node | Cost | Effect |
|------|------|--------|
| Resonance | 1 ◈ | Energy draw range ×1.6 |
| Presence | 1 ◈ | Vision radius +2 tiles |
| Surge | 2 ◈ | Energy capacity +60 |
| Echo | 2 ◈ | Absorbed orbs leave lingering faith trails |
| Remembrance | 3 ◈ | Reveal previously explored areas on map |
| Eternal | 3 ◈ | Passive faith generation +25% permanently |

### Arch II — The Flesh *(unlocks at Spirit)*
Shapes how you interact with living things.

| Node | Cost | Effect |
|------|------|--------|
| Empathy | 1 ◈ | Convert range ×1.5 |
| Bond | 2 ◈ | Follower faith generation ×1.5 |
| Thrall | 3 ◈ | Converted NPCs slowly convert adjacent others |
| Voice | 2 ◈ | Story event choices gain an extra option |
| Shepherd | 3 ◈ | Aera becomes a named agent, acts independently |

### Arch III — The World *(unlocks at Deity)*
Shapes how you alter civilisation.

| Node | Cost | Effect |
|------|------|--------|
| Territory | 1 ◈ | Influence border visible to rival entities |
| Foundation | 2 ◈ | Buildings cost 15% less faith |
| Domain | 2 ◈ | Village influence radius +40% |
| Wrath | 3 ◈ | Smite doubled; morality shifts wrathful |
| Mercy | 3 ◈ | Blessing doubled; morality shifts benevolent |
| Legacy | 4 ◈ | On ascension, keep 1 building from previous run |

---

## Morality Axis

The morality meter runs from **Benevolent** to **Wrathful**. It does not determine good or bad — it determines flavour and unlocks different paths.

| Alignment | Benefits | Costs |
|-----------|----------|-------|
| Benevolent | Higher follower quality, richer story options, Arch II enhanced | Slower growth; Verath more aggressive |
| Wrathful | Faster conversion through fear; Smite doubled | Higher follower churn; fewer event options |
| Inscrutable (neutral) | Access to both trees' weaker nodes | No specialisation bonuses |

---

## Resource System (Phase 3+)

| Resource | Generated by | Used for |
|----------|-------------|---------|
| Faith | Followers, shrines, temples | Most construction and abilities |
| Food | Farms | Sustains followers; shortage causes defection |
| Wood | Sawmills (forest tiles) | Building construction |
| Stone | Quarries (hill tiles) | Advanced construction |

### Buildings

| Building | Tile | Cost | Produces |
|----------|------|------|---------|
| Shrine | Grass/Plains | 8 faith | 0.8 faith/s |
| Farm | Grass/Plains | 10 faith, 5 wood | 0.5 food/s |
| Sawmill | Forest | 15 faith | 0.5 wood/s |
| Quarry | Hill | 20 faith, 8 wood | 0.3 stone/s |
| Temple | Grass/Plains | 100 faith, 25 stone | 3 faith/s |
| Village Centre | Grass | 50 faith, 20 wood | 2 faith/s, +5 followers |

---

## Idle Layer

Faith accumulates passively from followers and buildings at all times. The idle layer means returning players always have something to spend — but active play is always faster and narratively richer.

- Buildings tick every 100ms regardless of player position
- Follower count recalculated every 500ms
- Offline progress: ~20% tick rate when tab is backgrounded; brief catch-up burst on return
- Faith has a soft cap at 300 until a Temple is built (then uncapped)
