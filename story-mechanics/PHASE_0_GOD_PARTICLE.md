# Phase 0 — God Particle

How it works in the code: `docs/phase0.md`. The five landmarks: `PHASE_0_LANDMARKS.md`. What the author owes the build: `PHASE_0_TODO.md`.

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

Orbs fill the energy bar and a faint guide line leads from one to the next. Five landmarks stand in the world; waking one pays energy and tells the next chapter of the old story. When the bar is full **and** all five are awake, the world holds still and the sun rises. Rules and numbers: `docs/phase0.md`.

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
