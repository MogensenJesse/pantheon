# Phase 0 — God Particle

Status: being rebuilt around five landmarks (see `PHASE_0_LANDMARKS.md` for the design and the milestone list, and
`PHASE_0_TODO.md` for what the author owes the build). The earlier version of this page (five standing stones that
each held a syllable of a shattered name, a "3 of 5" gate, fog of war) was a brainstorm and is replaced. The tone and
the state of being below still hold.

## State of Being

You are not a god yet. You are a *remnant* — a fragment of divine will too small to be perceived, too stubborn to fully dissolve. You have no name you can remember. You have no form. You cannot interact with living things. Animals do not feel you. People walk through the area where you drift and feel nothing beyond a vague unease, if that.

You are beneath the threshold of life, closer in character to geology than to theology.

But the ancient world remembers you in its bones. Trees that have stood for centuries carry traces of old devotion in their rings — not worship, exactly, more like the residue of attention directed at something for a long time. Old stones were placed with intention, and that intention was directed at *you*. You feed on these traces. You are, in the most literal sense, *remembering yourself*.

---

## What You Can and Cannot Do

**You cannot:**
- Interact with any living creature — people, animals, birds
- Be perceived by any living thing (they feel nothing)
- Use miracles or abilities
- Build structures
- Open the skill tree (it opens when phase 0 ends)

**You can:**
- Move freely through the landscape
- Absorb scattered divine energy (glowing residue orbs)
- Follow the guide line from orb to orb
- Reach the five landmarks and wake them, one memory at a time
- Feel the shape of the world: terrain slows you in forests, you float slightly above mountains

The constraint is not a limitation to be frustrated by. It is the *point*. You experience the world the way it was before you had followers — as pure sensation, pure geography.

---

## How Phase 0 Plays

1. **Orbs.** Residue orbs are scattered across the map and absorbed on close approach (`PHASE0.ORB`: 3 to 8 energy each). A faint guide line leads from one orb to the next, in the order they were placed in the map editor.
2. **Landmarks.** Five landmarks stand in the world (runestones, a tree, a temple ruin, a half-sunken temple ruin, a monolith). Each shows a faint beacon from afar. Standing at one for a few seconds wakes it: a burst of light, a chunk of energy and the next chapter of the old story.
3. **The way home.** The chapters lead, in the order you visit them, towards the village and the people who still remember you.
4. **The sunrise.** When the energy bar is full **and** all five landmarks are awake, the world holds still and the sun rises.

Energy is capped at 100 (`PHASE0.ENERGY_CAP`). On a map without landmarks (the test maps), the energy bar alone ends the phase.

---

## Memory Fragments

Memory fragments surface through play — the first orb, energy thresholds (25 %, 50 %, 70 %, 85 %) and landmark arrivals. They appear in the story log as brief, fragmentary revelations and are kept in the journal (`J`). They are deliberately incomplete: the player pieces together a history, not an exposition dump. The text is in `src/story/fragments.ts`; when each one is shown is decided in `src/ui/StoryLog.ts` and `PHASE0.STORY`.

The memories move from sensation → loss → the younger gods → the last worshipper → the present.

---

## The Moment of Transition

When both conditions are met, the world holds still. The energy doesn't drain — it *ignites*. The sun rises, and before the skill tree opens the first coherent memory returns — not a fragment: the old god's name, Aethon, and the woman at the loom who sang it without knowing (fragment 16, `PHASE0.AETHON_MEMORY_ID`). The skill tree opens immediately after, with its first sparks.

---

## Tone Notes for Phase 0

Phase 0 should feel like:
- Walking through a landscape that has been waiting for you
- Archaeology without tools — finding things by feel
- Coming home to somewhere you've never been but recognise
- The long intake of breath before speaking

It should *not* feel like a tutorial, a grind, a puzzle with a correct solution, or urgency of any kind. The player is alone in the world and this should feel like a gift, not a limitation.
